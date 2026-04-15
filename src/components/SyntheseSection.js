import { useState } from "react";
import { pct, num, calculateDCF, computeMetricsForPeriod } from "../utils";
import { scoreColor, computeScore } from "../thresholds";
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

const SCORE_CRITERIA = [
  { label: "Croissance CA",      get: (s, t) => s.revenueGrowth != null && s.revenueGrowth >= t.revenueGrowthOk, hint: (t) => `≥ ${pct(t.revenueGrowthOk)}/an` },
  { label: "Marge nette",        get: (s, t) => s.netMargin     != null && s.netMargin     >= t.netMarginOk,     hint: (t) => `≥ ${pct(t.netMarginOk)}` },
  { label: "Croissance BPA",     get: (s, t) => s.epsGrowth     != null && s.epsGrowth     >= t.epsGrowthOk,     hint: (t) => `≥ ${pct(t.epsGrowthOk)}/an` },
  { label: "Fonds propres > 0",  get: (s)    => s.equity        != null && s.equity        > 0,                  hint: () => "> 0" },
  { label: "Dette nette croissante", get: (s) => s.netDebtDecreasing === true,                                   hint: () => "en hausse sur la période" },
  { label: "Croissance FCF",     get: (s, t) => s.fcfGrowth     != null && s.fcfGrowth     >= t.fcfGrowthOk,     hint: (t) => `≥ ${pct(t.fcfGrowthOk)}/an` },
  { label: "Dette/EBITDA",       get: (s, t) => s.debtToEbitda  != null && s.debtToEbitda  <= t.debtEbitdaOk,    hint: (t) => `≤ ${t.debtEbitdaOk}x` },
  { label: "ROIC",               get: (s, t) => s.roic          != null && s.roic          >= t.roicOk,          hint: (t) => `≥ ${pct(t.roicOk)}` },
  { label: "ROE",                get: (s, t) => s.roe           != null && s.roe           >= t.roeOk,           hint: (t) => `≥ ${pct(t.roeOk)}` },
  { label: "Actions décroissent",get: (s)    => s.sharesDecreasing,                                              hint: () => "stable ou en baisse" },
  { label: "Payout Ratio",       get: (s, t) => s.dividendPerShare > 0 ? (s.payoutRatio != null && s.payoutRatio <= t.payoutRatioOk) : null, hint: (t) => `≤ ${pct(t.payoutRatioOk)}` },
  { label: "Div/FCF",            get: (s, t) => s.dividendPerShare > 0 ? (s.divToFcf    != null && s.divToFcf    <= t.divFcfOk)      : null, hint: (t) => `≤ ${pct(t.divFcfOk)}` },
  { label: "Capex en croissance",   get: (s) => s.capexGrowing  === true,                                       hint: () => "investit dans sa croissance" },
];

const PERIODS = [3, 5, 10, 15, "max"];

export default function SyntheseSection({ stock, thresholds: t }) {
  const [period, setPeriod] = useState(5);
  const [showScoreDetail, setShowScoreDetail] = useState(false);

  // Recompute CAGR and trend checks for the selected window
  const s = computeMetricsForPeriod(stock, period);
  const periodLabel = period === "max" ? "Max" : `${period} ans`;

  // ── Score ─────────────────────────────────────────────────────────────────
  const score  = computeScore(s, t);
  const verdict = VERDICT_CONFIG.find(v => score >= v.min);

  // ── Quick DCF (FCF-based, base scenario) ─────────────────────────────────
  const fcfGrowthUsed = s.fcfGrowth ?? 0.07;
  const pfcfExit      = s.pfcfHistorical ?? s.pfcfCurrent ?? 20;
  const dcfAssumptions = {
    fcfGrowth:    fcfGrowthUsed,
    pfcfExit,
    divGrowthRate: s.divGrowth ?? 0,
  };
  const dcf = calculateDCF(s, dcfAssumptions, 3, t.fairValueTargetReturn ?? 0.10);
  const dcfColor = dcf
    ? (dcf.returnWithDivs >= 0.10 ? "green" : dcf.returnWithDivs >= 0.07 ? "orange" : "red")
    : "dim";

  return (
    <div className="synthese-section">

      {/* ── Period selector ────────────────────────────────────────────────── */}
      <div className="syn-period-row">
        <span className="syn-period-label">Période d'analyse :</span>
        {PERIODS.map(p => (
          <button
            key={p}
            className={`syn-period-btn${period === p ? " active" : ""}`}
            onClick={() => setPeriod(p)}
          >
            {p === "max" ? "Max" : `${p} ans`}
          </button>
        ))}
      </div>

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
        <button className="score-detail-btn" onClick={() => setShowScoreDetail(v => !v)}>
          {showScoreDetail ? "Masquer le détail" : "Voir le détail"}
        </button>
      </div>

      {/* ── Score detail ───────────────────────────────────────────────────── */}
      {showScoreDetail && (
        <div className="score-detail">
          <p className="syn-col-title" style={{ marginBottom: 8 }}>Détail du score — 13 critères</p>
          <div className="score-detail-grid">
            {SCORE_CRITERIA.map(c => {
              const result = c.get(s, t);
              const dotCls = result === null ? "na" : result ? "green" : "red";
              return (
                <div key={c.label} className="sd-criterion">
                  <span className={`sd-dot ${dotCls}`} />
                  <span className="sd-label">{c.label}</span>
                  <span className="sd-hint">{result === null ? "N/A — sans dividende" : c.hint(t)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <div className="syn-grid">

        {/* Left: quality metrics */}
        <div className="syn-col">
          <p className="syn-col-title">Qualité fondamentale</p>

          <MetricRow
            label={`Croissance CA — CAGR ${periodLabel}`}
            value={pct(s.revenueGrowth)}
            color={scoreColor(s.revenueGrowth, t.revenueGrowthGood, t.revenueGrowthOk)}
            hint={`seuil vert ≥ ${pct(t.revenueGrowthGood)}`}
          />
          <MetricRow
            label={`Croissance BPA — CAGR ${periodLabel}`}
            value={pct(s.epsGrowth)}
            color={scoreColor(s.epsGrowth, t.epsGrowthGood, t.epsGrowthOk)}
            hint={`seuil vert ≥ ${pct(t.epsGrowthGood)}`}
          />
          <MetricRow
            label={`Croissance FCF — CAGR ${periodLabel}`}
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
            label={`Forward PER${s.forwardPEYear ? ` (${s.forwardPEYear})` : ""}`}
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
          {s.priceTarget?.consensus != null && (() => {
            const upside = (s.priceTarget.consensus - s.price) / s.price;
            return (
              <>
                <MetricRow
                  label="Objectif de cours (consensus)"
                  value={`$${num(s.priceTarget.consensus, 0)}`}
                  color={upside >= 0.10 ? "green" : upside >= 0 ? "orange" : "red"}
                  hint={`${upside >= 0 ? "+" : ""}${pct(upside)} vs cours actuel`}
                />
                <MetricRow
                  label="Fourchette analystes"
                  value={`$${num(s.priceTarget.low, 0)} – $${num(s.priceTarget.high, 0)}`}
                  color="dim"
                />
              </>
            );
          })()}
          {s.analystRating && (() => {
            const r = s.analystRating;
            const bullish = r.strongBuy + r.buy;
            const pctBull = Math.round((bullish / r.total) * 100);
            const pctHold = Math.round((r.hold / r.total) * 100);
            const pctBear = Math.round(((r.sell + r.strongSell) / r.total) * 100);
            return (
              <div className="rating-bar-wrap">
                <span className="rating-bar-label">{r.total} analystes</span>
                <div className="rating-bar">
                  <div className="rb-green"  style={{ width: `${pctBull}%` }} title={`Achat ${pctBull}%`} />
                  <div className="rb-orange" style={{ width: `${pctHold}%` }} title={`Neutre ${pctHold}%`} />
                  <div className="rb-red"    style={{ width: `${pctBear}%` }} title={`Vente ${pctBear}%`} />
                </div>
                <span className="rating-legend">
                  <span className="green">{pctBull}% achat</span> · <span className="dim">{pctHold}% neutre</span> · <span className="red">{pctBear}% vente</span>
                </span>
              </div>
            );
          })()}

          <div className="syn-divider" />

          <p className="syn-col-title">DCF rapide — Scénario Base (3 ans)</p>
          {dcf ? (
            <>
              <MetricRow
                label="Rendement annualisé (avec div.)"
                value={pct(dcf.returnWithDivs)}
                color={dcfColor}
              />
              <MetricRow
                label="Fair value (10%/an cible)"
                value={`$${num(dcf.fairValue, 0)}`}
                color={dcf.marginOfSafety > 0.15 ? "green" : dcf.marginOfSafety > 0 ? "orange" : "red"}
                hint={dcf.marginOfSafety > 0
                  ? `−${(dcf.marginOfSafety * 100).toFixed(0)}% sous cours`
                  : `+${(Math.abs(dcf.marginOfSafety) * 100).toFixed(0)}% au-dessus cours`}
              />
              <p className="syn-dcf-note">
                FCF CAGR : {pct(fcfGrowthUsed)}/an · P/FCF sortie : {num(pfcfExit, 1)}x
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
