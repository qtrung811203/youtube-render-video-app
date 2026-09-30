#!/bin/bash
# macOS launcher: double-click in Finder to install dependencies (first run), build if sources changed, and start the app.
cd "$(dirname "$0")/../.." || exit 1

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display alert "Chưa tìm thấy Node.js" message "Hãy cài Node.js 20+ (https://nodejs.org) rồi mở lại."'
  exit 1
fi

if [ ! -x node_modules/.bin/electron ]; then
  echo "Đang cài dependencies (lần đầu)..."
  npm install || exit 1
fi

node scripts/ensure-build.mjs || exit 1
npm start
