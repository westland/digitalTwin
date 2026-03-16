"""
RAG system: ingest notes → ChromaDB, query relevant chunks for LLM context.
Uses OpenAI text-embedding-3-small for embeddings.
"""
import os
import hashlib
import logging
from pathlib import Path
from typing import Optional

import chromadb
from chromadb.utils import embedding_functions
from openai import OpenAI

logger = logging.getLogger(__name__)

CHUNK_SIZE = 600       # tokens approx (chars / 4)
CHUNK_OVERLAP = 100


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks by character count."""
    chunks = []
    start = 0
    text = text.strip()
    while start < len(text):
        end = start + chunk_size * 4  # rough char estimate
        chunk = text[start:end]
        if chunk:
            chunks.append(chunk)
        start += (chunk_size - overlap) * 4
    return chunks


class RAGSystem:
    def __init__(self, persist_dir: str = "./data/chroma"):
        Path(persist_dir).mkdir(parents=True, exist_ok=True)
        api_key = os.getenv("OPENAI_API_KEY")

        self.openai_ef = embedding_functions.OpenAIEmbeddingFunction(
            api_key=api_key,
            model_name="text-embedding-3-small"
        )
        self.client = chromadb.PersistentClient(path=persist_dir)
        self.collection = self.client.get_or_create_collection(
            name="class_notes",
            embedding_function=self.openai_ef,
            metadata={"hnsw:space": "cosine"}
        )
        self.openai = OpenAI(api_key=api_key)
        logger.info(f"RAG system ready. {self.collection.count()} chunks stored.")

    def ingest_text(self, content: str, topic: str, source: str = "manual") -> int:
        """Chunk and store text. Returns number of new chunks added."""
        chunks = _chunk_text(content)
        if not chunks:
            return 0

        ids, documents, metadatas = [], [], []
        for i, chunk in enumerate(chunks):
            doc_id = hashlib.md5(f"{topic}:{source}:{i}:{chunk[:50]}".encode()).hexdigest()
            # Skip if already exists
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
        """Return relevant context string for the given question."""
        count = self.collection.count()
        if count == 0:
            return ""

        where = {"topic": topic} if topic else None
        try:
            results = self.collection.query(
                query_texts=[question],
                n_results=min(n_results, count),
                where=where
            )
            docs = results.get("documents", [[]])[0]
            if not docs:
                return ""
            return "\n\n---\n\n".join(docs)
        except Exception as e:
            logger.error(f"RAG query error: {e}")
            return ""

    def list_topics(self) -> list[str]:
        """Return unique topics stored in the knowledge base."""
        try:
            results = self.collection.get(include=["metadatas"])
            topics = list({m.get("topic", "unknown") for m in results.get("metadatas", [])})
            return sorted(topics)
        except Exception:
            return []

    def delete_topic(self, topic: str) -> int:
        """Remove all chunks for a given topic."""
        results = self.collection.get(where={"topic": topic}, include=["metadatas"])
        ids = results.get("ids", [])
        if ids:
            self.collection.delete(ids=ids)
        return len(ids)
