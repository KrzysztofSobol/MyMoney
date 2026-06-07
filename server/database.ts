import Database from "better-sqlite3";
import type {
  ApiProviderCode,
  BankCode,
  BankSyncCall,
  ParsedTransaction,
  SyncCallStatus,
  TransactionSourceType,
} from "./types";

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
    api_account_id TEXT,
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

  CREATE TABLE IF NOT EXISTS bank_sync_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank TEXT NOT NULL,
    source_type TEXT NOT NULL,
    api_provider TEXT,
    account_id INTEGER,
    status TEXT NOT NULL CHECK(status IN ('success', 'failed')),
    requested_from TEXT,
    requested_to TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    imported_count INTEGER NOT NULL DEFAULT 0,
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_bank_sync_calls_lookup
    ON bank_sync_calls(bank, source_type, account_id, status, finished_at);

  CREATE INDEX IF NOT EXISTS idx_bank_sync_calls_provider_lookup
    ON bank_sync_calls(bank, source_type, api_provider, account_id, status, finished_at);

  CREATE TABLE IF NOT EXISTS enable_banking_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    aspsp_name TEXT NOT NULL,
    aspsp_country TEXT NOT NULL,
    valid_until TEXT,
    accounts_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
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
addColumnIfMissing("ALTER TABLE accounts ADD COLUMN api_account_id TEXT");
addColumnIfMissing("ALTER TABLE bank_sync_calls ADD COLUMN api_provider TEXT");

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

export function getAccountById(id: number) {
  return db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as
    | {
        id: number;
        bank_group_id: number;
        name: string;
        account_number: string | null;
        api_account_id: string | null;
      }
    | undefined;
}

export function createAccount(
  bankGroupId: number,
  name: string,
  accountNumber: string | null,
  apiAccountId: string | null,
) {
  const statement = db.prepare(
    "INSERT INTO accounts (bank_group_id, name, account_number, api_account_id) VALUES (?, ?, ?, ?)",
  );
  const result = statement.run(bankGroupId, name, accountNumber, apiAccountId);
  return db.prepare("SELECT * FROM accounts WHERE id = ?").get(result.lastInsertRowid);
}

export function updateAccount(
  id: number,
  name: string,
  accountNumber: string | null,
  apiAccountId: string | null,
) {
  db.prepare(
    "UPDATE accounts SET name = ?, account_number = ?, api_account_id = ? WHERE id = ?",
  ).run(name, accountNumber, apiAccountId, id);
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

export function getLastSuccessfulBankSyncCall(
  accountId: number,
  bank: BankCode,
  sourceType: TransactionSourceType,
  apiProvider: ApiProviderCode | null,
): BankSyncCall | undefined {
  return db
    .prepare(
      `SELECT *
       FROM bank_sync_calls
       WHERE account_id = ?
         AND bank = ?
         AND source_type = ?
         AND COALESCE(api_provider, '') = COALESCE(?, '')
         AND status = 'success'
       ORDER BY datetime(finished_at) DESC, id DESC
       LIMIT 1`,
    )
    .get(accountId, bank, sourceType, apiProvider) as BankSyncCall | undefined;
}

export function getBankSyncCalls(accountId?: number): BankSyncCall[] {
  if (accountId) {
    return db
      .prepare(
        `SELECT *
         FROM bank_sync_calls
         WHERE account_id = ?
         ORDER BY datetime(started_at) DESC, id DESC`,
      )
      .all(accountId) as BankSyncCall[];
  }

  return db
    .prepare("SELECT * FROM bank_sync_calls ORDER BY datetime(started_at) DESC, id DESC")
    .all() as BankSyncCall[];
}

export function insertBankSyncCall(input: {
  bank: BankCode;
  sourceType: TransactionSourceType;
  apiProvider: ApiProviderCode | null;
  accountId: number;
  status: SyncCallStatus;
  requestedFrom: string | null;
  requestedTo: string | null;
  startedAt: string;
  finishedAt: string;
  importedCount: number;
  duplicateCount: number;
  errorMessage: string | null;
}): BankSyncCall {
  const result = db
    .prepare(
      `INSERT INTO bank_sync_calls (
        bank,
        source_type,
        api_provider,
        account_id,
        status,
        requested_from,
        requested_to,
        started_at,
        finished_at,
        imported_count,
        duplicate_count,
        error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.bank,
      input.sourceType,
      input.apiProvider,
      input.accountId,
      input.status,
      input.requestedFrom,
      input.requestedTo,
      input.startedAt,
      input.finishedAt,
      input.importedCount,
      input.duplicateCount,
      input.errorMessage,
    );

  return db
    .prepare("SELECT * FROM bank_sync_calls WHERE id = ?")
    .get(result.lastInsertRowid) as BankSyncCall;
}

export function saveEnableBankingSession(input: {
  sessionId: string;
  aspspName: string;
  aspspCountry: string;
  validUntil: string | null;
  accounts: { uid?: string; name?: string; account_id?: Record<string, string> }[];
}) {
  db.prepare(`
    INSERT INTO enable_banking_sessions (session_id, aspsp_name, aspsp_country, valid_until, accounts_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      valid_until = excluded.valid_until,
      accounts_json = excluded.accounts_json
  `).run(
    input.sessionId,
    input.aspspName,
    input.aspspCountry,
    input.validUntil,
    JSON.stringify(input.accounts),
  );
  return db.prepare("SELECT * FROM enable_banking_sessions WHERE session_id = ?").get(input.sessionId);
}

export function getEnableBankingSessions() {
  return db.prepare("SELECT * FROM enable_banking_sessions ORDER BY created_at DESC").all() as {
    id: number;
    session_id: string;
    aspsp_name: string;
    aspsp_country: string;
    valid_until: string | null;
    accounts_json: string;
    created_at: string;
  }[];
}

export function deleteEnableBankingSession(sessionId: string) {
  return db.prepare("DELETE FROM enable_banking_sessions WHERE session_id = ?").run(sessionId);
}
