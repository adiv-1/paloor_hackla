# SESSION_013 — Document Infrastructure & Extraction Pipeline

**Date:** March 5, 2026  
**Version:** v0.10.1  
**Focus:** Fix broken document infrastructure — Gemini API, OCR extraction, JSON persistence, frontend wiring.

---

## Motivation

Session 12 built UI for assets, identity documents, and account management, but the core document pipeline was never properly functional:

- **Gemini API** returned "unavailable" on every upload (quota exhausted)
- **OCR extraction** was weak — only basic regex patterns, many fields missed
- **No persistence** — all documents lost on server restart (in-memory only)
- **No JSON sidecars** — metadata wasn't saved to disk
- **Assets page** identity Upload buttons had no click handlers
- **Profile ↔ Assets** documents were completely disconnected

This session fixed all of the above.

---

## Changes This Session

| File                                     | Action                     | Description                                                                                          |
| ---------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `backend/assets/gemini_ocr.py`           | Rewritten (537→1563 lines) | New google-genai SDK, dual-pass OCR, MRZ parser, improved regex patterns, JSON persistence functions |
| `backend/assets/service.py`              | Rewritten (379→488 lines)  | `restore_from_disk()`, JSON sidecar save on every upload, cleanup on delete                          |
| `backend/main.py`                        | Modified                   | Added `restore_from_disk()` call on startup                                                          |
| `backend/requirements.txt`               | Modified                   | Added `google-genai>=1.0`                                                                            |
| `frontend/app/dashboard/assets/page.tsx` | Modified (708→813 lines)   | Connected identity Upload buttons to backend API, status indicators                                  |
| `docs/SESSION_013.md`                    | Created                    | This document                                                                                        |

---

## What Was Fixed

### 1. Gemini API — SDK Migration

**Problem:** `google-generativeai` v0.8.6 is deprecated. The Gemini API key exists but all free-tier models return `429 RESOURCE_EXHAUSTED` (quota limit = 0 for gemini-2.0-flash, gemini-1.5-flash is 404, gemini-2.0-flash-lite also exhausted).

**Fix:**

- Installed `google-genai` v1.47.0 (new official SDK)
- `extract_with_gemini()` now uses multi-model fallback (2.0-flash → 2.0-flash-lite → 1.5-flash) with retry logic
- When quota resets, Gemini will auto-activate — local OCR is the primary path meanwhile
- Warning message shown to user: "Gemini unavailable — extracted locally via OCR"

### 2. OCR Text Extraction — Dual-Pass Approach

**Problem:** Single-pass OCR with heavy preprocessing (grayscale + contrast + sharpen + upscale) could destroy text in colored areas (e.g., DL name field hidden against gradient background).

**Fix:** `extract_text()` now runs two OCR passes:

1. **Preprocessed pass** — grayscale, contrast 2.0×, sharpen, upscale (best for numbers, dates, small text)
2. **Raw pass** — original image, no preprocessing (best for name fields, colored backgrounds)

Both texts are combined: the longer one becomes primary, unique lines from the secondary pass are appended after `--- ALT OCR ---`. Field extraction searches through both.

### 3. MRZ Parser — Passport Machine Readable Zone

**Problem:** Passport MRZ lines were garbled by OCR (spaces injected into `<<<` sequences, nationality codes missing, extra noise characters).

**Fix:** Complete MRZ parser with:

- **Categorized candidate detection** — line 1 (starts with P, has `<` chars) vs line 2 (starts with digits, 40%+ digit content)
- **Nationality code anchoring** — finds `USA`/`GBR` etc. in line 2 to anchor field positions
- **Handles dual-pass OCR** — won't accidentally select two copies of line 1 from different OCR passes
- **Country code validation** — line 1 position 2-4 checked against 50+ known codes
- **Fallback** — if typed detection fails, concatenate text after `P<` and split at character 44

**Result:** 8/8 passport fields (name, passport#, nationality, DOB, expiration, issue date, place of birth, sex)

### 4. Driver's License Extraction

**Problem:** Only 2/10 fields extracted despite readable OCR text. Regex patterns expected labeled fields ("DL:", "EXP:") but California DL OCR produces unlabeled values.

**Fix:** Per-field improvements:

- **License number** — added 5 patterns including isolated 7-8 digit numbers near license context
- **DOB/Expiration** — date heuristics: oldest date = DOB, furthest future = expiration
- **State** — US state name search + state abbreviation from address (CA → California)
- **Address** — spacing fix (OCR concatenates "123NORTHSTREET" → "123 NORTH STREET"), city/state/zip detection
- **Class** — tolerant pattern matching for OCR noise after "CLASS"
- **Eye color** — fallback: search all known color codes (BRN, BLU, GRN) when EYES keyword is garbled
- **Height** — proper handling of `5'-06"` format with various OCR character substitutions
- **Name** — ALT OCR fallback: find standalone capitalized words (3+ chars, not document keywords)

**Result:** 10/10 DL fields (name, license#, DOB, expiration, state, address, class, sex, height, eye color)

### 5. JSON Persistence

**Problem:** All document data stored in Python dicts (`_account_documents`, `_asset_documents`). Server restart = everything lost. 8 files existed in `uploads/` directory with no metadata.

**Fix:**

- **`save_document_json()`** — creates `doc_XXXXX.json` sidecar file alongside each upload containing: doc key, document ID, filename, timestamp, extracted fields, raw text, source (account/asset)
- **`load_all_document_jsons()`** — scans uploads directory for `.json` files and returns all document records
- **`restore_from_disk()`** — called on server startup, re-hydrates `_account_documents` and `_asset_documents` dicts from JSON sidecar files
- **Re-persist on edit** — `update_extracted_field()` now saves JSON after every field change
- **Cleanup on delete** — `delete_document()` removes both the uploaded file and its JSON sidecar

**Verified:** Upload DL + passport → restart server → both documents survive with all extracted fields intact.

### 6. Frontend Assets Identity Section

**Problem:** Upload buttons in the identity section had no `onClick` handler — completely non-functional.

**Fix:**

- Added `useRef` for hidden file input and pending document key
- `loadIdentityDocs()` fetches doc status from `GET /api/account/documents` on mount
- `startIdentityUpload(key)` triggers file picker
- `handleIdentityFile()` uploads via `POST /api/account/documents/{key}`
- Green checkmark + "Uploaded • N fields extracted" status for completed docs
- "Replace" button text for already-uploaded docs
- Loading spinner during upload
- Counter shows "2/6 uploaded" in the section header

**Profile ↔ Assets linking:** Both the Account Documents tab and the Assets Identity section call the same API endpoint, so documents uploaded in either view appear in both.

---

## Test Results

| Document                             | Fields | Status                                  |
| ------------------------------------ | ------ | --------------------------------------- |
| California Driver's License (sample) | 10/10  | ✅ All correct                          |
| US Passport (sample)                 | 8/8    | ✅ All correct                          |
| JSON persistence (restart test)      | —      | ✅ Documents survive restart            |
| API upload endpoint                  | —      | ✅ Live upload returns extracted fields |
| Frontend upload buttons              | —      | ✅ Connected and functional             |

---

## Architecture

```
                          ┌──────────────┐
                          │  Frontend    │
                          │  Assets +    │
                          │  Account     │
                          └──────┬───────┘
                                 │ POST /api/account/documents/{key}
                                 ▼
                          ┌──────────────┐
                          │  router.py   │
                          └──────┬───────┘
                                 │
                          ┌──────▼───────┐
                          │  service.py  │◄── restore_from_disk() on startup
                          └──────┬───────┘
                                 │
                  ┌──────────────┼──────────────┐
                  ▼              ▼               ▼
           ┌────────────┐ ┌──────────┐  ┌──────────────┐
           │ gemini_ocr │ │ uploads/ │  │ JSON sidecar │
           │ extract +  │ │ files    │  │ files        │
           │ parse      │ └──────────┘  └──────────────┘
           └────────────┘
                  │
        ┌─────────┼──────────┐
        ▼         ▼          ▼
   ┌─────────┐ ┌──────┐ ┌────────┐
   │ Gemini  │ │ OCR  │ │  MRZ   │
   │ (when   │ │ dual │ │ parser │
   │ quota   │ │ pass │ │        │
   │ resets) │ │      │ │        │
   └─────────┘ └──────┘ └────────┘
```

---

## Known Limitations

1. **Gemini quota exhausted** — all free-tier models return 429. Local OCR is the fallback. When quota resets (billing cycle or upgrade), Gemini will auto-activate.
2. **OCR quality varies** — tesseract does well on clean, high-res documents but struggles with low-contrast or rotated text.
3. **Name extraction** — relies on ALT OCR pass for DLs where preprocessing destroys the name area. Works for California sample; other states may need tuning.
4. **Date parsing heuristic** — uses "oldest date = DOB, newest = expiration" which is generally correct but could mismatch with unusual document layouts.
5. **No encryption yet** — documents are stored as plain files. Encryption deferred to a future session.

---

## Next Steps

- [ ] Encryption for stored documents and JSON sidecar files
- [ ] Support more document types (SSN card, birth certificate, vehicle title, etc.)
- [ ] Asset-specific document uploads (deed, insurance, loan docs per asset)
- [ ] Document field editing in the frontend
- [ ] Gemini quota: monitor for reset or upgrade to paid tier
