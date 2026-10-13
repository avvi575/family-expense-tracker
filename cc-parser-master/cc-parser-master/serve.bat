@echo off
setlocal

set PYTHON=D:\project1\family-expense-tracker\cc-parser-master\cc-parser-master\.venv\Scripts\python.exe
set DIR=D:\project1\family-expense-tracker\cc-parser-master\cc-parser-master\web

if "%~1"=="" (
    set PORT=3000
) else (
    set PORT=%~1
)

echo Starting cc-parser web UI on port %PORT%
echo Serving directory: %DIR%
echo Open http://localhost:%PORT%/ in your browser
echo Press Ctrl+C to stop.
echo.

"%PYTHON%" -m http.server %PORT% --directory "%DIR%"
