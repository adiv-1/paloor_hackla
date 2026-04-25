"""
Equities API router — company list, financials, price history, pipeline triggers.

Endpoints:
  GET  /api/equities/companies          — List all S&P 500 companies
  GET  /api/equities/companies/{ticker}  — Company detail + financials summary
  GET  /api/equities/financials/{ticker} — Full financial statements
  GET  /api/equities/prices/{ticker}     — Price history
  POST /api/equities/seed               — Seed S&P 500 companies + CIK mappings
  POST /api/equities/fetch-av/{ticker}   — Trigger Alpha Vantage fetch
  GET  /api/equities/av-status/{ticker}  — Alpha Vantage data cache status
  POST /api/equities/fetch-prices       — Trigger price fetch for a ticker
"""
from __future__ import annotations

import json
import logging
import threading
import time

from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from equities.db import init_equities_db
from equities.seed import seed_companies, get_companies, get_company
from equities.alpha_vantage import fetch_all_fundamentals, get_fetch_status, get_cached_fundamentals
from equities.statements import get_financial_statement, get_all_statements, get_financials_summary
from equities.prices import fetch_price_history, fetch_batch_prices, get_price_history
from equities.ratios import compute_ratios
from equities.analysis import get_stock_analysis
from equities.filings import get_sec_documents, get_institutional_holders
from equities.screener import screen_stocks, get_supported_expression_fields
from equities.news import process_event, process_all_events, get_event_insight, get_all_event_insights
from equities.alpha_vantage import symbol_search as av_symbol_search

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/equities/v2", tags=["equities-v2"])

# Track background jobs
_bg_jobs: dict[str, dict] = {}


# ── Company endpoints ─────────────────────────────────────────────────────────

@router.get("/companies")
def list_companies(
    sector: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=1000),
):
    """List all S&P 500 companies with pagination and search."""
    companies = get_companies()

    # Filter by sector
    if sector:
        companies = [c for c in companies if c.get("sector", "").lower() == sector.lower()]

    # Filter by search (ticker or name)
    if search:
        q = search.lower()
        companies = [
            c for c in companies
            if q in c["ticker"].lower() or q in c.get("name", "").lower()
        ]

    total = len(companies)
    start = (page - 1) * per_page
    end = start + per_page

    return {
        "companies": companies[start:end],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    }


@router.get("/companies/{ticker}")
def company_detail(ticker: str):
    """Get company info + financials summary + AV overview metadata."""
    company = get_company(ticker)
    cached = get_cached_fundamentals(ticker)
    av_ov = cached.get("OVERVIEW") or {}

    # Build enriched overview_meta from AV OVERVIEW data
    overview_meta = {
        "description": av_ov.get("Description", ""),
        "official_site": av_ov.get("OfficialSite", ""),
        "exchange": av_ov.get("Exchange", ""),
        "currency": av_ov.get("Currency", "USD"),
        "country": av_ov.get("Country", ""),
        "fiscal_year_end": av_ov.get("FiscalYearEnd", ""),
        "latest_quarter": av_ov.get("LatestQuarter", ""),
        "market_cap": av_ov.get("MarketCapitalization", ""),
        "ebitda": av_ov.get("EBITDA", ""),
        "pe_ratio": av_ov.get("PERatio", ""),
        "forward_pe": av_ov.get("ForwardPE", ""),
        "peg_ratio": av_ov.get("PEGRatio", ""),
        "book_value": av_ov.get("BookValue", ""),
        "dividend_per_share": av_ov.get("DividendPerShare", ""),
        "dividend_yield": av_ov.get("DividendYield", ""),
        "eps": av_ov.get("EPS", ""),
        "roe": av_ov.get("ReturnOnEquityTTM", ""),
        "roa": av_ov.get("ReturnOnAssetsTTM", ""),
        "beta": av_ov.get("Beta", ""),
        "high_52w": av_ov.get("52WeekHigh", ""),
        "low_52w": av_ov.get("52WeekLow", ""),
        "analyst_target": av_ov.get("AnalystTargetPrice", ""),
        "revenue_ttm": av_ov.get("RevenueTTM", ""),
        "profit_margin": av_ov.get("ProfitMargin", ""),
        "operating_margin": av_ov.get("OperatingMarginTTM", ""),
        "roce": av_ov.get("ReturnOnAssetsTTM", ""),  # ROCE approximation
        "shares_outstanding": av_ov.get("SharesOutstanding", ""),
    } if av_ov else {}

    if not company:
        if av_ov:
            company = {
                "ticker": ticker.upper(),
                "name": av_ov.get("Name", ticker.upper()),
                "sector": av_ov.get("Sector", ""),
                "industry": av_ov.get("Industry", ""),
                "description": av_ov.get("Description", ""),
                "exchange": av_ov.get("Exchange", ""),
                "currency": av_ov.get("Currency", "USD"),
                "country": av_ov.get("Country", ""),
            }
        else:
            raise HTTPException(404, f"Company {ticker} not found")

    summary = get_financials_summary(ticker)

    return {
        **company,
        "overview_meta": overview_meta,
        "financials_summary": summary,
    }


@router.get("/sectors")
def list_sectors():
    """List all unique sectors."""
    companies = get_companies()
    sectors = sorted(set(c.get("sector", "") for c in companies if c.get("sector")))
    return {"sectors": sectors}


# ── Financial statements ──────────────────────────────────────────────────────

@router.get("/financials/{ticker}")
def financials(
    ticker: str,
    statement: str = Query("income", pattern="^(income|balance|cashflow)$"),
    period_type: str = Query("annual", pattern="^(annual|quarterly)$"),
):
    """Get a financial statement for a company."""
    return get_financial_statement(ticker, statement, period_type)


@router.get("/financials/{ticker}/all")
def all_financials(
    ticker: str,
    period_type: str = Query("annual", pattern="^(annual|quarterly)$"),
):
    """Get all three financial statements for a company."""
    return get_all_statements(ticker, period_type)


# ── Price history ─────────────────────────────────────────────────────────────

@router.get("/prices/{ticker}")
def prices(
    ticker: str,
    period: str = Query("1Y", pattern="^(1M|3M|6M|1Y|2Y|3Y|5Y|10Y|MAX)$"),
):
    """Get stored price history for a ticker."""
    data = get_price_history(ticker, period)

    return {
        "ticker": ticker.upper(),
        "period": period,
        "data": data,
        "count": len(data),
    }


# ── Pipeline triggers ─────────────────────────────────────────────────────────

class SeedRequest(BaseModel):
    force: bool = False


@router.post("/seed")
def seed(req: SeedRequest = SeedRequest()):
    """Seed S&P 500 companies with CIK mappings from SEC EDGAR."""
    try:
        count = seed_companies(force=req.force)
        return {"status": "ok", "companies_seeded": count}
    except Exception as e:
        logger.exception("Seed failed")
        raise HTTPException(500, str(e))


class FetchRequest(BaseModel):
    ticker: Optional[str] = None    # If set, fetch just this ticker
    force: bool = False             # Force re-fetch even if cached


@router.post("/fetch-av/{ticker}")
def trigger_fetch_av(ticker: str, force: bool = False):
    """
    Trigger Alpha Vantage fundamental data fetch for a ticker.
    Fetches overview, income, balance sheet, cash flow, earnings.
    Rate-limited: ~5 req/min on free tier.
    """
    results = fetch_all_fundamentals(ticker.upper(), force=force)
    fetched = sum(1 for v in results.values() if v is not None)
    failed = sum(1 for v in results.values() if v is None)

    return {
        "status": "ok",
        "ticker": ticker.upper(),
        "fetched": fetched,
        "failed": failed,
        "details": {k: ("ok" if v else "failed") for k, v in results.items()},
    }


@router.get("/av-status/{ticker}")
def av_status(ticker: str):
    """Check what Alpha Vantage data is cached for a ticker."""
    return {
        "ticker": ticker.upper(),
        "status": get_fetch_status(ticker),
    }


@router.post("/fetch-prices/{ticker}")
def trigger_fetch_prices(ticker: str, outputsize: str = Query("full", pattern="^(compact|full)$")):
    """Fetch daily adjusted price history from Alpha Vantage."""
    count = fetch_price_history(ticker.upper(), outputsize=outputsize)
    return {"status": "ok", "ticker": ticker.upper(), "rows_stored": count}


@router.post("/fetch-prices-batch")
def trigger_fetch_prices_batch(
    limit: int = Query(0, ge=0, le=1000),
    missing_only: bool = Query(True),
    background: bool = Query(True),
):
    """Fetch price history for all (or missing) companies in batch."""
    from equities.db import get_db

    companies = get_companies()
    tickers = [c["ticker"] for c in companies]

    if missing_only:
        db = get_db()
        priced = {
            r[0]
            for r in db.execute("SELECT DISTINCT ticker FROM price_history").fetchall()
        }
        db.close()
        tickers = [t for t in tickers if t not in priced]

    if limit > 0:
        tickers = tickers[:limit]

    if not tickers:
        return {"status": "ok", "message": "No tickers need price sync.", "total": 0}

    if background:
        job_id = f"fetch_prices_batch_{len(_bg_jobs)}"
        _bg_jobs[job_id] = {"status": "running", "progress": "starting..."}

        def _run():
            def progress(ticker, idx, total):
                _bg_jobs[job_id]["progress"] = f"{ticker} ({idx}/{total})"

            result = fetch_batch_prices(tickers, progress_callback=progress)
            _bg_jobs[job_id] = {"status": "complete", **result}

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        return {
            "status": "started",
            "job_id": job_id,
            "total": len(tickers),
            "message": "Price sync started in background. Check /job-status/{job_id}.",
        }

    result = fetch_batch_prices(tickers)
    return {"status": "ok", "total": len(tickers), **result}


@router.get("/job-status/{job_id}")
def job_status(job_id: str):
    """Check status of a background job."""
    job = _bg_jobs.get(job_id)
    if not job:
        raise HTTPException(404, f"Job {job_id} not found")
    return job


# ── Data stats ────────────────────────────────────────────────────────────────

@router.get("/stats")
def data_stats():
    """Get stats about available data."""
    from equities.db import get_db
    db = get_db()

    companies = list(db.execute("SELECT COUNT(*) FROM companies").fetchone().values())[0]
    companies_with_cik = list(db.execute("SELECT COUNT(*) FROM companies WHERE cik != '' AND cik IS NOT NULL").fetchone().values())[0]
    av_entries = list(db.execute("SELECT COUNT(*) FROM av_fundamentals").fetchone().values())[0]
    av_tickers = list(db.execute("SELECT COUNT(DISTINCT ticker) FROM av_fundamentals").fetchone().values())[0]
    price_rows = list(db.execute("SELECT COUNT(*) FROM price_history").fetchone().values())[0]
    price_tickers = list(db.execute("SELECT COUNT(DISTINCT ticker) FROM price_history").fetchone().values())[0]

    db.close()

    return {
        "companies": companies,
        "companies_with_cik": companies_with_cik,
        "av_data_entries": av_entries,
        "companies_with_av_data": av_tickers,
        "price_data_rows": price_rows,
        "companies_with_prices": price_tickers,
    }


# ── Search (ticker or name, lightweight) ──────────────────────────────────────

@router.get("/search")
def search_companies(
    q: str = Query(..., min_length=1),
    limit: int = Query(15, ge=1, le=50),
):
    """Quick search for autocomplete — returns ticker, name, sector."""
    companies = get_companies()
    query = q.lower()
    # Exact ticker match first, then prefix, then contains
    exact = []
    prefix = []
    contains = []
    for c in companies:
        t = c["ticker"].lower()
        n = c.get("name", "").lower()
        if t == query:
            exact.append(c)
        elif t.startswith(query) or n.startswith(query):
            prefix.append(c)
        elif query in t or query in n:
            contains.append(c)
    results = (exact + prefix + contains)[:limit]
    return [{"ticker": c["ticker"], "name": c["name"], "sector": c.get("sector", "")} for c in results]


@router.get("/screener")
def screener(
    search: Optional[str] = None,
    sector: Optional[str] = None,
    industry: Optional[str] = None,
    expression: Optional[str] = None,
    min_market_cap: Optional[float] = None,
    max_market_cap: Optional[float] = None,
    min_pe: Optional[float] = None,
    max_pe: Optional[float] = None,
    min_roe: Optional[float] = None,
    max_debt_to_equity: Optional[float] = None,
    min_current_ratio: Optional[float] = None,
    min_revenue: Optional[float] = None,
    min_net_income: Optional[float] = None,
    min_operating_cf: Optional[float] = None,
    min_free_cf: Optional[float] = None,
    sort_by: str = Query(
        "market_cap",
        pattern="^(market_cap|price|pe|price_to_book|gross_margin|operating_margin|roe|current_ratio|debt_to_equity|revenue|net_income|operating_cash_flow|free_cash_flow)$",
    ),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """Stock screener using stored financials and price history data."""
    try:
        return screen_stocks(
            search=search,
            sector=sector,
            industry=industry,
            min_market_cap=min_market_cap,
            max_market_cap=max_market_cap,
            min_pe=min_pe,
            max_pe=max_pe,
            min_roe=min_roe,
            max_debt_to_equity=max_debt_to_equity,
            min_current_ratio=min_current_ratio,
            min_revenue=min_revenue,
            min_net_income=min_net_income,
            min_operating_cf=min_operating_cf,
            min_free_cf=min_free_cf,
            expression=expression,
            sort_by=sort_by,
            sort_order=sort_order,
            page=page,
            per_page=per_page,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/screener/fields")
def screener_fields():
    """Return supported expression fields for screener query builder/autocomplete."""
    return {
        "fields": get_supported_expression_fields(),
        "operators": [">", "<", ">=", "<=", "="],
        "examples": [
            "gross margin > 40 AND pe < 15",
            "debt/equity < 0.5 AND current ratio > 1.2",
            "free cash flow > 1000000000 AND roe > 15",
        ],
    }


# ── Ratios ────────────────────────────────────────────────────────────────────

@router.get("/ratios/{ticker}")
def ratios(ticker: str):
    """Compute all financial ratios for a company."""
    company = get_company(ticker) or {}
    return {
        "ticker": ticker.upper(),
        "company": company.get("name", ticker.upper()),
        "sector": company.get("sector", ""),
        "industry": company.get("industry", ""),
        "ratios": compute_ratios(ticker),
    }


# ── Stock analysis (Markov regimes, z-scores, inflections) ────────────────────

@router.get("/analysis/{ticker}")
def stock_analysis(
    ticker: str,
    years: int = Query(5, ge=1, le=10),
):
    """Get technical analysis — Markov regimes, z-score events, inflection points."""
    company = get_company(ticker)
    if not company:
        raise HTTPException(404, f"Company {ticker} not found")

    result = get_stock_analysis(ticker, years)
    if "error" in result:
        # Try fetching prices first
        fetch_price_history(ticker.upper(), years=10)
        result = get_stock_analysis(ticker, years)

    return result


# ── Shareholders ──────────────────────────────────────────────────────────────

@router.get("/shareholders/{ticker}")
def shareholders(ticker: str):
    """Get shareholder data — institutional holders, major holders."""
    company = get_company(ticker)
    if not company:
        raise HTTPException(404, f"Company {ticker} not found")
    return get_institutional_holders(ticker)


# ── SEC Documents ─────────────────────────────────────────────────────────────

@router.get("/documents/{ticker}")
def documents(ticker: str):
    """Get SEC filings — 10-K, 10-Q, 8-K organized by type."""
    company = get_company(ticker)
    if not company:
        raise HTTPException(404, f"Company {ticker} not found")
    return get_sec_documents(ticker)


# ── Stock News Intelligence ───────────────────────────────────────────────────

@router.get("/news/{ticker}/{event_date}")
def event_news(ticker: str, event_date: str):
    """
    Get the insight for a specific event: LLM-ranked top articles + summary.
    Returns cached results if available, otherwise empty.
    """
    company = get_company(ticker)
    if not company:
        raise HTTPException(404, f"Company {ticker} not found")
    result = get_event_insight(ticker, event_date)
    return result


@router.get("/news/{ticker}")
def all_event_summaries(ticker: str):
    """Get LLM summaries for all processed events of a stock."""
    company = get_company(ticker)
    if not company:
        raise HTTPException(404, f"Company {ticker} not found")
    return get_all_event_insights(ticker)


@router.post("/process-event/{ticker}")
def trigger_process_event(
    ticker: str,
    event_date: str = Query(..., description="Event date YYYY-MM-DD"),
    event_type: str = Query("zscore", description="zscore or regime_shift"),
    event_details: str = Query("", description="Context about the event"),
):
    """
    Run the full 3-stage pipeline for a single event:
    scrape → LLM rank → LLM summarize.
    Returns ranked articles + narrative summary.
    """
    company = get_company(ticker)
    if not company:
        raise HTTPException(404, f"Company {ticker} not found")

    result = process_event(
        ticker=ticker,
        company_name=company["name"],
        event_date=event_date,
        event_type=event_type,
        event_details=event_details,
    )
    return result


@router.post("/process-all-events/{ticker}")
def trigger_process_all(
    ticker: str,
    background: bool = Query(False, description="Run in background thread"),
):
    """
    Run the full pipeline for ALL events of a stock.
    This is the big button — scrapes + ranks + summarizes everything.
    """
    company = get_company(ticker)
    if not company:
        raise HTTPException(404, f"Company {ticker} not found")

    if background:
        def _run():
            try:
                process_all_events(ticker)
            except Exception as e:
                logger.error(f"Background news pipeline failed for {ticker}: {e}")
        threading.Thread(target=_run, daemon=True).start()
        return {"message": f"News pipeline started in background for {ticker}"}

    result = process_all_events(ticker)
    return result


# ── Symbol Search (Alpha Vantage live search) ─────────────────────────────────

@router.get("/symbol-search")
def symbol_search_endpoint(
    keywords: str = Query(..., min_length=1, description="Search keywords"),
    limit: int = Query(10, ge=1, le=20),
):
    """
    Search for ticker symbols / companies using Alpha Vantage Symbol Search API.
    Returns global results including non-US stocks.
    """
    results = av_symbol_search(keywords, limit=limit)
    return {"results": results, "count": len(results)}


# ── Bulk AV data fetch ────────────────────────────────────────────────────────

@router.post("/fetch-av-batch")
def fetch_av_batch(
    missing_only: bool = Query(True, description="Skip tickers already in av_fundamentals"),
    include_prices: bool = Query(True, description="Also fetch full price history"),
    limit: int = Query(0, ge=0, description="Max tickers to process (0 = all)"),
):
    """
    Bulk-fetch Alpha Vantage fundamental + price data for all S&P 500 companies.
    Runs in background. At 75 req/min each ticker takes ~6 AV calls (~6s).
    503 tickers × 6s ≈ 50 min total; missing_only=True is much faster on re-runs.
    Check progress via GET /job-status/{job_id}.
    """
    from equities.alpha_vantage import fetch_all_fundamentals, fetch_daily_prices

    companies = get_companies()
    tickers = [c["ticker"] for c in companies]

    if missing_only:
        from equities.db import get_db as _get_db
        db = _get_db()
        try:
            cached_tickers = {
                r[0] for r in db.execute(
                    "SELECT DISTINCT ticker FROM av_fundamentals WHERE function_name = 'OVERVIEW'"
                ).fetchall()
            }
        finally:
            db.close()
        tickers = [t for t in tickers if t not in cached_tickers]

    if limit > 0:
        tickers = tickers[:limit]

    if not tickers:
        return {"status": "ok", "message": "All tickers already up to date.", "total": 0}

    job_id = f"fetch_av_batch_{len(_bg_jobs)}"
    calls_per_ticker = 5 + (1 if include_prices else 0)
    eta_minutes = round(len(tickers) * calls_per_ticker * 0.8 / 60, 1)
    _bg_jobs[job_id] = {
        "status": "running",
        "completed": 0,
        "total": len(tickers),
        "current_ticker": "",
        "failed": [],
        "eta_minutes": eta_minutes,
    }

    def _run():
        failed = []
        for idx, ticker in enumerate(tickers):
            _bg_jobs[job_id]["current_ticker"] = ticker
            _bg_jobs[job_id]["completed"] = idx
            remaining = len(tickers) - idx
            _bg_jobs[job_id]["eta_minutes"] = round(remaining * calls_per_ticker * 0.8 / 60, 1)
            try:
                fetch_all_fundamentals(ticker, force=False)
                if include_prices:
                    fetch_daily_prices(ticker, outputsize="full", force=False)
            except Exception as e:
                logger.error(f"Batch fetch failed for {ticker}: {e}")
                failed.append(ticker)
        _bg_jobs[job_id] = {
            "status": "complete",
            "completed": len(tickers),
            "total": len(tickers),
            "failed": failed,
            "failed_count": len(failed),
            "eta_minutes": 0,
        }

    t = threading.Thread(target=_run, daemon=True)
    t.start()

    return {
        "status": "started",
        "job_id": job_id,
        "total": len(tickers),
        "eta_minutes": eta_minutes,
        "message": f"Batch fetch started for {len(tickers)} tickers. Check /job-status/{job_id} for progress.",
    }


# ── Ambient AI ────────────────────────────────────────────────────────────────

class AmbientAIRequest(BaseModel):
    context_type: str  # price_range | metric | margin | statement_cell
    ticker: str
    description: str
    data: dict = {}
    query: Optional[str] = None
    history: list[dict] = []


_AMBIENT_SYSTEM = """You are Paloor AI, a financial analysis assistant embedded in an equity research tool.
You are providing contextual insights about specific data the user has highlighted.
You have access to the company's FULL financial statements (income statement, balance sheet, cash flow).

RULES:
- Be concise and insightful. 2-4 sentences for initial insights, longer for follow-up questions.
- Reference the actual numbers provided in the data context.
- Explain WHY a trend matters, not just what it is.
- For margins: explain what drives changes and what it signals about the business.
- For price ranges: note potential catalysts, volume patterns, or technical significance.
- For metrics: compare to industry norms and flag anything unusual.
- When the user asks about a related metric (e.g., COGS when viewing revenue), use the full financial data provided to answer — you have access to ALL statements.
- Use markdown formatting (bold, bullets) when helpful.
- Never fabricate data. Only reference what's provided.
- Do NOT include disclaimers in your responses — the UI displays a permanent disclaimer footer."""


def _build_financial_context(ticker: str) -> str:
    """Build a compact summary of all financial statements for AI context."""
    statements = get_all_statements(ticker, "annual")
    parts = []
    for stmt_name, stmt in statements.items():
        if not stmt or not stmt.get("rows"):
            continue
        periods = stmt.get("periods", [])
        header = f"\n{stmt_name.upper()} STATEMENT ({stmt.get('period_type', 'annual')}):\n"
        header += f"Periods: {', '.join(periods)}\n"
        rows_text = []
        for row in stmt["rows"]:
            vals = " | ".join(row.get("formatted", {}).get(p, "—") for p in periods)
            rows_text.append(f"  {row.get('label', row.get('metric', '?'))}: {vals}")
        parts.append(header + "\n".join(rows_text))

    return "\n".join(parts) if parts else "(No financial data available)"


@router.post("/ambient-ai")
def ambient_ai(req: AmbientAIRequest):
    """Context-aware AI insight for highlighted financial data."""
    from chat.ai_service import _get_bedrock_client, MODELS, MAX_RETRIES, RETRY_DELAY, _THINKING_RE

    try:
        client = _get_bedrock_client()
    except Exception as e:
        logger.error("Ambient AI Bedrock init failed: %s", e)
        raise HTTPException(503, "AI service not configured")

    # Build the context description
    context_parts = [
        f"Ticker: {req.ticker}",
        f"Context type: {req.context_type}",
        f"Description: {req.description}",
    ]
    if req.data:
        # Remove image data from context text (too large for context window)
        data_for_context = {k: v for k, v in req.data.items() if k != "image"}
        if data_for_context:
            context_parts.append(f"Highlighted data: {json.dumps(data_for_context, default=str)}")

    # Fetch full financial statements for this company
    financial_context = _build_financial_context(req.ticker)
    context_parts.append(f"\n--- FULL FINANCIAL STATEMENTS ---\n{financial_context}\n--- END FINANCIAL STATEMENTS ---")

    context_block = "\n".join(context_parts)
    system_list = [{
        "text": f"{_AMBIENT_SYSTEM}\n\n--- DATA CONTEXT ---\n{context_block}\n--- END DATA CONTEXT ---"
    }]

    converse_messages: list[dict] = []
    for msg in req.history:
        role = "assistant" if msg.get("role") == "assistant" else "user"
        text = (msg.get("text") or "").strip()
        if not text:
            continue
        if converse_messages and converse_messages[-1]["role"] == role:
            converse_messages[-1]["content"][0]["text"] += f"\n{text}"
        else:
            converse_messages.append({"role": role, "content": [{"text": text}]})

    if converse_messages and converse_messages[0]["role"] == "assistant":
        converse_messages.insert(0, {"role": "user", "content": [{"text": "(conversation continues)"}]})

    current_query = req.query or f"Give a brief, insightful analysis of this {req.context_type.replace('_', ' ')} data for {req.ticker}. What should an investor notice?"
    current_content: list[dict] = [{"text": current_query}]

    image_data = req.data.get("image") if req.data else None
    if image_data and isinstance(image_data, str) and image_data.startswith("data:"):
        import base64

        try:
            header, b64 = image_data.split(",", 1)
            mime = header.split(":")[1].split(";")[0]
            raw = base64.b64decode(b64)
            current_content.append({
                "image": {
                    "format": mime.split("/")[-1].replace("jpg", "jpeg"),
                    "source": {"bytes": raw},
                }
            })
        except Exception as e:
            logger.warning("Ambient AI image parse failed: %s", e)

    if converse_messages and converse_messages[-1]["role"] == "user":
        converse_messages[-1]["content"].extend(current_content)
    else:
        converse_messages.append({"role": "user", "content": current_content})

    for model_id in MODELS:
        for attempt in range(MAX_RETRIES + 1):
            try:
                response = client.converse(
                    modelId=model_id,
                    messages=converse_messages,
                    system=system_list,
                    inferenceConfig={"maxTokens": 1024, "temperature": 0.3, "topP": 0.9},
                )
                blocks = response.get("output", {}).get("message", {}).get("content", [])
                text = "".join(block.get("text", "") for block in blocks if "text" in block).strip()
                if text:
                    text = _THINKING_RE.sub("", text).strip()
                    if text:
                        return {"response": text}
                break
            except Exception as e:
                error_str = str(e)
                logger.warning("Ambient AI failed with %s: %s", model_id, e)
                if ("ThrottlingException" in error_str or "429" in error_str) and attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY * (attempt + 1))
                    continue
                if ("ResourceNotFoundException" in error_str or "ValidationException" in error_str):
                    break
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY)
                    continue
                break

    raise HTTPException(502, "AI service unavailable")
