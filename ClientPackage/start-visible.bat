@echo off
title Dental Lab Server Runner (Testing Mode)
echo ==============================================
echo   Starting Dental Lab Backend & Tunnel
echo ==============================================
echo Current Directory: %~dp0
echo.

echo [1/2] Launching Cloudflare Tunnel in background...
start "Cloudflare Tunnel" /Min "%~dp0cloudflared.exe" --config "%~dp0cloudflare-config.yml" tunnel run

echo [2/2] Starting Backend Server...
echo.
"%~dp0server.exe"

echo.
echo ==============================================
echo Server stopped.
echo ==============================================
pause
