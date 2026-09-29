@echo off
setlocal enabledelayedexpansion
title OPPAC Analysis - Update from GitHub
cd /d "%~dp0"

echo ============================================
echo  OPPAC Analysis - update from GitHub
echo ============================================
echo.

if not exist ".git" (
  echo  This folder is not a git clone, so there is nothing to update from.
  echo.
  echo  First time? Clone it once running this in a Command Prompt:
  echo     git clone https://github.com/acchuuccha-beep/oppac-analysis.git
  echo  then double-click start.bat to run it.
  pause
  exit /b 1
)
if not exist "package.json" (
  echo  package.json not found - are you in the right folder?
  pause
  exit /b 1
)

echo  [1/4] Downloading latest code from GitHub...
git fetch origin 2>&1
if errorlevel 1 (
  echo.
  echo  Fetch failed - are you offline or not logged in to GitHub?
  echo  Fix that, then double-click update.bat again.
  pause
  exit /b 1
)
git pull --ff-only origin main 2>&1
if errorlevel 1 (
  echo.
  echo  Pull failed. If you edited files in this folder by hand, open a
  echo  Command Prompt here and run:   git stash
  echo  then double-click update.bat again.
  pause
  exit /b 1
)

echo  [2/4] Dependencies...
if not exist "node_modules" goto :do_install
powershell -NoProfile -NoLogo -ExecutionPolicy Bypass -Command ^
  "if (Test-Path 'node_modules\package.json') { " ^
  "$p = (Get-Item 'package.json').LastWriteTime; " ^
  "$m = (Get-Item 'node_modules\package.json').LastWriteTime; " ^
  "if ($p -gt $m) { exit 1 } }; exit 0"
if errorlevel 1 goto :do_install
goto :deps_ok
:do_install
echo  Installing missing or new dependencies...
call npm install
if errorlevel 1 (
  echo.
  echo  npm install failed - check your internet connection.
  pause
  exit /b 1
)
:deps_ok

echo  [3/4] Building if anything changed...
if not exist ".next\BUILD_ID" goto :do_build
powershell -NoProfile -NoLogo -ExecutionPolicy Bypass -Command ^
  "if (Test-Path '.next\BUILD_ID') { " ^
  "$newest = Get-ChildItem 'src' -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1; " ^
  "$bid = Get-Item '.next\BUILD_ID'; " ^
  "if ($newest -and $newest.LastWriteTime -gt $bid.LastWriteTime) { exit 1 } }; exit 0"
if errorlevel 1 goto :do_build
goto :build_ok
:do_build
echo  Rebuilding the app (can take a few minutes)...
call npm run build
if errorlevel 1 (
  echo.
  echo  Build failed. See the errors above.
  pause
  exit /b 1
)
:build_ok

echo  [4/4] Restarting if the app is running...
set "running=0"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do set "running=1"
if not "%running%"=="1" (
  echo.
  echo  Updated. The app is not running right now,
  echo  so start it with start.bat when you need it.
  pause
  exit /b 0
)

echo  Stopping the old app and starting the new version...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do taskkill /f /pid %%p /t >nul 2>&1
if exist "data\nse-scraper.pid" (
  for /f %%p in ('type "data\nse-scraper.pid"') do taskkill /f /pid %%p /t >nul 2>&1
  del "data\nse-scraper.pid" >nul 2>&1
)
powershell -NoProfile -Command "$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*nse-scraper.mjs*' }; foreach($p in $procs){ taskkill /f /pid $p.ProcessId /t 2>&1 | Out-Null }"

set "WSCRIPT=%windir%\System32\wscript.exe"
if not exist "%WSCRIPT%" set "WSCRIPT=%windir%\SysWOW64\wscript.exe"
if not exist "data" mkdir "data"
>"data\nse-live.flag" echo.on
"%WSCRIPT%" "scripts\run-hidden.vbs" "node scripts\nse-scraper.mjs >> data\nse-scraper.log 2>&1"
"%WSCRIPT%" "scripts\run-hidden.vbs" "npm run start >> data\server.log 2>&1"

echo  Waiting for the server on http://localhost:3001 ...
set "up="
for /l %%i in (1,1,60) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do set "up=1"
  if defined up goto :up
  ping -n 2 127.0.0.1 >nul
)
:up
if not defined up (
  echo  Server did not come back up. Check data\server.log
  pause
  exit /b 1
)

echo.
echo  Done - updated and restarted. Refresh the tab at:
echo   http://localhost:3001
pause