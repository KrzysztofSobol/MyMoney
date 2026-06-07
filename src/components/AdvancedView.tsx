import { useEffect, useRef, useState } from "react";

const ASPSP_OPTIONS: { name: string; country: string }[] = [
  { name: "Alior Bank", country: "PL" },
  { name: "Alisa Bank", country: "PL" },
  { name: "Bank Millennium", country: "PL" },
  { name: "Bank Pekao", country: "PL" },
  { name: "BNP Paribas", country: "PL" },
  { name: "bunq", country: "NL" },
  { name: "Citi Handlowy", country: "PL" },
  { name: "Credit Agricole", country: "PL" },
  { name: "Danske Bank", country: "DK" },
  { name: "DiPocket", country: "LT" },
  { name: "Erste Bank Polska", country: "PL" },
  { name: "iBanFirst", country: "BE" },
  { name: "Ikano Bank", country: "SE" },
  { name: "ING Bank Śląski", country: "PL" },
  { name: "mBank", country: "PL" },
  { name: "N26", country: "DE" },
  { name: "Nest Bank", country: "PL" },
  { name: "PayPal", country: "LU" },
  { name: "PKO Bank Polski", country: "PL" },
  { name: "Revolut", country: "LT" },
  { name: "Volkswagen Bank - Oddział w Polsce", country: "PL" },
  { name: "Wise", country: "BE" },
];

function BankCombobox({
  value,
  country,
  onChange,
}: {
  value: string;
  country: string;
  onChange: (name: string, country: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep local query in sync when parent value changes (e.g. reset)
  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Revert to last committed value if user typed something unmatched
        setQuery(value);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, value]);

  const filtered = query.trim()
    ? ASPSP_OPTIONS.filter((o) =>
        o.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : ASPSP_OPTIONS;

  function select(opt: { name: string; country: string }) {
    setQuery(opt.name);
    setOpen(false);
    onChange(opt.name, opt.country);
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          className="input"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value, country);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
            if (e.key === "ArrowDown" && filtered.length > 0) {
              e.preventDefault();
              const firstBtn = containerRef.current?.querySelector<HTMLButtonElement>("[data-bank-option]");
              firstBtn?.focus();
            }
          }}
          placeholder="Wpisz nazwę banku…"
          autoComplete="off"
          spellCheck={false}
          required
        />
        <span
          className="icon"
          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "var(--text-dim)", pointerEvents: "none" }}
        >
          {open ? "expand_less" : "expand_more"}
        </span>
      </div>

      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          right: 0,
          zIndex: 100,
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          maxHeight: 240,
          overflowY: "auto",
        }}>
          {filtered.map((opt, i) => (
            <button
              key={opt.name}
              type="button"
              data-bank-option
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: "9px 14px",
                background: "none",
                border: "none",
                borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : "none",
                cursor: "pointer",
                textAlign: "left",
                color: "var(--text)",
                fontSize: 13,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-high)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  (e.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  const prev = e.currentTarget.previousElementSibling as HTMLElement | null;
                  if (prev) prev.focus(); else inputRef.current?.focus();
                }
                if (e.key === "Escape") { setOpen(false); inputRef.current?.focus(); }
              }}
              onClick={() => select(opt)}
            >
              <span>{opt.name}</span>
              <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "monospace", marginLeft: 8 }}>{opt.country}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
import {
  startEnableBankingAuth,
  authorizeEnableBankingSession,
  fetchEnableBankingSession,
  getSavedEbSessions,
  deleteSavedEbSession,
  type SavedEbSession,
} from "../services/database";

type Step = "configure" | "authorize" | "done";

interface EbAccount {
  uid?: string;
  name?: string;
  usage?: string;
  currency?: string;
  cash_account_type?: string;
  account_id?: Record<string, string>;
  [key: string]: unknown;
}

interface EbSessionResult {
  session_id?: string;
  accounts?: (EbAccount | string)[];
  accounts_data?: EbAccount[];
  aspsp?: { name?: string; country?: string };
  access?: { valid_until?: string; transactions?: boolean };
  status?: string;
  [key: string]: unknown;
}

function normalizeAccounts(result: EbSessionResult): EbAccount[] {
  // POST /sessions returns accounts as full objects
  if (Array.isArray(result.accounts) && result.accounts.length > 0 && typeof result.accounts[0] === "object") {
    return result.accounts as EbAccount[];
  }
  // GET /sessions returns accounts_data with uid + identification_hash
  if (Array.isArray(result.accounts_data) && result.accounts_data.length > 0) {
    return result.accounts_data;
  }
  // GET /sessions may return accounts as array of uid strings
  if (Array.isArray(result.accounts) && result.accounts.length > 0 && typeof result.accounts[0] === "string") {
    return (result.accounts as string[]).map((uid) => ({ uid }));
  }
  return [];
}

function randomUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function ninetyDaysFromNow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 90);
  return d.toISOString().replace(/\.\d{3}Z$/, ".000000+00:00");
}

function extractCode(input: string): string | null {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get("code");
    if (code) return code;
  } catch {
    // not a URL — treat as raw code
  }
  if (trimmed && !trimmed.includes(" ") && !trimmed.includes("\n")) return trimmed;
  return null;
}

export function AdvancedView() {
  const [step, setStep] = useState<Step>("configure");

  // Step 1 — configure
  const [aspspName, setAspspName] = useState("mBank");
  const [aspspCountry, setAspspCountry] = useState("PL");
  const [redirectUrl, setRedirectUrl] = useState("https://example.org/");
  const [psuType, setPsuType] = useState("personal");
  const [startLoading, setStartLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Step 2 — authorization
  const [authUrl, setAuthUrl] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [authorizeLoading, setAuthorizeLoading] = useState(false);
  const [authorizeError, setAuthorizeError] = useState<string | null>(null);

  // Step 3 — results
  const [sessionResult, setSessionResult] = useState<EbSessionResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Manual session lookup
  const [sessionId, setSessionId] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<EbSessionResult | null>(null);

  const [savedSessions, setSavedSessions] = useState<SavedEbSession[]>([]);

  useEffect(() => {
    void getSavedEbSessions().then(setSavedSessions).catch(() => {});
  }, []);

  const codeInputRef = useRef<HTMLInputElement>(null);

  async function handleStartAuth(e: React.FormEvent) {
    e.preventDefault();
    setStartLoading(true);
    setStartError(null);
    try {
      const result = await startEnableBankingAuth({
        aspspName: aspspName.trim(),
        aspspCountry: aspspCountry.trim().toUpperCase(),
        redirectUrl: redirectUrl.trim(),
        psuType,
        validUntil: ninetyDaysFromNow(),
        state: randomUuid(),
      });
      setAuthUrl(result.url);
      setStep("authorize");
      setTimeout(() => codeInputRef.current?.focus(), 100);
    } catch (err) {
      setStartError((err as Error).message);
    } finally {
      setStartLoading(false);
    }
  }

  async function handleAuthorize(e: React.FormEvent) {
    e.preventDefault();
    const code = extractCode(codeInput);
    if (!code) {
      setAuthorizeError("Wklej pełny redirect URL albo sam kod z parametru ?code=…");
      return;
    }
    setAuthorizeLoading(true);
    setAuthorizeError(null);
    try {
      const result = await authorizeEnableBankingSession(code) as EbSessionResult;
      setSessionResult(result);
      setStep("done");
      // refresh saved sessions list
      void getSavedEbSessions().then(setSavedSessions).catch(() => {});
    } catch (err) {
      setAuthorizeError((err as Error).message);
    } finally {
      setAuthorizeLoading(false);
    }
  }

  function copyUid(uid: string) {
    void navigator.clipboard.writeText(uid).then(() => {
      setCopied(uid);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  async function handleLookupSession(e: React.FormEvent) {
    e.preventDefault();
    const id = sessionId.trim();
    if (!id) return;
    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);
    try {
      const result = await fetchEnableBankingSession(id) as EbSessionResult;
      setLookupResult(result);
    } catch (err) {
      setLookupError((err as Error).message);
    } finally {
      setLookupLoading(false);
    }
  }

  const activeAccounts = normalizeAccounts(step === "done" && sessionResult ? sessionResult : (lookupResult ?? {}));
  void activeAccounts;

  return (
    <div>
      <div className="page-header">
        <p className="page-header-label">Narzędzia</p>
        <h2 className="page-header-title">Advanced</h2>
      </div>

      {/* ── Enable Banking OAuth flow ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span className="icon" style={{ fontSize: 22, color: "var(--primary)", marginTop: 2, flexShrink: 0 }}>
              account_balance
            </span>
            <div>
              <p style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", marginBottom: 3 }}>
                Enable Banking — połącz konto
              </p>
              <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
                Przejdź przez OAuth, żeby dostać <code style={{ fontSize: 11, background: "var(--surface-high)", padding: "1px 5px", borderRadius: 4 }}>uid</code> konta — to właśnie wklejasz jako <strong>Enable Banking ID</strong> przy koncie w sidebarze.
              </p>
            </div>
          </div>
        </div>

        {/* Step indicators */}
        <div style={{ display: "flex", padding: "12px 24px", gap: 8, borderBottom: "1px solid var(--border)" }}>
          {(["configure", "authorize", "done"] as Step[]).map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {i > 0 && <span style={{ color: "var(--border-strong)", fontSize: 12 }}>→</span>}
              <span style={{
                fontSize: 11.5,
                fontWeight: step === s ? 700 : 400,
                color: step === s ? "var(--primary)" : (
                  ["configure", "authorize", "done"].indexOf(step) > i ? "var(--text-muted)" : "var(--text-dim)"
                ),
              }}>
                {i + 1}. {s === "configure" ? "Konfiguracja" : s === "authorize" ? "Autoryzacja" : "Konta"}
              </span>
            </div>
          ))}
        </div>

        <div style={{ padding: "20px 24px" }}>

          {/* ── Step 1: Configure ── */}
          {step === "configure" && (
            <form onSubmit={(e) => void handleStartAuth(e)}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", marginBottom: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)", fontWeight: 600, marginBottom: 5 }}>
                    Bank (ASPSP name)
                  </label>
                  <BankCombobox
                    value={aspspName}
                    country={aspspCountry}
                    onChange={(name, country) => { setAspspName(name); setAspspCountry(country); }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)", fontWeight: 600, marginBottom: 5 }}>
                    Kraj (ISO)
                  </label>
                  <input
                    className="input"
                    value={aspspCountry}
                    onChange={(e) => setAspspCountry(e.target.value)}
                    placeholder="PL"
                    maxLength={2}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)", fontWeight: 600, marginBottom: 5 }}>
                    Redirect URL
                  </label>
                  <input
                    className="input"
                    value={redirectUrl}
                    onChange={(e) => setRedirectUrl(e.target.value)}
                    placeholder="https://example.org/"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)", fontWeight: 600, marginBottom: 5 }}>
                    PSU type
                  </label>
                  <select
                    className="input"
                    value={psuType}
                    onChange={(e) => setPsuType(e.target.value)}
                    style={{ cursor: "pointer" }}
                  >
                    <option value="personal">personal</option>
                    <option value="business">business</option>
                  </select>
                </div>
              </div>
              {startError && (
                <p style={{ fontSize: 12.5, color: "var(--error)", background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)", borderRadius: 6, padding: "8px 12px", marginBottom: 12 }}>
                  {startError}
                </p>
              )}
              <button type="submit" className="btn btn-primary" disabled={startLoading}>
                <span className="icon icon--sm">{startLoading ? "sync" : "open_in_new"}</span>
                {startLoading ? "Generating…" : "Start auth flow"}
              </button>
            </form>
          )}

          {/* ── Step 2: Authorize ── */}
          {step === "authorize" && (
            <div>
              <div style={{ background: "var(--surface-high)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "14px 16px", marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  1. Otwórz ten URL w przeglądarce i zaloguj się do banku:
                </p>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <p style={{ fontFamily: "monospace", fontSize: 11, wordBreak: "break-all", color: "var(--primary)", flex: 1 }}>
                    {authUrl}
                  </p>
                  <a
                    href={authUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ flexShrink: 0, fontSize: 12, padding: "6px 10px", textDecoration: "none" }}
                  >
                    <span className="icon icon--sm">open_in_new</span>
                    Open
                  </a>
                </div>
              </div>

              <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 10 }}>
                <strong style={{ color: "var(--text-muted)" }}>2.</strong> Po autoryzacji bank przekieruje Cię na{" "}
                <code style={{ fontSize: 11, background: "var(--surface-high)", padding: "1px 5px", borderRadius: 4 }}>{redirectUrl}</code>.
                Skopiuj cały URL z paska przeglądarki (lub sam parametr <code style={{ fontSize: 11, background: "var(--surface-high)", padding: "1px 5px", borderRadius: 4 }}>?code=…</code>) i wklej poniżej:
              </p>

              <form onSubmit={(e) => void handleAuthorize(e)}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input
                    ref={codeInputRef}
                    className="input"
                    style={{ flex: 1, fontFamily: "monospace", fontSize: 12 }}
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    placeholder="https://example.org/?code=...  lub sam kod"
                    spellCheck={false}
                  />
                  <button type="submit" className="btn btn-primary" disabled={authorizeLoading || !codeInput.trim()}>
                    <span className="icon icon--sm">{authorizeLoading ? "sync" : "check"}</span>
                    {authorizeLoading ? "Authorizing…" : "Authorize"}
                  </button>
                </div>
                {authorizeError && (
                  <p style={{ fontSize: 12.5, color: "var(--error)", background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)", borderRadius: 6, padding: "8px 12px" }}>
                    {authorizeError}
                  </p>
                )}
              </form>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 12, fontSize: 12 }}
                onClick={() => { setStep("configure"); setStartError(null); }}
              >
                ← Back
              </button>
            </div>
          )}

          {/* ── Step 3: Accounts ── */}
          {step === "done" && sessionResult && (
            <div>
              {sessionResult.session_id && (
                <div style={{ background: "var(--surface-high)", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "8px 12px", marginBottom: 14, fontSize: 12 }}>
                  <span style={{ color: "var(--text-dim)" }}>session_id: </span>
                  <code style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>{sessionResult.session_id}</code>
                  {sessionResult.access?.valid_until && (
                    <span style={{ marginLeft: 12, color: "var(--text-dim)" }}>
                      · ważna do <strong style={{ color: "var(--secondary)" }}>{new Date(sessionResult.access.valid_until).toLocaleDateString("pl-PL")}</strong>
                    </span>
                  )}
                  {sessionResult.aspsp && (
                    <span style={{ marginLeft: 12, color: "var(--text-dim)" }}>· {sessionResult.aspsp.name} {sessionResult.aspsp.country}</span>
                  )}
                </div>
              )}
              <AccountCards accounts={normalizeAccounts(sessionResult)} copied={copied} onCopyUid={copyUid} />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: 16, fontSize: 12 }}
                onClick={() => { setStep("configure"); setSessionResult(null); setCodeInput(""); }}
              >
                ← Start over
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Saved sessions ── */}
      {savedSessions.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid var(--border)" }}>
            <p style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginBottom: 3 }}>
              Zapisane sesje
            </p>
            <p style={{ fontSize: 12, color: "var(--text-dim)" }}>
              Sesje zapisane automatycznie po autoryzacji — konta z ich <code style={{ fontSize: 11, background: "var(--surface-high)", padding: "1px 5px", borderRadius: 4 }}>uid</code> są tu zawsze dostępne.
            </p>
          </div>
          <div style={{ padding: "12px 24px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            {savedSessions.map((s) => (
              <div key={s.session_id} style={{ background: "var(--surface-high)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
                      {s.aspsp_name} <span style={{ fontWeight: 400, color: "var(--text-dim)", fontSize: 11 }}>{s.aspsp_country}</span>
                    </p>
                    <p style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-dim)", marginTop: 2 }}>{s.session_id}</p>
                    {s.valid_until && (
                      <p style={{ fontSize: 11, color: new Date(s.valid_until) < new Date() ? "var(--error)" : "var(--secondary)", marginTop: 2 }}>
                        {new Date(s.valid_until) < new Date() ? "Wygasła" : "Ważna do"} {new Date(s.valid_until).toLocaleDateString("pl-PL")}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="sidebar-account-action-btn sidebar-account-action-btn--danger"
                    style={{ opacity: 1, width: 28, height: 28 }}
                    title="Usuń sesję"
                    onClick={() => {
                      void deleteSavedEbSession(s.session_id).then(() =>
                        getSavedEbSessions().then(setSavedSessions)
                      );
                    }}
                  >
                    <span className="icon icon--sm">delete</span>
                  </button>
                </div>
                <AccountCards accounts={s.accounts} copied={copied} onCopyUid={copyUid} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Manual session lookup ── */}
      <div className="card">
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginBottom: 3 }}>
            Lookup istniejącej sesji
          </p>
          <p style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Jeśli masz już <code style={{ fontSize: 11, background: "var(--surface-high)", padding: "1px 5px", borderRadius: 4 }}>session_id</code> z poprzedniej autoryzacji.
          </p>
        </div>
        <div style={{ padding: "16px 24px 20px" }}>
          <form onSubmit={(e) => void handleLookupSession(e)} style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              style={{ flex: 1, fontFamily: "monospace", fontSize: 13 }}
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              spellCheck={false}
            />
            <button type="submit" className="btn btn-secondary" disabled={lookupLoading || !sessionId.trim()}>
              <span className="icon icon--sm">{lookupLoading ? "sync" : "search"}</span>
              {lookupLoading ? "Loading…" : "Fetch"}
            </button>
          </form>
          {lookupError && (
            <p style={{ fontSize: 12.5, color: "var(--error)", background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)", borderRadius: 6, padding: "8px 12px", marginTop: 10 }}>
              {lookupError}
            </p>
          )}
          {lookupResult && (
            <div style={{ marginTop: 14 }}>
              {lookupResult.aspsp && (
                <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
                  {lookupResult.aspsp.name} {lookupResult.aspsp.country}
                  {lookupResult.status && <span style={{ marginLeft: 8 }}>· status: <strong style={{ color: lookupResult.status === "AUTHORIZED" ? "var(--secondary)" : "var(--error)" }}>{lookupResult.status}</strong></span>}
                  {lookupResult.access?.valid_until && <span style={{ marginLeft: 8 }}>· ważna do <strong>{new Date(lookupResult.access.valid_until).toLocaleDateString("pl-PL")}</strong></span>}
                </p>
              )}
              <AccountCards accounts={normalizeAccounts(lookupResult)} copied={copied} onCopyUid={copyUid} />
              <details style={{ marginTop: 14 }}>
                <summary style={{ fontSize: 11, color: "var(--text-dim)", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                  Full JSON
                </summary>
                <pre style={{ background: "var(--surface-high)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "12px 14px", fontSize: 11.5, fontFamily: "monospace", color: "var(--text-muted)", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 360, overflowY: "auto", marginTop: 8 }}>
                  {JSON.stringify(lookupResult, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AccountCards({
  accounts,
  copied,
  onCopyUid,
}: {
  accounts: EbAccount[];
  copied: string | null;
  onCopyUid: (uid: string) => void;
}) {
  if (accounts.length === 0) return (
    <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Brak kont w tej sesji.</p>
  );
  return (
    <div>
      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-dim)", fontWeight: 700, marginBottom: 10 }}>
        {accounts.length} account{accounts.length !== 1 ? "s" : ""}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {accounts.map((acc, i) => (
          <div
            key={acc.uid ?? i}
            style={{ background: "var(--surface-high)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", marginBottom: 3 }}>
                {acc.name ?? (acc.account_id ? Object.values(acc.account_id)[0] : null) ?? `Account ${i + 1}`}
                {acc.currency && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-dim)", fontWeight: 400 }}>{acc.currency}</span>
                )}
              </p>
              {acc.account_id && (
                <p style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
                  {Object.entries(acc.account_id).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                </p>
              )}
              {acc.uid && (
                <p style={{ fontSize: 11.5, fontFamily: "monospace", color: "var(--primary)", wordBreak: "break-all" }}>
                  uid: {acc.uid}
                </p>
              )}
            </div>
            {acc.uid && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flexShrink: 0, padding: "6px 10px", fontSize: 12 }}
                onClick={() => onCopyUid(acc.uid!)}
                title="Copy uid to clipboard"
              >
                <span className="icon icon--sm">{copied === acc.uid ? "check" : "content_copy"}</span>
                {copied === acc.uid ? "Copied!" : "Copy uid"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
