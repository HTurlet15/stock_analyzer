export const DEFAULT_THRESHOLDS = {
  revenueGrowthGood: 0.10, revenueGrowthOk: 0.05,
  netMarginGood:     0.20, netMarginOk:     0.15, // MOAT section: >15% = pricing power signal
  epsGrowthGood:     0.10, epsGrowthOk:     0.05,
  fcfGrowthGood:     0.10, fcfGrowthOk:     0.05,
  roicGood:          0.20, roicOk:          0.15,
  roeGood:           0.15, roeOk:           0.10,
  debtEbitdaGood:    2,    debtEbitdaOk:    3,
  payoutRatioGood:   0.40, payoutRatioOk:   0.60,
  divFcfGood:        0.50, divFcfOk:        0.70,
  perGood:           20,   perOk:           30,
  analystEpsGood:    0.10, analystEpsOk:    0.05,
  analystRevGood:    0.08, analystRevOk:    0.05,
};

const LS_KEY = "sa_thresholds";

export function loadThresholds() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_THRESHOLDS };
    return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_THRESHOLDS };
  }
}

export function saveThresholds(t) {
  localStorage.setItem(LS_KEY, JSON.stringify(t));
}

export function scoreColor(value, good, ok, inverse = false) {
  if (value == null || !isFinite(value)) return "dim";
  return !inverse
    ? (value >= good ? "green" : value >= ok ? "orange" : "red")
    : (value <= good ? "green" : value <= ok ? "orange" : "red");
}

// Config for the settings panel UI
export const THRESHOLD_CONFIGS = [
  { group: "Croissance",
    fields: [
      { key: "revenueGrowth", label: "Croissance CA", pct: true },
      { key: "epsGrowth",     label: "Croissance BPA", pct: true },
      { key: "fcfGrowth",     label: "Croissance FCF", pct: true },
    ]
  },
  { group: "Rentabilité",
    fields: [
      { key: "netMargin", label: "Marge nette", pct: true },
      { key: "roic",      label: "ROIC", pct: true },
      { key: "roe",       label: "ROE",  pct: true },
    ]
  },
  { group: "Bilan & cash",
    fields: [
      { key: "debtEbitda",  label: "Dette/EBITDA", pct: false, inverse: true },
      { key: "payoutRatio", label: "Payout Ratio",  pct: true,  inverse: true },
      { key: "divFcf",      label: "Div/FCF",       pct: true,  inverse: true },
    ]
  },
  { group: "Valorisation & analystes",
    fields: [
      { key: "per",         label: "PER",               pct: false, inverse: true },
      { key: "analystEps",  label: "BPA croissance est.", pct: true },
      { key: "analystRev",  label: "CA croissance est.",  pct: true },
    ]
  },
];
