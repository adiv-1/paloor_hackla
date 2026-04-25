"""
Chat persistence layer — PostgreSQL.

Tables:
  conversations — AI private chats + group chats
  conversation_members — who is in each group
  messages — all messages (user, AI, system)
  attachments — files/images per message
  user_contexts — ambient AI context document per user
  chat_folders — user-created folders for organizing chats
  chat_folder_items — mapping of conversations to folders
"""
from __future__ import annotations

import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from database import pg_cursor

logger = logging.getLogger(__name__)


def _gen_id(prefix: str = "chat") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ---------------------------------------------------------------------------
# Conversation CRUD
# ---------------------------------------------------------------------------

def create_conversation(
    conv_type: str,
    name: str,
    created_by: str,
    description: str = "",
    category: str = "",
    metadata: dict = None,
) -> dict:
    conv_id = _gen_id("conv")
    now = datetime.now(timezone.utc)
    with pg_cursor() as cur:
        cur.execute(
            """INSERT INTO conversations
               (id, type, name, description, category, created_by, created_at, last_message_at, metadata)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (conv_id, conv_type, name, description, category, created_by, now, now, json.dumps(metadata or {})),
        )
        role = "admin" if conv_type == "group" else "member"
        cur.execute(
            """INSERT INTO conversation_members (conversation_id, user_id, role, joined_at)
               VALUES (%s, %s, %s, %s)""",
            (conv_id, created_by, role, now),
        )
    return get_conversation(conv_id)


def get_conversation(conv_id: str) -> Optional[dict]:
    with pg_cursor() as cur:
        cur.execute("SELECT * FROM conversations WHERE id = %s", (conv_id,))
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["metadata"] = d.get("metadata") or {}
        cur.execute(
            "SELECT COUNT(*) as cnt FROM conversation_members WHERE conversation_id = %s", (conv_id,)
        )
        d["member_count"] = cur.fetchone()["cnt"]
        return d


def list_conversations(user_id: str, conv_type: str = None, include_archived: bool = False) -> List[dict]:
    with pg_cursor() as cur:
        sql = """
            SELECT
                c.*, cm.position,
                lm.content AS last_content,
                lm.sender_name AS last_sender_name,
                lm.is_ai_generated AS last_is_ai_generated
            FROM conversations c
            JOIN conversation_members cm ON c.id = cm.conversation_id
            LEFT JOIN LATERAL (
                SELECT content, sender_name, is_ai_generated
                FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY created_at DESC
                LIMIT 1
            ) lm ON TRUE
            WHERE cm.user_id = %s
        """
        params: list = [user_id]
        if conv_type:
            sql += " AND c.type = %s"
            params.append(conv_type)
        if not include_archived:
            sql += " AND c.is_archived = FALSE"
        sql += " ORDER BY CASE WHEN cm.position > 0 THEN 0 ELSE 1 END, cm.position ASC, c.last_message_at DESC"
        cur.execute(sql, params)
        rows = cur.fetchall()
        results = []
        for row in rows:
            d = dict(row)
            d["metadata"] = d.get("metadata") or {}
            last_content = d.pop("last_content", None)
            last_sender_name = d.pop("last_sender_name", None)
            last_is_ai_generated = d.pop("last_is_ai_generated", None)
            if last_content is None:
                d["last_message"] = None
            else:
                d["last_message"] = {
                    "content": last_content,
                    "sender_name": last_sender_name,
                    "is_ai_generated": last_is_ai_generated,
                }
            results.append(d)
        return results


def archive_conversation(conv_id: str, user_id: str) -> bool:
    with pg_cursor() as cur:
        cur.execute(
            "SELECT 1 FROM conversation_members WHERE conversation_id = %s AND user_id = %s",
            (conv_id, user_id),
        )
        if not cur.fetchone():
            return False
        cur.execute("UPDATE conversations SET is_archived = TRUE WHERE id = %s", (conv_id,))
        return True


def delete_conversation(conv_id: str, user_id: str) -> bool:
    with pg_cursor() as cur:
        cur.execute("SELECT created_by FROM conversations WHERE id = %s", (conv_id,))
        row = cur.fetchone()
        if not row or row["created_by"] != user_id:
            return False
        cur.execute("DELETE FROM chat_folder_items WHERE conversation_id = %s", (conv_id,))
        cur.execute("DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = %s)", (conv_id,))
        cur.execute("DELETE FROM messages WHERE conversation_id = %s", (conv_id,))
        cur.execute("DELETE FROM conversation_members WHERE conversation_id = %s", (conv_id,))
        cur.execute("DELETE FROM conversations WHERE id = %s", (conv_id,))
        return True


def reorder_conversations(user_id: str, conversation_ids: List[str]) -> bool:
    with pg_cursor() as cur:
        for idx, conv_id in enumerate(conversation_ids, start=1):
            cur.execute(
                "UPDATE conversation_members SET position = %s WHERE conversation_id = %s AND user_id = %s",
                (idx, conv_id, user_id),
            )
        return True


# ---------------------------------------------------------------------------
# Group membership
# ---------------------------------------------------------------------------

def join_group(conv_id: str, user_id: str) -> bool:
    with pg_cursor() as cur:
        cur.execute("SELECT type FROM conversations WHERE id = %s", (conv_id,))
        row = cur.fetchone()
        if not row or row["type"] != "group":
            return False
        cur.execute(
            "INSERT INTO conversation_members (conversation_id, user_id, role, joined_at) VALUES (%s, %s, 'member', %s) ON CONFLICT DO NOTHING",
            (conv_id, user_id, datetime.now(timezone.utc)),
        )
        return True


def leave_group(conv_id: str, user_id: str) -> bool:
    with pg_cursor() as cur:
        cur.execute(
            "DELETE FROM conversation_members WHERE conversation_id = %s AND user_id = %s",
            (conv_id, user_id),
        )
        return True


def list_group_members(conv_id: str) -> List[dict]:
    with pg_cursor() as cur:
        cur.execute(
            "SELECT user_id, role, joined_at, ai_nudge_enabled FROM conversation_members WHERE conversation_id = %s",
            (conv_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def list_public_groups(category: str = None) -> List[dict]:
    with pg_cursor() as cur:
        sql = "SELECT * FROM conversations WHERE type = 'group'"
        params: list = []
        if category:
            sql += " AND category = %s"
            params.append(category)
        sql += " ORDER BY last_message_at DESC"
        cur.execute(sql, params)
        rows = cur.fetchall()
        results = []
        for row in rows:
            d = dict(row)
            d["metadata"] = d.get("metadata") or {}
            cur.execute(
                "SELECT COUNT(*) as cnt FROM conversation_members WHERE conversation_id = %s", (d["id"],)
            )
            d["member_count"] = cur.fetchone()["cnt"]
            results.append(d)
        return results


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

def insert_message(
    conversation_id: str,
    sender_id: str,
    sender_name: str,
    content: str,
    is_ai_generated: bool = False,
    is_private_nudge: bool = False,
    reply_to: str = None,
    metadata: dict = None,
) -> dict:
    msg_id = _gen_id("msg")
    now = datetime.now(timezone.utc)
    with pg_cursor() as cur:
        cur.execute(
            """INSERT INTO messages
               (id, conversation_id, sender_id, sender_name, content, reply_to, is_ai_generated, is_private_nudge, created_at, metadata)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (msg_id, conversation_id, sender_id, sender_name, content, reply_to,
             is_ai_generated, is_private_nudge, now, json.dumps(metadata or {})),
        )
        cur.execute("UPDATE conversations SET last_message_at = %s WHERE id = %s", (now, conversation_id))
    return get_message(msg_id)


def get_message(msg_id: str) -> Optional[dict]:
    with pg_cursor() as cur:
        cur.execute("SELECT * FROM messages WHERE id = %s", (msg_id,))
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["metadata"] = d.get("metadata") or {}
        cur.execute("SELECT * FROM attachments WHERE message_id = %s", (msg_id,))
        d["attachments"] = [dict(a) for a in cur.fetchall()]
        return d


def list_messages(conversation_id: str, limit: int = 50, before: float = None) -> List[dict]:
    with pg_cursor() as cur:
        sql = "SELECT * FROM messages WHERE conversation_id = %s"
        params: list = [conversation_id]
        if before:
            sql += " AND created_at < to_timestamp(%s)"
            params.append(before)
        sql += " ORDER BY created_at DESC LIMIT %s"
        params.append(limit)
        cur.execute(sql, params)
        rows = cur.fetchall()
        results = []
        msg_ids = []
        msg_map = {}
        for row in reversed(rows):
            d = dict(row)
            d["metadata"] = d.get("metadata") or {}
            d["attachments"] = []
            results.append(d)
            msg_ids.append(d["id"])
            msg_map[d["id"]] = d
        # Batch-load attachments for all messages at once
        if msg_ids:
            cur.execute("SELECT * FROM attachments WHERE message_id = ANY(%s)", (msg_ids,))
            for att_row in cur.fetchall():
                att = dict(att_row)
                mid = att["message_id"]
                if mid in msg_map:
                    msg_map[mid]["attachments"].append(att)
        return results


def count_messages(conversation_id: str) -> int:
    with pg_cursor() as cur:
        cur.execute("SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = %s", (conversation_id,))
        return cur.fetchone()["cnt"]


# ---------------------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------------------

def insert_attachment(message_id: str, att_type: str, filename: str, mime_type: str,
                      file_path: str, size: int, thumbnail_path: str = None) -> dict:
    att_id = _gen_id("att")
    with pg_cursor() as cur:
        cur.execute(
            """INSERT INTO attachments (id, message_id, type, filename, mime_type, file_path, size, thumbnail_path)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (att_id, message_id, att_type, filename, mime_type, file_path, size, thumbnail_path),
        )
    return {"id": att_id, "type": att_type, "filename": filename, "mime_type": mime_type,
            "file_path": file_path, "size": size, "thumbnail_path": thumbnail_path}


# ---------------------------------------------------------------------------
# User Context — the ambient AI memory
# ---------------------------------------------------------------------------

def get_user_context(user_id: str) -> Optional[dict]:
    with pg_cursor() as cur:
        cur.execute("SELECT * FROM user_contexts WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["context"] = d.get("context") or {}
        return d


def upsert_user_context(user_id: str, context: dict, summary: str) -> dict:
    now = datetime.now(timezone.utc)
    with pg_cursor() as cur:
        cur.execute("SELECT 1 FROM user_contexts WHERE user_id = %s", (user_id,))
        if cur.fetchone():
            cur.execute(
                "UPDATE user_contexts SET context = %s, summary = %s, updated_at = %s WHERE user_id = %s",
                (json.dumps(context), summary, now, user_id),
            )
        else:
            cur.execute(
                "INSERT INTO user_contexts (user_id, context, summary, updated_at) VALUES (%s, %s, %s, %s)",
                (user_id, json.dumps(context), summary, now),
            )
    return {"user_id": user_id, "context": context, "summary": summary, "updated_at": now.isoformat()}


# ---------------------------------------------------------------------------
# Folders
# ---------------------------------------------------------------------------

def create_folder(user_id: str, name: str) -> dict:
    folder_id = _gen_id("folder")
    now = datetime.now(timezone.utc)
    with pg_cursor() as cur:
        cur.execute(
            "INSERT INTO chat_folders (id, user_id, name, created_at) VALUES (%s, %s, %s, %s)",
            (folder_id, user_id, name, now),
        )
    return {"id": folder_id, "user_id": user_id, "name": name, "created_at": now.isoformat()}


def list_folders(user_id: str) -> List[dict]:
    with pg_cursor() as cur:
        cur.execute("SELECT * FROM chat_folders WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
        rows = cur.fetchall()
        results = []
        for row in rows:
            d = dict(row)
            cur.execute(
                "SELECT conversation_id FROM chat_folder_items WHERE folder_id = %s", (d["id"],)
            )
            d["conversation_ids"] = [i["conversation_id"] for i in cur.fetchall()]
            results.append(d)
        return results


def add_to_folder(folder_id: str, conversation_id: str) -> bool:
    with pg_cursor() as cur:
        cur.execute(
            "INSERT INTO chat_folder_items (folder_id, conversation_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (folder_id, conversation_id),
        )
        return True


def remove_from_folder(folder_id: str, conversation_id: str) -> bool:
    with pg_cursor() as cur:
        cur.execute(
            "DELETE FROM chat_folder_items WHERE folder_id = %s AND conversation_id = %s",
            (folder_id, conversation_id),
        )
        return True


def delete_folder(folder_id: str, user_id: str) -> bool:
    with pg_cursor() as cur:
        cur.execute("DELETE FROM chat_folder_items WHERE folder_id = %s", (folder_id,))
        cur.execute("DELETE FROM chat_folders WHERE id = %s AND user_id = %s", (folder_id, user_id))
        return True


# ---------------------------------------------------------------------------
# Conversation history summary for AI context (last N messages, condensed)
# ---------------------------------------------------------------------------

def get_conversation_summary(conversation_id: str, limit: int = 20) -> str:
    """Return last N messages formatted as a short conversation log."""
    messages = list_messages(conversation_id, limit=limit)
    lines = []
    for m in messages:
        who = "AI" if m["is_ai_generated"] else m["sender_name"] or "User"
        content = m["content"][:300]
        lines.append(f"[{who}]: {content}")
    return "\n".join(lines)
