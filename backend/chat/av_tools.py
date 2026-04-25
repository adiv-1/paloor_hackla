"""
Alpha Vantage tool integration for Paloor AI chat.

Provides tool definitions for AWS Bedrock Converse API (Claude) and
executes Alpha Vantage API calls when the model invokes tools.

This gives the chatbot real-time access to:
  - Stock prices (daily, weekly, monthly, intraday, real-time quotes)
  - Company fundamentals (overview, income statement, balance sheet, etc.)
  - Technical indicators (RSI, MACD, SMA, BBANDS, 50+ indicators)
  - Market news and sentiment analysis
  - Forex, crypto, commodities, economic data
  - Options data, insider transactions, institutional holdings
"""
from __future__ import annotations

import json
import logging
import urllib.request
from typing import Optional

from config import settings

logger = logging.getLogger(__name__)

AV_BASE = "https://www.alphavantage.co/query"

# Maximum data points to return to the model (prevents context overflow)
MAX_TIME_SERIES_POINTS = 30
MAX_NEWS_ARTICLES = 10
MAX_FINANCIAL_PERIODS = 5


# ── Tool Specification for Bedrock Converse API ─────────────────────────────

AV_TOOL_SPECS = [
    {
        "toolSpec": {
            "name": "alpha_vantage",
            "description": (
                "Query real-time and historical financial market data from Alpha Vantage. "
                "Use this tool whenever the user asks about stock prices, financial data, "
                "market trends, technical indicators, economic data, or any question "
                "that would benefit from current or historical market data.\n\n"
                "AVAILABLE FUNCTIONS:\n\n"
                "STOCK PRICES:\n"
                "- GLOBAL_QUOTE: Latest price/volume for a symbol (params: symbol)\n"
                "- TIME_SERIES_DAILY: Daily OHLCV (params: symbol, outputsize=compact|full)\n"
                "- TIME_SERIES_DAILY_ADJUSTED: Daily OHLCV with splits/dividends (params: symbol, outputsize)\n"
                "- TIME_SERIES_WEEKLY / TIME_SERIES_MONTHLY: Weekly/monthly OHLCV (params: symbol)\n"
                "- TIME_SERIES_INTRADAY: Intraday OHLCV (params: symbol, interval=1min|5min|15min|30min|60min)\n"
                "- REALTIME_BULK_QUOTES: Quotes for multiple symbols (params: symbol — comma-separated)\n"
                "- SYMBOL_SEARCH: Search for symbols by name (params: keywords)\n"
                "- MARKET_STATUS: Current global market open/close status\n\n"
                "COMPANY FUNDAMENTALS:\n"
                "- COMPANY_OVERVIEW: Company info, ratios, key metrics (params: symbol)\n"
                "- INCOME_STATEMENT: Annual/quarterly income statements (params: symbol)\n"
                "- BALANCE_SHEET: Annual/quarterly balance sheets (params: symbol)\n"
                "- CASH_FLOW: Annual/quarterly cash flow statements (params: symbol)\n"
                "- EARNINGS: Earnings history and estimates (params: symbol)\n"
                "- LISTING_STATUS: Active/delisted equities\n"
                "- EARNINGS_CALENDAR: Upcoming earnings (params: symbol or horizon=3month|6month|12month)\n"
                "- IPO_CALENDAR: Upcoming IPOs\n\n"
                "TECHNICAL INDICATORS (params: symbol, interval=daily|weekly|monthly|1min|5min|15min|30min|60min, "
                "time_period=integer, series_type=close|open|high|low):\n"
                "- SMA, EMA, WMA, DEMA, TEMA, TRIMA, KAMA: Moving averages\n"
                "- RSI: Relative strength index\n"
                "- MACD: Moving average convergence/divergence\n"
                "- MACDEXT: MACD with controllable moving average type\n"
                "- BBANDS: Bollinger bands\n"
                "- STOCH, STOCHF, STOCHRSI: Stochastic oscillators\n"
                "- ADX, ADXR, DX: Directional movement\n"
                "- CCI, MFI, WILLR, AROON, AROONOSC: Momentum/oscillators\n"
                "- ATR, NATR, TRANGE: Volatility\n"
                "- OBV, AD, ADOSC: Volume indicators\n"
                "- SAR: Parabolic SAR\n"
                "- VWAP: Volume-weighted average price (intraday only)\n\n"
                "MARKET INTELLIGENCE:\n"
                "- NEWS_SENTIMENT: News with sentiment scores (params: tickers, topics, sort=LATEST|EARLIEST|RELEVANCE)\n"
                "- TOP_GAINERS_LOSERS: Top 20 gainers, losers, most active\n"
                "- INSIDER_TRANSACTIONS: Insider buying/selling (params: symbol)\n"
                "- INSTITUTIONAL_HOLDINGS: Institutional ownership (params: symbol)\n"
                "- EARNINGS_CALL_TRANSCRIPT: Call transcripts (params: symbol, quarter, year)\n\n"
                "FOREX (params: from_symbol, to_symbol):\n"
                "- FX_DAILY, FX_WEEKLY, FX_MONTHLY: Historical forex rates\n"
                "- FX_INTRADAY: Intraday forex (params: from_symbol, to_symbol, interval)\n\n"
                "CRYPTO (params: symbol, market=USD):\n"
                "- DIGITAL_CURRENCY_DAILY/WEEKLY/MONTHLY: Crypto price history\n"
                "- CURRENCY_EXCHANGE_RATE: Live rate (params: from_currency, to_currency)\n\n"
                "COMMODITIES (params: interval=daily|weekly|monthly):\n"
                "- WTI, BRENT: Crude oil    - NATURAL_GAS: Natural gas\n"
                "- COPPER, ALUMINUM, WHEAT, CORN, COTTON, SUGAR, COFFEE\n"
                "- GOLD_SILVER_SPOT: Live gold/silver spot price\n"
                "- GOLD_SILVER_HISTORY: Historical gold/silver (params: interval)\n"
                "- ALL_COMMODITIES: All commodity prices\n\n"
                "ECONOMIC INDICATORS (params: interval=quarterly|annual|monthly):\n"
                "- REAL_GDP, REAL_GDP_PER_CAPITA: GDP data\n"
                "- TREASURY_YIELD: Treasury yields (params: maturity=3month|2year|5year|10year|30year)\n"
                "- FEDERAL_FUNDS_RATE: Fed funds rate\n"
                "- CPI, INFLATION: Consumer prices and inflation\n"
                "- UNEMPLOYMENT, NONFARM_PAYROLL: Employment data\n"
                "- RETAIL_SALES, DURABLES: Consumer spending\n\n"
                "OPTIONS:\n"
                "- REALTIME_OPTIONS: Current options chain with Greeks (params: symbol)\n"
                "- HISTORICAL_OPTIONS: Historical options data (params: symbol, date)"
            ),
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "function": {
                            "type": "string",
                            "description": (
                                "The Alpha Vantage API function name, e.g. GLOBAL_QUOTE, "
                                "TIME_SERIES_DAILY, RSI, NEWS_SENTIMENT, COMPANY_OVERVIEW"
                            ),
                        },
                        "symbol": {
                            "type": "string",
                            "description": (
                                "Stock ticker (AAPL), forex pair (EUR/USD), or crypto symbol (BTC). "
                                "Not required for functions like TOP_GAINERS_LOSERS or MARKET_STATUS."
                            ),
                        },
                        "params": {
                            "type": "object",
                            "description": (
                                "Additional function-specific parameters: interval, time_period, "
                                "outputsize, from_symbol, to_symbol, series_type, maturity, "
                                "keywords, tickers, topics, quarter, year, date, horizon, etc."
                            ),
                        },
                    },
                    "required": ["function"],
                },
            },
        }
    }
]


# ── Tool Execution ──────────────────────────────────────────────────────────

def execute_av_tool(tool_input: dict) -> dict:
    """Execute an Alpha Vantage API call and return truncated results."""
    function = tool_input.get("function", "").upper().strip()
    symbol = tool_input.get("symbol", "").strip()
    extra_params = tool_input.get("params") or {}

    if not function:
        return {"error": "No function specified"}

    # Build API parameters
    api_params: dict = {"function": function}

    # Map symbol to the correct parameter name per function type
    if symbol:
        if function.startswith("FX_"):
            parts = symbol.replace("/", " ").split()
            if "from_symbol" not in extra_params:
                api_params["from_symbol"] = parts[0].upper()
            if "to_symbol" not in extra_params and len(parts) > 1:
                api_params["to_symbol"] = parts[1].upper()
        elif function.startswith("DIGITAL_CURRENCY_"):
            api_params["symbol"] = symbol.upper()
            if "market" not in extra_params:
                api_params["market"] = "USD"
        elif function == "CURRENCY_EXCHANGE_RATE":
            parts = symbol.replace("/", " ").split()
            if "from_currency" not in extra_params:
                api_params["from_currency"] = parts[0].upper()
            if "to_currency" not in extra_params and len(parts) > 1:
                api_params["to_currency"] = parts[1].upper()
        elif function == "SYMBOL_SEARCH":
            api_params["keywords"] = symbol
        elif function == "NEWS_SENTIMENT":
            api_params["tickers"] = symbol.upper()
        elif function == "REALTIME_BULK_QUOTES":
            api_params["symbol"] = symbol.upper()
        else:
            api_params["symbol"] = symbol.upper()

    # Merge extra params
    for k, v in extra_params.items():
        if v is not None and str(v).strip():
            api_params[k] = str(v)

    # Make API call
    data = _call_av_api(api_params)
    if data is None:
        return {"error": f"Failed to fetch data for {function}"}

    # Check for API-level errors
    if "Error Message" in data:
        return {"error": data["Error Message"]}
    if "Note" in data:
        return {"error": data["Note"]}
    if "Information" in data and len(data) == 1:
        return {"error": data["Information"]}

    # Truncate large responses
    return _truncate_response(data, function)


def _call_av_api(params: dict) -> Optional[dict]:
    """Make HTTP request to Alpha Vantage API."""
    api_key = settings.alpha_vantage_api_key
    if not api_key:
        return None

    params["apikey"] = api_key
    query_string = "&".join(
        f"{urllib.request.quote(str(k))}={urllib.request.quote(str(v))}"
        for k, v in params.items()
    )
    url = f"{AV_BASE}?{query_string}"

    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        logger.error("Alpha Vantage API error for %s: %s", params.get("function"), e)
        return None


# ── Response Truncation ─────────────────────────────────────────────────────

def _truncate_response(data: dict, function: str) -> dict:
    """Truncate large API responses to prevent context overflow."""

    # Time series data — keep most recent N points
    time_series_prefixes = (
        "Time Series", "Technical Analysis", "Stock Quotes",
    )
    for key in list(data.keys()):
        if any(key.startswith(p) for p in time_series_prefixes):
            entries = data[key]
            if isinstance(entries, dict) and len(entries) > MAX_TIME_SERIES_POINTS:
                sorted_keys = sorted(entries.keys(), reverse=True)[:MAX_TIME_SERIES_POINTS]
                data[key] = {k: entries[k] for k in sorted_keys}
                data["_note"] = (
                    f"Showing most recent {MAX_TIME_SERIES_POINTS} of "
                    f"{len(entries)} available data points"
                )

    # News — limit articles
    if "feed" in data and isinstance(data["feed"], list):
        total = len(data["feed"])
        if total > MAX_NEWS_ARTICLES:
            data["feed"] = data["feed"][:MAX_NEWS_ARTICLES]
            data["_note"] = f"Showing {MAX_NEWS_ARTICLES} of {total} articles"

    # Financial statements — keep most recent periods
    for key in ("annualReports", "quarterlyReports", "annualEarnings", "quarterlyEarnings"):
        if key in data and isinstance(data[key], list) and len(data[key]) > MAX_FINANCIAL_PERIODS:
            data[key] = data[key][:MAX_FINANCIAL_PERIODS]

    # Economic indicator data series
    if "data" in data and isinstance(data["data"], list) and len(data["data"]) > MAX_TIME_SERIES_POINTS:
        data["data"] = data["data"][:MAX_TIME_SERIES_POINTS]
        data["_note"] = f"Showing most recent {MAX_TIME_SERIES_POINTS} data points"

    return data


# ── Status Formatting ───────────────────────────────────────────────────────

_FUNC_LABELS = {
    "GLOBAL_QUOTE": "latest quote",
    "TIME_SERIES_DAILY": "daily price history",
    "TIME_SERIES_DAILY_ADJUSTED": "adjusted daily prices",
    "TIME_SERIES_WEEKLY": "weekly price history",
    "TIME_SERIES_MONTHLY": "monthly price history",
    "TIME_SERIES_INTRADAY": "intraday prices",
    "COMPANY_OVERVIEW": "company overview",
    "INCOME_STATEMENT": "income statement",
    "BALANCE_SHEET": "balance sheet",
    "CASH_FLOW": "cash flow statement",
    "EARNINGS": "earnings data",
    "NEWS_SENTIMENT": "news & sentiment",
    "TOP_GAINERS_LOSERS": "top market movers",
    "INSIDER_TRANSACTIONS": "insider transactions",
    "INSTITUTIONAL_HOLDINGS": "institutional holdings",
    "EARNINGS_CALL_TRANSCRIPT": "earnings call transcript",
    "EARNINGS_CALENDAR": "earnings calendar",
    "IPO_CALENDAR": "IPO calendar",
    "REALTIME_OPTIONS": "options chain",
    "HISTORICAL_OPTIONS": "historical options",
    "SYMBOL_SEARCH": "symbol search",
    "MARKET_STATUS": "market status",
    "LISTING_STATUS": "listing status",
    "REALTIME_BULK_QUOTES": "bulk quotes",
    # Technical indicators
    "RSI": "RSI indicator",
    "MACD": "MACD indicator",
    "SMA": "simple moving average",
    "EMA": "exponential moving average",
    "BBANDS": "Bollinger Bands",
    "STOCH": "stochastic oscillator",
    "ADX": "ADX indicator",
    "CCI": "CCI indicator",
    "ATR": "ATR indicator",
    "OBV": "on-balance volume",
    "VWAP": "VWAP",
    # Forex
    "FX_DAILY": "daily forex rates",
    "FX_WEEKLY": "weekly forex rates",
    "FX_MONTHLY": "monthly forex rates",
    "FX_INTRADAY": "intraday forex rates",
    # Crypto
    "DIGITAL_CURRENCY_DAILY": "daily crypto prices",
    "DIGITAL_CURRENCY_WEEKLY": "weekly crypto prices",
    "DIGITAL_CURRENCY_MONTHLY": "monthly crypto prices",
    "CURRENCY_EXCHANGE_RATE": "exchange rate",
    # Commodities
    "WTI": "WTI crude oil prices",
    "BRENT": "Brent crude oil prices",
    "NATURAL_GAS": "natural gas prices",
    "GOLD_SILVER_SPOT": "gold & silver spot prices",
    "GOLD_SILVER_HISTORY": "gold & silver history",
    # Economic
    "REAL_GDP": "GDP data",
    "TREASURY_YIELD": "treasury yield data",
    "FEDERAL_FUNDS_RATE": "federal funds rate",
    "CPI": "CPI data",
    "INFLATION": "inflation data",
    "UNEMPLOYMENT": "unemployment data",
    "NONFARM_PAYROLL": "nonfarm payroll data",
    "RETAIL_SALES": "retail sales data",
}


def format_tool_status(tool_input: dict) -> str:
    """Generate a human-readable status message for tool execution."""
    function = (tool_input.get("function") or "").upper()
    symbol = (tool_input.get("symbol") or "").upper()

    label = _FUNC_LABELS.get(function, function.lower().replace("_", " "))

    if symbol:
        return f"Fetching {label} for {symbol}..."
    return f"Fetching {label}..."


# ── Chart Data Extraction ───────────────────────────────────────────────────

def extract_chart_data(tool_input: dict, result: dict) -> Optional[dict]:
    """
    Extract chart-ready data from an AV tool result.
    Returns a dict with chart type, title, series data, etc.
    Returns None if the data isn't chartable.
    """
    if "error" in result:
        return None

    function = (tool_input.get("function") or "").upper()
    symbol = (tool_input.get("symbol") or "").upper()

    # --- RSI ---
    if function == "RSI":
        series_key = next((k for k in result if k.startswith("Technical Analysis")), None)
        if not series_key:
            return None
        points = []
        for date_str, vals in sorted(result[series_key].items()):
            try:
                points.append({"date": date_str, "RSI": round(float(vals.get("RSI", 0)), 2)})
            except (ValueError, TypeError):
                continue
        if not points:
            return None
        return {
            "type": "line",
            "title": f"RSI — {symbol}",
            "series": [{"key": "RSI", "color": "#6366f1"}],
            "data": points,
            "referenceLines": [
                {"y": 70, "label": "Overbought", "color": "#ef4444"},
                {"y": 30, "label": "Oversold", "color": "#22c55e"},
            ],
            "yDomain": [0, 100],
        }

    # --- MACD ---
    if function in ("MACD", "MACDEXT"):
        series_key = next((k for k in result if k.startswith("Technical Analysis")), None)
        if not series_key:
            return None
        points = []
        for date_str, vals in sorted(result[series_key].items()):
            try:
                points.append({
                    "date": date_str,
                    "MACD": round(float(vals.get("MACD", 0)), 4),
                    "Signal": round(float(vals.get("MACD_Signal", 0)), 4),
                    "Histogram": round(float(vals.get("MACD_Hist", 0)), 4),
                })
            except (ValueError, TypeError):
                continue
        if not points:
            return None
        return {
            "type": "macd",
            "title": f"MACD — {symbol}",
            "series": [
                {"key": "MACD", "color": "#6366f1"},
                {"key": "Signal", "color": "#f97316"},
                {"key": "Histogram", "color": "#94a3b8", "type": "bar"},
            ],
            "data": points,
            "referenceLines": [{"y": 0, "label": "", "color": "#64748b"}],
        }

    # --- SMA / EMA / WMA / DEMA / TEMA ---
    ma_types = {"SMA", "EMA", "WMA", "DEMA", "TEMA", "TRIMA", "KAMA"}
    if function in ma_types:
        series_key = next((k for k in result if k.startswith("Technical Analysis")), None)
        if not series_key:
            return None
        points = []
        value_key = function
        for date_str, vals in sorted(result[series_key].items()):
            try:
                points.append({"date": date_str, value_key: round(float(vals.get(value_key, 0)), 2)})
            except (ValueError, TypeError):
                continue
        if not points:
            return None
        return {
            "type": "line",
            "title": f"{function} — {symbol}",
            "series": [{"key": value_key, "color": "#6366f1"}],
            "data": points,
        }

    # --- Bollinger Bands ---
    if function == "BBANDS":
        series_key = next((k for k in result if k.startswith("Technical Analysis")), None)
        if not series_key:
            return None
        points = []
        for date_str, vals in sorted(result[series_key].items()):
            try:
                points.append({
                    "date": date_str,
                    "Upper": round(float(vals.get("Real Upper Band", 0)), 2),
                    "Middle": round(float(vals.get("Real Middle Band", 0)), 2),
                    "Lower": round(float(vals.get("Real Lower Band", 0)), 2),
                })
            except (ValueError, TypeError):
                continue
        if not points:
            return None
        return {
            "type": "line",
            "title": f"Bollinger Bands — {symbol}",
            "series": [
                {"key": "Upper", "color": "#ef4444"},
                {"key": "Middle", "color": "#6366f1"},
                {"key": "Lower", "color": "#22c55e"},
            ],
            "data": points,
        }

    # --- Stochastic ---
    if function in ("STOCH", "STOCHF", "STOCHRSI"):
        series_key = next((k for k in result if k.startswith("Technical Analysis")), None)
        if not series_key:
            return None
        points = []
        for date_str, vals in sorted(result[series_key].items()):
            try:
                row: dict = {"date": date_str}
                for vk, vv in vals.items():
                    row[vk] = round(float(vv), 2)
                points.append(row)
            except (ValueError, TypeError):
                continue
        if not points:
            return None
        keys = [k for k in points[0] if k != "date"]
        colors = ["#6366f1", "#f97316", "#22c55e", "#ef4444"]
        return {
            "type": "line",
            "title": f"{function} — {symbol}",
            "series": [{"key": k, "color": colors[i % len(colors)]} for i, k in enumerate(keys)],
            "data": points,
            "referenceLines": [
                {"y": 80, "label": "Overbought", "color": "#ef4444"},
                {"y": 20, "label": "Oversold", "color": "#22c55e"},
            ],
            "yDomain": [0, 100],
        }

    # --- ADX / CCI / ATR / OBV / WILLR / MFI / AROON ---
    single_indicator = {"ADX", "ADXR", "DX", "CCI", "MFI", "WILLR", "ATR", "NATR", "OBV", "SAR", "VWAP"}
    if function in single_indicator:
        series_key = next((k for k in result if k.startswith("Technical Analysis")), None)
        if not series_key:
            return None
        points = []
        for date_str, vals in sorted(result[series_key].items()):
            try:
                row: dict = {"date": date_str}
                for vk, vv in vals.items():
                    row[vk] = round(float(vv), 2)
                points.append(row)
            except (ValueError, TypeError):
                continue
        if not points:
            return None
        keys = [k for k in points[0] if k != "date"]
        return {
            "type": "line",
            "title": f"{function} — {symbol}",
            "series": [{"key": k, "color": "#6366f1"} for k in keys],
            "data": points,
        }

    # --- Time Series (Daily/Weekly/Monthly/Intraday) ---
    ts_functions = {
        "TIME_SERIES_DAILY", "TIME_SERIES_DAILY_ADJUSTED",
        "TIME_SERIES_WEEKLY", "TIME_SERIES_WEEKLY_ADJUSTED",
        "TIME_SERIES_MONTHLY", "TIME_SERIES_MONTHLY_ADJUSTED",
        "TIME_SERIES_INTRADAY",
    }
    if function in ts_functions:
        series_key = next((k for k in result if k.startswith("Time Series") or k.startswith("Weekly") or k.startswith("Monthly")), None)
        if not series_key:
            return None
        points = []
        for date_str, vals in sorted(result[series_key].items()):
            try:
                close_key = next((k for k in vals if "close" in k.lower() and "adjust" not in k.lower()), None)
                vol_key = next((k for k in vals if "volume" in k.lower()), None)
                row: dict = {"date": date_str}
                if close_key:
                    row["Close"] = round(float(vals[close_key]), 2)
                if vol_key:
                    row["Volume"] = int(float(vals[vol_key]))
                points.append(row)
            except (ValueError, TypeError):
                continue
        if not points:
            return None
        return {
            "type": "price",
            "title": f"Price — {symbol}",
            "series": [{"key": "Close", "color": "#6366f1"}],
            "data": points,
        }

    # --- Commodities / Economic indicators with "data" list ---
    if "data" in result and isinstance(result["data"], list):
        points = []
        for item in result["data"]:
            try:
                val = float(item.get("value", ""))
                points.append({"date": item.get("date", ""), "Value": val})
            except (ValueError, TypeError):
                continue
        if points:
            label = _FUNC_LABELS.get(function, function)
            return {
                "type": "line",
                "title": label.title() if symbol == "" else f"{label.title()} — {symbol}",
                "series": [{"key": "Value", "color": "#6366f1"}],
                "data": sorted(points, key=lambda p: p["date"]),
            }

    return None
