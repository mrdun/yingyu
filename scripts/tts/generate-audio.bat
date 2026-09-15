@echo off
REM Generate pronunciation audio for all course sentences (Kokoro, local CPU).
REM Double-click to run. Resumable: already-generated sentences are skipped.
REM Keep this file ASCII-only: Chinese text in a .bat breaks on GBK Windows.
chcp 65001 >nul
setlocal

set KPY=C:\Users\mrdun\github\kokoro-tts\.venv\Scripts\python.exe
set REPO=%~dp0..\..

if not exist "%KPY%" (
  echo [ERROR] Kokoro python not found: %KPY%
  echo Install it first, or edit KPY in this file.
  pause
  exit /b 1
)

cd /d "%REPO%"
echo === Generating pronunciation audio (speed 0.85) ===
echo Work dir: %CD%
echo.

"%KPY%" scripts\tts\generate-audio.py --speed 0.85
set RC=%ERRORLEVEL%

echo.
echo === Hash parity check (frontend must compute the same filenames) ===
node scripts\tts\tests\hash-parity.mjs

echo.
if "%RC%"=="0" (echo [OK] Audio generated.) else (echo [FAIL] Exit code %RC%)
pause
endlocal
