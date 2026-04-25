"""
WebSocket handler for real-time chat.

Manages:
  - Connection lifecycle (connect, disconnect, reconnect)
  - AI response streaming (token-by-token via WebSocket)
  - Group message broadcasting
  - Typing indicators
  - AI nudge delivery (private messages from group observation)

Protocol:
  Client → Server:
    { "type": "message", "conversation_id": "...", "content": "..." }
    { "type": "typing", "conversation_id": "..." }

  Server → Client:
    { "type": "message", "message": {...} }
    { "type": "ai_stream_start", "conversation_id": "..." }
    { "type": "ai_stream_chunk", "conversation_id": "...", "chunk": "..." }
    { "type": "ai_stream_end", "conversation_id": "...", "message": {...} }
    { "type": "ai_nudge", "conversation_id": "...", "content": "..." }
    { "type": "typing", "conversation_id": "...", "user_id": "...", "user_name": "..." }
    { "type": "error", "message": "..." }
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Dict, Set, Optional

from fastapi import WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from config import settings
from auth import SECRET_KEY, ALGORITHM, get_user_record
from chat.models import get_conversation, list_messages, insert_message
from chat.service import send_ai_message, save_ai_response
from chat.ai_service import stream_ai_response, summarize_conversation

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages all active WebSocket connections.

    Tracks:
      - user_id → WebSocket (1:1 for now; can extend to multiple devices)
      - conversation_id → set of user_ids (for group broadcasting)
    """

    def __init__(self):
        self.active: Dict[str, WebSocket] = {}           # user_id → ws
        self.user_info: Dict[str, dict] = {}              # user_id → {name, email}
        self.rooms: Dict[str, Set[str]] = {}              # conversation_id → {user_ids}
        self._last_ai_group_msg: Dict[str, float] = {}   # conv_id → timestamp (throttle)

    async def connect(self, websocket: WebSocket, user_id: str, user_name: str):
        await websocket.accept()
        self.active[user_id] = websocket
        self.user_info[user_id] = {"name": user_name, "id": user_id}
        logger.info("WS connected: %s (%s)", user_name, user_id)

    def disconnect(self, user_id: str):
        self.active.pop(user_id, None)
        self.user_info.pop(user_id, None)
        # Remove from all rooms
        for room in self.rooms.values():
            room.discard(user_id)
        logger.info("WS disconnected: %s", user_id)

    def join_room(self, conversation_id: str, user_id: str):
        if conversation_id not in self.rooms:
            self.rooms[conversation_id] = set()
        self.rooms[conversation_id].add(user_id)

    def leave_room(self, conversation_id: str, user_id: str):
        if conversation_id in self.rooms:
            self.rooms[conversation_id].discard(user_id)

    async def send_to_user(self, user_id: str, data: dict):
        ws = self.active.get(user_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(user_id)

    async def broadcast_to_room(self, conversation_id: str, data: dict, exclude: str = None):
        user_ids = self.rooms.get(conversation_id, set())
        for uid in user_ids:
            if uid != exclude:
                await self.send_to_user(uid, data)


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# WebSocket endpoint handler
# ---------------------------------------------------------------------------

async def chat_websocket(websocket: WebSocket):
    """
    Main WebSocket handler. Authenticates via query param token,
    then dispatches incoming messages to appropriate handlers.
    """
    # Authenticate
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001, reason="Invalid token")
            return
        user = get_user_record(user_id)
        if not user:
            await websocket.close(code=4001, reason="Invalid token")
            return
        user_name = user.get("name", "User")
    except JWTError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await manager.connect(websocket, user_id, user_name)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await manager.send_to_user(user_id, {"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = data.get("type")

            if msg_type == "message":
                await _handle_message(user_id, user_name, data)
            elif msg_type == "typing":
                await _handle_typing(user_id, user_name, data)
            elif msg_type == "join_room":
                conv_id = data.get("conversation_id")
                if conv_id:
                    manager.join_room(conv_id, user_id)
            elif msg_type == "leave_room":
                conv_id = data.get("conversation_id")
                if conv_id:
                    manager.leave_room(conv_id, user_id)
            else:
                await manager.send_to_user(user_id, {"type": "error", "message": f"Unknown type: {msg_type}"})

    except WebSocketDisconnect:
        manager.disconnect(user_id)
    except Exception as e:
        logger.error("WebSocket error for %s: %s", user_id, e)
        manager.disconnect(user_id)


# ---------------------------------------------------------------------------
# Message handlers
# ---------------------------------------------------------------------------

async def _handle_message(user_id: str, user_name: str, data: dict):
    conv_id = data.get("conversation_id")
    content = data.get("content", "").strip()

    if not conv_id or not content:
        await manager.send_to_user(user_id, {"type": "error", "message": "Missing conversation_id or content"})
        return

    conv = get_conversation(conv_id)
    if not conv:
        await manager.send_to_user(user_id, {"type": "error", "message": "Conversation not found"})
        return

    if conv["type"] == "ai_private":
        await _handle_ai_message(user_id, user_name, conv_id, content)
    elif conv["type"] == "group":
        await _handle_group_message(user_id, user_name, conv_id, content)


async def _handle_ai_message(user_id: str, user_name: str, conv_id: str, content: str):
    """Handle a message in an AI private chat — save user msg, stream AI response."""
    # Save user message
    user_msg = send_ai_message(user_id, user_name, conv_id, content)
    await manager.send_to_user(user_id, {"type": "message", "message": user_msg})

    # Signal AI response starting
    await manager.send_to_user(user_id, {"type": "ai_stream_start", "conversation_id": conv_id})

    # Stream AI response
    full_response = ""
    try:
        from chat.ai_service import TOOL_STATUS_PREFIX, CHART_DATA_PREFIX
        async for chunk in stream_ai_response(user_id, conv_id, content):
            if chunk.startswith(TOOL_STATUS_PREFIX):
                await manager.send_to_user(user_id, {
                    "type": "ai_tool_status",
                    "conversation_id": conv_id,
                    "message": chunk[len(TOOL_STATUS_PREFIX):],
                })
            elif chunk.startswith(CHART_DATA_PREFIX):
                import json as _json
                await manager.send_to_user(user_id, {
                    "type": "ai_chart_data",
                    "conversation_id": conv_id,
                    "chart": _json.loads(chunk[len(CHART_DATA_PREFIX):]),
                })
            else:
                full_response += chunk
                await manager.send_to_user(user_id, {
                    "type": "ai_stream_chunk",
                    "conversation_id": conv_id,
                    "chunk": chunk,
                })
    except Exception as e:
        logger.error("AI streaming error: %s", e)
        full_response = "Sorry, I encountered an error generating a response. Please try again."
        await manager.send_to_user(user_id, {
            "type": "ai_stream_chunk",
            "conversation_id": conv_id,
            "chunk": full_response,
        })

    # Save full AI response
    ai_msg = save_ai_response(conv_id, full_response)
    await manager.send_to_user(user_id, {
        "type": "ai_stream_end",
        "conversation_id": conv_id,
        "message": ai_msg,
    })

    # Async: extract and store memories from this exchange (don't block)
    if full_response and not full_response.startswith("Sorry, I encountered"):
        try:
            asyncio.create_task(_async_capture_memory(user_id, conv_id, content, full_response))
        except Exception:
            pass

    # Async: summarize conversation if it's getting long (don't block)
    # This updates the user's context memory
    try:
        from chat.models import count_messages
        msg_count = count_messages(conv_id)
        if msg_count > 0 and msg_count % 10 == 0:
            # Every 10 messages, generate a summary
            asyncio.create_task(_async_summarize(conv_id, user_id))
    except Exception:
        pass


async def _async_summarize(conv_id: str, user_id: str):
    """Background task to summarize conversation and update context."""
    try:
        await asyncio.to_thread(summarize_conversation, conv_id, user_id)
    except Exception as e:
        logger.warning("Async summarize failed: %s", e)


async def _async_capture_memory(user_id: str, conv_id: str, user_message: str, ai_response: str):
    """Background task to extract and store memories from the conversation exchange."""
    try:
        from memory.capture import extract_and_store
        from chat.context import get_or_build_context
        _, summary = get_or_build_context(user_id, max_age_seconds=300)
        await asyncio.to_thread(
            extract_and_store,
            user_id, user_message, ai_response,
            summary or "", "chat", conv_id,
        )
    except Exception as e:
        logger.warning("Async memory capture failed: %s", e)


async def _handle_group_message(user_id: str, user_name: str, conv_id: str, content: str):
    """Handle a message in a group chat — broadcast to all members, AI may respond."""
    # Save message
    msg = insert_message(
        conversation_id=conv_id,
        sender_id=user_id,
        sender_name=user_name,
        content=content,
    )

    # Broadcast to all room members
    await manager.broadcast_to_room(conv_id, {"type": "message", "message": msg})
    # Also send to the sender (confirmation)
    await manager.send_to_user(user_id, {"type": "message", "message": msg})

    # AI group observation (run in background to not block)
    asyncio.create_task(_ai_group_observe(user_id, user_name, conv_id, content))


async def _ai_group_observe(user_id: str, user_name: str, conv_id: str, content: str):
    """Background task: AI observes group message and may respond or nudge."""
    try:
        # Throttle: max 1 AI message per 5 minutes per group
        last_time = manager._last_ai_group_msg.get(conv_id, 0)
        if time.time() - last_time < 300:
            return

        from chat.ai_service import should_engage_group, generate_group_response

        conv = get_conversation(conv_id)
        topic = conv.get("category", "general") if conv else "general"

        decision = await asyncio.to_thread(should_engage_group, content, conv_id, user_id, topic)

        if decision == "PUBLIC":
            response = await asyncio.to_thread(
                generate_group_response, content, conv_id, user_id, "PUBLIC", topic
            )
            if response:
                ai_msg = insert_message(
                    conversation_id=conv_id,
                    sender_id="paloor_ai",
                    sender_name="Paloor AI",
                    content=response,
                    is_ai_generated=True,
                )
                await manager.broadcast_to_room(conv_id, {"type": "message", "message": ai_msg})
                manager._last_ai_group_msg[conv_id] = time.time()

        elif decision == "PRIVATE":
            nudge = await asyncio.to_thread(
                generate_group_response, content, conv_id, user_id, "PRIVATE", topic
            )
            if nudge:
                await manager.send_to_user(user_id, {
                    "type": "ai_nudge",
                    "conversation_id": conv_id,
                    "content": nudge,
                })

    except Exception as e:
        logger.warning("AI group observation error: %s", e)


async def _handle_typing(user_id: str, user_name: str, data: dict):
    conv_id = data.get("conversation_id")
    if conv_id:
        await manager.broadcast_to_room(conv_id, {
            "type": "typing",
            "conversation_id": conv_id,
            "user_id": user_id,
            "user_name": user_name,
        }, exclude=user_id)
