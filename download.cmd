@echo off
REM ============================================================
REM  Download a file, trying several tools in turn.
REM
REM  Some Windows setups cannot use schannel-based HTTPS (system
REM  curl.exe, and git's default backend) - often because a
REM  security policy blocks the credential store. Node ships its
REM  own TLS stack, so it is tried first.
REM
REM  Usage:  download.cmd  <url>  <output-file>
REM  Exits 0 on success, 1 if every method failed.
REM  ASCII-only on purpose.
REM ============================================================
setlocal
set "URL=%~1"
set "OUT=%~2"

if "%URL%"=="" ( echo usage: download.cmd ^<url^> ^<output^> & exit /b 2 )
if "%OUT%"=="" ( echo usage: download.cmd ^<url^> ^<output^> & exit /b 2 )

REM ---------- method 1: node (own TLS stack, most reliable) ----------
where node >nul 2>nul
if not errorlevel 1 (
  echo       [try 1] node ...
  node -e "const fs=require('fs');fetch(process.argv[1],{redirect:'follow'}).then(async r=>{if(!r.ok)throw new Error('HTTP '+r.status);const b=Buffer.from(await r.arrayBuffer());fs.writeFileSync(process.argv[2],b);console.log('      '+ (b.length/1048576).toFixed(1) +' MB via node');}).catch(e=>{console.error('      node failed: '+e.message);process.exit(1);})" "%URL%" "%OUT%"
  if not errorlevel 1 if exist "%OUT%" ( endlocal & exit /b 0 )
)

REM ---------- method 2: git's bundled curl (openssl) ----------
set "GCURL=%ProgramFiles%\Git\mingw64\bin\curl.exe"
if exist "%GCURL%" (
  echo       [try 2] git curl ...
  "%GCURL%" -L --fail -o "%OUT%" "%URL%"
  if not errorlevel 1 if exist "%OUT%" ( endlocal & exit /b 0 )
)

REM ---------- method 3: system curl ----------
where curl >nul 2>nul
if not errorlevel 1 (
  echo       [try 3] system curl ...
  curl -L --fail -o "%OUT%" "%URL%"
  if not errorlevel 1 if exist "%OUT%" ( endlocal & exit /b 0 )
)

REM ---------- method 4: powershell ----------
where powershell >nul 2>nul
if not errorlevel 1 (
  echo       [try 4] powershell ...
  powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { Invoke-WebRequest -Uri '%URL%' -OutFile '%OUT%' -UseBasicParsing -TimeoutSec 300; exit 0 } catch { Write-Host ('      ' + $_.Exception.Message); exit 1 }"
  if not errorlevel 1 if exist "%OUT%" ( endlocal & exit /b 0 )
)

echo       all download methods failed.
endlocal & exit /b 1
