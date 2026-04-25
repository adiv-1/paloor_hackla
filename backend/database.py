from __future__ import annotations

import psycopg2
import psycopg2.extras
import logging
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from config import settings

logger = logging.getLogger(__name__)

DATABASE_URL = settings.database_url

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """No-op: PostgreSQL schema is managed externally via init_schema.sql."""
    pass


# ---------------------------------------------------------------------------
# Raw psycopg2 connection helpers (used by modules that were on raw SQLite)
# ---------------------------------------------------------------------------

def _parse_pg_url(url: str) -> dict:
    """Parse a postgresql:// URL into psycopg2 connect kwargs."""
    from urllib.parse import urlparse
    parsed = urlparse(url)
    return {
        "host": parsed.hostname or "127.0.0.1",
        "port": parsed.port or 5432,
        "dbname": parsed.path.lstrip("/"),
        "user": parsed.username,
        "password": parsed.password,
    }

_pg_params = _parse_pg_url(DATABASE_URL)


def get_pg_conn():
    """Get a raw psycopg2 connection with RealDictCursor."""
    conn = psycopg2.connect(**_pg_params)
    conn.autocommit = False
    return conn


@contextmanager
def pg_cursor():
    """Context manager that yields a RealDictCursor and auto-commits/rollbacks."""
    conn = get_pg_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
