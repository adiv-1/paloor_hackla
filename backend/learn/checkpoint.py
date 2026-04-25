"""
AI checkpoints and post-simulation feedback for the learning loop.

Soft checkpoint: AI evaluates a free-text response and gives conversational
feedback. The user always proceeds — the score is hidden and stored for
analytics, never used as a hard gate.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Optional

import boto3

logger = logging.getLogger(__name__)

BEDROCK_REGION = "us-east-1"
# Use a fast, cheap model for checkpoints — short turn-around matters more than depth.
CHECKPOINT_MODELS = [
    "us.amazon.nova-lite-v1:0",
    "us.meta.llama4-maverick-17b-instruct-v1:0",
    "us.anthropic.claude-haiku-4-5-20251001-v1:0",
]

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)
    return _client


def _converse(system_text: str, user_text: str, max_tokens: int = 400) -> str:
    """Run a single non-streaming Converse turn against the first available model."""
    client = _get_client()
    messages = [{"role": "user", "content": [{"text": user_text}]}]
    last_err: Optional[Exception] = None
    for model_id in CHECKPOINT_MODELS:
        try:
            resp = client.converse(
                modelId=model_id,
                system=[{"text": system_text}],
                messages=messages,
                inferenceConfig={"maxTokens": max_tokens, "temperature": 0.5},
            )
            blocks = resp.get("output", {}).get("message", {}).get("content", [])
            text = "".join(b.get("text", "") for b in blocks if "text" in b)
            return _strip_thinking(text).strip()
        except Exception as e:
            last_err = e
            logger.warning("learn.checkpoint model %s failed: %s", model_id, e)
            continue
    raise RuntimeError(f"All checkpoint models failed: {last_err}")


_THINKING_RE = re.compile(r"<thinking>.*?</thinking>\s*", re.DOTALL)
_SCORE_RE = re.compile(r"SCORE\s*=\s*(\d{1,3})", re.IGNORECASE)


def _strip_thinking(text: str) -> str:
    return _THINKING_RE.sub("", text)


def _extract_score(text: str, default: int = 50) -> int:
    m = _SCORE_RE.search(text or "")
    if not m:
        return default
    try:
        return max(0, min(100, int(m.group(1))))
    except ValueError:
        return default


def evaluate_checkpoint(
    module_title: str,
    concept: str,
    key_ideas: list[str],
    question: str,
    user_response: str,
) -> dict:
    """
    Soft checkpoint evaluation. Returns:
        {
          "feedback": str,       # warm tutor reply for the user
          "hidden_score": int,   # 0-100, stored for analytics, not shown
          "key_ideas_hit": list[str],
        }
    """
    system = (
        "You are a warm, encouraging finance tutor — never use the word 'test', 'quiz', or 'grade'. "
        "Talk like a friend who knows the material. Two short paragraphs max. "
        "First paragraph: reflect what the user understood. "
        "Second paragraph: gently fill in any gap with one concrete example. "
        "Do not list the key ideas verbatim — weave them in naturally. "
        "Always end on something the user can take into the next step."
    )
    user_prompt = (
        f"Module: {module_title}\n"
        f"Concept: {concept}\n"
        f"Key ideas the answer should touch on: {'; '.join(key_ideas)}\n"
        f"Tutor question: {question}\n"
        f"User's response: {user_response.strip() or '(empty)'}\n\n"
        "Reply with two short paragraphs of conversational feedback. "
        "On a separate final line, output exactly: SCORE=<integer 0-100> "
        "where 0 = no engagement, 50 = partial intuition, 100 = solid grasp."
    )
    try:
        text = _converse(system, user_prompt)
    except Exception as e:
        logger.error("evaluate_checkpoint failed: %s", e)
        return {
            "feedback": "Nice — let's keep going. (AI feedback isn't reachable right now.)",
            "hidden_score": 50,
            "key_ideas_hit": [],
        }

    score = _extract_score(text)
    cleaned = re.sub(r"\n*SCORE\s*=\s*\d+\s*$", "", text, flags=re.IGNORECASE).strip()

    # Cheap key-idea coverage detection for the response payload.
    hits = []
    lower_response = user_response.lower()
    for idea in key_ideas:
        token = idea.lower().split()[0] if idea else ""
        if token and token in lower_response:
            hits.append(idea)

    return {
        "feedback": cleaned or "Solid attempt — let's keep building on this.",
        "hidden_score": score,
        "key_ideas_hit": hits,
    }


def post_simulation_feedback(
    module_title: str,
    concept: str,
    user_choices: dict,
    sim_outputs: dict,
) -> dict:
    """
    Generate the conversational debrief after a SimTask block.
    Format: what you did → what happened → why → what to try next time.
    """
    system = (
        "You are a finance tutor reviewing a small simulation a learner just ran. "
        "Tone: warm, specific, and concrete. No jargon, no CFA-speak. "
        "Structure your reply as 4 short labeled lines:\n"
        "What you did: ...\n"
        "What happened: ...\n"
        "Why it happened: ...\n"
        "What to try next: ...\n"
        "Each line one sentence. No filler."
    )
    user_prompt = (
        f"Module: {module_title}\n"
        f"Concept: {concept}\n"
        f"User choices: {json.dumps(user_choices, default=str)}\n"
        f"Simulation outputs: {json.dumps(sim_outputs, default=str)}\n\n"
        "Write the four-line debrief now."
    )
    try:
        text = _converse(system, user_prompt, max_tokens=300)
    except Exception as e:
        logger.error("post_simulation_feedback failed: %s", e)
        text = (
            "What you did: ran a quick simulation.\n"
            "What happened: results varied with your allocation.\n"
            "Why it happened: returns and risk move together.\n"
            "What to try next: rerun with a more balanced mix."
        )
    return {"feedback": text.strip()}


# ----------------------------- Multi-turn chat tutor -----------------------------


def chat_turn(
    module_title: str,
    concept: str,
    key_ideas: list[str],
    question: str,
    history: list[dict],
) -> dict:
    """
    One turn of an interactive checkpoint conversation.
    `history` is a list of {role: 'user'|'assistant', text: str} starting with the user.
    Returns {"reply": str, "done": bool, "hidden_score": int}.
    The AI itself decides when the conversation is "done" by emitting DONE=YES
    on its own line. We never force them past a max — they can keep going.
    """
    system = (
        "You are a warm, conversational finance tutor talking 1-on-1 with a learner. "
        "Tone: friend who knows the material. Never say 'test', 'quiz', or 'grade'. "
        "Keep each reply SHORT — 2 to 4 sentences. Ask one curious follow-up question if "
        "the learner only got partway, or affirm and add one concrete example if they got it. "
        "When the learner clearly grasps the key ideas (or has had 3+ exchanges and is plateauing), "
        "wrap up warmly in 1-2 sentences and on a separate final line output exactly: DONE=YES "
        "Otherwise end with DONE=NO. "
        "Always also output on its own final line: SCORE=<integer 0-100> reflecting current grasp."
    )
    convo_lines = [
        f"Module: {module_title}",
        f"Concept: {concept}",
        f"Key ideas to land on: {'; '.join(key_ideas)}",
        f"Opening question you asked: {question}",
        "",
        "Conversation so far:",
    ]
    for turn in history:
        role = "Learner" if turn.get("role") == "user" else "Tutor"
        convo_lines.append(f"{role}: {turn.get('text','').strip()}")
    convo_lines.append("")
    convo_lines.append("Reply now as the Tutor. Remember: short, warm, then DONE=YES/NO and SCORE=<n> on their own lines.")
    user_prompt = "\n".join(convo_lines)

    try:
        text = _converse(system, user_prompt, max_tokens=350)
    except Exception as e:
        logger.error("chat_turn failed: %s", e)
        return {
            "reply": "Hmm, I'm having trouble thinking right now — but you're on the right track. Want to keep going?",
            "done": False,
            "hidden_score": 50,
        }

    score = _extract_score(text)
    done = bool(re.search(r"DONE\s*=\s*YES", text, re.IGNORECASE))
    cleaned = re.sub(r"\n*(DONE\s*=\s*\w+|SCORE\s*=\s*\d+)\s*", "", text, flags=re.IGNORECASE).strip()
    return {
        "reply": cleaned or "Got it — let's keep going.",
        "done": done,
        "hidden_score": score,
    }


# ----------------------------- Glossary explain -----------------------------


def explain_term(term: str, context: str = "", question: str = "") -> str:
    """
    Inline AI explanation for a highlighted word/phrase or a freeform question
    about a span of lesson text. Plain-language, ~2 sentences.
    """
    system = (
        "You are a patient finance tutor. Explain in plain language, "
        "no jargon, 2 short sentences max. If a follow-up question is given, "
        "answer that directly. Never lecture — be conversational."
    )
    parts = []
    if term:
        parts.append(f"Term/phrase the learner highlighted: \"{term.strip()}\"")
    if context:
        parts.append(f"Surrounding lesson context: {context.strip()[:600]}")
    if question:
        parts.append(f"Their question: {question.strip()[:300]}")
    if not parts:
        return "Highlight a word or ask a question and I'll explain."
    parts.append("Reply now — 2 sentences, plain language.")
    try:
        return _converse(system, "\n\n".join(parts), max_tokens=180)
    except Exception as e:
        logger.error("explain_term failed: %s", e)
        return "I can't reach the AI right now — try again in a moment."
