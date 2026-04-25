-- Session 7: Core Learning Loop
-- Tracks per-user progress through learning modules and credits earned.

CREATE TABLE IF NOT EXISTS user_learn_progress (
    user_id        TEXT NOT NULL,
    module_id      TEXT NOT NULL,
    current_step   INTEGER NOT NULL DEFAULT 0,
    completed_at   TIMESTAMPTZ,
    credits_earned INTEGER NOT NULL DEFAULT 0,
    hidden_scores  JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_activity  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    streak_days    INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_learn_progress_user ON user_learn_progress(user_id);
