"""
Embedding + Vector Search layer.

Uses Google text-embedding-004 via the genai SDK (already installed).
Vector search uses numpy cosine similarity — fast enough for per-user
memory sets (<100K vectors). No extra dependencies needed.

Embeddings are stored as vector(3072) via pgvector in PostgreSQL.
"""
from __future__ import annotations

import logging
import numpy as np
from typing import List, Optional, Tuple

from config import settings

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIM = 3072

# In-memory cache to avoid redundant API calls within the same session
_embed_cache: dict[str, np.ndarray] = {}
_CACHE_MAX = 500


def embed_text(text: str) -> Optional[np.ndarray]:
    """Embed a single text string. Returns a normalized float32 vector."""
    if not text or not text.strip():
        return None
    if not settings.gemini_api_key:
        logger.warning("No Gemini API key — cannot embed")
        return None

    cache_key = text[:200]
    if cache_key in _embed_cache:
        return _embed_cache[cache_key]

    try:
        from google import genai
        client = genai.Client(api_key=settings.gemini_api_key)
        result = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text,
        )
        vec = np.array(result.embeddings[0].values, dtype=np.float32)
        # L2 normalize for cosine similarity via dot product
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm

        # Cache management
        if len(_embed_cache) >= _CACHE_MAX:
            keys = list(_embed_cache.keys())
            for k in keys[: len(keys) // 2]:
                del _embed_cache[k]
        _embed_cache[cache_key] = vec
        return vec
    except Exception as e:
        logger.warning("Embedding failed: %s", e)
        return None


def embed_batch(texts: List[str]) -> List[Optional[np.ndarray]]:
    """Embed multiple texts. Returns list of vectors (None for failures)."""
    if not texts:
        return []
    if not settings.gemini_api_key:
        return [None] * len(texts)

    try:
        from google import genai
        client = genai.Client(api_key=settings.gemini_api_key)
        results: List[Optional[np.ndarray]] = []
        batch_size = 100  # API limit per call
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            valid_indices = [j for j, t in enumerate(batch) if t and t.strip()]
            valid_texts = [batch[j] for j in valid_indices]
            batch_results: List[Optional[np.ndarray]] = [None] * len(batch)
            if not valid_texts:
                results.extend(batch_results)
                continue
            try:
                response = client.models.embed_content(
                    model=EMBEDDING_MODEL,
                    contents=valid_texts,
                )
                for idx, emb in zip(valid_indices, response.embeddings):
                    vec = np.array(emb.values, dtype=np.float32)
                    norm = np.linalg.norm(vec)
                    if norm > 0:
                        vec = vec / norm
                    batch_results[idx] = vec
            except Exception as e:
                logger.warning("Batch embedding failed: %s", e)
            results.extend(batch_results)
        return results
    except Exception as e:
        logger.warning("Batch embedding setup failed: %s", e)
        return [None] * len(texts)


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------

def vec_to_bytes(vec: np.ndarray) -> str:
    """Convert a numpy vector to a pgvector-compatible string."""
    return "[" + ",".join(str(float(x)) for x in vec) + "]"


def bytes_to_vec(data) -> np.ndarray:
    """Convert pgvector data (string or list) back to a numpy vector."""
    if isinstance(data, (list, tuple)):
        return np.array(data, dtype=np.float32)
    if isinstance(data, str):
        data = data.strip("[]")
        return np.array([float(x) for x in data.split(",")], dtype=np.float32)
    # Legacy bytes fallback
    return np.frombuffer(data, dtype=np.float32).copy()


# ---------------------------------------------------------------------------
# Vector search
# ---------------------------------------------------------------------------

def cosine_search(
    query_vec: np.ndarray,
    candidates: List[Tuple[str, np.ndarray]],
    top_k: int = 10,
    threshold: float = 0.3,
) -> List[Tuple[str, float]]:
    """
    Search for most similar vectors via cosine similarity (dot product on
    pre-normalized vectors).

    Returns list of (id, similarity_score) sorted descending.
    """
    if not candidates or query_vec is None:
        return []

    ids = [c[0] for c in candidates]
    matrix = np.stack([c[1] for c in candidates])
    scores = matrix @ query_vec

    results = [
        (ids[i], float(scores[i]))
        for i in range(len(scores))
        if scores[i] >= threshold
    ]
    results.sort(key=lambda x: x[1], reverse=True)
    return results[:top_k]
