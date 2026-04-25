"""
Linked Accounts — Bank & Investment Account Linking

Manages user-linked financial accounts (bank accounts, 401k, Roth IRA,
brokerage accounts, etc.). Uses SQLite for storage.

In production this would integrate with Plaid or similar APIs.
For now it provides a local simulated linking experience.
"""
from __future__ import annotations

import json
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from auth import get_current_user, UserInfo
from database import pg_cursor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/accounts", tags=["linked-accounts"])


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def init_accounts_db():
    """No-op: tables created via init_schema.sql."""
    pass


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def list_linked_accounts(user_id: str) -> List[dict]:
    with pg_cursor() as cur:
        cur.execute(
            "SELECT * FROM linked_accounts WHERE user_id = %s AND status = 'active' ORDER BY linked_at DESC",
            (user_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def add_linked_account(
    user_id: str,
    institution: str,
    account_type: str,
    account_name: str,
    mask: str = "",
    balance: float = 0,
    subtype: str = "",
    metadata: dict = None,
) -> dict:
    acc_id = f"acc_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    with pg_cursor() as cur:
        cur.execute(
            """INSERT INTO linked_accounts
               (id, user_id, institution, account_type, account_name, mask, balance,
                subtype, linked_at, last_synced, status, metadata)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'active', %s)""",
            (acc_id, user_id, institution, account_type, account_name, mask,
             balance, subtype, now, now, json.dumps(metadata or {})),
        )
        cur.execute("SELECT * FROM linked_accounts WHERE id = %s", (acc_id,))
        return dict(cur.fetchone())


def update_account_balance(account_id: str, user_id: str, balance: float) -> Optional[dict]:
    with pg_cursor() as cur:
        cur.execute(
            "UPDATE linked_accounts SET balance = %s, last_synced = %s WHERE id = %s AND user_id = %s",
            (balance, datetime.now(timezone.utc), account_id, user_id),
        )
        cur.execute("SELECT * FROM linked_accounts WHERE id = %s", (account_id,))
        row = cur.fetchone()
        return dict(row) if row else None


def remove_linked_account(account_id: str, user_id: str) -> bool:
    with pg_cursor() as cur:
        cur.execute(
            "UPDATE linked_accounts SET status = 'removed' WHERE id = %s AND user_id = %s",
            (account_id, user_id),
        )
        return True


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class LinkAccountRequest(BaseModel):
    institution: str
    account_type: str  # checking, savings, 401k, roth_ira, brokerage, credit_card, mortgage
    account_name: str
    mask: str = ""
    balance: float = 0
    subtype: str = ""


class UpdateBalanceRequest(BaseModel):
    balance: float


# ---------------------------------------------------------------------------
# Available institutions (simulated Plaid-like catalog)
# ---------------------------------------------------------------------------

INSTITUTIONS = [
    {"id": "chase", "name": "JPMorgan Chase", "logo": "🏦", "types": ["checking", "savings", "credit_card", "mortgage"]},
    {"id": "bofa", "name": "Bank of America", "logo": "🏦", "types": ["checking", "savings", "credit_card"]},
    {"id": "wells_fargo", "name": "Wells Fargo", "logo": "🏦", "types": ["checking", "savings", "mortgage"]},
    {"id": "fidelity", "name": "Fidelity Investments", "logo": "📈", "types": ["401k", "roth_ira", "brokerage", "hsa"]},
    {"id": "vanguard", "name": "Vanguard", "logo": "📊", "types": ["401k", "roth_ira", "brokerage", "529"]},
    {"id": "schwab", "name": "Charles Schwab", "logo": "📈", "types": ["brokerage", "roth_ira", "401k"]},
    {"id": "td_ameritrade", "name": "TD Ameritrade", "logo": "📈", "types": ["brokerage", "roth_ira"]},
    {"id": "etrade", "name": "E*TRADE", "logo": "📈", "types": ["brokerage", "401k", "roth_ira"]},
    {"id": "robinhood", "name": "Robinhood", "logo": "📱", "types": ["brokerage"]},
    {"id": "coinbase", "name": "Coinbase", "logo": "₿", "types": ["crypto"]},
    {"id": "marcus", "name": "Marcus by Goldman Sachs", "logo": "🏦", "types": ["savings"]},
    {"id": "ally", "name": "Ally Bank", "logo": "🏦", "types": ["checking", "savings"]},
    {"id": "amex", "name": "American Express", "logo": "💳", "types": ["credit_card", "savings"]},
    {"id": "citi", "name": "Citibank", "logo": "🏦", "types": ["checking", "savings", "credit_card"]},
    {"id": "usaa", "name": "USAA", "logo": "🏦", "types": ["checking", "savings"]},
    {"id": "betterment", "name": "Betterment", "logo": "📊", "types": ["brokerage", "roth_ira"]},
    {"id": "wealthfront", "name": "Wealthfront", "logo": "📊", "types": ["brokerage", "roth_ira"]},
    {"id": "sofi", "name": "SoFi", "logo": "📱", "types": ["checking", "brokerage"]},
]

ACCOUNT_TYPES = {
    "checking": {"label": "Checking Account", "icon": "🏦"},
    "savings": {"label": "Savings Account", "icon": "🏦"},
    "credit_card": {"label": "Credit Card", "icon": "💳"},
    "mortgage": {"label": "Mortgage", "icon": "🏠"},
    "401k": {"label": "401(k)", "icon": "🏢"},
    "roth_ira": {"label": "Roth IRA", "icon": "🌟"},
    "brokerage": {"label": "Brokerage", "icon": "📈"},
    "hsa": {"label": "HSA", "icon": "🏥"},
    "529": {"label": "529 Plan", "icon": "🎓"},
    "crypto": {"label": "Crypto", "icon": "₿"},
}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/institutions")
def get_institutions():
    """Get available institutions for linking."""
    return INSTITUTIONS


@router.get("/types")
def get_account_types():
    """Get available account types."""
    return ACCOUNT_TYPES


@router.get("")
def get_linked_accounts(user: UserInfo = Depends(get_current_user)):
    """Get all linked accounts for the current user."""
    return list_linked_accounts(user.id)


@router.post("")
def link_account(req: LinkAccountRequest, user: UserInfo = Depends(get_current_user)):
    """Link a new account."""
    acc = add_linked_account(
        user_id=user.id,
        institution=req.institution,
        account_type=req.account_type,
        account_name=req.account_name,
        mask=req.mask,
        balance=req.balance,
        subtype=req.subtype,
    )
    return acc


@router.patch("/{account_id}/balance")
def update_balance(account_id: str, req: UpdateBalanceRequest, user: UserInfo = Depends(get_current_user)):
    """Update account balance (simulate sync)."""
    acc = update_account_balance(account_id, user.id, req.balance)
    if not acc:
        raise HTTPException(404, "Account not found")
    return acc


@router.delete("/{account_id}")
def unlink_account(account_id: str, user: UserInfo = Depends(get_current_user)):
    """Unlink (soft-delete) an account."""
    remove_linked_account(account_id, user.id)
    return {"status": "removed"}


@router.get("/summary")
def get_account_summary(user: UserInfo = Depends(get_current_user)):
    """Get summary of all linked accounts grouped by type."""
    accounts = list_linked_accounts(user.id)
    summary = {}
    total = 0
    for acc in accounts:
        t = acc["account_type"]
        if t not in summary:
            summary[t] = {"type": t, "label": ACCOUNT_TYPES.get(t, {}).get("label", t), "count": 0, "total_balance": 0}
        summary[t]["count"] += 1
        summary[t]["total_balance"] += acc["balance"]
        total += acc["balance"]
    return {"accounts": accounts, "by_type": list(summary.values()), "total_balance": total}
