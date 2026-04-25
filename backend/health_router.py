from __future__ import annotations

from fastapi import APIRouter, Depends
from auth import get_current_user, UserInfo
from assets import service
from assets.definitions import ASSET_CLASSES
from health import compute_health

health_router = APIRouter(prefix="/api/health", tags=["health"])


@health_router.get("")
def get_health(user: UserInfo = Depends(get_current_user)):
    account_docs = []
    for d in service.get_account_documents():
        account_docs.append({"key": d.key, "status": d.status})

    assets = []
    for a in service.list_assets():
        assets.append({
            "id": a.id,
            "class_id": a.asset_class,
        })

    classes = [{"id": k} for k in ASSET_CLASSES.keys()]

    return compute_health(user.id, account_docs, assets, classes)
