"""Asset class definitions, document checklists, and identity documents.

Every asset type in the system is defined here with:
- key: unique identifier matching frontend route
- label: human-readable name
- description: brief description
- overview: paragraph explaining the asset type
- checklist: list of documents to upload
- create_fields: form fields for creating an instance
- name_template: pattern to auto-generate instance name
"""
from __future__ import annotations


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _item(key, label, desc, required=True, account_level=False):
    return {
        "key": key,
        "label": label,
        "description": desc,
        "required": required,
        "account_level": account_level,
    }


def _field(key, label, placeholder=""):
    return {"key": key, "label": label, "placeholder": placeholder}


# ---------------------------------------------------------------------------
# Account-level identity documents
# ---------------------------------------------------------------------------

ACCOUNT_DOCUMENTS = [
    {"key": "drivers_license", "label": "Driver's License", "description": "Government-issued driver's license."},
    {"key": "passport", "label": "Passport", "description": "Valid US or international passport."},
    {"key": "government_id", "label": "Government Photo ID", "description": "State-issued identification card."},
    {"key": "ssn_card", "label": "Social Security Card", "description": "Original or replacement SSN card."},
    {"key": "birth_certificate", "label": "Birth Certificate", "description": "Certified copy of birth certificate."},
    {"key": "marriage_certificate", "label": "Marriage Certificate", "description": "Certified copy of marriage certificate, if applicable."},
]


# =========================================================================
#   ASSET CLASS DEFINITIONS
# =========================================================================

ASSET_CLASSES = {

    # ── REAL ASSETS ──────────────────────────────────────────────────────

    "primary_home": {
        "key": "primary_home", "label": "Primary Home",
        "description": "Your primary residence — deed, mortgage, insurance, tax records.",
        "overview": "Your primary home is likely your most valuable asset. A complete document set covers chain of title, financing terms, insurance coverage, tax obligations, and property condition — essential for refinancing, sale, or estate planning.",
        "checklist": [
            _item("deed", "Property Deed", "Legal document proving ownership, recorded with the county."),
            _item("mortgage_agreement", "Mortgage Agreement", "Original mortgage/loan terms, interest rate, and amortization."),
            _item("closing_disclosure", "Closing Disclosure", "Final terms and costs of the real estate transaction (HUD-1/CD)."),
            _item("title_insurance_policy", "Title Insurance", "Protection against title defects, liens, or ownership disputes."),
            _item("homeowners_insurance", "Homeowners Insurance", "Dwelling, personal property, and liability coverage."),
            _item("property_tax", "Property Tax Records", "Annual tax assessment and payment history."),
            _item("appraisal_report", "Appraisal Report", "Professional property valuation.", required=False),
            _item("home_inspection", "Home Inspection Report", "Condition assessment at time of purchase.", required=False),
            _item("survey_plat", "Survey / Plat Map", "Property boundaries and lot dimensions.", required=False),
            _item("hoa_agreement", "HOA Documents", "CC&Rs, bylaws, and fee schedules (if applicable).", required=False),
            _item("government_id", "Government Photo ID", "Required for title transfer and mortgage.", account_level=True),
        ],
        "create_fields": [_field("address", "Address", "123 Main St, City, ST 00000")],
        "name_template": "{address}",
    },

    "rental_property": {
        "key": "rental_property", "label": "Rental Property",
        "description": "Investment properties generating rental income.",
        "overview": "Rental property documentation covers ownership, financing, tenant agreements, insurance, and tax records. Organized records are critical for tax deductions, insurance claims, and property management.",
        "checklist": [
            _item("deed", "Property Deed", "Legal title document recorded with the county."),
            _item("mortgage_agreement", "Mortgage Agreement", "Financing terms and amortization schedule."),
            _item("rental_lease", "Lease Agreement", "Current tenant lease — rent, terms, deposit."),
            _item("homeowners_insurance", "Landlord Insurance", "Property and liability coverage for rental."),
            _item("property_tax", "Property Tax Records", "Annual assessment and payment history."),
            _item("appraisal_report", "Appraisal / Valuation", "Current or most recent property valuation.", required=False),
            _item("property_management", "Property Management Agreement", "Terms with management company, if applicable.", required=False),
        ],
        "create_fields": [_field("address", "Address", "456 Oak Ave, City, ST 00000")],
        "name_template": "{address}",
    },

    "land": {
        "key": "land", "label": "Land",
        "description": "Vacant land, agricultural, or development parcels.",
        "overview": "Land ownership documentation covers the deed, tax records, survey data, and title insurance. Essential for development, sale, or estate purposes.",
        "checklist": [
            _item("deed", "Property Deed", "Legal title document."),
            _item("property_tax", "Property Tax Records", "Tax assessment and payment history."),
            _item("survey_plat", "Survey / Plat Map", "Property boundaries, dimensions, and easements."),
            _item("title_insurance_policy", "Title Insurance", "Protection against title defects.", required=False),
            _item("appraisal_report", "Appraisal / Valuation", "Land valuation.", required=False),
        ],
        "create_fields": [_field("location", "Location / Description", "County Rd 12, Austin TX")],
        "name_template": "{location}",
    },

    "vehicles": {
        "key": "vehicles", "label": "Vehicles",
        "description": "Cars, motorcycles, boats, aircraft — title, registration, insurance.",
        "overview": "Vehicle documentation protects ownership rights and ensures legal compliance. A complete set covers proof of ownership, registration, insurance, and financing. Organized records simplify insurance claims, resale, and tax reporting.",
        "checklist": [
            _item("vehicle_title", "Vehicle Title", "Certificate of title proving ownership."),
            _item("registration", "Registration", "Current state registration certificate."),
            _item("insurance_policy", "Insurance Policy", "Active auto insurance declarations page."),
            _item("loan_agreement", "Loan / Financing Agreement", "Financing terms and payoff schedule.", required=False),
            _item("bill_of_sale", "Bill of Sale", "Purchase agreement with price, date, and parties."),
            _item("lien_release", "Lien Release", "Proof that any lien is satisfied.", required=False),
            _item("inspection_report", "Inspection / Emissions", "State-required safety or emissions inspection.", required=False),
            _item("warranty_doc", "Warranty Documentation", "Manufacturer or extended warranty details.", required=False),
            _item("service_records", "Service Records", "Maintenance history and repair records.", required=False),
            _item("drivers_license", "Driver's License", "Required for registration and insurance.", account_level=True),
        ],
        "create_fields": [_field("year", "Year", "2024"), _field("make", "Make", "Honda"), _field("model", "Model", "Civic")],
        "name_template": "{year} {make} {model}",
    },

    "jewelry_art": {
        "key": "jewelry_art", "label": "Jewelry & Art",
        "description": "High-value personal property — appraisals, provenance, insurance riders.",
        "overview": "Fine jewelry and artwork require professional appraisals for insurance and estate purposes. Document provenance, condition, and any insurance riders that extend coverage beyond your standard homeowners policy.",
        "checklist": [
            _item("appraisal_report", "Appraisal Report", "Professional valuation with description and photos."),
            _item("purchase_receipt", "Purchase Receipt", "Original or secondary market purchase documentation."),
            _item("insurance_rider", "Insurance Rider / Floater", "Scheduled personal property endorsement."),
            _item("provenance_doc", "Provenance / Authentication", "Documentation of origin, ownership history, or COA.", required=False),
        ],
        "create_fields": [_field("description", "Item Description", "Diamond engagement ring, 2.1ct")],
        "name_template": "{description}",
    },

    "collectibles": {
        "key": "collectibles", "label": "Collectibles",
        "description": "Watches, wine, vintage items — authentication and valuation.",
        "overview": "Collectibles need proof of authenticity and current valuation for insurance and estate purposes. Keep purchase receipts, authentication certificates, and periodic appraisals.",
        "checklist": [
            _item("appraisal_report", "Appraisal / Valuation", "Current market valuation."),
            _item("purchase_receipt", "Purchase Receipt", "Original purchase documentation."),
            _item("authentication_cert", "Authentication Certificate", "COA or third-party authentication.", required=False),
            _item("insurance_rider", "Insurance Rider", "Scheduled personal property endorsement.", required=False),
        ],
        "create_fields": [_field("description", "Item Description", "1952 Topps Mickey Mantle PSA 8")],
        "name_template": "{description}",
    },

    "precious_metals": {
        "key": "precious_metals", "label": "Precious Metals",
        "description": "Physical gold, silver, platinum — purchase receipts, storage records.",
        "overview": "Physical precious metals need purchase documentation for cost basis, storage/vault records, and assay certificates for authenticity.",
        "checklist": [
            _item("purchase_receipt", "Purchase Receipt", "Dealer receipt with price, quantity, and date."),
            _item("storage_receipt", "Storage / Vault Receipt", "Safe deposit box or vault storage confirmation."),
            _item("assay_cert", "Assay Certificate", "Purity and weight certification.", required=False),
        ],
        "create_fields": [_field("metal", "Metal Type", "Gold"), _field("description", "Description", "10x 1oz American Eagle coins")],
        "name_template": "{metal} — {description}",
    },

    # ── FINANCIAL ASSETS ─────────────────────────────────────────────────

    "checking": {
        "key": "checking", "label": "Checking Accounts",
        "description": "Day-to-day banking — statements, routing info.",
        "overview": "Keep recent statements for each checking account. Useful for proof of funds, direct deposit setup, and tracking spending patterns.",
        "checklist": [
            _item("bank_statement", "Bank Statement", "Most recent monthly or quarterly statement."),
            _item("void_check", "Voided Check", "Shows routing and account numbers.", required=False),
        ],
        "create_fields": [_field("bank", "Bank", "Chase"), _field("last4", "Last 4 Digits", "1234")],
        "name_template": "{bank} Checking (...{last4})",
    },

    "savings": {
        "key": "savings", "label": "Savings Accounts",
        "description": "Savings, money market, high-yield accounts.",
        "overview": "Savings account statements document your liquid reserves and interest earned. Essential for mortgage applications and proof of funds.",
        "checklist": [
            _item("bank_statement", "Account Statement", "Most recent statement showing balance and interest."),
        ],
        "create_fields": [_field("bank", "Bank", "Ally"), _field("type", "Account Type", "High-Yield Savings")],
        "name_template": "{bank} {type}",
    },

    "brokerage": {
        "key": "brokerage", "label": "Brokerage Accounts",
        "description": "Stocks, ETFs, bonds, options — statements, tax lots.",
        "overview": "Brokerage statements track portfolio value, positions, dividends, and realized gains. Important for tax reporting and net worth tracking.",
        "checklist": [
            _item("brokerage_statement", "Account Statement", "Monthly or quarterly statement with holdings."),
            _item("tax_1099", "1099-B / 1099-DIV", "Annual tax forms for gains, dividends, interest.", required=False),
            _item("trade_confirmation", "Trade Confirmations", "Confirmation of specific trades (for cost basis).", required=False),
        ],
        "create_fields": [_field("broker", "Broker", "Fidelity"), _field("name", "Account Name", "Individual Brokerage")],
        "name_template": "{broker} — {name}",
    },

    "retirement_401k": {
        "key": "retirement_401k", "label": "401(k) Accounts",
        "description": "Employer-sponsored retirement — contributions, beneficiaries.",
        "overview": "401(k) statements show your balance, contributions, employer match, vesting, and investment allocation. Keep beneficiary designations current.",
        "checklist": [
            _item("retirement_statement", "Account Statement", "Most recent quarterly or annual statement."),
            _item("beneficiary_form", "Beneficiary Designation", "Current beneficiary and contingent beneficiary forms."),
            _item("plan_summary", "Plan Summary / SPD", "Summary Plan Description with contribution limits and rules.", required=False),
        ],
        "create_fields": [_field("administrator", "Administrator", "Fidelity"), _field("employer", "Employer", "Google")],
        "name_template": "{employer} 401(k) — {administrator}",
    },

    "ira": {
        "key": "ira", "label": "IRA Accounts",
        "description": "Traditional, Roth, SEP, SIMPLE — contributions, RMD tracking.",
        "overview": "IRA statements track balance, contributions, and investment performance. Contribution records are critical for Roth conversions, backdoor Roth strategies, and required minimum distributions.",
        "checklist": [
            _item("retirement_statement", "Account Statement", "Most recent statement with balance and holdings."),
            _item("contribution_record", "Contribution Records", "Annual contribution amounts and types (pre-tax/Roth)."),
            _item("beneficiary_form", "Beneficiary Designation", "Primary and contingent beneficiary forms."),
        ],
        "create_fields": [_field("custodian", "Custodian", "Schwab"), _field("ira_type", "IRA Type", "Roth IRA")],
        "name_template": "{ira_type} — {custodian}",
    },

    "pension": {
        "key": "pension", "label": "Pension",
        "description": "Defined benefit pension documentation and payout projections.",
        "overview": "Pension statements show your accrued benefit, projected payout, vesting status, and years of credited service. Essential for retirement planning.",
        "checklist": [
            _item("pension_statement", "Pension Statement", "Annual or periodic benefit statement."),
            _item("beneficiary_form", "Beneficiary Designation", "Survivor benefit designations.", required=False),
        ],
        "create_fields": [_field("plan", "Plan Name", "State Teachers' Pension"), _field("employer", "Employer", "CA Dept of Education")],
        "name_template": "{employer} Pension",
    },

    "private_investments": {
        "key": "private_investments", "label": "Private Investments",
        "description": "VC, angel, syndicates, private equity — subscription docs, K-1s.",
        "overview": "Private investment documents include subscription agreements, capital call notices, and K-1 tax forms. These are critical for tax reporting and tracking illiquid holdings.",
        "checklist": [
            _item("subscription_agreement", "Subscription Agreement", "Initial investment terms and commitments."),
            _item("k1_form", "K-1 Form", "Annual Schedule K-1 for partnership income/losses."),
            _item("capital_call_notice", "Capital Call Notices", "Records of capital calls and distributions.", required=False),
        ],
        "create_fields": [_field("fund_name", "Fund / Company", "XYZ Ventures Fund III")],
        "name_template": "{fund_name}",
    },

    "crypto": {
        "key": "crypto", "label": "Crypto & Digital",
        "description": "Wallets, exchange accounts — transaction history, tax basis.",
        "overview": "Crypto documentation covers exchange account statements, wallet addresses, and transaction history. Essential for tax reporting (cost basis tracking) and account recovery.",
        "checklist": [
            _item("exchange_statement", "Exchange Statement", "Account balance and transaction history from exchange."),
            _item("transaction_history", "Transaction History", "Full transaction log for tax reporting."),
            _item("wallet_record", "Wallet Backup", "Wallet addresses, seed phrase backup confirmation.", required=False),
        ],
        "create_fields": [_field("platform", "Exchange / Wallet", "Coinbase"), _field("name", "Account Name", "Main Trading")],
        "name_template": "{platform} — {name}",
    },

    "education_529": {
        "key": "education_529", "label": "529 Education Savings",
        "description": "College savings plans — beneficiary info, contributions.",
        "overview": "529 plan statements track balance, contributions, and investment performance. Keep beneficiary designations current. Contributions may be deductible in some states.",
        "checklist": [
            _item("plan_529_statement", "Plan Statement", "Most recent account statement."),
            _item("beneficiary_form", "Beneficiary Designation", "Named beneficiary and successor.", required=False),
        ],
        "create_fields": [_field("plan", "Plan Name", "NY 529 Direct Plan"), _field("beneficiary", "Beneficiary", "John Smith Jr.")],
        "name_template": "529 — {plan} ({beneficiary})",
    },

    "hsa": {
        "key": "hsa", "label": "HSA Accounts",
        "description": "Health savings accounts — contributions, eligible expenses.",
        "overview": "HSA accounts offer triple tax advantages. Track contributions (employee + employer), investment balance, and keep receipts for qualified medical expenses.",
        "checklist": [
            _item("hsa_statement", "Account Statement", "Balance, contributions, and investment summary."),
            _item("eligible_expenses", "Eligible Expense Receipts", "Medical expense receipts for tax-free withdrawals.", required=False),
        ],
        "create_fields": [_field("custodian", "Custodian", "Optum Bank")],
        "name_template": "HSA — {custodian}",
    },

    # ── EDUCATION & CAREER ───────────────────────────────────────────────

    "education": {
        "key": "education", "label": "Education Records",
        "description": "Transcripts, diplomas, and professional certifications.",
        "overview": "Academic records document your educational background — degrees, GPAs, and professional certifications. Important for employment verification, professional licensing, and graduate school applications.",
        "checklist": [
            _item("transcript", "Transcript", "Official or unofficial academic transcript."),
            _item("diploma", "Diploma / Degree Certificate", "Physical or digital copy of diploma."),
            _item("certification_doc", "Professional Certification", "Industry certifications (CPA, PMP, etc.).", required=False),
        ],
        "create_fields": [_field("school", "School / Institution", "UC Berkeley"), _field("degree", "Degree / Program", "BS Computer Science")],
        "name_template": "{school} — {degree}",
    },

    "income_tax": {
        "key": "income_tax", "label": "W-2 / Tax Documents",
        "description": "W-2 forms, 1099s, pay stubs — per employer and tax year.",
        "overview": "Income tax documents are essential for annual tax filing, income verification, and mortgage applications. Upload W-2s, 1099s, and pay stubs for each employer and tax year.",
        "checklist": [
            _item("w2_form", "W-2 Form", "Annual wage and tax statement from employer."),
            _item("form_1099", "1099 Form", "1099-MISC, 1099-NEC, 1099-INT, or other 1099 variant.", required=False),
            _item("pay_stub", "Pay Stub", "Recent pay stub showing earnings, deductions, YTD totals.", required=False),
        ],
        "create_fields": [_field("year", "Tax Year", "2024"), _field("employer", "Employer", "Google Inc.")],
        "name_template": "{year} — {employer}",
    },

    "social_security": {
        "key": "social_security", "label": "Social Security",
        "description": "Social Security statement and benefit estimates.",
        "overview": "Your Social Security statement shows estimated retirement benefits at ages 62, full retirement age, and 70 — plus your full earnings history. Download from ssa.gov or upload a mailed statement.",
        "checklist": [
            _item("ss_statement", "Social Security Statement", "Annual statement from SSA showing estimated benefits and earnings.", required=False),
        ],
        "create_fields": [_field("year", "Statement Year", "2024")],
        "name_template": "SSA Statement {year}",
    },

    # ── EMPLOYMENT & COMPENSATION ────────────────────────────────────────

    "rsus": {
        "key": "rsus", "label": "RSUs",
        "description": "Restricted stock units — vesting schedules, grant letters.",
        "overview": "RSU documentation covers grant letters, vesting schedules, and tax withholding. Track vesting dates and FMV at vest for tax reporting.",
        "checklist": [
            _item("stock_grant_letter", "Grant Letter", "RSU grant agreement with shares, vesting schedule, and terms."),
            _item("vesting_schedule", "Vesting Schedule", "Detailed vesting dates and share amounts."),
            _item("tax_withholding", "Tax Withholding Records", "Tax withheld at vest date.", required=False),
        ],
        "create_fields": [_field("company", "Company", "Google"), _field("grant_date", "Grant Date", "2024-01-15")],
        "name_template": "{company} RSUs ({grant_date})",
    },

    "stock_options": {
        "key": "stock_options", "label": "Stock Options",
        "description": "ISOs, NSOs — grant price, vesting, exercise windows.",
        "overview": "Stock option documentation covers grant agreements, exercise prices, vesting schedules, and exercise history. ISOs vs NSOs have different tax treatment.",
        "checklist": [
            _item("stock_grant_letter", "Option Grant Agreement", "Grant letter with strike price, shares, and vesting."),
            _item("exercise_record", "Exercise Records", "Records of exercised options, dates, and prices."),
            _item("eighty_three_b", "83(b) Election", "Filed 83(b) election form, if applicable.", required=False),
        ],
        "create_fields": [_field("company", "Company", "Startup Inc."), _field("grant_date", "Grant Date", "2024-01-15")],
        "name_template": "{company} Options ({grant_date})",
    },

    "espp": {
        "key": "espp", "label": "ESPP",
        "description": "Employee stock purchase plan — enrollment, discount terms.",
        "overview": "ESPP documents include enrollment confirmations and purchase confirmations. Important for tracking cost basis and qualifying vs disqualifying dispositions.",
        "checklist": [
            _item("espp_enrollment", "ESPP Enrollment", "Enrollment confirmation with contribution rate and discount."),
            _item("purchase_confirmation", "Purchase Confirmations", "Share purchase records with dates and prices."),
        ],
        "create_fields": [_field("company", "Company", "Google")],
        "name_template": "{company} ESPP",
    },

    "deferred_comp": {
        "key": "deferred_comp", "label": "Deferred Compensation",
        "description": "Non-qualified deferred comp — election forms, payouts.",
        "overview": "Deferred compensation plans allow you to defer salary or bonuses. Document your elections, distribution schedules, and investment choices.",
        "checklist": [
            _item("deferred_comp_election", "Deferral Election", "Annual election form specifying deferral amount and timing."),
            _item("distribution_schedule", "Distribution Schedule", "Planned payout schedule and investment allocations.", required=False),
        ],
        "create_fields": [_field("company", "Company", "Goldman Sachs")],
        "name_template": "{company} Deferred Comp",
    },

    "employment_contract": {
        "key": "employment_contract", "label": "Employment Contracts",
        "description": "Offer letters, non-compete, severance terms.",
        "overview": "Employment documentation includes offer letters with compensation terms, non-compete/non-solicitation agreements, and severance provisions.",
        "checklist": [
            _item("offer_letter", "Offer Letter", "Employment offer with salary, equity, benefits, and start date."),
            _item("employment_agreement", "Employment Agreement", "Signed employment contract or terms.", required=False),
            _item("non_compete", "Non-Compete / NDA", "Restrictive covenants and confidentiality agreements.", required=False),
        ],
        "create_fields": [_field("company", "Company", "Google"), _field("position", "Position", "Senior Engineer")],
        "name_template": "{company} — {position}",
    },

    # ── INSURANCE POLICIES ───────────────────────────────────────────────

    "life_insurance": {
        "key": "life_insurance", "label": "Life Insurance",
        "description": "Term, whole, universal — policy details, beneficiaries.",
        "overview": "Life insurance documentation covers policy type, death benefit, premium, beneficiary designations, and cash value (for permanent policies).",
        "checklist": [
            _item("life_insurance_policy", "Insurance Policy", "Policy document with death benefit, premium, and terms."),
            _item("beneficiary_form", "Beneficiary Designation", "Primary and contingent beneficiary forms."),
        ],
        "create_fields": [_field("insurer", "Insurance Company", "Northwestern Mutual"), _field("type", "Policy Type", "Term 20-Year")],
        "name_template": "{insurer} Life ({type})",
    },

    "health_insurance": {
        "key": "health_insurance", "label": "Health Insurance",
        "description": "Medical, dental, vision — plan details, ID card.",
        "overview": "Health insurance documentation includes your insurance card (member ID, group number), plan details (copays, deductibles, out-of-pocket max), and network information.",
        "checklist": [
            _item("health_insurance_card", "Insurance Card", "Front and back of insurance card with member ID."),
            _item("plan_document", "Plan Summary / EOB", "Plan details, covered services, and exclusions.", required=False),
        ],
        "create_fields": [_field("insurer", "Insurance Company", "Blue Cross"), _field("plan", "Plan Name", "PPO Gold")],
        "name_template": "{insurer} — {plan}",
    },

    "disability_insurance": {
        "key": "disability_insurance", "label": "Disability Insurance",
        "description": "Short-term, long-term disability coverage.",
        "overview": "Disability insurance replaces income if you can't work. Document your monthly benefit amount, elimination period, and coverage definition.",
        "checklist": [
            _item("disability_policy", "Disability Policy", "Policy document with benefit amount, terms, and definitions."),
        ],
        "create_fields": [_field("insurer", "Insurance Company", "Unum")],
        "name_template": "{insurer} Disability",
    },

    "auto_insurance": {
        "key": "auto_insurance", "label": "Auto Insurance",
        "description": "Liability, collision, comprehensive — declarations page.",
        "overview": "Auto insurance declarations page shows your coverage limits, deductibles, premium, and covered vehicles.",
        "checklist": [
            _item("insurance_policy", "Declarations Page", "Insurance declarations showing coverage, limits, and premium."),
        ],
        "create_fields": [_field("insurer", "Insurance Company", "State Farm"), _field("vehicle", "Vehicle(s)", "2024 Honda Civic")],
        "name_template": "{insurer} Auto ({vehicle})",
    },

    "home_insurance": {
        "key": "home_insurance", "label": "Home / Renters Insurance",
        "description": "Dwelling, personal property, liability coverage.",
        "overview": "Home or renters insurance covers your dwelling, personal property, and liability. Document your coverage amounts, deductible, and any riders for valuable items.",
        "checklist": [
            _item("homeowners_insurance", "Insurance Policy", "Policy declarations with coverage amounts and premium."),
        ],
        "create_fields": [_field("insurer", "Insurance Company", "Allstate"), _field("property", "Property", "123 Main St")],
        "name_template": "{insurer} Home ({property})",
    },

    "umbrella_insurance": {
        "key": "umbrella_insurance", "label": "Umbrella Liability",
        "description": "Excess liability coverage above primary policies.",
        "overview": "Umbrella insurance provides extra liability coverage above auto, home, and other primary policies.",
        "checklist": [
            _item("insurance_policy", "Umbrella Policy", "Policy document with coverage limit and underlying requirements."),
        ],
        "create_fields": [_field("insurer", "Insurance Company", "USAA")],
        "name_template": "{insurer} Umbrella",
    },

    # ── LEGAL & ESTATE ───────────────────────────────────────────────────

    "will": {
        "key": "will", "label": "Will",
        "description": "Last will and testament — executor, witnesses.",
        "overview": "Your will directs how assets are distributed after death. Document the testator, named executor, alternate executor, witnesses, and date executed.",
        "checklist": [
            _item("will_document", "Will Document", "Signed last will and testament."),
        ],
        "create_fields": [_field("name", "Description", "My Last Will and Testament")],
        "name_template": "{name}",
    },

    "trust": {
        "key": "trust", "label": "Trust Documents",
        "description": "Revocable, irrevocable — trust agreement, trustee designations.",
        "overview": "Trust documents establish how assets are managed and distributed. Document the trust type, grantor, trustee, successor trustee, and beneficiaries.",
        "checklist": [
            _item("trust_document", "Trust Agreement", "Complete trust agreement with all amendments."),
            _item("schedule_a", "Schedule A (Funded Assets)", "List of assets transferred into the trust.", required=False),
        ],
        "create_fields": [_field("name", "Trust Name", "Smith Family Trust"), _field("type", "Trust Type", "Revocable Living Trust")],
        "name_template": "{name}",
    },

    "power_of_attorney": {
        "key": "power_of_attorney", "label": "Power of Attorney",
        "description": "Financial and general POA — agent designations.",
        "overview": "A Power of Attorney authorizes someone to act on your behalf. Document the type, named agent, and whether it's durable or springing.",
        "checklist": [
            _item("poa_document", "Power of Attorney Document", "Signed POA with agent designation and scope."),
        ],
        "create_fields": [_field("agent", "Agent Name", "Jane Smith"), _field("type", "POA Type", "Financial")],
        "name_template": "POA — {agent} ({type})",
    },

    "healthcare_directive": {
        "key": "healthcare_directive", "label": "Healthcare Directive",
        "description": "Living will, healthcare proxy — treatment preferences.",
        "overview": "A healthcare directive documents your treatment preferences and designates a healthcare agent to make medical decisions if you're unable to.",
        "checklist": [
            _item("healthcare_directive_doc", "Healthcare Directive", "Signed living will and healthcare proxy."),
        ],
        "create_fields": [_field("name", "Description", "My Healthcare Directive")],
        "name_template": "{name}",
    },

    "beneficiary_designations": {
        "key": "beneficiary_designations", "label": "Beneficiary Designations",
        "description": "Cross-reference for all accounts — 401k, IRA, insurance.",
        "overview": "Beneficiary designations on financial accounts override your will. Keep a master list and review after major life events.",
        "checklist": [
            _item("beneficiary_form", "Beneficiary Form", "Beneficiary designation form for a specific account."),
        ],
        "create_fields": [_field("account", "Account", "Fidelity 401(k)")],
        "name_template": "Beneficiaries — {account}",
    },

    "business_ownership": {
        "key": "business_ownership", "label": "Business Ownership",
        "description": "Ownership interests, buy-sell agreements, succession.",
        "overview": "Document your ownership interests in any business entity. Include ownership agreements, buy-sell agreements, succession plans, and valuations.",
        "checklist": [
            _item("ownership_docs", "Ownership Documentation", "Operating agreement, stock certificates, or membership interests."),
            _item("buy_sell_agreement", "Buy-Sell Agreement", "Agreement governing transfer/sale of ownership interests.", required=False),
            _item("valuation_report", "Business Valuation", "Professional valuation for estate or tax purposes.", required=False),
        ],
        "create_fields": [_field("entity", "Business / Entity", "Smith Holdings LLC")],
        "name_template": "{entity}",
    },

    # ── BUSINESS INTERESTS ───────────────────────────────────────────────

    "llc_formation": {
        "key": "llc_formation", "label": "LLC / Corp Formation",
        "description": "Articles of organization, EIN, operating agreements.",
        "overview": "Formation documents establish the legal existence of your business entity. Include articles of organization/incorporation, EIN assignment letter, and initial operating agreement.",
        "checklist": [
            _item("articles_of_organization", "Articles of Organization", "Filed articles with the state."),
            _item("ein_letter", "EIN Assignment Letter", "IRS letter assigning your Employer Identification Number."),
            _item("operating_agreement_doc", "Operating Agreement / Bylaws", "Governance document for the entity."),
        ],
        "create_fields": [_field("name", "Entity Name", "Smith Holdings LLC"), _field("state", "State", "Delaware")],
        "name_template": "{name} ({state})",
    },

    "operating_agreement": {
        "key": "operating_agreement", "label": "Operating Agreements",
        "description": "Member duties, profit distribution, dissolution terms.",
        "overview": "The operating agreement governs member relationships, profit/loss allocation, management structure, voting rights, and dissolution procedures.",
        "checklist": [
            _item("operating_agreement_doc", "Operating Agreement", "Complete agreement with all amendments."),
        ],
        "create_fields": [_field("entity", "Entity Name", "Smith Holdings LLC")],
        "name_template": "{entity} Operating Agreement",
    },

    "cap_table": {
        "key": "cap_table", "label": "Cap Tables",
        "description": "Ownership percentages, share classes, dilution history.",
        "overview": "Cap table documentation tracks ownership stakes, share classes, option pools, convertible instruments, and dilution over funding rounds.",
        "checklist": [
            _item("cap_table_doc", "Cap Table", "Current capitalization table with all share classes."),
        ],
        "create_fields": [_field("company", "Company", "Startup Inc.")],
        "name_template": "{company} Cap Table",
    },

    "partnership_agreements": {
        "key": "partnership_agreements", "label": "Partnership Agreements",
        "description": "Partnership terms, capital contributions, profit splits.",
        "overview": "Partnership agreements define the terms between partners — capital contributions, profit/loss allocation, management responsibilities, and exit provisions.",
        "checklist": [
            _item("partnership_agreement_doc", "Partnership Agreement", "Complete partnership agreement."),
        ],
        "create_fields": [_field("name", "Partnership Name", "Smith & Jones Partners")],
        "name_template": "{name}",
    },

    # ── DEBT OBLIGATIONS ─────────────────────────────────────────────────

    "mortgage": {
        "key": "mortgage", "label": "Mortgage",
        "description": "Rate, term, amortization, escrow, payoff amount.",
        "overview": "Mortgage documentation covers the original loan agreement, current statement, and amortization schedule. Track your principal balance, interest rate, escrow, and payoff timeline.",
        "checklist": [
            _item("mortgage_statement", "Mortgage Statement", "Most recent monthly statement with balance and payment."),
            _item("mortgage_agreement", "Loan Agreement", "Original mortgage terms, rate, and amortization schedule."),
            _item("amortization_schedule", "Amortization Schedule", "Full payment schedule showing principal/interest split.", required=False),
        ],
        "create_fields": [_field("lender", "Lender", "Wells Fargo"), _field("property", "Property", "123 Main St")],
        "name_template": "{lender} Mortgage ({property})",
    },

    "student_loans": {
        "key": "student_loans", "label": "Student Loans",
        "description": "Federal, private — servicer info, repayment plan.",
        "overview": "Student loan documentation covers servicer info, loan type, balance, interest rate, repayment plan, and forgiveness eligibility.",
        "checklist": [
            _item("student_loan_statement", "Loan Statement", "Most recent statement with balance, rate, and payment."),
            _item("repayment_plan", "Repayment Plan", "Current repayment plan details and eligibility.", required=False),
        ],
        "create_fields": [_field("servicer", "Servicer", "Nelnet"), _field("type", "Loan Type", "Federal Direct")],
        "name_template": "{servicer} — {type}",
    },

    "auto_loans": {
        "key": "auto_loans", "label": "Auto Loans",
        "description": "Rate, term, payoff schedule, GAP insurance.",
        "overview": "Auto loan documentation covers financing terms, payment schedule, and payoff amount.",
        "checklist": [
            _item("loan_agreement", "Loan Agreement", "Financing terms, rate, and payment schedule."),
            _item("gap_insurance", "GAP Insurance", "GAP coverage documentation, if applicable.", required=False),
        ],
        "create_fields": [_field("lender", "Lender", "Capital One Auto"), _field("vehicle", "Vehicle", "2024 Honda Civic")],
        "name_template": "{lender} Auto Loan ({vehicle})",
    },

    "personal_loans": {
        "key": "personal_loans", "label": "Personal Loans",
        "description": "Unsecured loans — rate, term, payoff projections.",
        "overview": "Personal loan documentation covers the loan agreement, interest rate, repayment schedule, and payoff amount.",
        "checklist": [
            _item("loan_agreement", "Loan Agreement", "Loan terms, rate, and repayment schedule."),
        ],
        "create_fields": [_field("lender", "Lender", "SoFi")],
        "name_template": "{lender} Personal Loan",
    },

    "credit_lines": {
        "key": "credit_lines", "label": "Credit Lines",
        "description": "HELOC, personal LOC, business LOC — limits, draws, rates.",
        "overview": "Credit line documentation covers the credit limit, current balance, interest rate, draw period, and repayment terms.",
        "checklist": [
            _item("credit_line_statement", "Credit Line Statement", "Most recent statement with balance, limit, and rate."),
        ],
        "create_fields": [_field("lender", "Lender", "Chase"), _field("type", "Type", "HELOC")],
        "name_template": "{lender} {type}",
    },
}