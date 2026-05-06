FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir \
    fastapi \
    uvicorn \
    httpx \
    chromadb-client \
    markdown \
    python-frontmatter

COPY app.py .
COPY ingest.py .
COPY index.html ./static/

RUN mkdir -p /app/docs

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
