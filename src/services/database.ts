import type { Account, BankGroup, ImportSummary, Transaction } from "../types";

const JSON_HEADERS = { "Content-Type": "application/json" };

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }
  return (await response.json()) as T;
}

export async function getBankGroups(): Promise<BankGroup[]> {
  const response = await fetch("/api/bank-groups");
  return handleResponse<BankGroup[]>(response);
}

export async function createBankGroup(name: string, color: string): Promise<BankGroup> {
  const response = await fetch("/api/bank-groups", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, color }),
  });
  return handleResponse<BankGroup>(response);
}

export async function updateBankGroup(id: number, name: string, color?: string): Promise<BankGroup> {
  const response = await fetch(`/api/bank-groups/${id}`, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, color }),
  });
  return handleResponse<BankGroup>(response);
}

export async function deleteBankGroup(id: number): Promise<void> {
  const response = await fetch(`/api/bank-groups/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error((await response.text()) || "Failed to delete bank group");
}

export async function getAccounts(bankGroupId: number): Promise<Account[]> {
  const response = await fetch(`/api/accounts?bankGroupId=${bankGroupId}`);
  return handleResponse<Account[]>(response);
}

export async function createAccount(payload: {
  bankGroupId: number;
  name: string;
  accountNumber?: string;
}): Promise<Account> {
  const response = await fetch("/api/accounts", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  return handleResponse<Account>(response);
}

export async function updateAccount(payload: {
  id: number;
  name: string;
  accountNumber?: string;
}): Promise<Account> {
  const response = await fetch(`/api/accounts/${payload.id}`, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name: payload.name, accountNumber: payload.accountNumber }),
  });
  return handleResponse<Account>(response);
}

export async function deleteAccount(id: number): Promise<void> {
  const response = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error((await response.text()) || "Failed to delete account");
}

export async function getTransactions(accountId: number): Promise<Transaction[]> {
  const response = await fetch(`/api/transactions?accountId=${accountId}`);
  return handleResponse<Transaction[]>(response);
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const response = await fetch("/api/transactions/all");
  return handleResponse<Transaction[]>(response);
}

export async function importCsv(payload: {
  accountId: number;
  file: File;
}): Promise<ImportSummary> {
  const formData = new FormData();
  formData.append("accountId", String(payload.accountId));
  formData.append("file", payload.file);
  const response = await fetch("/api/import", { method: "POST", body: formData });
  return handleResponse<ImportSummary>(response);
}

export async function updateTransactionCategory(
  id: number,
  category: string | null,
): Promise<Transaction> {
  const response = await fetch(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ category }),
  });
  return handleResponse<Transaction>(response);
}

export async function deleteTransaction(id: number): Promise<void> {
  const response = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error((await response.text()) || "Failed to delete transaction");
}

export async function clearAccountTransactions(accountId: number): Promise<{ deleted: number }> {
  const response = await fetch(`/api/accounts/${accountId}/transactions`, { method: "DELETE" });
  return handleResponse<{ deleted: number }>(response);
}

export async function clearGroupTransactions(groupId: number): Promise<{ deleted: number }> {
  const response = await fetch(`/api/bank-groups/${groupId}/transactions`, { method: "DELETE" });
  return handleResponse<{ deleted: number }>(response);
}
