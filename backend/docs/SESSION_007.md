# SESSION 007 — Equities, Smart OCR & Polish

**Date:** July 2025
**Version:** v0.7.0

---

## What Changed

### 1. Smart OCR Fallback (gemini_ocr.py)

- Added `_smart_extract(doc_key, raw_text)` — regex-based field extraction when Gemini is unavailable
- Covers known document types: driver's license, passport, vehicle title, vehicle registration, insurance, loan documents
- Pattern-matched fields: name, DOB, license number, expiration, address, VIN, policy number, etc.
- Added `_basic_kv_extract()` for unknown document types — scans for `Key: Value` patterns
- Fallback chain: Gemini API → smart regex extraction → basic KV extraction → empty schema
- Warning message updated to: "Extracted locally via OCR — please verify and correct fields"

### 2. Equities — Market Analysis Engine (NEW FEATURE)

#### Backend (`backend/equities.py` + `backend/equities_router.py`)

- **S&P 500 data pipeline**: scrapes Wikipedia for constituents, downloads prices via yfinance
- **Ticker tape**: top 20 tickers with live price + daily change %
- **Top movers**: 10 biggest gainers and 10 biggest losers across S&P 500
- **Rolling z-score**: 60-day rolling window on daily returns to detect unusual market activity
- **Markov switching model**: `statsmodels.MarkovRegression` with k=3 regimes (bull / bear / neutral), classified by mean return, includes smoothed probabilities and transition matrix
- **Inflection points**: detected at regime transitions coinciding with high z-score (|z| > 1.5); each annotated with 4 fake news articles (±2 days around the date)
- **Forecast**: 3 scenarios (optimistic / base / pessimistic) with expanding uncertainty bands over 90 days + disclaimer
- **30-minute in-memory cache** to avoid repeated yfinance downloads
- 4 REST endpoints:
  - `GET /api/equities/ticker-tape`
  - `GET /api/equities/sp500?years=5`
  - `GET /api/equities/movers`
  - `GET /api/equities/analysis?years=5`

#### Frontend (`frontend/app/dashboard/equities/page.tsx`)

- **Ticker tape**: marquee animation across the top, pauses on hover, duplicated items for seamless looping
- **S&P 500 header card**: current price, daily % change, time range selector (1M / 3M / 6M / 1Y / 5Y)
- **Price & Regimes tab**: Recharts AreaChart with gradient fill, inflection points as ReferenceLine markers, color-coded regime legend with daily mean returns
- **Z-Score Trend tab**: ComposedChart (Bar + Line), ±2σ reference lines for significance bands
- **Forecast tab**: 3 scenario LineCharts with shaded uncertainty bands + disclaimer card
- **Top Movers**: gainers/losers toggle, ranked list with symbol, name, sector, price, % change
- **Inflection Points**: clickable list items → InflectionCard modal showing regime transition badges + 4 associated news articles
- Robinhood-inspired design: dark cards, gradient fills, clean typography

### 3. Profile Editing (Account Page)

- Edit button in profile card header toggles editable mode
- Editable fields: age, gender, state, occupation, income range, net worth, dependents, risk tolerance
- Select dropdowns for categorical fields (gender, income, net worth, risk tolerance)
- Text/number inputs for free-form fields (state, occupation, age, dependents)
- Save button PUTs to `/api/auth/profile` with JWT auth and refreshes user context
- Cancel button reverts without saving

### 4. Dashboard Polish

- Personalized welcome: "Welcome back, {first_name}" using auth context
- Equities card with "New" badge and market analysis description
- 2×2 grid layout for feature cards (Assets, Equities, Portfolio, Account)
- ArrowRight CTA icon on each card for visual navigation cues
- Improved feature descriptions for onboarding guidance

### 5. Account Page & Sidebar (from prior v0.7.0 work)

- Rebuilt account page: profile card with photo upload, extracted document fields, document preview
- Profile photo upload/retrieve endpoints (`POST /api/auth/photo`, `GET /api/auth/photo/{user_id}`)
- Sidebar upgraded: user profile photo + name display, beta nav items
- Extracted fields now returned in account documents API
- Document preview endpoint (`GET /api/documents/{doc_id}/preview`)
- Fixed OCR showing raw text dump (empty schema fallback)
- Fixed document delete bug (`del` vs `None` assignment)

---

## Files Created

- `backend/equities.py` — S&P 500 analysis engine (~350 lines)
- `backend/equities_router.py` — 4 REST endpoints
- `frontend/app/dashboard/equities/page.tsx` — full equities page (~500 lines)
- `docs/SESSION_007.md`

## Files Modified

- `backend/assets/gemini_ocr.py` — smart regex fallback extraction
- `backend/main.py` — wired equities_router, v0.7.0
- `backend/requirements.txt` — added yfinance, statsmodels, lxml, html5lib
- `frontend/app/globals.css` — marquee keyframes animation
- `frontend/components/Sidebar.tsx` — TrendingUp icon, Equities nav item, v0.7.0
- `frontend/app/dashboard/page.tsx` — personalized welcome, Equities card, 2×2 grid, ArrowRight CTAs
- `frontend/app/dashboard/account/page.tsx` — profile editing mode (form, save, cancel)

---

## Architecture

```
Equities Pipeline:
  Wikipedia (S&P 500 list) → yfinance (prices) → Analysis Engine
    ├── Rolling Z-Score (60-day window)
    ├── Markov Switching (k=3: bull/bear/neutral)
    ├── Inflection Detection (regime shift + high z-score + fake news)
    └── Forecast (3 scenarios × 90 days with uncertainty bands)

OCR Fallback Chain:
  Upload → pytesseract raw text → Gemini 2.0 Flash
    ├── Success → structured JSON fields
    └── Failure → _smart_extract (regex) → _basic_kv_extract → empty schema

Cache: 30-min TTL in-memory dict for equities data
```

## New Dependencies

| Package     | Version | Purpose                             |
| ----------- | ------- | ----------------------------------- |
| yfinance    | ≥0.2    | S&P 500 price data download         |
| statsmodels | ≥0.14   | MarkovRegression (regime switching) |
| lxml        | ≥4.9    | HTML parsing for Wikipedia scrape   |
| html5lib    | ≥1.1    | Fallback HTML parser                |

## API Endpoints Added

| Method | Path                           | Description                                                           |
| ------ | ------------------------------ | --------------------------------------------------------------------- |
| GET    | /api/equities/ticker-tape      | Top 20 tickers with price + change %                                  |
| GET    | /api/equities/sp500?years=N    | S&P 500 time series + stats                                           |
| GET    | /api/equities/movers           | Top 10 gainers + losers                                               |
| GET    | /api/equities/analysis?years=N | Full analysis: prices, z-scores, regimes, inflection points, forecast |

## Version: v0.7.0
