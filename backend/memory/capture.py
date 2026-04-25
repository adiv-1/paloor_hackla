"""
Auto-Capture — Extract memorable facts from conversations and documents.

After every AI response, this module analyzes the exchange and extracts
new facts worth remembering. Uses the LLM to decide what's important,
then deduplicates against existing memories before storing.

Categories:
  profile_fact          — personal info (job, family, location)
  financial_decision    — decisions made or mentioned
  preference            — stated preferences (risk, investment style)
  goal                  — financial or life goals
  document_insight      — key facts from uploaded documents
  conversation_topic    — topics discussed
  action_taken          — actions the user took in the platform
"""
from __future__ import annotations

import json
import logging
import re
from typing import List, Optional

from memory.store import (
    store_memory,
    find_similar_memory,
    update_memory,
    count_memories,
)
from memory.embeddings import embed_text, vec_to_bytes

logger = logging.getLogger(__name__)

VALID_CATEGORIES = frozenset({
    "profile_fact",
    "financial_decision",
    "preference",
    "goal",
    "document_insight",
    "conversation_topic",
    "action_taken",
})

MAX_MEMORIES_PER_USER = 500

EXTRACTION_PROMPT = """Analyze this conversation exchange and extract any NEW facts worth remembering about the user.

RULES:
- Each fact must be a single, self-contained sentence.
- Only extract CONCRETE facts, not vague observations.
- Focus on: personal details, financial decisions, preferences, goals, actions taken.
- Do NOT extract facts that are generic advice or AI responses.
- Do NOT extract facts already known from the existing profile summary below.
- If there's nothing worth remembering, return an empty array.

CATEGORIES (use exactly one per fact):
- profile_fact: personal information (job changes, family events, location, education)
- financial_decision: specific financial decisions or plans
- preference: stated preferences about investing, risk, spending
- goal: financial or life goals mentioned
- conversation_topic: significant topics discussed
- action_taken: actions the user took on the platform

USER'S EXISTING PROFILE:
{existing_summary}

CONVERSATION EXCHANGE:
User: {user_message}
AI: {ai_response}

Return ONLY a JSON array. Each element: {{"content": "...", "category": "...", "importance": 0.0-1.0}}
If nothing worth remembering, return: []"""


def extract_and_store(
    user_id: str,
    user_message: str,
    ai_response: str,
    existing_summary: str = "",
    source: str = "chat",
    source_id: str = "",
) -> List[dict]:
    """
    Extract memorable facts from a conversation exchange and store them.
    Called asynchronously after every AI response.
    """
    if not user_message or not ai_response:
        return []
    if len(user_message) < 10 and len(ai_response) < 50:
        return []

    current_count = count_memories(user_id)
    if current_count >= MAX_MEMORIES_PER_USER:
        logger.info("Memory limit reached for user %s (%d)", user_id, current_count)
        return []

    prompt = EXTRACTION_PROMPT.format(
        existing_summary=existing_summary[:1500] if existing_summary else "(New user)",
        user_message=user_message[:1000],
        ai_response=ai_response[:1000],
    )

    raw = _call_llm(prompt, max_tokens=400)
    if not raw:
        return []

    facts = _parse_json_array(raw)
    if not facts:
        return []

    stored = []
    for fact in facts:
        content = str(fact.get("content", "")).strip()
        category = str(fact.get("category", "conversation_topic")).strip()
        importance = float(fact.get("importance", 0.5))

        if not content or len(content) < 5:
            continue
        if category not in VALID_CATEGORIES:
            category = "conversation_topic"
        importance = max(0.0, min(1.0, importance))

        # Dedup
        existing = find_similar_memory(user_id, content)
        if existing:
            if importance > existing.get("importance", 0):
                update_memory(existing["id"], importance=importance)
            continue

        vec = embed_text(content)
        embedding_bytes = vec_to_bytes(vec) if vec is not None else None

        result = store_memory(
            user_id=user_id,
            content=content,
            category=category,
            source=source,
            source_id=source_id,
            importance=importance,
            embedding=embedding_bytes,
        )
        stored.append(result)

    if stored:
        logger.info("Captured %d memories for user %s", len(stored), user_id)
    return stored


def capture_document_facts(
    user_id: str,
    document_id: str,
    document_type: str,
    extracted_fields: List[dict],
) -> List[dict]:
    """
    Store memorable facts derived from a document upload.
    Uses the extracted OCR fields directly instead of calling the LLM.
    """
    field_parts = []
    for f in extracted_fields:
        key = f.get("key", "")
        value = f.get("value", "")
        if key and value:
            # Redact sensitive values before storing as memory
            if key in ("ssn", "social_security_number") and len(value) > 4:
                value = "***-**-" + value[-4:]
            field_parts.append(f"{key}: {value}")

    if not field_parts:
        return []

    label = document_type.replace("_", " ")
    content = f"User uploaded a {label}. Key data: {'; '.join(field_parts[:10])}"

    # Dedup
    if find_similar_memory(user_id, content):
        return []

    vec = embed_text(content)
    embedding_bytes = vec_to_bytes(vec) if vec is not None else None

    result = store_memory(
        user_id=user_id,
        content=content,
        category="document_insight",
        source="document_upload",
        source_id=document_id,
        importance=0.6,
        embedding=embedding_bytes,
    )
    return [result]


# ---------------------------------------------------------------------------
# LLM helper (uses lightweight models for extraction)
# ---------------------------------------------------------------------------

def _call_llm(prompt: str, max_tokens: int = 400) -> Optional[str]:
    try:
        from google import genai
        from config import settings

        if not settings.gemini_api_key:
            return None

        client = genai.Client(api_key=settings.gemini_api_key)
        # Use smaller/cheaper models for memory extraction
        models = ["gemma-3-12b-it", "gemini-2.0-flash"]

        for model_name in models:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config={
                        "temperature": 0.1,
                        "max_output_tokens": max_tokens,
                    },
                )
                if response and response.text:
                    return response.text
            except Exception as e:
                logger.warning("Memory LLM error on %s: %s", model_name, e)
                continue
        return None
    except Exception as e:
        logger.warning("Memory extraction failed: %s", e)
        return None


def _parse_json_array(raw: str) -> List[dict]:
    """Parse LLM output as JSON array, handling markdown code fences."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        result = json.loads(text)
        if isinstance(result, list):
            return result
        return []
    except json.JSONDecodeError:
        match = re.search(r"\[.*\]", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        return []
