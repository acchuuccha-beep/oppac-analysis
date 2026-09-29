@echo off
setlocal enabledelayedexpansion
title OPPAC Analysis
cd /d "%~dp0"

REM -- If the app is already running on :3001, just open the website. --
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do goto :open_only

REM -- Install deps on first run (after a fresh git clone). --
if exist "node_modules" goto :deps_done
echo  Installing dependencies (first run - can take a minute)...
call npm install
if errorlevel 1 (
  echo.
  echo  npm install failed. Check your internet connection.
  pause
  exit /b 1
)
:deps_done

set "WSCRIPT=%windir%\System32\wscript.exe"
if not exist "%WSCRIPT%" set "WSCRIPT=%windir%\SysWOW64\wscript.exe"

REM -- Start NSE option-chain scraper in the background (hidden).
REM -- Always reset any manual "off" flag so the live loop comes back
REM -- every time the app is started. Stopping is done by stop.bat.
if not exist "data" mkdir "data"
>"data\nse-live.flag" echo.on
"%WSCRIPT%" "scripts\run-hidden.vbs" "node scripts\nse-scraper.mjs >> data\nse-scraper.log 2>&1"

REM -- Build only if no previous build exists. --
if exist ".next\BUILD_ID" goto :build_done
echo  Building the app. First build can take a few minutes...
call npm run build
if errorlevel 1 (
  echo.
  echo  Build failed. See the errors above.
  pause
  exit /b 1
)
:build_done

REM -- Start the server fully hidden, then open the website once it is up. --
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
  echo  Server did not respond in time. Check data\server.log
  pause
  exit /b 1
)

start "" "http://localhost:3001"
exit /b 0

:open_only
start "" "http://localhost:3001"
exit /b 0