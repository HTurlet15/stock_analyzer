import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { fetchAllData } from "../api";
import { processData, calculateDCF } from "../utils";
import { loadThresholds, saveThresholds, DEFAULT_THRESHOLDS, THRESHOLD_CONFIGS } from "../thresholds";
import { computePositionStats } from "./PositionsSection";
import StockCard from "./StockCard";
import "./Dashboard.css";

const PIE_COLORS = ["#6366f1","#22c55e","#f59e0b","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6","#f97316","#84cc16","#a78bfa","#fb923c"];

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
    onChange({ ...thresholds, [key + "Good"]: val });
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

// ── FCF default assumptions ──────────────────────────────────────────────────
// Builds bear/base/bull DCF assumptions from processed stock data.
// Detects old EPS-based format and migrates to FCF-based.

const isOldFormat = (assum) => assum?.base?.epsGrowth !== undefined;

const makeDcfDefaults = (processed, years) => {
  const fcfG   = processed.fcfGrowth ?? 0.07;
  const pfcfEx = processed.pfcfHistorical ?? processed.pfcfCurrent ?? 20;
  const divG   = processed.divGrowth ?? 0.04;
  return {
    years,
    bear: { fcfGrowth: Math.max(fcfG * 0.6, 0.01), pfcfExit: Math.max(pfcfEx * 0.85, 5), divGrowthRate: divG * 0.6 },
    base: { fcfGrowth: fcfG,        pfcfExit: pfcfEx,           divGrowthRate: divG       },
    bull: { fcfGrowth: fcfG * 1.4,  pfcfExit: pfcfEx * 1.2,     divGrowthRate: divG * 1.4 },
  };
};

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
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [showAllocation, setShowAllocation] = useState(false);

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

      const tr = thresholds.fairValueTargetReturn ?? 0.10;
      const dcfAssumptions = makeDcfDefaults(processed, 3);
      const assumptions = {
        bear: calculateDCF(processed, dcfAssumptions.bear, 3, tr),
        base: calculateDCF(processed, dcfAssumptions.base, 3, tr),
        bull: calculateDCF(processed, dcfAssumptions.bull, 3, tr),
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
        // Preserve DCFSection's base result; only rebuild bear/bull from Dashboard defaults
        const storedAssum = (isOldFormat(s.dcfAssumptions) || !s.dcfAssumptions?.bear)
          ? null : s.dcfAssumptions;
        const dcfAssumptions = storedAssum || makeDcfDefaults(processed, 3);
        const freshBear = calculateDCF(processed, dcfAssumptions.bear, dcfAssumptions.years ?? 3, tr);
        const freshBull = calculateDCF(processed, dcfAssumptions.bull, dcfAssumptions.years ?? 3, tr);
        // Keep existing base (set by DCFSection) if present, else compute a default
        const existingBase = s.assumptions?.base;
        const freshBase = existingBase
          ? existingBase
          : calculateDCF(processed, dcfAssumptions.base, dcfAssumptions.years ?? 3, tr);
        return {
          ...s, ...processed, raw,
          assumptions: { bear: freshBear, base: freshBase, bull: freshBull },
          dcfAssumptions, refreshing: false, lastUpdated: new Date().toISOString(),
        };
      }));
    } finally {
      // Ensure refreshing flag is always cleared even if fetch or processing throws
      setWatchlist((prev) => prev.map((s) => s.symbol === symbol ? { ...s, refreshing: false } : s));
    }
  };

  const refreshAll = async () => {
    if (refreshingAll || watchlist.length === 0) return;
    setRefreshingAll(true);
    const symbols = watchlist.map(s => s.symbol);
    try {
      for (const symbol of symbols) {
        await refreshStock(symbol);
      }
    } finally {
      setRefreshingAll(false);
    }
  };

  const updateStock = (symbol, updates) =>
    setWatchlist((prev) => prev.map((s) => {
      if (s.symbol !== symbol) return s;
      // Merge assumptions.base only — preserve bear/bull set by Dashboard's calculateDCF
      const mergedAssumptions = updates.assumptions
        ? { ...s.assumptions, base: { ...s.assumptions?.base, ...updates.assumptions.base } }
        : s.assumptions;
      return { ...s, ...updates, assumptions: mergedAssumptions };
    }));

  const handleKey = (e) => { if (e.key === "Enter") addStock(); };

  const ranked = [...watchlist].sort((a, b) => {
    const ra = a.assumptions?.base?.returnWithDivs ?? -Infinity;
    const rb = b.assumptions?.base?.returnWithDivs ?? -Infinity;
    return rb - ra;
  });

  const anyRefreshing = refreshingAll || watchlist.some(s => s.refreshing);

  return (
    <div className="dashboard">
      <header className="dash-header">
        <div className="dash-header-top">
          <div>
            <div className="dash-logo">StockAnalyzer</div>
            <p className="dash-subtitle">Analyse fondamentale · DCF · MOAT · Ranking</p>
          </div>
          <div className="dash-header-actions">
            {watchlist.length > 0 && (
              <button
                className={`btn-refresh-all ${anyRefreshing ? "loading" : ""}`}
                onClick={refreshAll}
                disabled={anyRefreshing}
                title="Actualiser tous les cours et données"
              >
                {refreshingAll ? "Actualisation…" : "↻ Tout actualiser"}
              </button>
            )}
            <button
              className={`btn-settings ${showSettings ? "active" : ""}`}
              onClick={() => setShowSettings(v => !v)}
              title="Paramètres des seuils"
            >
              Seuils
            </button>
          </div>
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

      {/* ── Portfolio summary ── */}
      {(() => {
        const withPos = watchlist.filter(s => s.positions?.length);
        if (!withPos.length) return null;
        let totalCost = 0, totalValue = 0, totalDivs = 0;
        withPos.forEach(s => {
          const st = computePositionStats(s.positions, s.price, s.dividendPerShare);
          if (!st) return;
          totalCost  += st.costBasis;
          totalValue += st.currentValue ?? st.costBasis;
          totalDivs  += st.annualDividend ?? 0;
        });
        const totalGain    = totalValue - totalCost;
        const totalGainPct = totalCost > 0 ? totalGain / totalCost : null;
        const yoc          = totalCost > 0 ? totalDivs / totalCost : null;
        const fmt = v => v >= 1e6 ? `$${(v/1e6).toFixed(2)}M` : `$${v.toFixed(2)}`;
        const gainColor = totalGain >= 0 ? "green" : "red";
        return (
          <div className="portfolio-strip fade-in">
            <span className="portfolio-strip-title">Portefeuille</span>
            <div className="portfolio-strip-items">
              <div className="pf-item"><span className="pf-label">Investi</span><span className="pf-val">{fmt(totalCost)}</span></div>
              <div className="pf-item"><span className="pf-label">Valeur actuelle</span><span className="pf-val">{fmt(totalValue)}</span></div>
              <div className="pf-item">
                <span className="pf-label">Plus-value</span>
                <span className={`pf-val ${gainColor}`}>{totalGain >= 0 ? "+" : ""}{fmt(totalGain)} ({totalGainPct != null ? `${totalGainPct >= 0 ? "+" : ""}${(totalGainPct*100).toFixed(1)}%` : "—"})</span>
              </div>
              <div className="pf-item"><span className="pf-label">Dividendes / an</span><span className="pf-val green">{fmt(totalDivs)}</span></div>
              <div className="pf-item"><span className="pf-label">Yield on Cost</span><span className={`pf-val ${yoc >= 0.04 ? "green" : yoc >= 0.02 ? "orange" : "red"}`}>{yoc != null ? `${(yoc*100).toFixed(2)}%` : "—"}</span></div>
            </div>
          </div>
        );
      })()}

      {ranked.filter((s) => s.assumptions?.base).length > 1 && (
        <div className="ranking-banner fade-in">
          <div className="ranking-header">
            <p className="section-label">Ranking — Scénario Base (avec dividendes)</p>
            <button
              className={`btn-allocation ${showAllocation ? "active" : ""}`}
              onClick={() => setShowAllocation(v => !v)}
              title="Répartition du portefeuille"
            >
              ◑ Répartition
            </button>
          </div>
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
          {showAllocation && (() => {
            const pieData = watchlist
              .map(s => {
                const st = s.positions?.length ? computePositionStats(s.positions, s.price, s.dividendPerShare) : null;
                return { symbol: s.symbol, value: st?.currentValue ?? 0 };
              })
              .filter(d => d.value > 0);
            const total = pieData.reduce((sum, d) => sum + d.value, 0);
            if (!pieData.length) return (
              <p className="allocation-empty">Ajoutez des positions dans chaque action (onglet Positions) pour voir la répartition.</p>
            );
            return (
              <div className="allocation-wrap">
                <p className="allocation-title">Répartition du portefeuille par action — valeur de marché actuelle</p>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="symbol"
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={105}
                      paddingAngle={2}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [
                        `${((value / total) * 100).toFixed(1)}%  (${value >= 1e6 ? `$${(value/1e6).toFixed(2)}M` : `$${value.toFixed(0)}`})`,
                        name,
                      ]}
                      contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend
                      formatter={(value, entry) => (
                        <span style={{ fontSize: 12, color: "var(--text)" }}>
                          {value} <span style={{ color: "var(--text-muted)" }}>{((entry.payload.value / total) * 100).toFixed(1)}%</span>
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
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
