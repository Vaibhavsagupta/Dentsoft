@echo off
setlocal enabledelayedexpansion
title Dental Lab System Updater
cls
echo =======================================================
echo          Dental Lab System - 1-Click Updater
echo =======================================================
echo.

:: ----------------------------------------------------------------------
:: CONFIGURE YOUR GITHUB REPO OR DIRECT DOWNLOAD URL BELOW:
:: Example GitHub Release direct asset URL:
:: https://github.com/YOUR_GITHUB_USER/YOUR_REPO/releases/latest/download/server.exe
:: ----------------------------------------------------------------------
set "UPDATE_URL=https://github.com/Vaibhavsagupta/Dentsoft/releases/latest/download/server.exe"

echo [Step 1/4] Stopping active server processes...
taskkill /F /IM server.exe >nul 2>&1
timeout /t 2 >nul

echo [Step 2/4] Downloading latest server binary from cloud...
echo Target: !UPDATE_URL!
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; ^
    try { ^
        Write-Host 'Downloading server.exe (please wait)...' -ForegroundColor Cyan; ^
        (New-Object System.Net.WebClient).DownloadFile('!UPDATE_URL!', '%~dp0server_new.exe'); ^
        Write-Host 'Download complete!' -ForegroundColor Green; ^
        exit 0; ^
    } catch { ^
        Write-Host 'ERROR: Failed to download update file.' -ForegroundColor Red; ^
        Write-Host $_.Exception.Message -ForegroundColor Red; ^
        exit 1; ^
    }"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [FAILED] Update download failed. Please check internet connection or update URL.
    if exist "%~dp0server_new.exe" del /f /q "%~dp0server_new.exe"
    echo.
    echo Re-starting previous version...
    cscript //nologo "%~dp0start-silent.vbs"
    pause
    exit /b 1
)

echo [Step 3/4] Applying update...
if exist "%~dp0server.exe.bak" del /f /q "%~dp0server.exe.bak"
if exist "%~dp0server.exe" ren "%~dp0server.exe" "server.exe.bak"
ren "%~dp0server_new.exe" "server.exe"
if exist "%~dp0server.exe.bak" del /f /q "%~dp0server.exe.bak"

echo [Step 4/4] Starting updated server in background...
cscript //nologo "%~dp0start-silent.vbs"

echo.
echo =======================================================
echo   [SUCCESS] Dental Lab System is updated and running!
echo =======================================================
timeout /t 5
