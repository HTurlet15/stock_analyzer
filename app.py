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
AV_KEY = os.environ.get("AV_API_KEY", "")
AV_BASE = "https://www.alphavantage.co/query"

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


def merge_data(yf_list, av_list):
    """Merge yfinance (priority) + AV (historical). Dedup by fiscal year."""
    if not av_list:
        return yf_list
    yf_years = {e["date"][:4] for e in yf_list if e.get("date")}
    extra = [e for e in av_list if e.get("date", "")[:4] not in yf_years]
    merged = yf_list + extra
    merged.sort(key=lambda x: x.get("date", ""), reverse=True)
    return merged


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

    # ── Key metrics (ROIC, ROE, historical PE) ────────────────────────────────
    # Build a price-history index so we can look up price at each fiscal year end
    price_history = {}
    try:
        hist = ticker.history(period="10y", interval="1mo")
        if hist is not None and not hist.empty:
            hist.index = hist.index.tz_localize(None) if hist.index.tz is not None else hist.index
            for entry in income:
                date_ts = pd.Timestamp(entry["date"])
                past = hist[hist.index <= date_ts]
                if not past.empty:
                    price_history[entry["date"]] = float(past.iloc[-1]["Close"])
    except Exception:
        pass

    metrics = []
    try:
        inc = ticker.income_stmt
        bal = ticker.balance_sheet
        for col in inc.columns:
            date_str = col_date(col)
            net_income  = get_val(inc, col, "Net Income", "Net Income Common Stockholders")
            equity      = get_val(bal, col, "Stockholders Equity", "Total Equity Gross Minority Interest",
                                  "Common Stock Equity") if col in bal.columns else None
            total_debt  = get_val(bal, col, "Total Debt") if col in bal.columns else None
            eps_val     = get_val(inc, col, "Basic EPS", "Diluted EPS")

            # ROE only meaningful when equity is positive
            roe  = clean(net_income / equity) if net_income and equity and equity > 0 else None
            # ROIC only meaningful when invested capital (equity + debt) is positive
            roic = None
            if net_income and equity is not None and total_debt is not None:
                invested = equity + total_debt
                roic = clean(net_income / invested) if invested and invested > 0 else None

            pe_ratio = None
            hist_price = price_history.get(date_str)
            if hist_price and eps_val and eps_val > 0:
                pe_ratio = clean(hist_price / eps_val)

            metrics.append({
                "date":    date_str,
                "roic":    roic,
                "roe":     roe,
                "peRatio": pe_ratio,
            })
    except Exception:
        pass
    metrics.sort(key=lambda x: x["date"], reverse=True)

    # ── Ratios ───────────────────────────────────────────────────────────────
    ratios = []
    try:
        inc = ticker.income_stmt
        bal = ticker.balance_sheet
        cf  = ticker.cash_flow
        for col in inc.columns:
            date_str   = col_date(col)
            net_income = get_val(inc, col, "Net Income", "Net Income Common Stockholders")
            divs_paid  = None
            if col in cf.columns:
                divs_paid = get_val(cf, col, "Common Stock Dividend Paid",
                                    "Cash Dividends Paid", "Payment Of Dividends")

            payout_ratio = None
            if divs_paid is not None and net_income:
                payout_ratio = clean(abs(divs_paid) / net_income)

            current_ratio = None
            debt_to_equity = None
            if col in bal.columns:
                cur_assets  = get_val(bal, col, "Current Assets")
                cur_liab    = get_val(bal, col, "Current Liabilities")
                if cur_assets and cur_liab:
                    current_ratio = clean(cur_assets / cur_liab)

                equity     = get_val(bal, col, "Stockholders Equity",
                                     "Total Equity Gross Minority Interest", "Common Stock Equity")
                total_debt = get_val(bal, col, "Total Debt")
                if total_debt is not None and equity:
                    debt_to_equity = clean(total_debt / equity)

            ratios.append({
                "date":          date_str,
                "payoutRatio":   payout_ratio,
                "currentRatio":  current_ratio,
                "debtToEquity":  debt_to_equity,
            })
    except Exception:
        pass
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

    # ── Alpha Vantage — extend history to 10+ years ───────────────────────────
    if AV_KEY:
        try:
            av_inc = av_income(symbol)
            time.sleep(0.5)           # stay within 5 req/min
            av_bal = av_balance(symbol)
            time.sleep(0.5)
            av_cf  = av_cashflow(symbol)
            income   = merge_data(income,   av_inc)
            balance  = merge_data(balance,  av_bal)
            cashflow = merge_data(cashflow, av_cf)
        except Exception:
            pass                      # AV failure never breaks the response

    return jsonify({
        "quote":     quote,
        "profile":   profile,
        "income":    income,
        "balance":   balance,
        "cashflow":  cashflow,
        "metrics":   metrics,
        "ratios":    ratios,
        "estimates": estimates,
        "dividends": {"historical": dividends_hist},
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
