# Session 028 — Admin Management System

**Date:** July 2025  
**Focus:** Full admin dashboard, CRM, revenue tracking, employee management  

---

## Overview

Built a complete, production-ready admin management system as a **separate application** running on its own ports — fully isolated from the user-facing platform.

- **Admin Backend:** FastAPI on `localhost:8001`
- **Admin Frontend:** Next.js on `localhost:3001`
- **Shared databases:** Reads main platform's SQLite databases (users.db, chat.db, memory.db, accounts.db) in **read-only** mode
- **Own database:** `admin.db` for admin-specific data (admin_users, crm_notes, revenue_entries)

---

## Architecture

```
admin-backend/           (FastAPI, port 8001)
├── config.py            — shared DB paths, JWT config, CORS
├── auth.py              — admin auth system, CRM CRUD, revenue CRUD
├── users.py             — read-only access to shared platform databases
├── router.py            — 20+ REST API endpoints
├── main.py              — FastAPI app entry point
└── requirements.txt     — Python dependencies

admin-frontend/          (Next.js, port 3001)
├── app/
│   ├── layout.tsx       — root layout (fonts, dark mode, auth provider)
│   ├── page.tsx         — redirect logic (→ dashboard or login)
│   ├── globals.css      — design tokens (same system as main frontend)
│   ├── login/page.tsx   — admin login form
│   └── dashboard/
│       ├── layout.tsx   — auth guard + sidebar layout
│       ├── page.tsx     — main analytics dashboard (KPIs, charts, map)
│       ├── users/page.tsx    — user management + CRM
│       ├── revenue/page.tsx  — revenue & cost tracking
│       └── employees/page.tsx — team management
├── components/
│   ├── AdminSidebar.tsx     — fixed sidebar with nav
│   └── AdminInfoPopover.tsx — info tooltips for admin
├── lib/
│   ├── auth.tsx         — AdminAuthProvider, JWT management, adminFetch
│   └── utils.ts         — cn() utility
└── package.json         — dependencies (port 3001)
```

---

## Auth System

- **Separate JWT auth** — HS256, 8-hour expiry, distinct `ADMIN_JWT_SECRET`
- **Two roles:**
  - `super_admin` — full access: analytics, users, CRM, revenue, employee management
  - `employee` — CRM access, read-only users, limited write
- **Default seed:** `admin@paloor.com` / `admin` (created on first startup)
- Passwords hashed with bcrypt via passlib

---

## API Endpoints (20+)

| Category | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| Auth | POST | `/api/admin/login` | Admin login |
| Auth | GET | `/api/admin/me` | Current admin info |
| Dashboard | GET | `/api/admin/analytics` | Platform-wide KPIs |
| Dashboard | GET | `/api/admin/analytics/signups` | Signup timeline |
| Dashboard | GET | `/api/admin/analytics/demographics` | User demographics |
| Dashboard | GET | `/api/admin/analytics/map` | User locations by state |
| Users | GET | `/api/admin/users` | List all users (enriched) |
| Users | GET | `/api/admin/users/{id}` | Full user detail |
| Users | GET | `/api/admin/users/{id}/conversations` | User's chats |
| Users | GET | `/api/admin/users/{id}/memories` | User's AI memories |
| Users | GET | `/api/admin/users/{id}/accounts` | Linked accounts |
| Users | GET | `/api/admin/users/{id}/context` | AI context summary |
| CRM | GET | `/api/admin/users/{id}/notes` | CRM notes for user |
| CRM | POST | `/api/admin/users/{id}/notes` | Add CRM note |
| CRM | DELETE | `/api/admin/notes/{note_id}` | Delete CRM note |
| Revenue | GET | `/api/admin/revenue` | All revenue/cost entries |
| Revenue | POST | `/api/admin/revenue` | Add entry |
| Revenue | GET | `/api/admin/revenue/summary` | Summary with monthly trends |
| Employees | GET | `/api/admin/employees` | List admin team |
| Employees | POST | `/api/admin/employees` | Create employee account |
| Employees | DELETE | `/api/admin/employees/{id}` | Deactivate employee |

---

## Frontend Pages

### 1. Login (`/login`)
- Clean login form with Shield branding
- Email/password with show/hide toggle
- "Authorized personnel only" footer
- JWT stored in localStorage

### 2. Dashboard (`/dashboard`)
- **4 KPI cards:** Total Users, Conversations, AI Memories, Total AUM
- **3 revenue metric cards:** Revenue, Costs, Net
- **Risk tolerance pie chart** (recharts)
- **Income distribution bar chart**
- **User dot map** — SVG with coordinate lookup for all 50 US states + DC
- **Age distribution bar chart**
- InfoPopovers on each card for context

### 3. Users & CRM (`/dashboard/users`)
- Searchable user table (name, email, state, income, balance, messages, memories)
- Click-to-open detail panel (side-by-side layout)
- Profile header with verification badges
- Quick stats: messages, memories, balance
- Full profile: age, state, occupation, gender, risk, dependents, financial goals
- Linked accounts with balances
- AI memory categories breakdown
- AI context summary (from main platform's context.py)
- CRM notes system: add/delete notes with types (general, follow-up, issue, opportunity)

### 4. Revenue & Costs (`/dashboard/revenue`)
- 3 summary cards: Total Revenue, Total Costs, Net
- Monthly trends bar chart (revenue vs costs)
- Category breakdown pie chart with legend
- Add entry form: type (revenue/cost), category, amount, date, description
- Full entries table with type badges, color-coded amounts

### 5. Team (`/dashboard/employees`)
- Employee cards with role badges (Super Admin / Employee)
- Active/deactivated status
- Create employee form (super_admin only): name, email, password, role
- Deactivate button (prevents self-deactivation)
- Join date display

---

## Design System

Same CSS variables as the main user-facing platform:
- **Light:** Warm parchment tones
- **Dark:** Warm charcoal tones  
- **Primary:** `#1a6b55` (teal/green)
- **Fonts:** DM Sans (body), Playfair Display (headings), Geist Mono (numbers)
- Dark mode toggle in sidebar

---

## Privacy Design

- Admin reads user databases **read-only** — no write access to user data
- Passwords are **never** exposed in admin views
- CRM notes are stored in **admin.db** only, not in user databases
- Admin auth is completely separate from user auth
- User financial details visible (needed for advisory) but not directly editable

---

## How to Run

```bash
# Terminal 1 — Admin Backend
cd admin-backend
pip install -r requirements.txt
uvicorn main:app --port 8001 --reload

# Terminal 2 — Admin Frontend
cd admin-frontend
npm install
npm run dev  # runs on port 3001
```

Default login: `admin@paloor.com` / `admin`

---

## Files Created

### admin-backend/ (6 files)
- `config.py` — shared DB paths, JWT config, CORS settings
- `auth.py` — admin auth, CRM notes, revenue entries (~230 lines)
- `users.py` — read-only platform data access (~250 lines)
- `router.py` — all REST endpoints (~250 lines)
- `main.py` — FastAPI app with CORS and startup init
- `requirements.txt` — Python dependencies

### admin-frontend/ (15+ files)
- Config: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `next-env.d.ts`
- Styles: `app/globals.css`
- Auth: `lib/auth.tsx`, `lib/utils.ts`
- Layout: `app/layout.tsx`, `app/page.tsx`, `app/login/page.tsx`
- Dashboard: `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`
- Pages: `app/dashboard/users/page.tsx`, `app/dashboard/revenue/page.tsx`, `app/dashboard/employees/page.tsx`
- Components: `components/AdminSidebar.tsx`, `components/AdminInfoPopover.tsx`

---

## Testing Results

- ✅ Admin backend starts on port 8001
- ✅ Health endpoint responds
- ✅ Login returns JWT token with admin info
- ✅ Analytics endpoint returns platform-wide KPIs (3 users, 11 conversations, 5 memories)
- ✅ Users list returns enriched user data with message counts
- ✅ User detail returns full profile, conversations, memory stats, CRM notes
- ✅ Admin frontend starts on port 3001
- ✅ All 5 pages compile without errors or warnings
- ✅ Login page renders (200)
- ✅ Dashboard page renders (200)
- ✅ Users page renders (200)
- ✅ Revenue page renders (200)
- ✅ Employees page renders (200)

---

## Next Steps

- Add email notifications for CRM follow-ups
- Audit log for admin actions
- Export user data to CSV
- Integration with Stripe for automated revenue tracking
- Role-based dashboard (different views for super_admin vs employee)
- User activity graphs (engagement over time)
