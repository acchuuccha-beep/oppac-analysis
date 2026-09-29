@echo off
setlocal
title OPPAC Analysis - Publish my updates
cd /d "%~dp0"

echo ============================================
echo  Publish my local changes to GitHub
echo ============================================
echo.

if not exist ".git" (
  echo  Not a git repository here - nothing to push.
  pause
  exit /b 1
)

set "msg="
set /p "msg=Commit message [update]: "
if not defined msg set "msg=update"

git add -A
git commit -m "%msg%"
if errorlevel 1 (
  echo.
  echo  Nothing to commit (or commit failed). Try again.
  pause
  exit /b 1
)

git push origin main
if errorlevel 1 (
  echo.
  echo  Push failed - check your GitHub login.
  pause
  exit /b 1
)

echo.
echo  Published to GitHub. Tell your friends to double-click update.bat.
pause