@echo off
title Bug Hunt — LAN Coding Contest Platform
cd /d "%~dp0"

echo ====================================================
echo  🐞 BUG HUNT: STARTING DESKTOP APPLICATION WINDOW
echo ====================================================

:: 1. Start backend server in background
start /B node server/server.js

:: 2. Wait for server to initialize
timeout /t 2 /nobreak >nul

:: 3. Launch dedicated standalone desktop app window with Monaco Editor UI
start msedge --app=http://localhost:4000 --window-size=1366,860 --app-id=bughunt

exit
