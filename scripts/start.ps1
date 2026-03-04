$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDir "..")

Set-Location $projectRoot

docker compose up --build -d
docker compose ps

for ($i = 0; $i -lt 30; $i++) {
  try {
    $null = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/health" -UseBasicParsing
    break
  } catch {
    Start-Sleep -Seconds 1
  }
}

try {
  $null = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/health" -UseBasicParsing
} catch {
  throw "Backend did not become ready at /api/health within 30 seconds."
}

Write-Host "Backend is ready."
Write-Host "App: http://127.0.0.1:8000"
Write-Host "Health: http://127.0.0.1:8000/api/health"
Write-Host "Auth status: http://127.0.0.1:8000/api/auth/me"
Write-Host "Demo login credentials: user / password"
Write-Host "Hello (requires login cookie): http://127.0.0.1:8000/api/hello"
