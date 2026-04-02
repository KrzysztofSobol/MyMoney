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

export interface ImportSummary {
  detectedFormat: string;
  parsedCount: number;
  importedCount: number;
  duplicateCount: number;
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
