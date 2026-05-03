@echo off
:: run.bat — EcoTrace backend startup script for Windows
:: Double-click this file (or run it in a terminal) to start the Flask server.
:: It sets the Gemini API key as an environment variable, then launches app.py.

:: ── Step 1: Set the Gemini API key ───────────────────────────────────────────
:: This key is used by the /api/summary route to call the Gemini AI model.
:: It is stored here as an environment variable — it is NOT hardcoded in app.py.
set GEMINI_API_KEY=AIzaSyC70eUd1a9Td-dnhlDzC5fgpNbh94u_x5s

:: ── Step 2: Move into the BackEND folder (in case script is run from elsewhere)
cd /d "%~dp0"

:: ── Step 3: Install Python dependencies (safe to run repeatedly, skips if done)
echo Installing dependencies...
pip install -r requirements.txt

:: ── Step 4: Start the Flask server ───────────────────────────────────────────
echo.
echo Starting EcoTrace backend on http://localhost:5000 ...
echo Press Ctrl+C to stop the server.
echo.
python app.py

:: Keep the window open if the server crashes, so you can read the error.
pause
