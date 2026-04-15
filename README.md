# 🏗️ Infrastructure On-Prem — Guide de déploiement

Serveur cible : `192.168.4.80`
Stack : Terraform + Docker (Nginx, PostgreSQL, Prometheus, Grafana, Portainer)

---

## 📁 Structure du projet

```
infra-terraform/
├── main.tf                  # Ressources Docker (containers, volumes, réseau)
├── variables.tf             # Déclaration des variables
├── terraform.tfvars         # Valeurs (⚠️ ne pas commiter)
├── outputs.tf               # URLs de sortie
├── .gitignore
├── monitoring/
│   ├── prometheus.yml               # Config scraping Prometheus
│   └── grafana/
│       └── provisioning/
│           ├── datasources/
│           │   └── prometheus.yml   # Datasource auto-provisionnée
│           └── dashboards/
│               └── dashboards.yml   # Provider de dashboards
└── website/
    ├── nginx.conf           # Config Nginx
    └── html/
        └── index.html       # Page web (à remplacer par votre contenu)
```

---

## ✅ Prérequis

### Sur le serveur 192.168.4.80

#### 1. Installer Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

#### 2. Exposer le daemon Docker en TCP (pour Terraform)

> ⚠️ À faire uniquement sur réseau interne sécurisé (pas d'exposition internet).

Créer le fichier de configuration systemd :

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/override.conf <<EOF
[Service]
ExecStart=
ExecStart=/usr/bin/dockerd -H fd:// -H tcp://0.0.0.0:2375
EOF

sudo systemctl daemon-reload
sudo systemctl restart docker
```

Vérifier :
```bash
curl http://192.168.4.80:2375/version
```

#### 3. Créer les répertoires hôte nécessaires

```bash
# Config Prometheus
sudo mkdir -p /opt/monitoring/grafana/provisioning/datasources
sudo mkdir -p /opt/monitoring/grafana/provisioning/dashboards

# Site web
sudo mkdir -p /opt/website/html

# Copier les fichiers de config
sudo cp monitoring/prometheus.yml /opt/monitoring/prometheus.yml
sudo cp monitoring/grafana/provisioning/datasources/prometheus.yml \
       /opt/monitoring/grafana/provisioning/datasources/prometheus.yml
sudo cp monitoring/grafana/provisioning/dashboards/dashboards.yml \
       /opt/monitoring/grafana/provisioning/dashboards/dashboards.yml
sudo cp website/nginx.conf  /opt/website/nginx.conf
sudo cp website/html/index.html /opt/website/html/index.html

# Permissions Grafana (UID 472)
sudo chown -R 472:472 /opt/monitoring/grafana
```

---

### Sur votre machine locale (où vous lancez Terraform)

#### Installer Terraform

```bash
# Linux/Debian
wget -O - https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform -y

# Vérifier
terraform version
```

---

## 🚀 Déploiement

### Étape 1 — Adapter les mots de passe

Éditer `terraform.tfvars` :
```hcl
postgres_password      = "VotreMotDePassePostgres"
grafana_admin_password = "VotreMotDePasseGrafana"
```

### Étape 2 — Initialiser Terraform

```bash
cd infra-terraform/
terraform init
```

### Étape 3 — Vérifier le plan

```bash
terraform plan
```

Vérifier que tous les containers, volumes et le réseau apparaissent dans le plan.

### Étape 4 — Appliquer

```bash
terraform apply
```

Taper `yes` pour confirmer.

### Étape 5 — Vérifier les outputs

```bash
terraform output
```

Résultat attendu :
```
grafana           = "http://192.168.4.80:3001"
node_exporter     = "http://192.168.4.80:9100/metrics"
portainer         = "http://192.168.4.80:9000"
postgres_exporter = "http://192.168.4.80:9187/metrics"
prometheus        = "http://192.168.4.80:9090"
site_web          = "http://192.168.4.80:8080"
```

---

## 🔍 Vérifications post-déploiement

### Containers actifs sur le serveur

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Doit afficher : `postgres`, `postgres_exporter`, `node_exporter`, `prometheus`, `grafana`, `nginx`, `portainer`

### PostgreSQL

```bash
docker exec -it postgres psql -U admin -d appdb -c "\l"
```

### Prometheus — vérifier les targets

Ouvrir : http://192.168.4.80:9090/targets

Tous les jobs doivent être en `UP`.

---

## 📊 Grafana — Configuration des dashboards

1. Aller sur http://192.168.4.80:3001
2. Login : `admin` / mot de passe du `terraform.tfvars`
3. La datasource **Prometheus** est déjà provisionnée automatiquement
4. Importer les dashboards communautaires via **Dashboards > Import** :
   - **Node Exporter Full** : ID `1860`
   - **PostgreSQL Database** : ID `9628`

---

## 🔒 Ports ouverts (pare-feu)

Si vous avez `ufw` ou `firewalld` sur le serveur :

```bash
# ufw
sudo ufw allow 8080/tcp   # Nginx
sudo ufw allow 9000/tcp   # Portainer
sudo ufw allow 9090/tcp   # Prometheus
sudo ufw allow 3001/tcp   # Grafana
sudo ufw allow 2375/tcp   # Docker API (réseau interne seulement !)
sudo ufw reload
```

---

## ♻️ Opérations courantes

### Détruire toute l'infra

```bash
terraform destroy
```

### Redémarrer un service

```bash
docker restart grafana
```

### Voir les logs d'un container

```bash
docker logs -f prometheus
```

### Recharger la config Prometheus sans redémarrage

```bash
curl -X POST http://192.168.4.80:9090/-/reload
```

---

## ⚠️ Points d'attention

| Point | Détail |
|-------|--------|
| **Docker TCP sans TLS** | Valable en réseau interne isolé. Si exposition à d'autres VLANs, configurer TLS sur le port 2376. |
| **terraform.tfvars** | Ne jamais commiter. Déjà dans `.gitignore`. |
| **Mots de passe** | Changer les valeurs par défaut avant tout déploiement. |
| **Grafana UID 472** | Le chown sur `/opt/monitoring/grafana` est obligatoire, sinon Grafana ne démarre pas. |
| **Dockhand** | Retiré du main.tf (image peu maintenue). Portainer couvre ce besoin. |
