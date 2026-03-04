# Project Tutorial (Beginner Friendly, Updated Through Part 10)

This tutorial explains what has been built, how the pieces fit together, and how you can test everything end to end.

## Current Milestone Status

1. Part 1 complete: planning docs
2. Part 2 complete: backend + Docker scaffold
3. Part 3 complete: real Next.js frontend served by FastAPI at `/`
4. Part 4 complete: dummy login/session flow
5. Part 5 complete: database model + docs + DB tests
6. Part 6 complete: backend Kanban API with validation + `409` conflict handling
7. Part 7 complete: frontend board now persists to backend
8. Part 8 complete except live smoke check: OpenRouter connectivity endpoint + mocked tests are done
9. Part 9 complete: structured AI actions + safe apply + persistence
10. Part 10 complete: frontend AI sidebar chat wired to backend AI API

Post-MVP roadmap:

1. See `docs/POST_MVP_PLAN.md` for phased execution beyond MVP.

## 1. Big Picture

You now have a full MVP where:

1. You sign in (`user` / `password`)
2. You see a Kanban board
3. Board edits persist in SQLite
4. AI chat can update the board through validated backend actions
5. Frontend refreshes immediately with authoritative board state from backend

## 2. Technology Stack

1. Frontend:
   1. Next.js (App Router)
   2. React + TypeScript
   3. Tailwind CSS
2. Backend:
   1. FastAPI
   2. Uvicorn
3. Database:
   1. SQLite (file persisted in Docker volume)
4. Packaging/runtime:
   1. Docker + Docker Compose
5. Python package management:
   1. `uv`
6. Testing:
   1. Backend: `pytest`
   2. Frontend unit/integration: `vitest`
   3. Frontend e2e: `playwright`

## 3. Architecture (Now)

```text
Browser
  |
  v
http://127.0.0.1:8000
  |
  v
FastAPI container
  |- Auth APIs (/api/auth/*)
  |- Board APIs (/api/kanban)
  |- AI APIs (/api/ai/ping, /api/ai/chat)
  |- Serves built frontend static files at /
  |
  v
SQLite (/data/pm.sqlite3)
  |- users
  |- sessions
  |- boards
  |- chat_messages
```

Important route rule:

1. `/api/*` = backend APIs
2. all other routes = frontend app/static assets

## 4. API Endpoints You Can Use

1. `GET /api/health`
2. `POST /api/auth/login`
3. `POST /api/auth/logout`
4. `GET /api/auth/me`
5. `GET /api/hello` (auth required)
6. `GET /api/kanban` (auth required)
7. `PUT /api/kanban` (auth required, optimistic version check)
8. `POST /api/ai/ping` (auth required)
9. `POST /api/ai/chat` (auth required)

## 5. What Parts 8-10 Added

## Part 8: OpenRouter connectivity

1. Added backend OpenRouter client using `OPENROUTER_API_KEY`
2. Added `POST /api/ai/ping`
3. Ping checks a simple prompt (`2+2`) and validates expected answer
4. Added timeout/HTTP failure mapping (`504`/`502`)

## Part 9: structured AI actions

1. Added `POST /api/ai/chat`
2. Backend sends board JSON + chat history + user message to model
3. Backend requires strict structured JSON output
4. Backend validates and applies allowed actions safely:
   1. rename column
   2. create card
   3. update card
   4. move card
   5. delete card
5. Backend stores both board updates and chat messages in SQLite

## Part 10: AI sidebar frontend

1. Added AI sidebar UI component (`AiSidebar.tsx`)
2. Added message history rendering in sidebar
3. Added loading + error states
4. AI opens from a floating button as a floating panel (not always-on dock)
5. Board keeps readability-focused responsive layout:
   1. `<1280`: responsive grid
   2. `1280-1599`: horizontal readable columns with scroll
   3. `>=1600`: all five columns visible while AI panel is open
6. Hooked sidebar to `/api/ai/chat`
7. When AI returns updated board + version, frontend applies it immediately
8. Added tests:
   1. component tests for sidebar behavior
   2. integration tests for request/response mapping
   3. e2e AI flow test that confirms board updates in UI

## 6. Key Files to Know

```text
pm/
├── docs/PLAN.md
├── docs/DATABASE.md
├── tutorial.md
├── Dockerfile
├── docker-compose.yml
├── backend/app/main.py
├── backend/tests/test_app.py
├── frontend/src/components/AuthKanbanApp.tsx
├── frontend/src/components/KanbanBoard.tsx
├── frontend/src/components/AiSidebar.tsx
├── frontend/src/lib/kanbanApi.ts
└── frontend/tests/kanban.spec.ts
```

## 7. How to Run the App

From repo root (`pm/`):

### macOS/Linux

```bash
./scripts/start.sh
```

### Windows PowerShell

```powershell
.\scripts\start.ps1
```

### Windows CMD

```bat
scripts\start.bat
```

App URL:

1. `http://127.0.0.1:8000/`

Stop:

```bash
./scripts/stop.sh
```

## 8. Manual Test Walkthrough (Beginner Friendly)

1. Open `http://127.0.0.1:8000/`
2. Sign in:
   1. Username: `user`
   2. Password: `password`
3. Confirm board loads
4. Add a card to any column
5. Refresh browser, confirm card still exists
6. In AI sidebar, send:
   1. click `AI Assistant` floating button
   2. send: `Rename In Progress to Doing and add a review checklist card`
7. Confirm:
   1. new assistant response appears in sidebar
   2. board remains readable (columns do not collapse)
   3. board updates (column/card changes)
   4. version number increases
8. Click Log out and confirm sign-in screen appears

## 9. Automated Test Commands

## Backend tests

```bash
cd backend
uv run --extra dev pytest
```

## Frontend unit/integration tests

```bash
cd ../frontend
npm run test:unit
```

## Frontend e2e tests

```bash
npm run test:e2e
```

## Frontend build check

```bash
npm run build
```

## 10. Useful API Checks with curl

First login and store cookie:

```bash
curl -i -c cookies.txt -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"password"}'
```

Check session:

```bash
curl -s -b cookies.txt http://127.0.0.1:8000/api/auth/me
```

Fetch board:

```bash
curl -s -b cookies.txt http://127.0.0.1:8000/api/kanban
```

AI ping:

```bash
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/ai/ping
```

AI chat:

```bash
curl -s -b cookies.txt -X POST http://127.0.0.1:8000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Rename In Progress to Doing"}'
```

## 11. Success Criteria Status

Current status summary:

1. Parts 1-7: met
2. Part 8:
   1. mocked/unit behavior: met
   2. live local smoke with real key: still optional/pending until you run it
3. Part 9: met
4. Part 10: met

If you want to run Part 8 live smoke test yourself:

```bash
cd backend
PM_RUN_LIVE_AI_SMOKE=1 OPENROUTER_API_KEY=your_key uv run --extra dev pytest -k live_smoke
```

## 12. Troubleshooting

## `ERR_CONNECTION_REFUSED` at `127.0.0.1`

Cause:

1. app/container is not running

Fix:

1. start Docker Desktop
2. run `./scripts/start.sh`
3. wait for startup to complete

## `401 Authentication required` on protected API

Cause:

1. missing session cookie

Fix:

1. log in first
2. retry with browser session or `curl -b cookies.txt`

## AI endpoints return `503 OPENROUTER_API_KEY is not configured`

Cause:

1. API key not set in runtime environment

Fix:

1. set `OPENROUTER_API_KEY` in `.env`
2. restart stack
