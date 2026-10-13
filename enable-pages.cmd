@echo off
REM ============================================================
REM  Turn on GitHub Pages for swishria/mall-delivery.
REM
REM  Run this AFTER the push succeeded. It asks for the same
REM  token, then asks the GitHub API to publish the site.
REM
REM  You can also just do it in the browser:
REM    https://github.com/swishria/mall-delivery/settings/pages
REM    Source: Deploy from a branch / main / (root)  then Save
REM
REM  Implementation note: the HTTP call is made by Node
REM  (tools\github-pages.mjs), not by PowerShell, because some
REM  Windows setups cannot do HTTPS from .NET/schannel. Node
REM  ships its own TLS stack.
REM
REM  ASCII-only on purpose (cmd.exe garbles UTF-8 Chinese).
REM ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "OWNER=swishria"
set "REPO=mall-delivery"
for /f "delims=" %%i in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "BRANCH=%%i"
if "!BRANCH!"=="" set "BRANCH=main"

echo.
echo ============================================
echo   Enable GitHub Pages
echo   !OWNER!/!REPO!   branch=!BRANCH!
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] node not found in PATH. Do it in the browser instead:
  echo       https://github.com/!OWNER!/!REPO!/settings/pages
  pause & exit /b 1
)

echo Paste your GitHub token (same one as before is fine):
echo.
set "TOKEN="
set /p "TOKEN=Token: "
if "!TOKEN!"=="" ( echo [X] No token. Aborted. & pause & exit /b 1 )
set "TOKEN=!TOKEN: =!"
set "TOKEN=!TOKEN:"=!"

echo.
echo Asking GitHub ...
set "RESULT="
for /f "delims=" %%r in ('node "tools\github-pages.mjs" !OWNER! !REPO! !BRANCH! !TOKEN! 2^>^&1') do set "RESULT=%%r"

echo   !RESULT!

set "STATUS=!RESULT:~0,2!"
if "!STATUS!"=="OK" (
  echo.
  echo   Pages is on. It takes 1-3 minutes to build the first time.
  echo.
  echo       https://!OWNER!.github.io/!REPO!/
  echo.
  echo   Watch the build here:
  echo       https://github.com/!OWNER!/!REPO!/actions
  echo.
  echo   SECURITY: delete the token now, it is no longer needed:
  echo       https://github.com/settings/tokens
) else (
  echo.
  echo   GitHub did not publish the site ^(see the message above^).
  echo   Do it in the browser instead:
  echo       https://github.com/!OWNER!/!REPO!/settings/pages
  echo     Source: Deploy from a branch
  echo     Branch: !BRANCH!    Folder: / ^(root^)
  echo     then press Save.
)
echo.
pause
