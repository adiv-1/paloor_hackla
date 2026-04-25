# SESSION 005 — Authentication, Document Validation & Task System

**Date:** Current session
**Version:** v0.5.0

---

## Summary

Session 5 added a complete JWT authentication system (login, register, logout), wrong‑document detection on upload, and a Whoop‑style post‑onboarding task tracker on the dashboard. The platform now has real user management with admin/admin defaults and persistent registration.

---

## What Was Built

### 1. JWT Authentication System

**Backend (`backend/auth.py` + `backend/auth_router.py`)**

- `auth.py` — core module: bcrypt password hashing via passlib, JWT token creation/verification (HS256, 24‑hour expiry), in‑memory user store with `UserRecord` class
- `_seed_admin()` creates default **admin/admin** credentials on import
- `register(email, password, name)` — creates new users, rejects duplicates
- `authenticate(email, password)` — verifies credentials
- `create_token(user)` — issues JWT with sub + name claims
- `get_current_user(token)` — FastAPI dependency for route protection
- `auth_router.py` — `POST /api/auth/login` and `POST /api/auth/register` returning `{access_token, user}`

**Frontend (`frontend/lib/auth.tsx`)**

- `AuthProvider` React context wrapping the entire app
- `useAuth()` hook: `{user, token, loading, login, register, logout}`
- Token + user persisted in `localStorage` (`paloor_token`, `paloor_user`)
- Auto‑redirect: unauthenticated users on `/dashboard/*` routes → `/login`

**Login Page Rewrite (`frontend/app/login/page.tsx`)**

- Toggle between **Sign In** and **Sign Up** tabs
- Real form validation with error display (red banner)
- **Demo Mode** button (one‑click login as admin/admin)
- Calls `useAuth().login()` / `useAuth().register()` → redirects to `/dashboard`

**Sidebar Logout (`frontend/components/Sidebar.tsx`)**

- LogOut icon + user name display at bottom of sidebar
- Calls `useAuth().logout()` → clears token → redirects to `/login`
- Version updated to **v0.5.0**

### 2. Wrong Document Detection

**Backend (`backend/assets/ocr.py`)**

- `DOC_KEYWORDS` — keyword sets for 14 document types (drivers_license through hoa_agreement)
- `DOC_LABELS` — human‑readable names for each type
- `validate_document(doc_key, raw_text)` — scores all doc types by keyword hits, returns warning if:
  - No readable text found
  - Zero keyword matches for expected type (suggests best alternative)
  - Another type scores significantly higher than expected

**Integration**

- `UploadResult` schema gained optional `warning` field
- Both `upload_asset_document()` and `upload_account_document()` in service.py call `validate_document()` before returning
- Frontend vehicles page and account page show **amber warning banner** with dismiss button when a wrong‑document warning is returned

### 3. Post‑Onboarding Task System (`frontend/components/TaskTracker.tsx`)

Whoop‑style engagement system on the dashboard:

- **6 onboarding tasks**: Upload DL, Passport, SSN Card, Gov ID; Add first vehicle; Explore portfolio
- Tasks auto‑complete by checking real API data (account docs status, vehicle count)
- **"Don't have it"** dismiss button (eye‑off icon) per task — persisted in `localStorage`
- Progress bar with completion fraction (e.g., 2/6)
- Engagement messages that evolve with progress:
  - 0: "Let's get started..."
  - 1: "Great start!..."
  - 3: "You're building a solid foundation..."
  - 5: "Almost there..."
- Trophy icon when all tasks are complete
- Integrated into dashboard page above the module cards

---

## Dependencies Added

| Package                   | Version | Purpose                   |
| ------------------------- | ------- | ------------------------- |
| python‑jose[cryptography] | latest  | JWT encode/decode         |
| passlib[bcrypt]           | latest  | Password hashing          |
| bcrypt                    | 4.0.1   | Pinned for passlib compat |

---

## Files Created / Modified

| File                                              | Action                                                       |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `backend/auth.py`                                 | Created — JWT auth module                                    |
| `backend/auth_router.py`                          | Created — login/register endpoints                           |
| `backend/main.py`                                 | Modified — v0.5.0, registered auth_router                    |
| `backend/requirements.txt`                        | Modified — added jose, passlib, bcrypt                       |
| `backend/assets/ocr.py`                           | Modified — added validate_document, DOC_KEYWORDS, DOC_LABELS |
| `backend/assets/schemas.py`                       | Modified — UploadResult.warning field                        |
| `backend/assets/service.py`                       | Modified — calls validate_document in both upload functions  |
| `frontend/lib/auth.tsx`                           | Created — AuthProvider context                               |
| `frontend/app/layout.tsx`                         | Modified — wrapped with AuthProvider                         |
| `frontend/app/login/page.tsx`                     | Rewritten — real auth with sign‑in/sign‑up tabs              |
| `frontend/components/Sidebar.tsx`                 | Modified — logout button, v0.5.0                             |
| `frontend/components/TaskTracker.tsx`             | Created — Whoop‑style task system                            |
| `frontend/app/dashboard/page.tsx`                 | Modified — integrated TaskTracker                            |
| `frontend/app/dashboard/assets/vehicles/page.tsx` | Modified — upload warning banner                             |
| `frontend/app/dashboard/account/page.tsx`         | Modified — upload warning banner                             |
| `SESSION_004.md`                                  | Created                                                      |
| `SESSION_005.md`                                  | Created                                                      |

---

## Architecture Notes

- Auth is currently **in‑memory** (users stored in a Python dict). Registration works across the session but resets on backend restart. Admin/admin is always re‑seeded.
- Auth tokens are **not yet required** on asset/document routes — `get_current_user` dependency exists but is not wired as a route guard on those endpoints yet. This is intentional for development velocity.
- Task tracker uses **localStorage** for dismissals and **live API calls** for completion checks.
- Document validation uses keyword‑frequency heuristics, not ML — lightweight and fast.

---

## Next Steps (Session 6+)

- Wire `get_current_user` dependency onto all protected routes
- Persist users to PostgreSQL instead of in‑memory dict
- Production storage (S3 or equivalent for file uploads)
- Cloud deployment (user has a domain purchased)
- Property asset class page (similar to vehicles)
- More asset classes (investments, crypto, etc.)
