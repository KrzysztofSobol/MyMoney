import type {
  Account,
  BankGroup,
  BudgetCategory,
  BudgetMonthData,
  BudgetRule,
  ImportSummary,
  Transaction,
} from "../types";

const JSON_HEADERS = { "Content-Type": "application/json" };

async function handleResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      message = parsed.error ?? text;
    } catch {
      /* plain text error */
    }
    throw new Error(message || "Request failed");
  }
  return (text ? JSON.parse(text) : undefined) as T;
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
    body: JSON.stringify({
      name: payload.name,
      accountNumber: payload.accountNumber,
    }),
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

export async function getBudgetCategories(): Promise<BudgetCategory[]> {
  const response = await fetch("/api/budget/categories");
  return handleResponse<BudgetCategory[]>(response);
}

export async function createBudgetCategory(payload: {
  name: string;
  color: string;
  budgetAmount: number;
}): Promise<BudgetCategory> {
  const response = await fetch("/api/budget/categories", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  return handleResponse<BudgetCategory>(response);
}

export async function deleteBudgetCategory(id: number): Promise<void> {
  const response = await fetch(`/api/budget/categories/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error((await response.text()) || "Failed to delete budget category");
}

export async function getBudgetRules(): Promise<BudgetRule[]> {
  const response = await fetch("/api/budget/rules");
  return handleResponse<BudgetRule[]>(response);
}

export async function createBudgetRule(payload: {
  matchText: string;
  categoryId: number | null;
  classification: "expense" | "transfer";
}): Promise<BudgetRule> {
  const response = await fetch("/api/budget/rules", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
  return handleResponse<BudgetRule>(response);
}

export async function deleteBudgetRule(id: number): Promise<void> {
  const response = await fetch(`/api/budget/rules/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error((await response.text()) || "Failed to delete budget rule");
}

export async function getBudgetMonth(yearMonth: string): Promise<BudgetMonthData> {
  const response = await fetch(`/api/budget/months/${yearMonth}`);
  return handleResponse<BudgetMonthData>(response);
}

export async function assignBudgetTransaction(payload: {
  yearMonth: string;
  transactionId: number;
  categoryId: number | null;
  classification: "expense" | "transfer";
}): Promise<BudgetMonthData> {
  const response = await fetch(
    `/api/budget/months/${payload.yearMonth}/transactions/${payload.transactionId}`,
    {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        categoryId: payload.categoryId,
        classification: payload.classification,
      }),
    },
  );
  return handleResponse<BudgetMonthData>(response);
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
