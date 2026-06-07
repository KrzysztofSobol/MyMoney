import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const DEFAULT_BASE_URL = "https://api.enablebanking.com";
const DEFAULT_JWT_TTL_SECONDS = 3600;
const DEFAULT_MAX_PAGES = 200;
const MAX_JWT_TTL_SECONDS = 86400;

export type EnableBankingConfig = {
  baseUrl: string;
  applicationId: string;
  privateKeyPem: string;
  jwtTtlSeconds: number;
  maxPages: number;
  transactionStatus?: string;
  psuIpAddress?: string;
  psuUserAgent?: string;
  psuReferer?: string;
  psuAccept?: string;
  psuAcceptCharset?: string;
  psuAcceptEncoding?: string;
  psuAcceptLanguage?: string;
  psuGeoLocation?: string;
};

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function requireEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`${name} environment variable is required for Enable Banking API sync.`);
  }
  return value;
}

function getNumberEnv(name: string, fallback: number): number {
  const raw = getEnv(name);
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function getPrivateKeyPem(): string {
  const fromPem = getEnv("ENABLE_BANKING_PRIVATE_KEY_PEM")?.replace(/\\n/g, "\n");
  if (fromPem) return fromPem;

  const fromBase64 = getEnv("ENABLE_BANKING_PRIVATE_KEY_BASE64");
  if (fromBase64) return Buffer.from(fromBase64, "base64").toString("utf8");

  const fromPath = getEnv("ENABLE_BANKING_PRIVATE_KEY_PATH");
  if (fromPath) return readFileSync(fromPath, "utf8");

  throw new Error(
    "ENABLE_BANKING_PRIVATE_KEY_BASE64, ENABLE_BANKING_PRIVATE_KEY_PEM, or ENABLE_BANKING_PRIVATE_KEY_PATH is required.",
  );
}

export function getEnableBankingConfig(): EnableBankingConfig {
  const jwtTtlSeconds = getNumberEnv("ENABLE_BANKING_JWT_TTL_SECONDS", DEFAULT_JWT_TTL_SECONDS);
  if (jwtTtlSeconds > MAX_JWT_TTL_SECONDS) {
    throw new Error("ENABLE_BANKING_JWT_TTL_SECONDS cannot be greater than 86400.");
  }

  return {
    baseUrl: (getEnv("ENABLE_BANKING_API_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    applicationId: requireEnv("ENABLE_BANKING_APPLICATION_ID"),
    privateKeyPem: getPrivateKeyPem(),
    jwtTtlSeconds,
    maxPages: getNumberEnv("ENABLE_BANKING_MAX_PAGES", DEFAULT_MAX_PAGES),
    transactionStatus: getEnv("ENABLE_BANKING_TRANSACTION_STATUS") ?? "BOOK",
    psuIpAddress: getEnv("ENABLE_BANKING_PSU_IP_ADDRESS"),
    psuUserAgent: getEnv("ENABLE_BANKING_PSU_USER_AGENT"),
    psuReferer: getEnv("ENABLE_BANKING_PSU_REFERER"),
    psuAccept: getEnv("ENABLE_BANKING_PSU_ACCEPT"),
    psuAcceptCharset: getEnv("ENABLE_BANKING_PSU_ACCEPT_CHARSET"),
    psuAcceptEncoding: getEnv("ENABLE_BANKING_PSU_ACCEPT_ENCODING"),
    psuAcceptLanguage: getEnv("ENABLE_BANKING_PSU_ACCEPT_LANGUAGE"),
    psuGeoLocation: getEnv("ENABLE_BANKING_PSU_GEO_LOCATION"),
  };
}

function isUsablePublicPsuIp(value: string | undefined): boolean {
  const ip = value?.trim();
  if (!ip) return false;
  // Loopback / unspecified / private / link-local addresses are rejected by ASPSPs.
  return !(
    ip === "::1" ||
    ip === "0.0.0.0" ||
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^(fe80:|fc00:|fd)/i.test(ip)
  );
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createJwt(config: EnableBankingConfig): string {
  const iat = Math.floor(Date.now() / 1000);
  const header = { typ: "JWT", alg: "RS256", kid: config.applicationId };
  const body = {
    iss: "enablebanking.com",
    aud: "api.enablebanking.com",
    iat,
    exp: iat + config.jwtTtlSeconds,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(body))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(config.privateKeyPem);
  return `${signingInput}.${base64url(signature)}`;
}

// PSU headers tell the ASPSP a real user is online, triggering extra security
// checks on the supplied IP/User-Agent. A fabricated/loopback IP makes banks
// (e.g. Credit Agricole PL) reject the call with 401 -> ASPSP_ERROR. This sync
// runs server-side, so we omit ALL PSU headers unless a real public IP is set,
// making it a background fetch. Sending a partial set causes 422 instead.
function createHeaders(config: EnableBankingConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${createJwt(config)}`,
  };

  if (isUsablePublicPsuIp(config.psuIpAddress)) {
    headers["Psu-Ip-Address"] = config.psuIpAddress as string;
    headers["Psu-User-Agent"] =
      config.psuUserAgent ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
    if (config.psuReferer) headers["Psu-Referer"] = config.psuReferer;
    headers["Psu-Accept"] = config.psuAccept ?? "application/json";
    if (config.psuAcceptCharset) headers["Psu-Accept-Charset"] = config.psuAcceptCharset;
    if (config.psuAcceptEncoding) headers["Psu-Accept-Encoding"] = config.psuAcceptEncoding;
    headers["Psu-Accept-language"] = config.psuAcceptLanguage ?? "pl";
    if (config.psuGeoLocation) headers["Psu-Geo-Location"] = config.psuGeoLocation;
  }

  return headers;
}

function interpretError(status: number, text: string): string {
  let errorCode: string | undefined;
  try {
    errorCode = (JSON.parse(text) as { error?: string }).error;
  } catch {
    errorCode = undefined;
  }

  const base = `Enable Banking API returned ${status}: ${text || "(empty response)"}`;

  if (errorCode === "EXPIRED_SESSION" || status === 401) {
    return `${base}\nThe bank consent has expired. Re-authorize this bank connection to create a new session, then sync again.`;
  }
  if (errorCode === "ASPSP_ERROR") {
    return `${base}\nThe bank rejected the request (ASPSP_ERROR), usually a stale/expired consent or a temporary bank-side issue. Re-authorize the connection; if it persists, retry later.`;
  }
  if (errorCode === "PSU_HEADER_NOT_PROVIDED") {
    return `${base}\nThe bank requires a complete set of PSU headers. Set a real public ENABLE_BANKING_PSU_IP_ADDRESS or leave all PSU env vars empty.`;
  }
  if (errorCode === "WRONG_TRANSACTIONS_PERIOD") {
    return `${base}\nThe requested date range is unavailable. Use a full-history sync or a narrower recent range.`;
  }
  return base;
}

export async function enableBankingRequest<T>(
  config: EnableBankingConfig,
  method: "GET" | "POST",
  path: string,
  options: { query?: URLSearchParams; body?: unknown } = {},
): Promise<T> {
  const queryString = options.query?.toString();
  const url = `${config.baseUrl}${path}${queryString ? `?${queryString}` : ""}`;
  const headers = createHeaders(config);
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(interpretError(response.status, text));
  }
  return (text ? JSON.parse(text) : {}) as T;
}
