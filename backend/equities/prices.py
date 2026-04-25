"""
Price history — reads from Alpha Vantage TIME_SERIES_DAILY_ADJUSTED
cached in av_fundamentals table.

Also populates the price_history table for fast period-filtered queries.
"""
from __future__ import annotations

import datetime as dt
import logging
from typing import Optional

import psycopg2.extras

from equities.db import get_db
from equities.alpha_vantage import fetch_daily_prices, _get_av_data

logger = logging.getLogger(__name__)


def fetch_price_history(
    ticker: str,
    outputsize: str = "compact",
    force: bool = False,
) -> int:
    """
    Fetch daily adjusted prices from Alpha Vantage and populate price_history table.
    Returns number of rows upserted.
    """
    ticker = ticker.upper()
    data = fetch_daily_prices(ticker, outputsize=outputsize, force=force)
    if not data:
        return 0

    ts = data.get("Time Series (Daily)", {})
    if not ts:
        return 0

    return _populate_price_history(ticker, ts)


def _ensure_company_exists(ticker: str) -> None:
    """Ensure ticker exists in companies table (for FK constraint)."""
    db = get_db()
    try:
        row = db.execute(
            "SELECT 1 FROM companies WHERE ticker = %s", (ticker,)
        ).fetchone()
        if not row:
            from equities.alpha_vantage import _get_av_data
            overview = _get_av_data(ticker, "OVERVIEW")
            name = overview.get("Name", ticker) if overview else ticker
            sector = overview.get("Sector", "") if overview else ""
            industry = overview.get("Industry", "") if overview else ""
            exchange = overview.get("Exchange", "") if overview else ""
            db.execute("""
                INSERT INTO companies (ticker, name, sector, industry, exchange, cik)
                VALUES (%s, %s, %s, %s, %s, '')
                ON CONFLICT (ticker) DO NOTHING
            """, (ticker, name, sector, industry, exchange))
            db.commit()
    finally:
        db.close()


def _populate_price_history(ticker: str, time_series: dict) -> int:
    """Parse AV daily time series JSON into price_history rows."""
    _ensure_company_exists(ticker)
    db = get_db()
    try:
        rows_to_upsert: list[tuple] = []
        for date_str, vals in time_series.items():
            try:
                rows_to_upsert.append((
                    ticker,
                    date_str,
                    float(vals.get("1. open", 0)),
                    float(vals.get("2. high", 0)),
                    float(vals.get("3. low", 0)),
                    float(vals.get("4. close", 0)),
                    float(vals.get("5. adjusted close", vals.get("4. close", 0))),
                    int(vals.get("6. volume", vals.get("5. volume", 0))),
                ))
            except Exception as e:
                logger.debug(f"Price insert error {ticker} {date_str}: {e}")

        if rows_to_upsert:
            with db._conn.cursor() as cur:
                psycopg2.extras.execute_batch(
                    cur,
                    """
                    INSERT INTO price_history (ticker, date, open, high, low, close, adj_close, volume)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT(ticker, date) DO UPDATE SET
                        open = excluded.open,
                        high = excluded.high,
                        low = excluded.low,
                        close = excluded.close,
                        adj_close = excluded.adj_close,
                        volume = excluded.volume
                    """,
                    rows_to_upsert,
                    page_size=500,
                )

        db.commit()
        logger.info(f"Stored {len(rows_to_upsert)} price rows for {ticker}")
        return len(rows_to_upsert)
    finally:
        db.close()


def fetch_batch_prices(
    tickers: list[str],
    outputsize: str = "full",
    progress_callback=None,
) -> dict:
    """
    Fetch price history for multiple tickers.
    Returns: {"success": N, "failed": N, "errors": [...]}
    """
    result = {"success": 0, "failed": 0, "errors": [], "total": len(tickers)}

    for idx, ticker in enumerate(tickers):
        if progress_callback:
            progress_callback(ticker, idx + 1, len(tickers))

        try:
            count = fetch_price_history(ticker, outputsize=outputsize)
            if count > 0:
                result["success"] += 1
            else:
                result["failed"] += 1
        except Exception as e:
            result["failed"] += 1
            result["errors"].append(f"{ticker}: {str(e)}")

    return result


def get_price_history(
    ticker: str,
    period: str = "1Y",
) -> list[dict]:
    """Get stored price history for a ticker, filtered by period."""
    days_map = {
        "1M": 30,
        "3M": 90,
        "6M": 180,
        "1Y": 365,
        "2Y": 730,
        "3Y": 1095,
        "5Y": 1825,
        "10Y": 3650,
        "MAX": 99999,
    }
    days = days_map.get(period, 365)

    db = get_db()
    try:
        select_sql = """
            SELECT
                ticker,
                date,
                open,
                high,
                low,
                close,
                COALESCE(adj_close, close) AS adj_close,
                volume
            FROM price_history
        """
        if days >= 99999:
            rows = db.execute(
                f"{select_sql} WHERE ticker = %s ORDER BY date",
                (ticker.upper(),)
            ).fetchall()
        else:
            cutoff = (dt.datetime.now() - dt.timedelta(days=days)).strftime("%Y-%m-%d")
            rows = db.execute(
                f"{select_sql} WHERE ticker = %s AND date >= %s ORDER BY date",
                (ticker.upper(), cutoff)
            ).fetchall()

        return [dict(r) for r in rows]
    finally:
        db.close()
