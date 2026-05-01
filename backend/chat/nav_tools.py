"""
Navigation / Platform tools for the chat AI.

These tools let the AI inspect what's available across the rest of the Paloor
platform — learning modules, eligible cohorts, marketplace advisors — so it can
recommend specific actions and surface them as in-chat links the user can click
to deep-link into the relevant page.

Each tool returns a small JSON payload. The system prompt instructs the AI to
embed the resulting URLs as markdown links in its response (e.g.
`[Open the Diversification module](/dashboard/learning?module=diversification)`).
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


# Static catalogue of learning modules that exist in the frontend.
# Mirrors frontend/lib/modules/{returns,diversification}.ts
_LEARNING_MODULES = [
    {
        "id": "returns",
        "title": "Returns",
        "description": "How to think about return, risk and the time value of money.",
        "url": "/dashboard/learning?module=returns",
    },
    {
        "id": "diversification",
        "title": "Diversification",
        "description": "Why owning many things beats owning one — correlation, risk reduction, and portfolio construction.",
        "url": "/dashboard/learning?module=diversification",
    },
]


def _age_to_life_stage(age: int | None) -> str | None:
    if not age:
        return None
    if age < 30:
        return "early_career"
    if age < 45:
        return "mid_career"
    if age < 55:
        return "peak_earning"
    if age < 65:
        return "pre_retirement"
    return "retired"


# ---------------------------------------------------------------------------
# Tool specs (Bedrock Converse API toolSpec format)
# ---------------------------------------------------------------------------

NAV_TOOL_SPECS = [
    {
        "toolSpec": {
            "name": "list_learning_modules",
            "description": (
                "List all interactive learning modules currently available on Paloor. "
                "Use this when the user asks what they can learn, asks for a lesson "
                "on a topic, or whenever recommending learning content. Each module "
                "returned has a `url` you should embed as a markdown link so the user "
                "can click straight into the module."
            ),
            "inputSchema": {"json": {"type": "object", "properties": {}}},
        }
    },
    {
        "toolSpec": {
            "name": "find_eligible_cohorts",
            "description": (
                "Find wealth-manager–led cohorts the user is eligible to join right "
                "now. Cohorts are short-lived group conversations (a few days) led by "
                "a vetted wealth manager and grouped by life stage (early_career, "
                "mid_career, peak_earning, pre_retirement, retired). If `life_stage` "
                "is omitted, the user's life stage is inferred from their profile age. "
                "Each result includes a `url` deep-linking to the cohort browse page."
            ),
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "life_stage": {
                            "type": "string",
                            "description": "Optional life stage filter.",
                            "enum": [
                                "early_career",
                                "mid_career",
                                "peak_earning",
                                "pre_retirement",
                                "retired",
                            ],
                        }
                    },
                }
            },
        }
    },
    {
        "toolSpec": {
            "name": "list_marketplace_advisors",
            "description": (
                "List vetted wealth managers in the Paloor marketplace. Use when the "
                "user asks to talk to an advisor, find a financial planner, or get "
                "professional help. Optional `specialization` filter (e.g. "
                "'Retirement', 'Tax', 'Estate Planning') narrows the results."
            ),
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "specialization": {
                            "type": "string",
                            "description": "Optional specialty keyword to filter by.",
                        }
                    },
                }
            },
        }
    },
]

NAV_TOOL_NAMES = {spec["toolSpec"]["name"] for spec in NAV_TOOL_SPECS}


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------

def _list_learning_modules() -> dict:
    return {
        "modules": _LEARNING_MODULES,
        "page_url": "/dashboard/learning",
    }


def _find_eligible_cohorts(user_id: str, life_stage: str | None) -> dict:
    from chat.cohort import list_available_cohorts
    from chat.context import _gather_profile  # uses existing helper

    inferred_stage = life_stage
    if not inferred_stage:
        try:
            profile = _gather_profile(user_id) or {}
            inferred_stage = _age_to_life_stage(profile.get("age"))
        except Exception as e:
            logger.warning("Failed to infer life stage: %s", e)

    try:
        cohorts = list_available_cohorts(life_stage=inferred_stage)
    except Exception as e:
        logger.error("list_available_cohorts failed: %s", e)
        return {"error": str(e), "cohorts": []}

    # Trim to fields the LLM actually needs and add a deep-link URL.
    trimmed = []
    for c in cohorts[:10]:
        trimmed.append(
            {
                "conversation_id": c.get("conversation_id"),
                "name": c.get("conv_name"),
                "wm_name": c.get("wm_name"),
                "firm_name": c.get("firm_name"),
                "life_stage": c.get("life_stage"),
                "members": f"{c.get('member_count', 0)}/{(c.get('max_members') or 0) + 1}",
                "expires_at": str(c.get("conv_expires_at")) if c.get("conv_expires_at") else None,
                "url": "/dashboard/cohort",
            }
        )

    return {
        "inferred_life_stage": inferred_stage,
        "count": len(trimmed),
        "cohorts": trimmed,
        "browse_url": "/dashboard/cohort",
        "marketplace_url": "/dashboard/marketplace",
    }


def _list_marketplace_advisors(specialization: str | None) -> dict:
    from chat.cohort import get_marketplace_wms

    try:
        wms = get_marketplace_wms()
    except Exception as e:
        logger.error("get_marketplace_wms failed: %s", e)
        return {"error": str(e), "advisors": []}

    spec_q = (specialization or "").strip().lower()
    trimmed = []
    for wm in wms:
        specs = [s for s in (wm.get("specializations") or [])]
        if spec_q and not any(spec_q in (s or "").lower() for s in specs):
            continue
        trimmed.append(
            {
                "name": wm.get("user_name"),
                "firm": wm.get("firm_name"),
                "specializations": specs,
                "verified": bool(wm.get("is_verified")),
                "open_cohorts": wm.get("open_cohorts", 0),
                "bio": (wm.get("bio") or "")[:240],
            }
        )
        if len(trimmed) >= 10:
            break

    return {
        "filter": spec_q or None,
        "count": len(trimmed),
        "advisors": trimmed,
        "marketplace_url": "/dashboard/marketplace",
    }


def execute_nav_tool(tool_name: str, tool_input: dict[str, Any], user_id: str) -> dict:
    """Dispatch a navigation tool call. Returns a JSON-serializable dict."""
    try:
        if tool_name == "list_learning_modules":
            return _list_learning_modules()
        if tool_name == "find_eligible_cohorts":
            return _find_eligible_cohorts(user_id, tool_input.get("life_stage"))
        if tool_name == "list_marketplace_advisors":
            return _list_marketplace_advisors(tool_input.get("specialization"))
        return {"error": f"Unknown nav tool: {tool_name}"}
    except Exception as e:
        logger.exception("nav tool %s failed", tool_name)
        return {"error": str(e)}


def format_nav_tool_status(tool_name: str) -> str:
    return {
        "list_learning_modules": "Looking up learning modules...",
        "find_eligible_cohorts": "Finding cohorts you can join...",
        "list_marketplace_advisors": "Browsing the wealth-manager marketplace...",
    }.get(tool_name, "Loading…")
