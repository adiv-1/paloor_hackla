# SESSION 018 — Equities Intelligence Platform: Architecture & Planning

**Date**: March 8, 2026
**Type**: Strategic Planning Document (No Code)
**Status**: Pre-implementation research
**Author**: Paloor Engineering

---

## Executive Summary

This document plans the Paloor Equities Intelligence Platform — a screener.in-equivalent with an AI reasoning layer on top. It covers data sourcing, storage architecture, compute pipelines, financial analysis methodology, AI integration strategy, security architecture, and the path to deploying a live development environment. This is a complex, multi-month build broken into clear, executable phases.

This document also serves as the master infrastructure plan for Paloor broadly — the cloud architecture designed here supports not just equities, but every current and future feature: asset vault, user credentials, documents, chat, portfolio, and AI pipelines.

---

## Table of Contents

1. The Vision
2. Data Sources
3. Storage Architecture (including Security)
4. Compute & Pipeline Architecture
5. Financial Analysis Components
6. AI Architecture for Equities
7. Implementation Phases
8. Database Schema
9. Security Architecture
10. Path to Live Deployment
11. Key Technical Decisions Summary
12. What Makes This Different From Screener.in
13. Next Steps

---

## Part 1: The Vision

### What We Are Building

A three-layer equity intelligence system:

```
Layer 3: AI Synthesis
         ↑
         Contextual AI (InfoPopover++), narrative generation,
         sentiment fusion, personalized insights per user profile

Layer 2: Quantitative Analysis
         ↑
         Markov switching, Z-score events, ratio trends,
         DCF models, screener engine, peer comparison

Layer 1: Data Foundation
         ↑
         Price data (yfinance), Filings (SEC EDGAR),
         Fundamentals (parsed 10-K/10-Q), News (SERP/NewsAPI)
```

The key differentiator over Screener.in: **every data point has an AI narrative attached to it, personalized to the user's portfolio and risk profile.**

A person looking at NVIDIA's price chart should see:

- The chart itself
- Regime state (bull/bear/neutral) colored on the chart
- Annotated Z-score events with news headlines
- An AI summary that says: _"NVIDIA is up 34% over the past 90 days driven by strong data center demand. Three significant events occurred: Q3 earnings beat on Nov 19, an analyst upgrade from Goldman on Dec 2, and an 8-K filing on Jan 8 regarding a new partnership. The current Markov regime is bull with 87% probability. Given your portfolio already has 12% tech exposure, adding NVIDIA would increase concentration risk."_

That last sentence — the portfolio awareness — is what nobody else has.

---

## Part 2: Data Sources

### 2.1 Should You Keep yfinance?

**Yes. Keep it for now. Here is the full analysis:**

| Source        | Cost          | Coverage    | Reliability | Latency        | Notes                                      |
| ------------- | ------------- | ----------- | ----------- | -------------- | ------------------------------------------ |
| yfinance      | Free          | Global      | Medium      | 15-min delay   | Yahoo scrape, risk of rate limits at scale |
| Alpha Vantage | Free / $50/mo | US focused  | High        | Real-time paid | Good fundamentals API                      |
| Polygon.io    | $29/mo+       | US + crypto | Very high   | Real-time      | Best quality, includes news                |
| Tiingo        | $10/mo        | US          | High        | EOD free       | Clean REST API, reliable                   |
| Marketstack   | Free tier     | Global      | Medium      | EOD            | Decent for history                         |

**Verdict**: yfinance is fine for MVP because you are not building a trading platform. Daily OHLCV + fundamentals is everything you need for analysis. The primary risk is Yahoo blocking scraping at scale above approximately 500 tickers per day.

**Migration path**: When you hit yfinance rate limits, swap to Tiingo at $10/month. The API surface is nearly identical and the migration is a two-hour job.

---

### 2.2 SEC Filings — The Correct Sources

The 10-K is not the only source. Here is the complete filing taxonomy you need:

| Filing              | Frequency      | What It Contains                                                        | Priority                |
| ------------------- | -------------- | ----------------------------------------------------------------------- | ----------------------- |
| **10-K**            | Annual         | Full audited financials, MD&A, risk factors, business description       | Critical                |
| **10-Q**            | Quarterly      | Unaudited quarterly financials, interim MD&A                            | Critical                |
| **8-K**             | Event-driven   | Material events: earnings releases, acquisitions, CEO changes, guidance | High                    |
| **DEF 14A** (Proxy) | Annual         | Executive compensation, board composition, shareholder votes            | Medium                  |
| **S-1**             | IPO only       | Business description, first financials, risk factors                    | Medium                  |
| **Form 4**          | Insider trades | C-suite buying and selling, required within 2 business days             | High (sentiment signal) |
| **13F**             | Quarterly      | Institutional holdings — Berkshire, ARK, Tiger Global positions         | Medium                  |

**For Phase 1: focus exclusively on 10-K, 10-Q, and 8-K.** These three give you 95% of what you need for analysis.

---

### 2.3 SEC EDGAR API — The Crown Jewel

This is the correct and complete answer for financial data. SEC EDGAR is free, official, and rate-limited at 10 requests per second.

```
Base URL: https://data.sec.gov/

Key endpoints:

  GET /submissions/{CIK}.json
  → All filings ever made by a company, with dates and accession numbers

  GET /api/xbrl/companyfacts/{CIK}.json
  → EVERY structured financial fact ever reported by the company
  → Revenue, net income, EPS, shares outstanding, total debt, everything
  → Covers all US public companies since approximately 2009
  → Returns clean JSON — no PDF parsing required

  GET /Archives/edgar/full-index/
  → Bulk index for all filings, useful for batch processing

  GET /Archives/edgar/data/{CIK}/{accession}/{filename}.htm
  → Full text of any specific filing
```

**The XBRL companyfacts endpoint fundamentally changes your architecture.** You do NOT need to parse PDF 10-Ks to get financial metrics. EDGAR gives you structured JSON directly. The only reason to download the actual filing text is for:

- MD&A section (management discussion — qualitative narrative, the most valuable text)
- Risk factors section
- Business description (for AI context)

Everything else — every number — comes from the XBRL endpoint clean and structured.

---

### 2.4 News and Sentiment Sources

| Source                 | What You Get                                | Cost                                  | Recommendation              |
| ---------------------- | ------------------------------------------- | ------------------------------------- | --------------------------- |
| **NewsAPI**            | Headlines, snippets, URLs from 100+ sources | Free dev (100 req/day) / $449/mo prod | Start here                  |
| **SERP API**           | Google News as JSON, highest quality        | $50/mo for 5K queries                 | Best quality                |
| **Polygon.io News**    | Ticker-linked news included in Polygon plan | Bundled with Polygon                  | Clean if already on Polygon |
| **Alpha Vantage News** | Pre-scored sentiment included               | Free tier available                   | Easy but shallow scoring    |
| **RSS direct**         | Bloomberg, Reuters RSS                      | Free but fragile                      | Do not build on this        |

**Recommendation**: Start with NewsAPI on the free dev tier for development. For production, SERP API at $50/month gives you the highest quality Google News results.

**Critical architecture decision**: You only need three fields from news sources — URL, headline, and snippet. Never store or send full article text to AI. Token costs explode and the signal-to-noise ratio drops. A well-written headline plus snippet gives AI 90% of the information it needs for sentiment scoring.

---

## Part 3: Storage Architecture

### 3.1 The Full Picture — What Paloor Stores

Before choosing cloud providers, map every category of data the platform handles:

| Data Category                             | Sensitivity  | Size Estimate      | Access Pattern                  |
| ----------------------------------------- | ------------ | ------------------ | ------------------------------- |
| User credentials (email, hashed password) | **Critical** | Tiny (~1KB/user)   | Every login                     |
| Auth tokens / sessions                    | **Critical** | Tiny               | Every API call                  |
| Personal documents (passport, W-2, DL)    | **Critical** | 1-10MB/user        | Upload + occasional read        |
| Profile data (name, DOB, employment)      | **High**     | Tiny               | Frequent read                   |
| Financial account links (bank, brokerage) | **High**     | Tiny               | Dashboard load                  |
| Asset data (holdings, vehicles, property) | **High**     | Small              | Frequent read/write             |
| Chat history (AI conversations)           | **Medium**   | Growing            | Frequent                        |
| Portfolio analysis results                | **Medium**   | Small              | On-demand                       |
| Stock price history                       | **Low**      | Large (GB scale)   | Pipeline + reads                |
| SEC filing data (XBRL JSON)               | **Low**      | Large (GB scale)   | Pipeline write, frequent read   |
| 10-K MD&A text corpus                     | **Low**      | Large (GB scale)   | Pipeline write, occasional read |
| News sentiment data                       | **Low**      | Medium and growing | Pipeline write, frequent read   |
| AI summary cache                          | **Low**      | Medium             | Frequent read/write             |
| User photos (profile images)              | **Low**      | Small              | Occasional                      |

This split into two distinct storage tiers:

- **Sensitive user data** → encrypted relational database with strict access control
- **Market data and AI outputs** → object storage + relational database, less strict

---

### 3.2 Cloud Storage Provider Comparison

| Option                           | Best For                              | Monthly Cost (MVP) | Monthly Cost (Scale) | Verdict                                 |
| -------------------------------- | ------------------------------------- | ------------------ | -------------------- | --------------------------------------- |
| **AWS S3 + RDS**                 | Industry standard, maximum ecosystem  | $20-40             | $100-300             | Best long-term, steepest learning curve |
| **Google Cloud GCS + Cloud SQL** | AI-native, Gemini integration         | $15-35             | $80-250              | Best for AI-heavy workloads             |
| **Cloudflare R2 + Supabase**     | Zero egress costs, developer-friendly | $0-25              | $50-150              | **Best for solo founder MVP**           |
| **Azure Blob + Azure SQL**       | Microsoft ecosystem                   | $20-40             | $100-300             | No meaningful advantage here            |
| **Local SQLite only**            | Current state                         | $0                 | Not viable           | Works today, breaks at S&P 500 scale    |

---

### 3.3 Recommended Architecture — Hybrid Cloudflare + Supabase

```
┌─────────────────────────────────────────────────────────────────┐
│  PALOOR CLOUD STORAGE ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Cloudflare R2 (Object Storage — $0.015/GB, FREE egress)        │
│  ├── /users/{user_id}/documents/{doc_id}   ← personal docs      │
│  │     AES-256 encrypted at rest                                │
│  │     Signed URLs only, 1-hour expiry                          │
│  ├── /users/{user_id}/photos/              ← profile images     │
│  ├── /filings/10k/{ticker}/{year}.json     ← XBRL data          │
│  ├── /filings/10k/{ticker}/{year}_mda.txt  ← MD&A text          │
│  ├── /filings/10q/{ticker}/{quarter}.json  ← quarterly data     │
│  └── /news/{ticker}/{date}.json            ← news cache         │
│                                                                 │
│  Supabase PostgreSQL (Relational — Free 500MB / $25/mo 8GB)     │
│  ├── users                 ← credentials (bcrypt hashed)        │
│  ├── sessions              ← JWT tokens + refresh tokens        │
│  ├── user_profiles         ← personal info, KYC fields          │
│  ├── user_contexts         ← AI ambient memory per user         │
│  ├── asset_vault           ← document metadata (not files)      │
│  ├── linked_accounts       ← bank/brokerage connections         │
│  ├── conversations         ← chat history                       │
│  ├── messages              ← individual messages                │
│  ├── companies             ← ticker metadata, CIK mapping       │
│  ├── price_history         ← daily OHLCV                        │
│  ├── financials            ← EDGAR XBRL parsed data             │
│  ├── ratios                ← computed financial ratios          │
│  ├── events                ← Z-score detected events            │
│  ├── regime_states         ← Markov model outputs               │
│  ├── news_sentiment        ← scored headlines                   │
│  ├── ai_summaries          ← cached AI outputs                  │
│  ├── watchlists            ← user watchlists                    │
│  └── saved_screens         ← saved screener criteria            │
│                                                                 │
│  Supabase Auth (Authentication layer)                           │
│  ├── Handles JWT issuance and refresh                           │
│  ├── Row Level Security (RLS) on all user tables                │
│  └── OAuth providers (Google, Apple) ready when needed         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Total monthly cost at MVP (100 stocks, 100 users)**: $0–25/month
**Total monthly cost at growth (S&P 500, 10K users)**: $50–150/month
**Total monthly cost at scale (all US equities, 100K users)**: $200–600/month

---

## Part 4: Security Architecture

This is non-negotiable, especially given that Paloor stores passports, driver's licenses, W-2s, bank connections, and full financial profiles. A breach is an existential event for the company. Build security in from day one.

### 4.1 User Credential Security

```
Passwords:
  → bcrypt with work factor 12 (current implementation)
  → Never logged, never transmitted in plain text
  → Password reset via time-limited email token (1 hour expiry)
  → Rate limit login attempts: 5 failures → 15 minute lockout

JWT Tokens:
  → Access token: 15 minute expiry
  → Refresh token: 30 day expiry, single-use rotation
  → Tokens signed with RS256 (asymmetric) not HS256
  → Refresh tokens stored hashed in database
  → Token revocation list for logout and compromised tokens

Session Management:
  → HttpOnly cookies for refresh tokens (not accessible to JavaScript)
  → SameSite=Strict on all auth cookies
  → Secure flag enforced (HTTPS only)
```

### 4.2 Personal Document Security (Asset Vault)

This is the highest-risk data category. A user's passport or W-2 in the wrong hands is identity theft.

```
At Rest:
  → All documents encrypted with AES-256 before upload to Cloudflare R2
  → Encryption key derived per-user from a master key (envelope encryption)
  → Master keys stored in Supabase Vault (secrets manager)
  → File contents never stored in the database — only metadata and R2 path

In Transit:
  → TLS 1.3 minimum for all connections
  → Cloudflare handles TLS termination (already on Cloudflare)

Access Control:
  → Signed URLs generated on-demand with 1-hour expiry
  → User can only request signed URLs for their own documents
  → Backend verifies ownership before generating URL
  → No direct R2 bucket access — always proxied through backend

What This Means in Practice:
  → Even if R2 bucket is somehow accessed, files are encrypted ciphertext
  → Even if database is breached, there are no file contents — only paths
  → Even if a signed URL is stolen, it expires in 1 hour
```

```python
# Envelope encryption pattern for documents
# Per-user data key encrypted with master key

def encrypt_document(user_id: str, file_bytes: bytes) -> tuple[bytes, str]:
    # Generate a unique data key for this file
    data_key = secrets.token_bytes(32)

    # Encrypt the file with the data key (AES-256-GCM)
    aesgcm = AESGCM(data_key)
    nonce = secrets.token_bytes(12)
    ciphertext = aesgcm.encrypt(nonce, file_bytes, None)

    # Encrypt the data key with the user's master key
    user_master_key = get_user_master_key(user_id)  # from Supabase Vault
    encrypted_data_key = encrypt_key(data_key, user_master_key)

    # Store encrypted_data_key in database
    # Store nonce + ciphertext in R2
    return nonce + ciphertext, encrypted_data_key
```

### 4.3 Financial Account Links Security

```
Bank/Brokerage Connections:
  → Use Plaid in production (they handle OAuth, never see credentials)
  → For MVP: store only account metadata (last 4 digits, institution name)
  → Never store full account numbers
  → Store Plaid access tokens encrypted in database
  → Access tokens scoped to read-only (no transaction capabilities)

PII Fields (SSN, DOB, address):
  → Encrypt at application layer before database storage
  → Decrypt only when explicitly needed (never in list views)
  → Audit log every access to PII fields
```

### 4.4 API Security

```
Rate Limiting:
  → Authentication endpoints: 5 req/min per IP
  → AI endpoints: 20 req/min per user (cost protection)
  → General API: 200 req/min per user
  → Implemented via slowapi (already in FastAPI ecosystem)

Input Validation:
  → Pydantic validation on all inputs (already using)
  → File upload: validate MIME type + magic bytes (not just extension)
  → Max file size: 50MB per document
  → Allowlist of file types: PDF, JPG, PNG, HEIC only

CORS:
  → Strict allowlist of origins (your domain only)
  → No wildcard in production
  → Credentials: true with specific origins only

SQL Injection:
  → All queries use parameterized statements (SQLAlchemy / aiosqlite)
  → No string concatenation in SQL ever
```

### 4.5 Compliance Considerations

```
GDPR / CCPA:
  → User data export endpoint (download everything Paloor has on you)
  → Account deletion that actually purges all data including R2 objects
  → Privacy policy that accurately describes data use

Financial Regulations:
  → Add "This is not financial advice" to all AI outputs
  → Log AI outputs for potential regulatory review
  → Do not store SSNs unless absolutely required
  → Consider SOC 2 Type II audit when you raise a seed round

SEC / FINRA:
  → You are NOT an RIA today (you don't manage money)
  → The moment you say "buy this stock" rather than "here is analysis,"
    you may need RIA registration
  → Consult a fintech lawyer before launch — budget $5,000-15,000
```

---

## Part 5: Compute and Pipeline Architecture

### 5.1 Should You Use n8n or Airflow?

**n8n is the wrong tool for data pipelines.** Here is the honest comparison:

| Tool                       | Best For                                       | Not Good For                                   |
| -------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| **n8n**                    | API integrations, webhooks, simple automations | Heavy computation, ML, custom Python logic     |
| **Apache Airflow**         | Complex enterprise DAG pipelines, large teams  | Overkill for a solo founder, steep setup       |
| **Prefect**                | Modern Python pipelines, visual monitoring     | Learning curve, additional service to maintain |
| **GitHub Actions**         | Scheduled CI/CD jobs                           | 6-hour max runtime, not for data pipelines     |
| **APScheduler in FastAPI** | Exactly what you need today                    | Nothing — this is the right answer for now     |
| **Celery + Redis**         | Async task queues, heavy background jobs       | Requires Redis setup, more infrastructure      |

**Recommendation**: APScheduler embedded in FastAPI handles everything up to 10,000 stocks. You are already using FastAPI. APScheduler integrates in 10 lines. Migrate to Prefect when you need multi-worker parallelism and visual pipeline monitoring.

### 5.2 Pipeline Design

```
┌─────────────────────────────────────────────────────────────┐
│  PALOOR DATA PIPELINE                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  APScheduler (embedded in FastAPI)                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  DAILY JOBS (market data)                            │  │
│  │                                                      │  │
│  │  6:00 AM ET  — fetch_prices(S&P 500 tickers)        │  │
│  │               yfinance batch download               │  │
│  │               Store in price_history table          │  │
│  │                                                      │  │
│  │  7:00 AM ET  — compute_technicals(updated_tickers)  │  │
│  │               Z-score events, rolling returns       │  │
│  │               Volatility, beta calculations         │  │
│  │                                                      │  │
│  │  7:30 AM ET  — run_markov(updated_tickers)          │  │
│  │               Regime state for each ticker          │  │
│  │               Store in regime_states table          │  │
│  │                                                      │  │
│  │  8:00 AM ET  — fetch_news(watchlisted_tickers)      │  │
│  │               NewsAPI → headlines + snippets        │  │
│  │               Deduplicate by URL                    │  │
│  │                                                      │  │
│  │  9:00 AM ET  — score_sentiment(new_articles)        │  │
│  │               Gemma 3 27B batch sentiment scoring   │  │
│  │               Store in news_sentiment table         │  │
│  │                                                      │  │
│  │  4:30 PM ET  — compute_ratios(updated_tickers)      │  │
│  │               Full ratio recalculation after close  │  │
│  │               Sector medians, percentile rankings   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  WEEKLY JOBS (filing checks)                         │  │
│  │                                                      │  │
│  │  Sunday 2:00 AM — check_new_filings(all_tickers)    │  │
│  │                   Query EDGAR for new 10-K, 10-Q    │  │
│  │                   Queue any new filings for parsing │  │
│  │                                                      │  │
│  │  Sunday 3:00 AM — process_queued_filings()          │  │
│  │                   Fetch XBRL facts for new filings  │  │
│  │                   Extract MD&A text                 │  │
│  │                   Update financials table           │  │
│  │                   Invalidate AI summary cache       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ON-DEMAND JOBS (user triggered)                     │  │
│  │                                                      │  │
│  │  User views ticker → check if AI summary is fresh   │  │
│  │                    → if stale (>24h), regenerate    │  │
│  │                    → stream to user via SSE         │  │
│  │                                                      │  │
│  │  User runs screener → compute against ratio cache   │  │
│  │                     → return results in <500ms      │  │
│  │                                                      │  │
│  │  User uploads doc  → OCR + extract → update context │  │
│  │                    → rebuild AI ambient memory      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Compute Infrastructure Progression

```
Phase 1 — Development (Now):
  → Local MacBook
  → SQLite for storage
  → Cost: $0

Phase 2 — MVP / Dev Deployment (Next 2-3 months):
  → Hetzner CX21 VPS: €4.51/month (2 vCPU / 4GB RAM / 40GB SSD)
  → Why Hetzner over EC2? 10x cheaper for equivalent specs
  → Cloudflare R2 for file storage: $0-5/month
  → Supabase Free tier: $0/month
  → Cloudflare for DNS + DDoS protection: $0/month (free plan)
  → Total: ~$5-10/month
  → Handles: 500 tickers, 1000 daily active users

Phase 3 — Growth (6-18 months post-launch):
  → Hetzner CX31: €9/month (4 vCPU / 8GB RAM)
  → Supabase Pro: $25/month (8GB database)
  → Cloudflare R2: ~$15/month (growing corpus)
  → Total: ~$50/month
  → Handles: S&P 500 full universe, 10K daily active users

Phase 4 — Scale (Series A territory):
  → Google Cloud Run (serverless, auto-scaling)
  → Cloud SQL PostgreSQL
  → Cloud Tasks for async pipeline jobs
  → Total: $300-800/month
  → Handles: All US equities (~8000 tickers), 100K+ users
  → This is when EC2 / GCP proper makes sense
```

---

## Part 6: Financial Analysis Components

### 6.1 Complete Analysis Stack by Priority

#### Tier 1 — Core MVP (Must Have)

```
1. Price History and Returns
   - Daily OHLCV from yfinance
   - Rolling returns: 1D, 1W, 1M, 3M, 6M, 1Y, 3Y, 5Y
   - Annualized volatility (20D, 60D rolling standard deviation)
   - Beta vs S&P 500 (rolling 252 days)
   - Sharpe ratio (annualized return / annualized vol)

2. Financial Ratios from EDGAR XBRL
   Valuation:
     - P/E (trailing twelve months)
     - P/B (price to book)
     - P/S (price to sales)
     - EV/EBITDA
     - EV/Revenue

   Profitability:
     - Return on Equity (ROE)
     - Return on Assets (ROA)
     - Return on Invested Capital (ROIC)
     - Gross Margin
     - EBITDA Margin
     - Net Profit Margin

   Liquidity:
     - Current Ratio
     - Quick Ratio
     - Cash Ratio

   Leverage:
     - Debt to Equity
     - Net Debt to EBITDA
     - Interest Coverage Ratio

   Efficiency:
     - Asset Turnover
     - Inventory Turnover
     - Days Sales Outstanding (DSO)

   Growth (year over year):
     - Revenue Growth
     - EPS Growth
     - Free Cash Flow Growth
     - Gross Profit Growth

3. Income Statement Trends (12 quarters)
   - Revenue, Gross Profit, Operating Income, Net Income
   - EPS (basic and diluted), EBITDA
   - Beat/miss vs prior quarter

4. Balance Sheet Snapshot
   - Total Assets, Total Liabilities, Stockholders Equity
   - Total Debt, Cash and Equivalents
   - Working Capital, Book Value per Share

5. Cash Flow Analysis
   - Operating Cash Flow
   - Capital Expenditures
   - Free Cash Flow (Operating CF minus CapEx)
   - FCF Yield (FCF / Market Cap)
   - FCF Margin (FCF / Revenue)
```

#### Tier 2 — Differentiated Features (Already Partially Built)

```
6. Z-Score Event Detection
   - Detect statistical anomalies in price and volume (>2.5 sigma)
   - Auto-tag each event with news headlines from that date
   - Display as clickable annotations on price chart
   - User can click an event to see the full context

7. Markov Switching Model
   - 2-state (Bull/Bear) and 3-state (Bull/Neutral/Bear) variants
   - Regime probability at each historical date
   - Color-coded chart regions by regime
   - Current regime probability displayed prominently
   - Transition probability matrix shown in detail view

8. Peer Comparison
   - Sector median for every ratio
   - Percentile ranking vs sector (top 10% means better than 90% of peers)
   - Visual ranking bar for intuitive comparison

9. Screener Engine
   - Filter by any combination of ratios, metrics, sector, market cap
   - Markov regime filter (only show stocks in bull regime)
   - Z-score event recency filter
   - Save and name screener templates
   - Email alert when a new stock matches saved criteria
```

#### Tier 3 — Advanced Features (Phase 2+)

```
10. DCF Valuation Model
    - User-adjustable growth rates (base / bull / bear scenarios)
    - Adjustable discount rate (WACC)
    - Terminal value with multiple methods (Gordon Growth, EV/EBITDA exit)
    - Sensitivity table: rows are growth rate, columns are discount rate
    - Shows % upside or downside vs current market price

11. 10-K MD&A AI Summary
    - Extract management discussion section from annual filing
    - AI summarizes: key themes, acknowledged risks, forward guidance language
    - Tone analysis (optimistic vs defensive language)

12. Insider Transaction Analysis (SEC Form 4)
    - Net insider buying vs selling over rolling 30/90/180 day windows
    - Large single purchases flagged as potential bullish signal
    - Cluster buying (multiple insiders buying within 30 days) as strong signal
    - CEO salary vs stock purchase ratio as conviction indicator

13. Institutional Holdings (SEC 13F)
    - Top 20 institutional holders
    - Quarter over quarter change in holdings
    - Track smart money flows (Berkshire, Tiger Global, etc.)
    - New position entries and complete exits highlighted

14. Earnings Estimate Tracking
    - Historical EPS surprise (beat or miss + magnitude)
    - Revenue surprise history
    - Guidance history (raised, maintained, lowered)
```

### 6.2 The Screener Engine in Detail

```
INPUT PANEL:
┌─────────────────────────────────────────────────────────┐
│  Market Cap      [Micro] [Small] [Mid] [Large] [Mega]   │
│  Sector          [All ▼] Technology / Healthcare / ...  │
│  P/E Ratio       Min [___]  Max [___]                   │
│  Revenue Growth  Greater than [___]%  (YoY)             │
│  Net Margin      Greater than [___]%                    │
│  Debt / Equity   Less than [___]                        │
│  ROE             Greater than [___]%                    │
│  Current Ratio   Greater than [___]                     │
│  Markov Regime   [Any] [Bull] [Bear] [Neutral]          │
│  Z-Score Event   In last [30] days [Yes/No/Any]         │
│                                                         │
│  [Run Screener]  [Save Screen]  [Load Saved ▼]          │
└─────────────────────────────────────────────────────────┘

OUTPUT TABLE:
┌────────────────────────────────────────────────────────────────┐
│ Ticker  Name        Price  Mkt Cap  P/E   ROE    Rev Gr  Regime│
│ NVDA    NVIDIA      $875   $2.1T    35x   124%   +122%   🟢    │
│ AAPL    Apple       $172   $2.7T    28x    87%   +8%     🟢    │
│ MSFT    Microsoft   $415   $3.1T    34x    38%   +18%    🟢    │
└────────────────────────────────────────────────────────────────┘
Click any row → Full company analysis page
```

---

## Part 7: AI Architecture for Equities

### 7.1 Context Assembly — The Most Important Design Decision

AI responses must be scoped to exactly what the user is currently viewing. This is the architectural pattern:

```
User is viewing:              Context assembled and fed to Gemma 3 27B:
─────────────────────────────────────────────────────────────────────
Price chart (NVDA 90D)     →  Last 90 days OHLCV summary
                               3-5 key inflection points with dates
                               Current Markov regime + probability
                               3 most recent news headlines + snippets
                               User's current portfolio holdings

Financial ratios page      →  Current ratios vs sector median
                               5-year ratio trend (is P/E expanding?)
                               Strongest and weakest ratio flags
                               Most recent 10-K MD&A excerpt (1500 chars)

Income statement page      →  8 quarters of revenue + EPS
                               QoQ and YoY growth rates
                               Margin trend (widening or compressing?)
                               Last three earnings surprises

Screener results           →  Why each company matched the criteria
                               Common thread across matches
                               Current macro regime context
                               Risks in this market environment

Full company AI tab        →  Everything: ratios, trends, events,
                               news sentiment, MD&A summary,
                               regime, personalized portfolio fit
```

### 7.2 Three AI Prompt Types

**Type 1: Snapshot Narrative** (InfoPopover on charts, response under 150 words)

```
System:
  You are a financial analyst for Paloor. Be concise — 3 to 4 sentences.
  Never give a buy or sell recommendation. Describe what happened.
  The user's portfolio context: {user_context_summary}

User:
  Ticker: {ticker} ({company_name})
  Price today: {current_price} ({return_1m}% past month, {return_3m}% past 3 months)
  Key events: {z_score_events_last_90d}
  Current regime: {markov_state} with {markov_probability}% probability
  Recent news: {top_3_headlines_with_snippets}

  Summarize what has happened with {ticker} in the past 90 days
  and what the current setup looks like for a long-term investor.
```

**Type 2: Deep Analysis** (Full AI tab on company page, 400-600 words)

```
System:
  You are a senior equity research analyst writing an investment note.
  Be balanced. Cover both bull and bear case.
  Do not give a price target.
  Write clearly. No jargon without explanation.

User:
  Company: {ticker} — {company_name} ({sector})
  Market Cap: {market_cap} | Current P/E: {pe} | EV/EBITDA: {ev_ebitda}

  8-quarter financials:
  {income_statement_table}

  Key ratios vs sector median:
  {ratio_comparison_table}

  Balance sheet summary:
  {balance_sheet_summary}

  Management commentary (from latest 10-K MD&A):
  "{mda_excerpt}"

  News sentiment past 30 days:
  {news_sentiment_summary}

  Write an investor analysis covering:
  1. Business quality and competitive position
  2. Growth outlook (what the numbers show)
  3. Valuation (cheap, fair, or expensive vs history and peers)
  4. Key risks
  5. Summary verdict (one balanced paragraph)
```

**Type 3: Personalized Insight** (Uses full Paloor user context, most powerful)

```
System:
  You are the user's personal financial advisor within Paloor.
  You have full context of this user's financial situation.
  Be direct and personal. Reference their specific situation.
  Do not give a buy or sell recommendation.
  Explain how this stock relates to their existing situation.

User:
  User profile: {full_paloor_context}
  User's current portfolio: {holdings_with_allocations}
  User's risk profile: {risk_score_and_description}
  User's financial goals: {goals_list}

  Stock being analyzed: {ticker} — {company_name}
  AI analysis summary: {type_2_summary}

  Given this user's specific portfolio, risk tolerance, and financial goals,
  explain how {ticker} fits or conflicts with their current situation.
  What should they think about before adding or avoiding this position?
```

### 7.3 AI Summary Caching Strategy

AI calls are expensive in both time and tokens. Cache aggressively:

```
Cache invalidation rules:
  - Type 1 (snapshot): Cache 4 hours. Invalidate if new Z-score event detected.
  - Type 2 (deep):     Cache 24 hours. Invalidate if new 10-Q/10-K filed.
  - Type 3 (personal): Cache 2 hours. Invalidate if user uploads a document
                       or updates their portfolio.

Cache key: SHA256(ticker + summary_type + user_id + date_hour)
Storage: ai_summaries table in PostgreSQL
```

### 7.4 Do You Need a Custom LLM?

Short answer: No. Not for years.

```
Phase 1-2 (Now to $5M ARR):
  → Gemma 3 27B via Google AI API is sufficient
  → Financial reasoning is solved for frontier models
  → Your edge is DATA QUALITY + CONTEXT ASSEMBLY, not the model
  → Cost at scale: ~$0.50 per 1M tokens. 10,000 users, 50 queries/day = ~$25/day

Phase 3 ($5M to $20M ARR):
  → Fine-tune Llama 3 or Mistral on:
    - SEC filing interpretation
    - Financial ratio analysis and explanation
    - Historical market event narratives
  → Host on Hugging Face Inference Endpoints or your own A100 instance
  → One-time fine-tune cost: ~$500-2,000
  → Inference cost: ~$200/month for dedicated endpoint
  → This gives you a model that speaks fluent financial analysis

Phase 4 (Unicorn territory, $100M+ ARR):
  → Train a domain-specific financial model
  → By then you have millions of user interaction logs as training data
  → That interaction data IS the moat — no one can buy it
  → Budget: $500K+ for training + $50K/month for inference
```

---

## Part 8: Database Schema

```sql
-- Core company registry
CREATE TABLE companies (
  ticker TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cik TEXT UNIQUE,              -- SEC EDGAR Central Index Key
  sector TEXT,
  industry TEXT,
  market_cap_usd REAL,
  exchange TEXT,                -- NYSE, NASDAQ, etc.
  country TEXT DEFAULT 'US',
  last_price_update TIMESTAMP,
  last_filing_update TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE
);

-- Daily price history
CREATE TABLE price_history (
  ticker TEXT REFERENCES companies(ticker),
  date DATE NOT NULL,
  open REAL, high REAL, low REAL, close REAL,
  adj_close REAL,
  volume BIGINT,
  PRIMARY KEY (ticker, date)
);

-- EDGAR XBRL financial facts (atomic — one row per metric per period)
CREATE TABLE financials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT REFERENCES companies(ticker),
  period_end DATE NOT NULL,
  period_type TEXT NOT NULL,    -- 'annual' or 'quarterly'
  metric TEXT NOT NULL,         -- 'Revenue', 'NetIncome', 'EPS', etc.
  value REAL,
  unit TEXT DEFAULT 'USD',      -- 'USD', 'shares', 'pure'
  source TEXT DEFAULT 'EDGAR',
  UNIQUE (ticker, period_end, period_type, metric)
);

-- Computed ratios (quarterly snapshot for screener performance)
CREATE TABLE ratios (
  ticker TEXT REFERENCES companies(ticker),
  date DATE NOT NULL,
  -- Valuation
  pe_ratio REAL, pb_ratio REAL, ps_ratio REAL,
  ev_ebitda REAL, ev_revenue REAL,
  -- Profitability
  roe REAL, roa REAL, roic REAL,
  gross_margin REAL, net_margin REAL, ebitda_margin REAL, fcf_margin REAL,
  -- Liquidity
  current_ratio REAL, quick_ratio REAL, cash_ratio REAL,
  -- Leverage
  debt_equity REAL, net_debt_ebitda REAL, interest_coverage REAL,
  -- Efficiency
  asset_turnover REAL, inventory_turnover REAL, dso_days REAL,
  -- Growth (YoY)
  revenue_growth_yoy REAL, eps_growth_yoy REAL, fcf_growth_yoy REAL,
  -- Sector peer comparisons
  sector_pe_median REAL, sector_roe_median REAL,
  pe_sector_percentile REAL, roe_sector_percentile REAL,
  PRIMARY KEY (ticker, date)
);

-- Z-score detected events
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT REFERENCES companies(ticker),
  event_date DATE NOT NULL,
  event_type TEXT,              -- 'price_spike', 'volume_surge', 'earnings_beat', '8k_filed', etc.
  z_score REAL,
  description TEXT,
  news_headline TEXT,
  news_url TEXT,
  news_snippet TEXT
);

-- Markov regime states (daily, per ticker)
CREATE TABLE regime_states (
  ticker TEXT REFERENCES companies(ticker),
  date DATE NOT NULL,
  regime TEXT NOT NULL,         -- 'bull', 'bear', 'neutral'
  prob_bull REAL,
  prob_bear REAL,
  prob_neutral REAL,
  model_version TEXT DEFAULT 'v1',
  PRIMARY KEY (ticker, date)
);

-- News and sentiment
CREATE TABLE news_sentiment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT REFERENCES companies(ticker),
  published_date DATE,
  headline TEXT NOT NULL,
  snippet TEXT,
  url TEXT UNIQUE,
  source TEXT,
  sentiment_score REAL,         -- -1.0 (very negative) to 1.0 (very positive)
  sentiment_label TEXT,         -- 'positive', 'negative', 'neutral'
  scored_by TEXT DEFAULT 'gemma-3-27b-it',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cached AI summaries
CREATE TABLE ai_summaries (
  ticker TEXT REFERENCES companies(ticker),
  summary_type TEXT NOT NULL,   -- 'snapshot', 'deep', 'personalized'
  user_id TEXT,                 -- NULL for non-personalized summaries
  model TEXT NOT NULL,
  summary TEXT NOT NULL,
  context_hash TEXT,            -- SHA256 of inputs — detects staleness
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticker, summary_type, COALESCE(user_id, 'public'))
);

-- User watchlists
CREATE TABLE watchlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tickers TEXT NOT NULL,        -- JSON array: ["NVDA", "AAPL", "MSFT"]
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Saved screener criteria
CREATE TABLE saved_screens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  criteria TEXT NOT NULL,       -- JSON object with filter parameters
  alert_enabled BOOLEAN DEFAULT FALSE,
  last_run TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Asset vault document metadata (file content lives in R2, encrypted)
CREATE TABLE asset_vault (
  id TEXT PRIMARY KEY,          -- UUID
  user_id TEXT NOT NULL,
  document_type TEXT,           -- 'passport', 'w2', 'drivers_license', etc.
  original_filename TEXT,
  r2_object_key TEXT NOT NULL,  -- path in Cloudflare R2
  encrypted_data_key TEXT,      -- the per-file AES key, itself encrypted
  file_size_bytes INTEGER,
  mime_type TEXT,
  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ai_extracted_fields TEXT,     -- JSON of OCR results
  is_deleted BOOLEAN DEFAULT FALSE
);
```

---

## Part 9: Path to Live Deployment

### 9.1 What "Dev Deployment" Means

The goal: a URL (`dev.paloor.com` or `staging.paloor.com`) where you can test the full app live, share with beta users, and iterate. Not a toy demo — a fully functional app with real data.

### 9.2 Step-by-Step Deployment Plan

```
Step 1 — Domain and DNS (1 hour)
  → paloor.com already on Cloudflare (you mentioned this)
  → Add A record: dev.paloor.com → Hetzner VPS IP
  → Add A record: api.dev.paloor.com → same VPS IP
  → Cloudflare proxy: ON (free DDoS protection + HTTPS)

Step 2 — Provision Hetzner VPS (30 minutes)
  → Hetzner Cloud: CX21, Ubuntu 22.04 LTS, Frankfurt or Ashburn region
  → Cost: €4.51/month
  → Set up: ufw firewall (allow 80, 443, 22 only)
  → Install: Python 3.11, Node.js 20, nginx, certbot, pm2

Step 3 — Supabase Project (1 hour)
  → Create free Supabase project
  → Run schema migrations (all tables above)
  → Enable Row Level Security on user tables
  → Get: DATABASE_URL, SUPABASE_KEY, SUPABASE_URL
  → Migrate existing SQLite data to Supabase

Step 4 — Cloudflare R2 Bucket (30 minutes)
  → Create R2 bucket: paloor-dev-storage
  → Create API token with R2 read/write permissions
  → Get: R2_ACCESS_KEY, R2_SECRET_KEY, R2_ENDPOINT_URL

Step 5 — Backend Deployment (2 hours)
  → Git clone to VPS
  → Create .env with all production secrets
  → pip install -r requirements.txt
  → pm2 start "uvicorn main:app --host 0.0.0.0 --port 8000" --name paloor-api
  → nginx: proxy api.dev.paloor.com → localhost:8000
  → SSL: certbot --nginx -d api.dev.paloor.com

Step 6 — Frontend Deployment (1 hour)
  → npm run build
  → pm2 start "npm start" --name paloor-frontend -- -p 3000
  → nginx: proxy dev.paloor.com → localhost:3000
  → Update NEXT_PUBLIC_API_URL=https://api.dev.paloor.com
  → SSL: certbot --nginx -d dev.paloor.com

Step 7 — Verify (1 hour)
  → Test auth: register, login, refresh token
  → Test document upload → R2 object created
  → Test AI chat → Gemma responds
  → Test equities page → charts load
  → Run pipeline job manually → confirm data writes to Supabase
```

### 9.3 Environment Variables Required

```bash
# Authentication
SECRET_KEY=                    # JWT signing key (openssl rand -hex 64)
ALGORITHM=RS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30

# Database
DATABASE_URL=                  # postgresql://user:pass@host:5432/paloor
SUPABASE_URL=
SUPABASE_KEY=

# File Storage
R2_ACCESS_KEY=
R2_SECRET_KEY=
R2_ENDPOINT_URL=               # https://{account_id}.r2.cloudflarestorage.com
R2_BUCKET_NAME=paloor-dev-storage

# AI
GEMINI_API_KEY=                # Used for Gemma 3 27B

# Data APIs
NEWS_API_KEY=
SERP_API_KEY=                  # For production news

# Encryption
MASTER_ENCRYPTION_KEY=         # AES-256 base key for document encryption
                               # openssl rand -hex 32

# Frontend
NEXT_PUBLIC_API_URL=https://api.dev.paloor.com
```

---

## Part 10: Key Technical Decisions Summary

| Decision               | Recommendation                       | Rationale                                     |
| ---------------------- | ------------------------------------ | --------------------------------------------- |
| Price data             | Keep yfinance                        | Free, sufficient for non-trading app          |
| Filing structured data | SEC EDGAR XBRL API                   | Free, official, no PDF parsing needed         |
| Filing narrative text  | SEC EDGAR full-text (MD&A only)      | Only need 2000 chars for AI context           |
| News                   | NewsAPI now → SERP API at scale      | Start free ($0), scale to $50/mo              |
| Object storage         | Cloudflare R2                        | Free egress, S3-compatible, $0.015/GB         |
| Database               | Supabase PostgreSQL                  | Free dev tier, $25/mo prod, RLS for security  |
| Dev compute            | Hetzner VPS                          | €4.51/mo, 10x cheaper than EC2 equivalent     |
| Pipeline scheduler     | APScheduler in FastAPI               | Already in your stack, handles to 10K stocks  |
| AI model               | Gemma 3 27B                          | Perfect for unstructured reasoning + dialogue |
| AI summary caching     | PostgreSQL with context hash         | Avoid redundant expensive AI calls            |
| Document encryption    | AES-256-GCM, envelope pattern        | Per-file keys, master key never leaves server |
| Authentication         | JWT RS256 + HttpOnly refresh cookies | Industry standard, no XSS vulnerability       |
| Custom LLM             | Phase 4 only, post $10M ARR          | Gemma 3 27B is sufficient for years           |
| n8n / Airflow          | No — use APScheduler                 | Wrong tool, unnecessary complexity            |
| EC2 / GCP Compute      | Phase 3+ only                        | Overkill until 50K users                      |

---

## Part 11: What Makes This Different From Screener.in

| Feature                 | Screener.in | Paloor Equities                                 |
| ----------------------- | ----------- | ----------------------------------------------- |
| Financial data depth    | Excellent   | Equivalent (same EDGAR source)                  |
| Screener filters        | Excellent   | Equivalent + regime and event filters           |
| Price charts            | Basic       | Enhanced with Markov regime and Z-score events  |
| AI narrative on chart   | None        | Contextual 3-sentence summary per view          |
| AI deep analysis        | None        | 500-word investment note per company            |
| Personalization         | None        | Knows your portfolio, goals, and risk profile   |
| Portfolio fit analysis  | None        | "Here is how this stock changes your portfolio" |
| News sentiment          | None        | AI-scored headlines with trend over time        |
| Markov regime detection | None        | Bull/Bear/Neutral with daily probability        |
| Z-score event tagging   | None        | With associated news context                    |
| 10-K MD&A summary       | None        | AI summarized management narrative              |
| Asset vault integration | None        | Document context feeds AI analysis              |
| Community discussion    | None        | Group chat with AI participation (built)        |
| Mobile (future)         | Partial     | Responsive design foundation in place           |

**The fundamental thesis**: Screener.in is a data display tool. Paloor is an intelligence layer. The data is the same. The interpretation is ours.

---

## Part 12: Next Steps

Implementation begins in Session 019. The recommended build order:

```
Session 019: Data Foundation
  → backend/equities/edgar.py       (EDGAR XBRL fetcher and parser)
  → backend/equities/ratios.py      (ratio computation engine)
  → backend/equities/pipeline.py    (APScheduler jobs)
  → Seed database with S&P 500 company list and CIK mappings

Session 020: Company Page
  → backend/equities/router.py      (API endpoints for company data)
  → backend/equities/ai_analyst.py  (three prompt types, Gemma integration, caching)
  → frontend/app/dashboard/equities/[ticker]/page.tsx

Session 021: Screener
  → backend/equities/screener.py    (filter engine against ratio cache)
  → frontend/app/dashboard/equities/screener/page.tsx

Session 022: News and Sentiment
  → backend/equities/news.py        (NewsAPI integration, sentiment scoring)
  → Integrate into company page and AI context

Session 023: Cloud Migration and Deployment
  → Migrate from SQLite to Supabase PostgreSQL
  → Set up Cloudflare R2 for document storage
  → Deploy to Hetzner VPS
  → Go live at dev.paloor.com
```

---

_Session 018 is a planning document only. No code was written._
_Implementation begins in Session 019._
_Last updated: March 8, 2026_
