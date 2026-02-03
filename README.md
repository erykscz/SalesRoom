# Sales Room (Proces OS)

An AI-powered sales enablement platform that replaces multiple SaaS subscriptions with one integrated ecosystem covering the entire IT sales cycle.

## Overview

Sales Room (Proces OS) supports:
- **Intent Scraper**: AI-powered lead generation with natural language search
- **Discovery Insight Extractor**: Meeting intelligence and transcript analysis
- **Stakeholder Sales Room**: Personalized client portals with role-based content
- **Objection Battlecard Generator**: AI-driven objection handling using the ARC framework

Built on the "Nessencja/Proces" framework for enterprise IT sales.

## Technology Stack

### Frontend
- React (Vite) + TypeScript
- Tailwind CSS
- shadcn/ui (Radix UI primitives)
- Lucide React icons
- React Context + Hooks for state management

### Backend
- Node.js (Express)
- SQLite database (upgradeable to PostgreSQL)
- Python for AI agent orchestration
- LangChain + Claude API (Anthropic) for RAG
- Serper/Tavily API for search

### CLI
- `proces-cli` - Command line tool for Discovery analysis and Battlecard generation

## Prerequisites

- Node.js 18+
- Python 3.10+
- Git
- Claude API key (ANTHROPIC_API_KEY)
- Serper or Tavily API key for search functionality

## Quick Start

1. Clone the repository:
```bash
git clone <repository-url>
cd sales-room
```

2. Run the setup script:
```bash
chmod +x init.sh
./init.sh
```

3. Configure environment variables in `.env`

4. Start the development servers:

**Terminal 1 (Backend):**
```bash
cd backend && npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd frontend && npm run dev
```

5. Access the application:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Project Structure

```
sales-room/
├── frontend/                 # React + Vite frontend
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Page components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── contexts/        # React Context providers
│   │   ├── services/        # API service functions
│   │   ├── types/           # TypeScript type definitions
│   │   └── utils/           # Utility functions
│   └── public/              # Static assets
├── backend/                  # Node.js + Express backend
│   ├── src/
│   │   ├── routes/          # API route handlers
│   │   ├── controllers/     # Business logic controllers
│   │   ├── models/          # Database models
│   │   ├── middleware/      # Express middleware
│   │   ├── services/        # Business services
│   │   ├── db/              # Database configuration
│   │   └── utils/           # Utility functions
│   └── tests/               # Backend tests
├── ai-agents/               # Python AI orchestration
│   ├── agents/              # LangChain agent implementations
│   ├── prompts/             # AI prompt templates
│   └── rag/                 # RAG pipeline components
├── cli/                     # proces-cli command line tool
│   └── src/
├── data/                    # SQLite database files
├── docs/                    # Documentation
├── init.sh                  # Setup script
└── README.md
```

## User Roles

| Role | Access |
|------|--------|
| Sales Rep | All 4 modules, own deals only |
| SDR | Same as Sales Rep (organizational distinction) |
| AE | Same as Sales Rep (organizational distinction) |
| Sales Manager | Rep access + team visibility (read-only coaching) |
| Admin | User management, system settings, no sales workflows |

## Core Modules

### 1. Intent Scraper
- Natural language "Mission Objective" input
- ICP (Ideal Customer Profile) templates
- Background search with job queue
- AI-generated confidence scores
- Personalized hook generator (3 variants per lead)
- Competitor displacement analysis
- CSV import/export

### 2. Discovery Insight Extractor
- CLI: `proces analyze ./transcript.txt`
- Web: Drag-and-drop file upload
- Supports .txt, .json, .vtt formats
- Auto-detects Fireflies, Otter, Zoom, Google Meet
- Extracts: Pain Points, Stakeholder Map, Red Flags, Next Steps
- Deal Health Score calculation

### 3. Stakeholder Sales Room
- 3-step creation wizard
- Stakeholder-specific sections (CFO, CTO, Security, Engineering)
- Auto-ROI calculation from Discovery insights
- RAG-powered chatbot
- Real-time analytics (section views, time spent)
- Mutual Action Plan with task tracking
- Stakeholder Consensus Poll

### 4. Objection Battlecard Generator
- Strategic mode: Pre-meeting objection prediction
- Operational mode: CLI `proces battle [type]` for instant responses
- Reflective mode: Email objection → detailed response
- ARC framework (Acknowledge, Reframe, Counter)
- Crowdsourced "Golden Arrows" for proven responses

## CLI Usage

```bash
# Analyze meeting transcript
proces analyze ./transcript.txt

# Generate quick battlecard response
proces battle price
proces battle competition
proces battle technology

# Get help
proces --help
```

## Environment Variables

```env
# Server
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=./data/salesroom.db

# Authentication
JWT_SECRET=your_secret_here
SESSION_TIMEOUT_HOURS=4

# AI
ANTHROPIC_API_KEY=your_key_here

# Search APIs
SERPER_API_KEY=your_key_here
TAVILY_API_KEY=your_key_here

# Integrations
SLACK_WEBHOOK_URL=your_webhook_url
```

## Default Credentials

For development:
- **Email**: admin@salesroom.local
- **Password**: Admin123!

## API Documentation

API endpoints follow REST conventions:

- `POST /api/auth/login` - User authentication
- `GET /api/deals` - List deals (with filters)
- `POST /api/deals` - Create deal
- `GET /api/deals/:id` - Get deal details
- `PUT /api/deals/:id` - Update deal
- `DELETE /api/deals/:id` - Delete deal
- `POST /api/intent-scraper/search` - Start search
- `POST /api/discovery/upload` - Upload transcript
- `POST /api/sales-rooms` - Create Sales Room
- `GET /api/sales-rooms/public/:slug` - Public Sales Room access
- `POST /api/battlecards/generate` - Generate AI response

See full API documentation in `/docs/api.md`

## Contributing

1. Create a feature branch
2. Make changes
3. Run tests: `npm test`
4. Submit pull request

## License

Proprietary - All rights reserved
