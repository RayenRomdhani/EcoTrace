# 🌊 EcoTrace

> Track the water cost of your AI usage. Get rewarded for using less.

EcoTrace is a Chrome browser extension that silently monitors your AI tool
usage across ChatGPT, Gemini, Claude, Copilot, Perplexity, and Midjourney —
then shows you exactly how many gallons of water were consumed by data centers
to power your queries. When you use less than your daily average, you earn
**Water Credits** redeemable as real-world environmental donations.

Built for the **COPX 3.0 Green AI Hackathon** organized by IEEE SSIT/TEMS
Tunisia Section Joint Chapter.

---

## 🎯 Tracks Addressed

| Track | Description |
|-------|-------------|
| Track B | Real-time energy cost visibility for AI users |
| Track C | Passive monitoring without behavior change required |
| Track E | Collective carbon/water footprint measurement |

## 🌍 UN SDG Alignment

- **SDG 7** — Affordable and Clean Energy
- **SDG 13** — Climate Action
- **SDG 17** — Partnerships for the Goals

---

## 🔬 The Water Formula
gallons = base_energy_kWh × PUE × WUE × 0.264172
PUE  = 1.2   (Power Usage Effectiveness — IEA 2023)
WUE  = 1.8   (Water Usage per kWh — Goldman Sachs 2024)
0.264172     (liters to gallons conversion)
| AI Tool | Energy/query | Gallons/query |
|---------|-------------|---------------|
| ChatGPT / Claude | 0.024 kWh | ~0.0137 gal |
| Gemini / Copilot | 0.016 kWh | ~0.0091 gal |
| Perplexity | 0.009 kWh | ~0.0051 gal |
| Midjourney (image) | 0.244 kWh | ~0.1400 gal |

Sources: UC Riverside 2023 (Ren et al.), IEA 2023, Goldman Sachs 2024

---

## 🏗️ Project Structure
EcoTrace/
├── extension/   
│   ├── manifest.json
│   ├── background.js
│   └── content.js
│
├── backend/           
│   ├── app.py
│   ├── calculator.py
│   ├── database.py
│   ├── requirements.txt
│   └── templates/
│       └── dashboard.html 
│
└── README.md



---

## 🚀 Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/EcoTrace.git
cd EcoTrace
```

### 2. Start the Flask backend

```bash
cd backend
pip install -r requirements.txt
export GEMINI_API_KEY="your_key_here"   # Mac/Linux
# set GEMINI_API_KEY="your_key_here"   # Windows
python app.py
```

Server runs at `http://localhost:5000`

### 3. Load the Chrome extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer Mode** (toggle top right)
3. Click **Load unpacked**
4. Select the `EcoTrace/extension/` folder
5. The EcoTrace icon appears in your toolbar

### 4. Test it

1. Open `gemini.google.com` and send a message
2. Watch the badge on the extension icon update
3. Click the icon to open your dashboard
4. Send a few more queries to trigger water warnings

---

## 💧 Water Credits System

| Action | Credits Earned |
|--------|---------------|
| Daily usage below your average | +10 credits |
| 3-day streak below average | +25 credits |
| First install | +50 credits |

### Redeem Credits

| Reward | Cost |
|--------|------|
| 🌳 Plant a Tree | 100 credits |
| 🔥 1 Month Clean Cooking Fuel | 500 credits |
| ☀️ 10 kWh Solar for a Rural School | 1000 credits |

---

## ⚠️ Water Warning System

EcoTrace injects real-time warnings directly into AI website pages:

| Threshold | Severity | Message |
|-----------|----------|---------|
| 0.05 gal | 💧 Low | First warning |
| 0.15 gal | ⚠️ Medium | Serious usage |
| 0.30 gal | 🚨 High | Critical waste |
| 0.50 gal | 🌍 Critical | Extreme consumption |

---

## 🛠️ Tech Stack

- **Extension**: Vanilla JavaScript, Chrome Manifest V3
- **Backend**: Python, Flask, SQLite, Flask-CORS
- **Dashboard**: HTML, CSS, Chart.js
- **AI Integration**: Google Gemini API (`gemini-1.5-flash`)

---

## 👥 Team

| Member | Role |
|--------|------|
| [Name A] | Chrome Extension |
| [Name B] | Flask Backend + Gemini API |
| [Name C] | Dashboard UI + Pitch |

---

## 📄 License

MIT License — free to use and build upon.
