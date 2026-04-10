import { useState } from "react";
import "./MoatSection.css";

const MOAT_TYPES = [
  { id: "intangibles", label: "Actifs Intangibles", desc: "Marque avec pricing power ou brevets/licences créant un monopole légal ou mental.", questions: ["L'entreprise peut-elle augmenter ses prix sans perdre de clients ?", "Détient-elle des brevets, licences ou droits exclusifs significatifs ?", "La marque crée-t-elle une préférence irrationnelle chez le consommateur ?"] },
  { id: "switching",   label: "Coûts de Changement", desc: "Les clients sont piégés car le coût de changer de fournisseur est trop élevé.", questions: ["Changer de fournisseur implique-t-il des migrations coûteuses ou risquées ?", "Les clients sont-ils intégrés dans l'écosystème produit ?", "Le taux de rétention clients est-il supérieur à 90% ?"] },
  { id: "network",     label: "Effet de Réseau", desc: "Chaque nouvel utilisateur augmente la valeur du service pour tous les autres.", questions: ["Le service devient-il plus utile à mesure que le nombre d'utilisateurs croît ?", "Y a-t-il des effets de réseau bifaces (marketplace, paiement) ?", "Les concurrents peinent-ils à atteindre la masse critique ?"] },
  { id: "cost",        label: "Avantage de Coût", desc: "Production à un coût inatteignable pour les concurrents grâce aux économies d'échelle.", questions: ["L'entreprise a-t-elle des économies d'échelle significatives ?", "Bénéficie-t-elle d'un accès privilégié aux ressources ou à la distribution ?", "Peut-elle asphyxier un concurrent en baissant ses prix ?"] },
  { id: "scale",       label: "Échelle Efficiente", desc: "Marché suffisamment petit pour ne supporter qu'un seul acteur rentable.", questions: ["Le marché adressable est-il limité à une taille qui décourage les entrants ?", "L'entreprise opère-t-elle des infrastructures à haute barrière ?", "Un concurrent devrait-il investir des milliards pour un retour trop faible ?"] },
];

const SCORES = [
  { value: 0, label: "Absent",  color: "red"    },
  { value: 1, label: "Faible",  color: "orange" },
  { value: 2, label: "Modéré",  color: "orange" },
  { value: 3, label: "Fort",    color: "green"  },
];

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
  };
}

export default function MoatSection({ stock, onUpdate }) {
  const initial = stock.moat || Object.fromEntries(MOAT_TYPES.map((t) => [t.id, { score: null, notes: "" }]));
  const [moat, setMoat]           = useState(initial);
  const [aiResult, setAiResult]   = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError]     = useState(null);

  const totalScore = Object.values(moat).reduce((sum, m) => sum + (m.score || 0), 0);
  const maxScore   = MOAT_TYPES.length * 3;
  const moatPct    = Math.round((totalScore / maxScore) * 100);
  const moatLevel  = moatPct >= 70
    ? { label: "MOAT FORT",   color: "green"  }
    : moatPct >= 40
    ? { label: "MOAT MODÉRÉ", color: "orange" }
    : { label: "MOAT FAIBLE", color: "red"    };

  const updateMoat = (id, field, value) => {
    const updated = { ...moat, [id]: { ...moat[id], [field]: value } };
    setMoat(updated);
    onUpdate(stock.symbol, { moat: updated });
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    setAiError(null);
    try {
      const res = await fetch(`http://localhost:5000/api/analyze/${stock.symbol}/moat`, {
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
      setAiResult(data);
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const aiCat = (id) => aiResult?.categories?.[id];

  return (
    <div className="moat-section">
      <div className="moat-score-header">
        <div>
          <p className="section-label">Score MOAT global</p>
          <div className={`moat-level ${moatLevel.color}`}>{moatLevel.label}</div>
        </div>
        <div className="moat-score-circle">
          <span className={`moat-score-num ${moatLevel.color}`}>{moatPct}</span>
          <span className="moat-score-denom">/100</span>
        </div>
      </div>
      <div className="moat-bar-wrap">
        <div className={`moat-bar-fill ${moatLevel.color}`} style={{ width: `${moatPct}%` }} />
      </div>

      {/* ── AI Analysis button + panel ─────────────────────────────────────── */}
      <div className="ai-analyze-wrap">
        <button className="ai-analyze-btn" onClick={runAnalysis} disabled={analyzing}>
          {analyzing ? "Analyse en cours…" : aiResult ? "Relancer l'analyse IA" : "Analyser avec l'IA"}
        </button>
        {analyzing && <span className="ai-spinner" />}
      </div>

      {aiError && (
        <div className="ai-error">Erreur : {aiError}</div>
      )}

      {aiResult && (
        <div className="ai-result-panel">
          <div className="ai-result-header">
            <span className="ai-result-title">Analyse IA — {stock.name}</span>
            <span className="ai-result-badge">Claude Sonnet</span>
          </div>
          <p className="ai-result-summary">{aiResult.summary}</p>
          {aiResult.searchSources?.length > 0 && (
            <div className="ai-sources">
              <span className="ai-sources-label">Sources consultées :</span>
              {aiResult.searchSources.slice(0, 4).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer" className="ai-source-link">
                  {s.title}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Moat type cards ────────────────────────────────────────────────── */}
      <div className="moat-types">
        {MOAT_TYPES.map((type) => {
          const m      = moat[type.id];
          const scored = SCORES.find((s) => s.value === m.score);
          const ai     = aiCat(type.id);
          const aiScore = ai ? SCORES.find(s => s.value === ai.score) : null;
          return (
            <div key={type.id} className="moat-type-card">
              <div className="mtc-header">
                <div className="mtc-title">
                  <span className="mtc-label">{type.label}</span>
                  <span className="mtc-desc">{type.desc}</span>
                </div>
                {scored && <span className={`badge ${scored.color}`}>{scored.label}</span>}
              </div>

              {ai && (
                <div className="ai-suggestion">
                  <span className="ai-suggestion-label">IA suggère :</span>
                  <span className={`ai-suggestion-score ${aiScore?.color || "dim"}`}>
                    {ai.score}/3 — {aiScore?.label}
                  </span>
                  <p className="ai-suggestion-text">{ai.analysis}</p>
                </div>
              )}

              <div className="mtc-questions">
                {type.questions.map((q, i) => <p key={i} className="mtc-question">— {q}</p>)}
              </div>
              <div className="mtc-score-row">
                <span className="input-label">Ton évaluation</span>
                <div className="score-btns">
                  {SCORES.map((s) => (
                    <button key={s.value} className={`score-btn ${s.color} ${m.score === s.value ? "active" : ""}`} onClick={() => updateMoat(type.id, "score", s.value)}>
                      {s.value} — {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea className="moat-notes" placeholder="Tes observations..." value={m.notes} onChange={(e) => updateMoat(type.id, "notes", e.target.value)} rows={2} />
            </div>
          );
        })}
      </div>
      <div className="moat-rule">
        <p><strong>Règle d'or :</strong> Ne jamais faire de compromis sur le MOAT. Une entreprise exceptionnelle avec de vraies douves, achetée à un prix correct, te rendra libre.</p>
      </div>
    </div>
  );
}
