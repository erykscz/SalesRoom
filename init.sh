#!/bin/bash

# Sales Room (Proces OS) - Development Environment Setup Script
# This script initializes and starts the development environment

set -e

echo "============================================"
echo "Sales Room (Proces OS) - Development Setup"
echo "============================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js version
echo "Checking Node.js version..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo -e "${RED}Error: Node.js 18+ required. Found version $(node -v)${NC}"
        exit 1
    fi
    echo -e "${GREEN}Node.js $(node -v) found${NC}"
else
    echo -e "${RED}Error: Node.js not found. Please install Node.js 18+${NC}"
    exit 1
fi

# Check Python version
echo "Checking Python version..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
    echo -e "${GREEN}Python $PYTHON_VERSION found${NC}"
elif command -v python &> /dev/null; then
    PYTHON_VERSION=$(python --version | cut -d' ' -f2 | cut -d'.' -f1,2)
    echo -e "${GREEN}Python $PYTHON_VERSION found${NC}"
else
    echo -e "${YELLOW}Warning: Python not found. AI features may not work.${NC}"
fi

# Check for required environment variables
echo ""
echo "Checking environment variables..."
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo -e "${YELLOW}Warning: ANTHROPIC_API_KEY not set. AI features will not work.${NC}"
    echo "Set it with: export ANTHROPIC_API_KEY=your_key_here"
else
    echo -e "${GREEN}ANTHROPIC_API_KEY is set${NC}"
fi

if [ -z "$SERPER_API_KEY" ] && [ -z "$TAVILY_API_KEY" ]; then
    echo -e "${YELLOW}Warning: Neither SERPER_API_KEY nor TAVILY_API_KEY set. Intent Scraper will not work.${NC}"
else
    echo -e "${GREEN}Search API key is set${NC}"
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo ""
    echo "Creating .env file from template..."
    cat > .env << 'EOF'
# Sales Room (Proces OS) Environment Configuration

# Server Configuration
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=./data/salesroom.db

# Authentication
JWT_SECRET=change_this_to_a_secure_random_string
SESSION_TIMEOUT_HOURS=4

# AI Configuration
ANTHROPIC_API_KEY=your_anthropic_key_here

# Search APIs (at least one required for Intent Scraper)
SERPER_API_KEY=your_serper_key_here
TAVILY_API_KEY=your_tavily_key_here

# Slack Integration (optional)
SLACK_WEBHOOK_URL=

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173
EOF
    echo -e "${GREEN}.env file created. Please update with your API keys.${NC}"
fi

# Install backend dependencies
echo ""
echo "Installing backend dependencies..."
cd backend
if [ -f "package.json" ]; then
    npm install
    echo -e "${GREEN}Backend dependencies installed${NC}"
else
    echo -e "${YELLOW}Backend package.json not found. Skipping...${NC}"
fi
cd ..

# Install frontend dependencies
echo ""
echo "Installing frontend dependencies..."
cd frontend
if [ -f "package.json" ]; then
    npm install
    echo -e "${GREEN}Frontend dependencies installed${NC}"
else
    echo -e "${YELLOW}Frontend package.json not found. Skipping...${NC}"
fi
cd ..

# Install Python dependencies for AI agents
echo ""
echo "Installing Python dependencies..."
if [ -f "ai-agents/requirements.txt" ]; then
    pip3 install -r ai-agents/requirements.txt 2>/dev/null || pip install -r ai-agents/requirements.txt 2>/dev/null || echo -e "${YELLOW}Could not install Python dependencies${NC}"
else
    echo -e "${YELLOW}Python requirements.txt not found. Skipping...${NC}"
fi

# Initialize database
echo ""
echo "Initializing database..."
cd backend
if [ -f "src/db/init.js" ]; then
    node src/db/init.js 2>/dev/null || echo -e "${YELLOW}Database initialization skipped${NC}"
fi
cd ..

# Install proces-cli globally (if available)
echo ""
echo "Setting up proces-cli..."
if [ -d "cli" ]; then
    cd cli
    npm install
    npm link 2>/dev/null || echo -e "${YELLOW}Could not link CLI globally (may need sudo)${NC}"
    cd ..
fi

echo ""
echo "============================================"
echo -e "${GREEN}Setup Complete!${NC}"
echo "============================================"
echo ""
echo "To start the development servers:"
echo ""
echo "  Terminal 1 (Backend):"
echo "    cd backend && npm run dev"
echo ""
echo "  Terminal 2 (Frontend):"
echo "    cd frontend && npm run dev"
echo ""
echo "  Terminal 3 (AI Agents - optional):"
echo "    cd ai-agents && python main.py"
echo ""
echo "Application URLs:"
echo "  - Frontend: http://localhost:5173"
echo "  - Backend API: http://localhost:3001"
echo ""
echo "CLI Usage:"
echo "  proces analyze ./transcript.txt"
echo "  proces battle price"
echo ""
echo "Default Admin Credentials:"
echo "  Email: admin@salesroom.local"
echo "  Password: Admin123!"
echo ""
echo -e "${YELLOW}Remember to update .env with your API keys!${NC}"
