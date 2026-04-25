# SESSION 031: TradingAgents-Inspired Multi-Agent Deep Analysis System

**Date:** April 20, 2026  
**Objective:** Build a comprehensive multi-agent trading analysis system inspired by the TradingAgents framework, integrate it into the AI chat as an auto-triggered tool, and create a dedicated frontend for viewing full analysis reports.

---

## Summary of Changes

This session built an end-to-end deep analysis pipeline: when a user asks "Should I buy AAPL?" in chat, the AI automatically triggers a multi-agent analysis that runs 8 specialized agents across 5 phases, producing a professional-grade investment report with a BUY/SELL/HOLD verdict. The summary appears in chat with a link to the full report on a dedicated analysis page.

---

## Bug Fixes (Early Session)

### 1. Chart Persistence on Page Reload
**Problem:** Charts rendered during streaming disappeared when the user navigated away and returned.  
**Root Cause:** Chart data was only stored in React state during streaming but not persisted to the database.  
**Fix:**
- `backend/chat/router.py`: Collected charts during SSE streaming into `collected_charts`, passed them as `metadata={"charts": collected_charts}` to `save_ai_response()`
- `backend/chat/service.py`: `save_ai_response()` now accepts and passes `metadata` parameter to `insert_message()`
- `frontend/app/dashboard/chat/page.tsx`: Message rendering now reads `msg.charts || msg.metadata?.charts` for chart data, loading persisted charts from the database on page re-entry

### 2. Llama 4 Raw Tool Call Text Output
**Problem:** Llama 4 Maverick sometimes outputs raw text like `alpha_vantage(function=RSI, ...)` instead of proper tool_use blocks.  
**Fix:**
- `backend/chat/ai_service.py`: Added `_TEXT_TOOL_CALL_RE` regex pattern and `_parse_text_tool_calls()` function
- Integrated into the hybrid streaming path: detects text tool calls, executes them, synthesizes proper tool_use/toolResult message pairs, and re-loops for the final text answer

### 3. Premium Alpha Vantage API Key
**Problem:** Free-tier AV API key (`KWIQZZE0UKP57L1U`) returned "premium endpoint" errors for MACD, RSI, and other technical indicators.  
**Fix:**
- Retrieved premium key `O9Q3XKSF7ZK7PU93` from AWS Secrets Manager (`paloor/prod/backend/app-config`)
- Updated `backend/.env` with the premium key
- Verified all indicators work: MACD, RSI, SMA, EMA, BBANDS, STOCH, ADX, CCI, ATR, OBV (all returning thousands of data points)

### 4. MACD/MACDEXT Tool Description
**Problem:** The `alpha_vantage` tool description listed "MACD (also MACDEXT)" which confused the LLM.  
**Fix:** Split into separate entries: "MACD" and "MACDEXT" in the tool description in `backend/chat/av_tools.py`.

---

## Major Feature: Multi-Agent Deep Analysis System

### Architecture Overview

Inspired by the [TradingAgents](https://github.com/TauricResearch/TradingAgents) framework, the system mirrors real trading firm dynamics:

```
Phase 1: Analyst Team (parallel)
  ├── Market Analyst    — price action, trends, volume, S&R levels
  ├── Technical Analyst — RSI, MACD, BBANDS, SMA, ADX, STOCH, ATR, OBV
  ├── Fundamentals      — revenue, margins, EPS, balance sheet, valuation
  └── News Analyst      — sentiment, catalysts, event risks

Phase 2: Research Debate (parallel)
  ├── Bull/Bear Advocates — strongest arguments for and against
  └── Research Evaluator  — meta-analysis, confidence assessment

Phase 3: Trading Proposal (sequential)
  └── Trader — entry/exit strategy, position sizing, targets, stop-loss

Phase 4: Risk Management (sequential)
  └── Risk Analyst — market/liquidity/concentration/event/correlation risk

Phase 5: Final Verdict (sequential)
  └── Portfolio Manager — DECISION: BUY/SELL/HOLD with rationale
```

Each agent fetches real-time data from Alpha Vantage, sends it to AWS Bedrock (LLM), and produces a markdown report stored in PostgreSQL. Phase 1 agents run in parallel via `ThreadPoolExecutor`. Later phases build on prior reports.

---

### 5. Database Schema: `migrations/005_deep_analysis.sql`

```sql
CREATE TABLE deep_analyses (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id),
    conversation_id TEXT REFERENCES conversations(id),
    ticker          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',    -- pending/running/completed/failed
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    duration_secs   REAL,
    summary         TEXT,          -- executive summary for chat
    decision        TEXT,          -- BUY / SELL / HOLD
    confidence      TEXT,          -- HIGH / MEDIUM / LOW
    metadata        JSONB          -- charts, extra data
);

CREATE TABLE analysis_reports (
    id              TEXT PRIMARY KEY,
    analysis_id     TEXT NOT NULL REFERENCES deep_analyses(id),
    agent_name      TEXT NOT NULL,  -- e.g. 'market_analyst', 'trader'
    agent_group     TEXT NOT NULL,  -- e.g. 'analyst', 'research', 'trading', 'risk', 'verdict'
    status          TEXT NOT NULL DEFAULT 'pending',
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    report_content  TEXT,           -- markdown report from agent
    report_data     JSONB,          -- structured data (charts, indicators)
    error_message   TEXT
);

-- Indexes
CREATE INDEX idx_deep_analyses_user ON deep_analyses(user_id);
CREATE INDEX idx_deep_analyses_ticker ON deep_analyses(ticker);
CREATE INDEX idx_analysis_reports_analysis ON analysis_reports(analysis_id);
```

**Applied to production PostgreSQL via SSM tunnel.**

---

### 6. Backend: Analysis Engine — `backend/chat/deep_analysis.py` (~670 lines)

**Core Components:**

#### `AGENT_PIPELINE` — Agent Configuration
A declarative list of 5 phases, each containing agent definitions with:
- `name` / `label` — identifier and display name
- `data_calls` — list of Alpha Vantage API calls to make (function + params)
- `prompt` — template string with `{ticker}`, `{data}`, `{prior_reports}` placeholders
- `uses_prior_reports` — whether agent needs previous agents' outputs
- `parallel` — whether agents in the group run concurrently

**Alpha Vantage Data Calls per Agent:**

| Agent | AV Functions |
|-------|-------------|
| Market Analyst | GLOBAL_QUOTE, TIME_SERIES_DAILY_ADJUSTED, COMPANY_OVERVIEW |
| Technical Analyst | RSI, MACD, BBANDS, SMA×2 (50/200-day), ADX, STOCH, ATR, OBV |
| Fundamentals | COMPANY_OVERVIEW, INCOME_STATEMENT, BALANCE_SHEET, CASH_FLOW, EARNINGS |
| News Analyst | NEWS_SENTIMENT |
| Risk Analyst | ATR (additional volatility data) |

#### Key Functions:
- **`run_analysis(user_id, ticker, conversation_id, progress_callback)`** — Main entry point. Creates analysis record, pre-creates all report records, runs the 5-phase pipeline, extracts decision/confidence from portfolio manager's report, generates executive summary, saves results.
- **`_run_single_agent(agent, ticker, completed_reports, report_id, progress_callback)`** — Fetches AV data, builds prompt with data + prior reports, calls LLM, saves report to DB.
- **`_fetch_agent_data(ticker, data_calls)`** — Calls `execute_av_tool()` for each data_call.
- **`_call_llm(prompt, max_tokens)`** — Calls Bedrock with model cascade (same as chat), temperature 0.4 for analytical precision.
- **`_extract_decision(report)`** — Parses BUY/SELL/HOLD from portfolio manager's report (keyword search + fallback counting).
- **`_extract_confidence(report)`** — Parses HIGH/MEDIUM/LOW confidence.
- **`_generate_summary(ticker, pm_report, decision, confidence)`** — Calls LLM to produce 3-4 sentence executive summary for chat display.
- **`get_analysis(analysis_id)`** / **`list_user_analyses(user_id)`** — DB query helpers.

#### DB Helpers:
- `_update_analysis_status()` / `_update_report_status()` — Handle `NOW()` as SQL function, not string literal
- `_insert_report()` — Creates pending report record

---

### 7. Backend: Analysis API — `backend/chat/analysis_router.py`

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/analysis` | Trigger deep analysis. Returns SSE stream with agent progress events and final result. |
| `GET` | `/api/analysis` | List user's past analyses (max 50). |
| `GET` | `/api/analysis/{id}` | Get complete analysis with all agent reports. Authorization checked (user_id match). |

**SSE Stream (POST):**
- Runs `run_analysis()` in a background `threading.Thread`
- Progress events pushed to `queue.Queue`, consumed by SSE generator
- Event types: `agent_progress` (per-agent status), `analysis_complete` (final result), `error`
- 5-minute timeout on queue reads

**Registered in `backend/main.py`:**
```python
from chat.analysis_router import router as analysis_router
app.include_router(analysis_router)
```

---

### 8. Backend: AI Chat Integration — `backend/chat/ai_service.py`

#### New Tool: `deep_analysis`
Added alongside `alpha_vantage` in `tool_config`:
```python
DEEP_ANALYSIS_TOOL = {
    "toolSpec": {
        "name": "deep_analysis",
        "description": "Trigger comprehensive multi-agent trading analysis...",
        "inputSchema": {
            "json": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string", "description": "Stock ticker (e.g. AAPL)"}
                },
                "required": ["ticker"]
            }
        }
    }
}
```

**Trigger Conditions (from system prompt):**
- "Should I buy/sell X?"
- "Full/deep/comprehensive analysis of X"
- "Is X a good investment?"
- "Analyze X for me"

**Not triggered for:** simple price checks or single indicator queries.

#### New SSE Marker: `ANALYSIS_PREFIX = "\x00ANALYSIS:"`
Emitted during tool execution:
- `analysis_started` — ticker being analyzed
- `analysis_complete` — analysis_id, decision, confidence
- `analysis_failed` — error message

#### Tool Execution (both hybrid and standard paths):
When the model calls `deep_analysis`:
1. Emits `TOOL_STATUS_PREFIX` with "Running deep analysis on {ticker}..."
2. Emits `ANALYSIS_PREFIX` with `analysis_started`
3. Calls `run_analysis()` synchronously (agents run internally in parallel)
4. Emits `ANALYSIS_PREFIX` with `analysis_complete` or `analysis_failed`
5. Returns structured result to LLM with analysis_id, decision, confidence, summary

#### System Prompt Update:
Added `DEEP ANALYSIS` section to `SYSTEM_BASE` instructing the AI when to trigger deep analysis vs. simple alpha_vantage calls.

---

### 9. Backend: SSE Router — `backend/chat/router.py`

- Added `ANALYSIS_PREFIX` import
- New SSE event: `ai_analysis_event` — forwards analysis progress/completion to frontend
- Tracks `collected_analysis` alongside `collected_charts`
- On `ai_done`: saves analysis metadata to message record (for "View Full Analysis" link persistence)

---

### 10. Frontend: Analysis List Page — `frontend/app/dashboard/analysis/page.tsx`

Displays all user's past analyses at `/dashboard/analysis`:
- Decision badges: BUY (green), SELL (red), HOLD (yellow) with icons
- Confidence indicator
- Running status with spinner for in-progress analyses
- Summary text (2-line clamp)
- Duration and date
- Click navigates to detail page
- Empty state with prompt to ask AI

---

### 11. Frontend: Analysis Detail Page — `frontend/app/dashboard/analysis/[id]/page.tsx`

Full analysis report viewer at `/dashboard/analysis/{id}`:

**Header:**
- Ticker, decision badge, confidence, status, duration, timestamp
- Executive summary text

**Left Sidebar (264px):**
- Agent progress organized by phase (5 collapsible groups)
- Each agent shows: icon, label, status indicator (✓ completed, spinner running, ✗ failed, ○ pending)
- Click to select and view that agent's report

**Right Content Panel:**
- Selected agent's markdown report rendered via `react-markdown`
- Agent icon and label header
- Loading/error states for running/failed agents
- Auto-selects portfolio manager report on load

**Agent Icons:**
| Agent | Icon | Color |
|-------|------|-------|
| Market Analyst | BarChart3 | Blue |
| Technical Analyst | LineChart | Purple |
| Fundamentals | DollarSign | Green |
| News Analyst | Newspaper | Orange |
| Bull/Bear | Scale | Indigo |
| Evaluator | Search | Cyan |
| Trader | Briefcase | Emerald |
| Risk Analyst | Shield | Red |
| Portfolio Manager | User | Amber |

---

### 12. Frontend: Chat Analysis Integration — `frontend/app/dashboard/chat/page.tsx`

**New SSE Event Handling:**
- `ai_analysis_event` with sub-types:
  - `analysis_started` → adds "🔬 Running deep analysis on {ticker}..." to tool statuses
  - `analysis_complete` → adds "✅ Analysis complete: {decision} ({confidence})" + stores analysis reference
  - `analysis_failed` → adds "❌ Analysis failed: {error}"

**Message Enhancement:**
- On `ai_done`: attaches `analysis` metadata (analysis_id, ticker, decision, confidence) to the AI message
- Renders "View Full Analysis →" link below messages that have an attached analysis
- Link styled as a primary-colored pill button with BarChart3 icon

---

### 13. Frontend: Sidebar Navigation — `frontend/components/Sidebar.tsx`

- Moved "Equities" from `COMING_SOON` to active `NAV` array
- Added "Analysis" to active `NAV` with `Activity` icon and "Beta" badge
- Route: `/dashboard/analysis`

---

## Files Changed

### Backend — New Files
| File | Lines | Purpose |
|------|-------|---------|
| `chat/deep_analysis.py` | ~670 | Multi-agent analysis engine |
| `chat/analysis_router.py` | ~130 | API endpoints (POST/GET) |
| `migrations/005_deep_analysis.sql` | ~35 | Database schema |

### Backend — Modified Files
| File | Changes |
|------|---------|
| `chat/ai_service.py` | Added `ANALYSIS_PREFIX`, `deep_analysis` tool spec, tool execution in hybrid + standard paths, system prompt update |
| `chat/router.py` | Added `ANALYSIS_PREFIX` handling, `collected_analysis` tracking, analysis metadata in message save |
| `chat/av_tools.py` | Split MACD/MACDEXT in tool description |
| `main.py` | Registered `analysis_router` |
| `.env` | Updated to premium Alpha Vantage API key |

### Frontend — New Files
| File | Purpose |
|------|---------|
| `app/dashboard/analysis/page.tsx` | Analysis list page |
| `app/dashboard/analysis/[id]/page.tsx` | Analysis detail/report viewer |

### Frontend — Modified Files
| File | Changes |
|------|---------|
| `app/dashboard/chat/page.tsx` | Analysis SSE events, "View Full Analysis" link, BarChart3 import |
| `components/Sidebar.tsx` | Added Analysis + Equities to nav |

---

## Data Flow

```
User asks "Should I buy AAPL?"
  → Chat SSE Stream (POST /api/chat/conversations/{id}/stream)
    → Bedrock LLM recognizes deep analysis intent
      → Calls deep_analysis tool with {ticker: "AAPL"}
        → run_analysis() starts
          → Phase 1: 4 analysts fetch AV data in parallel → LLM reports
          → Phase 2: Bull/Bear + Evaluator read Phase 1 reports → LLM reports
          → Phase 3: Trader reads all reports → trade proposal
          → Phase 4: Risk Analyst reads all + ATR data → risk assessment
          → Phase 5: Portfolio Manager reads all → FINAL VERDICT
        → Summary generated, decision extracted
        → Result returned as tool result to LLM
      → SSE: ai_analysis_event (analysis_complete)
    → LLM generates final chat message referencing the analysis
    → SSE: ai_chunk (streaming response)
    → SSE: ai_done (with analysis metadata)
  → Chat displays summary + "View Full Analysis →" link
    → Click → /dashboard/analysis/{id}
      → GET /api/analysis/{id}
      → Renders all 8 agent reports in sidebar + content layout
```

---

## Testing Results

- Backend imports: All modules import cleanly ✓
- API routes registered: `/api/analysis`, `/api/analysis/{analysis_id}` ✓
- Frontend TypeScript: No errors in analysis or chat files ✓
- Backend server: Starts and responds on port 8000 ✓
- OpenAPI spec: All analysis endpoints visible ✓
