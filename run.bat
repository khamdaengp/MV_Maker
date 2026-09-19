@echo off
title MV Maker - In-Browser Music Video Generator
echo ===================================================
echo               MV Maker Dev Server
echo ===================================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in your PATH!
    echo Please install Node.js from https://nodejs.org/ and try again.
    pause
    exit /b 1
)

:: Check if dependencies are installed
if not exist "node_modules\" (
    echo [INFO] Installing project dependencies...
    call npm.cmd install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b %errorlevel%
    )
)

echo [INFO] Starting MV Maker on http://localhost:3000 ...
echo [INFO] Press Ctrl+C in this window to stop the server.
echo.

:: Launch Vite dev server
call npm.cmd run dev
pause
