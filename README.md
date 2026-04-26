# Paloor — Your AI Finance Pal

> Learn finance from first principles, practice in a risk-free simulator, and research stocks with a multi-agent AI team — all in one place.

Paloor makes personal finance approachable for people who feel locked out of the jargon. It pairs an AI tutor with a portfolio simulator and a deep-research engine so users can move from "what is a stock?" to running an 8-agent investment analysis without leaving the app.

Built for **LA Hacks 2026** — Google challenge track (Gemma 3 27B as the primary LLM) on the AWS Bedrock multi-model stack.

---

## The Three Pillars

| Pillar | What it does |
| --- | --- |
| 📚 **LEARN** | Structured curriculum from "what is a stock?" to portfolio theory. Voice-first lessons (ElevenLabs TTS + STT), AI tutor explanations, progress tracking. |
| 🎮 **PRACTICE** | Risk-free trading simulator on synthetic prices. Apply lessons immediately, make mistakes that don't cost real money. |
| 🔬 **RESEARCH** | AI-powered stock discovery and deep analysis. Eight specialist agents (Market, Technical, Fundamentals, News, Bull/Bear, Trader, Risk, Portfolio Manager) collaborate on a BUY / SELL / HOLD verdict. |

Plus an **always-on AI helper** — voice + text — that knows the user's age, income, risk tolerance, and goals.

---

## Architecture

```
┌──────────────┐      ┌───────────────┐      ┌─────────────────────────┐
│  Next.js 16  │ HTTP │   FastAPI     │ ──▶  │ AWS Bedrock (us-east-1) │
│  Turbopack   │  WS  │  (Python 3.10)│      │  • Gemma 3 27B (chat)   │
│  Tailwind    │ ───▶ │  149 routes   │      │  • Llama 4 Maverick     │
│  shadcn/ui   │      │               │      │  • Nova Lite            │
└──────────────┘      └───────┬───────┘      └─────────────────────────┘
                              │
                ┌─────────────┼──────────────┬──────────────┐
                ▼             ▼              ▼              ▼
        ┌──────────────┐ ┌─────────┐ ┌──────────────┐ ┌──────────┐
        │  PostgreSQL  │ │   S3    │ │ Alpha Vantage│ │ ElevenLabs│
        │  (RDS or     │ │ uploads │ │ (equities)   │ │  TTS+STT  │
        │   SQLite)    │ │         │ │              │ │           │
        └──────────────┘ └─────────┘ └──────────────┘ └──────────┘
```

### Multi-Model Routing (the secret sauce)

Different prompts go to different models based on intent:

- **Plain Q&A** ("what is a P/E ratio?") → **Gemma 3 27B** (Google challenge primary)
- **Tool-using prompts** ("should I buy MSFT?", "RSI for AAPL") → **Llama 4 Maverick** (supports Bedrock Converse `toolUse`)
- **Image OCR** (uploaded statements, IDs) → **Gemma 3 27B vision** with Llama / Nova fallback
- **Fast streaming** with tools → **Amazon Nova Lite**

A heuristic regex (`_TOOL_INTENT_RE` in [backend/chat/ai_service.py](backend/chat/ai_service.py)) detects when a prompt needs tool execution and skips Gemma in favor of a tool-capable model. Plain conversational queries still hit Gemma so the Google challenge story stays intact.

---

## Tech Stack

**Backend** — FastAPI · Python 3.10 · PostgreSQL (RDS) / SQLite fallback · AWS Bedrock Converse API · Alpha Vantage · ElevenLabs · Boto3
**Frontend** — Next.js 16 (Turbopack) · React 19 · TypeScript · Tailwind CSS · shadcn/ui
**Infra** — AWS CDK (TypeScript) · ECR + Fargate · RDS Postgres · S3 · Secrets Manager
**AI** — Google Gemma 3 27B · Meta Llama 4 Maverick 17B · Amazon Nova Lite · ElevenLabs Bella (voice)

---

## Repository Layout

```
paloor_hackla/
├── backend/                    FastAPI service (149 routes)
│   ├── chat/                   AI chat, multi-model routing, deep analysis
│   │   ├── ai_service.py       Bedrock orchestration + tool-intent routing
│   │   ├── deep_analysis.py    8-agent investment analysis pipeline
│   │   ├── av_tools.py         Alpha Vantage tool specs for Converse
│   │   └── websocket.py        Real-time streaming chat
│   ├── equities/               Stock data, screener, ratios, news, filings
│   ├── assets/                 Document OCR via Bedrock vision
│   ├── memory/                 Embedding-backed semantic recall
│   ├── portfolio/              Efficient-frontier solver
│   ├── speech.py               Voice (ElevenLabs)
│   └── main.py                 FastAPI entrypoint
├── frontend/                   Next.js 16 app
│   ├── app/dashboard/          Authenticated surface
│   │   ├── learning/           LEARN pillar — courses + voice tutor
│   │   ├── simulator/          PRACTICE pillar — risk-free trading
│   │   ├── equities/           RESEARCH pillar — discovery + deep analysis
│   │   ├── analysis/           Multi-agent report viewer
│   │   ├── chat/               AI conversations
│   │   └── account/            Profile, AI prefs, assessment
│   ├── components/             Shared UI (AIHelper, StopSpeakingButton, …)
│   └── lib/                    Auth, voice, API client
└── infra/                      AWS CDK stack
```

---

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- AWS account with Bedrock model access (`google.gemma-3-27b-it`, `us.meta.llama4-maverick-17b-instruct-v1:0`, `us.amazon.nova-lite-v1:0`)
- Optional: PostgreSQL 13+ (SQLite fallback works for local dev)
- Optional: Alpha Vantage API key, ElevenLabs API key

### 1. Backend

```bash
cd backend
python -m venv ../.venv
source ../.venv/bin/activate
pip install -r requirements.txt

# Local dev with SQLite (no RDS needed)
PALOOR_LOCAL_DB=1 PALOOR_BOOTSTRAP=0 \
  uvicorn main:app --host 127.0.0.1 --port 8001
```

Server boots on `http://127.0.0.1:8001`. OpenAPI docs at `/docs`.

### 2. Frontend

```bash
cd frontend
npm install
PORT=3001 NEXT_PUBLIC_API_URL=http://127.0.0.1:8001 npm run dev
```

App on `http://localhost:3001`.

### 3. AWS Credentials

Boto3 picks up standard credential sources (`~/.aws/credentials`, env vars, IAM role). Bedrock calls use `us-east-1`.

```bash
export AWS_PROFILE=your-profile
export AWS_REGION=us-east-1
```

### Environment Variables

**Backend** (`.env` or shell):
```bash
DATABASE_URL=postgresql://user:pass@host:5432/paloor    # or omit + use PALOOR_LOCAL_DB=1
JWT_SECRET_KEY=change-me
UPLOAD_BUCKET=paloor-uploads
ALPHA_VANTAGE_API_KEY=...
ELEVENLABS_API_KEY=...
CORS_ORIGINS=http://localhost:3001
```

**Frontend** (`.env.local`):
```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:8001
```

---

## Key Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` · `/api/auth/login` | JWT auth |
| `POST` | `/api/chat/conversations/{id}/stream` | Streaming chat (SSE) |
| `WS` | `/ws/chat` | Real-time chat over WebSocket |
| `POST` | `/api/analysis` | Trigger 8-agent deep analysis |
| `GET` | `/api/analysis/{id}` | Poll analysis status / fetch report |
| `GET` | `/api/equities/v2/screener` | Equity discovery |
| `GET` | `/api/equities/v2/prices/{ticker}` | OHLC history |
| `POST` | `/api/learn/voice/tts` · `/stt` | Voice |
| `POST` | `/api/assets/{id}/documents` | Upload + OCR via Bedrock vision |

Full spec: `GET /openapi.json`.

---

## What's Novel

1. **Tool-intent routing across LLMs** — Gemma is amazing at teaching but can't emit Bedrock `toolUse` blocks. We detect tool-needing prompts and route them to Llama transparently. (Most teams pick one model and live with the trade-off.)
2. **8-agent deep analysis** — Not a single LLM call. A real pipeline where Market / Technical / Fundamentals / News / Bull / Bear / Trader / Risk / Portfolio Manager each produce structured reports, debate, and converge on a verdict with confidence.
3. **Voice-first learning** — ElevenLabs TTS streams lessons; STT lets users ask follow-ups by speaking. A global Stop-speaking button lives at the dashboard root so users can interrupt anywhere.
4. **Personalized context everywhere** — Every Bedrock call includes the user's age, income band, net worth, risk tolerance, and goals. The risk manager agent literally argues against trades that don't fit the user's profile.
5. **Multi-model OCR fallback** — Document uploads go Gemma → Nova → Llama. If one returns a `ValidationException`, the next runs automatically.

---

## Demo

Try `should I buy MSFT?` in the chat. You'll see:
1. Tool-intent router picks Llama (skips Gemma).
2. Llama invokes `deep_analysis(ticker="MSFT")`.
3. Frontend shows live agent progress for ~60s.
4. Final report with BUY/SELL/HOLD, confidence, agent breakdown, and PM metrics — all personalized to the logged-in user's profile.

---

## License

Proprietary — built for LA Hacks 2026.

## Team

Aditya Venkat
