#!/usr/bin/env bash
# CodeSage CLI demo (secondary interface): a single non-interactive command that builds the
# project and runs the full pipeline against the included buggy-react-login fixture, printing the
# verification status and writing a full Markdown/JSON report. Useful for automated/judged runs
# that don't need a browser.
#
# Usage: bash scripts/demo-cli.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"
OUT_DIR="$ROOT/codesage-report-cli-demo"

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
fi

echo "== CodeSage demo: CLI =="
[ -d node_modules ] || npm install
[ -d examples/buggy-react-login/node_modules ] || (cd examples/buggy-react-login && npm install)

echo
echo "Building..."
npm run build

echo
echo "Running: codesage investigate --repo examples/buggy-react-login --bug \"...\" --out $OUT_DIR"
rm -rf "$OUT_DIR"
node dist/cli.js investigate \
  --repo examples/buggy-react-login \
  --bug "After a user enters correct credentials and clicks Log in, the app shows they are logged in, but it never navigates to /dashboard. The auth state updates correctly, navigation just doesn't happen." \
  --out "$OUT_DIR"

echo
echo "Full report: $OUT_DIR/report.md"
