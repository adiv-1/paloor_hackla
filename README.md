# Paloor — AI-Native Personal Wealth Platform

Paloor is a full-stack financial intelligence and organization platform built on AI. It combines asset tracking, financial analytics, AI-powered research, and education into a single coherent experience.

## What We're Building

**Paloor** helps individuals and families:
- **Organize** every asset they own (vehicles, property, investments) with structured document checklists
- **Understand** their complete financial picture through health scoring and portfolio analytics
- **Learn** financial foundations through an interactive education track
- **Practice** investment strategy risk-free in a simulator
- **Research** stocks and markets with AI-powered deep analysis
- **Chat** with an AI assistant that understands their personal context and can execute financial research tasks

## Architecture

### Tech Stack
- **Backend**: FastAPI (Python), PostgreSQL, AWS Bedrock, Amazon Transcribe, Alpha Vantage API
- **Frontend**: Next.js 16 (Turbopack), React, Tailwind CSS, shadcn
- **Infrastructure**: AWS (S3, Secrets Manager, etc.)

### Core Modules

#### Backend
- **auth**: JWT-based authentication, email verification, user profiles
- **assets**: Asset organization with per-class document checklists (vehicles, property, investments, accounts)
- **health**: Financial health scoring (0-100) based on document completeness, diversification, goals
- **chat**: Private AI conversations powered by Bedrock with tool-calling (Alpha Vantage integration)
- **memory**: Persistent memory system with embeddings for semantic recall across conversations
- **cohort**: Group messaging for wealth-manager scenarios
- **equities**: Alpha Vantage integration for stock research, fundamentals, financial statements, screener
- **portfolio**: Efficient frontier solver and mock-price generator for portfolio optimization
- **speech**: Amazon Transcribe wrapper for voice-to-text

#### Frontend
- **Landing** (`/`): Product overview and value proposition
- **Auth** (`/login`, `/verify-email`, `/profile-setup`): Onboarding flow
- **Dashboard** (`/dashboard`): Central hub with sidebar navigation
  - **Assets** (`/assets`, `/assets/[key]`): Browse and manage asset classes
  - **Account** (`/account`): Personal documents (DL, passport, IDs)
  - **Health**: Financial health score visualization
  - **Learning** (`/learning`): Interactive finance education from first principles
  - **Simulator** (`/simulator`): Risk-free trading with synthetic market data
  - **Chat** (`/chat`): Private AI conversation with streaming and tool output
  - **Cohort** (`/cohort`): Group messaging
  - **Equities** (`/equities`, `/equities/stocks/[ticker]`): Stock research and screener
  - **Analysis** (`/analysis`, `/analysis/[id]`): Deep-analysis reports from multi-agent research
  - **Portfolio** (`/portfolio`): Efficient-frontier visualization

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL 13+
- AWS credentials (for Bedrock, S3, Transcribe, Secrets Manager)

### Local Setup

#### 1. Backend
```bash
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Set environment
export NEXT_PUBLIC_API_URL="http://localhost:8001"
# Or create a .env file with required AWS config

# Run migrations (if using PostgreSQL)
# (Schema managed via init_schema.sql, migrations/ folder)

# Start server
uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

#### 2. Frontend
```bash
cd frontend

# Install dependencies
npm install

# Set environment
export NEXT_PUBLIC_API_URL="http://127.0.0.1:8001"

# Start dev server
npm run dev
# Opens on http://localhost:3000
```

#### 3. Database
```bash
# Create PostgreSQL database
createdb paloor_db

# Apply schema
psql -U paloor_user -d paloor_db -f backend/init_schema.sql
psql -U paloor_user -d paloor_db -f backend/init_extensions.sql
```

### Environment Variables

**Backend** (`.env`):
```
DATABASE_URL=postgresql://paloor_user:password@localhost:5432/paloor_db
UPLOAD_BUCKET=paloor-uploads-prod
AWS_REGION=us-east-1
JWT_SECRET_KEY=your-secret-key
CORS_ORIGINS=http://localhost:3000
```

**Frontend** (`.env.local`):
```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8001
```

## API Reference

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Get JWT token
- `POST /api/auth/verify-email` - Verify email code
- `PUT /api/auth/profile` - Update profile
- `POST /api/auth/photo` - Upload user photo

### Assets & Documents
- `GET /api/asset-classes` - List asset classes
- `POST /api/assets` - Create asset
- `GET /api/assets` - List user assets
- `POST /api/documents/{asset_id}` - Upload document
- `GET /api/documents/{doc_id}/preview` - Preview document
- `POST /api/account/documents` - Upload personal document

### AI & Chat
- `POST /api/chat/start` - Start conversation
- `POST /api/chat/{conversation_id}/message` - Send message (streams)
- `WS /ws/chat` - WebSocket for real-time chat
- `POST /api/memory/store` - Store memory
- `POST /api/memory/search` - Semantic search

### Equities & Analysis
- `GET /api/equities/v2/search` - Search stocks
- `GET /api/equities/v2/snapshot/{ticker}` - Get stock snapshot
- `POST /api/analysis` - Start deep analysis (multi-agent)
- `GET /api/portfolio/frontier` - Efficient frontier

### Health
- `GET /api/health` - Financial health score

## Development Workflow

### Running Tests
```bash
# Backend
cd backend
pytest

# Frontend
cd frontend
npm run test
```

### Building for Production
```bash
# Backend
# (Docker Dockerfile included)
docker build -t paloor-backend .

# Frontend
cd frontend
npm run build
npm run start
```

## Staged Development Arc

This codebase is organized in 5 progressive stages:

1. **Foundation** — Auth, landing page, app shell
2. **Onboarding & Dashboard** — Email verification, profile setup, basic logged-in surface
3. **Financial Organization** — Assets, accounts, documents, linked accounts, health scoring
4. **AI Layer** — Chat, memory, cohorts, speech transcription
5. **Investment Intelligence** — Equities research, deep analysis, portfolio optimization

Each stage builds on the previous, allowing for incremental feature rollout and testing.

## Contributing

- Fork the repo
- Create a feature branch
- Submit a PR with clear description of changes

## License

Proprietary — Paloor Inc.

## Contact

For questions or feedback, reach out to the team.
