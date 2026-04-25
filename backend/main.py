from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from auth_router import auth_router

app = FastAPI(title="Paloor API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


@app.on_event("startup")
def on_startup():
    try:
        from database import init_db
        init_db()
    except Exception:
        pass


@app.get("/")
def health():
    return {"status": "ok", "version": "0.1.0"}
