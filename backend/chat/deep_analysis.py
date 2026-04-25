"""
Deep Analysis Engine — TradingAgents-inspired multi-agent analysis.

Mirrors real trading firm dynamics: Analyst team → Research debate →
Trader proposal → Risk management → Portfolio Manager verdict.

Each agent uses AWS Bedrock (LLM) + Alpha Vantage (data) to produce
a markdown report. Reports are stored in PostgreSQL and the final
verdict is returned to the chat.
"""
from __future__ import annotations

import json
import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional, Callable

from database import pg_cursor
from chat.av_tools import execute_av_tool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Agent definitions — modelled after TradingAgents framework
# ---------------------------------------------------------------------------

AGENT_PIPELINE = [
    # Phase 1: Analyst agents (run in parallel)
    {
        "group": "analyst",
        "parallel": True,
        "agents": [
            {
                "name": "market_analyst",
                "label": "Market Analyst",
                "data_calls": [
                    {"function": "GLOBAL_QUOTE"},
                    {"function": "TIME_SERIES_DAILY_ADJUSTED", "params": {"outputsize": "compact"}},
                    {"function": "COMPANY_OVERVIEW"},
                ],
                "prompt": (
                    "You are a Market Analyst at a top-tier trading firm. Analyze the "
                    "following market data for {ticker}.\n\n"
                    "Focus on:\n"
                    "- Current price action, recent trend, and volume patterns\n"
                    "- Key support and resistance levels\n"
                    "- Market capitalization and valuation context\n"
                    "- Comparison to 52-week range\n\n"
                    "DATA:\n{data}\n\n"
                    "Provide a concise, professional market analysis report. "
                    "Include specific numbers and price levels. "
                    "End with a clear OUTLOOK: BULLISH / BEARISH / NEUTRAL."
                ),
            },
            {
                "name": "technical_analyst",
                "label": "Technical Analyst",
                "data_calls": [
                    {"function": "RSI", "params": {"interval": "daily", "time_period": "14", "series_type": "close"}},
                    {"function": "MACD", "params": {"interval": "daily", "series_type": "close"}},
                    {"function": "BBANDS", "params": {"interval": "daily", "time_period": "20", "series_type": "close"}},
                    {"function": "SMA", "params": {"interval": "daily", "time_period": "50", "series_type": "close"}},
                    {"function": "SMA", "params": {"interval": "daily", "time_period": "200", "series_type": "close"}},
                    {"function": "ADX", "params": {"interval": "daily", "time_period": "14"}},
                    {"function": "STOCH", "params": {"interval": "daily"}},
                    {"function": "ATR", "params": {"interval": "daily", "time_period": "14"}},
                    {"function": "OBV", "params": {"interval": "daily"}},
                ],
                "prompt": (
                    "You are a Technical Analyst at a quantitative trading firm. Analyze "
                    "the technical indicators for {ticker}.\n\n"
                    "Focus on:\n"
                    "- RSI: overbought (>70) / oversold (<30) conditions\n"
                    "- MACD: signal line crossovers, histogram momentum\n"
                    "- Bollinger Bands: price relative to bands, squeeze/expansion\n"
                    "- Moving Averages: 50-day vs 200-day (Golden Cross / Death Cross)\n"
                    "- ADX: trend strength (>25 = strong trend)\n"
                    "- Stochastics: momentum divergence\n"
                    "- ATR: current volatility regime\n"
                    "- OBV: volume confirmation of price trends\n\n"
                    "DATA:\n{data}\n\n"
                    "Provide a detailed technical analysis. Reference specific indicator "
                    "values. Identify key patterns and signals. "
                    "End with a clear OUTLOOK: BULLISH / BEARISH / NEUTRAL."
                ),
            },
            {
                "name": "fundamentals_analyst",
                "label": "Fundamentals Analyst",
                "data_calls": [
                    {"function": "COMPANY_OVERVIEW"},
                    {"function": "INCOME_STATEMENT"},
                    {"function": "BALANCE_SHEET"},
                    {"function": "CASH_FLOW"},
                    {"function": "EARNINGS"},
                ],
                "prompt": (
                    "You are a Fundamentals Analyst at an investment bank. Analyze the "
                    "financial statements and fundamentals for {ticker}.\n\n"
                    "Focus on:\n"
                    "- Revenue growth trajectory (YoY trends)\n"
                    "- Profitability: gross margin, operating margin, net margin\n"
                    "- EPS trends and earnings surprises\n"
                    "- Balance sheet strength: debt/equity, current ratio\n"
                    "- Cash flow: FCF generation, capex intensity\n"
                    "- Valuation: P/E, P/S, P/B, PEG ratio vs sector\n"
                    "- Dividend sustainability (if applicable)\n\n"
                    "DATA:\n{data}\n\n"
                    "Provide a thorough fundamental analysis with specific financial "
                    "figures. Identify red flags and strengths. "
                    "End with a clear OUTLOOK: BULLISH / BEARISH / NEUTRAL."
                ),
            },
            {
                "name": "news_analyst",
                "label": "News Analyst",
                "data_calls": [
                    {"function": "NEWS_SENTIMENT", "params": {"sort": "RELEVANCE"}},
                ],
                "prompt": (
                    "You are a News & Sentiment Analyst at a hedge fund. Analyze the "
                    "latest news and sentiment data for {ticker}.\n\n"
                    "Focus on:\n"
                    "- Overall sentiment score and trend\n"
                    "- Key news themes and catalysts\n"
                    "- Macro/industry headwinds or tailwinds\n"
                    "- Potential event risks (earnings, regulatory, litigation)\n"
                    "- Social/media sentiment momentum\n\n"
                    "DATA:\n{data}\n\n"
                    "Provide a sentiment analysis summarizing the news landscape. "
                    "Highlight material developments that could impact the stock. "
                    "End with a clear OUTLOOK: BULLISH / BEARISH / NEUTRAL."
                ),
            },
        ],
    },
    # Phase 2: Research debate (sequential — needs analyst reports)
    {
        "group": "research",
        "parallel": True,
        "agents": [
            {
                "name": "bull_researcher",
                "label": "Bull/Bear Advocates",
                "uses_prior_reports": True,
                "prompt": (
                    "You are the Research Team at a trading firm. You have received "
                    "analyst reports for {ticker}. Your job is to present BOTH sides.\n\n"
                    "ANALYST REPORTS:\n{prior_reports}\n\n"
                    "Structure your report as:\n"
                    "## Bull Case\n"
                    "Present the strongest arguments for buying. Reference specific "
                    "data points from the analyst reports.\n\n"
                    "## Bear Case\n"
                    "Present the strongest arguments against buying. Reference specific "
                    "risks, overvaluation concerns, or negative signals.\n\n"
                    "## Synthesis\n"
                    "Which case is stronger and why? Be specific about which data "
                    "points tip the balance."
                ),
            },
            {
                "name": "research_evaluator",
                "label": "Research Evaluator",
                "uses_prior_reports": True,
                "prompt": (
                    "You are a Senior Research Evaluator. Review the analyst reports "
                    "for {ticker} and evaluate the quality and consistency of the analysis.\n\n"
                    "ANALYST REPORTS:\n{prior_reports}\n\n"
                    "Evaluate:\n"
                    "- Are the technical and fundamental signals aligned or divergent?\n"
                    "- What's the strength of conviction across analysts?\n"
                    "- Any contradictions or gaps in the analysis?\n"
                    "- What additional factors should be considered?\n\n"
                    "Provide a meta-analysis with a confidence assessment: "
                    "HIGH CONFIDENCE / MEDIUM CONFIDENCE / LOW CONFIDENCE "
                    "in the prevailing direction."
                ),
            },
        ],
    },
    # Phase 3: Trader proposal
    {
        "group": "trading",
        "parallel": False,
        "agents": [
            {
                "name": "trader",
                "label": "Trader",
                "uses_prior_reports": True,
                "prompt": (
                    "You are a Senior Trader at a proprietary trading firm. Based on "
                    "all the research for {ticker}, compose a trade proposal.\n\n"
                    "ALL REPORTS:\n{prior_reports}\n\n"
                    "Your proposal must include:\n"
                    "- **Action**: BUY / SELL / HOLD\n"
                    "- **Conviction**: HIGH / MEDIUM / LOW\n"
                    "- **Entry Strategy**: Specific price levels or conditions\n"
                    "- **Position Sizing**: Suggested allocation (% of portfolio)\n"
                    "- **Target Price**: With rationale\n"
                    "- **Stop Loss**: With rationale\n"
                    "- **Time Horizon**: Days / Weeks / Months\n"
                    "- **Key Risks**: Top 3 risks to monitor\n\n"
                    "Be specific with numbers. This is an actionable trading plan."
                ),
            },
        ],
    },
    # Phase 4: Risk management
    {
        "group": "risk",
        "parallel": False,
        "agents": [
            {
                "name": "risk_analyst",
                "label": "Risk Analysts",
                "uses_prior_reports": True,
                "data_calls": [
                    {"function": "ATR", "params": {"interval": "daily", "time_period": "14"}},
                ],
                "prompt": (
                    "You are the Risk Management Team. Evaluate the trading proposal "
                    "for {ticker} and assess all risk dimensions.\n\n"
                    "ALL REPORTS AND TRADE PROPOSAL:\n{prior_reports}\n\n"
                    "ADDITIONAL VOLATILITY DATA:\n{data}\n\n"
                    "Assess:\n"
                    "- **Market Risk**: Volatility, beta, drawdown potential\n"
                    "- **Liquidity Risk**: Volume adequacy for proposed position\n"
                    "- **Concentration Risk**: Sector/single-stock exposure\n"
                    "- **Event Risk**: Upcoming catalysts (earnings, ex-div, etc.)\n"
                    "- **Correlation Risk**: Macro factor sensitivity\n\n"
                    "Provide a RISK RATING: LOW / MODERATE / HIGH / VERY HIGH\n"
                    "and any recommended adjustments to the trade proposal."
                ),
            },
        ],
    },
    # Phase 5: Final verdict
    {
        "group": "verdict",
        "parallel": False,
        "agents": [
            {
                "name": "portfolio_manager",
                "label": "Portfolio Manager",
                "uses_prior_reports": True,
                "prompt": (
                    "You are the Portfolio Manager making the final decision on {ticker}.\n\n"
                    "ALL ANALYSIS:\n{prior_reports}\n\n"
                    "Render your FINAL DECISION:\n\n"
                    "## Decision\n"
                    "**TRANSACTION PROPOSAL: BUY / SELL / HOLD**\n\n"
                    "## Rationale\n"
                    "Synthesize the key factors from all teams into a 2-3 paragraph "
                    "executive summary. Reference the strongest supporting evidence.\n\n"
                    "## Key Metrics\n"
                    "- Entry/Target/Stop levels (if BUY or SELL)\n"
                    "- Confidence: HIGH / MEDIUM / LOW\n"
                    "- Time Horizon\n"
                    "- Risk Rating\n\n"
                    "## Monitoring Triggers\n"
                    "List 3-5 specific conditions that would cause you to revisit "
                    "this decision.\n\n"
                    "Be decisive. Institutional investors need clear direction."
                ),
            },
        ],
    },
]


# ---------------------------------------------------------------------------
# Data fetching helper
# ---------------------------------------------------------------------------

def _fetch_agent_data(ticker: str, data_calls: list[dict]) -> dict:
    """Fetch all Alpha Vantage data for an agent's data_calls."""
    results = {}
    for call in data_calls:
        fn = call["function"]
        tool_input = {"function": fn, "symbol": ticker}
        if "params" in call:
            tool_input["params"] = call["params"]
        key = fn
        if "params" in call and "time_period" in call.get("params", {}):
            key = f"{fn}_{call['params']['time_period']}"
        result = execute_av_tool(tool_input)
        results[key] = result
    return results


def _format_data_for_prompt(data: dict) -> str:
    """Format fetched data dict into readable text for the LLM prompt."""
    parts = []
    for key, val in data.items():
        if isinstance(val, dict) and "error" in val:
            parts.append(f"[{key}]: Error - {val['error']}")
            continue
        # Truncate large JSON for prompt
        text = json.dumps(val, indent=2, default=str)
        if len(text) > 6000:
            text = text[:6000] + "\n... (truncated)"
        parts.append(f"[{key}]:\n{text}")
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# LLM call helper
# ---------------------------------------------------------------------------

def _call_llm(prompt: str, max_tokens: int = 2048) -> str:
    """Call Bedrock LLM for agent report generation."""
    from chat.ai_service import _get_bedrock_client, MODELS, MAX_RETRIES, RETRY_DELAY, _THINKING_RE

    client = _get_bedrock_client()
    for model_id in MODELS:
        for attempt in range(MAX_RETRIES + 1):
            try:
                response = client.converse(
                    modelId=model_id,
                    messages=[{"role": "user", "content": [{"text": prompt}]}],
                    inferenceConfig={"maxTokens": max_tokens, "temperature": 0.4},
                )
                text = response["output"]["message"]["content"][0].get("text", "")
                if text:
                    text = _THINKING_RE.sub("", text).strip()
                return text or "(No response)"
            except Exception as e:
                error_str = str(e)
                if "ThrottlingException" in error_str or "429" in error_str:
                    if attempt < MAX_RETRIES:
                        time.sleep(RETRY_DELAY * (attempt + 1))
                        continue
                    break
                elif "ResourceNotFoundException" in error_str or "ValidationException" in error_str:
                    break
                else:
                    logger.error("Agent LLM error (%s): %s", model_id, e)
                    if attempt < MAX_RETRIES:
                        time.sleep(RETRY_DELAY)
                        continue
                    break
    return "(Agent failed to generate response)"


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _update_analysis_status(analysis_id: str, status: str, **extra):
    with pg_cursor() as cur:
        sets = ["status = %s"]
        vals = [status]
        for k, v in extra.items():
            if v == "NOW()":
                sets.append(f"{k} = NOW()")
            else:
                sets.append(f"{k} = %s")
                vals.append(v)
        vals.append(analysis_id)
        cur.execute(f"UPDATE deep_analyses SET {', '.join(sets)} WHERE id = %s", vals)


def _update_report_status(report_id: str, status: str, **extra):
    with pg_cursor() as cur:
        sets = ["status = %s"]
        vals = [status]
        for k, v in extra.items():
            if v == "NOW()":
                sets.append(f"{k} = NOW()")
            else:
                sets.append(f"{k} = %s")
                vals.append(v)
        vals.append(report_id)
        cur.execute(f"UPDATE analysis_reports SET {', '.join(sets)} WHERE id = %s", vals)


def _insert_report(analysis_id: str, agent_name: str, agent_group: str) -> str:
    report_id = str(uuid.uuid4())
    with pg_cursor() as cur:
        cur.execute(
            """INSERT INTO analysis_reports (id, analysis_id, agent_name, agent_group, status)
               VALUES (%s, %s, %s, %s, 'pending')""",
            (report_id, analysis_id, agent_name, agent_group),
        )
    return report_id


def get_analysis(analysis_id: str) -> Optional[dict]:
    with pg_cursor() as cur:
        cur.execute("SELECT * FROM deep_analyses WHERE id = %s", (analysis_id,))
        row = cur.fetchone()
        if not row:
            return None
        result = dict(row)
        cur.execute(
            "SELECT * FROM analysis_reports WHERE analysis_id = %s ORDER BY started_at",
            (analysis_id,),
        )
        result["reports"] = [dict(r) for r in cur.fetchall()]
        return result


def list_user_analyses(user_id: str, limit: int = 20) -> list[dict]:
    with pg_cursor() as cur:
        cur.execute(
            """SELECT id, ticker, status, decision, confidence, summary,
                      created_at, completed_at, duration_secs, conversation_id
               FROM deep_analyses WHERE user_id = %s
               ORDER BY created_at DESC LIMIT %s""",
            (user_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]


# ---------------------------------------------------------------------------
# Chart data extraction for analysis reports
# ---------------------------------------------------------------------------

def _extract_charts_from_data(ticker: str, all_data: dict) -> list[dict]:
    """Extract chart-ready data from the raw AV responses."""
    from chat.av_tools import extract_chart_data
    charts = []
    for key, data in all_data.items():
        if isinstance(data, dict) and "error" not in data:
            # Reconstruct tool_input from the key
            fn = key.split("_")[0] if "_" in key and key.split("_")[-1].isdigit() else key
            # Use the raw function name
            for orig_key in [key, fn]:
                chart = extract_chart_data({"function": orig_key, "symbol": ticker}, data)
                if chart:
                    charts.append(chart)
                    break
    return charts


# ---------------------------------------------------------------------------
# Main analysis runner
# ---------------------------------------------------------------------------

def run_analysis(
    user_id: str,
    ticker: str,
    conversation_id: Optional[str] = None,
    progress_callback: Optional[Callable[[str, str, str], None]] = None,
) -> dict:
    """
    Run a full TradingAgents-style multi-agent analysis.

    Args:
        user_id: The user requesting the analysis
        ticker: Stock ticker to analyze (e.g. "AAPL")
        conversation_id: Optional chat conversation that triggered this
        progress_callback: Called with (agent_name, status, label) for live updates

    Returns:
        The completed analysis dict
    """
    ticker = ticker.upper().strip()
    analysis_id = str(uuid.uuid4())
    start_time = time.time()

    # Create the analysis record
    with pg_cursor() as cur:
        cur.execute(
            """INSERT INTO deep_analyses (id, user_id, conversation_id, ticker, status)
               VALUES (%s, %s, %s, %s, 'running')""",
            (analysis_id, user_id, conversation_id, ticker),
        )

    # Pre-create all report records
    report_ids = {}
    for phase in AGENT_PIPELINE:
        for agent in phase["agents"]:
            rid = _insert_report(analysis_id, agent["name"], phase["group"])
            report_ids[agent["name"]] = rid

    if progress_callback:
        progress_callback("analysis", "running", f"Analyzing {ticker}")

    try:
        completed_reports: dict[str, str] = {}  # agent_name -> report_content
        all_charts: list[dict] = []

        for phase in AGENT_PIPELINE:
            group = phase["group"]
            agents = phase["agents"]

            if phase.get("parallel") and len(agents) > 1:
                # Run agents in parallel
                with ThreadPoolExecutor(max_workers=4) as executor:
                    futures = {}
                    for agent in agents:
                        future = executor.submit(
                            _run_single_agent,
                            agent, ticker, completed_reports,
                            report_ids[agent["name"]], progress_callback,
                        )
                        futures[future] = agent["name"]

                    for future in as_completed(futures):
                        agent_name = futures[future]
                        try:
                            report_text, charts = future.result()
                            completed_reports[agent_name] = report_text
                            all_charts.extend(charts)
                        except Exception as e:
                            logger.error("Agent %s failed: %s", agent_name, e)
                            completed_reports[agent_name] = f"(Agent failed: {e})"
                            _update_report_status(
                                report_ids[agent_name], "failed",
                                error_message=str(e),
                            )
            else:
                # Run sequentially
                for agent in agents:
                    try:
                        report_text, charts = _run_single_agent(
                            agent, ticker, completed_reports,
                            report_ids[agent["name"]], progress_callback,
                        )
                        completed_reports[agent["name"]] = report_text
                        all_charts.extend(charts)
                    except Exception as e:
                        logger.error("Agent %s failed: %s", agent["name"], e)
                        completed_reports[agent["name"]] = f"(Agent failed: {e})"
                        _update_report_status(
                            report_ids[agent["name"]], "failed",
                            error_message=str(e),
                        )

        # Extract decision from portfolio manager's report
        pm_report = completed_reports.get("portfolio_manager", "")
        decision = _extract_decision(pm_report)
        confidence = _extract_confidence(pm_report)

        # Generate executive summary
        summary = _generate_summary(ticker, pm_report, decision, confidence)

        # Build per-agent breakdown + key metrics for chat preview / detail header
        agent_breakdown = _build_agent_breakdown(completed_reports)
        pm_metrics = _extract_pm_metrics(pm_report)

        duration = time.time() - start_time
        _update_analysis_status(
            analysis_id, "completed",
            completed_at="NOW()",
            duration_secs=round(duration, 1),
            summary=summary,
            decision=decision,
            confidence=confidence,
            metadata=json.dumps({
                "charts": all_charts[:10],
                "agent_breakdown": agent_breakdown,
                "pm_metrics": pm_metrics,
            }),
        )

        if progress_callback:
            progress_callback("analysis", "completed", f"Analysis complete: {decision}")

        return get_analysis(analysis_id)

    except Exception as e:
        logger.error("Analysis %s failed: %s", analysis_id, e)
        _update_analysis_status(analysis_id, "failed")
        if progress_callback:
            progress_callback("analysis", "failed", str(e))
        raise


def _run_single_agent(
    agent: dict,
    ticker: str,
    completed_reports: dict[str, str],
    report_id: str,
    progress_callback: Optional[Callable],
) -> tuple[str, list[dict]]:
    """Run a single agent: fetch data, call LLM, save report."""
    agent_name = agent["name"]
    label = agent["label"]

    if progress_callback:
        progress_callback(agent_name, "running", label)

    _update_report_status(report_id, "running", started_at="NOW()")

    # Fetch data if agent has data_calls
    data = {}
    charts = []
    if "data_calls" in agent:
        data = _fetch_agent_data(ticker, agent["data_calls"])
        charts = _extract_charts_from_data(ticker, data)

    # Build prompt
    prompt = agent["prompt"].replace("{ticker}", ticker)
    if "{data}" in prompt:
        prompt = prompt.replace("{data}", _format_data_for_prompt(data))
    if "{prior_reports}" in prompt and agent.get("uses_prior_reports"):
        prior = "\n\n---\n\n".join(
            f"### {name.replace('_', ' ').title()} Report\n\n{text}"
            for name, text in completed_reports.items()
        )
        prompt = prompt.replace("{prior_reports}", prior)

    # Call LLM
    report_text = _call_llm(prompt)

    # Save report
    _update_report_status(
        report_id, "completed",
        completed_at="NOW()",
        report_content=report_text,
        report_data=json.dumps({"charts": charts}),
    )

    if progress_callback:
        progress_callback(agent_name, "completed", label)

    return report_text, charts


# ---------------------------------------------------------------------------
# Post-processing helpers
# ---------------------------------------------------------------------------

def _extract_decision(report: str) -> str:
    """Extract BUY/SELL/HOLD from the portfolio manager's report."""
    report_upper = report.upper()
    # Look for explicit transaction proposal
    for keyword in ["TRANSACTION PROPOSAL:", "DECISION:", "FINAL DECISION:", "ACTION:"]:
        if keyword in report_upper:
            idx = report_upper.index(keyword) + len(keyword)
            snippet = report_upper[idx:idx + 30].strip()
            if "BUY" in snippet:
                return "BUY"
            elif "SELL" in snippet:
                return "SELL"
            elif "HOLD" in snippet:
                return "HOLD"
    # Fallback: count occurrences
    buy_count = report_upper.count("BUY")
    sell_count = report_upper.count("SELL")
    hold_count = report_upper.count("HOLD")
    if buy_count > sell_count and buy_count > hold_count:
        return "BUY"
    elif sell_count > buy_count and sell_count > hold_count:
        return "SELL"
    return "HOLD"


def _extract_confidence(report: str) -> str:
    """Extract confidence level from the report."""
    report_upper = report.upper()
    for keyword in ["CONFIDENCE:", "CONVICTION:"]:
        if keyword in report_upper:
            idx = report_upper.index(keyword) + len(keyword)
            snippet = report_upper[idx:idx + 20].strip()
            if "HIGH" in snippet:
                return "HIGH"
            elif "LOW" in snippet:
                return "LOW"
    return "MEDIUM"


def _generate_summary(ticker: str, pm_report: str, decision: str, confidence: str) -> str:
    """Generate a concise executive summary for the chat."""
    prompt = (
        f"You are writing a chat reply for an investor who asked for a recommendation on {ticker}. "
        f"The portfolio manager's verdict is {decision} with {confidence} confidence.\n\n"
        f"Write a polished response (4-6 sentences, no headers, no bullet lists) that:\n"
        f"  1. Opens with the recommendation in plain English (BUY/SELL/HOLD + confidence).\n"
        f"  2. Names the 2-3 strongest drivers behind the decision (cite specific numbers if present).\n"
        f"  3. Mentions the entry, target, and stop levels if the report contains them.\n"
        f"  4. Calls out the single biggest risk to monitor.\n"
        f"  5. Closes by inviting the user to review the full multi-agent report.\n\n"
        f"Tone: confident, professional, conversational. Do not use markdown headers or bold.\n\n"
        f"PORTFOLIO MANAGER REPORT:\n{pm_report[:3500]}\n\n"
        f"Reply:"
    )
    return _call_llm(prompt, max_tokens=420)


# ---------------------------------------------------------------------------
# Agent breakdown extraction (for chat preview + chips)
# ---------------------------------------------------------------------------

import re as _re

_OUTLOOK_PATTERNS = [
    ("BULLISH",  _re.compile(r"\bOUTLOOK\s*[:\-]\s*BULLISH\b", _re.I)),
    ("BEARISH",  _re.compile(r"\bOUTLOOK\s*[:\-]\s*BEARISH\b", _re.I)),
    ("NEUTRAL",  _re.compile(r"\bOUTLOOK\s*[:\-]\s*NEUTRAL\b", _re.I)),
]
_RISK_PATTERN     = _re.compile(r"\bRISK\s*RATING\s*[:\-]\s*(VERY\s+HIGH|HIGH|MODERATE|LOW)\b", _re.I)
_CONF_PATTERN     = _re.compile(r"\b(HIGH|MEDIUM|LOW)\s+CONFIDENCE\b", _re.I)
_DECISION_PATTERN = _re.compile(r"\b(BUY|SELL|HOLD)\b")


def _extract_agent_signal(agent_name: str, report: str) -> Optional[str]:
    """Return a short tag (BULLISH/BEARISH/NEUTRAL/HIGH/MODERATE/BUY/SELL/HOLD) per agent."""
    if not report:
        return None
    if agent_name == "risk_analyst":
        m = _RISK_PATTERN.search(report)
        return m.group(1).upper().replace(" ", "_") if m else None
    if agent_name == "research_evaluator":
        m = _CONF_PATTERN.search(report)
        return f"{m.group(1).upper()} CONF" if m else None
    if agent_name in ("trader", "portfolio_manager"):
        m = _DECISION_PATTERN.search(report.upper())
        return m.group(1) if m else None
    for tag, pat in _OUTLOOK_PATTERNS:
        if pat.search(report):
            return tag
    return None


_HEADER_RE = _re.compile(r"^\s*(#+|\*+|-+|\d+\.)\s*", _re.M)


def _extract_agent_headline(report: str, max_chars: int = 240) -> str:
    """First non-trivial sentence(s) of the report, with markdown stripped."""
    if not report:
        return ""
    text = report.strip()
    # Drop the first line if it looks like a heading
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    body_lines: list[str] = []
    for ln in lines:
        # Skip pure heading / bold-only lines
        stripped = _HEADER_RE.sub("", ln).strip()
        stripped = stripped.strip("*_`")
        if not stripped:
            continue
        # Skip section labels like "Decision" / "Rationale"
        if len(stripped) <= 24 and stripped.endswith(":"):
            continue
        body_lines.append(stripped)
        if sum(len(b) for b in body_lines) > max_chars + 80:
            break
    snippet = " ".join(body_lines)
    snippet = _re.sub(r"\s+", " ", snippet).strip()
    if len(snippet) > max_chars:
        snippet = snippet[:max_chars].rsplit(" ", 1)[0] + "…"
    return snippet


def _build_agent_breakdown(completed_reports: dict[str, str]) -> list[dict]:
    """Produce a structured per-agent summary preserving pipeline order."""
    breakdown: list[dict] = []
    for phase in AGENT_PIPELINE:
        for agent in phase["agents"]:
            name = agent["name"]
            report = completed_reports.get(name, "") or ""
            failed = report.startswith("(Agent failed")
            breakdown.append({
                "name":     name,
                "label":    agent["label"],
                "group":    phase["group"],
                "status":   "failed" if failed else ("completed" if report else "pending"),
                "signal":   None if failed else _extract_agent_signal(name, report),
                "headline": "" if failed else _extract_agent_headline(report),
            })
    return breakdown


def _extract_pm_metrics(pm_report: str) -> dict:
    """Pull entry/target/stop/horizon/risk from the portfolio manager's report."""
    if not pm_report:
        return {}
    out: dict[str, str] = {}
    patterns = {
        "entry":        _re.compile(r"\bEntry\s*[:\-]\s*\$?([\d,.]+)", _re.I),
        "target":       _re.compile(r"\bTarget(?:\s+Price)?\s*[:\-]\s*\$?([\d,.]+)", _re.I),
        "stop_loss":    _re.compile(r"\bStop[\s-]?Loss\s*[:\-]\s*\$?([\d,.]+)", _re.I),
        "time_horizon": _re.compile(r"\bTime\s+Horizon\s*[:\-]\s*([A-Za-z0-9 ]{2,30})", _re.I),
        "risk_rating":  _re.compile(r"\bRisk\s+Rating\s*[:\-]\s*([A-Z ]{3,15})", _re.I),
    }
    for key, pat in patterns.items():
        m = pat.search(pm_report)
        if m:
            val = m.group(1).strip().rstrip(".,;:")
            out[key] = val
    return out
