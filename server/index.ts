import cors from "cors";
import express from "express";
import multer from "multer";
import {
  clearAccountTransactions,
  clearGroupTransactions,
  createAccount,
  createBankGroup,
  deleteAccount,
  deleteBankGroup,
  deleteTransaction,
  getAccounts,
  getAllTransactions,
  getBankGroups,
  getTransactions,
  insertTransactionsWithDedup,
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
