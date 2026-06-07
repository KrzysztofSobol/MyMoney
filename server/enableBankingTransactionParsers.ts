import { createHash } from "node:crypto";
import type { BankCode, ParsedTransaction } from "./types";

type EnableBankingAmount = {
  currency?: string | null;
  amount?: string | number | null;
};

type EnableBankingParty = {
  name?: string | null;
};

type EnableBankingBankTransactionCode = {
  description?: string | null;
  code?: string | null;
  sub_code?: string | null;
};

export type EnableBankingTransaction = {
  entry_reference?: string | null;
  merchant_category_code?: string | null;
  transaction_amount?: EnableBankingAmount | null;
  creditor?: EnableBankingParty | null;
  debtor?: EnableBankingParty | null;
  bank_transaction_code?: EnableBankingBankTransactionCode | null;
  credit_debit_indicator?: "CRDT" | "DBIT" | string | null;
  status?: string | null;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  reference_number?: string | null;
  remittance_information?: string[] | null;
  note?: string | null;
  transaction_id?: string | null;
};

export type EnableBankingTransactionListResponse = {
  transactions?: EnableBankingTransaction[];
  continuation_key?: string | null;
};

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return null;
}

function normalizeAmount(value: string | number | null | undefined): number {
  const amount =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));

  if (!Number.isFinite(amount)) {
    throw new Error(`Unsupported Enable Banking amount: ${String(value)}`);
  }

  return amount;
}

function applyCreditDebitSign(amount: number, indicator: string | null | undefined): number {
  const normalized = indicator?.trim().toUpperCase();
  if (normalized === "DBIT") return amount > 0 ? -amount : amount;
  if (normalized === "CRDT") return amount < 0 ? Math.abs(amount) : amount;
  return amount;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || null;
}

function normalizeTextList(values: string[] | null | undefined): string | null {
  const normalized = values?.map(normalizeText).filter(Boolean) ?? [];
  return normalized.length ? normalized.join(" | ") : null;
}

function makeHash(parts: Array<string | number | null | undefined>): string {
  const source = parts
    .map((part) => String(part ?? "").trim().toLowerCase())
    .join("|");
  return createHash("sha256").update(source).digest("hex");
}

function assignUniqueHashes(transactions: ParsedTransaction[]): void {
  const seen = new Map<string, number>();
  for (const tx of transactions) {
    const baseHash = tx.csvHash;
    const count = seen.get(baseHash) ?? 0;
    seen.set(baseHash, count + 1);
    if (count > 0) {
      tx.csvHash = makeHash([baseHash, count]);
    }
  }
}

function getCounterparty(transaction: EnableBankingTransaction, amount: number): string | null {
  const primaryParty = amount < 0 ? transaction.creditor : transaction.debtor;
  const fallbackParty = amount < 0 ? transaction.debtor : transaction.creditor;
  return normalizeText(primaryParty?.name) ?? normalizeText(fallbackParty?.name);
}

function getDescription(transaction: EnableBankingTransaction): string {
  return (
    normalizeTextList(transaction.remittance_information) ??
    normalizeText(transaction.note) ??
    normalizeText(transaction.bank_transaction_code?.description) ??
    normalizeText(transaction.reference_number) ??
    normalizeText(transaction.entry_reference) ??
    `Enable Banking transaction ${String(transaction.transaction_id ?? "")}`.trim()
  );
}

export function parseEnableBankingTransactionList(
  bank: BankCode,
  payload: EnableBankingTransactionListResponse,
): ParsedTransaction[] {
  const parsed: ParsedTransaction[] = [];

  for (const transaction of payload.transactions ?? []) {
    const amount = applyCreditDebitSign(
      normalizeAmount(transaction.transaction_amount?.amount),
      transaction.credit_debit_indicator,
    );
    const transactionDate =
      normalizeDate(transaction.transaction_date) ??
      normalizeDate(transaction.booking_date) ??
      normalizeDate(transaction.value_date);

    if (!transactionDate) {
      throw new Error("Enable Banking transaction is missing transaction/booking/value date.");
    }

    const description = getDescription(transaction);
    const counterparty = getCounterparty(transaction, amount);
    const category =
      normalizeText(transaction.merchant_category_code) ??
      normalizeText(transaction.bank_transaction_code?.description);
    const externalId =
      normalizeText(transaction.transaction_id) ??
      normalizeText(transaction.entry_reference) ??
      normalizeText(transaction.reference_number);

    parsed.push({
      transactionDate,
      postingDate: normalizeDate(transaction.booking_date),
      amount,
      currency: normalizeText(transaction.transaction_amount?.currency) ?? "PLN",
      description,
      category,
      counterparty,
      csvHash: makeHash([
        bank,
        "enable-banking",
        externalId,
        transactionDate,
        amount,
        description,
        counterparty,
      ]),
    });
  }

  assignUniqueHashes(parsed);
  return parsed;
}
