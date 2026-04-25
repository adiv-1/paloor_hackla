"""
Memory persistence layer — PostgreSQL with pgvector.

Tables:
  memories        — individual facts learned about the user
  document_chunks — vectorized segments of uploaded documents

Each user's data is isolated by user_id. No cross-user queries.
Embeddings stored as vector(3072) via pgvector.
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List

from database import pg_cursor

logger = logging.getLogger(__name__)


def _gen_id(prefix: str = "mem") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _now():
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

def init_memory_db():
    """No-op: tables created via init_schema.sql."""
    logger.info("Memory DB initialized (PostgreSQL)")


# ---------------------------------------------------------------------------
# Memory CRUD
# ---------------------------------------------------------------------------

def store_memory(
    user_id: str,
    content: str,
    category: str,
    source: str = "chat",
    source_id: str = "",
    importance: float = 0.5,
    embedding=None,
) -> dict:
    """Store a new memory fact for a user."""
    with pg_cursor() as cur:
        mem_id = _gen_id("mem")
        now = _now()
        cur.execute(
            """INSERT INTO memories
               (id, user_id, category, content, source, source_id,
                importance, embedding, access_count, created_at, updated_at, is_active)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 0, %s, %s, TRUE)""",
            (mem_id, user_id, category, content, source, source_id,
             importance, embedding, now, now),
        )
        return {"id": mem_id, "content": content, "category": category}


def update_memory(
    memory_id: str,
    content: str = None,
    importance: float = None,
    embedding=None,
):
    """Update an existing memory."""
    with pg_cursor() as cur:
        sets = ["updated_at = %s"]
        vals: list = [_now()]
        if content is not None:
            sets.append("content = %s")
            vals.append(content)
        if importance is not None:
            sets.append("importance = %s")
            vals.append(importance)
        if embedding is not None:
            sets.append("embedding = %s")
            vals.append(embedding)
        vals.append(memory_id)
        cur.execute(
            f"UPDATE memories SET {', '.join(sets)} WHERE id = %s", vals,
        )


def deactivate_memory(memory_id: str):
    """Soft-delete a memory."""
    with pg_cursor() as cur:
        cur.execute(
            "UPDATE memories SET is_active = FALSE, updated_at = %s WHERE id = %s",
            (_now(), memory_id),
        )


def delete_memory(memory_id: str):
    """Hard-delete a memory."""
    with pg_cursor() as cur:
        cur.execute("DELETE FROM memories WHERE id = %s", (memory_id,))


def get_memory(memory_id: str) -> Optional[dict]:
    with pg_cursor() as cur:
        cur.execute("SELECT * FROM memories WHERE id = %s", (memory_id,))
        row = cur.fetchone()
        return dict(row) if row else None


def list_memories(
    user_id: str,
    category: str = None,
    active_only: bool = True,
    limit: int = 100,
) -> List[dict]:
    with pg_cursor() as cur:
        query = (
            "SELECT id, user_id, category, content, source, source_id, "
            "importance, access_count, created_at, updated_at, is_active "
            "FROM memories WHERE user_id = %s"
        )
        params: list = [user_id]
        if active_only:
            query += " AND is_active = TRUE"
        if category:
            query += " AND category = %s"
            params.append(category)
        query += " ORDER BY updated_at DESC LIMIT %s"
        params.append(limit)
        rows = cur.execute(query, params)
        return [dict(r) for r in cur.fetchall()]


def get_all_memory_embeddings(user_id: str) -> List[tuple]:
    """Return (id, content, embedding, importance, category) for active memories."""
    with pg_cursor() as cur:
        cur.execute(
            """SELECT id, content, embedding, importance, category
               FROM memories
               WHERE user_id = %s AND is_active = TRUE AND embedding IS NOT NULL""",
            (user_id,),
        )
        return [
            (r["id"], r["content"], r["embedding"], r["importance"], r["category"])
            for r in cur.fetchall()
        ]


def touch_memory(memory_id: str):
    """Increment access count and update last_accessed_at."""
    with pg_cursor() as cur:
        cur.execute(
            "UPDATE memories SET access_count = access_count + 1, last_accessed_at = %s WHERE id = %s",
            (_now(), memory_id),
        )


def find_similar_memory(user_id: str, content: str) -> Optional[dict]:
    """Check for exact duplicate content."""
    with pg_cursor() as cur:
        cur.execute(
            "SELECT * FROM memories WHERE user_id = %s AND content = %s AND is_active = TRUE",
            (user_id, content),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def count_memories(user_id: str) -> int:
    with pg_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) as cnt FROM memories WHERE user_id = %s AND is_active = TRUE",
            (user_id,),
        )
        row = cur.fetchone()
        return row["cnt"] if row else 0


# ---------------------------------------------------------------------------
# Document Chunks
# ---------------------------------------------------------------------------

def store_document_chunk(
    user_id: str,
    document_id: str,
    document_type: str,
    chunk_index: int,
    content: str,
    embedding=None,
) -> str:
    with pg_cursor() as cur:
        chunk_id = _gen_id("chunk")
        cur.execute(
            """INSERT INTO document_chunks
               (id, user_id, document_id, document_type, chunk_index, content, embedding, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (chunk_id, user_id, document_id, document_type, chunk_index, content, embedding, _now()),
        )
        return chunk_id


def get_document_chunks(document_id: str) -> List[dict]:
    with pg_cursor() as cur:
        cur.execute(
            "SELECT * FROM document_chunks WHERE document_id = %s ORDER BY chunk_index",
            (document_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def delete_document_chunks(document_id: str):
    with pg_cursor() as cur:
        cur.execute("DELETE FROM document_chunks WHERE document_id = %s", (document_id,))


def get_all_chunk_embeddings(user_id: str) -> List[tuple]:
    """Return (id, content, embedding, document_id, document_type) for all chunks."""
    with pg_cursor() as cur:
        cur.execute(
            """SELECT id, content, embedding, document_id, document_type
               FROM document_chunks
               WHERE user_id = %s AND embedding IS NOT NULL""",
            (user_id,),
        )
        return [
            (r["id"], r["content"], r["embedding"], r["document_id"], r["document_type"])
            for r in cur.fetchall()
        ]


def count_document_chunks(user_id: str) -> int:
    with pg_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) as cnt FROM document_chunks WHERE user_id = %s",
            (user_id,),
        )
        row = cur.fetchone()
        return row["cnt"] if row else 0
