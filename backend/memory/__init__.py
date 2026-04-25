# memory — Persistent AI memory system with RAG.
#
# Modules:
#   store.py      — SQLite persistence for memories + document chunks
#   embeddings.py — Embedding via Google text-embedding-004 + numpy vector search
#   chunking.py   — Document text chunking for vectorization
#   capture.py    — Auto-capture: extract facts from conversations + documents
#   recall.py     — Auto-recall: semantic search before every AI response
#   router.py     — REST API for memory management
