"""
Admin API router — all endpoints under /api/admin.

Merged into the main backend so everything runs on a single port.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from admin_auth import (
    authenticate_admin,
    create_admin_token,
    get_current_admin,
    require_super_admin,
    list_admin_users,
    create_admin_user,
    deactivate_admin_user,
    add_crm_note,
    get_crm_notes,
    delete_crm_note,
    add_revenue_entry,
    list_revenue_entries,
    get_revenue_summary,
)
from admin_users import (
    list_all_users,
    get_user_detail,
    get_user_conversations,
    get_user_message_count,
    get_user_context,
    get_user_memories,
    get_user_memory_stats,
    get_user_linked_accounts,
    get_platform_analytics,
    get_signup_timeline,
    get_user_demographics,
    get_user_states,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: str
    password: str

class NoteRequest(BaseModel):
    content: str
    note_type: str = "general"

class RevenueRequest(BaseModel):
    category: str
    description: str
    amount: float
    entry_type: str = "revenue"
    date: str

class EmployeeRequest(BaseModel):
    email: str
    name: str
    password: str
    role: str = "employee"


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@router.post("/login")
def admin_login(req: LoginRequest):
    admin = authenticate_admin(req.email, req.password)
    if not admin:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_admin_token(admin)
    return {
        "token": token,
        "admin": {
            "id": admin["id"],
            "email": admin["email"],
            "name": admin["name"],
            "role": admin["role"],
        },
    }


@router.get("/me")
def admin_me(admin: dict = Depends(get_current_admin)):
    return {
        "id": admin["id"],
        "email": admin["email"],
        "name": admin["name"],
        "role": admin["role"],
    }


# ---------------------------------------------------------------------------
# Dashboard Analytics
# ---------------------------------------------------------------------------

@router.get("/analytics")
def analytics(admin: dict = Depends(get_current_admin)):
    data = get_platform_analytics()
    data["revenue"] = get_revenue_summary()
    return data


@router.get("/analytics/signups")
def signup_timeline(admin: dict = Depends(get_current_admin)):
    return get_signup_timeline()


@router.get("/analytics/demographics")
def demographics(admin: dict = Depends(get_current_admin)):
    return get_user_demographics()


@router.get("/analytics/map")
def user_map(admin: dict = Depends(get_current_admin)):
    return get_user_states()


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

@router.get("/users")
def users_list(admin: dict = Depends(get_current_admin)):
    users = list_all_users()
    result = []
    for u in users:
        msg_count = get_user_message_count(u["id"])
        mem_stats = get_user_memory_stats(u["id"])
        accounts = get_user_linked_accounts(u["id"])
        total_balance = sum(a.get("balance", 0) for a in accounts)

        result.append({
            "id": u["id"],
            "name": u["name"],
            "email": u["email"],
            "state": u.get("state"),
            "age": u.get("age"),
            "occupation": u.get("occupation"),
            "annual_income": u.get("annual_income"),
            "net_worth_estimate": u.get("net_worth_estimate"),
            "risk_tolerance": u.get("risk_tolerance"),
            "profile_completed": bool(u.get("profile_completed")),
            "email_verified": bool(u.get("email_verified")),
            "created_at": u.get("created_at"),
            "message_count": msg_count,
            "memory_count": mem_stats.get("total_memories", 0),
            "linked_accounts": len(accounts),
            "total_balance": total_balance,
        })
    return result


@router.get("/users/{user_id}")
def user_detail(user_id: str, admin: dict = Depends(get_current_admin)):
    user = get_user_detail(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user["conversations"] = get_user_conversations(user_id)
    user["message_count"] = get_user_message_count(user_id)
    user["memory_stats"] = get_user_memory_stats(user_id)
    user["linked_accounts"] = get_user_linked_accounts(user_id)
    user["total_balance"] = sum(a.get("balance", 0) for a in user["linked_accounts"])
    user["crm_notes"] = get_crm_notes(user_id)

    ctx = get_user_context(user_id)
    if ctx:
        user["ai_summary"] = ctx.get("summary", "")
    else:
        user["ai_summary"] = ""

    return user


@router.get("/users/{user_id}/conversations")
def user_conversations(user_id: str, admin: dict = Depends(get_current_admin)):
    return get_user_conversations(user_id)


@router.get("/users/{user_id}/memories")
def user_memories(user_id: str, admin: dict = Depends(get_current_admin)):
    return get_user_memories(user_id)


@router.get("/users/{user_id}/accounts")
def user_accounts(user_id: str, admin: dict = Depends(get_current_admin)):
    return get_user_linked_accounts(user_id)


@router.get("/users/{user_id}/context")
def user_context(user_id: str, admin: dict = Depends(get_current_admin)):
    ctx = get_user_context(user_id)
    if not ctx:
        return {"summary": "", "data": None}
    return ctx


# ---------------------------------------------------------------------------
# CRM Notes
# ---------------------------------------------------------------------------

@router.get("/users/{user_id}/notes")
def user_notes(user_id: str, admin: dict = Depends(get_current_admin)):
    return get_crm_notes(user_id)


@router.post("/users/{user_id}/notes")
def add_note(user_id: str, req: NoteRequest, admin: dict = Depends(get_current_admin)):
    return add_crm_note(user_id, admin["id"], admin["name"], req.content, req.note_type)


@router.delete("/notes/{note_id}")
def remove_note(note_id: str, admin: dict = Depends(get_current_admin)):
    delete_crm_note(note_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Revenue / Costs
# ---------------------------------------------------------------------------

@router.get("/revenue")
def revenue_list(
    entry_type: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    admin: dict = Depends(get_current_admin),
):
    return list_revenue_entries(entry_type, limit)


@router.post("/revenue")
def revenue_add(req: RevenueRequest, admin: dict = Depends(get_current_admin)):
    return add_revenue_entry(req.category, req.description, req.amount, req.entry_type, req.date, admin["id"])


@router.get("/revenue/summary")
def revenue_summary(admin: dict = Depends(get_current_admin)):
    return get_revenue_summary()


# ---------------------------------------------------------------------------
# Employees (super_admin only)
# ---------------------------------------------------------------------------

@router.get("/employees")
def employees_list(admin: dict = Depends(require_super_admin)):
    return list_admin_users()


@router.post("/employees")
def employee_create(req: EmployeeRequest, admin: dict = Depends(require_super_admin)):
    return create_admin_user(req.email, req.name, req.password, req.role)


@router.delete("/employees/{admin_id}")
def employee_deactivate(admin_id: str, admin: dict = Depends(require_super_admin)):
    if admin_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    deactivate_admin_user(admin_id)
    return {"ok": True}
