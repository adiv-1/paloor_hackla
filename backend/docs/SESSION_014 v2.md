# SESSION 014 — Regex → Gemini LLM Structured Extraction

**Date**: 2025-07-15  
**Version**: v0.11.0

## Summary

Removed all regex-based document field extraction (700+ lines of per-doc-type
regex patterns, MRZ parser, pattern matching). Replaced with **Gemini LLM
structured output** using Pydantic schemas and `response_schema`.

The extraction pipeline is now:

1. **OCR** (pytesseract dual-pass for images, PyMuPDF for PDFs) → raw text
2. **Gemini Vision + structured output** → guaranteed JSON matching the schema

## What Changed

### `backend/assets/gemini_ocr.py` — **1564 → 690 lines**

- **Removed**: `_smart_extract()` (700+ lines of regex per doc type),
  `_parse_mrz()` (MRZ parser), `_find_near()`, `_find_name()`,
  `_find_all_dates()`, `_basic_kv_extract()` — all regex extraction
- **Added**: Dynamic Pydantic model creation from `DOC_SCHEMAS` via
  `create_model()` with `_ExtractionBase`
- **Added**: `response_schema` parameter in Gemini calls for structured JSON
- **Added**: PDF support via PyMuPDF (`fitz`) — text extraction + OCR fallback
  for scanned pages
- **Added**: `_GenericExtraction` Pydantic model for unknown document types
- **Updated**: Model priority list: `gemini-3-flash-preview` →
  `gemini-2.5-flash-lite` → `gemini-2.5-flash` → `gemini-2.0-flash`
- **Kept**: `extract_text()` (dual-pass OCR), `_is_image()`, `_detect_mime()`,
  `save_document_json()`, `load_all_document_jsons()`, `DOC_SCHEMAS`
- **Kept**: Same public API — `extract_with_gemini(doc_key, content, raw_text)`
  returns `(fields_list, warning)`

### `backend/requirements.txt`

- Added `pymupdf>=1.20`

### No changes needed

- `service.py` — interface unchanged
- `router.py` — interface unchanged
- Frontend — no changes

## Architecture

```
Upload → _is_image() / _is_pdf()
           ↓
       extract_text()          → raw_text (for search, display)
           ↓
       extract_with_gemini()
           ↓
       DOC_MODELS[doc_key]     → Pydantic model → model_json_schema()
           ↓
       Gemini API (vision mode for images, text mode for PDFs)
         config = {
           response_mime_type: "application/json",
           response_schema: <pydantic schema>
         }
           ↓
       _parsed_to_fields()     → [{key, value, label}]
```

## Test Results

| Document            | Fields | Extracted | Notes                             |
| ------------------- | ------ | --------- | --------------------------------- |
| US Passport (PNG)   | 8      | 8/8       | Michelle De La Paz, all fields OK |
| CA Driver's License | 10     | 10/10     | Janice Sample, all fields OK      |

## Dependencies Installed

- `pymupdf` 1.26.5 (PyMuPDF for PDF text extraction)

## Available Gemini Models Tested

- `gemini-3-flash-preview` ✅ (primary — works with structured output)
- `gemini-2.5-flash-lite` ✅ (fallback)
- `gemini-2.5-flash` ❌ (503 high demand)
- `gemini-2.0-flash` ❌ (429 rate limited)
