"""
Financial ratio computation engine.

Uses Alpha Vantage cached data (OVERVIEW for pre-computed ratios,
statements for raw financial data) + yfinance price data.
"""
from __future__ import annotations

import logging
from typing import Optional

from equities.alpha_vantage import _get_av_data
from equities.db import get_db

logger = logging.getLogger(__name__)


def _av_float(data: Optional[dict], key: str) -> Optional[float]:
    """Extract a float value from an AV response dict."""
    if not data:
        return None
    val = data.get(key)
    if val is None or val == "None" or val == "-" or val == "":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _get_latest_report(data: Optional[dict], period_type: str = "annual") -> Optional[dict]:
    """Get the most recent report from an AV statement response."""
    if not data:
        return None
    key = "annualReports" if period_type == "annual" else "quarterlyReports"
    reports = data.get(key, [])
    return reports[0] if reports else None


def _get_reports(data: Optional[dict], period_type: str = "annual", n: int = 10) -> list[dict]:
    """Get the last n reports from an AV statement response."""
    if not data:
        return []
    key = "annualReports" if period_type == "annual" else "quarterlyReports"
    return data.get(key, [])[:n]


def _report_float(report: Optional[dict], key: str) -> Optional[float]:
    """Extract float from a single AV report."""
    return _av_float(report, key)


def _ttm_from_quarterly(data: Optional[dict], key: str) -> Optional[float]:
    """Sum the last 4 quarters for a TTM value."""
    reports = _get_reports(data, "quarterly", 4)
    if len(reports) < 4:
        return None
    vals = [_report_float(r, key) for r in reports]
    if any(v is None for v in vals):
        return None
    return sum(vals)


def _safe_div(a: Optional[float], b: Optional[float]) -> Optional[float]:
    if a is None or b is None or b == 0:
        return None
    return a / b


def _cagr(start: float, end: float, years: int) -> Optional[float]:
    if start <= 0 or end <= 0 or years <= 0:
        return None
    return ((end / start) ** (1 / years) - 1) * 100


def compute_ratios(ticker: str) -> dict:
    """
    Compute all financial ratios for a ticker using Alpha Vantage data.
    Returns dict organized by category.
    """
    ticker = ticker.upper()

    # Load cached AV data
    overview = _get_av_data(ticker, "OVERVIEW")
    income_data = _get_av_data(ticker, "INCOME_STATEMENT")
    balance_data = _get_av_data(ticker, "BALANCE_SHEET")
    cashflow_data = _get_av_data(ticker, "CASH_FLOW")

    # Latest annual reports
    inc = _get_latest_report(income_data, "annual")
    bal = _get_latest_report(balance_data, "annual")
    cf = _get_latest_report(cashflow_data, "annual")

    # ── Income statement metrics ─────────────────────────────────────
    revenue = _report_float(inc, "totalRevenue")
    cogs = _report_float(inc, "costOfRevenue")
    gross_profit = _report_float(inc, "grossProfit")
    operating_income = _report_float(inc, "operatingIncome")
    operating_expenses = _report_float(inc, "operatingExpenses")
    net_income = _report_float(inc, "netIncome")
    interest_expense = _report_float(inc, "interestExpense")
    tax_expense = _report_float(inc, "incomeTaxExpense")
    pretax_income = _report_float(inc, "incomeBeforeTax")
    depreciation = _report_float(inc, "depreciationAndAmortization")
    ebitda_reported = _report_float(inc, "ebitda")
    rd_expense = _report_float(inc, "researchAndDevelopment")
    sga_expense = _report_float(inc, "sellingGeneralAndAdministrative")

    # ── Balance sheet metrics ────────────────────────────────────────
    total_assets = _report_float(bal, "totalAssets")
    current_assets = _report_float(bal, "totalCurrentAssets")
    cash = _report_float(bal, "cashAndCashEquivalentsAtCarryingValue")
    short_term_inv = _report_float(bal, "shortTermInvestments")
    accounts_receivable = _report_float(bal, "currentNetReceivables")
    inventory = _report_float(bal, "inventory")
    ppe = _report_float(bal, "propertyPlantEquipment")
    goodwill = _report_float(bal, "goodwill")
    intangibles = _report_float(bal, "intangibleAssets")
    total_liabilities = _report_float(bal, "totalLiabilities")
    current_liabilities = _report_float(bal, "totalCurrentLiabilities")
    short_term_debt = _report_float(bal, "shortTermDebt")
    long_term_debt = _report_float(bal, "longTermDebt")
    accounts_payable = _report_float(bal, "currentAccountsPayable")
    total_equity = _report_float(bal, "totalShareholderEquity")
    retained_earnings = _report_float(bal, "retainedEarnings")
    shares_outstanding = _report_float(bal, "commonStockSharesOutstanding")

    # ── Cash flow metrics ────────────────────────────────────────────
    operating_cf = _report_float(cf, "operatingCashflow")
    capex = _report_float(cf, "capitalExpenditures")
    dividends_paid = _report_float(cf, "dividendPayout")
    share_repurchases = _report_float(cf, "proceedsFromRepurchaseOfEquity")
    sbc = _report_float(cf, "stockBasedCompensation")

    # ── TTM values from quarterly data ───────────────────────────────
    revenue_ttm = _ttm_from_quarterly(income_data, "totalRevenue") or revenue
    net_income_ttm = _ttm_from_quarterly(income_data, "netIncome") or net_income
    operating_cf_ttm = _ttm_from_quarterly(cashflow_data, "operatingCashflow") or operating_cf
    capex_ttm = _ttm_from_quarterly(cashflow_data, "capitalExpenditures") or capex

    # ── Overview pre-computed values ─────────────────────────────────
    eps_diluted = _av_float(overview, "EPS")
    ov_market_cap = _av_float(overview, "MarketCapitalization")
    ov_pe = _av_float(overview, "PERatio")
    ov_peg = _av_float(overview, "PEGRatio")
    ov_book_value = _av_float(overview, "BookValue")
    ov_dividend_yield = _av_float(overview, "DividendYield")
    ov_dividend_ps = _av_float(overview, "DividendPerShare")
    ov_beta = _av_float(overview, "Beta")
    ov_52w_high = _av_float(overview, "52WeekHigh")
    ov_52w_low = _av_float(overview, "52WeekLow")
    ov_shares = _av_float(overview, "SharesOutstanding")
    ov_ev_revenue = _av_float(overview, "EVToRevenue")
    ov_ev_ebitda = _av_float(overview, "EVToEBITDA")
    ov_profit_margin = _av_float(overview, "ProfitMargin")
    ov_operating_margin = _av_float(overview, "OperatingMarginTTM")
    ov_roa = _av_float(overview, "ReturnOnAssetsTTM")
    ov_roe = _av_float(overview, "ReturnOnEquityTTM")
    ov_forward_pe = _av_float(overview, "ForwardPE")
    ov_price_to_sales = _av_float(overview, "PriceToSalesRatioTTM")
    ov_price_to_book = _av_float(overview, "PriceToBookRatio")
    ov_analyst_target = _av_float(overview, "AnalystTargetPrice")
    ov_rev_growth_yoy = _av_float(overview, "QuarterlyRevenueGrowthYOY")
    ov_earnings_growth_yoy = _av_float(overview, "QuarterlyEarningsGrowthYOY")
    ov_ebitda = _av_float(overview, "EBITDA")

    # Use overview shares if balance sheet doesn't have them
    shares_for_cap = shares_outstanding or ov_shares

    # ── Market data from price_history ───────────────────────────────
    db = get_db()
    try:
        price_row = db.execute("""
            SELECT close FROM price_history
            WHERE ticker = %s ORDER BY date DESC LIMIT 1
        """, (ticker,)).fetchone()
        current_price = price_row["close"] if price_row else None

        # 52-week high/low from price history (fallback to overview)
        hl_row = db.execute("""
            SELECT MAX(high) as high_52w, MIN(low) as low_52w
            FROM price_history
            WHERE ticker = %s AND date >= CURRENT_DATE - INTERVAL '1 year'
        """, (ticker,)).fetchone()
        high_52w = (hl_row["high_52w"] if hl_row and hl_row["high_52w"] else None) or ov_52w_high
        low_52w = (hl_row["low_52w"] if hl_row and hl_row["low_52w"] else None) or ov_52w_low

        # Volume
        vol_row = db.execute("""
            SELECT volume FROM price_history
            WHERE ticker = %s ORDER BY date DESC LIMIT 1
        """, (ticker,)).fetchone()
        volume = vol_row["volume"] if vol_row else None

        # 5-year return
        price_5y_row = db.execute("""
            SELECT close FROM price_history
            WHERE ticker = %s AND date <= CURRENT_DATE - INTERVAL '5 years'
            ORDER BY date DESC LIMIT 1
        """, (ticker,)).fetchone()
        return_5y = None
        if price_5y_row and current_price:
            return_5y = ((current_price / price_5y_row["close"]) - 1) * 100
    finally:
        db.close()

    # ── Computed values ──────────────────────────────────────────────
    total_debt = None
    if short_term_debt is not None and long_term_debt is not None:
        total_debt = short_term_debt + long_term_debt
    elif long_term_debt is not None:
        total_debt = long_term_debt
    elif short_term_debt is not None:
        total_debt = short_term_debt

    ebitda = ebitda_reported or ov_ebitda
    if ebitda is None and operating_income is not None and depreciation is not None:
        ebitda = operating_income + depreciation

    ebit = operating_income

    market_cap = ov_market_cap
    if market_cap is None and current_price and shares_for_cap:
        market_cap = current_price * shares_for_cap

    enterprise_value = None
    if market_cap is not None:
        enterprise_value = market_cap + (total_debt or 0) - (cash or 0)

    fcf = None
    if operating_cf is not None and capex is not None:
        fcf = operating_cf - abs(capex)
    elif operating_cf is not None:
        fcf = operating_cf

    fcf_ttm = None
    if operating_cf_ttm is not None and capex_ttm is not None:
        fcf_ttm = operating_cf_ttm - abs(capex_ttm)
    elif operating_cf_ttm is not None:
        fcf_ttm = operating_cf_ttm

    book_value_ps = ov_book_value
    if book_value_ps is None and total_equity and shares_for_cap:
        book_value_ps = total_equity / shares_for_cap

    net_debt = None
    if total_debt is not None:
        net_debt = total_debt - (cash or 0)

    net_worth = total_equity

    # ── Growth from AV annual reports ────────────────────────────────
    annual_income = _get_reports(income_data, "annual", 7)

    def _rev_list(n):
        return [_report_float(r, "totalRevenue") for r in annual_income[:n] if _report_float(r, "totalRevenue") is not None]

    rev_vals = _rev_list(7)
    sales_growth_5y = _cagr(rev_vals[-1], rev_vals[0], min(5, len(rev_vals) - 1)) if len(rev_vals) >= 6 else None
    sales_growth_3y = _cagr(rev_vals[-1], rev_vals[0], min(3, len(rev_vals) - 1)) if len(rev_vals) >= 4 else (
        _cagr(rev_vals[-1], rev_vals[0], len(rev_vals) - 1) if len(rev_vals) >= 2 else None
    )

    # YoY growth from the two most recent annual reports
    revenue_yoy = gross_profit_yoy = operating_income_yoy = net_income_yoy = eps_growth_yoy = None
    if len(annual_income) >= 2:
        cur, prev = annual_income[0], annual_income[1]
        rev_c, rev_p = _report_float(cur, "totalRevenue"), _report_float(prev, "totalRevenue")
        gp_c, gp_p = _report_float(cur, "grossProfit"), _report_float(prev, "grossProfit")
        oi_c, oi_p = _report_float(cur, "operatingIncome"), _report_float(prev, "operatingIncome")
        ni_c, ni_p = _report_float(cur, "netIncome"), _report_float(prev, "netIncome")

        if rev_c and rev_p and rev_p != 0:
            revenue_yoy = ((rev_c / rev_p) - 1) * 100
        if gp_c and gp_p and gp_p != 0:
            gross_profit_yoy = ((gp_c / gp_p) - 1) * 100
        if oi_c and oi_p and oi_p != 0:
            operating_income_yoy = ((oi_c / oi_p) - 1) * 100
        if ni_c and ni_p and ni_p != 0:
            net_income_yoy = ((ni_c / ni_p) - 1) * 100

    # Profit 5yr CAGR
    ni_vals = [_report_float(r, "netIncome") for r in annual_income[:6] if _report_float(r, "netIncome") is not None]
    profit_var_5y = _cagr(ni_vals[-1], ni_vals[0], min(5, len(ni_vals) - 1)) if len(ni_vals) >= 6 and ni_vals[-1] > 0 else None

    # FCFF
    effective_tax_rate = _safe_div(tax_expense, pretax_income) if pretax_income and pretax_income > 0 else None
    fcff = None
    if ebit is not None:
        tax_r = effective_tax_rate if effective_tax_rate is not None else 0.21
        nopat = ebit * (1 - tax_r)
        fcff = nopat + (depreciation or 0) - abs(capex or 0)

    # ── Build ratio dict ─────────────────────────────────────────────
    def r(val, decimals=2):
        if val is None:
            return None
        return round(val, decimals)

    def fmt_big(val):
        if val is None:
            return None
        if abs(val) >= 1e12:
            return f"{val / 1e12:,.2f}T"
        if abs(val) >= 1e9:
            return f"{val / 1e9:,.2f}B"
        if abs(val) >= 1e6:
            return f"{val / 1e6:,.1f}M"
        if abs(val) >= 1e3:
            return f"{val / 1e3:,.1f}K"
        return f"{val:,.2f}"

    ratios = {
        "overview": {
            "market_cap": {"value": market_cap, "formatted": fmt_big(market_cap), "label": "Market Cap"},
            "current_price": {"value": current_price, "formatted": f"${r(current_price)}" if current_price else None, "label": "Current Price"},
            "high_low_52w": {"value": [high_52w, low_52w], "formatted": f"${r(high_52w)} / ${r(low_52w)}" if high_52w else None, "label": "52W High / Low"},
            "volume": {"value": volume, "formatted": fmt_big(volume) if volume else None, "label": "Volume"},
            "beta": {"value": r(ov_beta), "label": "Beta"},
            "shares_outstanding": {"value": shares_for_cap, "formatted": fmt_big(shares_for_cap), "label": "No. of Shares"},
            "eps": {"value": eps_diluted, "formatted": f"${r(eps_diluted)}" if eps_diluted else None, "label": "EPS"},
            "book_value": {"value": book_value_ps, "formatted": f"${r(book_value_ps)}" if book_value_ps else None, "label": "Book Value"},
            "enterprise_value": {"value": enterprise_value, "formatted": fmt_big(enterprise_value), "label": "Enterprise Value"},
            "net_worth": {"value": net_worth, "formatted": fmt_big(net_worth), "label": "Net Worth"},
            "debt": {"value": total_debt, "formatted": fmt_big(total_debt), "label": "Total Debt"},
            "cash_equivalents": {"value": cash, "formatted": fmt_big(cash), "label": "Cash & Equivalents"},
            "revenue": {"value": revenue, "formatted": fmt_big(revenue), "label": "Revenue (Annual)"},
            "analyst_target": {"value": ov_analyst_target, "formatted": f"${r(ov_analyst_target)}" if ov_analyst_target else None, "label": "Analyst Target Price"},
        },
        "valuation": {
            "pe_ratio": {"value": r(ov_pe or _safe_div(current_price, eps_diluted)), "label": "Stock P/E"},
            "forward_pe": {"value": r(ov_forward_pe), "label": "Forward P/E"},
            "price_to_book": {"value": r(ov_price_to_book or _safe_div(current_price, book_value_ps)), "label": "Price to Book"},
            "price_to_sales": {"value": r(ov_price_to_sales or _safe_div(market_cap, revenue_ttm)), "label": "Price to Sales"},
            "ev_ebitda": {"value": r(ov_ev_ebitda or _safe_div(enterprise_value, ebitda)), "label": "EV / EBITDA"},
            "ev_ebit": {"value": r(_safe_div(enterprise_value, ebit)), "label": "EV / EBIT"},
            "ev_sales": {"value": r(ov_ev_revenue or _safe_div(enterprise_value, revenue_ttm)), "label": "EV / Sales"},
            "market_cap_to_sales": {"value": r(_safe_div(market_cap, revenue_ttm)), "label": "Market Cap to Sales"},
            "cmp_fcf": {"value": r(_safe_div(market_cap, fcf_ttm or fcf)), "label": "Price / FCF"},
            "peg_ratio": {"value": r(ov_peg), "label": "PEG Ratio"},
        },
        "profitability": {
            "gross_margin": {"value": r((_safe_div(gross_profit, revenue) or 0) * 100) if gross_profit and revenue else None, "label": "Gross Margin %"},
            "operating_margin": {"value": r((ov_operating_margin or 0) * 100) if ov_operating_margin else (r(_safe_div(operating_income, revenue) * 100) if operating_income and revenue else None), "label": "Operating Margin %"},
            "net_margin": {"value": r((ov_profit_margin or 0) * 100) if ov_profit_margin else (r(_safe_div(net_income, revenue) * 100) if net_income and revenue else None), "label": "Net Profit Margin %"},
            "roe": {"value": r((ov_roe or 0) * 100) if ov_roe else (r(_safe_div(net_income, total_equity) * 100) if net_income and total_equity else None), "label": "Return on Equity (ROE)"},
            "roa": {"value": r((ov_roa or 0) * 100) if ov_roa else (r(_safe_div(net_income, total_assets) * 100) if net_income and total_assets else None), "label": "Return on Assets (ROA)"},
            "roce": {"value": r(_safe_div(ebit, (total_assets - current_liabilities)) * 100) if ebit and total_assets and current_liabilities else None, "label": "ROCE"},
            "roic": {"value": r(_safe_div(ebit * (1 - 0.21), (total_equity or 0) + (total_debt or 0) - (cash or 0)) * 100) if ebit and (total_equity or total_debt) else None, "label": "ROIC"},
            "ebitda_margin": {"value": r(_safe_div(ebitda, revenue) * 100) if ebitda and revenue else None, "label": "EBITDA Margin %"},
        },
        "liquidity": {
            "current_ratio": {"value": r(_safe_div(current_assets, current_liabilities)), "label": "Current Ratio"},
            "quick_ratio": {"value": r(_safe_div((current_assets or 0) - (inventory or 0), current_liabilities)) if current_assets and current_liabilities else None, "label": "Quick Ratio"},
            "cash_ratio": {"value": r(_safe_div(cash, current_liabilities)), "label": "Cash Ratio"},
            "defensive_interval": {"value": r(_safe_div((cash or 0) + (short_term_inv or 0) + (accounts_receivable or 0), (operating_expenses or revenue or 1) / 365)) if (cash or short_term_inv or accounts_receivable) and (operating_expenses or revenue) else None, "label": "Defensive Interval (days)"},
        },
        "leverage": {
            "debt_to_equity": {"value": r(_safe_div(total_debt, total_equity)), "label": "Debt to Equity"},
            "debt_to_assets": {"value": r(_safe_div(total_debt, total_assets)), "label": "Debt to Assets"},
            "debt_to_ebitda": {"value": r(_safe_div(total_debt, ebitda)), "label": "Debt to EBITDA"},
            "net_debt": {"value": net_debt, "formatted": fmt_big(net_debt), "label": "Net Debt"},
            "net_debt_to_ebitda": {"value": r(_safe_div(net_debt, ebitda)), "label": "Net Debt / EBITDA"},
            "debt_to_revenue": {"value": r(_safe_div(total_debt, revenue)), "label": "Debt / Revenue"},
            "interest_coverage": {"value": r(_safe_div(ebit, interest_expense)) if interest_expense and interest_expense != 0 else None, "label": "Interest Coverage"},
            "equity_multiplier": {"value": r(_safe_div(total_assets, total_equity)), "label": "Equity Multiplier"},
        },
        "efficiency": {
            "asset_turnover": {"value": r(_safe_div(revenue, total_assets)), "label": "Asset Turnover"},
            "inventory_days": {"value": r(_safe_div(inventory, cogs) * 365) if inventory and cogs and cogs != 0 else None, "label": "Inventory Days"},
            "receivable_days": {"value": r(_safe_div(accounts_receivable, revenue) * 365) if accounts_receivable and revenue else None, "label": "Receivable Days"},
            "payable_days": {"value": r(_safe_div(accounts_payable, cogs) * 365) if accounts_payable and cogs and cogs != 0 else None, "label": "Payable Days"},
        },
        "growth": {
            "revenue_yoy": {"value": r(revenue_yoy), "label": "Revenue Growth YoY %"},
            "gross_profit_yoy": {"value": r(gross_profit_yoy), "label": "Gross Profit Growth YoY %"},
            "operating_income_yoy": {"value": r(operating_income_yoy), "label": "Operating Income Growth YoY %"},
            "net_income_yoy": {"value": r(net_income_yoy), "label": "Net Income Growth YoY %"},
            "quarterly_rev_growth": {"value": r((ov_rev_growth_yoy or 0) * 100) if ov_rev_growth_yoy else None, "label": "Quarterly Revenue Growth YoY %"},
            "quarterly_earnings_growth": {"value": r((ov_earnings_growth_yoy or 0) * 100) if ov_earnings_growth_yoy else None, "label": "Quarterly Earnings Growth YoY %"},
            "sales_growth_3y": {"value": r(sales_growth_3y), "label": "Sales Growth 3Yr CAGR %"},
            "sales_growth_5y": {"value": r(sales_growth_5y), "label": "Sales Growth 5Yr CAGR %"},
            "profit_var_5y": {"value": r(profit_var_5y), "label": "Profit Growth 5Yr CAGR %"},
            "return_5y": {"value": r(return_5y), "label": "Stock Return 5Yr %"},
        },
        "cashflow": {
            "operating_cf": {"value": operating_cf, "formatted": fmt_big(operating_cf), "label": "Operating Cash Flow"},
            "fcf": {"value": fcf, "formatted": fmt_big(fcf), "label": "Free Cash Flow (FCFE)"},
            "fcff": {"value": fcff, "formatted": fmt_big(fcff), "label": "Free Cash Flow to Firm (FCFF)"},
            "fcf_yield": {"value": r(_safe_div(fcf, market_cap) * 100) if fcf and market_cap else None, "label": "FCF Yield %"},
            "fcf_to_revenue": {"value": r(_safe_div(fcf, revenue) * 100) if fcf and revenue else None, "label": "FCF / Revenue %"},
            "capex": {"value": capex, "formatted": fmt_big(capex), "label": "Capital Expenditure"},
            "capex_to_revenue": {"value": r(_safe_div(abs(capex or 0), revenue) * 100) if capex and revenue else None, "label": "CapEx / Revenue %"},
            "cash_to_revenue": {"value": r(_safe_div(cash, revenue) * 100) if cash and revenue else None, "label": "Cash / Revenue %"},
            "cash_to_assets": {"value": r(_safe_div(cash, total_assets) * 100) if cash and total_assets else None, "label": "Cash / Total Assets %"},
            "dividends_paid": {"value": dividends_paid, "formatted": fmt_big(dividends_paid), "label": "Dividends Paid"},
            "share_repurchases": {"value": share_repurchases, "formatted": fmt_big(share_repurchases), "label": "Share Buybacks"},
            "dividend_yield": {"value": r((ov_dividend_yield or 0) * 100) if ov_dividend_yield else (r(_safe_div(abs(dividends_paid or 0), market_cap) * 100) if dividends_paid and market_cap else None), "label": "Dividend Yield %"},
        },
    }

    # Working capital
    inv_days = ratios["efficiency"]["inventory_days"]["value"]
    rec_days = ratios["efficiency"]["receivable_days"]["value"]
    pay_days = ratios["efficiency"]["payable_days"]["value"]

    ccc = None
    if inv_days is not None and rec_days is not None and pay_days is not None:
        ccc = round(inv_days + rec_days - pay_days, 2)

    working_capital = None
    if current_assets is not None and current_liabilities is not None:
        working_capital = current_assets - current_liabilities

    ratios["working_capital"] = {
        "working_capital": {"value": working_capital, "formatted": fmt_big(working_capital), "label": "Working Capital"},
        "inventory_days": {"value": inv_days, "label": "Inventory Days"},
        "receivable_days": {"value": rec_days, "label": "Receivable Days (DSO)"},
        "payable_days": {"value": pay_days, "label": "Payable Days (DPO)"},
        "cash_conversion_cycle": {"value": ccc, "label": "Cash Conversion Cycle"},
        "current_ratio": {"value": ratios["liquidity"]["current_ratio"]["value"], "label": "Current Ratio"},
    }

    return ratios
