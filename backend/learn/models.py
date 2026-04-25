"""Persistence layer for learning progress."""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from database import pg_cursor

logger = logging.getLogger(__name__)

# Base credits for completing a module
BASE_MODULE_CREDITS = 7
# Compounding multiplier when user returns within 24 hours
RETURN_BONUS_MULTIPLIER = 1.2
# Max streak multiplier (cap)
MAX_STREAK_MULTIPLIER = 2.0


def init_learn_db() -> None:
    """Apply 006_learn.sql migration if the table doesn't exist."""
    try:
        sql_path = os.path.join(os.path.dirname(__file__), "..", "migrations", "006_learn.sql")
        with open(sql_path, "r") as f:
            sql = f.read()
        with pg_cursor() as cur:
            cur.execute(sql)
        logger.info("learn: schema ready")
    except Exception as e:
        logger.error("learn.init_learn_db failed: %s", e)


def get_progress(user_id: str, module_id: str) -> dict:
    with pg_cursor() as cur:
        cur.execute(
            "SELECT * FROM user_learn_progress WHERE user_id = %s AND module_id = %s",
            (user_id, module_id),
        )
        row = cur.fetchone()
    if not row:
        return {
            "user_id": user_id,
            "module_id": module_id,
            "current_step": 0,
            "completed_at": None,
            "credits_earned": 0,
            "hidden_scores": {},
            "streak_days": 1,
        }
    return _row_to_dict(row)


def list_progress(user_id: str) -> list[dict]:
    with pg_cursor() as cur:
        cur.execute(
            "SELECT * FROM user_learn_progress WHERE user_id = %s",
            (user_id,),
        )
        rows = cur.fetchall()
    return [_row_to_dict(r) for r in rows]


def upsert_step(user_id: str, module_id: str, step_index: int) -> dict:
    """Move user to a specific step. Does not award credits."""
    with pg_cursor() as cur:
        cur.execute(
            """
            INSERT INTO user_learn_progress (user_id, module_id, current_step, last_activity)
            VALUES (%s, %s, %s, NOW())
            ON CONFLICT (user_id, module_id) DO UPDATE
            SET current_step = GREATEST(user_learn_progress.current_step, EXCLUDED.current_step),
                last_activity = NOW()
            RETURNING *
            """,
            (user_id, module_id, step_index),
        )
        row = cur.fetchone()
    return _row_to_dict(row)


def record_checkpoint_score(user_id: str, module_id: str, step_key: str, score: int) -> None:
    """Persist a hidden checkpoint score in the jsonb column."""
    with pg_cursor() as cur:
        cur.execute(
            """
            INSERT INTO user_learn_progress (user_id, module_id, hidden_scores, last_activity)
            VALUES (%s, %s, %s, NOW())
            ON CONFLICT (user_id, module_id) DO UPDATE
            SET hidden_scores = user_learn_progress.hidden_scores || EXCLUDED.hidden_scores,
                last_activity = NOW()
            """,
            (user_id, module_id, json.dumps({step_key: score})),
        )


def complete_module(user_id: str, module_id: str) -> dict:
    """
    Mark a module complete and award credits with the Compound Clock multiplier.
    Returns the updated progress including credits awarded this completion.
    """
    existing = get_progress(user_id, module_id)
    if existing["completed_at"]:
        # Already complete; no double-award
        return {**existing, "awarded": 0}

    # Compute multiplier from any previously completed module within 24h
    multiplier = 1.0
    streak_days = 1
    with pg_cursor() as cur:
        cur.execute(
            """
            SELECT completed_at, streak_days
            FROM user_learn_progress
            WHERE user_id = %s AND completed_at IS NOT NULL
            ORDER BY completed_at DESC LIMIT 1
            """,
            (user_id,),
        )
        last = cur.fetchone()
    if last and last["completed_at"]:
        last_dt = last["completed_at"]
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        hours = (datetime.now(timezone.utc) - last_dt).total_seconds() / 3600.0
        if hours <= 24:
            streak_days = int(last["streak_days"] or 1) + 1
            multiplier = min(MAX_STREAK_MULTIPLIER, RETURN_BONUS_MULTIPLIER ** (streak_days - 1))

    awarded = int(round(BASE_MODULE_CREDITS * multiplier))

    with pg_cursor() as cur:
        cur.execute(
            """
            INSERT INTO user_learn_progress (
                user_id, module_id, current_step, completed_at,
                credits_earned, streak_days, last_activity
            ) VALUES (%s, %s, %s, NOW(), %s, %s, NOW())
            ON CONFLICT (user_id, module_id) DO UPDATE
            SET completed_at = NOW(),
                credits_earned = user_learn_progress.credits_earned + EXCLUDED.credits_earned,
                streak_days = EXCLUDED.streak_days,
                last_activity = NOW()
            RETURNING *
            """,
            (user_id, module_id, 999, awarded, streak_days),
        )
        row = cur.fetchone()
    result = _row_to_dict(row)
    result["awarded"] = awarded
    result["multiplier"] = round(multiplier, 2)
    return result


def total_credits(user_id: str) -> int:
    with pg_cursor() as cur:
        cur.execute(
            "SELECT COALESCE(SUM(credits_earned), 0) AS total FROM user_learn_progress WHERE user_id = %s",
            (user_id,),
        )
        row = cur.fetchone()
    return int(row["total"] if row else 0)


def _row_to_dict(row: dict) -> dict:
    if not row:
        return {}
    out = dict(row)
    if isinstance(out.get("completed_at"), datetime):
        out["completed_at"] = out["completed_at"].isoformat()
    if isinstance(out.get("last_activity"), datetime):
        out["last_activity"] = out["last_activity"].isoformat()
    return out
