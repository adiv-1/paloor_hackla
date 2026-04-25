"""Speech-to-text service backed by Amazon Transcribe + S3."""
from __future__ import annotations

import json
import logging
import os
import time
import urllib.request
import uuid

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from auth import get_current_user, UserInfo
from config import settings
from storage import put_bytes, delete_object

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/speech", tags=["speech"])

# Try to load Amazon Transcribe
_transcribe_client = None
_transcribe_available = False
_transcribe_region = None


def _get_transcribe_region():
    global _transcribe_region
    if _transcribe_region is not None:
        return _transcribe_region

    region = settings.aws_region or None
    bucket = settings.upload_bucket
    if not bucket:
        _transcribe_region = region
        return _transcribe_region

    try:
        import boto3

        s3 = boto3.client("s3", region_name=region)
        response = s3.get_bucket_location(Bucket=bucket)
        _transcribe_region = response.get("LocationConstraint") or "us-east-1"
    except Exception as e:
        logger.warning("Could not resolve Transcribe bucket region for %s: %s", bucket, e)
        _transcribe_region = region

    return _transcribe_region

def _get_transcribe_client():
    global _transcribe_client
    if _transcribe_client is None:
        import boto3

        _transcribe_client = boto3.client("transcribe", region_name=_get_transcribe_region())
    return _transcribe_client


def _load_transcribe():
    global _transcribe_available
    try:
        _get_transcribe_client()
        _transcribe_available = bool(settings.upload_bucket)
        if _transcribe_available:
            logger.info("Amazon Transcribe client loaded successfully")
        else:
            logger.warning("Speech-to-text unavailable: UPLOAD_BUCKET is not configured")
    except ImportError:
        logger.warning("boto3 is not installed. Speech-to-text will be unavailable.")
        _transcribe_available = False
    except Exception as e:
        logger.warning(f"Failed to load Amazon Transcribe client: {e}")
        _transcribe_available = False


@router.get("/status")
def speech_status():
    """Check if speech-to-text is available."""
    return {
        "available": _transcribe_available,
        "provider": "amazon-transcribe" if _transcribe_available else None,
    }


@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    user: UserInfo = Depends(get_current_user),
):
    """
    Transcribe audio file to text using Amazon Transcribe.
    Accepts: wav, mp3, m4a, webm, ogg, flac
    """
    if not _transcribe_available:
        raise HTTPException(
            503,
            "Speech-to-text is not available. Configure UPLOAD_BUCKET and AWS access for Amazon Transcribe."
        )

    # Validate file type
    allowed_types = {"audio/wav", "audio/mpeg", "audio/mp4", "audio/webm", "audio/ogg", "audio/flac", "audio/x-m4a", "audio/mp3", "video/webm"}
    content_type = file.content_type or ""
    if content_type not in allowed_types and not content_type.startswith("audio/"):
        raise HTTPException(400, f"Unsupported audio format: {content_type}")

    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    format_map = {
        ".wav": "wav",
        ".mp3": "mp3",
        ".m4a": "mp4",
        ".mp4": "mp4",
        ".webm": "webm",
        ".ogg": "ogg",
        ".oga": "ogg",
        ".flac": "flac",
    }
    media_format = format_map.get(suffix.lower())
    if not media_format:
        raise HTTPException(400, f"Unsupported audio file extension: {suffix}")

    job_id = uuid.uuid4().hex[:16]
    object_key = f"whisper-temp/{job_id}{suffix.lower()}"
    job_name = f"paloor-transcribe-{job_id}"

    try:
        content = await file.read()
        put_bytes(object_key, content, file.content_type or "application/octet-stream")

        client = _get_transcribe_client()
        start_time = time.time()
        client.start_transcription_job(
            TranscriptionJobName=job_name,
            Media={"MediaFileUri": f"s3://{settings.upload_bucket}/{object_key}"},
            MediaFormat=media_format,
            LanguageCode="en-US",
        )

        timeout_at = time.time() + 120
        status = "IN_PROGRESS"
        transcript_uri = None
        while time.time() < timeout_at:
            response = client.get_transcription_job(TranscriptionJobName=job_name)
            job = response["TranscriptionJob"]
            status = job["TranscriptionJobStatus"]
            if status == "COMPLETED":
                transcript_uri = job["Transcript"]["TranscriptFileUri"]
                break
            if status == "FAILED":
                raise HTTPException(500, f"Transcription failed: {job.get('FailureReason', 'Unknown error')}")
            time.sleep(2)

        if not transcript_uri:
            raise HTTPException(504, "Transcription timed out")

        with urllib.request.urlopen(transcript_uri, timeout=30) as resp:
            transcript_payload = json.loads(resp.read().decode("utf-8"))

        transcripts = transcript_payload.get("results", {}).get("transcripts", [])
        text = " ".join(item.get("transcript", "").strip() for item in transcripts).strip()
        elapsed = time.time() - start_time

        logger.info(f"Transcribed {len(content)} bytes in {elapsed:.2f}s: '{text[:100]}...'")

        return {
            "text": text,
            "language": "en-US",
            "duration": elapsed,
        }
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(500, f"Transcription failed: {str(e)}")
    finally:
        try:
            delete_object(object_key)
        except Exception:
            pass


_load_transcribe()
