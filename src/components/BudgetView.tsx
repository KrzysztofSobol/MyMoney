import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { BudgetCategory, BudgetMonthData, BudgetMonthItem, BudgetRule } from "../types";
import {
  assignBudgetTransaction,
  createBudgetCategory,
  createBudgetRule,
  deleteBudgetCategory,
  deleteBudgetRule,
  getBudgetCategories,
  getBudgetMonth,
  getBudgetRules,
} from "../services/database";

interface LocalBudgetData {
  monthlyIncome: number;
  categories?: {
    name: string;
    color: string;
    budgetAmount: number;
  }[];
}

const STORAGE_KEY = "mymoney_budget_v1";
const MIGRATION_KEY = "mymoney_budget_categories_migrated_v1";

const BUDGET_COLORS = [
  "#69daff", "#83fba5", "#c97cff", "#ffb347",
  "#ff8c8c", "#64b5f6", "#ffd166", "#ff6b9d",
  "#00d4aa", "#ff6b35", "#a8e6cf", "#e8a0bf",
];

function loadLocalBudget(): LocalBudgetData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as LocalBudgetData;
  } catch { /* ignore */ }
  return { monthlyIncome: 0, categories: [] };
}

function saveLocalBudget(data: LocalBudgetData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function fmt(n: number): string {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function categoryIcon(category: string | null, amount: number): string {
  if (amount > 0) return "south_east";
  if (!category) return "receipt_long";
  const c = category
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (c.includes("zywnosc") || c.includes("chemia")) return "shopping_cart";
  if (c.includes("przejazd") || c.includes("transport")) return "directions_car";
  if (c.includes("wyjscie") || c.includes("wydarzen")) return "local_activity";
  if (c.includes("restaur") || c.includes("jedzenie")) return "restaurant";
  if (c.includes("internet") || c.includes("zakup")) return "shopping_bag";
  if (c.includes("przelew")) return "swap_horiz";
  if (c.includes("blik") || c.includes("platn")) return "contactless";
  return "receipt_long";
}

interface DonutProps {
  income: number;
  categories: BudgetCategory[];
}

function DonutChart({ income, categories }: DonutProps) {
  const cx = 140, cy = 140, R = 112, r = 70, W = 280;
  const allocated = categories.reduce((s, c) => s + c.budget_amount, 0);

  if (income <= 0 && categories.length === 0) {
    return (
      <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
        <circle cx={cx} cy={cy} r={(R + r) / 2} fill="none" stroke="var(--border)" strokeWidth={R - r} />
        <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--text-dim)" fontSize={14} fontFamily="Inter, system-ui">
          Set income
        </text>
        <text x={cx} y={cy + 13} textAnchor="middle" fill="var(--text-dim)" fontSize={12} fontFamily="Inter, system-ui">
          to get started
        </text>
      </svg>
    );
  }

  const total = Math.max(income, allocated, 1);
  const unallocated = Math.max(0, total - allocated);
  type Seg = { color: string; value: number };
  const segments: Seg[] = [
    ...categories.map((c) => ({ color: c.color, value: c.budget_amount })),
    ...(unallocated > 0 ? [{ color: "#2a2a2b", value: unallocated }] : []),
  ];

  const GAP = segments.length > 1 ? 0.022 : 0;
  let angle = -Math.PI / 2;
  const paths: ReactNode[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const sweep = (seg.value / total) * 2 * Math.PI;
    const endAngle = angle + sweep;
    const aStart = angle + GAP / 2;
    const aEnd = endAngle - GAP / 2;

    if (aEnd - aStart > 0.01) {
      const large = aEnd - aStart > Math.PI ? 1 : 0;
      const x1 = cx + R * Math.cos(aStart), y1 = cy + R * Math.sin(aStart);
      const x2 = cx + R * Math.cos(aEnd), y2 = cy + R * Math.sin(aEnd);
      const x3 = cx + r * Math.cos(aEnd), y3 = cy + r * Math.sin(aEnd);
      const x4 = cx + r * Math.cos(aStart), y4 = cy + r * Math.sin(aStart);
      const d = `M${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 ${large} 0 ${x4} ${y4}Z`;
      paths.push(<path key={i} d={d} fill={seg.color} />);
    }
    angle = endAngle;
  }

  const pct = income > 0 ? Math.round((allocated / income) * 100) : 100;

  return (
    <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`}>
      {paths}
      <text x={cx} y={cy - 14} textAnchor="middle" fill="white" fontSize={38} fontWeight={800} fontFamily="Manrope, system-ui" letterSpacing="-1.5">
        {pct}%
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="#adaaab" fontSize={13} fontFamily="Inter, system-ui">
        allocated
      </text>
      <text x={cx} y={cy + 31} textAnchor="middle" fill="#767576" fontSize={11} fontFamily="Inter, system-ui">
        {fmt(allocated)} / {fmt(income)} PLN
      </text>
    </svg>
  );
}

function monthKeyForTransaction(tx: BudgetMonthItem): string {
  return tx.transaction_date.slice(0, 7);
}

export function BudgetView() {
  const localBudget = useMemo(loadLocalBudget, []);
  const [monthlyIncome, setMonthlyIncome] = useState(localBudget.monthlyIncome);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [rules, setRules] = useState<BudgetRule[]>([]);
  const [monthData, setMonthData] = useState<BudgetMonthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState("");
  const incomeRef = useRef<HTMLInputElement>(null);

  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newColor, setNewColor] = useState(BUDGET_COLORS[0]);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const categoryNameRef = useRef<HTMLInputElement>(null);

  const [ruleText, setRuleText] = useState("");
  const [ruleTarget, setRuleTarget] = useState("transfer");
  const [ruleError, setRuleError] = useState<string | null>(null);
  const ruleTextRef = useRef<HTMLInputElement>(null);

  const yearMonth = useMemo(currentYearMonth, []);
  const currentMonth = useMemo(
    () => new Date().toLocaleDateString("pl-PL", { month: "long", year: "numeric" }),
    [],
  );

  async function reloadBudget() {
    setError(null);
    const [dbCategories, dbRules, dbMonth] = await Promise.all([
      getBudgetCategories(),
      getBudgetRules(),
      getBudgetMonth(yearMonth),
    ]);
    setCategories(dbCategories);
    setRules(dbRules);
    setMonthData(dbMonth);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        await reloadBudget();
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setLoading(false);
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    async function migrateLocalCategories() {
      if (
        categories.length > 0
        || !localBudget.categories?.length
        || localStorage.getItem(MIGRATION_KEY)
      ) return;
      localStorage.setItem(MIGRATION_KEY, "1");
      try {
        await Promise.all(
          localBudget.categories.map((cat) => createBudgetCategory({
            name: cat.name,
            color: cat.color,
            budgetAmount: cat.budgetAmount,
          })),
        );
        await reloadBudget();
      } catch {
        localStorage.removeItem(MIGRATION_KEY);
        /* non-fatal */
      }
    }
    void migrateLocalCategories();
  }, [categories.length, localBudget.categories]);

  useEffect(() => {
    if (editingIncome) incomeRef.current?.focus();
  }, [editingIncome]);

  useEffect(() => {
    if (showCategoryModal) categoryNameRef.current?.focus();
  }, [showCategoryModal]);

  useEffect(() => {
    if (showRuleModal) ruleTextRef.current?.focus();
  }, [showRuleModal]);

  function openCategoryModal() {
    setNewName("");
    setNewAmount("");
    setNewColor(BUDGET_COLORS[categories.length % BUDGET_COLORS.length]);
    setCategoryError(null);
    setShowCategoryModal(true);
  }

  function openRuleModal() {
    setRuleText("");
    setRuleTarget(categories[0] ? String(categories[0].id) : "transfer");
    setRuleError(null);
    setShowRuleModal(true);
  }

  function handleSaveIncome(e: FormEvent) {
    e.preventDefault();
    const val = parseFloat(incomeInput);
    if (!isNaN(val) && val >= 0) {
      setMonthlyIncome(val);
      saveLocalBudget({ ...loadLocalBudget(), monthlyIncome: val });
    }
    setEditingIncome(false);
  }

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    const amount = parseFloat(newAmount);
    if (!name) { setCategoryError("Podaj nazwę kategorii"); return; }
    if (isNaN(amount) || amount <= 0) { setCategoryError("Podaj poprawną kwotę"); return; }

    try {
      await createBudgetCategory({ name, color: newColor, budgetAmount: amount });
      await reloadBudget();
      setShowCategoryModal(false);
    } catch (err) {
      setCategoryError((err as Error).message);
    }
  }

  async function handleDeleteCategory(id: number) {
    try {
      await deleteBudgetCategory(id);
      await reloadBudget();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleAddRule(e: FormEvent) {
    e.preventDefault();
    const matchText = ruleText.trim();
    if (!matchText) { setRuleError("Enter text to match"); return; }

    const classification = ruleTarget === "transfer" ? "transfer" : "expense";
    const categoryId = classification === "transfer" ? null : Number(ruleTarget);
    if (classification === "expense" && !categoryId) {
      setRuleError("Choose a category");
      return;
    }

    try {
      await createBudgetRule({ matchText, categoryId, classification });
      await reloadBudget();
      setShowRuleModal(false);
    } catch (err) {
      setRuleError((err as Error).message);
    }
  }

  async function handleDeleteRule(id: number) {
    try {
      await deleteBudgetRule(id);
      await reloadBudget();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleAssign(tx: BudgetMonthItem, value: string) {
    if (!value) return;
    const classification = value === "transfer" ? "transfer" : "expense";
    const categoryId = classification === "transfer" ? null : Number(value);
    if (classification === "expense" && !categoryId) return;

    try {
      const updated = await assignBudgetTransaction({
        yearMonth: monthKeyForTransaction(tx),
        transactionId: tx.id,
        categoryId,
        classification,
      });
      setMonthData(updated);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const allocated = categories.reduce((s, c) => s + c.budget_amount, 0);
  const remaining = monthlyIncome - allocated;
  const items = monthData?.items ?? [];
  const realExpenses = items.filter((item) => item.classification === "expense");
  const transferItems = items.filter((item) => item.classification === "transfer");
  const unassignedItems = realExpenses.filter((item) => !item.budget_category_id);
  const spentByCategory = useMemo(() => {
    const byCategory = new Map<number, number>();
    for (const item of realExpenses) {
      if (!item.budget_category_id) continue;
      byCategory.set(
        item.budget_category_id,
        (byCategory.get(item.budget_category_id) ?? 0) + Math.abs(item.amount),
      );
    }
    return byCategory;
  }, [realExpenses]);
  const totalSpent = realExpenses.reduce((sum, item) => sum + Math.abs(item.amount), 0);

  return (
    <div className="budget-view">
      <div className="budget-page-header">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <p className="page-header-label">Finanse</p>
          <h2 className="page-header-title">Budget</h2>
          <p className="page-header-sub">{currentMonth}</p>
        </div>
        <div className="budget-header-actions">
          <button className="btn btn-secondary" onClick={openRuleModal}>
            <span className="icon icon--sm">rule</span>
            Add Rule
          </button>
          <button className="btn btn-primary" onClick={openCategoryModal}>
            <span className="icon icon--sm">add</span>
            Add Category
          </button>
        </div>
      </div>

      {error && <p className="error-banner">{error}</p>}

      <div className="budget-top-grid">
        <div className="card budget-chart-card">
          <DonutChart income={monthlyIncome} categories={categories} />

          <div className="budget-stats-row">
            <div className="budget-stat-item">
              <span className="budget-stat-label">Monthly Income</span>
              {editingIncome ? (
                <form className="budget-income-edit-form" onSubmit={handleSaveIncome}>
                  <input
                    ref={incomeRef}
                    className="input budget-income-input"
                    value={incomeInput}
                    onChange={(e) => setIncomeInput(e.target.value)}
                    placeholder="e.g. 5000"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                  <button type="submit" className="btn btn-primary" style={{ padding: "7px 12px" }}>
                    <span className="icon icon--sm">check</span>
                  </button>
                  <button type="button" className="btn btn-secondary" style={{ padding: "7px 10px" }} onClick={() => setEditingIncome(false)}>
                    <span className="icon icon--sm">close</span>
                  </button>
                </form>
              ) : (
                <div className="budget-stat-value-row">
                  <span className="budget-stat-value">
                    {monthlyIncome > 0 ? `${fmt(monthlyIncome)} PLN` : "-"}
                  </span>
                  <button
                    className="btn-ghost"
                    style={{ padding: "3px 5px" }}
                    title="Edit income"
                    onClick={() => { setIncomeInput(monthlyIncome > 0 ? String(monthlyIncome) : ""); setEditingIncome(true); }}
                  >
                    <span className="icon icon--sm">edit</span>
                  </button>
                </div>
              )}
            </div>

            <div className="budget-stats-sep" />

            <div className="budget-stat-item">
              <span className="budget-stat-label">Allocated</span>
              <span className="budget-stat-value" style={{ color: "var(--primary)" }}>
                {fmt(allocated)} PLN
              </span>
            </div>

            <div className="budget-stats-sep" />

            <div className="budget-stat-item">
              <span className="budget-stat-label">Spent</span>
              <span className="budget-stat-value" style={{ color: "var(--secondary)" }}>
                {fmt(totalSpent)} PLN
              </span>
            </div>

            <div className="budget-stats-sep" />

            <div className="budget-stat-item">
              <span className="budget-stat-label">Remaining</span>
              <span className="budget-stat-value" style={{ color: remaining >= 0 ? "var(--secondary)" : "var(--error)" }}>
                {remaining < 0 ? "-" : ""}{fmt(Math.abs(remaining))} PLN
              </span>
            </div>
          </div>
        </div>

        <div className="card budget-categories-card">
          <div className="budget-categories-header">
            <span className="budget-categories-title">Categories</span>
            <span className="transactions-count">{categories.length}</span>
          </div>

          {categories.length === 0 ? (
            <div className="empty-state" style={{ padding: "48px 24px" }}>
              <span className="icon">category</span>
              <h3>No categories yet</h3>
              <p>Add categories to start planning your monthly budget</p>
            </div>
          ) : (
            <div className="budget-categories-list">
              <div className="budget-cat-table-header">
                <span className="budget-cat-color-header" />
                <span className="budget-cat-header-name">Name</span>
                <span className="budget-cat-header-cost">Cost</span>
                <span className="budget-cat-header-spent">Spent</span>
                <span className="budget-cat-header-action" />
              </div>
              {categories.map((cat) => {
                const spent = spentByCategory.get(cat.id) ?? 0;
                const pct = cat.budget_amount > 0 ? (spent / cat.budget_amount) * 100 : 0;
                return (
                  <div key={cat.id} className="budget-category-row">
                    <span className="budget-cat-color-block" style={{ background: cat.color }} />
                    <div className="budget-cat-main">
                      <span className="budget-cat-name">{cat.name}</span>
                      <span className="budget-cat-bar-wrap">
                        <span className="budget-cat-bar" style={{ width: `${Math.min(pct, 100)}%`, background: cat.color }} />
                      </span>
                    </div>
                    <div className="budget-cat-amount-col">
                      <span className="budget-cat-amount">{fmt(cat.budget_amount)} PLN</span>
                    </div>
                    <div className="budget-cat-spent-col">
                      <span className="budget-cat-spent-value">{fmt(spent)} PLN</span>
                    </div>
                    <button
                      className="btn-ghost budget-cat-delete"
                      title="Remove"
                      onClick={() => void handleDeleteCategory(cat.id)}
                    >
                      <span className="icon icon--sm">delete</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="transactions-card budget-month-transactions-card">
        <div className="transactions-card-header">
          <div>
            <p className="transactions-card-title">This month's expenses</p>
            <p className="budget-card-sub">
              {unassignedItems.length} unassigned · {transferItems.length} transfers
            </p>
          </div>
          <span className="transactions-count">{items.length} total</span>
        </div>

        {loading ? (
          <div className="empty-state" style={{ padding: "48px 32px" }}>
            <span className="icon">hourglass_empty</span>
            <h3>Loading budget month</h3>
            <p>Preparing transaction references for this month.</p>
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state" style={{ padding: "48px 32px" }}>
            <span className="icon">receipt_long</span>
            <h3>No expenses this month</h3>
            <p>Transactions from the current month will appear here.</p>
          </div>
        ) : (
          items.map((tx) => {
            const selectedValue = tx.classification === "transfer"
              ? "transfer"
              : (tx.budget_category_id ? String(tx.budget_category_id) : "");
            return (
              <div key={tx.budget_item_id} className={`tx-row budget-tx-row${tx.classification === "transfer" ? " budget-tx-row--transfer" : ""}`}>
                <div className={`tx-icon${tx.classification === "transfer" ? " budget-transfer-icon" : ""}`}>
                  <span className="icon">{tx.classification === "transfer" ? "sync_alt" : categoryIcon(tx.category, tx.amount)}</span>
                </div>
                <div className="tx-main">
                  <p className="tx-desc" title={tx.description}>
                    {tx.description}
                  </p>
                  <p className="tx-meta">
                    {formatDate(tx.transaction_date)}
                    {tx.budget_category_name && (
                      <>
                        <span style={{ margin: "0 5px", opacity: 0.4 }}>·</span>
                        <span style={{ color: tx.budget_category_color ?? "var(--text-dim)" }}>{tx.budget_category_name}</span>
                      </>
                    )}
                    {tx.assignment_source === "rule" && (
                      <>
                        <span style={{ margin: "0 5px", opacity: 0.4 }}>·</span>
                        Rule
                      </>
                    )}
                    {tx.assignment_source === "manual" && (
                      <>
                        <span style={{ margin: "0 5px", opacity: 0.4 }}>·</span>
                        Manual
                      </>
                    )}
                    {tx.classification === "transfer" && (
                      <>
                        <span style={{ margin: "0 5px", opacity: 0.4 }}>·</span>
                        Transfer
                      </>
                    )}
                  </p>
                </div>
                <div className="budget-tx-actions">
                  <select
                    className="select budget-assign-select"
                    value={selectedValue}
                    onChange={(e) => void handleAssign(tx, e.target.value)}
                    title="Assign budget category"
                  >
                    <option value="">Assign...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                    <option value="transfer">Transfer / ignore</option>
                  </select>
                  <button
                    className="btn btn-secondary budget-transfer-btn"
                    title="Mark as bank transfer"
                    onClick={() => void handleAssign(tx, "transfer")}
                  >
                    <span className="icon icon--sm">sync_alt</span>
                    Transfer
                  </button>
                </div>
                <div className="tx-right">
                  <p className="tx-amount">
                    {formatPLN(tx.amount)}
                  </p>
                  <p className="tx-account-badge">{tx.currency}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showCategoryModal && (
        <div className="modal-overlay" onClick={() => setShowCategoryModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">New Category</span>
              <button className="btn-ghost" style={{ padding: "6px" }} onClick={() => setShowCategoryModal(false)}>
                <span className="icon icon--sm">close</span>
              </button>
            </div>
            <form className="modal-body" onSubmit={handleAddCategory}>
              <div className="form-group">
                <label className="form-label">Category name</label>
                <input
                  ref={categoryNameRef}
                  className="input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Food, Transport"
                  maxLength={60}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Monthly budget (PLN)</label>
                <input
                  className="input"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="e.g. 500"
                  type="number"
                  min="1"
                  step="0.01"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Color</label>
                <div className="color-swatches" style={{ gap: 8 }}>
                  {BUDGET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`color-swatch${newColor === c ? " color-swatch--active" : ""}`}
                      style={{ background: c, width: 22, height: 22 }}
                      onClick={() => setNewColor(c)}
                    />
                  ))}
                </div>
              </div>
              {categoryError && <p className="error-text">{categoryError}</p>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCategoryModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Category</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRuleModal && (
        <div className="modal-overlay" onClick={() => setShowRuleModal(false)}>
          <div className="modal budget-rule-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">New Rule</span>
              <button className="btn-ghost" style={{ padding: "6px" }} onClick={() => setShowRuleModal(false)}>
                <span className="icon icon--sm">close</span>
              </button>
            </div>
            <form className="modal-body" onSubmit={handleAddRule}>
              <div className="form-group">
                <label className="form-label">Text contains</label>
                <input
                  ref={ruleTextRef}
                  className="input"
                  value={ruleText}
                  onChange={(e) => setRuleText(e.target.value)}
                  placeholder="e.g. Lidl, Uber, salary transfer"
                  maxLength={120}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Assign to</label>
                <select
                  className="select"
                  value={ruleTarget}
                  onChange={(e) => setRuleTarget(e.target.value)}
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                  <option value="transfer">Transfer / ignore</option>
                </select>
              </div>
              {ruleError && <p className="error-text">{ruleError}</p>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRuleModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Rule</button>
              </div>
            </form>

            {rules.length > 0 && (
              <div className="budget-rules-list">
                {rules.map((rule) => {
                  const target = rule.classification === "transfer"
                    ? "Transfer / ignore"
                    : (categories.find((cat) => cat.id === rule.category_id)?.name ?? "Missing category");
                  return (
                    <div key={rule.id} className="budget-rule-row">
                      <div>
                        <p className="budget-rule-text">{rule.match_text}</p>
                        <p className="budget-rule-target">{target}</p>
                      </div>
                      <button
                        className="btn-ghost"
                        title="Remove rule"
                        onClick={() => void handleDeleteRule(rule.id)}
                      >
                        <span className="icon icon--sm">delete</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
