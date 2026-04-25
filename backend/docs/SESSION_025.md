# SESSION 025 — Chart UX Fixes, Analysis Caching, Ambient AI, News Pipeline Fix

**Date**: Continuation of Session 024
**Type**: UX bugfixes + new feature (Ambient AI) + pipeline fix
**Status**: Complete
**Duration**: ~1 session

---

## Problems Identified

1. **Chart cursor highlights entire container/axis** instead of specific data points
2. **Trend shift points (amber dots) not clickable** — no hitbox / too small
3. **Z-score events don't show contextual info** — user doesn't know why an event qualifies
4. **Color contrast too low** on regime fills beneath the chart
5. **No articles being scraped** — news pipeline returning empty results
6. **Regimes/z-scores shift on recalculation** — no caching, recomputed on every load
7. **No way to query AI about specific data points** on the chart or financial tables

---

## What Was Built

### 1. Chart Interaction Fixes

**Problem**: Clicking on the chart axis/whitespace triggered event selection. Amber dots had no meaningful hit area.

**Fixes**:
- `onMouseDown` now requires `e.activeLabel` — prevents axis/container clicks from triggering
- Added `cursor: "crosshair"` style to chart for visual feedback
- Replaced simple `<circle>` SVG dots with `<g>` groups containing:
  - Invisible 16px hitbox circle (pointer-events: all)
  - Optional selection ring (12px, shown when selected)
  - Visible 5px indicator dot
- Result: ~10× larger click target for trend shift points

### 2. Regime Color Contrast

Increased fill opacity for regime bands:
- **Bull regime**: `rgba(34,197,94)` opacity 0.22 → **0.38**
- **Bear regime**: `rgba(239,68,68)` opacity 0.20 → **0.35**
- **Gradient fills**: bull 0.28 → **0.45**, bear 0.26 → **0.42**

### 3. Z-Score Event Context

**PriceTooltip** enhanced: when hovering over a z-score event date, tooltip now shows:
- Amber "Z-Score Event" indicator
- Z-score value and direction
- "EXTREME" badge for z-scores above threshold

**Insight panel** enhanced:
- Colored regime/event indicators in header
- Z-score context card explaining statistical significance:
  *"A z-score of +X means the stock's daily return was X× its normal standard deviation"*

### 4. Analysis Caching

**New table**: `analysis_cache` in equities.db
```sql
CREATE TABLE IF NOT EXISTS analysis_cache (
    ticker TEXT NOT NULL,
    years INTEGER NOT NULL,
    result_json TEXT NOT NULL,
    price_count INTEGER NOT NULL,
    last_price_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (ticker, years)
)
```

**Cache logic** in `analysis.py`:
- `_get_cached_analysis(ticker, years, price_count, last_date)` — returns cached result if price data hasn't changed
- `_store_cached_analysis(...)` — writes result to DB after computation
- **Invalidation**: compares `price_count` and `last_price_date` — only recomputes when new prices are fetched

### 5. News Pipeline Fix

**Root cause**: DuckDuckGo's `timelimit` parameter only accepts `d`, `w`, `m`, `y` — the code was passing `YYYY-MM-DD..YYYY-MM-DD` date ranges which were silently ignored, causing searches to return irrelevant or empty results.

**Fixes in `news.py`**:
- `_search_ddg()`: Changed from `date_from/date_to` params to proper `timelimit` string (`d`, `w`, `m`, `y`)
- `_scrape_event_articles()`:
  - Computes appropriate timelimit based on event age (≤7d → `w`, ≤30d → `m`, else → `y`)
  - Includes month/year context in search queries (e.g., `"Apple" stock March 2025`)
  - Adds broader fallback queries if initial results < 10 articles
- Error logging upgraded from `debug` to `warning` level for visibility

### 6. Ambient AI Feature

**Concept**: Users can highlight data on charts or financial tables → AI popover appears with contextual insights and follow-up querying.

**Frontend — `AmbientAIPopover` component**:
- Fixed-position popover with gradient header, Sparkles icon, context badge
- Scrollable message area with user/AI bubbles
- Text input for follow-up queries
- Auto-generates initial insight on mount via POST to `/api/equities/v2/ambient-ai`
- Support for conversation history (multi-turn)

**Context types** (`AmbientContext` interface):
| Type | Trigger | Data Passed |
|------|---------|-------------|
| `price_range` | Drag-select on price chart | Start/end dates and prices, % change |
| `metric` | Click Sparkles on financial table metric | Metric name + values across periods |
| `margin` | Click margin row in financial table | Margin label + values across periods |
| `statement_cell` | (Future) Click individual cell | Cell value + context |

**Integration points**:
- `SignalsPriceChart`: "Ask AI" button appears on price range selection → opens popover
- `FinancialTable`: Sparkles icon on summary metric rows (visible on hover), clickable margin rows

**Backend — `POST /api/equities/v2/ambient-ai` endpoint**:
- Request: `context_type`, `ticker`, `description`, `data`, `query` (optional), `history`
- Uses Gemma/Gemini model cascade with financial analysis system prompt
- Returns `{ response: string }`
- Handles both initial auto-insight (query=null) and follow-up queries

---

## Files Modified

| File | Changes |
|------|---------|
| `frontend/.../[ticker]/page.tsx` | Chart interaction fixes, regime colors, z-score context, AmbientAIPopover component, FinancialTable ambient AI integration |
| `backend/equities/db.py` | Added `analysis_cache` table |
| `backend/equities/analysis.py` | Cache read/write functions, cache check in `get_stock_analysis()` |
| `backend/equities/router.py` | New `POST /ambient-ai` endpoint with Pydantic model |
| `backend/equities/news.py` | Fixed DDG timelimit, date-contextual queries, broader fallbacks, warning-level logging |

---

## Tomorrow: AWS Pre-Computed Analysis

Plan to connect to AWS for pre-computed analysis per stock:
- Move heavy Markov regime computation to cloud
- Pre-compute and store results for all S&P 500 tickers
- Frontend fetches pre-computed results instead of on-demand computation
- Significantly faster load times for stock detail pages

---

## API Reference

### New Endpoint

```
POST /api/equities/v2/ambient-ai
Content-Type: application/json

{
  "context_type": "price_range" | "metric" | "margin" | "statement_cell",
  "ticker": "AAPL",
  "description": "Gross Margin trend across Q1-Q4 2024",
  "data": { ... },
  "query": "What caused the margin decline?",  // null for initial insight
  "history": [
    { "role": "assistant", "text": "..." },
    { "role": "user", "text": "..." }
  ]
}

Response: { "response": "..." }
```
