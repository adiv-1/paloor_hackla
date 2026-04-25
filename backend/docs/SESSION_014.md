# SESSION_014 — Full Assets Expansion & Generic Detail Page

**Date:** March 6, 2026  
**Version:** v0.11.0  
**Focus:** Expand assets from 2 backend classes to 46, add Education & Career category, build generic detail page, add 31 new Gemini extraction schemas.

---

## Motivation

Session 13 fixed the document infrastructure (Gemini API, OCR, persistence). Session 14 (prior) replaced all regex extraction with Gemini LLM structured output using Pydantic schemas. However, the assets section was still fundamentally incomplete:

- **Only 2 backend asset classes** existed (vehicles, property) despite the frontend showing **7 categories with 43+ items**.
- **Frontend items were decorative** — none of the items were clickable; they were `<div>` elements with no navigation.
- **Only vehicles had a detail page** — a hardcoded single-purpose page at `/dashboard/assets/vehicles/`.
- **No Education & Career section** — transcripts, W-2 forms, 401(k), Social Security, and other income/career documents were completely absent.
- **No `create_fields`** — there was no way to dynamically render an "Add new item" form per asset class.
- **Missing identity docs** — birth certificate and marriage certificate were not in the account documents list.

This session addressed all of the above, making every asset category a fully functional, uploadable section with expert-level document checklists.

---

## Changes This Session

| File                                              | Action                       | Description                                                          |
| ------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| `backend/assets/definitions.py`                   | Rewritten (202→647 lines)    | 46 asset classes with checklists, `create_fields`, `name_template`   |
| `backend/assets/gemini_ocr.py`                    | Extended (1563→1144 lines\*) | 31 new `DOC_SCHEMAS` (total 45), Pydantic extraction models          |
| `backend/assets/schemas.py`                       | Modified (82→87 lines)       | Added `CreateFieldDef` model, updated `AssetClassDetail`             |
| `backend/assets/service.py`                       | Modified (488→491 lines)     | Pass `create_fields` and `name_template` to response                 |
| `frontend/app/dashboard/assets/[key]/page.tsx`    | **Created** (639 lines)      | Generic detail page for any asset class                              |
| `frontend/app/dashboard/assets/page.tsx`          | Modified (828→862 lines)     | Added Education & Career category, made all items clickable `<Link>` |
| `frontend/app/dashboard/assets/vehicles/page.tsx` | **Deleted**                  | Replaced by generic `[key]` route                                    |
| `docs/SESSION_014.md`                             | Created                      | This document                                                        |

\* gemini_ocr.py line count decreased from Session 13's regex-heavy 1563 lines because Session 14 (prior) replaced regex with Gemini structured output (1563→690 lines). This session added 31 new schemas, bringing it back up to 1144 lines.

---

## What Was Built

### 1. 46 Asset Class Definitions (`definitions.py`)

Complete rewrite of the asset class definitions file. Each class includes:

- **`key`** — URL-safe identifier (e.g., `retirement_401k`)
- **`label`** — Display name (e.g., "401(k) Accounts")
- **`description`** — Short summary
- **`overview`** — Expert-level paragraph explaining why these documents matter
- **`checklist`** — Document checklist with `key`, `label`, `description`, `required`, `account_level` flags
- **`create_fields`** — Dynamic form fields for creating new instances (e.g., `year`, `make`, `model` for vehicles)
- **`name_template`** — Template string for auto-generating instance names (e.g., `{year} {make} {model}` → "2021 Tesla Model 3")

Helper functions `_item()` and `_field()` reduce boilerplate.

#### Categories & Classes (46 total)

**Real Assets (7):**
| Key | Label | Docs | Fields |
| --- | --- | --- | --- |
| `primary_home` | Primary Home | 11 | 1 |
| `rental_property` | Rental Property | 7 | 1 |
| `land` | Land | 5 | 1 |
| `vehicles` | Vehicles | 10 | 3 |
| `jewelry_art` | Jewelry & Art | 4 | 1 |
| `collectibles` | Collectibles | 4 | 1 |
| `precious_metals` | Precious Metals | 3 | 2 |

**Financial Assets (10):**
| Key | Label | Docs | Fields |
| --- | --- | --- | --- |
| `checking` | Checking Accounts | 2 | 2 |
| `savings` | Savings Accounts | 1 | 2 |
| `brokerage` | Brokerage Accounts | 3 | 2 |
| `retirement_401k` | 401(k) Accounts | 3 | 2 |
| `ira` | IRA Accounts | 3 | 2 |
| `pension` | Pension | 2 | 2 |
| `private_investments` | Private Investments | 3 | 1 |
| `crypto` | Crypto & Digital | 3 | 2 |
| `education_529` | 529 Education Savings | 2 | 2 |
| `hsa` | HSA Accounts | 2 | 1 |

**Education & Career (3):** _(NEW category)_
| Key | Label | Docs | Fields |
| --- | --- | --- | --- |
| `education` | Education Records | 3 | 2 |
| `income_tax` | W-2 / Tax Documents | 3 | 2 |
| `social_security` | Social Security | 1 | 1 |

**Employment & Equity (5):**
| Key | Label | Docs | Fields |
| --- | --- | --- | --- |
| `rsus` | RSUs | 3 | 2 |
| `stock_options` | Stock Options | 3 | 2 |
| `espp` | ESPP | 2 | 1 |
| `deferred_comp` | Deferred Compensation | 2 | 1 |
| `employment_contract` | Employment Contracts | 3 | 2 |

**Insurance (6):**
| Key | Label | Docs | Fields |
| --- | --- | --- | --- |
| `life_insurance` | Life Insurance | 2 | 2 |
| `health_insurance` | Health Insurance | 2 | 2 |
| `disability_insurance` | Disability Insurance | 1 | 1 |
| `auto_insurance` | Auto Insurance | 1 | 2 |
| `home_insurance` | Home / Renters Insurance | 1 | 2 |
| `umbrella_insurance` | Umbrella Liability | 1 | 1 |

**Legal & Estate (6):**
| Key | Label | Docs | Fields |
| --- | --- | --- | --- |
| `will` | Will | 1 | 1 |
| `trust` | Trust Documents | 2 | 2 |
| `power_of_attorney` | Power of Attorney | 1 | 2 |
| `healthcare_directive` | Healthcare Directive | 1 | 1 |
| `beneficiary_designations` | Beneficiary Designations | 1 | 1 |
| `business_ownership` | Business Ownership | 3 | 1 |

**Business (4):**
| Key | Label | Docs | Fields |
| --- | --- | --- | --- |
| `llc_formation` | LLC / Corp Formation | 3 | 2 |
| `operating_agreement` | Operating Agreements | 1 | 1 |
| `cap_table` | Cap Tables | 1 | 1 |
| `partnership_agreements` | Partnership Agreements | 1 | 1 |

**Debt & Liabilities (5):**
| Key | Label | Docs | Fields |
| --- | --- | --- | --- |
| `mortgage` | Mortgage | 3 | 2 |
| `student_loans` | Student Loans | 2 | 2 |
| `auto_loans` | Auto Loans | 2 | 2 |
| `personal_loans` | Personal Loans | 1 | 1 |
| `credit_lines` | Credit Lines | 1 | 2 |

#### Identity Documents (Account-Level, 6 total)

| Key                    | Label                | Required   |
| ---------------------- | -------------------- | ---------- |
| `drivers_license`      | Driver's License     | ✅         |
| `passport`             | Passport             | ✅         |
| `ssn_card`             | SSN Card             | ✅         |
| `government_id`        | Other Government ID  | ❌         |
| `birth_certificate`    | Birth Certificate    | ❌ _(new)_ |
| `marriage_certificate` | Marriage Certificate | ❌ _(new)_ |

---

### 2. 31 New Gemini DOC_SCHEMAS (`gemini_ocr.py`)

Added structured extraction schemas for every major document type. Each schema defines typed fields that Gemini extracts via `response_schema` with auto-generated Pydantic models. Total: **45 DOC_SCHEMAS** (14 existing + 31 new).

| Schema Key                 | Fields | Category          |
| -------------------------- | ------ | ----------------- |
| `birth_certificate`        | 7      | Identity          |
| `marriage_certificate`     | 7      | Identity          |
| `closing_disclosure`       | 11     | Real Estate       |
| `mortgage_agreement`       | 10     | Real Estate       |
| `appraisal_report`         | 9      | Real Estate       |
| `rental_lease`             | 8      | Real Estate       |
| `bank_statement`           | 9      | Financial         |
| `brokerage_statement`      | 8      | Financial         |
| `retirement_statement`     | 10     | Financial         |
| `pension_statement`        | 8      | Financial         |
| `k1_form`                  | 8      | Financial         |
| `plan_529_statement`       | 8      | Financial         |
| `hsa_statement`            | 8      | Financial         |
| `transcript`               | 9      | Education         |
| `diploma`                  | 6      | Education         |
| `w2_form`                  | 14     | Income/Tax        |
| `form_1099`                | 8      | Income/Tax        |
| `pay_stub`                 | 13     | Income/Tax        |
| `offer_letter`             | 10     | Employment        |
| `ss_statement`             | 7      | Social Security   |
| `stock_grant_letter`       | 10     | Employment/Equity |
| `life_insurance_policy`    | 11     | Insurance         |
| `health_insurance_card`    | 10     | Insurance         |
| `disability_policy`        | 9      | Insurance         |
| `will_document`            | 7      | Legal             |
| `trust_document`           | 8      | Legal             |
| `poa_document`             | 8      | Legal             |
| `healthcare_directive_doc` | 5      | Legal             |
| `articles_of_organization` | 8      | Business          |
| `student_loan_statement`   | 10     | Debt              |
| `credit_line_statement`    | 10     | Debt              |

Notable schemas:

- **W-2 Form** (14 fields): employer_name, employer_ein, employee_name, employee_ssn, wages_box1, federal_tax_box2, ss_wages_box3, ss_tax_box4, medicare_wages_box5, medicare_tax_box6, state, state_wages, state_tax, tax_year
- **Pay Stub** (13 fields): employer_name, employee_name, pay_period_start, pay_period_end, pay_date, gross_pay, net_pay, federal_tax, state_tax, social_security_tax, medicare_tax, retirement_deduction, ytd_gross
- **Closing Disclosure** (11 fields): borrower_name, seller_name, property_address, sale_price, loan_amount, interest_rate, loan_term, monthly_payment, closing_date, closing_costs, cash_to_close

---

### 3. Schema & Service Updates (`schemas.py`, `service.py`)

**schemas.py:**

- Added `CreateFieldDef(BaseModel)` with `key`, `label`, `placeholder` fields
- Extended `AssetClassDetail` with `create_fields: List[CreateFieldDef]` and `name_template: str`

**service.py:**

- Updated `get_asset_class()` to populate `create_fields` and `name_template` from definitions
- No other service changes needed — the existing generic CRUD pipeline (create, upload, persist, search, edit, delete) works for all 46 classes

---

### 4. Generic Detail Page (`[key]/page.tsx`)

Created a single dynamic Next.js page that handles **all 46 asset classes** through the URL parameter `[key]`. Replaces the old hardcoded vehicles page.

**Key features:**

- **Dynamic form generation** — reads `create_fields` from the API and renders input fields dynamically. Name preview updates live using `name_template` (e.g., typing "2021", "Tesla", "Model 3" shows preview "2021 Tesla Model 3").
- **Instance management** — creates instances via `POST /api/assets`, lists them with metadata, supports delete.
- **Document checklist** — shows each checklist item with upload status. Upload, preview, download, edit, delete per document.
- **Inline field editing** — extracted fields displayed as editable key-value pairs. Edit and save individual fields via `PATCH /api/assets/{id}/documents/{doc_id}/fields/{field}`.
- **Expanded fields panel** — collapsible accordion showing all extracted data per document.
- **Warning banners** — shown when Gemini extraction was unavailable and local OCR was used.
- **Account-level document links** — checklist items marked as `account_level` link to `/dashboard/account` instead of inline upload.
- **Loading/not-found states** — handles API errors gracefully.
- **Back navigation** — links back to assets overview.

---

### 5. Assets Overview Updates (`assets/page.tsx`)

- **New category: Education & Career** — added 3 items (Education Records, W-2 / Tax Documents, Social Security) to the category grid.
- **Clickable items** — changed all item `<div>` elements to `<Link href={/dashboard/assets/${item.key}}>` so every item navigates to its detail page.
- **Add button** — changed from non-functional `<button>` to `<Link>` pointing to the first item in each category.

---

### 6. Vehicles Page Removed

Deleted `frontend/app/dashboard/assets/vehicles/page.tsx` (335 lines). All functionality is now handled by the generic `[key]` route, which vehicles uses at `/dashboard/assets/vehicles`.

---

## Test Results

| Test                                                          | Result                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Backend imports (definitions, gemini_ocr, schemas, service)   | ✅ All load cleanly                                                            |
| `GET /api/asset-classes` — list all classes                   | ✅ Returns 46 classes                                                          |
| `GET /api/asset-classes/vehicles` — detail with create_fields | ✅ 10 checklist, 3 create_fields, template: `{year} {make} {model}`            |
| `GET /api/asset-classes/education` — new Education class      | ✅ 3 checklist, 2 create_fields, template: `{school} — {degree}`               |
| `GET /api/asset-classes/income_tax` — W-2/Tax class           | ✅ 3 checklist (w2_form, form_1099, pay_stub), template: `{year} — {employer}` |
| DOC_SCHEMAS count                                             | ✅ 45 schemas, 45 Pydantic models auto-built                                   |
| DOC_MODELS auto-generation                                    | ✅ All schemas produce valid Pydantic models                                   |
| `npx next build` — full production build                      | ✅ Compiled successfully, 0 TypeScript errors                                  |
| `/dashboard/assets` page                                      | ✅ HTTP 200                                                                    |
| `/dashboard/assets/vehicles` (generic route)                  | ✅ HTTP 200                                                                    |
| `/dashboard/assets/education` (new route)                     | ✅ HTTP 200                                                                    |
| `/dashboard/assets/income_tax` (new route)                    | ✅ HTTP 200                                                                    |
| `/dashboard/assets/primary_home` (new route)                  | ✅ HTTP 200                                                                    |
| VS Code error check (all 6 modified files)                    | ✅ 0 errors                                                                    |

---

## Architecture

```
Frontend (Next.js)
├── /dashboard/assets            → Assets Overview (9 categories, clickable items)
│   └── /dashboard/assets/[key]  → Generic Detail Page (46 asset classes)
│       ├── Dynamic "Add" form from create_fields
│       ├── Instance list (create / delete)
│       ├── Document checklist (upload / preview / download / delete)
│       └── Inline field editing for extracted data

Backend (FastAPI)
├── definitions.py   → 46 ASSET_CLASSES + 6 ACCOUNT_DOCUMENTS
│   └── Each class: key, label, description, overview, checklist, create_fields, name_template
├── schemas.py       → Pydantic response models (AssetClassDetail, CreateFieldDef)
├── service.py       → Generic CRUD (works for all 46 classes unchanged)
├── router.py        → REST endpoints (unchanged — already generic)
└── gemini_ocr.py    → 45 DOC_SCHEMAS → auto-built Pydantic models → Gemini structured extraction
```

### Data Flow — Document Upload

```
User clicks "Upload" on checklist item
        │
        ▼
POST /api/assets/{asset_id}/documents/{doc_key}
        │
        ▼
service.upload_document()
        │
        ├── Save file to uploads/
        ├── Determine DOC_SCHEMA from doc_key
        │
        ▼
gemini_ocr.extract_document_fields()
        │
        ├── PyMuPDF text extraction (PDF pages → images)
        ├── Gemini LLM with response_schema (Pydantic model)
        │   └── Fallback: gemini-2.5-flash-lite → local OCR
        ├── Return typed fields
        │
        ▼
service.persist()
        ├── Save JSON sidecar (fields + metadata)
        └── Return extracted fields to frontend
```

### Data Flow — Dynamic Form

```
User navigates to /dashboard/assets/education
        │
        ▼
[key]/page.tsx fetches GET /api/asset-classes/education
        │
        ▼
Returns: create_fields: [{key:"school", label:"School", placeholder:"UC Berkeley"},
                         {key:"degree", label:"Degree", placeholder:"BS CS"}]
         name_template: "{school} — {degree}"
        │
        ▼
Frontend renders dynamic form inputs
User types: school="MIT", degree="MS AI"
        │
        ▼
Name preview: "MIT — MS AI"
        │
        ▼
POST /api/assets  {asset_class: "education", name: "MIT — MS AI",
                   metadata: {school: "MIT", degree: "MS AI"}}
```

---

## Metrics

| Metric                  | Before                      | After                        |
| ----------------------- | --------------------------- | ---------------------------- |
| Backend asset classes   | 2                           | **46**                       |
| Identity document types | 4                           | **6**                        |
| Gemini DOC_SCHEMAS      | 14                          | **45**                       |
| Frontend categories     | 7 (decorative)              | **9 (functional)**           |
| Clickable asset items   | 1 (vehicles only)           | **46 (all items)**           |
| Detail page files       | 1 (vehicles-specific)       | **1 (generic, handles all)** |
| `definitions.py`        | 202 lines                   | **647 lines**                |
| `gemini_ocr.py`         | 690 lines (post-Session 14) | **1144 lines**               |
| `[key]/page.tsx`        | N/A                         | **639 lines** (new)          |

---

## Known Limitations

1. **No automated end-to-end upload test** — verified backend schemas, API responses, and frontend compilation, but did not upload a real document to every one of the 45 schemas. The pipeline is proven for identity docs (DL, passport); new schemas use the same Gemini structured output path.
2. **Gemini quota** — free-tier models may still hit 429 rate limits. Local OCR fallback is active, but structured extraction quality is lower without Gemini.
3. **No field validation** — `create_fields` have `placeholder` text but no client-side or server-side validation (e.g., tax year must be 4 digits).
4. **No search/filter on assets overview** — with 46 classes, users may want to search or filter the category grid.
5. **No encryption** — document files and JSON sidecar metadata are stored as plaintext on disk.
6. **Account-level vs instance-level ambiguity** — some documents (e.g., SSN card) are `account_level: true` and link to the account page rather than uploading inline in the asset detail page. This is correct but may confuse users expecting all uploads in one place.

---

## Next Steps

- [ ] End-to-end upload testing with real documents for new schemas (W-2, pay stub, closing disclosure, etc.)
- [ ] Field validation on `create_fields` (type hints, required flags, format masks)
- [ ] Bulk document upload — drag-and-drop multiple files at once
- [ ] Search/filter on assets overview page
- [ ] Document encryption at rest
- [ ] Asset valuation summaries — aggregate net worth across all 46 classes
- [ ] Export/download of all documents and metadata as ZIP archive
