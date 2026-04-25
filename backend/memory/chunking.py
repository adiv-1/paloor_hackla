"""
Document chunking — split text into overlapping segments for vectorization.

Uses paragraph-aware splitting with sentence-level fallback for long
paragraphs. Overlap ensures no information is lost at chunk boundaries.
"""
from __future__ import annotations

import re
from typing import List


def chunk_text(
    text: str,
    chunk_size: int = 500,
    overlap: int = 50,
    min_chunk_size: int = 50,
) -> List[str]:
    """
    Split text into overlapping chunks for embedding.

    Args:
        text: raw text to chunk
        chunk_size: target characters per chunk
        overlap: characters of overlap between consecutive chunks
        min_chunk_size: minimum chunk size to keep
    """
    if not text or not text.strip():
        return []
    text = text.strip()
    if len(text) < min_chunk_size:
        return [text]

    paragraphs = text.split("\n\n")
    chunks: List[str] = []
    current = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        if len(current) + len(para) + 1 <= chunk_size:
            current = f"{current}\n{para}" if current else para
        else:
            if current and len(current) >= min_chunk_size:
                chunks.append(current.strip())

            if len(para) > chunk_size:
                sentences = _split_sentences(para)
                sub = ""
                for sent in sentences:
                    if len(sub) + len(sent) + 1 <= chunk_size:
                        sub = f"{sub} {sent}" if sub else sent
                    else:
                        if sub and len(sub) >= min_chunk_size:
                            chunks.append(sub.strip())
                        sub = sent
                current = sub
            else:
                current = para

    if current and len(current) >= min_chunk_size:
        chunks.append(current.strip())

    # Add overlap between consecutive chunks
    if overlap > 0 and len(chunks) > 1:
        overlapped = [chunks[0]]
        for i in range(1, len(chunks)):
            prev_tail = chunks[i - 1][-overlap:]
            overlapped.append(f"{prev_tail} {chunks[i]}")
        chunks = overlapped

    return chunks


def _split_sentences(text: str) -> List[str]:
    """Split text on sentence-ending punctuation."""
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [s.strip() for s in parts if s.strip()]
