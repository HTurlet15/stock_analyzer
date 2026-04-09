export const pct = (v) => (v != null ? `${(v * 100).toFixed(1)}%` : "—");
export const num = (v, dec = 2) => (v != null ? v.toFixed(dec) : "—");
export const money = (v) => {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(0)}`;
};

export const cagr = (start, end, years) => {
  if (start == null || end == null || years <= 0) return null;
  if (start <= 0 || end <= 0) return null; // can't compute meaningful CAGR with negatives
  const r = Math.pow(end / start, 1 / years) - 1;
  return isFinite(r) ? r : null;
};

export const colorFromThresholds = (value, greenThreshold, orangeThreshold, inverse = false) => {
  if (value == null) return "dim";
  if (!inverse) {
    if (value >= greenThreshold) return "green";
    if (value >= orangeThreshold) return "orange";
    return "red";
  } else {
    if (value <= greenThreshold) return "green";
    if (value <= orangeThreshold) return "orange";
    return "red";
  }
};

export const processData = (raw) => {
  const { quote, profile, income, balance, cashflow, metrics, ratios, estimates, dividends } = raw;

  const q = Array.isArray(quote) ? quote[0] : quote;
  const p = Array.isArray(profile) ? profile[0] : profile;

  const inc = (income || []).sort((a, b) => new Date(b.date) - new Date(a.date));
  const bal = (balance || []).sort((a, b) => new Date(b.date) - new Date(a.date));
  const cf = (cashflow || []).sort((a, b) => new Date(b.date) - new Date(a.date));
  const met = (metrics || []).sort((a, b) => new Date(b.date) - new Date(a.date));
  const rat = (ratios || []).sort((a, b) => new Date(b.date) - new Date(a.date));
  const est = (estimates || []).sort((a, b) => new Date(a.date) - new Date(b.date));
  const divs = (dividends?.historical || dividends || []).sort((a, b) => new Date(b.date) - new Date(a.date));

  const latestInc = inc[0] || {};
  const oldestInc = inc[inc.length - 1] || {};
  const latestBal = bal[0] || {};
  const latestCF = cf[0] || {};
  const latestMet = met[0] || {};
  const latestRat = rat[0] || {};
  const years = inc.length > 1 ? inc.length - 1 : 1;

  const revenueCurrent = latestInc.revenue;
  const revenueOld = oldestInc.revenue;
  const revenueGrowth = cagr(revenueOld, revenueCurrent, years);
  const netMargin = latestInc.netIncome && latestInc.revenue ? latestInc.netIncome / latestInc.revenue : null;
  const epsCurrent = latestInc.eps;
  const epsOld = (inc[inc.length - 1] || {}).eps;
  const epsGrowth = cagr(epsOld, epsCurrent, years);
  const equity = latestBal.totalStockholdersEquity;
  const netDebt = latestBal.netDebt;
  const netDebtOld = (bal[bal.length - 1] || {}).netDebt;
  const netDebtDecreasing = netDebtOld != null && netDebt != null && netDebt < netDebtOld;
  const fcfCurrent = latestCF.freeCashFlow;
  const fcfOld = (cf[cf.length - 1] || {}).freeCashFlow;
  const fcfGrowth = cagr(fcfOld, fcfCurrent, years);
  const ebitda = latestInc.ebitda;
  const totalDebt = latestBal.totalDebt;
  const debtToEbitda = ebitda && totalDebt ? totalDebt / ebitda : null;
  const roic = latestMet.roic;
  const roe = latestMet.roe;
  const sharesCurrent = latestInc.weightedAverageShsOut;
  const sharesOld = (inc[inc.length - 1] || {}).weightedAverageShsOut;
  const sharesDecreasing = sharesOld != null && sharesCurrent != null && sharesCurrent <= sharesOld;
  const payoutRatio = latestRat.payoutRatio;
  const dividendsPaid = latestCF.dividendsPaid ? Math.abs(latestCF.dividendsPaid) : null;
  const divToFcf = dividendsPaid && fcfCurrent && fcfCurrent > 0 ? dividendsPaid / fcfCurrent : null;
  const capex = latestCF.capitalExpenditure ? Math.abs(latestCF.capitalExpenditure) : null;
  const capexOld = cf[cf.length - 1]?.capitalExpenditure ? Math.abs(cf[cf.length - 1].capitalExpenditure) : null;
  const capexGrowing = capex && capexOld && capex > capexOld;
  const profitsVsDebt = latestInc.netIncome && netDebt ? latestInc.netIncome > 0 && (netDebt / latestInc.netIncome) < 5 : null;
  const cashFollowsEarnings = fcfCurrent && latestInc.netIncome ? fcfCurrent / latestInc.netIncome > 0.7 : null;
  const dividendCoveredByEarnings = dividendsPaid && latestInc.netIncome ? dividendsPaid < latestInc.netIncome : null;

  const peCurrent = q?.pe;
  const peHistorical = met.length > 0 ? met.reduce((sum, m) => sum + (m.peRatio || 0), 0) / met.filter(m => m.peRatio).length : null;
  const fwdEps = est[0]?.estimatedEpsAvg;
  const currentPrice = q?.price;
  const forwardPE = fwdEps && currentPrice ? currentPrice / fwdEps : null;
  const forwardPEYear = est[0]?.date ? est[0].date.slice(0, 4) : null;

  // Cap analyst estimates at 3 years (beyond that, too uncertain)
  const estCapped = est.slice(0, 3);
  const estEpsFirst = estCapped[0]?.estimatedEpsAvg;
  const estEpsLast = estCapped[estCapped.length - 1]?.estimatedEpsAvg;
  const estYears = estCapped.length > 1 ? estCapped.length - 1 : 1;
  const analystEpsGrowth = cagr(estEpsFirst, estEpsLast, estYears);
  const estRevFirst = estCapped[0]?.estimatedRevenueAvg;
  const estRevLast = estCapped[estCapped.length - 1]?.estimatedRevenueAvg;
  const analystRevGrowth = cagr(estRevFirst, estRevLast, estYears);

  const dividendYield = q?.dividendYield;
  const dividendPerShare = q?.lastDiv;

  // Annualise les dividendes par année calendaire (indépendamment de la fréquence de paiement)
  // et exclut l'année en cours (potentiellement incomplète)
  const currentYear = new Date().getFullYear().toString();
  const annualDivMap = {};
  divs.forEach(d => {
    const year = d.date?.slice(0, 4);
    if (year && year < currentYear) {
      annualDivMap[year] = (annualDivMap[year] || 0) + (d.dividend || 0);
    }
  });
  // Max 10 ans pour un CAGR pertinent (évite l'effet "démarrage de dividende")
  const annualDivList = Object.keys(annualDivMap).sort().map(y => annualDivMap[y]).slice(-10);
  const divGrowth = annualDivList.length >= 3
    ? cagr(annualDivList[0], annualDivList[annualDivList.length - 1], annualDivList.length - 1)
    : null;

  return {
    symbol: q?.symbol, name: p?.companyName, sector: p?.sector, industry: p?.industry,
    description: p?.description, price: currentPrice, marketCap: q?.marketCap,
    revenueCurrent, revenueGrowth, netMargin, epsCurrent, epsGrowth,
    equity, netDebt, netDebtDecreasing, fcfCurrent, fcfGrowth,
    debtToEbitda, roic, roe, sharesCurrent, sharesDecreasing,
    payoutRatio, divToFcf, capex, capexGrowing,
    profitsVsDebt, cashFollowsEarnings, dividendCoveredByEarnings,
    peCurrent, peHistorical, forwardPE, forwardPEYear, analystEpsGrowth, analystRevGrowth,
    dividendYield, dividendPerShare, divGrowth,
    inc, cf, met, rat, est, divs,
  };
};

export const calculateDCF = (data, assumptions, years = 5) => {
  const { price, epsCurrent, dividendPerShare } = data;
  const { epsGrowth, peExit, divGrowthRate } = assumptions;
  if (!epsCurrent || !price || !peExit || epsGrowth == null) return null;
  const epsFuture = epsCurrent * Math.pow(1 + epsGrowth, years);
  const priceFuture = epsFuture * peExit;
  const D = dividendPerShare || 0;
  const g = divGrowthRate || 0;
  let dividendsCumulated = 0;
  if (g !== 0 && D > 0) {
    dividendsCumulated = D * (Math.pow(1 + g, years) - 1) / g;
  } else if (D > 0) {
    dividendsCumulated = D * years;
  }
  const totalValue = priceFuture + dividendsCumulated;
  const returnWithDivs = Math.pow(totalValue / price, 1 / years) - 1;
  const returnNoDivs = Math.pow(priceFuture / price, 1 / years) - 1;
  return { epsFuture, priceFuture, dividendsCumulated, totalValue, returnWithDivs, returnNoDivs };
};
