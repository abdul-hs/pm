from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time
from typing import Annotated, Literal
from urllib import error as urllib_error
from urllib import request as urllib_request

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "static" / "frontend"
INDEX_FILE = FRONTEND_DIR / "index.html"
SESSION_COOKIE_NAME = "pm_session"
SESSION_TTL_DAYS = 7
VALID_USERNAME = "user"
VALID_PASSWORD = "password"
OPENROUTER_MODEL = "openai/gpt-oss-120b"
OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_TIMEOUT_SECONDS = 15
AI_CHAT_CONTEXT_LIMIT = 12
AI_CHAT_RETENTION_LIMIT = 50
DEFAULT_THEME_PREFERENCES = {
    "gradientStart": "#1c8fc5",
    "gradientMid": "#209dd7",
    "gradientEnd": "#2db6eb",
}
HEX_COLOR_PATTERN = r"^#[0-9a-fA-F]{6}$"

DEFAULT_BOARD_DATA = {
    "columns": [
        {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"]},
        {"id": "col-discovery", "title": "Discovery", "cardIds": ["card-3"]},
        {
            "id": "col-progress",
            "title": "In Progress",
            "cardIds": ["card-4", "card-5"],
        },
        {"id": "col-review", "title": "Review", "cardIds": ["card-6"]},
        {"id": "col-done", "title": "Done", "cardIds": ["card-7", "card-8"]},
    ],
    "cards": {
        "card-1": {
            "id": "card-1",
            "title": "Align roadmap themes",
            "details": "Draft quarterly themes with impact statements and metrics.",
        },
        "card-2": {
            "id": "card-2",
            "title": "Gather customer signals",
            "details": "Review support tags, sales notes, and churn feedback.",
        },
        "card-3": {
            "id": "card-3",
            "title": "Prototype analytics view",
            "details": "Sketch initial dashboard layout and key drill-downs.",
        },
        "card-4": {
            "id": "card-4",
            "title": "Refine status language",
            "details": "Standardize column labels and tone across the board.",
        },
        "card-5": {
            "id": "card-5",
            "title": "Design card layout",
            "details": "Add hierarchy and spacing for scanning dense lists.",
        },
        "card-6": {
            "id": "card-6",
            "title": "QA micro-interactions",
            "details": "Verify hover, focus, and loading states.",
        },
        "card-7": {
            "id": "card-7",
            "title": "Ship marketing page",
            "details": "Final copy approved and asset pack delivered.",
        },
        "card-8": {
            "id": "card-8",
            "title": "Close onboarding sprint",
            "details": "Document release notes and share internally.",
        },
    },
}


def _get_db_path() -> Path:
    custom_path = os.getenv("PM_DB_PATH")
    if custom_path:
        return Path(custom_path)
    return BASE_DIR / "data" / "pm.sqlite3"


def init_db() -> None:
    db_path = _get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS boards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                board_json TEXT NOT NULL,
                version INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                board_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_theme_preferences (
                user_id INTEGER PRIMARY KEY,
                gradient_start TEXT NOT NULL,
                gradient_mid TEXT NOT NULL,
                gradient_end TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
            ON sessions (expires_at)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_boards_user_id
            ON boards (user_id)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_chat_messages_board_created_at
            ON chat_messages (board_id, created_at)
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_user_theme_preferences_user_id
            ON user_theme_preferences (user_id)
            """
        )
        _seed_default_user_and_board(connection)
        _seed_default_theme_preferences(connection)
        connection.execute("PRAGMA user_version = 1")
        connection.commit()


def _connect_db() -> sqlite3.Connection:
    connection = sqlite3.connect(_get_db_path())
    connection.execute("PRAGMA foreign_keys = ON")
    connection.row_factory = sqlite3.Row
    return connection


def _seed_default_user_and_board(connection: sqlite3.Connection) -> None:
    now = datetime.now(timezone.utc).isoformat()
    connection.execute(
        """
        INSERT OR IGNORE INTO users (username, password, created_at)
        VALUES (?, ?, ?)
        """,
        (VALID_USERNAME, VALID_PASSWORD, now),
    )
    user_row = connection.execute(
        "SELECT id FROM users WHERE username = ?",
        (VALID_USERNAME,),
    ).fetchone()
    if not user_row:
        raise RuntimeError("Failed to seed default user.")

    user_id = int(user_row[0])
    connection.execute(
        """
        INSERT OR IGNORE INTO boards (user_id, board_json, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            user_id,
            json.dumps(DEFAULT_BOARD_DATA, separators=(",", ":")),
            1,
            now,
            now,
        ),
    )


def _seed_default_theme_preferences(connection: sqlite3.Connection) -> None:
    user_row = connection.execute(
        "SELECT id FROM users WHERE username = ?",
        (VALID_USERNAME,),
    ).fetchone()
    if not user_row:
        raise RuntimeError("Failed to seed default theme preferences user.")

    user_id = int(user_row[0])
    connection.execute(
        """
        INSERT OR IGNORE INTO user_theme_preferences (
            user_id,
            gradient_start,
            gradient_mid,
            gradient_end,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            user_id,
            DEFAULT_THEME_PREFERENCES["gradientStart"],
            DEFAULT_THEME_PREFERENCES["gradientMid"],
            DEFAULT_THEME_PREFERENCES["gradientEnd"],
            datetime.now(timezone.utc).isoformat(),
        ),
    )


def _cleanup_expired_sessions() -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _connect_db() as connection:
        connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
        connection.commit()


def _create_session(username: str) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=SESSION_TTL_DAYS)
    with _connect_db() as connection:
        connection.execute(
            """
            INSERT INTO sessions (token, username, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (token, username, now.isoformat(), expires_at.isoformat()),
        )
        connection.commit()
    return token


def _delete_session(token: str | None) -> None:
    if not token:
        return
    with _connect_db() as connection:
        connection.execute("DELETE FROM sessions WHERE token = ?", (token,))
        connection.commit()


def _get_authenticated_username(token: str | None) -> str | None:
    if not token:
        return None

    _cleanup_expired_sessions()
    with _connect_db() as connection:
        row = connection.execute(
            "SELECT username FROM sessions WHERE token = ?",
            (token,),
        ).fetchone()
    if not row:
        return None
    return str(row["username"])


def _validate_credentials(username: str, password: str) -> bool:
    with _connect_db() as connection:
        row = connection.execute(
            """
            SELECT 1
            FROM users
            WHERE username = ? AND password = ?
            """,
            (username, password),
        ).fetchone()
    return row is not None


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=SESSION_TTL_DAYS * 24 * 60 * 60,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
    )


def require_auth(request: Request) -> str:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    username = _get_authenticated_username(token)
    if not username:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return username


class LoginRequest(BaseModel):
    username: str
    password: str


class CardPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    title: str
    details: str


class ColumnPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    title: str
    cardIds: list[str]


class BoardPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    columns: list[ColumnPayload]
    cards: dict[str, CardPayload]

    @model_validator(mode="after")
    def validate_consistency(self) -> "BoardPayload":
        column_ids = [column.id for column in self.columns]
        if len(column_ids) != len(set(column_ids)):
            raise ValueError("Column ids must be unique.")

        card_ids_from_columns: list[str] = []
        for column in self.columns:
            card_ids_from_columns.extend(column.cardIds)

        if len(card_ids_from_columns) != len(set(card_ids_from_columns)):
            raise ValueError("A card can only appear in one column.")

        card_keys = set(self.cards.keys())
        card_id_values = {card.id for card in self.cards.values()}
        if card_keys != card_id_values:
            raise ValueError("Each card key must match the card object's id.")

        column_card_ids = set(card_ids_from_columns)
        if card_keys != column_card_ids:
            raise ValueError("Columns and cards must reference the same card ids.")

        return self


class KanbanUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    board: BoardPayload
    version: int = Field(ge=1)


class KanbanResponse(BaseModel):
    board: BoardPayload
    version: int


class ConflictDetail(BaseModel):
    message: str
    currentVersion: int


class ThemePreferencesPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    gradientStart: str = Field(pattern=HEX_COLOR_PATTERN)
    gradientMid: str = Field(pattern=HEX_COLOR_PATTERN)
    gradientEnd: str = Field(pattern=HEX_COLOR_PATTERN)


class ThemePreferencesResponse(ThemePreferencesPayload):
    pass


class AIPingResponse(BaseModel):
    ok: bool
    model: str
    answer: str
    latencyMs: int


class AIChatRequest(BaseModel):
    message: str = Field(min_length=1)


class RenameColumnAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["rename_column"]
    columnId: str = Field(min_length=1)
    title: str = Field(min_length=1)


class CreateCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["create_card"]
    columnId: str = Field(min_length=1)
    title: str = Field(min_length=1)
    details: str = ""


class UpdateCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["update_card"]
    cardId: str = Field(min_length=1)
    title: str | None = None
    details: str | None = None

    @model_validator(mode="after")
    def validate_update_fields(self) -> "UpdateCardAction":
        if self.title is None and self.details is None:
            raise ValueError("update_card requires title or details.")
        return self


class MoveCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["move_card"]
    cardId: str = Field(min_length=1)
    toColumnId: str = Field(min_length=1)
    beforeCardId: str | None = None


class DeleteCardAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["delete_card"]
    cardId: str = Field(min_length=1)


AIAction = Annotated[
    RenameColumnAction
    | CreateCardAction
    | UpdateCardAction
    | MoveCardAction
    | DeleteCardAction,
    Field(discriminator="type"),
]


class AIStructuredResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assistantMessage: str = Field(min_length=1)
    actions: list[AIAction] = Field(default_factory=list)


class AIChatResponse(BaseModel):
    assistantMessage: str
    board: BoardPayload
    version: int
    actionsApplied: int


def _get_user_id(connection: sqlite3.Connection, username: str) -> int:
    row = connection.execute(
        "SELECT id FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return int(row["id"])


def _fetch_board_row(connection: sqlite3.Connection, user_id: int) -> sqlite3.Row:
    row = connection.execute(
        """
        SELECT id, board_json, version
        FROM boards
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()
    if not row:
        now = datetime.now(timezone.utc).isoformat()
        connection.execute(
            """
            INSERT INTO boards (user_id, board_json, version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                user_id,
                json.dumps(DEFAULT_BOARD_DATA, separators=(",", ":")),
                1,
                now,
                now,
            ),
        )
        row = connection.execute(
            """
            SELECT id, board_json, version
            FROM boards
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()

    if not row:
        raise RuntimeError("Failed to resolve board row.")

    return row


def _load_board_payload(board_json: str) -> BoardPayload:
    try:
        parsed = json.loads(board_json)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=500, detail="Stored board JSON is invalid.") from error
    try:
        return BoardPayload.model_validate(parsed)
    except Exception as error:  # pragma: no cover - defensive path
        raise HTTPException(status_code=500, detail="Stored board shape is invalid.") from error


def _get_board_for_user(username: str) -> KanbanResponse:
    with _connect_db() as connection:
        user_id = _get_user_id(connection, username)
        row = _fetch_board_row(connection, user_id)
        connection.commit()

    board = _load_board_payload(str(row["board_json"]))
    return KanbanResponse(board=board, version=int(row["version"]))


def _normalize_hex_color(value: str) -> str:
    normalized = value.strip().lower()
    if not re.fullmatch(HEX_COLOR_PATTERN, normalized):
        raise HTTPException(status_code=422, detail="Theme colors must be valid hex values.")
    return normalized


def _ensure_theme_row(connection: sqlite3.Connection, user_id: int) -> None:
    row = connection.execute(
        """
        SELECT user_id
        FROM user_theme_preferences
        WHERE user_id = ?
        """,
        (user_id,),
    ).fetchone()
    if row:
        return

    connection.execute(
        """
        INSERT INTO user_theme_preferences (
            user_id,
            gradient_start,
            gradient_mid,
            gradient_end,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            user_id,
            DEFAULT_THEME_PREFERENCES["gradientStart"],
            DEFAULT_THEME_PREFERENCES["gradientMid"],
            DEFAULT_THEME_PREFERENCES["gradientEnd"],
            datetime.now(timezone.utc).isoformat(),
        ),
    )


def _row_to_theme_response(row: sqlite3.Row) -> ThemePreferencesResponse:
    return ThemePreferencesResponse(
        gradientStart=str(row["gradient_start"]),
        gradientMid=str(row["gradient_mid"]),
        gradientEnd=str(row["gradient_end"]),
    )


def _get_theme_for_user(username: str) -> ThemePreferencesResponse:
    with _connect_db() as connection:
        user_id = _get_user_id(connection, username)
        _ensure_theme_row(connection, user_id)
        row = connection.execute(
            """
            SELECT gradient_start, gradient_mid, gradient_end
            FROM user_theme_preferences
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()
        connection.commit()

    if not row:
        raise RuntimeError("Failed to resolve theme preferences.")
    return _row_to_theme_response(row)


def _save_theme_for_user(
    username: str, payload: ThemePreferencesPayload
) -> ThemePreferencesResponse:
    gradient_start = _normalize_hex_color(payload.gradientStart)
    gradient_mid = _normalize_hex_color(payload.gradientMid)
    gradient_end = _normalize_hex_color(payload.gradientEnd)

    with _connect_db() as connection:
        user_id = _get_user_id(connection, username)
        _ensure_theme_row(connection, user_id)
        connection.execute(
            """
            UPDATE user_theme_preferences
            SET gradient_start = ?,
                gradient_mid = ?,
                gradient_end = ?,
                updated_at = ?
            WHERE user_id = ?
            """,
            (
                gradient_start,
                gradient_mid,
                gradient_end,
                datetime.now(timezone.utc).isoformat(),
                user_id,
            ),
        )
        row = connection.execute(
            """
            SELECT gradient_start, gradient_mid, gradient_end
            FROM user_theme_preferences
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()
        connection.commit()

    if not row:
        raise RuntimeError("Failed to save theme preferences.")
    return _row_to_theme_response(row)


def _save_board_for_user(
    username: str, board: BoardPayload, expected_version: int
) -> KanbanResponse:
    board_json = json.dumps(board.model_dump(mode="json"), separators=(",", ":"))
    now = datetime.now(timezone.utc).isoformat()

    with _connect_db() as connection:
        user_id = _get_user_id(connection, username)
        row = _fetch_board_row(connection, user_id)
        current_version = int(row["version"])
        if expected_version != current_version:
            raise HTTPException(
                status_code=409,
                detail=ConflictDetail(
                    message="Board version conflict.",
                    currentVersion=current_version,
                ).model_dump(),
            )

        update_result = connection.execute(
            """
            UPDATE boards
            SET board_json = ?, version = version + 1, updated_at = ?
            WHERE user_id = ? AND version = ?
            """,
            (board_json, now, user_id, expected_version),
        )
        if update_result.rowcount != 1:
            latest = _fetch_board_row(connection, user_id)
            raise HTTPException(
                status_code=409,
                detail=ConflictDetail(
                    message="Board version conflict.",
                    currentVersion=int(latest["version"]),
                ).model_dump(),
            )

        updated_row = _fetch_board_row(connection, user_id)
        connection.commit()

    return KanbanResponse(board=_load_board_payload(board_json), version=int(updated_row["version"]))


def _load_chat_history(
    connection: sqlite3.Connection, board_id: int, limit: int
) -> list[dict[str, str]]:
    rows = connection.execute(
        """
        SELECT role, content
        FROM chat_messages
        WHERE board_id = ?
        ORDER BY id DESC
        LIMIT ?
        """,
        (board_id, limit),
    ).fetchall()
    history = [{"role": str(row["role"]), "content": str(row["content"])} for row in rows]
    history.reverse()
    return history


def _append_chat_message(
    connection: sqlite3.Connection, board_id: int, user_id: int, role: str, content: str
) -> None:
    connection.execute(
        """
        INSERT INTO chat_messages (board_id, user_id, role, content, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (board_id, user_id, role, content, datetime.now(timezone.utc).isoformat()),
    )


def _trim_chat_history(connection: sqlite3.Connection, board_id: int, keep: int) -> None:
    connection.execute(
        """
        DELETE FROM chat_messages
        WHERE board_id = ?
          AND id NOT IN (
            SELECT id
            FROM chat_messages
            WHERE board_id = ?
            ORDER BY id DESC
            LIMIT ?
          )
        """,
        (board_id, board_id, keep),
    )


def _parse_ai_structured_output(raw_response: str) -> AIStructuredResponse:
    raw_text = raw_response.strip()
    if not raw_text:
        raise HTTPException(status_code=502, detail="OpenRouter returned an empty response.")

    payload: dict
    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        json_match = re.search(r"\{[\s\S]*\}", raw_text)
        if not json_match:
            raise HTTPException(
                status_code=502,
                detail="AI returned non-JSON output.",
            )
        try:
            parsed = json.loads(json_match.group(0))
        except json.JSONDecodeError as error:
            raise HTTPException(
                status_code=502,
                detail="AI returned invalid JSON output.",
            ) from error

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="AI output JSON must be an object.")
    payload = parsed

    try:
        return AIStructuredResponse.model_validate(payload)
    except ValidationError as error:
        raise HTTPException(
            status_code=502,
            detail=f"AI structured output failed validation: {error.errors()[0]['msg']}",
        ) from error


def _find_column_by_id(columns: list[dict], column_id: str) -> dict | None:
    for column in columns:
        if column["id"] == column_id:
            return column
    return None


def _find_column_containing_card(columns: list[dict], card_id: str) -> dict | None:
    for column in columns:
        if card_id in column["cardIds"]:
            return column
    return None


def _generate_card_id(cards: dict[str, dict]) -> str:
    for _ in range(5):
        candidate = f"card-{secrets.token_hex(6)}"
        if candidate not in cards:
            return candidate
    raise HTTPException(status_code=500, detail="Failed to allocate unique card id.")


def _apply_ai_actions(board: BoardPayload, actions: list[AIAction]) -> BoardPayload:
    board_data = board.model_dump(mode="python")
    columns = board_data["columns"]
    cards = board_data["cards"]

    for action in actions:
        if isinstance(action, RenameColumnAction):
            column = _find_column_by_id(columns, action.columnId)
            if not column:
                raise HTTPException(
                    status_code=502,
                    detail=f"AI action failed: unknown column '{action.columnId}'.",
                )
            column["title"] = action.title.strip()
            continue

        if isinstance(action, CreateCardAction):
            column = _find_column_by_id(columns, action.columnId)
            if not column:
                raise HTTPException(
                    status_code=502,
                    detail=f"AI action failed: unknown column '{action.columnId}'.",
                )
            title = action.title.strip()
            if not title:
                raise HTTPException(status_code=502, detail="AI action failed: card title is empty.")
            card_id = _generate_card_id(cards)
            details = action.details.strip() or "No details yet."
            cards[card_id] = {"id": card_id, "title": title, "details": details}
            column["cardIds"].append(card_id)
            continue

        if isinstance(action, UpdateCardAction):
            card = cards.get(action.cardId)
            if not card:
                raise HTTPException(
                    status_code=502,
                    detail=f"AI action failed: unknown card '{action.cardId}'.",
                )
            if action.title is not None:
                title = action.title.strip()
                if not title:
                    raise HTTPException(
                        status_code=502, detail="AI action failed: updated title is empty."
                    )
                card["title"] = title
            if action.details is not None:
                card["details"] = action.details.strip() or "No details yet."
            continue

        if isinstance(action, MoveCardAction):
            if action.cardId not in cards:
                raise HTTPException(
                    status_code=502,
                    detail=f"AI action failed: unknown card '{action.cardId}'.",
                )
            source_column = _find_column_containing_card(columns, action.cardId)
            target_column = _find_column_by_id(columns, action.toColumnId)
            if not source_column or not target_column:
                raise HTTPException(status_code=502, detail="AI action failed: invalid move target.")

            source_column["cardIds"] = [
                card_id for card_id in source_column["cardIds"] if card_id != action.cardId
            ]

            before_card_id = action.beforeCardId
            if before_card_id and before_card_id == action.cardId:
                before_card_id = None

            if before_card_id:
                if before_card_id not in target_column["cardIds"]:
                    raise HTTPException(
                        status_code=502,
                        detail=f"AI action failed: beforeCardId '{before_card_id}' is invalid.",
                    )
                insert_index = target_column["cardIds"].index(before_card_id)
                target_column["cardIds"].insert(insert_index, action.cardId)
            else:
                target_column["cardIds"].append(action.cardId)
            continue

        if isinstance(action, DeleteCardAction):
            if action.cardId not in cards:
                raise HTTPException(
                    status_code=502,
                    detail=f"AI action failed: unknown card '{action.cardId}'.",
                )
            del cards[action.cardId]
            for column in columns:
                column["cardIds"] = [
                    card_id for card_id in column["cardIds"] if card_id != action.cardId
                ]
            continue

    try:
        return BoardPayload.model_validate({"columns": columns, "cards": cards})
    except ValidationError as error:
        raise HTTPException(
            status_code=502,
            detail=f"AI action result failed board validation: {error.errors()[0]['msg']}",
        ) from error


def _build_ai_chat_messages(
    board: BoardPayload, user_message: str, history: list[dict[str, str]]
) -> list[dict[str, str]]:
    system_prompt = (
        "You are a kanban assistant. Return only JSON with keys assistantMessage and actions. "
        "Actions must be an array of objects with one of these types: "
        "rename_column {type,columnId,title}, "
        "create_card {type,columnId,title,details}, "
        "update_card {type,cardId,title?,details?}, "
        "move_card {type,cardId,toColumnId,beforeCardId?}, "
        "delete_card {type,cardId}. "
        "Do not include markdown, code fences, or extra keys."
    )
    board_context = json.dumps(board.model_dump(mode="json"), separators=(",", ":"))

    messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt},
        {
            "role": "system",
            "content": f"Current board JSON (authoritative): {board_context}",
        },
    ]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})
    return messages


def _extract_message_content(payload: dict) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise HTTPException(status_code=502, detail="OpenRouter response did not include choices.")

    first_choice = choices[0]
    if not isinstance(first_choice, dict):
        raise HTTPException(status_code=502, detail="OpenRouter response format was invalid.")

    message = first_choice.get("message")
    if not isinstance(message, dict):
        raise HTTPException(status_code=502, detail="OpenRouter response message was missing.")

    content = message.get("content")
    if isinstance(content, str):
        normalized = content.strip()
        if normalized:
            return normalized

    if isinstance(content, list):
        chunks: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                text = item.get("text")
                if isinstance(text, str):
                    stripped = text.strip()
                    if stripped:
                        chunks.append(stripped)
        if chunks:
            return " ".join(chunks)

    raise HTTPException(status_code=502, detail="OpenRouter response content was empty.")


def _is_ping_answer_valid(answer: str) -> bool:
    normalized = answer.strip().lower().strip(".!")
    if normalized == "4":
        return True
    if normalized == "four":
        return True
    return bool(re.fullmatch(r"\s*4\s*", answer))


def _call_openrouter_messages(api_key: str, messages: list[dict[str, str]]) -> str:
    request_payload = {
        "model": OPENROUTER_MODEL,
        "messages": messages,
        "temperature": 0,
    }
    encoded_payload = json.dumps(request_payload).encode("utf-8")

    request_obj = urllib_request.Request(
        OPENROUTER_CHAT_URL,
        data=encoded_payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib_request.urlopen(
            request_obj, timeout=OPENROUTER_TIMEOUT_SECONDS
        ) as response:
            raw_body = response.read().decode("utf-8")
    except urllib_error.HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"OpenRouter returned HTTP {error.code}.",
        ) from error
    except urllib_error.URLError as error:
        reason = error.reason
        if isinstance(reason, TimeoutError):
            raise HTTPException(
                status_code=504, detail="OpenRouter request timed out."
            ) from error
        raise HTTPException(
            status_code=502, detail="OpenRouter request failed."
        ) from error
    except TimeoutError as error:
        raise HTTPException(
            status_code=504, detail="OpenRouter request timed out."
        ) from error

    try:
        response_payload = json.loads(raw_body)
    except json.JSONDecodeError as error:
        raise HTTPException(
            status_code=502, detail="OpenRouter returned invalid JSON."
        ) from error

    if not isinstance(response_payload, dict):
        raise HTTPException(status_code=502, detail="OpenRouter response was not an object.")

    return _extract_message_content(response_payload)


def _call_openrouter_chat(api_key: str, prompt: str) -> str:
    return _call_openrouter_messages(
        api_key=api_key,
        messages=[{"role": "user", "content": prompt}],
    )


def _run_openrouter_ping(api_key: str) -> str:
    prompt = "What is 2+2? Reply with only the number."
    return _call_openrouter_chat(api_key=api_key, prompt=prompt)


def _run_openrouter_ai_chat(
    api_key: str, board: BoardPayload, user_message: str, history: list[dict[str, str]]
) -> str:
    messages = _build_ai_chat_messages(board=board, user_message=user_message, history=history)
    return _call_openrouter_messages(api_key=api_key, messages=messages)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    _cleanup_expired_sessions()
    yield


app = FastAPI(
    title="Project Management MVP Backend", version="0.1.0", lifespan=lifespan
)


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/hello")
def hello(username: str = Depends(require_auth)) -> dict[str, str]:
    return {"message": "Hello from FastAPI", "user": username}


@app.post("/api/auth/login", status_code=204)
def login(payload: LoginRequest) -> Response:
    username = payload.username.strip()
    if not _validate_credentials(username, payload.password):
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    token = _create_session(username)
    response = Response(status_code=204)
    _set_session_cookie(response, token)
    return response


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request) -> Response:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    _delete_session(token)

    response = Response(status_code=204)
    _clear_session_cookie(response)
    return response


@app.get("/api/auth/me")
def me(request: Request) -> dict[str, str | bool]:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    username = _get_authenticated_username(token)
    if not username:
        return {"authenticated": False}
    return {"authenticated": True, "username": username}


@app.get("/api/theme", response_model=ThemePreferencesResponse)
def get_theme(username: str = Depends(require_auth)) -> ThemePreferencesResponse:
    return _get_theme_for_user(username)


@app.put("/api/theme", response_model=ThemePreferencesResponse)
def update_theme(
    payload: ThemePreferencesPayload, username: str = Depends(require_auth)
) -> ThemePreferencesResponse:
    return _save_theme_for_user(username, payload)


@app.get("/api/kanban", response_model=KanbanResponse)
def get_kanban(username: str = Depends(require_auth)) -> KanbanResponse:
    return _get_board_for_user(username)


@app.put("/api/kanban", response_model=KanbanResponse)
def update_kanban(
    payload: KanbanUpdateRequest, username: str = Depends(require_auth)
) -> KanbanResponse:
    return _save_board_for_user(username, payload.board, payload.version)


@app.post("/api/ai/ping", response_model=AIPingResponse)
def ai_ping(_: str = Depends(require_auth)) -> AIPingResponse:
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY is not configured.")

    started_at = time.perf_counter()
    answer = _run_openrouter_ping(api_key)
    latency_ms = int((time.perf_counter() - started_at) * 1000)

    if not _is_ping_answer_valid(answer):
        raise HTTPException(
            status_code=502,
            detail="OpenRouter connectivity check returned an unexpected answer.",
        )

    return AIPingResponse(
        ok=True,
        model=OPENROUTER_MODEL,
        answer=answer.strip(),
        latencyMs=latency_ms,
    )


@app.post("/api/ai/chat", response_model=AIChatResponse)
def ai_chat(payload: AIChatRequest, username: str = Depends(require_auth)) -> AIChatResponse:
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY is not configured.")

    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail="Message must not be empty.")

    with _connect_db() as connection:
        user_id = _get_user_id(connection, username)
        board_row = _fetch_board_row(connection, user_id)
        board_id = int(board_row["id"])
        original_version = int(board_row["version"])
        board = _load_board_payload(str(board_row["board_json"]))
        history = _load_chat_history(connection, board_id, AI_CHAT_CONTEXT_LIMIT)

    raw_ai_response = _run_openrouter_ai_chat(
        api_key=api_key,
        board=board,
        user_message=message,
        history=history,
    )
    structured = _parse_ai_structured_output(raw_ai_response)
    updated_board = _apply_ai_actions(board, structured.actions)

    original_board_json = json.dumps(board.model_dump(mode="json"), separators=(",", ":"))
    updated_board_json = json.dumps(
        updated_board.model_dump(mode="json"), separators=(",", ":")
    )
    board_changed = original_board_json != updated_board_json

    with _connect_db() as connection:
        user_id = _get_user_id(connection, username)
        latest_row = _fetch_board_row(connection, user_id)
        latest_board_id = int(latest_row["id"])
        latest_version = int(latest_row["version"])

        if latest_version != original_version:
            raise HTTPException(
                status_code=409,
                detail=ConflictDetail(
                    message="Board changed while processing AI request.",
                    currentVersion=latest_version,
                ).model_dump(),
            )

        if board_changed:
            update_result = connection.execute(
                """
                UPDATE boards
                SET board_json = ?, version = version + 1, updated_at = ?
                WHERE user_id = ? AND version = ?
                """,
                (
                    updated_board_json,
                    datetime.now(timezone.utc).isoformat(),
                    user_id,
                    latest_version,
                ),
            )
            if update_result.rowcount != 1:
                fresh_row = _fetch_board_row(connection, user_id)
                raise HTTPException(
                    status_code=409,
                    detail=ConflictDetail(
                        message="Board changed while processing AI request.",
                        currentVersion=int(fresh_row["version"]),
                    ).model_dump(),
                )
            next_version = latest_version + 1
        else:
            next_version = latest_version

        _append_chat_message(
            connection=connection,
            board_id=latest_board_id,
            user_id=user_id,
            role="user",
            content=message,
        )
        _append_chat_message(
            connection=connection,
            board_id=latest_board_id,
            user_id=user_id,
            role="assistant",
            content=structured.assistantMessage.strip(),
        )
        _trim_chat_history(
            connection=connection,
            board_id=latest_board_id,
            keep=AI_CHAT_RETENTION_LIMIT,
        )
        connection.commit()

    return AIChatResponse(
        assistantMessage=structured.assistantMessage.strip(),
        board=updated_board,
        version=next_version,
        actionsApplied=len(structured.actions),
    )


def _resolve_frontend_path(request_path: str) -> Path:
    requested_file = (FRONTEND_DIR / request_path).resolve()
    frontend_root = FRONTEND_DIR.resolve()
    try:
        requested_file.relative_to(frontend_root)
    except ValueError as error:
        raise HTTPException(status_code=404, detail="Not found") from error
    return requested_file


def _serve_frontend(request_path: str) -> FileResponse:
    if not INDEX_FILE.exists():
        raise HTTPException(
            status_code=503,
            detail="Frontend build is missing in backend/static/frontend.",
        )

    if request_path:
        requested_file = _resolve_frontend_path(request_path)
        if requested_file.is_file():
            return FileResponse(requested_file)

    return FileResponse(INDEX_FILE)


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return _serve_frontend("")


@app.get("/{full_path:path}", include_in_schema=False)
def frontend_app(full_path: str) -> FileResponse:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    return _serve_frontend(full_path)
