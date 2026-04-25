# SESSION 030: EDGAR → Alpha Vantage Migration & Equities Section Launch

**Date:** April 19, 2026  
**Objective:** Replace SEC EDGAR with Alpha Vantage API for fundamental financial data, unhide Equities section in UI, secure API key via AWS Secrets Manager

---

## Summary of Changes

### 1. Backend: Alpha Vantage Integration

#### Created `backend/backend/equities/alpha_vantage.py` (~230 lines)
**Purpose:** Alpha Vantage API client replacing EDGAR, with caching via PostgreSQL.

**Key Functions:**
- `_av_fetch(function, ticker)` — Raw HTTP call to AV API with retry logic
- `_store_av_data(ticker, function, data)` — Store AV response in `av_fundamentals` table
- `_get_av_data(ticker, function)` — Retrieve cached AV data from DB
- `fetch_overview(ticker)` — Company overview (market cap, PE, 52W high/low, EPS, dividend yield)
- `fetch_income_statement(ticker)` — Annual/quarterly income data
- `fetch_balance_sheet(ticker)` — Annual/quarterly balance sheet data
- `fetch_cash_flow(ticker)` — Annual/quarterly cash flow data
- `fetch_earnings(ticker)` — Quarterly earnings data
- `fetch_all_fundamentals(ticker)` — Fetches all 5 datasets in sequence
- `get_cached_fundamentals(ticker)` — Returns dict of all 5 cached functions (takes 1 arg)
- `get_fetch_status()` — Returns fetch timestamps for all cached tickers

**Database Table:**
```sql
CREATE TABLE av_fundamentals (
  ticker VARCHAR(10) NOT NULL,
  function_name VARCHAR(50) NOT NULL,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (ticker, function_name)
);
```

**Current State:** AAPL only, all 5 functions cached (~380 KB total):
- OVERVIEW: 2 KB
- INCOME_STATEMENT: 89 KB
- BALANCE_SHEET: 139 KB
- CASH_FLOW: 123 KB
- EARNINGS: 25 KB

---

### 2. Backend: Data Layer Rewrites

#### Updated `backend/backend/equities/statements.py`
**Before:** Read from `financials` table (EDGAR data)  
**After:** Reads from `av_fundamentals` via `_get_av_data()`

**Exports:**
- `get_financial_statement(ticker, statement_type, period_type)` — Returns JSON with periods and rows
- `get_all_statements(ticker)` — Returns all 3 statements (income, balance, cash flow)
- `get_financials_summary(ticker)` — Returns summary metrics

**Test Results (AAPL):**
- Income: 14 rows × 10 periods ✓
- Balance Sheet: 21 rows × annual periods ✓
- Cash Flow: 9 rows × periods ✓

#### Updated `backend/backend/equities/ratios.py`
**Before:** Calculated from `financials` table + `price_history`  
**After:** Calculated from `av_fundamentals` (OVERVIEW + statements) + `price_history`

**Ratios Computed:**
1. Valuation: PE, PB, PS, PEG, dividend yield, market cap
2. Profitability: ROE, ROA, gross margin, operating margin, net margin
3. Leverage: debt-to-equity, debt-to-assets, interest coverage
4. Liquidity: current ratio, quick ratio, working capital
5. Growth: 5yr revenue growth, earnings growth, FCF growth
6. Cash Flow: FCF yield, FCF-to-earnings, operating cash flow to sales

**Test Results:** All 9 categories compute correctly for AAPL ✓

#### Deleted `backend/backend/equities/edgar.py`
Removed all SEC EDGAR integration code.

---

### 3. Backend: API Router Updates (`backend/backend/equities/router.py`)

**Removals:**
- `from equities.edgar import fetch_and_store_financials, fetch_all_sp500_financials`
- `get_company()` guard on `/financials/{ticker}` — now returns AV data directly
- On-demand yfinance fetch on `/prices/{ticker}` — hung indefinitely, now returns cached data only

**Additions:**
- `from equities.alpha_vantage import fetch_all_fundamentals, get_fetch_status, get_cached_fundamentals`

**Endpoint Behavior Changes:**

| Endpoint | Before | After |
|----------|--------|-------|
| `GET /companies/{ticker}` | 404 if not in `companies` table | Falls back to AV OVERVIEW: `cached.get("OVERVIEW")` |
| `GET /financials/{ticker}` | Checked `get_company()`, queried `financials` table | Returns AV data directly, no company check |
| `GET /financials/{ticker}/all` | Same guard | Removed guard, returns AV data |
| `GET /ratios/{ticker}` | 404 if not in `companies` table | Falls back: `company = get_company(ticker) or {}` |
| `GET /prices/{ticker}` | Fetched live yfinance data (hangs) | Returns cached data or empty array |
| `POST /fetch-av/{ticker}` | Checked company existence | Removed check, fetches AV directly |
| `GET /stats` | Queried `financials` table | Queries `av_fundamentals` table |

---

### 4. Backend: Database Cleanup

**Current State:**
- `av_fundamentals`: 5 rows (AAPL only, all functions) ✓
- `companies`: 0 rows (empty, not used)
- `price_history`: 0 rows (empty, not used)
- `financials`: 0 rows (empty, EDGAR data removed)

No stale data.

---

### 5. Frontend: Equities Section Unhidden

#### Updated `frontend/components/Sidebar.tsx`
**Before:**
```typescript
const COMING_SOON = [
  { label: "Equities", icon: TrendingUp, badge: "Coming", href: "/dashboard/equities" },
  // ...
];
```

**After:**
```typescript
const NAV = [
  { label: "Dashboard", icon: Home, badge: "Beta" as const, href: "/dashboard" },
  { label: "Assets", icon: Briefcase, badge: "Beta" as const, href: "/dashboard/assets" },
  { label: "Chat", icon: MessageCircle, badge: "Beta" as const, href: "/dashboard/chat" },
  { label: "Cohorts", icon: Users, badge: "Beta" as const, href: "/dashboard/cohort" },
  { label: "Account", icon: Settings, badge: "Beta" as const, href: "/dashboard/account" },
  { label: "Equities", icon: TrendingUp, badge: "Beta" as const, href: "/dashboard/equities" }, // Added
];
```

**Result:** Equities now shows in main navigation, no longer hidden.

---

### 6. Frontend: Page Testing

#### `/dashboard/equities/stocks/AAPL` — Working ✓

All API calls return 200:
- `GET /api/equities/v2/companies/AAPL` — Returns: `{"name":"Apple Inc","ticker":"AAPL","sector":"TECHNOLOGY","industry":"CONSUMER ELECTRONICS"}`
- `GET /api/equities/v2/ratios/AAPL` — Returns: 9 ratio categories
- `GET /api/equities/v2/prices/AAPL?period=1Y` — Returns: `{"count":0,"data":[]}` (no price history cached)
- `GET /api/equities/v2/financials/AAPL/all?period_type=annual` — Returns: `{"income_statement":{...},"balance_sheet":{...},"cash_flow":{...}}`

**UI Displays:**
- Apple Inc — TECHNOLOGY • CONSUMER ELECTRONICS
- 52W High/Low: $288.35 / $188.99
- P/E: 33.32
- Market Cap: 3.97T
- EPS: $8.11
- Dividend Yield: 0.39%
- All financial statements load correctly

---

### 7. Production Security: AWS Secrets Manager Setup

#### Problem
Cannot share paid API key with Copilot; must keep it secure in AWS.

#### Solution
Configure backend to read from AWS Secrets Manager at runtime.

#### Required Changes (to be implemented):

**Update `backend/backend/config.py`:**
```python
def _load_from_secrets_manager() -> dict:
    """Load config from AWS Secrets Manager in production"""
    import boto3
    import json
    import os
    
    secret_arn = os.getenv("APP_CONFIG_SECRET_ARN")
    if not secret_arn:
        return {}
    
    try:
        client = boto3.client("secretsmanager", region_name="us-east-1")
        response = client.get_secret_value(SecretId=secret_arn)
        secret_string = response.get("SecretString", "{}")
        return json.loads(secret_string)
    except Exception as e:
        print(f"Warning: Could not load from Secrets Manager: {e}")
        return {}

# Load base settings from .env (local dev) or defaults
settings = Settings()

# Override with Secrets Manager values if running on AWS
aws_secrets = _load_from_secrets_manager()
if aws_secrets:
    if "ALPHA_VANTAGE_API_KEY" in aws_secrets:
        settings.alpha_vantage_api_key = aws_secrets["ALPHA_VANTAGE_API_KEY"]
    if "JWT_SECRET_KEY" in aws_secrets:
        settings.jwt_secret_key = aws_secrets["JWT_SECRET_KEY"]
```

**Add to `backend/requirements.txt`:**
```
boto3>=1.26.0
```

**Update `infra/lib/backend-stack.ts` (line 40-47):**
```typescript
secretStringTemplate: JSON.stringify({
  JWT_SECRET_KEY: "replace-me",
  GEMINI_API_KEY: "",
  GMAIL_ADDRESS: "",
  GMAIL_APP_PASSWORD: "",
  DATABASE_URL: "",
  ALPHA_VANTAGE_API_KEY: "",  // Add this line
}),
```

**IAM Permissions:** Already configured — CDK stack grants `instanceRole` read access to `appConfigSecret` (line 63 of backend-stack.ts).

**Deployment Steps:**
1. Implement code changes above
2. Deploy CDK: `cd infra && npx cdk deploy --stage prod`
3. Update AWS secret with paid key:
```bash
aws secretsmanager update-secret \
  --secret-id paloor/prod/backend/app-config \
  --secret-string '{
    "JWT_SECRET_KEY":"your-jwt-secret",
    "ALPHA_VANTAGE_API_KEY":"your-paid-api-key",
    "GEMINI_API_KEY":"",
    "GMAIL_ADDRESS":"",
    "GMAIL_APP_PASSWORD":"",
    "DATABASE_URL":""
  }' \
  --region us-east-1
```
4. Redeploy backend container to App Runner

---

### 8. Development Environment

**Local Dev Setup:**
- Backend: FastAPI + uvicorn on port 8000
- Frontend: Next.js 16.1.6 on port 3000
- Database: PostgreSQL via SSM tunnel to EC2 `i-0c2b11fa97db72764` on localhost:5432
- Alpha Vantage: Free tier key `KWIQZZE0UKP57L1U` (25 req/day, 5/min) in `.env`

**Environment Variables:**
```bash
# backend/backend/.env
ALPHA_VANTAGE_API_KEY=KWIQZZE0UKP57L1U  # Free tier for local dev
JWT_SECRET_KEY=paloor-dev-secret-key-change-in-production
DATABASE_URL=postgresql://paloor:paloor_prod_2026@127.0.0.1:5432/paloor
```

---

## Alpha Vantage API Reference

### Delayed Market Data Entitlement

To access **15-minute delayed US stock market data** (instead of real-time), append `entitlement=delayed` to requests:

```
https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=IBM&interval=5min&entitlement=delayed&apikey=YOUR_KEY
```

### Supported Functions

Our implementation uses:
- `OVERVIEW` — Company fundamental data (market cap, PE, 52W high/low, EPS, dividend yield)
- `INCOME_STATEMENT` — Annual and quarterly income statement data
- `BALANCE_SHEET` — Annual and quarterly balance sheet data
- `CASH_FLOW` — Annual and quarterly cash flow statement data
- `EARNINGS` — Quarterly earnings data (earnings per share, surprises)

### Rate Limits

**Free Tier:**
- 25 API calls per day
- 5 calls per minute

**$50/month Tier (production):**
- Higher request limits
- Recommended for production use

---

## Next Steps

1. **Implement Secrets Manager config changes** (3 files)
2. **Test with paid Alpha Vantage tier** on production
3. **Add more tickers** to Alpha Vantage cache (currently AAPL only)
4. **Implement price history cache** for trends/charts
5. **Build price alert features** using delayed data endpoint
6. **Add screening/filtering** across cached fundamentals

---

## Known Limitations

- Only AAPL cached currently — other tickers will trigger live AV fetches
- Price history not cached (no historical data, no charts)
- Delayed data entitlement untested
- Free tier at 25 requests/day — production will need paid tier

---

## Testing Commands

```bash
# Start backend
cd backend/backend && source .venv/bin/activate && uvicorn main:app --reload --port 8000

# Test endpoints
curl -s http://localhost:8000/api/equities/v2/companies/AAPL | python3 -m json.tool
curl -s http://localhost:8000/api/equities/v2/ratios/AAPL | python3 -m json.tool
curl -s "http://localhost:8000/api/equities/v2/financials/AAPL/all?period_type=annual" | python3 -m json.tool
curl -s "http://localhost:8000/api/equities/v2/prices/AAPL?period=1Y" | python3 -m json.tool

# Check DB state
psql "postgresql://paloor:paloor_prod_2026@127.0.0.1:5432/paloor" << EOF
SELECT ticker, function_name, length(data::text) AS bytes FROM av_fundamentals ORDER BY ticker, function_name;
EOF
```
