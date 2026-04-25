"""
Admin auth — separate JWT system for admin/employee users.

Roles:
  super_admin — full access, can manage employees
  employee    — CRM access, can view users, limited write
"""
from __future__ import annotations

import time
import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

from database import pg_cursor

logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_admin_scheme = OAuth2PasswordBearer(tokenUrl="/api/admin/login")

import os
ADMIN_JWT_SECRET = os.getenv("ADMIN_JWT_SECRET", "paloor-admin-secret-change-in-prod")
ADMIN_JWT_ALGORITHM = "HS256"
ADMIN_JWT_EXPIRY_HOURS = 8


def init_admin_db():
    """Seed super admin if not exists. Tables already created via init_schema.sql."""
    with pg_cursor() as cur:
        cur.execute("SELECT id FROM admin_users WHERE email = %s", ("admin@paloor.com",))
        if not cur.fetchone():
            cur.execute(
                "INSERT INTO admin_users (id, email, name, hashed_password, role, created_at) VALUES (%s, %s, %s, %s, %s, %s)",
                (
                    "adm_" + uuid.uuid4().hex[:8],
                    "admin@paloor.com",
                    "Admin",
                    pwd_context.hash("admin"),
                    "super_admin",
                    datetime.now(timezone.utc),
                ),
            )
            logger.info("Seeded super admin: admin@paloor.com / admin")


def authenticate_admin(email: str, password: str) -> Optional[dict]:
    with pg_cursor() as cur:
        cur.execute("SELECT * FROM admin_users WHERE email = %s AND is_active = TRUE", (email,))
        row = cur.fetchone()
        if not row:
            return None
        if not pwd_context.verify(password, row["hashed_password"]):
            return None
        cur.execute("UPDATE admin_users SET last_login_at = %s WHERE id = %s", (datetime.now(timezone.utc), row["id"]))
        return dict(row)


def create_admin_token(admin: dict) -> str:
    payload = {
        "sub": admin["id"],
        "email": admin["email"],
        "role": admin["role"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=ADMIN_JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, ADMIN_JWT_SECRET, algorithm=ADMIN_JWT_ALGORITHM)


def get_current_admin(token: str = Depends(oauth2_admin_scheme)) -> dict:
    try:
        payload = jwt.decode(token, ADMIN_JWT_SECRET, algorithms=[ADMIN_JWT_ALGORITHM])
        admin_id = payload.get("sub")
        if not admin_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        with pg_cursor() as cur:
            cur.execute("SELECT * FROM admin_users WHERE id = %s AND is_active = TRUE", (admin_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=401, detail="Admin not found")
            return dict(row)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_super_admin(admin: dict = Depends(get_current_admin)) -> dict:
    if admin["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return admin


# ---------------------------------------------------------------------------
# Employee CRUD (super_admin only)
# ---------------------------------------------------------------------------

def list_admin_users() -> list:
    with pg_cursor() as cur:
        cur.execute("SELECT id, email, name, role, is_active, created_at, last_login_at FROM admin_users ORDER BY created_at DESC")
        return [dict(r) for r in cur.fetchall()]


def create_admin_user(email: str, name: str, password: str, role: str = "employee") -> dict:
    admin_id = "adm_" + uuid.uuid4().hex[:8]
    with pg_cursor() as cur:
        try:
            cur.execute(
                "INSERT INTO admin_users (id, email, name, hashed_password, role, created_at) VALUES (%s, %s, %s, %s, %s, %s)",
                (admin_id, email, name, pwd_context.hash(password), role, datetime.now(timezone.utc)),
            )
        except Exception:
            raise HTTPException(status_code=409, detail="Email already exists")
        cur.execute("SELECT id, email, name, role, is_active, created_at FROM admin_users WHERE id = %s", (admin_id,))
        return dict(cur.fetchone())


def deactivate_admin_user(admin_id: str):
    with pg_cursor() as cur:
        cur.execute("UPDATE admin_users SET is_active = FALSE WHERE id = %s", (admin_id,))


# ---------------------------------------------------------------------------
# CRM Notes
# ---------------------------------------------------------------------------

def add_crm_note(user_id: str, admin_id: str, admin_name: str, content: str, note_type: str = "general") -> dict:
    note_id = "note_" + uuid.uuid4().hex[:8]
    now = datetime.now(timezone.utc)
    with pg_cursor() as cur:
        cur.execute(
            "INSERT INTO crm_notes (id, user_id, admin_id, admin_name, content, note_type, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (note_id, user_id, admin_id, admin_name, content, note_type, now),
        )
    return {"id": note_id, "user_id": user_id, "admin_id": admin_id, "admin_name": admin_name, "content": content, "note_type": note_type, "created_at": now.isoformat()}


def get_crm_notes(user_id: str) -> list:
    with pg_cursor() as cur:
        cur.execute("SELECT * FROM crm_notes WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
        return [dict(r) for r in cur.fetchall()]


def delete_crm_note(note_id: str):
    with pg_cursor() as cur:
        cur.execute("DELETE FROM crm_notes WHERE id = %s", (note_id,))


# ---------------------------------------------------------------------------
# Revenue / Cost Entries
# ---------------------------------------------------------------------------

def add_revenue_entry(category: str, description: str, amount: float, entry_type: str, date: str, created_by: str) -> dict:
    entry_id = "rev_" + uuid.uuid4().hex[:8]
    now = datetime.now(timezone.utc)
    with pg_cursor() as cur:
        cur.execute(
            "INSERT INTO revenue_entries (id, category, description, amount, entry_type, date, created_by, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (entry_id, category, description, amount, entry_type, date, created_by, now),
        )
    return {"id": entry_id, "category": category, "description": description, "amount": amount, "entry_type": entry_type, "date": date}


def list_revenue_entries(entry_type: Optional[str] = None, limit: int = 100) -> list:
    with pg_cursor() as cur:
        if entry_type:
            cur.execute("SELECT * FROM revenue_entries WHERE entry_type = %s ORDER BY date DESC LIMIT %s", (entry_type, limit))
        else:
            cur.execute("SELECT * FROM revenue_entries ORDER BY date DESC LIMIT %s", (limit,))
        return [dict(r) for r in cur.fetchall()]


def get_revenue_summary() -> dict:
    with pg_cursor() as cur:
        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM revenue_entries WHERE entry_type = 'revenue'")
        total_rev = cur.fetchone()["coalesce"]
        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM revenue_entries WHERE entry_type = 'cost'")
        total_cost = cur.fetchone()["coalesce"]
        by_category = {}
        cur.execute("SELECT category, entry_type, SUM(amount) as total FROM revenue_entries GROUP BY category, entry_type")
        for r in cur.fetchall():
            cat = r["category"]
            if cat not in by_category:
                by_category[cat] = {"revenue": 0, "cost": 0}
            by_category[cat][r["entry_type"]] = float(r["total"])
        cur.execute(
            "SELECT to_char(date, 'YYYY-MM') as month, "
            "SUM(CASE WHEN entry_type='revenue' THEN amount ELSE 0 END) as revenue, "
            "SUM(CASE WHEN entry_type='cost' THEN amount ELSE 0 END) as costs "
            "FROM revenue_entries GROUP BY month ORDER BY month"
        )
        by_month = [{"month": r["month"], "revenue": float(r["revenue"]), "costs": float(r["costs"])} for r in cur.fetchall()]
    return {"total_revenue": float(total_rev), "total_cost": float(total_cost), "net": float(total_rev - total_cost), "by_category": by_category, "by_month": by_month}
