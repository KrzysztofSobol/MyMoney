export interface ParsedTransaction {
  transactionDate: string;
  postingDate: string | null;
  amount: number;
  currency: string;
  description: string;
  category: string | null;
  counterparty: string | null;
  csvHash: string;
}

export const BANK_CODES = {
  MBANK: "mbank",
  PEKAO: "pekao",
  CREDIT_AGRICOLE: "credit_agricole",
} as const;

export type BankCode = (typeof BANK_CODES)[keyof typeof BANK_CODES];

export const TRANSACTION_SOURCE_TYPES = {
  FILE: "file",
  API: "api",
} as const;

export type TransactionSourceType =
  (typeof TRANSACTION_SOURCE_TYPES)[keyof typeof TRANSACTION_SOURCE_TYPES];

export const API_PROVIDER_CODES = {
  ENABLE_BANKING: "enable-banking",
} as const;

export type ApiProviderCode =
  (typeof API_PROVIDER_CODES)[keyof typeof API_PROVIDER_CODES];

export const SYNC_CALL_STATUSES = {
  SUCCESS: "success",
  FAILED: "failed",
} as const;

export type SyncCallStatus =
  (typeof SYNC_CALL_STATUSES)[keyof typeof SYNC_CALL_STATUSES];

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

export interface BankApiTransactionInput {
  bank: BankCode;
  externalAccountId: string;
  fromDate: string | null;
  toDate: string;
  fullHistory: boolean;
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
