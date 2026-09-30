#!/bin/bash
# Builds release/*.dmg for one architecture (arm64 | x64; defaults to this Mac's chip).
# The app is ad-hoc signed before the DMG is made: Apple Silicon refuses to launch code whose
# signature was invalidated by packaging ("app is damaged"), and we have no Developer ID yet.
set -euo pipefail
cd "$(dirname "$0")/../.."

ARCH="${1:-$( [ "$(uname -m)" = "arm64" ] && echo arm64 || echo x64 )}"
export CSC_IDENTITY_AUTO_DISCOVERY=false

npm run build
npx electron-builder --mac dir "--$ARCH" --publish never

APP="$(ls -d release/mac*/*.app | head -n 1)"
echo "Ad-hoc signing $APP"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"

npx electron-builder --mac dmg "--$ARCH" --publish never --prepackaged "$APP"
ls -lh release/*.dmg
