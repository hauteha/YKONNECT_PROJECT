from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from groq import Groq
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
import os
import json

# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
)

Instrumentator().instrument(app).expose(app, endpoint="/metrics")

# ── Database ──────────────────────────────────────────────────────────────────

DATABASE_URL = "sqlite:////app/data/ykonnect.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    tickets = relationship("Ticket", back_populates="user")


class Ticket(Base):
    __tablename__ = "tickets"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    organization = Column(String)
    request_type = Column(String)
    priority = Column(String, default="normale")
    description = Column(Text)
    status = Column(String, default="ouvert")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", back_populates="tickets")


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ticket_to_dict(t: Ticket, with_email: bool = False) -> dict:
    d = {
        "id": t.id,
        "title": t.title,
        "organization": t.organization,
        "request_type": t.request_type,
        "priority": t.priority,
        "description": t.description,
        "status": t.status,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }
    if with_email:
        d["user_email"] = t.user.email if t.user else "?"
    return d


# ── Auth ──────────────────────────────────────────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-in-prod")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24 * 7
security = HTTPBearer()


def create_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id or payload.get("is_admin"):
            raise HTTPException(status_code=401, detail="Token invalide")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalide")
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")
    return user


def get_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if not payload.get("is_admin"):
            raise HTTPException(status_code=403, detail="Accès admin requis")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalide")


# ── Pydantic models ────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class TicketCreate(BaseModel):
    title: str
    organization: str
    request_type: str
    priority: str
    description: str

class TicketStatusUpdate(BaseModel):
    status: str

class HistoryMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: list[HistoryMessage] = []

class ChatResponse(BaseModel):
    response: str


# ── Auth endpoints ─────────────────────────────────────────────────────────────

@app.post("/api/auth/register")
async def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if not req.email.strip() or not req.password:
        raise HTTPException(400, "Email et mot de passe requis")
    if len(req.password) < 6:
        raise HTTPException(400, "Le mot de passe doit faire au moins 6 caractères")
    if db.query(User).filter(User.email == req.email.lower()).first():
        raise HTTPException(400, "Cet email est déjà utilisé")
    user = User(email=req.email.lower(), password_hash=pwd_context.hash(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"token": create_token({"sub": str(user.id)}), "email": user.email}


@app.post("/api/auth/login")
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user or not pwd_context.verify(req.password, user.password_hash):
        raise HTTPException(401, "Email ou mot de passe incorrect")
    return {"token": create_token({"sub": str(user.id)}), "email": user.email}


@app.post("/api/auth/admin/login")
async def admin_login(req: LoginRequest):
    if req.email != os.environ.get("ADMIN_EMAIL") or req.password != os.environ.get("ADMIN_PASSWORD"):
        raise HTTPException(401, "Identifiants admin incorrects")
    return {"token": create_token({"sub": "admin", "is_admin": True})}


@app.get("/api/auth/me")
async def me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "email": current_user.email}


# ── Ticket endpoints ───────────────────────────────────────────────────────────

@app.post("/api/tickets")
async def create_ticket(
    req: TicketCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ticket = Ticket(
        user_id=current_user.id,
        title=req.title,
        organization=req.organization,
        request_type=req.request_type,
        priority=req.priority,
        description=req.description,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket_to_dict(ticket)


@app.get("/api/tickets")
async def get_my_tickets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tickets = (
        db.query(Ticket)
        .filter(Ticket.user_id == current_user.id)
        .order_by(Ticket.created_at.desc())
        .all()
    )
    return [ticket_to_dict(t) for t in tickets]


@app.get("/api/admin/tickets")
async def admin_get_tickets(db: Session = Depends(get_db), _=Depends(get_admin)):
    tickets = db.query(Ticket).order_by(Ticket.created_at.desc()).all()
    return [ticket_to_dict(t, with_email=True) for t in tickets]


@app.patch("/api/admin/tickets/{ticket_id}/status")
async def admin_update_status(
    ticket_id: int,
    req: TicketStatusUpdate,
    db: Session = Depends(get_db),
    _=Depends(get_admin),
):
    if req.status not in ("ouvert", "en_cours", "resolu"):
        raise HTTPException(400, "Statut invalide")
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, "Ticket introuvable")
    ticket.status = req.status
    ticket.updated_at = datetime.utcnow()
    db.commit()
    return {"status": ticket.status}


# ── Chatbot ────────────────────────────────────────────────────────────────────

client = Groq(api_key=os.environ["GROQ_API_KEY"])

SYSTEM_PROMPT = """Tu es le chatbot de YKonnect, un hub d'articles IT & infra pour etudiants en master systeme et reseau.
Tu reponds en francais, de facon claire et concise (5-8 lignes maximum).
Tu te specialises dans : Linux, reseaux, securite, Docker, Kubernetes, Terraform, Ansible, monitoring.

Le site YKonnect contient les pages suivantes. Quand la question de l'utilisateur correspond a l'un de ces sujets, commence ta reponse par une courte phrase d'introduction puis propose le lien vers la page en HTML (balise <a>), avant de donner une reponse courte.

Pages disponibles sur YKonnect :
- VPN WireGuard : <a href="/wireguard.html" style="color:#06b6d4;">Procedure WireGuard</a>
- Protection Fail2Ban : <a href="/fail2ban.html" style="color:#06b6d4;">Procedure Fail2Ban</a>
- Load balancer HAProxy : <a href="/haproxy.html" style="color:#06b6d4;">Procedure HAProxy</a>
- Kubernetes / CKA (architecture) : <a href="/cka-archi.html" style="color:#06b6d4;">Module 1 - Architecture K8s</a>
- Kubernetes / CKA (workloads, pods, deployments) : <a href="/cka-workloads.html" style="color:#06b6d4;">Module 2 - Workloads K8s</a>
- Kubernetes / CKA (services, ingress, networking) : <a href="/cka-networking.html" style="color:#06b6d4;">Module 3 - Networking K8s</a>
- Kubernetes / CKA (RBAC, secrets, securite) : <a href="/cka-securite.html" style="color:#06b6d4;">Module 4 - Securite K8s</a>
- Parcours CKA complet : <a href="/certifications.html" style="color:#06b6d4;">Certifications</a>
- VLANs reseau : <a href="/article.html?id=1" style="color:#06b6d4;">Comprendre les VLANs</a>
- Hardening Linux : <a href="/article.html?id=2" style="color:#06b6d4;">Hardening Linux</a>

Si la question ne correspond a aucune page du site, reponds directement et brievement sans proposer de lien.
Ne genere jamais de longues listes a puces. Sois direct et utile."""

MAX_HISTORY = 10


def build_messages(req: ChatRequest) -> list[dict]:
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in req.history[-(MAX_HISTORY * 2):]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": req.message})
    return messages


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message vide")
    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=build_messages(req),
        max_tokens=512,
        temperature=0.6,
    )
    return ChatResponse(response=completion.choices[0].message.content)


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message vide")

    def generate():
        stream = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=build_messages(req),
            max_tokens=512,
            temperature=0.6,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield f"data: {json.dumps({'content': delta})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/health")
async def health():
    return {"status": "ok"}
