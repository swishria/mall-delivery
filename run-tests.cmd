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

set FAILED=0

echo.
echo ==== 1/4  HTML tag nesting ====
"%NODE%" test\check-html.js
if errorlevel 1 set FAILED=1

echo.
echo ==== 2/4  core logic ====
"%NODE%" test\core.test.js
if errorlevel 1 set FAILED=1

echo.
echo ==== 3/4  layout / CSS regression ====
"%NODE%" test\layout.test.js
if errorlevel 1 set FAILED=1

echo.
echo ==== 4/4  UI smoke test ====
"%NODE%" test\smoke.js
if errorlevel 1 set FAILED=1

echo.
if "%FAILED%"=="0" (
  echo ALL TESTS PASSED.
) else (
  echo SOME TESTS FAILED - see above.
)
echo.
pause
