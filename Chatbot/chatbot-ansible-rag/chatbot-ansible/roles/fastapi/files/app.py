from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import chromadb
import httpx
import os

app = FastAPI(title="Chatbot RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# ─── Config ────────────────────────────────────────────────────────────
OLLAMA_URL    = os.getenv("OLLAMA_URL",    "http://ollama:11434")
OLLAMA_MODEL  = os.getenv("OLLAMA_MODEL",  "llama3.2:3b")
EMBED_MODEL   = os.getenv("EMBED_MODEL",   "nomic-embed-text")
CHROMA_URL    = os.getenv("CHROMA_URL",    "http://chromadb:8000")
SYSTEM_PROMPT = os.getenv("SYSTEM_PROMPT", "Tu es un assistant. Réponds en français.")
COLLECTION    = "faq"
N_RESULTS     = 3


# ─── Client ChromaDB ───────────────────────────────────────────────────
def get_chroma():
    host, port = CHROMA_URL.replace("http://", "").split(":")
    return chromadb.HttpClient(host=host, port=int(port))


# ─── Embedding via Ollama ──────────────────────────────────────────────
async def embed(text: str) -> list[float]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": EMBED_MODEL, "prompt": text}
        )
        res.raise_for_status()
        return res.json()["embedding"]


# ─── Recherche RAG dans ChromaDB ──────────────────────────────────────
async def search_context(question: str) -> str:
    try:
        vector = await embed(question)
        chroma = get_chroma()
        collection = chroma.get_collection(COLLECTION)
        results = collection.query(
            query_embeddings=[vector],
            n_results=N_RESULTS,
            include=["documents", "metadatas"]
        )
        chunks  = results["documents"][0]
        sources = [m.get("source", "") for m in results["metadatas"][0]]
        context = "\n\n---\n\n".join(
            f"[Source: {src}]\n{chunk}" for src, chunk in zip(sources, chunks)
        )
        return context
    except Exception as e:
        print(f"[RAG] Erreur ChromaDB : {e}")
        return ""


# ─── Schémas ──────────────────────────────────────────────────────────
class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: list[Message]


# ─── Routes ───────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "model": OLLAMA_MODEL, "embed": EMBED_MODEL}


@app.get("/docs-status")
async def docs_status():
    try:
        chroma = get_chroma()
        collection = chroma.get_collection(COLLECTION)
        return {"indexed_chunks": collection.count(), "collection": COLLECTION}
    except Exception as e:
        return {"indexed_chunks": 0, "error": str(e)}


@app.post("/chat")
async def chat(request: ChatRequest):
    if not request.messages:
        raise HTTPException(status_code=400, detail="Aucun message fourni.")

    last_user_msg = next(
        (m.content for m in reversed(request.messages) if m.role == "user"), ""
    )

    context = await search_context(last_user_msg)

    if context:
        system = f"{SYSTEM_PROMPT}\n\nInformations disponibles :\n\n{context}"
    else:
        system = SYSTEM_PROMPT + "\n\nAucun document FAQ indexé pour l'instant."

    messages = [{"role": "system", "content": system}]
    messages += [{"role": m.role, "content": m.content} for m in request.messages]

    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(
            f"{OLLAMA_URL}/api/chat",
            json={"model": OLLAMA_MODEL, "messages": messages, "stream": False}
        )
        res.raise_for_status()

    return {"reply": res.json()["message"]["content"]}


app.mount("/", StaticFiles(directory="/app/static", html=True), name="static")
