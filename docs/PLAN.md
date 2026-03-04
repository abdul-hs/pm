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

- Frontend unit coverage target: ~80% when it reflects meaningful test quality.
- Backend unit coverage target: ~80% when it reflects meaningful test quality.
- Do not add low-value tests just to hit a numeric threshold.
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

## Beyond MVP

For post-MVP implementation phases, use `docs/POST_MVP_PLAN.md`.

## Part 1: Planning Docs

### Scope

- [x] Expand this `docs/PLAN.md` into a detailed plan with checklist steps, tests, and success criteria for Parts 1-10.
- [x] Create `frontend/AGENTS.md` documenting the current frontend code.
- [x] Ensure plan includes approval gate before implementation continues.

### Tests/checks

- [x] Verify referenced paths exist:
  - `frontend/`
  - `backend/`
  - `scripts/`
  - `docs/`
- [x] Verify currently referenced frontend commands exist in `frontend/package.json`:
  - `npm run dev`
  - `npm run build`
  - `npm run test:unit`
  - `npm run test:e2e`

### Success criteria

- [x] User has reviewed and approved Part 1 outputs.
- [x] `docs/PLAN.md` is implementation-ready.
- [x] `frontend/AGENTS.md` accurately describes current frontend code.

## Part 2: Scaffolding

### Scope

- [x] Create FastAPI backend scaffold in `backend/`.
- [x] Add Python project/dependencies using `uv`.
- [x] Add `Dockerfile` and `docker-compose.yml`.
- [x] Add cross-platform start/stop scripts in `scripts/`.
- [x] Serve temporary static hello page at `/`.
- [x] Add hello API endpoint (for example `/api/hello`).

### Tests/checks

- [x] Build container image successfully.
- [x] Start stack using start script.
- [x] Confirm `GET /` returns hello HTML.
- [x] Confirm `GET /api/hello` returns JSON.
- [x] Confirm stop script fully stops stack.

### Success criteria

- [x] Local Docker run works end to end.
- [x] Backend app and static serving baseline are proven.

## Part 3: Serve real frontend

### Scope

- [x] Build frontend statically and include artifacts in backend image.
- [x] Serve built frontend from FastAPI at `/`.
- [x] Remove temporary hello page route for `/`.
- [x] Keep API routes under `/api/*`.
- [x] Enforce frontend unit coverage threshold >= 80%.

### Tests/checks

- [x] `npm run test:unit` passes with coverage threshold.
- [x] `npm run test:e2e` passes.
- [x] Docker run serves Kanban UI at `/`.
- [x] API endpoints remain accessible.

### Success criteria

- [x] Kanban demo is loaded from backend-served static assets.
- [x] Coverage gate is enforced, not just reported.

## Part 4: Dummy sign in

### Scope

- [x] Add backend login/logout/me routes.
- [x] Add backend session storage in SQLite.
- [x] Protect Kanban and protected APIs behind auth.
- [x] Add frontend login screen and logout action.
- [x] Persist login across page refresh with session cookie.

### Tests/checks

- [x] Backend auth route tests (valid login, invalid login, logout).
- [x] Backend protected-route tests (authorized vs unauthorized).
- [x] Frontend unit/integration tests for login UX.
- [x] E2E test for login -> board access -> logout.

### Success criteria

- [x] Anonymous user cannot use protected resources.
- [x] Logged-in user can access board and keep session on refresh.

## Part 5: Database modeling

### Scope

- [x] Propose and document database schema in `docs/DATABASE.md`.
- [x] Include tables for users, sessions, boards, and chat messages.
- [x] Store board as canonical JSON in boards table.
- [x] Include board `version`, created/updated timestamps.
- [x] Document DB initialization and migration approach.
- [x] Get explicit user sign-off before Part 6.

### Tests/checks

- [x] Schema creation tests.
- [x] Startup "create if missing" DB tests.
- [x] Seed/default user and board initialization tests.

### Success criteria

- [x] Data model is documented and approved.
- [x] Schema supports upcoming Parts 6-10 without redesign.

## Part 6: Backend Kanban API

### Scope

- [x] Implement protected read endpoint for board data.
- [x] Implement protected write endpoint for board data.
- [x] Add board payload validation.
- [x] Add optimistic version checks and `409 Conflict` handling.
- [x] Ensure DB auto-creates on startup when absent.

### Tests/checks

- [x] Unit tests for validation and repository logic.
- [x] Integration tests for read/write API behavior.
- [x] Tests for stale write conflict path.
- [x] Tests for unauthenticated request rejection.

### Success criteria

- [x] Backend owns and persists board state correctly.
- [x] Conflict behavior is deterministic and tested.

## Part 7: Frontend + backend persistence

### Scope

- [x] Replace in-memory board state initialization with backend fetch.
- [x] Save rename/add/delete/move actions to backend.
- [x] Handle save failures and stale version conflicts.
- [x] Keep current Kanban UX behavior and layout.

### Tests/checks

- [x] Frontend integration tests with API mocking.
- [x] E2E tests for board edits and persistence after refresh.
- [ ] E2E test for persistence after container restart.

### Success criteria

- [x] Board data is truly persistent, not demo-only.
- [x] User interactions remain smooth and predictable.

## Part 8: OpenRouter connectivity

### Scope

- [x] Add backend OpenRouter client using `OPENROUTER_API_KEY`.
- [x] Use model `openai/gpt-oss-120b`.
- [x] Add connectivity endpoint that verifies simple prompt (`2+2`).
- [x] Add robust timeout/error mapping.

### Tests/checks

- [x] Unit tests with mocked OpenRouter responses.
- [x] Failure tests for timeout and non-200 response handling.
- [ ] Live smoke test with configured API key.

### Success criteria

- [ ] Backend can reach OpenRouter successfully from local run.
- [x] Failures are surfaced with clear API errors.

## Part 9: Structured AI actions

### Scope

- [x] Build AI chat endpoint that sends board JSON + user question + history.
- [x] Define strict structured output schema.
- [x] Parse and validate AI actions before applying.
- [x] Apply allowed actions (create/edit/move/delete card, rename column).
- [x] Persist board and chat history atomically.

### Tests/checks

- [x] Structured output schema validation tests.
- [x] Action-application tests (including invalid action rejection).
- [x] Persistence tests for board and chat updates.
- [x] Regression tests for non-mutating AI response path.

### Success criteria

- [x] AI updates are safe, validated, and persisted.
- [x] Response includes assistant message plus authoritative board state.

## Part 10: Sidebar AI chat UI

### Scope

- [x] Add sidebar chat interface in frontend.
- [x] Render conversation history and loading/error states.
- [x] Send user messages to backend AI chat endpoint.
- [x] Apply returned board updates and refresh UI automatically.
- [x] Preserve responsive behavior on desktop and mobile.

### Tests/checks

- [x] Component tests for sidebar interaction states.
- [x] Integration tests for API request/response mapping.
- [x] E2E test for AI conversation and board mutation refresh.

### Success criteria

- [x] User can chat and see consistent responses.
- [x] Board visibly updates after AI-authorized changes.

## Out of scope for MVP

- Multi-board UI.
- Real production auth providers.
- Streaming token UI.
- Cloud deployment automation.

## Approval gates

- [x] Gate A: approve Part 1 outputs before Part 2 starts.
- [x] Gate B: approve database design in Part 5 before Part 6 starts.
