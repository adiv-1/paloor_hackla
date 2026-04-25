# SESSION_012 — Landing Site, Assets Restructure, Profile & Risk Assessment

**Date:** March 4, 2026  
**Version:** v0.10.0  
**Focus:** Complete landing page rebuild, 7-category asset structure, enhanced profile with preferences, and personality-based risk assessment.

---

## Changes This Session

| File                                      | Action    | Description                                                                                                        |
| ----------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| `frontend/app/page.tsx`                   | Rewritten | Multi-section marketing site — 3 customer profiles, 4 pillars, mission, platform overview, features grid           |
| `frontend/app/dashboard/assets/page.tsx`  | Rewritten | 7-category asset structure (Real, Financial, Employment, Insurance, Legal, Business, Debt) + identity docs section |
| `frontend/app/dashboard/account/page.tsx` | Rewritten | 4-tab account page — Profile, Documents, Preferences, Risk Assessment with 10-question personality quiz            |
| `docs/SESSION_012.md`                     | Created   | This document                                                                                                      |

---

## Landing Page — What Changed

### Old

Simple one-pager: "Organize your wealth with clarity" + 3 features + 3 steps + CTA. No explanation of who the product is for, what makes it different, or why it exists.

### New

Full marketing site with navigation and 6 sections:

1. **Hero** — "Finance shouldn't be gatekept." — Institutional-grade wealth management for everyone.
2. **Who It's For** — Three customer profiles with distinct value propositions:
   - **Absolute Beginners** — Start from "What is money?" — learning paths, simulator, plain language
   - **Working Professionals** — Already have accounts, need unified tracking — portfolio analytics, document vault, spending intelligence
   - **Investment Professionals** — Want institutional tools — Markov regimes, efficient frontier, self-hosted AI
3. **How It Works** — Learn → Practice → Track → Manage sequence (from the moat analysis in SESSION_011)
4. **Platform Overview** — 6 asset categories with examples
5. **Our Mission** — 4 principles: finance isn't zero-sum, education is the foundation, data ownership, no dark patterns
6. **Features Grid** — 9 features across education, simulation, analytics, AI

### Design Decisions

- Navigation links to anchor sections (`#who`, `#how`, `#mission`, `#assets`)
- Uses Reveal component for scroll-in animations
- Every section has a monospace category label for hierarchy
- Customer profile cards have colored accent icons matching tier
- CTA emphasizes "Free education. Free simulator. Free tracking. Premium AI when you're ready."

---

## Assets Page — Complete Restructure

### Old

Simple 2-column grid pulling `asset-classes` from backend API — only had Vehicles and Real Estate.

### New: 7 Categories, 43 Asset Types

| Category                         | Types | Examples                                                                                  |
| -------------------------------- | ----- | ----------------------------------------------------------------------------------------- |
| **1. Real Assets**               | 7     | Primary home, rental property, land, vehicles, jewelry/art, collectibles, precious metals |
| **2. Financial Assets**          | 10    | Checking, savings, brokerage, 401(k), IRA, pension, private investments, crypto, 529, HSA |
| **3. Employment & Compensation** | 5     | RSUs, stock options, ESPP, deferred compensation, employment contracts                    |
| **4. Insurance Policies**        | 6     | Life, health, disability, auto, home/renters, umbrella liability                          |
| **5. Legal & Estate**            | 6     | Will, trusts, POA, healthcare directive, beneficiary designations, business ownership     |
| **6. Business Interests**        | 4     | LLC/corp formation, operating agreements, cap tables, partnership agreements              |
| **7. Debt Obligations**          | 5     | Mortgage, student loans, auto loans, personal loans, credit lines                         |

### Identity Documents Section

At the top of Assets, there's an expandable identity card showing the user's profile photo + name with 6 identity document types:

- Passport
- Driver's License
- Government Photo ID
- Social Security Card
- Birth Certificate
- Marriage Certificate

Each has an Upload button. Links to Account Settings for full profile management.

### Design

- Accordion-style categories — one expanded at a time
- Each category has a color-coded icon (emerald, blue, violet, amber, rose, cyan, red)
- Asset items show descriptions of what documents/data each type tracks
- "Add item" button per category for future functionality
- Summary footer: "43 asset types across 7 categories · 6 identity document types"

---

## Account Page — Enhanced

### Old

Single page with profile card + document list.

### New: 4-Tab Layout

#### Tab 1: Profile

Same profile card with photo, basic info (age, gender, state, occupation, income, net worth, risk tolerance, dependents), financial goals. Edit mode with inline form.

#### Tab 2: Documents

Personal document upload/management — same as before (OCR extraction, preview, edit fields).

#### Tab 3: Preferences (NEW)

Four preference categories:

- **Notifications** — Weekly portfolio summary, alert notifications, learning reminders, market regime changes (toggle switches)
- **Display** — Currency (USD/EUR/GBP/INR), date format, number format (dropdowns)
- **AI Preferences** — Communication style, proactive suggestions frequency, risk warning level (dropdowns)
- **Privacy & Data** — Anonymized data sharing, AI model training, third-party integrations (toggle switches)

#### Tab 4: Risk Assessment (NEW)

Full personality-based assessment — see below.

---

## Risk Assessment — The Personality Test

### Philosophy

This is NOT a finance quiz. It's a personality assessment that happens to be about money. The questions are designed to reveal:

1. **How you emotionally react to loss** (not what you think you should do)
2. **Your actual time horizon** (how patient you really are)
3. **Your honest knowledge level** (so we calibrate, not condescend)
4. **Life context** (income stability affects real risk capacity)
5. **Primary motivation** (emergency fund vs. wealth growth vs. retirement)
6. **Decision-making style** (researcher vs. delegator)
7. **Volatility tolerance** (concrete tradeoffs, not abstract "risk")
8. **Planning areas** (what features to activate)
9. **AI communication preference** (simple vs. technical)
10. **Relationship with money** (anxious vs. excited)

### Questions

| #   | Category           | Question                               | Options                                                                                    |
| --- | ------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Risk Personality   | Portfolio drops 20%. What do you do?   | Sell all / Sell some / Hold / Buy more                                                     |
| 2   | Planning Timeline  | When will you need this money?         | <1yr / 1-5yr / 5-10yr / 10+yr                                                              |
| 3   | Financial Literacy | How would you describe your knowledge? | Just starting / Basics / Fairly knowledgeable / Very knowledgeable                         |
| 4   | Life Context       | How stable is your income?             | Very stable / Stable / Variable / Uncertain                                                |
| 5   | Goals              | #1 financial priority?                 | Emergency fund / Debt payoff / Grow wealth / Preserve wealth / Retirement / Major purchase |
| 6   | Personality        | How do you make big decisions?         | Deep research / Trust instinct / Ask experts / Delegate                                    |
| 7   | Risk Personality   | Which portfolio would you choose?      | +4%/-5% / +7%/-15% / +10%/-30% / +14%/-45%                                                 |
| 8   | Goals              | What areas do you want help with?      | Investing / Budgeting / Tax / Estate / Insurance / Retirement (multi-select)               |
| 9   | Personality        | How should AI communicate?             | Simple / Explain reasoning / Full technical / Just bottom line                             |
| 10  | Personality        | Relationship with money?               | Stresses me out / Careful / Just a tool / Enjoy managing it                                |

### How It Feeds the AI

The assessment produces a profile with 4 key outputs:

- **Risk Label** — Conservative / Moderate / Moderate-Aggressive / Aggressive (computed from Q1 + Q7)
- **Primary Goal** — Maps to feature prioritization
- **Knowledge Level** — Calibrates explanation depth
- **Money Relationship** — Adjusts emotional tone of communications

Future: These answers will be stored in the user record and fed as context to every AI prompt, making recommendations genuinely personalized.

### UX

- Start screen with description, time estimate, "no wrong answers" messaging
- One question at a time with progress bar
- Purple/violet accent color (distinct from rest of app)
- Radio selection with descriptions
- Previous/Next navigation
- Multi-select for planning areas question
- Results screen with 4-quadrant summary
- Retake button — "people change"

---

## Technical Notes

### Frontend Changes Only

All changes this session are frontend-only. No backend modifications. The Assets page is now fully client-side rendered with static category definitions rather than fetching from the backend API. This is intentional — the category structure is product-level information that doesn't need to be dynamic.

### State Management

- Assessment answers stored in component state (not persisted yet)
- Preferences stored in component state (not persisted yet)
- Future: Both need backend persistence endpoints

### Backend Work Needed (Future)

- `POST /api/assessment` — Save assessment answers
- `GET /api/assessment` — Retrieve assessment for returning users
- `PUT /api/preferences` — Save notification/display/AI/privacy preferences
- `GET /api/preferences` — Retrieve preferences
- Extend `UserRecord` in auth.py to store assessment_profile and preferences
- Feed assessment profile to all AI prompts as system context

---

## What's Next

- [ ] Backend persistence for assessment + preferences
- [ ] Connect assessment profile to AI prompt context
- [ ] Build individual asset item pages (create/edit/documents per item)
- [ ] Ambient AI integration (from SESSION_009)
- [ ] Real database (SQLAlchemy → Postgres)
- [ ] AWS deployment
- [ ] ETF Builder prototype
- [ ] Sim Task engine (directed simulator exercises from learning paths)
