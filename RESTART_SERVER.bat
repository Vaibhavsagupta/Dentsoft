@echo off
title Sohar Dental Lab - Server Restarter
echo ==============================================
echo  Restarting Server and Cloudflare Tunnel...
echo ==============================================
echo.
echo Stopping old processes...
taskkill /F /IM cloudflared.exe 2>nul
taskkill /F /IM node.exe 2>nul

echo.
echo Launching Server and Tunnel in background...
wscript "%~dp0tunnel\start-hidden.vbs"

echo.
echo SUCCESS: Server and Cloudflare Tunnel started!
echo Site URL: https://sdl.sohardental.com
echo ==============================================
ping 127.0.0.1 -n 4 > nul
