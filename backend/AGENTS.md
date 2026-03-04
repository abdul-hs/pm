# Backend Agent Guide

## Purpose

This folder contains the FastAPI backend for the Project Management MVP.

## Current state (Part 9)

- FastAPI app entrypoint: `backend/app/main.py`
- Built frontend is served at `/` from `backend/static/frontend/`
- Session auth via SQLite + `HttpOnly` cookie (`pm_session`)
- Database schema includes `users`, `sessions`, `boards`, and `chat_messages`
- A default seeded board JSON exists for default user `user`
- API endpoints:
  - `GET /api/health`
  - `GET /api/hello` (auth required)
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
  - `GET /api/kanban` (auth required)
  - `PUT /api/kanban` (auth required, optimistic versioning)
  - `POST /api/ai/ping` (auth required, OpenRouter connectivity check)
  - `POST /api/ai/chat` (auth required, structured AI actions + persistence)
- Python project/dependencies managed with `uv` via `backend/pyproject.toml`

## Conventions

- Keep API routes under `/api/*`.
- Keep root route (`/`) for frontend app entry + SPA fallback.
- Keep auth checks server-side (cookie + DB session lookup).
- Keep backend tests in `backend/tests/`.
- Prefer simple function-based routes unless complexity requires routers/services.
