"""
Chat Service — orchestration layer.

Coordinates between models (SQLite), AI service (Gemma), and context builder.
Provides the high-level operations consumed by the router and WebSocket handler.
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from typing import Optional, List

from storage import put_bytes
from chat.models import (
    create_conversation,
    get_conversation,
    list_conversations,
    archive_conversation,
    delete_conversation,
    join_group,
    leave_group,
    list_group_members,
    list_public_groups,
    insert_message,
    list_messages,
    count_messages,
    create_folder,
    list_folders,
    add_to_folder,
    remove_from_folder,
    delete_folder,
    get_conversation_summary,
    insert_attachment,
)
from chat.context import build_user_context, get_or_build_context
from chat.ai_service import (
    stream_ai_response,
    summarize_conversation,
    should_engage_group,
    generate_group_response,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# AI Private Chat
# ---------------------------------------------------------------------------

def start_ai_chat(user_id: str, name: str = "") -> dict:
    """Start a new private AI conversation."""
    if not name:
        name = f"Chat {time.strftime('%b %d, %I:%M %p')}"

    conv = create_conversation(
        conv_type="ai_private",
        name=name,
        created_by=user_id,
        description="Private conversation with Paloor AI",
    )

    # Refresh context in the background so chat creation returns quickly.
    try:
        from threading import Thread

        Thread(target=build_user_context, args=(user_id,), daemon=True).start()
    except Exception:
        logger.warning("Background context refresh failed to start", exc_info=True)

    return conv


def send_ai_message(user_id: str, user_name: str, conversation_id: str, content: str) -> dict:
    """
    Record a user message and return it. AI response is handled via WebSocket streaming.
    """
    msg = insert_message(
        conversation_id=conversation_id,
        sender_id=user_id,
        sender_name=user_name,
        content=content,
        is_ai_generated=False,
    )

    # Check if it's time to rebuild context (every 5 messages)
    msg_count = count_messages(conversation_id)
    if msg_count % 5 == 0:
        build_user_context(user_id)

    return msg


def save_ai_response(conversation_id: str, content: str, metadata: dict = None) -> dict:
    """Save the completed AI response as a message."""
    msg = insert_message(
        conversation_id=conversation_id,
        sender_id="paloor_ai",
        sender_name="Paloor AI",
        content=content,
        is_ai_generated=True,
        metadata=metadata,
    )
    return msg


# ---------------------------------------------------------------------------
# Group Chat
# ---------------------------------------------------------------------------

GROUP_CATEGORIES = [
    {"key": "school", "label": "School & Alumni", "description": "Connect with classmates and alumni"},
    {"key": "company", "label": "Company & Work", "description": "Chat with coworkers and industry peers"},
    {"key": "city", "label": "City & Region", "description": "Local financial discussions"},
    {"key": "equities", "label": "Equities & Stocks", "description": "Stock market discussions"},
    {"key": "bonds", "label": "Bonds & Fixed Income", "description": "Bond market and fixed income"},
    {"key": "real_estate", "label": "Real Estate", "description": "Property investing and market trends"},
    {"key": "crypto", "label": "Crypto & Digital", "description": "Cryptocurrency and blockchain"},
    {"key": "tax", "label": "Tax Strategy", "description": "Tax planning and optimization"},
    {"key": "retirement", "label": "Retirement Planning", "description": "401k, IRA, pension strategies"},
    {"key": "general", "label": "General Finance", "description": "Open financial discussions"},
]


def get_group_categories() -> List[dict]:
    return GROUP_CATEGORIES


def create_group(
    user_id: str,
    name: str,
    category: str,
    description: str = "",
) -> dict:
    """Create a new group chat."""
    conv = create_conversation(
        conv_type="group",
        name=name,
        created_by=user_id,
        description=description,
        category=category,
    )
    return conv


def send_group_message(
    user_id: str,
    user_name: str,
    conversation_id: str,
    content: str,
) -> tuple[dict, Optional[str], Optional[str]]:
    """
    Send a message in a group chat.
    Returns: (message, ai_public_response, ai_private_nudge)
    The AI may decide to respond publicly or nudge the user privately.
    """
    msg = insert_message(
        conversation_id=conversation_id,
        sender_id=user_id,
        sender_name=user_name,
        content=content,
        is_ai_generated=False,
    )

    # AI observation pipeline
    ai_public = None
    ai_private = None

    conv = get_conversation(conversation_id)
    topic = conv.get("category", "general") if conv else "general"

    try:
        decision = should_engage_group(content, conversation_id, user_id, topic)
        logger.info("AI group decision for msg %s: %s", msg["id"], decision)

        if decision == "PUBLIC":
            ai_response = generate_group_response(content, conversation_id, user_id, "PUBLIC", topic)
            if ai_response:
                ai_msg = insert_message(
                    conversation_id=conversation_id,
                    sender_id="paloor_ai",
                    sender_name="Paloor AI",
                    content=ai_response,
                    is_ai_generated=True,
                )
                ai_public = ai_response

        elif decision == "PRIVATE":
            ai_nudge = generate_group_response(content, conversation_id, user_id, "PRIVATE", topic)
            if ai_nudge:
                ai_private = ai_nudge
                # We don't insert private nudges as group messages
                # They're delivered via WebSocket to the specific user
    except Exception as e:
        logger.error("AI group engagement error: %s", e)

    return msg, ai_public, ai_private


def save_chat_attachment(message_id: str, filename: str, content: bytes, mime_type: str) -> dict:
    """Save a file attachment for a chat message."""
    ext = os.path.splitext(filename)[1]
    object_key = f"chat/chat_{uuid.uuid4().hex[:8]}{ext}"
    put_bytes(object_key, content, mime_type)

    att = insert_attachment(
        message_id=message_id,
        att_type=_detect_type(mime_type),
        filename=filename,
        mime_type=mime_type,
        file_path=object_key,
        size=len(content),
    )
    return att


def _detect_type(mime_type: str) -> str:
    if mime_type.startswith("image/"):
        return "image"
    elif mime_type == "application/pdf":
        return "document"
    return "file"


# ---------------------------------------------------------------------------
# Seed default groups (called on startup)
# ---------------------------------------------------------------------------

DEFAULT_GROUPS = [
    {"name": "Equities & Market Talk", "category": "equities",
     "description": "Discuss stocks, ETFs, and market movements. Share analysis and ask questions."},
    {"name": "Real Estate Investors", "category": "real_estate",
     "description": "Property investing, rental income, REITs, and market trends."},
    {"name": "Tax Strategy Forum", "category": "tax",
     "description": "Tax planning tips, deductions, credits, and optimization strategies."},
    {"name": "Retirement & FIRE", "category": "retirement",
     "description": "401(k), IRA, pension planning, and financial independence discussions."},
    {"name": "Crypto & Digital Assets", "category": "crypto",
     "description": "Bitcoin, Ethereum, DeFi, and digital asset discussions."},
    {"name": "Economics & Macro", "category": "general",
     "description": "Macroeconomic trends, Fed policy, interest rates, and global markets."},
]


def seed_default_groups():
    """Create default public groups if they don't exist."""
    existing = list_public_groups()
    existing_names = {g["name"] for g in existing}
    for group in DEFAULT_GROUPS:
        if group["name"] not in existing_names:
            create_conversation(
                conv_type="group",
                name=group["name"],
                created_by="system",
                description=group["description"],
                category=group["category"],
            )
            logger.info("Seeded default group: %s", group["name"])
