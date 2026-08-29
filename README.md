# PromptLaunch

> Type what you're selling. Get a live, conversion-built landing page in under a minute — streamed in front of you like it's being built by hand.

## Quick Start

### Prerequisites
- Python 3.11+
- Node 20+
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/)

### 1. Backend (Django)

```bash
cd backend

# Add your Gemini API key to .env
# Edit backend/.env and set: GEMINI_API_KEY=your-key-here

# Run the dev server
python manage.py runserver
```

Django runs at **http://localhost:8000**  
SQLite is used automatically for local dev (no Postgres setup needed).

### 2. Frontend (React/Vite)

```bash
cd frontend
npm run dev
```

Vite runs at **http://localhost:5173**  
All `/api/` requests are proxied to Django on port 8000.

**Open http://localhost:5173 in your browser.**

---

## Project Structure

```
promptlaunch/
├── backend/
│   ├── apps/
│   │   ├── pages/          # Core app: models, API views, Gemini service
│   │   └── marketing/      # Marketing site template (production)
│   ├── prompts/
│   │   └── landing_page_system_v1.md   # Versioned anti-AI-slop system prompt
│   └── manage.py
└── frontend/
    └── src/
        ├── components/     # MarketingPage, Dashboard, ChatPanel, WorkspacePanel, CodeStream, ActionBar
        └── hooks/          # useSSE (SSE streaming hook)
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects/` | Create project + run prompt enhancement |
| GET | `/api/projects/<id>/` | Get project state + chat history |
| GET | `/api/projects/<id>/stream/` | SSE stream of generation tokens |
| POST | `/api/projects/<id>/chat/` | Send refinement message |
| POST | `/api/projects/<id>/publish/` | Publish to `/p/<slug>/` |
| GET | `/p/<slug>/` | Public published landing page |

## Phase Roadmap

- **Phase 1** ✅ — Core generation loop (current)
- **Phase 2** — Accounts & project history
- **Phase 3** — Meta Ads one-click integration
- **Phase 4** — Monetization, custom domains, A/B variants
