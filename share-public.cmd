@echo off
REM ============================================================
REM  Get a TEMPORARY PUBLIC URL for this demo, no account needed.
REM
REM  What it does:
REM    1. downloads cloudflared.exe into ..\tools (once)
REM    2. serves this project on a local port
REM    3. opens a Cloudflare "quick tunnel" and prints the public
REM       https://xxxx.trycloudflare.com address
REM
REM  The URL works only while this window stays open, and it stops
REM  working the moment you close it. Good for showing a friend.
REM
REM  WARNING: while the tunnel is up, ANYONE with the URL can open
REM  the demo. It is a demo with no private data, so that is fine -
REM  but close the window when you are done.
REM
REM  ASCII-only on purpose (cmd.exe garbles UTF-8 Chinese).
REM ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"
cd ..

set "PORT=8000"
set "ROOT=%CD%"
set "TOOLS=%ROOT%\tools"
set "CF=%TOOLS%\cloudflared.exe"

REM ---------- 1. tools ----------
if not exist "%TOOLS%" mkdir "%TOOLS%"

if not exist "%CF%" (
  echo.
  echo [1/3] cloudflared.exe not found, downloading ^(~70 MB^) ...
  call "%~dp0download.cmd" ^
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" ^
    "%CF%"
  if errorlevel 1 (
    echo [X] Download failed. Download it manually from:
    echo     https://github.com/cloudflare/cloudflared/releases/latest
    echo     and save it as:  %CF%
    pause & exit /b 1
  )
  echo       saved to %CF%
) else (
  echo.
  echo [1/3] cloudflared.exe already present.
)

"%CF%" --version >nul 2>nul
if errorlevel 1 (
  echo [X] cloudflared.exe will not run. Delete it and try again.
  pause & exit /b 1
)

REM ---------- 2. local server ----------
echo.
echo [2/3] Starting local server on port %PORT% ...
where python >nul 2>nul
if errorlevel 1 (
  echo [X] python not found in PATH. Install Python, or start any static
  echo     server yourself and run cloudflared manually.
  pause & exit /b 1
)
start "mall-delivery server" /min cmd /c python -m http.server %PORT% --bind 127.0.0.1 --directory "%ROOT%"
timeout /t 2 /nobreak >nul

REM ---------- 3. tunnel ----------
echo.
echo [3/3] Opening the tunnel. Look for the https://....trycloudflare.com
echo       line below - that is the address to share.
echo.
echo       Press Ctrl+C in THIS window to shut everything down.
echo.

"%CF%" tunnel --url http://127.0.0.1:%PORT%

echo.
echo Tunnel closed. The public URL no longer works.
pause
