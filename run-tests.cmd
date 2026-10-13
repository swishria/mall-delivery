@echo off
REM Run all tests. Double-click this file.
REM (Kept ASCII-only on purpose: cmd.exe garbles UTF-8 Chinese under the default GBK console.)
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  set "NODE=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
) else (
  set "NODE=node"
)

echo.
echo ==== 1/2  core logic tests ====
"%NODE%" test\core.test.js
set LOGIC=%ERRORLEVEL%

echo.
echo ==== 2/2  UI smoke test ====
"%NODE%" test\smoke.js
set SMOKE=%ERRORLEVEL%

echo.
if "%LOGIC%"=="0" if "%SMOKE%"=="0" (
  echo ALL TESTS PASSED.
) else (
  echo FAILED: core=%LOGIC% smoke=%SMOKE%
)
echo.
pause
