# SESSION 006 — Intelligence, Identity & Health

**Date:** July 2025
**Version:** v0.6.0

---

## What Changed

### 1. Gemini LLM OCR (replaces regex)

- Created `backend/assets/gemini_ocr.py` — sends document images/text to Gemini 2.0 Flash
- `DOC_SCHEMAS` defines expected fields per document type (14 types)
- Vision mode for images (base64), text mode for PDFs/text files
- Structured JSON prompts → validated response parsing → fallback extraction
- `service.py` now imports from `gemini_ocr` instead of `ocr`
- Old `ocr.py` kept on disk as reference but no longer imported

### 2. Environment & Security

- Created `backend/.env` with `GEMINI_API_KEY`, `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`, `JWT_SECRET_KEY`
- Updated `backend/config.py` to read all secrets from `.env` via pydantic-settings
- Updated `.gitignore` to exclude `.env` files
- `auth.py` now uses `settings.jwt_secret_key` instead of hardcoded secret

### 3. Document Deletion

- `service.delete_document(doc_id)` — removes from disk + in-memory store
- `DELETE /api/documents/{doc_id}` endpoint in `router.py`
- Trash2 delete buttons added to vehicles page and account page (with confirm dialog)

### 4. Email Verification

- `auth.py` now includes `send_verification_email()` using Gmail SMTP (SSL/465)
- 6-digit code generation, 15-minute expiry, stored in-memory
- `POST /api/auth/verify-email` and `POST /api/auth/resend-code` endpoints
- Registration auto-sends verification email
- Frontend: `/verify-email` page with 6-digit code input, paste support, resend button, skip option

### 5. User Profile Onboarding

- `UserRecord` expanded with: age, gender, occupation, annual_income, net_worth_estimate, financial_goals, risk_tolerance, dependents, state, profile_completed
- `ProfileUpdate` Pydantic model + `update_profile()` function
- `GET /api/auth/me` and `PUT /api/auth/profile` endpoints
- Frontend: `/profile-setup` — 4-step questionnaire:
  1. **About You** — age, gender, state
  2. **Career & Income** — occupation, income range
  3. **Financial Snapshot** — net worth estimate, dependents
  4. **Goals & Risk** — financial goals (multi-select), risk tolerance
- Progress bar, back/forward navigation, skip all button
- Login flow: register → verify email → profile setup → dashboard

### 6. Financial Health Dashboard

- Created `backend/health.py` — computes score (0-100) across 4 dimensions:
  - Documents (0-30): upload completeness
  - Diversification (0-25): asset class spread
  - Profile (0-20): profile field completion
  - Goals & Planning (0-25): goals set + risk defined
- Grade system: Excellent/Good/Fair/Needs Work/Getting Started
- `GET /api/health` endpoint (auth-protected) via `health_router.py`
- Frontend: `FinancialHealth.tsx` component — SVG ring score, stat grid, breakdown bars with progress, tips, actionable insights
- Dashboard now uses 2-column layout: tasks + nav cards (left), health widget (right)

### 7. Auth Flow Updates

- `auth.tsx` context expanded: `refreshUser()`, `setUser()`, extended User interface
- Login/register responses now include full user profile
- Login page redirects through: verify-email → profile-setup → dashboard (based on user state)
- Admin user seeded with `email_verified=true`, `profile_completed=true`

---

## Files Created

- `backend/.env`
- `backend/assets/gemini_ocr.py`
- `backend/health.py`
- `backend/health_router.py`
- `frontend/app/verify-email/page.tsx`
- `frontend/app/profile-setup/page.tsx`
- `frontend/components/FinancialHealth.tsx`
- `docs/SESSION_006.md`

## Files Modified

- `backend/auth.py` — full rewrite with profile, email verification, config-based secret
- `backend/auth_router.py` — 4 new endpoints (verify-email, resend-code, me, profile)
- `backend/main.py` — v0.6.0, added health_router
- `backend/config.py` — gemini/gmail/jwt settings from .env
- `backend/requirements.txt` — google-generativeai, python-dotenv
- `backend/assets/service.py` — gemini_ocr import, delete_document()
- `backend/assets/router.py` — DELETE endpoint
- `frontend/lib/auth.tsx` — expanded context with refreshUser, setUser, full User interface
- `frontend/app/login/page.tsx` — smart routing through verification/profile flow
- `frontend/app/dashboard/page.tsx` — 2-column layout with FinancialHealth widget
- `frontend/app/dashboard/assets/vehicles/page.tsx` — delete button
- `frontend/app/dashboard/account/page.tsx` — delete button
- `frontend/components/Sidebar.tsx` — v0.6.0
- `.gitignore` — .env exclusion

---

## Architecture

```
Registration Flow:
  Sign Up → Email Verification → Profile Setup → Dashboard

Financial Health Engine:
  Documents(30) + Diversification(25) + Profile(20) + Goals(25) = Score/100

OCR Pipeline:
  Upload → extract_text (pytesseract/utf-8) → Gemini 2.0 Flash → JSON fields → validate
```

## Version: v0.6.0
