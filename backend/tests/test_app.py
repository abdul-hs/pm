import io
import os
from pathlib import Path
import json
import sqlite3
import sys
from urllib import error as urllib_error

from fastapi.testclient import TestClient
import pytest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app import main


@pytest.fixture(autouse=True)
def isolated_db(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    db_path = tmp_path / "test.sqlite3"
    monkeypatch.setenv("PM_DB_PATH", str(db_path))
    main.init_db()


@pytest.fixture
def client() -> TestClient:
    with TestClient(main.app) as test_client:
        yield test_client


def login(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 204


def get_board(client: TestClient) -> dict:
    response = client.get("/api/kanban")
    assert response.status_code == 200
    return response.json()


def test_healthcheck(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_auth_me_is_false_when_not_logged_in(client: TestClient) -> None:
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json() == {"authenticated": False}


def test_login_rejects_invalid_credentials(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "wrong", "password": "credentials"},
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid credentials."}


def test_login_sets_session_cookie_and_auth_me(client: TestClient) -> None:
    login_response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert login_response.status_code == 204
    assert "pm_session=" in login_response.headers.get("set-cookie", "")

    me_response = client.get("/api/auth/me")
    assert me_response.status_code == 200
    assert me_response.json() == {"authenticated": True, "username": "user"}


def test_hello_requires_authentication(client: TestClient) -> None:
    unauthorized_response = client.get("/api/hello")
    assert unauthorized_response.status_code == 401
    assert unauthorized_response.json() == {"detail": "Authentication required."}

    client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    authorized_response = client.get("/api/hello")
    assert authorized_response.status_code == 200
    assert authorized_response.json() == {
        "message": "Hello from FastAPI",
        "user": "user",
    }


def test_logout_clears_session(client: TestClient) -> None:
    login(client)

    logout_response = client.post("/api/auth/logout")
    assert logout_response.status_code == 204

    me_response = client.get("/api/auth/me")
    assert me_response.status_code == 200
    assert me_response.json() == {"authenticated": False}


def test_root_returns_503_when_frontend_build_missing(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    missing_dir = tmp_path / "missing-frontend"
    monkeypatch.setattr(main, "FRONTEND_DIR", missing_dir)
    monkeypatch.setattr(main, "INDEX_FILE", missing_dir / "index.html")

    response = client.get("/")
    assert response.status_code == 503
    assert response.json() == {
        "detail": "Frontend build is missing in backend/static/frontend."
    }


def test_frontend_asset_and_spa_fallback(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    frontend_dir = tmp_path / "frontend"
    frontend_dir.mkdir(parents=True, exist_ok=True)
    index_file = frontend_dir / "index.html"
    index_file.write_text("<html><body><h1>Kanban Studio</h1></body></html>")
    asset_file = frontend_dir / "app.js"
    asset_file.write_text("console.log('ok');")

    monkeypatch.setattr(main, "FRONTEND_DIR", frontend_dir)
    monkeypatch.setattr(main, "INDEX_FILE", index_file)

    asset_response = client.get("/app.js")
    assert asset_response.status_code == 200
    assert "console.log('ok');" in asset_response.text

    fallback_response = client.get("/deep/client/path")
    assert fallback_response.status_code == 200
    assert "Kanban Studio" in fallback_response.text


def test_api_paths_do_not_use_spa_fallback(client: TestClient) -> None:
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404


def test_schema_tables_exist() -> None:
    db_path = main._get_db_path()
    with sqlite3.connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
            """
        ).fetchall()
    table_names = {row[0] for row in rows}
    assert {
        "users",
        "sessions",
        "boards",
        "chat_messages",
        "user_theme_preferences",
    }.issubset(table_names)


def test_init_db_creates_database_file_if_missing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    db_path = tmp_path / "nested" / "data" / "pm.sqlite3"
    monkeypatch.setenv("PM_DB_PATH", str(db_path))
    assert not db_path.exists()

    main.init_db()
    assert db_path.exists()


def test_default_user_and_board_seed_is_present_and_idempotent() -> None:
    main.init_db()
    main.init_db()

    db_path = main._get_db_path()
    with sqlite3.connect(db_path) as connection:
        connection.row_factory = sqlite3.Row
        user_row = connection.execute(
            """
            SELECT id, username, password
            FROM users
            WHERE username = ?
            """,
            (main.VALID_USERNAME,),
        ).fetchone()
        assert user_row is not None
        assert user_row["password"] == main.VALID_PASSWORD

        boards = connection.execute(
            """
            SELECT board_json, version
            FROM boards
            WHERE user_id = ?
            """,
            (user_row["id"],),
        ).fetchall()
        assert len(boards) == 1
        assert boards[0]["version"] == 1

        board_payload = json.loads(boards[0]["board_json"])
        assert isinstance(board_payload, dict)
        assert "columns" in board_payload
        assert "cards" in board_payload


def test_get_kanban_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/kanban")
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_theme_endpoints_require_authentication(client: TestClient) -> None:
    get_response = client.get("/api/theme")
    assert get_response.status_code == 401
    assert get_response.json() == {"detail": "Authentication required."}

    update_response = client.put(
        "/api/theme",
        json={
            "gradientStart": "#112233",
            "gradientMid": "#445566",
            "gradientEnd": "#778899",
        },
    )
    assert update_response.status_code == 401
    assert update_response.json() == {"detail": "Authentication required."}


def test_get_theme_returns_default_preferences(client: TestClient) -> None:
    login(client)
    response = client.get("/api/theme")
    assert response.status_code == 200
    assert response.json() == main.DEFAULT_THEME_PREFERENCES


def test_put_theme_persists_preferences(client: TestClient) -> None:
    login(client)
    update_response = client.put(
        "/api/theme",
        json={
            "gradientStart": "#112233",
            "gradientMid": "#445566",
            "gradientEnd": "#778899",
        },
    )
    assert update_response.status_code == 200
    assert update_response.json() == {
        "gradientStart": "#112233",
        "gradientMid": "#445566",
        "gradientEnd": "#778899",
    }

    get_response = client.get("/api/theme")
    assert get_response.status_code == 200
    assert get_response.json() == {
        "gradientStart": "#112233",
        "gradientMid": "#445566",
        "gradientEnd": "#778899",
    }


def test_put_theme_rejects_invalid_hex_color(client: TestClient) -> None:
    login(client)
    response = client.put(
        "/api/theme",
        json={
            "gradientStart": "112233",
            "gradientMid": "#445566",
            "gradientEnd": "#778899",
        },
    )
    assert response.status_code == 422


def test_put_kanban_requires_authentication(client: TestClient) -> None:
    response = client.put(
        "/api/kanban",
        json={"board": main.DEFAULT_BOARD_DATA, "version": 1},
    )
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_get_kanban_returns_seeded_board(client: TestClient) -> None:
    login(client)
    payload = get_board(client)
    assert payload["version"] == 1
    assert payload["board"] == main.DEFAULT_BOARD_DATA


def test_put_kanban_persists_board_and_increments_version(client: TestClient) -> None:
    login(client)
    initial_payload = get_board(client)

    updated_board = initial_payload["board"]
    updated_board["columns"][0]["title"] = "Ideas"
    updated_board["cards"]["card-1"]["title"] = "Updated title"

    update_response = client.put(
        "/api/kanban",
        json={"board": updated_board, "version": initial_payload["version"]},
    )
    assert update_response.status_code == 200
    updated_payload = update_response.json()
    assert updated_payload["version"] == initial_payload["version"] + 1
    assert updated_payload["board"]["columns"][0]["title"] == "Ideas"
    assert updated_payload["board"]["cards"]["card-1"]["title"] == "Updated title"

    reloaded_payload = get_board(client)
    assert reloaded_payload["version"] == updated_payload["version"]
    assert reloaded_payload["board"] == updated_payload["board"]


def test_put_kanban_rejects_stale_version(client: TestClient) -> None:
    login(client)
    initial_payload = get_board(client)

    first_update = client.put(
        "/api/kanban",
        json={"board": initial_payload["board"], "version": initial_payload["version"]},
    )
    assert first_update.status_code == 200
    first_update_payload = first_update.json()

    stale_update = client.put(
        "/api/kanban",
        json={"board": initial_payload["board"], "version": initial_payload["version"]},
    )
    assert stale_update.status_code == 409
    assert stale_update.json() == {
        "detail": {
            "message": "Board version conflict.",
            "currentVersion": first_update_payload["version"],
        }
    }


def test_put_kanban_rejects_inconsistent_board_payload(client: TestClient) -> None:
    login(client)
    payload = get_board(client)
    invalid_board = payload["board"]
    invalid_board["columns"][0]["cardIds"] = []

    response = client.put(
        "/api/kanban",
        json={"board": invalid_board, "version": payload["version"]},
    )
    assert response.status_code == 422
    assert (
        "Columns and cards must reference the same card ids."
        in response.json()["detail"][0]["msg"]
    )


def test_ai_ping_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/ai/ping")
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_ai_ping_requires_openrouter_key(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    login(client)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    response = client.post("/api/ai/ping")
    assert response.status_code == 503
    assert response.json() == {"detail": "OPENROUTER_API_KEY is not configured."}


def test_ai_ping_succeeds_with_valid_response(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    login(client)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(main, "_run_openrouter_ping", lambda _api_key: "4")

    response = client.post("/api/ai/ping")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["model"] == main.OPENROUTER_MODEL
    assert payload["answer"] == "4"
    assert isinstance(payload["latencyMs"], int)
    assert payload["latencyMs"] >= 0


def test_ai_ping_rejects_unexpected_answer(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    login(client)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(main, "_run_openrouter_ping", lambda _api_key: "5")

    response = client.post("/api/ai/ping")
    assert response.status_code == 502
    assert response.json() == {
        "detail": "OpenRouter connectivity check returned an unexpected answer."
    }


def test_call_openrouter_chat_maps_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    def raise_timeout(*_args, **_kwargs):
        raise urllib_error.URLError(TimeoutError("timed out"))

    monkeypatch.setattr(main.urllib_request, "urlopen", raise_timeout)

    with pytest.raises(main.HTTPException) as error:
        main._call_openrouter_chat("test-key", "What is 2+2?")
    assert error.value.status_code == 504
    assert error.value.detail == "OpenRouter request timed out."


def test_call_openrouter_chat_maps_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def raise_http_error(*_args, **_kwargs):
        raise urllib_error.HTTPError(
            url=main.OPENROUTER_CHAT_URL,
            code=429,
            msg="Too Many Requests",
            hdrs=None,
            fp=io.BytesIO(b'{"error":"rate limit"}'),
        )

    monkeypatch.setattr(main.urllib_request, "urlopen", raise_http_error)

    with pytest.raises(main.HTTPException) as error:
        main._call_openrouter_chat("test-key", "What is 2+2?")
    assert error.value.status_code == 502
    assert error.value.detail == "OpenRouter returned HTTP 429."


def test_ai_ping_live_smoke_optional(client: TestClient) -> None:
    if os.getenv("PM_RUN_LIVE_AI_SMOKE") != "1":
        pytest.skip("Set PM_RUN_LIVE_AI_SMOKE=1 to run the live OpenRouter smoke test.")
    if not os.getenv("OPENROUTER_API_KEY"):
        pytest.skip("OPENROUTER_API_KEY is required for live smoke test.")

    login(client)
    response = client.post("/api/ai/ping")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["model"] == main.OPENROUTER_MODEL


def test_ai_chat_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/ai/chat", json={"message": "hello"})
    assert response.status_code == 401
    assert response.json() == {"detail": "Authentication required."}


def test_ai_chat_requires_openrouter_key(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    login(client)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    response = client.post("/api/ai/chat", json={"message": "hello"})
    assert response.status_code == 503
    assert response.json() == {"detail": "OPENROUTER_API_KEY is not configured."}


def test_ai_chat_rejects_blank_message(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    login(client)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    response = client.post("/api/ai/chat", json={"message": "   "})
    assert response.status_code == 422
    assert response.json() == {"detail": "Message must not be empty."}


def test_ai_chat_rejects_invalid_structured_output(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    login(client)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(main, "_run_openrouter_ai_chat", lambda **_kwargs: "not-json")

    response = client.post("/api/ai/chat", json={"message": "Please update"})
    assert response.status_code == 502
    assert response.json() == {"detail": "AI returned non-JSON output."}


def test_ai_chat_applies_actions_and_persists_chat_history(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    login(client)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(
        main,
        "_run_openrouter_ai_chat",
        lambda **_kwargs: json.dumps(
            {
                "assistantMessage": "Updated board.",
                "actions": [
                    {
                        "type": "rename_column",
                        "columnId": "col-progress",
                        "title": "Working",
                    },
                    {
                        "type": "create_card",
                        "columnId": "col-review",
                        "title": "AI follow-up",
                        "details": "Created by AI",
                    },
                ],
            }
        ),
    )

    response = client.post(
        "/api/ai/chat",
        json={"message": "Rename in progress and create a review card."},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["assistantMessage"] == "Updated board."
    assert payload["actionsApplied"] == 2
    assert payload["version"] == 2
    progress_column = next(
        column for column in payload["board"]["columns"] if column["id"] == "col-progress"
    )
    assert progress_column["title"] == "Working"
    assert any(card["title"] == "AI follow-up" for card in payload["board"]["cards"].values())

    board_response = client.get("/api/kanban")
    assert board_response.status_code == 200
    board_payload = board_response.json()
    assert board_payload["version"] == 2
    persisted_progress_column = next(
        column for column in board_payload["board"]["columns"] if column["id"] == "col-progress"
    )
    assert persisted_progress_column["title"] == "Working"

    db_path = main._get_db_path()
    with sqlite3.connect(db_path) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """
            SELECT role, content
            FROM chat_messages
            ORDER BY id
            """
        ).fetchall()
    assert len(rows) == 2
    assert rows[0]["role"] == "user"
    assert rows[1]["role"] == "assistant"
    assert "Rename in progress" in rows[0]["content"]
    assert rows[1]["content"] == "Updated board."


def test_ai_chat_rejects_invalid_action_reference(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    login(client)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(
        main,
        "_run_openrouter_ai_chat",
        lambda **_kwargs: json.dumps(
            {
                "assistantMessage": "Done",
                "actions": [
                    {
                        "type": "rename_column",
                        "columnId": "col-missing",
                        "title": "New title",
                    }
                ],
            }
        ),
    )

    response = client.post("/api/ai/chat", json={"message": "Do it"})
    assert response.status_code == 502
    assert response.json() == {"detail": "AI action failed: unknown column 'col-missing'."}

    board_response = client.get("/api/kanban")
    assert board_response.status_code == 200
    assert board_response.json()["version"] == 1


def test_ai_chat_with_no_actions_keeps_board_version(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    login(client)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(
        main,
        "_run_openrouter_ai_chat",
        lambda **_kwargs: json.dumps({"assistantMessage": "No changes needed.", "actions": []}),
    )

    response = client.post("/api/ai/chat", json={"message": "Any updates?"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["actionsApplied"] == 0
    assert payload["version"] == 1

    board_response = client.get("/api/kanban")
    assert board_response.status_code == 200
    assert board_response.json()["version"] == 1
