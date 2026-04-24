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

  // Process chronologically with average cost method
  const sorted = [...positions].sort((a, b) => new Date(a.date) - new Date(b.date));
  let totalShares = 0;
  let totalCost   = 0;
  let realizedGain = 0;

  for (const p of sorted) {
    if (p.type === "vente") {
      const avgCost = totalShares > 0 ? totalCost / totalShares : 0;
      realizedGain += p.quantity * (p.pricePerShare - avgCost);
      totalShares  -= p.quantity;
      totalCost    -= p.quantity * avgCost;
    } else {
      totalShares += p.quantity;
      totalCost   += p.quantity * p.pricePerShare;
    }
  }

  totalShares = Math.max(0, totalShares);
  totalCost   = Math.max(0, totalCost);

  const avgCost         = totalShares > 0 ? totalCost / totalShares : null;
  const currentValue    = price != null && totalShares > 0 ? totalShares * price : null;
  const unrealizedGain  = currentValue != null ? currentValue - totalCost : null;
  const unrealizedPct   = unrealizedGain != null && totalCost > 0 ? unrealizedGain / totalCost : null;
  const annualDividend  = dividendPerShare != null && totalShares > 0 ? totalShares * dividendPerShare : null;
  const yieldOnCost     = annualDividend != null && totalCost > 0 ? annualDividend / totalCost : null;

  return {
    totalShares, costBasis: totalCost, avgCost,
    currentValue, capitalGain: unrealizedGain, capitalGainPct: unrealizedPct,
    realizedGain, annualDividend, yieldOnCost,
  };
}

export default function PositionsSection({ stock, onUpdate }) {
  const positions = stock.positions || [];
  const cur  = stock.currency === "EUR" ? "€" : "$";
  const price = stock.price;
  const divPS = stock.dividendPerShare;

  const [type, setType]       = useState("achat");
  const [form, setForm]       = useState({ date: new Date().toISOString().slice(0, 10), quantity: "", pricePerShare: "" });
  const [formError, setFormError] = useState("");

  const stats = computePositionStats(positions, price, divPS);

  const addPosition = () => {
    const q = parseFloat(form.quantity);
    const p = parseFloat(form.pricePerShare);
    if (!q || q <= 0 || !p || p <= 0) { setFormError("Quantité et prix doivent être positifs."); return; }
    if (!form.date) { setFormError("Date requise."); return; }
    setFormError("");
    const updated = [...positions, { id: Date.now(), date: form.date, quantity: q, pricePerShare: p, type }]
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
        <div className="pos-form-header">
          <p className="pos-form-title">Ajouter une transaction</p>
          <div className="pos-type-toggle">
            <button
              className={`pos-type-btn${type === "achat" ? " active-buy" : ""}`}
              onClick={() => setType("achat")}
            >Achat</button>
            <button
              className={`pos-type-btn${type === "vente" ? " active-sell" : ""}`}
              onClick={() => setType("vente")}
            >Vente</button>
          </div>
        </div>
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
            Prix {type === "achat" ? "d'achat" : "de vente"} ({cur})
            <input type="number" className="pos-input" placeholder="ex: 185.50" min="0" step="0.01"
              value={form.pricePerShare} onChange={e => setForm(p => ({ ...p, pricePerShare: e.target.value }))} />
          </label>
          <button className={`pos-add-btn${type === "vente" ? " sell" : ""}`} onClick={addPosition}>
            {type === "achat" ? "Ajouter achat" : "Ajouter vente"}
          </button>
        </div>
        {formError && <p className="pos-error">{formError}</p>}
      </div>

      {positions.length === 0 ? (
        <p className="pos-empty">Aucune transaction enregistrée. Ajoute ta première position ci-dessus.</p>
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
                <span className="pos-stat-value">{stats.avgCost != null ? `${cur}${num(stats.avgCost, 2)}` : "—"}</span>
              </div>
              <div className="pos-stat">
                <span className="pos-stat-label">Coût total (restant)</span>
                <span className="pos-stat-value">{money(stats.costBasis, cur)}</span>
              </div>
              <div className="pos-stat">
                <span className="pos-stat-label">Valeur actuelle</span>
                <span className="pos-stat-value">{stats.currentValue != null ? money(stats.currentValue, cur) : "—"}</span>
              </div>
              <div className="pos-stat">
                <span className="pos-stat-label">Plus-value non réalisée</span>
                <span className={`pos-stat-value ${gainColor(stats.capitalGain)}`}>
                  {stats.capitalGain != null
                    ? `${stats.capitalGain >= 0 ? "+" : ""}${money(stats.capitalGain, cur)}`
                    : "—"}
                  {stats.capitalGainPct != null && (
                    <span className="pos-stat-sub"> ({stats.capitalGainPct >= 0 ? "+" : ""}{pct(stats.capitalGainPct)})</span>
                  )}
                </span>
              </div>
              <div className="pos-stat">
                <span className="pos-stat-label">Plus-value réalisée</span>
                <span className={`pos-stat-value ${gainColor(stats.realizedGain)}`}>
                  {stats.realizedGain !== 0
                    ? `${stats.realizedGain >= 0 ? "+" : ""}${money(stats.realizedGain, cur)}`
                    : "—"}
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
            </div>
          )}

          {/* ── Transaction history ─────────────────────────────────────────── */}
          <div className="pos-history">
            <p className="pos-history-title">Historique des transactions</p>
            <table className="pos-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Quantité</th>
                  <th>Prix</th>
                  <th>Montant</th>
                  <th>P&L / action</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...positions].reverse().map(p => {
                  const isSale = p.type === "vente";
                  const pl = price != null ? price - p.pricePerShare : null;
                  const plPct = pl != null ? pl / p.pricePerShare : null;
                  return (
                    <tr key={p.id}>
                      <td>{p.date}</td>
                      <td className={isSale ? "red" : "green"}>{isSale ? "Vente" : "Achat"}</td>
                      <td>{isSale ? "-" : "+"}{num(p.quantity, 2)}</td>
                      <td>{cur}{num(p.pricePerShare, 2)}</td>
                      <td>{money(p.quantity * p.pricePerShare * (isSale ? 1 : -1), cur)}</td>
                      <td className={isSale ? "" : gainColor(pl)}>
                        {isSale ? "—" : pl != null
                          ? `${pl >= 0 ? "+" : ""}${cur}${num(pl, 2)} (${plPct >= 0 ? "+" : ""}${pct(plPct)})`
                          : "—"}
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
