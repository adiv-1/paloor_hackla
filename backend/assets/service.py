"""
Asset & Document service layer.

Asset metadata and uploaded document metadata are persisted in AWS S3.
On startup, restore_from_disk() re-hydrates in-memory stores from S3 metadata objects.
"""
from __future__ import annotations

import uuid
import os
import mimetypes
from datetime import datetime
from typing import Optional, List

from assets.definitions import ASSET_CLASSES, ACCOUNT_DOCUMENTS
from assets.schemas import (
    AssetClassInfo,
    AssetClassDetail,
    ChecklistDefinition,
    CreateFieldDef,
    Asset,
    AssetSummary,
    ChecklistItemStatus,
    AccountDocumentStatus,
    UploadResult,
)
from assets.gemini_ocr import (
    extract_text,
    extract_with_gemini,
    save_document_json,
    load_all_document_jsons,
    DOC_SCHEMAS,
)
from storage import put_bytes, get_bytes, delete_object, list_json, put_json

import logging
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory stores (hydrated from S3 metadata on startup)
# ---------------------------------------------------------------------------

_assets: dict = {}
_asset_documents: dict = {}     # {asset_id: {doc_key: {id, filename, ...}}}
_account_documents: dict = {}   # {doc_key: {id, filename, ...}}

ASSET_META_PREFIX = "assets-meta/"
DOCUMENT_PREFIX = "documents/"
DOCUMENT_META_PREFIX = "documents-meta/"


def _asset_meta_key(asset_id: str) -> str:
    return f"{ASSET_META_PREFIX}{asset_id}.json"


def _document_meta_key(doc_id: str) -> str:
    return f"{DOCUMENT_META_PREFIX}{doc_id}.json"


def _save_asset_json(asset: dict):
    put_json(
        _asset_meta_key(asset["id"]),
        {
            "id": asset["id"],
            "asset_class": asset["asset_class"],
            "name": asset["name"],
            "details": asset.get("details", {}),
            "created_at": asset.get("created_at").isoformat() if asset.get("created_at") else None,
        },
    )


def _load_all_asset_jsons() -> list[dict]:
    return list_json(ASSET_META_PREFIX)


# ---------------------------------------------------------------------------
# Persistence: restore from JSON sidecar files
# ---------------------------------------------------------------------------

def restore_from_disk():
    """
    Load asset/document metadata from S3 and re-hydrate
    _account_documents and _asset_documents in-memory stores.
    This makes document data survive server restarts.
    """
    _assets.clear()
    _asset_documents.clear()
    _account_documents.clear()

    restored_assets = 0
    for rec in _load_all_asset_jsons():
        asset_id = rec.get("id", "")
        asset_class = rec.get("asset_class", "")
        if not asset_id or asset_class not in ASSET_CLASSES:
            continue
        created_at = datetime.utcnow()
        created_at_str = rec.get("created_at")
        if created_at_str:
            try:
                created_at = datetime.fromisoformat(created_at_str)
            except Exception:
                created_at = datetime.utcnow()
        _assets[asset_id] = {
            "id": asset_id,
            "asset_class": asset_class,
            "name": rec.get("name", asset_id),
            "details": rec.get("details", {}),
            "created_at": created_at,
        }
        _asset_documents.setdefault(asset_id, {})
        restored_assets += 1

    records = load_all_document_jsons()
    restored_account = 0
    restored_asset = 0

    for rec in records:
        doc_id = rec.get("id", "")
        doc_key = rec.get("doc_key", "")
        doc_store = rec.get("doc_store", "")
        filename = rec.get("filename", "")
        file_path = rec.get("file_path", "")
        extracted_fields = rec.get("extracted_fields", [])
        raw_text = rec.get("raw_text", "")
        uploaded_at_str = rec.get("uploaded_at")

        uploaded_at = None
        if uploaded_at_str:
            try:
                uploaded_at = datetime.fromisoformat(uploaded_at_str)
            except Exception:
                uploaded_at = datetime.utcnow()

        doc_entry = {
            "id": doc_id,
            "filename": filename,
            "content": None,  # Don't keep bytes in memory — read from file_path on demand
            "extracted_fields": extracted_fields,
            "raw_text": raw_text,
            "file_path": file_path,
            "uploaded_at": uploaded_at or datetime.utcnow(),
        }

        if doc_store == "account" and doc_key:
            _account_documents[doc_key] = doc_entry
            restored_account += 1
        elif doc_store.startswith("asset:") and doc_key:
            asset_id = doc_store.split(":", 1)[1]
            if asset_id in _assets:
                _asset_documents.setdefault(asset_id, {})[doc_key] = doc_entry
                restored_asset += 1

    logger.info(
        "Restored %s assets, %s account docs, %s asset docs from storage",
        restored_assets,
        restored_account,
        restored_asset,
    )


# ---------------------------------------------------------------------------
# Asset class operations
# ---------------------------------------------------------------------------

def list_asset_classes() -> List[AssetClassInfo]:
    return [
        AssetClassInfo(key=c["key"], label=c["label"], description=c["description"])
        for c in ASSET_CLASSES.values()
    ]


def get_asset_class(key: str) -> Optional[AssetClassDetail]:
    c = ASSET_CLASSES.get(key)
    if not c:
        return None
    return AssetClassDetail(
        key=c["key"],
        label=c["label"],
        description=c["description"],
        overview=c["overview"],
        checklist=[ChecklistDefinition(**item) for item in c["checklist"]],
        create_fields=[CreateFieldDef(**f) for f in c.get("create_fields", [])],
        name_template=c.get("name_template", ""),
    )


# ---------------------------------------------------------------------------
# Asset CRUD
# ---------------------------------------------------------------------------

def create_asset(asset_class: str, name: str, details: dict) -> AssetSummary:
    if asset_class not in ASSET_CLASSES:
        raise ValueError("Unknown asset class")
    asset_id = "asset_" + uuid.uuid4().hex[:8]
    now = datetime.utcnow()
    _assets[asset_id] = {
        "id": asset_id,
        "asset_class": asset_class,
        "name": name,
        "details": details,
        "created_at": now,
    }
    _asset_documents[asset_id] = {}
    _save_asset_json(_assets[asset_id])
    checklist = ASSET_CLASSES[asset_class]["checklist"]
    uploaded = sum(1 for item in checklist if _item_status(asset_id, item) != "missing")
    return AssetSummary(
        id=asset_id, asset_class=asset_class, name=name,
        details=details, created_at=now, progress=f"{uploaded}/{len(checklist)}",
    )


def list_assets(asset_class: Optional[str] = None) -> List[AssetSummary]:
    results = []
    for a in _assets.values():
        if asset_class and a["asset_class"] != asset_class:
            continue
        checklist = ASSET_CLASSES[a["asset_class"]]["checklist"]
        uploaded = sum(1 for item in checklist if _item_status(a["id"], item) != "missing")
        results.append(AssetSummary(
            id=a["id"], asset_class=a["asset_class"], name=a["name"],
            details=a["details"], created_at=a["created_at"],
            progress=f"{uploaded}/{len(checklist)}",
        ))
    return results


def get_asset(asset_id: str) -> Optional[Asset]:
    a = _assets.get(asset_id)
    if not a:
        return None
    checklist_def = ASSET_CLASSES[a["asset_class"]]["checklist"]
    checklist = []
    for item in checklist_def:
        status = _item_status(asset_id, item)
        doc = _get_doc(asset_id, item)
        checklist.append(ChecklistItemStatus(
            key=item["key"], label=item["label"], description=item["description"],
            required=item["required"], account_level=item["account_level"],
            status=status,
            document_id=doc["id"] if doc else None,
            filename=doc["filename"] if doc else None,
            extracted_fields=doc.get("extracted_fields") if doc else None,
        ))
    return Asset(
        id=a["id"], asset_class=a["asset_class"], name=a["name"],
        details=a["details"], created_at=a["created_at"], checklist=checklist,
    )


# ---------------------------------------------------------------------------
# Document status helpers
# ---------------------------------------------------------------------------

def _item_status(asset_id: str, item: dict) -> str:
    if item["account_level"]:
        doc = _account_documents.get(item["key"])
        if doc is not None:
            return "linked"
        return "missing"
    if asset_id in _asset_documents and item["key"] in _asset_documents[asset_id]:
        return "uploaded"
    return "missing"


def _get_doc(asset_id: str, item: dict):
    if item["account_level"]:
        return _account_documents.get(item["key"])
    if asset_id in _asset_documents and item["key"] in _asset_documents[asset_id]:
        return _asset_documents[asset_id][item["key"]]
    return None


# ---------------------------------------------------------------------------
# File storage
# ---------------------------------------------------------------------------

def _save_file(doc_id: str, filename: str, content: bytes) -> str:
    ext = os.path.splitext(filename)[1] if filename else ""
    key = f"{DOCUMENT_PREFIX}{doc_id}{ext}"
    mime_type = mimetypes.guess_type(filename or "")[0] or "application/octet-stream"
    put_bytes(key, content, mime_type)
    return key


# ---------------------------------------------------------------------------
# Document upload — asset-level
# ---------------------------------------------------------------------------

async def upload_asset_document(asset_id: str, doc_key: str, filename: str, content: bytes) -> UploadResult:
    raw_text = extract_text(content)
    fields, warning = await extract_with_gemini(doc_key, content, raw_text)
    if not fields:
        fields = [{"key": "content", "value": "Processed"}]
    if not raw_text:
        raw_text = " ".join(f"{f['key']}: {f['value']}" for f in fields if f.get("value"))

    doc_id = "doc_" + uuid.uuid4().hex[:8]
    file_path = _save_file(doc_id, filename, content)

    doc_entry = {
        "id": doc_id,
        "filename": filename,
        "content": content,
        "extracted_fields": fields,
        "raw_text": raw_text,
        "file_path": file_path,
        "uploaded_at": datetime.utcnow(),
    }

    _asset_documents.setdefault(asset_id, {})[doc_key] = doc_entry

    # Persist as JSON sidecar
    save_document_json(doc_id, {
        **doc_entry,
        "doc_key": doc_key,
        "doc_store": f"asset:{asset_id}",
    })

    # Vectorize document for memory/RAG (fire-and-forget)
    try:
        import threading
        threading.Thread(
            target=_vectorize_document,
            args=("admin", doc_id, doc_key, raw_text, fields),
            daemon=True,
        ).start()
    except Exception:
        pass

    return UploadResult(
        document_id=doc_id, filename=filename,
        extracted_fields=fields, raw_text=raw_text, warning=warning,
    )


def _vectorize_document(user_id: str, doc_id: str, doc_key: str, raw_text: str, fields: list):
    """Background: chunk, embed, and store document vectors + memory facts."""
    try:
        from memory.chunking import chunk_text
        from memory.embeddings import embed_batch, vec_to_bytes
        from memory.store import store_document_chunk
        from memory.capture import capture_document_facts

        # Chunk and embed the raw text
        if raw_text and len(raw_text) > 50:
            chunks = chunk_text(raw_text, chunk_size=500, overlap=50)
            if chunks:
                vectors = embed_batch(chunks)
                for i, (chunk, vec) in enumerate(zip(chunks, vectors)):
                    emb_bytes = vec_to_bytes(vec) if vec is not None else None
                    store_document_chunk(
                        user_id=user_id, document_id=doc_id,
                        document_type=doc_key, chunk_index=i,
                        content=chunk, embedding=emb_bytes,
                    )

        # Store document facts as memories
        capture_document_facts(
            user_id=user_id, document_id=doc_id,
            document_type=doc_key, extracted_fields=fields,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Document vectorization failed: {e}")

async def upload_account_document(doc_key: str, filename: str, content: bytes) -> UploadResult:
    raw_text = extract_text(content)
    fields, warning = await extract_with_gemini(doc_key, content, raw_text)
    if not fields:
        fields = [{"key": "content", "value": "Processed"}]
    if not raw_text:
        raw_text = " ".join(f"{f['key']}: {f['value']}" for f in fields if f.get("value"))

    doc_id = "doc_" + uuid.uuid4().hex[:8]
    file_path = _save_file(doc_id, filename, content)

    doc_entry = {
        "id": doc_id,
        "filename": filename,
        "content": content,
        "extracted_fields": fields,
        "raw_text": raw_text,
        "file_path": file_path,
        "uploaded_at": datetime.utcnow(),
    }

    _account_documents[doc_key] = doc_entry

    # Persist as JSON sidecar
    save_document_json(doc_id, {
        **doc_entry,
        "doc_key": doc_key,
        "doc_store": "account",
    })

    # Vectorize document for memory/RAG (fire-and-forget)
    try:
        import threading
        threading.Thread(
            target=_vectorize_document,
            args=("admin", doc_id, doc_key, raw_text, fields),
            daemon=True,
        ).start()
    except Exception:
        pass

    return UploadResult(
        document_id=doc_id, filename=filename,
        extracted_fields=fields, raw_text=raw_text, warning=warning,
    )


# ---------------------------------------------------------------------------
# Account document listing
# ---------------------------------------------------------------------------

def get_account_documents() -> List[AccountDocumentStatus]:
    results = []
    for doc_def in ACCOUNT_DOCUMENTS:
        doc = _account_documents.get(doc_def["key"])
        results.append(AccountDocumentStatus(
            key=doc_def["key"], label=doc_def["label"], description=doc_def["description"],
            status="uploaded" if doc else "missing",
            document_id=doc["id"] if doc else None,
            filename=doc["filename"] if doc else None,
            uploaded_at=doc["uploaded_at"] if doc else None,
            extracted_fields=doc.get("extracted_fields") if doc else None,
        ))
    return results


# ---------------------------------------------------------------------------
# Document content retrieval
# ---------------------------------------------------------------------------

def get_document_content(doc_id: str):
    for asset_docs in _asset_documents.values():
        for doc in asset_docs.values():
            if doc["id"] == doc_id:
                return doc["filename"], _read_doc_bytes(doc)
    for doc in _account_documents.values():
        if doc and doc["id"] == doc_id:
            return doc["filename"], _read_doc_bytes(doc)
    return None


def _read_doc_bytes(doc: dict) -> bytes:
    # Prefer in-memory content if available
    if doc.get("content"):
        return doc["content"]
    fp = doc.get("file_path")
    if fp:
        try:
            return get_bytes(fp)
        except FileNotFoundError:
            return b""
    return b""


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

def search(query: str) -> List[dict]:
    q = query.lower()
    results = []
    seen = set()
    for a in _assets.values():
        if q in a["name"].lower():
            key = ("asset", a["id"])
            if key not in seen:
                seen.add(key)
                results.append({
                    "type": "asset",
                    "id": a["id"],
                    "title": a["name"],
                    "subtitle": a["asset_class"],
                    "href": f"/dashboard/assets/{a['asset_class']}",
                })
    for asset_id, docs in _asset_documents.items():
        asset = _assets.get(asset_id)
        for doc_key, doc in docs.items():
            searchable = (doc.get("filename", "") + " " + doc.get("raw_text", "")).lower()
            if q in searchable:
                key = ("doc", doc["id"])
                if key not in seen:
                    seen.add(key)
                    results.append({
                        "type": "document",
                        "id": doc["id"],
                        "title": doc["filename"],
                        "subtitle": asset["name"] if asset else doc_key,
                        "href": f"/dashboard/assets/{asset['asset_class']}" if asset else "/dashboard/assets",
                    })
    for doc_key, doc in _account_documents.items():
        if doc:
            searchable = (doc.get("filename", "") + " " + doc.get("raw_text", "")).lower()
            if q in searchable:
                key = ("acct", doc["id"])
                if key not in seen:
                    seen.add(key)
                    results.append({
                        "type": "document",
                        "id": doc["id"],
                        "title": doc["filename"],
                        "subtitle": "Account",
                        "href": "/dashboard/account",
                    })
    for c in ASSET_CLASSES.values():
        if q in c["label"].lower() or q in c["description"].lower():
            key = ("class", c["key"])
            if key not in seen:
                seen.add(key)
                results.append({
                    "type": "asset_class",
                    "id": c["key"],
                    "title": c["label"],
                    "subtitle": c["description"],
                    "href": f"/dashboard/assets/{c['key']}",
                })
    return results[:20]


# ---------------------------------------------------------------------------
# Field editing
# ---------------------------------------------------------------------------

def update_extracted_field(doc_id: str, field_key: str, new_value: str) -> bool:
    """Update a field value and re-persist the JSON sidecar."""
    for asset_id, asset_docs in _asset_documents.items():
        for doc_key, doc in asset_docs.items():
            if doc["id"] == doc_id and doc.get("extracted_fields"):
                for f in doc["extracted_fields"]:
                    if f["key"] == field_key:
                        f["value"] = new_value
                        # Update raw_text to include new value for search
                        doc["raw_text"] = _rebuild_raw_text(doc)
                        # Re-persist
                        save_document_json(doc_id, {
                            **doc, "doc_key": doc_key, "doc_store": f"asset:{asset_id}"
                        })
                        return True
    for doc_key, doc in _account_documents.items():
        if doc and doc["id"] == doc_id and doc.get("extracted_fields"):
            for f in doc["extracted_fields"]:
                if f["key"] == field_key:
                    f["value"] = new_value
                    doc["raw_text"] = _rebuild_raw_text(doc)
                    save_document_json(doc_id, {
                        **doc, "doc_key": doc_key, "doc_store": "account"
                    })
                    return True
    return False


def _rebuild_raw_text(doc: dict) -> str:
    """Rebuild raw_text from extracted fields for search indexing."""
    parts = []
    original = doc.get("raw_text", "")
    if original:
        parts.append(original)
    for f in doc.get("extracted_fields", []):
        if f.get("value"):
            parts.append(f"{f.get('label', f['key'])}: {f['value']}")
    return " | ".join(parts)


# ---------------------------------------------------------------------------
# Document deletion
# ---------------------------------------------------------------------------

def delete_document(doc_id: str) -> bool:
    """Delete a document by ID from asset or account stores + disk."""
    # Check asset documents
    for asset_id, docs in _asset_documents.items():
        for doc_key, doc in list(docs.items()):
            if doc["id"] == doc_id:
                _cleanup_files(doc)
                del docs[doc_key]
                return True
    # Check account documents
    for doc_key, doc in list(_account_documents.items()):
        if doc and doc["id"] == doc_id:
            _cleanup_files(doc)
            del _account_documents[doc_key]
            return True
    return False


def _cleanup_files(doc: dict):
    """Remove the uploaded file and its metadata object from S3."""
    doc_id = doc.get("id", "")
    fp = doc.get("file_path")
    if fp:
        try:
            delete_object(fp)
            logger.info("Removed stored file: %s", fp)
        except Exception as exc:
            logger.warning("Failed to remove stored file %s: %s", fp, exc)
    if doc_id:
        meta_key = _document_meta_key(doc_id)
        try:
            delete_object(meta_key)
            logger.info("Removed document metadata: %s", meta_key)
        except Exception as exc:
            logger.warning("Failed to remove metadata %s: %s", meta_key, exc)
