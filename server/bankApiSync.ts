import {
  getAccountById,
  getLastSuccessfulBankSyncCall,
  insertBankSyncCall,
  insertTransactionsWithDedup,
} from "./database";
import { fetchEnableBankingTransactions } from "./enableBankingApiSource";
import {
  API_PROVIDER_CODES,
  BANK_CODES,
  SYNC_CALL_STATUSES,
  TRANSACTION_SOURCE_TYPES,
  type BankApiSyncSummary,
  type BankCode,
  type BankSyncCall,
} from "./types";

const SUPPORTED_BANKS = new Set<BankCode>([
  BANK_CODES.MBANK,
  BANK_CODES.PEKAO,
  BANK_CODES.CREDIT_AGRICOLE,
]);

type BankApiSyncInput = {
  bank: BankCode;
  accountId: number;
  fromDate?: string | null;
  toDate?: string | null;
  fullHistory?: boolean;
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value: string | null | undefined, label: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD format.`);
  }
  return value;
}

function normalizeBank(value: BankCode): BankCode {
  if (!SUPPORTED_BANKS.has(value)) {
    throw new Error(`Unsupported bank '${value}'.`);
  }
  return value;
}

function getSyncFromDate(input: BankApiSyncInput, lastSuccess?: BankSyncCall): string | null {
  if (input.fullHistory) return normalizeDate(input.fromDate, "fromDate") ?? "2000-01-01";

  const explicitFrom = normalizeDate(input.fromDate, "fromDate");
  if (explicitFrom) return explicitFrom;

  return lastSuccess?.requested_to ?? null;
}

function looksLikeUuid(value: string | null | undefined): boolean {
  return Boolean(
    value?.trim().match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ),
  );
}

function getExternalAccountId(account: {
  account_number: string | null;
  api_account_id: string | null;
}): string | null {
  const apiAccountId = account.api_account_id?.trim();
  if (apiAccountId) return apiAccountId;

  const accountNumber = account.account_number?.trim();
  return accountNumber && looksLikeUuid(accountNumber) ? accountNumber : null;
}

export async function syncBankApiTransactions(
  input: BankApiSyncInput,
): Promise<BankApiSyncSummary> {
  const bank = normalizeBank(input.bank);
  const account = getAccountById(input.accountId);
  if (!account) {
    throw new Error(`Account ${input.accountId} was not found.`);
  }
  const externalAccountId = getExternalAccountId(account);
  if (!externalAccountId) {
    throw new Error(
      "Selected account must have Enable Banking account ID set before API sync.",
    );
  }

  const lastSuccess = getLastSuccessfulBankSyncCall(
    input.accountId,
    bank,
    TRANSACTION_SOURCE_TYPES.API,
    API_PROVIDER_CODES.ENABLE_BANKING,
  );
  // First sync (no prior success) fetches full history via strategy=longest.
  const isFirstSync = !lastSuccess;
  const fromDate = getSyncFromDate(input, lastSuccess) ?? null;
  const toDate = normalizeDate(input.toDate, "toDate") ?? todayIsoDate();
  const fullHistory = Boolean(input.fullHistory || isFirstSync);
  const startedAt = new Date().toISOString();

  try {
    const transactions = await fetchEnableBankingTransactions({
      bank,
      externalAccountId,
      fromDate,
      toDate,
      fullHistory,
    });
    const result = insertTransactionsWithDedup(input.accountId, transactions);
    const finishedAt = new Date().toISOString();
    const syncCall = insertBankSyncCall({
      bank,
      sourceType: TRANSACTION_SOURCE_TYPES.API,
      apiProvider: API_PROVIDER_CODES.ENABLE_BANKING,
      accountId: input.accountId,
      status: SYNC_CALL_STATUSES.SUCCESS,
      requestedFrom: fromDate,
      requestedTo: toDate,
      startedAt,
      finishedAt,
      importedCount: result.importedCount,
      duplicateCount: result.duplicateCount,
      errorMessage: null,
    });

    return {
      bank,
      apiProvider: API_PROVIDER_CODES.ENABLE_BANKING,
      sourceType: TRANSACTION_SOURCE_TYPES.API,
      accountId: input.accountId,
      externalAccountId,
      fromDate,
      toDate,
      parsedCount: transactions.length,
      importedCount: result.importedCount,
      duplicateCount: result.duplicateCount,
      syncCall,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    const syncCall = insertBankSyncCall({
      bank,
      sourceType: TRANSACTION_SOURCE_TYPES.API,
      apiProvider: API_PROVIDER_CODES.ENABLE_BANKING,
      accountId: input.accountId,
      status: SYNC_CALL_STATUSES.FAILED,
      requestedFrom: fromDate,
      requestedTo: toDate,
      startedAt,
      finishedAt,
      importedCount: 0,
      duplicateCount: 0,
      errorMessage: message,
    });

    const wrapped = new Error(message);
    Object.assign(wrapped, { syncCall });
    throw wrapped;
  }
}
