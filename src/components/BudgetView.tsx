import { useEffect, useRef, useState } from "react";

export interface BudgetCategory {
  id: number;
  name: string;
  color: string;
  budgetAmount: number;
}

interface BudgetData {
  monthlyIncome: number;
  categories: BudgetCategory[];
}

const STORAGE_KEY = "mymoney_budget_v1";

const BUDGET_COLORS = [
  "#69daff", "#83fba5", "#c97cff", "#ffb347",
  "#ff8c8c", "#64b5f6", "#ffd166", "#ff6b9d",
  "#00d4aa", "#ff6b35", "#a8e6cf", "#e8a0bf",
];

function loadBudget(): BudgetData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as BudgetData;
  } catch { /* ignore */ }
  return { monthlyIncome: 0, categories: [] };
}

function saveBudget(data: BudgetData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function fmt(n: number): string {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

interface DonutProps {
  income: number;
  categories: BudgetCategory[];
}

function DonutChart({ income, categories }: DonutProps) {
  const cx = 140, cy = 140, R = 112, r = 70, W = 280;
  const allocated = categories.reduce((s, c) => s + c.budgetAmount, 0);

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
    ...categories.map((c) => ({ color: c.color, value: c.budgetAmount })),
    ...(unallocated > 0 ? [{ color: "#2a2a2b", value: unallocated }] : []),
  ];

  const GAP = segments.length > 1 ? 0.022 : 0;
  let angle = -Math.PI / 2;
  const paths: React.ReactNode[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const sweep = (seg.value / total) * 2 * Math.PI;
    const endAngle = angle + sweep;
    const aStart = angle + GAP / 2;
    const aEnd = endAngle - GAP / 2;

    if (aEnd - aStart > 0.01) {
      const large = aEnd - aStart > Math.PI ? 1 : 0;
      const x1 = cx + R * Math.cos(aStart), y1 = cy + R * Math.sin(aStart);
      const x2 = cx + R * Math.cos(aEnd),   y2 = cy + R * Math.sin(aEnd);
      const x3 = cx + r * Math.cos(aEnd),   y3 = cy + r * Math.sin(aEnd);
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

export function BudgetView() {
  const [budget, setBudget] = useState<BudgetData>(loadBudget);
  const [showModal, setShowModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState("");
  const incomeRef = useRef<HTMLInputElement>(null);

  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newColor, setNewColor] = useState(BUDGET_COLORS[0]);
  const [modalError, setModalError] = useState<string | null>(null);
  const modalNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingIncome) incomeRef.current?.focus();
  }, [editingIncome]);

  useEffect(() => {
    if (showModal) modalNameRef.current?.focus();
  }, [showModal]);

  function persist(data: BudgetData) {
    setBudget(data);
    saveBudget(data);
  }

  function openModal() {
    setNewName("");
    setNewAmount("");
    setNewColor(BUDGET_COLORS[budget.categories.length % BUDGET_COLORS.length]);
    setModalError(null);
    setShowModal(true);
  }

  function handleSaveIncome(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(incomeInput);
    if (!isNaN(val) && val >= 0) persist({ ...budget, monthlyIncome: val });
    setEditingIncome(false);
  }

  function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    const amount = parseFloat(newAmount);
    if (!name) { setModalError("Podaj nazwę kategorii"); return; }
    if (isNaN(amount) || amount <= 0) { setModalError("Podaj poprawną kwotę"); return; }

    persist({
      ...budget,
      categories: [
        ...budget.categories,
        { id: Date.now(), name, color: newColor, budgetAmount: amount },
      ],
    });
    setShowModal(false);
  }

  function handleDelete(id: number) {
    persist({ ...budget, categories: budget.categories.filter((c) => c.id !== id) });
  }

  const { monthlyIncome, categories } = budget;
  const allocated = categories.reduce((s, c) => s + c.budgetAmount, 0);
  const remaining = monthlyIncome - allocated;

  const currentMonth = new Date().toLocaleDateString("pl-PL", { month: "long", year: "numeric" });

  return (
    <div className="budget-view">
      <div className="budget-page-header">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <p className="page-header-label">Finanse</p>
          <h2 className="page-header-title">Budget</h2>
          <p className="page-header-sub">{currentMonth}</p>
        </div>
        <button className="btn btn-primary" onClick={openModal}>
          <span className="icon icon--sm">add</span>
          Add Category
        </button>
      </div>

      {/* Full-width chart card */}
      <div className="card budget-chart-card">
        <DonutChart income={monthlyIncome} categories={categories} />

        <div className="budget-stats-row">
          {/* Monthly Income */}
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
                  {monthlyIncome > 0 ? `${fmt(monthlyIncome)} PLN` : "—"}
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
            <span className="budget-stat-label">Remaining</span>
            <span className="budget-stat-value" style={{ color: remaining >= 0 ? "var(--secondary)" : "var(--error)" }}>
              {remaining < 0 ? "-" : ""}{fmt(Math.abs(remaining))} PLN
            </span>
          </div>
        </div>
      </div>

      {/* Categories list */}
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
          <div>
            {categories.map((cat) => {
              const pct = monthlyIncome > 0 ? (cat.budgetAmount / monthlyIncome) * 100 : 0;
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
                    <span className="budget-cat-amount">{fmt(cat.budgetAmount)} PLN</span>
                  </div>
                  <div className="budget-cat-spent-col">
                    <span className="budget-cat-spent-label">Spent</span>
                    <span className="budget-cat-spent-value">—</span>
                  </div>
                  <button
                    className="btn-ghost budget-cat-delete"
                    title="Remove"
                    onClick={() => handleDelete(cat.id)}
                  >
                    <span className="icon icon--sm">delete</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Category Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">New Category</span>
              <button className="btn-ghost" style={{ padding: "6px" }} onClick={() => setShowModal(false)}>
                <span className="icon icon--sm">close</span>
              </button>
            </div>
            <form className="modal-body" onSubmit={handleAddCategory}>
              <div className="form-group">
                <label className="form-label">Category name</label>
                <input
                  ref={modalNameRef}
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
              {modalError && <p className="error-text">{modalError}</p>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Category</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
