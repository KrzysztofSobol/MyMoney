import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Account, BankGroup, Transaction } from "../types";

type TimeRange = "30d" | "60d" | "90d" | "1y" | "5y" | "all";

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: "30D", value: "30d" },
  { label: "60D", value: "60d" },
  { label: "90D", value: "90d" },
  { label: "1Y", value: "1y" },
  { label: "5Y", value: "5y" },
  { label: "All", value: "all" },
];

const RANGE_DAYS: Record<string, number> = {
  "30d": 30,
  "60d": 60,
  "90d": 90,
  "1y": 365,
  "5y": 1825,
};

interface OverviewDashboardProps {
  bankGroups: BankGroup[];
  accountsByGroup: Record<number, Account[]>;
  allTransactions: Transaction[];
}

function formatPLN(n: number): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
  }).format(n);
}

function formatDateFull(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

/** Calendar YYYY-MM-DD in local timezone (matches bank CSV dates). */
function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD as local midnight — avoid mixing with UTC from toISOString(). */
function parseLocalYMD(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function categoryIcon(category: string | null, amount: number): string {
  if (amount > 0) return "south_east";
  if (!category) return "receipt_long";
  const c = category.toLowerCase();
  if (c.includes("żywność") || c.includes("chemia")) return "shopping_cart";
  if (c.includes("przejazd") || c.includes("transport")) return "directions_car";
  if (c.includes("wyjście") || c.includes("wydarzen")) return "local_activity";
  if (c.includes("restaur") || c.includes("jedzenie")) return "restaurant";
  if (c.includes("internet") || c.includes("zakup")) return "shopping_bag";
  if (c.includes("przelew")) return "swap_horiz";
  if (c.includes("blik") || c.includes("płatn")) return "contactless";
  return "receipt_long";
}

interface TooltipPayload {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}
interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}
function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  // Total first, then groups
  const sorted = [...payload].sort((a) => (a.dataKey === "total" ? -1 : 1));
  return (
    <div
      style={{
        background: "var(--surface-highest)",
        border: "1px solid var(--border-strong)",
        borderRadius: 8,
        padding: "10px 14px",
        minWidth: 180,
      }}
    >
      <p style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8 }}>{label}</p>
      {sorted.map((p) => (
        <div
          key={p.name}
          style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 3 }}
        >
          <span
            style={{
              fontSize: 12,
              color: p.color,
              fontWeight: p.dataKey === "total" ? 700 : 500,
            }}
          >
            {p.name}
          </span>
          <span
            style={{
              fontSize: 12,
              fontFamily: "var(--font-headline)",
              fontWeight: 700,
              color: p.value >= 0 ? "var(--secondary)" : "var(--error)",
            }}
          >
            {formatPLN(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function OverviewDashboard({
  bankGroups,
  accountsByGroup,
  allTransactions,
}: OverviewDashboardProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");

  const accountToGroup = useMemo(() => {
    const map = new Map<number, BankGroup>();
    for (const [gId, accs] of Object.entries(accountsByGroup)) {
      const group = bankGroups.find((g) => g.id === Number(gId));
      if (!group) continue;
      for (const acc of accs) map.set(acc.id, group);
    }
    return map;
  }, [bankGroups, accountsByGroup]);

  const accountMap = useMemo(() => {
    const map = new Map<number, Account>();
    for (const accs of Object.values(accountsByGroup)) {
      for (const acc of accs) map.set(acc.id, acc);
    }
    return map;
  }, [accountsByGroup]);

  // Global all-time stats
  const income = useMemo(
    () => allTransactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    [allTransactions],
  );
  const expenses = useMemo(
    () => allTransactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0),
    [allTransactions],
  );
  const net = income + expenses;

  // Per-group totals (all-time)
  const groupStats = useMemo(() => {
    return bankGroups.map((group) => {
      const accs = accountsByGroup[group.id] ?? [];
      const ids = new Set(accs.map((a) => a.id));
      const txs = allTransactions.filter((t) => ids.has(t.account_id));
      const inc = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
      const exp = txs.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
      return { group, income: inc, expenses: exp, net: inc + exp, count: txs.length };
    });
  }, [bankGroups, accountsByGroup, allTransactions]);

  // Cumulative balance chart
  const { chartData, rangeLabel, totalDays } = useMemo(() => {
    if (bankGroups.length === 0 || allTransactions.length === 0) {
      return { chartData: [], rangeLabel: "", totalDays: 0 };
    }

    // Pre-process daily net per group
    const byDateGroup = new Map<string, Map<number, number>>();
    for (const tx of allTransactions) {
      const group = accountToGroup.get(tx.account_id);
      if (!group) continue;
      if (!byDateGroup.has(tx.transaction_date)) byDateGroup.set(tx.transaction_date, new Map());
      const day = byDateGroup.get(tx.transaction_date)!;
      day.set(group.id, (day.get(group.id) ?? 0) + tx.amount);
    }

    const today = new Date();
    const endDate = toLocalYMD(today);
    let startDate: string;

    if (timeRange === "all") {
      const allDates = [...byDateGroup.keys()].sort();
      startDate = allDates[0] ?? endDate;
    } else {
      const n = RANGE_DAYS[timeRange] ?? 30;
      const s = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      s.setDate(s.getDate() - n);
      startDate = toLocalYMD(s);
    }

    const diffMs = parseLocalYMD(endDate).getTime() - parseLocalYMD(startDate).getTime();
    const days = Math.max(0, Math.ceil(diffMs / 86400000));

    // Balances before the window (carry-in)
    const initBal = new Map<number, number>();
    for (const group of bankGroups) initBal.set(group.id, 0);
    for (const [date, dayMap] of byDateGroup) {
      if (date >= startDate) continue;
      for (const [gId, amount] of dayMap) {
        initBal.set(gId, (initBal.get(gId) ?? 0) + amount);
      }
    }

    // Build daily points
    const running = new Map<number, number>(initBal);
    const rawData: Record<string, number | string>[] = [];
    let cur = parseLocalYMD(startDate);
    const end = parseLocalYMD(endDate);

    while (cur.getTime() <= end.getTime()) {
      const dateStr = toLocalYMD(cur);
      const dayMap = byDateGroup.get(dateStr);
      if (dayMap) {
        for (const [gId, amount] of dayMap) {
          running.set(gId, (running.get(gId) ?? 0) + amount);
        }
      }
      const entry: Record<string, number | string> = { date: dateStr };
      let total = 0;
      for (const group of bankGroups) {
        const val = Number((running.get(group.id) ?? 0).toFixed(2));
        entry[`g_${group.id}`] = val;
        total += val;
      }
      entry.total = Number(total.toFixed(2));
      rawData.push(entry);
      cur.setDate(cur.getDate() + 1);
    }

    // Thin to max ~250 points to keep chart responsive
    const maxPts = 250;
    let data = rawData;
    if (rawData.length > maxPts) {
      const step = Math.ceil(rawData.length / maxPts);
      data = rawData.filter((_, i) => i % step === 0);
      const lastRaw = rawData[rawData.length - 1];
      const lastKept = data[data.length - 1];
      if (lastRaw && lastKept && lastRaw.date !== lastKept.date) {
        data.push(lastRaw);
      }
    }

    const labels: Record<string, string> = {
      "30d": "Last 30 days",
      "60d": "Last 60 days",
      "90d": "Last 90 days",
      "1y": "Last 12 months",
      "5y": "Last 5 years",
      all: "All time",
    };

    return { chartData: data, rangeLabel: labels[timeRange] ?? "", totalDays: days };
  }, [bankGroups, accountsByGroup, allTransactions, accountToGroup, timeRange]);

  // X-axis label format depends on range
  const formatXTick = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-");
    if (totalDays <= 90) return `${d}.${m}`;
    if (totalDays <= 365) return `${d}.${m}`;
    return `${m}.${y?.slice(2)}`;
  };

  const formatXTooltip = (dateStr: string) => formatDateFull(dateStr);

  const hasAnyData = allTransactions.length > 0;

  if (bankGroups.length === 0) {
    return (
      <div className="empty-state" style={{ minHeight: "60vh" }}>
        <span className="icon" style={{ fontSize: 52, color: "var(--border-strong)" }}>
          account_balance_wallet
        </span>
        <h3>No bank groups yet</h3>
        <p>Add a bank group from the sidebar, then import your first CSV file.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <p className="page-header-label">All groups</p>
        <h2 className="page-header-title">Overview</h2>
        <p className="page-header-sub">
          {allTransactions.length} transactions across {bankGroups.length} group
          {bankGroups.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Global totals */}
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 20 }}>
        <div className="stat-card stat-card--featured">
          <p className="stat-label stat-label--featured">Net balance</p>
          <p className={`stat-value${net >= 0 ? " stat-value--positive" : " stat-value--negative"}`}>
            {formatPLN(net)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">All-time income</p>
          <p className="stat-value stat-value--positive">{formatPLN(income)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">All-time expenses</p>
          <p className="stat-value">{formatPLN(expenses)}</p>
        </div>
      </div>

      {/* Cumulative balance chart */}
      <div className="chart-card" style={{ marginBottom: 20 }}>
        <div className="chart-card-header">
          <div>
            <p className="chart-card-title">Cumulative balance</p>
            <p className="chart-card-sub">{rangeLabel} — running total per group and overall</p>
          </div>
          {/* Time range picker */}
          <div className="time-range-pills">
            {TIME_RANGES.map((r) => (
              <button
                key={r.value}
                className={`time-range-pill${timeRange === r.value ? " time-range-pill--active" : ""}`}
                onClick={() => setTimeRange(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
            <span style={{ width: 24, height: 2.5, borderRadius: 2, background: "rgba(255,255,255,0.7)", display: "inline-block" }} />
            Total
          </span>
          {bankGroups.map((g) => (
            <span key={g.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-dim)" }}>
              <span style={{ width: 20, height: 2, borderRadius: 2, background: g.color, display: "inline-block" }} />
              {g.name}
            </span>
          ))}
        </div>

        {!hasAnyData ? (
          <div style={{ height: 360, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: 13 }}>
            Import CSV files to populate the chart
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--text-dim)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatXTick}
                interval="equidistantPreserveStart"
              />
              <YAxis
                tick={{ fill: "var(--text-dim)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => {
                  const abs = Math.abs(v);
                  if (abs >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                  if (abs >= 1000) return `${(v / 1000).toFixed(0)}k`;
                  return String(v);
                }}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: "var(--border-strong)", strokeDasharray: "4 2" }}
                labelFormatter={(label: unknown) => formatXTooltip(String(label ?? ""))}
              />
              <ReferenceLine y={0} stroke="var(--border-strong)" strokeWidth={1} />
              {/* Total line — thick white */}
              <Line
                type="monotone"
                dataKey="total"
                name="Total"
                stroke="rgba(255,255,255,0.75)"
                strokeWidth={2.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
                activeDot={{ r: 5, fill: "white", strokeWidth: 0 }}
              />
              {/* Per-group lines */}
              {bankGroups.map((group) => (
                <Line
                  key={group.id}
                  type="monotone"
                  dataKey={`g_${group.id}`}
                  name={group.name}
                  stroke={group.color}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                  activeDot={{ r: 4, fill: group.color, strokeWidth: 0 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-group cards — below the chart */}
      {groupStats.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(groupStats.length, 4)}, 1fr)`,
            gap: 12,
            marginBottom: 20,
          }}
        >
          {groupStats.map(({ group, income: gInc, expenses: gExp, net: gNet, count }) => (
            <div
              key={group.id}
              className="stat-card"
              style={{ borderLeftColor: group.color, borderLeftWidth: 3 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: group.color, flexShrink: 0 }} />
                <p style={{ margin: 0, fontFamily: "var(--font-headline)", fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
                  {group.name}
                </p>
              </div>
              <p className={`stat-value${gNet >= 0 ? " stat-value--positive" : " stat-value--negative"}`} style={{ fontSize: 20, marginBottom: 8 }}>
                {formatPLN(gNet)}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "var(--text-dim)" }}>Income</span>
                  <span style={{ color: "var(--secondary)" }}>{formatPLN(gInc)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "var(--text-dim)" }}>Expenses</span>
                  <span style={{ color: "var(--text-muted)" }}>{formatPLN(gExp)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 2 }}>
                  <span style={{ color: "var(--text-dim)" }}>Transactions</span>
                  <span style={{ color: "var(--text-muted)" }}>{count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Unified transaction history */}
      <div className="transactions-card">
        <div className="transactions-card-header">
          <p className="transactions-card-title">Recent transactions</p>
          <span className="transactions-count">{allTransactions.length} total</span>
        </div>

        {allTransactions.length === 0 ? (
          <div className="empty-state" style={{ padding: "48px 32px" }}>
            <span className="icon">receipt_long</span>
            <h3>No transactions</h3>
            <p>Import CSV files to see your transaction history.</p>
          </div>
        ) : (
          allTransactions.slice(0, 100).map((tx) => {
            const group = accountToGroup.get(tx.account_id);
            const account = accountMap.get(tx.account_id);
            return (
              <div key={tx.id} className="tx-row">
                <div style={{ width: 3, alignSelf: "stretch", background: group?.color ?? "var(--border-strong)", borderRadius: 2, flexShrink: 0 }} />
                <div className={`tx-icon${tx.amount > 0 ? " tx-icon--positive" : ""}`}>
                  <span className="icon">{categoryIcon(tx.category, tx.amount)}</span>
                </div>
                <div className="tx-main">
                  <p className="tx-desc" title={tx.description}>{tx.description}</p>
                  <p className="tx-meta">
                    {formatDateFull(tx.transaction_date)}
                    {account && (
                      <>
                        <span style={{ margin: "0 5px", opacity: 0.4 }}>·</span>
                        <span style={{ color: group?.color ?? "var(--text-dim)" }}>{group?.name}</span>
                        {" / "}{account.name}
                      </>
                    )}
                    {tx.category && (
                      <>
                        <span style={{ margin: "0 5px", opacity: 0.4 }}>·</span>
                        {tx.category}
                      </>
                    )}
                  </p>
                </div>
                <div className="tx-right">
                  <p className={`tx-amount${tx.amount > 0 ? " tx-amount--positive" : ""}`}>
                    {tx.amount > 0 ? "+" : ""}{formatPLN(tx.amount)}
                  </p>
                  <p className="tx-account-badge">{tx.currency}</p>
                </div>
              </div>
            );
          })
        )}

        {allTransactions.length > 100 && (
          <div style={{ padding: "12px 24px", textAlign: "center", fontSize: 12, color: "var(--text-dim)", borderTop: "1px solid var(--border)" }}>
            Showing 100 of {allTransactions.length} transactions
          </div>
        )}
      </div>
    </div>
  );
}
