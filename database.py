# database.py — EcoTrace SQLite database layer
# Manages all reads and writes to ecotrace.db.
# The database file is created automatically on first run — no manual setup needed.

import sqlite3
from datetime import date, timedelta

# Path to the SQLite database file.
# It will be created in the same directory as this script on first use.
DB_PATH = "ecotrace.db"


def get_connection():
    """
    Open and return a connection to the SQLite database.
    Uses check_same_thread=False so Flask threads can share it safely.

    Returns:
        sqlite3.Connection
    """
    connection = sqlite3.connect(DB_PATH, check_same_thread=False)
    # Return rows as dict-like objects so we can access columns by name.
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    """
    Create the events table if it does not already exist.
    Safe to call every time the server starts — does nothing if the table exists.

    Table columns:
        id        — auto-incrementing primary key
        site      — AI site hostname, e.g. "claude.ai"
        model     — model identifier, e.g. "claude"
        type      — "chat" or "image"
        gallons   — water cost of this interaction as a float
        timestamp — full ISO timestamp string from the extension
        date      — YYYY-MM-DD portion extracted from timestamp
    """
    connection = get_connection()
    cursor = connection.cursor()

    # Create the table only if it doesn't exist yet.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            site      TEXT    NOT NULL,
            model     TEXT    NOT NULL,
            type      TEXT    NOT NULL,
            gallons   REAL    NOT NULL,
            timestamp TEXT    NOT NULL,
            date      TEXT    NOT NULL
        )
    """)

    connection.commit()
    connection.close()


def insert_event(site, model, usage_type, gallons, timestamp):
    """
    Insert one AI site visit event into the events table.
    Automatically extracts the YYYY-MM-DD date from the timestamp string.

    Parameters:
        site       (str)   — hostname, e.g. "gemini.google.com"
        model      (str)   — model identifier, e.g. "gemini-pro"
        usage_type (str)   — "chat" or "image"
        gallons    (float) — water cost calculated by calculator.py
        timestamp  (str)   — ISO 8601 string, e.g. "2025-05-02T20:30:00"

    Returns:
        None
    """
    # Extract the date portion (first 10 characters) from the ISO timestamp.
    # "2025-05-02T20:30:00" → "2025-05-02"
    event_date = timestamp[:10]

    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute("""
        INSERT INTO events (site, model, type, gallons, timestamp, date)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (site, model, usage_type, gallons, timestamp, event_date))

    connection.commit()
    connection.close()


def get_today_stats():
    """
    Return a summary of today's AI water usage.

    Returns:
        dict with keys:
            "today_gallons" (float) — total gallons used today
            "today_queries" (int)   — number of AI interactions today
    """
    # Get today's date as a YYYY-MM-DD string for the SQL WHERE clause.
    today_string = date.today().isoformat()  # e.g. "2025-05-02"

    connection = get_connection()
    cursor = connection.cursor()

    # Sum the gallons and count the rows where date matches today.
    cursor.execute("""
        SELECT
            COALESCE(SUM(gallons), 0.0) AS total_gallons,
            COUNT(*)                    AS total_queries
        FROM events
        WHERE date = ?
    """, (today_string,))

    row = cursor.fetchone()
    connection.close()

    return {
        "today_gallons": round(float(row["total_gallons"]), 4),
        "today_queries": int(row["total_queries"]),
    }


def get_week_history():
    """
    Return daily water usage for the last 7 days, sorted oldest to newest.
    Days with no events are included with gallons set to 0.0.

    Returns:
        list of dicts, each with keys:
            "date"    (str)   — "YYYY-MM-DD"
            "gallons" (float) — total gallons used on that day
    """
    # Build the list of the last 7 calendar dates including today.
    today = date.today()
    last_seven_days = [
        (today - timedelta(days=offset)).isoformat()
        for offset in range(6, -1, -1)  # 6 days ago → today, oldest first
    ]

    connection = get_connection()
    cursor = connection.cursor()

    # Fetch per-day totals for any of the last 7 dates that have events.
    cursor.execute("""
        SELECT date, SUM(gallons) AS daily_gallons
        FROM events
        WHERE date IN ({placeholders})
        GROUP BY date
    """.format(placeholders=",".join("?" * 7)), last_seven_days)

    # Build a lookup dict from the query results.
    rows = cursor.fetchall()
    connection.close()

    daily_totals = {row["date"]: round(float(row["daily_gallons"]), 4) for row in rows}

    # Merge with the full 7-day list, filling in 0.0 for days with no data.
    history = [
        {"date": day_string, "gallons": daily_totals.get(day_string, 0.0)}
        for day_string in last_seven_days
    ]

    return history


def get_credits():
    """
    Calculate water credits earned by the user based on below-average usage days.

    Logic:
        1. Get the daily totals for the last 7 days.
        2. Compute the average daily gallons across those 7 days.
        3. Each day that was BELOW the average earns 10 credits.
        4. gallons_saved = sum of (average - day_gallons) for below-average days.
        5. streak_days = consecutive days ending on today that were below average.

    Returns:
        dict with keys:
            "credits"       (int)   — total credits earned
            "gallons_saved" (float) — total gallons saved vs average on good days
            "streak_days"   (int)   — current consecutive below-average day streak
    """
    # Reuse get_week_history() so the logic stays in one place.
    history = get_week_history()  # list of 7 dicts, oldest first

    # Extract just the gallon values for easier maths.
    gallon_values = [day["gallons"] for day in history]

    # Calculate the average daily usage across the 7-day window.
    # Guard against division by zero (should never happen since len is always 7).
    number_of_days = len(gallon_values)
    daily_average = sum(gallon_values) / number_of_days if number_of_days > 0 else 0.0

    # Count days below average and accumulate gallons saved.
    days_below_average = 0
    total_gallons_saved = 0.0

    for daily_gallons in gallon_values:
        if daily_gallons < daily_average:
            days_below_average += 1
            total_gallons_saved += daily_average - daily_gallons

    # Credits = 10 per day the user stayed below their own average.
    earned_credits = days_below_average * 10

    # Streak: count consecutive below-average days going backwards from today.
    # history[-1] is today, history[-2] is yesterday, etc.
    streak_days = 0
    for day_entry in reversed(history):
        if day_entry["gallons"] < daily_average:
            streak_days += 1
        else:
            # Streak breaks on the first non-below-average day.
            break

    return {
        "credits":       earned_credits,
        "gallons_saved": round(total_gallons_saved, 2),
        "streak_days":   streak_days,
    }
