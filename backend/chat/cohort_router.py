"""
Cohort REST Router — endpoints for cohort chat system.

Handles:
  - Wealth manager registration
  - Cohort creation and discovery
  - Joining/leaving cohorts
  - Cohort messaging with ambient AI
  - Member listing with anonymization
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import get_current_user, UserInfo
from chat.cohort import (
    register_wealth_manager,
    get_wealth_manager_by_user,
    is_wealth_manager,
    create_cohort,
    get_cohort,
    get_cohort_by_conversation,
    list_available_cohorts,
    join_cohort,
    leave_cohort,
    agree_to_terms,
    get_cohort_members,
    get_display_name,
    list_wm_cohorts,
    expire_cohorts,
    get_life_stages,
    get_marketplace_wms,
)
from chat.models import (
    get_conversation,
    insert_message,
    list_messages,
    list_group_members,
    count_messages,
)


class _DateTimeEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, datetime):
            return o.isoformat()
        if isinstance(o, date):
            return o.isoformat()
        return super().default(o)


def _json_dumps(obj):
    return json.dumps(obj, cls=_DateTimeEncoder)


router = APIRouter(prefix="/api/cohort", tags=["cohort"])


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class WMRegisterRequest(BaseModel):
    firm_name: str = ""
    license_number: str = ""
    specializations: list[str] = []
    bio: str = ""


class CreateCohortRequest(BaseModel):
    life_stage: str
    max_members: int = 6
    duration_hours: int = 48


class CohortMessageRequest(BaseModel):
    content: str


class JoinCohortRequest(BaseModel):
    user_consented: bool = False


class AgreeTermsRequest(BaseModel):
    pass


# ---------------------------------------------------------------------------
# Wealth Manager
# ---------------------------------------------------------------------------

@router.post("/wm/register")
def register_wm(req: WMRegisterRequest, user: UserInfo = Depends(get_current_user)):
    """Register as a wealth manager. User must already have a regular account."""
    try:
        wm = register_wealth_manager(
            user_id=user.id,
            firm_name=req.firm_name,
            license_number=req.license_number,
            specializations=req.specializations,
            bio=req.bio,
        )
        return wm
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/wm/me")
def get_my_wm_profile(user: UserInfo = Depends(get_current_user)):
    """Get current user's wealth manager profile."""
    wm = get_wealth_manager_by_user(user.id)
    if not wm:
        raise HTTPException(404, "Not a wealth manager")
    return wm


@router.get("/wm/status")
def check_wm_status(user: UserInfo = Depends(get_current_user)):
    """Check if current user is a wealth manager."""
    return {"is_wealth_manager": is_wealth_manager(user.id)}


@router.get("/marketplace")
def get_marketplace():
    """Public marketplace listing of all active wealth managers."""
    return get_marketplace_wms()


# ---------------------------------------------------------------------------
# Cohort Lifecycle
# ---------------------------------------------------------------------------

@router.get("/life-stages")
def get_stages():
    """List available life stages for cohort matching."""
    return get_life_stages()


@router.post("/create")
def create_new_cohort(req: CreateCohortRequest, user: UserInfo = Depends(get_current_user)):
    """Create a new cohort. Only for wealth managers."""
    try:
        cohort = create_cohort(
            wm_user_id=user.id,
            life_stage=req.life_stage,
            max_members=req.max_members,
            duration_hours=req.duration_hours,
        )
        return cohort
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/available")
def list_cohorts(life_stage: Optional[str] = Query(None)):
    """List available cohorts that users can join. No auth required for browsing."""
    # Expire stale cohorts first
    expire_cohorts()
    return list_available_cohorts(life_stage)


@router.get("/my-cohorts")
def get_my_cohorts(user: UserInfo = Depends(get_current_user)):
    """List cohorts the current user is in (as member or WM)."""
    from chat.models import list_conversations
    convs = list_conversations(user.id, conv_type="cohort")
    # Enrich with cohort metadata
    results = []
    for conv in convs:
        cohort = get_cohort_by_conversation(conv["id"])
        conv["cohort"] = cohort
        results.append(conv)
    return results


@router.get("/wm/cohorts")
def get_wm_cohorts(user: UserInfo = Depends(get_current_user)):
    """List all cohorts managed by this wealth manager."""
    if not is_wealth_manager(user.id):
        raise HTTPException(403, "Not a wealth manager")
    return list_wm_cohorts(user.id)


@router.post("/{conv_id}/join")
def join_cohort_endpoint(
    conv_id: str,
    req: JoinCohortRequest | None = None,
    user: UserInfo = Depends(get_current_user),
):
    """Join a cohort. Gets assigned an anonymized display name.

    Body (optional): {"user_consented": true} records that the user
    explicitly acknowledged what data will be shared with the wealth manager.
    """
    consented = bool(req.user_consented) if req is not None else False
    try:
        result = join_cohort(conv_id, user.id, user_consented=consented)
        # Insert system message
        insert_message(
            conversation_id=conv_id,
            sender_id="system",
            sender_name="System",
            content=f"{result['display_name']} joined the cohort",
            metadata={"system_event": "member_joined"},
        )
        conv = get_conversation(conv_id)
        return {"status": "joined", "display_name": result["display_name"], "conversation": conv}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/{conv_id}/leave")
def leave_cohort_endpoint(conv_id: str, user: UserInfo = Depends(get_current_user)):
    """Leave a cohort."""
    display_name = get_display_name(conv_id, user.id)
    leave_cohort(conv_id, user.id)
    insert_message(
        conversation_id=conv_id,
        sender_id="system",
        sender_name="System",
        content=f"{display_name} left the cohort",
        metadata={"system_event": "member_left"},
    )
    return {"status": "left"}


@router.post("/{conv_id}/agree-terms")
def agree_terms_endpoint(conv_id: str, user: UserInfo = Depends(get_current_user)):
    """Wealth manager agrees to not misuse client data."""
    agree_to_terms(conv_id, user.id)
    return {"status": "agreed"}


@router.get("/{conv_id}/members")
def get_members(conv_id: str, user: UserInfo = Depends(get_current_user)):
    """Get cohort members with appropriate anonymization."""
    return get_cohort_members(conv_id, user.id)


@router.get("/{conv_id}/messages")
def get_cohort_messages(
    conv_id: str,
    limit: int = Query(50, ge=1, le=200),
    before: Optional[float] = Query(None),
    user: UserInfo = Depends(get_current_user),
):
    """Get messages with sender names replaced by display names."""
    # Verify membership
    members = list_group_members(conv_id)
    if not any(m["user_id"] == user.id for m in members):
        raise HTTPException(404, "Not a member of this cohort")

    messages = list_messages(conv_id, limit=limit, before=before)

    # Build display name map
    display_map = {}
    for m in members:
        from database import pg_cursor
        with pg_cursor() as cur:
            cur.execute(
                "SELECT display_name, role FROM conversation_members WHERE conversation_id = %s AND user_id = %s",
                (conv_id, m["user_id"]),
            )
            row = cur.fetchone()
            if row:
                display_map[m["user_id"]] = {
                    "display_name": row["display_name"],
                    "role": row["role"],
                }

    # Replace sender_name with display_name for anonymization
    for msg in messages:
        sid = msg.get("sender_id", "")
        if sid in display_map:
            msg["sender_name"] = display_map[sid]["display_name"]
            msg["sender_role"] = display_map[sid]["role"]
        elif sid == "paloor_ai":
            msg["sender_role"] = "ai"
        elif sid == "system":
            msg["sender_role"] = "system"
        else:
            msg["sender_role"] = "member"

        # Include whether this message is from the requesting user
        msg["is_own"] = sid == user.id

    return messages


@router.post("/{conv_id}/send")
async def send_cohort_message(
    conv_id: str,
    req: CohortMessageRequest,
    user: UserInfo = Depends(get_current_user),
):
    """
    Send a message in a cohort chat.
    Uses anonymized display names.
    Ambient AI may respond if appropriate.
    Returns SSE stream.
    """
    conv = get_conversation(conv_id)
    if not conv:
        raise HTTPException(404, "Cohort not found")
    if conv["type"] != "cohort":
        raise HTTPException(400, "Not a cohort conversation")

    # Check if expired
    if conv.get("expires_at"):
        from datetime import timezone as tz
        exp = conv["expires_at"]
        if hasattr(exp, 'tzinfo') and exp.tzinfo is None:
            exp = exp.replace(tzinfo=tz.utc)
        if exp < datetime.now(tz.utc):
            raise HTTPException(410, "This cohort has expired")

    # Get sender's display name and role
    display_name = get_display_name(conv_id, user.id)
    is_wm = is_wealth_manager(user.id)

    # Insert the message with anonymized name
    user_msg = insert_message(
        conversation_id=conv_id,
        sender_id=user.id,
        sender_name=display_name,
        content=req.content,
        is_ai_generated=False,
        metadata={"role": "wealth_manager" if is_wm else "member"},
    )
    user_msg["sender_role"] = "wealth_manager" if is_wm else "member"
    user_msg["is_own"] = True

    async def event_stream():
        yield f"data: {_json_dumps({'type': 'user_message', 'message': user_msg})}\n\n"

        # Ambient AI logic — only engage when appropriate
        ai_response = None
        try:
            ai_response = await asyncio.to_thread(
                _maybe_ambient_ai, conv_id, user.id, req.content, is_wm
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).error("Cohort ambient AI error: %s", e)

        if ai_response:
            ai_msg = insert_message(
                conversation_id=conv_id,
                sender_id="paloor_ai",
                sender_name="Paloor AI",
                content=ai_response,
                is_ai_generated=True,
                metadata={"role": "ai"},
            )
            ai_msg["sender_role"] = "ai"
            ai_msg["is_own"] = False

            # Stream AI response chunk by chunk for smooth rendering
            for i in range(0, len(ai_response), 20):
                chunk = ai_response[i:i+20]
                yield f"data: {_json_dumps({'type': 'ai_chunk', 'chunk': chunk})}\n\n"
                await asyncio.sleep(0.02)

            yield f"data: {_json_dumps({'type': 'ai_done', 'message': ai_msg})}\n\n"

        yield f"data: {_json_dumps({'type': 'stream_end'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Ambient AI for cohorts — smart, credit-conscious
# ---------------------------------------------------------------------------

# Financial keywords that might warrant AI assistance
_FINANCIAL_KEYWORDS = {
    "tax", "401k", "ira", "roth", "invest", "portfolio", "stock", "bond",
    "interest", "inflation", "dividend", "capital gain", "estate", "trust",
    "insurance", "annuity", "mortgage", "refinance", "compound", "return",
    "risk", "allocation", "diversif", "rebalance", "etf", "index fund",
    "social security", "medicare", "hsa", "fsa", "529",
}

# Max 1 AI response per cohort per 10 minutes (more conservative than groups)
_last_ai_time: dict[str, float] = {}
_AI_COOLDOWN_SECONDS = 600  # 10 minutes


def _maybe_ambient_ai(conv_id: str, sender_id: str, content: str, is_wm: bool) -> Optional[str]:
    """
    Decide if ambient AI should respond in a cohort.

    Strategy:
    1. NEVER respond if the wealth manager just sent a message (let them lead)
    2. Only respond if the message contains financial keywords
    3. Respect cooldown timer (1 AI response per 10 min per cohort)
    4. Frame responses as fact-checks / supplementary info, not advice
    """
    import time

    # Rule 1: Don't interrupt the wealth manager
    if is_wm:
        return None

    # Rule 2: Check for financial keywords
    content_lower = content.lower()
    has_keyword = any(kw in content_lower for kw in _FINANCIAL_KEYWORDS)
    has_question = "?" in content
    if not has_keyword and not has_question:
        return None

    # Rule 3: Cooldown check
    now = time.time()
    last = _last_ai_time.get(conv_id, 0)
    if now - last < _AI_COOLDOWN_SECONDS:
        return None

    # Rule 4: Check if WM responded recently (within last 3 messages)
    recent_msgs = list_messages(conv_id, limit=3)
    wm_responded_recently = False
    for msg in recent_msgs:
        meta = msg.get("metadata") or {}
        if meta.get("role") == "wealth_manager":
            wm_responded_recently = True
            break

    # If WM is active, stay silent and let them handle it
    if wm_responded_recently:
        return None

    # Generate AI response — framed as supplementary fact-checking
    try:
        from chat.ai_service import _get_bedrock_client
        client = _get_bedrock_client()

        # Get some conversation context
        history_msgs = list_messages(conv_id, limit=8)
        history_text = "\n".join(
            f"{m['sender_name']}: {m['content'][:200]}" for m in history_msgs
        )

        resp = client.converse(
            modelId="google.gemma-3-27b-it",
            messages=[{
                "role": "user",
                "content": [{
                    "text": f"""You are an ambient AI assistant in a cohort chat with a wealth manager and investors.
Your role is to provide factual, supplementary information — NOT financial advice.
The wealth manager is the primary advisor. You only chime in with:
- Factual corrections if something is inaccurate
- Relevant data points (e.g., current tax brackets, contribution limits)
- Definitions of financial terms someone might not know

Keep your response SHORT (2-3 sentences max). Be helpful but defer to the wealth manager.
Start with a brief context like "Quick note:" or "For reference:" — never "I recommend" or "You should".

Recent conversation:
{history_text}

Latest question from a member:
{content}

Provide a brief, factual supplement if appropriate. If this doesn't warrant AI input, respond with exactly "SILENT"."""
                }],
            }],
            system=[{"text": "You are a factual financial information assistant. Never give advice. Only provide verifiable facts, numbers, and definitions. Be extremely concise."}],
            inferenceConfig={"maxTokens": 200, "temperature": 0.3},
        )

        response_text = ""
        for block in resp.get("output", {}).get("message", {}).get("content", []):
            response_text += block.get("text", "")

        response_text = response_text.strip()
        if response_text.upper() == "SILENT" or len(response_text) < 5:
            return None

        _last_ai_time[conv_id] = now
        return response_text

    except Exception as e:
        import logging
        logging.getLogger(__name__).error("Cohort AI generation failed: %s", e)
        return None
