variable "server_ip" {
  description = "IP privée du serveur on-prem"
  type        = string
  default     = "192.168.4.80"
}

variable "postgres_user" {
  description = "Utilisateur PostgreSQL"
  type        = string
  default     = "admin"
}

variable "postgres_password" {
  description = "Mot de passe PostgreSQL"
  type        = string
  sensitive   = true
}

variable "postgres_db" {
  description = "Nom de la base de données"
  type        = string
  default     = "appdb"
}

variable "grafana_admin_password" {
  description = "Mot de passe admin Grafana"
  type        = string
  sensitive   = true
}

variable "nginx_port" {
  description = "Port externe Nginx"
  type        = number
  default     = 8080
}

variable "grafana_port" {
  description = "Port externe Grafana"
  type        = number
  default     = 3001
}

variable "prometheus_port" {
  description = "Port externe Prometheus"
  type        = number
  default     = 9090
}

variable "portainer_port" {
  description = "Port externe Portainer HTTP"
  type        = number
  default     = 9000
}
