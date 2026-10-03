@echo off
cd /d "%~dp0..\backend"
start "" /B node server.js
ping 127.0.0.1 -n 4 > nul
cd /d "%~dp0"
start "" /B "%~dp0cloudflared.exe" --config "%~dp0cloudflare-config.yml" tunnel run
