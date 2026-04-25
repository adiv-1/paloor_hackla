# Session 2 -- March 2, 2026

## Decision: Start with the Vault

After reviewing the full product journal and existing codebase, the Vault is the right
starting point. Rationale:

1. It is the data gravity well. Net worth, tax, AI advisor -- all need structured document data.
   Vault is the intake layer. Build it first and every downstream module has data to consume.
2. Least regulated feature. No brokerage licenses, no investment advice disclaimers.
   Document storage and intelligence can ship and charge immediately.
3. Demo-able to investors in 60 seconds. Upload a mortgage statement, see it parsed into
   structured fields, search across documents. Visceral and tangible.
4. India GTM wedge. Tax season plus document chaos equals high-intent user acquisition.

## What was built

### Backend (FastAPI)

Restructured from a flat two-file layout into a modular architecture:

```
backend/
  main.py           -- App entrypoint, router registration, CORS
  config.py         -- Centralized settings (Pydantic BaseSettings)
  vault/
    __init__.py
    router.py       -- REST endpoints: upload, list, get, search
    schemas.py      -- Pydantic models for documents
    service.py      -- Business logic: OCR pipeline (mock for now), storage
    mock_data.py    -- Pre-loaded fake documents for demo
  portfolio/
    __init__.py
    router.py       -- Efficient frontier endpoint (cleaned)
    service.py      -- PyPortfolioOpt logic (cleaned from analytics.py)
```

The Vault service layer is designed with a clear interface so that swapping in real OCR
(pytesseract, GPT-4V) and real storage (S3) later requires changing only service.py.

### Frontend (Next.js)

Restructured into a proper multi-page app with shared layout:

```
frontend/
  app/
    layout.tsx      -- Dark theme shell with sidebar navigation
    page.tsx        -- Dashboard home (overview cards)
    vault/
      page.tsx      -- Document upload + document list + search
    portfolio/
      page.tsx      -- Efficient frontier chart (cleaned)
  components/
    Sidebar.tsx     -- Navigation between modules
    EfficientFrontierChart.tsx -- Cleaned chart component
  lib/
    utils.ts        -- Unchanged (cn utility)
```

### Documentation

- PRODUCT_JOURNAL.md moved to docs/
- This session file (SESSION_002.md) created in docs/

## Decisions made

- Vault is Phase 1 priority feature.
- Backend uses modular folder-per-feature structure.
- Frontend uses Next.js App Router file-based routing.
- Mock data throughout -- no real OCR or storage yet. Architecture is ready for it.
- US-first context in the UI. Currency in USD. Document types reflect US (mortgage, 1099, etc).
- No auth yet. That is the next session.

## What we need to figure out together next

- Cloud storage: S3 bucket setup for document uploads.
- OCR infrastructure: pytesseract requires Tesseract system binary. Decide whether to
  run OCR in a Docker container or use a cloud OCR service (AWS Textract, Google Vision).
- Database: The docker-compose already has Postgres. Wire it up with SQLAlchemy models.
- Auth: Clerk is the recommendation for Next.js. Need to create an account and get API keys.

## Open items for next session

- [ ] Wire Postgres (SQLAlchemy models for users, documents, assets).
- [ ] Add auth (Clerk or equivalent).
- [ ] Real file upload (multipart form data to backend, store to local disk or S3).
- [ ] Real OCR pipeline (pytesseract or cloud service).
- [ ] Net Worth module (second feature to build).
- [ ] Deploy to a staging environment for investor demo.
