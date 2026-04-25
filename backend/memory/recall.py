"""
Auto-Recall — Retrieve relevant memories before AI responds.

On every AI query, this module:
  1. Embeds the user's current message
  2. Searches across all memories + document chunks for this user
  3. Returns the top-K most relevant items
  4. Formats them for injection into the system prompt

This is a PARALLEL layer to the existing context.py summary.
  context.py → structured profile data (name, income, risk tolerance)
  recall.py  → learned facts + document content (semantic search)

Neither replaces the other; they complement each other.
"""
from __future__ import annotations

import logging
from typing import List

from memory.store import (
    get_all_memory_embeddings,
    get_all_chunk_embeddings,
    touch_memory,
)
from memory.embeddings import embed_text, bytes_to_vec, cosine_search

logger = logging.getLogger(__name__)


def recall_for_query(
    user_id: str,
    query: str,
    max_memories: int = 8,
    max_chunks: int = 5,
    memory_threshold: float = 0.35,
    chunk_threshold: float = 0.40,
) -> dict:
    """
    Retrieve relevant memories and document chunks for a user query.

    Returns:
        {
            "memories": [{"id", "content", "category", "score"}],
            "document_chunks": [{"id", "content", "document_type", "score"}],
            "prompt_addition": str   # ready for system prompt injection
        }
    """
    query_vec = embed_text(query)
    if query_vec is None:
        return {"memories": [], "document_chunks": [], "prompt_addition": ""}

    # --- Search memories ---
    memory_rows = get_all_memory_embeddings(user_id)
    memory_candidates = []
    memory_meta: dict = {}
    for mem_id, content, emb_bytes, importance, category in memory_rows:
        if emb_bytes:
            vec = bytes_to_vec(emb_bytes)
            memory_candidates.append((mem_id, vec))
            memory_meta[mem_id] = {
                "content": content,
                "category": category,
                "importance": importance,
            }

    raw_memory_hits = cosine_search(
        query_vec, memory_candidates,
        top_k=max_memories, threshold=memory_threshold,
    )

    memories = []
    for mem_id, score in raw_memory_hits:
        meta = memory_meta[mem_id]
        adjusted = score * 0.7 + meta["importance"] * 0.3
        memories.append({
            "id": mem_id,
            "content": meta["content"],
            "category": meta["category"],
            "score": round(adjusted, 3),
        })
        touch_memory(mem_id)
    memories.sort(key=lambda x: x["score"], reverse=True)

    # --- Search document chunks ---
    chunk_rows = get_all_chunk_embeddings(user_id)
    chunk_candidates = []
    chunk_meta: dict = {}
    for chunk_id, content, emb_bytes, doc_id, doc_type in chunk_rows:
        if emb_bytes:
            vec = bytes_to_vec(emb_bytes)
            chunk_candidates.append((chunk_id, vec))
            chunk_meta[chunk_id] = {
                "content": content,
                "document_id": doc_id,
                "document_type": doc_type,
            }

    raw_chunk_hits = cosine_search(
        query_vec, chunk_candidates,
        top_k=max_chunks, threshold=chunk_threshold,
    )

    chunks = []
    for chunk_id, score in raw_chunk_hits:
        meta = chunk_meta[chunk_id]
        chunks.append({
            "id": chunk_id,
            "content": meta["content"],
            "document_type": meta["document_type"],
            "score": round(float(score), 3),
        })

    prompt_addition = _format_for_prompt(memories, chunks)

    return {
        "memories": memories,
        "document_chunks": chunks,
        "prompt_addition": prompt_addition,
    }


def _format_for_prompt(memories: List[dict], chunks: List[dict]) -> str:
    """Format recalled data for system prompt injection."""
    if not memories and not chunks:
        return ""

    parts: List[str] = []

    if memories:
        parts.append("--- RECALLED MEMORIES (facts learned from past interactions) ---")
        for m in memories:
            parts.append(f"• [{m['category']}] {m['content']}")
        parts.append("--- END MEMORIES ---")

    if chunks:
        parts.append("\n--- RELEVANT DOCUMENT CONTENT ---")
        for c in chunks:
            label = c["document_type"].replace("_", " ") if c["document_type"] else "document"
            parts.append(f"• [From {label}] {c['content'][:300]}")
        parts.append("--- END DOCUMENT CONTENT ---")

    return "\n".join(parts)
