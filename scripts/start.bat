@echo off
setlocal
set READY=0

set SCRIPT_DIR=%~dp0
pushd "%SCRIPT_DIR%.."

docker compose up --build -d
if errorlevel 1 (
  popd
  exit /b %errorlevel%
)

docker compose ps

for /L %%i in (1,1,30) do (
  curl -fsS http://127.0.0.1:8000/api/health >nul 2>&1
  if not errorlevel 1 (
    set READY=1
    goto :ready
  )
  timeout /t 1 /nobreak >nul
)

:ready
if "%READY%"=="0" (
  echo Backend did not become ready at /api/health within 30 seconds.
  popd
  exit /b 1
)

echo Backend is ready.
echo App: http://127.0.0.1:8000
echo Health: http://127.0.0.1:8000/api/health
echo Auth status: http://127.0.0.1:8000/api/auth/me
echo Demo login credentials: user / password
echo Hello (requires login cookie): http://127.0.0.1:8000/api/hello

popd
endlocal
