"""
Seed S&P 500 companies with CIK mappings from SEC EDGAR.

SEC provides a company_tickers.json that maps every CIK to tickers.
We cross-reference with the Wikipedia S&P 500 list to get the full universe.
"""
from __future__ import annotations

import json
import logging
import urllib.request
from typing import Optional

import pandas as pd

from equities.db import get_db

logger = logging.getLogger(__name__)

# SEC requires a User-Agent header — set this to your name + email
SEC_USER_AGENT = "Paloor/1.0 (contact@paloor.com)"
SEC_HEADERS = {"User-Agent": SEC_USER_AGENT}


def _fetch_sec_tickers() -> dict[str, str]:
    """
    Fetch SEC EDGAR company_tickers.json → {ticker: CIK (zero-padded to 10 digits)}.
    This file maps ALL tickers to CIKs.
    """
    url = "https://www.sec.gov/files/company_tickers.json"
    req = urllib.request.Request(url, headers=SEC_HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())

    ticker_to_cik = {}
    for entry in data.values():
        ticker = entry.get("ticker", "").upper()
        cik = str(entry.get("cik_str", "")).zfill(10)
        if ticker:
            ticker_to_cik[ticker] = cik
    logger.info(f"Fetched {len(ticker_to_cik)} ticker→CIK mappings from SEC")
    return ticker_to_cik


def _fetch_sp500_from_wikipedia() -> list[dict]:
    """Scrape the S&P 500 constituent list from Wikipedia."""
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    tables = pd.read_html(urllib.request.urlopen(req, timeout=30))
    sp500 = tables[0]
    # Wikipedia uses '.' in tickers like BRK.B, yfinance uses BRK-B
    sp500["Symbol"] = sp500["Symbol"].str.replace(".", "-", regex=False)
    records = []
    for _, row in sp500.iterrows():
        records.append({
            "ticker": row["Symbol"].strip().upper(),
            "name": row.get("Security", ""),
            "sector": row.get("GICS Sector", ""),
            "industry": row.get("GICS Sub-Industry", ""),
        })
    logger.info(f"Fetched {len(records)} S&P 500 companies from Wikipedia")
    return records


def seed_companies(force: bool = False) -> int:
    """
    Seed the companies table with S&P 500 tickers + CIK mappings.
    Returns number of companies inserted/updated.
    """
    db = get_db()

    # Check if already seeded
    count = list(db.execute("SELECT COUNT(*) FROM companies").fetchone().values())[0]
    if count >= 490 and not force:
        logger.info(f"Companies table already has {count} rows, skipping seed")
        db.close()
        return count

    # Fetch data
    sp500 = _fetch_sp500_from_wikipedia()
    sec_tickers = _fetch_sec_tickers()

    inserted = 0
    for company in sp500:
        ticker = company["ticker"]
        cik = sec_tickers.get(ticker, sec_tickers.get(ticker.replace("-", "."), ""))

        db.execute("""
            INSERT INTO companies (ticker, name, cik, sector, industry)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT(ticker) DO UPDATE SET
                name = excluded.name,
                cik = excluded.cik,
                sector = excluded.sector,
                industry = excluded.industry
        """, (ticker, company["name"], cik, company["sector"], company["industry"]))
        inserted += 1

    db.commit()
    db.close()
    logger.info(f"Seeded {inserted} S&P 500 companies")
    return inserted


def get_companies() -> list[dict]:
    """Return all companies with their info."""
    db = get_db()
    rows = db.execute("""
        SELECT ticker, name, cik, sector, industry, market_cap,
               last_price_update, last_filing_update
        FROM companies
        WHERE is_active = TRUE
        ORDER BY ticker
    """).fetchall()
    db.close()
    return [dict(r) for r in rows]


def get_company(ticker: str) -> Optional[dict]:
    """Return a single company by ticker."""
    db = get_db()
    row = db.execute(
        "SELECT * FROM companies WHERE ticker = %s", (ticker.upper(),)
    ).fetchone()
    db.close()
    return dict(row) if row else None
