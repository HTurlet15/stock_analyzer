import { useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { pct, num, money, colorFromThresholds, computeMetricsForPeriod } from "../utils";
import { computeScore } from "../thresholds";
import MoatSection from "./MoatSection";
import ManagementSection from "./ManagementSection";
import BusinessAnalysisSection from "./BusinessAnalysisSection";
import GuidanceSection from "./GuidanceSection";
import DCFSection from "./DCFSection";
import SyntheseSection from "./SyntheseSection";
import ValuationSection from "./ValuationSection";
import PositionsSection from "./PositionsSection";
import "./StockCard.css";

const FinChart = ({ years, rawValues, fmt }) => {
  const data = years.map((y, i) => ({ year: y, value: rawValues[i] }));
  const valid = rawValues.filter(v => v != null && isFinite(v));
  if (valid.length < 2) return <p style={{ padding: "12px 16px", fontSize: 12, color: "var(--text-dim)", textAlign: "center" }}>Pas assez de données.</p>;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const pad = (max - min) * 0.15 || Math.abs(max) * 0.1 || 1;
  return (
    <div style={{ padding: "12px 8px 8px", background: "var(--bg-card)" }}>
      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} />
          <YAxis
            domain={[min - pad, max + pad]}
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickLine={false} axisLine={false}
            tickFormatter={fmt} width={62}
          />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}>
                <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{label}</div>
                <div style={{ color: "var(--text)", fontWeight: 600 }}>{fmt(payload[0].value)}</div>
              </div>
            );
          }} />
          <Line type="monotone" dataKey="value" stroke="var(--blue)" strokeWidth={2} dot={{ r: 3, fill: "var(--blue)", strokeWidth: 0 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// ── Financial Table ──────────────────────────────────────────────────────────

const FinancialTable = ({ income: rawInc, balance: rawBal, cashflow: rawCf, metrics: rawMet, ratios: rawRat, period, ttm = {} }) => {
  const [expandedRow, setExpandedRow] = useState(null);

  const LIMIT = period === "max" ? 20 : period;
  // rawInc is already sorted newest-first by processData
  const inc = [...rawInc].slice(0, LIMIT).reverse();
  const bal = [...rawBal].slice(0, LIMIT).reverse();
  const cf  = [...rawCf].slice(0, LIMIT).reverse();
  const met = [...rawMet].slice(0, LIMIT).reverse();
  const rat = [...rawRat].slice(0, LIMIT).reverse();

  const YEARS = inc.map(r => r.date.slice(0, 4));
  if (!YEARS.length) return <p className="empty-table">Données indisponibles.</p>;

  // Latest data column (most recent entry, regardless of period)
  const curInc = rawInc[0] || {};
  const curBal = rawBal[0] || {};
  const curCF  = rawCf[0]  || {};
  const curMet = rawMet[0] || {};
  const curRat = rawRat[0] || {};
  const latestYear = curInc.date?.slice(0, 4) || new Date().getFullYear().toString();
  const t = ttm; // TTM values shorthand

  const byYear = (arr, year) => arr.find(r => r.date?.startsWith(year)) || {};

  // ── Trend helpers ────────────────────────────────────────────────────────
  // trendCAGR: shows %/an, inverse=true means decrease is good (debt, shares)
  const trendCAGR = (values, good = 0.10, ok = 0.05, inverse = false) => {
    const v = values.filter(x => x != null && isFinite(x));
    if (v.length < 2) return { label: "—", cls: "dim" };
    const first = v[0], last = v[v.length - 1];
    if (first > 0 && last > 0) {
      const rate = Math.pow(last / first, 1 / (v.length - 1)) - 1;
      if (!isFinite(rate) || isNaN(rate)) return { label: "—", cls: "dim" };
      const cls = !inverse
        ? (rate >= good ? "green" : rate >= ok ? "orange" : "red")
        : (rate <= -good ? "green" : rate <= -ok ? "orange" : "red");
      return { label: `${rate >= 0 ? "↑" : "↓"} ${Math.abs(rate * 100).toFixed(1)}%/an`, cls };
    }
    if (first <= 0 && last > 0) return { label: "↑ Redressement", cls: inverse ? "red" : "green" };
    if (first > 0 && last <= 0) return { label: "↓ Détérioration", cls: inverse ? "green" : "red" };
    const improving = last > first;
    return { label: improving ? "↑ S'améliore" : "↓ Se dégrade", cls: improving ? "orange" : "red" };
  };

  // trendLevel: color from absolute level thresholds, rate of change as label
  const trendLevel = (values, good, ok, inverse = false) => {
    const v = values.filter(x => x != null && isFinite(x));
    if (!v.length) return { label: "—", cls: "dim" };
    const latest = v[v.length - 1];
    const cls = !inverse
      ? (latest >= good ? "green" : latest >= ok ? "orange" : "red")
      : (latest <= good ? "green" : latest <= ok ? "orange" : "red");
    if (v.length < 2) return { label: "—", cls };
    const first = v[0];
    if (first > 0 && latest > 0) {
      const rate = Math.pow(latest / first, 1 / (v.length - 1)) - 1;
      if (isFinite(rate) && !isNaN(rate))
        return { label: `${rate >= 0 ? "↑" : "↓"} ${Math.abs(rate * 100).toFixed(1)}%/an`, cls };
    }
    return { label: latest < first ? "↓" : "↑", cls };
  };

  // ── Formatters ────────────────────────────────────────────────────────────
  const fM  = v => v == null ? "—" : money(v);
  const fP  = v => v == null ? "—" : pct(v);
  const fR  = v => v == null ? "—" : `${num(v, 1)}x`;
  const fE  = v => v == null ? "—" : `$${num(v, 2)}`;
  const fSh = v => {
    if (v == null) return "—";
    const abs = Math.abs(v);
    return abs >= 1e9 ? `${(abs / 1e9).toFixed(2)}B` : `${(abs / 1e6).toFixed(0)}M`;
  };

  // ── Row builder ──────────────────────────────────────────────────────────
  const rows = [];
  const sec = title => rows.push({ isSection: true, title });
  const row = (label, getVal, fmt, getTrend, curVal) => {
    const rawVals = YEARS.map(getVal);
    rows.push({ label, values: rawVals.map(fmt), rawValues: rawVals, fmt, trend: getTrend(rawVals), curVal });
  };

  // Compte de résultat
  sec("Compte de résultat");
  row("Chiffre d'affaires",
    y => byYear(inc, y).revenue, fM,
    v => trendCAGR(v), t.revenue ?? curInc.revenue);
  row("Résultat net",
    y => byYear(inc, y).netIncome, fM,
    v => trendCAGR(v), t.netIncome ?? curInc.netIncome);
  row("Marge nette",
    y => { const r = byYear(inc, y); return r.netIncome && r.revenue ? r.netIncome / r.revenue : null; }, fP,
    v => trendLevel(v, 0.20, 0.10),
    t.netIncome != null && t.revenue ? t.netIncome / t.revenue : (curInc.netIncome && curInc.revenue ? curInc.netIncome / curInc.revenue : null));
  row("EBITDA",
    y => byYear(inc, y).ebitda, fM,
    v => trendCAGR(v), t.ebitda ?? curInc.ebitda);
  row("BPA (dilué)",
    y => byYear(inc, y).eps, fE,
    v => trendCAGR(v), t.eps ?? curInc.eps);
  row("Actions en circulation",
    y => byYear(inc, y).weightedAverageShsOut, fSh,
    v => trendCAGR(v, 0.02, 0.005, true), t.weightedAverageShsOut ?? curInc.weightedAverageShsOut);

  // Bilan
  sec("Bilan");
  row("Fonds propres",
    y => byYear(bal, y).totalStockholdersEquity, fM,
    v => trendCAGR(v, 0.05, 0.02), t.totalStockholdersEquity ?? curBal.totalStockholdersEquity);
  row("Dette totale",
    y => byYear(bal, y).totalDebt, fM,
    v => trendCAGR(v, 0.05, 0.02, true), t.totalDebt ?? curBal.totalDebt);
  row("Dette nette",
    y => byYear(bal, y).netDebt, fM,
    v => trendCAGR(v, 0.05, 0.02, true), t.netDebt ?? curBal.netDebt);
  row("Dette nette / EBITDA",
    y => { const b = byYear(bal, y); const i = byYear(inc, y); return b.netDebt != null && i.ebitda && i.ebitda > 0 ? b.netDebt / i.ebitda : null; }, fR,
    v => trendLevel(v, 2, 3, true),
    t.netDebt != null && t.ebitda && t.ebitda > 0 ? t.netDebt / t.ebitda : (curBal.netDebt != null && curInc.ebitda && curInc.ebitda > 0 ? curBal.netDebt / curInc.ebitda : null));

  // Cash Flow
  sec("Cash Flow");
  row("Flux opérationnel (OCF)",
    y => byYear(cf, y).operatingCashFlow, fM,
    v => trendCAGR(v), t.operatingCashFlow ?? curCF.operatingCashFlow);
  row("Free Cash Flow",
    y => byYear(cf, y).freeCashFlow, fM,
    v => trendCAGR(v), t.freeCashFlow ?? curCF.freeCashFlow);
  row("Capex total",
    y => { const r = byYear(cf, y); return r.capitalExpenditure != null ? Math.abs(r.capitalExpenditure) : null; }, fM,
    v => trendCAGR(v, 0.05, 0.02),
    t.capitalExpenditure != null ? Math.abs(t.capitalExpenditure) : (curCF.capitalExpenditure != null ? Math.abs(curCF.capitalExpenditure) : null));
  row("Dividendes versés",
    y => { const r = byYear(cf, y); return r.dividendsPaid != null ? Math.abs(r.dividendsPaid) : null; }, fM,
    v => trendCAGR(v, 0.03, 0.01),
    t.dividendsPaid != null ? Math.abs(t.dividendsPaid) : (curCF.dividendsPaid != null ? Math.abs(curCF.dividendsPaid) : null));
  row("Dividende par action",
    y => {
      const c = byYear(cf, y); const i = byYear(inc, y);
      const d = c.dividendsPaid != null ? Math.abs(c.dividendsPaid) : null;
      return d != null && i.weightedAverageShsOut > 0 ? d / i.weightedAverageShsOut : null;
    }, fE,
    v => trendCAGR(v, 0.05, 0.02),
    t.dividendPerShare ?? (() => {
      const d = curCF.dividendsPaid != null ? Math.abs(curCF.dividendsPaid) : null;
      return d != null && curInc.weightedAverageShsOut > 0 ? d / curInc.weightedAverageShsOut : null;
    })());

  // Capex decomposition & Owner's Earnings
  sec("Capex & Owner's Earnings");
  row("D&A — capex maintenance (estimé)",
    y => byYear(cf, y).depreciationAndAmortization, fM,
    v => trendCAGR(v, 0.05, 0.02),
    t.depreciationAndAmortization ?? curCF.depreciationAndAmortization);
  row("Capex de croissance (calculé)",
    y => {
      const r = byYear(cf, y);
      const cap = r.capitalExpenditure != null ? Math.abs(r.capitalExpenditure) : null;
      const da  = r.depreciationAndAmortization;
      return cap != null && da != null ? Math.max(0, cap - da) : null;
    }, fM,
    v => trendCAGR(v, 0.05, 0.02),
    (() => {
      const cap = t.capitalExpenditure != null ? Math.abs(t.capitalExpenditure) : (curCF.capitalExpenditure != null ? Math.abs(curCF.capitalExpenditure) : null);
      const da  = t.depreciationAndAmortization ?? curCF.depreciationAndAmortization;
      return cap != null && da != null ? Math.max(0, cap - da) : null;
    })());
  row("Owner's Earnings",
    y => {
      const r = byYear(cf, y);
      return r.operatingCashFlow != null && r.depreciationAndAmortization != null
        ? r.operatingCashFlow - r.depreciationAndAmortization : null;
    }, fM,
    v => trendCAGR(v),
    (() => {
      const ocf = t.operatingCashFlow ?? curCF.operatingCashFlow;
      const da  = t.depreciationAndAmortization ?? curCF.depreciationAndAmortization;
      return ocf != null && da != null ? ocf - da : null;
    })());

  // Rentabilité
  sec("Rentabilité");
  row("ROIC",
    y => byYear(met, y).roic, fP,
    v => trendLevel(v, 0.20, 0.15),
    (() => {
      const eq = t.totalStockholdersEquity; const nd = t.netDebt; const ni = t.netIncome;
      if (ni != null && eq != null && nd != null && (eq + nd) > 0) return ni / (eq + nd);
      return curMet.roic;
    })());
  row("ROE",
    y => byYear(met, y).roe, fP,
    v => trendLevel(v, 0.15, 0.10),
    (() => {
      const eq = t.totalStockholdersEquity; const ni = t.netIncome;
      if (ni != null && eq != null && eq > 0) return ni / eq;
      return curMet.roe;
    })());
  row("PER historique",
    y => byYear(met, y).peRatio, fR,
    v => trendCAGR(v, 0.05, 0.02, true), curMet.peRatio);
  row("Payout Ratio",
    y => byYear(rat, y).payoutRatio, fP,
    v => trendLevel(v, 0.40, 0.60, true),
    t.dividendsPaid != null && t.netIncome && t.netIncome > 0
      ? Math.abs(t.dividendsPaid) / t.netIncome : curRat.payoutRatio);
  row("Dette / Fonds propres",
    y => byYear(rat, y).debtToEquity, fR,
    v => trendLevel(v, 1, 2, true),
    t.totalDebt != null && t.totalStockholdersEquity && t.totalStockholdersEquity > 0
      ? t.totalDebt / t.totalStockholdersEquity : curRat.debtToEquity);

  return (
    <div className="fin-table-wrap">
      <table className="fin-table">
        <thead>
          <tr>
            <th className="ft-label" />
            {YEARS.map(y => <th key={y} className="ft-year">{y}</th>)}
            <th className="ft-year ft-year-current">TTM ★</th>
            <th className="ft-trend">Tendance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            if (r.isSection) return (
              <tr key={i} className="ft-section">
                <td colSpan={YEARS.length + 3}>{r.title}</td>
              </tr>
            );
            const isOpen = expandedRow === i;
            return [
              <tr key={i} className="ft-row" style={{ cursor: "pointer" }} onClick={() => setExpandedRow(isOpen ? null : i)}>
                <td className="ft-label">{r.label}</td>
                {r.values.map((v, j) => <td key={j} className="ft-data">{v}</td>)}
                <td className="ft-data ft-data-current">{r.fmt(r.curVal)}</td>
                <td className={`ft-trend ${r.trend.cls}`}>{r.trend.label}</td>
              </tr>,
              isOpen && (
                <tr key={`chart-${i}`}>
                  <td colSpan={YEARS.length + 3} style={{ padding: 0, borderBottom: "1px solid var(--border)" }}>
                    <FinChart years={YEARS} rawValues={r.rawValues} fmt={r.fmt} />
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
};

// ── Key Checks ───────────────────────────────────────────────────────────────

const KeyCheck = ({ label, passed, detail }) => (
  <div className="key-check">
    <div className="kc-row">
      <span className={`kc-badge ${passed === true ? "green" : passed === false ? "red" : "dim"}`}>
        {passed === true ? "Validé" : passed === false ? "Non validé" : "N/A"}
      </span>
      <span className="kc-label">{label}</span>
    </div>
    {detail && <p className="kc-detail">{detail}</p>}
  </div>
);

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "synthese",    label: "Synthèse" },
  { id: "financials",  label: "Finances" },
  { id: "valuation",   label: "Valorisation" },
  { id: "dcf",         label: "DCF" },
  { id: "moat",        label: "MOAT" },
  { id: "management",  label: "Management" },
  { id: "analysis",    label: "Analyse" },
  { id: "guidance",    label: "Guidance" },
  { id: "positions",   label: "Positions" },
];

// ── StockCard ────────────────────────────────────────────────────────────────

export default function StockCard({ stock, thresholds, onRemove, onUpdate, onRefresh }) {
  const lsKey = `sc_expanded_${stock.symbol}`;
  const [expanded, setExpanded] = useState(() => {
    const saved = localStorage.getItem(lsKey);
    return saved === null ? true : saved === "1";
  });
  const toggleExpanded = () => setExpanded(v => {
    const next = !v;
    localStorage.setItem(lsKey, next ? "1" : "0");
    return next;
  });
  const [activeTab, setActiveTab] = useState("synthese");
  const [period, setPeriod] = useState(5);
  const s = stock;
  const raw = s.raw || {};

  const healthScore = thresholds ? computeScore(computeMetricsForPeriod(s, 5), thresholds) : 0;
  const healthColor = healthScore >= 70 ? "green" : healthScore >= 40 ? "orange" : "red";

  // Key check details — use processData arrays (s.inc/s.cf/s.bal) which are always
  // refreshed, rather than s.raw which can lag behind after partial state updates.
  const latestInc = (s.inc || [])[0] || {};
  const latestBal = (s.bal || [])[0] || {};
  const latestCF  = (s.cf  || [])[0] || {};

  const ni   = latestInc.netIncome;
  const nd   = latestBal.netDebt;
  const fcf  = latestCF.freeCashFlow;
  const divs = latestCF.dividendsPaid != null ? Math.abs(latestCF.dividendsPaid) : null;

  const detail1 = ni && nd != null
    ? `Résultat net : ${money(ni)} · Dette nette : ${money(nd)} → ratio ${num(nd / ni, 1)}x (seuil < 5x)`
    : null;
  const detail2 = fcf != null && ni
    ? `FCF : ${money(fcf)} · Résultat net : ${money(ni)} → FCF/RN : ${pct(fcf / ni)} (seuil ≥ 70%)`
    : null;
  const detail3 = divs && ni
    ? `Dividendes versés : ${money(divs)} · Résultat net : ${money(ni)}`
    : null;

  return (
    <div className="stock-card fade-in">
      {/* ── Header ── */}
      <div className="sc-header" onClick={toggleExpanded}>
        <div className="sc-header-left">
          <div className="sc-symbol">{s.symbol}</div>
          <div className="sc-name-wrap">
            <span className="sc-name">{s.name}</span>
            <span className="sc-sector">{s.sector}{s.industry ? ` · ${s.industry}` : ""}</span>
          </div>
        </div>
        <div className="sc-header-right">
          <div className="sc-price">
            <span className="price-val">{s.currency === "EUR" ? "€" : "$"}{num(s.price)}</span>
            <span className="price-label">prix actuel</span>
          </div>
          {s.assumptions?.base?.fairValue && (() => {
            const mos = s.assumptions.base.marginOfSafety;
            const fairColor = mos > 0.15 ? "green" : mos > 0 ? "orange" : "red";
            return (
              <div className="sc-price">
                <span className={`fair-val ${fairColor}`}>{s.currency === "EUR" ? "€" : "$"}{num(s.assumptions.base.fairValue)}</span>
                <span className="price-label">fair value</span>
              </div>
            );
          })()}
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
          <button
            className="btn-refresh"
            title="Actualiser (clic droit = forcer le re-téléchargement des données historiques)"
            onClick={(e) => { e.stopPropagation(); onRefresh(s.symbol); }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onRefresh(s.symbol, { force: true }); }}
            disabled={s.refreshing}
          >
            {s.refreshing ? "…" : "↻"}
          </button>
          <button className="btn-remove" onClick={(e) => { e.stopPropagation(); onRemove(s.symbol); }}>✕</button>
          <span className="chevron">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div className="sc-body">
          {/* ── Tabs ── */}
          <div className="sc-tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`tab-btn ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Synthèse ── */}
          {activeTab === "synthese" && thresholds && (
            <SyntheseSection stock={s} thresholds={thresholds} />
          )}

          {/* ── Finances ── */}
          {activeTab === "financials" && (
            <div className="tab-content">
              <div className="period-selector">
                <span className="period-selector-label">Période</span>
                {[3, 5, 10, 15, "max"].map(p => (
                  <button key={p} className={`period-btn ${period === p ? "active" : ""}`} onClick={() => setPeriod(p)}>
                    {p === "max" ? "Max" : `${p} ans`}
                  </button>
                ))}
              </div>
              <FinancialTable
                income={s.inc || []}
                balance={s.bal || []}
                cashflow={s.cf || []}
                metrics={s.met || []}
                ratios={s.rat || []}
                period={period}
                ttm={s.ttm || {}}
              />

              <div className="bottom-grid">
                {/* Questions clés */}
                <div className="bottom-col">
                  <p className="section-label" style={{ marginBottom: 16 }}>Questions clés</p>
                  <KeyCheck
                    label="Profits supérieurs à la dette nette"
                    passed={s.profitsVsDebt}
                    detail={detail1}
                  />
                  <KeyCheck
                    label="Le cash suit les bénéfices (FCF/RN ≥ 70%)"
                    passed={s.cashFollowsEarnings}
                    detail={detail2}
                  />
                  <KeyCheck
                    label="Dividende couvert par le résultat net"
                    passed={s.dividendCoveredByEarnings}
                    detail={detail3}
                  />
                </div>

                {/* Dividendes + score */}
                <div className="bottom-col">
                  <p className="section-label" style={{ marginBottom: 16 }}>Dividendes</p>
                  <div className="simple-rows">
                    <div className="simple-row">
                      <span className="sr-label">Rendement actuel</span>
                      <span className={`sr-value ${colorFromThresholds(s.dividendYield, 0.02, 0.01)}`}>{pct(s.dividendYield)}</span>
                    </div>
                    <div className="simple-row">
                      <span className="sr-label">Dividende annuel / action</span>
                      <span className="sr-value dim">{s.currency === "EUR" ? "€" : "$"}{num(s.dividendPerShare)}</span>
                    </div>
                    <div className="simple-row">
                      <span className="sr-label">Croissance dividende (CAGR 10a)</span>
                      <span className={`sr-value ${colorFromThresholds(s.divGrowth, 0.05, 0.02)}`}>{pct(s.divGrowth)}</span>
                    </div>
                  </div>

                  <p className="section-label" style={{ marginTop: 24, marginBottom: 12 }}>Score santé</p>
                  <div className={`health-bar-wrap ${healthColor}`}>
                    <div className="health-bar-fill" style={{ width: `${healthScore}%` }} />
                  </div>
                  <span className={`health-pct ${healthColor}`}>{healthScore}/100</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Valorisation ── */}
          {activeTab === "valuation" && (
            <ValuationSection stock={s} thresholds={thresholds} />
          )}

          {activeTab === "dcf"        && <DCFSection             stock={stock} thresholds={thresholds} onUpdate={onUpdate} />}
          {activeTab === "moat"       && <MoatSection            stock={stock} onUpdate={onUpdate} />}
          {activeTab === "management" && <ManagementSection       stock={stock} onUpdate={onUpdate} />}
          {activeTab === "analysis"   && <BusinessAnalysisSection stock={stock} onUpdate={onUpdate} />}
          {activeTab === "guidance"   && <GuidanceSection         stock={stock} onUpdate={onUpdate} />}
          {activeTab === "positions"  && <PositionsSection        stock={stock} onUpdate={onUpdate} />}
        </div>
      )}
    </div>
  );
}
