# Frontend Agent Guide

## Purpose

This document describes the current frontend implementation so future changes are consistent and low-risk.

## Current stack

- Next.js App Router (`src/app`)
- React 19 + TypeScript
- Tailwind CSS v4
- Drag and drop via `@dnd-kit`
- Unit tests via Vitest + Testing Library
- E2E tests via Playwright

## Current behavior

- Auth gate rendered at `/` using backend session checks.
- On first visit, user must sign in with `user` / `password`.
- After sign-in, the Kanban board is rendered.
- User can log out and return to the sign-in screen.
- Board data is loaded from backend `GET /api/kanban`.
- Board edits are saved to backend `PUT /api/kanban` with optimistic versioning.
- Board layout is readability-first:
  - `<1280`: responsive stacked grid (1/2/3 columns by breakpoint)
  - `1280-1599`: horizontal board row with readable fixed-width columns and scroll
  - `>=1600`: full five-column desktop layout even when AI panel is open
- AI assistant opens from floating action button as a floating panel (not a permanent docked rail).
- AI chat messages are rendered in the panel with loading/error feedback.
- AI responses apply authoritative board snapshots from backend.
- User can:
  - rename column titles
  - add a card
  - delete a card
  - drag cards within and across columns
- On stale version conflicts (`409`), frontend reloads latest board snapshot.
- Save failures show retry action without discarding local edits.

## Key file map

- `src/app/page.tsx`: top-level page entry, renders `AuthKanbanApp`.
- `src/components/AuthKanbanApp.tsx`: auth check + sign-in/logout flow + Kanban render gate.
- `src/app/layout.tsx`: root layout and font setup.
- `src/app/globals.css`: design tokens (surfaces, shadows, column width, AI panel dimensions) and global styles.
- `src/lib/kanban.ts`: core board types, initial data, `moveCard`, ID generation.
- `src/lib/kanbanApi.ts`: board API client + conflict/unauthorized error mapping.
- `src/components/AiSidebar.tsx`: AI chat sidebar UI and message form.
- `src/components/KanbanBoard.tsx`: main state container and DnD wiring.
- `src/components/KanbanColumn.tsx`: column shell and card list.
- `src/components/KanbanCard.tsx`: sortable card UI.
- `src/components/NewCardForm.tsx`: add-card interaction.
- `src/components/KanbanCardPreview.tsx`: drag overlay preview.

## Testing map

- Unit tests:
  - `src/components/AuthKanbanApp.test.tsx`
  - `src/app/page.test.tsx`
  - `src/lib/kanban.test.ts`
  - `src/components/KanbanCardPreview.test.tsx`
  - `src/components/AiSidebar.test.tsx`
  - `src/components/KanbanBoard.test.tsx`
- E2E tests:
  - `tests/kanban.spec.ts`

## Commands

Run from `frontend/`:

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run test:all`

## Conventions for future edits

- Keep shared board shape aligned with backend contract:
  - `BoardData` with `columns`, `cards`, and per-column `cardIds`.
- Avoid changing component-level UX without matching tests.
- Prefer small focused components and pure helpers in `src/lib`.
- Preserve data-testid selectors used by existing tests.
- If behavior changes, update unit and e2e tests in the same milestone.

## Known limitations (current state)

- Auth is MVP-only fixed credentials, not real identity provider.
- No explicit offline queue/reconnect strategy beyond manual retry.
- AI chat history is not loaded from backend on initial page load (history starts when user chats in current UI session).
