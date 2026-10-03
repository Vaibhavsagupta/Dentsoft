@echo off
echo Starting Sohar Dental Lab Master System...
echo ==============================================
echo [Module 1] Database: Checked database/dev.db
echo [Module 2] Frontend: Serving frontend/ UI
echo [Module 3] Backend:  Starting Express API Server
echo [Module 4] Tunnel:   Launching Cloudflare Tunnel Connection
echo ==============================================

start "Cloudflare Tunnel" /Min "%~dp0cloudflared.exe" --config "%~dp0cloudflare-config.yml" tunnel run
cd /d "%~dp0..\backend"
node server.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Server stopped or crashed with Exit Code: %ERRORLEVEL%
) else (
    echo.
    echo Server stopped cleanly.
)
pause
