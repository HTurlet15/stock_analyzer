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


def av_fetch(symbol, function):
    """Fetch one AV endpoint. Returns list of annualReports or []."""
    if not AV_KEY:
        return []
    try:
        r = requests.get(
            AV_BASE,
            params={"function": function, "symbol": symbol, "apikey": AV_KEY},
            timeout=12,
        )
        data = r.json()
        if "Note" in data or "Information" in data:
            # Rate limit hit
            return []
        return data.get("annualReports", [])
    except Exception:
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

    # ── Alpha Vantage — primary source; yfinance fills recent gaps ───────────
    if AV_KEY:
        try:
            av_inc = av_income(symbol)
            time.sleep(0.5)
            av_bal = av_balance(symbol)
            time.sleep(0.5)
            av_cf  = av_cashflow(symbol)
            # AV is primary: its data wins; yfinance fills years AV doesn't cover
            income   = merge_data(av_inc,  income)
            balance  = merge_data(av_bal,  balance)
            cashflow = merge_data(av_cf,   cashflow)
        except Exception:
            pass

    # ── Split-adjust weightedAverageShsOut ───────────────────────────────────
    # Normalize all historical share counts to current (post-split) terms so that
    # CAGR reflects real buyback/dilution, not split artifacts.
    # cumulative_factor(date) = product of all split ratios that occurred AFTER that date.
    try:
        splits = ticker.splits
        if splits is not None and not splits.empty:
            splits.index = (splits.index.tz_localize(None)
                            if splits.index.tz is not None else splits.index)
            for entry in income:
                shs = entry.get("weightedAverageShsOut")
                if shs is None:
                    continue
                date_ts = pd.Timestamp(entry["date"])
                future = splits[splits.index > date_ts]
                if future.empty:
                    continue
                factor = 1.0
                for ratio in future:
                    factor *= float(ratio)
                if factor != 1.0:
                    entry["weightedAverageShsOut"] = clean(shs * factor)
    except Exception:
        pass

    # ── Price history (max range to cover AV's 20-year data) ─────────────────
    price_history = {}
    try:
        hist = ticker.history(period="max", interval="1mo", auto_adjust=False)
        if hist is not None and not hist.empty:
            hist.index = hist.index.tz_localize(None) if hist.index.tz is not None else hist.index
            for entry in income:
                date_ts = pd.Timestamp(entry["date"])
                past = hist[hist.index <= date_ts]
                if not past.empty:
                    price_history[entry["date"]] = float(past.iloc[-1]["Close"])
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
        eps_val    = item.get("eps")
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

        pe_ratio       = clean(hist_price / eps_val)               if hist_price and eps_val  and eps_val  > 0                            else None
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

    return jsonify({
        "quote":         quote,
        "profile":       profile,
        "income":        income,
        "balance":       balance,
        "cashflow":      cashflow,
        "metrics":       metrics,
        "ratios":        ratios,
        "estimates":     estimates,
        "dividends":     {"historical": dividends_hist},
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
    if analysis_type not in ("moat", "management", "business"):
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
Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans texte avant ou après."""

        user_prompt = f"""Analyse en profondeur l'entreprise {company} ({sector} — {industry}) pour un investisseur qui envisage d'y investir.

{fin_ctx}

INFORMATIONS RÉCENTES TROUVÉES SUR LE WEB :
{search_context[:5000]}

RÈGLE ABSOLUE : chaque section doit contenir des faits précis — noms de produits/segments, chiffres de revenus, parts de marché, concurrents nommés, événements datés.

Génère une analyse structurée en 7 sections. RÈGLE DE FORMAT : utilise des bullet points (•) et des sauts de ligne (\\n) pour structurer le contenu. Chaque point doit être sur sa propre ligne précédée de "• ".

1. overview : Vue d'ensemble — 1 phrase d'intro, puis bullets : fondation/histoire, taille (CA, capitalisation), marchés principaux, position géographique
2. model : Modèle économique — bullets par segment de revenus avec % du CA si connu, type de revenus (récurrents/transactionnels), marges par segment si dispo
3. products : Produits & services clés — 1 bullet par produit/service majeur avec chiffres (CA segment, part de marché, croissance)
4. competition : Position concurrentielle — 1 bullet par concurrent direct nommé avec comparaison chiffrée, puis 1-2 bullets sur les avantages/désavantages
5. risks : Risques principaux — 1 bullet par risque avec titre en gras implicite (ex: "Risque réglementaire : ..."), minimum 4 risques distincts
6. weaknesses : Points faibles & alertes — 1 bullet par signal d'alerte concret (dépendance, dette, valorisation, décision critiquable)
7. verdict : Structure OBLIGATOIRE en 3 blocs séparés par \\n\\n : "BULL CASE :\\n• point1\\n• point2\\n• point3" puis "BEAR CASE :\\n• point1\\n• point2\\n• point3" puis "À SURVEILLER :\\n• métrique1\\n• métrique2"

Réponds avec ce JSON exact (les \\n dans les strings JSON représentent de vrais sauts de ligne) :
{{
  "sections": [
    {{"id": "overview",     "title": "Vue d'ensemble",           "content": "phrase intro\\n• bullet1\\n• bullet2\\n• bullet3"}},
    {{"id": "model",        "title": "Modèle économique",        "content": "• Segment1 (~X% du CA) : description\\n• Segment2..."}},
    {{"id": "products",     "title": "Produits & services clés", "content": "• Produit1 : description avec chiffres\\n• Produit2..."}},
    {{"id": "competition",  "title": "Position concurrentielle", "content": "• Concurrent1 : comparaison chiffrée\\n• Avantage clé : ..."}},
    {{"id": "risks",        "title": "Risques principaux",       "content": "• Risque réglementaire : description\\n• Risque concurrentiel : ..."}},
    {{"id": "weaknesses",   "title": "Points faibles & alertes", "content": "• Signal1 : description\\n• Signal2 : ..."}},
    {{"id": "verdict",      "title": "Verdict investisseur",     "content": "BULL CASE :\\n• point1\\n• point2\\n\\nBEAR CASE :\\n• point1\\n• point2\\n\\nÀ SURVEILLER :\\n• métrique1\\n• métrique2"}}
  ]
}}"""

    elif analysis_type == "moat":
        system = """Tu es un analyste financier senior spécialisé en analyse fondamentale, style Morningstar Economic Moat Rating.
Ta méthode : tu ne fais JAMAIS d'affirmations génériques. Chaque point d'analyse doit être étayé par :
- Des noms de produits ou services spécifiques (ex: Azure, Office 365, Xbox Game Pass)
- Des chiffres précis (part de marché %, revenus par segment, taux de rétention, prix vs concurrents)
- Des événements datés (lancement produit, acquisition, décision stratégique avec année)
- Des comparaisons directes avec des concurrents nommés

Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans texte avant ou après."""

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

    else:  # management
        system = """Tu es un analyste financier senior spécialisé en évaluation de la qualité des équipes dirigeantes.
Ta méthode : tu analyses les ACTES, pas les discours. Chaque point doit être étayé par :
- Des décisions spécifiques avec leur nom, date et résultat mesuré (ex: acquisition Activision 2023, $68.7Md)
- Des chiffres précis (montant des rachats, évolution de la dette, % de la rémunération en actions)
- Des citations ou positions publiques du PDG/CFO avec date si disponibles
- Des exemples de réussites ET d'erreurs — un dirigeant transparent parle des deux

Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans texte avant ou après."""

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
        max_tokens=4000 if analysis_type == "business" else 3000,
        system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )
    raw_text = msg.content[0].text.strip()

    # ── Robust JSON extraction ────────────────────────────────────────────────
    import re as _re

    def fix_json_strings(text):
        """Replace literal control chars inside JSON string values with escape sequences.
        Claude sometimes emits real newlines/tabs inside strings instead of \\n/\\t."""
        out = []
        in_str = False
        skip = False
        for ch in text:
            if skip:
                out.append(ch)
                skip = False
            elif ch == "\\" and in_str:
                out.append(ch)
                skip = True
            elif ch == '"':
                in_str = not in_str
                out.append(ch)
            elif in_str and ch == "\n":
                out.append("\\n")
            elif in_str and ch == "\r":
                out.append("\\r")
            elif in_str and ch == "\t":
                out.append("\\t")
            else:
                out.append(ch)
        return "".join(out)

    # Strip markdown fences, fix control chars, then parse
    cleaned = _re.sub(r"```(?:json)?\s*", "", raw_text).strip()
    cleaned = fix_json_strings(cleaned)

    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end   = cleaned.rfind("}") + 1
        try:
            result = json.loads(cleaned[start:end])
        except json.JSONDecodeError as e:
            return jsonify({"error": f"Réponse IA invalide (JSON malformé) : {e}"}), 500

    result["searchSources"] = sources[:6]
    return jsonify(result)


if __name__ == "__main__":
    app.run(port=5000, debug=True)
