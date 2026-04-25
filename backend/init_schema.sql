-- Paloor PostgreSQL Schema
-- Consolidates all 6 SQLite databases into one PostgreSQL instance

-- ============ USERS (from users.db) ============
CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
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
    financial_goals JSONB DEFAULT '[]'::jsonb,
    risk_tolerance  TEXT,
    abstraction_level TEXT DEFAULT 'beginner',
    dependents      INTEGER,
    state           TEXT,
    photo_path      TEXT
);

-- ============ ASSETS (from models.py / assets module) ============
CREATE TABLE IF NOT EXISTS assets (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id),
    asset_class     TEXT NOT NULL,
    name            TEXT NOT NULL,
    details         JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_documents (
    id              SERIAL PRIMARY KEY,
    asset_id        TEXT REFERENCES assets(id),
    doc_key         TEXT NOT NULL,
    filename        TEXT,
    raw_text        TEXT,
    extracted_fields JSONB DEFAULT '[]'::jsonb,
    file_path       TEXT,
    uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_documents (
    id              SERIAL PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id),
    doc_key         TEXT NOT NULL,
    filename        TEXT,
    raw_text        TEXT,
    extracted_fields JSONB DEFAULT '[]'::jsonb,
    file_path       TEXT,
    uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============ CHAT (from chat.db) ============
CREATE TABLE IF NOT EXISTS conversations (
    id              TEXT PRIMARY KEY,
    type            TEXT NOT NULL CHECK (type IN ('ai_private', 'group')),
    name            TEXT,
    description     TEXT,
    category        TEXT,
    created_by      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    avatar_url      TEXT,
    is_archived     BOOLEAN DEFAULT FALSE,
    last_message_at TIMESTAMPTZ,
    metadata        JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id TEXT REFERENCES conversations(id),
    user_id         TEXT,
    role            TEXT CHECK (role IN ('admin', 'member')),
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    ai_nudge_enabled BOOLEAN DEFAULT TRUE,
    position        INTEGER DEFAULT 0,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id),
    sender_id       TEXT,
    sender_name     TEXT,
    content         TEXT,
    reply_to        TEXT,
    is_ai_generated BOOLEAN DEFAULT FALSE,
    is_private_nudge BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    edited_at       TIMESTAMPTZ,
    metadata        JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS attachments (
    id              TEXT PRIMARY KEY,
    message_id      TEXT REFERENCES messages(id),
    type            TEXT,
    filename        TEXT,
    mime_type       TEXT,
    file_path       TEXT,
    size            INTEGER,
    thumbnail_path  TEXT
);

CREATE TABLE IF NOT EXISTS user_contexts (
    user_id         TEXT PRIMARY KEY,
    context         JSONB DEFAULT '{}'::jsonb,
    summary         TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_folders (
    id              TEXT PRIMARY KEY,
    user_id         TEXT,
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_folder_items (
    folder_id       TEXT REFERENCES chat_folders(id),
    conversation_id TEXT REFERENCES conversations(id),
    PRIMARY KEY (folder_id, conversation_id)
);

-- ============ MEMORY (from memory.db) ============
CREATE TABLE IF NOT EXISTS memories (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    category        TEXT NOT NULL,
    content         TEXT NOT NULL,
    source          TEXT,
    source_id       TEXT,
    importance      REAL DEFAULT 0.5,
    embedding       vector(3072),
    access_count    INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    is_active       BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS document_chunks (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    document_id     TEXT NOT NULL,
    document_type   TEXT,
    chunk_index     INTEGER NOT NULL,
    content         TEXT NOT NULL,
    embedding       vector(3072),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============ LINKED ACCOUNTS (from accounts.db) ============
CREATE TABLE IF NOT EXISTS linked_accounts (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    institution     TEXT NOT NULL,
    account_type    TEXT NOT NULL,
    account_name    TEXT,
    mask            TEXT,
    balance         NUMERIC(15,2),
    currency        TEXT DEFAULT 'USD',
    subtype         TEXT,
    linked_at       TIMESTAMPTZ DEFAULT NOW(),
    last_synced     TIMESTAMPTZ,
    status          TEXT DEFAULT 'active',
    metadata        JSONB DEFAULT '{}'::jsonb
);

-- ============ EQUITIES (from equities.db) ============
CREATE TABLE IF NOT EXISTS companies (
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

CREATE TABLE IF NOT EXISTS av_fundamentals (
    ticker          TEXT NOT NULL,
    function_name   TEXT NOT NULL,
    data            JSONB NOT NULL DEFAULT '{}'::jsonb,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ticker, function_name)
);

CREATE INDEX IF NOT EXISTS idx_av_fundamentals_ticker ON av_fundamentals(ticker);
CREATE INDEX IF NOT EXISTS idx_av_fundamentals_fetched ON av_fundamentals(fetched_at);

CREATE TABLE IF NOT EXISTS financials (
    id              SERIAL PRIMARY KEY,
    ticker          TEXT NOT NULL REFERENCES companies(ticker),
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

CREATE TABLE IF NOT EXISTS price_history (
    ticker          TEXT NOT NULL REFERENCES companies(ticker),
    date            DATE NOT NULL,
    open            NUMERIC,
    high            NUMERIC,
    low             NUMERIC,
    close           NUMERIC,
    adj_close       NUMERIC,
    volume          BIGINT,
    PRIMARY KEY (ticker, date)
);

CREATE TABLE IF NOT EXISTS stock_news (
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

CREATE TABLE IF NOT EXISTS event_summaries (
    id              SERIAL PRIMARY KEY,
    ticker          TEXT NOT NULL,
    event_date      DATE NOT NULL,
    event_type      TEXT,
    summary         TEXT,
    model_used      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (ticker, event_date, event_type)
);

CREATE TABLE IF NOT EXISTS analysis_cache (
    ticker          TEXT NOT NULL,
    years           INTEGER NOT NULL,
    result_json     JSONB NOT NULL,
    price_count     INTEGER NOT NULL,
    last_price_date DATE NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (ticker, years)
);

-- ============ ADMIN (from admin.db) ============
CREATE TABLE IF NOT EXISTS admin_users (
    id              TEXT PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    hashed_password TEXT NOT NULL,
    role            TEXT CHECK (role IN ('super_admin', 'employee')),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS crm_notes (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    admin_id        TEXT REFERENCES admin_users(id),
    admin_name      TEXT,
    content         TEXT NOT NULL,
    note_type       TEXT DEFAULT 'general',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS revenue_entries (
    id              TEXT PRIMARY KEY,
    category        TEXT NOT NULL,
    description     TEXT,
    amount          NUMERIC(15,2) NOT NULL,
    entry_type      TEXT CHECK (entry_type IN ('revenue', 'cost')),
    date            DATE NOT NULL,
    created_by      TEXT REFERENCES admin_users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_members_user ON conversation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_type ON conversations(type);
CREATE INDEX IF NOT EXISTS idx_memory_user ON memories(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_memory_category ON memories(user_id, category);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON document_chunks(user_id, document_id);
CREATE INDEX IF NOT EXISTS idx_financials ON financials(ticker, period_type, statement);
CREATE INDEX IF NOT EXISTS idx_prices ON price_history(ticker, date DESC);
CREATE INDEX IF NOT EXISTS idx_news ON stock_news(ticker, event_date);
CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id);
CREATE INDEX IF NOT EXISTS idx_linked_user ON linked_accounts(user_id);
