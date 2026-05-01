-- Migration 007: Wealth Manager Marketplace
-- Adds avatar/headshot URLs to wealth managers, display-only session fee
-- to cohorts, and tracks user consent at the time they join a cohort.

-- 1. Avatar / headshot URL for marketplace listing
ALTER TABLE wealth_managers ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Display-only session fee on each cohort (no payment processing).
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS session_fee TEXT DEFAULT '$49 / session';

-- 3. Track that the user explicitly consented to share their profile
--    with the wealth manager when they joined this cohort.
ALTER TABLE conversation_members
    ADD COLUMN IF NOT EXISTS user_agreed_to_terms BOOLEAN DEFAULT FALSE;
