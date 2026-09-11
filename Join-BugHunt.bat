@echo off
title Bug Hunt — Student Client (LAN Connect)
cd /d "%~dp0"

echo ====================================================
echo  🐞 BUG HUNT: STUDENT CLIENT (LAN CONNECT)
echo ====================================================
echo.

:: 1. Check if node_modules exists
if not exist "node_modules\" (
    echo [Setup] First-time setup: Installing dependencies...
    call npm install
    echo.
)

:: 2. Launch Client
set HOST_ARG=
if not "%~1"=="" (
    set HOST_ARG=--host=%~1
    echo Connecting directly to Host IP: %~1
) else (
    echo Starting in Client Mode...
)

if exist "node_modules\electron\dist\electron.exe" (
    echo Launching via Electron Desktop Engine...
    call npx electron . --client %HOST_ARG%
    if %errorlevel% equ 0 exit
)

:: Fallback if Electron not available: Open default web browser
echo Opening in browser...
if not "%~1"=="" (
    start msedge http://%~1:4000 --window-size=1366,860 --app-id=bughunt
) else (
    echo Please specify the host IP or open the URL provided by your instructor.
    pause
)

exit
