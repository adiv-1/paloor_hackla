# PALOOR — Product Journal & Strategic Canvas

> **Living Document** | Started: March 2, 2026
> Use this file as a running journal. Each session gets a dated entry. Ideas, pivots, decisions, and architecture notes all live here.

---

## Vision

**Make institutional-grade wealth management accessible to every individual investor.**

The intersection of AI, quantitative finance, and intuitive UX. A platform so powerful that a Wall Street quant and a first-time investor both extract enormous value from it — but through entirely different lenses.

**Tagline (working):** _Your wealth. Institutionalized._

---

## Mission

Give individuals the same financial infrastructure that hedge funds, family offices, and wealth management firms pay millions for — delivered through a consumer-grade experience with zero intimidation.

---

## Market Strategy

### Phase 1 — US Launch (PMF Search)

- Build for the US market first. Tighter regulation, but larger early-adopter base of financially literate users who will give honest product feedback.
- Validate core loops: net worth tracking → portfolio optimization → advisor marketplace → robo-advisory.
- No real trading yet (brokerage integrations TBD). Focus on analytics, insights, and vault.

### Phase 2 — India (Concurrent Development)

- India has a massive, underserved retail investor class post-Zerodha/Groww era. They know _how_ to invest but not _what_ to do strategically.
- Tax filing is a severe pain point (ITR complexity, capital gains tracking) — Vault becomes a killer feature here.
- Regulatory path: SEBI RIA registration or partner with a registered advisor.
- Smallcase-style thematic portfolios are already proven in India — build our own layer on top.

### Target User

- **Primary (US):** High-income professional, 28–45, has 401k + brokerage + real estate + crypto. Currently using Mint/Fidelity/Wealthfront but getting fragmented insights.
- **Primary (India):** Urban professional, 25–40, has MF + direct stocks + PPF + property. Uses Zerodha/Groww but has no unified view.
- **Secondary:** Family offices wanting a white-label version (B2B).

---

## Product Pillars

### 1. VAULT

_The document intelligence layer._

**Problem:** Property deeds, car loans, insurance policies, investment statements — scattered across email, physical folders, bank portals. Inaccessible, unsearchable, non-queryable.

**Solution:**

- Secure document upload (PDF, images, scanned docs).
- OCR pipeline: `pytesseract` → structured JSON extraction.
- Document categorization: Property, Vehicle, Insurance, Investment, Tax, Legal.
- AI-powered document Q&A: "What is my property tax assessment value?" → answer pulled from uploaded deed.
- Permission sharing: share a specific document (or redacted version) with a financial advisor, CA, or lawyer.
- US: property records, mortgage docs, auto loans, investment statements.
- India: property registration docs, Form 16, ITR, mutual fund statements, insurance policy docs.

**MVP Scope:**

- Upload + OCR + JSON extraction.
- Basic document list/search UI.
- No sharing yet (Phase 2).
- Use fake/mock documents initially to demo to investors.

**Privacy Architecture (planned, not MVP):**

- Client-side encryption before upload.
- Zero-knowledge storage (server never sees plaintext).
- Audit log of every access.

---

### 2. NET WORTH DASHBOARD

_The financial truth mirror._

**Problem:** No single view of total wealth across liquid assets, illiquid assets, liabilities, and investments.

**Solution:**

- **Current Assets:** Cash, brokerage accounts (Plaid integration for US, Zerodha API for India), crypto.
- **Fixed Assets:** Real estate (manual entry + auto-valuation via Zillow/Propval APIs), vehicles (KBB/Carwow API), jewelry, business equity.
- **Liabilities:** Mortgage, auto loans, student debt, credit cards.
- **Net Worth = Assets - Liabilities**, tracked over time with a sparkline history.
- AI narrative: "Your net worth grew 12% YoY. The primary driver was home equity appreciation (+18%). Your liquid ratio is low — consider rebalancing."

**India specifics:**

- Track EPF/PPF balance.
- NPS corpus.
- Fixed Deposits, Recurring Deposits.
- Gold holdings (very culturally significant).

---

### 3. PORTFOLIO ANALYTICS ⚛️

_Efficient frontier for everyone (already in MVP)._

**Current state:** Backend produces Monte Carlo cloud + max Sharpe point using PyPortfolioOpt on mock Indian equity data.

**Roadmap:**

- Connect to real positions (Plaid, Zerodha, CDSL).
- Min volatility, max return, target return portfolios.
- Factor exposure (Fama-French 5-factor for US, custom Indian factor model).
- Correlation matrix visualization.
- Drawdown analysis, rolling Sharpe.
- Rebalancing recommendations tied to actual portfolio weights.
- Beginner mode: replace jargon with plain language. "Efficient frontier" → "The sweet spot zone — portfolios with the best bang for their risk."

---

### 4. AI ADVISOR ENGINE 🤖

_The brain._

**Goal:** Vise-level personalization (Vise targets RIAs, we target consumers directly).

**Capabilities:**

- Natural language portfolio Q&A: "Should I add bonds given I'm buying a house in 2 years?"
- Dynamic rebalancing alerts based on life events, market regimes, risk tolerance shifts.
- Scenario modeling: "What happens to my net worth if the market drops 30%?"
- Tax-loss harvesting suggestions.
- Goal-based planning: retirement, house purchase, child's education.

**Architecture (planned):**

- LLM layer (GPT-4o or Claude) with grounding on user's actual financial data.
- RAG over Vault documents + portfolio data.
- Guardrails: not licensed investment advice — framed as insights and education.

---

### 5. REGIME DETECTION ENGINE 📈

_The Markov switching feature (from CBRE IM experience)._

**Concept:** Markets move in regimes (bull, bear, sideways, high-volatility crisis). Detecting regime transitions _before_ they fully materialize is the edge. Classic Markov Switching Model (Hamilton 1989) extended with:

- Input features: price momentum, VIX term structure, credit spreads, macro indicators.
- Sentiment layer: NLP on earnings calls, Fed minutes, news flow.
- Output: Probability distribution over current regime + P(transition) over next 30/60/90 days.
- Visualization: regime timeline showing historical episodes that "look like now."

**Why this is a moat:**

- This is quant PM-level tooling. Wealthfront/Betterment don't have this.
- Gives individuals a reason to pay a premium tier.
- Sellable as B2B API to RIAs, hedge funds, family offices.

**Implementation stack (planned):**

- `statsmodels` MarkovRegression for baseline.
- Kalman filter for regime smoothing.
- Transformer-based market sentiment encoder (FinBERT fine-tuned).
- Backtest engine to validate regime calls historically.

---

### 6. FINANCIAL ADVISOR MARKETPLACE 🤝

_The human layer._

- Two-sided marketplace: investors seeking advice ↔ vetted CFPs/RIAs/CAs.
- Paloor vets advisors (license check, reviews, AUM history).
- Advisors get a dashboard to view client's Paloor data (with explicit permission).
- Revenue: take rate on advisor-client sessions (% of advisory fee or flat platform fee).
- India: tie up with SEBI-registered RIAs.
- US: tie up with CFPs, fee-only RIAs (NAPFA network).

---

### 7. ROBO-ADVISOR / TRADING BOT 🤖💰

_Think Wealthfront, but smarter._

- Automated portfolio management for users who don't want to be hands-on.
- Daily rebalancing, tax-loss harvesting, dividend reinvestment.
- High-yield cash sweep account.
- Thematic portfolios (US: think ARK-style; India: think Smallcase).
- Regime-aware allocation: dynamically shift equity/bond/cash mix based on regime signals.
- Revenue: AUM fee (0.25%–0.50% annually) — this is the primary long-term revenue driver.
- Requires: broker-dealer registration (US), SEBI RIA + PMS license (India). **This is Phase 3 territory.**

---

### 8. TAX INTELLIGENCE 🧾

_Biggest India pain point._

- Capital gains tracker: auto-compute STCG/LTCG from transaction history.
- Form 16 parser (Vault OCR) → pre-fill ITR-relevant fields.
- US: 1099 parsing, wash sale rule tracking.
- Integration with ClearTax (India) or TurboTax (US) for final filing.
- Tax optimization: "Harvesting ₹45,000 in losses this month reduces your STCG liability by ₹6,750."
- India GST compliance for business owners (B2B extension).

---

### 9. EDUCATION PLATFORM 📚

_Financial literacy as a growth loop._

- Short-form modules: concepts explained in <5 minutes.
- Tied to user's actual portfolio: "You have 40% in small-cap. Here's what that means for your risk."
- Certifications: "Paloor Certified Investor" — gamified, shareable on LinkedIn.
- Revenue: premium tier unlock, corporate B2B training packages.

---

### 10. REAL ESTATE MODULE 🏠

_Long-term moonshot._

- Property valuation tracking (Zillow/Propval API integration).
- Rental yield analysis.
- Mortgage optimizer: "Refinancing now saves ₹4.2L over 10 years."
- Deal analyzer: evaluate a new property purchase in context of total net worth.
- India: Track circle rates, stamp duty implications.
- Aspirational: become a real estate transaction layer (marketplace + mortgage origination).

---

## Revenue Model

| Stream              | Model                                                          | Phase |
| ------------------- | -------------------------------------------------------------- | ----- |
| Freemium SaaS       | Free tier (basic NW tracking) + Pro ($15/mo US, ₹499/mo India) | 1     |
| AUM Fee (Robo)      | 0.25–0.50% of managed assets annually                          | 3     |
| Advisor Marketplace | 10–20% take rate on advisory sessions                          | 2     |
| Regime Engine API   | B2B API licensing to RIAs/funds                                | 2–3   |
| Tax Filing          | Per-filing fee or bundled in Pro                               | 2     |
| Education           | Premium modules, certifications                                | 2     |
| White-label B2B     | Enterprise license for banks/NBFCs                             | 3     |

---

## Technical Architecture (Current + Planned)

### Current Stack

```
Backend:  FastAPI (Python) + PyPortfolioOpt + pandas/numpy
Frontend: Next.js 15 + TypeScript + TailwindCSS + Recharts
Infra:    Local dev / Docker Compose
DB:       PostgreSQL (planned, not yet wired)
```

### Planned Additions

```
Auth:        Clerk or Auth0 (JWT, OAuth for brokerage connections)
Database:    PostgreSQL (primary) + Redis (caching/sessions)
Document Storage: S3 (encrypted) + pgvector for semantic search on docs
OCR Pipeline:    pytesseract + OpenCV + GPT-4V for structured extraction
ML/Quant:    statsmodels, scikit-learn, FinBERT, PyPortfolioOpt
Brokerage:   Plaid (US) + Zerodha Kite API (India)
Infra:       AWS (ECS Fargate + RDS + S3) or Render for MVP
Monitoring:  Sentry + Posthog (product analytics)
```

### Module Map

```
paloor/
├── backend/
│   ├── main.py              ← FastAPI app + CORS
│   ├── analytics.py         ← Efficient frontier (MVP)
│   ├── vault/               ← [PLANNED] OCR + document parsing
│   ├── networth/            ← [PLANNED] Asset aggregation
│   ├── portfolio/           ← [PLANNED] Extended analytics + regime
│   ├── tax/                 ← [PLANNED] Capital gains + tax logic
│   └── ai/                  ← [PLANNED] LLM advisor layer
├── frontend/
│   ├── app/
│   │   └── page.tsx         ← Main dashboard (risk tab working)
│   ├── components/
│   │   └── EfficientFrontierChart.tsx ← Live chart from backend
│   └── lib/
└── PRODUCT_JOURNAL.md       ← This file
```

---

## Competitive Landscape

| Company          | What they do                     | Our edge                                   |
| ---------------- | -------------------------------- | ------------------------------------------ |
| Wealthfront      | Robo-advisory, US only           | We add regime detection, vault, India      |
| Betterment       | Robo-advisory                    | Same as above + advisor marketplace        |
| Vise             | AI portfolios for RIAs (B2B)     | We go direct to consumer                   |
| Personal Capital | NW tracking + advisors           | Full quant engine + AI + vault             |
| Zerodha/Groww    | India trading                    | We're a layer above — analytics + planning |
| ClearTax         | India tax filing                 | We integrate tax into full wealth picture  |
| Smallcase        | India thematic baskets           | We build this + everything else            |
| CBRE IM tools    | Regime detection (institutional) | We democratize this for retail             |

---

## Open Questions / Decisions Pending

- [ ] Entity structure: US C-Corp (Delaware) + India subsidiary? Or India-first + US FBAR compliance?
- [ ] Auth provider: Clerk vs Auth0 vs custom?
- [ ] MVP brokerage connection: Plaid mock sandbox first?
- [ ] OCR: pytesseract only or also GPT-4V for complex documents?
- [ ] LLM: GPT-4o API or local Llama for cost control?
- [ ] When to bring on a co-founder with finance/compliance background?
- [ ] Advisor marketplace — build vs. partner (white-label Calendly + Stripe Connect)?
- [ ] India regulatory path — SEBI RIA registration timeline and cost?

---

## Journal Entries

---

### Session 1 — March 2, 2026

**Starting point:** Existing MVP had a working Efficient Frontier chart (FastAPI backend + Next.js frontend) with mock Indian equity data (NIFTY, GOLDBEES, RELIANCE, INFY).

**Discussion summary:**

- Decided to pivot from India-only to US-first then India concurrently.
- Product is now a full personal wealth management platform, not just portfolio analytics.
- Core pillars established: Vault, Net Worth Dashboard, Portfolio Analytics, AI Advisor, Regime Detection, Advisor Marketplace, Robo-advisor, Tax, Education, Real Estate.
- Regime detection (Markov Switching + market sentiment ML) identified as a key technical moat, based on prior work at CBRE IM.
- Privacy-first is a core principle but deferred to post-MVP for security implementation.
- MVP strategy: fake/mock data to demonstrate the concept to investors. Build security layer post-funding or post-PMF validation.
- Decided on this journal file as the primary running record of product thinking.

**Decisions made:**

- Build US version first for PMF validation.
- Vault is a critical differentiator — start OCR pipeline early.
- Regime detection is monetizable as both consumer premium and B2B API.

**Next steps:**

- [ ] Scaffold backend module structure (vault/, networth/, portfolio/, tax/, ai/).
- [ ] Define database schema v1 (users, assets, documents, portfolio_snapshots).
- [ ] Set up auth (Clerk recommended for Next.js).
- [ ] Build Vault MVP: file upload → pytesseract OCR → structured JSON → display.
- [ ] Wire real Net Worth model to frontend (replace hardcoded ₹2.45Cr).
- [ ] Prototype Markov Switching regime detection module.
- [ ] Update frontend to reflect US-first context while keeping India capability.

---

_Add new sessions below as you continue. Format: `### Session N — [Date]`_

---

## Notes & Raw Ideas Parking Lot

> Dump anything here that doesn't fit neatly above yet.

- "The B2C and B2B world will come together with the power of AI" — this should be a core tagline or investor narrative.
- Smallcase for the US market: thematic baskets (e.g., "AI Infrastructure", "Reshoring America") — could partner with existing basket providers or build our own curation engine.
- Real estate juggernaut long-term: if we have everyone's net worth and property docs, we become the trust layer for RE transactions. Massive category to own.
- India tax: the Vault + tax combo is potentially the India go-to-market wedge. Everyone needs to file ITR. If we make that painless and auto-populate it from their documents, that's a high-intent acquisition funnel.
- Think about "financial health score" — one number (like a credit score) that summarizes where someone stands, updated daily, with a clear path to improve it.
