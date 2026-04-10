import { useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import { pct, num, money } from "../utils";
import { scoreColor } from "../thresholds";
import "./ValuationSection.css";

// ── Tooltip formatter ─────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label, fmt }) => {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="val-tooltip">
      <span className="val-tooltip-year">{label}</span>
      <span className="val-tooltip-value">{fmt(v)}</span>
    </div>
  );
};

// ── Inline sparkline ──────────────────────────────────────────────────────────

const InlineChart = ({ data, dataKey, fmt, color }) => {
  const values = data.map(d => d[dataKey]).filter(v => v != null);
  if (values.length < 2) return <p className="val-chart-empty">Pas assez de données.</p>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.15 || 1;
  return (
    <div className="val-chart-wrap">
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} />
          <YAxis
            domain={[min - pad, max + pad]}
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmt}
            width={52}
          />
          <Tooltip content={<ChartTooltip fmt={fmt} />} />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color || "var(--blue)"}
            strokeWidth={2}
            dot={{ r: 3, fill: color || "var(--blue)", strokeWidth: 0 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

// ── Row definitions ───────────────────────────────────────────────────────────

const buildRows = (t) => [
  {
    key: "peRatio",
    label: "PER historique",
    fmt: v => v != null ? `${num(v, 1)}x` : "—",
    colorFn: v => scoreColor(v, t.perGood, t.perOk, true),
    chartColor: "var(--blue)",
    chartFmt: v => `${num(v, 1)}x`,
  },
  {
    key: "priceToSales",
    label: "Price / Sales",
    fmt: v => v != null ? `${num(v, 1)}x` : "—",
    colorFn: () => "dim",
    chartColor: "var(--blue)",
    chartFmt: v => `${num(v, 1)}x`,
  },
  {
    key: "priceToBook",
    label: "Price / Book",
    fmt: v => v != null ? `${num(v, 1)}x` : "—",
    colorFn: () => "dim",
    chartColor: "var(--blue)",
    chartFmt: v => `${num(v, 1)}x`,
  },
  {
    key: "evToEbitda",
    label: "EV / EBITDA",
    fmt: v => v != null ? `${num(v, 1)}x` : "—",
    colorFn: () => "dim",
    chartColor: "var(--orange)",
    chartFmt: v => `${num(v, 1)}x`,
  },
  {
    key: "roe",
    label: "ROE",
    fmt: pct,
    colorFn: v => scoreColor(v, t.roeGood, t.roeOk),
    chartColor: "var(--green)",
    chartFmt: v => `${(v * 100).toFixed(0)}%`,
  },
  {
    key: "roic",
    label: "ROIC",
    fmt: pct,
    colorFn: v => scoreColor(v, t.roicGood, t.roicOk),
    chartColor: "var(--green)",
    chartFmt: v => `${(v * 100).toFixed(0)}%`,
  },
  {
    key: "marketCap",
    label: "Capitalisation",
    fmt: money,
    colorFn: () => "dim",
    chartColor: "var(--text-muted)",
    chartFmt: v => {
      if (v == null) return "—";
      if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
      if (Math.abs(v) >= 1e9)  return `$${(v / 1e9).toFixed(0)}B`;
      return `$${(v / 1e6).toFixed(0)}M`;
    },
  },
];

// ── ValuationSection ──────────────────────────────────────────────────────────

export default function ValuationSection({ stock, thresholds: t }) {
  const [expandedRow, setExpandedRow] = useState(null);
  const s = stock;
  const raw = s.raw || {};

  // Ascending order for chart (oldest → newest)
  const met = [...(raw.metrics || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  const YEARS = met.map(r => r.date.slice(0, 4));

  // Current-year values (live from quote)
  const currentYear = new Date().getFullYear().toString();
  const ebitdaCurrent = (raw.income?.[0] || {}).ebitda;
  const currentValues = {
    peRatio:      s.peCurrent,
    priceToSales: s.price && s.revenueCurrent && s.sharesCurrent > 0
      ? s.price / (s.revenueCurrent / s.sharesCurrent) : null,
    priceToBook:  s.price && s.equity && s.equity > 0 && s.sharesCurrent > 0
      ? s.price / (s.equity / s.sharesCurrent) : null,
    evToEbitda:   s.marketCap != null && s.netDebt != null && ebitdaCurrent && ebitdaCurrent > 0
      ? (s.marketCap + s.netDebt) / ebitdaCurrent : null,
    roe:          s.roe,
    roic:         s.roic,
    marketCap:    s.marketCap,
  };

  // Chart data includes current year as final point
  const chartData = [
    ...met.map(r => ({ year: r.date.slice(0, 4), ...r })),
    ...(currentYear !== YEARS[YEARS.length - 1] ? [{ year: currentYear, ...currentValues }] : []),
  ];

  const rows = buildRows(t || {});

  const toggleRow = (key) => setExpandedRow(prev => prev === key ? null : key);

  const cur = s.peCurrent;
  const hist = s.peHistorical;
  const fwd = s.forwardPE;

  return (
    <div className="valuation-section">

      {/* ── Current summary ─────────────────────────────────────────────────── */}
      <div className="val-summary">
        <div className="val-sum-item">
          <span className="val-sum-label">PER actuel</span>
          <span className={`val-sum-value ${scoreColor(cur, t?.perGood ?? 25, t?.perOk ?? 30, true)}`}>
            {cur != null ? `${num(cur, 1)}x` : "—"}
          </span>
        </div>
        <div className="val-sum-item">
          <span className="val-sum-label">PER hist. moyen</span>
          <span className="val-sum-value dim">{hist != null ? `${num(hist, 1)}x` : "—"}</span>
        </div>
        <div className="val-sum-item">
          <span className="val-sum-label">Forward PER{s.forwardPEYear ? ` (${s.forwardPEYear})` : ""}</span>
          <span className={`val-sum-value ${scoreColor(fwd, t?.perGood ?? 25, t?.perOk ?? 30, true)}`}>
            {fwd != null ? `${num(fwd, 1)}x` : "—"}
          </span>
        </div>
        <div className="val-sum-item">
          <span className="val-sum-label">Capitalisation</span>
          <span className="val-sum-value dim">{money(s.marketCap)}</span>
        </div>
        {s.analystEpsGrowth != null && (
          <div className="val-sum-item">
            <span className="val-sum-label">BPA est. (analystes)</span>
            <span className={`val-sum-value ${scoreColor(s.analystEpsGrowth, t?.analystEpsGood ?? 0.10, t?.analystEpsOk ?? 0.05)}`}>
              {pct(s.analystEpsGrowth)}
            </span>
          </div>
        )}
        {s.analystRevGrowth != null && (
          <div className="val-sum-item">
            <span className="val-sum-label">CA est. (analystes)</span>
            <span className={`val-sum-value ${scoreColor(s.analystRevGrowth, t?.analystRevGood ?? 0.08, t?.analystRevOk ?? 0.05)}`}>
              {pct(s.analystRevGrowth)}
            </span>
          </div>
        )}
        {s.priceTarget?.consensus != null && (() => {
          const upside = (s.priceTarget.consensus - s.price) / s.price;
          return (
            <div className="val-sum-item">
              <span className="val-sum-label">Obj. consensus</span>
              <span className={`val-sum-value ${upside >= 0.10 ? "green" : upside >= 0 ? "orange" : "red"}`}>
                ${num(s.priceTarget.consensus, 0)} <span className="val-sum-hint">({upside >= 0 ? "+" : ""}{pct(upside)})</span>
              </span>
            </div>
          );
        })()}
      </div>

      {/* ── Year-by-year table ──────────────────────────────────────────────── */}
      {YEARS.length === 0 ? (
        <p className="val-empty">Données historiques indisponibles.</p>
      ) : (
        <div className="val-table-wrap">
          <table className="val-table">
            <thead>
              <tr>
                <th className="vt-label" />
                {YEARS.map(y => <th key={y} className="vt-year">{y}</th>)}
                <th className="vt-year vt-current">{currentYear} ★</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const vals = met.map(r => r[row.key]);
                const curVal = currentValues[row.key];
                const isExpanded = expandedRow === row.key;
                const totalCols = YEARS.length + 2; // label + years + current
                return [
                  <tr
                    key={row.key}
                    className={`vt-row ${isExpanded ? "expanded" : ""}`}
                    onClick={() => toggleRow(row.key)}
                  >
                    <td className="vt-label">
                      <span className="vt-label-text">{row.label}</span>
                    </td>
                    {vals.map((v, i) => (
                      <td key={i} className="vt-data dim">
                        {row.fmt(v)}
                      </td>
                    ))}
                    <td className={`vt-data vt-current ${row.colorFn(curVal)}`}>
                      {row.fmt(curVal)}
                    </td>
                  </tr>,
                  isExpanded && (
                    <tr key={`${row.key}-chart`} className="vt-chart-row">
                      <td colSpan={totalCols} className="vt-chart-cell">
                        <InlineChart
                          data={chartData}
                          dataKey={row.key}
                          fmt={row.chartFmt}
                          color={row.chartColor}
                        />
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
