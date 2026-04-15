terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

# Connexion au daemon Docker du serveur on-prem
provider "docker" {
  host = "tcp://${var.server_ip}:2375"
}

# ─────────────────────────────────────────────────────────────
# RÉSEAU
# ─────────────────────────────────────────────────────────────
resource "docker_network" "app_network" {
  name = "app_network"
}

# ─────────────────────────────────────────────────────────────
# VOLUMES PERSISTANTS
# ─────────────────────────────────────────────────────────────
resource "docker_volume" "portainer_data"  { name = "portainer_data"  }
resource "docker_volume" "postgres_data"   { name = "postgres_data"   }
resource "docker_volume" "prometheus_data" { name = "prometheus_data" }
resource "docker_volume" "grafana_data"    { name = "grafana_data"    }

# ─────────────────────────────────────────────────────────────
# IMAGES
# ─────────────────────────────────────────────────────────────
resource "docker_image" "nginx"             { name = "nginx:1.25"                        }
resource "docker_image" "postgres"          { name = "postgres:15"                       }
resource "docker_image" "postgres_exporter" { name = "prometheuscommunity/postgres-exporter:latest" }
resource "docker_image" "prometheus"        { name = "prom/prometheus:latest"            }
resource "docker_image" "grafana"           { name = "grafana/grafana-oss:latest"        }
resource "docker_image" "portainer"         { name = "portainer/portainer-ce:latest"     }
resource "docker_image" "node_exporter"     { name = "prom/node-exporter:latest"         }

# ─────────────────────────────────────────────────────────────
# POSTGRESQL
# ─────────────────────────────────────────────────────────────
resource "docker_container" "postgres" {
  name    = "postgres"
  image   = docker_image.postgres.image_id
  restart = "unless-stopped"

  env = [
    "POSTGRES_USER=${var.postgres_user}",
    "POSTGRES_PASSWORD=${var.postgres_password}",
    "POSTGRES_DB=${var.postgres_db}"
  ]

  healthcheck {
    test     = ["CMD-SHELL", "pg_isready -U ${var.postgres_user}"]
    interval = "10s"
    timeout  = "5s"
    retries  = 5
  }

  volumes {
    volume_name    = docker_volume.postgres_data.name
    container_path = "/var/lib/postgresql/data"
  }

  networks_advanced {
    name = docker_network.app_network.name
  }
}

# ─────────────────────────────────────────────────────────────
# POSTGRES EXPORTER (métriques pour Prometheus)
# ─────────────────────────────────────────────────────────────
resource "docker_container" "postgres_exporter" {
  name    = "postgres_exporter"
  image   = docker_image.postgres_exporter.image_id
  restart = "unless-stopped"

  env = [
    "DATA_SOURCE_NAME=postgresql://${var.postgres_user}:${var.postgres_password}@postgres:5432/${var.postgres_db}?sslmode=disable"
  ]

  ports {
    internal = 9187
    external = 9187
  }

  networks_advanced {
    name = docker_network.app_network.name
  }

  depends_on = [docker_container.postgres]
}

# ─────────────────────────────────────────────────────────────
# NODE EXPORTER (métriques système du serveur)
# ─────────────────────────────────────────────────────────────
resource "docker_container" "node_exporter" {
  name    = "node_exporter"
  image   = docker_image.node_exporter.image_id
  restart = "unless-stopped"

  ports {
    internal = 9100
    external = 9100
  }

  # Accès aux métriques système de l'hôte
  volumes {
    host_path      = "/proc"
    container_path = "/host/proc"
    read_only      = true
  }
  volumes {
    host_path      = "/sys"
    container_path = "/host/sys"
    read_only      = true
  }
  volumes {
    host_path      = "/"
    container_path = "/rootfs"
    read_only      = true
  }

  command = [
    "--path.procfs=/host/proc",
    "--path.sysfs=/host/sys",
    "--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)"
  ]

  networks_advanced {
    name = docker_network.app_network.name
  }
}

# ─────────────────────────────────────────────────────────────
# PROMETHEUS
# ─────────────────────────────────────────────────────────────
resource "docker_container" "prometheus" {
  name    = "prometheus"
  image   = docker_image.prometheus.image_id
  restart = "unless-stopped"

  ports {
    internal = 9090
    external = var.prometheus_port
  }

  volumes {
    host_path      = "/home/hau/infra-deployment/monitoring/prometheus.yml"
    container_path = "/etc/prometheus/prometheus.yml"
    read_only      = true
  }
  volumes {
    volume_name    = docker_volume.prometheus_data.name
    container_path = "/prometheus"
  }

  command = [
    "--config.file=/etc/prometheus/prometheus.yml",
    "--storage.tsdb.path=/prometheus",
    "--storage.tsdb.retention.time=30d",
    "--web.enable-lifecycle"
  ]

  networks_advanced {
    name = docker_network.app_network.name
  }

  depends_on = [
    docker_container.postgres_exporter,
    docker_container.node_exporter
  ]
}

# ─────────────────────────────────────────────────────────────
# GRAFANA
# ─────────────────────────────────────────────────────────────
resource "docker_container" "grafana" {
  name    = "grafana"
  image   = docker_image.grafana.image_id
  restart = "unless-stopped"

  ports {
    internal = 3000
    external = var.grafana_port
  }

  env = [
    "GF_SECURITY_ADMIN_USER=admin",
    "GF_SECURITY_ADMIN_PASSWORD=${var.grafana_admin_password}",
    "GF_USERS_ALLOW_SIGN_UP=false",
    "GF_SERVER_ROOT_URL=http://${var.server_ip}:${var.grafana_port}",
    # Provisioning automatique de la datasource Prometheus
    "GF_PATHS_PROVISIONING=/etc/grafana/provisioning"
  ]

  volumes {
    volume_name    = docker_volume.grafana_data.name
    container_path = "/var/lib/grafana"
  }
  volumes {
    host_path      = "/home/hau/infra-deployment/grafana/provisioning"
    container_path = "/etc/grafana/provisioning"
    read_only      = true
  }

  networks_advanced {
    name = docker_network.app_network.name
  }

  depends_on = [docker_container.prometheus]
}

# ─────────────────────────────────────────────────────────────
# NGINX (site web)
# ─────────────────────────────────────────────────────────────
resource "docker_container" "nginx" {
  name    = "nginx"
  image   = docker_image.nginx.image_id
  restart = "unless-stopped"

  ports {
    internal = 80
    external = var.nginx_port
  }

  volumes {
    host_path      = "/home/hau/infra-deployment/website/html"
    container_path = "/usr/share/nginx/html"
    read_only      = true
  }
  volumes {
    host_path      = "/home/hau/infra-deployment/website/nginx.conf"
    container_path = "/etc/nginx/nginx.conf"
    read_only      = true
  }

  networks_advanced {
    name = docker_network.app_network.name
  }

  depends_on = [docker_container.postgres]
}

# ─────────────────────────────────────────────────────────────
# PORTAINER
# ─────────────────────────────────────────────────────────────
resource "docker_container" "portainer" {
  name    = "portainer"
  image   = docker_image.portainer.image_id
  restart = "unless-stopped"

  ports {
    internal = 9000
    external = var.portainer_port
  }
  ports {
    internal = 9443
    external = 9443
  }

  volumes {
    host_path      = "/var/run/docker.sock"
    container_path = "/var/run/docker.sock"
  }
  volumes {
    volume_name    = docker_volume.portainer_data.name
    container_path = "/data"
  }

  networks_advanced {
    name = docker_network.app_network.name
  }
}