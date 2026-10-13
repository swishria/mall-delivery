@echo off
REM ============================================================
REM  Serve this project folder over the local network.
REM  Anyone on the same Wi-Fi / hotspot can open the URL below.
REM
REM  ASCII-only on purpose: cmd.exe garbles UTF-8 Chinese text in
REM  a GBK console. Press Ctrl+C to stop the server.
REM ============================================================
setlocal
cd /d "%~dp0"
cd ..

set "PORT=8000"
set "ROOT=%CD%"

where python >nul 2>nul
if errorlevel 1 (
  echo [X] python not found in PATH.
  echo     Any static server works, e.g.:  npx serve .
  pause & exit /b 1
)

echo.
echo ============================================
echo   Serving: %ROOT%
echo   Port:    %PORT%
echo ============================================
echo.
echo   On this machine:
echo     http://127.0.0.1:%PORT%/mall-delivery/index.html
echo.
echo   Other devices on the same Wi-Fi / hotspot - use one of these:
echo.

REM list the machine's IPv4 addresses, no fancy quoting involved
ipconfig | findstr /C:"IPv4" | findstr /V "169.254"

echo.
echo   Build the URL like:
echo     http://^<one of the IPs above^>:%PORT%/mall-delivery/index.html
echo.
echo   NOTE: each visitor sees their OWN orders. Data is stored in
echo         each browser, it is NOT shared. See README section 7.
echo.
echo   Press Ctrl+C to stop.
echo.

python -m http.server %PORT% --bind 0.0.0.0 --directory "%ROOT%"
pause
