from __future__ import annotations

import json
import logging
from typing import Iterator

from config import settings

logger = logging.getLogger(__name__)

_s3_client = None


def _get_s3_client():
    global _s3_client
    if _s3_client is None:
        import boto3

        _s3_client = boto3.client("s3", region_name=settings.aws_region or None)
    return _s3_client


def _require_bucket() -> str:
    if not settings.upload_bucket:
        raise RuntimeError("UPLOAD_BUCKET is not configured")
    return settings.upload_bucket


def put_bytes(key: str, content: bytes, content_type: str = "application/octet-stream") -> str:
    client = _get_s3_client()
    bucket = _require_bucket()
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=content,
        ContentType=content_type,
    )
    return key


def get_bytes(key: str) -> bytes:
    client = _get_s3_client()
    bucket = _require_bucket()
    try:
        response = client.get_object(Bucket=bucket, Key=key)
    except Exception as exc:
        error_code = getattr(exc, "response", {}).get("Error", {}).get("Code")
        if error_code in {"404", "NoSuchKey"}:
            raise FileNotFoundError(key) from exc
        raise
    return response["Body"].read()


def delete_object(key: str) -> None:
    client = _get_s3_client()
    bucket = _require_bucket()
    client.delete_object(Bucket=bucket, Key=key)


def put_json(key: str, payload: dict) -> str:
    return put_bytes(
        key,
        json.dumps(payload, indent=2, default=str).encode("utf-8"),
        content_type="application/json",
    )


def get_json(key: str) -> dict:
    return json.loads(get_bytes(key).decode("utf-8"))


def list_keys(prefix: str) -> Iterator[str]:
    client = _get_s3_client()
    bucket = _require_bucket()
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for item in page.get("Contents", []):
            key = item.get("Key")
            if key:
                yield key


def list_json(prefix: str) -> list[dict]:
    records: list[dict] = []
    for key in list_keys(prefix):
        if not key.endswith(".json"):
            continue
        try:
            records.append(get_json(key))
        except Exception as exc:
            logger.warning("Failed to load JSON object %s: %s", key, exc)
    return records