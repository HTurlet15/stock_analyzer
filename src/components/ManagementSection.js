import { useState } from "react";
import "./ManagementSection.css";

const CRITERIA = [
  { id: "coherence",    label: "Cohérence discours / actes",         desc: "Les chiffres ne mentent pas. Le PDG tient-il ses promesses ?", questions: ["Les objectifs annoncés sont-ils atteints d'une année sur l'autre ?", "Les rachats d'actions sont-ils faits quand le cours est raisonnable ?", "La direction respecte-t-elle ses engagements de capital allocation ?"] },
  { id: "discipline",   label: "Discipline financière",              desc: "Dette maîtrisée, pas d'acquisitions vaniteuses juste pour grossir.", questions: ["La dette est-elle maîtrisée et en décroissance ?", "Les acquisitions créent-elles de la valeur (pas juste du volume) ?", "Le management évite-t-il de diluer les actionnaires inutilement ?"] },
  { id: "vision",       label: "Vision long terme",                  desc: "Les meilleurs dirigeants pensent en décennies.", questions: ["Le management investit-il dans la R&D et l'innovation durablement ?", "Est-il prêt à sacrifier les profits court terme pour construire à long terme ?", "La lettre aux actionnaires parle-t-elle des défis futurs ?"] },
  { id: "alignment",    label: "Alignement avec les actionnaires",   desc: "Rémunération basée sur EPS, FCF — pas sur le cours à court terme.", questions: ["Le management détient-il des actions significatives ?", "La rémunération est-elle indexée sur la performance réelle ?", "Les rachats bénéficient-ils aux actionnaires (pas aux options du management) ?"] },
  { id: "transparency", label: "Transparence",                       desc: "Un bon dirigeant parle des échecs autant que des succès.", questions: ["La lettre annuelle reconnaît-elle les erreurs franchement ?", "Les métriques clés sont-elles présentées de façon cohérente ?", "Le management évite-t-il les ajustements pro-forma qui masquent les problèmes ?"] },
  { id: "buybacks",     label: "Rachats d'actions intelligents",     desc: "Apple rachète quand le cours est raisonnable. GE rachetait à prix d'or avant le krach.", questions: ["Les rachats sont-ils effectués quand le titre est sous sa valeur intrinsèque ?", "Le programme de rachat est-il cohérent avec le niveau de dette ?", "Le nombre d'actions diminue-t-il réellement sur 5 ans ?"] },
];

const SCORES = [
  { value: 0, label: "Red flag",  color: "red"    },
  { value: 1, label: "Passable",  color: "orange" },
  { value: 2, label: "Bon",       color: "orange" },
  { value: 3, label: "Excellent", color: "green"  },
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

export default function ManagementSection({ stock, onUpdate }) {
  const initial = stock.management || Object.fromEntries(CRITERIA.map((c) => [c.id, { score: null, notes: "" }]));
  const [mgmt, setMgmt]           = useState(initial);
  const [aiResult, setAiResult]   = useState(stock.aiResultMgmt || null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError]     = useState(null);

  const totalScore = Object.values(mgmt).reduce((sum, m) => sum + (m.score || 0), 0);
  const maxScore   = CRITERIA.length * 3;
  const mgmtPct    = Math.round((totalScore / maxScore) * 100);
  const mgmtLevel  = mgmtPct >= 70
    ? { label: "Management A", color: "green"  }
    : mgmtPct >= 45
    ? { label: "Management B", color: "orange" }
    : { label: "Management C", color: "red"    };

  const updateMgmt = (id, field, value) => {
    const updated = { ...mgmt, [id]: { ...mgmt[id], [field]: value } };
    setMgmt(updated);
    onUpdate(stock.symbol, { management: updated });
  };

  const fmtDate = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const runAnalysis = async () => {
    if (aiResult?.analyzedAt) {
      if (!window.confirm(`Relancer l'analyse IA ?\nLa précédente (${fmtDate(aiResult.analyzedAt)}) sera remplacée.`)) return;
    }
    setAnalyzing(true);
    setAiError(null);
    try {
      const res = await fetch(`http://localhost:5000/api/analyze/${stock.symbol}/management`, {
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
      const saved = { ...data, analyzedAt: new Date().toISOString() };
      setAiResult(saved);
      onUpdate(stock.symbol, { aiResultMgmt: saved });
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const aiCrit = (id) => aiResult?.criteria?.[id];

  return (
    <div className="mgmt-section">
      <div className="mgmt-score-header">
        <div>
          <p className="section-label">Score Management global</p>
          <div className={`mgmt-level ${mgmtLevel.color}`}>{mgmtLevel.label}</div>
        </div>
        <div className="mgmt-score-circle">
          <span className={`mgmt-score-num ${mgmtLevel.color}`}>{mgmtPct}</span>
          <span className="mgmt-score-denom">/100</span>
        </div>
      </div>
      <div className="mgmt-bar-wrap">
        <div className={`mgmt-bar-fill ${mgmtLevel.color}`} style={{ width: `${mgmtPct}%` }} />
      </div>

      {/* ── AI Analysis button + panel ─────────────────────────────────────── */}
      <div className="ai-analyze-wrap">
        <button className="ai-analyze-btn" onClick={runAnalysis} disabled={analyzing}>
          {analyzing ? "Analyse en cours…" : aiResult ? "Relancer l'analyse IA" : "Analyser avec l'IA"}
        </button>
        {analyzing && <span className="ai-spinner" />}
        {aiResult?.analyzedAt && !analyzing && (
          <span className="ai-analyzed-date">Dernière analyse : {fmtDate(aiResult.analyzedAt)}</span>
        )}
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

      <div className="mgmt-note">
        <p>Pour évaluer le management, lis la <strong>lettre annuelle aux actionnaires</strong> et les comptes-rendus des conférences call trimestrielles.</p>
      </div>

      {/* ── Criteria cards ─────────────────────────────────────────────────── */}
      <div className="mgmt-criteria">
        {CRITERIA.map((c) => {
          const m      = mgmt[c.id];
          const scored = SCORES.find((s) => s.value === m.score);
          const ai     = aiCrit(c.id);
          const aiScore = ai ? SCORES.find(s => s.value === ai.score) : null;
          return (
            <div key={c.id} className="mgmt-criterion">
              <div className="mc-header">
                <div className="mc-title">
                  <span className="mc-label">{c.label}</span>
                  <span className="mc-desc">{c.desc}</span>
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

              <div className="mc-questions">
                {c.questions.map((q, i) => <p key={i} className="mc-question">— {q}</p>)}
              </div>
              <div className="mc-score-row">
                <span className="input-label">Ton évaluation</span>
                <div className="score-btns">
                  {SCORES.map((s) => (
                    <button key={s.value} className={`score-btn ${s.color} ${m.score === s.value ? "active" : ""}`} onClick={() => updateMgmt(c.id, "score", s.value)}>
                      {s.value} — {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea className="mgmt-notes" placeholder="Tes observations..." value={m.notes} onChange={(e) => updateMgmt(c.id, "notes", e.target.value)} rows={2} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
