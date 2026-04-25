# Session 3 -- March 2, 2026

## Decision: Shift to light-mode UI and build asset-class document system

We moved from a dark terminal-style UI to a professional, light-mode SaaS layout and prioritized an asset-class-based document management system. Vehicles are the first asset class implemented with expert-level checklist coverage.

## What was built

- Backend (`backend/`)
  - `assets/definitions.py` — Expert checklists: account-level docs and per-asset required/recommended lists (vehicles, property).
  - `assets/schemas.py` — Pydantic models for assets, checklist items, account documents, and upload results.
  - `assets/service.py` — Business logic, in-memory stores, mock OCR (1.5s delay) with realistic extraction templates.
  - `assets/router.py` — API endpoints: `/api/asset-classes`, `/api/assets`, `/api/account/documents`, `/api/documents/{id}/download`.
  - Integrated with existing `portfolio/` router (efficient frontier) and registered in `main.py`.

- Frontend (`frontend/`)
  - Public: professional landing page at `/` with scroll-reveal; login page at `/login` (demo mode).
  - Dashboard shell with sidebar: `/dashboard`.
  - Assets overview: `/dashboard/assets` lists asset classes.
  - Vehicles management: `/dashboard/assets/vehicles` — add vehicles, detailed checklist UI, upload (mock OCR), extracted-fields expansion, download button, account-level linking.
  - Account page: `/dashboard/account` — upload personal documents (DL, passport, government ID, SSN) which automatically link to asset checklists.
  - Portfolio page: `/dashboard/portfolio` — Efficient frontier chart updated for light mode.
  - Utilities: `Reveal.tsx` (scroll reveal), `Sidebar.tsx` (nav), `EfficientFrontierChart.tsx` (colors adjusted for light theme).

- Misc
  - `app/layout.tsx` cleaned (removed dark root and moved sidebar into dashboard layout).
  - `globals.css` duplicates removed and base rules deduplicated.
  - `README.md` updated with architecture, API table, and run instructions.

## Decisions made

- Store: in-memory stores for rapid iteration; persistence and DB to be added next.
- OCR: mock extraction (1.5s delay) with curated extraction templates; this enables UI/UX and integration testing while the real OCR pipeline is planned.
- Account-level docs: upload once and propagate as "linked" across asset checklists.
- UI: professional light-mode design, no emojis, minimal code comments, and clean output.

## Verification

- Backend started and served endpoints on `http://localhost:8000`.
- Created and inspected a vehicle asset via API and verified checklist states.
- Frontend built successfully; routes compiled and returned 200 during smoke checks on `http://localhost:3000`.

## Next steps

- Wire persistent storage (Postgres) and migrate in-memory stores to a simple ORM layer.
- Implement real OCR pipeline (options: Tesseract in Docker, AWS Textract, or Google Vision); design async processing + job queue.
- Add real file storage (S3 with presigned URLs) and server-side streaming downloads.
- Add auth (Clerk suggested) and per-account isolation.
- End-to-end tests for upload → OCR → checklist linking → download flows.

## Open items

- [ ] Persist data to Postgres and add migrations.
- [ ] Implement production OCR and remove mock delay.
- [ ] Add file storage (S3) and secure downloads.
- [ ] Add authentication and authorization.
- [ ] Add CI to run linters, tests, and type checks.

---

Notes: this session focuses on delivering a complete UX for asset-centered document intake (vehicles first) so we can iterate on downstream modules (AI advisor, tax, net worth) using structured documents.
