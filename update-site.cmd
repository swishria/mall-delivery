@echo off
REM ============================================================
REM  Upload whatever you have committed to GitHub.
REM  GitHub Pages then rebuilds the site automatically.
REM
REM  Double-click this file. That is all.
REM
REM  If git asks for credentials:
REM    Username : swishria
REM    Password : paste your Personal Access Token
REM  Windows remembers it after the first time.
REM
REM  ASCII-only on purpose (cmd.exe garbles UTF-8 Chinese).
REM ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 ( echo [X] git not found in PATH. & pause & exit /b 1 )
if not exist ".git" ( echo [X] No .git here. & pause & exit /b 1 )

for /f "delims=" %%i in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%i"
for /f "delims=" %%i in ('git log --oneline -1') do set "HEADLINE=%%i"

echo.
echo ============================================
echo   Upload to GitHub
echo ============================================
echo.
echo   branch : !BRANCH!
echo   latest : !HEADLINE!
echo.

REM anything uncommitted?
for /f "delims=" %%s in ('git status --porcelain 2^>nul') do (
  echo   NOTE: you have uncommitted changes, they will NOT be uploaded.
  goto :committed
)
:committed

echo [1/2] Syncing with the remote ...
set "FETCHLOG=%TEMP%\ml-fetch.log"
git fetch origin 2>"%FETCHLOG%"
set "FETCHFAIL=0"
if errorlevel 1 set "FETCHFAIL=1"

if "!FETCHFAIL!"=="1" (
  REM This machine's git defaults to the Windows schannel TLS backend, which
  REM fails with SEC_E_NO_CREDENTIALS when the crypto store is not reachable.
  REM Git also ships OpenSSL - switch to it once, then retry.
  findstr /I "schannel SEC_E_NO_CREDENTIALS" "%FETCHLOG%" >nul 2>nul
  if not errorlevel 1 (
    echo.
    echo   HTTPS failed because git is using the "schannel" backend.
    echo   Switching this machine to the bundled OpenSSL backend ...
    git config --global http.sslBackend openssl
    if errorlevel 1 (
      echo   [X] Could not write the git config.
      pause & exit /b 1
    )
    echo   Done. Retrying ...
    git fetch origin 2>"%FETCHLOG%"
    set "FETCHFAIL=0"
    if errorlevel 1 set "FETCHFAIL=1"
  )
)

if "!FETCHFAIL!"=="1" (
  echo.
  echo   Still could not reach GitHub. The exact git message:
  echo.
  type "%FETCHLOG%"
  echo.
  echo   Common causes:
  echo     - no network, or a firewall blocks github.com
  echo     - a proxy is required
  pause & exit /b 1
)
del "%FETCHLOG%" >nul 2>nul

echo.
echo [2/2] Uploading ...
git push origin !BRANCH!:!BRANCH!
if errorlevel 1 (
  echo.
  echo [X] Upload failed. See the message above.
  echo     - "Authentication failed" -^> the token is wrong or expired.
  echo       Make a new one: https://github.com/settings/tokens
  echo     - "rejected / non-fast-forward" -^> the remote has commits you
  echo       do not have. Run:  git pull --rebase origin !BRANCH!
  pause & exit /b 1
)

echo.
echo ============================================
echo   Uploaded.
echo ============================================
echo.
echo   GitHub Pages will rebuild in 1-2 minutes:
echo     https://swishria.github.io/mall-delivery/
echo.
echo   Watch the build:
echo     https://github.com/swishria/mall-delivery/actions
echo.
echo   On your phone: pull down to refresh, or open in a new tab.
echo.
pause
