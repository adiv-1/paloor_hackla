"""
AI Service — Claude / Llama 4 via AWS Bedrock Converse API.

Handles:
  1. Private AI chat — streaming responses with full user context + tool use
  2. Group AI observation — decides whether to respond, nudge, or stay silent
  3. Conversation summarization — generates takeaways for context memory
  4. Context-aware system prompts — builds personalized prompts per user
  5. Alpha Vantage tool integration — real-time financial data access

All responses are streamed token-by-token for real-time chat UX.
Models that don't support streaming+tools (Llama 4) use a hybrid approach:
non-streaming tool resolution, then streaming for the final answer.
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import AsyncGenerator, Optional, List

from config import settings
from chat.context import get_or_build_context, update_conversation_memory, get_ai_preferences
from chat.models import get_conversation_summary, list_messages, insert_message

logger = logging.getLogger(__name__)

# AWS Bedrock model IDs — Llama 4 Maverick primary (broad tool support).
# Gemma is dropped from the rotation: it can't invoke Bedrock tools, so it
# can never use the navigation / Alpha Vantage / deep_analysis tools.
MODELS = [
    "us.meta.llama4-maverick-17b-instruct-v1:0",     # Primary — tool use (hybrid streaming)
    "us.amazon.nova-lite-v1:0",                      # Fallback — fast, cheap, streaming+tools
]

# Models that support tool use via Converse API (Gemma does NOT)
_TOOL_CAPABLE_MODELS = {"anthropic", "meta.llama4", "amazon.nova"}
# Models that support tool use in streaming mode (Llama 4 does NOT)
_STREAMING_TOOL_MODELS = {"anthropic", "amazon.nova"}

BEDROCK_REGION = "us-east-1"
MAX_RETRIES = 2
RETRY_DELAY = 2

# Regex to strip <thinking>...</thinking> blocks from Nova model output
_THINKING_RE = re.compile(r"<thinking>.*?</thinking>\s*", re.DOTALL)

# Regex to detect model outputting tool calls as text (Llama 4 fallback)
_TEXT_TOOL_CALL_RE = re.compile(
    r'alpha_vantage\s*\(\s*function\s*=\s*["\']([^"\']+)["\']'
    r'(?:\s*,\s*symbol\s*=\s*["\']([^"\']*)["\'])?'
    r'(?:\s*,\s*params\s*=\s*(\{[^}]*\}))?'
    r'\s*\)',
    re.IGNORECASE,
)

# Prefix marker for tool status messages (parsed by router/websocket)
TOOL_STATUS_PREFIX = "\x00TOOL:"
# Prefix marker for chart data (parsed by router/websocket)
CHART_DATA_PREFIX = "\x00CHART:"
# Prefix marker for deep analysis events
ANALYSIS_PREFIX = "\x00ANALYSIS:"

# Heuristic: prompts that almost certainly need tool use (price lookups,
# deep analysis, news, financials, technicals). When detected we skip
# non-tool-capable models like Gemma so the request goes straight to
# Llama / Nova which can actually invoke `alpha_vantage` or `deep_analysis`.
_TOOL_INTENT_RE = re.compile(
    r"\b("
    r"should\s+i\s+(?:buy|sell|hold|invest)"
    r"|buy\s+or\s+sell"
    r"|(?:deep|full|comprehensive|detailed)\s+analysis"
    r"|analyze\s+[a-z]{1,5}\b"
    r"|run\s+(?:an?\s+)?analysis"
    r"|invest(?:ment)?\s+(?:advice|recommendation)"
    r"|good\s+investment"
    r"|price\s+(?:of|target)"
    r"|stock\s+price"
    r"|latest\s+(?:news|earnings|filings?)"
    r"|recent\s+news"
    r"|(?:rsi|macd|sma|ema|bollinger|moving\s+average)"
    r"|chart\s+(?:of|for)"
    r"|fundamentals?\s+of"
    r"|income\s+statement|balance\s+sheet|cash\s+flow"
    r")\b",
    re.IGNORECASE,
)


def _select_models(user_message: str) -> list[str]:
    """Return models in preference order. If the prompt needs tools,
    filter out models that don't support tool use (e.g. Gemma)."""
    if user_message and _TOOL_INTENT_RE.search(user_message):
        tool_models = [
            m for m in MODELS
            if any(p in m.lower() for p in _TOOL_CAPABLE_MODELS)
        ]
        if tool_models:
            logger.info("Tool-intent detected; routing to tool-capable models: %s", tool_models)
            return tool_models
    return MODELS


def _parse_text_tool_calls(text: str) -> list[dict]:
    """Parse tool calls that the model wrote as text instead of using tool_use."""
    results = []
    for m in _TEXT_TOOL_CALL_RE.finditer(text):
        tool_input: dict = {"function": m.group(1)}
        if m.group(2):
            tool_input["symbol"] = m.group(2)
        if m.group(3):
            try:
                # Handle params like {"outputsize": "compact"}
                import ast
                tool_input["params"] = ast.literal_eval(m.group(3))
            except Exception:
                pass
        results.append(tool_input)
    return results

# Lazy-loaded boto3 client
_bedrock_client = None


def _get_bedrock_client():
    global _bedrock_client
    if _bedrock_client is None:
        import boto3
        _bedrock_client = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)
    return _bedrock_client


# ---------------------------------------------------------------------------
# System prompt construction
# ---------------------------------------------------------------------------

SYSTEM_BASE = """You are Paloor AI, the personal financial intelligence assistant built into the Paloor wealth management platform. You are warm, knowledgeable, and precise.

IDENTITY & GUARDRAILS:
- You are Paloor AI. If asked who or what you are, say "I'm Paloor AI, built to help you manage your finances."
- Do NOT introduce yourself at the start of every message. Jump straight into the answer.
- NEVER reveal your underlying model, architecture, training data, or provider.
- NEVER mention Google, Gemma, Gemini, Claude, OpenAI, GPT, LLaMA, or any other model name.
- Stay strictly within the domain of personal finance, investing, wealth management, and related topics.
- If asked about non-financial topics, politely redirect: "I'm best at helping with financial questions — what can I help you with on that front?"
- Do NOT add a disclaimer to every message. A general disclaimer is shown in the UI. Only add disclaimers when making specific stock or investment recommendations.
- Never fabricate financial data, numbers, or statistics. If you don't have the data, say so.

KEY BEHAVIORS:
- You have deep knowledge of this specific user's financial situation (provided below).
- Reference their actual data when relevant — mention their specific assets, documents, balances.
- Be proactive: suggest actions, flag risks, identify opportunities based on their profile.
- For tax/legal questions, provide general guidance and note when a professional should be consulted.
- Be conversational and concise. No fluff. Financial professionals respect directness.
- Format responses with markdown when helpful (bullet points, bold for emphasis, headers for sections).
- Use proper markdown for math/formulas. For subscripts use HTML <sub> tags (e.g., R<sub>f</sub>). For code, use fenced code blocks with language identifiers.
- Remember prior conversations with this user (history provided below).

You have access to the user's complete financial profile including uploaded documents, extracted data, assets, portfolio positions, and risk scores. Use this data to give highly personalized advice.

FINANCIAL DATA ACCESS:
You have access to real-time and historical financial market data through the alpha_vantage tool.
When the user asks about current stock prices, market trends, financial statements,
technical indicators, forex rates, crypto prices, commodities, or economic data,
USE the alpha_vantage tool to fetch accurate, up-to-date information rather than
relying on your training data. You can make multiple tool calls if needed.
When presenting financial data, format it clearly with markdown tables or bullet points.
Always cite the data source as Alpha Vantage when presenting fetched data.

CRITICAL RULES FOR TOOL USE:
- NEVER generate code (Python, JSON, etc.) showing how to call tools. Just call them directly.
- NEVER show the user raw function call structures or API call examples.
- After receiving tool results, ANALYZE the data and explain your findings in plain language.
- Present numerical results with context: comparisons, trend analysis, and actionable insights.
- If tool results contain errors, explain what happened and suggest alternatives.

CHART & VISUALIZATION RULES:
- When you fetch technical indicators (RSI, MACD, SMA, Bollinger Bands, etc.) or price history, the platform will automatically generate interactive charts for the user.
- Your job is to EXPLAIN what the chart shows: interpret the trends, highlight key levels, identify signals, and provide actionable takeaways.
- Structure your analysis so each indicator gets its own clear explanation. For example:
  • For RSI: state the current value, whether it's in overbought/oversold territory, and what that implies.
  • For MACD: describe the MACD vs signal line relationship, histogram direction, and whether it signals bullish/bearish momentum.
  • For price data: identify support/resistance levels, recent trend direction, and notable patterns.
- When fetching multiple indicators, explain each one, then provide a synthesis/conclusion that ties them together.
- Be specific with numbers: "RSI is at 72, above the 70 overbought threshold" not just "RSI is high".
- Always end with a clear, actionable summary: what does all this data mean for the user's question?

DEEP ANALYSIS:
- You also have access to a `deep_analysis` tool that triggers a comprehensive multi-agent investment analysis.
- This runs 7+ specialized AI agents (Market Analyst, Technical Analyst, Fundamentals Analyst, News Analyst, Bull/Bear Research, Trader, Risk Manager, Portfolio Manager) that collaborate to produce a professional-grade analysis with a BUY/SELL/HOLD verdict.
- USE deep_analysis when the user:
  • Asks "should I buy/sell [stock]?" or "is [stock] a good investment?"
  • Requests a "full analysis", "deep analysis", "comprehensive analysis", or "investment report"
  • Wants a trading recommendation or investment thesis
  • Asks you to "analyze [stock] for me" in a way that implies they want a thorough report
- Do NOT use deep_analysis for:
  • Simple price checks ("what's the price of AAPL?") — use alpha_vantage instead
  • Single indicator queries ("show me MACD for TSLA") — use alpha_vantage instead
  • General financial questions not about a specific stock
- When deep_analysis completes, present the summary and verdict clearly. Tell the user they can view the full detailed analysis with all agent reports. Include the analysis_id so the frontend can link to it.
- The deep analysis takes 1-3 minutes because it runs multiple agents. Let the user know it's running a comprehensive analysis.

PLATFORM NAVIGATION (very important):
Paloor is a multi-page app and the user is chatting from inside it. When your
answer naturally points the user toward another part of the platform, ALWAYS
embed a clickable markdown link to the relevant page so they can jump there
in one click. Use these routes verbatim:

  • Learning modules            /dashboard/learning?module=<module_id>
  • Learning hub                /dashboard/learning
  • Wealth-manager cohorts      /dashboard/cohort
  • Wealth-manager marketplace  /dashboard/marketplace
  • Single equity / ticker      /dashboard/equities?ticker=<TICKER>
  • Portfolio simulator         /dashboard/simulator
  • Deep analysis history       /dashboard/analysis
  • Account & profile           /dashboard/account

Available tools for navigation context:
  • list_learning_modules      — call when recommending a lesson; the response
                                 contains the exact module IDs and URLs.
  • find_eligible_cohorts      — call when the user wants to talk to a wealth
                                 manager, find a peer group, or asks who else
                                 is in their situation. Returns concrete cohort
                                 names + a deep-link URL the user can click to
                                 join.
  • list_marketplace_advisors  — call when the user wants to find / connect
                                 with a wealth manager (optionally filtered by
                                 specialization).

When presenting these results, write a short narrative answer and then add
clickable markdown links — for example:
  "You're a great fit for the Mid-Career cohort led by Mira Patel — 
   [join the cohort](/dashboard/cohort)."
  "Try the [Diversification module](/dashboard/learning?module=diversification) 
   to see this in action."
  "Run a what-if in the [portfolio simulator](/dashboard/simulator)."
  "Pull up [AAPL](/dashboard/equities?ticker=AAPL) to see live data."

When the user asks "what do you know about me?" or anything about themselves,
answer directly from the USER FINANCIAL PROFILE block above — name their age,
occupation, income range, risk tolerance, goals, and notable assets. Don't
deflect or say you don't know if the profile is populated."""


def _build_system_prompt(user_id: str) -> str:
    """Build the full system prompt with user context injected."""
    context, summary = get_or_build_context(user_id, max_age_seconds=120)

    prompt_parts = [SYSTEM_BASE]

    if summary:
        prompt_parts.append(f"\n--- USER FINANCIAL PROFILE ---\n{summary}\n--- END PROFILE ---")
    else:
        prompt_parts.append("\n(No financial profile data available yet. The user is new.)")

    return "\n".join(prompt_parts)


def _build_runtime_instruction(runtime_context: Optional[dict]) -> str:
    """Build style and behavior instructions that should apply to this response only."""
    if not runtime_context:
        return ""

    abstraction = (runtime_context.get("abstraction_level") or "").strip().lower()
    mode = (runtime_context.get("assistant_mode") or "").strip().lower()
    section = (runtime_context.get("section_context") or "").strip()

    parts: list[str] = []
    if abstraction:
        mapping = {
            "beginner": (
                "You are in BEGINNER mode. The user is new to investing.\n"
                "- Use plain, everyday language. Avoid jargon entirely or define it immediately.\n"
                "- Give one concrete, relatable example for every concept.\n"
                "- Use analogies (e.g., 'P/E ratio is like the price tag per dollar of earnings').\n"
                "- Break explanations into small, numbered steps.\n"
                "- Always reassure — investing can feel overwhelming, keep it encouraging.\n"
                "- When recommending stocks, explain WHY each metric matters in simple terms."
            ),
            "retail": (
                "You are in RETAIL INVESTOR mode.\n"
                "- Assume the user knows basics: what stocks/bonds are, P/E, diversification.\n"
                "- Be practical and concise. Focus on actionable insights.\n"
                "- Mention key metrics and their implications without over-explaining.\n"
                "- Reference sector trends, valuation ranges, and risk/reward tradeoffs.\n"
                "- Use tables or bullet lists for comparisons."
            ),
            "pro": (
                "You are in PROFESSIONAL mode.\n"
                "- Use standard finance terminology freely.\n"
                "- Include key assumptions, sensitivity factors, and trade-offs.\n"
                "- Reference relevant frameworks (DCF, factor models, sector rotation).\n"
                "- Quantify when possible (basis points, standard deviations, Sharpe ratios)."
            ),
            "institutional": (
                "You are in INSTITUTIONAL mode.\n"
                "- Respond with institutional depth: factor exposures, regime analysis, tail risk.\n"
                "- Address portfolio construction, correlation structures, and drawdown profiles.\n"
                "- Reference academic literature or industry frameworks where relevant.\n"
                "- Consider liquidity, capacity constraints, and implementation costs."
            ),
            "cfa": (
                "You are in CFA/ADVANCED mode.\n"
                "- Use CFA-level rigor with explicit valuation terminology.\n"
                "- Reference GIPS, IPS, SAA/TAA, and multi-factor risk models.\n"
                "- Include precise caveats about model limitations and data quality.\n"
                "- Discuss alpha generation, information ratios, and benchmark-relative analysis."
            ),
        }
        parts.append(mapping.get(abstraction, "Use the user's preferred explanation depth."))

    if mode:
        if mode == "quick_help":
            parts.append("Keep this answer compact (2-4 sentences unless user asks for depth).")
        elif mode == "screener":
            parts.append("Prioritize actionable screening logic and metric-driven criteria.")
        elif mode == "portfolio":
            parts.append("Emphasize allocation, concentration, drawdown, and diversification implications.")
        elif mode == "recommendation":
            parts.append(
                "You are providing personalized stock recommendations.\n"
                "- Ground every recommendation in the user's specific financial profile, goals, and risk tolerance.\n"
                "- Explain how each suggestion affects their portfolio's risk/return profile.\n"
                "- Reference diversification benefits (low correlation with existing holdings).\n"
                "- Always include a disclaimer that this is educational, not financial advice."
            )

    if section:
        parts.append(f"The user is currently in the '{section}' UI section. Ground your answer in that context.")

    if not parts:
        return ""
    return "\n--- RESPONSE MODE ---\n" + "\n".join(f"- {p}" for p in parts) + "\n--- END RESPONSE MODE ---"


def _build_chat_contents(
    system_prompt: str,
    conversation_history: List[dict],
    user_message: str,
    runtime_instruction: str = "",
) -> tuple:
    """
    Build the system prompt and messages array for Bedrock Converse API.
    Returns (system_text, messages_list).
    """
    full_system = system_prompt
    if runtime_instruction:
        full_system = f"{full_system}\n\n{runtime_instruction}"

    messages = []

    # Conversation history
    for msg in conversation_history:
        role = "assistant" if msg.get("is_ai_generated") else "user"
        content = msg.get("content", "")
        if content:
            # Converse API requires alternating user/assistant — merge consecutive same-role
            if messages and messages[-1]["role"] == role:
                messages[-1]["content"] += "\n" + content
            else:
                messages.append({"role": role, "content": content})

    # Current user message
    if messages and messages[-1]["role"] == "user":
        messages[-1]["content"] += "\n" + user_message
    else:
        messages.append({"role": "user", "content": user_message})

    # Ensure messages start with user (Converse API requirement)
    if messages and messages[0]["role"] == "assistant":
        messages.insert(0, {"role": "user", "content": "(conversation continues)"})

    return full_system, messages


# ---------------------------------------------------------------------------
# Streaming chat response
# ---------------------------------------------------------------------------

async def stream_ai_response(
    user_id: str,
    conversation_id: str,
    user_message: str,
    conversation_history: List[dict] = None,
    runtime_context: Optional[dict] = None,
    image_blocks: Optional[List[dict]] = None,
) -> AsyncGenerator[str, None]:
    """
    Stream AI response token by token via AWS Bedrock Converse API.
    Yields text chunks as they arrive.
    """
    try:
        client = _get_bedrock_client()
    except Exception as e:
        logger.error("Bedrock client init failed: %s", e)
        yield "AI service isn't configured yet. AWS Bedrock access is required."
        return

    # Build system prompt with user's full context
    system_prompt = _build_system_prompt(user_id)

    # AUTO-RECALL: inject relevant memories into system prompt
    try:
        from memory.recall import recall_for_query
        recall_result = recall_for_query(user_id, user_message)
        if recall_result.get("prompt_addition"):
            system_prompt += "\n\n" + recall_result["prompt_addition"]
    except Exception as e:
        logger.warning("Memory recall failed: %s", e)

    # Get conversation history if not provided
    if conversation_history is None:
        conversation_history = list_messages(conversation_id, limit=20)

    # Resolve persisted AI preferences if explicit runtime fields are absent.
    resolved_ctx = dict(runtime_context or {})
    if not resolved_ctx.get("abstraction_level") or not resolved_ctx.get("assistant_mode"):
        prefs = get_ai_preferences(user_id)
        if not resolved_ctx.get("abstraction_level"):
            resolved_ctx["abstraction_level"] = prefs.get("abstraction_level")
        if not resolved_ctx.get("assistant_mode"):
            resolved_ctx["assistant_mode"] = prefs.get("assistant_mode")

    runtime_instruction = _build_runtime_instruction(resolved_ctx)

    # Build contents
    system_text, messages = _build_chat_contents(
        system_prompt,
        conversation_history,
        user_message,
        runtime_instruction=runtime_instruction,
    )

    full_response = ""

    # Build Converse API params (model-agnostic)
    converse_messages = [{"role": m["role"], "content": [{"text": m["content"]}]} for m in messages]

    # Inject images into the last user message for multimodal
    if image_blocks and converse_messages:
        last_msg = converse_messages[-1]
        if last_msg["role"] == "user":
            for img in image_blocks:
                last_msg["content"].append({"image": img})

    system_list = [{"text": system_text}]

    # Tool configuration (Alpha Vantage financial data + deep analysis + navigation)
    from chat.av_tools import AV_TOOL_SPECS, execute_av_tool, format_tool_status, extract_chart_data
    from chat.nav_tools import (
        NAV_TOOL_SPECS,
        NAV_TOOL_NAMES,
        execute_nav_tool,
        format_nav_tool_status,
    )

    DEEP_ANALYSIS_TOOL = {
        "toolSpec": {
            "name": "deep_analysis",
            "description": (
                "Trigger a comprehensive multi-agent trading analysis for a stock. "
                "This runs 7 specialized AI agents (Market Analyst, Technical Analyst, "
                "Fundamentals Analyst, News Analyst, Bull/Bear Research, Trader, "
                "Risk Management, Portfolio Manager) that collaborate to produce a "
                "professional investment analysis with a BUY/SELL/HOLD verdict.\n\n"
                "Use this tool when the user:\n"
                "- Asks 'should I buy/sell X?'\n"
                "- Wants a comprehensive/deep/full analysis of a stock\n"
                "- Asks for investment advice or trading recommendation\n"
                "- Asks 'analyze X for me'\n"
                "- Wants to know if a stock is a good investment\n\n"
                "Do NOT use for simple price checks or single indicator queries — "
                "use alpha_vantage for those."
            ),
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "ticker": {
                            "type": "string",
                            "description": "The stock ticker symbol to analyze (e.g. AAPL, NVDA, MSFT)",
                        },
                    },
                    "required": ["ticker"],
                },
            },
        }
    }

    tool_config = {"tools": AV_TOOL_SPECS + [DEEP_ANALYSIS_TOOL] + NAV_TOOL_SPECS}
    MAX_TOOL_ROUNDS = 5

    candidate_models = _select_models(user_message)
    for model_id in candidate_models:
        model_supports_tools = any(p in model_id.lower() for p in _TOOL_CAPABLE_MODELS)
        can_stream_tools = any(p in model_id.lower() for p in _STREAMING_TOOL_MODELS)
        for attempt in range(MAX_RETRIES + 1):
            try:
                # ── Tool resolution phase ──
                # For models that support streaming+tools (Claude, Nova): handled
                #   inline during streaming below.
                # For models that DON'T stream+tools (Llama 4): resolve all tool
                #   calls via non-streaming converse() first, then stream the
                #   final answer without toolConfig.
                if model_supports_tools and not can_stream_tools:
                    # -- Hybrid path: non-streaming tool rounds, then stream final --
                    for tool_round in range(MAX_TOOL_ROUNDS + 1):
                        resp = client.converse(
                            modelId=model_id,
                            messages=converse_messages,
                            system=system_list,
                            inferenceConfig={"maxTokens": 4096, "temperature": 0.7, "topP": 0.9},
                            toolConfig=tool_config,
                        )
                        stop_reason = resp.get("stopReason")
                        assistant_msg = resp["output"]["message"]
                        assistant_content = assistant_msg["content"]

                        # Check for tool calls
                        tool_uses = [b["toolUse"] for b in assistant_content if "toolUse" in b]
                        if stop_reason != "tool_use" or not tool_uses:
                            # Check if model wrote tool call as text (Llama 4 fallback)
                            text_blocks = [b.get("text", "") for b in assistant_content if "text" in b]
                            combined_text = " ".join(text_blocks)
                            parsed_calls = _parse_text_tool_calls(combined_text)

                            if parsed_calls and tool_round < MAX_TOOL_ROUNDS:
                                # Model wrote tool calls as text — execute them manually
                                tool_result_content = []
                                for tool_inp in parsed_calls:
                                    status = format_tool_status(tool_inp)
                                    yield f"{TOOL_STATUS_PREFIX}{status}"
                                    result = execute_av_tool(tool_inp)
                                    chart = extract_chart_data(tool_inp, result)
                                    if chart:
                                        yield f"{CHART_DATA_PREFIX}{json.dumps(chart)}"
                                    fake_id = f"textcall_{tool_round}_{parsed_calls.index(tool_inp)}"
                                    tool_result_content.append({
                                        "toolResult": {
                                            "toolUseId": fake_id,
                                            "content": [{"json": result}],
                                        }
                                    })
                                # Re-wrap the text as a proper tool_use for conversation history
                                synth_content = []
                                for i, tool_inp in enumerate(parsed_calls):
                                    fake_id = f"textcall_{tool_round}_{i}"
                                    synth_content.append({
                                        "toolUse": {
                                            "toolUseId": fake_id,
                                            "name": "alpha_vantage",
                                            "input": tool_inp,
                                        }
                                    })
                                converse_messages.append({"role": "assistant", "content": synth_content})
                                converse_messages.append({"role": "user", "content": tool_result_content})
                                continue  # Re-loop to get the final text answer

                            # No tool calls — extract text and stream it to user
                            for block in assistant_content:
                                if "text" in block:
                                    clean = _THINKING_RE.sub("", block["text"]).strip()
                                    if clean:
                                        full_response += clean
                                        yield clean
                            break

                        # Execute tools, yield status
                        tool_result_content = []
                        for tu in tool_uses:
                            tool_name = tu.get("name", "alpha_vantage")
                            tool_inp = tu.get("input", {})

                            if tool_name in NAV_TOOL_NAMES:
                                yield f"{TOOL_STATUS_PREFIX}{format_nav_tool_status(tool_name)}"
                                result = execute_nav_tool(tool_name, tool_inp, user_id)
                            elif tool_name == "deep_analysis":
                                # Run multi-agent analysis
                                analysis_ticker = tool_inp.get("ticker", "").upper()
                                yield f"{TOOL_STATUS_PREFIX}Running deep analysis on {analysis_ticker}..."
                                yield f"{ANALYSIS_PREFIX}{json.dumps({'type': 'analysis_started', 'ticker': analysis_ticker})}"

                                from chat.deep_analysis import run_analysis
                                def _progress(agent, status, label):
                                    pass  # Progress handled via DB polling on frontend

                                try:
                                    analysis_result = run_analysis(
                                        user_id=user_id,
                                        ticker=analysis_ticker,
                                        conversation_id=conversation_id,
                                        progress_callback=_progress,
                                    )
                                    analysis_id = analysis_result["id"]
                                    summary = analysis_result.get("summary", "Analysis completed.")
                                    decision = analysis_result.get("decision", "HOLD")
                                    confidence = analysis_result.get("confidence", "MEDIUM")
                                    duration = analysis_result.get("duration_secs", 0)
                                    meta = analysis_result.get("metadata") or {}
                                    if isinstance(meta, str):
                                        try:
                                            meta = json.loads(meta)
                                        except Exception:
                                            meta = {}
                                    agent_breakdown = meta.get("agent_breakdown") or []
                                    pm_metrics = meta.get("pm_metrics") or {}

                                    yield f"{ANALYSIS_PREFIX}{json.dumps({'type': 'analysis_complete', 'analysis_id': analysis_id, 'ticker': analysis_ticker, 'decision': decision, 'confidence': confidence, 'agents': agent_breakdown, 'metrics': pm_metrics, 'duration_seconds': duration})}"

                                    result = {
                                        "analysis_id": analysis_id,
                                        "ticker": analysis_ticker,
                                        "decision": decision,
                                        "confidence": confidence,
                                        "summary": summary,
                                        "duration_seconds": duration,
                                        "agents": agent_breakdown,
                                        "metrics": pm_metrics,
                                        "note": "Full analysis with all agent reports is available at /api/analysis/" + analysis_id,
                                    }
                                except Exception as e:
                                    logger.error("Deep analysis failed: %s", e)
                                    result = {"error": f"Analysis failed: {e}"}
                                    yield f"{ANALYSIS_PREFIX}{json.dumps({'type': 'analysis_failed', 'ticker': analysis_ticker, 'error': str(e)})}"
                            else:
                                status = format_tool_status(tool_inp)
                                yield f"{TOOL_STATUS_PREFIX}{status}"
                                result = execute_av_tool(tool_inp)
                                # Emit chart data if available
                                chart = extract_chart_data(tool_inp, result)
                                if chart:
                                    yield f"{CHART_DATA_PREFIX}{json.dumps(chart)}"

                            tool_result_content.append({
                                "toolResult": {
                                    "toolUseId": tu["toolUseId"],
                                    "content": [{"json": result}],
                                }
                            })

                        converse_messages.append({"role": "assistant", "content": assistant_content})
                        converse_messages.append({"role": "user", "content": tool_result_content})

                    else:
                        # Exhausted tool rounds — stream whatever we have
                        pass

                    # If tool rounds produced text already, check if we should
                    # also stream the final answer. If the last non-streaming call
                    # returned text (no tools), we already yielded it above.
                    # If we still have no response after tool rounds, do a final
                    # streaming call WITHOUT tools to get the answer.
                    if not full_response:
                        response = client.converse_stream(
                            modelId=model_id,
                            messages=converse_messages,
                            system=system_list,
                            inferenceConfig={"maxTokens": 4096, "temperature": 0.7, "topP": 0.9},
                        )
                        for event in response["stream"]:
                            if "contentBlockDelta" in event:
                                text = event["contentBlockDelta"]["delta"].get("text", "")
                                if text:
                                    clean = _THINKING_RE.sub("", text)
                                    if clean:
                                        full_response += clean
                                        yield clean

                else:
                    # -- Standard path: streaming with optional tools --
                    for tool_round in range(MAX_TOOL_ROUNDS + 1):
                        kwargs = {
                            "modelId": model_id,
                            "messages": converse_messages,
                            "system": system_list,
                            "inferenceConfig": {"maxTokens": 4096, "temperature": 0.7, "topP": 0.9},
                        }
                        if model_supports_tools and can_stream_tools:
                            kwargs["toolConfig"] = tool_config

                        response = client.converse_stream(**kwargs)

                        assistant_content = []
                        tool_uses = []
                        current_tool = None
                        current_tool_input = ""
                        text_block = ""
                        stop_reason = None

                        for event in response["stream"]:
                            if "messageStop" in event:
                                stop_reason = event["messageStop"].get("stopReason")

                            elif "contentBlockStart" in event:
                                start = event["contentBlockStart"].get("start", {})
                                if "toolUse" in start:
                                    if text_block:
                                        clean = _THINKING_RE.sub("", text_block).strip()
                                        if clean:
                                            assistant_content.append({"text": clean})
                                            full_response += clean
                                            yield clean
                                        text_block = ""
                                    current_tool = {
                                        "toolUseId": start["toolUse"]["toolUseId"],
                                        "name": start["toolUse"]["name"],
                                    }
                                    current_tool_input = ""

                            elif "contentBlockDelta" in event:
                                delta = event["contentBlockDelta"]["delta"]
                                if "text" in delta:
                                    text_block += delta["text"]
                                elif "toolUse" in delta:
                                    current_tool_input += delta["toolUse"].get("input", "")

                            elif "contentBlockStop" in event:
                                if current_tool:
                                    try:
                                        input_data = json.loads(current_tool_input) if current_tool_input else {}
                                    except json.JSONDecodeError:
                                        input_data = {}
                                    current_tool["input"] = input_data
                                    tool_uses.append(current_tool)
                                    assistant_content.append({
                                        "toolUse": {
                                            "toolUseId": current_tool["toolUseId"],
                                            "name": current_tool["name"],
                                            "input": input_data,
                                        }
                                    })
                                    current_tool = None

                        # Flush remaining text
                        if text_block:
                            clean_text = _THINKING_RE.sub("", text_block).strip()
                            if clean_text:
                                assistant_content.append({"text": clean_text})
                                full_response += clean_text
                                yield clean_text

                        if stop_reason != "tool_use" or not tool_uses:
                            break

                        # Execute tools
                        tool_result_content = []
                        for tool in tool_uses:
                            tool_name = tool.get("name", "alpha_vantage")
                            tool_inp = tool["input"]

                            if tool_name in NAV_TOOL_NAMES:
                                yield f"{TOOL_STATUS_PREFIX}{format_nav_tool_status(tool_name)}"
                                result = execute_nav_tool(tool_name, tool_inp, user_id)
                            elif tool_name == "deep_analysis":
                                analysis_ticker = tool_inp.get("ticker", "").upper()
                                yield f"{TOOL_STATUS_PREFIX}Running deep analysis on {analysis_ticker}..."
                                yield f"{ANALYSIS_PREFIX}{json.dumps({'type': 'analysis_started', 'ticker': analysis_ticker})}"

                                from chat.deep_analysis import run_analysis as _run_analysis
                                try:
                                    analysis_result = _run_analysis(
                                        user_id=user_id,
                                        ticker=analysis_ticker,
                                        conversation_id=conversation_id,
                                    )
                                    analysis_id = analysis_result["id"]
                                    summary = analysis_result.get("summary", "Analysis completed.")
                                    decision = analysis_result.get("decision", "HOLD")
                                    confidence = analysis_result.get("confidence", "MEDIUM")
                                    duration = analysis_result.get("duration_secs", 0)
                                    meta = analysis_result.get("metadata") or {}
                                    if isinstance(meta, str):
                                        try:
                                            meta = json.loads(meta)
                                        except Exception:
                                            meta = {}
                                    agent_breakdown = meta.get("agent_breakdown") or []
                                    pm_metrics = meta.get("pm_metrics") or {}

                                    yield f"{ANALYSIS_PREFIX}{json.dumps({'type': 'analysis_complete', 'analysis_id': analysis_id, 'ticker': analysis_ticker, 'decision': decision, 'confidence': confidence, 'agents': agent_breakdown, 'metrics': pm_metrics, 'duration_seconds': duration})}"

                                    result = {
                                        "analysis_id": analysis_id,
                                        "ticker": analysis_ticker,
                                        "decision": decision,
                                        "confidence": confidence,
                                        "summary": summary,
                                        "duration_seconds": duration,
                                        "agents": agent_breakdown,
                                        "metrics": pm_metrics,
                                        "note": "Full analysis available at /api/analysis/" + analysis_id,
                                    }
                                except Exception as e:
                                    logger.error("Deep analysis failed: %s", e)
                                    result = {"error": f"Analysis failed: {e}"}
                                    yield f"{ANALYSIS_PREFIX}{json.dumps({'type': 'analysis_failed', 'ticker': analysis_ticker, 'error': str(e)})}"
                            else:
                                status = format_tool_status(tool_inp)
                                yield f"{TOOL_STATUS_PREFIX}{status}"
                                result = execute_av_tool(tool_inp)
                                # Emit chart data if available
                                chart = extract_chart_data(tool_inp, result)
                                if chart:
                                    yield f"{CHART_DATA_PREFIX}{json.dumps(chart)}"

                            tool_result_content.append({
                                "toolResult": {
                                    "toolUseId": tool["toolUseId"],
                                    "content": [{"json": result}],
                                }
                            })

                        converse_messages.append({"role": "assistant", "content": assistant_content})
                        converse_messages.append({"role": "user", "content": tool_result_content})

                if full_response:
                    logger.info("AI response via %s: %d chars", model_id, len(full_response))
                    return

            except Exception as e:
                error_str = str(e)
                if "ThrottlingException" in error_str or "429" in error_str:
                    if attempt < MAX_RETRIES:
                        import asyncio
                        await asyncio.sleep(RETRY_DELAY * (attempt + 1))
                        continue
                    logger.warning("Rate limited on %s, trying next model", model_id)
                    break
                elif "ResourceNotFoundException" in error_str or "ValidationException" in error_str:
                    logger.warning("Model %s not available: %s, trying next", model_id, e)
                    break
                else:
                    logger.error("AI error on %s: %s", model_id, e)
                    if attempt < MAX_RETRIES:
                        import asyncio
                        await asyncio.sleep(RETRY_DELAY)
                        continue
                    break

    # All models failed
    yield "I'm having trouble connecting to the AI service right now. Please try again in a moment."


# ---------------------------------------------------------------------------
# Ephemeral AI (info-popover — no persistence)
# ---------------------------------------------------------------------------

async def stream_ai_response_ephemeral(
    user_id: str,
    question: str,
    section_context: str = "",
    abstraction_level: str = "",
    assistant_mode: str = "quick_help",
    image_b64: Optional[str] = None,
    image_format: str = "png",
) -> AsyncGenerator[str, None]:
    """
    Stream an AI response for the info-popover feature.
    Uses the user's financial context but does NOT save anything.
    Optionally accepts a base64-encoded screenshot for visual grounding.
    """
    try:
        client = _get_bedrock_client()
    except Exception:
        yield "AI service isn't configured yet."
        return

    # Build system prompt with section context
    base_prompt = _build_system_prompt(user_id)
    if not abstraction_level:
        abstraction_level = get_ai_preferences(user_id).get("abstraction_level", "")
    runtime_instruction = _build_runtime_instruction(
        {
            "abstraction_level": abstraction_level,
            "assistant_mode": assistant_mode or "quick_help",
            "section_context": section_context,
        }
    )

    system_text = f"{base_prompt}\n\n{runtime_instruction}" if runtime_instruction else base_prompt

    # Build user content blocks. If we have an image, include it first so the
    # model treats the question as being about what's on screen.
    user_blocks: list[dict] = []
    image_bytes: Optional[bytes] = None
    if image_b64:
        try:
            import base64 as _b64
            raw = image_b64
            if "," in raw:
                raw = raw.split(",", 1)[1]
            image_bytes = _b64.b64decode(raw)
        except Exception as e:
            logger.warning("Failed to decode screenshot image: %s", e)
            image_bytes = None
    if image_bytes:
        fmt = (image_format or "png").lower()
        if fmt not in {"png", "jpeg", "jpg", "webp", "gif"}:
            fmt = "png"
        if fmt == "jpg":
            fmt = "jpeg"
        user_blocks.append({"image": {"format": fmt, "source": {"bytes": image_bytes}}})
        user_blocks.append(
            {
                "text": (
                    "The image above is a screenshot of the page the user is currently looking at. "
                    "Use it to ground your answer in what they actually see.\n\n"
                    f"Their question: {question}"
                )
            }
        )
    else:
        user_blocks.append({"text": question})

    converse_messages = [{"role": "user", "content": user_blocks}]
    system_list = [{"text": system_text}]

    for model_id in _select_models(question):
        try:
            response = client.converse_stream(
                modelId=model_id,
                messages=converse_messages,
                system=system_list,
                inferenceConfig={"maxTokens": 512, "temperature": 0.7, "topP": 0.9},
            )
            got_response = False
            full_text = ""
            for event in response["stream"]:
                if "contentBlockDelta" in event:
                    text = event["contentBlockDelta"]["delta"].get("text", "")
                    if text:
                        full_text += text
            if full_text:
                clean = _THINKING_RE.sub("", full_text).strip()
                if clean:
                    got_response = True
                    yield clean
            if got_response:
                return
        except Exception as e:
            logger.warning("Ephemeral AI error on %s: %s", model_id, e)
            continue

    yield "I couldn't connect to the AI right now. Try again in a moment."


def suggest_screener_expression(
    user_id: str,
    prompt: str,
    abstraction_level: str = "",
) -> dict:
    """Generate a constrained screener expression using only allowed fields/operators."""
    from equities.screener import get_supported_expression_fields

    allowed_fields = [f["field"] for f in get_supported_expression_fields()]
    allowed_ops = [">", "<", ">=", "<=", "="]

    if not abstraction_level:
        abstraction_level = get_ai_preferences(user_id).get("abstraction_level", "")

    # Fetch available sectors and industries from DB
    try:
        from equities.screener import screen_stocks
        _meta = screen_stocks(per_page=0)
        available_sectors = _meta.get("sectors", [])
        available_industries = _meta.get("industries", [])
    except Exception:
        available_sectors = []
        available_industries = []

    schema_prompt = (
        "You convert user intent into a strict stock screener expression.\n"
        f"Allowed fields: {', '.join(allowed_fields)}\n"
        f"Allowed operators: {', '.join(allowed_ops)}\n"
        f"Available sectors (broad): {', '.join(available_sectors)}\n"
        f"Available industries (specific): {', '.join(available_industries)}\n"
        "Rules:\n"
        "- Output valid JSON with keys: expression, explanation, sector, industry\n"
        "- expression must use only allowed fields/operators and AND joins\n"
        "- Do not use OR, parentheses, or extra text\n"
        "- If the user mentions a specific sector (e.g. tech, healthcare, energy), set sector to the matching available sector name (exact match from the list). Otherwise set sector to empty string.\n"
        "- If the user mentions a specific industry (e.g. semiconductor, biotech, software), set industry to the matching available industry name (exact match from the list). Prefer industry over sector when the user is specific. Otherwise set industry to empty string.\n"
        "- If intent is ambiguous, still return a reasonable conservative expression\n"
        f"User intent: {prompt}\n"
    )

    runtime_instruction = _build_runtime_instruction(
        {
            "abstraction_level": abstraction_level,
            "assistant_mode": "screener",
            "section_context": "equities screener",
        }
    )
    final_prompt = f"{schema_prompt}\n{runtime_instruction}" if runtime_instruction else schema_prompt

    raw = generate_response(final_prompt, max_tokens=220) or ""
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text.replace("json", "", 1).strip()

    expression = ""
    explanation = ""
    sector = ""
    industry = ""
    try:
        parsed = json.loads(text)
        expression = str(parsed.get("expression", "")).strip()
        explanation = str(parsed.get("explanation", "")).strip()
        sector = str(parsed.get("sector", "")).strip()
        industry = str(parsed.get("industry", "")).strip()
    except Exception:
        explanation = "Generated a conservative value screen based on profitability and valuation."

    # Validate generated expression against strict parser.
    from equities.screener import _parse_expression

    try:
        if not expression:
            expression = "pe < 20 AND debt_to_equity < 1.0 AND roe > 12"
        _parse_expression(expression)
    except Exception:
        expression = "pe < 20 AND debt_to_equity < 1.0 AND roe > 12"

    return {
        "expression": expression,
        "explanation": explanation or "Balanced value and quality filter.",
        "allowed_fields": allowed_fields,
        "sector": sector,
        "industry": industry,
    }


def recommend_stocks_for_user(
    user_id: str,
    user_prompt: str = "",
    abstraction_level: str = "",
) -> dict:
    """
    Generate personalized stock recommendations with a screener expression.

    Uses the user's full financial profile (risk tolerance, goals, holdings,
    income, documents) to produce a tailored screener expression and a plain
    language explanation of why each criterion was chosen.
    """
    from equities.screener import get_supported_expression_fields

    allowed_fields = [f["field"] for f in get_supported_expression_fields()]
    allowed_ops = [">", "<", ">=", "<=", "="]

    # Get user financial context
    context, summary = get_or_build_context(user_id, max_age_seconds=120)

    if not abstraction_level:
        abstraction_level = get_ai_preferences(user_id).get("abstraction_level", "")

    profile = context.get("profile", {})
    risk_tolerance = profile.get("risk_tolerance", "moderate")
    goals = profile.get("financial_goals", [])
    income = profile.get("annual_income", "")
    net_worth = profile.get("net_worth_estimate", "")
    portfolio = context.get("portfolio", {})

    user_section = user_prompt.strip() if user_prompt.strip() else "What stocks are best for my portfolio?"

    recommendation_prompt = (
        "You are a personalized stock recommendation engine.\n\n"
        "USER PROFILE:\n"
        f"- Risk tolerance: {risk_tolerance}\n"
        f"- Financial goals: {', '.join(goals) if goals else 'Not specified'}\n"
        f"- Annual income: {income or 'Not specified'}\n"
        f"- Net worth estimate: {net_worth or 'Not specified'}\n"
    )

    if summary:
        recommendation_prompt += f"\nFULL FINANCIAL CONTEXT:\n{summary}\n"

    if portfolio:
        recommendation_prompt += f"\nCURRENT PORTFOLIO DATA:\n{json.dumps(portfolio)[:800]}\n"

    recommendation_prompt += (
        f"\nUSER REQUEST: {user_section}\n\n"
        "TASK:\n"
        "Based on this user's specific profile, generate a personalized stock screener expression.\n"
        "Consider:\n"
        "- Their risk tolerance (conservative → value/dividend stocks; aggressive → growth stocks)\n"
        "- Their goals (retirement → stable blue-chips; wealth building → growth with manageable risk)\n"
        "- Portfolio diversification — suggest criteria that complement their existing holdings\n"
        "- Reducing overall portfolio risk by favoring low-correlation sectors\n\n"
        f"Allowed fields for the expression: {', '.join(allowed_fields)}\n"
        f"Allowed operators: {', '.join(allowed_ops)}\n\n"
        "Output ONLY valid JSON with these keys:\n"
        "- expression: a screener expression using only allowed fields/operators and AND joins\n"
        "- explanation: a personalized explanation of WHY these criteria suit this user\n"
        "- risk_note: a brief note on how this affects their portfolio risk\n"
        "- sectors_to_consider: list of 2-4 sector names to focus on\n\n"
        "Do not use OR, parentheses, or fields outside the allowed list.\n"
    )

    runtime_instruction = _build_runtime_instruction(
        {
            "abstraction_level": abstraction_level,
            "assistant_mode": "recommendation",
            "section_context": "equities screener – personalized recommendations",
        }
    )
    if runtime_instruction:
        recommendation_prompt += f"\n{runtime_instruction}"

    raw = generate_response(recommendation_prompt, max_tokens=600) or ""
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text.replace("json", "", 1).strip()

    expression = ""
    explanation = ""
    risk_note = ""
    sectors = []

    try:
        parsed = json.loads(text)
        expression = str(parsed.get("expression", "")).strip()
        explanation = str(parsed.get("explanation", "")).strip()
        risk_note = str(parsed.get("risk_note", "")).strip()
        sectors = parsed.get("sectors_to_consider", [])
        if not isinstance(sectors, list):
            sectors = []
    except Exception:
        explanation = "Based on your profile, this is a balanced screen emphasizing quality and value."

    # Validate expression against strict parser
    from equities.screener import _parse_expression

    try:
        if not expression:
            # Fallback based on risk tolerance
            if risk_tolerance in ("conservative", "low"):
                expression = "pe < 18 AND debt_to_equity < 0.8 AND current_ratio > 1.5 AND roe > 10"
            elif risk_tolerance in ("aggressive", "high"):
                expression = "roe > 15 AND gross_margin > 35 AND revenue > 5000000000"
            else:
                expression = "pe < 25 AND roe > 12 AND debt_to_equity < 1.2 AND current_ratio > 1.0"
        _parse_expression(expression)
    except Exception:
        if risk_tolerance in ("conservative", "low"):
            expression = "pe < 18 AND debt_to_equity < 0.8 AND current_ratio > 1.5 AND roe > 10"
        elif risk_tolerance in ("aggressive", "high"):
            expression = "roe > 15 AND gross_margin > 35 AND revenue > 5000000000"
        else:
            expression = "pe < 25 AND roe > 12 AND debt_to_equity < 1.2 AND current_ratio > 1.0"

    return {
        "expression": expression,
        "explanation": explanation or "Personalized screen based on your risk profile and financial goals.",
        "risk_note": risk_note or "This expression balances growth and stability based on your profile.",
        "sectors_to_consider": sectors[:4],
        "risk_tolerance": risk_tolerance,
        "allowed_fields": allowed_fields,
    }


# ---------------------------------------------------------------------------
# Non-streaming response (for summarization, group decisions)
# ---------------------------------------------------------------------------

def generate_response(prompt: str, max_tokens: int = 512) -> Optional[str]:
    """Non-streaming single-shot generation. Used for summaries, decisions."""
    try:
        client = _get_bedrock_client()
    except Exception:
        return None

    for model_id in _select_models(prompt):
        for attempt in range(MAX_RETRIES + 1):
            try:
                response = client.converse(
                    modelId=model_id,
                    messages=[{"role": "user", "content": [{"text": prompt}]}],
                    inferenceConfig={"maxTokens": max_tokens, "temperature": 0.3},
                )
                text = response["output"]["message"]["content"][0]["text"]
                if text:
                    # Strip <thinking> tags from Nova output
                    text = _THINKING_RE.sub("", text).strip()
                return text if text else None

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
                    logger.error("generate_response error: %s", e)
                    if attempt < MAX_RETRIES:
                        time.sleep(RETRY_DELAY)
                        continue
                    break

    return None


# ---------------------------------------------------------------------------
# Conversation summarization — generates takeaways for context memory
# ---------------------------------------------------------------------------

def summarize_conversation(conversation_id: str, user_id: str) -> Optional[str]:
    """
    Summarize a conversation into key takeaways for the user's context memory.
    Called when a conversation becomes idle (5 min) or user explicitly ends it.
    """
    history_text = get_conversation_summary(conversation_id, limit=30)
    if not history_text or len(history_text) < 50:
        return None

    prompt = f"""Summarize this financial conversation in 1-2 sentences. Focus on:
- What the user asked about
- Key decisions or advice given
- Any action items or goals mentioned

Conversation:
{history_text}

Summary (1-2 sentences):"""

    summary = generate_response(prompt, max_tokens=150)
    if summary:
        update_conversation_memory(user_id, conversation_id, summary.strip())
    return summary


# ---------------------------------------------------------------------------
# Group AI — observation and engagement decision
# ---------------------------------------------------------------------------

GROUP_DECISION_PROMPT = """You are Paloor AI observing a group chat about {topic}.
You see this message: "{message}"

Recent group context:
{recent_messages}

User's financial profile:
{user_summary}

Should you respond? Choose ONE:
- PUBLIC: Your input would genuinely help the group discussion (you have relevant data or insight)
- PRIVATE: You should privately message the sender because this relates to their specific financial situation
- SILENT: No useful contribution right now

Respond with ONLY one word: PUBLIC, PRIVATE, or SILENT"""


def should_engage_group(
    message_content: str,
    conversation_id: str,
    sender_id: str,
    group_topic: str = "",
) -> str:
    """
    Decide if AI should engage with a group message.
    Returns: 'PUBLIC', 'PRIVATE', or 'SILENT'
    """
    # Quick keyword filter — don't even call AI for mundane messages
    financial_keywords = {
        "tax", "invest", "portfolio", "stock", "bond", "401k", "ira", "roth",
        "mortgage", "insurance", "estate", "trust", "crypto", "dividend",
        "income", "deduction", "capital gain", "net worth", "budget", "debt",
        "interest rate", "inflation", "retirement", "savings", "expense",
        "?",  # Questions
    }
    msg_lower = message_content.lower()
    if not any(kw in msg_lower for kw in financial_keywords):
        return "SILENT"

    # Get context
    recent = get_conversation_summary(conversation_id, limit=10)
    _, user_summary = get_or_build_context(sender_id, max_age_seconds=300)

    prompt = GROUP_DECISION_PROMPT.format(
        topic=group_topic or "finance",
        message=message_content[:500],
        recent_messages=recent[:1000],
        user_summary=user_summary[:800] if user_summary else "(No profile data)",
    )

    decision = generate_response(prompt, max_tokens=10)
    if decision:
        decision = decision.strip().upper()
        if decision in ("PUBLIC", "PRIVATE", "SILENT"):
            return decision
    return "SILENT"


def generate_group_response(
    message_content: str,
    conversation_id: str,
    sender_id: str,
    response_type: str,
    group_topic: str = "",
) -> Optional[str]:
    """Generate an AI response for a group conversation."""
    recent = get_conversation_summary(conversation_id, limit=15)
    _, user_summary = get_or_build_context(sender_id, max_age_seconds=300)

    if response_type == "PUBLIC":
        prompt = f"""You are Paloor AI in a group chat about {group_topic or 'finance'}.
Someone said: "{message_content}"

Recent conversation:
{recent[:1500]}

Give a helpful, concise response to the group. Be friendly but authoritative.
Keep it under 3 sentences unless a detailed answer is needed.
Don't start with "As an AI" — just answer naturally."""

    elif response_type == "PRIVATE":
        prompt = f"""You are Paloor AI privately messaging a user after seeing their group chat message.
They said (in a group): "{message_content}"

Their financial profile:
{user_summary[:1000] if user_summary else '(New user)'}

Recent group conversation:
{recent[:1000]}

Give them a personalized, private insight based on their specific financial situation.
Be direct and helpful. Reference their specific data when relevant.
Keep it concise — 2-4 sentences."""

    else:
        return None

    return generate_response(prompt, max_tokens=300)
