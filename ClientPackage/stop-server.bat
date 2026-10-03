@echo off
title Dental Lab Server Stopper
echo ==============================================
echo       Stopping All Dental Lab Services
echo ==============================================

echo Terminating backend server (server.exe)...
taskkill /F /IM server.exe >nul 2>&1

echo Terminating Cloudflare tunnel (cloudflared.exe)...
taskkill /F /IM cloudflared.exe >nul 2>&1

echo.
echo [DONE] All services have been stopped successfully.
timeout /t 3 >nul
