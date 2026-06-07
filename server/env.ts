import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const initialEnvKeys = new Set(Object.keys(process.env));

function stripInlineComment(value: string): string {
  let quote: string | null = null;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const prev = value[i - 1];
    if ((char === '"' || char === "'") && prev !== "\\") {
      quote = quote === char ? null : quote ?? char;
    }
    if (char === "#" && quote === null && /\s/.test(value[i - 1] ?? " ")) {
      return value.slice(0, i).trim();
    }
  }

  return value.trim();
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\n/g, "\n");
  }
  return value;
}

function loadEnvFile(fileName: string) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) continue;

    const key = normalized.slice(0, separator).trim();
    const value = unquote(stripInlineComment(normalized.slice(separator + 1)));
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (initialEnvKeys.has(key)) continue;

    process.env[key] = value;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");
