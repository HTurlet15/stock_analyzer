import { useState, useEffect } from "react";
import { fetchAllData } from "../api";
import { processData, calculateDCF } from "../utils";
import { loadThresholds, saveThresholds, DEFAULT_THRESHOLDS, THRESHOLD_CONFIGS } from "../thresholds";
import StockCard from "./StockCard";
import "./Dashboard.css";

// ── Settings panel ────────────────────────────────────────────────────────────

function SettingsPanel({ thresholds, onChange, onClose }) {
  const fmt = (val, isPct) => isPct ? (val * 100).toFixed(1) : String(val);
  const parse = (str, isPct) => {
    const n = parseFloat(str);
    if (isNaN(n)) return null;
    return isPct ? n / 100 : n;
  };

  const handleChange = (key, raw, isPct) => {
    const val = parse(raw, isPct);
    if (val === null) return;
    const updated = { ...thresholds, [key + "Good"]: val };
    // Keep ok slightly worse than good if not specified separately
    onChange(updated);
  };

  const handleOkChange = (key, raw, isPct) => {
    const val = parse(raw, isPct);
    if (val === null) return;
    onChange({ ...thresholds, [key + "Ok"]: val });
  };

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <span className="settings-title">Seuils personnalisés</span>
        <button className="settings-close" onClick={onClose}>✕</button>
      </div>
      <p className="settings-desc">Ces seuils colorient les ratios en vert / orange / rouge dans l'analyse.</p>
      <div className="settings-body">
        {THRESHOLD_CONFIGS.map(group => (
          <div key={group.group} className="settings-group">
            <p className="settings-group-title">{group.group}</p>
            {group.fields.map(field => (
              <div key={field.key} className="settings-row">
                <span className="settings-row-label">{field.label}</span>
                <div className="settings-inputs">
                  {field.single ? (
                    <label className="settings-input-label">
                      <input
                        type="number"
                        className="settings-input"
                        step={field.pct ? "0.1" : "0.5"}
                        defaultValue={fmt(thresholds[field.key], field.pct)}
                        onBlur={e => {
                          const val = parse(e.target.value, field.pct);
                          if (val !== null) onChange({ ...thresholds, [field.key]: val });
                        }}
                      />
                      {field.pct ? "%" : "x"}
                    </label>
                  ) : (
                    <>
                      <label className="settings-input-label">
                        <span className={`threshold-dot green`} />
                        <input
                          type="number"
                          className="settings-input"
                          step={field.pct ? "0.1" : "0.5"}
                          defaultValue={fmt(thresholds[field.key + "Good"], field.pct)}
                          onBlur={e => handleChange(field.key, e.target.value, field.pct)}
                        />
                        {field.pct ? "%" : "x"}
                      </label>
                      <label className="settings-input-label">
                        <span className={`threshold-dot orange`} />
                        <input
                          type="number"
                          className="settings-input"
                          step={field.pct ? "0.1" : "0.5"}
                          defaultValue={fmt(thresholds[field.key + "Ok"], field.pct)}
                          onBlur={e => handleOkChange(field.key, e.target.value, field.pct)}
                        />
                        {field.pct ? "%" : "x"}
                      </label>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="settings-footer">
        <button className="btn btn-ghost" onClick={() => onChange({ ...DEFAULT_THRESHOLDS })}>
          Réinitialiser
        </button>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [watchlist, setWatchlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem("sa_watchlist") || "[]"); }
    catch { return []; }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [thresholds, setThresholds] = useState(() => loadThresholds());
  const [showSettings, setShowSettings] = useState(false);

  // Persist watchlist to localStorage on every change
  useEffect(() => {
    try { localStorage.setItem("sa_watchlist", JSON.stringify(watchlist)); }
    catch { /* storage full or unavailable */ }
  }, [watchlist]);

  const handleThresholdsChange = (t) => {
    setThresholds(t);
    saveThresholds(t);
  };

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

      // Auto-compute DCF base scenario so header badge shows immediately
      const epsG = processed.analystEpsGrowth ?? processed.epsGrowth ?? 0.08;
      const peEx = processed.peHistorical ?? processed.peCurrent ?? 20;
      const divG = processed.divGrowth ?? 0.05;
      const dcfAssumptions = {
        years: 5,
        bear: { epsGrowth: Math.max(epsG * 0.6, 0.01), peExit: peEx * 0.85, divGrowthRate: divG * 0.6 },
        base: { epsGrowth: epsG, peExit: peEx, divGrowthRate: divG },
        bull: { epsGrowth: epsG * 1.4, peExit: peEx * 1.2, divGrowthRate: divG * 1.4 },
      };
      const tr = thresholds.fairValueTargetReturn ?? 0.10;
      const assumptions = {
        bear: calculateDCF(processed, dcfAssumptions.bear, 5, tr),
        base: calculateDCF(processed, dcfAssumptions.base, 5, tr),
        bull: calculateDCF(processed, dcfAssumptions.bull, 5, tr),
      };
      setWatchlist((prev) => [...prev, { ...processed, raw, moat: null, management: null, assumptions, dcfAssumptions }]);
      setInput("");
    } catch (e) {
      setError(e.message || "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  };

  const removeStock = (symbol) => setWatchlist((prev) => prev.filter((s) => s.symbol !== symbol));

  const refreshStock = async (symbol) => {
    setWatchlist((prev) => prev.map((s) => s.symbol === symbol ? { ...s, refreshing: true } : s));
    try {
      const raw = await fetchAllData(symbol);
      const processed = processData(raw);
      const tr = thresholds.fairValueTargetReturn ?? 0.10;
      setWatchlist((prev) => prev.map((s) => {
        if (s.symbol !== symbol) return s;
        const epsG = processed.analystEpsGrowth ?? processed.epsGrowth ?? 0.08;
        const peEx = processed.peHistorical ?? processed.peCurrent ?? 20;
        const divG = processed.divGrowth ?? 0.05;
        const dcfAssumptions = {
          years: 3,
          bear: { epsGrowth: Math.max(epsG * 0.6, 0.01), peExit: peEx * 0.85, divGrowthRate: divG * 0.6 },
          base: { epsGrowth: epsG, peExit: peEx, divGrowthRate: divG },
          bull: { epsGrowth: epsG * 1.4, peExit: peEx * 1.2, divGrowthRate: divG * 1.4 },
        };
        const assumptions = {
          bear: calculateDCF(processed, dcfAssumptions.bear, 3, tr),
          base: calculateDCF(processed, dcfAssumptions.base, 3, tr),
          bull: calculateDCF(processed, dcfAssumptions.bull, 3, tr),
        };
        // Keep manual annotations (moat, management, custom dcfAssumptions)
        return { ...s, ...processed, raw, assumptions, dcfAssumptions: s.dcfAssumptions || dcfAssumptions, refreshing: false, lastUpdated: new Date().toISOString() };
      }));
    } catch {
      setWatchlist((prev) => prev.map((s) => s.symbol === symbol ? { ...s, refreshing: false } : s));
    }
  };

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
        <div className="dash-header-top">
          <div>
            <div className="dash-logo">StockAnalyzer</div>
            <p className="dash-subtitle">Analyse fondamentale · DCF · MOAT · Ranking</p>
          </div>
          <button
            className={`btn-settings ${showSettings ? "active" : ""}`}
            onClick={() => setShowSettings(v => !v)}
            title="Paramètres des seuils"
          >
            Seuils
          </button>
        </div>
        {showSettings && (
          <SettingsPanel
            thresholds={thresholds}
            onChange={handleThresholdsChange}
            onClose={() => setShowSettings(false)}
          />
        )}
      </header>

      <div className="dash-search-wrap">
        <div className="dash-search">
          <input
            className="search-input"
            placeholder="Ticker symbol — ex: AAPL, MSFT, MC.PA"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
          />
          <button className="btn btn-primary" onClick={addStock} disabled={loading}>
            {loading ? <div className="spinner" /> : null}
            {loading ? "Chargement..." : "Ajouter"}
          </button>
        </div>
        {error && <p className="dash-error">{error}</p>}
      </div>

      {ranked.filter((s) => s.assumptions?.base).length > 1 && (
        <div className="ranking-banner fade-in">
          <p className="section-label">Ranking — Scénario Base (avec dividendes)</p>
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
          <StockCard key={stock.symbol} stock={stock} thresholds={thresholds} onRemove={removeStock} onUpdate={updateStock} onRefresh={refreshStock} />
        ))}
      </div>
    </div>
  );
}
