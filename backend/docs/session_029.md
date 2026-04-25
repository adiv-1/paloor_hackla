# SESSION 029 — Admin System Consolidation

**Date:** March 22, 2026  
**Goal:** Merge the separate admin backend and admin frontend into the single main backend and frontend so everything runs on one port pair (8000 / 3000).

---

## Background

The admin system was originally built as two entirely separate services:

| Service | Port | Tech |
|---|---|---|
| `admin-backend/` | 8001 | FastAPI + SQLite (admin.db) |
| `admin-frontend/` | 3001 | Next.js 16 |

This meant three deployments (main backend, admin backend, main frontend + admin frontend), separate Docker builds, and separate processes to manage locally. After building out the full admin feature set, we decided to consolidate into a single backend and single frontend to simplify deployment.

---

## What Was Done

### Backend Merge (`backend/`)

Three new files were created inside the main FastAPI backend:

**`backend/admin_auth.py`**  
Handles all admin authentication and data layer:
- `init_admin_db()` — creates `admin.db` with `admin_users`, `crm_notes`, `revenue_entries` tables and seeds `admin@paloor.com` / `admin` as the super admin on first run
- `authenticate_admin()`, `create_admin_token()`, `get_current_admin()`, `require_super_admin()` — JWT auth using PyJWT with a separate `ADMIN_JWT_SECRET` (completely isolated from user auth)
- CRUD functions for CRM notes, revenue/cost entries, and employee (admin user) management

**`backend/admin_users.py`**  
Read-only access to the main app's SQLite databases for admin dashboard views:
- Reads from `users.db`, `chat.db`, `memory.db`, `accounts.db`
- Functions: `list_all_users()`, `get_user_detail()`, `get_platform_analytics()`, `get_signup_timeline()`, `get_user_conversations()`, `get_user_memories()`, etc.

**`backend/admin_router.py`**  
All 21 admin API endpoints registered under `/api/admin`:
- `POST /api/admin/login` — admin sign-in, returns JWT
- `GET /api/admin/me` — current admin info
- `GET /api/admin/analytics` — platform-wide stats (users, conversations, AUM, memories)
- `GET /api/admin/users` — full user list
- `GET /api/admin/users/{user_id}` — user detail with conversations, memories, linked accounts
- `GET /api/admin/revenue`, `POST /api/admin/revenue` — revenue/cost entries
- `GET /api/admin/revenue/summary` — P&L summary with monthly breakdown and category breakdown
- `GET /api/admin/crm/{user_id}`, `POST`, `DELETE` — CRM notes per user
- `GET /api/admin/employees`, `POST /api/admin/employees` — team management
- `DELETE /api/admin/employees/{id}` — deactivate an employee

**`backend/main.py`** was updated to:
- Import and register `admin_api_router`
- Call `init_admin_db()` on startup alongside other DB initializers

**`backend/requirements.txt`** had `pyjwt>=2.8.0` added (admin auth uses PyJWT; user auth uses python-jose — they remain independent).

**`backend/admin.db`** was copied from `admin-backend/admin.db` to preserve existing admin accounts.

---

### Frontend Merge (`frontend/`)

New files created under `frontend/app/admin/` and `frontend/components/`:

**Auth & Shared Components**
- `frontend/lib/admin-auth.tsx` — `AdminAuthProvider` context + `useAdminAuth()` hook + `adminFetch()` helper, all pointed at `http://localhost:8000` (same backend)
- `frontend/components/AdminSidebar.tsx` — sidebar navigation with links to `/admin/dashboard`, `/admin/dashboard/users`, `/admin/dashboard/revenue`, `/admin/dashboard/employees`, plus a "Back to App" link to `/dashboard`
- `frontend/components/AdminInfoPopover.tsx` — info tooltip component reused across admin pages

**Route Structure**
```
frontend/app/admin/
├── layout.tsx              # Wraps all /admin/* in AdminAuthProvider
├── page.tsx                # Redirects → /admin/dashboard or /admin/login
├── login/
│   └── page.tsx            # Admin login form
└── dashboard/
    ├── layout.tsx          # Auth guard + AdminSidebar wrapper
    ├── page.tsx            # Main dashboard: KPI cards, charts, user map
    ├── users/
    │   └── page.tsx        # Users list + CRM panel
    ├── revenue/
    │   └── page.tsx        # Revenue/cost entries, bar chart, pie chart
    └── employees/
        └── page.tsx        # Team management (create/deactivate admins)
```

**`frontend/app/login/page.tsx`** was updated to add a subtle "Paloor staff? Admin portal →" link at the bottom.

---

### Cleanup

- The `admin-backend/` directory was deleted entirely
- The `admin-frontend/` directory was deleted entirely
- Any processes on ports 8001 and 3001 were killed

---

## Architecture After Consolidation

```
Single backend:   backend/   → port 8000
  /api/*          — user routes (auth, assets, chat, equities, portfolio, etc.)
  /api/admin/*    — admin routes (21 endpoints)

Single frontend:  frontend/  → port 3000
  /dashboard/*    — user app
  /admin/*        — admin portal (separate auth, separate layout)
```

Admin authentication is intentionally kept completely separate from user authentication:
- Different JWT secret (`ADMIN_JWT_SECRET` vs `JWT_SECRET`)
- Different token expiry (24h admin vs 7d user)
- Different library (PyJWT for admin, python-jose for users)
- Admin tokens cannot access user routes and vice versa

---

## How to Access

1. Go to `http://localhost:3000/login`
2. Click **"Paloor staff? Admin portal →"** at the bottom
3. Sign in with `admin@paloor.com` / `admin` (or any created employee account)

Or navigate directly to `http://localhost:3000/admin/login`.
