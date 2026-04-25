# Paloor

Personal wealth management platform. Institutional-grade tools for managing assets, documents, and portfolios.

## Architecture

```
backend/
  main.py              FastAPI entrypoint (v0.3.0)
  assets/
    definitions.py     Domain knowledge: document checklists per asset class
    schemas.py         Pydantic models for API contracts
    service.py         Business logic, in-memory storage, mock OCR processing
    router.py          REST endpoints (asset-classes, assets, account, documents)
  portfolio/
    router.py          Efficient frontier endpoint
    service.py         Mean-variance optimization via PyPortfolioOpt

frontend/
  app/
    page.tsx           Landing page (public)
    login/page.tsx     Sign-in page (public)
    dashboard/
      layout.tsx       App shell with sidebar
      page.tsx         Dashboard home
      assets/page.tsx  Asset class selection
      assets/vehicles/ Vehicle management with document checklist
      portfolio/       Efficient frontier chart
      account/         Personal documents (DL, passport, ID)
  components/
    Sidebar.tsx        Dashboard navigation
    Reveal.tsx         Scroll-reveal animation (IntersectionObserver)
    EfficientFrontierChart.tsx  Recharts scatter plot
```

## Key features

**Asset-class document management.** Each asset class (vehicles, real estate) has an expert-curated checklist of required and recommended documents. Upload triggers mock OCR extraction that returns structured fields.

**Account-level documents.** Personal documents (driver's license, passport) are uploaded once in Account settings and automatically linked across all asset checklists that reference them.

**Portfolio analytics.** Efficient frontier via Monte Carlo simulation (800 samples) using PyPortfolioOpt. Displays optimal Sharpe ratio portfolio weights.

## Run locally

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Runs on http://localhost:8000. Requires Python 3.9+.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on http://localhost:3000.

## API routes

| Method | Path                                 | Description                                           |
| ------ | ------------------------------------ | ----------------------------------------------------- |
| GET    | /api/asset-classes                   | List asset classes                                    |
| GET    | /api/asset-classes/{key}             | Asset class detail with checklist definition          |
| POST   | /api/assets                          | Create an asset                                       |
| GET    | /api/assets?asset_class=vehicles     | List assets, optionally filtered                      |
| GET    | /api/assets/{id}                     | Asset detail with checklist status + extracted fields |
| POST   | /api/assets/{id}/documents/{doc_key} | Upload document (mock OCR, 1.5s delay)                |
| GET    | /api/account/documents               | List account-level document statuses                  |
| POST   | /api/account/documents/{doc_key}     | Upload account document                               |
| GET    | /api/documents/{id}/download         | Download any uploaded document                        |
| GET    | /api/portfolio/frontier              | Efficient frontier data                               |

## Notes

- All data is in-memory. Restarting the backend clears state.
- OCR is mocked with a 1.5-second delay and pre-defined extraction templates.
- Auth is not implemented. Login page routes directly to the dashboard.
- Light mode UI. Professional, minimal design using shadcn/ui components.
