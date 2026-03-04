#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

docker compose up --build -d
docker compose ps

for _ in {1..30}; do
  if curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
  echo "Backend did not become ready at /api/health within 30 seconds." >&2
  exit 1
fi

echo "Backend is ready."
echo "App: http://127.0.0.1:8000"
echo "Health: http://127.0.0.1:8000/api/health"
echo "Auth status: http://127.0.0.1:8000/api/auth/me"
echo "Demo login credentials: user / password"
echo "Hello (requires login cookie): http://127.0.0.1:8000/api/hello"
