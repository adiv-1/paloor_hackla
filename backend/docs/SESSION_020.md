# SESSION 020 — Equities Section Remodel

**Date**: Continuation of Session 019
**Type**: Full-stack feature overhaul
**Status**: Complete
**Duration**: ~1 session

---

## What Was Built

A comprehensive remodel of the entire equities section, transforming it from a basic stock list + simple chart page into a screener.in-style financial analysis platform with 50+ ratios, Markov regime analysis, z-score market movers, expandable financial statements, working capital metrics, shareholder data, and SEC document browsing.

### Key Decisions

- **Screener.in as UI model** — ratio grid organized by category (valuation, profitability, liquidity, leverage, efficiency, growth, cashflow, working capital)
- **3-tab chart** — Regular price chart with drag-to-select point-to-point, Markov regime trends/inflections, 30-day rolling z-score market movers
- **Lazy analysis loading** — Markov regime fitting is computationally expensive; only loaded when user clicks the Trends or Market Movers tab
- **Search-first entrance** — replaced the dense S&P 500 table with a clean search bar + autocomplete

---

## Architecture

```
Backend (new modules):
  equities/ratios.py       — Computes ~50 ratios from XBRL + yfinance (P/E, ROE, ROCE, margins, etc.)
  equities/analysis.py     — Markov regime switching, z-score events, inflection detection per stock
  equities/filings.py      — SEC EDGAR filing browser + yfinance institutional/insider holders

New API endpoints (router.py):
  GET /api/equities/v2/search?q=...&limit=12     — Autocomplete search
  GET /api/equities/v2/ratios/{ticker}            — All computed ratios
  GET /api/equities/v2/analysis/{ticker}?years=5  — Markov regimes + z-scores + inflections
  GET /api/equities/v2/shareholders/{ticker}      — Major, institutional, insider holders
  GET /api/equities/v2/documents/{ticker}         — SEC filings organized by type

Frontend:
  equities/page.tsx                 — Search-only entrance (replaced 1142-line stocks table)
  equities/stocks/[ticker]/page.tsx — Comprehensive stock detail (rebuilt from scratch)
```

---

## Ratio Categories (50+ metrics)

| Category      | Metrics                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| Overview      | Market Cap, Enterprise Value, Book Value, CMP, FCF, EBITDA, Dividend Yield |
| Valuation     | P/E, P/B, P/S, EV/EBITDA, EV/EBIT, EV/Sales, PEG, CMP/FCF, 3/5/7yr avg PE  |
| Profitability | Gross Margin, Operating Margin, Net Margin, ROE, ROA, ROCE, ROIC           |
| Liquidity     | Current Ratio, Quick Ratio, Cash Ratio                                     |
| Leverage      | Debt/Equity, Debt/Assets, Interest Coverage, Total Debt, Net Debt          |
| Efficiency    | Inventory Turnover, Receivable Days, Payable Days, Asset Turnover          |
| Growth        | Revenue CAGR (3yr), Net Income CAGR (3yr), EPS CAGR (3yr), 5yr Return      |
| Cash Flow     | Operating CF, CapEx, FCF, FCF Margin, FCF Yield, CF/Debt                   |
| Working Cap   | Inventory Days, Receivable Days, Payable Days, CCC, WC, WC/Revenue         |

---

## Chart Tabs

1. **Price** — Standard area chart with drag-to-select point-to-point range (shows $ change and %). Period selector: 1M, 3M, 6M, 1Y, 3Y, 5Y, 10Y.
2. **Trends & Inflections** — Markov regime switching (k=3: bull/neutral/bear). Background bands colored by regime. Inflection points (regime transitions) marked with dashed amber lines.
3. **Market Movers** — 30-day rolling z-score of daily returns. Reference lines at ±2σ. Events above threshold listed with date, price, direction, magnitude.

---

## Financial Statements UI

- **Expandable rows** — Summary metrics always visible; detail rows collapse/expand
- **Cost tinting** — Cost line items get slightly muted color
- **Margin display** — Gross Margin, Operating Margin, Net Margin computed inline below their parent metrics
- **Quarterly toggle** — Switch between annual and quarterly views
- **Sticky first column** — Metric names stay visible during horizontal scroll

---

## Future: Abstraction Levels (NOT IMPLEMENTED — MVP NOTE)

Three abstraction levels planned for future sessions:

1. **Beginner** — Simplified view, plain English explanations, ~10 key metrics only, no technical charts
2. **Intermediate** — Full ratio grid, standard charts, expandable financials
3. **Expert** — Everything + Markov regimes, z-score analysis, raw XBRL data, custom screening

This should be implemented as a user preference (stored in profile) that controls:

- Which ratio categories are visible
- Which chart tabs are available
- How much detail is shown in financial statements
- Whether technical indicators are displayed
- The complexity of tooltips and explanations

---

## Files Changed

### New Backend Files

- `backend/equities/ratios.py` — Ratio computation engine
- `backend/equities/analysis.py` — Markov regime + z-score analysis
- `backend/equities/filings.py` — SEC filings + shareholder data

### Modified Backend Files

- `backend/equities/router.py` — 5 new endpoints added

### Modified Frontend Files

- `frontend/app/dashboard/equities/page.tsx` — Replaced with search-only entrance
- `frontend/app/dashboard/equities/stocks/[ticker]/page.tsx` — Complete rebuild with all tabs

---

## Bug Fix (from session start)

**Issue**: S&P 500 stocks page showed "Showing 0 of 0 companies" despite backend returning 503 companies.
**Root Cause**: Frontend requested `per_page=600` but backend had `le=500` validation → 422 error silently caught.
**Fix**: Backend `le=500 → le=1000`, Frontend `per_page=600 → per_page=1000`.
