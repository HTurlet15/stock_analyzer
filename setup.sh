#!/bin/bash

echo "🚀 Création de la structure du projet stock_analyzer..."

# Créer le dossier components
mkdir -p src/components

# Supprimer les fichiers par défaut de React inutiles
rm -f src/App.test.js src/reportWebVitals.js src/setupTests.js src/logo.svg

# ─────────────────────────────────────────────
# src/index.js — on garde mais on nettoie
# ─────────────────────────────────────────────
cat > src/index.js << 'EOF'
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
EOF

# ─────────────────────────────────────────────
# src/index.css — reset global
# ─────────────────────────────────────────────
cat > src/index.css << 'EOF'
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0a0a0f; }
EOF

# ─────────────────────────────────────────────
# src/App.js
# ─────────────────────────────────────────────
cat > src/App.js << 'EOF'
import { useState } from "react";
import Dashboard from "./components/Dashboard";
import "./App.css";

function App() {
  return (
    <div className="App">
      <Dashboard />
    </div>
  );
}

export default App;
EOF

# ─────────────────────────────────────────────
# src/App.css
# ─────────────────────────────────────────────
cat > src/App.css << 'EOF'
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&display=swap');

:root {
  --bg: #0a0a0f;
  --bg-card: #111118;
  --bg-elevated: #16161f;
  --border: #1e1e2e;
  --border-bright: #2a2a3e;
  --text: #e8e8f0;
  --text-muted: #6b6b8a;
  --text-dim: #3a3a55;
  --green: #00d68f;
  --green-dim: #00d68f22;
  --orange: #ff9f43;
  --orange-dim: #ff9f4322;
  --red: #ff4757;
  --red-dim: #ff475722;
  --blue: #5352ed;
  --blue-dim: #5352ed22;
  --accent: #7c6af7;
  --accent-dim: #7c6af722;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Syne', sans-serif;
  min-height: 100vh;
  overflow-x: hidden;
}

.mono { font-family: 'DM Mono', monospace; }

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--border-bright); border-radius: 2px; }

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'DM Mono', monospace;
  letter-spacing: 0.05em;
}
.badge.green { background: var(--green-dim); color: var(--green); border: 1px solid #00d68f33; }
.badge.orange { background: var(--orange-dim); color: var(--orange); border: 1px solid #ff9f4333; }
.badge.red { background: var(--red-dim); color: var(--red); border: 1px solid #ff475733; }
.badge.blue { background: var(--blue-dim); color: var(--blue); border: 1px solid #5352ed33; }

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-family: 'Syne', sans-serif;
  font-weight: 600;
  font-size: 13px;
  transition: all 0.2s;
  letter-spacing: 0.03em;
}
.btn-primary { background: var(--accent); color: white; }
.btn-primary:hover { background: #6a59e0; transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-ghost { background: transparent; color: var(--text-muted); border: 1px solid var(--border); }
.btn-ghost:hover { border-color: var(--border-bright); color: var(--text); }

.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
.card-elevated { background: var(--bg-elevated); border: 1px solid var(--border-bright); border-radius: 12px; padding: 20px; }

.input {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
  color: var(--text);
  font-family: 'DM Mono', monospace;
  font-size: 13px;
  width: 100%;
  transition: border-color 0.2s;
  outline: none;
}
.input:focus { border-color: var(--accent); }
.input::placeholder { color: var(--text-dim); }

.section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.divider { height: 1px; background: var(--border); margin: 20px 0; }

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.fade-in { animation: fadeIn 0.3s ease forwards; }

.input-label {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}
EOF

# ─────────────────────────────────────────────
# src/api.js
# ─────────────────────────────────────────────
cat > src/api.js << 'EOF'
const BASE_URL = "https://financialmodelingprep.com/stable";
const API_KEY = process.env.REACT_APP_FMP_API_KEY;

const get = async (endpoint) => {
  const sep = endpoint.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE_URL}${endpoint}${sep}apikey=${API_KEY}`);
  if (!res.ok) throw new Error(`FMP error: ${res.status}`);
  return res.json();
};

export const getQuote = (symbol) => get(`/quote?symbol=${symbol}`);
export const getProfile = (symbol) => get(`/profile?symbol=${symbol}`);
export const getIncomeStatement = (symbol) => get(`/income-statement?symbol=${symbol}&limit=6`);
export const getBalanceSheet = (symbol) => get(`/balance-sheet-statement?symbol=${symbol}&limit=6`);
export const getCashFlow = (symbol) => get(`/cash-flow-statement?symbol=${symbol}&limit=6`);
export const getKeyMetrics = (symbol) => get(`/key-metrics?symbol=${symbol}&limit=6`);
export const getRatios = (symbol) => get(`/ratios?symbol=${symbol}&limit=6`);
export const getAnalystEstimates = (symbol) => get(`/analyst-estimates?symbol=${symbol}&limit=4`);
export const getDividends = (symbol) => get(`/dividends?symbol=${symbol}&limit=20`);

export const fetchAllData = async (symbol) => {
  const [quote, profile, income, balance, cashflow, metrics, ratios, estimates, dividends] =
    await Promise.all([
      getQuote(symbol),
      getProfile(symbol),
      getIncomeStatement(symbol),
      getBalanceSheet(symbol),
      getCashFlow(symbol),
      getKeyMetrics(symbol),
      getRatios(symbol),
      getAnalystEstimates(symbol),
      getDividends(symbol),
    ]);
  return { quote, profile, income, balance, cashflow, metrics, ratios, estimates, dividends };
};
EOF

# ─────────────────────────────────────────────
# src/utils.js
# ─────────────────────────────────────────────
cat > src/utils.js << 'EOF'
export const pct = (v) => (v != null ? `${(v * 100).toFixed(1)}%` : "—");
export const num = (v, dec = 2) => (v != null ? v.toFixed(dec) : "—");
export const money = (v) => {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(0)}`;
};

export const cagr = (start, end, years) => {
  if (!start || !end || years <= 0 || start <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
};

export const colorFromThresholds = (value, greenThreshold, orangeThreshold, inverse = false) => {
  if (value == null) return "dim";
  if (!inverse) {
    if (value >= greenThreshold) return "green";
    if (value >= orangeThreshold) return "orange";
    return "red";
  } else {
    if (value <= greenThreshold) return "green";
    if (value <= orangeThreshold) return "orange";
    return "red";
  }
};

export const processData = (raw) => {
  const { quote, profile, income, balance, cashflow, metrics, ratios, estimates, dividends } = raw;

  const q = Array.isArray(quote) ? quote[0] : quote;
  const p = Array.isArray(profile) ? profile[0] : profile;

  const inc = (income || []).sort((a, b) => new Date(b.date) - new Date(a.date));
  const bal = (balance || []).sort((a, b) => new Date(b.date) - new Date(a.date));
  const cf = (cashflow || []).sort((a, b) => new Date(b.date) - new Date(a.date));
  const met = (metrics || []).sort((a, b) => new Date(b.date) - new Date(a.date));
  const rat = (ratios || []).sort((a, b) => new Date(b.date) - new Date(a.date));
  const est = (estimates || []).sort((a, b) => new Date(a.date) - new Date(b.date));
  const divs = (dividends?.historical || dividends || []).sort((a, b) => new Date(b.date) - new Date(a.date));

  const latestInc = inc[0] || {};
  const oldestInc = inc[inc.length - 1] || {};
  const latestBal = bal[0] || {};
  const latestCF = cf[0] || {};
  const latestMet = met[0] || {};
  const latestRat = rat[0] || {};
  const years = inc.length > 1 ? inc.length - 1 : 1;

  const revenueCurrent = latestInc.revenue;
  const revenueOld = oldestInc.revenue;
  const revenueGrowth = cagr(revenueOld, revenueCurrent, years);
  const netMargin = latestInc.netIncome && latestInc.revenue ? latestInc.netIncome / latestInc.revenue : null;
  const epsCurrent = latestInc.eps;
  const epsOld = (inc[inc.length - 1] || {}).eps;
  const epsGrowth = cagr(epsOld, epsCurrent, years);
  const equity = latestBal.totalStockholdersEquity;
  const netDebt = latestBal.netDebt;
  const netDebtOld = (bal[bal.length - 1] || {}).netDebt;
  const netDebtDecreasing = netDebtOld != null && netDebt != null && netDebt < netDebtOld;
  const fcfCurrent = latestCF.freeCashFlow;
  const fcfOld = (cf[cf.length - 1] || {}).freeCashFlow;
  const fcfGrowth = cagr(fcfOld, fcfCurrent, years);
  const ebitda = latestInc.ebitda;
  const totalDebt = latestBal.totalDebt;
  const debtToEbitda = ebitda && totalDebt ? totalDebt / ebitda : null;
  const roic = latestMet.roic;
  const roe = latestMet.roe;
  const sharesCurrent = latestInc.weightedAverageShsOut;
  const sharesOld = (inc[inc.length - 1] || {}).weightedAverageShsOut;
  const sharesDecreasing = sharesOld != null && sharesCurrent != null && sharesCurrent <= sharesOld;
  const payoutRatio = latestRat.payoutRatio;
  const dividendsPaid = latestCF.dividendsPaid ? Math.abs(latestCF.dividendsPaid) : null;
  const divToFcf = dividendsPaid && fcfCurrent && fcfCurrent > 0 ? dividendsPaid / fcfCurrent : null;
  const capex = latestCF.capitalExpenditure ? Math.abs(latestCF.capitalExpenditure) : null;
  const capexOld = cf[cf.length - 1]?.capitalExpenditure ? Math.abs(cf[cf.length - 1].capitalExpenditure) : null;
  const capexGrowing = capex && capexOld && capex > capexOld;
  const profitsVsDebt = latestInc.netIncome && netDebt ? latestInc.netIncome > 0 && (netDebt / latestInc.netIncome) < 5 : null;
  const cashFollowsEarnings = fcfCurrent && latestInc.netIncome ? fcfCurrent / latestInc.netIncome > 0.7 : null;
  const dividendCoveredByEarnings = dividendsPaid && latestInc.netIncome ? dividendsPaid < latestInc.netIncome : null;

  const peCurrent = q?.pe;
  const peHistorical = met.length > 0 ? met.reduce((sum, m) => sum + (m.peRatio || 0), 0) / met.filter(m => m.peRatio).length : null;
  const fwdEps = est[0]?.estimatedEpsAvg;
  const currentPrice = q?.price;
  const forwardPE = fwdEps && currentPrice ? currentPrice / fwdEps : null;
  const estEpsFirst = est[0]?.estimatedEpsAvg;
  const estEpsLast = est[est.length - 1]?.estimatedEpsAvg;
  const estYears = est.length > 1 ? est.length - 1 : 1;
  const analystEpsGrowth = cagr(estEpsFirst, estEpsLast, estYears);
  const estRevFirst = est[0]?.estimatedRevenueAvg;
  const estRevLast = est[est.length - 1]?.estimatedRevenueAvg;
  const analystRevGrowth = cagr(estRevFirst, estRevLast, estYears);

  const dividendYield = q?.dividendYield;
  const dividendPerShare = q?.lastDiv;
  const recentDivs = divs.slice(0, 8);
  const oldDivs = divs.slice(-8);
  const avgRecentDiv = recentDivs.length ? recentDivs.reduce((s, d) => s + d.dividend, 0) / recentDivs.length : null;
  const avgOldDiv = oldDivs.length ? oldDivs.reduce((s, d) => s + d.dividend, 0) / oldDivs.length : null;
  const divGrowth = cagr(avgOldDiv, avgRecentDiv, Math.max(divs.length / 4, 1));

  return {
    symbol: q?.symbol, name: p?.companyName, sector: p?.sector, industry: p?.industry,
    description: p?.description, price: currentPrice, marketCap: q?.marketCap,
    revenueCurrent, revenueGrowth, netMargin, epsCurrent, epsGrowth,
    equity, netDebt, netDebtDecreasing, fcfCurrent, fcfGrowth,
    debtToEbitda, roic, roe, sharesCurrent, sharesDecreasing,
    payoutRatio, divToFcf, capex, capexGrowing,
    profitsVsDebt, cashFollowsEarnings, dividendCoveredByEarnings,
    peCurrent, peHistorical, forwardPE, analystEpsGrowth, analystRevGrowth,
    dividendYield, dividendPerShare, divGrowth,
    inc, cf, met, rat, est, divs,
  };
};

export const calculateDCF = (data, assumptions, years = 5) => {
  const { price, epsCurrent, dividendPerShare } = data;
  const { epsGrowth, peExit, divGrowthRate } = assumptions;
  if (!epsCurrent || !price || !peExit || epsGrowth == null) return null;
  const epsFuture = epsCurrent * Math.pow(1 + epsGrowth, years);
  const priceFuture = epsFuture * peExit;
  const D = dividendPerShare || 0;
  const g = divGrowthRate || 0;
  let dividendsCumulated = 0;
  if (g !== 0 && D > 0) {
    dividendsCumulated = D * (Math.pow(1 + g, years) - 1) / g;
  } else if (D > 0) {
    dividendsCumulated = D * years;
  }
  const totalValue = priceFuture + dividendsCumulated;
  const returnWithDivs = Math.pow(totalValue / price, 1 / years) - 1;
  const returnNoDivs = Math.pow(priceFuture / price, 1 / years) - 1;
  return { epsFuture, priceFuture, dividendsCumulated, totalValue, returnWithDivs, returnNoDivs };
};
EOF

# ─────────────────────────────────────────────
# src/components/Dashboard.js
# ─────────────────────────────────────────────
cat > src/components/Dashboard.js << 'EOF'
import { useState } from "react";
import { fetchAllData } from "../api";
import { processData } from "../utils";
import StockCard from "./StockCard";
import "./Dashboard.css";

export default function Dashboard() {
  const [watchlist, setWatchlist] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const addStock = async () => {
    const symbol = input.trim().toUpperCase();
    if (!symbol) return;
    if (watchlist.find((s) => s.symbol === symbol)) {
      setError(`${symbol} est déjà dans ta watchlist.`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const raw = await fetchAllData(symbol);
      const processed = processData(raw);
      if (!processed.name) throw new Error("Entreprise introuvable.");
      setWatchlist((prev) => [...prev, { ...processed, raw, moat: null, management: null, assumptions: null }]);
      setInput("");
    } catch (e) {
      setError(e.message || "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  };

  const removeStock = (symbol) => setWatchlist((prev) => prev.filter((s) => s.symbol !== symbol));

  const updateStock = (symbol, updates) =>
    setWatchlist((prev) => prev.map((s) => (s.symbol === symbol ? { ...s, ...updates } : s)));

  const handleKey = (e) => { if (e.key === "Enter") addStock(); };

  const ranked = [...watchlist].sort((a, b) => {
    const ra = a.assumptions?.base?.returnWithDivs ?? -Infinity;
    const rb = b.assumptions?.base?.returnWithDivs ?? -Infinity;
    return rb - ra;
  });

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div className="dash-logo">
          <span className="logo-icon">📈</span>
          <span>StockAnalyzer</span>
        </div>
        <p className="dash-subtitle">Analyse fondamentale · DCF · MOAT · Ranking</p>
      </header>

      <div className="dash-search-wrap">
        <div className="dash-search">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder="Ticker symbol... (ex: AAPL, MSFT, JNJ)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
          />
          <button className="btn btn-primary" onClick={addStock} disabled={loading}>
            {loading ? <div className="spinner" /> : null}
            {loading ? "Chargement..." : "+ Ajouter"}
          </button>
        </div>
        {error && <p className="dash-error">{error}</p>}
      </div>

      {ranked.filter((s) => s.assumptions?.base).length > 1 && (
        <div className="ranking-banner fade-in">
          <p className="section-label">🏆 Ranking · Scénario Base (avec dividendes réinvestis)</p>
          <div className="ranking-list">
            {ranked.filter((s) => s.assumptions?.base).map((s, i) => (
              <div key={s.symbol} className="ranking-item">
                <span className="rank-pos">#{i + 1}</span>
                <span className="rank-symbol">{s.symbol}</span>
                <span className={`rank-return ${s.assumptions.base.returnWithDivs > 0.10 ? "green" : s.assumptions.base.returnWithDivs > 0.07 ? "orange" : "red"}`}>
                  {(s.assumptions.base.returnWithDivs * 100).toFixed(1)}%
                  <span className="rank-label">/an</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {watchlist.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h2>Ta watchlist est vide</h2>
          <p>Ajoute un premier ticker pour commencer l'analyse fondamentale.</p>
          <div className="empty-examples">
            {["AAPL", "MSFT", "JNJ", "KO", "V"].map((t) => (
              <button key={t} className="example-chip" onClick={() => setInput(t)}>{t}</button>
            ))}
          </div>
        </div>
      )}

      <div className="stock-list">
        {watchlist.map((stock) => (
          <StockCard key={stock.symbol} stock={stock} onRemove={removeStock} onUpdate={updateStock} />
        ))}
      </div>
    </div>
  );
}
EOF

# ─────────────────────────────────────────────
# src/components/Dashboard.css
# ─────────────────────────────────────────────
cat > src/components/Dashboard.css << 'EOF'
.dashboard { max-width: 1200px; margin: 0 auto; padding: 40px 24px 80px; }

.dash-header { margin-bottom: 40px; padding-bottom: 24px; border-bottom: 1px solid var(--border); }
.dash-logo { display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 800; color: var(--text); margin-bottom: 6px; letter-spacing: -0.02em; }
.logo-icon { font-size: 24px; }
.dash-subtitle { font-size: 12px; color: var(--text-muted); letter-spacing: 0.08em; font-family: 'DM Mono', monospace; }

.dash-search-wrap { margin-bottom: 32px; }
.dash-search { display: flex; align-items: center; gap: 10px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 8px 8px 8px 16px; transition: border-color 0.2s; }
.dash-search:focus-within { border-color: var(--accent); }
.search-icon { font-size: 16px; }
.search-input { flex: 1; background: transparent; border: none; outline: none; font-family: 'DM Mono', monospace; font-size: 14px; color: var(--text); }
.search-input::placeholder { color: var(--text-dim); }
.dash-error { margin-top: 8px; font-size: 12px; color: var(--red); font-family: 'DM Mono', monospace; padding: 0 4px; }

.ranking-banner { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 32px; }
.ranking-list { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
.ranking-item { display: flex; align-items: center; gap: 8px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; padding: 10px 16px; }
.rank-pos { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--text-muted); }
.rank-symbol { font-weight: 700; font-size: 14px; letter-spacing: 0.05em; }
.rank-return { font-family: 'DM Mono', monospace; font-size: 16px; font-weight: 500; }
.rank-return.green { color: var(--green); }
.rank-return.orange { color: var(--orange); }
.rank-return.red { color: var(--red); }
.rank-label { font-size: 10px; opacity: 0.6; margin-left: 2px; }

.empty-state { text-align: center; padding: 80px 40px; color: var(--text-muted); }
.empty-icon { font-size: 48px; margin-bottom: 20px; }
.empty-state h2 { font-size: 20px; color: var(--text); margin-bottom: 8px; }
.empty-state p { font-size: 14px; margin-bottom: 24px; }
.empty-examples { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.example-chip { background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 6px 14px; color: var(--text-muted); font-family: 'DM Mono', monospace; font-size: 12px; cursor: pointer; transition: all 0.2s; }
.example-chip:hover { border-color: var(--accent); color: var(--accent); }

.stock-list { display: flex; flex-direction: column; gap: 24px; }
EOF

# ─────────────────────────────────────────────
# src/components/StockCard.js
# ─────────────────────────────────────────────
cat > src/components/StockCard.js << 'EOF'
import { useState } from "react";
import { pct, num, money, colorFromThresholds } from "../utils";
import MoatSection from "./MoatSection";
import ManagementSection from "./ManagementSection";
import DCFSection from "./DCFSection";
import "./StockCard.css";

const RatioRow = ({ label, value, color, sub }) => (
  <div className="ratio-row">
    <span className="ratio-label">{label}</span>
    <div className="ratio-right">
      {sub && <span className="ratio-sub">{sub}</span>}
      <span className={`ratio-value ${color}`}>{value}</span>
    </div>
  </div>
);

const CheckRow = ({ label, value }) => (
  <div className="ratio-row">
    <span className="ratio-label">{label}</span>
    <span className={`check-dot ${value === true ? "green" : value === false ? "red" : "dim"}`}>
      {value === true ? "✓" : value === false ? "✗" : "—"}
    </span>
  </div>
);

const TABS = [
  { id: "financials", label: "💰 Finances" },
  { id: "valuation", label: "📊 Valorisation" },
  { id: "dcf", label: "🔢 DCF" },
  { id: "moat", label: "🛡️ MOAT" },
  { id: "management", label: "🧠 Management" },
];

export default function StockCard({ stock, onRemove, onUpdate }) {
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState("financials");
  const s = stock;

  const checks = [
    s.revenueGrowth > 0.10, s.netMargin > 0.20, s.epsGrowth > 0, s.equity > 0,
    s.netDebtDecreasing, s.fcfGrowth > 0.10, s.debtToEbitda < 2, s.roic > 0.20,
    s.roe > 0.15, s.sharesDecreasing, s.payoutRatio < 0.40, s.divToFcf < 0.50, s.capexGrowing,
  ].filter(Boolean).length;
  const healthScore = Math.round((checks / 13) * 100);
  const healthColor = healthScore >= 70 ? "green" : healthScore >= 45 ? "orange" : "red";

  return (
    <div className="stock-card fade-in">
      <div className="sc-header" onClick={() => setExpanded(!expanded)}>
        <div className="sc-header-left">
          <div className="sc-symbol">{s.symbol}</div>
          <div className="sc-name-wrap">
            <span className="sc-name">{s.name}</span>
            <span className="sc-sector">{s.sector} · {s.industry}</span>
          </div>
        </div>
        <div className="sc-header-right">
          <div className="sc-price">
            <span className="price-val">${num(s.price)}</span>
            <span className="price-label">prix actuel</span>
          </div>
          <div className={`health-badge ${healthColor}`}>
            <span className="health-score">{healthScore}</span>
            <span className="health-label">/100</span>
          </div>
          {s.assumptions?.base && (
            <div className="return-badge">
              <span className="return-val">{(s.assumptions.base.returnWithDivs * 100).toFixed(1)}%</span>
              <span className="return-label">base/an</span>
            </div>
          )}
          <button className="btn-remove" onClick={(e) => { e.stopPropagation(); onRemove(s.symbol); }}>✕</button>
          <span className="chevron">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div className="sc-body">
          <div className="sc-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`tab-btn ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === "financials" && (
            <div className="tab-content">
              <div className="ratios-grid">
                <div className="ratios-col">
                  <p className="section-label">Croissance & Rentabilité</p>
                  <RatioRow label="CA croissance (CAGR)" value={pct(s.revenueGrowth)} color={colorFromThresholds(s.revenueGrowth, 0.10, 0.05)} sub={money(s.revenueCurrent)} />
                  <RatioRow label="Marge nette" value={pct(s.netMargin)} color={colorFromThresholds(s.netMargin, 0.20, 0.10)} />
                  <RatioRow label="BPA croissance (CAGR)" value={pct(s.epsGrowth)} color={colorFromThresholds(s.epsGrowth, 0.10, 0.05)} sub={`$${num(s.epsCurrent)}`} />
                  <RatioRow label="FCF croissance (CAGR)" value={pct(s.fcfGrowth)} color={colorFromThresholds(s.fcfGrowth, 0.10, 0.05)} sub={money(s.fcfCurrent)} />
                  <RatioRow label="ROIC" value={pct(s.roic)} color={colorFromThresholds(s.roic, 0.20, 0.15)} />
                  <RatioRow label="ROE" value={pct(s.roe)} color={colorFromThresholds(s.roe, 0.15, 0.10)} />
                </div>
                <div className="ratios-col">
                  <p className="section-label">Bilan & Dividendes</p>
                  <RatioRow label="Fonds propres" value={money(s.equity)} color={s.equity > 0 ? "green" : "red"} />
                  <RatioRow label="Dette nette" value={s.netDebtDecreasing ? "↓ Décroissante" : "↑ Croissante"} color={s.netDebtDecreasing ? "green" : "red"} sub={money(s.netDebt)} />
                  <RatioRow label="Dette / EBITDA" value={num(s.debtToEbitda)} color={colorFromThresholds(s.debtToEbitda, 2, 3, true)} />
                  <RatioRow label="Payout Ratio" value={pct(s.payoutRatio)} color={colorFromThresholds(s.payoutRatio, 0.40, 0.60, true)} />
                  <RatioRow label="Dividendes / FCF" value={pct(s.divToFcf)} color={colorFromThresholds(s.divToFcf, 0.50, 0.70, true)} />
                  <RatioRow label="Actions en circulation" value={s.sharesDecreasing ? "↓ Décroissantes" : "↑ Croissantes"} color={s.sharesDecreasing ? "green" : "orange"} />
                  <RatioRow label="Capex" value={s.capexGrowing ? "↑ En hausse" : "↓ En baisse"} color={s.capexGrowing ? "green" : "orange"} sub={money(s.capex)} />
                </div>
                <div className="ratios-col">
                  <p className="section-label">3 Questions Clés</p>
                  <CheckRow label="Profits > Dette ?" value={s.profitsVsDebt} />
                  <CheckRow label="Cash suit les bénéfices ?" value={s.cashFollowsEarnings} />
                  <CheckRow label="Dividende couvert par résultats ?" value={s.dividendCoveredByEarnings} />
                  <div style={{ marginTop: 20 }}>
                    <p className="section-label">Dividendes</p>
                    <RatioRow label="Rendement actuel" value={pct(s.dividendYield)} color={colorFromThresholds(s.dividendYield, 0.02, 0.01)} />
                    <RatioRow label="Dividende / action" value={`$${num(s.dividendPerShare)}`} color="dim" />
                    <RatioRow label="Croissance dividende (CAGR)" value={pct(s.divGrowth)} color={colorFromThresholds(s.divGrowth, 0.05, 0.02)} />
                  </div>
                  <div className="health-summary">
                    <p className="section-label" style={{marginTop: 20}}>Score santé</p>
                    <div className={`health-bar-wrap ${healthColor}`}>
                      <div className="health-bar-fill" style={{ width: `${healthScore}%` }} />
                    </div>
                    <span className={`health-pct ${healthColor}`}>{healthScore}/100</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "valuation" && (
            <div className="tab-content">
              <div className="ratios-grid">
                <div className="ratios-col">
                  <p className="section-label">Valorisation actuelle</p>
                  <RatioRow label="PER actuel" value={num(s.peCurrent, 1)} color={colorFromThresholds(s.peCurrent, 20, 30, true)} />
                  <RatioRow label="PER historique moyen" value={num(s.peHistorical, 1)} color="dim" />
                  <RatioRow label="Forward PER (12m)" value={num(s.forwardPE, 1)} color={colorFromThresholds(s.forwardPE, 20, 30, true)} />
                </div>
                <div className="ratios-col">
                  <p className="section-label">Croissance attendue (analystes)</p>
                  <RatioRow label="BPA croissance estimée" value={pct(s.analystEpsGrowth)} color={colorFromThresholds(s.analystEpsGrowth, 0.10, 0.05)} />
                  <RatioRow label="CA croissance estimée" value={pct(s.analystRevGrowth)} color={colorFromThresholds(s.analystRevGrowth, 0.10, 0.05)} />
                </div>
                <div className="ratios-col">
                  <p className="section-label">Lecture</p>
                  <div className="valuation-note">
                    {s.peCurrent && s.peHistorical && (
                      <p>PER actuel <strong>{num(s.peCurrent, 1)}x</strong> {s.peCurrent < s.peHistorical ? `en dessous de la moyenne historique (${num(s.peHistorical, 1)}x) → potentiellement sous-évalué.` : `au-dessus de la moyenne historique (${num(s.peHistorical, 1)}x) → surveiller.`}</p>
                    )}
                    {s.forwardPE && s.peCurrent && (
                      <p style={{marginTop: 10}}>Forward PER <strong>{num(s.forwardPE, 1)}x</strong> : {s.forwardPE < s.peCurrent ? "bénéfices attendus en hausse → positif." : "multiple en expansion → surveiller."}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "dcf" && <DCFSection stock={stock} onUpdate={onUpdate} />}
          {activeTab === "moat" && <MoatSection stock={stock} onUpdate={onUpdate} />}
          {activeTab === "management" && <ManagementSection stock={stock} onUpdate={onUpdate} />}
        </div>
      )}
    </div>
  );
}
EOF

# ─────────────────────────────────────────────
# src/components/StockCard.css
# ─────────────────────────────────────────────
cat > src/components/StockCard.css << 'EOF'
.stock-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; transition: border-color 0.2s; }
.stock-card:hover { border-color: var(--border-bright); }

.sc-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; cursor: pointer; user-select: none; }
.sc-header:hover { background: #ffffff05; }
.sc-header-left { display: flex; align-items: center; gap: 16px; }
.sc-symbol { font-size: 20px; font-weight: 800; letter-spacing: 0.05em; color: var(--accent); font-family: 'DM Mono', monospace; min-width: 60px; }
.sc-name-wrap { display: flex; flex-direction: column; gap: 3px; }
.sc-name { font-size: 15px; font-weight: 600; color: var(--text); }
.sc-sector { font-size: 11px; color: var(--text-muted); font-family: 'DM Mono', monospace; }
.sc-header-right { display: flex; align-items: center; gap: 16px; }
.sc-price { display: flex; flex-direction: column; align-items: flex-end; }
.price-val { font-size: 18px; font-weight: 700; font-family: 'DM Mono', monospace; }
.price-label { font-size: 10px; color: var(--text-muted); }

.health-badge { display: flex; align-items: baseline; gap: 2px; padding: 6px 12px; border-radius: 8px; }
.health-badge.green { background: var(--green-dim); }
.health-badge.orange { background: var(--orange-dim); }
.health-badge.red { background: var(--red-dim); }
.health-score { font-size: 18px; font-weight: 800; font-family: 'DM Mono', monospace; }
.health-badge.green .health-score { color: var(--green); }
.health-badge.orange .health-score { color: var(--orange); }
.health-badge.red .health-score { color: var(--red); }
.health-label { font-size: 10px; color: var(--text-muted); }

.return-badge { display: flex; flex-direction: column; align-items: center; background: var(--accent-dim); border: 1px solid #7c6af733; border-radius: 8px; padding: 6px 12px; }
.return-val { font-size: 16px; font-weight: 700; color: var(--accent); font-family: 'DM Mono', monospace; }
.return-label { font-size: 10px; color: var(--text-muted); }

.btn-remove { background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 6px 8px; border-radius: 6px; font-size: 14px; transition: all 0.2s; }
.btn-remove:hover { color: var(--red); background: var(--red-dim); }
.chevron { color: var(--text-muted); font-size: 12px; }

.sc-body { border-top: 1px solid var(--border); }

.sc-tabs { display: flex; gap: 2px; padding: 12px 16px; border-bottom: 1px solid var(--border); overflow-x: auto; }
.tab-btn { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; border: none; background: transparent; color: var(--text-muted); font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
.tab-btn:hover { color: var(--text); background: var(--bg-elevated); }
.tab-btn.active { background: var(--accent-dim); color: var(--accent); border: 1px solid #7c6af733; }

.tab-content { padding: 24px; }

.ratios-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
@media (max-width: 900px) { .ratios-grid { grid-template-columns: 1fr; } }
.ratios-col { display: flex; flex-direction: column; gap: 4px; }

.ratio-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1e1e2e88; }
.ratio-label { font-size: 12px; color: var(--text-muted); flex: 1; }
.ratio-right { display: flex; align-items: center; gap: 8px; }
.ratio-sub { font-size: 11px; color: var(--text-dim); font-family: 'DM Mono', monospace; }
.ratio-value { font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 500; min-width: 60px; text-align: right; }
.ratio-value.green { color: var(--green); }
.ratio-value.orange { color: var(--orange); }
.ratio-value.red { color: var(--red); }
.ratio-value.dim { color: var(--text-muted); }

.check-dot { font-family: 'DM Mono', monospace; font-size: 16px; font-weight: 700; min-width: 60px; text-align: right; }
.check-dot.green { color: var(--green); }
.check-dot.red { color: var(--red); }
.check-dot.dim { color: var(--text-dim); }

.health-summary { margin-top: 8px; }
.health-bar-wrap { height: 6px; background: var(--border); border-radius: 3px; margin-bottom: 6px; overflow: hidden; }
.health-bar-fill { height: 100%; border-radius: 3px; transition: width 0.8s ease; }
.health-bar-wrap.green .health-bar-fill { background: var(--green); }
.health-bar-wrap.orange .health-bar-fill { background: var(--orange); }
.health-bar-wrap.red .health-bar-fill { background: var(--red); }
.health-pct { font-family: 'DM Mono', monospace; font-size: 12px; }
.health-pct.green { color: var(--green); }
.health-pct.orange { color: var(--orange); }
.health-pct.red { color: var(--red); }

.valuation-note { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; padding: 16px; font-size: 13px; color: var(--text-muted); line-height: 1.6; }
.valuation-note strong { color: var(--text); }
EOF

# ─────────────────────────────────────────────
# src/components/DCFSection.js
# ─────────────────────────────────────────────
cat > src/components/DCFSection.js << 'EOF'
import { useState, useEffect } from "react";
import { calculateDCF, num, pct } from "../utils";
import "./DCFSection.css";

const ScenarioCard = ({ label, result, color, years }) => {
  if (!result) return null;
  return (
    <div className={`scenario-card ${color}`}>
      <p className="scenario-label">{label}</p>
      <div className="scenario-main">
        <span className="scenario-return">{(result.returnWithDivs * 100).toFixed(1)}%</span>
        <span className="scenario-period">/an ({years}a)</span>
      </div>
      <div className="scenario-details">
        <div className="sd-row"><span>Sans dividendes</span><span>{(result.returnNoDivs * 100).toFixed(1)}%/an</span></div>
        <div className="sd-row"><span>Prix cible</span><span>${num(result.priceFuture)}</span></div>
        <div className="sd-row"><span>Dividendes cumulés</span><span>${num(result.dividendsCumulated)}</span></div>
        <div className="sd-row total"><span>Valeur totale</span><span>${num(result.totalValue)}</span></div>
      </div>
    </div>
  );
};

const InputRow = ({ label, value, onChange, isPercent }) => (
  <div className="input-row">
    <label className="input-label">{label}</label>
    <div className="input-wrap">
      <input
        type="number"
        className="dcf-input"
        value={isPercent ? (value * 100).toFixed(1) : value.toFixed(1)}
        step="0.5"
        onChange={(e) => onChange(isPercent ? parseFloat(e.target.value) / 100 : parseFloat(e.target.value))}
      />
      <span className="input-unit">{isPercent ? "%" : "x"}</span>
    </div>
  </div>
);

export default function DCFSection({ stock, onUpdate }) {
  const s = stock;
  const def = {
    years: 5,
    bear: {
      epsGrowth: Math.max(((s.analystEpsGrowth || s.epsGrowth || 0.05)) * 0.6, 0.01),
      peExit: (s.peHistorical || s.peCurrent || 18) * 0.85,
      divGrowthRate: (s.divGrowth || 0.03) * 0.6,
    },
    base: {
      epsGrowth: s.analystEpsGrowth || s.epsGrowth || 0.08,
      peExit: s.peHistorical || s.peCurrent || 20,
      divGrowthRate: s.divGrowth || 0.05,
    },
    bull: {
      epsGrowth: (s.analystEpsGrowth || s.epsGrowth || 0.08) * 1.4,
      peExit: (s.peHistorical || s.peCurrent || 20) * 1.2,
      divGrowthRate: (s.divGrowth || 0.05) * 1.4,
    },
  };

  const [assum, setAssum] = useState(s.dcfAssumptions || def);
  const bearResult = calculateDCF(s, assum.bear, assum.years);
  const baseResult = calculateDCF(s, assum.base, assum.years);
  const bullResult = calculateDCF(s, assum.bull, assum.years);

  useEffect(() => {
    onUpdate(s.symbol, { assumptions: { bear: bearResult, base: baseResult, bull: bullResult }, dcfAssumptions: assum });
  // eslint-disable-next-line
  }, [assum]);

  const update = (scenario, field, value) =>
    setAssum((p) => ({ ...p, [scenario]: { ...p[scenario], [field]: value } }));

  return (
    <div className="dcf-section">
      <div className="dcf-anchors">
        <p className="section-label">Ancres historiques</p>
        <div className="anchor-chips">
          {[
            { label: "BPA actuel", val: `$${num(s.epsCurrent)}` },
            { label: "BPA CAGR 5a", val: pct(s.epsGrowth) },
            { label: "BPA analystes", val: pct(s.analystEpsGrowth) },
            { label: "PER actuel", val: `${num(s.peCurrent, 1)}x` },
            { label: "PER moyen 5a", val: `${num(s.peHistorical, 1)}x` },
            { label: "Div./action", val: `$${num(s.dividendPerShare)}` },
            { label: "Div. CAGR", val: pct(s.divGrowth) },
            { label: "Prix actuel", val: `$${num(s.price)}` },
          ].map((a) => (
            <div key={a.label} className="anchor-chip">
              <span className="ac-label">{a.label}</span>
              <span className="ac-value">{a.val}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="dcf-horizon">
        <label className="input-label">Horizon</label>
        <div className="horizon-btns">
          {[3, 5, 7, 10].map((y) => (
            <button key={y} className={`horizon-btn ${assum.years === y ? "active" : ""}`} onClick={() => setAssum((p) => ({ ...p, years: y }))}>
              {y} ans
            </button>
          ))}
        </div>
      </div>

      <div className="dcf-grid">
        {[
          { key: "bear", label: "🐻 Bear", color: "red" },
          { key: "base", label: "📊 Base (analystes)", color: "blue" },
          { key: "bull", label: "🚀 Bull", color: "green" },
        ].map(({ key, label, color }) => (
          <div key={key} className="dcf-col">
            <p className={`scenario-header ${color}`}>{label}</p>
            <InputRow label="Croissance BPA" value={assum[key].epsGrowth} onChange={(v) => update(key, "epsGrowth", v)} isPercent />
            <InputRow label="PER de sortie" value={assum[key].peExit} onChange={(v) => update(key, "peExit", v)} isPercent={false} />
            <InputRow label="Croissance dividende" value={assum[key].divGrowthRate} onChange={(v) => update(key, "divGrowthRate", v)} isPercent />
            <ScenarioCard label={label} result={key === "bear" ? bearResult : key === "base" ? baseResult : bullResult} color={color} years={assum.years} />
          </div>
        ))}
      </div>

      <p className="dcf-disclaimer">
        ⚠️ Ces projections reposent sur tes hypothèses. Investis seulement si le scénario Bear dépasse ton seuil minimum (ex: 8%/an).
      </p>
    </div>
  );
}
EOF

# ─────────────────────────────────────────────
# src/components/DCFSection.css
# ─────────────────────────────────────────────
cat > src/components/DCFSection.css << 'EOF'
.dcf-section { display: flex; flex-direction: column; gap: 24px; }

.dcf-anchors { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.anchor-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.anchor-chip { display: flex; flex-direction: column; gap: 2px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px; }
.ac-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.ac-value { font-family: 'DM Mono', monospace; font-size: 14px; font-weight: 500; color: var(--text); }

.dcf-horizon { display: flex; align-items: center; gap: 16px; }
.horizon-btns { display: flex; gap: 6px; }
.horizon-btn { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-family: 'DM Mono', monospace; font-size: 12px; cursor: pointer; transition: all 0.2s; }
.horizon-btn:hover { border-color: var(--accent); color: var(--accent); }
.horizon-btn.active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

.dcf-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
@media (max-width: 900px) { .dcf-grid { grid-template-columns: 1fr; } }
.dcf-col { display: flex; flex-direction: column; gap: 8px; }

.scenario-header { font-size: 13px; font-weight: 700; padding: 8px 12px; border-radius: 8px; margin-bottom: 4px; }
.scenario-header.bear { background: var(--red-dim); color: var(--red); }
.scenario-header.blue { background: var(--blue-dim); color: var(--blue); }
.scenario-header.green { background: var(--green-dim); color: var(--green); }

.input-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #1e1e2e66; }
.input-wrap { display: flex; align-items: center; gap: 4px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; }
.dcf-input { background: transparent; border: none; outline: none; font-family: 'DM Mono', monospace; font-size: 13px; color: var(--text); width: 52px; text-align: right; }
.input-unit { font-family: 'DM Mono', monospace; font-size: 12px; color: var(--text-muted); }

.scenario-card { border-radius: 10px; padding: 16px; margin-top: 8px; border: 1px solid transparent; }
.scenario-card.red { background: var(--red-dim); border-color: #ff475733; }
.scenario-card.blue { background: var(--blue-dim); border-color: #5352ed33; }
.scenario-card.green { background: var(--green-dim); border-color: #00d68f33; }

.scenario-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); margin-bottom: 8px; }
.scenario-main { display: flex; align-items: baseline; gap: 4px; margin-bottom: 12px; }
.scenario-return { font-size: 32px; font-weight: 800; font-family: 'DM Mono', monospace; }
.scenario-card.red .scenario-return { color: var(--red); }
.scenario-card.blue .scenario-return { color: var(--blue); }
.scenario-card.green .scenario-return { color: var(--green); }
.scenario-period { font-size: 12px; color: var(--text-muted); }

.scenario-details { display: flex; flex-direction: column; gap: 4px; }
.sd-row { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); font-family: 'DM Mono', monospace; padding: 3px 0; border-bottom: 1px solid #1e1e2e44; }
.sd-row.total { font-weight: 600; color: var(--text); border-bottom: none; padding-top: 6px; }

.dcf-disclaimer { font-size: 11px; color: var(--text-muted); background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; line-height: 1.5; }
EOF

# ─────────────────────────────────────────────
# src/components/MoatSection.js
# ─────────────────────────────────────────────
cat > src/components/MoatSection.js << 'EOF'
import { useState } from "react";
import "./MoatSection.css";

const MOAT_TYPES = [
  { id: "intangibles", emoji: "🏷️", label: "Actifs Intangibles", desc: "Marque avec pricing power ou brevets/licences créant un monopole légal ou mental.", questions: ["L'entreprise peut-elle augmenter ses prix sans perdre de clients ?", "Détient-elle des brevets, licences ou droits exclusifs significatifs ?", "La marque crée-t-elle une préférence irrationnelle chez le consommateur ?"] },
  { id: "switching", emoji: "🔒", label: "Coûts de Changement", desc: "Les clients sont piégés car le coût de changer de fournisseur est trop élevé.", questions: ["Changer de fournisseur implique-t-il des migrations coûteuses ou risquées ?", "Les clients sont-ils intégrés dans l'écosystème produit ?", "Le taux de rétention clients est-il supérieur à 90% ?"] },
  { id: "network", emoji: "🌐", label: "Effet de Réseau", desc: "Chaque nouvel utilisateur augmente la valeur du service pour tous les autres.", questions: ["Le service devient-il plus utile à mesure que le nombre d'utilisateurs croît ?", "Y a-t-il des effets de réseau bifaces (marketplace, paiement) ?", "Les concurrents peinent-ils à atteindre la masse critique ?"] },
  { id: "cost", emoji: "⚡", label: "Avantage de Coût", desc: "Production à un coût inatteignable pour les concurrents grâce aux économies d'échelle.", questions: ["L'entreprise a-t-elle des économies d'échelle significatives ?", "Bénéficie-t-elle d'un accès privilégié aux ressources ou à la distribution ?", "Peut-elle asphyxier un concurrent en baissant ses prix ?"] },
  { id: "scale", emoji: "🏔️", label: "Échelle Efficiente", desc: "Marché suffisamment petit pour ne supporter qu'un seul acteur rentable.", questions: ["Le marché adressable est-il limité à une taille qui décourage les entrants ?", "L'entreprise opère-t-elle des infrastructures à haute barrière ?", "Un concurrent devrait-il investir des milliards pour un retour trop faible ?"] },
];

const SCORES = [
  { value: 0, label: "Absent", color: "red" },
  { value: 1, label: "Faible", color: "orange" },
  { value: 2, label: "Modéré", color: "orange" },
  { value: 3, label: "Fort", color: "green" },
];

export default function MoatSection({ stock, onUpdate }) {
  const initial = stock.moat || Object.fromEntries(MOAT_TYPES.map((t) => [t.id, { score: null, notes: "" }]));
  const [moat, setMoat] = useState(initial);

  const totalScore = Object.values(moat).reduce((sum, m) => sum + (m.score || 0), 0);
  const maxScore = MOAT_TYPES.length * 3;
  const moatPct = Math.round((totalScore / maxScore) * 100);
  const moatLevel = moatPct >= 70 ? { label: "MOAT FORT", color: "green" } : moatPct >= 40 ? { label: "MOAT MODÉRÉ", color: "orange" } : { label: "MOAT FAIBLE", color: "red" };

  const updateMoat = (id, field, value) => {
    const updated = { ...moat, [id]: { ...moat[id], [field]: value } };
    setMoat(updated);
    onUpdate(stock.symbol, { moat: updated });
  };

  return (
    <div className="moat-section">
      <div className="moat-score-header">
        <div>
          <p className="section-label">Score MOAT global</p>
          <div className={`moat-level ${moatLevel.color}`}>{moatLevel.label}</div>
        </div>
        <div className="moat-score-circle">
          <span className={`moat-score-num ${moatLevel.color}`}>{moatPct}</span>
          <span className="moat-score-denom">/100</span>
        </div>
      </div>
      <div className="moat-bar-wrap">
        <div className={`moat-bar-fill ${moatLevel.color}`} style={{ width: `${moatPct}%` }} />
      </div>
      <div className="moat-types">
        {MOAT_TYPES.map((type) => {
          const m = moat[type.id];
          const scored = SCORES.find((s) => s.value === m.score);
          return (
            <div key={type.id} className="moat-type-card">
              <div className="mtc-header">
                <span className="mtc-emoji">{type.emoji}</span>
                <div className="mtc-title">
                  <span className="mtc-label">{type.label}</span>
                  <span className="mtc-desc">{type.desc}</span>
                </div>
                {scored && <span className={`badge ${scored.color}`}>{scored.label}</span>}
              </div>
              <div className="mtc-questions">
                {type.questions.map((q, i) => <p key={i} className="mtc-question">→ {q}</p>)}
              </div>
              <div className="mtc-score-row">
                <span className="input-label">Évaluation</span>
                <div className="score-btns">
                  {SCORES.map((s) => (
                    <button key={s.value} className={`score-btn ${s.color} ${m.score === s.value ? "active" : ""}`} onClick={() => updateMoat(type.id, "score", s.value)}>
                      {s.value} — {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea className="moat-notes" placeholder="Tes observations..." value={m.notes} onChange={(e) => updateMoat(type.id, "notes", e.target.value)} rows={2} />
            </div>
          );
        })}
      </div>
      <div className="moat-rule">
        <p><strong>Règle d'or :</strong> Ne jamais faire de compromis sur le MOAT. Une entreprise exceptionnelle avec de vraies douves, achetée à un prix correct, te rendra libre.</p>
      </div>
    </div>
  );
}
EOF

# ─────────────────────────────────────────────
# src/components/MoatSection.css
# ─────────────────────────────────────────────
cat > src/components/MoatSection.css << 'EOF'
.moat-section { display: flex; flex-direction: column; gap: 20px; }
.moat-score-header { display: flex; align-items: center; justify-content: space-between; }
.moat-level { font-size: 18px; font-weight: 800; letter-spacing: 0.05em; }
.moat-level.green { color: var(--green); } .moat-level.orange { color: var(--orange); } .moat-level.red { color: var(--red); }
.moat-score-circle { display: flex; align-items: baseline; gap: 2px; }
.moat-score-num { font-size: 40px; font-weight: 800; font-family: 'DM Mono', monospace; }
.moat-score-num.green { color: var(--green); } .moat-score-num.orange { color: var(--orange); } .moat-score-num.red { color: var(--red); }
.moat-score-denom { font-size: 16px; color: var(--text-muted); font-family: 'DM Mono', monospace; }
.moat-bar-wrap { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
.moat-bar-fill { height: 100%; border-radius: 3px; transition: width 0.8s ease; }
.moat-bar-fill.green { background: var(--green); } .moat-bar-fill.orange { background: var(--orange); } .moat-bar-fill.red { background: var(--red); }
.moat-types { display: flex; flex-direction: column; gap: 12px; }
.moat-type-card { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.mtc-header { display: flex; align-items: flex-start; gap: 12px; }
.mtc-emoji { font-size: 20px; }
.mtc-title { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.mtc-label { font-size: 14px; font-weight: 700; color: var(--text); }
.mtc-desc { font-size: 12px; color: var(--text-muted); line-height: 1.4; }
.mtc-questions { display: flex; flex-direction: column; gap: 4px; padding-left: 8px; border-left: 2px solid var(--border); }
.mtc-question { font-size: 11px; color: var(--text-muted); line-height: 1.4; }
.mtc-score-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.score-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.score-btn { padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border); background: transparent; font-size: 11px; font-family: 'DM Mono', monospace; cursor: pointer; color: var(--text-muted); transition: all 0.2s; }
.score-btn.red.active { background: var(--red-dim); border-color: var(--red); color: var(--red); }
.score-btn.orange.active { background: var(--orange-dim); border-color: var(--orange); color: var(--orange); }
.score-btn.green.active { background: var(--green-dim); border-color: var(--green); color: var(--green); }
.score-btn:hover { border-color: var(--accent); color: var(--accent); }
.moat-notes { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; color: var(--text); font-family: 'DM Mono', monospace; font-size: 12px; resize: vertical; outline: none; transition: border-color 0.2s; line-height: 1.5; }
.moat-notes:focus { border-color: var(--accent); }
.moat-notes::placeholder { color: var(--text-dim); }
.moat-rule { background: var(--accent-dim); border: 1px solid #7c6af733; border-radius: 10px; padding: 16px; font-size: 13px; color: var(--text-muted); line-height: 1.6; }
.moat-rule strong { color: var(--accent); }
EOF

# ─────────────────────────────────────────────
# src/components/ManagementSection.js
# ─────────────────────────────────────────────
cat > src/components/ManagementSection.js << 'EOF'
import { useState } from "react";
import "./ManagementSection.css";

const CRITERIA = [
  { id: "coherence", emoji: "🎯", label: "Cohérence discours / actes", desc: "Les chiffres ne mentent pas. Le PDG tient-il ses promesses ?", questions: ["Les objectifs annoncés sont-ils atteints d'une année sur l'autre ?", "Les rachats d'actions sont-ils faits quand le cours est raisonnable ?", "La direction respecte-t-elle ses engagements de capital allocation ?"] },
  { id: "discipline", emoji: "💰", label: "Discipline financière", desc: "Dette maîtrisée, pas d'acquisitions vaniteuses juste pour grossir.", questions: ["La dette est-elle maîtrisée et en décroissance ?", "Les acquisitions créent-elles de la valeur (pas juste du volume) ?", "Le management évite-t-il de diluer les actionnaires inutilement ?"] },
  { id: "vision", emoji: "🔭", label: "Vision long terme", desc: "Les meilleurs dirigeants pensent en décennies. Exemple : Satya Nadella chez Microsoft.", questions: ["Le management investit-il dans la R&D et l'innovation durablement ?", "Est-il prêt à sacrifier les profits court terme pour construire à long terme ?", "La lettre aux actionnaires parle-t-elle des défis futurs ?"] },
  { id: "alignment", emoji: "🤝", label: "Alignement avec les actionnaires", desc: "Rémunération basée sur EPS, FCF — pas sur le cours à court terme.", questions: ["Le management détient-il des actions significatives ?", "La rémunération est-elle indexée sur la performance réelle ?", "Les rachats bénéficient-ils aux actionnaires (pas aux options du management) ?"] },
  { id: "transparency", emoji: "🪟", label: "Transparence", desc: "Un bon dirigeant parle des échecs autant que des succès.", questions: ["La lettre annuelle reconnaît-elle les erreurs franchement ?", "Les métriques clés sont-elles présentées de façon cohérente ?", "Le management évite-t-il les ajustements pro-forma qui masquent les problèmes ?"] },
  { id: "buybacks", emoji: "📈", label: "Rachats d'actions intelligents", desc: "Apple rachète quand le cours est raisonnable. GE rachetait à prix d'or avant le krach.", questions: ["Les rachats sont-ils effectués quand le titre est sous sa valeur intrinsèque ?", "Le programme de rachat est-il cohérent avec le niveau de dette ?", "Le nombre d'actions diminue-t-il réellement sur 5 ans ?"] },
];

const SCORES = [
  { value: 0, label: "Red flag", color: "red" },
  { value: 1, label: "Passable", color: "orange" },
  { value: 2, label: "Bon", color: "orange" },
  { value: 3, label: "Excellent", color: "green" },
];

export default function ManagementSection({ stock, onUpdate }) {
  const initial = stock.management || Object.fromEntries(CRITERIA.map((c) => [c.id, { score: null, notes: "" }]));
  const [mgmt, setMgmt] = useState(initial);

  const totalScore = Object.values(mgmt).reduce((sum, m) => sum + (m.score || 0), 0);
  const maxScore = CRITERIA.length * 3;
  const mgmtPct = Math.round((totalScore / maxScore) * 100);
  const mgmtLevel = mgmtPct >= 70 ? { label: "Management A", color: "green" } : mgmtPct >= 45 ? { label: "Management B", color: "orange" } : { label: "Management C", color: "red" };

  const updateMgmt = (id, field, value) => {
    const updated = { ...mgmt, [id]: { ...mgmt[id], [field]: value } };
    setMgmt(updated);
    onUpdate(stock.symbol, { management: updated });
  };

  return (
    <div className="mgmt-section">
      <div className="mgmt-score-header">
        <div>
          <p className="section-label">Score Management global</p>
          <div className={`mgmt-level ${mgmtLevel.color}`}>{mgmtLevel.label}</div>
        </div>
        <div className="mgmt-score-circle">
          <span className={`mgmt-score-num ${mgmtLevel.color}`}>{mgmtPct}</span>
          <span className="mgmt-score-denom">/100</span>
        </div>
      </div>
      <div className="mgmt-bar-wrap">
        <div className={`mgmt-bar-fill ${mgmtLevel.color}`} style={{ width: `${mgmtPct}%` }} />
      </div>
      <div className="mgmt-note">
        <p>💡 Pour évaluer le management, lis la <strong>lettre annuelle aux actionnaires</strong> et les comptes-rendus des conférences call trimestrielles.</p>
      </div>
      <div className="mgmt-criteria">
        {CRITERIA.map((c) => {
          const m = mgmt[c.id];
          const scored = SCORES.find((s) => s.value === m.score);
          return (
            <div key={c.id} className="mgmt-criterion">
              <div className="mc-header">
                <span className="mc-emoji">{c.emoji}</span>
                <div className="mc-title">
                  <span className="mc-label">{c.label}</span>
                  <span className="mc-desc">{c.desc}</span>
                </div>
                {scored && <span className={`badge ${scored.color}`}>{scored.label}</span>}
              </div>
              <div className="mc-questions">
                {c.questions.map((q, i) => <p key={i} className="mc-question">→ {q}</p>)}
              </div>
              <div className="mc-score-row">
                <span className="input-label">Évaluation</span>
                <div className="score-btns">
                  {SCORES.map((s) => (
                    <button key={s.value} className={`score-btn ${s.color} ${m.score === s.value ? "active" : ""}`} onClick={() => updateMgmt(c.id, "score", s.value)}>
                      {s.value} — {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea className="mgmt-notes" placeholder="Tes observations..." value={m.notes} onChange={(e) => updateMgmt(c.id, "notes", e.target.value)} rows={2} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
EOF

# ─────────────────────────────────────────────
# src/components/ManagementSection.css
# ─────────────────────────────────────────────
cat > src/components/ManagementSection.css << 'EOF'
.mgmt-section { display: flex; flex-direction: column; gap: 20px; }
.mgmt-score-header { display: flex; align-items: center; justify-content: space-between; }
.mgmt-level { font-size: 18px; font-weight: 800; letter-spacing: 0.05em; }
.mgmt-level.green { color: var(--green); } .mgmt-level.orange { color: var(--orange); } .mgmt-level.red { color: var(--red); }
.mgmt-score-circle { display: flex; align-items: baseline; gap: 2px; }
.mgmt-score-num { font-size: 40px; font-weight: 800; font-family: 'DM Mono', monospace; }
.mgmt-score-num.green { color: var(--green); } .mgmt-score-num.orange { color: var(--orange); } .mgmt-score-num.red { color: var(--red); }
.mgmt-score-denom { font-size: 16px; color: var(--text-muted); font-family: 'DM Mono', monospace; }
.mgmt-bar-wrap { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
.mgmt-bar-fill { height: 100%; border-radius: 3px; transition: width 0.8s ease; }
.mgmt-bar-fill.green { background: var(--green); } .mgmt-bar-fill.orange { background: var(--orange); } .mgmt-bar-fill.red { background: var(--red); }
.mgmt-note { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; font-size: 13px; color: var(--text-muted); line-height: 1.5; }
.mgmt-note strong { color: var(--text); }
.mgmt-criteria { display: flex; flex-direction: column; gap: 12px; }
.mgmt-criterion { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.mc-header { display: flex; align-items: flex-start; gap: 12px; }
.mc-emoji { font-size: 20px; }
.mc-title { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.mc-label { font-size: 14px; font-weight: 700; color: var(--text); }
.mc-desc { font-size: 12px; color: var(--text-muted); line-height: 1.4; }
.mc-questions { display: flex; flex-direction: column; gap: 4px; padding-left: 8px; border-left: 2px solid var(--border); }
.mc-question { font-size: 11px; color: var(--text-muted); line-height: 1.4; }
.mc-score-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.score-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.score-btn { padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border); background: transparent; font-size: 11px; font-family: 'DM Mono', monospace; cursor: pointer; color: var(--text-muted); transition: all 0.2s; }
.score-btn.red.active { background: var(--red-dim); border-color: var(--red); color: var(--red); }
.score-btn.orange.active { background: var(--orange-dim); border-color: var(--orange); color: var(--orange); }
.score-btn.green.active { background: var(--green-dim); border-color: var(--green); color: var(--green); }
.score-btn:hover { border-color: var(--accent); color: var(--accent); }
.mgmt-notes { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; color: var(--text); font-family: 'DM Mono', monospace; font-size: 12px; resize: vertical; outline: none; transition: border-color 0.2s; line-height: 1.5; }
.mgmt-notes:focus { border-color: var(--accent); }
.mgmt-notes::placeholder { color: var(--text-dim); }
EOF

echo ""
echo "✅ Tous les fichiers créés avec succès !"
echo ""
echo "Structure créée :"
find src -name "*.js" -o -name "*.css" | sort
echo ""
echo "👉 Prochaine étape : npm start"
