"""
User Context Builder — The Ambient AI Memory Layer.

This module builds and maintains a rich, summarized context document for each
user. The context is rebuilt every time the user chats, uploads a document,
or updates their profile. It is fed as a system prompt to Gemma 3 27B on
every query so the AI appears deeply personalized.

The context has two parts:
  1. Structured JSON — all Paloor data (profile, assets, documents, portfolio)
  2. Natural-language summary — a paragraph that Gemma can reason over naturally

Because Gemma 3 has limited context tolerance for very long system prompts,
the summary is kept TIGHT — under ~2000 tokens. We summarize, not dump.

Context is updated incrementally:
  - On chat start / every 5 messages: full rebuild
  - On document upload: just the asset/doc section refreshes
  - On profile update: just the profile section refreshes
  - End of conversation: conversation memory updated with key takeaways
"""
from __future__ import annotations

import json
import logging
import time
from typing import Optional, Dict, Any, List

from chat.models import get_user_context, upsert_user_context

logger = logging.getLogger(__name__)


def build_user_context(user_id: str) -> dict:
    """
    Gather all Paloor data for a user and build a context document.
    Returns the structured context dict AND saves it to DB.
    """
    context: Dict[str, Any] = {
        "user_id": user_id,
        "built_at": time.time(),
        "profile": _gather_profile(user_id),
        "assets": _gather_assets(user_id),
        "documents": _gather_documents(user_id),
        "portfolio": _gather_portfolio(user_id),
        "financial_health": _gather_health(user_id),
        "conversation_memory": _gather_conversation_memory(user_id),
    }

    summary = _build_summary(context)
    upsert_user_context(user_id, context, summary)
    return context


def get_or_build_context(user_id: str, max_age_seconds: int = 300) -> tuple[dict, str]:
    """
    Return cached context if fresh enough, otherwise rebuild.
    Returns (context_dict, summary_string).
    """
    existing = get_user_context(user_id)
    if existing:
        updated_at = existing["updated_at"]
        # Handle both float (epoch) and datetime objects from PostgreSQL
        if hasattr(updated_at, 'timestamp'):
            updated_at = updated_at.timestamp()
        if (time.time() - updated_at) < max_age_seconds:
            return existing["context"], existing["summary"]
    ctx = build_user_context(user_id)
    existing = get_user_context(user_id)
    return existing["context"], existing["summary"]


def update_conversation_memory(user_id: str, conversation_id: str, takeaway: str):
    """
    Append a conversation takeaway to the user's context memory.
    Called after AI summarizes a conversation's key points.
    """
    existing = get_user_context(user_id)
    if not existing:
        build_user_context(user_id)
        existing = get_user_context(user_id)

    context = existing["context"]
    memories = context.get("conversation_memory", [])

    # Keep last 20 memories to prevent unbounded growth
    memories.append({
        "conversation_id": conversation_id,
        "takeaway": takeaway,
        "timestamp": time.time(),
    })
    if len(memories) > 20:
        memories = memories[-20:]

    context["conversation_memory"] = memories
    summary = _build_summary(context)
    upsert_user_context(user_id, context, summary)


# ---------------------------------------------------------------------------
# Data gatherers — read from existing Paloor stores
# ---------------------------------------------------------------------------

def _gather_profile(user_id: str) -> dict:
    """Pull user profile from auth module."""
    try:
        from auth import get_user_record
        user = get_user_record(user_id)
        if not user:
            return {}
        return {
            "name": user.get("name"),
            "email": user.get("email"),
            "age": user.get("age"),
            "gender": user.get("gender"),
            "occupation": user.get("occupation"),
            "annual_income": user.get("annual_income"),
            "net_worth_estimate": user.get("net_worth_estimate"),
            "risk_tolerance": user.get("risk_tolerance"),
            "financial_goals": user.get("financial_goals"),
            "dependents": user.get("dependents"),
            "state": user.get("state"),
        }
    except Exception as e:
        logger.warning("Failed to gather profile: %s", e)
        return {}


def _gather_assets(user_id: str) -> List[dict]:
    """Pull all assets and their documents from the assets service."""
    try:
        from assets.service import _assets, _asset_documents
        user_assets = []
        for asset_id, asset_data in _assets.items():
            # Assets are stored as dicts with user_id
            if not isinstance(asset_data, dict):
                continue
            if asset_data.get("user_id") != user_id and asset_data.get("created_by") != user_id:
                # In the current code, assets don't track user_id in memory
                # so we include all assets (single-user MVP)
                pass

            asset_summary = {
                "id": asset_id,
                "class": asset_data.get("asset_class", ""),
                "name": asset_data.get("name", ""),
            }

            # Get extracted fields from documents
            docs = _asset_documents.get(asset_id, {})
            doc_summaries = []
            for doc_key, doc_data in docs.items():
                fields = doc_data.get("extracted_fields", [])
                field_summary = {}
                for f in fields:
                    if isinstance(f, dict) and f.get("value"):
                        field_summary[f.get("key", "")] = f.get("value", "")
                if field_summary:
                    doc_summaries.append({"doc_type": doc_key, "fields": field_summary})

            if doc_summaries:
                asset_summary["documents"] = doc_summaries
            user_assets.append(asset_summary)
        return user_assets
    except Exception as e:
        logger.warning("Failed to gather assets: %s", e)
        return []


def _gather_documents(user_id: str) -> List[dict]:
    """Pull account-level identity documents."""
    try:
        from assets.service import _account_documents
        docs = []
        for doc_key, doc_data in _account_documents.items():
            fields = doc_data.get("extracted_fields", [])
            field_summary = {}
            for f in fields:
                if isinstance(f, dict) and f.get("value"):
                    key = f.get("key", "")
                    val = f.get("value", "")
                    # Redact sensitive fields
                    if key in ("ssn", "social_security_number") and len(val) > 4:
                        val = "***-**-" + val[-4:]
                    field_summary[key] = val
            docs.append({"doc_type": doc_key, "fields": field_summary})
        return docs
    except Exception as e:
        logger.warning("Failed to gather documents: %s", e)
        return []


def _gather_portfolio(user_id: str) -> dict:
    """Pull portfolio data if available."""
    try:
        from portfolio.service import get_portfolio_summary
        return get_portfolio_summary() or {}
    except Exception:
        return {}


def _gather_health(user_id: str) -> dict:
    """Pull financial health scores."""
    try:
        from health import compute_health_score
        return compute_health_score(user_id) or {}
    except Exception:
        return {}


def _gather_conversation_memory(user_id: str) -> List[dict]:
    """Pull existing conversation memories from the context store."""
    try:
        existing = get_user_context(user_id)
        if existing:
            return existing["context"].get("conversation_memory", [])
    except Exception:
        pass
    return []


# ---------------------------------------------------------------------------
# Summary builder — natural language from structured data
# ---------------------------------------------------------------------------

def _build_summary(context: dict) -> str:
    """
    Build a concise natural-language summary of the user's financial profile.
    This is what gets injected as the system prompt for Gemma.
    Target: <2000 tokens (~1500 words).
    """
    parts = []

    # Profile
    profile = context.get("profile", {})
    if profile:
        name = profile.get("name", "the user")
        age = profile.get("age")
        occupation = profile.get("occupation")
        income = profile.get("annual_income")
        net_worth = profile.get("net_worth_estimate")
        state = profile.get("state")
        risk = profile.get("risk_tolerance")
        goals = profile.get("financial_goals", [])
        dependents = profile.get("dependents")

        intro = f"{name}"
        if age:
            intro += f", {age} years old"
        if occupation:
            intro += f", works as {occupation}"
        if state:
            intro += f" in {state}"
        intro += "."
        parts.append(intro)

        if income:
            parts.append(f"Annual income: {income}.")
        if net_worth:
            parts.append(f"Estimated net worth: {net_worth}.")
        if risk:
            parts.append(f"Risk tolerance: {risk}.")
        if dependents:
            parts.append(f"Has {dependents} dependent(s).")
        if goals:
            parts.append(f"Financial goals: {', '.join(goals)}.")

    # Assets
    assets = context.get("assets", [])
    if assets:
        parts.append(f"\nAssets ({len(assets)} total):")
        for a in assets[:15]:  # Cap at 15 to stay concise
            name = a.get("name", "Unnamed")
            cls = a.get("class", "")
            line = f"  - {cls}: {name}"
            docs = a.get("documents", [])
            for d in docs[:3]:
                fields = d.get("fields", {})
                if fields:
                    snippets = [f"{k}={v}" for k, v in list(fields.items())[:5]]
                    line += f" [{', '.join(snippets)}]"
            parts.append(line)

    # Identity documents
    id_docs = context.get("documents", [])
    if id_docs:
        doc_types = [d["doc_type"] for d in id_docs if d.get("fields")]
        if doc_types:
            parts.append(f"\nIdentity documents on file: {', '.join(doc_types)}.")

    # Portfolio
    portfolio = context.get("portfolio", {})
    if portfolio:
        if isinstance(portfolio, dict) and portfolio:
            parts.append(f"\nPortfolio data available: {list(portfolio.keys())}.")

    # Health
    health = context.get("financial_health", {})
    if health and isinstance(health, dict):
        parts.append(f"\nFinancial health metrics: {json.dumps(health)[:300]}.")

    # Conversation memory
    memories = context.get("conversation_memory", [])
    if memories:
        parts.append("\nPrevious conversation topics:")
        for m in memories[-5:]:  # Last 5 takeaways
            parts.append(f"  - {m.get('takeaway', '')}")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# AI Preferences — per-user abstraction level and assistant mode
# ---------------------------------------------------------------------------

_ai_preferences: Dict[str, Dict[str, Any]] = {}


def get_ai_preferences(user_id: str) -> dict:
    """Return persisted AI interaction preferences for a user."""
    return dict(_ai_preferences.get(user_id, {}))


def update_ai_preferences(user_id: str, updates: dict) -> dict:
    """Merge updates into the user's AI preferences and return the result."""
    current = _ai_preferences.get(user_id, {})
    current.update(updates)
    _ai_preferences[user_id] = current
    return dict(current)
