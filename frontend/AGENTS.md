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

- Single-page Kanban board rendered at `/`.
- Five fixed columns are seeded from `src/lib/kanban.ts`.
- User can:
  - rename column titles
  - add a card
  - delete a card
  - drag cards within and across columns
- State is frontend-local only (not persisted yet).

## Key file map

- `src/app/page.tsx`: top-level page entry, renders `KanbanBoard`.
- `src/app/layout.tsx`: root layout and font setup.
- `src/app/globals.css`: design tokens and global styles.
- `src/lib/kanban.ts`: core board types, initial data, `moveCard`, ID generation.
- `src/components/KanbanBoard.tsx`: main state container and DnD wiring.
- `src/components/KanbanColumn.tsx`: column shell and card list.
- `src/components/KanbanCard.tsx`: sortable card UI.
- `src/components/NewCardForm.tsx`: add-card interaction.
- `src/components/KanbanCardPreview.tsx`: drag overlay preview.

## Testing map

- Unit tests:
  - `src/lib/kanban.test.ts`
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

- No authentication UI.
- No backend data persistence.
- No AI chat sidebar yet.
