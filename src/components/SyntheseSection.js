import { pct, num, money, calculateDCF } from "../utils";
import { scoreColor } from "../thresholds";
import "./SyntheseSection.css";

const VERDICT_CONFIG = [
  { min: 75, label: "Excellent",        cls: "green",  msg: "Tous les critères clés sont au vert. Dossier solide." },
  { min: 55, label: "Intéressant",      cls: "green",  msg: "Bonne base fondamentale. Quelques points à surveiller." },
  { min: 35, label: "Mitigé",           cls: "orange", msg: "Des signaux positifs mais aussi des points faibles notables." },
  { min: 0,  label: "Dossier fragile",  cls: "red",    msg: "Plusieurs critères fondamentaux ne sont pas satisfaits." },
];

function MetricRow({ label, value, color, hint }) {
  return (
    <div className="syn-row">
      <span className="syn-row-label">{label}</span>
      <span className={`syn-row-value ${color}`}>{value}</span>
      {hint && <span className="syn-row-hint">{hint}</span>}
    </div>
  );
}

function CheckBadge({ passed, label }) {
  const cls = passed === true ? "green" : passed === false ? "red" : "dim";
  const text = passed === true ? "Validé" : passed === false ? "Non validé" : "N/A";
  return (
    <div className="syn-check">
      <span className={`syn-badge ${cls}`}>{text}</span>
      <span className="syn-check-label">{label}</span>
    </div>
  );
}

export default function SyntheseSection({ stock, thresholds: t }) {
  const s = stock;

  // ── Score (same logic as healthScore but threshold-aware) ─────────────────
  const checks = [
    s.revenueGrowth != null && s.revenueGrowth >= t.revenueGrowthOk,
    s.netMargin     != null && s.netMargin     >= t.netMarginOk,
    s.epsGrowth     != null && s.epsGrowth     >= t.epsGrowthOk,
    s.equity        != null && s.equity        > 0,
    s.netDebtDecreasing === true,
    s.fcfGrowth     != null && s.fcfGrowth     >= t.fcfGrowthOk,
    s.debtToEbitda  != null && s.debtToEbitda  <= t.debtEbitdaOk,
    s.roic          != null && s.roic          >= t.roicOk,
    s.roe           != null && s.roe           >= t.roeOk,
    s.sharesDecreasing === true,
    s.payoutRatio   != null && s.payoutRatio   <= t.payoutRatioOk,
    s.divToFcf      != null && s.divToFcf      <= t.divFcfOk,
    s.peCurrent     != null && s.peCurrent     <= t.perOk,
  ];
  const passed = checks.filter(Boolean).length;
  const score  = Math.round((passed / checks.length) * 100);
  const verdict = VERDICT_CONFIG.find(v => score >= v.min);

  // ── Quick DCF (base scenario) ─────────────────────────────────────────────
  const epsGrowthUsed = s.analystEpsGrowth ?? s.epsGrowth ?? 0;
  const peExit = s.peHistorical ?? s.peCurrent ?? 20;
  const dcfAssumptions = {
    epsGrowth:    epsGrowthUsed,
    peExit,
    divGrowthRate: s.divGrowth ?? 0,
  };
  const dcf = calculateDCF(s, dcfAssumptions, 5);
  const dcfColor = dcf
    ? (dcf.returnWithDivs >= 0.10 ? "green" : dcf.returnWithDivs >= 0.07 ? "orange" : "red")
    : "dim";

  return (
    <div className="synthese-section">

      {/* ── Verdict banner ─────────────────────────────────────────────────── */}
      <div className={`verdict-banner ${verdict.cls}`}>
        <div className="verdict-left">
          <span className="verdict-score">{score}</span>
          <span className="verdict-denom">/100</span>
        </div>
        <div className="verdict-right">
          <span className="verdict-label">{verdict.label}</span>
          <span className="verdict-msg">{verdict.msg}</span>
        </div>
      </div>

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <div className="syn-grid">

        {/* Left: quality metrics */}
        <div className="syn-col">
          <p className="syn-col-title">Qualité fondamentale</p>

          <MetricRow
            label="Croissance CA (CAGR)"
            value={pct(s.revenueGrowth)}
            color={scoreColor(s.revenueGrowth, t.revenueGrowthGood, t.revenueGrowthOk)}
            hint={`seuil vert ≥ ${pct(t.revenueGrowthGood)}`}
          />
          <MetricRow
            label="Croissance BPA (CAGR)"
            value={pct(s.epsGrowth)}
            color={scoreColor(s.epsGrowth, t.epsGrowthGood, t.epsGrowthOk)}
            hint={`seuil vert ≥ ${pct(t.epsGrowthGood)}`}
          />
          <MetricRow
            label="Croissance FCF (CAGR)"
            value={pct(s.fcfGrowth)}
            color={scoreColor(s.fcfGrowth, t.fcfGrowthGood, t.fcfGrowthOk)}
            hint={`seuil vert ≥ ${pct(t.fcfGrowthGood)}`}
          />
          <MetricRow
            label="Marge nette"
            value={pct(s.netMargin)}
            color={scoreColor(s.netMargin, t.netMarginGood, t.netMarginOk)}
            hint={`seuil vert ≥ ${pct(t.netMarginGood)}`}
          />
          <MetricRow
            label="ROIC"
            value={pct(s.roic)}
            color={scoreColor(s.roic, t.roicGood, t.roicOk)}
            hint={`seuil vert ≥ ${pct(t.roicGood)}`}
          />
          <MetricRow
            label="ROE"
            value={pct(s.roe)}
            color={scoreColor(s.roe, t.roeGood, t.roeOk)}
            hint={`seuil vert ≥ ${pct(t.roeGood)}`}
          />
          <MetricRow
            label="Dette nette / EBITDA"
            value={s.debtToEbitda != null ? `${num(s.debtToEbitda, 1)}x` : "—"}
            color={scoreColor(s.debtToEbitda, t.debtEbitdaGood, t.debtEbitdaOk, true)}
            hint={`seuil vert ≤ ${t.debtEbitdaGood}x`}
          />
          <MetricRow
            label="Payout Ratio"
            value={pct(s.payoutRatio)}
            color={scoreColor(s.payoutRatio, t.payoutRatioGood, t.payoutRatioOk, true)}
            hint={`seuil vert ≤ ${pct(t.payoutRatioGood)}`}
          />
        </div>

        {/* Right: valuation + analysts + DCF */}
        <div className="syn-col">
          <p className="syn-col-title">Valorisation &amp; perspectives</p>

          <MetricRow
            label="PER actuel"
            value={s.peCurrent != null ? `${num(s.peCurrent, 1)}x` : "—"}
            color={scoreColor(s.peCurrent, t.perGood, t.perOk, true)}
            hint={`seuil vert ≤ ${t.perGood}x`}
          />
          <MetricRow
            label="PER historique moyen"
            value={s.peHistorical != null ? `${num(s.peHistorical, 1)}x` : "—"}
            color="dim"
          />
          <MetricRow
            label="Forward PER"
            value={s.forwardPE != null ? `${num(s.forwardPE, 1)}x` : "—"}
            color={scoreColor(s.forwardPE, t.perGood, t.perOk, true)}
          />

          <div className="syn-divider" />

          <p className="syn-col-title">Analystes</p>
          <MetricRow
            label="Croissance BPA estimée"
            value={pct(s.analystEpsGrowth)}
            color={scoreColor(s.analystEpsGrowth, t.analystEpsGood, t.analystEpsOk)}
            hint={`seuil vert ≥ ${pct(t.analystEpsGood)}`}
          />
          <MetricRow
            label="Croissance CA estimée"
            value={pct(s.analystRevGrowth)}
            color={scoreColor(s.analystRevGrowth, t.analystRevGood, t.analystRevOk)}
            hint={`seuil vert ≥ ${pct(t.analystRevGood)}`}
          />

          <div className="syn-divider" />

          <p className="syn-col-title">DCF rapide — Scénario Base (5 ans)</p>
          {dcf ? (
            <>
              <MetricRow
                label="Rendement annualisé (avec div.)"
                value={pct(dcf.returnWithDivs)}
                color={dcfColor}
              />
              <MetricRow
                label="Prix cible (BPA × PER sortie)"
                value={`$${num(dcf.priceFuture, 0)}`}
                color="dim"
              />
              <p className="syn-dcf-note">
                BPA utilisé : {s.analystEpsGrowth != null ? "consensus analystes" : "CAGR historique"} ({pct(epsGrowthUsed)}/an) · PER sortie : {num(peExit, 1)}x
              </p>
            </>
          ) : (
            <p className="syn-dcf-note">Données insuffisantes pour le DCF.</p>
          )}
        </div>
      </div>

      {/* ── 3 key checks ───────────────────────────────────────────────────── */}
      <div className="syn-checks">
        <p className="syn-col-title" style={{ marginBottom: 10 }}>Vérifications clés</p>
        <CheckBadge passed={s.profitsVsDebt}             label="Profits supérieurs à la dette nette (< 5x résultat net)" />
        <CheckBadge passed={s.cashFollowsEarnings}       label="Le cash suit les bénéfices (FCF / Résultat net ≥ 70%)" />
        <CheckBadge passed={s.dividendCoveredByEarnings} label="Dividende couvert par le résultat net" />
        <CheckBadge passed={s.sharesDecreasing}          label="Actions en circulation stables ou décroissantes" />
      </div>
    </div>
  );
}
