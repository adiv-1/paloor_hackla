"""Document OCR + Gemini LLM structured extraction.

Architecture:
  1. extract_text()  -- raw text from image/PDF (pytesseract / PyMuPDF)
  2. extract_with_gemini() -- send image+text to Gemini with Pydantic schema
                              -> guaranteed structured JSON output

All intelligent field extraction is done by Google Gemini LLM.
No regex-based extraction.
"""
from __future__ import annotations

import io
import json
import logging
import os
import time
from typing import Dict, List, Optional, Tuple

from pydantic import BaseModel, ConfigDict, Field, create_model

from config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Document schemas -- field keys + labels for each document type
# ---------------------------------------------------------------------------

DOC_SCHEMAS: Dict[str, dict] = {
    "drivers_license": {
        "label": "Driver's License",
        "fields": {
            "full_name": "Full legal name",
            "license_number": "License number",
            "date_of_birth": "Date of birth",
            "expiration": "Expiration date",
            "address": "Address on license",
            "state": "Issuing state",
            "class": "License class (e.g. C)",
            "sex": "Sex (M/F)",
            "height": "Height",
            "eye_color": "Eye color",
        },
    },
    "passport": {
        "label": "Passport",
        "fields": {
            "full_name": "Full name",
            "passport_number": "Passport number",
            "nationality": "Nationality",
            "date_of_birth": "Date of birth",
            "expiration": "Expiration date",
            "issue_date": "Date of issue",
            "place_of_birth": "Place of birth",
            "sex": "Sex (M/F)",
        },
    },
    "ssn_card": {
        "label": "Social Security Card",
        "fields": {
            "full_name": "Name on card",
            "ssn": "Social Security Number",
        },
    },
    "government_id": {
        "label": "Government ID",
        "fields": {
            "full_name": "Full name",
            "id_number": "ID number",
            "date_of_birth": "Date of birth",
            "expiration": "Expiration date",
            "issuing_authority": "Issuing authority",
        },
    },
    "vehicle_title": {
        "label": "Vehicle Title",
        "fields": {
            "owner_name": "Owner / title holder",
            "vin": "VIN (Vehicle Identification Number)",
            "year_make_model": "Year, make & model",
            "title_number": "Title number",
            "issue_date": "Title issue date",
            "lien_holder": "Lien holder (if any)",
            "state": "Issuing state",
        },
    },
    "registration": {
        "label": "Vehicle Registration",
        "fields": {
            "owner_name": "Registered owner",
            "vin": "VIN",
            "plate_number": "License plate number",
            "year_make_model": "Year, make & model",
            "expiration": "Registration expiration",
            "state": "Registration state",
        },
    },
    "insurance_policy": {
        "label": "Insurance Policy",
        "fields": {
            "insurer": "Insurance company name",
            "policy_number": "Policy number",
            "coverage_type": "Type of coverage",
            "premium": "Premium amount",
            "deductible": "Deductible amount",
            "effective_dates": "Policy effective date range",
            "insured_name": "Name of insured",
        },
    },
    "loan_agreement": {
        "label": "Loan Agreement",
        "fields": {
            "lender": "Lender / financial institution",
            "loan_amount": "Total loan amount",
            "apr": "Annual percentage rate",
            "term": "Loan term (months)",
            "monthly_payment": "Monthly payment amount",
            "start_date": "Loan start date",
        },
    },
    "bill_of_sale": {
        "label": "Bill of Sale",
        "fields": {
            "seller": "Seller name",
            "buyer": "Buyer name",
            "purchase_price": "Purchase price",
            "date": "Date of sale",
            "vehicle": "Vehicle or item description",
        },
    },
    "deed": {
        "label": "Property Deed",
        "fields": {
            "grantor": "Grantor (seller)",
            "grantee": "Grantee (buyer)",
            "property_address": "Property address",
            "recording_date": "Recording date",
            "instrument_number": "Instrument / document number",
            "legal_description": "Legal description of property",
        },
    },
    "homeowners_insurance": {
        "label": "Homeowners Insurance",
        "fields": {
            "insurer": "Insurance company",
            "policy_number": "Policy number",
            "dwelling_coverage": "Dwelling coverage amount",
            "annual_premium": "Annual premium",
            "deductible": "Deductible",
            "effective_dates": "Policy period",
        },
    },
    "mortgage_statement": {
        "label": "Mortgage Statement",
        "fields": {
            "lender": "Mortgage lender",
            "loan_number": "Loan/account number",
            "principal_balance": "Outstanding principal",
            "interest_rate": "Interest rate",
            "monthly_payment": "Monthly payment",
            "escrow_balance": "Escrow balance",
            "next_due_date": "Next payment due date",
        },
    },
    "property_tax": {
        "label": "Property Tax Bill",
        "fields": {
            "parcel_number": "Parcel / APN number",
            "assessed_value": "Assessed property value",
            "tax_amount": "Tax amount due",
            "tax_year": "Tax year",
            "property_address": "Property address",
        },
    },
    "hoa_agreement": {
        "label": "HOA Agreement",
        "fields": {
            "hoa_name": "HOA / association name",
            "monthly_dues": "Monthly dues amount",
            "property_address": "Property address",
            "contact": "HOA contact info",
        },
    },

    # ── Identity Documents (new) ─────────────────────────────────────────

    "birth_certificate": {
        "label": "Birth Certificate",
        "fields": {
            "full_name": "Full name on certificate",
            "date_of_birth": "Date of birth",
            "place_of_birth": "Place of birth (city, state/country)",
            "mother_name": "Mother's name",
            "father_name": "Father's name",
            "certificate_number": "Certificate number",
            "date_filed": "Date filed / registered",
        },
    },
    "marriage_certificate": {
        "label": "Marriage Certificate",
        "fields": {
            "spouse1_name": "First spouse name",
            "spouse2_name": "Second spouse name",
            "date_of_marriage": "Date of marriage",
            "place_of_marriage": "Place of marriage",
            "officiant": "Officiant name",
            "certificate_number": "Certificate number",
            "county": "County / jurisdiction",
        },
    },

    # ── Real Estate Documents ────────────────────────────────────────────

    "closing_disclosure": {
        "label": "Closing Disclosure",
        "fields": {
            "property_address": "Property address",
            "buyer_name": "Buyer / borrower name",
            "seller_name": "Seller name",
            "sale_price": "Sale price",
            "loan_amount": "Loan amount",
            "interest_rate": "Interest rate",
            "loan_term": "Loan term",
            "monthly_payment": "Estimated total monthly payment",
            "closing_date": "Closing date",
            "closing_costs": "Total closing costs",
            "cash_to_close": "Cash to close",
        },
    },
    "mortgage_agreement": {
        "label": "Mortgage Agreement",
        "fields": {
            "lender": "Lender / mortgagee",
            "borrower": "Borrower(s)",
            "property_address": "Property address",
            "loan_amount": "Original loan amount",
            "interest_rate": "Interest rate",
            "loan_term": "Loan term (years)",
            "monthly_payment": "Monthly payment (P&I)",
            "loan_type": "Loan type (Conventional/FHA/VA)",
            "origination_date": "Origination / closing date",
            "maturity_date": "Maturity date",
        },
    },
    "appraisal_report": {
        "label": "Appraisal Report",
        "fields": {
            "property_address": "Property / item address or description",
            "appraised_value": "Appraised market value",
            "appraisal_date": "Date of appraisal",
            "appraiser_name": "Appraiser name",
            "appraiser_license": "Appraiser license number",
            "square_footage": "Gross living area (sq ft)",
            "lot_size": "Lot size",
            "year_built": "Year built",
            "property_type": "Property type",
        },
    },
    "rental_lease": {
        "label": "Lease Agreement",
        "fields": {
            "landlord_name": "Landlord / property manager",
            "tenant_name": "Tenant name(s)",
            "property_address": "Property address",
            "monthly_rent": "Monthly rent",
            "security_deposit": "Security deposit",
            "lease_start": "Lease start date",
            "lease_end": "Lease end date",
            "lease_type": "Lease type (Fixed / Month-to-month)",
        },
    },

    # ── Financial Statements ─────────────────────────────────────────────

    "bank_statement": {
        "label": "Bank Statement",
        "fields": {
            "bank_name": "Bank / institution name",
            "account_holder": "Account holder name",
            "account_number_last4": "Account number (last 4 digits)",
            "account_type": "Account type (Checking/Savings)",
            "statement_period": "Statement period",
            "beginning_balance": "Beginning balance",
            "ending_balance": "Ending balance",
            "total_deposits": "Total deposits / credits",
            "total_withdrawals": "Total withdrawals / debits",
        },
    },
    "brokerage_statement": {
        "label": "Brokerage Statement",
        "fields": {
            "broker_name": "Brokerage firm",
            "account_holder": "Account holder name",
            "account_number_last4": "Account number (last 4)",
            "statement_period": "Statement period",
            "total_account_value": "Total account / portfolio value",
            "total_gain_loss": "Unrealized gain / loss",
            "dividends_earned": "Dividends earned",
            "fees": "Fees / commissions",
        },
    },
    "retirement_statement": {
        "label": "Retirement Account Statement (401k/IRA)",
        "fields": {
            "plan_name": "Plan / account name",
            "administrator": "Plan administrator / custodian",
            "participant_name": "Participant / account holder",
            "account_number": "Account number",
            "statement_date": "Statement date",
            "total_balance": "Total account balance",
            "employee_contributions": "Employee contributions",
            "employer_match": "Employer match / contributions",
            "vesting_percentage": "Vesting percentage",
            "ytd_contributions": "Year-to-date contributions",
        },
    },
    "pension_statement": {
        "label": "Pension Statement",
        "fields": {
            "plan_name": "Pension plan name",
            "employer": "Employer / plan sponsor",
            "participant": "Participant name",
            "accrued_benefit": "Monthly accrued benefit",
            "projected_benefit": "Projected benefit at retirement",
            "normal_retirement_date": "Normal retirement date",
            "vesting_status": "Vesting status",
            "years_of_service": "Years of credited service",
        },
    },
    "k1_form": {
        "label": "Schedule K-1",
        "fields": {
            "partnership_name": "Partnership / entity name",
            "partner_name": "Partner name",
            "partnership_ein": "Partnership EIN",
            "ordinary_income": "Ordinary business income (loss)",
            "guaranteed_payments": "Guaranteed payments",
            "capital_gains": "Net capital gain (loss)",
            "distributions": "Distributions",
            "tax_year": "Tax year",
        },
    },
    "plan_529_statement": {
        "label": "529 Plan Statement",
        "fields": {
            "plan_name": "529 plan name",
            "account_owner": "Account owner",
            "beneficiary": "Beneficiary",
            "account_number": "Account number",
            "total_balance": "Total account balance",
            "contributions_ytd": "Contributions year-to-date",
            "investment_option": "Investment option / portfolio",
            "statement_date": "Statement date",
        },
    },
    "hsa_statement": {
        "label": "HSA Statement",
        "fields": {
            "custodian": "HSA custodian",
            "account_holder": "Account holder",
            "account_number": "Account number",
            "balance": "Current balance",
            "contributions_ytd": "Contributions year-to-date",
            "employer_contributions": "Employer contributions",
            "annual_limit": "Annual contribution limit",
            "investment_balance": "Investment balance",
        },
    },

    # ── Education & Career Documents ─────────────────────────────────────

    "transcript": {
        "label": "Academic Transcript",
        "fields": {
            "institution_name": "Institution / school name",
            "student_name": "Student name",
            "student_id": "Student ID",
            "degree_program": "Degree / program",
            "cumulative_gpa": "Cumulative GPA",
            "total_credits": "Total credits earned",
            "enrollment_dates": "Enrollment dates",
            "graduation_date": "Graduation / completion date",
            "honors": "Honors / distinctions",
        },
    },
    "diploma": {
        "label": "Diploma / Degree Certificate",
        "fields": {
            "institution_name": "Institution name",
            "graduate_name": "Graduate name",
            "degree": "Degree (e.g. Bachelor of Science)",
            "major": "Major / field of study",
            "date_conferred": "Date conferred",
            "honors": "Honors (cum laude, etc.)",
        },
    },
    "w2_form": {
        "label": "W-2 Wage and Tax Statement",
        "fields": {
            "employer_name": "Employer name (Box c)",
            "employer_ein": "Employer EIN (Box b)",
            "employee_name": "Employee name (Box e)",
            "employee_ssn_last4": "Employee SSN last 4 digits (Box a)",
            "wages": "Wages, tips, other compensation (Box 1)",
            "federal_tax_withheld": "Federal income tax withheld (Box 2)",
            "social_security_wages": "Social security wages (Box 3)",
            "social_security_tax": "Social security tax withheld (Box 4)",
            "medicare_wages": "Medicare wages and tips (Box 5)",
            "medicare_tax": "Medicare tax withheld (Box 6)",
            "state": "State (Box 15)",
            "state_wages": "State wages (Box 16)",
            "state_tax": "State income tax (Box 17)",
            "tax_year": "Tax year",
        },
    },
    "form_1099": {
        "label": "1099 Tax Form",
        "fields": {
            "payer_name": "Payer name",
            "payer_tin": "Payer TIN / EIN",
            "recipient_name": "Recipient name",
            "recipient_ssn_last4": "Recipient SSN (last 4)",
            "form_type": "1099 type (MISC/NEC/DIV/INT/B/R)",
            "amount": "Total amount reported",
            "federal_tax_withheld": "Federal tax withheld",
            "tax_year": "Tax year",
        },
    },
    "pay_stub": {
        "label": "Pay Stub",
        "fields": {
            "employer_name": "Employer name",
            "employee_name": "Employee name",
            "pay_period": "Pay period (start - end)",
            "pay_date": "Pay date",
            "gross_pay": "Gross pay",
            "net_pay": "Net pay",
            "federal_tax": "Federal tax withheld",
            "state_tax": "State tax withheld",
            "social_security_tax": "Social Security tax",
            "medicare_tax": "Medicare tax",
            "deductions_total": "Total deductions",
            "ytd_gross": "Year-to-date gross earnings",
            "ytd_net": "Year-to-date net pay",
        },
    },
    "offer_letter": {
        "label": "Offer Letter / Employment Offer",
        "fields": {
            "company_name": "Company name",
            "candidate_name": "Candidate / employee name",
            "position_title": "Position / title",
            "salary": "Base salary / compensation",
            "start_date": "Start date",
            "bonus": "Sign-on bonus",
            "equity": "Equity / stock grants",
            "benefits": "Benefits summary",
            "location": "Work location",
            "reporting_to": "Reporting manager",
        },
    },
    "ss_statement": {
        "label": "Social Security Statement",
        "fields": {
            "name": "Name on record",
            "estimated_benefit_62": "Estimated monthly benefit at age 62",
            "estimated_benefit_fra": "Estimated monthly benefit at full retirement age",
            "estimated_benefit_70": "Estimated monthly benefit at age 70",
            "full_retirement_age": "Full retirement age",
            "total_earnings": "Total career earnings to date",
            "last_reported_year": "Last year of reported earnings",
        },
    },

    # ── Employment & Compensation Documents ──────────────────────────────

    "stock_grant_letter": {
        "label": "Stock Grant Letter (RSU/Options)",
        "fields": {
            "company": "Company name",
            "grantee": "Grantee / employee name",
            "grant_date": "Grant date",
            "grant_type": "Grant type (RSU/ISO/NSO/ESPP)",
            "shares": "Number of shares / units",
            "grant_price": "Grant price / FMV at grant",
            "vesting_schedule": "Vesting schedule",
            "vesting_start": "Vesting commencement date",
            "expiration": "Expiration date (if options)",
            "cliff": "Cliff period",
        },
    },

    # ── Insurance Documents ──────────────────────────────────────────────

    "life_insurance_policy": {
        "label": "Life Insurance Policy",
        "fields": {
            "insurer": "Insurance company",
            "policy_number": "Policy number",
            "insured_name": "Name of insured",
            "beneficiary": "Primary beneficiary",
            "contingent_beneficiary": "Contingent beneficiary",
            "death_benefit": "Death benefit amount",
            "premium": "Premium amount",
            "premium_frequency": "Premium frequency (monthly/annual)",
            "policy_type": "Policy type (Term/Whole/Universal)",
            "effective_date": "Policy effective date",
            "expiration_date": "Expiration date (if term)",
        },
    },
    "health_insurance_card": {
        "label": "Health Insurance Card",
        "fields": {
            "insurer": "Insurance company",
            "plan_name": "Plan name",
            "member_name": "Member name",
            "member_id": "Member ID",
            "group_number": "Group number",
            "copay_primary": "Primary care copay",
            "copay_specialist": "Specialist copay",
            "deductible": "Annual deductible",
            "out_of_pocket_max": "Out-of-pocket maximum",
            "effective_date": "Effective date",
        },
    },
    "disability_policy": {
        "label": "Disability Insurance Policy",
        "fields": {
            "insurer": "Insurance company",
            "policy_number": "Policy number",
            "insured_name": "Insured name",
            "monthly_benefit": "Monthly benefit amount",
            "elimination_period": "Elimination / waiting period",
            "benefit_period": "Benefit period",
            "definition": "Definition (Own-occupation / Any-occupation)",
            "premium": "Premium amount",
            "effective_date": "Effective date",
        },
    },

    # ── Legal & Estate Documents ─────────────────────────────────────────

    "will_document": {
        "label": "Last Will and Testament",
        "fields": {
            "testator": "Testator (person making the will)",
            "executor": "Named executor",
            "alternate_executor": "Alternate executor",
            "date_executed": "Date executed / signed",
            "state": "State of execution",
            "witnesses": "Witness names",
            "notarized": "Notarized (yes/no)",
        },
    },
    "trust_document": {
        "label": "Trust Agreement",
        "fields": {
            "trust_name": "Trust name",
            "trust_type": "Trust type (Revocable/Irrevocable)",
            "grantor": "Grantor / settlor",
            "trustee": "Trustee",
            "successor_trustee": "Successor trustee",
            "beneficiaries": "Beneficiaries",
            "date_established": "Date established",
            "state": "Governing state",
        },
    },
    "poa_document": {
        "label": "Power of Attorney",
        "fields": {
            "principal": "Principal (person granting authority)",
            "agent": "Agent / attorney-in-fact",
            "alternate_agent": "Alternate agent",
            "poa_type": "Type (Financial/Healthcare/General/Limited)",
            "effective_date": "Effective date",
            "state": "State of execution",
            "durable": "Durable (yes/no)",
            "springing": "Springing (yes/no)",
        },
    },
    "healthcare_directive_doc": {
        "label": "Healthcare Directive",
        "fields": {
            "principal": "Principal name",
            "healthcare_agent": "Healthcare agent",
            "alternate_agent": "Alternate agent",
            "date_executed": "Date executed",
            "state": "State of execution",
        },
    },

    # ── Business Documents ───────────────────────────────────────────────

    "articles_of_organization": {
        "label": "Articles of Organization / Incorporation",
        "fields": {
            "entity_name": "Entity name",
            "entity_type": "Entity type (LLC/Corporation/Partnership)",
            "state_of_formation": "State of formation",
            "date_filed": "Date filed",
            "ein": "EIN (Employer Identification Number)",
            "registered_agent": "Registered agent",
            "members_officers": "Members / officers",
            "business_purpose": "Business purpose",
        },
    },

    # ── Debt Documents ───────────────────────────────────────────────────

    "student_loan_statement": {
        "label": "Student Loan Statement",
        "fields": {
            "servicer": "Loan servicer",
            "borrower_name": "Borrower name",
            "account_number": "Account / loan number",
            "loan_type": "Loan type (Federal/Private)",
            "principal_balance": "Principal balance",
            "interest_rate": "Interest rate",
            "monthly_payment": "Monthly payment",
            "repayment_plan": "Repayment plan",
            "next_due_date": "Next payment due date",
            "loan_status": "Loan status (Repayment/Deferment/Forbearance)",
        },
    },
    "credit_line_statement": {
        "label": "Credit Line Statement",
        "fields": {
            "lender": "Lender / institution",
            "account_holder": "Account holder",
            "account_number_last4": "Account number (last 4)",
            "credit_limit": "Credit limit",
            "current_balance": "Current balance",
            "available_credit": "Available credit",
            "apr": "Annual percentage rate",
            "minimum_payment": "Minimum payment due",
            "due_date": "Payment due date",
            "account_type": "Account type (HELOC/Personal LOC/Business LOC)",
        },
    },
}


# ---------------------------------------------------------------------------
# Pydantic models -- dynamically created from DOC_SCHEMAS
# ---------------------------------------------------------------------------

class _ExtractionBase(BaseModel):
    """Base class for all extraction models."""
    model_config = ConfigDict(populate_by_name=True)


def _build_extraction_models() -> Dict[str, type]:
    """Create a Pydantic model per document type from DOC_SCHEMAS."""
    models: Dict[str, type] = {}
    for doc_key, schema_def in DOC_SCHEMAS.items():
        field_defs = {}
        for field_name, description in schema_def["fields"].items():
            if field_name == "class":
                field_defs["dl_class"] = (
                    Optional[str],
                    Field(None, alias="class", description=description),
                )
            else:
                field_defs[field_name] = (
                    Optional[str],
                    Field(None, description=description),
                )
        model_name = "".join(w.capitalize() for w in doc_key.split("_")) + "Fields"
        model = create_model(model_name, __base__=_ExtractionBase, **field_defs)
        models[doc_key] = model
    return models


DOC_MODELS = _build_extraction_models()


class _GenericField(BaseModel):
    key: str = Field(description="Field name in snake_case")
    value: str = Field(description="Extracted value")


class _GenericExtraction(BaseModel):
    """Fallback for unknown document types."""
    fields: List[_GenericField] = Field(
        default_factory=list,
        description="List of key-value pairs extracted from the document",
    )


# ---------------------------------------------------------------------------
# Text extraction -- image -> text via pytesseract, PDF -> text via PyMuPDF
# ---------------------------------------------------------------------------

def extract_text(content: bytes) -> str:
    """Extract raw text from an image, PDF, or text file."""
    if _is_pdf(content):
        return _extract_pdf_text(content)
    if _is_image(content):
        return _extract_image_text(content)
    try:
        text = content.decode("utf-8", errors="replace")
        if text.strip():
            return text.strip()
    except Exception:
        pass
    return ""


def _extract_image_text(content: bytes) -> str:
    """Dual-pass OCR on an image (preprocessed + raw)."""
    try:
        from PIL import Image, ImageFilter, ImageEnhance
        import pytesseract

        img_original = Image.open(io.BytesIO(content))

        # Pass 1: preprocessed
        img = img_original.copy()
        if img.mode != "L":
            img = img.convert("L")
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(2.0)
        img = img.filter(ImageFilter.SHARPEN)

        w, h = img.size
        if w < 1500 or h < 1500:
            scale = max(1500 / w, 1500 / h, 1.0)
            if scale > 1.0:
                img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

        configs = ["--psm 3 --oem 3", "--psm 6 --oem 3", "--psm 4 --oem 3"]
        best_text = ""
        for cfg in configs:
            try:
                text = pytesseract.image_to_string(img, config=cfg).strip()
                if len(text) > len(best_text):
                    best_text = text
            except Exception:
                continue

        # Pass 2: raw (no preprocessing)
        try:
            raw_text = pytesseract.image_to_string(img_original).strip()
        except Exception:
            raw_text = ""

        if best_text and raw_text:
            primary = best_text if len(best_text) >= len(raw_text) else raw_text
            secondary = raw_text if primary == best_text else best_text
            primary_upper = primary.upper()
            extra = [
                ln.strip()
                for ln in secondary.split("\n")
                if ln.strip()
                and ln.strip().upper() not in primary_upper
                and len(ln.strip()) > 2
            ]
            if extra:
                combined = primary + "\n--- ALT OCR ---\n" + "\n".join(extra)
                logger.info(f"OCR extracted {len(combined)} chars (dual-pass)")
                return combined
            logger.info(f"OCR extracted {len(primary)} chars")
            return primary
        result = best_text or raw_text
        if result:
            logger.info(f"OCR extracted {len(result)} chars")
            return result
        return pytesseract.image_to_string(img_original).strip()
    except Exception as e:
        logger.warning(f"Image OCR failed: {e}")
        return ""


def _extract_pdf_text(content: bytes) -> str:
    """Extract text from a PDF using PyMuPDF, with OCR fallback."""
    try:
        import fitz
        doc = fitz.open(stream=content, filetype="pdf")
        text_parts = []
        for page in doc:
            text_parts.append(page.get_text())
        doc.close()
        text = "\n".join(text_parts).strip()
        if text:
            logger.info(f"PDF text extraction: {len(text)} chars from {len(text_parts)} pages")
            return text
        logger.info("PDF has no text layer -- trying OCR on rendered pages")
        return _ocr_pdf_pages(content)
    except ImportError:
        logger.warning("PyMuPDF not installed -- cannot extract PDF text")
        return ""
    except Exception as e:
        logger.warning(f"PDF text extraction failed: {e}")
        return ""


def _ocr_pdf_pages(content: bytes) -> str:
    """OCR each page of a PDF by rendering to image."""
    try:
        import fitz
        import pytesseract
        from PIL import Image
        doc = fitz.open(stream=content, filetype="pdf")
        all_text = []
        for page in doc:
            pix = page.get_pixmap(dpi=300)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            text = pytesseract.image_to_string(img).strip()
            if text:
                all_text.append(text)
        doc.close()
        result = "\n\n".join(all_text)
        logger.info(f"PDF OCR: {len(result)} chars from {len(all_text)} pages")
        return result
    except Exception as e:
        logger.warning(f"PDF OCR failed: {e}")
        return ""


# ---------------------------------------------------------------------------
# Content type detection
# ---------------------------------------------------------------------------

def _is_image(content: bytes) -> bool:
    """Check if content is an image by magic bytes."""
    if not content or len(content) < 4:
        return False
    if content[:2] == b'\xff\xd8':
        return True
    if content[:4] == b'\x89PNG':
        return True
    if content[:4] == b'GIF8':
        return True
    if content[:2] == b'BM':
        return True
    if content[:4] == b'RIFF' and len(content) > 8 and content[8:12] == b'WEBP':
        return True
    try:
        from PIL import Image
        Image.open(io.BytesIO(content))
        return True
    except Exception:
        return False


def _is_pdf(content: bytes) -> bool:
    """Check if content is a PDF."""
    return len(content) >= 5 and content[:5] == b'%PDF-'


def _detect_mime(content: bytes) -> str:
    """Detect MIME type from content bytes."""
    if content[:2] == b'\xff\xd8':
        return "image/jpeg"
    if content[:4] == b'\x89PNG':
        return "image/png"
    if content[:4] == b'GIF8':
        return "image/gif"
    if content[:2] == b'BM':
        return "image/bmp"
    if content[:4] == b'RIFF' and len(content) > 8 and content[8:12] == b'WEBP':
        return "image/webp"
    if content[:5] == b'%PDF-':
        return "application/pdf"
    return "image/jpeg"


# ---------------------------------------------------------------------------
# Bedrock LLM extraction -- vision-capable models via Converse API
# ---------------------------------------------------------------------------

BEDROCK_MODELS = [
    "google.gemma-3-27b-it",                        # Vision + JSON, primary
    "us.amazon.nova-lite-v1:0",                     # Vision + JSON, fallback
    "us.meta.llama4-maverick-17b-instruct-v1:0",    # Vision-capable fallback
]

# Models that don't support image input — used only for the text/PDF path.
TEXT_ONLY_MODELS: set[str] = set()

MAX_RETRIES = 2
RETRY_DELAY = 3.0


def _bedrock_image_format(content: bytes) -> Optional[str]:
    """Map raw bytes to a Bedrock Converse image `format` string."""
    mime = _detect_mime(content)
    return {
        "image/jpeg": "jpeg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp",
    }.get(mime)


def _build_prompt(doc_key, schema, include_text=False, raw_text=""):
    """Build the extraction prompt for Gemini."""
    label = schema["label"] if schema else "document"
    field_list = ""
    if schema:
        field_list = "\n".join(f"  - {k}: {v}" for k, v in schema["fields"].items())

    prompt = (
        "You are a document data extraction system. "
        "Analyze this " + label + " and extract all fields.\n\n"
        "Expected fields:\n"
        + (field_list if field_list else "  Extract all key-value information found.")
        + "\n\n"
        "Rules:\n"
        "- Return the extracted value for each field exactly as it appears on the document.\n"
        "- For dates, use the format shown on the document.\n"
        "- For monetary values, include the currency symbol.\n"
        "- If a field is not present or unreadable, return null for that field.\n"
        "- Clean up OCR artifacts and fix obvious misspellings.\n"
        "- For names, return the full name in proper case."
    )

    if include_text and raw_text:
        truncated = raw_text[:3000]
        prompt += "\n\nOCR text (for additional reference):\n---\n" + truncated + "\n---"

    return prompt


async def extract_with_gemini(
    doc_key: str, content: bytes, raw_text: str
) -> Tuple[List[dict], Optional[str]]:
    """Extract document fields using AWS Bedrock vision LLMs (Converse API).

    Function name kept for backwards compatibility — implementation now uses
    Bedrock (Claude Haiku 4.5 → Nova Lite → Llama 4 Maverick).

    For images  -> vision content block + schema-aware prompt
    For text/PDF -> raw text + schema-aware prompt

    Returns (fields_list, warning_or_none).
    """
    schema = DOC_SCHEMAS.get(doc_key)

    empty_fields = []
    if schema:
        empty_fields = [
            {"key": k, "value": "", "label": v}
            for k, v in schema["fields"].items()
        ]

    try:
        from chat.ai_service import _get_bedrock_client
    except Exception as e:  # pragma: no cover
        logger.warning(f"Bedrock client import failed: {e}")
        return empty_fields, "Bedrock not available."

    try:
        client = _get_bedrock_client()
    except Exception as e:
        logger.warning(f"Bedrock client init failed: {e}")
        return empty_fields, "Bedrock client unavailable. Check AWS credentials."

    is_img = _is_image(content)
    img_format = _bedrock_image_format(content) if is_img else None
    model_cls = DOC_MODELS.get(doc_key)
    response_schema = (
        model_cls.model_json_schema() if model_cls else _GenericExtraction.model_json_schema()
    )

    base_prompt = _build_prompt(
        doc_key, schema,
        include_text=(is_img and bool(raw_text)),
        raw_text=raw_text if not is_img else raw_text,
    )
    # Append schema + strict JSON instruction so non-Claude models cooperate.
    json_prompt = (
        base_prompt
        + "\n\nRespond with ONLY a single valid JSON object (no markdown, no prose) "
          "matching this JSON schema:\n"
        + json.dumps(response_schema)
    )

    # Build a Converse content list. Vision-capable models accept image blocks;
    # if the format is unsupported (e.g. PDF), we fall back to text-only.
    if is_img and img_format:
        user_content = [
            {"image": {"format": img_format, "source": {"bytes": content}}},
            {"text": json_prompt},
        ]
    else:
        text_prompt = _build_prompt(
            doc_key, schema, include_text=True, raw_text=raw_text
        ) + (
            "\n\nRespond with ONLY a single valid JSON object (no markdown, no prose) "
            "matching this JSON schema:\n" + json.dumps(response_schema)
        )
        user_content = [{"text": text_prompt}]

    last_error: Optional[str] = None
    for model_name in BEDROCK_MODELS:
        # Skip text-only models when we're sending an image as the primary input.
        if is_img and img_format and model_name in TEXT_ONLY_MODELS:
            continue
        for attempt in range(MAX_RETRIES + 1):
            try:
                resp = client.converse(
                    modelId=model_name,
                    messages=[{"role": "user", "content": user_content}],
                    inferenceConfig={"maxTokens": 1500, "temperature": 0.1},
                )
                blocks = resp.get("output", {}).get("message", {}).get("content", [])
                result_text = "".join(
                    b.get("text", "") for b in blocks if isinstance(b, dict)
                ).strip()

                logger.info(f"Bedrock {model_name} raw response: {result_text[:500]}")

                parsed = _safe_json_parse(result_text)
                if not parsed:
                    logger.warning(f"Bedrock {model_name} returned unparseable response")
                    break  # try next model

                if model_cls and schema:
                    fields = _parsed_to_fields(parsed, schema)
                else:
                    fields = _generic_parsed_to_fields(parsed)

                warning = _validate_fields(doc_key, fields, schema)
                filled = sum(1 for f in fields if f.get("value"))
                logger.info(
                    f"Bedrock {model_name} extraction: {filled}/{len(fields)} fields"
                )
                return fields, warning

            except Exception as e:
                error_str = str(e)
                last_error = error_str
                throttled = (
                    "ThrottlingException" in error_str
                    or "TooManyRequests" in error_str
                    or "429" in error_str
                )
                if throttled and attempt < MAX_RETRIES:
                    delay = RETRY_DELAY * (attempt + 1)
                    logger.info(f"Bedrock throttled on {model_name}, retrying in {delay}s")
                    time.sleep(delay)
                    continue
                # Validation / model-not-found / vision-not-supported -> next model
                if (
                    "ValidationException" in error_str
                    or "AccessDeniedException" in error_str
                    or "ResourceNotFoundException" in error_str
                ):
                    logger.warning(f"Bedrock {model_name} unavailable: {error_str}")
                    break
                logger.error(f"Bedrock {model_name} error: {e}")
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY)
                    continue
                break

    logger.warning("All Bedrock models failed -- returning empty fields")
    return empty_fields, (
        "AI extraction unavailable right now"
        + (f" ({last_error[:120]})" if last_error else "")
        + ". Fields are empty -- please fill in manually or re-upload later."
    )


# ---------------------------------------------------------------------------
# Response parsing helpers
# ---------------------------------------------------------------------------

def _safe_json_parse(text):
    """Parse JSON from Gemini response, handling markdown fences."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [ln for ln in lines if not ln.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(cleaned[start:end])
            except json.JSONDecodeError:
                pass
    return None


def _parsed_to_fields(parsed, schema):
    """Convert Gemini parsed JSON into the standard field list format."""
    fields = []
    for k, desc in schema["fields"].items():
        val = parsed.get(k)
        if val is None and k == "class":
            val = parsed.get("dl_class")
        val_str = str(val).strip() if val else ""
        fields.append({"key": k, "value": val_str, "label": desc})
    return fields


def _generic_parsed_to_fields(parsed):
    """Convert a generic parsed dict into field list."""
    if "fields" in parsed and isinstance(parsed["fields"], list):
        return [
            {"key": item.get("key", ""), "value": str(item.get("value", ""))}
            for item in parsed["fields"]
            if item.get("value")
        ]
    return [
        {"key": k, "value": str(v)}
        for k, v in parsed.items()
        if v
    ]


def _validate_fields(doc_key, fields, schema):
    """Check extraction quality and return a warning if needed."""
    filled = sum(1 for f in fields if f.get("value"))
    if filled == 0:
        label = schema["label"] if schema else "document"
        return (
            "No data could be extracted. Please ensure you uploaded a "
            "clear image/scan of a " + label + "."
        )
    return None


# ---------------------------------------------------------------------------
# JSON persistence -- save / load extracted metadata
# ---------------------------------------------------------------------------

def save_document_json(doc_id, data):
    """Save document metadata as a JSON object in S3."""
    from storage import put_json

    serializable = {
        "id": data.get("id", doc_id),
        "filename": data.get("filename", ""),
        "extracted_fields": data.get("extracted_fields", []),
        "raw_text": data.get("raw_text", ""),
        "file_path": data.get("file_path", ""),
        "uploaded_at": (
            data.get("uploaded_at").isoformat() if data.get("uploaded_at") else None
        ),
        "doc_key": data.get("doc_key", ""),
        "doc_store": data.get("doc_store", ""),
    }

    json_key = f"documents-meta/{doc_id}.json"
    put_json(json_key, serializable)

    logger.info(f"Saved document metadata: {json_key}")
    return json_key


def load_all_document_jsons():
    """Load all persisted document metadata JSON objects from S3."""
    from storage import list_json

    results = list_json("documents-meta/")
    logger.info(f"Loaded {len(results)} persisted document records")
    return results
