# calculator.py — EcoTrace water usage calculator
# Converts an AI query into an estimated gallons-of-water figure using a
# physics-based formula rather than flat lookup values.
#
# Formula:  gallons = base_energy_kWh × PUE × WUE × liters_to_gallons
#
# Sources:
#   UC Riverside 2023 (Ren et al.)  — per-query energy estimates
#   IEA 2023                        — PUE constant
#   Goldman Sachs 2024              — WUE constant

# ── Physical constants ────────────────────────────────────────────────────────

# PUE (Power Usage Effectiveness): ratio of total data-center power draw to
# IT equipment power draw. 1.2 is the IEA 2023 industry average for
# hyperscale data centers (Google, Microsoft, AWS).
# Source: IEA "Electricity 2024" report.
PUE = 1.2

# WUE (Water Usage Effectiveness): liters of water consumed per kWh of IT load.
# 1.8 L/kWh is the average reported by Google and Microsoft in 2022–2023
# sustainability disclosures, cited in Goldman Sachs 2024 AI infrastructure report.
WUE = 1.8  # liters per kWh

# Conversion factor: 1 litre = 0.264172 US gallons (exact by definition).
LITERS_TO_GALLONS = 0.264172

# ── Per-query base energy map ─────────────────────────────────────────────────
# Keys are (site_hostname, query_type) tuples.
# Values are estimated energy in kWh consumed by the AI model per single query.

# NOTE: These values are scaled x5 above real measurements
# for demonstration visibility. Real per-query values
# are approximately 5x smaller.
# Original estimates from:
# UC Riverside 2023 (Ren et al.) for energy per query
# IEA 2023 for PUE value
# Goldman Sachs 2024 for WUE value
ENERGY_MAP = {
    # Large frontier chat models (GPT-4 class) — 0.024 kWh per query
    ("chat.openai.com",       "chat"):  0.024,
    ("claude.ai",             "chat"):  0.024,
    # Mid-size / optimised chat models — 0.016 kWh per query
    ("gemini.google.com",     "chat"):  0.016,
    ("copilot.microsoft.com", "chat"):  0.016,
    # Small retrieval-augmented model — 0.009 kWh per query
    ("perplexity.ai",         "chat"):  0.009,
    # Image generation is far more compute-intensive than text — 0.244 kWh
    ("midjourney.com",        "image"): 0.244,
}

# Default energy assumption for any (site, type) not in the map above.
# 0.016 kWh matches a mid-size chat model.
DEFAULT_ENERGY_KWH = 0.016


def calculate_gallons(site, model, usage_type):
    """
    Return the estimated gallons of water consumed by one AI query.

    Parameters:
        site       (str) — hostname, e.g. "gemini.google.com"
        model      (str) — model identifier (not used in formula, kept for
                           API compatibility with background.js)
        usage_type (str) — "chat" or "image"

    Returns:
        float — gallons of water consumed, rounded to 6 decimal places
    """
    # Look up base energy by (site, type) pair; fall back to default if unknown.
    base_energy_kwh = ENERGY_MAP.get((site, usage_type), DEFAULT_ENERGY_KWH)

    # gallons = base_kWh × PUE(1.2) × WUE(1.8 L/kWh) × 0.264172 (L to gal)
    gallons = base_energy_kwh * PUE * WUE * LITERS_TO_GALLONS

    return round(gallons, 6)
