"""Stock screener utilities backed by local equities DB."""
from __future__ import annotations

import re
from typing import Any

from equities.db import get_db


def _safe_div(a: float | None, b: float | None) -> float | None:
    if a is None or b is None or b == 0:
        return None
    return a / b


def _num(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except Exception:
        return None


def _in_range(value: float | None, min_v: float | None, max_v: float | None) -> bool:
    if value is None:
        return False
    if min_v is not None and value < min_v:
        return False
    if max_v is not None and value > max_v:
        return False
    return True


_FIELD_ALIASES = {
    "pe": "pe",
    "p/e": "pe",
    "stockpe": "pe",
    "pricetoearnings": "pe",
    "grossmargin": "gross_margin",
    "grossmargin%": "gross_margin",
    "grossmarginpct": "gross_margin",
    "operatingmargin": "operating_margin",
    "operatingmargin%": "operating_margin",
    "netmargin": "net_margin",
    "netmargin%": "net_margin",
    "netprofitmargin": "net_margin",
    "ebitdamargin": "ebitda_margin",
    "ebitdamargin%": "ebitda_margin",
    "roe": "roe",
    "returnonequity": "roe",
    "roa": "roa",
    "returnonassets": "roa",
    "currentratio": "current_ratio",
    "debttoequity": "debt_to_equity",
    "debt/equity": "debt_to_equity",
    "pricetobook": "price_to_book",
    "price/book": "price_to_book",
    "marketcap": "market_cap",
    "revenue": "revenue",
    "netincome": "net_income",
    "operatingcashflow": "operating_cash_flow",
    "opcashflow": "operating_cash_flow",
    "freecashflow": "free_cash_flow",
    "fcf": "free_cash_flow",
    "fcff": "fcff",
    "freecashflowtofirm": "fcff",
    "netdebt": "net_debt",
    "netdebt/ebitda": "net_debt_to_ebitda",
    "netdebttoebitda": "net_debt_to_ebitda",
    "debt/revenue": "debt_to_revenue",
    "debttorevenue": "debt_to_revenue",
    "revenuegrowth": "revenue_yoy",
    "revenueyoy": "revenue_yoy",
    "netincomegrowth": "net_income_yoy",
    "netincomeyoy": "net_income_yoy",
    "epsgrowth": "eps_growth_yoy",
    "epsgrowyoy": "eps_growth_yoy",
    "dividendyield": "dividend_yield",
    "divyield": "dividend_yield",
    "fcfyield": "fcf_yield",
    "price": "price",
}


SUPPORTED_EXPRESSION_FIELDS = [
    {"field": "pe", "label": "P/E"},
    {"field": "gross_margin", "label": "Gross Margin %"},
    {"field": "operating_margin", "label": "Operating Margin %"},
    {"field": "net_margin", "label": "Net Margin %"},
    {"field": "ebitda_margin", "label": "EBITDA Margin %"},
    {"field": "roe", "label": "ROE %"},
    {"field": "roa", "label": "ROA %"},
    {"field": "current_ratio", "label": "Current Ratio"},
    {"field": "debt_to_equity", "label": "Debt/Equity"},
    {"field": "price_to_book", "label": "Price/Book"},
    {"field": "market_cap", "label": "Market Cap"},
    {"field": "revenue", "label": "Revenue"},
    {"field": "net_income", "label": "Net Income"},
    {"field": "operating_cash_flow", "label": "Operating Cash Flow"},
    {"field": "free_cash_flow", "label": "Free Cash Flow"},
    {"field": "fcff", "label": "FCFF (Free Cash Flow to Firm)"},
    {"field": "net_debt", "label": "Net Debt"},
    {"field": "net_debt_to_ebitda", "label": "Net Debt / EBITDA"},
    {"field": "debt_to_revenue", "label": "Debt / Revenue"},
    {"field": "revenue_yoy", "label": "Revenue Growth YoY %"},
    {"field": "net_income_yoy", "label": "Net Income Growth YoY %"},
    {"field": "eps_growth_yoy", "label": "EPS Growth YoY %"},
    {"field": "dividend_yield", "label": "Dividend Yield %"},
    {"field": "fcf_yield", "label": "FCF Yield %"},
    {"field": "price", "label": "Price"},
]


def _normalize_field_name(raw: str) -> str:
    return re.sub(r"[^a-z0-9%/]", "", raw.strip().lower())


def _parse_expression(expression: str) -> list[tuple[str, str, float]]:
    """
    Parse expression like:
      gross margin > 40 AND pe < 15
    Supports only AND-combined comparisons for now.
    """
    cleaned = expression.replace("(", " ").replace(")", " ").strip()
    if not cleaned:
        return []

    parts = re.split(r"\s+AND\s+", cleaned, flags=re.IGNORECASE)
    conditions: list[tuple[str, str, float]] = []
    pattern = re.compile(r"^\s*([a-zA-Z0-9_ /%.-]+)\s*(<=|>=|=|<|>)\s*(-?\d+(?:\.\d+)?)\s*$")

    for p in parts:
        m = pattern.match(p)
        if not m:
            raise ValueError(f"Could not parse condition: '{p.strip()}'")
        field_raw, op, rhs = m.group(1), m.group(2), float(m.group(3))
        alias = _FIELD_ALIASES.get(_normalize_field_name(field_raw))
        if not alias:
            raise ValueError(f"Unknown field in screener expression: '{field_raw.strip()}'")
        conditions.append((alias, op, rhs))
    return conditions


def _eval_condition(lhs: float | None, op: str, rhs: float) -> bool:
    if lhs is None:
        return False
    if op == ">":
        return lhs > rhs
    if op == "<":
        return lhs < rhs
    if op == ">=":
        return lhs >= rhs
    if op == "<=":
        return lhs <= rhs
    if op == "=":
        return lhs == rhs
    return False


def _passes_expression(item: dict[str, Any], conditions: list[tuple[str, str, float]]) -> bool:
    for field, op, rhs in conditions:
        if not _eval_condition(_num(item.get(field)), op, rhs):
            return False
    return True


def get_supported_expression_fields() -> list[dict[str, str]]:
    return SUPPORTED_EXPRESSION_FIELDS


def _extract_latest_metrics(db) -> dict[str, dict[str, float | None]]:
    """Extract latest annual metrics from Alpha Vantage cached data."""
    import json as _json

    rows = db.execute(
        "SELECT ticker, function_name, data FROM av_fundamentals"
    ).fetchall()

    by_ticker: dict[str, dict[str, float | None]] = {}

    # AV key → internal metric name mapping for income/balance/cashflow
    _income_map = {
        "totalRevenue": "Revenue", "costOfRevenue": "CostOfRevenue",
        "grossProfit": "GrossProfit", "operatingIncome": "OperatingIncome",
        "operatingExpenses": "OperatingExpenses", "netIncome": "NetIncome",
        "interestExpense": "InterestExpense", "incomeTaxExpense": "IncomeTaxExpense",
        "incomeBeforeTax": "PreTaxIncome", "depreciationAndAmortization": "DepreciationAmortization",
        "ebitda": "EBITDA", "researchAndDevelopment": "ResearchAndDevelopment",
    }
    _balance_map = {
        "totalAssets": "TotalAssets", "totalCurrentAssets": "CurrentAssets",
        "cashAndCashEquivalentsAtCarryingValue": "Cash",
        "shortTermInvestments": "ShortTermInvestments",
        "currentNetReceivables": "AccountsReceivable", "inventory": "Inventory",
        "totalCurrentLiabilities": "CurrentLiabilities", "shortTermDebt": "ShortTermDebt",
        "longTermDebt": "LongTermDebt", "totalLiabilities": "TotalLiabilities",
        "totalShareholderEquity": "TotalEquity",
        "commonStockSharesOutstanding": "SharesOutstanding",
        "currentAccountsPayable": "AccountsPayable",
        "retainedEarnings": "RetainedEarnings",
    }
    _cashflow_map = {
        "operatingCashflow": "OperatingCashFlow",
        "capitalExpenditures": "CapitalExpenditures",
        "dividendPayout": "DividendsPaid",
        "stockBasedCompensation": "StockBasedCompensation",
    }
    _overview_map = {
        "EPS": "EPSDiluted", "BookValue": "BookValuePerShare",
        "SharesOutstanding": "SharesOutstanding",
    }

    for row in rows:
        ticker = row["ticker"]
        func = row["function_name"]
        raw = row["data"]
        data = _json.loads(raw) if isinstance(raw, str) else raw

        if ticker not in by_ticker:
            by_ticker[ticker] = {}
        m = by_ticker[ticker]

        if func == "OVERVIEW":
            for av_key, metric in _overview_map.items():
                v = data.get(av_key)
                if v and v != "None":
                    try:
                        m[metric] = float(v)
                    except (ValueError, TypeError):
                        pass
        elif func in ("INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW"):
            reports = data.get("annualReports", [])
            if not reports:
                continue
            latest = reports[0]
            field_map = {"INCOME_STATEMENT": _income_map, "BALANCE_SHEET": _balance_map, "CASH_FLOW": _cashflow_map}[func]
            for av_key, metric in field_map.items():
                v = latest.get(av_key)
                if v and v != "None":
                    try:
                        m[metric] = float(v)
                    except (ValueError, TypeError):
                        pass

    return by_ticker


def _extract_prior_year_metrics(db) -> dict[str, dict[str, float | None]]:
    """Get second-most-recent annual values for YoY growth from AV data."""
    import json as _json

    rows = db.execute(
        "SELECT ticker, function_name, data FROM av_fundamentals WHERE function_name = 'INCOME_STATEMENT'"
    ).fetchall()

    _income_map = {
        "totalRevenue": "Revenue", "netIncome": "NetIncome",
    }

    by_ticker: dict[str, dict[str, float | None]] = {}
    for row in rows:
        ticker = row["ticker"]
        raw = row["data"]
        data = _json.loads(raw) if isinstance(raw, str) else raw
        reports = data.get("annualReports", [])
        if len(reports) < 2:
            continue
        prior = reports[1]
        by_ticker[ticker] = {}
        for av_key, metric in _income_map.items():
            v = prior.get(av_key)
            if v and v != "None":
                try:
                    by_ticker[ticker][metric] = float(v)
                except (ValueError, TypeError):
                    pass

        # EPS from overview is current only — get prior from income if available
        # (AV doesn't provide EPS in income statements, skip for now)

    return by_ticker


def _extract_latest_price(db) -> dict[str, float | None]:
    rows = db.execute(
        """
        SELECT p.ticker, p.close
        FROM price_history p
        JOIN (
            SELECT ticker, MAX(date) AS date
            FROM price_history
            GROUP BY ticker
        ) latest
          ON p.ticker = latest.ticker
         AND p.date = latest.date
        """
    ).fetchall()
    return {r["ticker"]: _num(r["close"]) for r in rows}


def _extract_52w(db) -> dict[str, tuple[float | None, float | None]]:
    rows = db.execute(
        """
        SELECT ticker, MAX(high) AS high_52w, MIN(low) AS low_52w
        FROM price_history
        WHERE date >= CURRENT_DATE - INTERVAL '1 year'
        GROUP BY ticker
        """
    ).fetchall()
    return {
        r["ticker"]: (_num(r["high_52w"]), _num(r["low_52w"]))
        for r in rows
    }


def screen_stocks(
    search: str | None = None,
    sector: str | None = None,
    industry: str | None = None,
    min_market_cap: float | None = None,
    max_market_cap: float | None = None,
    min_pe: float | None = None,
    max_pe: float | None = None,
    min_roe: float | None = None,
    max_debt_to_equity: float | None = None,
    min_current_ratio: float | None = None,
    min_revenue: float | None = None,
    min_net_income: float | None = None,
    min_operating_cf: float | None = None,
    min_free_cf: float | None = None,
    expression: str | None = None,
    sort_by: str = "market_cap",
    sort_order: str = "desc",
    page: int = 1,
    per_page: int = 50,
) -> dict[str, Any]:
    db = get_db()
    try:
        companies = db.execute(
            """
            SELECT ticker, name, sector, industry
            FROM companies
            WHERE is_active = TRUE
            ORDER BY ticker
            """
        ).fetchall()

        latest_fin = _extract_latest_metrics(db)
        prior_fin = _extract_prior_year_metrics(db)
        latest_price = _extract_latest_price(db)
        high_low_52w = _extract_52w(db)

        q = (search or "").strip().lower()
        sector_q = (sector or "").strip().lower()
        industry_q = (industry or "").strip().lower()

        expr_conditions = _parse_expression(expression or "") if expression else []

        rows: list[dict[str, Any]] = []
        for c in companies:
            ticker = c["ticker"]
            name = c["name"]
            sec = c["sector"] or ""
            ind = c["industry"] or ""

            if q and q not in ticker.lower() and q not in (name or "").lower():
                continue
            if sector_q and sec.lower() != sector_q:
                continue
            if industry_q and ind.lower() != industry_q:
                continue

            m = latest_fin.get(ticker, {})
            price = latest_price.get(ticker)

            eps = m.get("EPSDiluted") or m.get("EPSBasic")
            book_value_ps = m.get("BookValuePerShare")
            revenue = m.get("Revenue")
            gross_profit = m.get("GrossProfit")
            operating_income = m.get("OperatingIncome")
            net_income = m.get("NetIncome")
            operating_cf = m.get("OperatingCashFlow")
            capex = m.get("CapitalExpenditures")
            depreciation = m.get("DepreciationAmortization")
            tax_expense = m.get("IncomeTaxExpense")
            pretax_income = m.get("PreTaxIncome")
            cash = m.get("Cash")
            total_assets = m.get("TotalAssets")
            dividends_paid = m.get("DividendsPaid")

            current_assets = m.get("CurrentAssets")
            current_liabilities = m.get("CurrentLiabilities")
            short_term_debt = m.get("ShortTermDebt")
            long_term_debt = m.get("LongTermDebt")
            total_equity = m.get("TotalEquity")
            shares = m.get("SharesDiluted") or m.get("SharesOutstanding")

            total_debt = None
            if short_term_debt is not None and long_term_debt is not None:
                total_debt = short_term_debt + long_term_debt
            elif short_term_debt is not None:
                total_debt = short_term_debt
            elif long_term_debt is not None:
                total_debt = long_term_debt

            market_cap = price * shares if price is not None and shares is not None else None
            pe = _safe_div(price, eps)
            price_to_book = _safe_div(price, book_value_ps)
            gross_margin = _safe_div(gross_profit, revenue)
            operating_margin = _safe_div(operating_income, revenue)
            roe = _safe_div(net_income, total_equity)
            current_ratio = _safe_div(current_assets, current_liabilities)
            debt_to_equity = _safe_div(total_debt, total_equity)
            free_cf = None
            if operating_cf is not None:
                free_cf = operating_cf - abs(capex or 0)

            # EBITDA
            ebitda = None
            if operating_income is not None and depreciation is not None:
                ebitda = operating_income + depreciation
            elif operating_income is not None:
                ebitda = operating_income

            # FCFF
            ebit = operating_income
            eff_tax = _safe_div(tax_expense, pretax_income) if pretax_income and pretax_income > 0 else None
            fcff = None
            if ebit is not None:
                tax_r = eff_tax if eff_tax is not None else 0.21
                fcff = ebit * (1 - tax_r) + (depreciation or 0) - abs(capex or 0)

            # Net Debt
            net_debt = None
            if total_debt is not None:
                net_debt = total_debt - (cash or 0)
            net_debt_to_ebitda = _safe_div(net_debt, ebitda)
            debt_to_revenue_val = _safe_div(total_debt, revenue)

            # Margin ratios
            net_margin = _safe_div(net_income, revenue)
            ebitda_margin = _safe_div(ebitda, revenue)
            roa = _safe_div(net_income, total_assets)
            dividend_yield = _safe_div(abs(dividends_paid or 0), market_cap) if dividends_paid and market_cap else None
            fcf_yield = _safe_div(free_cf, market_cap) if free_cf and market_cap else None

            # YoY growth
            pm = prior_fin.get(ticker, {})
            prev_rev = pm.get("Revenue")
            prev_ni = pm.get("NetIncome")
            prev_eps = pm.get("EPSDiluted") or pm.get("EPSBasic")
            revenue_yoy = ((revenue / prev_rev) - 1) * 100 if revenue is not None and prev_rev and prev_rev != 0 else None
            net_income_yoy = ((net_income / prev_ni) - 1) * 100 if net_income is not None and prev_ni and prev_ni != 0 else None
            eps_growth_yoy_val = ((eps / prev_eps) - 1) * 100 if eps is not None and prev_eps and prev_eps != 0 else None

            if (min_market_cap is not None or max_market_cap is not None) and not _in_range(market_cap, min_market_cap, max_market_cap):
                continue
            if (min_pe is not None or max_pe is not None) and not _in_range(pe, min_pe, max_pe):
                continue
            if min_roe is not None and (roe is None or roe < min_roe / 100.0):
                continue
            if max_debt_to_equity is not None and (debt_to_equity is None or debt_to_equity > max_debt_to_equity):
                continue
            if min_current_ratio is not None and (current_ratio is None or current_ratio < min_current_ratio):
                continue
            if min_revenue is not None and (revenue is None or revenue < min_revenue):
                continue
            if min_net_income is not None and (net_income is None or net_income < min_net_income):
                continue
            if min_operating_cf is not None and (operating_cf is None or operating_cf < min_operating_cf):
                continue
            if min_free_cf is not None and (free_cf is None or free_cf < min_free_cf):
                continue

            hi_52, lo_52 = high_low_52w.get(ticker, (None, None))
            item = {
                "ticker": ticker,
                "name": name,
                "sector": sec,
                "industry": c["industry"] or "",
                "price": price,
                "market_cap": market_cap,
                "pe": pe,
                "price_to_book": price_to_book,
                "gross_margin": gross_margin * 100 if gross_margin is not None else None,
                "operating_margin": operating_margin * 100 if operating_margin is not None else None,
                "net_margin": net_margin * 100 if net_margin is not None else None,
                "ebitda_margin": ebitda_margin * 100 if ebitda_margin is not None else None,
                "roe": roe * 100 if roe is not None else None,
                "roa": roa * 100 if roa is not None else None,
                "current_ratio": current_ratio,
                "debt_to_equity": debt_to_equity,
                "revenue": revenue,
                "net_income": net_income,
                "operating_cash_flow": operating_cf,
                "free_cash_flow": free_cf,
                "fcff": fcff,
                "net_debt": net_debt,
                "net_debt_to_ebitda": net_debt_to_ebitda,
                "debt_to_revenue": debt_to_revenue_val,
                "dividend_yield": dividend_yield * 100 if dividend_yield is not None else None,
                "fcf_yield": fcf_yield * 100 if fcf_yield is not None else None,
                "revenue_yoy": revenue_yoy,
                "net_income_yoy": net_income_yoy,
                "eps_growth_yoy": eps_growth_yoy_val,
                "high_52w": hi_52,
                "low_52w": lo_52,
            }

            if expr_conditions and not _passes_expression(item, expr_conditions):
                continue

            rows.append(item)

        reverse = (sort_order or "desc").lower() != "asc"

        non_null_rows = [r for r in rows if r.get(sort_by) is not None]
        null_rows = [r for r in rows if r.get(sort_by) is None]
        non_null_rows.sort(
            key=lambda item: item.get(sort_by),
            reverse=reverse,
        )
        rows = non_null_rows + null_rows

        total = len(rows)
        start = max(0, (page - 1) * per_page)
        end = start + per_page
        paged = rows[start:end]

        sectors = sorted({(c["sector"] or "") for c in companies if c["sector"]})
        industries = sorted({(c["industry"] or "") for c in companies if c["industry"]})
        with_price = sum(1 for r in rows if r.get("price") is not None)
        return {
            "items": paged,
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page,
            "sectors": sectors,
            "industries": industries,
            "expression": expression or "",
            "price_coverage": {
                "with_price": with_price,
                "total": total,
            },
        }
    finally:
        db.close()
