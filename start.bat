@echo off
setlocal

echo ================================================
echo  Starting OceanEmbed System...
echo ================================================

REM 1. Start Python Backend in background
echo [1/3] Starting ML Backend (FastAPI on port 8000)...
start "OceanEmbed Backend" /B cmd /c "cd /d D:\oceanembed_handoff && python -m uvicorn api_server:app --host 0.0.0.0 --port 8000"

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
