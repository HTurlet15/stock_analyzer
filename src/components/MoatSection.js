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

export default function MoatSection({ stock, onUpdate }) {
  const initial = stock.moat || Object.fromEntries(MOAT_TYPES.map((t) => [t.id, { score: null, notes: "" }]));
  const [moat, setMoat] = useState(initial);

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
      <div className="moat-types">
        {MOAT_TYPES.map((type) => {
          const m      = moat[type.id];
          const scored = SCORES.find((s) => s.value === m.score);
          return (
            <div key={type.id} className="moat-type-card">
              <div className="mtc-header">
                <div className="mtc-title">
                  <span className="mtc-label">{type.label}</span>
                  <span className="mtc-desc">{type.desc}</span>
                </div>
                {scored && <span className={`badge ${scored.color}`}>{scored.label}</span>}
              </div>
              <div className="mtc-questions">
                {type.questions.map((q, i) => <p key={i} className="mtc-question">— {q}</p>)}
              </div>
              <div className="mtc-score-row">
                <span className="input-label">Évaluation</span>
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
