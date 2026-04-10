# Stock Analyzer

A self-hosted fundamental analysis tool for stocks. Search any ticker, explore 20 years of financial history, run DCF valuations, and get a synthesized health score — all in one dashboard.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3-000000?logo=flask&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)

---

## Features

- **Financial tables** — Income statement, balance sheet, and cash flow going back up to 20 years, with inline charts on row click
- **Valuation tab** — Historical PER, EV/EBITDA, P/S, P/B, ROE, ROIC with sparkline charts
- **DCF calculator** — Three scenarios (bear / base / bull) with configurable assumptions and target return
- **Synthesis score** — Weighted health score across growth, profitability, debt, and shareholder value criteria
- **Analyst data** — Consensus price target, EPS & revenue estimates, and analyst rating breakdown
- **Dark / light mode** — Automatic via system preference
- **Dual data sources** — Alpha Vantage as primary (long history), yfinance as fallback for missing years

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Recharts |
| Backend | Python / Flask |
| Financial data | yfinance, Alpha Vantage API, Financial Modeling Prep API |
| Package manager | npm (frontend), uv or pip (backend) |

---

## Prerequisites

- **Node.js** ≥ 18 and **npm** ≥ 9
- **Python** ≥ 3.10
- API keys (free tiers are sufficient — see [API Keys](#api-keys))

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-username/stock-analyzer.git
cd stock-analyzer
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your API keys (see [API Keys](#api-keys) below).

### 3. Install frontend dependencies

```bash
npm install
```

### 4. Install backend dependencies

**Option A — with uv (recommended):**

```bash
pip install uv
uv venv
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate         # Windows
uv pip install flask flask-cors yfinance pandas requests
```

**Option B — with pip:**

```bash
python3 -m venv .venv
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate         # Windows
pip install flask flask-cors yfinance pandas requests
```

---

## Running the App

You need **two terminals** running simultaneously.

**Terminal 1 — Flask backend:**

```bash
source .venv/bin/activate
python3 app.py
```

The API will be available at `http://localhost:5000`.

**Terminal 2 — React frontend:**

```bash
npm start
```

The app will open at `http://localhost:3000`.

---

## API Keys

The app works with two optional (but recommended) free API keys.

### Alpha Vantage — historical financials

Used as the primary data source for up to 20 years of income statement, balance sheet, and cash flow data.

1. Go to [alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key)
2. Register with your email — the key is delivered instantly
3. Free tier: **25 requests / day**
4. Add to `.env`: `AV_API_KEY=your_key`

> Without this key the app falls back to yfinance, which only provides ~4 years of history.

### Financial Modeling Prep — analyst estimates & price targets

Used for forward EPS/revenue estimates and analyst consensus price targets.

1. Go to [financialmodelingprep.com/developer/docs](https://financialmodelingprep.com/developer/docs)
2. Create a free account
3. Free tier: **250 requests / day**
4. Add to `.env`: `REACT_APP_FMP_API_KEY=your_key`

> Without this key the app falls back to yfinance estimates; price targets will not be shown.

---

## Project Structure

```
stock-analyzer/
├── app.py                      # Flask API (data fetching, merging, computation)
├── .env                        # Your local secrets (not committed)
├── .env.example                # Template for environment variables
├── package.json
└── src/
    ├── App.js                  # Root component
    ├── thresholds.js           # Scoring thresholds & configurable settings
    ├── utils.js                # DCF model, formatters, scoring helpers
    └── components/
        ├── Dashboard.js/css    # Main layout, stock search, settings panel
        ├── StockCard.js/css    # Expandable card with tabbed sections
        ├── SyntheseSection.js/css   # Health score & key criteria
        ├── ValuationSection.js/css  # Valuation ratios & sparkline charts
        ├── DCFSection.js/css        # DCF calculator with scenarios
        ├── MoatSection.js/css       # Competitive moat analysis
        └── ManagementSection.js/css # Management quality indicators
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Check that the backend is running |
| `GET` | `/api/stock/<SYMBOL>` | Full financial data for a ticker (e.g. `/api/stock/AAPL`) |
| `GET` | `/api/debug/<SYMBOL>` | Raw yfinance row names — useful for diagnosing missing fields |

---

## License

MIT
