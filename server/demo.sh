#!/usr/bin/env bash
# CodeSage browser demo: builds the core pipeline, starts the backend API server and the web UI
# dev server together, and points you at the app. This is the primary, judge-facing demo path.
#
# Usage: bash scripts/demo.sh
# Then open http://localhost:5173, click "Load demo (buggy-react-login)", and click "Investigate".
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"

echo "== CodeSage demo: browser UI =="
echo "Root: $ROOT"

if [ ! -f .env ] && [ -f .env.example ]; then
  echo "(no .env found — copying .env.example; set ANTHROPIC_API_KEY in .env for the full live LLM demo)"
  cp .env.example .env
fi

echo
echo "[1/4] Installing dependencies (root, server, web) if needed..."
[ -d node_modules ] || (cd "$ROOT" && npm install)
[ -d server/node_modules ] || (cd "$ROOT/server" && npm install)
[ -d web/node_modules ] || (cd "$ROOT/web" && npm install)

echo
echo "[2/4] Building the core TypeScript pipeline + CLI..."
npm run build

echo
echo "[3/4] Starting the API server (port 8787) and web UI (port 5173)..."

cleanup() {
  echo
  echo "Shutting down demo processes..."
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(cd "$ROOT/server" && npm run start) &
SERVER_PID=$!

(cd "$ROOT/web" && npm run dev) &
WEB_PID=$!

echo
echo "[4/4] CodeSage is starting up."
echo "  Backend API:  http://localhost:8787/api/health"
echo "  Web UI:       http://localhost:5173"
echo
echo "Open http://localhost:5173 in your browser, click 'Load demo (buggy-react-login)',"
echo "then click 'Investigate' to run the full understand -> investigate -> fix -> verify pipeline"
echo "against the included buggy React login fixture."
echo
echo "Press Ctrl+C to stop both processes."

wait
