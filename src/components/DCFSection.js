import { useState, useEffect, useRef, useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { num, pct, cagr } from "../utils";
import "./DCFSection.css";

/* ─── Metric definitions ──────────────────────────────────────────────────── */
const METRICS = [
  {
    key: "fcf", label: "Free Cash Flow",
    getCurrent:  (s) => s.fcfNormalized ?? s.fcfCurrent,
    getHistory:  (s) => (s.cf  || []).filter(r => r.freeCashFlow     != null).map(r => ({ year: r.date?.slice(0,4), value: r.freeCashFlow })),
    getMultHist: (s) => (s.met || []).filter(r => r.pfcfRatio        != null && r.pfcfRatio > 0 && r.pfcfRatio < 200).map(r => r.pfcfRatio),
    multLabel: "P/FCF",    multKey: "pfcfRatio",
  },
  {
    key: "ni", label: "Net Income / Earnings",
    getCurrent:  (s) => (s.inc || [])[0]?.netIncome,
    getHistory:  (s) => (s.inc || []).filter(r => r.netIncome        != null).map(r => ({ year: r.date?.slice(0,4), value: r.netIncome })),
    getMultHist: (s) => (s.met || []).filter(r => r.peRatio          != null && r.peRatio  > 0 && r.peRatio  < 150).map(r => r.peRatio),
    multLabel: "P/E",      multKey: "peRatio",
  },
  {
    key: "ebit", label: "EBIT",
    getCurrent:  (s) => (s.inc || [])[0]?.operatingIncome,
    getHistory:  (s) => (s.inc || []).filter(r => r.operatingIncome  != null).map(r => ({ year: r.date?.slice(0,4), value: r.operatingIncome })),
    getMultHist: (_s) => [],
    multLabel: "P/EBIT",   multKey: "priceToEbit",
  },
  {
    key: "ebitda", label: "EBITDA",
    getCurrent:  (s) => (s.inc || [])[0]?.ebitda,
    getHistory:  (s) => (s.inc || []).filter(r => r.ebitda           != null).map(r => ({ year: r.date?.slice(0,4), value: r.ebitda })),
    getMultHist: (_s) => [],
    multLabel: "P/EBITDA", multKey: "priceToEbitda",
  },
  {
    key: "ocf", label: "Operating Cash Flow",
    getCurrent:  (s) => {
      const r = (s.cf || [])[0] || {};
      if (r.operatingCashFlow != null) return r.operatingCashFlow;
      if (r.freeCashFlow != null && r.capitalExpenditure != null) return r.freeCashFlow - r.capitalExpenditure;
      return null;
    },
    getHistory:  (s) => (s.cf  || []).filter(r => r.operatingCashFlow != null).map(r => ({ year: r.date?.slice(0,4), value: r.operatingCashFlow })),
    getMultHist: (_s) => [],
    multLabel: "P/OCF",    multKey: "priceToOcf",
  },
  {
    key: "oi", label: "Operating Income",
    getCurrent:  (s) => (s.inc || [])[0]?.operatingIncome,
    getHistory:  (s) => (s.inc || []).filter(r => r.operatingIncome  != null).map(r => ({ year: r.date?.slice(0,4), value: r.operatingIncome })),
    getMultHist: (_s) => [],
    multLabel: "P/Op. Income", multKey: "priceToEbit",
  },
  {
    key: "bv", label: "Book Value",
    getCurrent:  (s) => s.equity,
    getHistory:  (s) => (s.bal || []).filter(r => r.totalStockholdersEquity != null).map(r => ({ year: r.date?.slice(0,4), value: r.totalStockholdersEquity })),
    getMultHist: (s) => (s.met || []).filter(r => r.priceToBook != null && r.priceToBook > 0).map(r => r.priceToBook),
    multLabel: "P/B",      multKey: "priceToBook",
  },
  {
    key: "oe", label: "Owner's Earnings",
    getCurrent:  (s) => s.ownerEarningsCurrent,
    getHistory:  (s) => (s.cf || [])
      .filter(r => r.operatingCashFlow != null && r.depreciationAndAmortization != null)
      .map(r => ({ year: r.date?.slice(0,4), value: r.operatingCashFlow - r.depreciationAndAmortization })),
    getMultHist: (s) => (s.met || []).filter(r => r.priceToOwnerEarnings != null && r.priceToOwnerEarnings > 0 && r.priceToOwnerEarnings < 200).map(r => r.priceToOwnerEarnings),
    multLabel: "P/OE",     multKey: "priceToOwnerEarnings",
  },
];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
// arr: [{year, value}] sorted newest-first; returns CAGR over last `years` positive entries
const histCAGR = (arr, years) => {
  const valid = arr.filter(r => r.value != null && r.value > 0);
  const slice = valid.slice(0, years + 1);
  if (slice.length < 2) return null;
  return cagr(slice[slice.length - 1].value, slice[0].value, slice.length - 1);
};

const avgMultiple = (vals, years) => {
  const slice = vals.slice(0, years);
  if (!slice.length) return null;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
};

const shareCAGR = (incArr, years) => {
  const valid = (incArr || []).filter(r => r.weightedAverageShsOut != null && r.weightedAverageShsOut > 0);
  const slice = valid.slice(0, years + 1);
  if (slice.length < 2) return null;
  const r = cagr(slice[slice.length - 1].weightedAverageShsOut, slice[0].weightedAverageShsOut, slice.length - 1);
  // Safety cap ±20%/yr — real buyback/dilution programs rarely exceed this
  if (r == null) return null;
  return Math.max(-0.20, Math.min(0.20, r));
};

const fmtM = (v) => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}T`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(2)}B`;
  return `${v.toFixed(2)}M`;
};

/* ─── DCF engine ──────────────────────────────────────────────────────────── */
const runDCF = ({ baseValue, baseShares, growthRate, growthDecay, multiple,
                  years, targetReturn, dividendPerShare, divGrowthRate,
                  shareChangePct, currentPrice }) => {
  if (!baseValue || baseValue <= 0 || !baseShares || !currentPrice || !multiple || growthRate == null) return null;

  let mv = baseValue;
  let sh = baseShares;
  let divCumul = 0;
  let currentDiv = dividendPerShare || 0;
  const projected = [];

  for (let y = 1; y <= years; y++) {
    const effGrowth = growthRate * Math.pow(1 - growthDecay, y - 1);
    mv *= (1 + effGrowth);
    sh *= (1 + shareChangePct);
    currentDiv *= (1 + (divGrowthRate || 0));
    divCumul += currentDiv;
    projected.push({ y, mv, perShare: mv / sh, price: (mv / sh) * multiple, effGrowth });
  }

  const priceFuture = projected[projected.length - 1].price;
  const totalValue  = priceFuture + divCumul;
  const returnWithDivs = Math.pow(totalValue  / currentPrice, 1 / years) - 1;
  const returnNoDivs   = Math.pow(priceFuture / currentPrice, 1 / years) - 1;
  const fairValue      = totalValue / Math.pow(1 + targetReturn, years);
  const marginOfSafety = (fairValue - currentPrice) / fairValue;
  const overvaluedPct  = marginOfSafety < 0 ? ((currentPrice / fairValue - 1) * 100) : null;
  const undervaluedPct = marginOfSafety > 0 ? (marginOfSafety * 100) : null;

  return { priceFuture, divCumul, totalValue, returnWithDivs, returnNoDivs,
           fairValue, marginOfSafety, overvaluedPct, undervaluedPct, projected };
};

/* ─── Input with hint ─────────────────────────────────────────────────────── */
const NumInput = ({ label, value, onChange, isPercent, hint, unit }) => {
  const displayVal = isPercent
    ? ((value ?? 0) * 100).toFixed(2)
    : (value ?? 0).toFixed(2);
  const unitLabel = unit ?? (isPercent ? "%" : "x");

  return (
    <div className="dcf2-input-row">
      <label className="dcf2-label">{label}</label>
      <div className="dcf2-input-wrap">
        <input
          className="dcf2-input"
          type="number"
          step={isPercent ? "0.1" : "0.5"}
          value={displayVal}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange(isPercent ? v / 100 : v);
          }}
        />
        <span className="dcf2-unit">{unitLabel}</span>
      </div>
      {hint && <p className="dcf2-hint">{hint}</p>}
    </div>
  );
};

/* ─── Custom tooltip for charts ───────────────────────────────────────────── */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="dcf2-tooltip">
      <div className="dcf2-tooltip-year">{label}</div>
      {payload.map((p) => {
        const formatted = p.dataKey === "ratio"
          ? (p.value != null ? `${p.value.toFixed(1)}x` : "—")
          : fmtM(p.value);
        return (
          <div key={p.dataKey} className="dcf2-tooltip-row" style={{ color: p.color }}>
            <span>{p.name}</span>
            <span>{formatted}</span>
          </div>
        );
      })}
    </div>
  );
};

/* ─── Main component ──────────────────────────────────────────────────────── */
export default function DCFSection({ stock: s, thresholds, onUpdate }) {
  const effectiveShares = s.impliedShares ?? s.sharesCurrent; // in millions (FMP already in millions)

  /* ── Restore saved params or compute defaults ─────────────────────────── */
  const saved = s.dcfAssumptions?.metric !== undefined ? s.dcfAssumptions : null;
  const initMetricKey  = saved?.metric ?? "fcf";
  const initYears      = saved?.years  ?? 5;
  const initMetric     = METRICS.find(m => m.key === initMetricKey);
  const initHistArr    = initMetric.getHistory(s);
  const initHistGrowth = histCAGR(initHistArr, initYears);
  const initHistMult   = avgMultiple(initMetric.getMultHist(s), initYears);
  const initHistShareCh = shareCAGR(s.inc, initYears);
  const initCurrentVal  = initMetric.getCurrent(s);

  /* ── Metric selection ─────────────────────────────────────────────────── */
  const [metricKey, setMetricKey] = useState(initMetricKey);
  const [dropOpen, setDropOpen]   = useState(false);
  const dropRef        = useRef(null);
  const prevMetricKey  = useRef(metricKey);  // tracks last metric to detect real changes
  const metric         = METRICS.find(m => m.key === metricKey);

  useEffect(() => {
    const close = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  /* ── Auto-fill horizon ────────────────────────────────────────────────── */
  const [years, setYears] = useState(initYears);

  /* ── Compute hints based on current metric + years (always live) ──────── */
  const histArr    = metric.getHistory(s);
  const multArr    = metric.getMultHist(s);
  const histGrowth = histCAGR(histArr, years);
  const histMult   = avgMultiple(multArr, years);
  const histShareCh = shareCAGR(s.inc, years);
  const currentVal = metric.getCurrent(s);

  /* ── DCF parameters — restored from saved or computed defaults ────────── */
  const [growthRate,    setGrowthRate]    = useState(saved?.growthRate  ?? initHistGrowth  ?? 0.07);
  const [growthDecay,   setGrowthDecay]   = useState(saved?.growthDecay ?? 0.05);
  const [multiple,      setMultiple]      = useState(saved?.multiple    ?? initHistMult    ?? s.pfcfHistorical ?? 20);
  const [targetReturn,  setTargetReturn]  = useState(saved?.targetReturn ?? thresholds?.fairValueTargetReturn ?? 0.10);
  const [divGrowth,     setDivGrowth]     = useState(saved?.divGrowth   ?? s.divGrowth ?? 0);
  const [shareChange,   setShareChange]   = useState(saved?.shareChange ?? initHistShareCh ?? 0);
  const [baseValue,     setBaseValue]     = useState(saved?.baseValue   ?? initCurrentVal ?? 0);

  // Re-seed ONLY when the metric actually changes (not on mount/remount, not on years change)
  useEffect(() => {
    if (prevMetricKey.current === metricKey) return;
    prevMetricKey.current = metricKey;
    const g  = histCAGR(metric.getHistory(s), years);
    const mu = avgMultiple(metric.getMultHist(s), years);
    const sc = shareCAGR(s.inc, years);
    const cv = metric.getCurrent(s);
    if (g  != null) setGrowthRate(g);
    if (mu != null) setMultiple(mu);
    if (sc != null) setShareChange(sc);
    if (cv != null) setBaseValue(cv);
  // eslint-disable-next-line
  }, [metricKey]);

  /* ── DCF result (memoized to avoid infinite update loops) ────────────── */
  const result = useMemo(() => runDCF({
    baseValue,
    baseShares:      effectiveShares,
    growthRate,
    growthDecay,
    multiple,
    years,
    targetReturn,
    dividendPerShare: s.dividendPerShare || 0,
    divGrowthRate:   divGrowth,
    shareChangePct:  shareChange,
    currentPrice:    s.price,
  }), [baseValue, effectiveShares, growthRate, growthDecay, multiple, years, targetReturn, s.dividendPerShare, divGrowth, shareChange, s.price]);

  /* ── Persist results for header badge ────────────────────────────────── */
  useEffect(() => {
    if (!result) return;
    onUpdate(s.symbol, {
      assumptions: {
        base: { fairValue: result.fairValue, marginOfSafety: result.marginOfSafety, returnWithDivs: result.returnWithDivs },
      },
      dcfAssumptions: { metric: metricKey, growthRate, growthDecay, multiple, years, targetReturn, divGrowth, shareChange, baseValue },
    });
  // eslint-disable-next-line
  }, [result]);

  /* ── Chart stat toggles ──────────────────────────────────────────────── */
  const [metricStat, setMetricStat] = useState(null); // null | "avg" | "min" | "max"
  const [ratioStat,  setRatioStat]  = useState(null);
  const [showRatio,  setShowRatio]  = useState(true);

  /* ── Build chart data ─────────────────────────────────────────────────── */
  const currentYear = new Date().getFullYear();

  // Historical (oldest → newest), max 10 years
  const histChron = [...histArr].reverse().slice(-10);

  // Ratio (P/Metric) by year from s.met
  const ratioByYear = useMemo(() => {
    const map = {};
    if (metric.multKey) {
      (s.met || []).forEach(r => {
        const y = r.date?.slice(0, 4);
        const v = r[metric.multKey];
        if (y && v != null && v > 0 && v < 500) map[y] = v;
      });
    }
    return map;
  }, [metric.multKey, s.met]);

  const projBars = [];
  let mvDecay    = baseValue;
  let mvNoDecay  = baseValue;
  for (let y = 1; y <= years; y++) {
    const effDecay   = growthRate * Math.pow(1 - growthDecay, y - 1);
    mvDecay   *= (1 + effDecay);
    mvNoDecay *= (1 + growthRate);
    projBars.push({ year: String(currentYear + y), projected: mvNoDecay, withDecay: mvDecay });
  }

  // Current year bridge point (live value, not projected)
  const currentYearStr = String(currentYear);
  const currentRatio = (() => {
    if (ratioByYear[currentYearStr]) return ratioByYear[currentYearStr];
    // Mirror ValuationSection formula: use raw (non-normalized) value and sharesCurrent
    const rawVal = metric.key === "fcf" ? s.fcfCurrent : currentVal;
    const shs = s.sharesCurrent;
    if (rawVal != null && rawVal > 0 && shs != null && shs > 0 && s.price) {
      const r = s.price / (rawVal / shs);
      return r > 0 && r < 500 ? r : null;
    }
    return null;
  })();
  const lastHistYear = histChron[histChron.length - 1]?.year;

  const chartData = [
    ...histChron.map(r => ({ year: r.year, historical: r.value, ratio: ratioByYear[r.year] ?? null })),
    ...(lastHistYear !== currentYearStr
      ? [{ year: currentYearStr, historical: currentVal ?? baseValue, ratio: currentRatio }]
      : []),
    ...projBars.map(p => ({ ...p, ratio: null })),
  ];

  // Stats for reference lines
  const metricVals = histChron.map(r => r.value).filter(v => v != null && isFinite(v));
  const ratioVals  = histChron.map(r => ratioByYear[r.year]).filter(v => v != null && isFinite(v));
  const statOf = (arr, kind) => {
    if (!arr.length) return null;
    if (kind === "avg") return arr.reduce((a, b) => a + b, 0) / arr.length;
    if (kind === "min") return Math.min(...arr);
    if (kind === "max") return Math.max(...arr);
    return null;
  };
  const hasRatioData = ratioVals.length > 0;

  // Axis domains — both start at 0, scaled to their own data max
  // This creates the fiscal.ai-style juxtaposition
  const allBarVals = chartData.flatMap(d => [d.historical, d.projected, d.withDecay]).filter(v => v != null && v > 0);
  const allRatioValsForDomain = [...ratioVals, currentRatio].filter(v => v != null && v > 0);
  const metricDomain = allBarVals.length > 0 ? [0, Math.max(...allBarVals) * 1.20] : [0, 'auto'];
  const ratioDomain  = allRatioValsForDomain.length > 0 ? [0, Math.max(...allRatioValsForDomain) * 1.35] : [0, 'auto'];

  /* ── MOS color helpers ─────────────────────────────────────────────────── */
  const fairColor = result
    ? (result.marginOfSafety > 0.15 ? "green" : result.marginOfSafety > 0 ? "orange" : "red")
    : "dim";

  const cagrColor = result
    ? (result.returnWithDivs >= targetReturn ? "green" : result.returnWithDivs >= targetReturn * 0.6 ? "orange" : "red")
    : "dim";

  /* ── Summary text ─────────────────────────────────────────────────────── */
  const summaryText = () => {
    if (!result) return "Données insuffisantes pour calculer le DCF.";
    const pct2 = (v) => `${(v * 100).toFixed(1)}%`;
    if (result.overvaluedPct != null) {
      return `D'après tes hypothèses, ${s.symbol} est surévalué de ${result.overvaluedPct.toFixed(0)}% et produirait un CAGR de ${pct2(result.returnWithDivs)} depuis le cours actuel. Tu devrais acheter à $${num(result.fairValue)} pour atteindre ton rendement cible de ${pct2(targetReturn)}.`;
    }
    return `D'après tes hypothèses, ${s.symbol} est sous-évalué de ${(result.undervaluedPct ?? 0).toFixed(0)}% et produirait un CAGR de ${pct2(result.returnWithDivs)} depuis le cours actuel.`;
  };

  const hasDividend = s.dividendPerShare != null && s.dividendPerShare > 0;

  return (
    <div className="dcf2-section">

      {/* ── Main: inputs (left) + results+chart (right) ────────────────── */}
      <div className="dcf2-top">

        {/* Left: inputs */}
        <div className="dcf2-inputs">

          {/* Metric dropdown */}
          <div className="dcf2-metric-row">
            <label className="dcf2-label">Métrique utilisée</label>
            <div className="dcf2-dropdown" ref={dropRef}>
              <button className="dcf2-drop-btn" onClick={() => setDropOpen(o => !o)}>
                <span>{metric.label}</span>
                <span className="dcf2-drop-caret">{dropOpen ? "▲" : "▼"}</span>
              </button>
              {dropOpen && (
                <ul className="dcf2-drop-list">
                  {METRICS.map(m => (
                    <li
                      key={m.key}
                      className={`dcf2-drop-item${m.key === metricKey ? " active" : ""}`}
                      onClick={() => { setMetricKey(m.key); setDropOpen(false); }}
                    >
                      {m.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {(() => {
              const cv = currentVal;
              const perShare = cv != null && effectiveShares > 0 ? cv / effectiveShares : null;
              const ratio = perShare != null && perShare !== 0 && s.price
                ? s.price / perShare
                : null;
              return ratio != null
                ? <p className="dcf2-hint">Cours actuel / {metric.label} par action : {ratio.toFixed(1)}x</p>
                : null;
            })()}
          </div>

          {/* Horizon */}
          <div className="dcf2-input-row">
            <label className="dcf2-label">Horizon de projection</label>
            <div className="dcf2-input-wrap">
              <input
                className="dcf2-input"
                type="number"
                min="1"
                max="30"
                step="1"
                value={years}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(30, parseInt(e.target.value) || 1));
                  setYears(v);
                }}
              />
              <span className="dcf2-unit">ans</span>
            </div>
            <p className="dcf2-hint">Auto-rempli sur {years} ans de données</p>
          </div>

          <NumInput
            label={`Croissance ${metric.label}`}
            value={growthRate}
            onChange={setGrowthRate}
            isPercent
            hint={histGrowth != null ? `CAGR ${metric.label} sur les ${years} dernières années : ${(histGrowth * 100).toFixed(2)}%` : null}
          />

          <NumInput
            label="Taux de décroissance de la croissance"
            value={growthDecay}
            onChange={setGrowthDecay}
            isPercent
            hint="0 = pas de décroissance. Réduit le taux de croissance de ce % chaque année."
          />

          <NumInput
            label={`Ratio ${metric.multLabel}`}
            value={multiple}
            onChange={setMultiple}
            isPercent={false}
            hint={histMult != null ? `Moyenne ${metric.multLabel} sur les ${years} dernières années : ${histMult.toFixed(2)}x` : null}
          />

          <NumInput
            label="Rendement cible"
            value={targetReturn}
            onChange={setTargetReturn}
            isPercent
          />

          {hasDividend && (
            <NumInput
              label="Croissance du dividende"
              value={divGrowth}
              onChange={setDivGrowth}
              isPercent
              hint={s.divGrowth != null ? `CAGR dividende historique : ${(s.divGrowth * 100).toFixed(2)}%` : null}
            />
          )}

          <NumInput
            label="Variation annuelle du nombre d'actions"
            value={shareChange}
            onChange={setShareChange}
            isPercent
            hint={histShareCh != null ? `CAGR actions sur les ${years} dernières années : ${(histShareCh * 100).toFixed(2)}%` : null}
          />

          <NumInput
            label={`Point de départ — ${metric.label} (millions)`}
            value={baseValue}
            onChange={setBaseValue}
            isPercent={false}
            unit="M"
            hint={currentVal != null ? `Valeur ${metric.label} la plus récente : ${fmtM(currentVal)}` : null}
          />
        </div>

        {/* Right: results + chart stacked */}
        <div className="dcf2-results">
          <div className="dcf2-analysis-box">
            <p className="dcf2-analysis-title">Analyse DCF</p>
            <p className="dcf2-analysis-text">{summaryText()}</p>
          </div>

          <div className="dcf2-kpi-grid">
            <div className="dcf2-kpi">
              <span className="dcf2-kpi-label">Cours actuel</span>
              <span className="dcf2-kpi-val green">${num(s.price)}</span>
            </div>
            <div className="dcf2-kpi">
              <span className="dcf2-kpi-label">Cours futur ({years}a)</span>
              <span className={`dcf2-kpi-val ${result?.priceFuture > s.price ? "green" : "red"}`}>
                {result ? `$${num(result.priceFuture)}` : "—"}
              </span>
            </div>
            {hasDividend && (
              <div className="dcf2-kpi">
                <span className="dcf2-kpi-label">Dividendes cumulés</span>
                <span className="dcf2-kpi-val">{result ? `$${num(result.divCumul)}` : "—"}</span>
              </div>
            )}
            <div className="dcf2-kpi">
              <span className="dcf2-kpi-label">Fair value</span>
              <div className="dcf2-kpi-fair">
                <span className={`dcf2-kpi-val ${fairColor}`}>
                  {result ? `$${num(result.fairValue)}` : "—"}
                </span>
                {result && (
                  <span className={`dcf2-mos-badge ${fairColor}`}>
                    {result.marginOfSafety > 0
                      ? `−${(result.marginOfSafety * 100).toFixed(0)}%`
                      : `+${(Math.abs(result.marginOfSafety) * 100).toFixed(0)}%`}
                  </span>
                )}
              </div>
            </div>
            <div className="dcf2-kpi">
              <span className="dcf2-kpi-label">CAGR estimé</span>
              <span className={`dcf2-kpi-val ${cagrColor}`}>
                {result ? pct(result.returnWithDivs) : "—"}
              </span>
            </div>
          </div>

          {/* Chart — under the KPIs, inside the right column */}
          <div className="dcf2-chart-section">
            <div className="dcf2-chart-header">
              <p className="dcf2-chart-title">
                {metric.label} — Historique ({histChron[0]?.year}–{currentYearStr}) &amp; Projection ({currentYearStr}–{currentYear + years})
              </p>
              <div className="dcf2-chart-toggles">
                <div className="dcf2-toggle-group">
                  <span className="dcf2-toggle-label">{metric.label}</span>
                  {["avg", "min", "max"].map(k => (
                    <button key={k} className={`dcf2-toggle-btn ${metricStat === k ? "active metric" : ""}`}
                      onClick={() => setMetricStat(p => p === k ? null : k)}>
                      {k === "avg" ? "Moy" : k === "min" ? "Min" : "Max"}
                    </button>
                  ))}
                </div>
                {hasRatioData && (
                  <div className="dcf2-toggle-group">
                    <span className="dcf2-toggle-label">{metric.multLabel}</span>
                    <button className={`dcf2-toggle-btn ${showRatio ? "active ratio" : ""}`}
                      onClick={() => setShowRatio(p => !p)}>
                      Courbe
                    </button>
                    {["avg", "min", "max"].map(k => (
                      <button key={k} className={`dcf2-toggle-btn ${ratioStat === k ? "active ratio" : ""}`}
                        onClick={() => setRatioStat(p => p === k ? null : k)}>
                        {k === "avg" ? "Moy" : k === "min" ? "Min" : "Max"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: "var(--text-dim)" }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left"
                  domain={metricDomain}
                  tickFormatter={fmtM}
                  tick={{ fontSize: 11, fill: "var(--text-dim)" }}
                  tickLine={false} axisLine={false} width={55}
                />
                {hasRatioData && (
                  <YAxis yAxisId="right" orientation="right"
                    domain={ratioDomain}
                    tickFormatter={v => `${v.toFixed(0)}x`}
                    tick={{ fontSize: 11, fill: "var(--text-dim)" }}
                    tickLine={false} axisLine={false} width={40}
                  />
                )}
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <ReferenceLine yAxisId="left" x={currentYearStr} stroke="var(--border-bright)" strokeDasharray="4 3" />

                {/* Metric reference lines */}
                {metricStat && statOf(metricVals, metricStat) != null && (
                  <ReferenceLine yAxisId="left" y={statOf(metricVals, metricStat)}
                    stroke="var(--accent)" strokeDasharray="4 2" strokeWidth={1.5}
                    label={{ value: `${metricStat === "avg" ? "Moy" : metricStat === "min" ? "Min" : "Max"} ${fmtM(statOf(metricVals, metricStat))}`, position: "insideTopLeft", fontSize: 10, fill: "var(--accent)" }}
                  />
                )}
                {/* Ratio reference lines */}
                {ratioStat && hasRatioData && statOf(ratioVals, ratioStat) != null && (
                  <ReferenceLine yAxisId="right" y={statOf(ratioVals, ratioStat)}
                    stroke="var(--orange)" strokeDasharray="4 2" strokeWidth={1.5}
                    label={{ value: `${ratioStat === "avg" ? "Moy" : ratioStat === "min" ? "Min" : "Max"} ${statOf(ratioVals, ratioStat).toFixed(1)}x`, position: "insideTopRight", fontSize: 10, fill: "var(--orange)" }}
                  />
                )}

                <Bar yAxisId="left" dataKey="historical" name={`Historique : ${metric.label}`} fill="var(--accent)" opacity={0.80} radius={[3,3,0,0]} />
                <Bar yAxisId="left" dataKey="projected"  name="Projection (sans décroissance)"  fill="var(--blue)"   opacity={0.50} radius={[3,3,0,0]} />
                <Bar yAxisId="left" dataKey="withDecay"  name="Projection (avec décroissance)"  fill="var(--green)"  opacity={0.65} radius={[3,3,0,0]} />
                {hasRatioData && showRatio && (
                  <Line yAxisId="right" dataKey="ratio" name={`${metric.multLabel}`}
                    stroke="#e05252" strokeWidth={2.5}
                    dot={{ r: 2.5, fill: "#e05252", strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#e05252", strokeWidth: 0 }}
                    connectNulls={false} type="monotone"
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </div>
  );
}
