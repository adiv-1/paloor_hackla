# Paloor Frontend

Next.js frontend for the Paloor platform (user app + admin portal).

## Prerequisites

- Node.js 20+
- npm 10+
- Paloor backend running on `http://localhost:8000` (or set `NEXT_PUBLIC_API_URL`)

## Run Locally

From the `paloor_frontend` repo root:

```bash
npm install
npm run dev
```

Frontend will run at `http://localhost:3000`.

## Scripts

```bash
npm run dev      # Start local dev server
npm run build    # Production build
npm run start    # Start production server (after build)
npm run lint     # Run ESLint
```

## Frontend Architecture

This project uses the Next.js App Router with route-based organization.

### 1. Route Layer (`app/`)

- Public pages:
  - `/` landing page
  - `/login`
  - `/verify-email`
  - `/profile-setup`
- User app:
  - `/dashboard/*` (assets, chat, equities, portfolio, simulator, spending, account, learning)
- Admin app:
  - `/admin/login`
  - `/admin/dashboard/*` (overview, users, revenue, employees)

### 2. Shared UI Components (`components/`)

- Navigation and layout: `Sidebar.tsx`, `AdminSidebar.tsx`
- Feature widgets: `FinancialHealth.tsx`, `EfficientFrontierChart.tsx`, `TaskTracker.tsx`
- UX helpers: `Reveal.tsx`, `ThemeToggle.tsx`, `InfoPopover.tsx`, `AdminInfoPopover.tsx`

### 3. Client State + Auth (`lib/`)

- `lib/auth.tsx`: user auth context/provider + token/session helpers
- `lib/admin-auth.tsx`: admin auth context/provider + `adminFetch`
- `lib/utils.ts`: shared utility helpers

### 4. Styling + Tooling

- Global styles: `app/globals.css`
- Tailwind/PostCSS config: `postcss.config.mjs`
- TypeScript config: `tsconfig.json`
- Next.js config: `next.config.ts`

## API Configuration

The frontend defaults to `http://localhost:8000` for API calls.

Optional environment variable:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```
