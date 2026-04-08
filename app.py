import math
import datetime
import pandas as pd
from flask import Flask, jsonify
from flask_cors import CORS
import yfinance as yf

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
        "dividendYield": clean(info.get("dividendYield")),
        "lastDiv":       clean(info.get("lastDividendValue")),
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
                "revenue":               get_val(inc, col, "Total Revenue"),
                "netIncome":             get_val(inc, col, "Net Income", "Net Income Common Stockholders"),
                "ebitda":                get_val(inc, col, "EBITDA"),
                "eps":                   get_val(inc, col, "Basic EPS", "Diluted EPS"),
                "weightedAverageShsOut": get_val(inc, col, "Basic Average Shares", "Diluted Average Shares",
                                                 "Weighted Average Shares", "Average Shares"),
            })
    except Exception:
        pass
    income.sort(key=lambda x: x["date"], reverse=True)

    # ── Balance sheet ────────────────────────────────────────────────────────
    balance = []
    try:
        bal = ticker.balance_sheet
        for col in bal.columns:
            total_debt = get_val(bal, col, "Total Debt", "Long Term Debt And Capital Lease Obligation")
            cash = get_val(bal, col,
                           "Cash And Cash Equivalents",
                           "Cash Cash Equivalents And Short Term Investments",
                           "Cash And Short Term Investments")
            net_debt = None
            if total_debt is not None and cash is not None:
                net_debt = total_debt - cash
            balance.append({
                "date":                    col_date(col),
                "totalStockholdersEquity": get_val(bal, col,
                                                   "Stockholders Equity",
                                                   "Total Equity Gross Minority Interest",
                                                   "Common Stock Equity"),
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
            cashflow.append({
                "date":                col_date(col),
                "freeCashFlow":        get_val(cf, col, "Free Cash Flow"),
                "capitalExpenditure":  get_val(cf, col, "Capital Expenditure"),
                "dividendsPaid":       get_val(cf, col,
                                               "Common Stock Dividend Paid",
                                               "Cash Dividends Paid",
                                               "Payment Of Dividends"),
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

            roe  = clean(net_income / equity) if net_income and equity else None
            roic = None
            if net_income and equity is not None and total_debt is not None:
                invested = equity + total_debt
                roic = clean(net_income / invested) if invested else None

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


if __name__ == "__main__":
    app.run(port=5000, debug=True)
