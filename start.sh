#!/usr/bin/env bash
# ============================================================
# OceanEmbed — All-in-One Startup Script
# Compatible with Git Bash (Windows) and WSL
# ============================================================

# Resolve backend directory (Git Bash vs WSL vs native Windows)
if [ -d "D:/oceanembed_handoff" ]; then
  BACKEND_DIR="D:/oceanembed_handoff"
elif [ -d "/d/oceanembed_handoff" ]; then
  BACKEND_DIR="/d/oceanembed_handoff"
elif [ -d "/mnt/d/oceanembed_handoff" ]; then
  BACKEND_DIR="/mnt/d/oceanembed_handoff"
else
  echo "Error: Backend directory oceanembed_handoff not found on D: drive!"
  exit 1
fi

FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPLORE_URL="http://localhost:5500/explore"

echo "================================================"
echo " Starting OceanEmbed System..."
echo " Backend:  $BACKEND_DIR"
echo " Frontend: $FRONTEND_DIR"
echo "================================================"

cleanup() {
  echo ""
  echo "Shutting down OceanEmbed servers..."
  if [ -n "$BACKEND_PID" ]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [ -n "$FRONTEND_PID" ]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  # Clean up Windows python and node if running on Windows
  taskkill //F //IM python.exe 2>/dev/null || taskkill.exe /F /IM python.exe 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 1. Start Python FastAPI Backend
echo "[1/3] Starting ML Backend (FastAPI on port 8000)..."
(
  cd "$BACKEND_DIR"
  python -m uvicorn api_server:app --host 0.0.0.0 --port 8000 || python3 -m uvicorn api_server:app --host 0.0.0.0 --port 8000
) &
BACKEND_PID=$!

# 2. Start Frontend dev server
echo "[2/3] Starting Frontend server (port 5500)..."
(
  cd "$FRONTEND_DIR"
  npm run dev
) &
FRONTEND_PID=$!

# 3. Wait for servers to spin up
echo "[3/3] Waiting for servers to initialize..."
sleep 3

# 4. Open in Chrome
echo "Opening Chrome at $EXPLORE_URL..."

if [ -f "/c/Program Files/Google/Chrome/Application/chrome.exe" ]; then
  "/c/Program Files/Google/Chrome/Application/chrome.exe" "$EXPLORE_URL" &
elif [ -f "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" ]; then
  "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" "$EXPLORE_URL" &
elif [ -f "C:/Program Files/Google/Chrome/Application/chrome.exe" ]; then
  "C:/Program Files/Google/Chrome/Application/chrome.exe" "$EXPLORE_URL" &
elif command -v cmd.exe &>/dev/null; then
  cmd.exe /c start chrome "$EXPLORE_URL" 2>/dev/null || cmd.exe /c start "$EXPLORE_URL"
elif command -v explorer.exe &>/dev/null; then
  explorer.exe "$EXPLORE_URL"
elif command -v start &>/dev/null; then
  start "$EXPLORE_URL"
fi

echo "================================================"
echo " OceanEmbed is RUNNING!"
echo " Frontend: $EXPLORE_URL"
echo " Backend:  http://localhost:8000"
echo " Press Ctrl+C in this window to stop both servers."
echo "================================================"

# Wait for both processes
wait
