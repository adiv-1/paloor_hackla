-- Deep Analysis tables for TradingAgents-style multi-agent analysis
-- Each analysis runs multiple AI "agents" that produce reports, culminating in a final verdict

CREATE TABLE IF NOT EXISTS deep_analyses (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    ticker          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    duration_secs   REAL,
    summary         TEXT,                              -- final summary shown in chat
    decision        TEXT,                              -- BUY / SELL / HOLD
    confidence      TEXT,                              -- HIGH / MEDIUM / LOW
    metadata        JSONB DEFAULT '{}'::jsonb           -- extra data (charts, etc.)
);

CREATE TABLE IF NOT EXISTS analysis_reports (
    id              TEXT PRIMARY KEY,
    analysis_id     TEXT NOT NULL REFERENCES deep_analyses(id) ON DELETE CASCADE,
    agent_name      TEXT NOT NULL,                     -- e.g. 'market_analyst', 'risk_analyst'
    agent_group     TEXT NOT NULL,                     -- e.g. 'analyst', 'research', 'trading', 'risk', 'verdict'
    status          TEXT NOT NULL DEFAULT 'pending',   -- pending, running, completed, failed
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    report_content  TEXT,                              -- markdown report
    report_data     JSONB DEFAULT '{}'::jsonb,         -- structured data (charts, indicators, etc.)
    error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_deep_analyses_user ON deep_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_deep_analyses_ticker ON deep_analyses(ticker);
CREATE INDEX IF NOT EXISTS idx_analysis_reports_analysis ON analysis_reports(analysis_id);
