# Paloor — AWS Production Infrastructure

> **Definitive Reference** | Created: March 19, 2026
> Every service, every byte of storage, every network path, every scaling trigger.
> Nothing omitted.

---

## Table of Contents

1. [What Exists Today](#1-what-exists-today)
2. [Target Architecture Overview](#2-target-architecture-overview)
3. [Network Layer (VPC)](#3-network-layer)
4. [Compute Layer (ECS Fargate)](#4-compute-layer)
5. [Database Layer (RDS PostgreSQL + pgvector)](#5-database-layer)
6. [Object Storage (S3)](#6-object-storage)
7. [Cache Layer (ElastiCache Redis)](#7-cache-layer)
8. [Background Jobs & Queues (SQS + ECS)](#8-background-jobs--queues)
9. [Scheduled Data Pipelines (EventBridge)](#9-scheduled-data-pipelines)
10. [WebSocket & Real-Time](#10-websocket--real-time)
11. [Email (SES)](#11-email)
12. [Speech-to-Text](#12-speech-to-text)
13. [DNS, SSL & CDN](#13-dns-ssl--cdn)
14. [Security](#14-security)
15. [CI/CD Pipeline](#15-cicd-pipeline)
16. [Monitoring & Observability](#16-monitoring--observability)
17. [Disaster Recovery & Backups](#17-disaster-recovery--backups)
18. [Code Changes Required](#18-code-changes-required)
19. [Cost Projections](#19-cost-projections)
20. [Scaling Strategy](#20-scaling-strategy)
21. [Migration Playbook](#21-migration-playbook)
22. [Future-Proofing](#22-future-proofing)

---

## 1. What Exists Today

### 1.1 Applications (4 services)

| Service | Framework | Port | Purpose |
|---------|-----------|------|---------|
| Main Backend | FastAPI (Python) | 8000 | User API + WebSocket (/ws/chat) |
| Admin Backend | FastAPI (Python) | 8001 | Internal admin API |
| Main Frontend | Next.js 16 (React 19) | 3000 | User-facing SPA |
| Admin Frontend | Next.js 16 (React 19) | 3001 | Admin dashboard |

### 1.2 Databases (7 total — 6 SQLite + 1 PostgreSQL)

| Database | Engine | Size | Tables | Purpose |
|----------|--------|------|--------|---------|
| PostgreSQL | Postgres 15 (Docker) | Small | users, assets, asset_documents, account_documents | ORM-managed app data |
| users.db | SQLite WAL | ~1 MB | users | Auth, profiles, preferences, risk tolerance |
| chat.db | SQLite WAL | ~5 MB | conversations, conversation_members, messages, attachments, user_contexts, chat_folders, chat_folder_items | Chat persistence (7 indexes) |
| memory.db | SQLite WAL | ~10 MB | memories, document_chunks | AI memory system with 3072-dim embeddings as BLOBs |
| accounts.db | SQLite WAL | ~1 MB | linked_accounts | Connected financial institutions |
| equities.db | SQLite WAL | ~200 MB | companies, financials, price_history, stock_news, event_summaries, analysis_cache | S&P 500 market data (6 indexes) |
| admin.db | SQLite WAL | ~1 MB | admin_users, crm_notes, revenue_entries | Admin management data |

### 1.3 File Storage (all local disk — `uploads/` directory)

| Path | Contents | Write Source |
|------|----------|-------------|
| `uploads/` | Asset/account documents (`doc_<UUID>.<ext>`) | `assets/service.py → _save_file()` |
| `uploads/*.json` | Document metadata sidecars (raw_text, extracted_fields, file_path) | `assets/service.py → save_document_json()` |
| `uploads/photos/` | User profile photos (`<user_id>.<ext>`) | `auth_router.py → POST /api/auth/photo` |
| `uploads/chat/` | Chat message attachments (images, docs, files) | `chat/service.py → save_attachment()` |

### 1.4 External APIs

| Service | Purpose | Rate Limit | Cost |
|---------|---------|------------|------|
| Google Gemini API | LLM generation (gemma-3-27b-it → gemma-3-12b-it → gemini-2.0-flash cascade) | 10 req/sec embeddings | ~$0.50/1M tokens |
| Google Gemini Embeddings | Text embedding (gemini-embedding-001, 3072 dims) | 10 req/sec | Included |
| SEC EDGAR API | Company financials (XBRL JSON) | 8 req/sec (self-throttled) | Free |
| Yahoo Finance (yfinance) | Stock prices (daily OHLCV) | Unofficial, rate varies | Free |
| DuckDuckGo Search | News article scraping | Informal, 1.5s delay enforced | Free |
| Gmail SMTP | Email verification codes | Standard Gmail limits | Free |

### 1.5 Compute-Intensive Operations

| Operation | Library | Resource Profile | Trigger |
|-----------|---------|-------------------|---------|
| Markov regime switching | statsmodels MarkovRegression | CPU-heavy, 1-5s per stock | User views stock detail |
| Efficient frontier | PyPortfolioOpt, scipy, numpy | CPU-moderate | User views portfolio |
| OCR processing | pytesseract, Pillow, PyMuPDF | CPU-heavy per document | User uploads document |
| Whisper speech-to-text | openai-whisper (local model) | CPU-heavy, needs ~2GB RAM | User records audio |
| Embedding generation | Gemini API (3072-dim) | Network I/O, batched 100 | Document vectorization |
| News pipeline | DuckDuckGo + Gemini LLM | Network + LLM, 5-30s per event | User clicks stock event |
| EDGAR bulk fetch | SEC EDGAR API | Network I/O, 503 companies | Admin triggers seed |
| Batch price sync | yfinance | Network I/O, 503 tickers | Admin triggers sync |

### 1.6 Real-Time Features

| Feature | Protocol | Implementation |
|---------|----------|----------------|
| AI chat streaming | WebSocket | Token-by-token LLM response to connected client |
| Group messages | WebSocket | Broadcast to all room members |
| AI nudges | WebSocket | Private AI suggestions (5-min throttle per group) |
| Typing indicators | WebSocket | Broadcast typing status |
| Background job polling | HTTP polling | `/api/equities/v2/job-status/{id}` every 2s |

### 1.7 Auth Systems

| System | Secret | Algorithm | Expiry | Storage |
|--------|--------|-----------|--------|---------|
| User JWT | `jwt_secret_key` (hardcoded dev value) | HS256 | 24 hours | Bearer header |
| Admin JWT | `admin_jwt_secret` (hardcoded dev value) | HS256 | 8 hours | Bearer header |
| Passwords | bcrypt (CryptContext) | bcrypt | N/A | Hashed in DB |
| Email codes | In-memory dict | 6-digit random | 15 minutes | Ephemeral |
| WebSocket auth | JWT token | HS256 | Same as user JWT | Query param `?token=` |

### 1.8 Hardcoded Values That Must Change

| Location | Current Value | Production Replacement |
|----------|---------------|----------------------|
| Frontend (every page) | `http://localhost:8000` | `NEXT_PUBLIC_API_URL` env var |
| Frontend chat page | `ws://localhost:8000/ws/chat` | `NEXT_PUBLIC_WS_URL` env var |
| Admin frontend auth.tsx | `http://localhost:8001` | `NEXT_PUBLIC_ADMIN_API_URL` env var |
| Backend config.py | `cors_origins: ["http://localhost:3000"]` | `CORS_ORIGINS` env var (list) |
| Backend config.py | `jwt_secret_key: "paloor-dev-secret-key..."` | Secrets Manager |
| Backend config.py | `database_url: "postgresql://...@localhost:5432/..."` | Secrets Manager |
| Backend config.py | `upload_dir: "uploads"` | S3 bucket reference |
| Admin backend config.py | `cors_origins: ["http://localhost:3001"]` | `CORS_ORIGINS` env var |
| Admin backend config.py | `admin_jwt_secret` | Secrets Manager |
| Admin backend users.py | Hardcoded paths to `../backend/*.db` | RDS connection string |

---

## 2. Target Architecture Overview

```
                         ┌─────────────────────────────┐
                         │        CLOUDFLARE            │
                         │  DNS + DDoS + Edge Cache     │
                         │                              │
                         │  app.paloor.com  ─────────┐  │
                         │  api.paloor.com  ───────┐ │  │
                         │  admin.paloor.com ────┐ │ │  │
                         │  admin-api.paloor.com ┐│ │ │  │
                         └───────────────────────┼┼─┼─┼──┘
                                                 ││ │ │
                         ┌───────────────────────┼┼─┼─┼──┐
                         │        AWS VPC         ││ │ │  │
                         │  ┌─────────────────────┼┼─┼─┼┐│
                         │  │   PUBLIC SUBNETS     ││ │ │││
                         │  │                      ││ │ │││
                         │  │   ┌──────────────────┼┼─┼─┼┤│
                         │  │   │       ALB         ││ │ │││
                         │  │   │  (HTTPS :443)     ││ │ │││
                         │  │   │  WebSocket-aware   ├┘ │ │││
                         │  │   └────┬──┬──┬──┬────┘   │ │││
                         │  │        │  │  │  │         │ │││
                         │  │   NAT Gateway ────────────┘ │││
                         │  └────────┼──┼──┼──┼───────────┘││
                         │  ┌────────┼──┼──┼──┼────────────┘│
                         │  │ PRIVATE SUBNETS                │
                         │  │                                │
                         │  │  ┌─────────────────────────┐  │
                         │  │  │    ECS FARGATE CLUSTER    │  │
                         │  │  │                           │  │
                         │  │  │  ┌──────────┐ ┌────────┐ │  │
                         │  │  │  │  Main     │ │ Admin  │ │  │
                         │  │  │  │  Backend  │ │Backend │ │  │
                         │  │  │  │ (FastAPI) │ │(FastAPI)│ │  │
                         │  │  │  │  +WS      │ │        │ │  │
                         │  │  │  └──────────┘ └────────┘ │  │
                         │  │  │  ┌──────────┐ ┌────────┐ │  │
                         │  │  │  │  Main     │ │ Admin  │ │  │
                         │  │  │  │ Frontend  │ │Frontend│ │  │
                         │  │  │  │ (Next.js) │ │(Next.js│ │  │
                         │  │  │  └──────────┘ └────────┘ │  │
                         │  │  │  ┌──────────────────────┐│  │
                         │  │  │  │     WORKER TASKS      ││  │
                         │  │  │  │ OCR · Vectorization   ││  │
                         │  │  │  │ News · EDGAR · Prices ││  │
                         │  │  │  └──────────────────────┘│  │
                         │  │  └───────────────────────────┘  │
                         │  │                                  │
                         │  │  ┌────────┐  ┌──────────────┐   │
                         │  │  │  RDS    │  │ ElastiCache  │   │
                         │  │  │Postgres │  │    Redis     │   │
                         │  │  │+pgvector│  │              │   │
                         │  │  └────────┘  └──────────────┘   │
                         │  └──────────────────────────────────┘
                         │                                      │
                         │  ┌──────────────────────────────┐   │
                         │  │           S3 BUCKETS          │   │
                         │  │  paloor-uploads-prod          │   │
                         │  │  paloor-backups-prod          │   │
                         │  └──────────────────────────────┘   │
                         │                                      │
                         │  ┌──────────────────────────────┐   │
                         │  │      SQS QUEUES               │   │
                         │  │  document-processing          │   │
                         │  │  news-pipeline                │   │
                         │  │  memory-capture               │   │
                         │  │  email-verification           │   │
                         │  └──────────────────────────────┘   │
                         │                                      │
                         │  ┌──────────────────────────────┐   │
                         │  │    SECRETS MANAGER             │   │
                         │  │  paloor/prod/db-credentials    │   │
                         │  │  paloor/prod/jwt-secrets       │   │
                         │  │  paloor/prod/gemini-api-key    │   │
                         │  │  paloor/prod/gmail-credentials │   │
                         │  └──────────────────────────────┘   │
                         └──────────────────────────────────────┘
```

---

## 3. Network Layer

### 3.1 VPC Configuration

| Component | Configuration |
|-----------|---------------|
| **VPC CIDR** | `10.0.0.0/16` (65,536 IPs) |
| **Region** | `us-east-1` (cheapest, closest to SEC EDGAR servers) |
| **Availability Zones** | `us-east-1a`, `us-east-1b` (2 AZs for HA) |

### 3.2 Subnets

| Subnet | AZ | CIDR | Purpose |
|--------|----|------|---------|
| public-1a | us-east-1a | `10.0.1.0/24` | ALB, NAT Gateway |
| public-1b | us-east-1b | `10.0.2.0/24` | ALB (multi-AZ) |
| private-1a | us-east-1a | `10.0.10.0/24` | ECS tasks, RDS primary |
| private-1b | us-east-1b | `10.0.11.0/24` | ECS tasks, RDS standby |
| data-1a | us-east-1a | `10.0.20.0/24` | RDS, ElastiCache (isolated) |
| data-1b | us-east-1b | `10.0.21.0/24` | RDS, ElastiCache (isolated) |

### 3.3 Gateways

| Component | Purpose |
|-----------|---------|
| **Internet Gateway** | ALB inbound traffic |
| **NAT Gateway** (1, in public-1a) | ECS outbound to Gemini API, EDGAR, yfinance, DuckDuckGo |

> **Cost note:** NAT Gateway costs ~$32/mo + data processing. At Phase 1, use a single NAT in one AZ. Add a second NAT in 1b for HA at Phase 2.

### 3.4 VPC Endpoints (reduce NAT costs)

| Endpoint | Type | Saves |
|----------|------|-------|
| `com.amazonaws.us-east-1.s3` | Gateway | All S3 traffic bypasses NAT (free) |
| `com.amazonaws.us-east-1.ecr.dkr` | Interface | Docker image pulls bypass NAT |
| `com.amazonaws.us-east-1.ecr.api` | Interface | ECR API calls bypass NAT |
| `com.amazonaws.us-east-1.logs` | Interface | CloudWatch log shipping bypasses NAT |
| `com.amazonaws.us-east-1.secretsmanager` | Interface | Secret fetches bypass NAT |
| `com.amazonaws.us-east-1.sqs` | Interface | Queue operations bypass NAT |

### 3.5 Security Groups

| SG Name | Inbound Rules | Used By |
|---------|---------------|---------|
| `sg-alb` | 443 from `0.0.0.0/0` (HTTPS only) | ALB |
| `sg-ecs` | 8000, 8001, 3000, 3001 from `sg-alb` | ECS tasks |
| `sg-rds` | 5432 from `sg-ecs` | RDS |
| `sg-redis` | 6379 from `sg-ecs` | ElastiCache |
| `sg-vpc-endpoints` | 443 from `10.0.0.0/16` | VPC Endpoints |

---

## 4. Compute Layer

### 4.1 ECS Cluster

- **Cluster name:** `paloor-prod`
- **Launch type:** Fargate (serverless, no EC2 management)
- **Container Insights:** Enabled (CloudWatch metrics per task)

### 4.2 ECR Repositories (5)

| Repository | Source |
|------------|--------|
| `paloor/main-backend` | `backend/Dockerfile` |
| `paloor/admin-backend` | `admin-backend/Dockerfile` |
| `paloor/main-frontend` | `frontend/Dockerfile` |
| `paloor/admin-frontend` | `admin-frontend/Dockerfile` |
| `paloor/worker` | `backend/Dockerfile.worker` |

### 4.3 Task Definitions

#### Main Backend

| Setting | Value | Rationale |
|---------|-------|-----------|
| **CPU** | 1024 (1 vCPU) | WebSocket connections + Markov computation + LLM streaming |
| **Memory** | 2048 MB | Whisper model (~1GB), numpy arrays, concurrent requests |
| **Port** | 8000 | FastAPI + WebSocket |
| **Health check** | `GET /` → `{"status": "ok"}` | Existing endpoint |
| **Desired count** | 2 (Phase 1), 4+ (Phase 2) | HA across 2 AZs |
| **Auto-scaling** | Target CPU 60%, min 2, max 10 | Scale on compute load |

**Environment variables:**
```
DATABASE_URL          → Secrets Manager ARN
JWT_SECRET_KEY        → Secrets Manager ARN
GEMINI_API_KEY        → Secrets Manager ARN
GMAIL_ADDRESS         → Secrets Manager ARN
GMAIL_APP_PASSWORD    → Secrets Manager ARN
CORS_ORIGINS          → "https://app.paloor.com"
UPLOAD_BUCKET         → "paloor-uploads-prod"
UPLOAD_PREFIX         → "documents"
REDIS_URL             → ElastiCache endpoint
SQS_DOCUMENT_QUEUE    → SQS queue URL
SQS_MEMORY_QUEUE      → SQS queue URL
AWS_REGION            → "us-east-1"
ENVIRONMENT           → "production"
```

#### Admin Backend

| Setting | Value | Rationale |
|---------|-------|-----------|
| **CPU** | 256 (0.25 vCPU) | Low traffic, read-heavy queries |
| **Memory** | 512 MB | Standard |
| **Port** | 8001 | FastAPI |
| **Desired count** | 1 | Internal tool, single instance sufficient |
| **Auto-scaling** | None (Phase 1) | Low traffic |

**Environment variables:**
```
DATABASE_URL          → Secrets Manager (same RDS, different schema)
ADMIN_JWT_SECRET      → Secrets Manager ARN
CORS_ORIGINS          → "https://admin.paloor.com"
ENVIRONMENT           → "production"
```

#### Main Frontend

| Setting | Value | Rationale |
|---------|-------|-----------|
| **CPU** | 512 (0.5 vCPU) | Next.js SSR |
| **Memory** | 1024 MB | React rendering |
| **Port** | 3000 | Next.js |
| **Desired count** | 2 | HA |
| **Auto-scaling** | Target CPU 70%, min 2, max 8 | Scale on user load |

**Environment variables (build-time):**
```
NEXT_PUBLIC_API_URL   → "https://api.paloor.com"
NEXT_PUBLIC_WS_URL    → "wss://api.paloor.com/ws/chat"
```

#### Admin Frontend

| Setting | Value | Rationale |
|---------|-------|-----------|
| **CPU** | 256 (0.25 vCPU) | Low traffic |
| **Memory** | 512 MB | Standard |
| **Port** | 3001 | Next.js |
| **Desired count** | 1 | Internal tool |

**Environment variables (build-time):**
```
NEXT_PUBLIC_ADMIN_API_URL → "https://admin-api.paloor.com"
```

#### Worker (Background Processing)

| Setting | Value | Rationale |
|---------|-------|-----------|
| **CPU** | 1024 (1 vCPU) | OCR, vectorization, news pipeline, EDGAR fetches |
| **Memory** | 3072 MB | Whisper model + pytesseract + numpy + pandas |
| **Port** | None (no inbound traffic) | SQS consumer only |
| **Desired count** | 1 (Phase 1), 2-4 (Phase 2) | Scale with document volume |
| **Auto-scaling** | SQS queue depth > 10, min 1, max 6 | Scale on backlog |

**What the worker processes:**
- Document OCR → field extraction → save metadata to RDS → upload file to S3
- Document vectorization → chunk text → generate embeddings → store in RDS (pgvector)
- Memory capture → extract facts from conversations → embed → store
- News pipeline → scrape DuckDuckGo → rank via Gemini → summarize → store
- EDGAR financial data fetches → parse XBRL → store in RDS
- Batch price updates → yfinance → upsert to RDS
- Email verification codes → send via SES

### 4.4 ALB Configuration

| Setting | Value |
|---------|-------|
| **Type** | Application Load Balancer |
| **Scheme** | Internet-facing |
| **Listeners** | HTTPS :443 only (redirect HTTP :80 → :443) |
| **Certificate** | ACM cert for `*.paloor.com` |
| **Idle timeout** | 3600 seconds (for WebSocket connections) |
| **Stickiness** | Enabled on main-backend target group (WebSocket affinity) |

**Listener rules (path-based + Host-based routing):**

| Priority | Condition | Target Group |
|----------|-----------|--------------|
| 1 | Host: `api.paloor.com`, Path: `/ws/*` | main-backend (WebSocket) |
| 2 | Host: `api.paloor.com` | main-backend |
| 3 | Host: `admin-api.paloor.com` | admin-backend |
| 4 | Host: `app.paloor.com` | main-frontend |
| 5 | Host: `admin.paloor.com` | admin-frontend |

**Target groups:**

| Name | Port | Health Check | Deregistration Delay |
|------|------|-------------|---------------------|
| `tg-main-backend` | 8000 | `GET /` interval 30s | 120s (drain WebSocket) |
| `tg-admin-backend` | 8001 | `GET /` interval 60s | 30s |
| `tg-main-frontend` | 3000 | `GET /` interval 30s | 30s |
| `tg-admin-frontend` | 3001 | `GET /` interval 60s | 30s |

---

## 5. Database Layer

### 5.1 RDS PostgreSQL + pgvector

All 7 databases consolidated into one RDS PostgreSQL instance with the `pgvector` extension for embedding storage.

| Setting | Phase 1 | Phase 2 | Phase 3 |
|---------|---------|---------|---------|
| **Instance** | `db.t3.medium` | `db.r6g.large` | `db.r6g.xlarge` |
| **vCPU / RAM** | 2 / 4 GB | 2 / 16 GB | 4 / 32 GB |
| **Storage** | 50 GB gp3 | 200 GB gp3 | 500 GB gp3 |
| **Multi-AZ** | No | Yes | Yes |
| **Read replicas** | 0 | 1 (analytics) | 2 |
| **Backup retention** | 7 days | 14 days | 30 days |
| **Engine** | PostgreSQL 15 | PostgreSQL 15 | PostgreSQL 16 |
| **Extensions** | pgvector, pg_trgm | + pg_stat_statements | + pg_partman |

### 5.2 Schema Design (PostgreSQL migration from SQLite)

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- SCHEMA: auth (from users.db)
-- ============================================================
CREATE SCHEMA auth;

CREATE TABLE auth.users (
    id              TEXT PRIMARY KEY,            -- "user_<uuid>"
    email           TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    hashed_password TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    email_verified  BOOLEAN DEFAULT FALSE,
    profile_completed BOOLEAN DEFAULT FALSE,
    age             INTEGER,
    gender          TEXT,
    occupation      TEXT,
    annual_income   TEXT,
    net_worth_estimate TEXT,
    financial_goals JSONB DEFAULT '[]',
    risk_tolerance  TEXT,
    abstraction_level TEXT DEFAULT 'beginner',
    dependents      INTEGER,
    state           TEXT,
    photo_path      TEXT                         -- S3 key (photos/<user_id>.<ext>)
);

-- ============================================================
-- SCHEMA: assets (from PostgreSQL ORM models.py)
-- ============================================================
CREATE SCHEMA assets;

CREATE TABLE assets.assets (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES auth.users(id),
    asset_class     TEXT NOT NULL,
    name            TEXT NOT NULL,
    details         JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE assets.asset_documents (
    id              SERIAL PRIMARY KEY,
    asset_id        TEXT REFERENCES assets.assets(id),
    doc_key         TEXT NOT NULL,
    filename        TEXT,
    raw_text        TEXT,
    extracted_fields JSONB DEFAULT '[]',
    file_path       TEXT,                        -- S3 key
    uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE assets.account_documents (
    id              SERIAL PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES auth.users(id),
    doc_key         TEXT NOT NULL,
    filename        TEXT,
    raw_text        TEXT,
    extracted_fields JSONB DEFAULT '[]',
    file_path       TEXT,                        -- S3 key
    uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SCHEMA: chat (from chat.db)
-- ============================================================
CREATE SCHEMA chat;

CREATE TABLE chat.conversations (
    id              TEXT PRIMARY KEY,
    type            TEXT NOT NULL CHECK (type IN ('ai_private', 'group')),
    name            TEXT,
    description     TEXT,
    category        TEXT,
    created_by      TEXT REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    avatar_url      TEXT,
    is_archived     BOOLEAN DEFAULT FALSE,
    last_message_at TIMESTAMPTZ,
    metadata        JSONB DEFAULT '{}'
);

CREATE TABLE chat.conversation_members (
    conversation_id TEXT REFERENCES chat.conversations(id),
    user_id         TEXT,
    role            TEXT CHECK (role IN ('admin', 'member')),
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    ai_nudge_enabled BOOLEAN DEFAULT TRUE,
    position        INTEGER DEFAULT 0,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE chat.messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES chat.conversations(id),
    sender_id       TEXT,
    sender_name     TEXT,
    content         TEXT,
    reply_to        TEXT,
    is_ai_generated BOOLEAN DEFAULT FALSE,
    is_private_nudge BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    edited_at       TIMESTAMPTZ,
    metadata        JSONB DEFAULT '{}'
);

CREATE TABLE chat.attachments (
    id              TEXT PRIMARY KEY,
    message_id      TEXT REFERENCES chat.messages(id),
    type            TEXT,
    filename        TEXT,
    mime_type       TEXT,
    file_path       TEXT,                        -- S3 key (chat/<uuid>.<ext>)
    size            INTEGER,
    thumbnail_path  TEXT
);

CREATE TABLE chat.user_contexts (
    user_id         TEXT PRIMARY KEY REFERENCES auth.users(id),
    context         JSONB DEFAULT '{}',
    summary         TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat.folders (
    id              TEXT PRIMARY KEY,
    user_id         TEXT REFERENCES auth.users(id),
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat.folder_items (
    folder_id       TEXT REFERENCES chat.folders(id),
    conversation_id TEXT REFERENCES chat.conversations(id),
    PRIMARY KEY (folder_id, conversation_id)
);

CREATE INDEX idx_chat_messages_conv ON chat.messages(conversation_id, created_at);
CREATE INDEX idx_chat_members_user ON chat.conversation_members(user_id);
CREATE INDEX idx_chat_conv_type ON chat.conversations(type);

-- ============================================================
-- SCHEMA: memory (from memory.db)
-- ============================================================
CREATE SCHEMA memory;

CREATE TABLE memory.memories (
    id              SERIAL PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES auth.users(id),
    category        TEXT NOT NULL,
    content         TEXT NOT NULL,
    source          TEXT,
    source_id       TEXT,
    importance      REAL DEFAULT 0.5,
    embedding       vector(3072),                -- pgvector instead of BLOB
    access_count    INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    is_active       BOOLEAN DEFAULT TRUE
);

CREATE TABLE memory.document_chunks (
    id              SERIAL PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES auth.users(id),
    document_id     TEXT NOT NULL,
    document_type   TEXT,
    chunk_index     INTEGER NOT NULL,
    content         TEXT NOT NULL,
    embedding       vector(3072),                -- pgvector instead of BLOB
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memory_user ON memory.memories(user_id, is_active);
CREATE INDEX idx_memory_category ON memory.memories(user_id, category);
CREATE INDEX idx_chunks_doc ON memory.document_chunks(user_id, document_id);

-- pgvector indexes (IVFFlat for approximate nearest neighbor)
CREATE INDEX idx_memory_embedding ON memory.memories
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_chunks_embedding ON memory.document_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- SCHEMA: accounts (from accounts.db)
-- ============================================================
CREATE SCHEMA accounts;

CREATE TABLE accounts.linked_accounts (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES auth.users(id),
    institution     TEXT NOT NULL,
    account_type    TEXT NOT NULL,
    account_name    TEXT,
    mask            TEXT,                         -- last 4 digits
    balance         NUMERIC(15,2),
    currency        TEXT DEFAULT 'USD',
    subtype         TEXT,
    linked_at       TIMESTAMPTZ DEFAULT NOW(),
    last_synced     TIMESTAMPTZ,
    status          TEXT DEFAULT 'active',
    metadata        JSONB DEFAULT '{}'
);

-- ============================================================
-- SCHEMA: equities (from equities.db, ~200MB)
-- ============================================================
CREATE SCHEMA equities;

CREATE TABLE equities.companies (
    ticker          TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    cik             TEXT,
    sector          TEXT,
    industry        TEXT,
    exchange        TEXT,
    market_cap      REAL,
    is_active       BOOLEAN DEFAULT TRUE,
    last_price_update TIMESTAMPTZ,
    last_filing_update TIMESTAMPTZ
);

CREATE TABLE equities.financials (
    id              SERIAL PRIMARY KEY,
    ticker          TEXT NOT NULL REFERENCES equities.companies(ticker),
    period_end      DATE NOT NULL,
    period_type     TEXT CHECK (period_type IN ('annual', 'quarterly')),
    statement       TEXT CHECK (statement IN ('income', 'balance', 'cashflow')),
    metric          TEXT NOT NULL,
    value           NUMERIC,
    unit            TEXT,
    source          TEXT DEFAULT 'EDGAR',
    filed           DATE,
    UNIQUE (ticker, period_end, period_type, statement, metric)
);

CREATE TABLE equities.price_history (
    ticker          TEXT NOT NULL REFERENCES equities.companies(ticker),
    date            DATE NOT NULL,
    open            NUMERIC, high NUMERIC, low NUMERIC,
    close           NUMERIC, adj_close NUMERIC,
    volume          BIGINT,
    PRIMARY KEY (ticker, date)
);

CREATE TABLE equities.stock_news (
    id              SERIAL PRIMARY KEY,
    ticker          TEXT NOT NULL,
    event_date      DATE NOT NULL,
    event_type      TEXT CHECK (event_type IN ('zscore', 'regime_shift')),
    title           TEXT,
    snippet         TEXT,
    url             TEXT,
    publisher       TEXT,
    article_date    DATE,
    search_query    TEXT,
    relevance_window TEXT CHECK (relevance_window IN ('before', 'after')),
    relevance_score REAL,
    is_top_article  BOOLEAN DEFAULT FALSE,
    fetched_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (ticker, event_date, url)
);

CREATE TABLE equities.event_summaries (
    id              SERIAL PRIMARY KEY,
    ticker          TEXT NOT NULL,
    event_date      DATE NOT NULL,
    event_type      TEXT,
    summary         TEXT,
    model_used      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (ticker, event_date, event_type)
);

CREATE TABLE equities.analysis_cache (
    ticker          TEXT NOT NULL,
    years           INTEGER NOT NULL,
    result_json     JSONB NOT NULL,
    price_count     INTEGER NOT NULL,
    last_price_date DATE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (ticker, years)
);

CREATE INDEX idx_eq_financials ON equities.financials(ticker, period_type, statement);
CREATE INDEX idx_eq_prices ON equities.price_history(ticker, date DESC);
CREATE INDEX idx_eq_news ON equities.stock_news(ticker, event_date);

-- ============================================================
-- SCHEMA: admin (from admin.db)
-- ============================================================
CREATE SCHEMA admin;

CREATE TABLE admin.users (
    id              TEXT PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    hashed_password TEXT NOT NULL,
    role            TEXT CHECK (role IN ('super_admin', 'employee')),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ
);

CREATE TABLE admin.crm_notes (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,                -- references auth.users(id)
    admin_id        TEXT REFERENCES admin.users(id),
    admin_name      TEXT,
    content         TEXT NOT NULL,
    note_type       TEXT DEFAULT 'general',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE admin.revenue_entries (
    id              TEXT PRIMARY KEY,
    category        TEXT NOT NULL,
    description     TEXT,
    amount          NUMERIC(15,2) NOT NULL,
    entry_type      TEXT CHECK (entry_type IN ('revenue', 'cost')),
    date            DATE NOT NULL,
    created_by      TEXT REFERENCES admin.users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.3 pgvector for Embeddings

Current memory system uses numpy cosine similarity over SQLite BLOBs. Migration to pgvector:

**Current code (memory/recall.py):**
```python
# Load ALL embeddings into memory, compute cosine similarity with numpy
rows = get_all_memory_embeddings(db, user_id)
for row in rows:
    vec = np.frombuffer(row["embedding"], dtype=np.float32)
    sim = float(np.dot(query_vec, vec))
```

**Production code (pgvector):**
```sql
-- Single query replaces entire numpy loop
SELECT id, content, category, importance,
       1 - (embedding <=> $1::vector) AS similarity
FROM memory.memories
WHERE user_id = $2 AND is_active = TRUE
  AND 1 - (embedding <=> $1::vector) > 0.35
ORDER BY (0.7 * (1 - (embedding <=> $1::vector))) + (0.3 * importance) DESC
LIMIT 10;
```

**Benefits:**
- No loading all embeddings into memory per query
- Index-accelerated approximate nearest neighbor search
- Scales to millions of memories without RAM pressure
- Atomic updates (no stale in-memory vectors)

---

## 6. Object Storage

### 6.1 S3 Bucket: `paloor-uploads-prod`

**Every file the application writes to disk today must go to S3 in production.**

| Prefix | Source Code | Content | Access Pattern |
|--------|------------|---------|----------------|
| `photos/{user_id}.{ext}` | `auth_router.py` POST `/api/auth/photo` | User profile photos (JPEG/PNG/WebP) | Public-read via pre-signed URL (24h) |
| `documents/{doc_id}.{ext}` | `assets/service.py` `_save_file()` | Uploaded PDFs, images, scanned docs | Private, pre-signed URL (1h) on download |
| `documents-meta/{doc_id}.json` | `assets/service.py` `save_document_json()` | OCR results, extracted fields, metadata | Internal only (worker → backend) |
| `chat/{uuid}.{ext}` | `chat/service.py` `save_attachment()` | Chat message attachments (images, docs, files) | Private, pre-signed URL (1h) |
| `whisper-temp/{uuid}.wav` | `speech.py` | Temporary audio files for transcription | Auto-delete lifecycle rule (1 day) |

**Bucket configuration:**
```json
{
  "Versioning": "Enabled",
  "Encryption": "SSE-S3 (AES-256)",
  "PublicAccess": "Block ALL public access",
  "CORS": [
    {
      "AllowedOrigins": ["https://app.paloor.com"],
      "AllowedMethods": ["GET", "PUT"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }
  ],
  "LifecycleRules": [
    {
      "Prefix": "whisper-temp/",
      "Expiration": "1 day"
    },
    {
      "Prefix": "documents/",
      "Transition": "STANDARD_IA after 90 days, GLACIER after 365 days"
    }
  ]
}
```

**IAM policy for ECS tasks:**
```json
{
  "Effect": "Allow",
  "Action": [
    "s3:PutObject",
    "s3:GetObject",
    "s3:DeleteObject",
    "s3:ListBucket"
  ],
  "Resource": [
    "arn:aws:s3:::paloor-uploads-prod",
    "arn:aws:s3:::paloor-uploads-prod/*"
  ]
}
```

### 6.2 S3 Bucket: `paloor-backups-prod`

| Prefix | Content | Retention |
|--------|---------|-----------|
| `rds/` | RDS automated snapshot exports (weekly) | 90 days |
| `data-exports/` | User data export requests (GDPR/CCPA) | 30 days then delete |

### 6.3 Pre-Signed URL Flow

**Document upload (current flow → production flow):**

```
CURRENT:
  Client → POST /api/assets/{id}/documents/{key} (multipart)
  → Backend writes to uploads/doc_<uuid>.ext (local disk)
  → Backend writes uploads/doc_<uuid>.json (metadata sidecar)

PRODUCTION:
  Client → POST /api/assets/{id}/documents/{key} (multipart)
  → Backend receives file in memory
  → Backend uploads to S3: s3://paloor-uploads-prod/documents/{doc_id}.{ext}
  → Backend stores metadata in RDS (no more JSON sidecar files)
  → Backend returns S3 key in response
  → Worker picks up SQS message → runs OCR → updates RDS extracted_fields
```

**Document download:**
```
Client → GET /api/documents/{id}/download
→ Backend looks up S3 key in RDS
→ Backend generates pre-signed URL (1-hour expiry)
→ Returns 302 redirect to pre-signed URL (or returns URL in JSON)
```

**Photo serving:**
```
Client → GET /api/auth/photo/{user_id}
→ Backend generates pre-signed URL for photos/{user_id}.ext
→ Returns URL (cached 24h)
```

---

## 7. Cache Layer

### 7.1 ElastiCache Redis

| Setting | Phase 1 | Phase 2 |
|---------|---------|---------|
| **Node type** | `cache.t3.micro` | `cache.r6g.large` |
| **Cluster mode** | Disabled (single node) | Enabled (3 shards) |
| **Replicas** | 0 | 1 per shard |
| **Encryption** | In-transit + at-rest | Same |

### 7.2 What Gets Cached

| Key Pattern | TTL | Current Location | Purpose |
|-------------|-----|-----------------|---------|
| `session:{user_id}` | 24h | localStorage JWT | Server-side session validation |
| `rate:{ip}:{endpoint}` | 1 min | None (no rate limiting) | Rate limiting (5 auth, 20 AI, 200 general req/min) |
| `analysis:{ticker}:{years}` | 24h | equities.analysis_cache table | Markov regime results |
| `embed:{text_hash}` | 1h | In-memory `_embed_cache` (500 max) | Embedding API response cache |
| `ai_pref:{user_id}` | 5 min | In-memory `_ai_preferences` | Abstraction level, assistant mode |
| `job:{job_id}` | 1h | In-memory `_bg_jobs` dict | Background job status/progress |
| `email_code:{email}` | 15 min | In-memory `_verification_codes` | Email verification codes |
| `ws:rooms:{conv_id}` | Persistent | In-memory `ConnectionManager.rooms` | WebSocket room membership |
| `user:{user_id}:profile` | 5 min | Direct DB query | User profile for AI context injection |
| `companies:list` | 1h | Direct DB query | S&P 500 company list |

**Why Redis is non-optional:**
- In-memory dicts (`_bg_jobs`, `_verification_codes`, `_ai_preferences`, `_embed_cache`) are lost on container restart or deployment
- With multiple ECS tasks, in-memory state isn't shared across instances
- WebSocket `ConnectionManager.rooms` needs to be shared across backend instances for group messaging
- Rate limiting requires a shared counter across all instances

---

## 8. Background Jobs & Queues

### 8.1 SQS Queues

| Queue | Message Content | Consumer | Visibility Timeout |
|-------|----------------|----------|--------------------|
| `paloor-document-processing` | `{doc_id, user_id, s3_key, doc_type}` | Worker | 300s (OCR can take 5 min) |
| `paloor-document-vectorization` | `{doc_id, user_id, raw_text}` | Worker | 120s |
| `paloor-memory-capture` | `{user_id, conversation_id, exchange}` | Worker | 60s |
| `paloor-news-pipeline` | `{ticker, event_date, event_type}` | Worker | 180s |
| `paloor-email` | `{to, subject, body, code}` | Worker | 30s |
| `paloor-edgar-fetch` | `{ticker, cik}` | Worker | 120s |
| `paloor-price-sync` | `{tickers: [...]}` | Worker | 300s |

**Dead Letter Queues:** Each queue has a DLQ with `maxReceiveCount: 3` (retry 3 times, then move to DLQ for investigation).

### 8.2 Current In-Memory → SQS Migration

| Current Pattern | Problem | SQS Solution |
|----------------|---------|--------------|
| `threading.Thread(target=_vectorize_document, daemon=True)` | Lost on crash, can't distribute | Enqueue to `paloor-document-vectorization` |
| `asyncio.create_task(_async_capture_memory(...))` | Lost on restart, not shared | Enqueue to `paloor-memory-capture` |
| `asyncio.create_task(_async_summarize(...))` | Same | Part of memory-capture flow |
| `_bg_jobs[job_id] = {...}` (EDGAR/prices) | Lost on restart, not shared | Job status in Redis, work in SQS |
| `_verification_codes[email] = {...}` | Lost on restart, not shared | Store in Redis with TTL |
| Background thread for `fetch_all_sp500_financials()` | Can crash, no retry | Individual ticker messages to `paloor-edgar-fetch` |

### 8.3 Worker Architecture

```python
# Worker process (runs as separate ECS task)
# Polls SQS queues, processes messages

QUEUES = [
    ("paloor-document-processing", handle_document_processing),
    ("paloor-document-vectorization", handle_vectorization),
    ("paloor-memory-capture", handle_memory_capture),
    ("paloor-news-pipeline", handle_news_pipeline),
    ("paloor-email", handle_email),
    ("paloor-edgar-fetch", handle_edgar_fetch),
    ("paloor-price-sync", handle_price_sync),
]

# Long-polling with batch size 10
# Each handler:
#   1. Parse message
#   2. Do work (OCR, embedding, API call, etc.)
#   3. Write results to RDS/S3
#   4. Delete message from queue
#   5. On failure → message returns to queue after visibility timeout
```

---

## 9. Scheduled Data Pipelines

### 9.1 EventBridge Rules + ECS Scheduled Tasks

| Schedule | Job Name | What It Does | ECS Task Size |
|----------|----------|-------------|---------------|
| Daily 6:00 AM ET | `price-sync` | Enqueue all 503 tickers to `paloor-price-sync` | Worker task |
| Daily 7:00 AM ET | `compute-technicals` | Z-score, rolling returns, volatility for updated stocks | Worker task |
| Daily 8:00 AM ET | `regime-update` | Re-run Markov detection on stocks with new price data (invalidate cache) | Worker task |
| Daily 9:00 AM ET | `news-refresh` | Re-scrape news for stocks with events in last 7 days | Worker task |
| Weekly Sun 2:00 AM | `edgar-check` | Check for new SEC filings, enqueue new tickers | Worker task |
| Weekly Sun 3:00 AM | `edgar-fetch` | Process XBRL data for new filings | Worker task |
| Monthly 1st 00:00 | `cleanup` | Purge expired analysis cache, delete old whisper-temp files | Worker task |

### 9.2 Implementation

These run as **ECS Scheduled Tasks** triggered by EventBridge rules, not inside the main backend process. Each invocation:
1. EventBridge fires at schedule
2. ECS spins up a one-off Fargate task using the worker image
3. Task runs the specific job function
4. Task exits when done (pay only for compute used)

This replaces the current approach of background threads inside the FastAPI process, which are fragile and don't survive restarts.

---

## 10. WebSocket & Real-Time

### 10.1 Architecture

ALB natively supports WebSocket. The upgrade happens on the initial HTTP connection, then the connection persists.

**Current flow (single server):**
```
Client → ws://localhost:8000/ws/chat?token=JWT
→ Single ConnectionManager tracks all connections in memory
→ Broadcast = iterate over in-memory set
```

**Production flow (multiple backend instances):**
```
Client → wss://api.paloor.com/ws/chat?token=JWT
→ ALB routes to one of N backend instances (sticky session)
→ ConnectionManager tracks LOCAL connections
→ For cross-instance broadcast: Redis Pub/Sub
```

### 10.2 Redis Pub/Sub for WebSocket

When a message needs to be broadcast to a conversation room, members may be connected to different backend instances.

**Solution:** Redis Pub/Sub channels per conversation.

```python
# On message send:
redis.publish(f"chat:{conversation_id}", json.dumps(message_payload))

# Each backend instance subscribes to channels for its connected users:
async def redis_listener():
    pubsub = redis.pubsub()
    await pubsub.subscribe(*active_channels)
    async for msg in pubsub.listen():
        # Forward to local WebSocket connections
        await connection_manager.broadcast_local(msg)
```

### 10.3 ALB WebSocket Settings

| Setting | Value | Reason |
|---------|-------|--------|
| Idle timeout | 3600s | Keep connections alive during inactive periods |
| Stickiness | Enabled (target group, 1 day) | Same client reconnects to same backend instance |
| Health check | `/` (HTTP, not WS) | Standard health check |
| Deregistration delay | 120s | Allow graceful WebSocket drain on deployment |

---

## 11. Email

### 11.1 Migration: Gmail SMTP → Amazon SES

**Current:** `smtplib.SMTP_SSL("smtp.gmail.com", 465)` with app password.
**Problem:** Gmail limits sending to ~500/day, not designed for transactional email, credentials leak risk.

**Production: Amazon SES**

| Setting | Value |
|---------|-------|
| **Region** | us-east-1 |
| **Sending domain** | paloor.com (verified via DNS) |
| **From address** | noreply@paloor.com |
| **Configuration set** | paloor-prod (bounce/complaint tracking) |
| **Sandbox** | Request production access (removes recipient limits) |

**SES integrates with the worker via SQS:**
```
Backend → enqueue {to, code} to paloor-email queue
Worker → dequeue → SES send_email() → delete message
```

**Email types:**
1. Verification codes (6-digit, 15-min expiry)
2. Password reset (future)
3. Weekly portfolio digest (future)
4. Price alert notifications (future)

---

## 12. Speech-to-Text

### 12.1 Current: Whisper (Local)

- Model: `openai-whisper` "base" (~140MB download, ~1GB runtime RAM)
- Runs on same server as FastAPI
- Creates temp files, processes, cleans up

### 12.2 Production Options

| Option | Latency | Cost | RAM | Scaling |
|--------|---------|------|-----|---------|
| **Keep Whisper on Worker** | 3-10s | $0 (CPU only) | 2 GB | Worker task with higher memory |
| **AWS Transcribe** | 2-5s | $0.024/min | 0 | Fully managed, infinite scale |
| **Whisper on GPU (g4dn)** | 1-3s | ~$380/mo | 16 GB | Fast but expensive |

**Recommendation:**
- **Phase 1:** Keep Whisper on the worker task (1 vCPU / 3 GB). Low usage, acceptable latency.
- **Phase 2:** Switch to AWS Transcribe when volume justifies it. Drop the Whisper dependency entirely.

**S3 integration for speech:**
```
Client → POST /api/speech/transcribe (multipart audio)
→ Backend uploads to s3://paloor-uploads-prod/whisper-temp/{uuid}.wav
→ Enqueue to SQS (or call synchronously for UX)
→ Worker downloads from S3 → Whisper → return text → delete from S3
```

---

## 13. DNS, SSL & CDN

### 13.1 Domain Architecture

| Subdomain | Points To | Purpose |
|-----------|-----------|---------|
| `app.paloor.com` | ALB (CNAME) | Main user frontend |
| `api.paloor.com` | ALB (CNAME) | Main backend API + WebSocket |
| `admin.paloor.com` | ALB (CNAME) | Admin frontend |
| `admin-api.paloor.com` | ALB (CNAME) | Admin backend API |

### 13.2 Cloudflare Configuration

| Setting | Value | Reason |
|---------|-------|--------|
| **Proxy status** | Proxied (orange cloud) | DDoS protection, edge caching |
| **SSL/TLS mode** | Full (strict) | End-to-end encryption, validate ACM cert |
| **Min TLS version** | TLS 1.2 | Security baseline |
| **Always use HTTPS** | On | Force HTTPS |
| **HSTS** | On, max-age 31536000, includeSubDomains | Prevent downgrade attacks |
| **WebSocket** | Enabled (Pro plan or higher, or free for basic) | Required for `/ws/chat` |
| **Caching** | Development mode OFF, cache level Standard | Cache static assets |
| **Page rules** | `api.paloor.com/*` → Cache Level: Bypass | Don't cache API responses |
| **WAF** | Managed rules + OWASP Core Rule Set | Layer 7 protection |
| **Bot management** | Challenge mode for suspicious bots | Prevent scraping |

### 13.3 ACM Certificate

| Setting | Value |
|---------|-------|
| **Domain** | `*.paloor.com` (wildcard) |
| **Validation** | DNS validation via Cloudflare TXT record |
| **Region** | us-east-1 (must match ALB region) |
| **Auto-renewal** | Yes (ACM manages renewal) |

### 13.4 CDN Strategy

**Cloudflare serves as CDN** for:
- Next.js static assets (`/_next/static/*`) — edge cached globally
- Profile photos (via pre-signed URL, short cache)

**No separate CloudFront needed** — Cloudflare handles edge caching and DDoS. If you later need CloudFront for S3 signed URLs, add it then.

---

## 14. Security

### 14.1 Secrets Manager

| Secret Path | Contents |
|-------------|----------|
| `paloor/prod/database` | `{"host", "port", "dbname", "username", "password"}` |
| `paloor/prod/jwt` | `{"user_secret", "admin_secret"}` |
| `paloor/prod/gemini` | `{"api_key"}` |
| `paloor/prod/email` | `{"ses_region", "from_address"}` (SES uses IAM role, no password) |
| `paloor/prod/encryption` | `{"document_master_key"}` (for future client-side encryption) |

**Access:** ECS task roles reference secrets via ARN. Secrets injected as environment variables at container start. Rotation policy: 90 days.

### 14.2 IAM Roles

| Role | Attached To | Permissions |
|------|-------------|-------------|
| `paloor-ecs-execution-role` | All ECS tasks | ECR pull, CloudWatch logs, Secrets Manager read |
| `paloor-backend-task-role` | Main backend tasks | S3 read/write, SQS send, Secrets Manager read, SES send |
| `paloor-admin-task-role` | Admin backend tasks | Secrets Manager read (DB only, no S3/SQS) |
| `paloor-frontend-task-role` | Frontend tasks | None (no AWS service access needed) |
| `paloor-worker-task-role` | Worker tasks | S3 read/write, SQS receive/delete, SES send, Secrets Manager read |

### 14.3 Network Security

| Layer | Protection |
|-------|-----------|
| **Edge** | Cloudflare WAF + DDoS mitigation + bot management |
| **ALB** | HTTPS only (no HTTP listener), security group restricts to 443 |
| **ECS** | Private subnets, no public IPs, security group restricts to ALB only |
| **RDS** | Private subnets, security group restricts to ECS only, encrypted at rest (AES-256) |
| **Redis** | Private subnets, security group restricts to ECS only, encryption in-transit + at-rest |
| **S3** | Block all public access, SSE-S3 encryption, bucket policy restricts to task roles |

### 14.4 Application Security

| Concern | Current State | Production |
|---------|--------------|------------|
| JWT secrets | Hardcoded dev values | Secrets Manager, rotated 90 days |
| Password hashing | bcrypt (good) | Keep bcrypt, consider Argon2id |
| CORS | `localhost:3000` | Strict: `https://app.paloor.com` only |
| Rate limiting | None | Redis-backed: 5/min auth, 20/min AI, 200/min general |
| Input validation | Pydantic on all endpoints | Keep + add request size limits (10MB upload max) |
| SQL injection | Parameterized queries throughout | Keep (SQLAlchemy/psycopg2 handles escaping) |
| XSS | React auto-escapes, except `dangerouslySetInnerHTML` in markdown | Sanitize markdown output with DOMPurify |
| CSRF | No cookies used (Bearer token) | Safe with current architecture |
| File upload | No type validation | Validate MIME type + file extension + max size (10MB) |
| PII | Full SSN potentially in OCR output | Redact to last 4 digits (already done in memory capture) |
| Document access | No ownership check on some endpoints | Enforce `user_id` ownership on all document queries |

### 14.5 Compliance Readiness

| Requirement | Status | Action |
|-------------|--------|--------|
| Financial disclaimer | Static footer on AI responses | Already implemented |
| Data deletion | Not implemented | Add `DELETE /api/auth/account` + cascade delete + S3 purge |
| Data export | Not implemented | Add `GET /api/auth/export` → generate JSON/CSV → S3 → signed URL |
| Audit logging | Not implemented | CloudWatch structured logs for auth events + data access |
| SOC 2 Type II | Not started | Pre-seed: document controls; post-seed: formal audit ($15-30K) |
| CCPA/GDPR | Not started | Privacy policy page, consent checkboxes, data portability |

---

## 15. CI/CD Pipeline

### 15.1 GitHub → AWS CodePipeline

```
GitHub (main branch)
    │
    ▼
CodePipeline (source stage)
    │
    ▼
CodeBuild (build stage)
    ├── Build main-backend Docker image → push to ECR
    ├── Build admin-backend Docker image → push to ECR
    ├── Build main-frontend Docker image → push to ECR (with NEXT_PUBLIC_ build args)
    ├── Build admin-frontend Docker image → push to ECR (with NEXT_PUBLIC_ build args)
    └── Build worker Docker image → push to ECR
    │
    ▼
ECS Deploy (deploy stage)
    ├── Update main-backend service → rolling deployment
    ├── Update admin-backend service → rolling deployment
    ├── Update main-frontend service → rolling deployment
    ├── Update admin-frontend service → rolling deployment
    └── Update worker service → rolling deployment
```

### 15.2 Dockerfiles

**backend/Dockerfile:**
```dockerfile
FROM python:3.11-slim

# System deps for pytesseract, PyMuPDF, Whisper
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libgl1-mesa-glx \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create uploads dir (used as tmp before S3 upload)
RUN mkdir -p uploads/photos uploads/chat

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

**admin-backend/Dockerfile:**
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

**frontend/Dockerfile:**
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
```

**admin-frontend/Dockerfile:**
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_ADMIN_API_URL
ENV NEXT_PUBLIC_ADMIN_API_URL=$NEXT_PUBLIC_ADMIN_API_URL
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3001
CMD ["node", "server.js"]
```

**backend/Dockerfile.worker:**
```dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "worker.py"]
```

### 15.3 buildspec.yml

```yaml
version: 0.2

env:
  secrets-manager:
    NEXT_PUBLIC_API_URL: paloor/prod/frontend:API_URL
    NEXT_PUBLIC_WS_URL: paloor/prod/frontend:WS_URL
    NEXT_PUBLIC_ADMIN_API_URL: paloor/prod/frontend:ADMIN_API_URL

phases:
  pre_build:
    commands:
      - echo Logging in to ECR...
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com

  build:
    commands:
      # Main Backend
      - docker build -t paloor/main-backend backend/
      - docker tag paloor/main-backend $ECR_REGISTRY/paloor/main-backend:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker tag paloor/main-backend $ECR_REGISTRY/paloor/main-backend:latest

      # Admin Backend
      - docker build -t paloor/admin-backend admin-backend/
      - docker tag paloor/admin-backend $ECR_REGISTRY/paloor/admin-backend:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker tag paloor/admin-backend $ECR_REGISTRY/paloor/admin-backend:latest

      # Main Frontend
      - docker build --build-arg NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL --build-arg NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL -t paloor/main-frontend frontend/
      - docker tag paloor/main-frontend $ECR_REGISTRY/paloor/main-frontend:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker tag paloor/main-frontend $ECR_REGISTRY/paloor/main-frontend:latest

      # Admin Frontend
      - docker build --build-arg NEXT_PUBLIC_ADMIN_API_URL=$NEXT_PUBLIC_ADMIN_API_URL -t paloor/admin-frontend admin-frontend/
      - docker tag paloor/admin-frontend $ECR_REGISTRY/paloor/admin-frontend:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker tag paloor/admin-frontend $ECR_REGISTRY/paloor/admin-frontend:latest

      # Worker
      - docker build -f backend/Dockerfile.worker -t paloor/worker backend/
      - docker tag paloor/worker $ECR_REGISTRY/paloor/worker:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker tag paloor/worker $ECR_REGISTRY/paloor/worker:latest

  post_build:
    commands:
      - docker push $ECR_REGISTRY/paloor/main-backend:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker push $ECR_REGISTRY/paloor/main-backend:latest
      - docker push $ECR_REGISTRY/paloor/admin-backend:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker push $ECR_REGISTRY/paloor/admin-backend:latest
      - docker push $ECR_REGISTRY/paloor/main-frontend:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker push $ECR_REGISTRY/paloor/main-frontend:latest
      - docker push $ECR_REGISTRY/paloor/admin-frontend:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker push $ECR_REGISTRY/paloor/admin-frontend:latest
      - docker push $ECR_REGISTRY/paloor/worker:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker push $ECR_REGISTRY/paloor/worker:latest

      # Generate ECS deployment artifacts
      - python scripts/generate-task-defs.py

artifacts:
  files:
    - imagedefinitions-main-backend.json
    - imagedefinitions-admin-backend.json
    - imagedefinitions-main-frontend.json
    - imagedefinitions-admin-frontend.json
    - imagedefinitions-worker.json
```

---

## 16. Monitoring & Observability

### 16.1 CloudWatch

| Component | Log Group | Metrics |
|-----------|-----------|---------|
| Main backend | `/ecs/paloor/main-backend` | Request count, latency, 5xx rate |
| Admin backend | `/ecs/paloor/admin-backend` | Request count, latency |
| Main frontend | `/ecs/paloor/main-frontend` | Request count, SSR latency |
| Worker | `/ecs/paloor/worker` | Queue depth, processing time, error rate |
| RDS | RDS Performance Insights | CPU, connections, query latency, IOPS |
| ElastiCache | ElastiCache metrics | Memory usage, cache hit rate, connections |
| ALB | ALB access logs (to S3) | Request distribution, error codes |

### 16.2 CloudWatch Alarms

| Alarm | Condition | Action |
|-------|-----------|--------|
| Backend CPU high | ECS CPU > 80% for 5 min | SNS → email/Slack |
| Backend 5xx spike | ALB 5xx > 10 in 5 min | SNS → email/Slack |
| RDS CPU high | CPU > 80% for 10 min | SNS → email/Slack |
| RDS connections high | Connections > 80% max | SNS → email/Slack |
| RDS storage low | Free storage < 5 GB | SNS → email/Slack |
| Redis memory high | Memory > 80% | SNS → email/Slack |
| SQS DLQ not empty | DLQ message count > 0 | SNS → email/Slack (immediate) |
| Worker errors | Error count > 5 in 15 min | SNS → email/Slack |
| Gemini API failures | 429/500 errors > 10 in 5 min | SNS (API quota might be exhausted) |

### 16.3 Structured Logging

```python
# All backend services should log as JSON for CloudWatch Insights queries
import json, logging

class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
            "user_id": getattr(record, "user_id", None),
            "request_id": getattr(record, "request_id", None),
            "duration_ms": getattr(record, "duration_ms", None),
        })
```

### 16.4 Application-Level Monitoring (Future)

| Tool | Purpose | Phase |
|------|---------|-------|
| **Sentry** | Error tracking, stack traces, release tracking | Phase 1 |
| **PostHog** | Product analytics (feature usage, funnels, retention) | Phase 2 |
| **AWS X-Ray** | Distributed tracing across services | Phase 2 |

---

## 17. Disaster Recovery & Backups

### 17.1 RDS Backups

| Setting | Value |
|---------|-------|
| Automated backups | Enabled, 7-day retention (Phase 1), 14-day (Phase 2) |
| Backup window | 04:00-05:00 UTC (11 PM - 12 AM ET) |
| Point-in-time recovery | Enabled (restore to any second within retention) |
| Manual snapshots | Before major deployments (retained indefinitely) |
| Cross-region replica | Not needed Phase 1; add us-west-2 at Phase 3 |

### 17.2 S3 Data Protection

| Feature | Setting |
|---------|---------|
| Versioning | Enabled (recover from accidental overwrites/deletes) |
| MFA Delete | Enabled on production bucket (prevents accidental bucket deletion) |
| Lifecycle | Documents → STANDARD_IA after 90 days → GLACIER after 365 days |
| Cross-region replication | Not needed Phase 1; add us-west-2 at Phase 3 |

### 17.3 RTO/RPO Targets

| Scenario | RTO | RPO | Recovery Method |
|----------|-----|-----|-----------------|
| ECS task crash | 30 seconds | 0 | ALB routes to healthy task, ECS replaces crashed task |
| RDS failure (single-AZ) | 5-10 minutes | 0 | RDS automated failover (if multi-AZ) |
| Full AZ outage | 2-5 minutes | 0 | ALB routes to other AZ, RDS failover |
| Accidental data deletion | 1 hour | 0 | Point-in-time restore from RDS backup |
| S3 object deletion | Immediate | 0 | S3 versioning → restore previous version |
| Full region disaster | 2-4 hours | 5 minutes | Cross-region RDS replica + S3 replication (Phase 3) |

---

## 18. Code Changes Required

### 18.1 Backend: SQLite → PostgreSQL

**Every file that imports `sqlite3` must be refactored.**

| File | Current (SQLite) | Production (PostgreSQL) |
|------|------------------|------------------------|
| `auth.py` | `sqlite3.connect("users.db")` | `psycopg2` or `asyncpg` connection pool |
| `chat/models.py` | `sqlite3.connect("chat.db")` | PostgreSQL via connection pool |
| `memory/store.py` | `sqlite3.connect("memory.db")` | PostgreSQL + pgvector |
| `memory/embeddings.py` | numpy array BLOBs | pgvector `vector(3072)` type |
| `memory/recall.py` | Load all embeddings + numpy cosine search | `SELECT ... ORDER BY embedding <=> $1` |
| `linked_accounts.py` | `sqlite3.connect("accounts.db")` | PostgreSQL via connection pool |
| `equities/db.py` | `sqlite3.connect("equities.db")` | PostgreSQL via connection pool |
| `admin-backend/auth.py` | `sqlite3.connect("admin.db")` | PostgreSQL via connection pool |
| `admin-backend/users.py` | `sqlite3.connect("../backend/users.db")` etc. | PostgreSQL (same RDS, admin schema) |

**Connection pool approach:**
```python
# config.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

engine = create_async_engine(
    settings.database_url,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession)
```

### 18.2 Backend: Local Files → S3

| File | Current | Production |
|------|---------|------------|
| `assets/service.py` `_save_file()` | `open(path, "wb").write(data)` | `s3.put_object(Bucket, Key, Body)` |
| `assets/service.py` `save_document_json()` | Write JSON to disk | Store metadata in RDS (no more sidecars) |
| `assets/service.py` `restore_from_disk()` | Load JSON files on startup | Query RDS on startup (or lazy-load) |
| `auth_router.py` photo upload | `open(f"uploads/photos/{id}.{ext}", "wb")` | `s3.put_object(Bucket, "photos/{id}.{ext}")` |
| `auth_router.py` photo serve | `os.path.exists()` + `FileResponse` | Generate pre-signed URL |
| `chat/service.py` `save_attachment()` | Write to `uploads/chat/` | `s3.put_object(Bucket, "chat/{uuid}.{ext}")` |
| `speech.py` | `tempfile.NamedTemporaryFile` | S3 `whisper-temp/` prefix + lifecycle delete |

### 18.3 Backend: In-Memory State → Redis

| Current | New |
|---------|-----|
| `_verification_codes = {}` | `redis.setex(f"email_code:{email}", 900, code)` |
| `_bg_jobs = {}` | `redis.hset(f"job:{id}", mapping=status_dict)` |
| `_ai_preferences = {}` | `redis.setex(f"ai_pref:{user_id}", 300, json.dumps(prefs))` |
| `_embed_cache = {}` | `redis.setex(f"embed:{hash}", 3600, vec.tobytes())` |
| `ConnectionManager.rooms` | `redis.sadd(f"ws:room:{conv_id}", user_id)` |
| `ConnectionManager.active` | Local only (WebSocket is per-instance), but use Redis Pub/Sub for cross-instance broadcast |

### 18.4 Backend: Background Tasks → SQS

| Current | New |
|---------|-----|
| `threading.Thread(target=_vectorize_document).start()` | `sqs.send_message(QueueUrl=DOC_VECTORIZE_QUEUE, MessageBody=json.dumps({...}))` |
| `asyncio.create_task(_async_capture_memory(...))` | `sqs.send_message(QueueUrl=MEMORY_QUEUE, MessageBody=json.dumps({...}))` |
| `asyncio.create_task(_async_summarize(...))` | Part of memory capture message |

### 18.5 Backend: Gmail → SES

```python
# Current (auth.py)
with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
    smtp.login(settings.gmail_address, settings.gmail_app_password)
    smtp.send_message(msg)

# Production
import boto3
ses = boto3.client("ses", region_name="us-east-1")
ses.send_email(
    Source="noreply@paloor.com",
    Destination={"ToAddresses": [email]},
    Message={
        "Subject": {"Data": "Paloor — Verify your email"},
        "Body": {"Html": {"Data": html_body}},
    },
)
```

### 18.6 Frontend: Hardcoded URLs → Env Vars

| File | Current | Production |
|------|---------|------------|
| Every page with `const API = "http://localhost:8000"` | Hardcoded | `process.env.NEXT_PUBLIC_API_URL` |
| `chat/page.tsx` WebSocket URL | `ws://localhost:8000/ws/chat` | `process.env.NEXT_PUBLIC_WS_URL` |
| Admin frontend `lib/auth.tsx` | `http://localhost:8001` | `process.env.NEXT_PUBLIC_ADMIN_API_URL` |

### 18.7 Configuration: Environment-Based Settings

```python
# backend/config.py — Production-ready
class Settings(BaseSettings):
    environment: str = "development"
    cors_origins: list[str] = ["http://localhost:3000"]
    database_url: str = "postgresql://..."
    redis_url: str = "redis://localhost:6379"
    jwt_secret_key: str = ""
    gemini_api_key: str = ""
    
    # S3
    upload_bucket: str = "paloor-uploads-prod"
    aws_region: str = "us-east-1"
    
    # SQS
    sqs_document_queue: str = ""
    sqs_memory_queue: str = ""
    sqs_email_queue: str = ""
    
    # SES
    ses_from_address: str = "noreply@paloor.com"
    
    class Config:
        env_file = ".env"
```

---

## 19. Cost Projections

### Phase 1: MVP (0-1,000 users)

| Service | Spec | Monthly Cost |
|---------|------|-------------|
| **ECS Fargate** | 2×backend (1vCPU/2GB) + 1×admin-be (0.25/0.5) + 2×frontend (0.5/1) + 1×admin-fe (0.25/0.5) + 1×worker (1/3) | ~$95 |
| **RDS PostgreSQL** | db.t3.medium, 50GB, single-AZ | ~$35 |
| **ElastiCache Redis** | cache.t3.micro | ~$12 |
| **ALB** | 1 ALB, 4 target groups | ~$22 |
| **NAT Gateway** | 1 (single AZ) + ~10 GB data | ~$35 |
| **S3** | < 10 GB stored + requests | ~$1 |
| **SQS** | < 1M messages | ~$0 (free tier) |
| **SES** | < 10K emails | ~$1 |
| **ECR** | 5 repos, < 10 GB images | ~$1 |
| **Secrets Manager** | 5 secrets | ~$2 |
| **CloudWatch** | Logs + metrics + alarms | ~$10 |
| **ACM** | Free | $0 |
| **VPC Endpoints** | 5 interface endpoints | ~$35 |
| **Cloudflare** | Free plan (or Pro $20/mo for WebSocket + WAF) | $0-20 |
| **TOTAL** | | **~$250-270/mo** |

### Phase 2: Growth (1,000-10,000 users)

| Service | Spec | Monthly Cost |
|---------|------|-------------|
| **ECS Fargate** | Auto-scaled (4-8 backend, 2-4 frontend, 2-4 workers) | ~$300 |
| **RDS PostgreSQL** | db.r6g.large, 200GB, multi-AZ | ~$200 |
| **ElastiCache Redis** | cache.r6g.large, 1 replica | ~$180 |
| **ALB** | Same (handles more traffic) | ~$30 |
| **NAT Gateway** | 2 (HA, both AZs) + ~50 GB data | ~$70 |
| **S3** | 100 GB stored + transitions | ~$5 |
| **SQS** | 5-10M messages | ~$2 |
| **SES** | 50-100K emails | ~$5 |
| **VPC Endpoints** | Same | ~$35 |
| **CloudWatch** | More logs + alarms | ~$30 |
| **Sentry** | Team plan | ~$26 |
| **Cloudflare Pro** | WAF + WebSocket + analytics | ~$20 |
| **TOTAL** | | **~$900-1,000/mo** |

### Phase 3: Scale (10,000-100,000+ users)

| Service | Spec | Monthly Cost |
|---------|------|-------------|
| **ECS Fargate** | Auto-scaled (10-20 backend, 6-12 frontend, 4-8 workers) | ~$800 |
| **RDS PostgreSQL** | db.r6g.xlarge, 500GB, multi-AZ + 2 read replicas | ~$600 |
| **ElastiCache Redis** | Cluster mode, 3 shards | ~$400 |
| **ALB** | Same | ~$50 |
| **NAT Gateway** | 2 + ~200 GB data | ~$100 |
| **S3** | 1 TB stored | ~$25 |
| **SQS + SES** | Volume pricing | ~$20 |
| **CloudWatch** | Full observability | ~$100 |
| **X-Ray** | Distributed tracing | ~$30 |
| **Sentry + PostHog** | Production tiers | ~$100 |
| **Cloudflare Business** | Advanced WAF + priority support | ~$200 |
| **TOTAL** | | **~$2,500-3,000/mo** |

### Cost Optimization Strategies

1. **Fargate Spot** for worker tasks (70% discount, acceptable for background processing)
2. **RDS Reserved Instances** (1-year commit → 30-40% savings)
3. **ElastiCache Reserved Nodes** (same)
4. **S3 Intelligent Tiering** for documents (auto-moves cold data)
5. **VPC Endpoints** reduce NAT data processing costs
6. **Right-sizing** via Container Insights CPU/memory utilization data
7. **Scheduled scaling** — reduce frontend/backend capacity at night (if US-only)

---

## 20. Scaling Strategy

### 20.1 Horizontal Scaling (ECS Auto-Scaling)

| Service | Scale Trigger | Min | Max | Cooldown |
|---------|---------------|-----|-----|----------|
| Main backend | CPU > 60% OR request count > 1000/min | 2 | 10 | 120s |
| Main frontend | CPU > 70% | 2 | 8 | 120s |
| Worker | SQS visible messages > 10 | 1 | 6 | 60s |
| Admin services | Manual scaling only | 1 | 2 | N/A |

### 20.2 Database Scaling Path

| Stage | Solution | Handles |
|-------|----------|---------|
| **Now** | RDS single-AZ, t3.medium | 1K users, 50 concurrent connections |
| **Read replicas** | 1 read replica for analytics/admin queries | Offload read traffic |
| **Multi-AZ** | Automated failover | HA, ~5s failover |
| **Vertical** | r6g.xlarge (4 vCPU / 32 GB) | 10K users, 200 connections |
| **Partitioning** | Partition `price_history` by year, `messages` by month | 100K+ users, billions of rows |
| **Aurora Serverless** | Auto-scaling PostgreSQL | Unpredictable traffic patterns |

### 20.3 Vector Search Scaling

| Users | Memories | Chunks | pgvector Strategy |
|-------|----------|--------|-------------------|
| 1K | 500K | 2M | IVFFlat index (lists=100) |
| 10K | 5M | 20M | IVFFlat index (lists=1000) + RDS read replica for vector queries |
| 100K | 50M | 200M | Consider OpenSearch with k-NN plugin or Pinecone |

### 20.4 Gemini API Scaling

| Phase | Model | Rate | Cost Strategy |
|-------|-------|------|---------------|
| Phase 1 | gemma-3-27b-it (cascade) | 10 req/sec | Default |
| Phase 2 | Same + batch embeddings | 100 req/sec | Request quota increase, optimize prompts |
| Phase 3 | Fine-tuned Llama/Mistral on dedicated GPU | Unlimited | Self-hosted model + Gemini fallback |

### 20.5 All US Equities Expansion (Phase 3)

Current: 503 S&P 500 companies. Target: 4,000+ US equities.

| Data | 503 Companies | 4,000+ Companies |
|------|---------------|-------------------|
| Price rows | ~630K | ~5M |
| Financial rows | ~500K | ~4M |
| News articles | ~50K | ~400K |
| Analysis cache | ~1K | ~8K |
| Total DB size | ~200 MB | ~2 GB |
| Daily price sync | 5 min | 30-45 min |
| Full EDGAR sync | 2 hours | 16+ hours |

**Solution:** Parallelize EDGAR fetches across multiple worker tasks. Price syncs batched by exchange. Analysis computation done as scheduled ECS tasks.

---

## 21. Migration Playbook

### Phase 0: Preparation (before going live)

1. **Create AWS account** + enable MFA on root
2. **Set up billing alerts** ($100, $250, $500 thresholds)
3. **Create IAM admin user** (never use root for daily ops)
4. **Register domain** on Cloudflare (if not already)
5. **Request SES production access** (takes 24-48h)

### Phase 1: Infrastructure (Day 1-2)

1. **VPC** — Create VPC, subnets, IGW, NAT, route tables, security groups
2. **RDS** — Launch PostgreSQL 15 with pgvector, run schema migration
3. **ElastiCache** — Launch Redis node
4. **S3** — Create buckets with policies, versioning, encryption
5. **SQS** — Create queues + DLQs
6. **Secrets Manager** — Store all secrets
7. **ECR** — Create 5 repositories
8. **ACM** — Request `*.paloor.com` certificate, validate via Cloudflare DNS

### Phase 2: Application Changes (Day 3-7)

1. **Backend SQLite → PostgreSQL** — Refactor all `sqlite3.connect()` calls
2. **Backend file storage → S3** — Replace all local file writes with boto3
3. **Backend in-memory → Redis** — Replace all ephemeral dicts
4. **Backend background tasks → SQS** — Replace threads/asyncio.create_task
5. **Backend Gmail → SES** — Replace SMTP with boto3 SES
6. **Frontend hardcoded URLs → env vars** — Replace all `localhost` references
7. **Create Dockerfiles** — All 5 (backend, admin-backend, frontend, admin-frontend, worker)
8. **Create worker.py** — SQS consumer process
9. **Test locally with Docker Compose** — Verify all containers work together

### Phase 3: Deploy (Day 8-10)

1. **Build & push Docker images** to ECR
2. **Create ECS cluster** — Task definitions, services, target groups
3. **Create ALB** — Listener rules, health checks
4. **Cloudflare DNS** — CNAME records pointing to ALB
5. **Test all endpoints** — API, WebSocket, uploads, downloads, auth
6. **Data migration** — Export SQLite data → import to RDS
7. **Upload existing documents** — Local `uploads/` directory → S3
8. **Set up CI/CD** — CodePipeline connected to GitHub

### Phase 4: Monitoring & Hardening (Day 11-14)

1. **CloudWatch dashboards** — Service health, request metrics
2. **Alarms** — CPU, memory, 5xx, DLQ, disk
3. **Structured logging** — JSON format for CloudWatch Insights
4. **Load testing** — Simulate 100 concurrent users
5. **Security audit** — Review all IAM policies, SG rules, public access
6. **Document runbooks** — Deployment, rollback, incident response

---

## 22. Future-Proofing

### 22.1 Planned Features → AWS Requirements

| Planned Feature | AWS Services Needed | Notes |
|----------------|--------------------| ------|
| **Plaid Integration** (bank account linking) | Secrets Manager (Plaid keys), SQS (sync jobs), RDS (account data) | Plaid webhooks → API Gateway → Lambda → SQS |
| **Financial Advisor Marketplace** | RDS (advisor profiles, sessions), S3 (advisor documents), SES (notifications) | Two-sided marketplace tables in RDS |
| **Robo-Advisor / Trading Bot** | SQS (trade orders), EventBridge (daily rebalancing), Secrets Manager (broker API keys) | **Regulatory: requires broker-dealer registration** |
| **Tax Intelligence** | RDS (capital gains tracking), S3 (tax forms), SQS (1099 parsing jobs) | Heavy OCR workload |
| **Paloor Card** (Stripe Issuing) | Secrets Manager (Stripe keys), SQS (transaction events), RDS (card data) | Stripe webhooks → API Gateway → Lambda → SQS |
| **India Expansion** | New region (ap-south-1 Mumbai), RDS cross-region read replica, S3 cross-region replication | SEBI RIA compliance requirements |
| **IoT Hardware** (desk terminal, NFC) | IoT Core, MQTT broker, Lambda | Phase 3+ |
| **B2B API** (white-label) | API Gateway (rate limiting, API keys), separate ECS cluster, RDS read replicas | Multi-tenant architecture |
| **Real Estate Module** | RDS (property data), SQS (valuation API calls), third-party APIs (Zillow/Propval) | API Gateway for external API proxying |
| **Education Certifications** | S3 (certificate PDFs), SES (certificate emails), RDS (progress tracking) | Already have learning module data |
| **Weekly Portfolio Digest** | EventBridge (weekly trigger), SES (email), ECS scheduled task | Template rendering + user data aggregation |
| **Price Alerts** | ElastiCache (alert rules), EventBridge (polling triggers), SNS/SES (notifications) | Real-time: consider WebSocket push |
| **Premium/Subscription Billing** | Stripe Checkout/Portal, Secrets Manager (Stripe keys), SQS (webhook processing) | RDS tables for subscription status |
| **Self-hosted LLM (Llama/Mistral)** | SageMaker Endpoints or EC2 GPU instances (g4dn) | Phase 3, cost optimization play |
| **Full-text Search** | OpenSearch Service | Replace current `LIKE` queries with proper full-text search |

### 22.2 Architecture Decision Records

| Decision | Chosen | Alternatives Considered | Rationale |
|----------|--------|------------------------| --------- |
| Container orchestration | ECS Fargate | EKS, EC2, Lambda | No cluster management, per-second billing, native Docker |
| Database | RDS PostgreSQL + pgvector | Aurora Serverless, DynamoDB, Supabase | pgvector for embeddings, familiar SQL, cost predictable |
| File storage | S3 | EFS, Cloudflare R2 | Ecosystem integration, pre-signed URLs, lifecycle policies |
| Cache | ElastiCache Redis | Memcached, DynamoDB DAX | Pub/Sub for WebSocket, data structures, rate limiting |
| Queue | SQS | RabbitMQ, Celery+Redis, EventBridge | Managed, dead letter queues, exactly-once processing |
| Email | SES | SendGrid, Gmail SMTP | AWS-native, cost-effective, domain reputation management |
| CI/CD | CodePipeline + CodeBuild | GitHub Actions, CircleCI | Native ECS deployment support |
| DNS/CDN | Cloudflare | Route 53 + CloudFront | Free DDoS, global CDN, WAF included, WebSocket support |
| Monitoring | CloudWatch + Sentry | Datadog, New Relic | Cost-effective, native AWS integration |
| Secrets | Secrets Manager | Parameter Store, HashiCorp Vault | Rotation support, ECS native integration |

---

## Appendix A: Complete AWS Service Inventory

Every AWS service required for Paloor production:

| # | Service | Purpose | Required Phase |
|---|---------|---------|---------------|
| 1 | **VPC** | Network isolation | Phase 1 |
| 2 | **Subnets** (6) | Public/private/data separation | Phase 1 |
| 3 | **Internet Gateway** | Public internet access for ALB | Phase 1 |
| 4 | **NAT Gateway** (1-2) | Outbound internet for private subnets | Phase 1 |
| 5 | **Security Groups** (5) | Firewall rules | Phase 1 |
| 6 | **VPC Endpoints** (5+) | Reduce NAT costs, keep traffic private | Phase 1 |
| 7 | **ECS Fargate** | Container orchestration (5 services) | Phase 1 |
| 8 | **ECR** (5 repos) | Docker image registry | Phase 1 |
| 9 | **ALB** | Load balancer + WebSocket + SSL termination | Phase 1 |
| 10 | **ACM** | SSL/TLS certificate (`*.paloor.com`) | Phase 1 |
| 11 | **RDS PostgreSQL** | Primary database (all schemas) + pgvector | Phase 1 |
| 12 | **S3** (2 buckets) | File storage (uploads) + backups | Phase 1 |
| 13 | **ElastiCache Redis** | Cache + sessions + pub/sub + rate limiting | Phase 1 |
| 14 | **SQS** (7 queues + 7 DLQs) | Background job processing | Phase 1 |
| 15 | **SES** | Transactional email | Phase 1 |
| 16 | **Secrets Manager** (5 secrets) | Credentials storage | Phase 1 |
| 17 | **IAM** (4 roles + policies) | Service permissions | Phase 1 |
| 18 | **CloudWatch** | Logs + metrics + alarms | Phase 1 |
| 19 | **CodePipeline** | CI/CD orchestration | Phase 1 |
| 20 | **CodeBuild** | Docker image builds | Phase 1 |
| 21 | **EventBridge** (6 rules) | Scheduled data pipeline triggers | Phase 1 |
| 22 | **SNS** (1 topic) | Alarm notifications | Phase 1 |
| 23 | **RDS Read Replicas** | Offload analytics/admin queries | Phase 2 |
| 24 | **X-Ray** | Distributed tracing | Phase 2 |
| 25 | **API Gateway** | Plaid webhooks, B2B API gateway | Phase 2 |
| 26 | **Lambda** | Webhook processors, scheduled micro-jobs | Phase 2 |
| 27 | **OpenSearch** | Full-text search across documents/assets | Phase 2 |
| 28 | **SageMaker** | Self-hosted LLM endpoints | Phase 3 |
| 29 | **IoT Core** | Hardware device connectivity | Phase 3 |

---

## Appendix B: Environment Variable Reference

### Main Backend (ECS Task Definition)

```
# Database
DATABASE_URL=postgresql://paloor_user:***@paloor-prod.xxx.us-east-1.rds.amazonaws.com:5432/paloor

# Auth
JWT_SECRET_KEY=<from-secrets-manager>

# AI
GEMINI_API_KEY=<from-secrets-manager>

# Storage
UPLOAD_BUCKET=paloor-uploads-prod
AWS_REGION=us-east-1

# Cache
REDIS_URL=redis://paloor-redis.xxx.cache.amazonaws.com:6379

# Queues
SQS_DOCUMENT_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/xxx/paloor-document-processing
SQS_VECTORIZE_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/xxx/paloor-document-vectorization
SQS_MEMORY_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/xxx/paloor-memory-capture
SQS_NEWS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/xxx/paloor-news-pipeline
SQS_EMAIL_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/xxx/paloor-email

# Email
SES_FROM_ADDRESS=noreply@paloor.com

# App
CORS_ORIGINS=https://app.paloor.com
ENVIRONMENT=production
WHISPER_MODEL=base
```

### Admin Backend (ECS Task Definition)

```
DATABASE_URL=postgresql://paloor_admin:***@paloor-prod.xxx.us-east-1.rds.amazonaws.com:5432/paloor
ADMIN_JWT_SECRET=<from-secrets-manager>
CORS_ORIGINS=https://admin.paloor.com
ENVIRONMENT=production
```

### Main Frontend (Build Args)

```
NEXT_PUBLIC_API_URL=https://api.paloor.com
NEXT_PUBLIC_WS_URL=wss://api.paloor.com/ws/chat
```

### Admin Frontend (Build Args)

```
NEXT_PUBLIC_ADMIN_API_URL=https://admin-api.paloor.com
```

---

## Appendix C: Cloudflare DNS Records

| Type | Name | Target | Proxy | TTL |
|------|------|--------|-------|-----|
| CNAME | app | paloor-alb-xxx.us-east-1.elb.amazonaws.com | Proxied | Auto |
| CNAME | api | paloor-alb-xxx.us-east-1.elb.amazonaws.com | Proxied | Auto |
| CNAME | admin | paloor-alb-xxx.us-east-1.elb.amazonaws.com | Proxied | Auto |
| CNAME | admin-api | paloor-alb-xxx.us-east-1.elb.amazonaws.com | Proxied | Auto |
| TXT | _acme-challenge | (ACM DNS validation value) | DNS only | Auto |
| MX | @ | (if using custom email, e.g., Google Workspace) | DNS only | Auto |

---

*This document covers every byte of data Paloor reads, writes, caches, queues, streams, and serves — mapped to the exact AWS service that handles it in production. Nothing is hardcoded. Nothing is in-memory-only. Nothing is on local disk. Every growth stage is accounted for.*
