import { useState } from "react";
import { num, pct, money } from "../utils";
import "./GuidanceSection.css";

// ── Formatting helpers ────────────────────────────────────────────────────────

const fmtBn = (v) => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
};

// Returns { label, cls } — handles negative endpoints gracefully
const cagrOf = (arr) => {
  const valid = arr.filter(v => v != null);
  if (valid.length < 2) return { label: "—", cls: "dim" };
  const first = valid[0];
  const last  = valid[valid.length - 1];
  const n     = valid.length;
  if (first > 0 && last > 0) {
    const v = Math.pow(last / first, 1 / (n - 1)) - 1;
    if (!isFinite(v) || isNaN(v)) return { label: "—", cls: "dim" };
    return { label: pct(v), cls: v >= 0.08 ? "green" : v >= 0.04 ? "orange" : "red" };
  }
  if (first <= 0 && last > 0) return { label: "↑ Redressement", cls: "green" };
  if (first > 0  && last <= 0) return { label: "↓ Détérioration", cls: "red" };
  return { label: last > first ? "↑ S'améliore" : "↓ Se dégrade", cls: last > first ? "orange" : "red" };
};

// ── Text renderer (same pattern as BusinessAnalysisSection) ──────────────────

function renderBold(line) {
  const parts = line.split(/\*\*(.+?)\*\*/);
  if (parts.length === 1) return line;
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part);
}

function FormattedContent({ text }) {
  if (!text) return null;
  return (
    <div className="gui-formatted">
      {text.split("\n\n").map((block, bi) => (
        <div key={bi} className="gui-block">
          {block.split("\n").map((line, li) => {
            if (!line.trim()) return null;
            const isHeader = /^[A-ZÀ-Ü\s]+\s*:$/.test(line.trim());
            const isBullet = line.trim().startsWith("•") || line.trim().startsWith("-");
            if (isHeader) return <p key={li} className="gui-block-header">{renderBold(line.trim())}</p>;
            if (isBullet) return <p key={li} className="gui-bullet">{renderBold(line.trim())}</p>;
            return <p key={li} className="gui-prose">{renderBold(line.trim())}</p>;
          })}
        </div>
      ))}
    </div>
  );
}

// ── Section icons ─────────────────────────────────────────────────────────────

const ICONS = { ttm: "📊", historique: "📈", guidance: "🗣️", verdict: "⚖️" };

// ── GuidanceSection ───────────────────────────────────────────────────────────

export default function GuidanceSection({ stock, onUpdate }) {
  const saved = stock.guidanceAnalysis || null;
  const [aiResult, setAiResult]   = useState(saved);
  const [expanded, setExpanded]   = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError]     = useState(null);

  const s = stock;

  // ── Historical data (5 most recent full years, oldest→newest) ───────────────
  const incRows = (s.inc || []).slice(0, 5).reverse();
  const cfMap   = {};
  (s.cf || []).forEach(r => { cfMap[r.date?.slice(0, 4)] = r; });

  const histRows = incRows.map(r => {
    const yr = r.date?.slice(0, 4);
    const cf = cfMap[yr] || {};
    return { year: yr, revenue: r.revenue, netIncome: r.netIncome, fcf: cf.freeCashFlow };
  }).filter(r => r.year);

  const rrRev = cagrOf(histRows.map(r => r.revenue));
  const rrNI  = cagrOf(histRows.map(r => r.netIncome));
  const rrFCF = cagrOf(histRows.map(r => r.fcf));

  // ── Analyst estimates ────────────────────────────────────────────────────────
  const estimates = (s.est || []).slice(0, 3);

  // ── TTM: use s.ttm (always available from main stock fetch) ─────────────────
  const ttmData = s.ttm && Object.keys(s.ttm).length > 0 ? s.ttm : null;

  // ── "Année dernière" = previous calendar year (currentYear - 1) ─────────────
  const prevYear = String(new Date().getFullYear() - 1);
  const lastYearRow = histRows.find(r => r.year === prevYear) || histRows[histRows.length - 1] || {};

  const fmtDate = (iso) => new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });

  const toggleSection = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const runAnalysis = async () => {
    if (aiResult?.generatedAt) {
      if (!window.confirm(`Relancer l'analyse IA ?\nLa précédente (${fmtDate(aiResult.generatedAt)}) sera remplacée.`)) return;
    }
    setAnalyzing(true);
    setAiError(null);

    const histRevenue = histRows.map(r => ({ year: r.year, value: r.revenue })).filter(r => r.value != null);
    const histNI      = histRows.map(r => ({ year: r.year, value: r.netIncome })).filter(r => r.value != null);
    const histFCF     = histRows.map(r => ({ year: r.year, value: r.fcf })).filter(r => r.value != null);

    try {
      const res = await fetch(`http://localhost:5000/api/analyze/${stock.symbol}/guidance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName:      stock.name,
          sector:           stock.sector,
          industry:         stock.industry,
          dcfParams:        stock.dcfParams || {},
          historicalRevenue: histRevenue,
          historicalNI:     histNI,
          historicalFCF:    histFCF,
          analystEstimates: estimates,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur serveur");
      }
      const data = await res.json();
      const result = { ...data, generatedAt: new Date().toISOString() };
      setAiResult(result);
      setExpanded(Object.fromEntries((data.sections || []).map(sec => [sec.id, true])));
      onUpdate(stock.symbol, { guidanceAnalysis: result });
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const applyDcf = () => {
    if (!aiResult?.dcfSuggestions) return;
    const { growthRate, multiple, shareChange } = aiResult.dcfSuggestions;
    onUpdate(stock.symbol, {
      dcfParams: { ...(stock.dcfParams || {}), growthRate, multiple, shareChange },
    });
  };

  const conf = aiResult?.dcfSuggestions?.confidence;
  const confLabel = { high: "Confiance élevée", medium: "Confiance moyenne", low: "Confiance faible" }[conf] || conf;

  return (
    <div className="gui-section">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="gui-header">
        <div className="gui-header-left">
          <p className="gui-title">Guidance & révision DCF trimestrielle</p>
          <p className="gui-subtitle">
            TTM · Historique 5 ans · Guidance management · Consensus analystes
          </p>
        </div>
        <div className="gui-header-right">
          <button className="ai-analyze-btn" onClick={runAnalysis} disabled={analyzing}>
            {analyzing ? "Analyse en cours…" : aiResult ? "Relancer l'analyse IA" : "Analyser la guidance IA"}
          </button>
          {analyzing && <span className="ai-spinner" />}
        </div>
      </div>

      {/* ── Always-visible tables ────────────────────────────────────────────── */}
      <div className="gui-tables">

        {/* Historical 5-year table */}
        {histRows.length > 0 && (
          <div className="gui-table-card">
            <p className="gui-table-title">Historique 5 ans</p>
            <table className="gui-table">
              <thead>
                <tr>
                  <th>Métrique</th>
                  {histRows.map(r => <th key={r.year}>{r.year}</th>)}
                  <th>CAGR</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Revenu</td>
                  {histRows.map(r => <td key={r.year}>{fmtBn(r.revenue)}</td>)}
                  <td className={`cagr ${rrRev.cls}`}>{rrRev.label}</td>
                </tr>
                <tr>
                  <td>Bénéfice net</td>
                  {histRows.map(r => <td key={r.year}>{fmtBn(r.netIncome)}</td>)}
                  <td className={`cagr ${rrNI.cls}`}>{rrNI.label}</td>
                </tr>
                <tr>
                  <td>Free Cash Flow</td>
                  {histRows.map(r => <td key={r.year}>{fmtBn(r.fcf)}</td>)}
                  <td className={`cagr ${rrFCF.cls}`}>{rrFCF.label}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* TTM table — always visible once stock data is loaded */}
        {ttmData && (
          <div className="gui-table-card">
            <p className="gui-table-title">TTM vs {prevYear}</p>
            <table className="gui-table">
              <thead>
                <tr>
                  <th>Métrique</th>
                  <th>{prevYear}</th>
                  <th>TTM</th>
                  <th>Variation</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Revenu",         key: "revenue",   last: lastYearRow.revenue   },
                  { label: "Bénéfice net",   key: "netIncome", last: lastYearRow.netIncome },
                  { label: "Free Cash Flow", key: "fcf",       last: lastYearRow.fcf       },
                ].map(row => {
                  const ttmVal = ttmData[row.key];
                  const pctChg = ttmVal != null && row.last != null && row.last !== 0
                    ? (ttmVal / row.last - 1) : null;
                  return (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td>{fmtBn(row.last)}</td>
                      <td>{fmtBn(ttmVal)}</td>
                      <td className={pctChg == null ? "dim" : pctChg >= 0.04 ? "green" : pctChg >= 0 ? "orange" : "red"}>
                        {pctChg != null ? `${pctChg >= 0 ? "+" : ""}${pct(pctChg)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Analyst estimates */}
        {estimates.length > 0 && (
          <div className="gui-table-card">
            <p className="gui-table-title">Estimations analystes</p>
            <table className="gui-table">
              <thead>
                <tr>
                  <th>Année</th>
                  <th>EPS moyen</th>
                  <th>EPS haut</th>
                  <th>EPS bas</th>
                  <th>CA moyen</th>
                  <th>Analystes</th>
                </tr>
              </thead>
              <tbody>
                {estimates.map((e, i) => (
                  <tr key={i}>
                    <td>{e.date?.slice(0, 4)}</td>
                    <td>{e.estimatedEpsAvg != null ? `$${num(e.estimatedEpsAvg, 2)}` : "—"}</td>
                    <td className="dim">{e.estimatedEpsHigh != null ? `$${num(e.estimatedEpsHigh, 2)}` : "—"}</td>
                    <td className="dim">{e.estimatedEpsLow  != null ? `$${num(e.estimatedEpsLow,  2)}` : "—"}</td>
                    <td>{fmtBn(e.estimatedRevenueAvg)}</td>
                    <td className="dim">{e.numberAnalysts ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── AI meta / empty state ────────────────────────────────────────────── */}
      {aiResult?.generatedAt && !analyzing && (
        <div className="gui-meta">
          <span className="ai-result-badge">Claude Sonnet</span>
          <span className="gui-analyzed-date">Générée le {fmtDate(aiResult.generatedAt)}</span>
          {aiResult.searchSources?.length > 0 && (
            <div className="gui-sources">
              <span className="gui-sources-label">Sources :</span>
              {aiResult.searchSources.slice(0, 5).map((src, i) => (
                <a key={i} href={src.url} target="_blank" rel="noreferrer" className="gui-source-link">
                  {src.title}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {aiError && <div className="ai-error">Erreur : {aiError}</div>}

      {!aiResult && !analyzing && (
        <div className="gui-empty">
          <p>Clique sur <strong>Analyser la guidance IA</strong> pour obtenir :</p>
          <ul className="gui-empty-list">
            <li>📊 TTM — Revenu, Bénéfice net, FCF vs dernière année complète</li>
            <li>📈 Tendance 5 ans — CAGR et qualité de la croissance</li>
            <li>🗣️ Guidance management et consensus analystes</li>
            <li>⚖️ Verdict — Tes hypothèses DCF doivent-elles changer ?</li>
          </ul>
        </div>
      )}

      {/* ── DCF suggestions box ──────────────────────────────────────────────── */}
      {aiResult?.dcfSuggestions && (
        <div className="gui-dcf-box">
          <div className="gui-dcf-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <p className="gui-dcf-title">Paramètres DCF suggérés</p>
              {conf && (
                <span className={`gui-badge gui-badge-${conf}`}>{confLabel}</span>
              )}
            </div>
            <button className="gui-apply-btn" onClick={applyDcf}>
              Appliquer au DCF
            </button>
          </div>
          <div className="gui-dcf-params">
            <div className="gui-dcf-param">
              <span className="gui-dcf-param-label">Taux de croissance FCF</span>
              <span className="gui-dcf-param-value">
                {aiResult.dcfSuggestions.growthRate != null
                  ? pct(aiResult.dcfSuggestions.growthRate) : "—"}
              </span>
            </div>
            <div className="gui-dcf-param">
              <span className="gui-dcf-param-label">Multiple de sortie</span>
              <span className="gui-dcf-param-value">
                {aiResult.dcfSuggestions.multiple != null
                  ? `${num(aiResult.dcfSuggestions.multiple, 0)}x` : "—"}
              </span>
            </div>
            <div className="gui-dcf-param">
              <span className="gui-dcf-param-label">Variation actions / an</span>
              <span className="gui-dcf-param-value">
                {aiResult.dcfSuggestions.shareChange != null
                  ? pct(aiResult.dcfSuggestions.shareChange) : "—"}
              </span>
            </div>
          </div>
          {aiResult.dcfSuggestions.reasoning && (
            <p className="gui-dcf-reasoning">{aiResult.dcfSuggestions.reasoning}</p>
          )}
        </div>
      )}

      {/* ── Expandable AI sections ───────────────────────────────────────────── */}
      {aiResult?.sections && (
        <div className="gui-sections">
          {aiResult.sections.map((section) => {
            const isOpen = expanded[section.id] !== false;
            return (
              <div key={section.id} className="gui-card">
                <button className="gui-card-header" onClick={() => toggleSection(section.id)}>
                  <span className="gui-card-icon">{ICONS[section.id] || "📄"}</span>
                  <span className="gui-card-title">{section.title}</span>
                  <span className="gui-card-chevron">{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <div className="gui-card-body">
                    <FormattedContent text={section.content} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
