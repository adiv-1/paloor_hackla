"""
Bulk-ingest AlphaVantage fundamentals for all S&P 500 (or a custom ticker list).

Reads tickers from the `companies` table by default (the same set used by the
screener). For each ticker it fetches OVERVIEW, INCOME_STATEMENT, BALANCE_SHEET,
CASH_FLOW, and EARNINGS, storing the raw JSON in `av_fundamentals`. Rate
limiting (75 req/min) is already enforced inside `alpha_vantage._throttle`.

Usage (from backend/ with venv activated):

    python -m equities.sp500_bulk_ingest                    # all active companies
    python -m equities.sp500_bulk_ingest --missing-only     # skip tickers that already have all 5 functions
    python -m equities.sp500_bulk_ingest --max-age-hours 168  # refetch anything older than 7 days
    python -m equities.sp500_bulk_ingest --limit 50         # first 50 only
    python -m equities.sp500_bulk_ingest --tickers AAPL,MSFT,NVDA
    python -m equities.sp500_bulk_ingest --include-prices   # also pull daily prices (full history)
"""
from __future__ import annotations

import argparse
import logging
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterable

from equities.db import get_db
from equities.alpha_vantage import (
    FUNCTIONS,
    fetch_overview,
    fetch_income_statement,
    fetch_balance_sheet,
    fetch_cash_flow,
    fetch_earnings,
    fetch_daily_prices,
    get_av_data_age_hours,
)

logger = logging.getLogger("sp500_bulk_ingest")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)

FETCHERS = {
    "OVERVIEW": fetch_overview,
    "INCOME_STATEMENT": fetch_income_statement,
    "BALANCE_SHEET": fetch_balance_sheet,
    "CASH_FLOW": fetch_cash_flow,
    "EARNINGS": fetch_earnings,
}


def load_tickers_from_db() -> list[str]:
    db = get_db()
    try:
        rows = db.execute(
            "SELECT ticker FROM companies WHERE is_active = TRUE ORDER BY ticker"
        ).fetchall()
    finally:
        try:
            db.close()
        except Exception:
            pass
    return [r["ticker"].upper() for r in rows]


def needs_fetch(ticker: str, function: str, max_age_hours: float | None) -> bool:
    age = get_av_data_age_hours(ticker, function)
    if age is None:
        return True
    if max_age_hours is None:
        return False
    return age > max_age_hours


def ingest_one(
    ticker: str,
    *,
    force: bool,
    missing_only: bool,
    max_age_hours: float | None,
    include_prices: bool,
) -> dict[str, str]:
    """Returns {function: 'fetched'|'cached'|'failed'} for one ticker."""
    statuses: dict[str, str] = {}
    for func in FUNCTIONS:
        try:
            if not force and missing_only and not needs_fetch(ticker, func, max_age_hours):
                statuses[func] = "cached"
                continue
            data = FETCHERS[func](ticker, force=force)
            statuses[func] = "fetched" if data else "failed"
        except Exception as exc:  # noqa: BLE001
            logger.exception("error %s/%s: %s", ticker, func, exc)
            statuses[func] = "failed"

    if include_prices:
        try:
            data = fetch_daily_prices(ticker, outputsize="full", force=force)
            statuses["DAILY_PRICES"] = "fetched" if data else "failed"
        except Exception as exc:  # noqa: BLE001
            logger.exception("error %s/DAILY_PRICES: %s", ticker, exc)
            statuses["DAILY_PRICES"] = "failed"
    return statuses


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bulk AlphaVantage ingestion for S&P 500.")
    parser.add_argument("--tickers", help="Comma-separated tickers (overrides DB list).")
    parser.add_argument("--limit", type=int, default=None, help="Process only the first N tickers.")
    parser.add_argument(
        "--missing-only",
        action="store_true",
        help="Skip tickers/functions already cached (subject to --max-age-hours).",
    )
    parser.add_argument(
        "--max-age-hours",
        type=float,
        default=None,
        help="With --missing-only: also refetch anything older than this many hours.",
    )
    parser.add_argument("--force", action="store_true", help="Refetch everything.")
    parser.add_argument(
        "--include-prices",
        action="store_true",
        help="Also fetch full daily price history for each ticker.",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=8,
        help="Parallel worker threads (rate-limited shared token bucket caps total at 75 req/min).",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    if args.tickers:
        tickers = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
    else:
        tickers = load_tickers_from_db()

    if args.limit:
        tickers = tickers[: args.limit]

    if not tickers:
        logger.error("No tickers to process.")
        return 1

    logger.info("Ingesting %d tickers (force=%s, missing_only=%s, max_age=%s, prices=%s)",
                len(tickers), args.force, args.missing_only, args.max_age_hours, args.include_prices)

    started = time.time()
    totals = {"fetched": 0, "cached": 0, "failed": 0}

    def _run(idx_ticker):
        i, ticker = idx_ticker
        t0 = time.time()
        statuses = ingest_one(
            ticker,
            force=args.force,
            missing_only=args.missing_only,
            max_age_hours=args.max_age_hours,
            include_prices=args.include_prices,
        )
        elapsed = time.time() - t0
        return i, ticker, statuses, elapsed

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(_run, (i, t)) for i, t in enumerate(tickers, start=1)]
        for fut in as_completed(futures):
            i, ticker, statuses, elapsed = fut.result()
            for s in statuses.values():
                if s in totals:
                    totals[s] += 1
            summary = " ".join(f"{k}={v}" for k, v in statuses.items())
            logger.info("[%d/%d] %s (%.1fs) %s", i, len(tickers), ticker, elapsed, summary)

    duration = time.time() - started
    logger.info(
        "DONE %d tickers in %.1fs — fetched=%d cached=%d failed=%d",
        len(tickers),
        duration,
        totals["fetched"],
        totals["cached"],
        totals["failed"],
    )
    return 0 if totals["failed"] == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
