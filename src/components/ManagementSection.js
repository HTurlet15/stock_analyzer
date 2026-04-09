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

export default function ManagementSection({ stock, onUpdate }) {
  const initial = stock.management || Object.fromEntries(CRITERIA.map((c) => [c.id, { score: null, notes: "" }]));
  const [mgmt, setMgmt] = useState(initial);

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
      <div className="mgmt-note">
        <p>Pour évaluer le management, lis la <strong>lettre annuelle aux actionnaires</strong> et les comptes-rendus des conférences call trimestrielles.</p>
      </div>
      <div className="mgmt-criteria">
        {CRITERIA.map((c) => {
          const m      = mgmt[c.id];
          const scored = SCORES.find((s) => s.value === m.score);
          return (
            <div key={c.id} className="mgmt-criterion">
              <div className="mc-header">
                <div className="mc-title">
                  <span className="mc-label">{c.label}</span>
                  <span className="mc-desc">{c.desc}</span>
                </div>
                {scored && <span className={`badge ${scored.color}`}>{scored.label}</span>}
              </div>
              <div className="mc-questions">
                {c.questions.map((q, i) => <p key={i} className="mc-question">— {q}</p>)}
              </div>
              <div className="mc-score-row">
                <span className="input-label">Évaluation</span>
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
