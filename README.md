# Infrastructure On-Premise — YKonnect

Déploiement complet d'une infrastructure Docker on-premise sur un serveur Debian (`192.168.4.80`).  
Stack : **Terraform** (infra principale) + **Ansible** (déploiement YKonnect) + **Docker Compose** (YKonnect) + **Prometheus / Grafana / Portainer** (monitoring).

---

## Installation rapide

```bash
# Cloner le dépôt
git clone https://github.com/hauteha/YKONNECT_PROJECT.git
cd YKONNECT_PROJECT

# Configurer les secrets (voir section Prérequis)
cp terraform.tfvars.example terraform.tfvars  # puis éditer
echo "GROQ_API_KEY=gsk_..." > ykonnect/.env

# Déployer toute l'infrastructure en une commande
make install

# Ou avec un mot de passe SSH différent
SSH_PASS=monmotdepasse make install
```

Commandes disponibles :

| Commande | Description |
|----------|-------------|
| `make install` | Déployer toute l'infrastructure (Terraform + Ansible) |
| `make terraform` | Déployer uniquement l'infra principale |
| `make ykonnect` | Déployer uniquement YKonnect |
| `make status` | Voir les conteneurs actifs sur le serveur |
| `make logs` | Suivre les logs d'un conteneur (`SERVICE=grafana`) |
| `make reload` | Recharger la config Prometheus sans redémarrage |
| `make destroy` | Supprimer l'infrastructure principale |

---

## Sommaire

- [Architecture globale](#architecture-globale)
- [Structure du projet](#structure-du-projet)
- [Prérequis](#prérequis)
- [Déploiement — Infrastructure principale (Terraform)](#déploiement--infrastructure-principale-terraform)
- [Déploiement — YKonnect (Ansible)](#déploiement--ykonnect-ansible)
- [Monitoring](#monitoring)
- [YKonnect — Détails techniques](#ykonnect--détails-techniques)
- [Opérations courantes](#opérations-courantes)
- [Points d'attention](#points-dattention)

---

## Architecture globale

```
192.168.4.80
│
├── :80        Nginx — Site vitrine principal (liens vers les outils)
├── :8081      YKonnect — Hub d'articles IT + Chatbot IA (Llama 3.3 / Groq)
├── :9000      Portainer — Gestion des conteneurs Docker
├── :9090      Prometheus — Collecte des métriques
├── :3000      Grafana — Dashboards et alertes
│
└── Réseau Docker interne : app_network
    ├── postgres, postgres_exporter, node_exporter
    ├── prometheus, grafana, portainer, nginx
    └── ykonnect-backend (rejoint app_network pour le scraping Prometheus)
```

**YKonnect** (port 8081) fonctionne en Docker Compose indépendant avec deux conteneurs :
- `ykonnect-backend` : FastAPI + Groq API (chatbot IA)
- `ykonnect-frontend` : Nginx servant les pages HTML statiques

---

## Structure du projet

```
infra-deployment/
├── main.tf                         # Infra principale (Terraform)
├── variables.tf
├── terraform.tfvars                # ⚠️ Ne pas commiter (secrets)
├── outputs.tf
├── .gitignore
│
├── monitoring/
│   └── prometheus.yml              # Config scraping (inclut le job ykonnect)
│
├── grafana/
│   └── provisioning/
│       ├── datasources/
│       │   └── prometheus.yml      # Datasource auto-provisionnée
│       └── dashboards/
│           ├── dashboards.yml
│           └── json/
│               ├── node-exporter.json
│               ├── postgresql.json
│               └── ykonnect.json   # Dashboard 6 panneaux YKonnect
│
├── website/
│   ├── nginx.conf
│   └── html/
│       └── index.html              # Page vitrine avec liens vers les outils
│
├── ykonnect/
│   ├── docker-compose.yml          # Orchestration backend + frontend
│   ├── .env                        # GROQ_API_KEY (⚠️ ne pas commiter)
│   ├── .gitignore
│   ├── nginx/
│   │   └── nginx.conf              # Proxy /api/* vers le backend
│   ├── backend/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   └── main.py                 # FastAPI + Groq + métriques Prometheus
│   └── frontend/
│       ├── index.html
│       ├── articles.html
│       ├── certifications.html
│       ├── wireguard.html
│       ├── fail2ban.html
│       ├── haproxy.html
│       ├── cka-archi.html
│       ├── cka-workloads.html
│       ├── cka-networking.html
│       ├── cka-securite.html
│       ├── article.html
│       ├── themes.html
│       ├── about.html
│       ├── contact.html
│       └── assets/
│           ├── css/styles.css
│           └── js/
│               ├── chat.js
│               ├── main.js
│               └── auth.js
│
└── ansible/
    ├── inventory.ini               # Cible : 192.168.4.80
    └── deploy-ykonnect.yml         # Playbook de déploiement YKonnect
```

---

## Prérequis

### Sur le serveur (192.168.4.80)

**Installer Docker** (si ce n'est pas déjà fait) :

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

**Exposer le daemon Docker en TCP** (pour Terraform — réseau interne uniquement) :

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/override.conf <<EOF
[Service]
ExecStart=
ExecStart=/usr/bin/dockerd -H fd:// -H tcp://0.0.0.0:2375
EOF
sudo systemctl daemon-reload && sudo systemctl restart docker
```

### Sur la machine de déploiement (locale)

```bash
# Terraform
sudo apt-get install -y gnupg software-properties-common
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt-get update && sudo apt-get install -y terraform

# Ansible + dépendances
sudo apt-get install -y ansible rsync sshpass
ansible-galaxy collection install community.docker

# Ajouter la clé SSH du serveur
ssh-keyscan -H 192.168.4.80 >> ~/.ssh/known_hosts
```

---

## Déploiement — Infrastructure principale (Terraform)

Lance les conteneurs suivants : PostgreSQL, postgres-exporter, node-exporter, Prometheus, Grafana, Nginx (site vitrine), Portainer.

### 1. Configurer les variables

Éditer `terraform.tfvars` :

```hcl
server_ip              = "192.168.4.80"
postgres_user          = "admin"
postgres_password      = "changeme"
postgres_db            = "appdb"
grafana_admin_password = "changeme"
```

### 2. Initialiser et déployer

```bash
cd infra-deployment/
terraform init
terraform plan
terraform apply
```

### 3. Vérifier les outputs

```bash
terraform output
```

```
grafana           = "http://192.168.4.80:3000"
portainer         = "http://192.168.4.80:9000"
prometheus        = "http://192.168.4.80:9090"
site_web          = "http://192.168.4.80:80"
```

---

## Déploiement — YKonnect (Ansible)

YKonnect est déployé séparément via Ansible car il nécessite un `docker build` (image custom FastAPI).

### 1. Configurer la clé API Groq

Créer `ykonnect/.env` :

```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> Obtenir une clé gratuite sur [console.groq.com](https://console.groq.com)

### 2. Lancer le playbook

```bash
cd ansible/
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventory.ini deploy-ykonnect.yml \
  -e "ansible_ssh_pass=VOTRE_MDP ansible_become_pass=VOTRE_MDP"
```

Le playbook effectue les étapes suivantes :
1. Installation de `python3-docker` sur le serveur
2. Archivage local du projet (tar.gz, sans `.env`)
3. Upload et extraction vers `/opt/ykonnect/` sur le serveur
4. Déploiement du fichier `.env` (mode 0600)
5. `docker compose up --build -d`
6. Hot-reload de Prometheus (sans redémarrage)

### 3. Vérifier

```bash
curl http://192.168.4.80:8081/api/health
# {"status":"ok"}
```

YKonnect est accessible sur : `http://192.168.4.80:8081`

---

## Monitoring

### Prometheus

Le fichier `monitoring/prometheus.yml` scrape les cibles suivantes :

| Job | Cible | Métriques |
|-----|-------|-----------|
| `prometheus` | localhost:9090 | Prometheus lui-même |
| `node_exporter` | node_exporter:9100 | CPU, RAM, disque, réseau |
| `postgres_exporter` | postgres_exporter:9187 | Requêtes, connexions PostgreSQL |
| `ykonnect` | ykonnect-backend-1:8000 | Requêtes HTTP, latences, erreurs |

Recharger la config sans redémarrage :

```bash
curl -X POST http://192.168.4.80:9090/-/reload
```

### Grafana

Accès : `http://192.168.4.80:3000` — Login : `admin` / (voir `terraform.tfvars`)

Trois dashboards sont provisionnés automatiquement :
- **Node Exporter** — métriques système du serveur
- **PostgreSQL** — performance de la base de données
- **YKonnect** — 6 panneaux (requêtes totales, taux d'erreurs 5xx, latences p50/p95, req/s)

### Portainer

Accès : `http://192.168.4.80:9000`  
Permet de visualiser tous les stacks, consulter les logs en temps réel, et gérer les réseaux Docker.

---

## YKonnect — Détails techniques

### Chatbot IA

Le chatbot utilise l'API **Groq** avec le modèle `llama-3.3-70b-versatile`.  
Le system prompt lui indique toutes les pages disponibles sur le site avec des liens HTML `<a>` préconstruits. Quand la question correspond à un sujet couvert, le bot redirige vers la page pertinente (5-8 lignes max).

**Pourquoi Groq ?**
- Gratuit (quota généreux)
- Très rapide (inférence GPU dédiée)
- Pas besoin de RAM locale (contrairement à Ollama)

### Contenu éducatif

**Procédures d'installation :**
- VPN WireGuard (ChaCha20, peer-to-peer, kernel 5.6+)
- Protection Fail2Ban (jails SSH/Nginx, filtres, iptables)
- Load Balancer HAProxy (roundrobin, health checks, TLS)

**Parcours CKA — Certified Kubernetes Administrator :**
- Module 1 : Architecture & Composants (etcd, API Server, kubelet...)
- Module 2 : Workloads & Scheduling (Pods, Deployments, DaemonSets, taints...)
- Module 3 : Services & Networking (ClusterIP, Ingress, NetworkPolicy, CoreDNS...)
- Module 4 : Sécurité (RBAC, ServiceAccounts, SecurityContext, Secrets...)

### Endpoints backend

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/chat` | Envoyer un message au chatbot |
| GET | `/api/health` | Healthcheck |
| GET | `/metrics` | Métriques Prometheus |

---

## Opérations courantes

**Redéployer YKonnect après modification :**

```bash
cd ansible/
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventory.ini deploy-ykonnect.yml \
  -e "ansible_ssh_pass=VOTRE_MDP ansible_become_pass=VOTRE_MDP"
```

**Voir les logs du chatbot :**

```bash
ssh hau@192.168.4.80 "docker logs -f ykonnect-backend-1"
```

**Redémarrer un service :**

```bash
ssh hau@192.168.4.80 "docker restart grafana"
```

**Détruire l'infrastructure principale :**

```bash
terraform destroy
```

---

## Points d'attention

| Point | Détail |
|-------|--------|
| `terraform.tfvars` | Ne jamais commiter — déjà dans `.gitignore` |
| `ykonnect/.env` | Ne jamais commiter — déjà dans `ykonnect/.gitignore` |
| Docker TCP sans TLS | Valable uniquement en réseau interne isolé |
| Port 8080 réservé | Un autre service utilise le port 8080 — YKonnect est sur 8081 |
| `chat.js` — encodage | Le fichier doit rester en ASCII pur / Unix (LF). Ne pas éditer avec un éditeur Windows |
| Prometheus hot-reload | Toujours utiliser `POST /-/reload` plutôt que `docker restart prometheus` pour éviter la perte de métriques |
