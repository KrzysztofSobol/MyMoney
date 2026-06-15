export interface BankGroup {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface Account {
  id: number;
  bank_group_id: number;
  name: string;
  account_number: string | null;
  api_account_id: string | null;
  created_at: string;
}

export interface Transaction {
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

export interface BudgetCategory {
  id: number;
  name: string;
  color: string;
  budget_amount: number;
  created_at: string;
}

export interface BudgetRule {
  id: number;
  match_text: string;
  category_id: number | null;
  classification: "expense" | "transfer";
  created_at: string;
}

export interface BudgetMonth {
  id: number;
  year_month: string;
  created_at: string;
}

export interface BudgetMonthItem extends Transaction {
  budget_item_id: number;
  budget_month_id: number;
  transaction_id: number;
  budget_category_id: number | null;
  classification: "expense" | "transfer";
  assignment_source: "unassigned" | "rule" | "manual";
  rule_id: number | null;
  budget_category_name: string | null;
  budget_category_color: string | null;
}

export interface BudgetMonthData {
  month: BudgetMonth;
  items: BudgetMonthItem[];
}

export interface ImportSummary {
  detectedFormat: string;
  parsedCount: number;
  importedCount: number;
  duplicateCount: number;
}

export type BankCode = "mbank" | "pekao" | "credit_agricole";
export type TransactionSourceType = "file" | "api";
export type ApiProviderCode = "enable-banking";
export type SyncCallStatus = "success" | "failed";

export interface BankSyncCall {
  id: number;
  bank: BankCode;
  source_type: TransactionSourceType;
  api_provider: ApiProviderCode | null;
  account_id: number | null;
  status: SyncCallStatus;
  requested_from: string | null;
  requested_to: string | null;
  started_at: string;
  finished_at: string;
  imported_count: number;
  duplicate_count: number;
  error_message: string | null;
  created_at: string;
}

export interface BankApiSyncSummary {
  bank: BankCode;
  apiProvider: ApiProviderCode;
  sourceType: "api";
  accountId: number;
  externalAccountId: string;
  fromDate: string | null;
  toDate: string;
  parsedCount: number;
  importedCount: number;
  duplicateCount: number;
  syncCall: BankSyncCall;
}

// Predefined palette — cycles automatically when groups are created
export const GROUP_COLORS = [
  "#69daff", // cyan
  "#83fba5", // green
  "#c97cff", // purple
  "#ffb347", // orange
  "#ff8c8c", // salmon
  "#64b5f6", // blue
  "#ffd166", // yellow
  "#ff6b9d", // pink
] as const;

export type GroupColor = (typeof GROUP_COLORS)[number];
