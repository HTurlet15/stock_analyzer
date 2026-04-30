import math
import os
import json
import time
import datetime
import requests
import pandas as pd
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
import yfinance as yf
try:
    import anthropic as _anthropic
except ImportError:
    _anthropic = None
try:
    from tavily import TavilyClient as _TavilyClient
except ImportError:
    _TavilyClient = None

load_dotenv()

# ── Alpha Vantage config ──────────────────────────────────────────────────────
AV_KEY  = os.environ.get("AV_API_KEY", "")
AV_BASE = "https://www.alphavantage.co/query"

# ── Financial Modeling Prep config ────────────────────────────────────────────
FMP_KEY  = os.environ.get("REACT_APP_FMP_API_KEY", "") or os.environ.get("FMP_API_KEY", "")
FMP_BASE = "https://financialmodelingprep.com/api/v3"

# ── AI analysis config ────────────────────────────────────────────────────────
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
TAVILY_KEY    = os.environ.get("TAVILY_API_KEY", "")

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000"])

# ── Cache des données historiques AV (figées pour années < année courante) ────
CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)

def _cache_path(symbol):
    return os.path.join(CACHE_DIR, f"{symbol}.json")

def load_av_cache(symbol):
    """Charge le cache AV pour ce symbole. Retourne {} si absent ou illisible."""
    try:
        with open(_cache_path(symbol)) as f:
            return json.load(f)
    except Exception:
        return {}

def save_av_cache(symbol, income, balance, cashflow):
    """Persiste les données historiques (années < année courante) dans le cache."""
    cy = str(datetime.date.today().year)
    try:
        data = {
            "income":        [r for r in income   if r.get("date", "")[:4] < cy],
            "balance":       [r for r in balance  if r.get("date", "")[:4] < cy],
            "cashflow":      [r for r in cashflow if r.get("date", "")[:4] < cy],
            "cached_year":   cy,
        }
        with open(_cache_path(symbol), "w") as f:
            json.dump(data, f)
    except Exception:
        pass

def av_cache_valid(cache):
    """Le cache est valide s'il contient des données ET que l'année de cache
    est l'année courante (au tournant d'année on re-télécharge pour avoir le
    nouvel exercice clôturé)."""
    if not cache.get("income"):
        return False
    return cache.get("cached_year") == str(datetime.date.today().year)


def clean(val):
    """Convert NaN/Inf/pandas NA to None for JSON serialization."""
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    return val


def get_val(df, col, *keys):
    """Try multiple row key names, return the first non-null float found."""
    for key in keys:
        try:
            if key in df.index and col in df.columns:
                val = df.loc[key, col]
                if pd.notna(val):
                    return clean(float(val))
        except Exception:
            pass
    return None


def col_date(col):
    """Format a DataFrame column (Timestamp or string) as YYYY-MM-DD."""
    if hasattr(col, "strftime"):
        return col.strftime("%Y-%m-%d")
    return str(col)[:10]


# ── Alpha Vantage helpers ─────────────────────────────────────────────────────

def av_clean(val):
    """Convert AV string values ('None', '-', '') to float or None."""
    if val is None or str(val).strip() in ("None", "-", "", "N/A"):
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


_av_last_error = {}  # global to expose in response for diagnostics

def av_fetch(symbol, function):
    """Fetch one AV endpoint. Returns list of annualReports or []."""
    if not AV_KEY:
        _av_last_error[function] = "no AV_API_KEY"
        return []
    try:
        r = requests.get(
            AV_BASE,
            params={"function": function, "symbol": symbol, "apikey": AV_KEY},
            timeout=12,
        )
        data = r.json()
        if "Note" in data:
            _av_last_error[function] = "rate_limit: daily or per-minute limit reached"
            return []
        if "Information" in data:
            _av_last_error[function] = "rate_limit: daily or per-minute limit reached"
            return []
        if "Error Message" in data:
            _av_last_error[function] = f"error: {data['Error Message'][:80]}"
            return []
        reports = data.get("annualReports", [])
        _av_last_error.pop(function, None)
        return reports
    except Exception as e:
        _av_last_error[function] = str(e)[:80]
        return []


def av_income(symbol):
    reports = av_fetch(symbol, "INCOME_STATEMENT")
    result = []
    for r in reports:
        ebitda = av_clean(r.get("ebitda"))
        if ebitda is None:
            op = av_clean(r.get("operatingIncome"))
            da = av_clean(r.get("depreciationAndAmortization")) or av_clean(r.get("depreciation"))
            if op is not None and da is not None:
                ebitda = op + da
        result.append({
            "date":                  r.get("fiscalDateEnding", "")[:10],
            "revenue":               av_clean(r.get("totalRevenue")),
            "netIncome":             av_clean(r.get("netIncome")),
            "ebitda":                ebitda,
            "operatingIncome":       av_clean(r.get("operatingIncome")) or av_clean(r.get("ebit")),
            "eps":                   av_clean(r.get("reportedEPS")) or av_clean(r.get("dilutedEPS")) or av_clean(r.get("basicEPS")),
            "weightedAverageShsOut": av_clean(r.get("commonStockSharesOutstanding")),
        })
    return result


def av_balance(symbol):
    reports = av_fetch(symbol, "BALANCE_SHEET")
    result = []
    for r in reports:
        equity     = av_clean(r.get("totalShareholderEquity"))
        total_debt = av_clean(r.get("shortLongTermDebtTotal")) or av_clean(r.get("longTermDebt"))
        cash       = av_clean(r.get("cashAndShortTermInvestments")) or av_clean(r.get("cashAndCashEquivalentsAtCarryingValue"))
        net_debt   = (total_debt - cash) if total_debt is not None and cash is not None else None
        result.append({
            "date":                    r.get("fiscalDateEnding", "")[:10],
            "totalStockholdersEquity": equity,
            "totalDebt":               total_debt,
            "netDebt":                 net_debt,
            # Balance sheet always has shares outstanding — used as fallback for metrics
            "sharesOutstanding":       av_clean(r.get("commonStockSharesOutstanding")),
        })
    return result


def av_cashflow(symbol):
    reports = av_fetch(symbol, "CASH_FLOW")
    result = []
    for r in reports:
        op_cf  = av_clean(r.get("operatingCashflow"))
        # AV capitalExpenditures is a positive outflow amount → make negative to match yfinance
        capex_raw = av_clean(r.get("capitalExpenditures"))
        capex  = -abs(capex_raw) if capex_raw is not None else None
        fcf    = (op_cf + capex) if op_cf is not None and capex is not None else None
        divs   = av_clean(r.get("dividendPayoutCommonStock")) or av_clean(r.get("dividendPayout"))
        da_raw = av_clean(r.get("depreciationAndAmortization")) or av_clean(r.get("depreciation"))
        result.append({
            "date":                        r.get("fiscalDateEnding", "")[:10],
            "freeCashFlow":                fcf,
            "operatingCashFlow":           op_cf,
            "depreciationAndAmortization": da_raw,
            "capitalExpenditure":          capex,
            "dividendsPaid":               -abs(divs) if divs is not None else None,
        })
    return result


# ── FMP helpers ───────────────────────────────────────────────────────────────

def fmp_fetch(endpoint, symbol, **params):
    if not FMP_KEY:
        return None
    try:
        url = f"{FMP_BASE}/{endpoint}/{symbol}"
        r = requests.get(url, params={"apikey": FMP_KEY, **params}, timeout=10)
        data = r.json()
        if isinstance(data, dict) and "Error Message" in data:
            return None
        return data
    except Exception:
        return None


def fmp_estimates(symbol):
    """Annual analyst estimates from FMP — up to 5 forward years."""
    data = fmp_fetch("analyst-estimates", symbol, period="annual")
    if not data or not isinstance(data, list):
        return []
    result = []
    for r in data:
        date = str(r.get("date", ""))[:10]
        if not date:
            continue
        result.append({
            "date":                  date,
            "estimatedEpsAvg":       r.get("estimatedEpsAvg"),
            "estimatedEpsHigh":      r.get("estimatedEpsHigh"),
            "estimatedEpsLow":       r.get("estimatedEpsLow"),
            "estimatedRevenueAvg":   r.get("estimatedRevenueAvg"),
            "estimatedRevenueHigh":  r.get("estimatedRevenueHigh"),
            "estimatedRevenueLow":   r.get("estimatedRevenueLow"),
            "numberAnalysts":        r.get("numberAnalystEstimatedEps"),
        })
    # Sort ascending (nearest first)
    result.sort(key=lambda x: x["date"])
    # Keep only future dates
    today = datetime.date.today().isoformat()
    result = [e for e in result if e["date"] >= today[:7]]
    return result


def fmp_price_target(symbol):
    """Analyst price target consensus from FMP."""
    data = fmp_fetch("price-target-consensus", symbol)
    if not data or not isinstance(data, dict):
        return None
    return {
        "consensus": data.get("targetConsensus"),
        "high":      data.get("targetHigh"),
        "low":       data.get("targetLow"),
        "median":    data.get("targetMedian"),
    }


def merge_data(primary, secondary):
    """Merge two annual lists field-by-field.

    For each fiscal year present in primary, non-null primary values win;
    secondary fills in any field that primary has as None.
    Years only in secondary are appended as-is.
    """
    if not primary:
        return secondary or []
    if not secondary:
        return primary

    sec_by_year = {}
    for item in secondary:
        year = item.get("date", "")[:4]
        if year:
            sec_by_year[year] = item

    primary_years = set()
    result = []
    for item in primary:
        year = item.get("date", "")[:4]
        primary_years.add(year)
        sec = sec_by_year.get(year, {})
        merged_item = dict(item)
        for key, val in sec.items():
            if key == "date":
                continue
            # Fill only if primary has None/missing for this field
            if merged_item.get(key) is None and val is not None:
                merged_item[key] = val
        result.append(merged_item)

    # Append years that exist only in secondary
    for item in secondary:
        if item.get("date", "")[:4] not in primary_years:
            result.append(item)

    result.sort(key=lambda x: x.get("date", ""), reverse=True)
    return result


def get_for_year(lst, date_str):
    """Return the first list entry whose fiscal year matches date_str's year."""
    year = date_str[:4]
    for item in lst:
        if item.get("date", "").startswith(year):
            return item
    return {}


@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/stock/<symbol>")
def get_stock(symbol):
    symbol = symbol.upper()
    ticker = yf.Ticker(symbol)
    info = ticker.info or {}

    # ── Quote ────────────────────────────────────────────────────────────────
    price = clean(info.get("currentPrice") or info.get("regularMarketPrice"))
    quote = [{
        "symbol":        info.get("symbol", symbol),
        "price":         price,
        "pe":            clean(info.get("trailingPE")),
        "forwardPE":     clean(info.get("forwardPE")),
        "marketCap":     clean(info.get("marketCap")),
        # trailingAnnualDividendYield = dividende des 12 derniers mois / prix (fiable)
        # fallback sur dividendYield si absent
        "dividendYield": clean(info.get("trailingAnnualDividendYield") or info.get("dividendYield")),
        # trailingAnnualDividendRate = somme des dividendes sur 12 mois (= dividende annuel par action)
        "lastDiv":       clean(info.get("trailingAnnualDividendRate") or info.get("lastDividendValue")),
        "currency":      info.get("currency"),
    }]

    # ── Profile ──────────────────────────────────────────────────────────────
    profile = [{
        "companyName": info.get("longName") or info.get("shortName"),
        "sector":      info.get("sector"),
        "industry":    info.get("industry"),
        "description": info.get("longBusinessSummary"),
    }]

    # ── Income statement ─────────────────────────────────────────────────────
    income = []
    try:
        inc = ticker.income_stmt
        for col in inc.columns:
            income.append({
                "date":                  col_date(col),
                "revenue":               get_val(inc, col,
                                                 "Total Revenue", "Revenue",
                                                 "Net Revenue", "Sales"),
                "netIncome":             get_val(inc, col,
                                                 "Net Income",
                                                 "Net Income Common Stockholders",
                                                 "Net Income Applicable To Common Shares"),
                "ebitda":                get_val(inc, col,
                                                 "EBITDA", "Normalized EBITDA"),
                "operatingIncome":       get_val(inc, col,
                                                 "Operating Income",
                                                 "Total Operating Income As Reported",
                                                 "Operating Profit",
                                                 "EBIT"),
                "eps":                   get_val(inc, col,
                                                 "Basic EPS", "Diluted EPS",
                                                 "Basic Earnings Per Share",
                                                 "Diluted Earnings Per Share",
                                                 "EPS Basic", "EPS Diluted"),
                "weightedAverageShsOut": get_val(inc, col,
                                                 "Basic Average Shares",
                                                 "Diluted Average Shares",
                                                 "Weighted Average Shares",
                                                 "Average Shares",
                                                 "Weighted Average Diluted Shares Outstanding",
                                                 "Shares Outstanding"),
            })
    except Exception:
        pass
    income.sort(key=lambda x: x["date"], reverse=True)

    # ── Balance sheet ────────────────────────────────────────────────────────
    balance = []
    try:
        bal = ticker.balance_sheet
        for col in bal.columns:
            total_debt = get_val(bal, col,
                                 "Total Debt",
                                 "Long Term Debt And Capital Lease Obligation",
                                 "Long Term Debt",
                                 "Total Long Term Debt")
            cash = get_val(bal, col,
                           "Cash And Cash Equivalents",
                           "Cash Cash Equivalents And Short Term Investments",
                           "Cash And Short Term Investments",
                           "Cash And Cash Equivalents And Short Term Investments")
            net_debt = None
            if total_debt is not None and cash is not None:
                net_debt = total_debt - cash
            balance.append({
                "date":                    col_date(col),
                "totalStockholdersEquity": get_val(bal, col,
                                                   "Stockholders Equity",
                                                   "Total Equity Gross Minority Interest",
                                                   "Common Stock Equity",
                                                   "Total Stockholders Equity"),
                "totalDebt":               total_debt,
                "netDebt":                 clean(net_debt),
            })
    except Exception:
        pass
    balance.sort(key=lambda x: x["date"], reverse=True)

    # ── Cash flow ────────────────────────────────────────────────────────────
    cashflow = []
    try:
        cf = ticker.cash_flow
        for col in cf.columns:
            # FCF: try direct row first, then compute from Operating CF - Capex
            fcf_val = get_val(cf, col, "Free Cash Flow")
            capex_val = get_val(cf, col,
                                "Capital Expenditure",
                                "Capital Expenditures",
                                "Purchase Of Property Plant And Equipment",
                                "Purchases Of Property Plant And Equipment",
                                "Capital Expenditures Reported")
            op_cf = get_val(cf, col,
                            "Operating Cash Flow",
                            "Cash Flows From Operations",
                            "Net Cash Provided By Operating Activities",
                            "Total Cash From Operating Activities")
            da_val = get_val(cf, col,
                             "Depreciation And Amortization",
                             "Reconciled Depreciation",
                             "Depreciation Amortization Depletion",
                             "Depreciation")
            if fcf_val is None:
                if op_cf is not None and capex_val is not None:
                    # capex_val is negative in yfinance (cash outflow)
                    fcf_val = clean(op_cf + capex_val)

            cashflow.append({
                "date":                        col_date(col),
                "freeCashFlow":                fcf_val,
                "operatingCashFlow":           clean(op_cf)  if op_cf  is not None else None,
                "depreciationAndAmortization": clean(da_val) if da_val is not None else None,
                "capitalExpenditure":          capex_val,
                "dividendsPaid":      get_val(cf, col,
                                              "Common Stock Dividend Paid",
                                              "Cash Dividends Paid",
                                              "Payment Of Dividends",
                                              "Dividends Paid",
                                              "Cash Dividends Paid Common Stock"),
            })
    except Exception:
        pass
    cashflow.sort(key=lambda x: x["date"], reverse=True)

    # ── Alpha Vantage — cache local d'abord, API seulement si nécessaire ────
    av_years = 0
    force_refresh = request.args.get("force", "0") == "1"
    av_cache = {} if force_refresh else load_av_cache(symbol)

    if AV_KEY and not av_cache_valid(av_cache):
        # Cache absent ou périmé (nouveau turn d'année) → appel API
        try:
            av_inc = av_income(symbol)
            time.sleep(1)
            av_bal = av_balance(symbol)
            time.sleep(1)
            av_cf  = av_cashflow(symbol)
            av_years = len(av_inc)
            income   = merge_data(av_inc,  income)
            balance  = merge_data(av_bal,  balance)
            cashflow = merge_data(av_cf,   cashflow)
            # Persiste les données historiques pour les prochains appels
            save_av_cache(symbol, income, balance, cashflow)
        except Exception:
            pass
    elif av_cache_valid(av_cache):
        # Cache valide → on fusionne les données cachées avec le yfinance récent
        av_years = len(av_cache["income"])
        income   = merge_data(av_cache["income"],   income)
        balance  = merge_data(av_cache["balance"],  balance)
        cashflow = merge_data(av_cache["cashflow"], cashflow)

    # ── Fill missing shares from yfinance get_shares_full or NI/EPS inference ──
    # get_shares_full returns pre-split actual share counts (same historical terms
    # as AV data) — the split-adjust loop below then normalizes them to current terms.
    try:
        shares_full = ticker.get_shares_full(start="2000-01-01")
        if shares_full is not None and not shares_full.empty:
            if shares_full.index.tz is not None:
                shares_full.index = shares_full.index.tz_convert("UTC").tz_localize(None)
            for entry in income:
                if entry.get("weightedAverageShsOut") is not None:
                    continue
                date_ts = pd.Timestamp(entry["date"])
                # Use share count at or just before the fiscal year end
                past_sh = shares_full[shares_full.index <= date_ts]
                if not past_sh.empty:
                    entry["weightedAverageShsOut"] = float(past_sh.iloc[-1])
    except Exception:
        pass

    # Secondary fallback: infer shares from net_income / eps (same AV report → same split basis)
    for entry in income:
        if entry.get("weightedAverageShsOut") is not None:
            continue
        eps = entry.get("eps")
        ni  = entry.get("netIncome")
        if eps and eps != 0 and ni and abs(ni) > 0:
            inferred = ni / eps
            if inferred > 0:
                entry["weightedAverageShsOut"] = inferred

    # ── Split-adjust share counts ─────────────────────────────────────────────
    # cumulative_factor(date) = product of all split ratios that occurred AFTER that date.
    # Shares × factor so that CAGR reflects real buyback/dilution, not split artifacts.
    # hist_price is already split-adjusted by yfinance (auto_adjust=True).
    # EPS is NOT adjusted here — pe_ratio uses net_income/shares instead (see below),
    # which is always consistent regardless of EPS split-adjustment status in the source data.
    try:
        splits = ticker.splits
        if splits is not None and not splits.empty:
            splits.index = (splits.index.tz_localize(None)
                            if splits.index.tz is not None else splits.index)
            for entry in income:
                date_ts = pd.Timestamp(entry["date"])
                future = splits[splits.index > date_ts]
                if future.empty:
                    continue
                factor = 1.0
                for ratio in future:
                    factor *= float(ratio)
                if factor == 1.0:
                    continue
                shs = entry.get("weightedAverageShsOut")
                if shs is not None:
                    entry["weightedAverageShsOut"] = clean(shs * factor)
    except Exception:
        pass

    # ── Price history (explicit start avoids period="max" monthly cap in yfinance) ─
    # auto_adjust=True (default): split-adjusted prices match split-adjusted shares.
    price_history = {}
    try:
        hist = ticker.history(start="2000-01-01", interval="1mo")
        if hist is not None and not hist.empty:
            # Normalize timezone: convert to UTC first, then strip tz
            if hist.index.tz is not None:
                hist.index = hist.index.tz_convert("UTC").tz_localize(None)
            close_col = "Close" if "Close" in hist.columns else (
                        "Adj Close" if "Adj Close" in hist.columns else None)
            if close_col:
                for entry in income:
                    date_ts = pd.Timestamp(entry["date"])
                    past = hist[hist.index <= date_ts]
                    if not past.empty:
                        val = past.iloc[-1][close_col]
                        if pd.notna(val):
                            price_history[entry["date"]] = float(val)
    except Exception:
        pass

    # ── Metrics from merged lists (covers all years including AV history) ────
    metrics = []
    for item in income:
        date_str   = item["date"]
        bal_row    = get_for_year(balance,  date_str)
        cf_row     = get_for_year(cashflow, date_str)
        net_income = item.get("netIncome")
        equity     = bal_row.get("totalStockholdersEquity")
        total_debt = bal_row.get("totalDebt")
        net_debt   = bal_row.get("netDebt")
        revenue    = item.get("revenue")
        ebitda     = item.get("ebitda")
        shares     = item.get("weightedAverageShsOut")
        fcf_val    = cf_row.get("freeCashFlow")
        hist_price = price_history.get(date_str)

        roe  = clean(net_income / equity) if net_income and equity and equity > 0 else None
        roic = None
        if net_income is not None and equity is not None and net_debt is not None:
            invested = equity + net_debt
            roic = clean(net_income / invested) if invested > 0 else None

        # Use net_income/shares (same pattern as P/FCF, P/Book) so P/E is always
        # split-consistent: net_income is a total (unaffected by splits), shares is
        # split-adjusted above. Avoids ambiguity of whether eps field is already adjusted.
        pe_ratio       = clean(hist_price / (net_income / shares))  if hist_price and net_income and net_income > 0 and shares and shares > 0 else None
        price_to_sales = clean(hist_price / (revenue / shares))    if hist_price and revenue  and shares   and shares > 0                 else None
        price_to_book  = clean(hist_price / (equity  / shares))    if hist_price and equity   and equity   > 0 and shares and shares > 0  else None
        mc             = clean(hist_price * shares)                 if hist_price and shares                                               else None
        ev_to_ebitda   = clean((hist_price * shares + net_debt) / ebitda) \
                         if hist_price and shares and net_debt is not None and ebitda and ebitda > 0 else None
        pfcf_ratio     = clean(hist_price / (fcf_val / shares)) \
                         if hist_price and fcf_val and fcf_val > 0 and shares and shares > 0 else None

        op_income  = item.get("operatingIncome")
        op_cf      = cf_row.get("operatingCashFlow")
        da_val     = cf_row.get("depreciationAndAmortization")
        owner_earn = (op_cf - da_val) if op_cf is not None and da_val is not None else None

        price_to_ebit = clean(hist_price / (op_income / shares)) \
                        if hist_price and op_income and op_income > 0 and shares and shares > 0 else None
        price_to_ebitda = clean(hist_price / (ebitda / shares)) \
                          if hist_price and ebitda and ebitda > 0 and shares and shares > 0 else None
        price_to_ocf = clean(hist_price / (op_cf / shares)) \
                       if hist_price and op_cf and op_cf > 0 and shares and shares > 0 else None
        price_to_oe  = clean(hist_price / (owner_earn / shares)) \
                       if hist_price and owner_earn and owner_earn > 0 and shares and shares > 0 else None

        metrics.append({
            "date":                 date_str,
            "roic":                 roic,
            "roe":                  roe,
            "peRatio":              pe_ratio,
            "pfcfRatio":            pfcf_ratio,
            "priceToSales":         price_to_sales,
            "priceToBook":          price_to_book,
            "evToEbitda":           ev_to_ebitda,
            "marketCap":            mc,
            "priceToEbit":          price_to_ebit,
            "priceToEbitda":        price_to_ebitda,
            "priceToOcf":           price_to_ocf,
            "priceToOwnerEarnings": price_to_oe,
        })
    metrics.sort(key=lambda x: x["date"], reverse=True)

    # ── Ratios from merged lists ──────────────────────────────────────────────
    ratios = []
    for item in income:
        date_str   = item["date"]
        bal_row    = get_for_year(balance,  date_str)
        cf_row     = get_for_year(cashflow, date_str)
        net_income = item.get("netIncome")
        divs_paid  = cf_row.get("dividendsPaid")
        equity     = bal_row.get("totalStockholdersEquity")
        total_debt = bal_row.get("totalDebt")

        payout_ratio   = clean(abs(divs_paid) / net_income) if divs_paid is not None and net_income and net_income > 0 else None
        debt_to_equity = clean(total_debt / equity)         if total_debt is not None and equity and equity > 0        else None

        ratios.append({
            "date":          date_str,
            "payoutRatio":   payout_ratio,
            "debtToEquity":  debt_to_equity,
        })
    ratios.sort(key=lambda x: x["date"], reverse=True)

    # ── Analyst estimates ────────────────────────────────────────────────────
    estimates = []
    try:
        eps_est = ticker.earnings_estimate
        rev_est = ticker.revenue_estimate
        current_year = datetime.datetime.now().year

        if eps_est is not None and not eps_est.empty:
            annual = [idx for idx in eps_est.index if str(idx).endswith("y") or str(idx)[0].isdigit()]
            # Prefer rows containing 'y' (0y = current year, +1y = next year, etc.)
            annual_rows = [idx for idx in eps_est.index if "y" in str(idx)]
            for i, period in enumerate(annual_rows):
                year = current_year + i
                date_str = f"{year}-12-31"
                eps_avg = None
                rev_avg = None
                if "avg" in eps_est.columns:
                    eps_avg = clean(float(eps_est.loc[period, "avg"])) if pd.notna(eps_est.loc[period, "avg"]) else None
                if rev_est is not None and period in rev_est.index and "avg" in rev_est.columns:
                    rev_avg = clean(float(rev_est.loc[period, "avg"])) if pd.notna(rev_est.loc[period, "avg"]) else None
                estimates.append({
                    "date":                 date_str,
                    "estimatedEpsAvg":      eps_avg,
                    "estimatedRevenueAvg":  rev_avg,
                })
    except Exception:
        pass

    # ── Dividends ────────────────────────────────────────────────────────────
    dividends_hist = []
    try:
        divs = ticker.dividends
        if divs is not None and not divs.empty:
            for date, amount in divs.items():
                date_str = date.strftime("%Y-%m-%d") if hasattr(date, "strftime") else str(date)[:10]
                dividends_hist.append({"date": date_str, "dividend": clean(float(amount))})
            dividends_hist.sort(key=lambda x: x["date"], reverse=True)
    except Exception:
        pass

    # ── FMP — analyst estimates + price target ────────────────────────────────
    price_target = None
    if FMP_KEY:
        try:
            fmp_est = fmp_estimates(symbol)
            if fmp_est:
                # FMP estimates take priority over yfinance estimates
                estimates = fmp_est
        except Exception:
            pass
        try:
            price_target = fmp_price_target(symbol)
        except Exception:
            pass

    # ── yfinance — analyst recommendations summary ────────────────────────────
    analyst_rating = None
    try:
        rec_summary = ticker.recommendations_summary
        if rec_summary is not None and not rec_summary.empty:
            row = rec_summary[rec_summary["period"] == "0m"]
            if row.empty:
                row = rec_summary.iloc[[0]]
            if not row.empty:
                r = row.iloc[0]
                total = int(r.get("strongBuy", 0) + r.get("buy", 0) +
                            r.get("hold", 0) + r.get("sell", 0) + r.get("strongSell", 0))
                if total > 0:
                    analyst_rating = {
                        "strongBuy":  int(r.get("strongBuy", 0)),
                        "buy":        int(r.get("buy", 0)),
                        "hold":       int(r.get("hold", 0)),
                        "sell":       int(r.get("sell", 0)),
                        "strongSell": int(r.get("strongSell", 0)),
                        "total":      total,
                    }
    except Exception:
        pass

    # ── TTM (Trailing Twelve Months) from quarterly statements ──────────────────
    ttm = {}
    try:
        q_inc = ticker.quarterly_income_stmt
        q_cf  = ticker.quarterly_cash_flow
        q_bal = ticker.quarterly_balance_sheet

        def _q_sum(df, *row_keys):
            for key in row_keys:
                if key in df.index:
                    vals_q = []
                    for c in df.columns[:4]:
                        v = df.loc[key, c]
                        if pd.notna(v):
                            vals_q.append(float(v))
                    if vals_q:
                        return sum(vals_q)
            return None

        def _q_last(df, *row_keys):
            for key in row_keys:
                if key in df.index and len(df.columns) > 0:
                    v = df.loc[key, df.columns[0]]
                    if pd.notna(v):
                        return float(v)
            return None

        t_rev  = _q_sum(q_inc, "Total Revenue", "Revenue")
        t_ni   = _q_sum(q_inc, "Net Income", "Net Income Common Stockholders",
                                "Net Income Applicable To Common Shares")
        t_ebit = _q_sum(q_inc, "EBITDA", "Normalized EBITDA")
        t_oi   = _q_sum(q_inc, "Operating Income", "Total Operating Income As Reported", "EBIT")
        t_shs  = _q_last(q_inc, "Basic Average Shares", "Diluted Average Shares",
                                 "Weighted Average Diluted Shares Outstanding",
                                 "Weighted Average Shares")
        t_ocf  = _q_sum(q_cf, "Operating Cash Flow",
                               "Cash Flow From Continuing Operating Activities")
        t_fcf  = _q_sum(q_cf, "Free Cash Flow")
        t_cap  = _q_sum(q_cf, "Capital Expenditure")
        t_da   = _q_sum(q_cf, "Depreciation And Amortization", "Reconciled Depreciation",
                               "Depreciation Amortization Depletion", "Depreciation")
        t_div  = _q_sum(q_cf, "Common Stock Dividend Paid", "Cash Dividends Paid",
                               "Payment Of Dividends", "Dividends Paid",
                               "Cash Dividends Paid Common Stock")
        if t_fcf is None and t_ocf is not None and t_cap is not None:
            t_fcf = t_ocf + t_cap  # capex is negative outflow in yfinance
        t_eq   = _q_last(q_bal, "Stockholders Equity", "Total Equity Gross Minority Interest",
                                 "Common Stock Equity", "Total Stockholders Equity")
        t_debt = _q_last(q_bal, "Total Debt", "Long Term Debt And Capital Lease Obligation",
                                 "Long Term Debt", "Total Long Term Debt")
        t_cash = _q_last(q_bal, "Cash And Cash Equivalents",
                                 "Cash Cash Equivalents And Short Term Investments",
                                 "Cash And Short Term Investments")
        t_nd   = (t_debt - t_cash) if t_debt is not None and t_cash is not None else None
        t_eps  = clean(t_ni / t_shs) if t_ni is not None and t_shs and t_shs > 0 else None
        t_dps  = clean(abs(t_div) / t_shs) if t_div is not None and t_shs and t_shs > 0 else None
        ttm = {
            "revenue":                     clean(t_rev),
            "netIncome":                   clean(t_ni),
            "ebitda":                      clean(t_ebit),
            "operatingIncome":             clean(t_oi),
            "eps":                         t_eps,
            "weightedAverageShsOut":       clean(t_shs),
            "operatingCashFlow":           clean(t_ocf),
            "freeCashFlow":                clean(t_fcf),
            "capitalExpenditure":          clean(t_cap),
            "depreciationAndAmortization": clean(t_da),
            "dividendsPaid":               clean(t_div),
            "dividendPerShare":            t_dps,
            "totalStockholdersEquity":     clean(t_eq),
            "totalDebt":                   clean(t_debt),
            "netDebt":                     clean(t_nd),
        }
    except Exception:
        ttm = {}

    return jsonify({
        "quote":         quote,
        "profile":       profile,
        "income":        income,
        "balance":       balance,
        "cashflow":      cashflow,
        "metrics":       metrics,
        "ratios":        ratios,
        "estimates":     estimates,
        "ttm":           ttm,
        "dividends":     {"historical": dividends_hist},
        "_dataYears":       len(income),
        "_avYears":         av_years,
        "_fromCache":       av_cache_valid(av_cache),
        "_avErrors":        dict(_av_last_error),
        "_priceHistYears":  len(price_history),
        "_priceHistRange":  [min(price_history.keys()), max(price_history.keys())] if price_history else [],
        "_incomeYears":     [r["date"][:4] for r in income],
        "_missingPrice":    [r["date"][:4] for r in income if r["date"] not in price_history],
        "_missingShares":   [r["date"][:4] for r in income
                            if r.get("weightedAverageShsOut") is None
                            and get_for_year(balance, r["date"]).get("sharesOutstanding") is None],
        "priceTarget":   price_target,
        "analystRating": analyst_rating,
    })


@app.route("/api/debug/<symbol>")
def debug_rows(symbol):
    """Returns raw yfinance row names — useful to diagnose missing fields."""
    symbol = symbol.upper()
    ticker = yf.Ticker(symbol)
    result = {}
    try:
        result["income_rows"]  = list(ticker.income_stmt.index)
    except Exception as e:
        result["income_rows"] = str(e)
    try:
        result["balance_rows"] = list(ticker.balance_sheet.index)
    except Exception as e:
        result["balance_rows"] = str(e)
    try:
        result["cashflow_rows"] = list(ticker.cash_flow.index)
    except Exception as e:
        result["cashflow_rows"] = str(e)
    return jsonify(result)


@app.route("/api/analyze/<symbol>/<analysis_type>", methods=["POST"])
def analyze_stock(symbol, analysis_type):
    if not ANTHROPIC_KEY or not TAVILY_KEY:
        return jsonify({"error": "ANTHROPIC_API_KEY ou TAVILY_API_KEY manquant dans .env"}), 400
    if analysis_type not in ("moat", "management", "business", "guidance"):
        return jsonify({"error": "Type invalide"}), 400

    data        = request.get_json() or {}
    company     = data.get("companyName", symbol)
    sector      = data.get("sector", "")
    industry    = data.get("industry", "")
    fin_summary = data.get("financialSummary", {})

    # ── Tavily web search ─────────────────────────────────────────────────────
    tavily = _TavilyClient(api_key=TAVILY_KEY)

    if analysis_type == "business":
        queries = [
            f"{company} business model revenue streams how does it make money segments 2024",
            f"{company} products services key offerings market share customers 2024 2025",
            f"{company} competitors competitive landscape market position risks threats",
            f"{company} risks weaknesses red flags concerns investors 2024 2025",
        ]
    elif analysis_type == "moat":
        queries = [
            f"{company} market share dominance specific products revenue breakdown 2024",
            f"{company} pricing power customer retention switching costs concrete examples",
            f"{company} competitive advantages vs {industry} competitors barriers to entry data",
            f"{company} brand value patents licenses monopoly position numbers",
        ]
    elif analysis_type == "guidance":
        queries = [
            f"{company} quarterly results earnings guidance 2025 2026 outlook revenue growth",
            f"{company} earnings call management guidance forecast revenue profit 2025 2026",
            f"{company} analyst consensus EPS revenue growth estimate 2026 price target",
        ]
    else:
        queries = [
            f"{company} CEO specific decisions acquisitions strategy results 2023 2024 2025",
            f"{company} share buybacks amount timing debt reduction capital allocation facts",
            f"{company} CEO shareholder letter 2024 failures mistakes transparency",
            f"{company} executive compensation structure performance metrics R&D investment",
        ]

    search_context = ""
    sources = []
    for q in queries:
        try:
            r = tavily.search(query=q, search_depth="advanced", max_results=4)
            for item in r.get("results", []):
                title   = item.get("title", "")
                content = item.get("content", "")[:600]
                url     = item.get("url", "")
                search_context += f"\n---\n{title}\n{content}\n"
                if url:
                    sources.append({"title": title, "url": url})
        except Exception:
            pass

    # ── Build financial context string ────────────────────────────────────────
    fin_ctx = ""
    if fin_summary:
        roic      = fin_summary.get("roicAvg")
        margin    = fin_summary.get("netMarginAvg")
        rev_cagr  = fin_summary.get("revenueCagr")
        roe       = fin_summary.get("roeAvg")
        debt_ebit = fin_summary.get("debtToEbitdaAvg")
        fin_ctx = f"""
Données financières (moyennes 5-10 ans) :
- ROIC moyen : {f"{roic*100:.1f}%" if roic is not None else "N/A"}
- ROE moyen : {f"{roe*100:.1f}%" if roe is not None else "N/A"}
- Marge nette moyenne : {f"{margin*100:.1f}%" if margin is not None else "N/A"}
- Croissance CA annualisée : {f"{rev_cagr*100:.1f}%" if rev_cagr is not None else "N/A"}
- Dette nette / EBITDA moyen : {f"{debt_ebit:.1f}x" if debt_ebit is not None else "N/A"}
"""

    # ── Build Claude prompt ───────────────────────────────────────────────────
    if analysis_type == "business":
        system = """Tu es un analyste financier senior spécialisé en analyse fondamentale d'entreprises pour des investisseurs particuliers.
Ta méthode : chaque affirmation doit être étayée par des faits précis — noms de produits, chiffres, parts de marché, événements datés, concurrents nommés.
Une analyse générique sans exemple concret est inacceptable.
Tu réponds en texte brut structuré avec des balises de section exactement comme demandé, sans aucun texte avant ou après les balises."""

        user_prompt = f"""Analyse en profondeur l'entreprise {company} ({sector} — {industry}) pour un investisseur qui envisage d'y investir.

{fin_ctx}

INFORMATIONS RÉCENTES TROUVÉES SUR LE WEB :
{search_context[:5000]}

RÈGLE DE QUALITÉ : chaque section doit contenir des faits précis et vérifiables — noms de produits/segments, chiffres de revenus, parts de marché, concurrents nommés, événements datés. Zéro affirmation vague.

RÈGLE DE FORMAT : écris comme un analyste senior. Mélange prose et bullet points selon ce qui sert le mieux l'analyse :
- Prose pour le contexte, les dynamiques, les nuances
- Bullet points (•) pour les listes énumérables (segments, concurrents, risques)
- Sépare les paragraphes par une ligne vide

Génère exactement ces 7 sections dans cet ordre, en utilisant les délimiteurs indiqués :

===BEGIN:overview===
Vue d'ensemble : 1-2 phrases de contexte, puis bullets sur fondation/taille CA/capitalisation/géographie/position de marché
===END:overview===

===BEGIN:model===
Modèle économique : prose sur comment l'entreprise crée de la valeur, puis bullets par segment (% du CA, type récurrent/transactionnel, marges)
===END:model===

===BEGIN:products===
Produits & services clés : 1-2 phrases sur le cœur de l'offre, puis bullets par produit/service avec chiffres
===END:products===

===BEGIN:competition===
Position concurrentielle : paragraphe sur la dynamique compétitive, puis bullets concurrents nommés avec comparaison chiffrée, puis avantages/désavantages structurels
===END:competition===

===BEGIN:risks===
Risques principaux : bullets par risque distinct (min. 4), chaque bullet développé en 2-3 phrases avec mécanisme, probabilité/impact, signaux
===END:risks===

===BEGIN:weaknesses===
Points faibles & alertes : prose analytique sur les vulnérabilités structurelles, puis bullets sur signaux d'alerte concrets
===END:weaknesses===

===BEGIN:verdict===
Trois blocs obligatoires séparés par une ligne vide :
BULL CASE :
• argument1 développé en 2-3 phrases
• argument2 développé en 2-3 phrases

BEAR CASE :
• risque1 développé en 2-3 phrases
• risque2 développé en 2-3 phrases

À SURVEILLER :
• métrique ou événement à suivre
• métrique ou événement à suivre
===END:verdict===

Écris UNIQUEMENT le contenu entre les balises, sans aucun texte avant ou après."""

    elif analysis_type == "moat":
        system = """Tu es un analyste financier senior spécialisé en analyse fondamentale, style Morningstar Economic Moat Rating.
Ta méthode : tu ne fais JAMAIS d'affirmations génériques. Chaque point d'analyse doit être étayé par :
- Des noms de produits ou services spécifiques (ex: Azure, Office 365, Xbox Game Pass)
- Des chiffres précis (part de marché %, revenus par segment, taux de rétention, prix vs concurrents)
- Des événements datés (lancement produit, acquisition, décision stratégique avec année)
- Des comparaisons directes avec des concurrents nommés

Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans texte avant ou après.
RÈGLES JSON STRICTES : (1) N'utilise JAMAIS le caractère guillemet anglais (") à l'intérieur des valeurs de string — utilise des guillemets français (« ») ou des apostrophes (') à la place. (2) N'utilise JAMAIS de saut de ligne littéral dans une valeur de string — utilise \\n. (3) Le JSON doit être parseable directement par json.loads() Python."""

        user_prompt = f"""Analyse le MOAT (avantage concurrentiel durable) de {company} ({sector} — {industry}).

{fin_ctx}

INFORMATIONS RÉCENTES TROUVÉES SUR LE WEB :
{search_context[:4500]}

RÈGLE ABSOLUE : chaque "analysis" doit contenir des faits précis — noms de produits, chiffres, événements datés, concurrents nommés. Une analyse générique sans exemple concret est inacceptable.

Exemples de ce qui est attendu :
- BIEN : "Azure représente ~29% du marché cloud mondial (vs AWS 31%), avec une croissance de 29% au T4 2024. Les 95% des entreprises Fortune 500 utilisent Azure, créant des coûts de migration estimés à plusieurs années de travail IT."
- MAL : "L'entreprise a une forte position sur le marché cloud avec des avantages compétitifs."

Évalue chacune des 5 catégories de MOAT sur une échelle 0-3 :
- 0 = Absent : aucune barrière identifiable dans cette catégorie
- 1 = Faible : avantage marginal, facilement contournable
- 2 = Modéré : avantage réel mais sous pression concurrentielle
- 3 = Fort : barrière structurelle durable, très difficile à répliquer

Catégories :
- intangibles : Marque avec pricing power démontré (hausses de prix acceptées), brevets clés, licences monopolistiques
- switching : Coûts de migration concrets (temps, argent, risque) qui emprisonnent les clients
- network : Effet réseau mesurable — la valeur augmente avec chaque nouvel utilisateur/partenaire
- cost : Avantage de coût structurel (échelle, accès matières premières, distribution) vs concurrents nommés
- scale : Marché de niche où un seul acteur rentable peut exister (infrastructure, concession, monopole régional)

Réponds avec ce JSON exact (analysis = 3-5 phrases avec faits précis) :
{{
  "summary": "Synthèse en 3-4 phrases avec les 2-3 moats principaux identifiés et leur force relative, avec chiffres clés",
  "categories": {{
    "intangibles": {{"score": 0, "analysis": "3-5 phrases avec noms de produits, chiffres de pricing power, parts de marché"}},
    "switching":   {{"score": 0, "analysis": "3-5 phrases avec exemples concrets de coûts de migration, taux de rétention, lock-in"}},
    "network":     {{"score": 0, "analysis": "3-5 phrases avec nombre d'utilisateurs, effet réseau mesuré, plateformes nommées"}},
    "cost":        {{"score": 0, "analysis": "3-5 phrases avec marges vs concurrents nommés, économies d'échelle chiffrées"}},
    "scale":       {{"score": 0, "analysis": "3-5 phrases avec taille du marché, position dominante, barrières à l'entrée chiffrées"}}
  }},
  "sources": ["Titre source 1", "Titre source 2"]
}}"""

    elif analysis_type == "guidance":
        # ── Fetch TTM from yfinance quarterly statements ───────────────────────
        ttm_data = {}
        try:
            ticker_yf = yf.Ticker(symbol)
            q_inc = ticker_yf.quarterly_income_stmt
            q_cf  = ticker_yf.quarterly_cash_flow

            def _ttm(df, *row_keys):
                for key in row_keys:
                    if key in df.index:
                        vals = []
                        for c in df.columns[:4]:
                            v = df.loc[key, c]
                            if pd.notna(v):
                                vals.append(float(v))
                        if vals:
                            return sum(vals)
                return None

            ttm_revenue = _ttm(q_inc, "Total Revenue", "Revenue")
            ttm_ni      = _ttm(q_inc, "Net Income", "Net Income Common Stockholders")
            ttm_ocf     = _ttm(q_cf,  "Operating Cash Flow", "Cash Flow From Continuing Operating Activities")
            ttm_capex   = _ttm(q_cf,  "Capital Expenditure")
            ttm_fcf_raw = _ttm(q_cf,  "Free Cash Flow")
            ttm_fcf = ttm_fcf_raw if ttm_fcf_raw is not None else (
                (ttm_ocf + ttm_capex) if ttm_ocf is not None and ttm_capex is not None else None
            )
            ttm_data = {
                "revenue":   clean(ttm_revenue),
                "netIncome": clean(ttm_ni),
                "fcf":       clean(ttm_fcf),
            }
        except Exception:
            ttm_data = {}

        hist_revenue = data.get("historicalRevenue", [])
        hist_ni      = data.get("historicalNI", [])
        hist_fcf     = data.get("historicalFCF", [])
        dcf_params   = data.get("dcfParams", {})
        estimates    = data.get("analystEstimates", [])

        def fmt_bn(v):
            if v is None: return "N/A"
            abs_v = abs(v)
            if abs_v >= 1e12: return f"${v/1e12:.2f}T"
            if abs_v >= 1e9:  return f"${v/1e9:.1f}B"
            return f"${v/1e6:.0f}M"

        def pct_chg(new_v, old_v):
            if new_v is None or old_v is None or old_v == 0: return "N/A"
            return f"{(new_v/old_v - 1)*100:+.1f}%"

        hist_ctx = ""
        if hist_revenue:
            hist_ctx += "Revenus annuels :\n"
            for r in hist_revenue:
                hist_ctx += f"  {r['year']}: {fmt_bn(r['value'])}\n"
        if hist_ni:
            hist_ctx += "\nBénéfice net annuel :\n"
            for r in hist_ni:
                hist_ctx += f"  {r['year']}: {fmt_bn(r['value'])}\n"
        if hist_fcf:
            hist_ctx += "\nFree Cash Flow annuel :\n"
            for r in hist_fcf:
                hist_ctx += f"  {r['year']}: {fmt_bn(r['value'])}\n"

        last_rev = hist_revenue[-1]["value"] if hist_revenue else None
        last_ni  = hist_ni[-1]["value"]      if hist_ni      else None
        last_fcf = hist_fcf[-1]["value"]     if hist_fcf     else None

        ttm_ctx = (
            f"TTM vs dernière année complète :\n"
            f"  Revenu : {fmt_bn(ttm_data.get('revenue'))} vs {fmt_bn(last_rev)} ({pct_chg(ttm_data.get('revenue'), last_rev)})\n"
            f"  Bénéfice net : {fmt_bn(ttm_data.get('netIncome'))} vs {fmt_bn(last_ni)} ({pct_chg(ttm_data.get('netIncome'), last_ni)})\n"
            f"  FCF : {fmt_bn(ttm_data.get('fcf'))} vs {fmt_bn(last_fcf)} ({pct_chg(ttm_data.get('fcf'), last_fcf)})"
        )

        est_ctx = ""
        if estimates:
            est_ctx = "\nEstimations analystes :\n"
            for e in estimates[:3]:
                yr  = str(e.get("date", ""))[:4]
                eps = e.get("estimatedEpsAvg")
                rev = e.get("estimatedRevenueAvg")
                est_ctx += f"  {yr}: EPS estimé = {f'${eps:.2f}' if eps else 'N/A'}, CA estimé = {fmt_bn(rev)}\n"

        dcf_ctx = ""
        if dcf_params:
            gr = dcf_params.get("growthRate")
            ml = dcf_params.get("multiple")
            sc = dcf_params.get("shareChange")
            dcf_ctx = (
                f"\nParamètres DCF actuels de l'investisseur :\n"
                f"  Taux de croissance FCF : {f'{gr*100:.1f}%' if gr is not None else 'N/A'}\n"
                f"  Multiple de sortie : {f'{ml:.0f}x' if ml is not None else 'N/A'}\n"
                f"  Variation actions/an : {f'{sc*100:.1f}%' if sc is not None else 'N/A'}\n"
            )

        system = """Tu es un analyste financier expert en évaluation de titres boursiers.
Tu analyses les résultats trimestriels et les guidances pour aider un investisseur à réviser ses hypothèses DCF.
Ta méthode : chiffres précis, faits vérifiables, aucune généralité vague.
Tu réponds en texte brut avec les délimiteurs de section demandés, sans texte en dehors des balises."""

        user_prompt = f"""Analyse la situation financière récente de {company} ({sector} — {industry}) pour révision de modèle DCF.

DONNÉES HISTORIQUES (5 dernières années) :
{hist_ctx}

{ttm_ctx}
{est_ctx}
{dcf_ctx}

INFORMATIONS RÉCENTES (résultats, guidance, analystes) :
{search_context[:5000]}

Génère exactement ces 4 sections texte + 1 section JSON :

===BEGIN:ttm===
TTM vs dernière année complète : commente les 3 métriques (CA, BN, FCF). Trajectoire (accélération/ralentissement). Qualité du FCF vs bénéfice comptable. Signaux à surveiller.
===END:ttm===

===BEGIN:historique===
Tendance 5 ans : CAGR du CA, BN et FCF avec chiffres. Qualité et régularité de la croissance. Tirée par volumes, prix ou marges ? Points positifs et points d'attention.
===END:historique===

===BEGIN:guidance===
Ce que le management a annoncé pour les 12-18 prochains mois. Consensus analystes (EPS, CA). Comparaison vs historique. La guidance est-elle conservatrice ou agressive ? One-offs annoncés.
===END:guidance===

===BEGIN:verdict===
Les hypothèses DCF actuelles sont-elles justifiées ? Révision à la hausse ou à la baisse ? Explique avec des chiffres précis. Mentionne les risques principaux sur les hypothèses.
===END:verdict===

===BEGIN:dcf_params===
{{"growthRate": 0.00, "multiple": 0, "shareChange": 0.00, "confidence": "medium", "reasoning": "Justification courte avec chiffres clés."}}
===END:dcf_params===

RÈGLES pour dcf_params :
- growthRate : taux de croissance annuel FCF suggéré (ex: 0.08 pour 8%)
- multiple : multiple de sortie EV/FCF suggéré (ex: 25)
- shareChange : variation annuelle du nombre d'actions (ex: -0.02 pour rachat de 2%/an)
- confidence : "high" (données solides), "medium" (quelques incertitudes), "low" (forte incertitude)
- reasoning : 1-2 phrases avec les chiffres clés qui justifient ces valeurs

Écris UNIQUEMENT le contenu entre les balises, sans aucun texte avant ou après."""

    else:  # management
        system = """Tu es un analyste financier senior spécialisé en évaluation de la qualité des équipes dirigeantes.
Ta méthode : tu analyses les ACTES, pas les discours. Chaque point doit être étayé par :
- Des décisions spécifiques avec leur nom, date et résultat mesuré (ex: acquisition Activision 2023, $68.7Md)
- Des chiffres précis (montant des rachats, évolution de la dette, % de la rémunération en actions)
- Des citations ou positions publiques du PDG/CFO avec date si disponibles
- Des exemples de réussites ET d'erreurs — un dirigeant transparent parle des deux

Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans texte avant ou après.
RÈGLES JSON STRICTES : (1) N'utilise JAMAIS le caractère guillemet anglais (") à l'intérieur des valeurs de string — utilise des guillemets français (« ») ou des apostrophes (') à la place. (2) N'utilise JAMAIS de saut de ligne littéral dans une valeur de string — utilise \\n. (3) Le JSON doit être parseable directement par json.loads() Python."""

        user_prompt = f"""Analyse la qualité du management de {company} ({sector} — {industry}).

{fin_ctx}

INFORMATIONS RÉCENTES TROUVÉES SUR LE WEB :
{search_context[:4500]}

RÈGLE ABSOLUE : chaque "analysis" doit contenir des faits précis — noms des dirigeants, décisions datées, montants, résultats mesurés. Une analyse générique est inacceptable.

Exemples de ce qui est attendu :
- BIEN : "Satya Nadella a pivoté Microsoft vers le cloud en 2014, abandonnant 'Windows first'. Azure est passé de 0 à ~$110Md de revenus annuels en 10 ans. La décision de couper les divisions non-rentables (Nokia, 2016) a libéré $7.5Md de capital."
- MAL : "Le management a une bonne vision long terme et prend des décisions éclairées."

Évalue chacun des 6 critères sur une échelle 0-3 :
- 0 = Red flag : comportement préoccupant avec preuves concrètes
- 1 = Passable : correct mais sans conviction, quelques signaux négatifs
- 2 = Bon : solide, cohérent, peu d'erreurs majeures
- 3 = Excellent : exemplaire, actes alignés avec les intérêts des actionnaires, transparent

Critères :
- coherence : Les objectifs annoncés sont-ils atteints ? Les guidances respectées ? Cite des exemples précis.
- discipline : Acquisitions créatrices de valeur (nommées), niveau de dette maîtrisé (chiffres), pas de diversification vaniteuse
- vision : Décisions de repositionnement stratégique (nommées et datées), investissement R&D en % du CA, sacrifices CT assumés
- alignment : Structure de rémunération (% cash vs actions, métriques de performance), actionnariat des dirigeants, dilution
- transparency : La lettre aux actionnaires reconnaît-elle des échecs par leur nom ? Métriques cohérentes d'une année à l'autre ?
- buybacks : Montants rachetés, timing (cours moyen d'achat vs cours actuel), impact sur le nombre d'actions sur 5 ans

Réponds avec ce JSON exact (analysis = 3-5 phrases avec faits précis, noms, dates, chiffres) :
{{
  "summary": "Synthèse en 3-4 phrases sur la qualité globale du management avec les décisions clés et leur impact mesurable",
  "criteria": {{
    "coherence":    {{"score": 0, "analysis": "3-5 phrases avec exemples de guidances tenues ou ratées, décisions et résultats"}},
    "discipline":   {{"score": 0, "analysis": "3-5 phrases avec noms d'acquisitions, montants, résultats, évolution de la dette"}},
    "vision":       {{"score": 0, "analysis": "3-5 phrases avec pivots stratégiques datés, % R&D, paris long terme nommés"}},
    "alignment":    {{"score": 0, "analysis": "3-5 phrases avec structure de rémunération, actionnariat dirigeants, dilution"}},
    "transparency": {{"score": 0, "analysis": "3-5 phrases avec exemples de reconnaissance d'échecs ou d'opacité constatée"}},
    "buybacks":     {{"score": 0, "analysis": "3-5 phrases avec montants rachetés, prix moyen, évolution du nombre d'actions"}}
  }},
  "sources": ["Titre source 1", "Titre source 2"]
}}"""

    # ── Call Claude ───────────────────────────────────────────────────────────
    client = _anthropic.Anthropic(api_key=ANTHROPIC_KEY)
    msg = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=8000 if analysis_type in ("business", "guidance") else 3000,
        system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )
    raw_text = msg.content[0].text.strip()

    import re as _re

    # ── Business: delimiter-based parsing (immune to JSON escaping issues) ────
    if analysis_type == "business":
        SECTION_META = [
            ("overview",    "Vue d'ensemble"),
            ("model",       "Modèle économique"),
            ("products",    "Produits & services clés"),
            ("competition", "Position concurrentielle"),
            ("risks",       "Risques principaux"),
            ("weaknesses",  "Points faibles & alertes"),
            ("verdict",     "Verdict investisseur"),
        ]
        sections = []
        for idx, (sid, title) in enumerate(SECTION_META):
            pattern = rf"===\s*BEGIN\s*:\s*{sid}\s*===(.*?)===\s*END\s*:\s*{sid}\s*==="
            m = _re.search(pattern, raw_text, _re.DOTALL | _re.IGNORECASE)
            if m:
                content = m.group(1).strip()
            else:
                # Fallback: capture everything after BEGIN tag (last section may lack END if truncated)
                m2 = _re.search(rf"===\s*BEGIN\s*:\s*{sid}\s*===(.*)", raw_text, _re.DOTALL | _re.IGNORECASE)
                content = m2.group(1).strip() if m2 else ""
            sections.append({"id": sid, "title": title, "content": content})
        result = {"sections": sections}

    # ── Guidance: delimiter-based parsing + JSON dcf_params ──────────────────
    elif analysis_type == "guidance":
        SECTION_META = [
            ("ttm",        "TTM vs dernière année"),
            ("historique", "Tendance historique 5 ans"),
            ("guidance",   "Guidance & consensus analystes"),
            ("verdict",    "Verdict & révision DCF"),
        ]
        sections = []
        for sid, title in SECTION_META:
            pattern = rf"===\s*BEGIN\s*:\s*{sid}\s*===(.*?)===\s*END\s*:\s*{sid}\s*==="
            m = _re.search(pattern, raw_text, _re.DOTALL | _re.IGNORECASE)
            if m:
                content = m.group(1).strip()
            else:
                m2 = _re.search(rf"===\s*BEGIN\s*:\s*{sid}\s*===(.*)", raw_text, _re.DOTALL | _re.IGNORECASE)
                content = m2.group(1).strip() if m2 else ""
            sections.append({"id": sid, "title": title, "content": content})

        dcf_suggestions = None
        dcf_match = _re.search(
            r"===\s*BEGIN\s*:\s*dcf_params\s*===(.*?)===\s*END\s*:\s*dcf_params\s*===",
            raw_text, _re.DOTALL | _re.IGNORECASE
        )
        if dcf_match:
            try:
                dcf_suggestions = json.loads(dcf_match.group(1).strip())
            except Exception:
                pass

        result = {"sections": sections, "dcfSuggestions": dcf_suggestions, "ttmData": ttm_data}

    # ── Moat / Management: JSON with control-char fixing ─────────────────────
    else:
        def fix_control_chars(text):
            """Replace literal control chars inside JSON string values."""
            out = []
            in_str = False
            i = 0
            while i < len(text):
                ch = text[i]
                if ch == '\\' and in_str:
                    out.append(ch)
                    i += 1
                    if i < len(text):
                        out.append(text[i])
                        i += 1
                    continue
                if ch == '"':
                    in_str = not in_str
                    out.append(ch)
                elif in_str and ch == '\n':
                    out.append('\\n')
                elif in_str and ch == '\r':
                    out.append('\\r')
                elif in_str and ch == '\t':
                    out.append('\\t')
                elif in_str and ord(ch) < 0x20:
                    out.append(f'\\u{ord(ch):04x}')
                else:
                    out.append(ch)
                i += 1
            return ''.join(out)

        cleaned = _re.sub(r'```(?:json)?\s*', '', raw_text).strip()
        cleaned = fix_control_chars(cleaned)
        try:
            result = json.loads(cleaned)
        except json.JSONDecodeError:
            start = cleaned.find('{')
            end   = cleaned.rfind('}') + 1
            try:
                result = json.loads(cleaned[start:end])
            except json.JSONDecodeError as e:
                return jsonify({"error": f"Réponse IA invalide (JSON malformé) : {e}"}), 500

    result["searchSources"] = sources[:6]
    return jsonify(result)


if __name__ == "__main__":
    app.run(port=5000, debug=True)
