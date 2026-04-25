# Session 016 — Feature Expansion

**Date:** June 2025
**Version:** v0.11.0

---

## Summary

Session 016 focused on six new features requested by the user: clickable profile navigation, chat sidebar management, message timestamps, bank/investment account linking, speech-to-text input, and this documentation.

---

## Features Implemented

### 1. Profile Click → Account Settings

**Files modified:** `frontend/components/Sidebar.tsx`

- **Avatar click** — Clicking the profile avatar in the top-left sidebar now opens a file picker to upload/change the profile photo directly (hover overlay shows camera icon effect).
- **Name click** — Clicking the user name or "Welcome back" text now navigates to `/dashboard/account` settings page via a `<Link>` component.
- Photo upload is handled inline with an `<input type="file">` that calls the existing `POST /api/auth/photo` endpoint.

### 2. Chat Sidebar — Delete & Reorder

**Files modified:**

- `frontend/app/dashboard/chat/page.tsx`
- `backend/chat/models.py`
- `backend/chat/router.py`

#### Delete

- Each conversation in the chat sidebar now shows a **trash icon** on hover that deletes the conversation with a single click.
- Uses the existing `DELETE /api/chat/conversations/{id}` endpoint.

#### Drag-to-Reorder

- Conversations can be **dragged and dropped** to reorder them in the sidebar using native HTML5 drag events.
- A **grip handle** (⠿) appears on hover for visual affordance.
- During drag, the source item becomes translucent and the drop target shows an emerald top-border indicator.
- Reorder is persisted via a new `PUT /api/chat/conversations/reorder` endpoint.

**Backend changes:**

- Added `position INTEGER` column to `conversation_members` table (per-user ordering).
- `list_conversations()` now sorts by position first (if set), falling back to `last_message_at DESC`.
- New `reorder_conversations(user_id, conversation_ids)` function in models.py.
- New `ReorderRequest` Pydantic model and `PUT /conversations/reorder` endpoint in router.py.

### 3. Message Date & Time Timestamps

**Files modified:** `frontend/app/dashboard/chat/page.tsx`

- **Full timestamps** — Messages now show "Today 2:30 PM", "Yesterday 10:15 AM", or "Jun 5 3:45 PM" instead of just "02:30".
- **Date separators** — Visual horizontal-rule date headers appear between messages from different days (e.g., "────── Today ──────", "────── Yesterday ──────", "────── Monday, June 2 ──────").
- Added `formatDateSeparator()` helper function.
- Message rendering now uses `React.Fragment` to include date separators inline with messages.

### 4. Bank & Investment Account Linking

**Files created:**

- `backend/linked_accounts.py` — Full CRUD API for linked financial accounts

**Files modified:**

- `backend/main.py` — Registered accounts router and DB init
- `frontend/app/dashboard/account/page.tsx` — New "Linked Accounts" tab

#### Backend (`linked_accounts.py`)

- SQLite database (`accounts.db`) with `linked_accounts` table
- **18 supported institutions**: Chase, Bank of America, Wells Fargo, Fidelity, Vanguard, Schwab, TD Ameritrade, E\*TRADE, Robinhood, Coinbase, Marcus, Ally, Amex, Citi, USAA, Betterment, Wealthfront, SoFi
- **10 account types**: Checking, Savings, Credit Card, Mortgage, 401(k), Roth IRA, Brokerage, HSA, 529 Plan, Crypto
- Endpoints:
  - `GET /api/accounts` — List linked accounts
  - `POST /api/accounts` — Link a new account
  - `PATCH /api/accounts/{id}/balance` — Update balance
  - `DELETE /api/accounts/{id}` — Unlink account (soft delete)
  - `GET /api/accounts/institutions` — Available institutions catalog
  - `GET /api/accounts/types` — Available account types
  - `GET /api/accounts/summary` — Aggregated summary by type

#### Frontend (Account Page)

- New **"Linked Accounts"** tab (2nd position, with chain-link icon)
- **Summary cards** at top showing total balance and per-type breakdowns
- **Account list** with institution emoji, name, type, masked digits, balance, sync date
- **3-step link modal**:
  1. Search & select institution (searchable grid with logos)
  2. Choose account type (filtered by institution capabilities)
  3. Enter account details (name, last 4 digits, balance)
- Hover-reveal **unlink (trash)** button per account
- Security callout about bank-level read-only access

### 5. Speech-to-Text (OpenAI Whisper)

**Files created:**

- `backend/speech.py` — Whisper transcription endpoint

**Files modified:**

- `backend/main.py` — Registered speech router and Whisper model loading
- `backend/requirements.txt` — Added `openai-whisper>=20231117`
- `frontend/app/dashboard/chat/page.tsx` — Microphone button + recording

#### Backend (`speech.py`)

- Uses `openai-whisper` open-source package for local on-device transcription
- Loads the "base" model by default (configurable via `WHISPER_MODEL` env var)
- Endpoints:
  - `GET /api/speech/status` — Check if Whisper is available
  - `POST /api/speech/transcribe` — Upload audio, get text back
- Accepts: wav, mp3, m4a, webm, ogg, flac formats
- Temporary file handling with automatic cleanup

#### Frontend (Chat Page)

- **Microphone button** next to the send button in both input bars (active chat + empty state)
- Three states:
  - **Idle** — Gray mic icon, click to start recording
  - **Recording** — Red pulsing button with MicOff icon, click to stop
  - **Transcribing** — Spinning loader, placeholder shows "Transcribing..."
- Uses browser `MediaRecorder` API to capture audio as WebM
- Transcribed text is appended to the input field, preserving existing text
- Graceful degradation: if Whisper isn't installed, the button still shows but backend returns 503

---

## Technical Details

### New Dependencies

- `openai-whisper>=20231117` (Python, backend) — OpenAI's open-source speech recognition model

### New Database

- `backend/accounts.db` — SQLite database for linked financial accounts

### Schema Changes

- `conversation_members.position` — New INTEGER column (default 0) for per-user conversation ordering. Migration is handled automatically at startup.

### New Icons Used (lucide-react)

- `Trash2`, `GripVertical` — Chat sidebar delete/drag
- `Mic`, `MicOff` — Speech recording
- `Link2`, `Plus`, `Building`, `CreditCard`, `RefreshCw`, `Search` — Linked accounts

---

## File Change Summary

| File                                      | Action      | Description                                                              |
| ----------------------------------------- | ----------- | ------------------------------------------------------------------------ |
| `frontend/components/Sidebar.tsx`         | Modified    | Clickable avatar (photo upload) + name → account link                    |
| `frontend/app/dashboard/chat/page.tsx`    | Modified    | Timestamps, date separators, drag-reorder, delete in sidebar, mic button |
| `frontend/app/dashboard/account/page.tsx` | Modified    | New "Linked Accounts" tab with full CRUD UI                              |
| `backend/chat/models.py`                  | Modified    | Position column, reorder function                                        |
| `backend/chat/router.py`                  | Modified    | Reorder endpoint                                                         |
| `backend/linked_accounts.py`              | **Created** | Full linked accounts API                                                 |
| `backend/speech.py`                       | **Created** | Whisper speech-to-text API                                               |
| `backend/main.py`                         | Modified    | Registered new routers + DB init                                         |
| `backend/requirements.txt`                | Modified    | Added openai-whisper                                                     |
| `docs/SESSION_016.md`                     | **Created** | This file                                                                |
