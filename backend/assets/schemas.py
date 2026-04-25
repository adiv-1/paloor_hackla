from __future__ import annotations

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ChecklistDefinition(BaseModel):
    key: str
    label: str
    description: str
    required: bool
    account_level: bool


class AssetClassInfo(BaseModel):
    key: str
    label: str
    description: str


class CreateFieldDef(BaseModel):
    key: str
    label: str
    placeholder: str = ""


class AssetClassDetail(AssetClassInfo):
    overview: str
    checklist: List[ChecklistDefinition]
    create_fields: List[CreateFieldDef] = []
    name_template: str = ""


class AssetCreate(BaseModel):
    asset_class: str
    name: str
    details: dict = {}


class ChecklistItemStatus(BaseModel):
    key: str
    label: str
    description: str
    required: bool
    account_level: bool
    status: str
    document_id: Optional[str] = None
    filename: Optional[str] = None
    extracted_fields: Optional[List[dict]] = None


class Asset(BaseModel):
    id: str
    asset_class: str
    name: str
    details: dict
    created_at: datetime
    checklist: List[ChecklistItemStatus]


class AssetSummary(BaseModel):
    id: str
    asset_class: str
    name: str
    details: dict
    created_at: datetime
    progress: str


class AccountDocumentStatus(BaseModel):
    key: str
    label: str
    description: str
    status: str
    document_id: Optional[str] = None
    filename: Optional[str] = None
    uploaded_at: Optional[datetime] = None
    extracted_fields: Optional[List[dict]] = None


class UploadResult(BaseModel):
    document_id: str
    filename: str
    extracted_fields: List[dict]
    raw_text: str
    warning: Optional[str] = None
