@echo off
title Weblume AI
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
echo.
echo   Weblume AI is starting... the browser will open by itself.
echo   Keep this window open. Close it to stop.
echo.
set OPEN_BROWSER=1
node "server\proxy.js"
echo.
echo   The server stopped. Read the message above.
pause
goto :eof
:nonode
echo.
echo   Node.js is not installed.
echo   Download the LTS version from nodejs.org, install it, then run start.bat again.
echo.
start "" "https://nodejs.org/"
pause
