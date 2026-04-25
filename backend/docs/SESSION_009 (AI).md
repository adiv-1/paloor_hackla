# SESSION_010 — Ambient AI, Data Privacy, and Self-Hosted Model Roadmap

**Date:** March 3, 2026  
**Version:** v0.8.0 (planning session — no code changes)  
**Focus:** Deep-dive on AI architecture: ambient/proactive insights, data privacy tiers, enterprise API options, and the long-term self-hosting path.

---

## 1. Does WHOOP Send Context Every Time? Yes — And That's by Design.

Every mainstream AI product (WHOOP, Copilot, Notion AI, Perplexity, etc.) sends context with every single API call. This is not a limitation — it's how transformer-based LLMs fundamentally work.

**Why LLMs are stateless:**

- The model itself stores zero information between requests. It has no memory of your last query.
- Its "knowledge" is baked into its weights at training time (cut-off date).
- You get 200,000 tokens (Claude) or 128,000 tokens (GPT-4o) of context window per call. That's your entire working memory for that conversation.
- When the call ends, the context is gone. Nothing persists inside the model.

**What WHOOP actually does:**

```
User opens Recovery screen
→ App assembles: last 7 days HRV, sleep stages, workout load, user's baseline norms
→ Packages as JSON + system prompt template
→ Sends to LLM API in a single POST call (all context included)
→ LLM responds with personalized HRV commentary
→ Response rendered in UI
→ API call is over, model forgets everything
```

Every day when you open WHOOP, it assembles fresh context and fires a new API call. The "memory" lives in WHOOP's database, not the model. The model is a stateless reasoning engine you call with whatever context you give it.

**This is actually the correct architecture for Paloor** because:

- You control 100% of the data. None of it lives inside the model.
- You can change AI providers any time without losing user data.
- You can audit exactly what was sent (regulatory compliance).
- You can version the context format and improve it over time.

---

## 2. Ambient AI — Insights Without Asking

The current SESSION_009 plan described a chatbot. You've described something more sophisticated: **ambient/proactive AI** — insights that appear automatically when a user navigates to a page, no interaction required. This is the higher-value product.

### The Pattern

```
User clicks "Assets" in sidebar
→ Frontend fires POST /api/ai/insights/assets (background, non-blocking)
→ Skeleton loader appears in an "AI Insights" panel on the page
→ Backend builds full context for this user (assets list, net worth trend, allocation breakdown)
→ Sends to LLM with a prompt tuned for asset-level insights
→ LLM returns 3–5 bullet insights + 1–2 action items
→ Panel renders with insights (usually <2 seconds for Claude Haiku / GPT-4o-mini)
→ Cached for 1 hour — if user re-visits within 1hr, instant display from cache
```

### What Each Page Should Surface

| Page          | Auto-Generated Insights (No User Input)                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Assets**    | Net worth change vs last month, heaviest concentration risk, any asset class significantly over/under historical allocation, cash drag warning                                                               |
| **Equities**  | Current regime interpretation in plain English ("The model detects a bearish regime for the past 3 weeks — historically this resolves in 4–6 weeks"), top inflection point significance, forecast confidence |
| **Portfolio** | Sharpe ratio context, sector correlation risk, recommended rebalance actions, tax-loss harvesting flags                                                                                                      |
| **Spending**  | Biggest category overage, subscription creep alert, savings rate vs target, anomaly spending flag                                                                                                            |
| **Dashboard** | Morning brief: net worth snapshot, key market signal, and one action item                                                                                                                                    |

### Backend Architecture

```
/api/ai/
  POST /insights/{page}     ← ambient page insights (auto-triggered)
  POST /chat                ← interactive multi-turn chat
  GET  /insights/history    ← past insights (stored in DB)
```

**Backend: Insight Builder (pseudocode)**

```python
# backend/ai_insights.py

INSIGHT_PROMPTS = {
    "assets": """
You are Paloor AI, a personal wealth advisor. Analyze this user's asset portfolio.
Be specific with numbers. Identify 1 risk, 1 strength, 1 actionable recommendation.
Format as 3 concise bullet points. No generic advice.
""",
    "equities": """
You are Paloor AI. The S&P 500 Markov regime model has flagged the following signals.
Explain what they mean for this specific user given their equity holdings.
Be direct. Max 100 words per insight.
""",
    "portfolio": """
You are Paloor AI. Review this portfolio's allocation scores and holdings.
Flag the top 1–2 concentration risks and suggest one concrete rebalance action.
""",
    "spending": """
You are Paloor AI. Review this month's spending vs budget and prior months.
Call out the biggest deviation, the subscription they're likely forgetting,
and estimate what they could redirect to savings.
"""
}

async def build_context(user_id: str, page: str) -> dict:
    """Pull all relevant user data for the requested page."""
    if page == "assets":
        assets = await assets_service.get_user_assets(user_id)
        history = await assets_service.get_net_worth_history(user_id, months=12)
        return {"assets": assets, "net_worth_history": history}
    elif page == "equities":
        analysis = get_full_analysis()  # from equities.py — already cached
        holdings = await portfolio_service.get_equity_holdings(user_id)
        return {"market_analysis": analysis, "user_holdings": holdings}
    # ... etc

async def generate_insights(user_id: str, page: str) -> list[str]:
    # Check cache first (Redis or in-memory with TTL)
    cache_key = f"insights:{user_id}:{page}"
    if cache_key in insight_cache and not is_stale(cache_key, hours=1):
        return insight_cache[cache_key]

    context = await build_context(user_id, page)
    prompt = INSIGHT_PROMPTS[page]

    # Call Claude (or swap out for any provider)
    response = anthropic_client.messages.create(
        model="claude-3-5-haiku-20241022",   # fastest + cheapest, perfect for ambient
        max_tokens=400,
        system=prompt,
        messages=[{
            "role": "user",
            "content": f"User data:\n{json.dumps(context, indent=2)}"
        }]
    )

    insights = parse_bullet_points(response.content[0].text)
    insight_cache[cache_key] = insights
    save_insights_to_db(user_id, page, insights)  # persist for history
    return insights
```

**Model choice for ambient insights:**

- Use **Claude 3.5 Haiku** or **GPT-4o mini** — they are 10x cheaper and nearly as good for structured insight generation.
- Save the heavyweight models (Claude Opus, GPT-4o full) for the interactive chat where the user is asking complex multi-hop questions.

**Frontend: Insight Panel Component**

```tsx
// components/AIInsightsPanel.tsx
export function AIInsightsPanel({ page }: { page: string }) {
  const [insights, setInsights] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/ai/insights/${page}`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        setInsights(d.insights);
        setLoading(false);
      });
  }, [page]); // fires once on page mount

  if (loading) return <InsightsSkeleton />;
  return (
    <div className="ai-panel border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <SparklesIcon className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-medium text-violet-400">AI Insights</span>
        <span className="text-xs text-zinc-500 ml-auto">Updated just now</span>
      </div>
      {insights.map((insight, i) => (
        <p key={i} className="text-sm text-zinc-300 mb-2">
          • {insight}
        </p>
      ))}
      <button className="text-xs text-zinc-500 mt-2">Ask a follow-up →</button>
    </div>
  );
}
```

Drop `<AIInsightsPanel page="assets" />` at the top of each page. That's it — ambient AI is live.

### Storing Everything (The "So Personal" Layer)

Every interaction — ambient or conversational — should be persisted:

```sql
-- New table in your Postgres schema
CREATE TABLE ai_interactions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id),
    page        TEXT,                    -- 'assets', 'equities', 'chat', etc.
    type        TEXT,                    -- 'ambient_insight', 'user_query', 'ai_response'
    content     TEXT,                    -- the actual text
    context_snapshot JSONB,             -- what data was used to generate this (audit trail)
    model_used  TEXT,                    -- 'claude-3-5-haiku', 'gpt-4o', etc.
    tokens_used INTEGER,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

This gives you:

- **Personal history** — the AI knows what it told you before (load last 5 interactions as context)
- **Auditability** — you can review exactly what context generated each insight
- **Training signal** — over time, user feedback on insights tells you what's actually useful
- **Longitudinal memory** — "Last month I flagged your Amazon spending was up 40%. This month it's normalized."

---

## 3. Data Privacy — The Truth About API vs. Consumer Products

There is a critical distinction most people miss:

| Product Type                  | Your Data                  | Used for Model Training?                |
| ----------------------------- | -------------------------- | --------------------------------------- |
| **ChatGPT Free/Plus**         | Goes to OpenAI servers     | YES by default (opt-out available)      |
| **Claude.ai (consumer)**      | Goes to Anthropic servers  | YES by default (opt-out available)      |
| **Anthropic API**             | Goes to Anthropic servers  | **NO** — contractually prohibited       |
| **OpenAI API**                | Goes to OpenAI servers     | **NO** — contractually prohibited       |
| **AWS Bedrock (Claude/GPT)**  | Stays in YOUR AWS VPC      | **NO** — never touches Anthropic/OpenAI |
| **Azure OpenAI**              | Stays in YOUR Azure tenant | **NO** — never touches OpenAI           |
| **Self-hosted Llama/Mistral** | Never leaves your server   | **NO** — zero external calls            |

The API is different from the consumer chat product. When you call `anthropic.messages.create()`, Anthropic's Terms of Service explicitly state: _"We do not use Customer Content to train our models without your permission."_ Same language in OpenAI's API terms.

So the API route is already meaningfully private by default. But there are stronger options:

### Data Privacy Tiers for Paloor

**Tier 1 — Today (Good)**

- Anthropic API or OpenAI API directly
- Data moves to their inference servers to compute the response, then is discarded
- No training on your data
- Cheapest and easiest to implement
- Fine for personal use and early beta users

**Tier 2 — Scale (Better, Enterprise-Grade)**

- **AWS Bedrock** — run Claude Sonnet/Haiku or Llama 3 entirely inside your AWS account
- Data never leaves your AWS infrastructure — it never touches Anthropic's servers
- Full VPC isolation, SOC 2 Type II, HIPAA eligible
- Requires AWS account but Paloor would already have this for EC2/RDS/S3
- Same Anthropic model quality, different routing
- Pricing roughly comparable to direct API

```python
# Swap from Anthropic API to Bedrock in one line change
import boto3
client = boto3.client("bedrock-runtime", region_name="us-east-1")
# Everything else stays the same — same Claude model, same response format
```

- **Azure OpenAI** — same concept for GPT-4o/o1, runs inside your Azure tenant
- Strong choice if you expect enterprise clients who are on Microsoft contracts

**Tier 3 — Full Privacy (Self-Hosted, Your Long-Term Play)**

- Full stack stays on your EC2 instances
- Zero data leaves your infrastructure — not even to AWS Bedrock
- You pick the model, you control updates, you own everything
- Covered in Section 4 below

**Enterprise contracts:**
Both Anthropic and OpenAI offer enterprise agreements with:

- Data Processing Agreement (DPA) — legal contract governing data handling
- Business Associate Agreement (BAA) — required for HIPAA/health data
- Dedicated capacity and higher rate limits
- These are the same contracts WHOOP, Robinhood, and fintech companies sign

For Paloor as a financial advisor product, even Tier 1 (regular API) with a DPA in place is a reasonable starting point. Move to Bedrock as soon as you have real users with real financial data.

---

## 4. Self-Hosted Open Source — The Long Game

Your instinct is right: long-term, for a privacy-first fintech product handling people's actual net worth, hosting your own model is the correct answer. Here's the realistic roadmap.

### The Models Worth Tracking

| Model                 | Size       | Best For                                          | Hardware            |
| --------------------- | ---------- | ------------------------------------------------- | ------------------- |
| **Llama 3.1 8B**      | 8B params  | Fast ambient insights, simple Q&A                 | 1x A10G (24GB VRAM) |
| **Llama 3.1 70B**     | 70B params | Complex portfolio reasoning                       | 2x A100 or 4x A10G  |
| **Mistral 7B**        | 7B params  | Very fast, excellent for structured output        | 1x A10G             |
| **Phi-4** (Microsoft) | 14B params | Surprisingly strong at reasoning, small footprint | 1x A10G             |
| **Qwen 2.5 Finance**  | 7B / 14B   | Fine-tuned on financial data — ideal for Paloor   | 1x A10G             |
| **DeepSeek-V3**       | 685B MoE   | State of the art at a fraction of GPT-4o cost     | Multi-GPU cluster   |

The key insight: **Llama 3.1 8B quantized to 4-bit runs on a single $0.76/hr EC2 g4dn.xlarge** and produces output quality that is more than sufficient for ambient financial insights. You do not need GPT-4o for "your Amazon spend is up 23% this month."

### Serving Stack

```
EC2 g4dn.xlarge ($0.76/hr, 1x T4 GPU, 16GB VRAM)
└── vLLM (production-grade inference server, OpenAI-compatible API)
    └── Llama 3.1 8B Instruct (GGUF Q4_K_M, ~5GB VRAM)
        └── Same /v1/chat/completions API as OpenAI
            └── Your backend code changes: 1 line (base_url → EC2 IP)
```

**The beauty of OpenAI-compatible APIs:**

```python
# Today — Anthropic API
from anthropic import Anthropic
client = Anthropic(api_key="sk-ant-...")

# Tier 2 — AWS Bedrock
import boto3
client = boto3.client("bedrock-runtime")

# Tier 3 — Your own EC2, vLLM serving Llama
from openai import OpenAI
client = OpenAI(base_url="http://your-ec2-ip:8000/v1", api_key="none")

# The rest of the code is IDENTICAL.
```

vLLM serves an OpenAI-compatible REST API. You literally swap one URL. This is how you migrate between providers with zero code rewrite.

### Self-Hosted Costs (Rough)

| Setup                             | Monthly Cost          | Quality Level |
| --------------------------------- | --------------------- | ------------- |
| Anthropic API (Haiku only)        | ~$5–50 (usage-based)  | Excellent     |
| AWS Bedrock (Claude Haiku)        | ~$10–80 (usage-based) | Excellent     |
| EC2 g4dn.xlarge + vLLM + Llama 8B | ~$550/mo (always-on)  | Very Good     |
| EC2 g4dn.xlarge spot instance     | ~$150–200/mo          | Very Good     |
| On-demand (scale to zero)         | ~$30–60/mo            | Very Good     |

**Recommendation:** Start on Anthropic API → migrate to AWS Bedrock when you have users who care → self-host when Paloor is generating enough revenue that $200/mo on compute is justified and you want the full privacy story for marketing.

### Fine-Tuning — When It Makes Sense

You asked about "training on individual user data." To be precise:

- **Fine-tuning** = updating the model's weights using your data. This is expensive (requires A100s, days of training), doesn't give you personalization, and is usually overkill. WHOOP does not fine-tune a model per user.
- **RAG / context injection** = what we've described — pulling user data into prompt context at query time. This IS personalization. It IS the right approach for individual users.
- **LoRA fine-tuning on domain data** = tuning the model on financial Q&A, Paloor-specific rules, your feature nomenclature. Worth doing once the product is mature and you have self-hosted infra. This makes the model "speak Paloor" better.

The realistic sequence:

1. API + context injection (now — personalizes to each user via their data)
2. AWS Bedrock (when you have paying users — data isolation)
3. vLLM + Llama on EC2 (when you want full control)
4. LoRA fine-tune on Paloor financial Q&A dataset (when model feels "off-brand")

---

## 5. What to Build Next (Code Roadmap)

### Phase 1 — Ambient AI (Next Sprint, ~2–3 days)

1. `pip install anthropic` in backend venv
2. Create `backend/ai_service.py` — context builders + `generate_insights(user_id, page)`
3. Create `backend/ai_router.py` — `POST /api/ai/insights/{page}` + `POST /api/ai/chat`
4. Register router in `main.py`
5. Create `frontend/components/AIInsightsPanel.tsx`
6. Add `<AIInsightsPanel page="assets" />` to assets, equities, portfolio, spending pages
7. Add `ai_interactions` table to DB schema

### Phase 2 — Interactive Chat (Week 2)

1. Floating chat button (bottom-right corner, all dashboard pages)
2. Slide-out chat panel (not a new page — stays in context while viewing data)
3. Conversation history — load last 10 turns from DB on open
4. Message includes: user text + current page context (so it knows what you're looking at)
5. Typing indicator, streaming response (SSE or WebSocket)

### Phase 3 — AWS Bedrock Migration (Month 2)

1. Add `boto3` to requirements
2. Create `AIProvider` abstract class with `AnthropicProvider` and `BedrockProvider` implementations
3. Environment variable `AI_PROVIDER=bedrock` switches routing
4. No frontend changes needed

### Phase 4 — Self-Hosted (Month 6–12)

1. Provision EC2 g4dn.xlarge
2. Install vLLM + pull Llama 3.1 8B or Mistral 7B
3. Run behind nginx with auth
4. Switch `AI_PROVIDER=self_hosted` pointing to EC2 private IP
5. Evaluate quality — if good enough, keep; if not, A/B test parallel with Bedrock

---

## 6. Summary — Direct Answers to Your Questions

**"Does WHOOP send context every time?"**  
Yes. Every AI product does. The model is stateless. Your database is the memory.

**"I want AI to appear automatically on every page."**  
This is Ambient AI — `POST /api/ai/insights/{page}` fires on navigation, skeleton loads, insights appear in <2 seconds with a fast model. No user input needed.

**"Is all information stored?"**  
Yes, with the `ai_interactions` table. Every ambient insight and every conversational exchange is persisted per user. Future calls can include this history as context — making the AI genuinely cumulative.

**"Are there enterprise APIs where users don't sacrifice data?"**  
For the regular API (not ChatGPT consumer product): your data is already not used for training. Anthropic's API T&Cs are explicit. AWS Bedrock is the next level — data never leaves your AWS VPC, not even to Anthropic. That is the enterprise-grade privacy story.

**"Long-term: self-hosted open source is the play."**  
100% correct. The path is: Anthropic API → AWS Bedrock → vLLM + Llama/Mistral on EC2. Because vLLM serves an OpenAI-compatible API, migration between these is a single line of code change. Build with that interface abstraction from day one.

---

_Next session: implement Phase 1 — ambient AI panel with Anthropic API, AIInsightsPanel component, and ai_interactions table._
