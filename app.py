import math
import os
import time
import datetime
import requests
import pandas as pd
from flask import Flask, jsonify
from flask_cors import CORS
import yfinance as yf

# ── Alpha Vantage config ──────────────────────────────────────────────────────
AV_KEY  = os.environ.get("AV_API_KEY", "")
AV_BASE = "https://www.alphavantage.co/query"

# ── Financial Modeling Prep config ────────────────────────────────────────────
FMP_KEY  = os.environ.get("REACT_APP_FMP_API_KEY", "") or os.environ.get("FMP_API_KEY", "")
FMP_BASE = "https://financialmodelingprep.com/api/v3"

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
            "eps":                   av_clean(r.get("reportedEPS")) or av_clean(r.get("basicEPS")),
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
        result.append({
            "date":               r.get("fiscalDateEnding", "")[:10],
            "freeCashFlow":       fcf,
            "capitalExpenditure": capex,
            "dividendsPaid":      -abs(divs) if divs is not None else None,
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
    """Merge two annual lists. Primary source wins; secondary fills missing years."""
    if not primary:
        return secondary or []
    if not secondary:
        return primary
    primary_years = {e["date"][:4] for e in primary if e.get("date")}
    extra = [e for e in secondary if e.get("date", "")[:4] not in primary_years]
    merged = primary + extra
    merged.sort(key=lambda x: x.get("date", ""), reverse=True)
    return merged


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
            if fcf_val is None:
                op_cf = get_val(cf, col,
                                "Operating Cash Flow",
                                "Cash Flows From Operations",
                                "Net Cash Provided By Operating Activities",
                                "Total Cash From Operating Activities")
                if op_cf is not None and capex_val is not None:
                    # capex_val is negative in yfinance (cash outflow)
                    fcf_val = clean(op_cf + capex_val)

            cashflow.append({
                "date":               col_date(col),
                "freeCashFlow":       fcf_val,
                "capitalExpenditure": capex_val,
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

    # ── Price history (max range to cover AV's 20-year data) ─────────────────
    price_history = {}
    try:
        hist = ticker.history(period="max", interval="1mo")
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
        net_income = item.get("netIncome")
        equity     = bal_row.get("totalStockholdersEquity")
        total_debt = bal_row.get("totalDebt")
        net_debt   = bal_row.get("netDebt")
        eps_val    = item.get("eps")
        revenue    = item.get("revenue")
        ebitda     = item.get("ebitda")
        shares     = item.get("weightedAverageShsOut")
        hist_price = price_history.get(date_str)

        roe  = clean(net_income / equity) if net_income and equity and equity > 0 else None
        roic = None
        if net_income is not None and equity is not None and total_debt is not None:
            invested = equity + total_debt
            roic = clean(net_income / invested) if invested and invested > 0 else None

        pe_ratio       = clean(hist_price / eps_val)               if hist_price and eps_val  and eps_val  > 0                            else None
        price_to_sales = clean(hist_price / (revenue / shares))    if hist_price and revenue  and shares   and shares > 0                 else None
        price_to_book  = clean(hist_price / (equity  / shares))    if hist_price and equity   and equity   > 0 and shares and shares > 0  else None
        mc             = clean(hist_price * shares)                 if hist_price and shares                                               else None
        ev_to_ebitda   = clean((hist_price * shares + net_debt) / ebitda) \
                         if hist_price and shares and net_debt is not None and ebitda and ebitda > 0 else None

        metrics.append({
            "date":         date_str,
            "roic":         roic,
            "roe":          roe,
            "peRatio":      pe_ratio,
            "priceToSales": price_to_sales,
            "priceToBook":  price_to_book,
            "evToEbitda":   ev_to_ebitda,
            "marketCap":    mc,
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
            "currentRatio":  None,
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


if __name__ == "__main__":
    app.run(port=5000, debug=True)
