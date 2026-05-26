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
cat > ykonnect/.env <<EOF
GROQ_API_KEY=gsk_...
JWT_SECRET=changez-moi-en-production
ADMIN_EMAIL=admin@ykonnect.fr
ADMIN_PASSWORD=VotreMotDePasseAdmin
EOF

# ── Option A : lancer en local (Docker Compose direct) ──
make up

# ── Option B : déployer via Terraform + Ansible ──
make install
# Ou avec un mot de passe SSH différent
SSH_PASS=monmotdepasse make install
```

---

## Commandes disponibles

### Local (Docker Compose)

| Commande | Description |
|----------|-------------|
| `make up` | Build et démarre le stack YKonnect |
| `make down` | Arrête et supprime les conteneurs |
| `make restart` | Redémarrage complet |
| `make build` | Rebuild les images sans relancer |
| `make ps` | État des conteneurs locaux |
| `make logs-local` | Logs du backend (`S=nginx` pour un autre service) |

### Déploiement (Terraform + Ansible)

| Commande | Description |
|----------|-------------|
| `make install` | Déployer toute l'infrastructure (Terraform + Ansible) |
| `make terraform` | Déployer uniquement l'infra principale |
| `make ykonnect` | Déployer uniquement YKonnect via Ansible |
| `make status` | Voir les conteneurs actifs sur le serveur (SSH) |
| `make logs` | Suivre les logs d'un conteneur SSH (`SERVICE=grafana`) |
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
- [Comptes utilisateurs et tickets](#comptes-utilisateurs-et-tickets)
- [Opérations courantes](#opérations-courantes)
- [Points d'attention](#points-dattention)

---

## Architecture globale

```
192.168.4.80
│
├── :80        Nginx — Site vitrine principal (liens vers les outils)
├── :8081      YKonnect — Hub d'articles IT + Chatbot IA + Système de tickets
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
- `ykonnect-backend` : FastAPI + Groq API (chatbot IA) + auth JWT + tickets SQLite
- `ykonnect-frontend` : Nginx servant les pages HTML statiques

Les données SQLite sont persistées dans un volume Docker : `ykonnect_data:/app/data`.

---

## Structure du projet

```
infra-deployment/
├── Makefile                        # Orchestration locale + déploiement
├── main.tf                         # Infra principale (Terraform)
├── variables.tf
├── terraform.tfvars                # ⚠️ Ne pas commiter (secrets)
├── outputs.tf
├── .gitignore
│
├── monitoring/
│   └── prometheus.yml
│
├── grafana/
│   └── provisioning/
│       ├── datasources/prometheus.yml
│       └── dashboards/
│           ├── dashboards.yml
│           └── json/
│               ├── node-exporter.json
│               ├── postgresql.json
│               └── ykonnect.json
│
├── website/
│   ├── nginx.conf
│   └── html/index.html
│
├── ykonnect/
│   ├── docker-compose.yml          # Backend + frontend + volume SQLite
│   ├── .env                        # GROQ_API_KEY, JWT_SECRET, ADMIN_* (⚠️ ne pas commiter)
│   ├── .gitignore
│   ├── nginx/
│   │   └── nginx.conf              # Proxy /api/* + SSE (proxy_buffering off)
│   ├── backend/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   └── main.py                 # FastAPI + Groq SSE + JWT + SQLAlchemy
│   └── frontend/
│       ├── index.html              # Page d'accueil (hero, stats, recherche)
│       ├── articles.html
│       ├── certifications.html     # Parcours CKA + lien évaluation
│       ├── evaluation-cka.html     # Quiz 16 questions / 4 catégories
│       ├── tickets.html            # Soumission de tickets (auth requise)
│       ├── admin.html              # Dashboard admin (accès direct /admin.html)
│       ├── wireguard.html
│       ├── fail2ban.html
│       ├── haproxy.html
│       ├── cka-archi.html
│       ├── cka-workloads.html
│       ├── cka-networking.html
│       ├── cka-securite.html
│       ├── themes.html
│       ├── about.html
│       ├── contact.html
│       └── assets/
│           ├── css/styles.css      # Design neon/cyberpunk (glassmorphism)
│           └── js/
│               ├── main.js         # Hamburger, typing anim, compteurs, recherche
│               ├── auth.js         # Modales login/register, JWT localStorage
│               └── chat-widget.js  # Chatbot flottant SSE + choix d'avatar
│
└── ansible/
    ├── inventory.ini
    └── deploy-ykonnect.yml
```

---

## Prérequis

### Sur le serveur (192.168.4.80)

**Installer Docker** :

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

# Clé SSH du serveur
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
terraform init
terraform plan
terraform apply
```

---

## Déploiement — YKonnect (Ansible)

### 1. Configurer les secrets

Créer `ykonnect/.env` :

```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
JWT_SECRET=une-chaine-aleatoire-longue-et-secrete
ADMIN_EMAIL=admin@ykonnect.fr
ADMIN_PASSWORD=VotreMotDePasseAdmin
```

> Clé Groq gratuite sur [console.groq.com](https://console.groq.com)

### 2. Lancer le playbook

```bash
cd ansible/
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventory.ini deploy-ykonnect.yml \
  -e "ansible_ssh_pass=VOTRE_MDP ansible_become_pass=VOTRE_MDP"
```

### 3. Vérifier

```bash
curl http://192.168.4.80:8081/api/health
# {"status":"ok"}
```

---

## Monitoring

### Prometheus

| Job | Cible | Métriques |
|-----|-------|-----------|
| `prometheus` | localhost:9090 | Prometheus lui-même |
| `node_exporter` | node_exporter:9100 | CPU, RAM, disque, réseau |
| `postgres_exporter` | postgres_exporter:9187 | Requêtes, connexions PostgreSQL |
| `ykonnect` | ykonnect-backend-1:8000 | Requêtes HTTP, latences, erreurs |

```bash
make reload   # Recharger la config Prometheus sans redémarrage
```

### Grafana

Accès : `http://192.168.4.80:3000` — Login : `admin` / (voir `terraform.tfvars`)

Dashboards provisionnés : Node Exporter, PostgreSQL, YKonnect (6 panneaux).

---

## YKonnect — Détails techniques

### Design

Interface neon/cyberpunk : fond `#030014`, violet `#a855f7`, cyan `#06b6d4`, glassmorphism.  
Fonctionnalités JS : animation de frappe, compteurs animés (IntersectionObserver), barre de recherche live, menu hamburger mobile.

### Chatbot IA flottant

- Modèle : `llama-3.3-70b-versatile` via Groq API
- Streaming temps réel par **Server-Sent Events** (SSE)
- Historique multi-tour (10 derniers échanges, sessionStorage)
- Widget flottant présent sur toutes les pages
- **8 avatars** au choix : 🤖 🦾 👾 🐧 🧠 🛸 ⚙️ 💻 (persisté en localStorage)

### Quiz d'évaluation CKA

Page `evaluation-cka.html` — 16 questions réparties en 4 catégories :
- Linux / CLI, Docker / Containers, Réseau, Kubernetes
- Réponses mélangées aléatoirement (Fisher-Yates)
- Score : Débutant (0-5), Intermédiaire (6-9), Avancé (10-13), Expert (14-16)
- Recommandations personnalisées par domaine faible

### Endpoints backend

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| POST | `/api/chat/stream` | — | Chatbot SSE streaming |
| GET | `/api/health` | — | Healthcheck |
| GET | `/metrics` | — | Métriques Prometheus |
| POST | `/api/auth/register` | — | Créer un compte utilisateur |
| POST | `/api/auth/login` | — | Connexion utilisateur (retourne JWT) |
| POST | `/api/auth/admin/login` | — | Connexion admin (retourne JWT admin) |
| GET | `/api/tickets` | JWT user | Lister ses tickets |
| POST | `/api/tickets` | JWT user | Soumettre un ticket |
| GET | `/api/admin/tickets` | JWT admin | Tous les tickets |
| PATCH | `/api/admin/tickets/{id}/status` | JWT admin | Modifier le statut |

---

## Comptes utilisateurs et tickets

### Utilisateurs

Les utilisateurs créent un compte via la modale "Créer un compte" dans la navbar (toutes les pages).  
Le JWT est stocké en `localStorage` et valide 7 jours.

### Tickets d'infrastructure

Les utilisateurs connectés soumettent des demandes depuis `tickets.html` :
- Champs : titre, organisation, type de demande, priorité, description
- Statuts : `ouvert` → `en_cours` → `résolu`
- Données persistées en SQLite (`/app/data/ykonnect.db` dans le volume Docker)

### Panneau admin

Accès **direct** via : `http://192.168.4.80:8081/admin.html`

> ⚠️ Cette page est indépendante de la navbar. Ne pas utiliser le bouton "Connexion" des autres pages — il est réservé aux comptes utilisateurs.

Identifiants définis dans `ykonnect/.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).  
Fonctionnalités : liste de tous les tickets, filtres par statut, avancement du statut en un clic.

---

## Opérations courantes

**Redémarrer le stack local :**

```bash
make restart
```

**Voir les logs du backend :**

```bash
make logs-local           # backend par défaut
make logs-local S=nginx   # frontend nginx
```

**Redéployer après modification (Ansible) :**

```bash
cd ansible/
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventory.ini deploy-ykonnect.yml \
  -e "ansible_ssh_pass=VOTRE_MDP ansible_become_pass=VOTRE_MDP"
```

**Accéder à la base SQLite :**

```bash
sudo docker exec -it ykonnect-backend-1 sqlite3 /app/data/ykonnect.db ".tables"
```

---

## Points d'attention

| Point | Détail |
|-------|--------|
| `terraform.tfvars` | Ne jamais commiter — déjà dans `.gitignore` |
| `ykonnect/.env` | Ne jamais commiter — contient JWT_SECRET et mot de passe admin |
| `JWT_SECRET` | Changer impérativement en production |
| `ADMIN_PASSWORD` | Ne pas utiliser le même mot de passe qu'un compte utilisateur normal |
| Docker TCP sans TLS | Valable uniquement en réseau interne isolé |
| Port 8080 réservé | Un autre service utilise le port 8080 — YKonnect est sur 8081 |
| Prometheus hot-reload | Toujours utiliser `POST /-/reload` plutôt que `docker restart prometheus` |
| SSE / nginx | `proxy_buffering off` requis dans nginx.conf pour le streaming chatbot |
| bcrypt | `requirements.txt` fixé à `bcrypt==4.2.1` (incompatibilité passlib avec bcrypt 5.x) |
