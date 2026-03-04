# Database Design (Part 5)

## Overview

This MVP uses a local SQLite database. The database file is created automatically if missing.

- Default path: `backend/data/pm.sqlite3`
- Override path with env var: `PM_DB_PATH`

The schema is designed for:

- one user-facing MVP credential now (`user` / `password`)
- future multi-user support
- one board per user (for MVP)
- board stored as canonical JSON
- persisted chat history for future AI features

## Schema summary

### `users`

- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `username` TEXT NOT NULL UNIQUE
- `password` TEXT NOT NULL
- `created_at` TEXT NOT NULL

Purpose:

- stores application users
- currently seeded with one MVP user (`user` / `password`)

### `sessions`

- `token` TEXT PRIMARY KEY
- `username` TEXT NOT NULL
- `created_at` TEXT NOT NULL
- `expires_at` TEXT NOT NULL

Index:

- `idx_sessions_expires_at` on `expires_at`

Purpose:

- stores session cookies for login state
- supports expiry cleanup

### `boards`

- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `user_id` INTEGER NOT NULL UNIQUE
- `board_json` TEXT NOT NULL
- `version` INTEGER NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- FK `user_id -> users(id)` with `ON DELETE CASCADE`

Index:

- `idx_boards_user_id` on `user_id`

Purpose:

- stores one canonical board JSON document per user
- includes optimistic update version field

### `chat_messages`

- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `board_id` INTEGER NOT NULL
- `user_id` INTEGER NOT NULL
- `role` TEXT NOT NULL CHECK IN (`system`, `user`, `assistant`)
- `content` TEXT NOT NULL
- `created_at` TEXT NOT NULL
- FK `board_id -> boards(id)` with `ON DELETE CASCADE`
- FK `user_id -> users(id)` with `ON DELETE CASCADE`

Index:

- `idx_chat_messages_board_created_at` on `(board_id, created_at)`

Purpose:

- persists conversation history for future AI flow

## Board JSON shape

`boards.board_json` stores the same structure used by frontend `BoardData`:

```json
{
  "columns": [
    { "id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"] }
  ],
  "cards": {
    "card-1": {
      "id": "card-1",
      "title": "Example",
      "details": "Example details"
    }
  }
}
```

This keeps backend and frontend data shapes aligned and avoids translation layers.

## Initialization and seeding

At startup:

1. Ensure database file exists.
2. Create tables/indexes if missing.
3. Seed default user if missing.
4. Seed default board for that user if missing.
5. Keep initialization idempotent (safe to run repeatedly).

Seed defaults:

- Username: `user`
- Password: `password`
- One initial board JSON with `version = 1`

## Migration approach

Current approach:

- `CREATE TABLE IF NOT EXISTS` for baseline schema.
- `PRAGMA user_version = 1` for schema version marker.

Future approach:

- introduce explicit versioned migration scripts (`v2`, `v3`, ...)
- run migrations incrementally based on `PRAGMA user_version`
- keep schema changes backward-safe where possible

## Security note (MVP scope)

For MVP simplicity, password is stored as plain text in SQLite.  
Before production usage, migrate to salted password hashing and stronger auth controls.
