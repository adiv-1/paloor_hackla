# AGENTS.md — Paloor Hackathon Codebase

Compact instruction file for future OpenCode sessions working on Paloor (AI-native finance platform for LA Hacks 2026).

## TL;DR: The Three Monorepos

This is a monorepo with **4 independent applications** that talk to each other:

1. **Backend** (`backend/`) — FastAPI + Python 3.10, PostgreSQL, AWS Bedrock (multi-model), Alpha Vantage, ElevenLabs
2. **Frontend** (`frontend/`) — Next.js 16, React 19, TypeScript, Tailwind, shadcn/ui
3. **Mobile** (`mobile/`) — React Native + Expo SDK 54, talks to the same backend
4. **Infrastructure** (`infra/`) — AWS CDK (TypeScript), App Runner + Amplify hosting

Each has its own `package.json` or `requirements.txt` and independent dev flow. **No monorepo tooling** (no npm workspaces, no Lerna). Start them in separate terminals.

---

## Backend: FastAPI + Python 3.10

### Quick start

```bash
cd backend
python -m venv ../.venv           # Create venv in repo root, NOT in backend/
source ../.venv/bin/activate      # Shared across entire project
pip install -r requirements.txt

# Local dev with SQLite (no RDS needed)
PALOOR_LOCAL_DB=1 PALOOR_BOOTSTRAP=0 \
  uvicorn main:app --host 127.0.0.1 --port 8001
```

**Default dev server**: `http://127.0.0.1:8001` (note: not `localhost` — must be explicit IP)

- OpenAPI docs at `/docs`
- Redoc at `/redoc`
- Health check: `GET /health`

### Key environment variables

**Critical (set these for local dev to work):**
- `PALOOR_LOCAL_DB=1` — Use SQLite (`data.db`) instead of PostgreSQL. **Clears on restart.**
- `PALOOR_BOOTSTRAP=0` — Skip seeding S&P 500 companies (slow on startup)
- `AWS_REGION=us-east-1` — Bedrock uses `us-east-1` hardcoded

**Optional (leave blank for dev unless you have keys):**
- `ALPHA_VANTAGE_API_KEY` — Stock data; endpoints fail gracefully without it
- `ELEVENLABS_API_KEY` — Voice TTS/STT; endpoints fail gracefully without it
- `JWT_SECRET_KEY` — Defaults to dev key in `config.py`

**Bedrock access:**
- Boto3 reads `~/.aws/credentials` or `AWS_PROFILE` env var. Must have IAM permissions for:
  - `bedrock:InvokeModel` (Gemma 3 27B, Llama 4 Maverick 17B, Nova Lite)
  - No API key needed — identity-based IAM

### Backend architecture

```
backend/
├── main.py                    FastAPI entrypoint (v0.10.0), router registration
├── config.py                  Settings from env vars + Secrets Manager
├── database.py                SQLAlchemy session factory
├── models.py                  Core Pydantic/SQLAlchemy models (User, Asset, etc.)
├── auth.py                    JWT token generation/verification
├── auth_router.py             POST /api/auth/register, /login
├── bootstrap.py               apply_schema(), seed companies on startup
├── docker-compose.yml         PostgreSQL 15 + pgvector for local Docker dev
│
├── chat/                       AI assistant + multi-model orchestration
│   ├── ai_service.py           Bedrock API calls + tool-intent routing heuristic
│   ├── deep_analysis.py        8-agent pipeline (Market, Tech, Fundamentals, News, Bull, Bear, Trader, Risk, PM)
│   ├── av_tools.py             Alpha Vantage tool specs for Bedrock Converse toolUse
│   ├── router.py               POST /api/chat/conversations/{id}/stream (SSE)
│   ├── websocket.py            WS /ws/chat real-time streaming
│   ├── service.py              Conversation CRUD, message storage
│   ├── cohort_router.py         Group chat endpoints
│   └── analysis_router.py       Trigger + fetch 8-agent analysis reports
│
├── equities/                   Stock data + discovery
│   ├── router.py               GET /api/equities/v2/screener, /prices/{ticker}, etc.
│   ├── service.py              Alpha Vantage API calls, caching
│   └── models.py               Company, Price, Ratio, News, Filing schemas
│
├── learn/                      Voice-first finance curriculum
│   ├── models.py               Lesson, Checkpoint, Progress DB models
│   ├── router.py               GET /api/learn/* + lesson detail
│   └── checkpoint.py           AI-powered soft assessment
│
├── portfolio/                  Efficient frontier optimization
│   ├── service.py              PyPortfolioOpt mean-variance solver
│   └── router.py               GET /api/portfolio/frontier
│
├── assets/                     Documents + OCR
│   ├── service.py              Asset CRUD, document storage, mock/real OCR
│   ├── definitions.py          Asset-class document checklists (vehicles, real estate)
│   └── router.py               POST /api/assets/{id}/documents (upload + process)
│
├── memory/                     Embedding-backed semantic recall
│   ├── router.py               /api/memory/* endpoints
│   └── service.py              Vector embeddings via Bedrock
│
├── admin_router.py             Admin console (user management, revenue tracking)
├── admin_auth.py               Admin login + session
├── admin_users.py              Admin user CRUD
│
├── speech.py                   Voice (ElevenLabs TTS + STT)
├── storage.py                  S3 uploads + local fallback
├── linked_accounts.py          Fintech account linking (future)
├── migrations/                 Alembic (not actively used; schema in bootstrap.py)
├── docs/                       Session journals (development log, not prod docs)
└── requirements.txt            Python dependencies (fastapi, sqlalchemy, boto3, etc.)
```

### Testing & linting

**Current state**: No test files exist. Manual QA only.

To add tests later:
- Backend uses pytest (not in requirements.txt yet)
- Frontend uses ESLint (installed, not configured)

### Common gotchas

1. **"No module named 'X'"** → Forgot to activate venv: `source ../.venv/bin/activate`
2. **"Connection refused" on port 8001** → Backend already running in another terminal or crashed; check `lsof -i :8001`
3. **"403 Forbidden from Bedrock"** → IAM role missing `bedrock:InvokeModel` or wrong region (must be `us-east-1`)
4. **SQLite file not created** → Use `PALOOR_LOCAL_DB=1` explicitly; `PALOOR_BOOTSTRAP=0` to skip slow company seed
5. **Auth failures** → JWT_SECRET_KEY mismatch between backend and frontend; check `.env` and `config.py` defaults

---

## Frontend: Next.js 16 + React 19

### Quick start

```bash
cd frontend
npm install
PORT=3001 NEXT_PUBLIC_API_URL=http://127.0.0.1:8001 npm run dev
```

**Default dev server**: `http://localhost:3001` (on port 3001 to avoid conflicts with typical port 3000)

### Key environment variables

- `NEXT_PUBLIC_API_URL` — Backend URL (default `http://localhost:8000` in code; override to `http://127.0.0.1:8001` for local dev with backend on port 8001)
- `PORT` — Dev server port (default 3000; set to 3001 to avoid conflicts)

### Frontend architecture

```
frontend/
├── app/
│   ├── (public)/                  Unauthenticated pages
│   │   ├── page.tsx               Landing
│   │   ├── login/page.tsx          Sign in
│   │   ├── register/page.tsx       Register
│   │   └── verify-email/page.tsx   Email verification
│   │
│   ├── dashboard/                  Protected routes (require JWT)
│   │   ├── layout.tsx              Authenticated app shell (sidebar + AIHelper widget)
│   │   ├── page.tsx                Dashboard home
│   │   ├── learning/page.tsx        LEARN pillar (voice-first lessons)
│   │   ├── simulator/page.tsx       PRACTICE pillar (risk-free trading)
│   │   ├── equities/page.tsx        RESEARCH pillar (stock discovery + analysis)
│   │   ├── analysis/page.tsx        View 8-agent reports
│   │   ├── chat/page.tsx            AI conversations (1:1 and groups)
│   │   ├── account/page.tsx         Profile, AI preferences, financial assessment
│   │   └── admin/                   Admin console (user mgmt, revenue)
│   │
│   ├── layout.tsx                  Root layout (global styles, auth provider)
│   ├── page.tsx                    Index/root
│   └── globals.css                 Tailwind + global styles
│
├── components/
│   ├── Sidebar.tsx                 Dashboard navigation
│   ├── AIHelper.tsx                Persistent chat widget (bottom-right)
│   ├── StopSpeakingButton.tsx       Global interrupt for ElevenLabs TTS
│   ├── EfficientFrontierChart.tsx  Recharts portfolio visualization
│   ├── ThemeToggle.tsx              Light/dark mode
│   ├── Reveal.tsx                   Scroll-reveal animation helper
│   └── ...                          (shadcn/ui + custom)
│
├── lib/
│   ├── auth.tsx                    AuthContext + useAuth() hook, JWT storage
│   ├── admin-auth.tsx              Admin auth context + adminFetch()
│   ├── api.ts                       API_URL resolver, fetch wrapper
│   └── utils.ts                     Shared utilities
│
├── package.json                    Dependencies (Next.js 16, React 19, Tailwind, shadcn)
├── tsconfig.json                   TypeScript config
├── next.config.ts                  Next.js config
├── components.json                 shadcn/ui config
├── postcss.config.mjs              PostCSS + Tailwind
└── .eslintrc.json                  ESLint config (basic)
```

### Important setup details

- **shadcn/ui**: Pre-installed. Buttons, modals, etc. are in `components/ui/`.
- **Tailwind CSS 4**: Latest version; uses `@apply` and CSS variables.
- **React Compiler**: Enabled in `babel-plugin-react-compiler` (experimental, may auto-memoize).
- **Port 3001**: Intentionally not 3000 to avoid conflicts. **Always set `PORT=3001`** in dev.

### Common gotchas

1. **"Cannot GET /"** → Backend not running on port 8001; check `NEXT_PUBLIC_API_URL`
2. **"Unexpected token <"** → HTML response instead of JSON from backend; backend down or wrong URL
3. **Tailwind not applying** → Clear `.next` folder: `rm -rf .next && npm run dev`
4. **"Module not found: @/*"** → TypeScript path alias issue; check `tsconfig.json` has `"@/*"` mapped to `./`

---

## Mobile: React Native + Expo

### Quick start (physical Android phone on same Wi-Fi)

```bash
# Terminal 1: Backend (on Mac)
cd backend
source ../.venv/bin/activate
PALOOR_LOCAL_DB=1 uvicorn main:app --host 0.0.0.0 --port 8001

# Find Mac's LAN IP
ipconfig getifaddr en0    # e.g., 192.168.1.42

# Terminal 2: Mobile
cd mobile
EXPO_PUBLIC_API_URL=http://192.168.1.42:8001 npx expo start

# On the phone: Install Expo Go from Play Store, scan QR code
```

### Environment variables

- `EXPO_PUBLIC_API_URL` — Backend URL (no trailing slash). Defaults to `http://10.0.2.2:8001` for Android emulator.

### Architecture

```
mobile/
├── app/
│   ├── _layout.tsx                Root stack navigator, AuthProvider, theme
│   ├── index.tsx                  Boot redirect (/login or /(tabs)/chat)
│   ├── login.tsx                  POST /api/auth/login
│   ├── register.tsx               POST /api/auth/register
│   └── (tabs)/
│       ├── _layout.tsx            Bottom tab bar (Chat, Learn, Research, Profile)
│       ├── chat.tsx               AI assistant (WS streaming)
│       ├── learn.tsx              📝 Lesson list (STUB: no detail view)
│       ├── research.tsx           🔬 Stock lookup (STUB: raw JSON)
│       └── profile.tsx            User profile + sign out
│
├── lib/
│   ├── api.ts                     Fetch wrapper + wsUrl() helper
│   ├── auth.tsx                   AuthContext (mirrors frontend/lib/auth.tsx)
│   └── theme.ts                   Color tokens
│
├── app.json                       Expo config (permissions, plugins)
├── package.json                   Expo + React Native deps
├── tsconfig.json                  TypeScript config
└── README.md                      Mobile-specific setup (see README for full details)
```

### Known stubs / gaps

- **Learn screen**: Lists lessons but no detail view or voice playback
- **Research screen**: Shows raw JSON from `/api/equities/v2/prices/{ticker}`
- **Voice**: Not implemented (needs `expo-speech`, ElevenLabs integration)
- **Charts**: Not implemented (needs `victory-native` or `react-native-gifted-charts`)
- **Document upload**: Not implemented (needs `expo-document-picker`)

---

## Infrastructure: AWS CDK

### Quick start

```bash
cd infra
npm install
npm run build

# One-time bootstrap per account/region
npx cdk bootstrap

# Synthesize (preview what will be deployed)
npm run synth -- -c stage=dev

# Deploy both frontend + backend stacks
npm run deploy -- -c stage=dev --all

# Deploy backend only
npm run deploy -- -c stage=dev PaloorBackendStack-dev
```

### Architecture

```
infra/
├── bin/
│   └── paloor-infra.ts            CDK app entrypoint
│
├── lib/
│   ├── backend-stack.ts           App Runner (FastAPI container) + S3 + Secrets Manager
│   └── frontend-stack.ts          Amplify Hosting (Next.js)
│
├── cdk.json                        CDK config (context values)
├── package.json                    CDK + TypeScript tooling
├── tsconfig.json                   TypeScript config
└── README.md                       Detailed deployment guide
```

### Deployment parameters

**Frontend stack expects:**
- `FrontendRepository` — GitHub repo URL (e.g., `https://github.com/user/paloor`)
- `GitHubPersonalAccessToken` — Amplify Git access token
- `FrontendBranch` — Branch to deploy (usually `main`)

**Backend stack expects:**
- `BackendImageUri` — ECR image URI (e.g., `123456789.dkr.ecr.us-east-1.amazonaws.com/paloor:latest`)

Pass via CLI:
```bash
npm run deploy -- -c stage=dev \
  -c FrontendRepository=https://github.com/user/paloor \
  -c GitHubPersonalAccessToken=ghp_xxx \
  -c BackendImageUri=123456789.dkr.ecr.us-east-1.amazonaws.com/paloor:latest
```

### Common gotchas

1. **"No credentials"** → AWS CLI not configured; run `aws configure` or set `AWS_PROFILE`
2. **"CDK bootstrap not complete"** → Run `npx cdk bootstrap` once per account/region
3. **"InvalidParameterValueException" on deploy** → Missing required context variables; check deploy command

---

## Database

### Local dev (SQLite)

```bash
# Set env var
PALOOR_LOCAL_DB=1

# Data file: backend/data.db (cleared on every restart)
# Tables created automatically by bootstrap.py on startup
```

### PostgreSQL (production / Docker)

```bash
# Start PostgreSQL via Docker Compose
cd backend
docker-compose up -d

# Connection string
postgresql://paloor:paloor_prod_2026@localhost:5432/paloor

# Schema initialized by init_schema.sql + init_extensions.sql (both in docker-entrypoint-initdb.d)
# pgvector extension installed for semantic search
```

---

## The Multi-Model Routing Secret Sauce

**Backend quirk that agents must understand:**

Not all prompts go to the same LLM. The routing logic lives in `backend/chat/ai_service.py`:

1. **Conversational Q&A** ("what is a P/E ratio?") → **Gemma 3 27B** (Google challenge primary)
2. **Tool-using prompts** ("should I buy MSFT?", "RSI for AAPL") → **Llama 4 Maverick 17B** (can emit `toolUse`)
3. **Image OCR** (document upload) → **Gemma 3 27B vision** with fallback to Llama/Nova
4. **Fast streaming** (real-time chat) → **Amazon Nova Lite**

Routing is done via a heuristic regex `_TOOL_INTENT_RE` that checks if the prompt mentions tools (ticker symbols, technical indicators, buy/sell actions). If matched, skip Gemma and use Llama.

**Why?** Gemma can't emit Bedrock `toolUse` blocks, so tool-needing prompts need Llama. But Gemma is the Google challenge primary, so we keep most traffic on Gemma.

If you modify chat prompts or tool behavior, check `backend/chat/ai_service.py` to ensure the routing still makes sense.

---

## Development Workflow

### Running all three (backend + frontend + mobile) locally

**Terminal 1: Backend**
```bash
cd backend
source ../.venv/bin/activate
PALOOR_LOCAL_DB=1 PALOOR_BOOTSTRAP=0 \
  uvicorn main:app --host 0.0.0.0 --port 8001
```

**Terminal 2: Frontend**
```bash
cd frontend
PORT=3001 NEXT_PUBLIC_API_URL=http://127.0.0.1:8001 npm run dev
```

**Terminal 3: Mobile (if testing on physical phone)**
```bash
cd mobile
EXPO_PUBLIC_API_URL=http://192.168.1.42:8001 npx expo start
# Then scan QR on Expo Go
```

**Terminal 4: Android emulator (alternative to Terminal 3)**
```bash
cd mobile
npx expo start --android
# Or just: npx expo start (then press 'a' in the terminal)
```

### Commit conventions (from git history)

- Commits are descriptive and single-feature focused
- No strict format enforced; just clear messages
- Example: "Add 8-agent analysis pipeline", "Fix multi-model routing heuristic"

### Pre-commit / CI

**Current state**: None set up. No GitHub Actions, no pre-commit hooks.

Future agents may want to add:
- Python linting/type-checking for backend (pylint, mypy)
- Frontend linting (eslint —already configured but not in CI)
- Docker build verification for backend
- Tests (once written)

---

## Critical Files & Commands Cheat Sheet

| Task | Command | Notes |
| --- | --- | --- |
| Start backend | `cd backend && source ../.venv/bin/activate && PALOOR_LOCAL_DB=1 PALOOR_BOOTSTRAP=0 uvicorn main:app --host 127.0.0.1 --port 8001` | Port 8001, not 8000 |
| Start frontend | `cd frontend && PORT=3001 NEXT_PUBLIC_API_URL=http://127.0.0.1:8001 npm run dev` | Port 3001 |
| Start mobile | `cd mobile && EXPO_PUBLIC_API_URL=http://192.168.1.42:8001 npx expo start` | Replace IP with your Mac's LAN IP |
| View backend docs | `http://127.0.0.1:8001/docs` | OpenAPI Swagger UI |
| View frontend landing | `http://localhost:3001` | |
| Docker PostgreSQL | `cd backend && docker-compose up -d` | For production-like local testing |
| Deploy to AWS | `cd infra && npm run deploy -- -c stage=dev --all` | Requires AWS credentials + parameters |

---

## What Future Agents Should Know

1. **No monorepo tooling**: 4 separate apps. Start them in 4 terminals. They don't depend on each other for local dev (each uses local defaults).

2. **Database is ephemeral in dev**: SQLite clears on restart. Use Docker Compose PostgreSQL if you need persistence.

3. **Bedrock is AWS-identity-based**: No API key; IAM role must grant `bedrock:InvokeModel` for `us-east-1`.

4. **Port 8001, not 8000**: Backend defaults to 8001 in the README. Frontend hardcodes 8000 in some places; override with `NEXT_PUBLIC_API_URL`.

5. **Port 3001, not 3000**: Frontend runs on 3001 to avoid conflicts. Always set `PORT=3001`.

6. **Mobile is Expo, not native**: Changes to mobile don't require native Android/iOS SDKs. Just `npx expo start` and scan the QR.

7. **Tool-intent routing is intentional**: Don't remove the Gemma/Llama routing logic in `ai_service.py` without understanding the Google challenge constraint.

8. **No tests exist yet**: Manual QA only. Adding a test suite is high-priority future work.

9. **Admin console is basic**: `/admin/dashboard/*` is a simple CRM view. Not polished; mostly for demos.

10. **Session journals in `backend/docs/`**: Great for understanding iteration history. Not part of the runtime; just development notes.

