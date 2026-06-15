import Database from "better-sqlite3";
import type { ParsedTransaction } from "./types";

const db = new Database("mymoney.db");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS bank_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    color TEXT NOT NULL DEFAULT '#69daff',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_group_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    account_number TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(bank_group_id) REFERENCES bank_groups(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    transaction_date TEXT NOT NULL,
    posting_date TEXT,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'PLN',
    description TEXT NOT NULL,
    category TEXT,
    counterparty TEXT,
    csv_hash TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS budget_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    budget_amount REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS budget_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_text TEXT NOT NULL,
    category_id INTEGER,
    classification TEXT NOT NULL DEFAULT 'expense' CHECK(classification IN ('expense', 'transfer')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(category_id) REFERENCES budget_categories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS budget_months (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year_month TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS budget_month_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    budget_month_id INTEGER NOT NULL,
    transaction_id INTEGER NOT NULL,
    category_id INTEGER,
    classification TEXT NOT NULL DEFAULT 'expense' CHECK(classification IN ('expense', 'transfer')),
    assignment_source TEXT NOT NULL DEFAULT 'unassigned' CHECK(assignment_source IN ('unassigned', 'rule', 'manual')),
    rule_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(budget_month_id) REFERENCES budget_months(id) ON DELETE CASCADE,
    FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY(category_id) REFERENCES budget_categories(id) ON DELETE SET NULL,
    FOREIGN KEY(rule_id) REFERENCES budget_rules(id) ON DELETE SET NULL,
    UNIQUE(budget_month_id, transaction_id)
  );

  CREATE INDEX IF NOT EXISTS idx_budget_month_transactions_month
    ON budget_month_transactions(budget_month_id);

  CREATE INDEX IF NOT EXISTS idx_budget_month_transactions_transaction
    ON budget_month_transactions(transaction_id);
`);

// Add columns missing on databases created before these fields existed.
function addColumnIfMissing(sql: string): void {
  try {
    db.exec(sql);
  } catch {
    // Column already exists.
  }
}

addColumnIfMissing("ALTER TABLE bank_groups ADD COLUMN color TEXT NOT NULL DEFAULT '#69daff'");

const getHashStmt = db.prepare("SELECT 1 FROM transactions WHERE csv_hash = ?");
const insertTransactionStmt = db.prepare(`
  INSERT INTO transactions (
    account_id,
    transaction_date,
    posting_date,
    amount,
    currency,
    description,
    category,
    counterparty,
    csv_hash
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export function getBankGroups() {
  return db.prepare("SELECT * FROM bank_groups ORDER BY name").all();
}

export function createBankGroup(name: string, color: string) {
  const statement = db.prepare("INSERT INTO bank_groups (name, color) VALUES (?, ?)");
  const result = statement.run(name, color);
  return db.prepare("SELECT * FROM bank_groups WHERE id = ?").get(result.lastInsertRowid);
}

export function updateBankGroup(id: number, name: string, color?: string) {
  if (color !== undefined) {
    db.prepare("UPDATE bank_groups SET name = ?, color = ? WHERE id = ?").run(name, color, id);
  } else {
    db.prepare("UPDATE bank_groups SET name = ? WHERE id = ?").run(name, id);
  }
  return db.prepare("SELECT * FROM bank_groups WHERE id = ?").get(id);
}

export function deleteBankGroup(id: number) {
  return db.prepare("DELETE FROM bank_groups WHERE id = ?").run(id);
}

export function getAccounts(bankGroupId: number) {
  return db.prepare("SELECT * FROM accounts WHERE bank_group_id = ? ORDER BY name").all(bankGroupId);
}

export function createAccount(
  bankGroupId: number,
  name: string,
  accountNumber: string | null,
) {
  const statement = db.prepare(
    "INSERT INTO accounts (bank_group_id, name, account_number) VALUES (?, ?, ?)",
  );
  const result = statement.run(bankGroupId, name, accountNumber);
  return db.prepare("SELECT * FROM accounts WHERE id = ?").get(result.lastInsertRowid);
}

export function updateAccount(
  id: number,
  name: string,
  accountNumber: string | null,
) {
  db.prepare(
    "UPDATE accounts SET name = ?, account_number = ? WHERE id = ?",
  ).run(name, accountNumber, id);
  return db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
}

export function deleteAccount(id: number) {
  return db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
}

export function getTransactions(accountId: number) {
  return db
    .prepare("SELECT * FROM transactions WHERE account_id = ? ORDER BY transaction_date DESC, id DESC")
    .all(accountId);
}

export function getAllTransactions() {
  return db
    .prepare("SELECT * FROM transactions ORDER BY transaction_date DESC, id DESC")
    .all();
}

export function clearAccountTransactions(accountId: number) {
  return db.prepare("DELETE FROM transactions WHERE account_id = ?").run(accountId);
}

export function clearGroupTransactions(groupId: number) {
  return db
    .prepare(
      "DELETE FROM transactions WHERE account_id IN (SELECT id FROM accounts WHERE bank_group_id = ?)",
    )
    .run(groupId);
}

export function updateTransactionCategory(id: number, category: string | null) {
  db.prepare("UPDATE transactions SET category = ? WHERE id = ?").run(category, id);
  return db.prepare("SELECT * FROM transactions WHERE id = ?").get(id);
}

export function deleteTransaction(id: number) {
  return db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
}

export interface BudgetCategoryRow {
  id: number;
  name: string;
  color: string;
  budget_amount: number;
  created_at: string;
}

export interface BudgetRuleRow {
  id: number;
  match_text: string;
  category_id: number | null;
  classification: "expense" | "transfer";
  created_at: string;
}

interface BudgetTransactionRow {
  id: number;
  account_id: number;
  transaction_date: string;
  posting_date: string | null;
  amount: number;
  currency: string;
  description: string;
  category: string | null;
  counterparty: string | null;
  csv_hash: string;
  created_at: string;
}

function normalizeRuleText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getMatchingBudgetRule(tx: BudgetTransactionRow): BudgetRuleRow | null {
  const haystack = normalizeRuleText(
    `${tx.description} ${tx.counterparty ?? ""} ${tx.category ?? ""}`,
  );
  const rules = getBudgetRules();
  return rules.find((rule) => haystack.includes(normalizeRuleText(rule.match_text))) ?? null;
}

function getOrCreateBudgetMonthId(yearMonth: string): number {
  db.prepare("INSERT OR IGNORE INTO budget_months (year_month) VALUES (?)").run(yearMonth);
  const row = db
    .prepare("SELECT id FROM budget_months WHERE year_month = ?")
    .get(yearMonth) as { id: number };
  return row.id;
}

function materializeBudgetMonth(yearMonth: string): number {
  const budgetMonthId = getOrCreateBudgetMonthId(yearMonth);
  const txs = db
    .prepare(
      `SELECT *
       FROM transactions
       WHERE amount < 0 AND transaction_date LIKE ?
       ORDER BY transaction_date DESC, id DESC`,
    )
    .all(`${yearMonth}-%`) as BudgetTransactionRow[];

  const upsert = db.prepare(`
    INSERT INTO budget_month_transactions (
      budget_month_id,
      transaction_id,
      category_id,
      classification,
      assignment_source,
      rule_id,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(budget_month_id, transaction_id) DO UPDATE SET
      category_id = excluded.category_id,
      classification = excluded.classification,
      assignment_source = excluded.assignment_source,
      rule_id = excluded.rule_id,
      updated_at = CURRENT_TIMESTAMP
    WHERE budget_month_transactions.assignment_source != 'manual'
  `);

  const apply = db.transaction(() => {
    for (const tx of txs) {
      const rule = getMatchingBudgetRule(tx);
      const classification = rule?.classification ?? "expense";
      const categoryId = classification === "transfer" ? null : (rule?.category_id ?? null);
      const source = rule ? "rule" : "unassigned";
      upsert.run(
        budgetMonthId,
        tx.id,
        categoryId,
        classification,
        source,
        rule?.id ?? null,
      );
    }
  });
  apply();

  return budgetMonthId;
}

export function getBudgetCategories(): BudgetCategoryRow[] {
  return db
    .prepare("SELECT * FROM budget_categories ORDER BY name")
    .all() as BudgetCategoryRow[];
}

export function createBudgetCategory(name: string, color: string, budgetAmount: number) {
  const result = db
    .prepare("INSERT INTO budget_categories (name, color, budget_amount) VALUES (?, ?, ?)")
    .run(name, color, budgetAmount);
  return db
    .prepare("SELECT * FROM budget_categories WHERE id = ?")
    .get(result.lastInsertRowid) as BudgetCategoryRow;
}

export function deleteBudgetCategory(id: number) {
  return db.prepare("DELETE FROM budget_categories WHERE id = ?").run(id);
}

export function getBudgetRules(): BudgetRuleRow[] {
  return db
    .prepare("SELECT * FROM budget_rules ORDER BY id DESC")
    .all() as BudgetRuleRow[];
}

export function createBudgetRule(input: {
  matchText: string;
  categoryId: number | null;
  classification: "expense" | "transfer";
}) {
  const categoryId = input.classification === "transfer" ? null : input.categoryId;
  const result = db
    .prepare(
      "INSERT INTO budget_rules (match_text, category_id, classification) VALUES (?, ?, ?)",
    )
    .run(input.matchText, categoryId, input.classification);
  return db
    .prepare("SELECT * FROM budget_rules WHERE id = ?")
    .get(result.lastInsertRowid) as BudgetRuleRow;
}

export function deleteBudgetRule(id: number) {
  return db.prepare("DELETE FROM budget_rules WHERE id = ?").run(id);
}

export function getBudgetMonth(yearMonth: string) {
  const budgetMonthId = materializeBudgetMonth(yearMonth);
  const month = db
    .prepare("SELECT * FROM budget_months WHERE id = ?")
    .get(budgetMonthId);
  const items = db
    .prepare(
      `SELECT
         bmt.id AS budget_item_id,
         bmt.budget_month_id,
         bmt.transaction_id,
         bmt.category_id AS budget_category_id,
         bmt.classification,
         bmt.assignment_source,
         bmt.rule_id,
         t.id,
         t.account_id,
         t.transaction_date,
         t.posting_date,
         t.amount,
         t.currency,
         t.description,
         t.category,
         t.counterparty,
         t.csv_hash,
         t.created_at,
         bc.name AS budget_category_name,
         bc.color AS budget_category_color
       FROM budget_month_transactions bmt
       JOIN transactions t ON t.id = bmt.transaction_id
       LEFT JOIN budget_categories bc ON bc.id = bmt.category_id
       WHERE bmt.budget_month_id = ?
       ORDER BY t.transaction_date DESC, t.id DESC`,
    )
    .all(budgetMonthId);

  return { month, items };
}

export function assignBudgetTransaction(input: {
  yearMonth: string;
  transactionId: number;
  categoryId: number | null;
  classification: "expense" | "transfer";
}) {
  const tx = db.prepare("SELECT * FROM transactions WHERE id = ?").get(input.transactionId) as
    | BudgetTransactionRow
    | undefined;
  if (!tx || tx.amount >= 0 || !tx.transaction_date.startsWith(`${input.yearMonth}-`)) {
    throw new Error("Transaction is not an expense in this budget month.");
  }

  const budgetMonthId = getOrCreateBudgetMonthId(input.yearMonth);
  const categoryId = input.classification === "transfer" ? null : input.categoryId;
  db.prepare(`
    INSERT INTO budget_month_transactions (
      budget_month_id,
      transaction_id,
      category_id,
      classification,
      assignment_source,
      rule_id,
      updated_at
    ) VALUES (?, ?, ?, ?, 'manual', NULL, CURRENT_TIMESTAMP)
    ON CONFLICT(budget_month_id, transaction_id) DO UPDATE SET
      category_id = excluded.category_id,
      classification = excluded.classification,
      assignment_source = 'manual',
      rule_id = NULL,
      updated_at = CURRENT_TIMESTAMP
  `).run(budgetMonthId, input.transactionId, categoryId, input.classification);

  return getBudgetMonth(input.yearMonth);
}

export function insertTransactionsWithDedup(
  accountId: number,
  transactions: ParsedTransaction[],
): { importedCount: number; duplicateCount: number } {
  let importedCount = 0;
  let duplicateCount = 0;

  const transaction = db.transaction(() => {
    for (const item of transactions) {
      const exists = getHashStmt.get(item.csvHash);
      if (exists) {
        duplicateCount += 1;
        continue;
      }

      insertTransactionStmt.run(
        accountId,
        item.transactionDate,
        item.postingDate,
        item.amount,
        item.currency,
        item.description,
        item.category,
        item.counterparty,
        item.csvHash,
      );
      importedCount += 1;
    }
  });

  transaction();
  return { importedCount, duplicateCount };
}
