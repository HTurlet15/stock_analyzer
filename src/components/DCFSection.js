import { useState, useEffect, useRef, useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar,
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
    multLabel: "P/FCF",
  },
  {
    key: "ni", label: "Net Income / Earnings",
    getCurrent:  (s) => (s.inc || [])[0]?.netIncome,
    getHistory:  (s) => (s.inc || []).filter(r => r.netIncome        != null).map(r => ({ year: r.date?.slice(0,4), value: r.netIncome })),
    getMultHist: (s) => (s.met || []).filter(r => r.peRatio          != null && r.peRatio  > 0 && r.peRatio  < 150).map(r => r.peRatio),
    multLabel: "P/E",
  },
  {
    key: "ebit", label: "EBIT",
    getCurrent:  (s) => (s.inc || [])[0]?.operatingIncome,
    getHistory:  (s) => (s.inc || []).filter(r => r.operatingIncome  != null).map(r => ({ year: r.date?.slice(0,4), value: r.operatingIncome })),
    getMultHist: (_s) => [],
    multLabel: "P/EBIT",
  },
  {
    key: "ebitda", label: "EBITDA",
    getCurrent:  (s) => (s.inc || [])[0]?.ebitda,
    getHistory:  (s) => (s.inc || []).filter(r => r.ebitda           != null).map(r => ({ year: r.date?.slice(0,4), value: r.ebitda })),
    getMultHist: (_s) => [],
    multLabel: "P/EBITDA",
  },
  {
    key: "ocf", label: "Operating Cash Flow",
    getCurrent:  (s) => (s.cf  || [])[0]?.operatingCashFlow,
    getHistory:  (s) => (s.cf  || []).filter(r => r.operatingCashFlow != null).map(r => ({ year: r.date?.slice(0,4), value: r.operatingCashFlow })),
    getMultHist: (_s) => [],
    multLabel: "P/OCF",
  },
  {
    key: "oi", label: "Operating Income",
    getCurrent:  (s) => (s.inc || [])[0]?.operatingIncome,
    getHistory:  (s) => (s.inc || []).filter(r => r.operatingIncome  != null).map(r => ({ year: r.date?.slice(0,4), value: r.operatingIncome })),
    getMultHist: (_s) => [],
    multLabel: "P/Operating Income",
  },
  {
    key: "bv", label: "Book Value",
    getCurrent:  (s) => s.equity,
    getHistory:  (s) => (s.bal || []).filter(r => r.totalStockholdersEquity != null).map(r => ({ year: r.date?.slice(0,4), value: r.totalStockholdersEquity })),
    getMultHist: (s) => (s.met || []).filter(r => r.priceToBookRatio != null && r.priceToBookRatio > 0).map(r => r.priceToBookRatio),
    multLabel: "P/B",
  },
  {
    key: "oe", label: "Owner's Earnings",
    getCurrent:  (s) => s.ownerEarningsCurrent,
    getHistory:  (s) => (s.cf || [])
      .filter(r => r.operatingCashFlow != null && r.depreciationAndAmortization != null)
      .map(r => ({ year: r.date?.slice(0,4), value: r.operatingCashFlow - r.depreciationAndAmortization })),
    getMultHist: (s) => (s.met || []).filter(r => r.peRatio != null && r.peRatio > 0 && r.peRatio < 150).map(r => r.peRatio),
    multLabel: "P/OE",
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
  const valid = (incArr || []).filter(r => r.weightedAverageShsOut != null);
  const slice = valid.slice(0, years + 1);
  if (slice.length < 2) return null;
  return cagr(slice[slice.length - 1].weightedAverageShsOut, slice[0].weightedAverageShsOut, slice.length - 1);
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
      {payload.map((p) => (
        <div key={p.dataKey} className="dcf2-tooltip-row" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span>{fmtM(p.value)}</span>
        </div>
      ))}
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
  const dropRef    = useRef(null);
  const isMounted  = useRef(false);  // skip re-seed on first render
  const metric     = METRICS.find(m => m.key === metricKey);

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

  // Re-seed only when metric or years changes AFTER mount (skip initial render)
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    const g  = histCAGR(metric.getHistory(s), years);
    const mu = avgMultiple(metric.getMultHist(s), years);
    const sc = shareCAGR(s.inc, years);
    const cv = metric.getCurrent(s);
    if (g  != null) setGrowthRate(g);
    if (mu != null) setMultiple(mu);
    if (sc != null) setShareChange(sc);
    if (cv != null) setBaseValue(cv);
  // eslint-disable-next-line
  }, [metricKey, years]);

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

  /* ── Build chart data ─────────────────────────────────────────────────── */
  const currentYear = new Date().getFullYear();

  // Historical (oldest → newest), max 10 years
  const histChron = [...histArr].reverse().slice(-10);

  // Projected without decay  (for comparison bar)
  // Projected with decay (primary)
  const projBars = [];
  let mvDecay    = baseValue;
  let mvNoDecay  = baseValue;
  for (let y = 1; y <= years; y++) {
    const effDecay   = growthRate * Math.pow(1 - growthDecay, y - 1);
    mvDecay   *= (1 + effDecay);
    mvNoDecay *= (1 + growthRate);
    projBars.push({
      year:      String(currentYear + y),
      projected: mvNoDecay,
      withDecay: mvDecay,
    });
  }

  const chartData = [
    ...histChron.map(r => ({ year: r.year, historical: r.value })),
    ...projBars,
  ];

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
              const ratio = cv != null && cv > 0 && effectiveShares > 0 && s.price
                ? s.price / (cv / effectiveShares)
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
            <p className="dcf2-chart-title">
              {metric.label} — Historique ({histChron[0]?.year}–{currentYear}) &amp; Projection ({currentYear}–{currentYear + years})
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: "var(--text-dim)" }} tickLine={false} axisLine={false} />
                <YAxis
                  tickFormatter={fmtM}
                  tick={{ fontSize: 11, fill: "var(--text-dim)" }}
                  tickLine={false}
                  axisLine={false}
                  width={55}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <ReferenceLine x={String(currentYear)} stroke="var(--border-bright)" strokeDasharray="4 3" />
                <Bar dataKey="historical" name={`Historique : ${metric.label}`} fill="var(--accent)" opacity={0.75} radius={[2,2,0,0]} />
                <Bar dataKey="projected"  name="Projection (sans décroissance)"  fill="var(--blue)"   opacity={0.55} radius={[2,2,0,0]} />
                <Bar dataKey="withDecay"  name="Projection (avec décroissance)"  fill="var(--green)"  opacity={0.70} radius={[2,2,0,0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </div>
  );
}
