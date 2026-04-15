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
  const { quote, profile, income, balance, cashflow, metrics, ratios, estimates, dividends,
          priceTarget, analystRating } = raw;

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

  // Helper: CAGR from first-to-last non-null positive value in a sorted-newest-first array
  const cagrSeries = (arr, key) => {
    const valid = arr.filter(r => r[key] != null && r[key] > 0);
    if (valid.length < 2) return null;
    // valid[0] = newest, valid[last] = oldest
    return cagr(valid[valid.length - 1][key], valid[0][key], valid.length - 1);
  };

  const revenueCurrent = latestInc.revenue;
  const revenueGrowth = cagrSeries(inc, 'revenue');
  const netMargin = latestInc.netIncome != null && latestInc.revenue ? latestInc.netIncome / latestInc.revenue : null;
  const epsCurrent = latestInc.eps;
  const epsGrowth = cagrSeries(inc, 'eps');
  const equity = latestBal.totalStockholdersEquity;
  const netDebt = latestBal.netDebt;
  const netDebtOld = (bal[bal.length - 1] || {}).netDebt;
  const netDebtDecreasing = netDebtOld != null && netDebt != null && netDebt < netDebtOld;
  const fcfCurrent = latestCF.freeCashFlow;
  const fcfGrowth = cagrSeries(cf, 'freeCashFlow');
  const fcfValidCf = cf.filter(r => r.freeCashFlow != null && r.freeCashFlow > 0);
  // Normalized FCF: average of up to 5 recent positive years — stable base for DCF
  // when CapEx cycles cause temporary dips (e.g. Amazon 2022)
  const fcfPositiveRecent = cf.slice(0, 5).filter(r => r.freeCashFlow != null && r.freeCashFlow > 0);
  const fcfNormalized = fcfPositiveRecent.length > 0
    ? fcfPositiveRecent.reduce((s, r) => s + r.freeCashFlow, 0) / fcfPositiveRecent.length
    : null;
  const fcfVolatile = cf.slice(0, 5).some(r => r.freeCashFlow != null && r.freeCashFlow < 0);
  const fcfGrowthYears = fcfValidCf.length >= 2 ? fcfValidCf.length - 1 : null;
  const ebitda = latestInc.ebitda;
  const totalDebt = latestBal.totalDebt;
  const debtToEbitda = ebitda && ebitda > 0 && netDebt != null ? netDebt / ebitda : null;
  const roic = latestMet.roic;
  const roe = latestMet.roe;
  const sharesCurrent = latestInc.weightedAverageShsOut;
  const sharesOld = (inc[inc.length - 1] || {}).weightedAverageShsOut;
  const sharesDecreasing = (sharesOld != null && sharesCurrent != null)
    ? sharesCurrent <= sharesOld
    : null;
  const payoutRatio = latestRat.payoutRatio;
  const dividendsPaid = latestCF.dividendsPaid ? Math.abs(latestCF.dividendsPaid) : null;
  const divToFcf = dividendsPaid && fcfCurrent && fcfCurrent > 0 ? dividendsPaid / fcfCurrent : null;
  const capexValid = cf.filter(r => r.capitalExpenditure != null && r.capitalExpenditure !== 0);
  const capex    = capexValid.length > 0 ? Math.abs(capexValid[0].capitalExpenditure) : null;
  const capexOld = capexValid.length > 1 ? Math.abs(capexValid[capexValid.length - 1].capitalExpenditure) : null;
  const capexGrowing = capex != null && capexOld != null && capex > capexOld;
  const profitsVsDebt = latestInc.netIncome != null && netDebt != null ? latestInc.netIncome > 0 && (netDebt / latestInc.netIncome) < 5 : null;
  const cashFollowsEarnings = fcfCurrent != null && latestInc.netIncome > 0 ? fcfCurrent / latestInc.netIncome > 0.7 : null;
  const dividendCoveredByEarnings = dividendsPaid && latestInc.netIncome != null && latestInc.netIncome > 0 ? dividendsPaid < latestInc.netIncome : null;

  const peCurrent = q?.pe;
  const peValid = met.filter(m => m.peRatio != null && m.peRatio > 0 && m.peRatio < 100);
  const peHistorical = peValid.length > 0 ? peValid.reduce((s, m) => s + m.peRatio, 0) / peValid.length : null;
  const fwdEps = est[0]?.estimatedEpsAvg;
  const currentPrice = q?.price;
  const forwardPE = fwdEps && currentPrice ? currentPrice / fwdEps : null;
  const forwardPEYear = est[0]?.date ? est[0].date.slice(0, 4) : null;

  // FCF per share — use market-cap-implied shares to stay in sync with current price
  // (handles recent splits where the latest income statement still shows pre-split share count)
  const impliedShares = q?.marketCap && currentPrice ? q.marketCap / currentPrice : sharesCurrent;
  const fcfPerShare = fcfCurrent != null && impliedShares != null && impliedShares > 0
    ? fcfCurrent / impliedShares : null;
  const pfcfValid = met.filter(m => m.pfcfRatio != null && m.pfcfRatio > 0 && m.pfcfRatio < 200).slice(0, 7);
  const pfcfHistorical = pfcfValid.length > 0
    ? pfcfValid.reduce((s, m) => s + m.pfcfRatio, 0) / pfcfValid.length : null;
  const pfcfHistoricalYears = pfcfValid.length > 0 ? pfcfValid.length : null;
  const pfcfCurrent = fcfPerShare != null && fcfPerShare > 0 && currentPrice
    ? currentPrice / fcfPerShare : null;

  // Cap analyst estimates at 3 years (beyond that, too uncertain)
  const estCapped = est.slice(0, 3);
  const estEpsFirst = estCapped[0]?.estimatedEpsAvg;
  const estEpsLast = estCapped[estCapped.length - 1]?.estimatedEpsAvg;
  const estYears = estCapped.length - 1;
  const analystEpsGrowth = estCapped.length >= 2 ? cagr(estEpsFirst, estEpsLast, estYears) : null;
  const estRevFirst = estCapped[0]?.estimatedRevenueAvg;
  const estRevLast = estCapped[estCapped.length - 1]?.estimatedRevenueAvg;
  const analystRevGrowth = estCapped.length >= 2 ? cagr(estRevFirst, estRevLast, estYears) : null;

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
    equity, netDebt, netDebtDecreasing, fcfCurrent, fcfGrowth, fcfGrowthYears, fcfPerShare,
    fcfNormalized, fcfVolatile,
    impliedShares,
    debtToEbitda, roic, roe, sharesCurrent, sharesDecreasing,
    payoutRatio, divToFcf, capex, capexGrowing,
    profitsVsDebt, cashFollowsEarnings, dividendCoveredByEarnings,
    peCurrent, peHistorical, forwardPE, forwardPEYear,
    pfcfCurrent, pfcfHistorical, pfcfHistoricalYears,
    analystEpsGrowth, analystRevGrowth,
    dividendYield, dividendPerShare, divGrowth,
    priceTarget, analystRating,
    inc, cf, met, rat, est, divs, bal,
  };
};

// Recompute all period-sensitive metrics for a given window.
// Returns the effective number of years actually used (capped by available data).
export const computeMetricsForPeriod = (stock, periodYears) => {
  const { inc, cf, bal, met } = stock;
  if (!inc?.length) return { ...stock, effectivePeriodYears: 0 };

  // Cap to available data — e.g. FMP free tier often has only 5 years
  const maxYears = inc.length - 1;
  const wantedYears = periodYears === "max" ? maxYears : Math.min(periodYears, maxYears);
  const limit = wantedYears + 1;

  const incSlice = inc.slice(0, limit);
  const cfSlice  = (cf  || []).slice(0, limit);
  const balSlice = (bal || []).slice(0, limit);
  const metSlice = (met || []).slice(0, limit);

  const cagrSeries = (arr, key) => {
    const valid = arr.filter(r => r[key] != null && r[key] > 0);
    if (valid.length < 2) return null;
    return cagr(valid[valid.length - 1][key], valid[0][key], valid.length - 1);
  };

  // Growth metrics — period-sensitive
  const revenueGrowth = cagrSeries(incSlice, 'revenue');
  const epsGrowth     = cagrSeries(incSlice, 'eps');
  const fcfGrowth     = cagrSeries(cfSlice,  'freeCashFlow');

  // Margin — average over the period (not just latest year)
  const netMargins = incSlice
    .filter(r => r.netIncome != null && r.revenue != null && r.revenue > 0)
    .map(r => r.netIncome / r.revenue);
  const netMargin = netMargins.length > 0
    ? netMargins.reduce((a, b) => a + b, 0) / netMargins.length
    : stock.netMargin;

  // ROIC / ROE — average over the period
  const roicVals = metSlice.filter(r => r.roic != null).map(r => r.roic);
  const roeVals  = metSlice.filter(r => r.roe  != null).map(r => r.roe);
  const roic = roicVals.length > 0 ? roicVals.reduce((a, b) => a + b, 0) / roicVals.length : stock.roic;
  const roe  = roeVals.length  > 0 ? roeVals.reduce( (a, b) => a + b, 0) / roeVals.length  : stock.roe;

  // Debt trend — compare start vs end of the period
  const netDebt    = (balSlice[0]  || {}).netDebt;
  const netDebtOld = (balSlice[balSlice.length - 1] || {}).netDebt;
  const netDebtDecreasing = netDebtOld != null && netDebt != null ? netDebt < netDebtOld : stock.netDebtDecreasing;

  // Shares
  const sharesCurrent  = (incSlice[0] || {}).weightedAverageShsOut;
  const sharesOld      = (incSlice[incSlice.length - 1] || {}).weightedAverageShsOut;
  const sharesDecreasing = sharesOld != null && sharesCurrent != null ? sharesCurrent <= sharesOld : null;

  // Capex trend
  const capexValid = cfSlice.filter(r => r.capitalExpenditure != null && r.capitalExpenditure !== 0);
  const capex      = capexValid.length > 0 ? Math.abs(capexValid[0].capitalExpenditure) : null;
  const capexOld   = capexValid.length > 1 ? Math.abs(capexValid[capexValid.length - 1].capitalExpenditure) : null;
  const capexGrowing = capex != null && capexOld != null ? capex > capexOld : stock.capexGrowing;

  return {
    ...stock,
    revenueGrowth, epsGrowth, fcfGrowth,
    netMargin, roic, roe,
    sharesDecreasing, netDebtDecreasing, capexGrowing,
    effectivePeriodYears: wantedYears,
  };
};

// FCF-based DCF: grows FCF/share at fcfGrowth, applies P/FCF exit multiple,
// then adds cumulated dividends. Returns implied annual return + fair value.
export const calculateDCF = (data, assumptions, years = 3, targetReturn = 0.10) => {
  const { price, fcfCurrent, fcfNormalized, sharesCurrent, impliedShares, dividendPerShare } = data;
  const { fcfGrowth, pfcfExit, divGrowthRate } = assumptions;
  const effectiveShares = impliedShares ?? sharesCurrent;
  // Use normalized FCF (avg of last 5 positive years) as base — more stable than a single year
  // that may be depressed by a CapEx cycle. falls back to fcfCurrent if no normalized available.
  const fcfBase = fcfNormalized ?? fcfCurrent;
  if (!fcfBase || !effectiveShares || !price || !pfcfExit || fcfGrowth == null) return null;
  const fcfPerShare = fcfBase / effectiveShares;
  if (fcfPerShare <= 0) return null; // negative FCF — model invalid

  const fcfFuture   = fcfPerShare * Math.pow(1 + fcfGrowth, years);
  const priceFuture = fcfFuture * pfcfExit;

  const D = dividendPerShare || 0;
  const g = divGrowthRate || 0;
  let dividendsCumulated = 0;
  if (g !== 0 && D > 0) {
    dividendsCumulated = D * (Math.pow(1 + g, years) - 1) / g;
  } else if (D > 0) {
    dividendsCumulated = D * years;
  }

  const totalValue     = priceFuture + dividendsCumulated;
  const returnWithDivs = Math.pow(totalValue   / price, 1 / years) - 1;
  const returnNoDivs   = Math.pow(priceFuture  / price, 1 / years) - 1;
  const fairValue      = totalValue / Math.pow(1 + targetReturn, years);
  const marginOfSafety = (fairValue - price) / fairValue; // >0 = undervalued
  return { fcfFuture, priceFuture, dividendsCumulated, totalValue, returnWithDivs, returnNoDivs, fairValue, marginOfSafety };
};
