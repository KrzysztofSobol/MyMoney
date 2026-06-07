import {
  enableBankingRequest,
  getEnableBankingConfig,
  type EnableBankingConfig,
} from "./enableBankingClient";
import {
  parseEnableBankingTransactionList,
  type EnableBankingTransactionListResponse,
} from "./enableBankingTransactionParsers";
import type { BankApiTransactionInput, ParsedTransaction } from "./types";

function validateDate(value: string | null | undefined, label: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD format.`);
  }
  return value;
}

function buildQuery(
  input: BankApiTransactionInput,
  config: EnableBankingConfig,
  continuationKey?: string,
): URLSearchParams {
  const params = new URLSearchParams();

  if (continuationKey) {
    params.set("continuation_key", continuationKey);
    return params;
  }

  const fromDate = validateDate(input.fromDate, "fromDate");
  const toDate = validateDate(input.toDate, "toDate");

  if (input.fullHistory) {
    // strategy=longest lets Enable Banking negotiate the max available history,
    // avoiding ASPSP_ERROR on banks with strict date windows.
    params.set("strategy", "longest");
    if (fromDate) params.set("date_from", fromDate);
  } else if (fromDate) {
    params.set("date_from", fromDate);
    if (toDate) params.set("date_to", toDate);
  }

  // Credit Agricole rejects the transaction_status filter.
  if (config.transactionStatus && input.bank !== "credit_agricole") {
    params.set("transaction_status", config.transactionStatus);
  }

  return params;
}

export async function fetchEnableBankingTransactions(
  input: BankApiTransactionInput,
): Promise<ParsedTransaction[]> {
  const config = getEnableBankingConfig();
  const externalAccountId = input.externalAccountId.trim();
  if (!externalAccountId) {
    throw new Error("Enable Banking account ID cannot be empty.");
  }

  const transactions: ParsedTransaction[] = [];
  let continuationKey: string | undefined;

  for (let page = 0; page < config.maxPages; page += 1) {
    const payload = await enableBankingRequest<EnableBankingTransactionListResponse>(
      config,
      "GET",
      `/accounts/${encodeURIComponent(externalAccountId)}/transactions`,
      { query: buildQuery(input, config, continuationKey) },
    );

    transactions.push(...parseEnableBankingTransactionList(input.bank, payload));
    continuationKey = payload.continuation_key ?? undefined;
    if (!continuationKey) return transactions;
  }

  throw new Error(`Enable Banking pagination exceeded ENABLE_BANKING_MAX_PAGES=${config.maxPages}.`);
}

export async function fetchEnableBankingSession(sessionId: string): Promise<unknown> {
  const config = getEnableBankingConfig();
  return enableBankingRequest(config, "GET", `/sessions/${encodeURIComponent(sessionId)}`);
}

export async function startEnableBankingAuth(input: {
  aspspName: string;
  aspspCountry: string;
  redirectUrl: string;
  psuType: string;
  validUntil: string;
  state: string;
}): Promise<{ url: string; authorization_id: string }> {
  const config = getEnableBankingConfig();
  return enableBankingRequest(config, "POST", "/auth", {
    body: {
      access: { valid_until: input.validUntil },
      aspsp: { name: input.aspspName, country: input.aspspCountry },
      state: input.state,
      redirect_url: input.redirectUrl,
      psu_type: input.psuType,
    },
  });
}

export async function authorizeEnableBankingSession(code: string): Promise<unknown> {
  const config = getEnableBankingConfig();
  return enableBankingRequest(config, "POST", "/sessions", { body: { code } });
}
