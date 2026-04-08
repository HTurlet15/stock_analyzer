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
