from __future__ import annotations

import re
import io
from typing import List, Optional

import pytesseract
from PIL import Image


def extract_text(content: bytes) -> str:
    try:
        img = Image.open(io.BytesIO(content))
        text = pytesseract.image_to_string(img)
        return text.strip()
    except Exception:
        return content.decode("utf-8", errors="replace")


def extract_fields(doc_key: str, raw_text: str) -> List[dict]:
    extractor = EXTRACTORS.get(doc_key, _generic)
    return extractor(raw_text)


def _find(pattern: str, text: str, group: int = 1) -> Optional[str]:
    m = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
    return m.group(group).strip() if m else None


def _drivers_license(text: str) -> List[dict]:
    fields = []
    name = (
        _find(r"(?:name|fn|ln)[:\s]*(.+)", text)
        or _find(r"^([A-Z][a-z]+ [A-Z][a-z]+)", text)
    )
    if name:
        fields.append({"key": "full_name", "value": name})
    dl = _find(r"(?:dl|lic(?:ense)?|no|id)[:\s#]*([A-Z0-9-]{6,})", text)
    if dl:
        fields.append({"key": "license_number", "value": dl})
    dob = _find(r"(?:dob|date of birth|born)[:\s]*([\d/.-]+)", text)
    if dob:
        fields.append({"key": "date_of_birth", "value": dob})
    exp = _find(r"(?:exp(?:ires?|iry)?|expiration)[:\s]*([\d/.-]+)", text)
    if exp:
        fields.append({"key": "expiration", "value": exp})
    state = _find(r"(?:state)[:\s]*([A-Za-z ]+)", text)
    if state:
        fields.append({"key": "state", "value": state})
    cls = _find(r"(?:class)[:\s]*([A-Z])", text)
    if cls:
        fields.append({"key": "class", "value": cls})
    return fields


def _passport(text: str) -> List[dict]:
    fields = []
    name = _find(r"(?:surname|name|given)[:\s]*(.+)", text)
    if name:
        fields.append({"key": "full_name", "value": name})
    num = _find(r"(?:passport\s*(?:no|number|#))[:\s]*([A-Z0-9]+)", text)
    if not num:
        num = _find(r"\b([A-Z]?\d{8,9})\b", text)
    if num:
        fields.append({"key": "passport_number", "value": num})
    nat = _find(r"(?:nationality|citizenship)[:\s]*(\w+)", text)
    if nat:
        fields.append({"key": "nationality", "value": nat})
    dob = _find(r"(?:dob|date of birth|born)[:\s]*([\d/.-]+)", text)
    if dob:
        fields.append({"key": "date_of_birth", "value": dob})
    exp = _find(r"(?:exp(?:ires?|iry)?|expiration)[:\s]*([\d/.-]+)", text)
    if exp:
        fields.append({"key": "expiration", "value": exp})
    return fields


def _ssn_card(text: str) -> List[dict]:
    fields = []
    ssn = _find(r"(\d{3}[- ]\d{2}[- ]\d{4})", text)
    if ssn:
        fields.append({"key": "ssn", "value": ssn})
    name = _find(r"(?:name)[:\s]*(.+)", text)
    if not name:
        name = _find(r"^([A-Z][a-z]+ [A-Z][a-z]+)", text)
    if name:
        fields.append({"key": "full_name", "value": name})
    return fields


def _government_id(text: str) -> List[dict]:
    fields = []
    name = _find(r"(?:name)[:\s]*(.+)", text)
    if name:
        fields.append({"key": "full_name", "value": name})
    num = _find(r"(?:id|no|number)[:\s#]*([A-Z0-9-]{5,})", text)
    if num:
        fields.append({"key": "id_number", "value": num})
    state = _find(r"(?:state)[:\s]*([A-Za-z ]+)", text)
    if state:
        fields.append({"key": "state", "value": state})
    exp = _find(r"(?:exp(?:ires?)?)[:\s]*([\d/.-]+)", text)
    if exp:
        fields.append({"key": "expiration", "value": exp})
    return fields


def _vehicle_title(text: str) -> List[dict]:
    fields = []
    owner = _find(r"(?:owner|name|registered to)[:\s]*(.+)", text)
    if owner:
        fields.append({"key": "owner_name", "value": owner})
    vin = _find(r"(?:vin|vehicle identification)[:\s#]*([A-HJ-NPR-Z0-9]{11,17})", text)
    if not vin:
        vin = _find(r"\b([A-HJ-NPR-Z0-9]{17})\b", text)
    if vin:
        fields.append({"key": "vin", "value": vin})
    ymm = _find(r"(?:year|make|model|vehicle)[:\s]*(.+)", text)
    if ymm:
        fields.append({"key": "year_make_model", "value": ymm})
    title_no = _find(r"(?:title\s*(?:no|number|#))[:\s]*([A-Z0-9-]+)", text)
    if title_no:
        fields.append({"key": "title_number", "value": title_no})
    issue = _find(r"(?:issue(?:d)?|date)[:\s]*([\d/.-]+)", text)
    if issue:
        fields.append({"key": "issue_date", "value": issue})
    return fields


def _registration(text: str) -> List[dict]:
    fields = []
    plate = _find(r"(?:plate|tag|license plate)[:\s#]*([A-Z0-9-]+)", text)
    if not plate:
        plate = _find(r"\b([A-Z]{2,3}[- ]?\d{3,4})\b", text)
    if plate:
        fields.append({"key": "plate_number", "value": plate})
    state = _find(r"(?:state)[:\s]*([A-Za-z ]+)", text)
    if state:
        fields.append({"key": "state", "value": state})
    exp = _find(r"(?:exp(?:ires?)?|valid through)[:\s]*([\d/.-]+)", text)
    if exp:
        fields.append({"key": "expiration", "value": exp})
    vin = _find(r"(?:vin)[:\s#]*([A-HJ-NPR-Z0-9]{11,17})", text)
    if vin:
        fields.append({"key": "vin", "value": vin})
    return fields


def _insurance_policy(text: str) -> List[dict]:
    fields = []
    insurer = _find(r"(?:insurer|company|carrier|underwritten by)[:\s]*(.+)", text)
    if insurer:
        fields.append({"key": "insurer", "value": insurer})
    policy = _find(r"(?:policy\s*(?:no|number|#))[:\s]*([A-Z0-9-]+)", text)
    if policy:
        fields.append({"key": "policy_number", "value": policy})
    coverage = _find(r"(?:coverage|type)[:\s]*(.+)", text)
    if coverage:
        fields.append({"key": "coverage_type", "value": coverage})
    premium = _find(r"(?:premium)[:\s]*\$?([\d,.]+)", text)
    if premium:
        fields.append({"key": "premium", "value": f"${premium}"})
    deductible = _find(r"(?:deductible)[:\s]*\$?([\d,.]+)", text)
    if deductible:
        fields.append({"key": "deductible", "value": f"${deductible}"})
    eff = _find(r"(?:effective|period|term)[:\s]*(.+)", text)
    if eff:
        fields.append({"key": "effective_dates", "value": eff})
    return fields


def _loan_agreement(text: str) -> List[dict]:
    fields = []
    lender = _find(r"(?:lender|bank|creditor|financed by)[:\s]*(.+)", text)
    if lender:
        fields.append({"key": "lender", "value": lender})
    amount = _find(r"(?:loan\s*amount|principal|amount financed)[:\s]*\$?([\d,.]+)", text)
    if amount:
        fields.append({"key": "loan_amount", "value": f"${amount}"})
    apr = _find(r"(?:apr|annual percentage|interest rate)[:\s]*([\d.]+%?)", text)
    if apr:
        fields.append({"key": "apr", "value": apr if "%" in apr else f"{apr}%"})
    term = _find(r"(?:term|months|duration)[:\s]*(\d+)", text)
    if term:
        fields.append({"key": "term", "value": f"{term} months"})
    payment = _find(r"(?:monthly\s*payment|payment)[:\s]*\$?([\d,.]+)", text)
    if payment:
        fields.append({"key": "monthly_payment", "value": f"${payment}"})
    return fields


def _bill_of_sale(text: str) -> List[dict]:
    fields = []
    seller = _find(r"(?:seller|sold by|dealer)[:\s]*(.+)", text)
    if seller:
        fields.append({"key": "seller", "value": seller})
    buyer = _find(r"(?:buyer|purchased by|sold to)[:\s]*(.+)", text)
    if buyer:
        fields.append({"key": "buyer", "value": buyer})
    price = _find(r"(?:price|amount|total|purchase price)[:\s]*\$?([\d,.]+)", text)
    if price:
        fields.append({"key": "purchase_price", "value": f"${price}"})
    date = _find(r"(?:date)[:\s]*([\d/.-]+)", text)
    if date:
        fields.append({"key": "date", "value": date})
    vehicle = _find(r"(?:vehicle|description)[:\s]*(.+)", text)
    if vehicle:
        fields.append({"key": "vehicle", "value": vehicle})
    return fields


def _generic(text: str) -> List[dict]:
    fields = []
    for line in text.split("\n"):
        if ":" in line:
            parts = line.split(":", 1)
            key = parts[0].strip().lower().replace(" ", "_")[:30]
            val = parts[1].strip()
            if key and val and len(key) > 1:
                fields.append({"key": key, "value": val})
        if len(fields) >= 10:
            break
    if not fields:
        preview = text[:200].strip()
        if preview:
            fields.append({"key": "content", "value": preview})
    return fields


EXTRACTORS = {
    "drivers_license": _drivers_license,
    "passport": _passport,
    "ssn_card": _ssn_card,
    "government_id": _government_id,
    "vehicle_title": _vehicle_title,
    "registration": _registration,
    "insurance_policy": _insurance_policy,
    "loan_agreement": _loan_agreement,
    "bill_of_sale": _bill_of_sale,
}

# ---------------------------------------------------------------------------
# Document‑type validation – keyword heuristics
# ---------------------------------------------------------------------------

DOC_KEYWORDS: dict = {
    "drivers_license": ["driver", "license", "dl", "class", "expires", "dob", "restriction", "endorsement"],
    "passport": ["passport", "nationality", "citizenship", "issuing", "mrz", "travel"],
    "ssn_card": ["social security", "ssn", "xxx-xx"],
    "government_id": ["state id", "identification", "government"],
    "vehicle_title": ["title", "vin", "vehicle identification", "odometer", "lien"],
    "registration": ["registration", "plate", "tag", "vehicle", "registered"],
    "insurance_policy": ["insurance", "policy", "premium", "deductible", "coverage", "insurer", "underwritten"],
    "loan_agreement": ["loan", "lender", "apr", "interest", "principal", "financed", "monthly payment"],
    "bill_of_sale": ["bill of sale", "seller", "buyer", "purchase price", "sold"],
    "deed": ["deed", "grantor", "grantee", "parcel", "recording", "property"],
    "homeowners_insurance": ["homeowner", "dwelling", "property", "insurance", "premium"],
    "mortgage_statement": ["mortgage", "principal", "escrow", "lender", "amortization"],
    "property_tax": ["property tax", "assessed", "parcel", "tax bill"],
    "hoa_agreement": ["hoa", "homeowners association", "covenant", "assessment"],
}

DOC_LABELS: dict = {
    "drivers_license": "Driver's License",
    "passport": "Passport",
    "ssn_card": "SSN Card",
    "government_id": "Government ID",
    "vehicle_title": "Vehicle Title",
    "registration": "Registration",
    "insurance_policy": "Insurance Policy",
    "loan_agreement": "Loan Agreement",
    "bill_of_sale": "Bill of Sale",
    "deed": "Deed",
    "homeowners_insurance": "Homeowners Insurance",
    "mortgage_statement": "Mortgage Statement",
    "property_tax": "Property Tax Bill",
    "hoa_agreement": "HOA Agreement",
}


def validate_document(doc_key: str, raw_text: str) -> Optional[str]:
    """Return a warning string if the text doesn't look like the expected doc type, else None."""
    if not raw_text or len(raw_text.strip()) < 10:
        return "The uploaded file does not appear to contain readable text. Please ensure you uploaded a clear image or PDF of the correct document."

    text_lower = raw_text.lower()

    # score every known doc type
    scores: dict = {}
    for key, keywords in DOC_KEYWORDS.items():
        scores[key] = sum(1 for kw in keywords if kw in text_lower)

    expected_score = scores.get(doc_key, 0)
    expected_keywords = DOC_KEYWORDS.get(doc_key, [])

    # if no keywords defined for this type, skip validation
    if not expected_keywords:
        return None

    # need at least 1 keyword match for the expected type
    if expected_score == 0:
        # find best alternative
        best_key = max(scores, key=lambda k: scores[k]) if scores else None
        if best_key and scores[best_key] > 0:
            best_label = DOC_LABELS.get(best_key, best_key)
            expected_label = DOC_LABELS.get(doc_key, doc_key)
            return f"This document looks like a {best_label}, not a {expected_label}. Please verify you uploaded the correct file."
        return f"This file does not appear to be a {DOC_LABELS.get(doc_key, doc_key)}. Please upload the correct document."

    # check if another type scores significantly higher
    best_key = max(scores, key=lambda k: scores[k])
    if best_key != doc_key and scores[best_key] > expected_score + 2:
        best_label = DOC_LABELS.get(best_key, best_key)
        expected_label = DOC_LABELS.get(doc_key, doc_key)
        return f"This document may be a {best_label} rather than a {expected_label}. The file was saved but please double-check."

    return None
