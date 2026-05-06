"""
ingest.py — Indexation des fichiers Markdown dans ChromaDB

Usage :
    python ingest.py                  # indexe tout /app/docs
    python ingest.py --reset          # vide la collection avant d'indexer

Ce script est à relancer à chaque fois que vous modifiez vos fichiers FAQ.
"""

import os
import re
import sys
import httpx
import chromadb

# ─── Config ────────────────────────────────────────────────────────────────────
OLLAMA_URL  = os.getenv("OLLAMA_URL",  "http://ollama:11434")
EMBED_MODEL = os.getenv("EMBED_MODEL", "nomic-embed-text")
CHROMA_URL  = os.getenv("CHROMA_URL",  "http://chromadb:8000")
DOCS_DIR    = os.getenv("DOCS_DIR",    "/app/docs")
COLLECTION  = "faq"
CHUNK_SIZE  = 500    # caractères par chunk
CHUNK_OVERLAP = 50  # chevauchement entre chunks


# ─── Découpage en chunks ───────────────────────────────────────────────────────
def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Découpe le texte en morceaux de taille fixe avec chevauchement."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + size
        chunks.append(text[start:end].strip())
        start += size - overlap
    return [c for c in chunks if len(c) > 50]  # ignorer les tout petits chunks


# ─── Nettoyage du Markdown ─────────────────────────────────────────────────────
def clean_markdown(text: str) -> str:
    """Supprime la syntaxe Markdown pour ne garder que le texte brut."""
    text = re.sub(r"#{1,6}\s+", "", text)          # titres
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)   # gras
    text = re.sub(r"\*(.+?)\*",   r"\1", text)      # italique
    text = re.sub(r"`{1,3}.*?`{1,3}", "", text, flags=re.DOTALL)  # code
    text = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", text) # liens
    text = re.sub(r"^\s*[-*>]\s+", "", text, flags=re.MULTILINE)  # listes/citations
    text = re.sub(r"\n{3,}", "\n\n", text)           # lignes vides excessives
    return text.strip()


# ─── Embedding via Ollama ──────────────────────────────────────────────────────
def embed(text: str) -> list[float]:
    with httpx.Client(timeout=30.0) as client:
        res = client.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": EMBED_MODEL, "prompt": text}
        )
        res.raise_for_status()
        return res.json()["embedding"]


# ─── Programme principal ───────────────────────────────────────────────────────
def main():
    reset = "--reset" in sys.argv

    # Connexion ChromaDB
    host, port = CHROMA_URL.replace("http://", "").split(":")
    chroma = chromadb.HttpClient(host=host, port=int(port))

    # Créer ou réinitialiser la collection
    if reset:
        try:
            chroma.delete_collection(COLLECTION)
            print(f"🗑️  Collection '{COLLECTION}' supprimée.")
        except Exception:
            pass

    collection = chroma.get_or_create_collection(
        name=COLLECTION,
        metadata={"hnsw:space": "cosine"}
    )

    # Parcourir les fichiers Markdown
    md_files = [f for f in os.listdir(DOCS_DIR) if f.endswith(".md")]

    if not md_files:
        print(f"⚠️  Aucun fichier .md trouvé dans {DOCS_DIR}")
        return

    total_chunks = 0

    for filename in md_files:
        filepath = os.path.join(DOCS_DIR, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            raw = f.read()

        text   = clean_markdown(raw)
        chunks = chunk_text(text)

        print(f"\n📄 {filename} → {len(chunks)} chunks")

        for i, chunk in enumerate(chunks):
            chunk_id = f"{filename}_{i}"

            # Vérifier si ce chunk existe déjà
            existing = collection.get(ids=[chunk_id])
            if existing["ids"]:
                print(f"   ⏭️  Chunk {i+1}/{len(chunks)} déjà indexé, ignoré.")
                continue

            vector = embed(chunk)
            collection.add(
                ids=[chunk_id],
                embeddings=[vector],
                documents=[chunk],
                metadatas=[{"source": filename, "chunk": i}]
            )
            total_chunks += 1
            print(f"   ✅ Chunk {i+1}/{len(chunks)} indexé.")

    print(f"\n🎉 Terminé ! {total_chunks} nouveaux chunks ajoutés.")
    print(f"📊 Total dans ChromaDB : {collection.count()} chunks")


if __name__ == "__main__":
    main()
