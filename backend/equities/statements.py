"""
Financial statements builder — reads Alpha Vantage cached data.

Produces clean Income Statement, Balance Sheet, and Cash Flow Statement
in the format the frontend needs, with quarterly and annual views.
Replaces the old EDGAR XBRL-based approach with cleaner AV API data.
"""
from __future__ import annotations

import logging
from typing import Optional

from equities.alpha_vantage import _get_av_data

logger = logging.getLogger(__name__)


# ── AV field → (metric_key, display_label) mappings ──────────────────────────

INCOME_FIELDS = [
    ("totalRevenue", "Revenue", "Revenue"),
    ("costOfRevenue", "CostOfRevenue", "Cost of Revenue"),
    ("grossProfit", "GrossProfit", "Gross Profit"),
    ("researchAndDevelopment", "ResearchAndDevelopment", "Research & Development"),
    ("sellingGeneralAndAdministrative", "SellingGeneralAdmin", "Selling, General & Administrative"),
    ("operatingExpenses", "OperatingExpenses", "Operating Expenses"),
    ("operatingIncome", "OperatingIncome", "Operating Income"),
    ("interestIncome", "InterestIncome", "Interest Income"),
    ("interestExpense", "InterestExpense", "Interest Expense"),
    ("netInterestIncome", "NetInterestIncome", "Net Interest Income"),
    ("investmentIncomeNet", "InvestmentIncomeNet", "Investment Income, Net"),
    ("otherNonOperatingIncome", "OtherNonOperatingIncome", "Other Non-operating Income"),
    ("interestAndDebtExpense", "InterestAndDebtExpense", "Interest & Debt Expense"),
    ("nonInterestIncome", "NonInterestIncome", "Non-interest Income"),
    ("incomeBeforeTax", "PreTaxIncome", "Income Before Taxes"),
    ("incomeTaxExpense", "IncomeTaxExpense", "Income Tax Expense"),
    ("netIncomeFromContinuingOperations", "NetIncomeContinuingOperations", "Net Income from Continuing Operations"),
    ("netIncome", "NetIncome", "Net Income"),
    ("ebit", "EBIT", "EBIT"),
    ("ebitda", "EBITDA", "EBITDA"),
    ("depreciationAndAmortization", "DepreciationAmortization", "Depreciation & Amortization"),
]

BALANCE_FIELDS = [
    # Assets
    ("cashAndCashEquivalentsAtCarryingValue", "Cash", "Cash & Cash Equivalents"),
    ("cashAndShortTermInvestments", "CashAndShortTermInvestments", "Cash & Short-term Investments"),
    ("shortTermInvestments", "ShortTermInvestments", "Short-term Investments"),
    ("currentNetReceivables", "AccountsReceivable", "Accounts Receivable"),
    ("inventory", "Inventory", "Inventory"),
    ("otherCurrentAssets", "OtherCurrentAssets", "Other Current Assets"),
    ("totalCurrentAssets", "CurrentAssets", "Total Current Assets"),
    ("propertyPlantEquipment", "PropertyPlantEquipment", "Property, Plant & Equipment"),
    ("goodwill", "Goodwill", "Goodwill"),
    ("intangibleAssets", "IntangibleAssets", "Intangible Assets"),
    ("longTermInvestments", "LongTermInvestments", "Long-term Investments"),
    ("otherNonCurrentAssets", "OtherNonCurrentAssets", "Other Non-current Assets"),
    ("totalNonCurrentAssets", "NoncurrentAssets", "Total Non-current Assets"),
    ("totalAssets", "TotalAssets", "Total Assets"),
    # Liabilities
    ("currentAccountsPayable", "AccountsPayable", "Accounts Payable"),
    ("shortTermDebt", "ShortTermDebt", "Short-term Debt"),
    ("currentLongTermDebt", "CurrentLongTermDebt", "Current Portion of Long-term Debt"),
    ("deferredRevenue", "DeferredRevenue", "Deferred Revenue"),
    ("otherCurrentLiabilities", "OtherCurrentLiabilities", "Other Current Liabilities"),
    ("totalCurrentLiabilities", "CurrentLiabilities", "Total Current Liabilities"),
    ("longTermDebt", "LongTermDebt", "Long-term Debt"),
    ("capitalLeaseObligations", "CapitalLeaseObligations", "Capital Lease Obligations"),
    ("otherNonCurrentLiabilities", "OtherNonCurrentLiabilities", "Other Non-current Liabilities"),
    ("totalNonCurrentLiabilities", "NoncurrentLiabilities", "Total Non-current Liabilities"),
    ("totalLiabilities", "TotalLiabilities", "Total Liabilities"),
    # Equity
    ("commonStock", "CommonStock", "Common Stock"),
    ("retainedEarnings", "RetainedEarnings", "Retained Earnings"),
    ("treasuryStock", "TreasuryStock", "Treasury Stock"),
    ("totalShareholderEquity", "TotalEquity", "Total Stockholders' Equity"),
    ("commonStockSharesOutstanding", "SharesOutstanding", "Shares Outstanding"),
]

CASHFLOW_FIELDS = [
    ("operatingCashflow", "OperatingCashFlow", "Cash from Operations"),
    ("netIncome", "NetIncome", "Net Income"),
    ("depreciationDepletionAndAmortization", "DepreciationAmortization", "Depreciation & Amortization"),
    ("stockBasedCompensation", "StockBasedCompensation", "Stock-based Compensation"),
    ("changeInReceivables", "ChangeInReceivables", "Change in Receivables"),
    ("changeInInventory", "ChangeInInventory", "Change in Inventory"),
    ("changeInOperatingAssets", "ChangeInOperatingAssets", "Change in Operating Assets"),
    ("changeInOperatingLiabilities", "ChangeInOperatingLiabilities", "Change in Operating Liabilities"),
    ("paymentsForOperatingActivities", "PaymentsForOperatingActivities", "Payments for Operating Activities"),
    ("proceedsFromOperatingActivities", "ProceedsFromOperatingActivities", "Proceeds from Operating Activities"),
    ("capitalExpenditures", "CapitalExpenditures", "Capital Expenditures"),
    ("cashflowFromInvestment", "InvestingCashFlow", "Cash from Investing"),
    ("proceedsFromRepaymentsOfShortTermDebt", "ShortTermDebtRepayments", "Short-term Debt Repayments"),
    ("proceedsFromIssuanceOfLongTermDebtAndCapitalSecuritiesNet", "DebtIssuedNet", "Debt Issuance, Net"),
    ("proceedsFromIssuanceOfCommonStock", "CommonStockIssued", "Common Stock Issuance"),
    ("proceedsFromSaleOfTreasuryStock", "TreasuryStockSales", "Treasury Stock Sales"),
    ("cashflowFromFinancing", "FinancingCashFlow", "Cash from Financing"),
    ("dividendPayout", "DividendsPaid", "Dividends Paid"),
    ("proceedsFromRepurchaseOfEquity", "ShareRepurchases", "Share Repurchases"),
]


def _negative_cash_outflow(val: float) -> float:
    return -abs(val)


CASHFLOW_VALUE_TRANSFORMS = {
    "CapitalExpenditures": _negative_cash_outflow,
    "DividendsPaid": _negative_cash_outflow,
    "ShareRepurchases": _negative_cash_outflow,
    "ShortTermDebtRepayments": _negative_cash_outflow,
    "PaymentsForOperatingActivities": _negative_cash_outflow,
}


def _parse_av_value(val) -> Optional[float]:
    """Parse an AV string value to float. Returns None for 'None' or missing."""
    if val is None or val == "None" or val == "":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _format_value(val: float, metric_key: str) -> str:
    """Format a financial value for display."""
    if metric_key in ("EPSBasic", "EPSDiluted", "BookValuePerShare"):
        return f"{val:,.2f}"
    if metric_key == "SharesOutstanding":
        if abs(val) >= 1e9:
            return f"{val / 1e9:,.2f}B"
        if abs(val) >= 1e6:
            return f"{val / 1e6:,.1f}M"
        return f"{val:,.0f}"
    # USD — show in millions or billions
    if abs(val) >= 1e9:
        return f"{val / 1e9:,.2f}B"
    if abs(val) >= 1e6:
        return f"{val / 1e6:,.1f}M"
    if abs(val) >= 1e3:
        return f"{val / 1e3:,.1f}K"
    return f"{val:,.2f}"


def _build_statement_rows(
    fields: list[tuple[str, str, str]],
    reports: list[dict],
    value_transforms: Optional[dict[str, callable]] = None,
) -> list[dict]:
    """Build frontend statement rows from raw Alpha Vantage reports."""
    result_rows = []
    for av_key, metric_key, label in fields:
        values = {}
        formatted = {}
        for report in reports:
            period = report["fiscalDateEnding"]
            val = _parse_av_value(report.get(av_key))
            if val is not None:
                transform = value_transforms.get(metric_key) if value_transforms else None
                if transform is not None:
                    val = transform(val)
                values[period] = val
                formatted[period] = _format_value(val, metric_key)

        if values:
            result_rows.append({
                "metric": metric_key,
                "label": label,
                "values": values,
                "formatted": formatted,
                "unit": "USD",
            })

    return result_rows


def _add_derived_statement_row(
    rows: list[dict],
    periods: list[str],
    metric_key: str,
    label: str,
    total_metric: str,
    component_metrics: list[str],
    overwrite_existing: bool = False,
) -> None:
    rows_by_metric = {row["metric"]: row for row in rows}
    existing_row = rows_by_metric.get(metric_key)
    if existing_row and not overwrite_existing:
        return

    total_row = rows_by_metric.get(total_metric)
    if not total_row:
        return

    values = {}
    formatted = {}
    for period in periods:
        total_value = total_row["values"].get(period)
        if total_value is None:
            continue

        component_total = 0.0
        has_component = False
        for component_metric in component_metrics:
            component_row = rows_by_metric.get(component_metric)
            if not component_row:
                continue
            component_value = component_row["values"].get(period)
            if component_value is None:
                continue
            component_total += component_value
            has_component = True

        if not has_component:
            continue

        remainder = total_value - component_total
        if abs(remainder) <= 1:
            continue

        values[period] = remainder
        formatted[period] = _format_value(remainder, metric_key)

    if not values:
        return

    next_row = {
        "metric": metric_key,
        "label": label,
        "values": values,
        "formatted": formatted,
        "unit": "USD",
    }
    if existing_row:
        existing_row.update(next_row)
    else:
        rows.append(next_row)


def _apply_balance_sheet_reconciliations(rows: list[dict], periods: list[str]) -> list[dict]:
    # Alpha Vantage often omits the residual "other" rows even when subtotals imply them.
    _add_derived_statement_row(
        rows,
        periods,
        "OtherCurrentAssets",
        "Other Current Assets",
        "CurrentAssets",
        ["Cash", "ShortTermInvestments", "AccountsReceivable", "Inventory"],
        overwrite_existing=True,
    )
    _add_derived_statement_row(
        rows,
        periods,
        "OtherNonCurrentAssets",
        "Other Non-current Assets",
        "NoncurrentAssets",
        ["PropertyPlantEquipment", "Goodwill", "IntangibleAssets", "LongTermInvestments"],
    )
    _add_derived_statement_row(
        rows,
        periods,
        "OtherCurrentLiabilities",
        "Other Current Liabilities",
        "CurrentLiabilities",
        ["AccountsPayable", "ShortTermDebt", "DeferredRevenue"],
        overwrite_existing=True,
    )
    _add_derived_statement_row(
        rows,
        periods,
        "OtherNonCurrentLiabilities",
        "Other Non-current Liabilities",
        "NoncurrentLiabilities",
        ["LongTermDebt", "CapitalLeaseObligations"],
        overwrite_existing=True,
    )
    _add_derived_statement_row(
        rows,
        periods,
        "OtherEquity",
        "Other Equity",
        "TotalEquity",
        ["CommonStock", "RetainedEarnings", "TreasuryStock"],
    )
    return rows


def _apply_cashflow_reconciliations(rows: list[dict], periods: list[str]) -> list[dict]:
    _add_derived_statement_row(
        rows,
        periods,
        "OtherOperatingAdjustments",
        "Other Operating Adjustments",
        "OperatingCashFlow",
        [
            "NetIncome",
            "DepreciationAmortization",
            "StockBasedCompensation",
            "ChangeInReceivables",
            "ChangeInInventory",
            "ChangeInOperatingAssets",
            "ChangeInOperatingLiabilities",
            "PaymentsForOperatingActivities",
            "ProceedsFromOperatingActivities",
        ],
        overwrite_existing=True,
    )
    _add_derived_statement_row(
        rows,
        periods,
        "OtherInvestingActivities",
        "Other Investing Activities",
        "InvestingCashFlow",
        ["CapitalExpenditures"],
        overwrite_existing=True,
    )
    _add_derived_statement_row(
        rows,
        periods,
        "OtherFinancingActivities",
        "Other Financing Activities",
        "FinancingCashFlow",
        [
            "DividendsPaid",
            "ShareRepurchases",
            "ShortTermDebtRepayments",
            "DebtIssuedNet",
            "CommonStockIssued",
            "TreasuryStockSales",
        ],
        overwrite_existing=True,
    )
    return rows


def get_financial_statement(
    ticker: str,
    statement: str,  # 'income', 'balance', 'cashflow'
    period_type: str = "annual",  # 'annual' or 'quarterly'
    limit_periods: int = 10,
) -> dict:
    """
    Build a financial statement from cached Alpha Vantage data.

    Returns:
    {
        "ticker": "AAPL",
        "statement": "income",
        "period_type": "annual",
        "periods": ["2025-09-30", "2024-09-30", ...],
        "rows": [
            {
                "metric": "Revenue",
                "label": "Revenue",
                "values": {"2025-09-30": 416161000000, ...},
                "formatted": {"2025-09-30": "416.16B", ...},
                "unit": "USD"
            },
            ...
        ]
    }
    """
    ticker = ticker.upper()

    # Map statement type to AV function and field list
    if statement == "income":
        av_function = "INCOME_STATEMENT"
        fields = INCOME_FIELDS
    elif statement == "balance":
        av_function = "BALANCE_SHEET"
        fields = BALANCE_FIELDS
    elif statement == "cashflow":
        av_function = "CASH_FLOW"
        fields = CASHFLOW_FIELDS
    else:
        return {"ticker": ticker, "statement": statement, "period_type": period_type, "periods": [], "rows": []}

    data = _get_av_data(ticker, av_function)
    if not data:
        return {"ticker": ticker, "statement": statement, "period_type": period_type, "periods": [], "rows": []}

    # Select annual or quarterly reports
    if period_type == "annual":
        reports = data.get("annualReports", [])
    else:
        reports = data.get("quarterlyReports", [])

    if not reports:
        return {"ticker": ticker, "statement": statement, "period_type": period_type, "periods": [], "rows": []}

    # Limit periods
    reports = reports[:limit_periods]

    # Extract periods (fiscal date endings)
    periods = [r["fiscalDateEnding"] for r in reports]

    value_transforms = CASHFLOW_VALUE_TRANSFORMS if statement == "cashflow" else None
    result_rows = _build_statement_rows(fields, reports, value_transforms=value_transforms)
    if statement == "balance":
        result_rows = _apply_balance_sheet_reconciliations(result_rows, periods)
    elif statement == "cashflow":
        result_rows = _apply_cashflow_reconciliations(result_rows, periods)

    return {
        "ticker": ticker,
        "statement": statement,
        "period_type": period_type,
        "periods": periods,
        "rows": result_rows,
    }


def get_all_statements(ticker: str, period_type: str = "annual") -> dict:
    """Get all three financial statements for a company."""
    return {
        "income": get_financial_statement(ticker, "income", period_type),
        "balance": get_financial_statement(ticker, "balance", period_type),
        "cashflow": get_financial_statement(ticker, "cashflow", period_type),
    }


def get_financials_summary(ticker: str) -> Optional[dict]:
    """Quick summary of available financial data."""
    ticker = ticker.upper()

    overview = _get_av_data(ticker, "OVERVIEW")
    income = _get_av_data(ticker, "INCOME_STATEMENT")
    balance = _get_av_data(ticker, "BALANCE_SHEET")
    cashflow = _get_av_data(ticker, "CASH_FLOW")

    has_data = any([overview, income, balance, cashflow])
    if not has_data:
        return None

    annual_periods = 0
    quarterly_periods = 0
    if income:
        annual_periods = len(income.get("annualReports", []))
        quarterly_periods = len(income.get("quarterlyReports", []))

    latest_revenue = None
    latest_net_income = None
    if income and income.get("annualReports"):
        latest = income["annualReports"][0]
        latest_revenue = _parse_av_value(latest.get("totalRevenue"))
        latest_net_income = _parse_av_value(latest.get("netIncome"))

    return {
        "has_data": True,
        "source": "alpha_vantage",
        "annual_periods": annual_periods,
        "quarterly_periods": quarterly_periods,
        "has_overview": overview is not None,
        "has_income": income is not None,
        "has_balance": balance is not None,
        "has_cashflow": cashflow is not None,
        "latest_revenue": latest_revenue,
        "latest_net_income": latest_net_income,
    }
