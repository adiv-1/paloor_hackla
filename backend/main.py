from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from auth_router import auth_router
from assets.router import (
    class_router,
    asset_router,
    account_router,
    document_router,
    search_router,
)
from linked_accounts import router as accounts_router, init_accounts_db
from health_router import health_router
from chat.router import router as chat_router
from chat.cohort_router import router as cohort_router
from chat.websocket import chat_websocket
from memory.router import router as memory_router
from speech import router as speech_router

app = FastAPI(title="Paloor API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(class_router)
app.include_router(asset_router)
app.include_router(account_router)
app.include_router(document_router)
app.include_router(search_router)
app.include_router(accounts_router)
app.include_router(health_router)
app.include_router(chat_router)
app.include_router(cohort_router)
app.include_router(memory_router)
app.include_router(speech_router)

# WebSocket endpoint for real-time chat
app.add_api_websocket_route("/ws/chat", chat_websocket)


@app.on_event("startup")
def on_startup():
    try:
        import os
        from bootstrap import apply_schema
        if os.getenv("PALOOR_BOOTSTRAP", "1") != "0":
            apply_schema()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Bootstrap failed: {e}")
    try:
        from database import init_db
        init_db()
    except Exception:
        pass
    try:
        init_accounts_db()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Accounts DB init failed: {e}")
    try:
        from chat.service import seed_default_groups
        seed_default_groups()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Group seeding failed: {e}")
    try:
        from assets.service import restore_from_disk
        restore_from_disk()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Document restore failed: {e}")


@app.get("/")
def health():
    return {"status": "ok", "version": "0.3.0"}
