import { useState, useEffect } from "react";
import { calculateDCF, num, pct, money } from "../utils";
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
  const hasDividend  = s.dividendPerShare != null && s.dividendPerShare > 0;
  const hasFcfData   = (s.fcfNormalized != null || (s.fcfCurrent != null && s.fcfCurrent > 0)) && s.sharesCurrent != null;
  const hasPfcfHist  = s.pfcfHistorical != null;

  // Detect old EPS/PE-based assumptions and replace with FCF defaults
  const isOldFormat  = s.dcfAssumptions?.base?.epsGrowth !== undefined;
  const fcfG   = s.fcfGrowth ?? 0.07;
  const pfcfEx = s.pfcfHistorical ?? s.pfcfCurrent ?? 20;
  const divG   = s.divGrowth ?? 0.04;

  const def = {
    years: 3,
    bear: { fcfGrowth: Math.max(fcfG * 0.6, 0.01), pfcfExit: Math.max(pfcfEx * 0.85, 5), divGrowthRate: divG * 0.6 },
    base: { fcfGrowth: fcfG,       pfcfExit: pfcfEx,           divGrowthRate: divG       },
    bull: { fcfGrowth: fcfG * 1.4, pfcfExit: pfcfEx * 1.2,     divGrowthRate: divG * 1.4 },
  };

  const [assum, setAssum] = useState((!isOldFormat && s.dcfAssumptions) || def);
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

  const fcfBase     = s.fcfNormalized ?? s.fcfCurrent;
  const fcfPerShare = hasFcfData && fcfBase ? fcfBase / s.sharesCurrent : null;
  const fcfYield    = fcfPerShare != null && s.price ? fcfPerShare / s.price : null;

  return (
    <div className="dcf-section">

      {!hasFcfData && (
        <div className="dcf-warning">
          FCF ou nombre d'actions manquant — le modèle DCF ne peut pas calculer de résultat.
          Essaie d'actualiser les données via le bouton ↻.
        </div>
      )}

      {s.fcfVolatile && hasFcfData && (
        <div className="dcf-warning" style={{ borderColor: "var(--orange)", color: "var(--orange)" }}>
          FCF irrégulier — des années négatives ont été détectées (ex : cycle CAPEX intensif). Le modèle utilise
          un <strong>FCF normalisé</strong> (moyenne des années positives récentes) au lieu du seul FCF courant.
          Ajuste manuellement le taux de croissance si nécessaire.
        </div>
      )}

      {/* Anchors */}
      <div className="dcf-anchors">
        <div className="dcf-anchors-header">
          <p className="section-label" style={{ marginBottom: 0 }}>Données d'ancrage — modèle FCF</p>
          <span className="source-tag orange">
            Estimations FCF analystes non disponibles (tier gratuit) — modèle basé sur CAGR historique
          </span>
        </div>
        <div className="anchor-chips">
          {[
            { label: "FCF total (dernier)",   val: money(s.fcfCurrent) },
            ...(s.fcfVolatile ? [{ label: "FCF normalisé (≤5a)", val: money(s.fcfNormalized), highlight: true }] : []),
            { label: "FCF / action",           val: fcfPerShare != null ? `$${num(fcfPerShare)}` : "N/A" },
            { label: "FCF Yield",              val: fcfYield != null ? pct(fcfYield) : "N/A", highlight: fcfYield != null && fcfYield > 0.04 },
            { label: `FCF CAGR (${s.fcfGrowthYears ?? "?"}a)`,    val: s.fcfGrowth != null ? pct(s.fcfGrowth) : "N/A", highlight: s.fcfGrowth != null && s.fcfGrowth > 0.08 },
            { label: "P/FCF actuel",           val: s.pfcfCurrent != null ? `${num(s.pfcfCurrent, 1)}x` : "N/A" },
            { label: `P/FCF moy. (${s.pfcfHistoricalYears ?? "?"}a)`,  val: hasPfcfHist ? `${num(s.pfcfHistorical, 1)}x` : "N/A", highlight: hasPfcfHist },
            { label: "BPA analystes (proxy)",  val: s.analystEpsGrowth != null ? pct(s.analystEpsGrowth) : "N/A", highlight: s.analystEpsGrowth != null },
            { label: "Div./action",            val: hasDividend ? `$${num(s.dividendPerShare)}` : "N/A" },
            { label: "Div. CAGR",              val: hasDividend ? pct(s.divGrowth) : "N/A" },
            { label: "Prix actuel",            val: `$${num(s.price)}` },
            { label: "Obj. analystes",         val: s.priceTarget?.consensus != null ? `$${num(s.priceTarget.consensus, 0)}` : "N/A",
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
          { key: "bear", label: "Bear",         color: "red"   },
          { key: "base", label: "Base",          color: "blue"  },
          { key: "bull", label: "Bull",          color: "green" },
        ].map(({ key, label, color }) => (
          <div key={key} className="dcf-col">
            <p className={`scenario-header ${color}`}>{label}</p>
            <InputRow label="Croissance FCF"    value={assum[key].fcfGrowth}    onChange={(v) => update(key, "fcfGrowth", v)}    isPercent />
            <InputRow label="P/FCF de sortie"   value={assum[key].pfcfExit}     onChange={(v) => update(key, "pfcfExit", v)}     isPercent={false} />
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
        Modèle FCF — Prix futur = (FCF/action × (1+g)^n) × P/FCF sortie. N'investis que si le scénario Bear dépasse ton seuil minimum. Les estimations FCF par les analystes ne sont pas disponibles en tier gratuit : ajuste manuellement selon tes recherches.
      </p>
    </div>
  );
}
