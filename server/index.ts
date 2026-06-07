import "./env";
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
  getBankSyncCalls,
  getAllTransactions,
  getBankGroups,
  getTransactions,
  insertTransactionsWithDedup,
  updateAccount,
  updateBankGroup,
  updateTransactionCategory,
  saveEnableBankingSession,
  getEnableBankingSessions,
  deleteEnableBankingSession,
} from "./database";
import { parseCsvFile } from "./csvParser";
import { syncBankApiTransactions } from "./bankApiSync";
import { fetchEnableBankingSession, startEnableBankingAuth, authorizeEnableBankingSession } from "./enableBankingApiSource";
import type { BankCode } from "./types";

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
  const apiAccountId = String(req.body?.apiAccountId ?? "").trim() || null;
  if (!bankGroupId || !name) {
    res.status(400).send("bankGroupId and name are required.");
    return;
  }
  try {
    res.status(201).json(createAccount(bankGroupId, name, accountNumber, apiAccountId));
  } catch (error) {
    res.status(400).send((error as Error).message);
  }
});

app.put("/api/accounts/:id", (req, res) => {
  const id = Number(req.params.id);
  const name = String(req.body?.name ?? "").trim();
  const accountNumber = String(req.body?.accountNumber ?? "").trim() || null;
  const apiAccountId = String(req.body?.apiAccountId ?? "").trim() || null;
  if (!id || !name) {
    res.status(400).send("id and name are required.");
    return;
  }
  res.json(updateAccount(id, name, accountNumber, apiAccountId));
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

app.get("/api/bank-sync-calls", (req, res) => {
  const accountId = req.query.accountId ? Number(req.query.accountId) : undefined;
  if (req.query.accountId && !accountId) {
    res.status(400).send("accountId must be a number.");
    return;
  }
  res.json(getBankSyncCalls(accountId));
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

app.get("/api/enable-banking/sessions/:sessionId", async (req, res) => {
  const sessionId = String(req.params.sessionId ?? "").trim();
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required." });
    return;
  }
  try {
    const result = await fetchEnableBankingSession(sessionId);
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/enable-banking/auth", async (req, res) => {
  const aspspName = String(req.body?.aspspName ?? "").trim();
  const aspspCountry = String(req.body?.aspspCountry ?? "").trim();
  const redirectUrl = String(req.body?.redirectUrl ?? "").trim();
  const psuType = String(req.body?.psuType ?? "personal").trim();
  const validUntil = String(req.body?.validUntil ?? "").trim();
  const state = String(req.body?.state ?? "").trim();
  if (!aspspName || !aspspCountry || !redirectUrl || !validUntil || !state) {
    res.status(400).json({ error: "aspspName, aspspCountry, redirectUrl, validUntil and state are required." });
    return;
  }
  try {
    const result = await startEnableBankingAuth({ aspspName, aspspCountry, redirectUrl, psuType, validUntil, state });
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/enable-banking/sessions", (_req, res) => {
  const rows = getEnableBankingSessions();
  res.json(rows.map((r) => ({
    ...r,
    accounts: JSON.parse(r.accounts_json || "[]") as unknown[],
  })));
});

app.post("/api/enable-banking/sessions", async (req, res) => {
  const code = String(req.body?.code ?? "").trim();
  if (!code) {
    res.status(400).json({ error: "code is required." });
    return;
  }
  try {
    const result = await authorizeEnableBankingSession(code) as {
      session_id?: string;
      accounts?: { uid?: string; name?: string; account_id?: Record<string, string> }[];
      accounts_data?: { uid?: string }[];
      aspsp?: { name?: string; country?: string };
      access?: { valid_until?: string };
    };
    if (result.session_id) {
      const accounts = Array.isArray(result.accounts) && result.accounts.length > 0
        ? result.accounts
        : (result.accounts_data ?? []);
      saveEnableBankingSession({
        sessionId: result.session_id,
        aspspName: result.aspsp?.name ?? "",
        aspspCountry: result.aspsp?.country ?? "",
        validUntil: result.access?.valid_until ?? null,
        accounts,
      });
    }
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.delete("/api/enable-banking/sessions/:sessionId", async (req, res) => {
  const sessionId = String(req.params.sessionId ?? "").trim();
  deleteEnableBankingSession(sessionId);
  res.status(204).send();
});

app.post("/api/bank-api-sync", async (req, res) => {
  const bank = String(req.body?.bank ?? "").trim().toLowerCase() as BankCode;
  const accountId = Number(req.body?.accountId);
  if (!bank || !accountId) {
    res.status(400).send("bank and accountId are required.");
    return;
  }

  try {
    const result = await syncBankApiTransactions({
      bank,
      accountId,
      fromDate: req.body?.fromDate ? String(req.body.fromDate).trim() : null,
      toDate: req.body?.toDate ? String(req.body.toDate).trim() : null,
      fullHistory: Boolean(req.body?.fullHistory),
    });
    res.json(result);
  } catch (error) {
    const syncCall = (error as { syncCall?: unknown }).syncCall;
    const message = error instanceof Error ? error.message : String(error);
    if (syncCall) {
      res.status(502).json({ error: message, syncCall });
      return;
    }
    res.status(400).send(message);
  }
});

app.listen(port, () => {
  console.log(`MyMoney API listening on http://localhost:${port}`);
});
