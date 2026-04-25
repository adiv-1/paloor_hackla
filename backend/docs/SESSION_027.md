# SESSION 027 — Persistent Memory System with RAG

**Date**: Continuation of Session 026
**Type**: Backend architecture — AI memory layer
**Status**: Complete

---

## What Was Built

A persistent memory system with Retrieval-Augmented Generation (RAG) that gives the AI true personalization. The system learns from every conversation, remembers user facts across sessions, and makes uploaded documents searchable by semantic meaning — all without increasing the token window.

### Architecture Overview

```
User Message
    │
    ├──► context.py (structured profile: name, income, risk tolerance)
    │
    ├──► recall.py  (semantic search: learned facts + document chunks)  ← NEW
    │
    └──► System Prompt + Conversation History → LLM → Response
                                                         │
                                                         └──► capture.py (extract & store new facts)  ← NEW
```

**Key design**: Memory is a *parallel layer* to the existing context summary. `context.py` provides structured profile data; `recall.py` provides semantically-retrieved learned facts and document content. Neither replaces the other.

### Key Decisions

- **Zero new dependencies** — Uses Google `gemini-embedding-001` via the existing `google-genai` SDK for embeddings. Vector search via numpy cosine similarity. No FAISS, no sentence-transformers, no torch.
- **SQLite for persistence** — `memory.db` with WAL mode, consistent with the existing `chat.db` and `accounts.db` pattern.
- **LLM-based fact extraction** — After every AI response, a background LLM call extracts concrete facts (profile info, financial decisions, preferences, goals) as structured JSON.
- **Importance-weighted retrieval** — Recalled memories are scored as `0.7 × similarity + 0.3 × importance`, surfacing high-importance facts even with moderate similarity.
- **Fire-and-forget design** — Both memory capture (after response) and document vectorization (after upload) run as background tasks. Zero latency added to the user-facing response.
- **Per-user isolation** — All queries scoped by `user_id`. No cross-user data leakage.
- **Memory budget** — Max 500 memories per user. Deduplication before storage. Compaction can be added later.

---

## New Module: `backend/memory/`

### `store.py` — SQLite Persistence

- **`memories` table**: id, user_id, category, content, source, source_id, importance, embedding (BLOB), access_count, timestamps, is_active (soft delete)
- **`document_chunks` table**: id, user_id, document_id, document_type, chunk_index, content, embedding (BLOB)
- **Indexes**: user_id+is_active, user_id+category, document_id
- Full CRUD: `store_memory`, `update_memory`, `deactivate_memory`, `delete_memory`, `get_memory`, `list_memories`, `find_similar_memory`, `count_memories`
- Document chunk CRUD: `store_document_chunk`, `get_document_chunks`, `delete_document_chunks`
- Embedding retrieval: `get_all_memory_embeddings`, `get_all_chunk_embeddings`
- Access tracking: `touch_memory` (increments access_count, updates last_accessed_at)

### `embeddings.py` — Embedding + Vector Search

- **`embed_text(text)`** — Single text embedding via `gemini-embedding-001`, L2-normalized, cached (500 max)
- **`embed_batch(texts)`** — Batch embedding with 100-per-call API chunking
- **`vec_to_bytes` / `bytes_to_vec`** — numpy ↔ SQLite BLOB serialization
- **`cosine_search(query_vec, candidates, top_k, threshold)`** — numpy dot product on pre-normalized vectors
- Embedding dimension: 3072 (gemini-embedding-001)

### `chunking.py` — Document Chunking

- **`chunk_text(text, chunk_size=500, overlap=50)`** — Paragraph-aware splitting with sentence-level fallback
- Overlap between consecutive chunks for context continuity
- Min chunk size filter (50 chars) to discard fragments

### `capture.py` — Auto-Capture (Conversation → Memory)

- **`extract_and_store(user_id, user_message, ai_response, existing_summary, source, source_id)`**
  - Sends conversation exchange to LLM (gemma-3-12b-it → gemini-2.0-flash fallback)
  - Extracts facts as JSON array: `{content, category, importance}`
  - Deduplicates against existing memories (exact text match)
  - Embeds each new fact and stores with embedding
  - Temperature: 0.1 for factual extraction
- **`capture_document_facts(user_id, document_id, document_type, extracted_fields)`**
  - Stores document field summaries as document_insight memories
  - No LLM call — uses the already-extracted OCR fields
- **7 memory categories**: profile_fact, financial_decision, preference, goal, document_insight, conversation_topic, action_taken

### `recall.py` — Auto-Recall (Query → Relevant Memories)

- **`recall_for_query(user_id, query, max_memories=8, max_chunks=5)`**
  - Embeds the user's query
  - Searches memories (threshold 0.35) and document chunks (threshold 0.40)
  - Applies importance-weighted scoring
  - Touches accessed memories (tracks access_count)
  - Returns `{memories, document_chunks, prompt_addition}`
- **`_format_for_prompt()`** — Formats as `--- RECALLED MEMORIES ---` and `--- RELEVANT DOCUMENT CONTENT ---` sections

### `router.py` — REST API

| Endpoint | Method | Description |
|---|---|---|
| `/api/memory` | GET | List memories (filter by category, limit) |
| `/api/memory` | POST | Store a memory explicitly |
| `/api/memory/search` | POST | Semantic search across memories + chunks |
| `/api/memory/{id}` | DELETE | Forget a specific memory |
| `/api/memory/stats` | GET | Memory count, chunk count, category breakdown |

---

## Integration Points

### `chat/ai_service.py` — Memory Recall Injection

In `stream_ai_response()`, after `system_prompt = _build_system_prompt(user_id)`:
- Calls `recall_for_query(user_id, user_message)` to find relevant memories
- Appends `prompt_addition` to the system prompt
- Memories appear as `--- RECALLED MEMORIES ---` section in the prompt

### `chat/websocket.py` — Memory Capture After Response

After `save_ai_response()`:
- Fires `_async_capture_memory()` as an `asyncio.create_task` (non-blocking)
- Runs `extract_and_store()` in a thread pool to avoid blocking the event loop
- Gets existing context summary for dedup context

### `assets/service.py` — Document Vectorization on Upload

In both `upload_asset_document()` and `upload_account_document()`:
- After JSON sidecar persistence, spawns a daemon thread
- `_vectorize_document()` chunks the raw_text, embeds each chunk, stores in `document_chunks` table
- Also calls `capture_document_facts()` to store field summaries as memories

### `main.py` — Startup Registration

- Imports and registers `memory_router`
- Calls `init_memory_db()` on startup to create tables

---

## Data Flow Examples

### Conversation Memory
```
User: "I'm planning to max out my 401k this year and start a Roth IRA"
  → AI responds with advice
  → capture.py extracts:
      {content: "User plans to max out 401k this year", category: "goal", importance: 0.8}
      {content: "User wants to start a Roth IRA", category: "financial_decision", importance: 0.7}
  → Both facts embedded and stored in memory.db

Later...
User: "What should I do with extra savings after retirement accounts?"
  → recall.py finds the stored 401k and Roth IRA memories (high similarity)
  → AI receives: "--- RECALLED MEMORIES ---\n• [goal] User plans to max out 401k..."
  → AI gives personalized advice knowing the user's retirement strategy
```

### Document RAG
```
User uploads W-2 form
  → OCR extracts: employer name, wages, tax withheld
  → _vectorize_document() chunks the raw text and embeds it
  → capture_document_facts() stores: "User uploaded a W-2 tax form. Key data: employer: Acme Corp; wages: $120,000..."

Later...
User: "How much tax did I pay last year?"
  → recall.py finds the W-2 document chunks (high similarity to "tax")
  → AI receives relevant W-2 content and can answer accurately
```

---

## Technical Specs

| Component | Detail |
|---|---|
| Embedding model | Google gemini-embedding-001 (3072 dims) |
| Vector search | numpy cosine similarity (dot product on L2-normalized vectors) |
| Storage | SQLite WAL mode (`memory.db`) |
| Extraction LLM | gemma-3-12b-it → gemini-2.0-flash fallback |
| Extraction temp | 0.1 (low for factual accuracy) |
| Chunk size | 500 chars with 50-char overlap |
| Memory threshold | 0.35 similarity for memories, 0.40 for chunks |
| Max memories | 500 per user |
| Embedding cache | 500 entries in-memory (LRU-style) |
| New dependencies | None (uses existing google-genai + numpy) |

---

## Files Changed

| File | Change |
|---|---|
| `backend/memory/__init__.py` | Created — module init |
| `backend/memory/store.py` | Created — SQLite schema + CRUD |
| `backend/memory/embeddings.py` | Created — embedding + vector search |
| `backend/memory/chunking.py` | Created — document chunking |
| `backend/memory/capture.py` | Created — auto-capture from conversations |
| `backend/memory/recall.py` | Created — auto-recall for system prompt |
| `backend/memory/router.py` | Created — REST API endpoints |
| `backend/main.py` | Modified — register memory router + init DB |
| `backend/chat/ai_service.py` | Modified — inject recalled memories into system prompt |
| `backend/chat/websocket.py` | Modified — trigger memory capture after AI response |
| `backend/assets/service.py` | Modified — vectorize documents on upload |
