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
`);

// Safe migration: add color column if it doesn't exist yet (existing DBs won't have it)
try {
  db.exec("ALTER TABLE bank_groups ADD COLUMN color TEXT NOT NULL DEFAULT '#69daff'");
} catch {
  // Column already exists — no-op
}

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

export function createAccount(bankGroupId: number, name: string, accountNumber: string | null) {
  const statement = db.prepare(
    "INSERT INTO accounts (bank_group_id, name, account_number) VALUES (?, ?, ?)",
  );
  const result = statement.run(bankGroupId, name, accountNumber);
  return db.prepare("SELECT * FROM accounts WHERE id = ?").get(result.lastInsertRowid);
}

export function updateAccount(id: number, name: string, accountNumber: string | null) {
  db.prepare("UPDATE accounts SET name = ?, account_number = ? WHERE id = ?").run(
    name,
    accountNumber,
    id,
  );
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
