# SESSION 026 — Ambient AI Enhancement & Screener Expansion

**Date**: Continuation of Session 025
**Type**: Full-stack feature enhancement
**Status**: Complete

---

## What Was Built

Major enhancements to the Ambient AI popover (introduced in Session 025) and expansion of the financial ratio engine + screener with FCFF, debt metrics, and YoY growth rates.

### Key Decisions

- **Full financial context for Ambient AI** — AI now receives all income statement, balance sheet, and cash flow data for the company, not just the highlighted metric. Enables cross-metric questions like "what's the COGS breakdown?" when viewing revenue.
- **Markdown rendering in chat** — Custom `renderMarkdown()` function for headers, bold, italic, inline code, and bullet lists rendered via `dangerouslySetInnerHTML`.
- **Expandable popover** — Toggle between compact (anchored to bottom-right) and expanded (full-screen overlay) modes.
- **Image upload to AI** — Users can upload images (screenshots, charts) directly to the AI for analysis via Gemini multimodal.
- **Save-to-chat** — Ambient AI conversations can be saved as persistent chat conversations.
- **Static disclaimer** — Moved from AI-generated per-message to a fixed footer in the popover.

---

## Ambient AI Enhancements

### Backend (`backend/equities/router.py`)

- **`_build_financial_context(ticker)`** — New helper that calls `get_all_statements(ticker, "annual")` and formats all income statement, balance sheet, and cash flow rows with period data into compact text. Injected into every ambient AI prompt.
- **System prompt updated** — AI told it has full financial statements, instructed to use all data for cross-metric questions, instructed NOT to include disclaimers (handled by static footer).
- **Image handling** — Parses data URL from frontend, extracts base64 + MIME type, passes as `inline_data` part to Gemini for multimodal analysis.

### Frontend (`frontend/app/dashboard/equities/stocks/[ticker]/page.tsx`)

- **`renderMarkdown(text)`** — Handles `##`/`###` headers, `**bold**`, `*italic*`, `` `code` ``, bullet lists (`*` and `-`), wraps consecutive `<li>` in `<ul>`.
- **Expandable mode** — `Maximize2`/`Minimize2` toggle. Expanded uses `fixed inset-4` for full-screen overlay.
- **Image upload** — `ImagePlus` button triggers file input, `FileReader` converts to base64, image preview shown in message, base64 sent to backend.
- **Save-to-chat** — Creates conversation via `POST /api/chat/conversations/ai`, inserts all messages via `POST /api/chat/conversations/{id}/messages`. Uses `useAuth` for Bearer token.
- **Static disclaimer footer** — "AI-generated analysis. Not financial advice." pinned to bottom of popover.
- **Backdrop** — `bg-black/10` overlay when popover is open.

---

## News Pipeline Fix

### Backend (`backend/equities/news.py`)

- **Retry logic** — `_search_ddg()` now accepts `retries=2` parameter with exponential backoff (`time.sleep(2 * (attempt + 1))`).
- **Search delay** — Increased `_SEARCH_DELAY` from 1.0s to 1.5s to reduce DDG rate-limiting.
- Both news and text fallback search paths have retry loops.

---

## Financial Ratios Expansion

### Backend (`backend/equities/ratios.py`)

New metrics added to `compute_ratios()`:

| Category   | New Metrics                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------- |
| Leverage   | Net Debt, Net Debt / EBITDA, Debt / Revenue                                                   |
| Liquidity  | Defensive Interval (days)                                                                     |
| Growth     | Revenue Growth YoY %, Gross Profit Growth YoY %, Operating Income Growth YoY %, Net Income Growth YoY %, EPS Growth YoY % |
| Cash Flow  | FCFF (Free Cash Flow to Firm), FCF Yield %, FCF / Revenue %, CapEx / Revenue %, Cash / Revenue %, Cash / Total Assets % |

**FCFF Computation**: `EBIT × (1 - effective_tax_rate) + D&A - |CapEx|`. Falls back to 21% statutory rate if effective rate unavailable.

**YoY Growth**: Uses `_get_metric_n_years(db, ticker, metric, 2)` to get current and prior year values.

### Backend (`backend/equities/screener.py`)

- **New `_extract_prior_year_metrics()`** — Window function query (`ROW_NUMBER() OVER ... WHERE rn = 2`) to get second-most-recent annual values for YoY computation.
- **25+ expression fields** (up from 13) — Added: `net_margin`, `ebitda_margin`, `roa`, `fcff`, `net_debt`, `net_debt_to_ebitda`, `debt_to_revenue`, `revenue_yoy`, `net_income_yoy`, `eps_growth_yoy`, `dividend_yield`, `fcf_yield`.
- **Field aliases expanded** — Added natural language mappings: `"netdebt/ebitda"`, `"revenuegrowth"`, `"epsgrowth"`, `"divyield"`, etc.
- **Computed in screen loop** — EBITDA, FCFF, net debt, margins, yields, and YoY growths all computed per-stock during screening.

---

## Files Changed

### Modified Backend Files
- `backend/equities/router.py` — Ambient AI: full financial context, image handling, updated system prompt
- `backend/equities/news.py` — Retry logic with exponential backoff, increased search delay
- `backend/equities/ratios.py` — FCFF, net debt, YoY growth, FCF yield, defensive interval, more cash/debt metrics
- `backend/equities/screener.py` — Prior year metrics extraction, 25+ expression fields, YoY growth in screening

### Modified Frontend Files
- `frontend/app/dashboard/equities/stocks/[ticker]/page.tsx` — AmbientAIPopover rewrite: markdown rendering, expandable mode, image upload, save-to-chat, static disclaimer

---

## Screener Expression Examples

With the expanded fields, users can now write:

```
revenue yoy > 20 AND net margin > 15
fcff > 0 AND net debt / ebitda < 3
eps growth > 10 AND roe > 15 AND debt to equity < 1
dividend yield > 2 AND fcf yield > 5
```

---

## What's Next

- Verify news pipeline works after server restart (long-running process may need restart to pick up DDG retry changes)
- Consider adding gross margin change (bps) and operating margin change to screener
- Explore embedding ambient AI context window with RAG for deeper cross-company analysis
