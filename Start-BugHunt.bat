@echo off
title Bug Hunt — LAN Coding Contest Platform
cd /d "%~dp0"

echo ====================================================
echo  🐞 BUG HUNT: LAN CODING CONTEST PLATFORM
echo ====================================================
echo.

:: 1. Check if node_modules exists
if not exist "node_modules\" (
    echo [Setup] First-time setup: Installing dependencies...
    echo (This may take a minute or two on first run)
    call npm install
    echo.
)

:: 2. Check if frontend dist bundle exists
if not exist "dist\" (
    echo [Build] Building frontend UI assets...
    call npm run build
    echo.
)

:: 3. Launch Application Window
echo [Launch] Starting Bug Hunt Desktop Application...

:: If Electron binary exists, launch Electron native window
if exist "node_modules\electron\dist\electron.exe" (
    echo Launching via Electron Desktop Engine...
    call npm start
    if %errorlevel% equ 0 exit
)

:: Fallback: Start background server and launch standalone app window
echo Starting embedded backend server...
start /B node server/server.js
timeout /t 2 /nobreak >nul

echo Opening Desktop Application Window...
start msedge --app=http://localhost:4000 --window-size=1366,860 --app-id=bughunt

exit
