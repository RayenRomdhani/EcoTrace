#!/bin/bash
# run.sh — EcoTrace backend startup script for Mac / Linux teammates
# Run with:  bash run.sh

# ── Step 1: Set the Gemini API key ───────────────────────────────────────────
export GEMINI_API_KEY="AIzaSyC70eUd1a9Td-dnhlDzC5fgpNbh94u_x5s"

# ── Step 2: Move into the BackEND folder (in case script is run from elsewhere)
cd "$(dirname "$0")"

# ── Step 3: Install Python dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# ── Step 4: Start the Flask server
echo ""
echo "Starting EcoTrace backend on http://localhost:5000 ..."
echo "Press Ctrl+C to stop."
echo ""
python app.py
