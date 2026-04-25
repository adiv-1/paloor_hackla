"""
Read user data from PostgreSQL for admin views (read-only access).

All tables now live in a single PostgreSQL database.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from database import pg_cursor

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def list_all_users() -> list:
    with pg_cursor() as cur:
        cur.execute(
            "SELECT id, email, name, created_at, email_verified, profile_completed, "
            "age, gender, occupation, annual_income, net_worth_estimate, "
            "financial_goals, risk_tolerance, dependents, state, photo_path "
            "FROM users ORDER BY created_at DESC"
        )
        users = []
        for r in cur.fetchall():
            u = dict(r)
            if u.get("financial_goals"):
                try:
                    u["financial_goals"] = json.loads(u["financial_goals"])
                except (json.JSONDecodeError, TypeError):
                    pass
            users.append(u)
        return users


def get_user_detail(user_id: str) -> Optional[dict]:
    with pg_cursor() as cur:
        cur.execute(
            "SELECT id, email, name, created_at, email_verified, profile_completed, "
            "age, gender, occupation, annual_income, net_worth_estimate, "
            "financial_goals, risk_tolerance, dependents, state, photo_path "
            "FROM users WHERE id = %s", (user_id,)
        )
        row = cur.fetchone()
        if not row:
            return None
        u = dict(row)
        if u.get("financial_goals"):
            try:
                u["financial_goals"] = json.loads(u["financial_goals"])
            except (json.JSONDecodeError, TypeError):
                pass
        return u


def count_users() -> dict:
    with pg_cursor() as cur:
        cur.execute("SELECT COUNT(*) as cnt FROM users")
        total = cur.fetchone()["cnt"]
        cur.execute("SELECT COUNT(*) as cnt FROM users WHERE email_verified = TRUE")
        verified = cur.fetchone()["cnt"]
        cur.execute("SELECT COUNT(*) as cnt FROM users WHERE profile_completed = TRUE")
        profiled = cur.fetchone()["cnt"]
        return {"total": total, "verified": verified, "profile_completed": profiled}


def get_user_states() -> list:
    with pg_cursor() as cur:
        cur.execute(
            "SELECT state, COUNT(*) as count FROM users WHERE state IS NOT NULL AND state != '' GROUP BY state"
        )
        return [dict(r) for r in cur.fetchall()]


def get_user_demographics() -> dict:
    with pg_cursor() as cur:
        cur.execute(
            "SELECT annual_income, COUNT(*) as count FROM users WHERE annual_income IS NOT NULL AND annual_income != '' GROUP BY annual_income"
        )
        income_rows = cur.fetchall()
        cur.execute(
            "SELECT risk_tolerance, COUNT(*) as count FROM users WHERE risk_tolerance IS NOT NULL AND risk_tolerance != '' GROUP BY risk_tolerance"
        )
        risk_rows = cur.fetchall()
        cur.execute(
            "SELECT CASE "
            "WHEN age < 25 THEN '18-24' "
            "WHEN age < 35 THEN '25-34' "
            "WHEN age < 45 THEN '35-44' "
            "WHEN age < 55 THEN '45-54' "
            "WHEN age < 65 THEN '55-64' "
            "ELSE '65+' END as age_group, COUNT(*) as count "
            "FROM users WHERE age IS NOT NULL GROUP BY 1"
        )
        age_rows = cur.fetchall()
        return {
            "income_distribution": [dict(r) for r in income_rows],
            "risk_distribution": [dict(r) for r in risk_rows],
            "age_distribution": [dict(r) for r in age_rows],
        }


# ---------------------------------------------------------------------------
# Chat / Conversations per user
# ---------------------------------------------------------------------------

def get_user_conversations(user_id: str) -> list:
    try:
        with pg_cursor() as cur:
            cur.execute(
                "SELECT id, type, name, created_at FROM conversations WHERE id IN "
                "(SELECT DISTINCT conversation_id FROM messages WHERE sender_id = %s) "
                "ORDER BY created_at DESC LIMIT 50",
                (user_id,)
            )
            return [dict(r) for r in cur.fetchall()]
    except Exception:
        return []


def get_user_message_count(user_id: str) -> int:
    try:
        with pg_cursor() as cur:
            cur.execute("SELECT COUNT(*) as cnt FROM messages WHERE sender_id = %s", (user_id,))
            return cur.fetchone()["cnt"]
    except Exception:
        return 0


def get_user_context(user_id: str) -> Optional[dict]:
    try:
        with pg_cursor() as cur:
            cur.execute(
                "SELECT data_json, summary, built_at FROM user_context WHERE user_id = %s ORDER BY built_at DESC LIMIT 1",
                (user_id,)
            )
            row = cur.fetchone()
            if not row:
                return None
            result = {"built_at": row["built_at"], "summary": row["summary"]}
            if row["data_json"]:
                try:
                    result["data"] = json.loads(row["data_json"])
                except (json.JSONDecodeError, TypeError):
                    pass
            return result
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Memory per user
# ---------------------------------------------------------------------------

def get_user_memories(user_id: str) -> list:
    try:
        with pg_cursor() as cur:
            cur.execute(
                "SELECT id, category, content, source, importance, access_count, created_at FROM memories "
                "WHERE user_id = %s AND is_active = TRUE ORDER BY created_at DESC",
                (user_id,)
            )
            return [dict(r) for r in cur.fetchall()]
    except Exception:
        return []


def get_user_memory_stats(user_id: str) -> dict:
    try:
        with pg_cursor() as cur:
            cur.execute("SELECT COUNT(*) as cnt FROM memories WHERE user_id = %s AND is_active = TRUE", (user_id,))
            total = cur.fetchone()["cnt"]
            cur.execute(
                "SELECT category, COUNT(*) as count FROM memories WHERE user_id = %s AND is_active = TRUE GROUP BY category",
                (user_id,)
            )
            cats = cur.fetchall()
            cur.execute("SELECT COUNT(*) as cnt FROM document_chunks WHERE user_id = %s", (user_id,))
            chunks = cur.fetchone()["cnt"]
            return {"total_memories": total, "document_chunks": chunks, "categories": {r["category"]: r["count"] for r in cats}}
    except Exception:
        return {"total_memories": 0, "document_chunks": 0, "categories": {}}


# ---------------------------------------------------------------------------
# Linked Accounts per user
# ---------------------------------------------------------------------------

def get_user_linked_accounts(user_id: str) -> list:
    try:
        with pg_cursor() as cur:
            cur.execute(
                "SELECT id, institution, account_type, account_name, mask, balance, currency, status, linked_at "
                "FROM linked_accounts WHERE user_id = %s AND status = 'active' ORDER BY linked_at DESC",
                (user_id,)
            )
            return [dict(r) for r in cur.fetchall()]
    except Exception:
        return []


def get_total_aum() -> dict:
    try:
        with pg_cursor() as cur:
            cur.execute("SELECT COALESCE(SUM(balance), 0) as total FROM linked_accounts WHERE status = 'active'")
            total = cur.fetchone()["total"]
            cur.execute(
                "SELECT account_type, SUM(balance) as total FROM linked_accounts WHERE status = 'active' GROUP BY account_type"
            )
            by_type = cur.fetchall()
            return {"total_aum": total, "by_type": {r["account_type"]: r["total"] for r in by_type}}
    except Exception:
        return {"total_aum": 0, "by_type": {}}


# ---------------------------------------------------------------------------
# Platform-wide analytics
# ---------------------------------------------------------------------------

def get_platform_analytics() -> dict:
    user_counts = count_users()

    try:
        with pg_cursor() as cur:
            cur.execute("SELECT COUNT(*) as cnt FROM messages")
            total_msgs = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(*) as cnt FROM conversations")
            total_convs = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(*) as cnt FROM messages WHERE sender_id = 'ai'")
            ai_msgs = cur.fetchone()["cnt"]
    except Exception:
        total_msgs, total_convs, ai_msgs = 0, 0, 0

    try:
        with pg_cursor() as cur:
            cur.execute("SELECT COUNT(*) as cnt FROM memories WHERE is_active = TRUE")
            total_memories = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(*) as cnt FROM document_chunks")
            total_chunks = cur.fetchone()["cnt"]
    except Exception:
        total_memories, total_chunks = 0, 0

    aum = get_total_aum()

    return {
        "users": user_counts,
        "engagement": {
            "total_conversations": total_convs,
            "total_messages": total_msgs,
            "ai_messages": ai_msgs,
            "user_messages": total_msgs - ai_msgs,
        },
        "memory": {
            "total_memories": total_memories,
            "total_document_chunks": total_chunks,
        },
        "aum": aum,
    }


def get_signup_timeline() -> list:
    with pg_cursor() as cur:
        cur.execute(
            "SELECT created_at::date as date, COUNT(*) as count FROM users "
            "WHERE created_at IS NOT NULL GROUP BY created_at::date ORDER BY date"
        )
        return [dict(r) for r in cur.fetchall()]
