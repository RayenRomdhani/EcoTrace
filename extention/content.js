// content.js — EcoTrace query submission detector
// Fires "AI_SITE_DETECTED" when the user SENDS a message, not when the page loads.
// Uses a MutationObserver to handle single-page apps where the DOM is built dynamically.

// ── Site-specific selectors ───────────────────────────────────────────────────
// Each entry maps a hostname to:
//   button — the send/submit button CSS selector
//   input  — the text field selector (used for Enter-key detection + flag reset)
//            null means Enter-key detection is skipped for that site
const SITE_CONFIG = {
  "chat.openai.com": {
    button: 'button[data-testid="send-button"]',
    input:  "textarea#prompt-textarea",
  },
  "claude.ai": {
    button: 'button[aria-label="Send Message"]',
    input:  'div[contenteditable="true"]',
  },
  "gemini.google.com": {
    button: "button.send-button",
    input:  'rich-textarea div[contenteditable="true"]',
  },
  "copilot.microsoft.com": {
    button: 'button[aria-label="Submit"]',
    input:  "textarea",
  },
  "perplexity.ai": {
    button: 'button[aria-label="Submit"]',
    input:  "textarea",
  },
  "midjourney.com": {
    button: 'button[type="submit"]',
    input:  null, // Midjourney has no simple textarea; detect by button click only
  },
};

// ── Look up this tab's config ─────────────────────────────────────────────────
// window.location.hostname matches the keys in SITE_CONFIG above.
const hostname   = window.location.hostname;
const siteConfig = SITE_CONFIG[hostname];

// If the hostname is not in our list, do nothing.
// (manifest.json already limits injection to known sites, but this is a safe guard.)
if (!siteConfig) {
  // Nothing to do on this page.
}

if (siteConfig) {

  // ── Anti-double-count flag ──────────────────────────────────────────────────
  // Set to true the moment a submission is detected.
  // Stays true until the user starts typing a new message.
  // This guarantees that one physical "Send" action = exactly one backend event,
  // even if the click listener and the Enter listener both fire at the same time.
  let messageSent = false;

  // ── Track which DOM elements we have already attached listeners to ──────────
  // Because these are SPAs, elements can be destroyed and re-created after each
  // conversation turn. We keep a reference to the current element so we don't
  // attach the same listener twice to the same node.
  let watchedButton = null;
  let watchedInput  = null;

  // ── notifyBackground ─────────────────────────────────────────────────────────
  // Sends exactly one "AI_SITE_DETECTED" message to background.js per submission.
  // The message format is identical to the original content.js so background.js
  // needs no changes.
  function notifyBackground() {
    // If we already fired for this message, ignore the duplicate trigger.
    if (messageSent) return;

    // Lock the flag so any follow-up events (e.g. Enter + click together) are ignored.
    messageSent = true;

    // Send to background.js — same format as before.
    try {
      chrome.runtime.sendMessage({
        type:     "AI_SITE_DETECTED",
        hostname: hostname,
      });
    } catch (err) {
      // Background service worker may be asleep; swallow silently.
      console.warn("[EcoTrace] Could not reach background:", err.message);
    }

    // Check water usage thresholds and show a warning widget if needed.
    fetchAndCheckThresholds();
  }

  // ── resetFlag ────────────────────────────────────────────────────────────────
  // Called on every "input" event (the user typing a character).
  // Unlocks messageSent so the next submission will be counted.
  function resetFlag() {
    messageSent = false;
  }

  // ── attachIfNew ──────────────────────────────────────────────────────────────
  // Attaches event listeners to the button and input field found in the DOM.
  // Skips if the element is the same node we already have listeners on,
  // preventing duplicate listeners when the MutationObserver fires repeatedly.
  function attachIfNew(button, input) {

    // Send button — listen for click
    if (button && button !== watchedButton) {
      button.addEventListener("click", notifyBackground);
      watchedButton = button; // remember so we don't attach again
    }

    // Text input — listen for Enter key and for typing (to reset the flag)
    if (input && input !== watchedInput) {
      // Shift+Enter inserts a newline; plain Enter submits the message.
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.shiftKey) {
          notifyBackground();
        }
      });

      // Any keystroke that changes the input value means the user is composing
      // a new message, so we unlock the flag for the next submission.
      input.addEventListener("input", resetFlag);

      watchedInput = input; // remember so we don't attach again
    }
  }

  // ── MutationObserver ─────────────────────────────────────────────────────────
  // AI sites are single-page apps: the send button and input field are injected
  // into the DOM after the page shell loads, and they may be replaced after each
  // conversation turn (the SPA tears down the old input area and builds a new one).
  //
  // The observer watches the entire document for any DOM changes. Each time the
  // DOM mutates it calls attachIfNew, which silently does nothing if the elements
  // haven't changed, and re-attaches if they have been replaced by new nodes.
  //
  // We deliberately do NOT disconnect the observer — we need it alive for the
  // whole page session to handle new conversation turns in the same tab.
  const observer = new MutationObserver(function () {
    // Try to find the send button and input field at this moment in time.
    const button = document.querySelector(siteConfig.button);
    const input  = siteConfig.input
      ? document.querySelector(siteConfig.input)
      : null;

    attachIfNew(button, input);
  });

  // Start observing. childList catches elements being added/removed;
  // subtree ensures we watch nested elements, not just direct children of body.
  observer.observe(document.body, {
    childList: true,
    subtree:   true,
  });

  // Also attempt an immediate attach in case the elements are already in the DOM
  // when this script runs (e.g. if the extension is reloaded mid-session).
  const button = document.querySelector(siteConfig.button);
  const input  = siteConfig.input
    ? document.querySelector(siteConfig.input)
    : null;
  attachIfNew(button, input);

} // end if (siteConfig)


// ============================================
// WATER WARNING NOTIFICATION SYSTEM
// Injects directly into the AI website page
// ============================================

// ── Threshold configuration ───────────────────────────────────────────────────
const THRESHOLDS = [
  {
    gallons:      0.05,
    title:        "First Warning 💧",
    message:      "You've already wasted [X] gal of water on AI today. That's [Y] glasses of drinking water gone.",
    color:        "#00B4D8",
    severity:     "LOW",
    severityBg:   "#E0F7FA",
    severityText: "#00B4D8",
    yType:        "glasses",
  },
  {
    gallons:      0.15,
    title:        "Serious Usage ⚠️",
    message:      "You've wasted [X] gal today. Data centers consume real freshwater to power your queries. Consider taking a break.",
    color:        "#FFC107",
    severity:     "MEDIUM",
    severityBg:   "#FFF8E1",
    severityText: "#F59E0B",
    yType:        null,
  },
  {
    gallons:      0.30,
    title:        "Critical Waste 🚨",
    message:      "You've wasted [X] gal today — equal to [Y] minutes of a running shower. AI data centers in water-stressed regions are depleting local supplies for queries like yours.",
    color:        "#E63946",
    severity:     "HIGH",
    severityBg:   "#FEE2E2",
    severityText: "#E63946",
    yType:        "shower",
  },
  {
    gallons:      0.50,
    title:        "Extreme Consumption 🌍",
    message:      "You've wasted [X] gal today. Families in water-scarce regions survive on less water than you've consumed powering these AI queries. Please stop for today.",
    color:        "#9B2226",
    severity:     "CRITICAL",
    severityBg:   "#FCE7E7",
    severityText: "#9B2226",
    yType:        null,
  },
];

// ── State ─────────────────────────────────────────────────────────────────────
const shownThresholds   = new Set();  // tracks threshold.gallons values already shown this session
let   notificationQueue = [];         // pending { threshold, gallons } items
let   isShowingNotification = false;  // true while a widget is on screen

// ── Conversion helpers ────────────────────────────────────────────────────────
function gallonsToGlasses(gallons) { return (gallons * 16).toFixed(1); }
function gallonsToShower(gallons)  { return (gallons * 9.6).toFixed(1); }

// ── CSS injection ─────────────────────────────────────────────────────────────
// Called once on script load. Injects all widget styles into the AI site's page.
function injectEcoTraceStyles() {
  if (document.getElementById("ecotrace-styles")) return;

  const style = document.createElement("style");
  style.id = "ecotrace-styles";
  style.textContent = `
    @keyframes ecotrace-slidein {
      from { opacity: 0; transform: translateX(120px); }
      to   { opacity: 1; transform: translateX(0);     }
    }
    .ecotrace-widget {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      width: 340px;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      background: #ffffff;
      overflow: hidden;
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      animation: ecotrace-slidein 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
    }
    .ecotrace-accent-bar {
      height: 4px;
      width: 100%;
    }
    .ecotrace-body {
      padding: 16px 20px;
    }
    .ecotrace-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
    }
    .ecotrace-icon-circle {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      flex-shrink: 0;
    }
    .ecotrace-title {
      font-weight: 700;
      font-size: 15px;
      color: #111111;
      margin-bottom: 3px;
    }
    .ecotrace-severity-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 20px;
      display: inline-block;
    }
    .ecotrace-message {
      font-size: 13px;
      color: #444444;
      line-height: 1.6;
      margin-bottom: 12px;
    }
    .ecotrace-pills {
      display: flex;
      gap: 8px;
      margin-bottom: 14px;
    }
    .ecotrace-pill {
      background: #F4F4F9;
      border-radius: 20px;
      padding: 4px 10px;
      font-size: 12px;
      color: #555555;
    }
    .ecotrace-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ecotrace-link {
      font-size: 12px;
      color: #00B4D8;
      cursor: pointer;
      text-decoration: none;
      background: none;
      border: none;
      font-family: inherit;
      padding: 0;
    }
    .ecotrace-dismiss {
      font-size: 12px;
      font-weight: 600;
      color: #ffffff;
      border: none;
      cursor: pointer;
      padding: 6px 14px;
      border-radius: 20px;
      font-family: inherit;
    }
    .ecotrace-progress-bar-track {
      height: 3px;
      width: 100%;
      background: rgba(0,0,0,0.08);
    }
    .ecotrace-progress-bar-fill {
      height: 3px;
      transition: width 12s linear;
    }
  `;
  document.head.appendChild(style);
}

// ── buildWidget ───────────────────────────────────────────────────────────────
// Creates and returns the full widget DOM element for a given threshold + value.
function buildWidget(threshold, gallons) {
  const x = gallons.toFixed(4);

  // Compute Y conversion based on threshold type
  let yValue = null;
  if (threshold.yType === "glasses") yValue = gallonsToGlasses(gallons);
  if (threshold.yType === "shower")  yValue = gallonsToShower(gallons);

  // Build the message: replace [X] and [Y] tokens
  let messageText = threshold.message.replace("[X]", x);
  if (yValue !== null) messageText = messageText.replace("[Y]", yValue);

  // Extract emoji from title for the icon circle
  const emojiMatch = threshold.title.match(/\p{Emoji}/u);
  const emoji = emojiMatch ? emojiMatch[0] : "💧";

  // ── Root widget element
  const widget = document.createElement("div");
  widget.className = "ecotrace-widget";

  // ── Top accent bar
  const accentBar = document.createElement("div");
  accentBar.className = "ecotrace-accent-bar";
  accentBar.style.background = threshold.color;
  widget.appendChild(accentBar);

  // ── Body
  const body = document.createElement("div");
  body.className = "ecotrace-body";

  // Header: icon + title/badge
  const header = document.createElement("div");
  header.className = "ecotrace-header";

  const iconCircle = document.createElement("div");
  iconCircle.className = "ecotrace-icon-circle";
  iconCircle.style.background = threshold.color + "22";  // ~13% opacity
  iconCircle.textContent = emoji;

  const headerRight = document.createElement("div");

  const titleEl = document.createElement("div");
  titleEl.className = "ecotrace-title";
  titleEl.textContent = threshold.title;

  const badge = document.createElement("span");
  badge.className = "ecotrace-severity-badge";
  badge.style.background = threshold.severityBg;
  badge.style.color       = threshold.severityText;
  badge.textContent = threshold.severity;

  headerRight.appendChild(titleEl);
  headerRight.appendChild(badge);
  header.appendChild(iconCircle);
  header.appendChild(headerRight);
  body.appendChild(header);

  // Message
  const msgEl = document.createElement("div");
  msgEl.className = "ecotrace-message";
  msgEl.textContent = messageText;
  body.appendChild(msgEl);

  // Stat pills
  const pills = document.createElement("div");
  pills.className = "ecotrace-pills";

  const pill1 = document.createElement("span");
  pill1.className = "ecotrace-pill";
  pill1.textContent = "💧 " + x + " gal wasted today";
  pills.appendChild(pill1);

  if (yValue !== null) {
    const pill2 = document.createElement("span");
    pill2.className = "ecotrace-pill";
    if (threshold.yType === "glasses") pill2.textContent = "🥛 " + yValue + " glasses of water";
    if (threshold.yType === "shower")  pill2.textContent = "🚿 " + yValue + " min shower";
    pills.appendChild(pill2);
  }
  body.appendChild(pills);

  // Footer: dashboard link + dismiss button
  const footer = document.createElement("div");
  footer.className = "ecotrace-footer";

  const dashLink = document.createElement("button");
  dashLink.className = "ecotrace-link";
  dashLink.textContent = "See your dashboard →";
  dashLink.addEventListener("click", () => {
    window.open("http://localhost:5000/dashboard", "_blank");
  });

  const dismissBtn = document.createElement("button");
  dismissBtn.className = "ecotrace-dismiss";
  dismissBtn.style.background = threshold.color;
  dismissBtn.textContent = "Dismiss";

  footer.appendChild(dashLink);
  footer.appendChild(dismissBtn);
  body.appendChild(footer);

  widget.appendChild(body);

  // ── Progress bar track + fill
  const track = document.createElement("div");
  track.className = "ecotrace-progress-bar-track";

  const fill = document.createElement("div");
  fill.className = "ecotrace-progress-bar-fill";
  fill.style.background = threshold.color;
  fill.style.width = "100%";   // starts full; JS immediately sets to 0% to start transition
  track.appendChild(fill);
  widget.appendChild(track);

  // Store refs for showNotification to wire up
  widget._dismissBtn    = dismissBtn;
  widget._progressFill  = fill;

  return widget;
}

// ── showNotification ──────────────────────────────────────────────────────────
// Appends the widget to the page, starts the 12s countdown, wires dismiss.
// Calls processQueue() when done so the next item can show.
function showNotification(threshold, gallons) {
  const widget = buildWidget(threshold, gallons);
  document.body.appendChild(widget);

  // Trigger the progress bar shrink on the next frame (width: 100% → 0%).
  requestAnimationFrame(() => {
    widget._progressFill.style.width = "0%";
  });

  let done = false;

  function dismiss() {
    if (done) return;
    done = true;
    if (widget.parentNode) widget.parentNode.removeChild(widget);
    isShowingNotification = false;
    processQueue();
  }

  const autoTimer = setTimeout(dismiss, 12000);

  widget._dismissBtn.addEventListener("click", () => {
    clearTimeout(autoTimer);
    dismiss();
  });
}

// ── processQueue ──────────────────────────────────────────────────────────────
// Pulls the next notification off the queue and shows it.
function processQueue() {
  if (isShowingNotification)       return;
  if (notificationQueue.length === 0) return;
  const next = notificationQueue.shift();
  isShowingNotification = true;
  showNotification(next.threshold, next.gallons);
}

// ── checkThresholds ───────────────────────────────────────────────────────────
// Compares today_gallons against all thresholds and queues any new ones.
function checkThresholds(gallons) {
  for (const threshold of THRESHOLDS) {
    if (gallons >= threshold.gallons && !shownThresholds.has(threshold.gallons)) {
      shownThresholds.add(threshold.gallons);
      notificationQueue.push({ threshold, gallons });
    }
  }
  processQueue();
}

// ── fetchAndCheckThresholds ───────────────────────────────────────────────────
// Fetches /api/stats after each detected query and checks thresholds.
// Fails silently if the server is offline.
function fetchAndCheckThresholds() {
  fetch("http://localhost:5000/api/stats")
    .then(res  => { if (!res.ok) return; return res.json(); })
    .then(data => { if (data && typeof data.today_gallons === "number") checkThresholds(data.today_gallons); })
    .catch(() => {});
}

// Inject styles once when the content script loads on the AI site page.
injectEcoTraceStyles();
