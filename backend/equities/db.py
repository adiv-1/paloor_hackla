"""
Equities database — PostgreSQL helpers.

Tables:
  companies        — S&P 500 tickers, CIK, sector, market cap
  financials       — EDGAR XBRL facts (one row per metric per period)
  price_history    — daily OHLCV from yfinance
  stock_news       — scraped articles per event (raw + LLM-ranked)
  event_summaries  — LLM-generated event summaries
"""
from __future__ import annotations

import logging
import psycopg2
import psycopg2.extras

from database import _pg_params

logger = logging.getLogger(__name__)


class PgDictConnection:
    """Thin wrapper around psycopg2 that uses RealDictCursor by default,
    providing a similar interface to the old sqlite3.Connection with row_factory."""

    def __init__(self):
        self._conn = psycopg2.connect(**_pg_params)
        self._conn.autocommit = False

    def execute(self, sql, params=None):
        cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql, params)
        return cur

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


def get_db() -> PgDictConnection:
    """Get a PostgreSQL connection with dict cursor (drop-in for old sqlite3 usage)."""
    return PgDictConnection()


def init_equities_db():
    """No-op: tables created via init_schema.sql."""
    logger.info("Equities DB initialized (PostgreSQL)")
