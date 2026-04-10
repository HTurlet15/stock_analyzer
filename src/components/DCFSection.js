import { useState, useEffect } from "react";
import { calculateDCF, num, pct } from "../utils";
import "./DCFSection.css";

const ScenarioCard = ({ label, result, color, years, currentPrice, targetReturn }) => {
  if (!result) return null;
  const mos = result.marginOfSafety;
  const mosColor = mos > 0.15 ? "green" : mos > 0 ? "orange" : "red";
  const mosLabel = mos > 0 ? `−${(mos * 100).toFixed(0)}% sous fair value` : `+${(Math.abs(mos) * 100).toFixed(0)}% au-dessus fair value`;
  const trLabel = `${((targetReturn ?? 0.10) * 100).toFixed(0)}%/an`;
  return (
    <div className={`scenario-card ${color}`}>
      <p className="scenario-label">{label}</p>
      <div className="scenario-main">
        <span className="scenario-return">{(result.returnWithDivs * 100).toFixed(1)}%</span>
        <span className="scenario-period">/an ({years}a)</span>
      </div>
      <div className="scenario-details">
        <div className="sd-row"><span>Sans dividendes</span><span>{(result.returnNoDivs * 100).toFixed(1)}%/an</span></div>
        <div className="sd-row"><span>Prix cible ({years}a)</span><span>${num(result.priceFuture)}</span></div>
        {result.dividendsCumulated > 0 && <div className="sd-row"><span>Dividendes cumulés</span><span>${num(result.dividendsCumulated)}</span></div>}
        <div className="sd-row total"><span>Valeur totale</span><span>${num(result.totalValue)}</span></div>
        <div className="sd-row fair-value-row">
          <span>Fair value ({trLabel})</span>
          <span className="fv-price">${num(result.fairValue)}</span>
        </div>
        <div className={`sd-row mos-row ${mosColor}`}>
          <span>Cours actuel (${num(currentPrice)})</span>
          <span>{mosLabel}</span>
        </div>
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

export default function DCFSection({ stock, thresholds, onUpdate }) {
  const s = stock;

  const hasDividend = s.dividendPerShare != null && s.dividendPerShare > 0;
  const hasAnalystData = s.analystEpsGrowth != null;

  const def = {
    years: 3,
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
  const tr = thresholds?.fairValueTargetReturn ?? 0.10;
  const bearResult = calculateDCF(s, assum.bear, assum.years, tr);
  const baseResult = calculateDCF(s, assum.base, assum.years, tr);
  const bullResult = calculateDCF(s, assum.bull, assum.years, tr);

  useEffect(() => {
    onUpdate(s.symbol, { assumptions: { bear: bearResult, base: baseResult, bull: bullResult }, dcfAssumptions: assum });
  // eslint-disable-next-line
  }, [assum]);

  const update = (scenario, field, value) =>
    setAssum((p) => ({ ...p, [scenario]: { ...p[scenario], [field]: value } }));

  return (
    <div className="dcf-section">
      {/* Ancres */}
      <div className="dcf-anchors">
        <div className="dcf-anchors-header">
          <p className="section-label" style={{ marginBottom: 0 }}>Ancres historiques</p>
          <span className={`source-tag ${hasAnalystData ? "green" : "orange"}`}>
            {hasAnalystData ? "Consensus analystes disponible" : "Pas de consensus — fallback CAGR historique"}
          </span>
        </div>
        <div className="anchor-chips">
          {[
            { label: "BPA actuel",      val: `$${num(s.epsCurrent)}` },
            { label: "BPA CAGR 5a",     val: pct(s.epsGrowth) },
            { label: "BPA analystes",   val: s.analystEpsGrowth != null ? pct(s.analystEpsGrowth) : "N/A", highlight: hasAnalystData },
            { label: "PER actuel",      val: `${num(s.peCurrent, 1)}x` },
            { label: "PER moyen 5a",    val: `${num(s.peHistorical, 1)}x` },
            { label: "Div./action",     val: hasDividend ? `$${num(s.dividendPerShare)}` : "N/A" },
            { label: "Div. CAGR",       val: hasDividend ? pct(s.divGrowth) : "N/A" },
            { label: "Prix actuel",     val: `$${num(s.price)}` },
            { label: "Obj. analystes",  val: s.priceTarget?.consensus != null ? `$${num(s.priceTarget.consensus, 0)}` : "N/A",
              highlight: s.priceTarget?.consensus > s.price },
          ].map((a) => (
            <div key={a.label} className={`anchor-chip ${a.highlight ? "highlight" : ""}`}>
              <span className="ac-label">{a.label}</span>
              <span className="ac-value">{a.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Horizon */}
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

      {/* Grid 3 scénarios */}
      <div className="dcf-grid">
        {[
          { key: "bear", label: "Bear",                     color: "red"  },
          { key: "base", label: "Base — Consensus analystes", color: "blue" },
          { key: "bull", label: "Bull",                     color: "green"},
        ].map(({ key, label, color }) => (
          <div key={key} className="dcf-col">
            <p className={`scenario-header ${color}`}>{label}</p>
            <InputRow label="Croissance BPA"      value={assum[key].epsGrowth}    onChange={(v) => update(key, "epsGrowth", v)}    isPercent />
            <InputRow label="PER de sortie"       value={assum[key].peExit}       onChange={(v) => update(key, "peExit", v)}       isPercent={false} />
            {hasDividend
              ? <InputRow label="Croissance dividende" value={assum[key].divGrowthRate} onChange={(v) => update(key, "divGrowthRate", v)} isPercent />
              : <div className="input-row"><span className="input-label">Croissance dividende</span><span className="input-na">N/A</span></div>
            }
            <ScenarioCard
              label={label}
              result={key === "bear" ? bearResult : key === "base" ? baseResult : bullResult}
              color={color}
              years={assum.years}
              currentPrice={s.price}
              targetReturn={tr}
            />
          </div>
        ))}
      </div>

      <p className="dcf-disclaimer">
        Ces projections reposent sur tes hypothèses. N'investis que si le scénario Bear dépasse ton seuil minimum (ex : 8%/an).
      </p>
    </div>
  );
}
