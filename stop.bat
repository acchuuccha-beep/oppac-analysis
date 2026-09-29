@echo off
setlocal
title OPPAC Analysis - Stop all services
cd /d "%~dp0"
echo ============================================
echo  OPPAC Analysis - stop all services
echo ============================================
echo.

REM ---- 1. Flip NSE loop flag off, then kill the scraper ----------
REM echo.off (dot-trick) avoids cmd's echo-state quirk writing empty.
echo  [1/3] Stopping NSE scraper...
if exist "data\nse-live.flag" goto :flag_off
goto :flag_done
:flag_off
>"data\nse-live.flag" echo.off
:flag_done
powershell -NoProfile -Command ^
  "$root = (Get-Location).Path; " ^
  "$pidFile = Join-Path $root 'data\nse-scraper.pid'; " ^
  "$hasPid = $false; " ^
  "if (Test-Path $pidFile) { " ^
  "  try { $p = [int](Get-Content $pidFile -Raw); if ($p -gt 0) { $hasPid = $true; taskkill /f /pid $p /t 2>&1 | Out-Null } } catch {} " ^
  "  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue " ^
  "}; " ^
  "$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*nse-scraper.mjs*' }; " ^
  "if ($procs) { $procs.ProcessId | ForEach-Object { taskkill /f /pid $_ /t 2>&1 | Out-Null } }; " ^
  "if ($hasPid -or $procs) { '  NSE scraper stopped.' } else { '  No NSE scraper running.' }"
REM ----------------------------------------------------------------

echo.
REM ---- 2. Kill Next.js on port 3001 ------------------------------
echo  [2/3] Stopping server (port 3001)...
set "killed=0"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
  taskkill /f /pid %%p /t >nul 2>&1
  set "killed=1"
)
if "%killed%"=="1" ( echo   Server stopped. ) else ( echo   No server process found on port 3001. )
REM ----------------------------------------------------------------

echo.
REM ---- 3. Verify port is free ------------------------------------
echo  [3/3] Verifying...
set "left=0"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do set "left=1"
if "%left%"=="1" (
  echo  WARNING: Something is still listening on port 3001. Check tasklist.
) else (
  echo  All stopped. Port 3001 is free.
)
REM ----------------------------------------------------------------

echo.
echo  Done.
pause