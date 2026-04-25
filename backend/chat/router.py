"""
Chat REST Router — HTTP endpoints for chat operations.

WebSocket is handled separately in websocket.py.
This router handles:
  - Conversation CRUD
  - Message history retrieval
  - Group discovery and membership
  - Folder management
  - File uploads
  - User context inspection (debug)
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel

from auth import get_current_user, UserInfo


class _DateTimeEncoder(json.JSONEncoder):
    """JSON encoder that converts datetime objects to ISO strings."""
    def default(self, o):
        if isinstance(o, datetime):
            return o.isoformat()
        if isinstance(o, date):
            return o.isoformat()
        return super().default(o)


def _json_dumps(obj):
    return json.dumps(obj, cls=_DateTimeEncoder)
from chat.models import (
    list_conversations,
    get_conversation,
    archive_conversation,
    delete_conversation,
    reorder_conversations,
    list_messages,
    insert_message,
    join_group,
    leave_group,
    list_group_members,
    list_public_groups,
)
from chat.service import (
    start_ai_chat,
    send_ai_message,
    save_ai_response,
    create_group,
    send_group_message,
    get_group_categories,
    save_chat_attachment,
    seed_default_groups,
)
from chat.ai_service import stream_ai_response, summarize_conversation, suggest_screener_expression, recommend_stocks_for_user, _get_bedrock_client
from chat.models import (
    create_folder,
    list_folders,
    add_to_folder,
    remove_from_folder,
    delete_folder,
)
from chat.context import build_user_context, get_or_build_context, get_ai_preferences, update_ai_preferences

router = APIRouter(prefix="/api/chat", tags=["chat"])


# ---------------------------------------------------------------------------
# Request/Response models
# ---------------------------------------------------------------------------

class NewAIChatRequest(BaseModel):
    name: str = ""


class ImageData(BaseModel):
    base64: str
    media_type: str


class SendMessageRequest(BaseModel):
    content: str
    reply_to: str = None
    abstraction_level: str = ""
    assistant_mode: str = ""
    section_context: str = ""
    images: list[ImageData] = []


class NewGroupRequest(BaseModel):
    name: str
    category: str
    description: str = ""


class NewFolderRequest(BaseModel):
    name: str


class FolderItemRequest(BaseModel):
    conversation_id: str


class RenameRequest(BaseModel):
    name: str


class ReorderRequest(BaseModel):
    conversation_ids: list[str]


class EphemeralAskRequest(BaseModel):
    question: str
    context: str = ""          # section name / description for system prompt
    abstraction_level: str = ""
    assistant_mode: str = "quick_help"


class AiPreferencesRequest(BaseModel):
    abstraction_level: Optional[str] = None
    assistant_mode: Optional[str] = None
    focus_areas: Optional[list[str]] = None


class ScreenerExpressionRequest(BaseModel):
    prompt: str
    abstraction_level: str = ""


class RecommendStocksRequest(BaseModel):
    prompt: str = ""
    abstraction_level: str = ""


# ---------------------------------------------------------------------------
# Ephemeral AI (info-popover — no persistence)
# ---------------------------------------------------------------------------

@router.post("/ask")
async def ephemeral_ask(req: EphemeralAskRequest, user: UserInfo = Depends(get_current_user)):
    """
    Answer a question using AI with the user's financial context,
    but do NOT persist the conversation. Used by info-popovers.
    Returns SSE stream of chunks.
    """
    from chat.ai_service import stream_ai_response_ephemeral

    async def event_stream():
        full_response = ""
        try:
            async for chunk in stream_ai_response_ephemeral(
                user_id=user.id,
                question=req.question,
                section_context=req.context,
                abstraction_level=req.abstraction_level,
                assistant_mode=req.assistant_mode,
            ):
                full_response += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'text': chunk})}\n\n"
        except Exception:
            fallback = "Sorry, I had trouble answering that. Try again in a moment."
            yield f"data: {json.dumps({'type': 'chunk', 'text': fallback})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# AI Private Chat
# ---------------------------------------------------------------------------

@router.post("/conversations/ai")
def create_ai_chat(req: NewAIChatRequest, user: UserInfo = Depends(get_current_user)):
    conv = start_ai_chat(user.id, req.name)
    return conv


@router.put("/conversations/reorder")
def reorder_convs(req: ReorderRequest, user: UserInfo = Depends(get_current_user)):
    reorder_conversations(user.id, req.conversation_ids)
    return {"status": "reordered"}


@router.get("/conversations")
def get_conversations(
    type: Optional[str] = Query(None),
    include_archived: bool = Query(False),
    user: UserInfo = Depends(get_current_user),
):
    return list_conversations(user.id, conv_type=type, include_archived=include_archived)


@router.get("/conversations/{conv_id}")
def get_conversation_detail(conv_id: str, user: UserInfo = Depends(get_current_user)):
    conv = get_conversation(conv_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    # Verify membership
    members = list_group_members(conv_id)
    if not any(m["user_id"] == user.id for m in members):
        raise HTTPException(404, "Conversation not found")
    return conv


@router.get("/conversations/{conv_id}/messages")
def get_messages(
    conv_id: str,
    limit: int = Query(50, ge=1, le=200),
    before: Optional[float] = Query(None),
    user: UserInfo = Depends(get_current_user),
):
    # Verify membership
    members = list_group_members(conv_id)
    if not any(m["user_id"] == user.id for m in members):
        raise HTTPException(404, "Conversation not found")
    return list_messages(conv_id, limit=limit, before=before)


@router.post("/conversations/{conv_id}/messages")
def send_message(conv_id: str, req: SendMessageRequest, user: UserInfo = Depends(get_current_user)):
    """Send a message (works for both AI and group chats)."""
    conv = get_conversation(conv_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")

    if conv["type"] == "ai_private":
        msg = send_ai_message(user.id, user.name, conv_id, req.content)
        return {"message": msg, "type": "ai_private"}
    else:
        msg, ai_public, ai_private = send_group_message(user.id, user.name, conv_id, req.content)
        return {
            "message": msg,
            "type": "group",
            "ai_public_response": ai_public,
            "ai_private_nudge": ai_private,
        }


@router.post("/conversations/{conv_id}/archive")
def archive_conv(conv_id: str, user: UserInfo = Depends(get_current_user)):
    ok = archive_conversation(conv_id, user.id)
    if not ok:
        raise HTTPException(404, "Not found or not a member")
    return {"status": "archived"}


@router.put("/conversations/{conv_id}/rename")
def rename_conv(conv_id: str, req: RenameRequest, user: UserInfo = Depends(get_current_user)):
    """Rename a conversation. Only the creator or a member can rename."""
    conv = get_conversation(conv_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    members = list_group_members(conv_id)
    if not any(m["user_id"] == user.id for m in members):
        raise HTTPException(404, "Conversation not found")
    from database import pg_cursor
    with pg_cursor() as cur:
        cur.execute("UPDATE conversations SET name = %s WHERE id = %s", (req.name.strip(), conv_id))
    return {"status": "renamed", "name": req.name.strip()}


@router.post("/conversations/{conv_id}/stream")
async def stream_message(conv_id: str, req: SendMessageRequest, user: UserInfo = Depends(get_current_user)):
    """
    Send a message to an AI chat and stream the response as SSE.
    This is the REST fallback when WebSocket is unavailable.
    Returns Server-Sent Events:
      data: {"type":"user_message","message":{...}}
      data: {"type":"ai_chunk","chunk":"..."}
      data: {"type":"ai_done","message":{...}}
    """
    conv = get_conversation(conv_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    if conv["type"] != "ai_private":
        raise HTTPException(400, "Streaming only supported for AI chats. Use POST /messages for group chats.")

    user_msg = send_ai_message(user.id, user.name, conv_id, req.content)

    # Save image attachments to disk so they show in chat
    for img in req.images:
        import base64 as b64mod
        try:
            raw = b64mod.b64decode(img.base64)
            ext = img.media_type.split("/")[-1].replace("jpeg", "jpg")
            save_chat_attachment(user_msg["id"], f"image.{ext}", raw, img.media_type)
        except Exception:
            continue
    # Re-fetch user_msg so it includes attachments
    if req.images:
        from chat.models import get_message
        user_msg = get_message(user_msg["id"])

    # Prepare image content blocks for multimodal
    image_blocks = []
    for img in req.images:
        import base64 as b64mod
        try:
            raw = b64mod.b64decode(img.base64)
            if len(raw) > 10 * 1024 * 1024:  # 10MB limit
                continue
            image_blocks.append({
                "format": img.media_type.split("/")[-1].replace("jpg", "jpeg"),
                "source": {"bytes": raw},
            })
        except Exception:
            continue

    async def event_stream():
        # Emit user message confirmation
        yield f"data: {_json_dumps({'type': 'user_message', 'message': user_msg})}\n\n"

        # Stream AI response
        full_response = ""
        collected_charts = []
        collected_analysis = None
        try:
            from chat.ai_service import TOOL_STATUS_PREFIX, CHART_DATA_PREFIX, ANALYSIS_PREFIX
            async for chunk in stream_ai_response(
                user.id,
                conv_id,
                req.content,
                runtime_context={
                    "abstraction_level": req.abstraction_level,
                    "assistant_mode": req.assistant_mode,
                    "section_context": req.section_context,
                },
                image_blocks=image_blocks if image_blocks else None,
            ):
                if chunk.startswith(TOOL_STATUS_PREFIX):
                    status_msg = chunk[len(TOOL_STATUS_PREFIX):]
                    yield f"data: {_json_dumps({'type': 'ai_tool_status', 'message': status_msg})}\n\n"
                elif chunk.startswith(CHART_DATA_PREFIX):
                    chart_json = chunk[len(CHART_DATA_PREFIX):]
                    chart_obj = json.loads(chart_json)
                    collected_charts.append(chart_obj)
                    yield f"data: {_json_dumps({'type': 'ai_chart_data', 'chart': chart_obj})}\n\n"
                elif chunk.startswith(ANALYSIS_PREFIX):
                    analysis_json = chunk[len(ANALYSIS_PREFIX):]
                    analysis_event = json.loads(analysis_json)
                    if analysis_event.get("type") == "analysis_complete":
                        collected_analysis = analysis_event
                    yield f"data: {_json_dumps({'type': 'ai_analysis_event', 'event': analysis_event})}\n\n"
                else:
                    full_response += chunk
                    yield f"data: {_json_dumps({'type': 'ai_chunk', 'chunk': chunk})}\n\n"
        except Exception as e:
            full_response = "Sorry, I encountered an error. Please try again."
            yield f"data: {_json_dumps({'type': 'ai_chunk', 'chunk': full_response})}\n\n"

        # Save the complete AI response (with chart data + analysis in metadata)
        msg_metadata = {}
        if collected_charts:
            msg_metadata["charts"] = collected_charts
        if collected_analysis:
            msg_metadata["analysis"] = collected_analysis
        ai_msg = save_ai_response(conv_id, full_response, metadata=msg_metadata if msg_metadata else None)

        # Auto-rename conversation after first exchange
        new_conv_name = None
        try:
            from chat.models import count_messages
            msg_count = count_messages(conv_id)
            if msg_count == 2:  # First user msg + first AI msg
                # Use AI to generate a concise 2-4 word title
                try:
                    client = _get_bedrock_client()
                    title_resp = client.converse(
                        modelId="google.gemma-3-27b-it",
                        messages=[{
                            "role": "user",
                            "content": [{"text": f"Generate a very short title (2-4 words max) summarizing this conversation topic. Return ONLY the title, nothing else. No quotes, no punctuation.\n\nUser asked: {req.content[:200]}\n\nAI answered about: {full_response[:200]}"}],
                        }],
                        system=[{"text": "You generate ultra-short chat titles. Reply with ONLY 2-4 words. No quotes, no extra text."}],
                        inferenceConfig={"maxTokens": 20, "temperature": 0.3},
                    )
                    title = ""
                    for block in title_resp.get("output", {}).get("message", {}).get("content", []):
                        title += block.get("text", "")
                    title = title.strip().strip('"').strip("'").strip()
                    # Fallback to truncated question if AI returns something weird
                    if not title or len(title) > 60 or len(title) < 3:
                        title = req.content.strip().replace("\n", " ")[:47] + "..."
                except Exception:
                    title = req.content.strip().replace("\n", " ")[:47] + "..."
                if title:
                    from database import pg_cursor
                    with pg_cursor() as cur:
                        cur.execute("UPDATE conversations SET name = %s WHERE id = %s", (title, conv_id))
                    new_conv_name = title
        except Exception:
            pass

        done_payload = {'type': 'ai_done', 'message': ai_msg}
        if new_conv_name:
            done_payload['conversation_name'] = new_conv_name
        yield f"data: {_json_dumps(done_payload)}\n\n"

        # Background: summarize if needed
        try:
            from chat.models import count_messages as _count
            msg_count = _count(conv_id)
            if msg_count > 0 and msg_count % 10 == 0:
                await asyncio.to_thread(summarize_conversation, conv_id, user.id)
        except Exception:
            pass

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/preferences")
def get_preferences(user: UserInfo = Depends(get_current_user)):
    """Get persisted AI interaction preferences for this user."""
    return get_ai_preferences(user.id)


@router.put("/preferences")
def put_preferences(req: AiPreferencesRequest, user: UserInfo = Depends(get_current_user)):
    """Update persisted AI interaction preferences for popup + full chat."""
    updates = req.model_dump(exclude_none=True)
    return update_ai_preferences(user.id, updates)


@router.post("/assistant/screener-expression")
def build_screener_expression(req: ScreenerExpressionRequest, user: UserInfo = Depends(get_current_user)):
    """Translate natural-language screener intent into a constrained expression."""
    if not req.prompt.strip():
        raise HTTPException(400, "Prompt is required")
    return suggest_screener_expression(
        user_id=user.id,
        prompt=req.prompt.strip(),
        abstraction_level=req.abstraction_level,
    )


@router.post("/assistant/recommend-stocks")
def recommend_stocks(req: RecommendStocksRequest, user: UserInfo = Depends(get_current_user)):
    """
    Generate personalized stock screener expression based on user's full
    financial profile, risk tolerance, goals, and existing portfolio.
    """
    return recommend_stocks_for_user(
        user_id=user.id,
        user_prompt=req.prompt.strip(),
        abstraction_level=req.abstraction_level,
    )


@router.delete("/conversations/{conv_id}")
def delete_conv(conv_id: str, user: UserInfo = Depends(get_current_user)):
    ok = delete_conversation(conv_id, user.id)
    if not ok:
        raise HTTPException(403, "Only the creator can delete")
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Group Chat
# ---------------------------------------------------------------------------

@router.get("/groups/categories")
def get_categories():
    return get_group_categories()


@router.get("/groups/browse")
def browse_groups(category: Optional[str] = Query(None)):
    return list_public_groups(category)


@router.post("/groups")
def create_new_group(req: NewGroupRequest, user: UserInfo = Depends(get_current_user)):
    return create_group(user.id, req.name, req.category, req.description)


@router.post("/groups/{conv_id}/join")
def join_group_endpoint(conv_id: str, user: UserInfo = Depends(get_current_user)):
    ok = join_group(conv_id, user.id)
    if not ok:
        raise HTTPException(404, "Group not found")
    # Insert a system message so the group sees someone joined
    insert_message(
        conversation_id=conv_id,
        sender_id="system",
        sender_name="System",
        content=f"{user.name} joined the group",
        metadata={"system_event": "member_joined", "user_id": user.id},
    )
    conv = get_conversation(conv_id)
    return {"status": "joined", "conversation": conv}


@router.post("/groups/{conv_id}/leave")
def leave_group_endpoint(conv_id: str, user: UserInfo = Depends(get_current_user)):
    ok = leave_group(conv_id, user.id)
    return {"status": "left"}


@router.get("/groups/{conv_id}/members")
def get_members(conv_id: str, user: UserInfo = Depends(get_current_user)):
    return list_group_members(conv_id)


# ---------------------------------------------------------------------------
# Folders
# ---------------------------------------------------------------------------

@router.post("/folders")
def create_chat_folder(req: NewFolderRequest, user: UserInfo = Depends(get_current_user)):
    return create_folder(user.id, req.name)


@router.get("/folders")
def get_chat_folders(user: UserInfo = Depends(get_current_user)):
    return list_folders(user.id)


@router.post("/folders/{folder_id}/add")
def add_to_chat_folder(folder_id: str, req: FolderItemRequest, user: UserInfo = Depends(get_current_user)):
    add_to_folder(folder_id, req.conversation_id)
    return {"status": "added"}


@router.post("/folders/{folder_id}/remove")
def remove_from_chat_folder(folder_id: str, req: FolderItemRequest, user: UserInfo = Depends(get_current_user)):
    remove_from_folder(folder_id, req.conversation_id)
    return {"status": "removed"}


@router.delete("/folders/{folder_id}")
def delete_chat_folder(folder_id: str, user: UserInfo = Depends(get_current_user)):
    delete_folder(folder_id, user.id)
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------

@router.post("/conversations/{conv_id}/upload")
async def upload_attachment(
    conv_id: str,
    file: UploadFile = File(...),
    user: UserInfo = Depends(get_current_user),
):
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:  # 20MB limit
        raise HTTPException(413, "File too large (max 20MB)")

    # First create a placeholder message
    msg = send_ai_message(user.id, user.name, conv_id, f"[Sent {file.filename}]")

    att = save_chat_attachment(msg["id"], file.filename, content, file.content_type or "application/octet-stream")
    return {"message": msg, "attachment": att}


@router.get("/attachments/{att_id}/file")
def serve_attachment(att_id: str, token: Optional[str] = Query(None)):
    """Serve an attachment file by ID. Accepts token as query param for img src."""
    from database import pg_cursor
    import jwt
    from config import settings
    from storage import get_bytes
    # Verify auth via query param (for img src tags)
    if not token:
        raise HTTPException(401, "Token required")
    try:
        jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
    except Exception:
        raise HTTPException(401, "Invalid token")
    with pg_cursor() as cur:
        cur.execute("SELECT * FROM attachments WHERE id = %s", (att_id,))
        att = cur.fetchone()
    if not att:
        raise HTTPException(404, "Attachment not found")
    try:
        content = get_bytes(att["file_path"])
    except FileNotFoundError:
        raise HTTPException(404, "Attachment not found in storage")
    return Response(content=content, media_type=att["mime_type"], headers={
        "Content-Disposition": f'inline; filename="{att["filename"]}"',
    })


# ---------------------------------------------------------------------------
# Context (debug / introspection)
# ---------------------------------------------------------------------------

@router.get("/context")
def get_my_context(user: UserInfo = Depends(get_current_user)):
    """Return the current user's AI context document."""
    context, summary = get_or_build_context(user.id, max_age_seconds=60)
    return {"context": context, "summary": summary}


@router.post("/context/rebuild")
def rebuild_context(user: UserInfo = Depends(get_current_user)):
    """Force rebuild the user's context."""
    context = build_user_context(user.id)
    return {"status": "rebuilt", "context": context}
