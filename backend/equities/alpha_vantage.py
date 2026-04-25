"""
Alpha Vantage API client — replaces SEC EDGAR for fundamental data.

Fetches and stores:
  - Company Overview (ratios, key metrics)
  - Income Statement (annual + quarterly)
  - Balance Sheet (annual + quarterly)
  - Cash Flow (annual + quarterly)
  - Earnings (history + estimates)

Data is stored in av_fundamentals table as raw JSON, keyed by
(ticker, function_name). This avoids lossy XBRL parsing and gives
us exactly what Alpha Vantage provides.

Premium: 75 requests/minute. We cache aggressively.
"""
from __future__ import annotations

import json
import logging
import time
import urllib.request
from datetime import datetime, timezone
from typing import Optional

from config import settings
from equities.db import get_db

logger = logging.getLogger(__name__)

AV_BASE = "https://www.alphavantage.co/query"

# Rate limiter — premium tier is 75/min
_last_request_time = 0.0
_MIN_INTERVAL = 0.8  # 75 req/min (1 req per 0.8s to be safe)


def _throttle():
    global _last_request_time
    now = time.time()
    elapsed = now - _last_request_time
    if elapsed < _MIN_INTERVAL:
        time.sleep(_MIN_INTERVAL - elapsed)
    _last_request_time = time.time()


def _av_fetch(function: str, symbol: str, **extra_params) -> Optional[dict]:
    """
    Call Alpha Vantage API and return parsed JSON.
    Returns None on error or rate limit.
    """
    api_key = settings.alpha_vantage_api_key
    if not api_key:
        logger.error("ALPHA_VANTAGE_API_KEY not configured")
        return None

    params = f"function={function}&symbol={symbol}&apikey={api_key}"
    for k, v in extra_params.items():
        params += f"&{k}={v}"
    url = f"{AV_BASE}?{params}"

    _throttle()
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())

        # Check for rate limit / error messages
        if "Note" in data or "Information" in data:
            msg = data.get("Note") or data.get("Information", "")
            logger.warning(f"Alpha Vantage rate limit for {function}/{symbol}: {msg}")
            return None
        if "Error Message" in data:
            logger.error(f"Alpha Vantage error for {function}/{symbol}: {data['Error Message']}")
            return None

        return data
    except Exception as e:
        logger.error(f"Alpha Vantage fetch error for {function}/{symbol}: {e}")
        return None


# ── Storage ──────────────────────────────────────────────────────────────────

def _store_av_data(ticker: str, function_name: str, data: dict) -> None:
    """Store Alpha Vantage response in av_fundamentals table."""
    db = get_db()
    try:
        db.execute("""
            INSERT INTO av_fundamentals (ticker, function_name, data, fetched_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (ticker, function_name) DO UPDATE SET
                data = EXCLUDED.data,
                fetched_at = EXCLUDED.fetched_at
        """, (ticker.upper(), function_name, json.dumps(data),
              datetime.now(timezone.utc)))
        db.commit()
    finally:
        db.close()


def _get_av_data(ticker: str, function_name: str) -> Optional[dict]:
    """Read cached Alpha Vantage data from DB."""
    db = get_db()
    try:
        row = db.execute("""
            SELECT data, fetched_at FROM av_fundamentals
            WHERE ticker = %s AND function_name = %s
        """, (ticker.upper(), function_name)).fetchone()
        if row:
            raw = row["data"]
            if isinstance(raw, str):
                return json.loads(raw)
            return raw
        return None
    finally:
        db.close()


def get_av_data_age_hours(ticker: str, function_name: str) -> Optional[float]:
    """How many hours since this data was last fetched. None if never."""
    db = get_db()
    try:
        row = db.execute("""
            SELECT fetched_at FROM av_fundamentals
            WHERE ticker = %s AND function_name = %s
        """, (ticker.upper(), function_name)).fetchone()
        if row and row["fetched_at"]:
            fetched = row["fetched_at"]
            if isinstance(fetched, str):
                fetched = datetime.fromisoformat(fetched)
            if fetched.tzinfo is None:
                fetched = fetched.replace(tzinfo=timezone.utc)
            age = (datetime.now(timezone.utc) - fetched).total_seconds() / 3600
            return age
        return None
    finally:
        db.close()


# ── Public API — fetch + cache ───────────────────────────────────────────────

FUNCTIONS = [
    "OVERVIEW",
    "INCOME_STATEMENT",
    "BALANCE_SHEET",
    "CASH_FLOW",
    "EARNINGS",
]


def fetch_overview(ticker: str, force: bool = False) -> Optional[dict]:
    """Fetch company overview (key metrics, ratios, profile)."""
    if not force:
        cached = _get_av_data(ticker, "OVERVIEW")
        if cached:
            return cached
    data = _av_fetch("OVERVIEW", ticker)
    if data:
        _store_av_data(ticker, "OVERVIEW", data)
    return data


def fetch_income_statement(ticker: str, force: bool = False) -> Optional[dict]:
    """Fetch annual + quarterly income statements."""
    if not force:
        cached = _get_av_data(ticker, "INCOME_STATEMENT")
        if cached:
            return cached
    data = _av_fetch("INCOME_STATEMENT", ticker)
    if data:
        _store_av_data(ticker, "INCOME_STATEMENT", data)
    return data


def fetch_balance_sheet(ticker: str, force: bool = False) -> Optional[dict]:
    """Fetch annual + quarterly balance sheets."""
    if not force:
        cached = _get_av_data(ticker, "BALANCE_SHEET")
        if cached:
            return cached
    data = _av_fetch("BALANCE_SHEET", ticker)
    if data:
        _store_av_data(ticker, "BALANCE_SHEET", data)
    return data


def fetch_cash_flow(ticker: str, force: bool = False) -> Optional[dict]:
    """Fetch annual + quarterly cash flow statements."""
    if not force:
        cached = _get_av_data(ticker, "CASH_FLOW")
        if cached:
            return cached
    data = _av_fetch("CASH_FLOW", ticker)
    if data:
        _store_av_data(ticker, "CASH_FLOW", data)
    return data


def fetch_earnings(ticker: str, force: bool = False) -> Optional[dict]:
    """Fetch earnings history + estimates."""
    if not force:
        cached = _get_av_data(ticker, "EARNINGS")
        if cached:
            return cached
    data = _av_fetch("EARNINGS", ticker)
    if data:
        _store_av_data(ticker, "EARNINGS", data)
    return data


def fetch_all_fundamentals(ticker: str, force: bool = False) -> dict:
    """
    Fetch all fundamental data for a ticker.
    Returns dict of {function_name: data_or_None}.
    Respects rate limits (waits between requests).
    """
    ticker = ticker.upper()
    results = {}
    for func in FUNCTIONS:
        fetcher = {
            "OVERVIEW": fetch_overview,
            "INCOME_STATEMENT": fetch_income_statement,
            "BALANCE_SHEET": fetch_balance_sheet,
            "CASH_FLOW": fetch_cash_flow,
            "EARNINGS": fetch_earnings,
        }[func]
        data = fetcher(ticker, force=force)
        results[func] = data
        if data:
            logger.info(f"Fetched {func} for {ticker}")
        else:
            logger.warning(f"Failed to fetch {func} for {ticker}")
    return results


def get_cached_fundamentals(ticker: str) -> dict:
    """Get all cached AV data for a ticker (no API calls)."""
    ticker = ticker.upper()
    results = {}
    for func in FUNCTIONS:
        results[func] = _get_av_data(ticker, func)
    return results


def get_fetch_status(ticker: str) -> dict:
    """Get status of what data is cached and how old it is."""
    ticker = ticker.upper()
    all_funcs = FUNCTIONS + ["TIME_SERIES_DAILY_ADJUSTED", "TIME_SERIES_DAILY"]
    status = {}
    for func in all_funcs:
        age = get_av_data_age_hours(ticker, func)
        status[func] = {
            "cached": age is not None,
            "age_hours": round(age, 1) if age is not None else None,
        }
    return status


# ── Price data (TIME_SERIES_DAILY_ADJUSTED / TIME_SERIES_DAILY) ─────────────

def _cached_series_is_full(data: dict) -> bool:
    ts = data.get("Time Series (Daily)", {})
    return len(ts) > 100

def fetch_daily_prices(ticker: str, outputsize: str = "compact", force: bool = False) -> Optional[dict]:
    """
    Fetch daily OHLCV data from Alpha Vantage.
    outputsize: 'compact' (100 days) or 'full' (20+ years).
    Prefers TIME_SERIES_DAILY_ADJUSTED when available and falls back to
    TIME_SERIES_DAILY for environments without premium access.
    """
    primary_func_name = "TIME_SERIES_DAILY_ADJUSTED"
    fallback_func_name = "TIME_SERIES_DAILY"

    if not force:
        cached = _get_av_data(ticker, primary_func_name)
        if cached:
            if outputsize != "full":
                return cached

            if _cached_series_is_full(cached):
                return cached

        legacy_cached = _get_av_data(ticker, fallback_func_name)
        if outputsize != "full" and legacy_cached:
            return legacy_cached

    data = _av_fetch(primary_func_name, ticker, outputsize=outputsize)
    if data and "Time Series (Daily)" in data:
        _store_av_data(ticker, primary_func_name, data)
        return data

    if not force:
        legacy_cached = _get_av_data(ticker, fallback_func_name)
        if legacy_cached and (outputsize != "full" or _cached_series_is_full(legacy_cached)):
            return legacy_cached

    data = _av_fetch(fallback_func_name, ticker, outputsize=outputsize)
    if data and "Time Series (Daily)" in data:
        _store_av_data(ticker, fallback_func_name, data)
        return data

    return None


# ── Symbol Search ─────────────────────────────────────────────────────────────

def symbol_search(keywords: str, limit: int = 10) -> list[dict]:
    """
    Search for symbols/companies matching keywords using Alpha Vantage.
    Returns list of {symbol, name, type, region, marketOpen, marketClose, timezone, currency, matchScore}.
    Results are NOT cached — this is a live search.
    """
    if not keywords or not keywords.strip():
        return []

    api_key = settings.alpha_vantage_api_key
    if not api_key:
        logger.error("ALPHA_VANTAGE_API_KEY not configured")
        return []

    params = f"function=SYMBOL_SEARCH&keywords={urllib.request.quote(keywords)}&apikey={api_key}"
    url = f"{AV_BASE}?{params}"

    _throttle()
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())

        if "Note" in data or "Information" in data:
            msg = data.get("Note") or data.get("Information", "")
            logger.warning(f"Alpha Vantage rate limit on symbol search: {msg}")
            return []
        if "Error Message" in data:
            logger.error(f"Alpha Vantage symbol search error: {data['Error Message']}")
            return []

        matches = data.get("bestMatches", [])
        results = []
        for m in matches[:limit]:
            results.append({
                "symbol": m.get("1. symbol", ""),
                "name": m.get("2. name", ""),
                "type": m.get("3. type", ""),
                "region": m.get("4. region", ""),
                "marketOpen": m.get("5. marketOpen", ""),
                "marketClose": m.get("6. marketClose", ""),
                "timezone": m.get("7. timezone", ""),
                "currency": m.get("8. currency", ""),
                "matchScore": m.get("9. matchScore", ""),
            })
        return results
    except Exception as e:
        logger.error(f"Alpha Vantage symbol search error: {e}")
        return []
