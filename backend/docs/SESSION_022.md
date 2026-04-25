# Session 022 — Personalized AI Stock Recommendations & Three-Tier Abstraction System

## Summary

Added a personalized AI stock recommendation engine to the equities screener, a five-level abstraction system that tailors AI responses across the entire platform (popover, screener, full chat), and an embedded InfoPopover on the screener section for contextual AI help.

---

## What Was Built

### 1. Five-Level AI Abstraction System

Users can now select their expertise level, and **all** AI interactions adapt accordingly — screener, InfoPopover chats, and the full chat page. The setting persists via `PUT /api/chat/preferences`.

| Level | Label | Behavior |
|-------|-------|----------|
| `beginner` | Beginner | Plain language, analogies, numbered steps, no jargon |
| `retail` | Retail Investor | Practical, concise, assumes basic investing knowledge |
| `pro` | Professional | Standard finance terminology, assumptions, trade-offs |
| `institutional` | Institutional | Factor exposures, regime analysis, tail risk, correlation structures |
| `cfa` | CFA / Advanced | CFA-level rigor, GIPS/IPS, multi-factor models, alpha generation |

The level is displayed as a horizontal pill selector at the top of the screener section and synced to the backend. All three AI pathways — `stream_ai_response` (full chat), `stream_ai_response_ephemeral` (InfoPopover), and `suggest_screener_expression` / `recommend_stocks_for_user` (screener AI) — resolve the user's persisted `abstraction_level` from `get_ai_preferences()` when not explicitly provided.

### 2. Personalized Stock Recommender

New endpoint: `POST /api/chat/assistant/recommend-stocks`

Takes:
- `prompt` (optional) — e.g., "What stocks reduce my portfolio risk?"
- `abstraction_level` (optional) — falls back to persisted preference

Returns:
- `expression` — a validated screener expression (e.g., `pe < 18 AND debt_to_equity < 0.8 AND roe > 10`)
- `explanation` — personalized reasoning adapted to the user's abstraction level
- `risk_note` — how the suggestion affects portfolio risk
- `sectors_to_consider` — 2-4 sectors to focus on
- `risk_tolerance` — echoed from user profile
- `allowed_fields` — list of valid screener fields

The recommendation engine (`recommend_stocks_for_user` in `ai_service.py`):
1. Loads the user's full financial context (profile, assets, documents, portfolio, health scores, conversation memory) via `get_or_build_context()`
2. Builds a detailed prompt including risk tolerance, goals, income, net worth, and portfolio data
3. Asks Gemma to generate a screener expression optimized for this specific user
4. Validates the expression against the strict parser — falls back to risk-appropriate defaults if invalid
5. Returns structured JSON with the expression, explanation, and sector suggestions

Risk-aware fallbacks:
- Conservative/low risk → `pe < 18 AND debt_to_equity < 0.8 AND current_ratio > 1.5 AND roe > 10`
- Moderate → `pe < 25 AND roe > 12 AND debt_to_equity < 1.2 AND current_ratio > 1.0`
- Aggressive/high → `roe > 15 AND gross_margin > 35 AND revenue > 5000000000`

### 3. InfoPopover on Screener

Added the same `InfoPopover` component used on dashboard cards to the Stock Screener header. Section context is set to "Equities Screener" so the embedded AI chat knows the user is in the screener and can provide relevant help.

Tips displayed:
- "Use 'Generate Expression' to convert plain English to screener filters"
- "Click 'Recommend for me' to get AI-personalized stock criteria"
- "Change your AI level (Beginner → CFA) to adjust explanation depth"
- "All recommendations consider your risk tolerance and financial goals"

### 4. AI Preferences Persistence

Added `get_ai_preferences()` and `update_ai_preferences()` to `backend/chat/context.py`:
- In-memory dict keyed by `user_id`
- Merged via `PUT /api/chat/preferences`
- Read by all AI pathways as fallback when runtime context doesn't include explicit values
- The frontend loads preferences on page mount and persists on every level change

---

## Files Modified

### Backend

| File | Changes |
|------|---------|
| `backend/chat/context.py` | Added `get_ai_preferences()` and `update_ai_preferences()` functions |
| `backend/chat/ai_service.py` | Enhanced `_build_runtime_instruction()` with detailed per-level prompts; added `recommendation` assistant mode; added `recommend_stocks_for_user()` function |
| `backend/chat/router.py` | Added `RecommendStocksRequest` model; added `POST /api/chat/assistant/recommend-stocks` endpoint; imported `recommend_stocks_for_user` |

### Frontend

| File | Changes |
|------|---------|
| `frontend/app/dashboard/equities/page.tsx` | Added `InfoPopover` + `useAuth` imports; added `ABSTRACTION_LEVELS` constant; added state for abstraction level, recommendation loading/results; added `persistAbstractionLevel()`, `recommendStocksForMe()` functions; added AI Level selector UI, InfoPopover on screener header, "Recommend for me" button, recommendation result card with sector chips and disclaimer |

---

## Architecture

```
User sets AI Level (Beginner → CFA)
  │
  ├── PUT /api/chat/preferences { abstraction_level: "retail" }
  │     └── Stored in-memory per user_id
  │
  ├── InfoPopover Chat (ephemeral)
  │     └── stream_ai_response_ephemeral() → get_ai_preferences() → applies level
  │
  ├── Full Chat Page
  │     └── stream_ai_response() → resolved_ctx → get_ai_preferences() → applies level
  │
  ├── Generate Expression
  │     └── suggest_screener_expression() → get_ai_preferences() → screener mode
  │
  └── Recommend for Me
        └── recommend_stocks_for_user() → full user context + profile + portfolio
              → generates personalized expression → validates → returns
```

All five AI pathways produce consistent, level-appropriate responses. The transition is seamless — changing the level in the screener immediately affects all AI interactions.

---

## Guardrails

- **Model cascade**: Gemma 3 27B → Gemma 3 12B → Gemini 2.0 Flash (fallback)
- **Expression validation**: All AI-generated expressions are validated against the strict parser before being returned
- **Risk-aware defaults**: If AI generates an invalid expression, fallback expressions match the user's risk tolerance
- **Disclaimer**: Every recommendation card includes "This is educational — not financial advice"
- **No hallucinated fields**: AI prompt constrains output to only allowed screener fields and operators
- **Context freshness**: User context rebuilt every 120 seconds to stay current

---

## How to Test

1. Restart the backend: `cd backend && python main.py`
2. Navigate to `/dashboard/equities`
3. **AI Level**: Click any level pill (Beginner → CFA) — should persist across page reloads
4. **Recommend for me**: Click the purple "Recommend for me" button — should generate a personalized expression, explanation, risk note, and sector suggestions
5. **Generate Expression**: Type intent in the AI field and click "Generate Expression" — should respect the selected abstraction level
6. **InfoPopover**: Click the (i) icon next to "Stock Screener" — should show description, tips, and an embedded AI chat
7. **Full Chat**: Go to `/dashboard/chat` — AI should use the same abstraction level set in the screener
