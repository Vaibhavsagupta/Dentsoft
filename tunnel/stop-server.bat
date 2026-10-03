@echo off
echo Stopping Node.js server...
taskkill /F /IM node.exe
echo Stopping Cloudflare tunnel...
taskkill /F /IM cloudflared.exe
echo Server and tunnel stopped successfully.
pause
