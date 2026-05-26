output "site_web" {
  description = "URL du site web Nginx"
  value       = "http://${var.server_ip}:${var.nginx_port}"
}

output "grafana" {
  description = "URL Grafana (admin / voir terraform.tfvars)"
  value       = "http://${var.server_ip}:${var.grafana_port}"
}

output "prometheus" {
  description = "URL Prometheus"
  value       = "http://${var.server_ip}:${var.prometheus_port}"
}

output "portainer" {
  description = "URL Portainer"
  value       = "http://${var.server_ip}:${var.portainer_port}"
}

output "postgres_exporter" {
  description = "Métriques Postgres Exporter"
  value       = "http://${var.server_ip}:9187/metrics"
}

output "node_exporter" {
  description = "Métriques Node Exporter (système)"
  value       = "http://${var.server_ip}:9100/metrics"
}
