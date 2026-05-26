from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from prometheus_fastapi_instrumentator import Instrumentator
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

Instrumentator().instrument(app).expose(app, endpoint="/metrics")

client = Groq(api_key=os.environ["GROQ_API_KEY"])

SYSTEM_PROMPT = """Tu es le chatbot de YKonnect, un hub d'articles IT & infra pour etudiants en master systeme et reseau.
Tu reponds en francais, de facon claire et concise (5-8 lignes maximum).
Tu te specialises dans : Linux, reseaux, securite, Docker, Kubernetes, Terraform, Ansible, monitoring.

Le site YKonnect contient les pages suivantes. Quand la question de l'utilisateur correspond a l'un de ces sujets, commence ta reponse par une courte phrase d'introduction puis propose le lien vers la page en HTML (balise <a>), avant de donner une reponse courte.

Pages disponibles sur YKonnect :
- VPN WireGuard : <a href="/wireguard.html" style="color:#26c6da;">Procedure WireGuard</a>
- Protection Fail2Ban : <a href="/fail2ban.html" style="color:#26c6da;">Procedure Fail2Ban</a>
- Load balancer HAProxy : <a href="/haproxy.html" style="color:#26c6da;">Procedure HAProxy</a>
- Kubernetes / CKA (architecture) : <a href="/cka-archi.html" style="color:#26c6da;">Module 1 - Architecture K8s</a>
- Kubernetes / CKA (workloads, pods, deployments) : <a href="/cka-workloads.html" style="color:#26c6da;">Module 2 - Workloads K8s</a>
- Kubernetes / CKA (services, ingress, networking) : <a href="/cka-networking.html" style="color:#26c6da;">Module 3 - Networking K8s</a>
- Kubernetes / CKA (RBAC, secrets, securite) : <a href="/cka-securite.html" style="color:#26c6da;">Module 4 - Securite K8s</a>
- Parcours CKA complet : <a href="/certifications.html" style="color:#26c6da;">Certifications</a>
- VLANs reseau : <a href="/article.html?id=1" style="color:#26c6da;">Comprendre les VLANs</a>
- Hardening Linux : <a href="/article.html?id=2" style="color:#26c6da;">Hardening Linux</a>

Si la question ne correspond a aucune page du site, reponds directement et brievement sans proposer de lien.
Ne genere jamais de longues listes a puces. Sois direct et utile."""


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    response: str


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message vide")

    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": req.message},
        ],
        max_tokens=512,
        temperature=0.6,
    )

    return ChatResponse(response=completion.choices[0].message.content)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
