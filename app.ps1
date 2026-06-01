# Control script for the Image Converter local server (image-converter.test:7420).
#
# Usage:
#   .\app.ps1 status     # is it running? shows PID
#   .\app.ps1 start      # start it (does nothing if already running)
#   .\app.ps1 stop       # stop the running server
#   .\app.ps1 restart    # stop then start
#
# The actual server is serve-prod.ps1; this script just supervises it.

param(
    [Parameter(Position = 0)]
    [ValidateSet('status', 'start', 'stop', 'restart')]
    [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$AppPort = 7420
$Url = "http://image-converter.test:$AppPort"

# Returns the process listening on the app port, or $null if nothing is.
function Get-AppProcess {
    $conn = Get-NetTCPConnection -LocalPort $AppPort -State Listen -ErrorAction SilentlyContinue
    if (-not $conn) { return $null }
    $procId = ($conn | Select-Object -First 1).OwningProcess
    return Get-Process -Id $procId -ErrorAction SilentlyContinue
}

function Show-Status {
    $p = Get-AppProcess
    if ($p) {
        Write-Host "RUNNING   PID $($p.Id)  ($($p.ProcessName))   ->  $Url" -ForegroundColor Green
        Write-Host "Stop it:  .\app.ps1 stop      (or manually: Stop-Process -Id $($p.Id))"
    }
    else {
        Write-Host "STOPPED   nothing is listening on port $AppPort" -ForegroundColor Yellow
        Write-Host "Start it: .\app.ps1 start"
    }
}

switch ($Action) {
    'status' { Show-Status }

    'start' {
        $p = Get-AppProcess
        if ($p) {
            Write-Host "Already running (PID $($p.Id)). Not starting another." -ForegroundColor Yellow
            break
        }
        Write-Host "Starting server..." -ForegroundColor Cyan
        Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
            -ArgumentList '-ExecutionPolicy', 'Bypass', '-File', "`"$PSScriptRoot\serve-prod.ps1`"" `
            -WorkingDirectory $PSScriptRoot -WindowStyle Minimized
        foreach ($i in 1..25) {
            Start-Sleep -Seconds 1
            if (Get-AppProcess) { break }
        }
        Show-Status
    }

    'stop' {
        $p = Get-AppProcess
        if (-not $p) { Write-Host "Not running." -ForegroundColor Yellow; break }
        Write-Host "Stopping PID $($p.Id) ($($p.ProcessName))..." -ForegroundColor Cyan
        Stop-Process -Id $p.Id -Force
        Start-Sleep -Seconds 1
        if (Get-AppProcess) { Write-Host "Still running - try again." -ForegroundColor Red }
        else { Write-Host "Stopped." -ForegroundColor Green }
    }

    'restart' {
        & $PSCommandPath stop
        Start-Sleep -Seconds 1
        & $PSCommandPath start
    }
}
