"""
Memory REST API — endpoints for explicit memory management.

Provides:
  GET    /api/memory          — list memories
  POST   /api/memory          — store a memory explicitly
  POST   /api/memory/search   — semantic search
  DELETE /api/memory/{id}     — forget a memory
  GET    /api/memory/stats    — memory statistics
"""
from __future__ import annotations

from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import Optional

from memory.store import (
    list_memories,
    store_memory,
    delete_memory,
    get_memory,
    count_memories,
    count_document_chunks,
)
from memory.embeddings import embed_text, vec_to_bytes
from memory.recall import recall_for_query

router = APIRouter(prefix="/api/memory", tags=["memory"])

DEFAULT_USER = "admin"


class StoreMemoryRequest(BaseModel):
    content: str
    category: str = "preference"
    importance: float = 0.5


class SearchRequest(BaseModel):
    query: str
    max_results: int = 10


@router.get("")
def api_list_memories(
    category: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    user_id: str = Query(DEFAULT_USER),
):
    mems = list_memories(user_id, category=category, limit=limit)
    return {"memories": mems, "total": len(mems)}


@router.post("/search")
def api_search_memories(req: SearchRequest, user_id: str = Query(DEFAULT_USER)):
    return recall_for_query(
        user_id=user_id,
        query=req.query,
        max_memories=req.max_results,
        max_chunks=5,
    )


@router.post("")
def api_store_memory(req: StoreMemoryRequest, user_id: str = Query(DEFAULT_USER)):
    vec = embed_text(req.content)
    embedding_bytes = vec_to_bytes(vec) if vec is not None else None
    return store_memory(
        user_id=user_id,
        content=req.content,
        category=req.category,
        source="manual",
        importance=req.importance,
        embedding=embedding_bytes,
    )


@router.delete("/{memory_id}")
def api_delete_memory(memory_id: str):
    mem = get_memory(memory_id)
    if not mem:
        raise HTTPException(status_code=404, detail="Memory not found")
    delete_memory(memory_id)
    return {"deleted": memory_id}


@router.get("/stats")
def api_memory_stats(user_id: str = Query(DEFAULT_USER)):
    mem_count = count_memories(user_id)
    chunk_count = count_document_chunks(user_id)
    mems = list_memories(user_id, limit=500)
    categories: dict = {}
    for m in mems:
        cat = m.get("category", "unknown")
        categories[cat] = categories.get(cat, 0) + 1
    return {
        "total_memories": mem_count,
        "total_document_chunks": chunk_count,
        "categories": categories,
    }
