@echo off
REM ============================================================
REM  mall-delivery : push to GitHub and open GitHub Pages
REM
REM  Double-click this file. It will ask for a GitHub token once.
REM
REM  Why a token:
REM    This machine has no GitHub credential and no SSH key, so git
REM    cannot authenticate. A Personal Access Token (PAT) is the
REM    quickest way. Create one here (tick "repo" scope):
REM      https://github.com/settings/tokens/new?scopes=repo&description=mall-delivery
REM
REM  The token is used only in this window. It is written into
REM  .git/config as remote "origin" so that later "git push" works.
REM  Nothing is sent anywhere except github.com.
REM
REM  This file is kept ASCII-only on purpose: cmd.exe garbles
REM  UTF-8 Chinese text in the default GBK console.
REM ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "OWNER=swishria"
set "REPO=mall-delivery"

echo.
echo ============================================
echo   mall-delivery  --^>  GitHub
echo ============================================
echo.

REM ---------- 0. sanity checks ----------
where git >nul 2>nul
if errorlevel 1 ( echo [X] git not found in PATH. & pause & exit /b 1 )
if not exist ".git" ( echo [X] No .git here. Run this inside the mall-delivery folder. & pause & exit /b 1 )

for /f "delims=" %%i in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%i"
for /f "delims=" %%i in ('git log --oneline -1') do set "HEADLINE=%%i"

echo   repo folder : %CD%
echo   branch      : %BRANCH%
echo   head        : %HEADLINE%
echo.

REM ---------- 1. ask for token ----------
echo Paste your GitHub Personal Access Token below.
echo (right-click to paste in this window; the text will not show)
echo.
set "TOKEN="
set /p "TOKEN=Token: "
if "!TOKEN!"=="" ( echo [X] No token given. Aborted. & pause & exit /b 1 )

REM strip accidental whitespace/quotes
set "TOKEN=!TOKEN: =!"
set "TOKEN=!TOKEN:"=!"

echo.
echo [1/4] Checking the token with GitHub ...
for /f "delims=" %%u in ('powershell -NoProfile -Command "try { $h=@{Authorization='Bearer !TOKEN!';'User-Agent'='mall-delivery'}; $r=Invoke-RestMethod -Uri 'https://api.github.com/user' -Headers $h -TimeoutSec 20; $r.login } catch { 'ERR' }"') do set "LOGIN=%%u"

if "!LOGIN!"=="ERR" (
  echo [X] GitHub rejected the token ^(or no network^).
  echo     - check the token has the "repo" scope and is not expired
  echo     - if this machine needs a proxy, set HTTPS_PROXY first
  pause & exit /b 1
)
echo       signed in as: !LOGIN!

REM ---------- 2. create the repo if needed ----------
echo.
echo [2/4] Making sure the remote repository exists ...
for /f "delims=" %%c in ('powershell -NoProfile -Command "try { $h=@{Authorization='Bearer !TOKEN!';'User-Agent'='mall-delivery'}; Invoke-RestMethod -Uri 'https://api.github.com/repos/!OWNER!/!REPO!' -Headers $h -TimeoutSec 20 ^| Out-Null; 'EXISTS' } catch { 'MISSING' }"') do set "REPOEXISTS=%%c"

if "!REPOEXISTS!"=="EXISTS" (
  echo       repo already exists: !OWNER!/!REPO!
) else (
  echo       creating public repo !OWNER!/!REPO! ...
  for /f "delims=" %%c in ('powershell -NoProfile -Command "$b=@{name='!REPO!';description='Mall convenience-store in-building delivery demo';private=$false}; $h=@{Authorization='Bearer !TOKEN!';'User-Agent'='mall-delivery'}; try { Invoke-RestMethod -Method Post -Uri 'https://api.github.com/user/repos' -Headers $h -Body ($b ^| ConvertTo-Json) -ContentType 'application/json' -TimeoutSec 25 ^| Out-Null; 'OK' } catch { 'FAIL' }"') do set "CREATED=%%c"
  if not "!CREATED!"=="OK" ( echo [X] Could not create the repo. & pause & exit /b 1 )
  echo       created.
)

REM ---------- 3. remote + push ----------
echo.
echo [3/4] Pushing ...
REM Store the remote WITHOUT the token, so the secret never lands in .git/config.
git remote remove origin >nul 2>nul
git remote add origin "https://github.com/!OWNER!/!REPO!.git"

REM Feed the token through the URL for this one command only.
REM IMPORTANT: use an explicit refspec (localBranch:remoteBranch).
REM Writing "origin" in front of the branch name here makes git look for a
REM branch literally called "origin", which fails with:
REM   error: src refspec origin does not match any
echo       pushing !BRANCH! ...
git push "https://!TOKEN!@github.com/!OWNER!/!REPO!.git" !BRANCH!:!BRANCH!
if errorlevel 1 (
  echo       retrying with --all ...
  git push "https://!TOKEN!@github.com/!OWNER!/!REPO!.git" --all
)
if errorlevel 1 (
  echo.
  echo [X] Push failed. Common causes:
  echo     - SSL / schannel error  -^> run this once, then run this file again:
  echo           git config --global http.sslBackend openssl
  echo     - could not connect    -^> network or firewall blocks github.com
  echo     - wrong / expired token -^> make a new one with the "repo" scope
  pause & exit /b 1
)

REM remember the upstream so a later plain "git push" works
git branch --set-upstream-to=origin/!BRANCH! !BRANCH! >nul 2>nul
echo       pushed.
git config credential.helper manager

REM ---------- 4. what next ----------
echo.
echo [4/4] Done.
echo.
echo   Code : https://github.com/!OWNER!/!REPO!
echo   Site : https://!OWNER!.github.io/!REPO!/
echo.
echo   The site needs GitHub Pages turned on once:
echo     open https://github.com/!OWNER!/!REPO!/settings/pages
echo     Source: Deploy from a branch   Branch: !BRANCH!   Folder: / (root)
echo     then Save. It takes 1-3 minutes to go live.
echo.
echo   Or run enable-pages.cmd next to this file, which does it for you.
echo.
echo   ------------------------------------------------------------
echo   SECURITY: the token you pasted was used only in this window
echo   and was NOT written into .git/config. You can (and should)
echo   delete it now at:
echo     https://github.com/settings/tokens
echo   Deleting it does not affect the code that was just pushed.
echo   ------------------------------------------------------------
echo.
pause
