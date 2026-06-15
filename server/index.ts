import "./env";
import cors from "cors";
import express from "express";
import multer from "multer";
import {
  clearAccountTransactions,
  clearGroupTransactions,
  createBudgetCategory,
  createBudgetRule,
  createAccount,
  createBankGroup,
  deleteBudgetCategory,
  deleteBudgetRule,
  deleteAccount,
  deleteBankGroup,
  deleteTransaction,
  getAccounts,
  getAllTransactions,
  getBankGroups,
  getBudgetCategories,
  getBudgetMonth,
  getBudgetRules,
  getTransactions,
  insertTransactionsWithDedup,
  assignBudgetTransaction,
  updateAccount,
  updateBankGroup,
  updateTransactionCategory,
} from "./database";
import { parseCsvFile } from "./csvParser";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const port = 5174;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/bank-groups", (_req, res) => {
  res.json(getBankGroups());
});

app.post("/api/bank-groups", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const color = String(req.body?.color ?? "#69daff").trim();
  if (!name) {
    res.status(400).send("Bank group name is required.");
    return;
  }
  try {
    res.status(201).json(createBankGroup(name, color));
  } catch (error) {
    res.status(400).send((error as Error).message);
  }
});

app.put("/api/bank-groups/:id", (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body?.name ?? "").trim();
  const color = req.body?.color ? String(req.body.color).trim() : undefined;
  if (!id || !name) {
    res.status(400).send("id and name are required.");
    return;
  }
  try {
    res.json(updateBankGroup(id, name, color));
  } catch (error) {
    res.status(400).send((error as Error).message);
  }
});

app.delete("/api/bank-groups/:id/transactions", (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).send("id is required."); return; }
  const info = clearGroupTransactions(id);
  res.json({ deleted: info.changes });
});

app.delete("/api/bank-groups/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).send("id is required.");
    return;
  }
  deleteBankGroup(id);
  res.status(204).send();
});

app.get("/api/accounts", (req, res) => {
  const bankGroupId = Number(req.query.bankGroupId);
  if (!bankGroupId) {
    res.status(400).send("bankGroupId is required.");
    return;
  }
  res.json(getAccounts(bankGroupId));
});

app.post("/api/accounts", (req, res) => {
  const bankGroupId = Number(req.body?.bankGroupId);
  const name = String(req.body?.name ?? "").trim();
  const accountNumber = String(req.body?.accountNumber ?? "").trim() || null;
  if (!bankGroupId || !name) {
    res.status(400).send("bankGroupId and name are required.");
    return;
  }
  try {
    res.status(201).json(createAccount(bankGroupId, name, accountNumber));
  } catch (error) {
    res.status(400).send((error as Error).message);
  }
});

app.put("/api/accounts/:id", (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body?.name ?? "").trim();
  const accountNumber = String(req.body?.accountNumber ?? "").trim() || null;
  if (!id || !name) {
    res.status(400).send("id and name are required.");
    return;
  }
  res.json(updateAccount(id, name, accountNumber));
});

app.delete("/api/accounts/:id/transactions", (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).send("id is required."); return; }
  const info = clearAccountTransactions(id);
  res.json({ deleted: info.changes });
});

app.delete("/api/accounts/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).send("id is required.");
    return;
  }
  deleteAccount(id);
  res.status(204).send();
});

app.get("/api/transactions/all", (_req, res) => {
  res.json(getAllTransactions());
});

app.get("/api/transactions", (req, res) => {
  const accountId = Number(req.query.accountId);
  if (!accountId) {
    res.status(400).send("accountId is required.");
    return;
  }
  res.json(getTransactions(accountId));
});

function isYearMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

app.get("/api/budget/categories", (_req, res) => {
  res.json(getBudgetCategories());
});

app.post("/api/budget/categories", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const color = String(req.body?.color ?? "#69daff").trim();
  const budgetAmount = Number(req.body?.budgetAmount);
  if (!name || !Number.isFinite(budgetAmount) || budgetAmount <= 0) {
    res.status(400).send("name and positive budgetAmount are required.");
    return;
  }
  res.status(201).json(createBudgetCategory(name, color, budgetAmount));
});

app.delete("/api/budget/categories/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).send("id is required.");
    return;
  }
  deleteBudgetCategory(id);
  res.status(204).send();
});

app.get("/api/budget/rules", (_req, res) => {
  res.json(getBudgetRules());
});

app.post("/api/budget/rules", (req, res) => {
  const matchText = String(req.body?.matchText ?? "").trim();
  const classification = req.body?.classification === "transfer" ? "transfer" : "expense";
  const categoryId = req.body?.categoryId ? Number(req.body.categoryId) : null;
  if (!matchText) {
    res.status(400).send("matchText is required.");
    return;
  }
  if (classification === "expense" && !categoryId) {
    res.status(400).send("categoryId is required for expense rules.");
    return;
  }
  res.status(201).json(createBudgetRule({ matchText, categoryId, classification }));
});

app.delete("/api/budget/rules/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).send("id is required.");
    return;
  }
  deleteBudgetRule(id);
  res.status(204).send();
});

app.get("/api/budget/months/:yearMonth", (req, res) => {
  const yearMonth = String(req.params.yearMonth ?? "").trim();
  if (!isYearMonth(yearMonth)) {
    res.status(400).send("yearMonth must be YYYY-MM.");
    return;
  }
  res.json(getBudgetMonth(yearMonth));
});

app.put("/api/budget/months/:yearMonth/transactions/:transactionId", (req, res) => {
  const yearMonth = String(req.params.yearMonth ?? "").trim();
  const transactionId = Number(req.params.transactionId);
  const classification = req.body?.classification === "transfer" ? "transfer" : "expense";
  const categoryId = req.body?.categoryId ? Number(req.body.categoryId) : null;
  if (!isYearMonth(yearMonth) || !transactionId) {
    res.status(400).send("yearMonth and transactionId are required.");
    return;
  }
  if (classification === "expense" && !categoryId) {
    res.status(400).send("categoryId is required for expense assignment.");
    return;
  }
  try {
    res.json(assignBudgetTransaction({ yearMonth, transactionId, categoryId, classification }));
  } catch (error) {
    res.status(400).send((error as Error).message);
  }
});

app.patch("/api/transactions/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).send("id is required.");
    return;
  }
  const category = req.body?.category ? String(req.body.category).trim() : null;
  res.json(updateTransactionCategory(id, category));
});

app.delete("/api/transactions/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).send("id is required.");
    return;
  }
  deleteTransaction(id);
  res.status(204).send();
});

app.post("/api/import", upload.single("file"), (req, res) => {
  const accountId = Number(req.body?.accountId);
  const file = req.file;
  if (!accountId || !file) {
    res.status(400).send("accountId and CSV file are required.");
    return;
  }
  try {
    const parsed = parseCsvFile(file.buffer);
    const result = insertTransactionsWithDedup(accountId, parsed.transactions);
    res.json({
      detectedFormat: parsed.detectedFormat,
      parsedCount: parsed.transactions.length,
      importedCount: result.importedCount,
      duplicateCount: result.duplicateCount,
    });
  } catch (error) {
    res.status(400).send((error as Error).message);
  }
});

app.listen(port, () => {
  console.log(`MyMoney API listening on http://localhost:${port}`);
});
