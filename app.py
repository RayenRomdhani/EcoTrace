# app.py — EcoTrace Flask backend
# Receives events from the Chrome extension, stores them, and serves stats.
# The Chrome extension (Person A) talks to /api/event and /api/stats.
# The dashboard (Person C) is rendered at /dashboard.

import os
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS

# Import our own modules.
from calculator import calculate_gallons
from database import init_db, insert_event, get_today_stats, get_week_history, get_credits

# ─── App Setup ────────────────────────────────────────────────────────────────

app = Flask(__name__)

# Apply CORS to all /api/* routes so the Chrome extension can call them
# without the browser blocking the request due to cross-origin restrictions.
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ─── Route 1: POST /api/event ─────────────────────────────────────────────────

@app.route("/api/event", methods=["POST"])
def receive_event():
    """
    Accepts a JSON body from the Chrome extension describing an AI site visit.
    Validates the fields, calculates water usage, stores it, and returns the result.

    Expected JSON body:
        {
            "site":      "gemini.google.com",
            "model":     "gemini-pro",
            "type":      "chat",
            "timestamp": "2025-05-02T20:30:00"
        }

    Returns 400 if any required field is missing.
    Returns 200 with {"status": "ok", "gallons": float} on success.
    """
    try:
        # Parse the incoming JSON body sent by the extension.
        incoming_data = request.get_json(silent=True)

        # Reject the request if the body is not valid JSON or is empty.
        if not incoming_data:
            return jsonify({"error": "missing fields"}), 400

        # Extract the four required fields from the request body.
        site      = incoming_data.get("site")
        model     = incoming_data.get("model")
        usage_type = incoming_data.get("type")
        timestamp = incoming_data.get("timestamp")

        # If any required field is absent or empty, return a 400 error.
        if not all([site, model, usage_type, timestamp]):
            return jsonify({"error": "missing fields"}), 400

        # Calculate how many gallons this interaction cost.
        gallons = calculate_gallons(site, model, usage_type)

        # Store the event in the database.
        insert_event(site, model, usage_type, gallons, timestamp)

        # Return success with the gallon value so the extension can log it.
        return jsonify({"status": "ok", "gallons": gallons}), 200

    except Exception as error:
        # Catch any unexpected error and return a safe 500 response.
        print(f"[EcoTrace] Error in /api/event: {error}")
        return jsonify({"error": "internal server error"}), 500


# ─── Route 2: GET /api/stats ──────────────────────────────────────────────────

@app.route("/api/stats", methods=["GET"])
def get_stats():
    """
    Returns today's usage summary and the last 7 days of daily history.
    The Chrome extension calls this to update the badge number.

    Returns:
        {
            "today_gallons": float,
            "today_queries": int,
            "week_gallons":  float,
            "history": [
                {"date": "YYYY-MM-DD", "gallons": float},
                ...
            ]
        }
    """
    try:
        # Fetch today's totals from the database.
        today_stats = get_today_stats()

        # Fetch the per-day breakdown for the last 7 days.
        week_history = get_week_history()

        # Sum all daily gallon values to get the 7-day total.
        week_total_gallons = round(sum(day["gallons"] for day in week_history), 4)

        return jsonify({
            "today_gallons": today_stats["today_gallons"],
            "today_queries": today_stats["today_queries"],
            "week_gallons":  week_total_gallons,
            "history":       week_history,
        }), 200

    except Exception as error:
        print(f"[EcoTrace] Error in /api/stats: {error}")
        return jsonify({"error": "internal server error"}), 500


# ─── Route 3: GET /api/credits ────────────────────────────────────────────────

@app.route("/api/credits", methods=["GET"])
def get_credits_route():
    """
    Returns water credits earned by the user based on below-average usage days.

    Returns:
        {
            "credits":       int,
            "gallons_saved": float,
            "streak_days":   int
        }
    """
    try:
        # Delegate all credit logic to database.py.
        credits_data = get_credits()
        return jsonify(credits_data), 200

    except Exception as error:
        print(f"[EcoTrace] Error in /api/credits: {error}")
        return jsonify({"error": "internal server error"}), 500


# ─── Route 4: GET /api/summary ────────────────────────────────────────────────
# This route is kept for potential future use
# but is no longer called by the dashboard

@app.route("/api/summary", methods=["GET"])
def get_summary():
    """
    Uses the Gemini API to generate a two-sentence natural-language summary
    of the user's weekly AI water usage.

    Reads the GEMINI_API_KEY environment variable for authentication.
    To set it:
        Mac/Linux: export GEMINI_API_KEY="your_key_here"
        Windows:   set GEMINI_API_KEY="your_key_here"

    Returns:
        {"summary": "Two sentences from Gemini."}
    On any failure:
        {"summary": "Summary unavailable right now."}
    """
    try:
        # Pull the Gemini API key from the environment — never hard-code secrets.
        gemini_api_key = os.environ.get("GEMINI_API_KEY", "")

        # If the key is missing, skip the API call and return the fallback.
        if not gemini_api_key:
            print("[EcoTrace] GEMINI_API_KEY is not set.")
            return jsonify({"summary": "Summary unavailable right now."}), 200

        # Gather the data we will describe to Gemini.
        today_stats  = get_today_stats()
        week_history = get_week_history()

        # Calculate the 7-day total for the plain-text description.
        week_total_gallons = round(sum(day["gallons"] for day in week_history), 2)
        week_total_queries = today_stats["today_queries"]  # today's count available

        # Build a plain-text description of the data to hand to Gemini.
        data_description = (
            f"User made {week_total_queries} AI queries today consuming "
            f"{today_stats['today_gallons']} gallons of water. "
            f"Over the past 7 days, total water consumption was "
            f"{week_total_gallons} gallons."
        )

        # Compose the exact prompt the spec requires.
        prompt_text = (
            "You are a data narrator for an app that tracks water usage from "
            "AI tools. Write exactly 2 sentences summarizing this user's "
            "weekly AI water consumption in a neutral, factual tone. "
            "Do not give advice. "
            f"Data: {data_description}"
        )

        # Import and configure the new Gemini SDK (google-genai, replaces deprecated google-generativeai).
        from google import genai

        # Create a client using the API key.
        gemini_client = genai.Client(api_key=gemini_api_key)

        # Send the prompt to the free-tier flash model and get the response.
        gemini_response = gemini_client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt_text,
        )

        # Extract the text from the response object.
        summary_text = gemini_response.text.strip()

        return jsonify({"summary": summary_text}), 200

    except Exception as error:
        # Any Gemini failure (quota, network, bad key) returns the safe fallback.
        print(f"[EcoTrace] Gemini call failed: {error}")
        return jsonify({"summary": "Summary unavailable right now."}), 200


# ─── Route 5: GET /dashboard ──────────────────────────────────────────────────

@app.route("/dashboard", methods=["GET"])
def dashboard():
    """
    Renders the dashboard page that Person C will design.
    Passes live data to the template so Person C can use it with Jinja2.

    Template variables available inside dashboard.html:
        stats   — dict from get_today_stats()
        credits — dict from get_credits()
        history — list from get_week_history()
    """
    try:
        # Fetch all the data the dashboard template will need.
        stats_data   = get_today_stats()    # today_gallons, today_queries
        credits_data = get_credits()
        history_data = get_week_history()

        # get_today_stats() doesn't include week_gallons, but the template needs it.
        # Compute it here from the history data so the template has everything in one dict.
        stats_data["week_gallons"] = round(
            sum(day["gallons"] for day in history_data), 4
        )

        # Render the template, passing the data as named variables.
        return render_template(
            "dashboard.html",
            stats=stats_data,
            credits=credits_data,
            history=history_data,
        )

    except Exception as error:
        print(f"[EcoTrace] Error rendering /dashboard: {error}")
        return "<p>Dashboard error — check the server logs.</p>", 500


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Create the database and table if they don't exist yet.
    init_db()
    # Start Flask in debug mode on port 5000.
    app.run(debug=True, port=5000)
