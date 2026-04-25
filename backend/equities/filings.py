"""
SEC EDGAR filing browser — fetch recent filings, annual reports, and 
institutional ownership from SEC EDGAR.

Uses:
  - EDGAR full-text search API for filings list
  - EDGAR company filings API for 10-K, 10-Q, 8-K, DEF 14A
  - CIK-based institutional holdings from 13F filings
"""
from __future__ import annotations

import json
import logging
import time
import urllib.request
from typing import Optional

from equities.db import get_db

logger = logging.getLogger(__name__)

SEC_USER_AGENT = "Paloor/1.0 (contact@paloor.com)"
SEC_HEADERS = {"User-Agent": SEC_USER_AGENT, "Accept": "application/json"}

_last_req = 0.0


def _throttle():
    global _last_req
    now = time.time()
    if now - _last_req < 0.125:
        time.sleep(0.125 - (now - _last_req))
    _last_req = time.time()


def _sec_get(url: str) -> Optional[dict]:
    """Make a throttled GET to SEC EDGAR."""
    _throttle()
    req = urllib.request.Request(url, headers=SEC_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        logger.error(f"SEC request failed: {url} — {e}")
        return None


def get_company_filings(ticker: str, filing_types: Optional[list[str]] = None, limit: int = 40) -> list[dict]:
    """
    Get recent SEC filings for a company.
    filing_types: e.g. ['10-K', '10-Q', '8-K', 'DEF 14A']
    """
    db = get_db()
    row = db.execute("SELECT cik FROM companies WHERE ticker = %s", (ticker.upper(),)).fetchone()
    db.close()

    if not row or not row["cik"]:
        return []

    cik = row["cik"].lstrip("0")
    url = f"https://data.sec.gov/submissions/CIK{row['cik'].zfill(10)}.json"
    data = _sec_get(url)
    if not data:
        return []

    filings = []
    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    accessions = recent.get("accessionNumber", [])
    descriptions = recent.get("primaryDocDescription", [])
    primary_docs = recent.get("primaryDocument", [])

    for i in range(min(len(forms), limit * 3)):
        form = forms[i] if i < len(forms) else ""
        if filing_types and form not in filing_types:
            continue

        accession = accessions[i].replace("-", "") if i < len(accessions) else ""
        acc_formatted = accessions[i] if i < len(accessions) else ""
        doc = primary_docs[i] if i < len(primary_docs) else ""

        filing_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{doc}" if doc else ""

        filings.append({
            "type": form,
            "date": dates[i] if i < len(dates) else "",
            "description": descriptions[i] if i < len(descriptions) else form,
            "url": filing_url,
            "accession": acc_formatted,
        })

        if len(filings) >= limit:
            break

    return filings


def get_institutional_holders(ticker: str) -> dict:
    """
    Get shareholder data from yfinance (institutional holders, major holders).
    SEC 13F data is complex to parse, yfinance provides a decent summary.
    """
    try:
        import yfinance as yf
        tkr = yf.Ticker(ticker.upper())

        result = {
            "major_holders": [],
            "institutional_holders": [],
            "insider_holders": [],
        }

        # Major holders breakdown
        try:
            mh = tkr.major_holders
            if mh is not None and not mh.empty:
                for _, row in mh.iterrows():
                    result["major_holders"].append({
                        "value": str(row.iloc[0]),
                        "description": str(row.iloc[1]) if len(row) > 1 else "",
                    })
        except Exception:
            pass

        # Top institutional holders
        try:
            ih = tkr.institutional_holders
            if ih is not None and not ih.empty:
                for _, row in ih.head(20).iterrows():
                    holder = {}
                    for col in ih.columns:
                        val = row[col]
                        if hasattr(val, 'isoformat'):
                            holder[col] = val.isoformat()
                        elif hasattr(val, 'item'):
                            holder[col] = val.item()
                        else:
                            holder[col] = str(val)
                    result["institutional_holders"].append(holder)
        except Exception:
            pass

        # Insider holders
        try:
            ins = tkr.insider_transactions
            if ins is not None and not ins.empty:
                for _, row in ins.head(20).iterrows():
                    txn = {}
                    for col in ins.columns:
                        val = row[col]
                        if hasattr(val, 'isoformat'):
                            txn[col] = val.isoformat()
                        elif hasattr(val, 'item'):
                            txn[col] = val.item()
                        else:
                            txn[col] = str(val)
                    result["insider_holders"].append(txn)
        except Exception:
            pass

        return result
    except Exception as e:
        logger.error(f"Failed to get holders for {ticker}: {e}")
        return {"major_holders": [], "institutional_holders": [], "insider_holders": []}


def get_sec_documents(ticker: str) -> dict:
    """
    Get organized SEC documents — annual reports, quarterly, 8-K announcements.
    """
    all_filings = get_company_filings(
        ticker,
        filing_types=["10-K", "10-K/A", "10-Q", "10-Q/A", "8-K", "8-K/A", "DEF 14A", "S-1", "424B4"],
        limit=100,
    )

    annual_reports = [f for f in all_filings if f["type"] in ("10-K", "10-K/A")]
    quarterly_reports = [f for f in all_filings if f["type"] in ("10-Q", "10-Q/A")]
    announcements = [f for f in all_filings if f["type"] in ("8-K", "8-K/A")]
    other = [f for f in all_filings if f["type"] not in ("10-K", "10-K/A", "10-Q", "10-Q/A", "8-K", "8-K/A")]

    return {
        "annual_reports": annual_reports,
        "quarterly_reports": quarterly_reports,
        "announcements": announcements,
        "other": other,
        "total": len(all_filings),
    }
