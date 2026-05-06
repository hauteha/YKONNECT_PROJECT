# Chatbot RAG — Déploiement Ansible + Docker

## Architecture

```
Docker sur votre serveur
├── ollama       → LLM llama3.2:3b + embedding nomic-embed-text
├── chromadb     → Base vectorielle (stocke votre FAQ)
└── chatbot_api  → FastAPI (API + widget HTML)
```

## Prérequis (sur votre machine locale)

```bash
apt install ansible -y
ansible-galaxy collection install community.general community.docker
```

## Configuration

| Fichier        | Ce qu'il faut modifier              |
|----------------|-------------------------------------|
| `inventory.yml`| IP de votre serveur cible           |
| `vars.yml`     | Modèle, ports, prompt système       |

## Déploiement

```bash
ansible-playbook -i inventory.yml playbook.yml
```

## Ajouter / modifier votre FAQ

1. Éditez ou ajoutez des fichiers `.md` dans `/opt/chatbot/docs/` sur le serveur
2. Relancez l'indexation :

```bash
docker exec chatbot_api python ingest.py
```

Pour tout réindexer depuis zéro :
```bash
docker exec chatbot_api python ingest.py --reset
```

## Vérifier le statut

- Widget chat     → http://IP_SERVEUR:8000
- Santé API       → http://IP_SERVEUR:8000/health
- Chunks indexés  → http://IP_SERVEUR:8000/docs-status

## Intégrer dans votre site HTML

Ajoutez ceci avant `</body>` dans vos pages :

```html
<script>
  const iframe = document.createElement("iframe");
  iframe.src = "http://192.168.1.50:8000";
  iframe.style = "position:fixed;bottom:0;right:0;width:380px;height:560px;border:none;z-index:9999";
  document.body.appendChild(iframe);
</script>
```

## Commandes utiles

```bash
# Voir les containers
docker ps

# Logs FastAPI
docker logs chatbot_api

# Logs Ollama
docker logs ollama

# Logs ChromaDB
docker logs chromadb

# Redémarrer tout
cd /opt/chatbot && docker compose restart
```
