"""
RAG system: ingest notes → ChromaDB, query relevant chunks for LLM context.
Uses Google Gemini text-embedding-004 for embeddings.
"""
import os
import hashlib
import logging
from pathlib import Path
from typing import Optional

import chromadb
from chromadb import EmbeddingFunction
import google.generativeai as genai

logger = logging.getLogger(__name__)

CHUNK_SIZE    = 600
CHUNK_OVERLAP = 100


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    chunks, start = [], 0
    text = text.strip()
    while start < len(text):
        end   = start + chunk_size * 4
        chunk = text[start:end]
        if chunk:
            chunks.append(chunk)
        start += (chunk_size - overlap) * 4
    return chunks


class _GeminiEmbedder(EmbeddingFunction):
    """Calls Gemini text-embedding-004 directly, bypassing chromadb's internal wrappers."""
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)

    def __call__(self, input: list) -> list:
        try:
            result = genai.embed_content(
                model="models/text-embedding-004",
                content=input,
                task_type="retrieval_document",
            )
            # embed_content returns a dict with key 'embedding'
            # When content is a list it returns a list of embeddings
            embeddings = result.get("embedding", [])
            if embeddings and not isinstance(embeddings[0], list):
                embeddings = [embeddings]  # single text → wrap
            return embeddings
        except Exception as exc:
            raise RuntimeError(f"Gemini embedding failed: {exc}") from None


class RAGSystem:
    def __init__(self, persist_dir: str = "./data/chroma"):
        Path(persist_dir).mkdir(parents=True, exist_ok=True)
        api_key = os.getenv("GEMINI_API_KEY")
        genai.configure(api_key=api_key)

        self.embedder   = _GeminiEmbedder(api_key=api_key)
        self.client     = chromadb.PersistentClient(path=persist_dir)
        self.collection = self.client.get_or_create_collection(
            name="class_notes",
            embedding_function=self.embedder,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info(f"RAG system ready. {self.collection.count()} chunks stored.")

    def ingest_text(self, content: str, topic: str, source: str = "manual") -> int:
        chunks = _chunk_text(content)
        if not chunks:
            return 0
        ids, documents, metadatas = [], [], []
        for i, chunk in enumerate(chunks):
            doc_id   = hashlib.md5(f"{topic}:{source}:{i}:{chunk[:50]}".encode()).hexdigest()
            existing = self.collection.get(ids=[doc_id])
            if existing["ids"]:
                continue
            ids.append(doc_id)
            documents.append(chunk)
            metadatas.append({"topic": topic, "source": source, "chunk_index": i})
        if ids:
            self.collection.add(ids=ids, documents=documents, metadatas=metadatas)
            logger.info(f"Ingested {len(ids)} new chunks for topic '{topic}'")
        return len(ids)

    def query(self, question: str, topic: Optional[str] = None, n_results: int = 4) -> str:
        count = self.collection.count()
        if count == 0:
            return ""
        where = {"topic": topic} if topic else None
        try:
            results = self.collection.query(
                query_texts=[question],
                n_results=min(n_results, count),
                where=where,
            )
            docs = results.get("documents", [[]])[0]
            return "\n\n---\n\n".join(docs) if docs else ""
        except Exception as e:
            logger.error(f"RAG query error: {e}")
            return ""

    def list_topics(self) -> list[str]:
        try:
            results = self.collection.get(include=["metadatas"])
            topics  = list({m.get("topic", "unknown") for m in results.get("metadatas", [])})
            return sorted(topics)
        except Exception:
            return []

    def delete_topic(self, topic: str) -> int:
        results = self.collection.get(where={"topic": topic}, include=["metadatas"])
        ids     = results.get("ids", [])
        if ids:
            self.collection.delete(ids=ids)
        return len(ids)
