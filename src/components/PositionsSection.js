import { useState } from "react";
import { num, pct } from "../utils";
import "./PositionsSection.css";

const money = (v, cur = "$") => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const str = abs >= 1e6 ? `${(abs / 1e6).toFixed(2)}M` : abs.toFixed(2);
  return `${v < 0 ? "-" : ""}${cur}${str}`;
};

export function computePositionStats(positions, price, dividendPerShare) {
  if (!positions?.length) return null;
  const totalShares = positions.reduce((s, p) => s + p.quantity, 0);
  const costBasis   = positions.reduce((s, p) => s + p.quantity * p.pricePerShare, 0);
  const avgCost     = costBasis / totalShares;
  const currentValue    = price != null ? totalShares * price : null;
  const capitalGain     = currentValue != null ? currentValue - costBasis : null;
  const capitalGainPct  = capitalGain  != null ? capitalGain / costBasis  : null;
  const annualDividend  = dividendPerShare != null ? totalShares * dividendPerShare : null;
  const yieldOnCost     = annualDividend   != null ? annualDividend / costBasis     : null;
  return { totalShares, costBasis, avgCost, currentValue, capitalGain, capitalGainPct, annualDividend, yieldOnCost };
}

export default function PositionsSection({ stock, onUpdate }) {
  const positions = stock.positions || [];
  const cur = stock.currency === "EUR" ? "€" : "$";
  const price = stock.price;
  const divPS = stock.dividendPerShare;

  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), quantity: "", pricePerShare: "" });
  const [formError, setFormError] = useState("");

  const stats = computePositionStats(positions, price, divPS);

  const addPosition = () => {
    const q = parseFloat(form.quantity);
    const p = parseFloat(form.pricePerShare);
    if (!q || q <= 0 || !p || p <= 0) { setFormError("Quantité et prix doivent être positifs."); return; }
    if (!form.date) { setFormError("Date requise."); return; }
    setFormError("");
    const updated = [...positions, { id: Date.now(), date: form.date, quantity: q, pricePerShare: p }]
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    onUpdate(stock.symbol, { positions: updated });
    setForm(prev => ({ ...prev, quantity: "", pricePerShare: "" }));
  };

  const removePosition = (id) => {
    onUpdate(stock.symbol, { positions: positions.filter(p => p.id !== id) });
  };

  const gainColor = (v) => v == null ? "" : v >= 0 ? "green" : "red";

  return (
    <div className="pos-section">

      {/* ── Add position form ──────────────────────────────────────────────── */}
      <div className="pos-form-card">
        <p className="pos-form-title">Ajouter un achat</p>
        <div className="pos-form-row">
          <label className="pos-label">
            Date
            <input type="date" className="pos-input" value={form.date}
              onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
          </label>
          <label className="pos-label">
            Quantité
            <input type="number" className="pos-input" placeholder="ex: 10" min="0" step="0.01"
              value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} />
          </label>
          <label className="pos-label">
            Prix d'achat ({cur})
            <input type="number" className="pos-input" placeholder="ex: 185.50" min="0" step="0.01"
              value={form.pricePerShare} onChange={e => setForm(p => ({ ...p, pricePerShare: e.target.value }))} />
          </label>
          <button className="pos-add-btn" onClick={addPosition}>Ajouter</button>
        </div>
        {formError && <p className="pos-error">{formError}</p>}
      </div>

      {positions.length === 0 ? (
        <p className="pos-empty">Aucun achat enregistré. Ajoute ta première position ci-dessus.</p>
      ) : (
        <>
          {/* ── Stats summary ──────────────────────────────────────────────── */}
          {stats && (
            <div className="pos-stats-grid">
              <div className="pos-stat">
                <span className="pos-stat-label">Actions détenues</span>
                <span className="pos-stat-value">{num(stats.totalShares, 2)}</span>
              </div>
              <div className="pos-stat">
                <span className="pos-stat-label">Prix moyen d'achat</span>
                <span className="pos-stat-value">{cur}{num(stats.avgCost, 2)}</span>
              </div>
              <div className="pos-stat">
                <span className="pos-stat-label">Coût total</span>
                <span className="pos-stat-value">{money(stats.costBasis, cur)}</span>
              </div>
              <div className="pos-stat">
                <span className="pos-stat-label">Valeur actuelle</span>
                <span className="pos-stat-value">{stats.currentValue != null ? money(stats.currentValue, cur) : "—"}</span>
              </div>
              <div className="pos-stat">
                <span className="pos-stat-label">Plus-value</span>
                <span className={`pos-stat-value ${gainColor(stats.capitalGain)}`}>
                  {stats.capitalGain != null ? `${stats.capitalGain >= 0 ? "+" : ""}${money(stats.capitalGain, cur)}` : "—"}
                  {stats.capitalGainPct != null && (
                    <span className="pos-stat-sub"> ({stats.capitalGainPct >= 0 ? "+" : ""}{pct(stats.capitalGainPct)})</span>
                  )}
                </span>
              </div>
              <div className="pos-stat">
                <span className="pos-stat-label">Dividende annuel estimé</span>
                <span className="pos-stat-value green">
                  {stats.annualDividend != null ? money(stats.annualDividend, cur) : "—"}
                </span>
              </div>
              <div className="pos-stat">
                <span className="pos-stat-label">Yield on Cost</span>
                <span className={`pos-stat-value ${stats.yieldOnCost != null ? (stats.yieldOnCost >= 0.04 ? "green" : stats.yieldOnCost >= 0.02 ? "orange" : "red") : ""}`}>
                  {stats.yieldOnCost != null ? pct(stats.yieldOnCost) : "—"}
                </span>
              </div>
              <div className="pos-stat">
                <span className="pos-stat-label">Dividende / action</span>
                <span className="pos-stat-value">{divPS != null ? `${cur}${num(divPS, 2)}` : "—"}</span>
              </div>
            </div>
          )}

          {/* ── Purchase history ───────────────────────────────────────────── */}
          <div className="pos-history">
            <p className="pos-history-title">Historique des achats</p>
            <table className="pos-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Quantité</th>
                  <th>Prix d'achat</th>
                  <th>Coût total</th>
                  <th>P&L / action</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...positions].reverse().map(p => {
                  const pl = price != null ? price - p.pricePerShare : null;
                  const plPct = pl != null ? pl / p.pricePerShare : null;
                  return (
                    <tr key={p.id}>
                      <td>{p.date}</td>
                      <td>{num(p.quantity, 2)}</td>
                      <td>{cur}{num(p.pricePerShare, 2)}</td>
                      <td>{money(p.quantity * p.pricePerShare, cur)}</td>
                      <td className={gainColor(pl)}>
                        {pl != null ? `${pl >= 0 ? "+" : ""}${cur}${num(pl, 2)} (${plPct >= 0 ? "+" : ""}${pct(plPct)})` : "—"}
                      </td>
                      <td>
                        <button className="pos-delete-btn" onClick={() => removePosition(p.id)} title="Supprimer">✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
