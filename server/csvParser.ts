import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";
import type { ParsedTransaction } from "./types";

const MBANK_LIST_HEADER =
  "#Data operacji;#Opis operacji;#Rachunek;#Kategoria;#Kwota";
const MBANK_STMT_HEADER =
  "#Data księgowania;#Data operacji;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji";
const PEKAO_HEADER_PREFIX = "Data księgowania;Data waluty;";

function stripTrailingSemicolons(line: string): string {
  return line.replace(/;+$/, "");
}

function decodeCsv(buffer: Buffer): string {
  const utf8 = buffer.toString("utf8");

  // If valid Polish chars are present in UTF-8, the file is genuinely UTF-8.
  // Windows-1250 files decoded as UTF-8 produce garbled chars like ³ instead of ł,
  // ¿ instead of ż, etc. — check for a known Polish word spelled correctly.
  const looksLikeValidUtf8 =
    utf8.includes("księgowania") ||
    utf8.includes("operacji;#Rachunek") ||
    utf8.includes("Tytułem");

  if (looksLikeValidUtf8) return utf8;

  return iconv.decode(buffer, "windows-1250");
}

function normalizeDate(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Missing transaction date");

  const dotMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
  if (dotMatch) {
    const [, dd, mm, yyyy] = dotMatch;
    return `${yyyy}-${mm}-${dd}`;
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) return trimmed;

  throw new Error(`Unsupported date format: ${input}`);
}

function normalizeAmount(input: string): number {
  const cleaned = input
    .replace(/\s/g, "")
    .replace("PLN", "")
    .replace(",", ".")
    .trim();
  const value = Number(cleaned);
  if (!Number.isFinite(value)) throw new Error(`Unsupported amount: ${input}`);
  return value;
}

function makeBaseHash(
  transactionDate: string,
  amount: number,
  description: string,
  extraId?: string,
): string {
  const normalizedDesc = description.trim().replace(/\s+/g, " ").toLowerCase();
  const extra = extraId ? `|${extraId.trim()}` : "";
  return createHash("sha256")
    .update(`${transactionDate}|${amount}|${normalizedDesc}${extra}`)
    .digest("hex");
}

function assignUniqueHashes(transactions: ParsedTransaction[]): void {
  const seen = new Map<string, number>();
  for (const tx of transactions) {
    const baseHash = tx.csvHash;
    const count = seen.get(baseHash) ?? 0;
    seen.set(baseHash, count + 1);
    if (count > 0) {
      tx.csvHash = createHash("sha256")
        .update(`${baseHash}#${count}`)
        .digest("hex");
    }
  }
}

type Format = "mbank-list" | "mbank-stmt" | "pekao";

function detectFormat(decoded: string): Format {
  for (const line of decoded.split(/\r?\n/)) {
    const stripped = stripTrailingSemicolons(line.trim());
    if (stripped === MBANK_LIST_HEADER) return "mbank-list";
    if (stripped === MBANK_STMT_HEADER) return "mbank-stmt";
  }
  if (decoded.includes(PEKAO_HEADER_PREFIX)) return "pekao";
  throw new Error("Unsupported CSV format. Expected mBank or Pekao export.");
}

// ─── mBank "Lista operacji" format ──────────────────────
function parseMbankList(decoded: string): ParsedTransaction[] {
  const lines = decoded
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headerIndex = lines.findIndex(
    (line) => stripTrailingSemicolons(line) === MBANK_LIST_HEADER,
  );
  if (headerIndex < 0) throw new Error("mBank list header not found.");

  const records = parse(lines.slice(headerIndex + 1).join("\n"), {
    delimiter: ";",
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][];

  const transactions: ParsedTransaction[] = [];
  for (const row of records) {
    if (row.length < 5) continue;
    const [dateRaw, descriptionRaw, , categoryRaw, amountRaw] = row;
    if (!dateRaw || !amountRaw) continue;

    const transactionDate = normalizeDate(dateRaw);
    const amount = normalizeAmount(amountRaw);
    const description = descriptionRaw?.trim() ?? "";
    if (!description) continue;

    transactions.push({
      transactionDate,
      postingDate: null,
      amount,
      currency: "PLN",
      description,
      category: categoryRaw?.trim() || null,
      counterparty: null,
      csvHash: makeBaseHash(transactionDate, amount, description),
    });
  }

  assignUniqueHashes(transactions);
  return transactions;
}

// ─── mBank "Elektroniczne zestawienie operacji" (statement) format ───
// Columns: #Data księgowania;#Data operacji;#Opis operacji;#Tytuł;
//          #Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji
function parseMbankStatement(decoded: string): ParsedTransaction[] {
  const lines = decoded
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headerIndex = lines.findIndex(
    (line) => stripTrailingSemicolons(line) === MBANK_STMT_HEADER,
  );
  if (headerIndex < 0) throw new Error("mBank statement header not found.");

  const records = parse(lines.slice(headerIndex + 1).join("\n"), {
    delimiter: ";",
    relax_column_count: true,
    skip_empty_lines: true,
    quote: '"',
    relax_quotes: true,
  }) as string[][];

  const transactions: ParsedTransaction[] = [];
  for (const row of records) {
    if (row.length < 7) continue;

    const postingDateRaw = row[0]?.trim();
    const transactionDateRaw = row[1]?.trim();
    const operationType = row[2]?.trim() ?? "";
    const title = row[3]?.trim() ?? "";
    const counterpartyRaw = row[4]?.trim() ?? "";
    const amountRaw = row[6]?.trim();

    if (!transactionDateRaw || !amountRaw) continue;

    const amount = normalizeAmount(amountRaw);
    if (amount === 0) continue;

    const transactionDate = normalizeDate(transactionDateRaw);
    const postingDate = postingDateRaw ? normalizeDate(postingDateRaw) : null;

    // Build a meaningful description from operation type + title
    const descParts = [operationType, title].filter(Boolean);
    const description = descParts.join(" — ") || operationType || "Unknown";

    const counterparty = counterpartyRaw || null;

    // Use operation type + title + counterparty for a richer hash
    const fullDesc = [operationType, title, counterpartyRaw]
      .filter(Boolean)
      .join(" ");

    transactions.push({
      transactionDate,
      postingDate,
      amount,
      currency: "PLN",
      description,
      category: null,
      counterparty,
      csvHash: makeBaseHash(transactionDate, amount, fullDesc),
    });
  }

  assignUniqueHashes(transactions);
  return transactions;
}

// ─── Pekao format ───────────────────────────────────────
function parsePekao(decoded: string): ParsedTransaction[] {
  const records = parse(decoded, {
    delimiter: ";",
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as Record<string, string>[];

  const transactions: ParsedTransaction[] = [];
  for (const row of records) {
    const transactionDateRaw = row["Data księgowania"]?.trim();
    const postingDateRaw = row["Data waluty"]?.trim();
    const amountRaw = row["Kwota operacji"]?.trim();
    const descriptionRaw = row["Tytułem"]?.trim();

    if (!transactionDateRaw || !amountRaw || !descriptionRaw) continue;

    const transactionDate = normalizeDate(transactionDateRaw);
    const postingDate = postingDateRaw ? normalizeDate(postingDateRaw) : null;
    const amount = normalizeAmount(amountRaw);
    const currency = row["Waluta"]?.trim() || "PLN";
    const category = row["Kategoria"]?.trim() || null;
    const counterparty = row["Nadawca / Odbiorca"]?.trim() || null;
    const referenceNumber = row["Numer referencyjny"]?.trim() || undefined;

    transactions.push({
      transactionDate,
      postingDate,
      amount,
      currency,
      description: descriptionRaw,
      category,
      counterparty,
      csvHash: makeBaseHash(
        transactionDate,
        amount,
        descriptionRaw,
        referenceNumber,
      ),
    });
  }

  assignUniqueHashes(transactions);
  return transactions;
}

// ─── Public API ─────────────────────────────────────────
export function parseCsvFile(buffer: Buffer): {
  detectedFormat: string;
  transactions: ParsedTransaction[];
} {
  const decoded = decodeCsv(buffer);
  const format = detectFormat(decoded);

  switch (format) {
    case "mbank-list":
      return { detectedFormat: "mBank", transactions: parseMbankList(decoded) };
    case "mbank-stmt":
      return {
        detectedFormat: "mBank (statement)",
        transactions: parseMbankStatement(decoded),
      };
    case "pekao":
      return { detectedFormat: "Pekao", transactions: parsePekao(decoded) };
  }
}
