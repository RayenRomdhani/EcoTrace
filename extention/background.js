// background.js — EcoTrace Chrome Extension Service Worker
// Runs in the background at all times, handles all communication
// with the Flask backend at localhost:5000.

// ─── Site Registry ───────────────────────────────────────────────────────────
// Maps each AI hostname to the model name and usage type we send to the backend.
const AI_SITES = {
  "chat.openai.com":        { model: "gpt-4",       type: "chat"  },
  "claude.ai":              { model: "claude",       type: "chat"  },
  "gemini.google.com":      { model: "gemini-pro",   type: "chat"  },
  "copilot.microsoft.com":  { model: "copilot",      type: "chat"  },
  "perplexity.ai":          { model: "perplexity",   type: "chat"  },
  "midjourney.com":         { model: "midjourney",   type: "image" },
};

// ─── Badge Styling ────────────────────────────────────────────────────────────
// Set the badge colours once at startup so they persist for every update.
chrome.action.setBadgeBackgroundColor({ color: "#27500A" }); // dark green
chrome.action.setBadgeTextColor({ color: "#FFFFFF" });        // white text

// ─── Helper: Post an AI event to the backend ─────────────────────────────────
// Sends a single POST request describing which AI site was visited.
// If the Flask server is offline this fails silently — the extension never crashes.
async function postAiEvent(hostname) {
  // Look up the site's metadata from the registry.
  const siteInfo = AI_SITES[hostname];

  // If the hostname is somehow not in the registry, do nothing.
  if (!siteInfo) return;

  // Build the ISO 8601 timestamp for the moment of detection.
  const timestamp = new Date().toISOString();

  // Assemble the request body exactly as the backend expects it.
  const payload = {
    site:      hostname,
    model:     siteInfo.model,
    type:      siteInfo.type,
    timestamp: timestamp,
  };

  try {
    // Send the POST request to the Flask event endpoint.
    await fetch("http://localhost:5000/api/event", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
  } catch (err) {
    // Server is offline or unreachable — swallow the error silently.
    console.warn("[EcoTrace] Could not reach /api/event:", err.message);
  }
}

// ─── Helper: Fetch stats and update the badge ─────────────────────────────────
// Calls GET /api/stats, reads today_gallons, and writes it to the icon badge.
async function refreshBadge() {
  try {
    // Fetch today's water usage stats from the Flask backend.
    const response = await fetch("http://localhost:5000/api/stats");

    // If the server replied with a non-OK status, bail out silently.
    if (!response.ok) return;

    // Parse the JSON body returned by the backend.
    const data = await response.json();

    // Read today_gallons from the response; default to 0 if missing.
    const gallons = typeof data.today_gallons === "number" ? data.today_gallons : 0;

    // Round to 1 decimal place with "g" suffix (e.g. "1.4g") for the badge.
    const badgeText = parseFloat(data.today_gallons).toFixed(1) + "g";

    // Write the value onto the extension icon badge.
    chrome.action.setBadgeText({ text: badgeText });
  } catch (err) {
    // Server is offline or unreachable — leave the badge as-is, no crash.
    console.warn("[EcoTrace] Could not reach /api/stats:", err.message);
  }
}

// ─── Message Listener ─────────────────────────────────────────────────────────
// Listens for messages sent by content.js running inside AI site tabs.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only act on the specific message type we expect from content.js.
  if (message.type !== "AI_SITE_DETECTED") return;

  // message.hostname is the site that was just visited (e.g. "claude.ai").
  const hostname = message.hostname;

  // Fire-and-forget: post the event then refresh the badge.
  // We do NOT await here because the listener must return synchronously.
  postAiEvent(hostname).then(() => refreshBadge());
});

// ─── Icon Click Listener ──────────────────────────────────────────────────────
// When the user clicks the EcoTrace icon, open the dashboard in a new tab.
// There is NO popup — the icon click goes straight to the website.
chrome.action.onClicked.addListener(() => {
  // Open the Flask dashboard in a brand-new browser tab.
  chrome.tabs.create({ url: "http://localhost:5000/dashboard" });
});

// ─── Startup Badge Initialisation ─────────────────────────────────────────────
// When the service worker first starts (browser launch, extension reload),
// fetch the current stats so the badge is correct from the very beginning.
chrome.runtime.onStartup.addListener(() => {
  refreshBadge();
});

// Also refresh once immediately when the service worker script loads.
// This covers the case where the extension is installed or reloaded mid-session.
refreshBadge();
