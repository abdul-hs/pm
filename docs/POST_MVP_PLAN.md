# Post-MVP Execution Plan

This document is the working plan for evolving this project from MVP into a production-ready product.

## Purpose

Use this as the default execution guide after Parts 1-10 are complete.  
Work one phase at a time. Do not start the next phase until the current phase has:

1. Scope implemented
2. Required checks completed
3. Success criteria confirmed
4. User sign-off

## Product target (post-MVP)

Move from:

- Single user
- One board per user
- Local-first demo architecture

To:

- Real accounts and teams
- Multiple projects and boards
- Role-based permissions
- Production database and deployment
- Operational visibility and security hardening

## Phase 1: Product model and permissions

### Scope

- Define core hierarchy: `Workspace -> Project -> Board -> Columns/Cards`.
- Define roles and permissions:
  - `owner`
  - `admin`
  - `member`
  - `viewer`
- Define AI permissions per role (what actions are allowed).
- Finalize UX expectations for board/project switching.

### Required checks

- Architecture decision notes approved.
- Permission matrix documented with examples.
- API contracts for project/board listing approved.

### Success criteria

- No ambiguous ownership/authorization rules remain.
- Data model and permission model are stable enough for implementation.

## Phase 2: Multi-board and project support

### Scope

- Replace single-board-per-user model with project + board entities.
- Add board listing, board creation, board rename/archive.
- Add project listing and project creation.
- Add frontend board/project switcher.

### Required checks

- Backend tests for CRUD and ownership boundaries.
- Frontend integration tests for switching projects/boards.
- E2E test for create -> switch -> edit -> persist flow.

### Success criteria

- Users can manage more than one board safely.
- Board state remains isolated by project and permissions.

## Phase 3: Real authentication and session hardening

### Scope

- Replace dummy credentials with real auth.
- Add password hashing and credential lifecycle controls.
- Add account registration/invite flow (as designed).
- Harden session behavior (expiry, rotation, revoke on logout).

### Required checks

- Auth unit tests for login/register/failure paths.
- Security tests for protected route access.
- E2E tests for auth lifecycle and session persistence.

### Success criteria

- Authentication is no longer hardcoded.
- Session behavior is predictable and secure.

## Phase 4: Collaboration and access control

### Scope

- Add project/board membership tables.
- Add invite/join/remove member flows.
- Enforce role-based permissions in all board and AI endpoints.
- Add UI for members and roles.

### Required checks

- Authorization tests across all role combinations.
- Negative tests for forbidden actions.
- E2E test for multi-user collaboration scenarios.

### Success criteria

- Permission enforcement is consistent across API and UI.
- Unauthorized actions are blocked with clear errors.

## Phase 5: Database migration to Postgres + migrations

### Scope

- Move persistence from SQLite to Postgres for production workloads.
- Add formal migrations (Alembic or equivalent).
- Keep local dev workflow simple with Docker Compose.
- Add backup/restore procedures.

### Required checks

- Migration tests from empty database and upgrade paths.
- Data integrity checks for board/chat data.
- Backup and restore dry-run validated.

### Success criteria

- Production-ready data layer with versioned schema changes.
- No manual DB changes required for normal releases.

## Phase 6: AI hardening and governance

### Scope

- Add AI action audit logs (who asked, what changed, when).
- Add request limits and abuse protection.
- Add safer AI failure handling and retries where sensible.
- Add policy controls for allowed AI action types.

### Required checks

- Tests for rejected/invalid AI actions.
- Tests for per-role AI permission enforcement.
- E2E tests for AI updates plus audit visibility.

### Success criteria

- AI behavior is observable, governed, and permission-aware.
- Failures do not silently corrupt board state.

## Phase 7: Production operations and security

### Scope

- Add structured logging and metrics.
- Add error tracking and alerting.
- Harden security:
  - CSRF protection
  - Secure cookie settings per environment
  - CORS policy
  - input/request limits
  - secret management
- Add rate limiting on key endpoints.

### Required checks

- Security regression tests for auth/session/CSRF.
- Operational smoke tests for health/readiness and alerts.
- Load tests for critical paths (auth, board save, AI chat).

### Success criteria

- Core operational and security controls are in place.
- Service behavior is measurable and debuggable in production.

## Phase 8: Delivery pipeline and release strategy

### Scope

- Create CI pipeline for lint/test/build.
- Add deployment workflow for dev/staging/prod.
- Add release checklist and rollback playbook.
- Define staged rollout strategy (internal -> pilot -> general).

### Required checks

- CI green on pull requests.
- Staging deployment and smoke checks pass.
- Rollback drill tested.

### Success criteria

- Reliable release process exists end to end.
- Team can deploy and recover with low risk.

## Global post-MVP quality gates

- Prefer meaningful tests over chasing raw coverage numbers.
- Maintain robust integration and e2e coverage for user-critical flows.
- Every phase must include:
  - API behavior tests
  - authorization tests (if relevant)
  - persistence tests (if relevant)
  - at least one end-to-end user flow

## Out of scope until explicitly approved

- Enterprise SSO and advanced IAM features
- Multi-region active-active topology
- Fine-grained analytics warehouse integration
- Mobile native apps

