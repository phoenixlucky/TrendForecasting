@echo off
setlocal

cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH.
  echo Please install Node.js and reopen this terminal.
  pause
  exit /b 1
)

echo [INFO] Checking root dependencies...
if not exist "node_modules" (
  npm install
  if errorlevel 1 goto :fail
)

echo [INFO] Checking frontend dependencies...
if not exist "frontend\node_modules" (
  npm install --prefix frontend
  if errorlevel 1 goto :fail
)

echo [INFO] Checking backend dependencies...
if not exist "backend\node\node_modules" (
  npm install --prefix backend/node
  if errorlevel 1 goto :fail
)

echo [INFO] Starting services (python + node + web)...
npm run dev
if errorlevel 1 goto :fail

goto :end

:fail
echo [ERROR] Startup failed.
pause
exit /b 1

:end
endlocal
