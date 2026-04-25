"""
Stock news intelligence pipeline.

Three-stage pipeline for each event (z-score shift or regime transition):

  Stage 1 — SCRAPE
    Search DuckDuckGo for ~20 articles per query × multiple query variations.
    Target 50-100+ raw articles per event. Uses date-range filtering so
    results are specific to the time window around the event.

  Stage 2 — RANK
    Pass all raw articles + event context to Gemini. The LLM scores each
    article 0.0–1.0 on relevance to *this specific* stock event, not just
    general market news. Keep the top 5-10.

  Stage 3 — SUMMARIZE
    Pass the ranked articles + event details to Gemini. It produces a
    concise narrative explaining what happened, why, and what followed.

Everything is cached in SQLite so repeat requests are instant.
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlparse

from equities.db import get_db
from config import settings

logger = logging.getLogger(__name__)

# Rate-limit between DDG queries
_SEARCH_DELAY = 1.5

# LLM model cascade (same pattern as chat/ai_service.py)
_LLM_MODELS = [
    "gemma-3-27b-it",
    "gemini-2.0-flash",
]


# ═══════════════════════════════════════════════════════════════════════════
# Stage 1: SCRAPE — DuckDuckGo news search
# ═══════════════════════════════════════════════════════════════════════════

def _search_ddg(
    query: str,
    max_results: int = 20,
    timelimit: Optional[str] = None,
    retries: int = 2,
) -> list[dict]:
    """
    Search DuckDuckGo news. Falls back to text search.
    timelimit: 'd' (day), 'w' (week), 'm' (month), 'y' (year), or None.
    Returns [{title, snippet, url, publisher, date}].
    """
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        logger.error("duckduckgo_search not installed")
        return []

    articles = []

    for attempt in range(retries + 1):
        try:
            with DDGS() as ddgs:
                results = list(ddgs.news(keywords=query, max_results=max_results, timelimit=timelimit))
            for r in results:
                articles.append({
                    "title": r.get("title", ""),
                    "snippet": r.get("body", ""),
                    "url": r.get("url", ""),
                    "publisher": r.get("source", "") or _domain(r.get("url", "")),
                    "date": r.get("date", ""),
                })
            break  # success
        except Exception as e:
            logger.warning(f"DDG news attempt {attempt+1} failed for '{query}': {e}")
            if attempt < retries:
                time.sleep(2 * (attempt + 1))

    # Fallback / supplement with text search
    if len(articles) < 5:
        for attempt in range(retries + 1):
            try:
                with DDGS() as ddgs:
                    results = list(ddgs.text(keywords=query, max_results=max_results, timelimit=timelimit))
                for r in results:
                    url = r.get("href", "") or r.get("url", "")
                    if url and not any(a["url"] == url for a in articles):
                        articles.append({
                            "title": r.get("title", ""),
                            "snippet": r.get("body", ""),
                            "url": url,
                            "publisher": _domain(url),
                            "date": "",
                        })
                break  # success
            except Exception as e2:
                logger.warning(f"DDG text attempt {attempt+1} failed for '{query}': {e2}")
                if attempt < retries:
                    time.sleep(2 * (attempt + 1))

    return articles


def _domain(url: str) -> str:
    """Extract domain from URL."""
    try:
        return urlparse(url).netloc.replace("www.", "")
    except Exception:
        return ""


def _scrape_event_articles(
    ticker: str,
    company_name: str,
    event_date: str,
    event_type: str,
    days_before: int = 10,
    days_after: int = 10,
) -> list[dict]:
    """
    Stage 1: Scrape articles for a single event using multiple query variations.

    Uses timelimit-based filtering (d/w/m/y) and includes date context
    in queries for better relevance matching.
    Target: 50-100+ raw articles total.
    """
    dt = datetime.strptime(event_date, "%Y-%m-%d")
    days_ago = (datetime.now() - dt).days

    # Pick the smallest DDG timelimit that covers the event window
    if days_ago <= 7:
        timelimit = "w"
    elif days_ago <= 30:
        timelimit = "m"
    else:
        timelimit = "y"

    # Format date for query context (e.g., "March 2025")
    month_year = dt.strftime("%B %Y")

    # Build query variations — include date context for relevance
    queries = [
        f'"{company_name}" stock {month_year}',
        f"{company_name} {ticker} stock news {month_year}",
        f"{ticker} stock price {month_year}",
        f"{company_name} shares {dt.strftime('%Y')}",
        f"{ticker} earnings revenue {month_year}",
    ]

    all_articles: list[dict] = []
    seen_urls: set[str] = set()

    for query in queries:
        results = _search_ddg(query, max_results=15, timelimit=timelimit)
        for a in results:
            url = a["url"].split("?")[0].rstrip("/")  # normalize
            if url and url not in seen_urls:
                seen_urls.add(url)
                a["search_query"] = query
                all_articles.append(a)
        time.sleep(_SEARCH_DELAY)

    # If we got very few results, try broader queries without date
    if len(all_articles) < 10:
        broader_queries = [
            f"{company_name} {ticker} stock analysis",
            f"{ticker} stock market news",
        ]
        for query in broader_queries:
            results = _search_ddg(query, max_results=15, timelimit=timelimit)
            for a in results:
                url = a["url"].split("?")[0].rstrip("/")
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    a["search_query"] = query
                    all_articles.append(a)
            time.sleep(_SEARCH_DELAY)

    logger.info(f"Scraped {len(all_articles)} raw articles for {ticker} event {event_date}")
    return all_articles


# ═══════════════════════════════════════════════════════════════════════════
# Stage 2: RANK — LLM relevance scoring
# ═══════════════════════════════════════════════════════════════════════════

def _call_llm(prompt: str, max_tokens: int = 2048) -> Optional[str]:
    """
    Call Gemini with model cascade. Returns response text or None.
    """
    if not settings.gemini_api_key:
        logger.warning("No GEMINI_API_KEY set, skipping LLM call")
        return None

    try:
        from google import genai
    except ImportError:
        logger.error("google-genai not installed")
        return None

    client = genai.Client(api_key=settings.gemini_api_key)

    for model_name in _LLM_MODELS:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=[{"role": "user", "parts": [{"text": prompt}]}],
                config={
                    "temperature": 0.2,
                    "max_output_tokens": max_tokens,
                },
            )
            if response and response.text:
                return response.text.strip()
        except Exception as e:
            logger.warning(f"LLM call failed with {model_name}: {e}")
            continue

    return None


def _rank_articles(
    ticker: str,
    company_name: str,
    event_date: str,
    event_type: str,
    event_details: str,
    articles: list[dict],
    top_n: int = 8,
) -> list[dict]:
    """
    Stage 2: Use LLM to rank articles by relevance to this specific event.

    Sends all articles to Gemini with event context, asks it to return
    a JSON array of the top articles with relevance scores.
    """
    if not articles:
        return []

    # Prepare article list for the prompt (limit to avoid token overflow)
    article_entries = []
    for i, a in enumerate(articles[:120]):  # cap at 120 articles per prompt
        article_entries.append(
            f"[{i}] {a.get('publisher', '?')} | {a.get('title', '?')}\n"
            f"    {(a.get('snippet', '') or '')[:200]}"
        )

    articles_text = "\n".join(article_entries)

    prompt = f"""You are a financial analyst reviewing news articles about a stock market event.

EVENT DETAILS:
- Stock: {company_name} ({ticker})
- Date: {event_date}
- Type: {event_type}
- Context: {event_details}

Below are {len(article_entries)} news articles scraped from around this event date.
Your job: identify the {top_n} articles that are MOST RELEVANT to explaining what happened to {ticker} around {event_date}.

RANKING CRITERIA (in order of importance):
1. Must be specifically about {company_name} or {ticker} — not general market news
2. Must be relevant to the time period (within days of {event_date})
3. Should explain price movement, earnings, product launches, legal issues, analyst actions, or sector events that directly affected this stock
4. Prefer articles from reputable financial sources

ARTICLES:
{articles_text}

Return ONLY a JSON array of the top {top_n} articles. Each entry must have:
- "index": the [N] number from the list above
- "score": relevance score 0.0 to 1.0
- "reason": one sentence explaining why this article is relevant

Example: [{{"index": 5, "score": 0.95, "reason": "Directly covers Q3 earnings miss"}}]

Return ONLY the JSON array, no other text."""

    response_text = _call_llm(prompt, max_tokens=2048)
    if not response_text:
        # Fallback: return first top_n as-is with no ranking
        for a in articles[:top_n]:
            a["relevance_score"] = 0.5
            a["is_top"] = True
        return articles[:top_n]

    # Parse the LLM response
    try:
        # Extract JSON from response (might have markdown fences)
        json_str = response_text
        if "```" in json_str:
            json_str = json_str.split("```")[1]
            if json_str.startswith("json"):
                json_str = json_str[4:]
        rankings = json.loads(json_str.strip())
    except (json.JSONDecodeError, IndexError) as e:
        logger.warning(f"Failed to parse LLM ranking response: {e}")
        for a in articles[:top_n]:
            a["relevance_score"] = 0.5
            a["is_top"] = True
        return articles[:top_n]

    # Map rankings back to articles
    ranked = []
    for entry in rankings[:top_n]:
        idx = entry.get("index", -1)
        if 0 <= idx < len(articles):
            a = articles[idx].copy()
            a["relevance_score"] = min(1.0, max(0.0, float(entry.get("score", 0.5))))
            a["is_top"] = True
            a["rank_reason"] = entry.get("reason", "")
            ranked.append(a)

    # Sort by score descending
    ranked.sort(key=lambda x: x.get("relevance_score", 0), reverse=True)
    return ranked


# ═══════════════════════════════════════════════════════════════════════════
# Stage 3: SUMMARIZE — LLM event narrative
# ═══════════════════════════════════════════════════════════════════════════

def _summarize_event(
    ticker: str,
    company_name: str,
    event_date: str,
    event_type: str,
    event_details: str,
    ranked_articles: list[dict],
) -> Optional[str]:
    """
    Stage 3: Generate a narrative summary of what happened.

    Uses the top-ranked articles + event context to write a clear,
    readable explanation of the event.
    """
    if not ranked_articles:
        return None

    articles_text = ""
    for i, a in enumerate(ranked_articles, 1):
        articles_text += (
            f"{i}. [{a.get('publisher', '?')}] {a.get('title', '?')}\n"
            f"   {(a.get('snippet', '') or '')[:300]}\n\n"
        )

    prompt = f"""You are a financial analyst writing a brief event summary for a stock.

EVENT:
- Stock: {company_name} ({ticker})
- Date: {event_date}
- Type: {event_type}
- Technical context: {event_details}

TOP NEWS ARTICLES FROM THIS PERIOD (numbered for citation):
{articles_text}

Write a clear, concise summary (3-5 sentences) explaining:
1. What happened to {ticker} around {event_date}
2. Why it happened (the key driver/catalyst)
3. The market reaction or outcome

STRICT RULES:
- ONLY state facts that appear in the numbered articles above. Do NOT invent or assume information.
- Cite article numbers in parentheses, e.g. "Apple reported record revenue (1, 3)" so the reader can verify.
- Be specific to {company_name} — mention actual numbers, product names, analyst firms, or earnings figures from the articles.
- Write for someone looking at a stock price chart who clicked on this date to understand what happened.
- If the articles don't clearly explain the price movement, explicitly say "the articles available do not clearly explain the price action on this date."
- Do NOT use filler phrases like "Based on the articles" or "According to sources."

Return ONLY the summary paragraph, no headers or formatting."""

    return _call_llm(prompt, max_tokens=512)


# ═══════════════════════════════════════════════════════════════════════════
# Orchestrator: full pipeline for one event
# ═══════════════════════════════════════════════════════════════════════════

def process_event(
    ticker: str,
    company_name: str,
    event_date: str,
    event_type: str,
    event_details: str = "",
) -> dict:
    """
    Run the full 3-stage pipeline for a single event.
    Returns {articles: [...], summary: str, cached: bool}.

    Checks cache first — if we already have ranked articles and a summary
    for this event, returns them immediately.
    """
    db = get_db()
    try:
        # Check cache: do we already have top articles + summary?
        top_articles = db.execute("""
            SELECT title, snippet, url, publisher, article_date,
                   relevance_window, relevance_score
            FROM stock_news
            WHERE ticker = %s AND event_date = %s AND event_type = %s AND is_top_article = TRUE
            ORDER BY relevance_score DESC
        """, (ticker.upper(), event_date, event_type)).fetchall()

        summary_row = db.execute("""
            SELECT summary, model_used FROM event_summaries
            WHERE ticker = %s AND event_date = %s AND event_type = %s
        """, (ticker.upper(), event_date, event_type)).fetchone()

        if top_articles and summary_row:
            return {
                "articles": [dict(r) for r in top_articles],
                "summary": summary_row["summary"],
                "cached": True,
            }
    finally:
        db.close()

    # --- Stage 1: Scrape ---
    raw_articles = _scrape_event_articles(
        ticker, company_name, event_date, event_type,
    )

    if not raw_articles:
        return {"articles": [], "summary": "No news articles found for this event.", "cached": False}

    # Build event details string if not provided
    if not event_details:
        event_details = f"{event_type} event for {ticker} on {event_date}"

    # --- Stage 2: Rank ---
    ranked = _rank_articles(
        ticker, company_name, event_date, event_type, event_details, raw_articles,
    )

    # --- Stage 3: Summarize ---
    summary = _summarize_event(
        ticker, company_name, event_date, event_type, event_details, ranked,
    )
    if not summary:
        summary = "Unable to generate summary — LLM unavailable."

    # --- Store everything in DB ---
    db = get_db()
    try:
        # Store all raw articles
        for a in raw_articles:
            is_top = True if a.get("is_top") else False
            score = a.get("relevance_score")
            try:
                db.execute("""
                    INSERT INTO stock_news
                    (ticker, event_date, event_type, title, snippet, url,
                     publisher, article_date, search_query, relevance_window,
                     relevance_score, is_top_article)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (ticker, event_date, url) DO UPDATE SET
                        relevance_score = EXCLUDED.relevance_score,
                        is_top_article = EXCLUDED.is_top_article
                """, (
                    ticker.upper(), event_date, event_type,
                    a.get("title", ""), a.get("snippet", ""),
                    a.get("url", ""), a.get("publisher", ""),
                    a.get("date", ""), a.get("search_query", ""),
                    a.get("relevance_window", ""), score, is_top,
                ))
            except Exception as e:
                logger.debug(f"Insert article failed: {e}")

        # Also mark the ranked ones explicitly
        for a in ranked:
            try:
                db.execute("""
                    UPDATE stock_news SET is_top_article = TRUE, relevance_score = %s
                    WHERE ticker = %s AND event_date = %s AND url = %s
                """, (a.get("relevance_score", 0.5), ticker.upper(), event_date, a.get("url", "")))
            except Exception:
                pass

        # Store summary
        try:
            db.execute("""
                INSERT INTO event_summaries
                (ticker, event_date, event_type, summary, model_used)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (ticker, event_date, event_type) DO UPDATE SET
                    summary = EXCLUDED.summary,
                    model_used = EXCLUDED.model_used
            """, (ticker.upper(), event_date, event_type, summary, "gemini"))
        except Exception as e:
            logger.warning(f"Failed to store summary: {e}")

        db.commit()
    finally:
        db.close()

    return {
        "articles": [{
            "title": a.get("title", ""),
            "snippet": a.get("snippet", ""),
            "url": a.get("url", ""),
            "publisher": a.get("publisher", ""),
            "article_date": a.get("date", ""),
            "relevance_window": a.get("relevance_window", ""),
            "relevance_score": a.get("relevance_score"),
        } for a in ranked],
        "summary": summary,
        "cached": False,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Batch: process all events for a stock
# ═══════════════════════════════════════════════════════════════════════════

def process_all_events(ticker: str, max_events: int = 25) -> dict:
    """
    Run the full pipeline for all z-score events and regime shifts of a stock.
    Returns summary stats.
    """
    from equities.analysis import get_stock_analysis

    db = get_db()
    try:
        row = db.execute(
            "SELECT name FROM companies WHERE ticker = %s", (ticker.upper(),)
        ).fetchone()
        company_name = row["name"] if row else ticker
    finally:
        db.close()

    analysis = get_stock_analysis(ticker, years=5)
    if "error" in analysis:
        return {"error": analysis["error"]}

    events = []

    # Z-score events
    for mover in analysis.get("market_movers", []):
        events.append({
            "date": mover["date"],
            "type": "zscore",
            "details": (
                f"Z-score {mover['direction']} spike of {mover['z_score']} "
                f"({mover['magnitude']}) at ${mover['price']}"
            ),
        })

    # Regime transitions
    for inf in analysis.get("inflection_points", []):
        events.append({
            "date": inf["date"],
            "type": "regime_shift",
            "details": (
                f"Regime shift from {inf['from_regime']} to {inf['to_regime']} "
                f"at ${inf['price']} (z-score: {inf['z_score']})"
            ),
        })

    # Deduplicate by date
    seen = set()
    unique = []
    for ev in events:
        if ev["date"] not in seen:
            seen.add(ev["date"])
            unique.append(ev)

    unique = unique[:max_events]

    processed = 0
    cached = 0
    errors = 0

    for ev in unique:
        try:
            result = process_event(
                ticker=ticker,
                company_name=company_name,
                event_date=ev["date"],
                event_type=ev["type"],
                event_details=ev["details"],
            )
            if result.get("cached"):
                cached += 1
            else:
                processed += 1
                time.sleep(_SEARCH_DELAY)
        except Exception as e:
            logger.warning(f"Pipeline failed for {ticker} {ev['date']}: {e}")
            errors += 1

    return {
        "ticker": ticker.upper(),
        "total_events": len(unique),
        "processed": processed,
        "cached": cached,
        "errors": errors,
    }


# ═══════════════════════════════════════════════════════════════════════════
# Read: get cached results for display
# ═══════════════════════════════════════════════════════════════════════════

def get_event_insight(ticker: str, event_date: str) -> dict:
    """
    Get the full insight for a specific event: top articles + summary.
    Returns {articles: [...], summary: str} or empty.
    """
    db = get_db()
    try:
        articles = db.execute("""
            SELECT title, snippet, url, publisher, article_date,
                   relevance_window, relevance_score
            FROM stock_news
            WHERE ticker = %s AND event_date = %s AND is_top_article = TRUE
            ORDER BY relevance_score DESC
        """, (ticker.upper(), event_date)).fetchall()

        summary_row = db.execute("""
            SELECT summary FROM event_summaries
            WHERE ticker = %s AND event_date = %s
        """, (ticker.upper(), event_date)).fetchone()

        return {
            "articles": [dict(r) for r in articles],
            "summary": summary_row["summary"] if summary_row else None,
        }
    finally:
        db.close()


def get_all_event_insights(ticker: str) -> dict:
    """Get summaries for all events of a stock, keyed by event_date."""
    db = get_db()
    try:
        summaries = db.execute("""
            SELECT event_date, event_type, summary
            FROM event_summaries
            WHERE ticker = %s
            ORDER BY event_date DESC
        """, (ticker.upper(),)).fetchall()

        return {r["event_date"]: {
            "event_type": r["event_type"],
            "summary": r["summary"],
        } for r in summaries}
    finally:
        db.close()
