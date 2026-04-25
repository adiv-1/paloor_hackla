"""
ElevenLabs voice integration: text-to-speech + speech-to-text.

Reads ELEVENLABS_API_KEY from settings (loaded via AWS Secrets Manager in prod,
.env locally). Calls api.elevenlabs.io directly via httpx — no SDK needed.
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)

ELEVEN_BASE = "https://api.elevenlabs.io/v1"
TTS_TIMEOUT = 30.0
STT_TIMEOUT = 60.0


class VoiceUnavailable(RuntimeError):
    """Raised when no API key is configured or the upstream call fails."""


def _api_key() -> str:
    key = (settings.elevenlabs_api_key or "").strip()
    if not key:
        raise VoiceUnavailable("ELEVENLABS_API_KEY not configured")
    return key


def synthesize(text: str, voice_id: Optional[str] = None) -> bytes:
    """Return audio/mpeg bytes for the given text."""
    text = (text or "").strip()
    if not text:
        raise VoiceUnavailable("empty text")
    # Trim to keep latency / cost reasonable for short narration.
    if len(text) > 1200:
        text = text[:1200].rsplit(" ", 1)[0] + "…"
    vid = voice_id or settings.elevenlabs_voice_id
    url = f"{ELEVEN_BASE}/text-to-speech/{vid}"
    headers = {
        "xi-api-key": _api_key(),
        "accept": "audio/mpeg",
        "content-type": "application/json",
    }
    payload = {
        "text": text,
        "model_id": settings.elevenlabs_model_id,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }
    try:
        with httpx.Client(timeout=TTS_TIMEOUT) as client:
            resp = client.post(url, headers=headers, json=payload)
        if resp.status_code != 200:
            raise VoiceUnavailable(f"TTS failed {resp.status_code}: {resp.text[:200]}")
        return resp.content
    except httpx.HTTPError as e:
        raise VoiceUnavailable(f"TTS network error: {e}") from e


def transcribe(audio_bytes: bytes, mime: str = "audio/webm") -> str:
    """Return transcript text for the given audio bytes."""
    if not audio_bytes:
        raise VoiceUnavailable("empty audio")
    url = f"{ELEVEN_BASE}/speech-to-text"
    headers = {"xi-api-key": _api_key()}
    files = {"file": ("audio.webm", audio_bytes, mime)}
    data = {"model_id": "scribe_v1"}
    try:
        with httpx.Client(timeout=STT_TIMEOUT) as client:
            resp = client.post(url, headers=headers, files=files, data=data)
        if resp.status_code != 200:
            raise VoiceUnavailable(f"STT failed {resp.status_code}: {resp.text[:200]}")
        body = resp.json()
        return (body.get("text") or "").strip()
    except httpx.HTTPError as e:
        raise VoiceUnavailable(f"STT network error: {e}") from e
