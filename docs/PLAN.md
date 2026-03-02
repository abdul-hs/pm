# Project Plan: Project Management MVP

## How this plan is executed

We execute one Part at a time. For each Part:

1. Implement only that Part's scope.
2. Run tests/checks listed for that Part.
3. Share a milestone report:
   - files changed
   - checks run and results
   - plain-language explanation
   - what next Part will do
4. Stop before starting the next Part.

## Global decisions locked for implementation

- Single FastAPI runtime container serves the built Next.js frontend at `/`.
- Docker Compose is included for local convenience.
- Auth is backend session auth using `HttpOnly` cookie.
- Dummy login credentials are fixed for MVP: `user` / `password`.
- SQLite is the local database and is auto-created if missing.
- One board JSON document is stored per signed-in user.
- AI can create/edit/move/delete cards and rename columns.
- AI chat history is persisted in SQLite with retention limits.
- Script naming is fixed:
  - `scripts/start.sh`, `scripts/stop.sh`
  - `scripts/start.ps1`, `scripts/stop.ps1`
  - `scripts/start.bat`, `scripts/stop.bat`

## Global quality gates

- Frontend unit coverage: minimum 80%.
- Backend unit coverage: minimum 80%.
- Integration testing must cover auth, persistence, and API behavior.
- End-to-end tests must cover user-critical flows.
- Every Part must define tests and success criteria before completion.

## Planned final API surface

- `POST /api/auth/login` with `{ "username": "...", "password": "..." }`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/kanban`
- `PUT /api/kanban` with `{ "board": { ... }, "version": <number> }`
- `POST /api/ai/ping`
- `POST /api/ai/chat` with `{ "message": "..." }`

## Part 1: Planning Docs

### Scope

- [ ] Expand this `docs/PLAN.md` into a detailed plan with checklist steps, tests, and success criteria for Parts 1-10.
- [ ] Create `frontend/AGENTS.md` documenting the current frontend code.
- [ ] Ensure plan includes approval gate before implementation continues.

### Tests/checks

- [ ] Verify referenced paths exist:
  - `frontend/`
  - `backend/`
  - `scripts/`
  - `docs/`
- [ ] Verify currently referenced frontend commands exist in `frontend/package.json`:
  - `npm run dev`
  - `npm run build`
  - `npm run test:unit`
  - `npm run test:e2e`

### Success criteria

- [ ] User has reviewed and approved Part 1 outputs.
- [ ] `docs/PLAN.md` is implementation-ready.
- [ ] `frontend/AGENTS.md` accurately describes current frontend code.

## Part 2: Scaffolding

### Scope

- [ ] Create FastAPI backend scaffold in `backend/`.
- [ ] Add Python project/dependencies using `uv`.
- [ ] Add `Dockerfile` and `docker-compose.yml`.
- [ ] Add cross-platform start/stop scripts in `scripts/`.
- [ ] Serve temporary static hello page at `/`.
- [ ] Add hello API endpoint (for example `/api/hello`).

### Tests/checks

- [ ] Build container image successfully.
- [ ] Start stack using start script.
- [ ] Confirm `GET /` returns hello HTML.
- [ ] Confirm `GET /api/hello` returns JSON.
- [ ] Confirm stop script fully stops stack.

### Success criteria

- [ ] Local Docker run works end to end.
- [ ] Backend app and static serving baseline are proven.

## Part 3: Serve real frontend

### Scope

- [ ] Build frontend statically and include artifacts in backend image.
- [ ] Serve built frontend from FastAPI at `/`.
- [ ] Remove temporary hello page route for `/`.
- [ ] Keep API routes under `/api/*`.
- [ ] Enforce frontend unit coverage threshold >= 80%.

### Tests/checks

- [ ] `npm run test:unit` passes with coverage threshold.
- [ ] `npm run test:e2e` passes.
- [ ] Docker run serves Kanban UI at `/`.
- [ ] API endpoints remain accessible.

### Success criteria

- [ ] Kanban demo is loaded from backend-served static assets.
- [ ] Coverage gate is enforced, not just reported.

## Part 4: Dummy sign in

### Scope

- [ ] Add backend login/logout/me routes.
- [ ] Add backend session storage in SQLite.
- [ ] Protect Kanban and protected APIs behind auth.
- [ ] Add frontend login screen and logout action.
- [ ] Persist login across page refresh with session cookie.

### Tests/checks

- [ ] Backend auth route tests (valid login, invalid login, logout).
- [ ] Backend protected-route tests (authorized vs unauthorized).
- [ ] Frontend unit/integration tests for login UX.
- [ ] E2E test for login -> board access -> logout.

### Success criteria

- [ ] Anonymous user cannot use protected resources.
- [ ] Logged-in user can access board and keep session on refresh.

## Part 5: Database modeling

### Scope

- [ ] Propose and document database schema in `docs/DATABASE.md`.
- [ ] Include tables for users, sessions, boards, and chat messages.
- [ ] Store board as canonical JSON in boards table.
- [ ] Include board `version`, created/updated timestamps.
- [ ] Document DB initialization and migration approach.
- [ ] Get explicit user sign-off before Part 6.

### Tests/checks

- [ ] Schema creation tests.
- [ ] Startup "create if missing" DB tests.
- [ ] Seed/default user and board initialization tests.

### Success criteria

- [ ] Data model is documented and approved.
- [ ] Schema supports upcoming Parts 6-10 without redesign.

## Part 6: Backend Kanban API

### Scope

- [ ] Implement protected read endpoint for board data.
- [ ] Implement protected write endpoint for board data.
- [ ] Add board payload validation.
- [ ] Add optimistic version checks and `409 Conflict` handling.
- [ ] Ensure DB auto-creates on startup when absent.

### Tests/checks

- [ ] Unit tests for validation and repository logic.
- [ ] Integration tests for read/write API behavior.
- [ ] Tests for stale write conflict path.
- [ ] Tests for unauthenticated request rejection.

### Success criteria

- [ ] Backend owns and persists board state correctly.
- [ ] Conflict behavior is deterministic and tested.

## Part 7: Frontend + backend persistence

### Scope

- [ ] Replace in-memory board state initialization with backend fetch.
- [ ] Save rename/add/delete/move actions to backend.
- [ ] Handle save failures and stale version conflicts.
- [ ] Keep current Kanban UX behavior and layout.

### Tests/checks

- [ ] Frontend integration tests with API mocking.
- [ ] E2E tests for board edits and persistence after refresh.
- [ ] E2E test for persistence after container restart.

### Success criteria

- [ ] Board data is truly persistent, not demo-only.
- [ ] User interactions remain smooth and predictable.

## Part 8: OpenRouter connectivity

### Scope

- [ ] Add backend OpenRouter client using `OPENROUTER_API_KEY`.
- [ ] Use model `openai/gpt-oss-120b`.
- [ ] Add connectivity endpoint that verifies simple prompt (`2+2`).
- [ ] Add robust timeout/error mapping.

### Tests/checks

- [ ] Unit tests with mocked OpenRouter responses.
- [ ] Failure tests for timeout and non-200 response handling.
- [ ] Live smoke test with configured API key.

### Success criteria

- [ ] Backend can reach OpenRouter successfully from local run.
- [ ] Failures are surfaced with clear API errors.

## Part 9: Structured AI actions

### Scope

- [ ] Build AI chat endpoint that sends board JSON + user question + history.
- [ ] Define strict structured output schema.
- [ ] Parse and validate AI actions before applying.
- [ ] Apply allowed actions (create/edit/move/delete card, rename column).
- [ ] Persist board and chat history atomically.

### Tests/checks

- [ ] Structured output schema validation tests.
- [ ] Action-application tests (including invalid action rejection).
- [ ] Persistence tests for board and chat updates.
- [ ] Regression tests for non-mutating AI response path.

### Success criteria

- [ ] AI updates are safe, validated, and persisted.
- [ ] Response includes assistant message plus authoritative board state.

## Part 10: Sidebar AI chat UI

### Scope

- [ ] Add sidebar chat interface in frontend.
- [ ] Render conversation history and loading/error states.
- [ ] Send user messages to backend AI chat endpoint.
- [ ] Apply returned board updates and refresh UI automatically.
- [ ] Preserve responsive behavior on desktop and mobile.

### Tests/checks

- [ ] Component tests for sidebar interaction states.
- [ ] Integration tests for API request/response mapping.
- [ ] E2E test for AI conversation and board mutation refresh.

### Success criteria

- [ ] User can chat and see consistent responses.
- [ ] Board visibly updates after AI-authorized changes.

## Out of scope for MVP

- Multi-board UI.
- Real production auth providers.
- Streaming token UI.
- Cloud deployment automation.

## Approval gates

- [ ] Gate A: approve Part 1 outputs before Part 2 starts.
- [ ] Gate B: approve database design in Part 5 before Part 6 starts.
