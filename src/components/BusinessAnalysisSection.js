import { useState } from "react";
import "./BusinessAnalysisSection.css";

const SECTION_ICONS = {
  overview:    "🏢",
  model:       "💰",
  products:    "📦",
  competition: "⚔️",
  risks:       "⚠️",
  weaknesses:  "🔍",
  verdict:     "⚖️",
};

function buildFinancialSummary(stock) {
  const metrics = (stock.raw?.metrics || []).filter(m => m.roic != null || m.roe != null);
  const income  = stock.raw?.income  || [];
  const balance = stock.raw?.balance || [];

  const avg = (arr, key) => {
    const vals = arr.map(r => r[key]).filter(v => v != null && isFinite(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const revs = income.map(r => r.revenue).filter(v => v != null && v > 0);
  const revenueCagr = revs.length >= 2
    ? Math.pow(revs[0] / revs[revs.length - 1], 1 / (revs.length - 1)) - 1
    : null;

  const ebitdas = income.map(r => r.ebitda).filter(v => v != null && v > 0);
  const debts   = balance.map(r => r.netDebt).filter(v => v != null);
  const debtToEbitdaAvg = ebitdas.length && debts.length
    ? debts.slice(0, Math.min(debts.length, ebitdas.length))
        .map((d, i) => ebitdas[i] ? d / ebitdas[i] : null)
        .filter(v => v != null && isFinite(v))
        .reduce((a, b, _, arr) => a + b / arr.length, 0)
    : null;

  return {
    roicAvg:         avg(metrics, "roic"),
    roeAvg:          avg(metrics, "roe"),
    netMarginAvg:    avg(income.map(r => ({
      nm: r.netIncome && r.revenue ? r.netIncome / r.revenue : null
    })), "nm"),
    revenueCagr,
    debtToEbitdaAvg,
    marketCap:       stock.marketCap,
    price:           stock.price,
  };
}

export default function BusinessAnalysisSection({ stock, onUpdate }) {
  const saved          = stock.businessAnalysis || null;
  const [aiResult, setAiResult]   = useState(saved);
  const [notes, setNotes]         = useState(saved?.notes || {});
  const [expanded, setExpanded]   = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError]     = useState(null);

  const fmtDate = (iso) => new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric",
  });

  const toggleSection = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const updateNote = (id, value) => {
    const updated = { ...notes, [id]: value };
    setNotes(updated);
    onUpdate(stock.symbol, {
      businessAnalysis: { ...aiResult, notes: updated },
    });
  };

  const runAnalysis = async () => {
    if (aiResult?.generatedAt) {
      if (!window.confirm(`Relancer l'analyse IA ?\nLa précédente (${fmtDate(aiResult.generatedAt)}) sera remplacée.`)) return;
    }
    setAnalyzing(true);
    setAiError(null);
    try {
      const res = await fetch(`http://localhost:5000/api/analyze/${stock.symbol}/business`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName:      stock.name,
          sector:           stock.sector,
          industry:         stock.industry,
          financialSummary: buildFinancialSummary(stock),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur serveur");
      }
      const data = await res.json();
      const saved = { ...data, generatedAt: new Date().toISOString(), notes };
      setAiResult(saved);
      // Expand all sections after generation
      const allExpanded = Object.fromEntries((data.sections || []).map(s => [s.id, true]));
      setExpanded(allExpanded);
      onUpdate(stock.symbol, { businessAnalysis: saved });
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="ba-section">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="ba-header">
        <div className="ba-header-left">
          <p className="section-label">Analyse business approfondie</p>
          <p className="ba-subtitle">
            Modèle économique · Produits · Concurrents · Risques · Verdict investisseur
          </p>
        </div>
        <div className="ba-header-right">
          <button className="ai-analyze-btn" onClick={runAnalysis} disabled={analyzing}>
            {analyzing ? "Analyse en cours…" : aiResult ? "Relancer l'analyse IA" : "Générer l'analyse IA"}
          </button>
          {analyzing && <span className="ai-spinner" />}
        </div>
      </div>

      {aiResult?.generatedAt && !analyzing && (
        <div className="ba-meta">
          <span className="ai-result-badge">Claude Sonnet</span>
          <span className="ai-analyzed-date">Générée le {fmtDate(aiResult.generatedAt)}</span>
          {aiResult.searchSources?.length > 0 && (
            <div className="ai-sources">
              <span className="ai-sources-label">Sources :</span>
              {aiResult.searchSources.slice(0, 5).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer" className="ai-source-link">
                  {s.title}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {aiError && <div className="ai-error">Erreur : {aiError}</div>}

      {/* ── Sections ─────────────────────────────────────────────────────────── */}
      {!aiResult && !analyzing && (
        <div className="ba-empty">
          <p>Clique sur <strong>Générer l'analyse IA</strong> pour obtenir une analyse complète de {stock.name} :</p>
          <ul className="ba-empty-list">
            <li>🏢 Vue d'ensemble et histoire récente</li>
            <li>💰 Modèle économique et segments de revenus</li>
            <li>📦 Produits & services clés</li>
            <li>⚔️ Position concurrentielle et peers</li>
            <li>⚠️ Risques principaux identifiés</li>
            <li>🔍 Points faibles et signaux d'alerte</li>
            <li>⚖️ Verdict investisseur — bull / bear / à surveiller</li>
          </ul>
        </div>
      )}

      {aiResult?.sections && (
        <div className="ba-sections">
          {aiResult.sections.map((section) => {
            const isOpen = expanded[section.id] !== false; // default open
            return (
              <div key={section.id} className="ba-card">
                <button
                  className="ba-card-header"
                  onClick={() => toggleSection(section.id)}
                >
                  <span className="ba-card-icon">{SECTION_ICONS[section.id] || "📄"}</span>
                  <span className="ba-card-title">{section.title}</span>
                  <span className="ba-card-chevron">{isOpen ? "▲" : "▼"}</span>
                </button>

                {isOpen && (
                  <div className="ba-card-body">
                    <p className="ba-card-content">{section.content}</p>
                    <div className="ba-notes-wrap">
                      <label className="ba-notes-label">Tes notes personnelles</label>
                      <textarea
                        className="ba-notes"
                        placeholder="Ajoute tes observations, questions, points à approfondir…"
                        value={notes[section.id] || ""}
                        onChange={(e) => updateNote(section.id, e.target.value)}
                        rows={2}
                      />
                    </div>
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
