# Production-style launcher for image-converter.test
#   - Serves the built frontend (frontend/dist) AND the API from ONE port.
#   - Open http://image-converter.test:7420  (after adding the hosts entry)
#
# Usage:
#   .\serve-prod.ps1            # serve (builds frontend only if dist is missing)
#   .\serve-prod.ps1 -Build     # force a fresh frontend build first
#
# This is what the Startup shortcut runs.

param(
    [switch]$Build
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Host/port for this app. 7420 was free on this machine; change here if needed.
$AppHost = "127.0.0.1"
$AppPort = 7420

# Guard: never start a second instance. If the port is already taken, say by what and bail.
$existing = Get-NetTCPConnection -LocalPort $AppPort -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    $pid0 = ($existing | Select-Object -First 1).OwningProcess
    $pname = (Get-Process -Id $pid0 -ErrorAction SilentlyContinue).ProcessName
    Write-Host "Port $AppPort is already in use (PID $pid0, $pname). Not starting a second instance." -ForegroundColor Yellow
    Write-Host "  Open:  http://image-converter.test:$AppPort"
    Write-Host "  Stop:  .\app.ps1 stop      Status:  .\app.ps1 status"
    return
}

$venvPython = Join-Path $PSScriptRoot "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Error "Backend venv not found at $venvPython. Run: cd backend; python -m venv .venv; .\.venv\Scripts\pip install -r requirements.txt"
}

# Build the frontend if requested or if there is no build yet.
$distIndex = Join-Path $PSScriptRoot "frontend\dist\index.html"
if ($Build -or -not (Test-Path $distIndex)) {
    Write-Host "Building frontend..." -ForegroundColor Cyan
    Push-Location (Join-Path $PSScriptRoot "frontend")
    npm run build
    Pop-Location
}

Write-Host "Starting image-converter on http://$AppHost`:$AppPort" -ForegroundColor Green

# uvicorn must run with backend/ as the working dir so `app.main` resolves.
Push-Location (Join-Path $PSScriptRoot "backend")
$env:HOST = $AppHost
$env:PORT = $AppPort
& $venvPython -m uvicorn app.main:app --host $AppHost --port $AppPort
Pop-Location
