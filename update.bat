@echo off
setlocal enabledelayedexpansion
title OPPAC Analysis - Update from GitHub
cd /d "%~dp0"

echo ============================================
echo  OPPAC Analysis - update from GitHub
echo ============================================
echo   Folder: %CD%
echo.

REM -- Keep a snapshot of ourselves. Updating can replace this very file while
REM -- cmd.exe is still reading it, and because batch files are read by byte
REM -- offset that makes cmd resume at a nonsense position in the new file and
REM -- fail with errors like "'word' is not recognized". :check_self compares
REM -- the two and hands over to the fresh copy when they differ.
copy /y "%~dp0update.bat" "%TEMP%\oppac-update-snapshot.bat" >nul 2>&1

where git >nul 2>&1
if errorlevel 1 (
  echo  Git is not installed or not on your PATH, so we cannot download
  echo  the new version. Install GitHub Desktop from github.com/desktop
  echo  - it bundles Git and handles the login - then run update.bat again.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo  package.json not found.
  echo  It looks like you double-clicked a copy of update.bat instead of
  echo  the one inside the app folder. Open the app folder itself and run
  echo  update.bat from there.
  pause
  exit /b 1
)

REM -- Repair a folder that is not a clone yet. This happens when the app was
REM -- downloaded as a ZIP or copied from another computer: both leave out the
REM -- hidden .git folder, so there is nothing to pull from. Re-attaching the
REM -- repo fixes it permanently. reset --hard only rewrites files Git tracks,
REM -- so node_modules\, .next\ and the data\ folder are all left alone.
if not exist ".git" goto :repair
git rev-parse --verify HEAD >nul 2>&1
if not errorlevel 1 goto :git_ok
echo.
echo  Found a .git folder with no usable commit in it.
echo  This can happen if a previous update was interrupted.
goto :repair

:repair
echo.
echo  --------------------------------------------------------
echo   This folder is not a git clone, so it cannot update itself.
echo --------------------------------------------------------
echo  This is expected if the app was downloaded as a ZIP or copied
echo  from another computer - neither of those includes the hidden
echo  .git folder that updates need.
echo.
echo  Repairing it now. This will:
echo    - attach this folder to the GitHub repository
echo    - replace the app's source files with the latest version
echo.
echo  Your saved data, installed dependencies and the current
echo  build are all kept. Any local hand-edits to source files
echo  will be replaced by the official version.
echo.
echo  If you expected this folder to be a clone already, stop here
echo  and check you are running the update.bat inside the app
echo  folder, not a copy somewhere else.
echo.
set /p REPAIR="  Press Y to repair and continue (or N to cancel): "
if /i not "%REPAIR%"=="Y" goto :cancelled

echo.
echo  Repairing folder, please wait...
git init --quiet 2>&1
git remote remove origin >nul 2>&1
git remote add origin https://github.com/acchuuccha-beep/oppac-analysis.git 2>&1
git fetch --quiet origin 2>&1
if errorlevel 1 goto :repair_failed
REM -- -f is required: in a freshly initialised folder every file is untracked,
REM -- and without -f git refuses to overwrite them. -B pins the branch to main
REM -- so the pull further down works whatever git init named it.
git checkout -f -B main origin/main 2>&1
if errorlevel 1 goto :repair_failed
git reset --hard origin/main 2>&1
if errorlevel 1 goto :repair_failed
echo  Repair complete - this folder can now update itself.
echo.
call :check_self
if errorlevel 1 exit /b 1
:git_ok

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

REM -- The pull may have just replaced update.bat underneath us. Hand over to
REM -- the new copy before continuing, otherwise the rest of this run reads
REM -- from the wrong byte offset and breaks in confusing ways.
call :check_self
if errorlevel 1 exit /b 1

echo  [2/4] Dependencies...
if not exist "node_modules" goto :do_install
if not exist "node_modules\.package-lock.json" goto :do_install
powershell -NoProfile -NoLogo -ExecutionPolicy Bypass -Command ^
  "$p = (Get-Item 'package-lock.json').LastWriteTime; " ^
  "$m = (Get-Item 'node_modules\.package-lock.json').LastWriteTime; " ^
  "if ($p -gt $m) { exit 1 }; exit 0"
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
  "$bid = (Get-Item '.next\BUILD_ID').LastWriteTime; " ^
  "$paths = @('src','scripts','package.json','package-lock.json'," ^
  "'next.config.ts','postcss.config.mjs','tsconfig.json'); " ^
  "$newest = $null; " ^
  "foreach ($p in $paths) { if (Test-Path $p) { " ^
  "$i = Get-Item $p; " ^
  "if ($i.PSIsContainer) { " ^
  "$f = Get-ChildItem $p -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1; " ^
  "if ($f -and $f.LastWriteTime -gt $newest) { $newest = $f.LastWriteTime } " ^
  "} elseif ($i.LastWriteTime -gt $newest) { $newest = $i.LastWriteTime } } }; " ^
  "if ($newest -and $newest -gt $bid) { exit 1 }; exit 0"
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
del "%TEMP%\oppac-update-snapshot.bat" >nul 2>&1
pause
exit /b 0

:check_self
REM -- Compares this file against the snapshot taken at startup. Returns 1 when
REM -- the file changed and the caller should stop, 0 when it is unchanged.
fc /b "%~dp0update.bat" "%TEMP%\oppac-update-snapshot.bat" >nul 2>&1
if not errorlevel 1 exit /b 0
del "%TEMP%\oppac-update-snapshot.bat" >nul 2>&1
echo.
echo  The updater was updated by this download, so restarting it...
echo.
call "%~dp0update.bat"
exit /b 1

:cancelled
echo  Cancelled - nothing was changed.
pause
exit /b 1

:repair_failed
echo.
echo  Repair failed - nothing was changed.
echo.
echo  Usually this means no internet connection, or Git is not logged in.
echo  Check your connection, then double-click update.bat again - it will
echo  pick up from where it stopped.
echo.
echo  If it keeps failing, the cleanest fix is to download a fresh copy:
echo  https://github.com/acchuuccha-beep/oppac-analysis
echo  (Green "Code" button - Download ZIP), then run start.bat in it.
pause
exit /b 1