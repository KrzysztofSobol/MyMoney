import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { Account, BankGroup, Transaction } from "../types";

interface DashboardProps {
  transactions: Transaction[];
  selectedGroup: BankGroup | null;
  selectedAccount: Account | null;
  onClearAccount: (accountId: number) => Promise<void>;
  onClearGroup: (groupId: number) => Promise<void>;
}

function formatPLN(n: number): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
  }).format(n);
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

function shortDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}.${m}`;
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

function buildChartData(transactions: Transaction[]) {
  const now = new Date();
  const byDay = new Map<string, number>();

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }

  for (const tx of transactions) {
    if (byDay.has(tx.transaction_date)) {
      byDay.set(tx.transaction_date, (byDay.get(tx.transaction_date) ?? 0) + tx.amount);
    }
  }

  return [...byDay.entries()].map(([date, net]) => ({
    date: shortDate(date),
    net: Number(net.toFixed(2)),
  }));
}

interface TooltipPayload {
  value: number;
}
interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  return (
    <div
      style={{
        background: "var(--surface-highest)",
        border: "1px solid var(--border-strong)",
        borderRadius: 8,
        padding: "8px 12px",
      }}
    >
      <p style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>{label}</p>
      <p
        style={{
          fontFamily: "var(--font-headline)",
          fontWeight: 700,
          fontSize: 14,
          color: val >= 0 ? "var(--secondary)" : "var(--error)",
        }}
      >
        {formatPLN(val)}
      </p>
    </div>
  );
}

export function Dashboard({
  transactions,
  selectedGroup,
  selectedAccount,
  onClearAccount,
  onClearGroup,
}: DashboardProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function handleClear() {
    setClearing(true);
    try {
      if (selectedAccount) {
        await onClearAccount(selectedAccount.id);
      } else if (selectedGroup) {
        await onClearGroup(selectedGroup.id);
      }
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  }
  const income = useMemo(
    () => transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    [transactions],
  );
  const expenses = useMemo(
    () => transactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0),
    [transactions],
  );
  const net = income + expenses;
  const chartData = useMemo(() => buildChartData(transactions), [transactions]);
  const recent = transactions.slice(0, 50);

  const title = selectedAccount?.name ?? selectedGroup?.name ?? null;
  const subtitle = selectedAccount
    ? selectedGroup?.name ?? ""
    : selectedGroup
      ? `${Object.keys({}).length} accounts`
      : null;

  if (!selectedGroup && !selectedAccount) {
    return (
      <div className="empty-state" style={{ minHeight: "60vh" }}>
        <span className="icon" style={{ fontSize: 52, color: "var(--border-strong)" }}>
          account_balance_wallet
        </span>
        <h3>Select an account</h3>
        <p>Choose a bank group or account from the sidebar to see transactions and analytics.</p>
        <p style={{ marginTop: 8 }}>
          No groups yet?{" "}
          <span style={{ color: "var(--primary)" }}>Add one from the sidebar</span> or import a
          CSV file.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        className="page-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <div>
          <p className="page-header-label">{subtitle ?? "Overview"}</p>
          <h2 className="page-header-title">{title ?? "Dashboard"}</h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, paddingTop: 4 }}>
          {confirmClear ? (
            <div
              style={{
                background: "rgba(255,113,108,0.1)",
                border: "1px solid rgba(255,113,108,0.4)",
                borderRadius: "var(--radius)",
                padding: "12px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                alignItems: "flex-end",
                maxWidth: 300,
              }}
            >
              <p style={{ fontSize: 13, color: "var(--error)", margin: 0, textAlign: "right" }}>
                Delete <strong>{transactions.length} transactions</strong> from{" "}
                <strong>{selectedAccount?.name ?? selectedGroup?.name}</strong>?
                <br />
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  Bank group and accounts are kept. This cannot be undone.
                </span>
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setConfirmClear(false)}
                  disabled={clearing}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => void handleClear()}
                  disabled={clearing}
                >
                  <span className="icon icon--sm">delete_forever</span>
                  {clearing ? "Deleting…" : "Yes, wipe it"}
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn btn-danger"
              onClick={() => setConfirmClear(true)}
              disabled={transactions.length === 0}
              title={`Wipe all transactions for ${selectedAccount?.name ?? selectedGroup?.name}`}
            >
              <span className="icon icon--sm">delete_sweep</span>
              Wipe transactions
            </button>
          )}
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Income</p>
          <p className="stat-value stat-value--positive">{formatPLN(income)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Expenses</p>
          <p className="stat-value">{formatPLN(expenses)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Net balance</p>
          <p
            className={`stat-value${net >= 0 ? " stat-value--positive" : " stat-value--negative"}`}
          >
            {formatPLN(net)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Transactions</p>
          <p className="stat-value stat-value--muted">{transactions.length}</p>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-card-header">
          <div>
            <p className="chart-card-title">Daily cash flow</p>
            <p className="chart-card-sub">Last 30 days</p>
          </div>
          <div className="flex gap-2 items-center" style={{ gap: 16 }}>
            <span
              className="flex items-center gap-2"
              style={{ fontSize: 11, color: "var(--text-dim)", gap: 5 }}
            >
              <span
                style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--secondary)", display: "inline-block" }}
              />
              Income
            </span>
            <span
              className="flex items-center gap-2"
              style={{ fontSize: 11, color: "var(--text-dim)", gap: 5 }}
            >
              <span
                style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--error)", display: "inline-block" }}
              />
              Expense
            </span>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div
            style={{
              height: 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-dim)",
              fontSize: 13,
            }}
          >
            No transactions — import a CSV to see the chart
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--text-dim)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fill: "var(--text-dim)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                }
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <ReferenceLine y={0} stroke="var(--border-strong)" strokeWidth={1} />
              <Bar dataKey="net" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.net >= 0 ? "var(--secondary)" : "var(--error)"}
                    fillOpacity={0.75}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="transactions-card">
        <div className="transactions-card-header">
          <p className="transactions-card-title">Transactions</p>
          <span className="transactions-count">{transactions.length} total</span>
        </div>

        {recent.length === 0 ? (
          <div className="empty-state" style={{ padding: "48px 32px" }}>
            <span className="icon">receipt_long</span>
            <h3>No transactions</h3>
            <p>Import a CSV file to populate this account.</p>
          </div>
        ) : (
          recent.map((tx) => (
            <div key={tx.id} className="tx-row">
              <div className={`tx-icon${tx.amount > 0 ? " tx-icon--positive" : ""}`}>
                <span className="icon">{categoryIcon(tx.category, tx.amount)}</span>
              </div>
              <div className="tx-main">
                <p className="tx-desc" title={tx.description}>
                  {tx.description}
                </p>
                <p className="tx-meta">
                  {formatDate(tx.transaction_date)}
                  {tx.category && (
                    <>
                      <span style={{ margin: "0 5px", opacity: 0.4 }}>·</span>
                      {tx.category}
                    </>
                  )}
                  {tx.counterparty && (
                    <>
                      <span style={{ margin: "0 5px", opacity: 0.4 }}>·</span>
                      {tx.counterparty}
                    </>
                  )}
                </p>
              </div>
              <div className="tx-right">
                <p className={`tx-amount${tx.amount > 0 ? " tx-amount--positive" : ""}`}>
                  {tx.amount > 0 ? "+" : ""}
                  {formatPLN(tx.amount)}
                </p>
                <p className="tx-account-badge">{tx.currency}</p>
              </div>
            </div>
          ))
        )}

        {transactions.length > 50 && (
          <div
            style={{
              padding: "12px 24px",
              textAlign: "center",
              fontSize: 12,
              color: "var(--text-dim)",
              borderTop: "1px solid var(--border)",
            }}
          >
            Showing 50 of {transactions.length} transactions
          </div>
        )}
      </div>
    </div>
  );
}
