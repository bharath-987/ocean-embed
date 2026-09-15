@echo off
setlocal

echo ================================================
echo  Starting OceanEmbed System...
echo ================================================

REM Pre-flight: Ensure port 8000 is free by terminating any conflicting process
set "STALE_PORT_FOUND=0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do (
    set "STALE_PORT_FOUND=1"
    taskkill /F /PID %%a >nul 2>&1
)

if "%STALE_PORT_FOUND%"=="0" (
    echo [PRE-FLIGHT] Port 8000 is free. No stale process found.
    goto :port_8000_ready
)

echo [PRE-FLIGHT] Stale process on port 8000 was found and killed.
set /a PORT_WAIT_RETRIES=0

:wait_port_8000_free
netstat -ano | findstr ":8000" | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    echo [PRE-FLIGHT] Confirmed port 8000 is now free.
    goto :port_8000_ready
)
ping -n 2 127.0.0.1 >nul
set /a PORT_WAIT_RETRIES+=1
if %PORT_WAIT_RETRIES% lss 10 goto :wait_port_8000_free

echo.
echo ================================================
echo  [ERROR] Port 8000 is still in use and could not be freed!
echo ================================================
echo.
pause
exit /b 1

:port_8000_ready

REM 1. Start Python Backend in background
echo [1/3] Starting ML Backend (FastAPI on port 8000)...
set "BACKEND_DIR=%~dp0backend"
if exist "%~dp0oceanembed_handoff\api_server.py" set "BACKEND_DIR=%~dp0oceanembed_handoff"
start "OceanEmbed Backend" /B cmd /c "cd /d %BACKEND_DIR% && python -m uvicorn api_server:app --host 0.0.0.0 --port 8000"

REM Confirm backend bound to port 8000
set /a BACKEND_RETRIES=0
:wait_backend
ping -n 2 127.0.0.1 >nul
netstat -ano | findstr ":8000" | findstr "LISTENING" >nul
if %errorlevel% equ 0 goto :backend_ready
set /a BACKEND_RETRIES+=1
if %BACKEND_RETRIES% lss 15 goto :wait_backend

echo.
echo ================================================
echo  [ERROR] Backend failed to bind to port 8000!
echo  Directory: %BACKEND_DIR%
echo ================================================
echo.
pause
exit /b 1

:backend_ready

REM 2. Start Frontend server in background
echo [2/3] Starting Frontend server (port 5500)...
start "OceanEmbed Frontend" /B cmd /c "cd /d %~dp0 && npm run dev"

REM 3. Wait and open Chrome
echo [3/3] Opening in Chrome...
timeout /t 3 /nobreak >nul

set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
    start "" "%CHROME%" "http://localhost:5500/explore"
) else (
    start "" "http://localhost:5500/explore"
)

echo ================================================
echo  OceanEmbed is RUNNING!
echo  Frontend: http://localhost:5500/explore
echo  Backend:  http://localhost:8000
echo ================================================
