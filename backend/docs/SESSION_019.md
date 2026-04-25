# SESSION 019 — SEC EDGAR Financial Data Pipeline + S&P 500 Stocks UI

**Date**: March 9, 2026
**Type**: Full-stack feature build
**Status**: Complete
**Duration**: ~1 session

---

## What Was Built

A complete SEC EDGAR financial data pipeline and frontend UI that lets users browse all S&P 500 companies and view their income statement, balance sheet, and cash flow statement — 10 years of data, pulled directly from SEC EDGAR's XBRL API.

### Key Decisions

- **No news/sentiment** — deferred to a future session. User may build their own crawler instead of using NewsAPI/SERP API.
- **No API keys required** — SEC EDGAR is free (just needs User-Agent header), yfinance is free.
- **On-demand data fetching** — prices are fetched lazily when a user views a stock. EDGAR data can be batch-fetched or fetched per-ticker.
- **Separate SQLite database** — `equities.db` follows the existing pattern (chat.db, accounts.db, users.db).

---

## Architecture

```
SEC EDGAR XBRL API                    yfinance
        │                                │
        ▼                                ▼
  equities/edgar.py               equities/prices.py
  (fetch + parse XBRL facts)      (fetch OHLCV data)
        │                                │
        ▼                                ▼
  equities/statements.py          equities.db (SQLite)
  (organize into 3 statements)    ├── companies (503 S&P 500 tickers + CIK)
        │                         ├── financials (XBRL facts per metric per period)
        ▼                         └── price_history (daily OHLCV)
  equities/router.py
  (REST API endpoints)
        │
        ▼
  Frontend
  ├── /dashboard/equities/stocks          (S&P 500 list)
  └── /dashboard/equities/stocks/[ticker] (stock detail + chart + financials)
```

---

## Files Created

### Backend — `backend/equities/` package

| File            | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `__init__.py`   | Package init                                                   |
| `db.py`         | SQLite schema (companies, financials, price_history tables)    |
| `seed.py`       | S&P 500 tickers + CIK mappings from SEC + Wikipedia            |
| `edgar.py`      | SEC EDGAR XBRL fetcher + parser (income/balance/cashflow)      |
| `statements.py` | Builds structured financial statements from raw XBRL data      |
| `prices.py`     | yfinance price history fetcher with incremental updates        |
| `router.py`     | FastAPI endpoints (v2 namespace to not conflict with existing) |
| `legacy.py`     | Old equities.py moved here (ticker tape, Markov, z-scores)     |

### Frontend

| File                                              | Purpose                                                     |
| ------------------------------------------------- | ----------------------------------------------------------- |
| `app/dashboard/equities/stocks/page.tsx`          | S&P 500 company list with search, sector filter, pagination |
| `app/dashboard/equities/stocks/[ticker]/page.tsx` | Stock detail: price chart + tabbed financial statements     |

### Modified Files

| File                                       | Change                                           |
| ------------------------------------------ | ------------------------------------------------ |
| `backend/main.py`                          | Added equities v2 router + DB init on startup    |
| `backend/equities_router.py`               | Updated import path (equities → equities.legacy) |
| `frontend/app/dashboard/equities/page.tsx` | Added "S&P 500 Financials" link button           |

---

## API Endpoints

All under `/api/equities/v2/`:

| Method | Endpoint                   | Description                                                     |
| ------ | -------------------------- | --------------------------------------------------------------- |
| GET    | `/companies`               | List S&P 500 companies (search, sector filter, pagination)      |
| GET    | `/companies/{ticker}`      | Company detail + financials summary                             |
| GET    | `/sectors`                 | List unique GICS sectors                                        |
| GET    | `/financials/{ticker}`     | Financial statement (income/balance/cashflow, annual/quarterly) |
| GET    | `/financials/{ticker}/all` | All three statements at once                                    |
| GET    | `/prices/{ticker}`         | Price history (1M to 10Y periods, auto-fetches on demand)       |
| POST   | `/seed`                    | Seed S&P 500 companies with CIK mappings                        |
| POST   | `/fetch-financials`        | Fetch EDGAR data (single ticker or batch all 500 in background) |
| POST   | `/fetch-prices/{ticker}`   | Fetch price history from yfinance                               |
| GET    | `/job-status/{job_id}`     | Check background batch job progress                             |
| GET    | `/stats`                   | Data completeness statistics                                    |

---

## SEC EDGAR XBRL Mapping

We map ~80 US-GAAP XBRL concepts to human-readable metric names across three statements:

### Income Statement

Revenue, Cost of Revenue, Gross Profit, R&D, SG&A, Operating Expenses, Operating Income, Interest Expense, Pre-Tax Income, Income Tax, Net Income, EPS (Basic/Diluted), Shares Outstanding, D&A

### Balance Sheet

Cash, Short-term Investments, Accounts Receivable, Inventory, Current Assets, PP&E, Goodwill, Intangibles, Total Assets, Accounts Payable, Short/Long-term Debt, Current/Non-current Liabilities, Total Liabilities, Common Stock, APIC, Retained Earnings, Treasury Stock, Total Equity

### Cash Flow Statement

Operating/Investing/Financing Cash Flow, CapEx, Acquisitions, D&A, Stock-based Comp, Dividends Paid, Share Repurchases

---

## Data Verification

Tested and verified with real data:

| Company | Financial Facts | Income Periods | Balance Periods | Price Data |
| ------- | --------------- | -------------- | --------------- | ---------- |
| AAPL    | 1,526           | 10 years       | 10 years        | 10 years   |
| NVDA    | 1,708           | 10 years       | 10 years        | 10 years   |
| MSFT    | 1,611           | 10 years       | 10 years        | —          |
| GOOGL   | 1,408           | 10 years       | 10 years        | —          |
| AMZN    | 1,512           | 10 years       | 10 years        | —          |
| META    | 1,310           | 10 years       | 10 years        | —          |
| TSLA    | 1,615           | 10 years       | 10 years        | —          |
| JPM     | 991             | 10 years       | 10 years        | —          |
| V       | 1,210           | 10 years       | 10 years        | —          |
| JNJ     | 1,536           | 10 years       | 10 years        | —          |
| WMT     | 1,330           | 10 years       | 10 years        | —          |
| PG      | 1,497           | 10 years       | 10 years        | —          |
| UNH     | 1,549           | 10 years       | 10 years        | —          |

**Total: 503 companies seeded, 13 have financials, 18,800+ financial facts stored**

Prices are fetched on-demand — when you click a stock, yfinance loads 10 years of OHLCV data.

---

## How To Use

### First Time Setup

1. Start the backend: `cd backend && source venv/bin/activate && uvicorn main:app --reload --port 8000`
2. Start the frontend: `cd frontend && npm run dev`
3. Open `http://localhost:3000/dashboard/equities/stocks`
4. Click "Seed Companies" to load 503 S&P 500 tickers with CIK mappings
5. Click "Fetch All Financials (EDGAR)" to batch-download — runs in background, takes ~2 minutes for all 500

### Per-Stock

1. Click any company in the list → stock detail page
2. "Fetch EDGAR Data" button pulls income/balance/cashflow from SEC
3. "Fetch Prices" button pulls 10 years of daily OHLCV from yfinance
4. Toggle annual/quarterly view for financial statements
5. Switch between Income Statement, Balance Sheet, Cash Flow tabs

---

## SEC EDGAR Rate Limiting

- SEC allows 10 requests/second maximum
- We throttle to 8 req/sec (0.125s between requests)
- All requests include `User-Agent: Paloor/1.0 (contact@paloor.com)`
- Batch fetching all 503 companies takes ~1-2 minutes
- SEC EDGAR is free with no API key required

---

## What's Next (Session 020+)

- **Ratio computation**: P/E, P/B, ROE, margins, etc. from the stored XBRL data
- **Company page enhancements**: Markov regime on chart, z-score events
- **Screener engine**: Filter S&P 500 by ratios, sector, market cap
- **AI analyst**: Contextual analysis per company using Gemini
- **News/sentiment**: User may build own crawler (deferred from this session)

---

## Bug Fix — Empty Company List (Post-Session)

**Symptom**: The S&P 500 stocks page (`/dashboard/equities/stocks`) showed stats correctly (503 companies, 321K+ facts) but the company table below was empty — "Showing 0 of 0 companies".

**Root Cause**: The frontend requested `per_page=600` to fetch all 503 companies in a single API call, but the backend FastAPI endpoint had a Pydantic validation constraint of `per_page: int = Query(50, ge=1, le=500)` — max 500 allowed. This caused a **422 Unprocessable Entity** response. The frontend's `try/catch` around `Promise.all` silently swallowed the error, so `companies` state stayed as an empty array. Stats still displayed because they come from the separate `/stats` endpoint (no `per_page` parameter).

**Fix** (2 files):

| File                                              | Change                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `backend/equities/router.py`                      | Changed `le=500` → `le=1000` in the `list_companies` endpoint's `per_page` query parameter |
| `frontend/app/dashboard/equities/stocks/page.tsx` | Changed `per_page=600` → `per_page=1000` to request all S&P 500 companies in one call      |

**Verification**: After fix, `curl 'http://localhost:8000/api/equities/v2/companies?per_page=1000'` returns all 503 companies.

---

_Session 019 complete. EDGAR pipeline operational, S&P 500 financial data flowing._
_No external API keys required. SEC EDGAR is free._
