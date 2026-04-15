# ────────────────────────────────────────────────
# terraform.tfvars — NE PAS COMMITER dans git !
# Ajouter ce fichier dans .gitignore
# ────────────────────────────────────────────────

server_ip              = "192.168.4.80"
postgres_user          = "admin"
postgres_password      = "ChangeMe_S3cure!"
postgres_db            = "appdb"
grafana_admin_password = "ChangeMe_Grafana!"
nginx_port             = 8080
grafana_port           = 3001
prometheus_port        = 9090
portainer_port         = 9000
