@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  msg * "Chua tim thay Node.js. Hay cai Node.js 20+ truoc khi mo ung dung."
  exit /b 1
)

if not exist "node_modules\.bin\electron.cmd" (
  start "Background Video Renderer - Setup" /min cmd.exe /c "call npm install && call node scripts\ensure-build.mjs && call npm start"
) else (
  start "Background Video Renderer" /min cmd.exe /c "call node scripts\ensure-build.mjs && call npm start"
)

exit /b 0
