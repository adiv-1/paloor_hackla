"""
Idempotent bootstrap for the shared Postgres database.

Runs at app startup:
  1. Applies init_schema.sql (uses IF NOT EXISTS everywhere — safe to re-run).
  2. Applies migrations/*.sql in order (also idempotent).
  3. Seeds the S&P 500 companies table if it's empty.

This makes a fresh RDS / dev DB self-healing: bring up the backend pointed at
an empty database and it provisions itself.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from database import get_pg_conn

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parent
SCHEMA_FILE = BACKEND_DIR / "init_schema.sql"
MIGRATIONS_DIR = BACKEND_DIR / "migrations"


def _exec_sql_file(path: Path) -> None:
    sql = path.read_text()
    if not sql.strip():
        return
    conn = get_pg_conn()
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql)
        logger.info(f"[bootstrap] Applied {path.name}")
    finally:
        conn.close()


def apply_schema() -> None:
    if SCHEMA_FILE.exists():
        try:
            _exec_sql_file(SCHEMA_FILE)
        except Exception as e:
            logger.warning(f"[bootstrap] init_schema.sql failed: {e}")

    if MIGRATIONS_DIR.exists():
        for mig in sorted(MIGRATIONS_DIR.glob("*.sql")):
            try:
                _exec_sql_file(mig)
            except Exception as e:
                logger.warning(f"[bootstrap] migration {mig.name} failed: {e}")


def seed_companies_if_empty() -> None:
    """Seed S&P 500 + SEC CIK mappings if companies table is empty."""
    try:
        conn = get_pg_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM companies")
            count = cur.fetchone()[0]
        conn.close()
    except Exception as e:
        logger.warning(f"[bootstrap] companies count check failed: {e}")
        return

    if count >= 490:
        logger.info(f"[bootstrap] companies already populated ({count} rows)")
        return

    try:
        from equities.seed import seed_companies
        n = seed_companies(force=False)
        logger.info(f"[bootstrap] Seeded {n} companies")
    except Exception as e:
        logger.warning(f"[bootstrap] company seeding failed: {e}")


def seed_marketplace_wms() -> None:
    """Idempotently seed the wealth-manager marketplace with demo entries."""
    try:
        from chat.cohort import seed_fake_wms
        seed_fake_wms()
    except Exception as e:
        logger.warning(f"[bootstrap] marketplace seeding failed: {e}")


def run() -> None:
    """Run full bootstrap. Controlled by PALOOR_BOOTSTRAP env (default: enabled)."""
    if os.getenv("PALOOR_BOOTSTRAP", "1") == "0":
        logger.info("[bootstrap] disabled via PALOOR_BOOTSTRAP=0")
        return
    apply_schema()
    seed_companies_if_empty()
    seed_marketplace_wms()
