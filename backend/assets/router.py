from __future__ import annotations

from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import Response

from assets import service
from assets.schemas import (
    AssetClassInfo, AssetClassDetail, AssetCreate,
    Asset, AssetSummary, AccountDocumentStatus, UploadResult,
)

class_router = APIRouter(prefix="/api/asset-classes", tags=["asset-classes"])
asset_router = APIRouter(prefix="/api/assets", tags=["assets"])
account_router = APIRouter(prefix="/api/account", tags=["account"])
document_router = APIRouter(prefix="/api/documents", tags=["documents"])
search_router = APIRouter(prefix="/api/search", tags=["search"])


@class_router.get("", response_model=List[AssetClassInfo])
def list_classes():
    return service.list_asset_classes()


@class_router.get("/{key}", response_model=AssetClassDetail)
def get_class(key: str):
    result = service.get_asset_class(key)
    if not result:
        raise HTTPException(404, "Asset class not found")
    return result


@asset_router.post("", response_model=AssetSummary)
def create_asset(body: AssetCreate):
    try:
        return service.create_asset(body.asset_class, body.name, body.details)
    except ValueError as e:
        raise HTTPException(400, str(e))


@asset_router.get("", response_model=List[AssetSummary])
def list_assets(asset_class: Optional[str] = None):
    return service.list_assets(asset_class)


@asset_router.get("/{asset_id}", response_model=Asset)
def get_asset(asset_id: str):
    result = service.get_asset(asset_id)
    if not result:
        raise HTTPException(404, "Asset not found")
    return result


@asset_router.post("/{asset_id}/documents/{doc_key}", response_model=UploadResult)
async def upload_asset_document(asset_id: str, doc_key: str, file: UploadFile = File(...)):
    if asset_id not in service._assets:
        raise HTTPException(404, "Asset not found")
    content = await file.read()
    return await service.upload_asset_document(asset_id, doc_key, file.filename or "unknown", content)


@account_router.get("/documents", response_model=List[AccountDocumentStatus])
def list_account_documents():
    return service.get_account_documents()


@account_router.post("/documents/{doc_key}", response_model=UploadResult)
async def upload_account_document(doc_key: str, file: UploadFile = File(...)):
    content = await file.read()
    return await service.upload_account_document(doc_key, file.filename or "unknown", content)


import mimetypes

@document_router.get("/{doc_id}/download")
def download_document(doc_id: str):
    result = service.get_document_content(doc_id)
    if not result:
        raise HTTPException(404, "Document not found")
    filename, content = result
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@document_router.get("/{doc_id}/preview")
def preview_document(doc_id: str):
    result = service.get_document_content(doc_id)
    if not result:
        raise HTTPException(404, "Document not found")
    filename, content = result
    mime, _ = mimetypes.guess_type(filename)
    if not mime:
        mime = "application/octet-stream"
    return Response(
        content=content,
        media_type=mime,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@document_router.patch("/{doc_id}/fields/{field_key}")
def update_field(doc_id: str, field_key: str, body: dict):
    value = body.get("value")
    if value is None:
        raise HTTPException(400, "Missing value")
    ok = service.update_extracted_field(doc_id, field_key, str(value))
    if not ok:
        raise HTTPException(404, "Field not found")
    return {"status": "updated"}


@document_router.delete("/{doc_id}")
def delete_document(doc_id: str):
    ok = service.delete_document(doc_id)
    if not ok:
        raise HTTPException(404, "Document not found")
    return {"status": "deleted"}


@search_router.get("")
def search_all(q: str = ""):
    if not q or len(q) < 2:
        return []
    return service.search(q)
