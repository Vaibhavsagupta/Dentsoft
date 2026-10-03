@echo off
title Dental Lab - Build Server Executable
echo ==============================================
echo    Building Standalone server.exe Binary
echo ==============================================

cd /d "%~dp0backend"
echo [1/3] Ensuring Prisma Client is updated...
call npx prisma generate

echo [2/3] Compiling server into binary with pkg...
call npx --yes pkg@5.8.1 . --target node18-win-x64 --output dist/server.exe

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Build failed! Check errors above.
    pause
    exit /b 1
)

echo [3/3] Copying fresh server.exe to ClientPackage folder...
copy /y "%~dp0backend\dist\server.exe" "%~dp0ClientPackage\server.exe" >nul

echo.
echo ==============================================
echo [SUCCESS] server.exe created successfully!
echo Location: %~dp0ClientPackage\server.exe
echo ==============================================
pause
