@echo off
title Bug Hunt — LAN Coding Contest Platform
cd /d "%~dp0"

echo ====================================================
echo  🐞 BUG HUNT: LAN CODING CONTEST PLATFORM
echo ====================================================
echo.

:: 1. Check if node_modules exists
if not exist "node_modules\" (
    echo [Setup] First-time setup detected. Installing dependencies...
    echo (This may take a minute or two on first run)
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [Warning] Approving postinstall scripts...
        call npm approve-scripts electron 2>nul
        call npm approve-scripts esbuild 2>nul
        call npm install
    )
    echo.
)

:: 2. Check if frontend dist bundle exists
if not exist "dist\" (
    echo [Build] Building frontend UI assets...
    call npm run build
    echo.
)

:: 3. Launch the native Electron desktop application window
echo [Launch] Starting Bug Hunt Native Desktop App...
call npm start

if %errorlevel% neq 0 (
    echo.
    echo [Notice] Attempting direct Electron launch...
    call npx electron .
)

exit
