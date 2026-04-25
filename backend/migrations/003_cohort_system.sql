-- Migration 003: Cohort Chat System
-- Adds wealth manager role, cohort conversations, anonymized members, and expiry

-- 1. Allow 'cohort' as a conversation type
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_type_check
    CHECK (type IN ('ai_private', 'group', 'cohort'));

-- 2. Add expires_at for time-limited cohort chats
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 3. Allow 'wealth_manager' role in conversation_members + add display_name for anonymization
ALTER TABLE conversation_members DROP CONSTRAINT IF EXISTS conversation_members_role_check;
ALTER TABLE conversation_members ADD CONSTRAINT conversation_members_role_check
    CHECK (role IN ('admin', 'member', 'wealth_manager'));

ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS agreed_to_terms BOOLEAN DEFAULT FALSE;

-- 4. Wealth managers table (separate from regular users and admin_users)
CREATE TABLE IF NOT EXISTS wealth_managers (
    id              TEXT PRIMARY KEY,
    user_id         TEXT UNIQUE NOT NULL REFERENCES users(id),
    firm_name       TEXT,
    license_number  TEXT,
    specializations JSONB DEFAULT '[]'::jsonb,
    bio             TEXT,
    is_verified     BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Cohort metadata table
CREATE TABLE IF NOT EXISTS cohorts (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT UNIQUE REFERENCES conversations(id),
    wm_id           TEXT REFERENCES wealth_managers(id),
    max_members     INTEGER DEFAULT 6,
    life_stage      TEXT,          -- e.g. 'early_career', 'mid_career', 'pre_retirement', 'retired'
    status          TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active', 'expired', 'closed')),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ
);

-- 6. Index for expiry checks
CREATE INDEX IF NOT EXISTS idx_conversations_expires_at ON conversations(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cohorts_status ON cohorts(status);
CREATE INDEX IF NOT EXISTS idx_cohorts_wm ON cohorts(wm_id);
