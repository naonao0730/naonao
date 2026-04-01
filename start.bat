@echo off
chcp 65001 >nul
title MiMo Studio Launcher

echo.
echo  =============================================
echo   MiMo Studio - AI Chat ^& Workspace Manager
echo  =============================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found. Please install Node.js 20+
    pause
    exit /b 1
)

:: Kill existing processes on ports 3001 and 5173
echo  Cleaning up old processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5174 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

:: Check dependencies
if not exist "server\node_modules" (
    echo  [1/4] Installing backend dependencies...
    cd server && call npm install && cd ..
)

if not exist "client\node_modules" (
    echo  [2/4] Installing frontend dependencies...
    cd client && call npm install && cd ..
)

echo.
echo  [3/4] Starting backend server (port 3001)...
start "MiMo Backend" cmd /c "cd /d %~dp0server && npm run dev"

:: Wait for backend to be ready
echo  Waiting for backend...
:wait_backend
timeout /t 1 >nul
curl -s http://localhost:3001/api/accounts >nul 2>&1
if %errorlevel% neq 0 goto wait_backend
echo  Backend ready!

echo.
echo  [4/4] Starting frontend server (port 5173)...
start "MiMo Frontend" cmd /c "cd /d %~dp0client && npm run dev"

timeout /t 3 >nul

echo.
echo  =============================================
echo   MiMo Studio is running!
echo.
echo   Frontend:  http://localhost:5173
echo   Backend:   http://localhost:3001
echo.
echo   Close this window to stop the launcher.
echo   To stop servers, close their terminal windows.
echo  =============================================
echo.

:: Open browser
start http://localhost:5173

pause
