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
