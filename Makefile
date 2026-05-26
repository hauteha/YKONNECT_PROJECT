# ============================================================
#  YKonnect — Makefile
#  Usage : make install
#          SSH_PASS=monmotdepasse make install
#          make up          (lancer en local)
#          make down        (arreter en local)
# ============================================================

SERVER_IP  ?= 192.168.4.80
SSH_USER   ?= hau
SSH_PASS   ?= hau
SUDO_PASS  ?= hau

COMPOSE_DIR = ykonnect
COMPOSE     = echo "$(SUDO_PASS)" | sudo -S docker compose -f $(COMPOSE_DIR)/docker-compose.yml

ANSIBLE     = ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook \
              -i ansible/inventory.ini ansible/deploy-ykonnect.yml \
              -e "ansible_ssh_pass=$(SSH_PASS) ansible_become_pass=$(SSH_PASS)"

.DEFAULT_GOAL := help

.PHONY: install terraform ykonnect up down restart build ps logs-local status logs reload destroy check help

# ------------------------------------------------------------
#  UP — lance le stack YKonnect en local (build + start)
# ------------------------------------------------------------
up: check-env
	@echo "==> Lancement du stack YKonnect..."
	$(COMPOSE) up -d --build
	@echo ""
	@echo "  Stack demarre !"
	@echo "  YKonnect  : http://$(SERVER_IP):8081"
	@echo "  Prometheus: http://$(SERVER_IP):9090"
	@echo "  Grafana   : http://$(SERVER_IP):3000"
	@echo "  Portainer : http://$(SERVER_IP):9000"
	@echo "  Admin     : http://$(SERVER_IP):8081/admin.html"

# ------------------------------------------------------------
#  DOWN — arrete et supprime les conteneurs
# ------------------------------------------------------------
down:
	@echo "==> Arret du stack YKonnect..."
	$(COMPOSE) down

# ------------------------------------------------------------
#  RESTART — redemarrage complet
# ------------------------------------------------------------
restart: down up

# ------------------------------------------------------------
#  BUILD — rebuild les images sans relancer
# ------------------------------------------------------------
build: check-env
	@echo "==> Build des images..."
	$(COMPOSE) build --no-cache

# ------------------------------------------------------------
#  PS — etat des conteneurs locaux
# ------------------------------------------------------------
ps:
	@$(COMPOSE) ps

# ------------------------------------------------------------
#  LOGS-LOCAL — logs d'un service local (make logs-local S=backend)
# ------------------------------------------------------------
S ?= backend
logs-local:
	@$(COMPOSE) logs -f $(S)

# ------------------------------------------------------------
#  INSTALL — deploie tout en une commande
# ------------------------------------------------------------
install: check terraform ykonnect
	@echo ""
	@echo "  Infrastructure deployee avec succes !"
	@echo ""
	@echo "  Site vitrine  : http://$(SERVER_IP)"
	@echo "  YKonnect      : http://$(SERVER_IP):8081"
	@echo "  Prometheus    : http://$(SERVER_IP):9090"
	@echo "  Grafana       : http://$(SERVER_IP):3000"
	@echo "  Portainer     : http://$(SERVER_IP):9000"

# ------------------------------------------------------------
#  TERRAFORM — infra principale
# ------------------------------------------------------------
terraform: check-terraform check-tfvars
	@echo "==> [1/2] Deploiement infra principale (Terraform)..."
	terraform -chdir=. init -input=false
	terraform -chdir=. apply -auto-approve
	@echo "==> Terraform OK"

# ------------------------------------------------------------
#  YKONNECT — deploiement via Ansible
# ------------------------------------------------------------
ykonnect: check-ansible check-env
	@echo "==> [2/2] Deploiement YKonnect (Ansible)..."
	$(ANSIBLE)
	@echo "==> YKonnect OK -> http://$(SERVER_IP):8081"

# ------------------------------------------------------------
#  STATUS — etat des conteneurs sur le serveur
# ------------------------------------------------------------
status:
	@echo "==> Conteneurs actifs sur $(SERVER_IP) :"
	@ssh $(SSH_USER)@$(SERVER_IP) \
	  "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

# ------------------------------------------------------------
#  LOGS — logs d'un service (usage : make logs SERVICE=grafana)
# ------------------------------------------------------------
SERVICE ?= ykonnect-backend-1
logs:
	@ssh $(SSH_USER)@$(SERVER_IP) "docker logs -f $(SERVICE)"

# ------------------------------------------------------------
#  RELOAD — recharge Prometheus sans redemarrage
# ------------------------------------------------------------
reload:
	@echo "==> Rechargement de la config Prometheus..."
	@curl -s -X POST http://$(SERVER_IP):9090/-/reload && echo "OK"

# ------------------------------------------------------------
#  DESTROY — supprime l'infra principale Terraform
# ------------------------------------------------------------
destroy: check-terraform
	@echo "==> Destruction de l'infrastructure principale..."
	@read -p "Confirmer la destruction ? [oui/non] : " confirm && \
	  [ "$$confirm" = "oui" ] || (echo "Annule." && exit 1)
	terraform -chdir=. destroy -auto-approve

# ------------------------------------------------------------
#  VERIFICATIONS — dependances et fichiers requis
# ------------------------------------------------------------
check: check-terraform check-ansible check-tfvars check-env

check-terraform:
	@command -v terraform >/dev/null 2>&1 || \
	  (echo "ERREUR : terraform n'est pas installe. Voir README.md" && exit 1)

check-ansible:
	@command -v ansible-playbook >/dev/null 2>&1 || \
	  (echo "ERREUR : ansible n'est pas installe. Voir README.md" && exit 1)

check-tfvars:
	@test -f terraform.tfvars || \
	  (echo "ERREUR : terraform.tfvars manquant. Copier depuis l'exemple et renseigner les valeurs." && exit 1)

check-env:
	@test -f ykonnect/.env || \
	  (echo "ERREUR : ykonnect/.env manquant. Creer le fichier avec GROQ_API_KEY=gsk_..." && exit 1)

# ------------------------------------------------------------
#  HELP
# ------------------------------------------------------------
help:
	@echo ""
	@echo "  -- LOCAL (Docker Compose) --"
	@echo "  make up                   Lancer le stack YKonnect (build + start)"
	@echo "  make down                 Arreter le stack"
	@echo "  make restart              Redemarrer le stack"
	@echo "  make build                Rebuild les images sans relancer"
	@echo "  make ps                   Etat des conteneurs locaux"
	@echo "  make logs-local [S=...]   Logs d'un service local (defaut: backend)"
	@echo ""
	@echo "  -- DEPLOIEMENT (Terraform + Ansible) --"
	@echo "  make install              Deployer toute l'infrastructure"
	@echo "  make terraform            Deployer uniquement l'infra principale"
	@echo "  make ykonnect             Deployer uniquement YKonnect via Ansible"
	@echo "  make status               Voir les conteneurs actifs (SSH)"
	@echo "  make logs [SERVICE=...]   Suivre les logs d'un conteneur (SSH)"
	@echo "  make reload               Recharger la config Prometheus"
	@echo "  make destroy              Supprimer l'infrastructure principale"
	@echo ""
	@echo "  Variables :"
	@echo "    SUDO_PASS=xxx make up        Mot de passe sudo local (defaut: hau)"
	@echo "    SSH_PASS=xxx make install    Mot de passe SSH (defaut: hau)"
	@echo "    SERVER_IP=x.x.x.x make ...  Changer le serveur cible"
	@echo "    S=frontend make logs-local  Logs du service frontend"
	@echo ""
