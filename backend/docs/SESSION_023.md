# SESSION 023 — Markov Regime + Z-Score + News Pipeline Redo

**Date**: Continuation of Session 022
**Type**: Full-stack rewrite — analysis engine + news intelligence pipeline
**Status**: Complete (two rounds of iteration)

---

## What Changed

Complete rewrite of the Markov regime detection, z-score event detection, and news article pipeline. Two rounds of iteration:

### Round 1 — Initial Rewrite
Rebuilt everything from scratch: weekly Markov model, z-score clustering, 3-stage news pipeline with Gemini LLM.

### Round 2 — Critical Fixes After Testing
After testing with real data (AAPL, MSFT, NVDA), found and fixed major issues:

1. **Regimes were still too noisy** — weekly returns for Markov produced 20+ inflection points for AAPL yearly and 81 regime bands for MSFT 5-year. Root causes:
   - `MIN_REGIME_DAYS=15` was too short — increased to **30**
   - Weekly resampling wasn't smooth enough — switched to **bi-weekly (2W-FRI)** resampling
   - Merge loop capped at 10 iterations — changed to **unlimited** (runs until stable)

2. **Amber dots appeared on every chart point** — Recharts `<Scatter>` component inside `<ComposedChart>` was rendering dots on all data points, not just the filtered subset. Fixed by replacing `<Scatter>` with a **custom `dot` renderer on `<Line>`** that only renders circles at dates where `eventZ != null`. Dot click handler moved inline.

3. **Z-score threshold too loose** — `threshold=2.0` produced too many events. Raised to **2.5** with **20-day cluster window** (up from 10). Result: AAPL 1Y goes from dozens of events to just 2 meaningful ones.

4. **No articles / no summary showing** — The insight panel auto-fetched from cache on click, but cache was always empty because the pipeline was never triggered. Fixed by making the panel **auto-trigger the pipeline** when cache is empty. Flow: click → check cache → if empty, auto-run scrape→rank→summarize → show results.

5. **Summary prompt didn't cite sources** — Rewrote the Gemini summarize prompt to require **article number citations** in parentheses (e.g., "(1, 3)") so the user can verify claims against the listed sources.

---

## Architecture

### Backend — Analysis Engine (`equities/analysis.py`)

Complete rewrite (~300 lines). Core changes:

- **Bi-weekly returns for Markov**: `_load_prices()` returns daily prices → `_fit_markov_regime()` resamples to **bi-weekly 2W-FRI** log-returns → fits `MarkovRegression(k_regimes=3, switching_variance=True)` → maps regime labels by sorting means (lowest=bear, highest=bull) → `reindex().ffill()` back to daily
- **MIN_REGIME_DAYS = 30**: short segments absorbed into longer neighbors via iterative merging. Loop runs until no short segments remain (not capped at 10 iterations).
- **Z-score event clustering**: `_detect_zscore_events()` uses 30-day rolling z-score, |z| ≥ 2.5 threshold, 20-day calendar clustering, picks peak |z| per cluster
- **Results**: AAPL 1Y = 1 band + 2 movers, MSFT 1Y = 2 bands + 3 movers, NVDA 5Y = 6 bands + 13 movers

### Backend — News Intelligence Pipeline (`equities/news.py`)

Complete rewrite (~450 lines). Three-stage pipeline per event:

```
Stage 1 — SCRAPE
  5 query variations × 2 time windows (before/after) × 15 results each
  = up to 150 raw articles per event
  
  Query variations (company-specific):
    1. "CompanyName" stock
    2. CompanyName TICKER stock news
    3. TICKER stock price
    4. CompanyName shares
    5. TICKER earnings revenue
  
  DuckDuckGo .news() with date-range filtering, .text() fallback

Stage 2 — RANK (Gemini LLM)
  All raw articles sent to Gemini with event context
  LLM returns JSON array of top 8 articles with:
    - index, relevance_score (0.0–1.0), reason
  Ranking criteria: must be specifically about the company + time period
  Fallback if LLM fails: first N articles with score 0.5

Stage 3 — SUMMARIZE (Gemini LLM)
  Ranked articles + event details sent to Gemini
  Generates 3-5 sentence narrative with article number citations
  Strict rules: only state facts from articles, cite sources in parentheses,
  explicitly state if articles don't explain the price action
  Stored in event_summaries table
```

LLM integration:
- `_call_llm()` — uses `google.genai.Client`, model cascade `["gemma-3-27b-it", "gemini-2.0-flash"]`, temperature 0.2
- Handles markdown code fences in JSON responses

### Backend — Database Schema (`equities/db.py`)

Updated `stock_news` table:
- Added `relevance_score REAL` — LLM-assigned 0.0–1.0
- Added `is_top_article INTEGER DEFAULT 0` — 1 if kept after LLM ranking
- Changed UNIQUE constraint to `(ticker, event_date, url)`

New `event_summaries` table:
- `ticker`, `event_date`, `event_type`, `summary`, `model_used`, `created_at`
- UNIQUE on `(ticker, event_date, event_type)`

Migration: if old `stock_news` table lacks `is_top_article` column, both tables are dropped and recreated.

### Backend — API Endpoints (`equities/router.py`)

```
GET  /api/equities/v2/news/{ticker}/{event_date}  — Get cached insight
GET  /api/equities/v2/news/{ticker}                — All event summaries
POST /api/equities/v2/process-event/{ticker}       — Full 3-stage pipeline
POST /api/equities/v2/process-all-events/{ticker}  — Batch pipeline
```

### Frontend — Stock Detail Page (`equities/stocks/[ticker]/page.tsx`)

Major changes in Round 2:

- **Chart dots**: Replaced `<Scatter>` with custom `dot` renderer on `<Line>` — only renders amber circles at z-score event dates. Click handler is inline on each dot SVG element. Removed `Scatter` import and `eventScatterData` memo entirely.
- **Auto-pipeline**: `useEffect` on selection change now checks cache first, and if empty, auto-triggers the full scrape→rank→summarize pipeline. User sees "Scraping articles & generating analysis..." loading state.
- **Summary with refresh**: AI Summary box has a "↻ Refresh" button for manual re-analysis
- **Insight panel states**:
  - Loading: "Scraping articles & generating analysis..." or "Loading insight..."
  - Success: AI Summary (with citations) + Top Sources with relevance %
  - Empty: "Could not find relevant articles" + "Retry Analysis" button

---

## Files Changed

| File | Change |
|------|--------|
| `backend/equities/analysis.py` | Bi-weekly Markov, MIN_REGIME_DAYS=30, z-score threshold 2.5, unlimited merge loop |
| `backend/equities/news.py` | 3-stage pipeline, citation-enforced summaries |
| `backend/equities/db.py` | New columns + event_summaries table + migration |
| `backend/equities/router.py` | New pipeline endpoints |
| `frontend/.../[ticker]/page.tsx` | Custom dot renderer, auto-pipeline trigger, improved insight panel |

---

## How It Works (User Flow)

1. User opens a stock page → chart loads with Markov regime bands (colored regions) and z-score event dots (amber circles)
2. User clicks an amber dot → insight panel shows event header (date, price, z-score, direction)
3. Panel auto-checks cache → if empty, auto-runs the full pipeline (scraping ~50-150 articles, Gemini ranks top 8, Gemini writes cited summary)
4. Panel shows loading state "Scraping articles & generating analysis..."
5. Results appear: AI Summary with article citations + Top Sources with relevance scores
6. Clicking a regime band works the same way (uses band start date)
7. "↻ Refresh" on summary re-runs the pipeline to get fresh data
8. "Analyze Events" button in header batch-processes all detected events

## Verified Test Results

```
AAPL 1Y:  1 band (all bull), 2 market movers
MSFT 1Y:  2 bands (bull → neutral), 3 market movers  
NVDA 1Y:  2 bands (bull → neutral), 1 market mover
NVDA 5Y:  6 bands, 13 movers (real history: bull→bear→bull→bear→bull→neutral)

Pipeline test (AAPL 2026-01-20 z-score -3.58):
  44 articles scraped → 8 ranked by Gemini → summary with citations
  Summary correctly cites Q1 earnings ($2.84 vs $2.65), iPhone 17, China growth, analyst upgrades
```
