import { useRef, useState } from "react";
import type { Account, BankGroup, ImportSummary } from "../types";
import { GROUP_COLORS } from "../types";

interface ImportViewProps {
  bankGroups: BankGroup[];
  accountsByGroup: Record<number, Account[]>;
  autoColor: string;
  onImport: (accountId: number, file: File) => Promise<ImportSummary>;
  onCreateGroup: (name: string, color: string) => Promise<BankGroup>;
  onCreateAccount: (groupId: number, name: string, accountNumber?: string) => Promise<Account>;
}

export function ImportView({
  bankGroups,
  accountsByGroup,
  autoColor,
  onImport,
  onCreateGroup,
  onCreateAccount,
}: ImportViewProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState(autoColor);
  const [groupError, setGroupError] = useState<string | null>(null);

  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountNumber, setNewAccountNumber] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const accounts = selectedGroupId ? (accountsByGroup[selectedGroupId] ?? []) : [];
  const currentStep = selectedAccountId !== null ? 2 : selectedGroupId !== null ? 1 : 0;

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    setGroupError(null);
    try {
      const group = await onCreateGroup(name, newGroupColor);
      setSelectedGroupId(group.id);
      setSelectedAccountId(null);
      setNewGroupName("");
      setShowNewGroup(false);
    } catch (err) {
      setGroupError((err as Error).message);
    }
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGroupId) return;
    const name = newAccountName.trim();
    if (!name) return;
    setAccountError(null);
    try {
      const account = await onCreateAccount(
        selectedGroupId,
        name,
        newAccountNumber.trim() || undefined,
      );
      setSelectedAccountId(account.id);
      setNewAccountName("");
      setNewAccountNumber("");
      setShowNewAccount(false);
    } catch (err) {
      setAccountError((err as Error).message);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.name.toLowerCase().endsWith(".csv")) {
      setFile(dropped);
      setSummary(null);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    if (picked) {
      setFile(picked);
      setSummary(null);
    }
  }

  async function handleImport() {
    if (!selectedAccountId || !file) return;
    setError(null);
    setIsImporting(true);
    try {
      const result = await onImport(selectedAccountId, file);
      setSummary(result);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsImporting(false);
    }
  }

  const steps = ["Bank Group", "Account", "Upload File"];

  return (
    <div className="import-view">
      <div className="page-header">
        <p className="page-header-label">Import</p>
        <h2 className="page-header-title">Import CSV</h2>
        <p className="page-header-sub">Supports mBank and Pekao formats — duplicates are skipped automatically.</p>
      </div>

      <div className="step-indicator">
        {steps.map((label, i) => (
          <div key={i} className="step-item">
            <div
              className={`step-number${i < currentStep ? " step-number--done" : i === currentStep ? " step-number--active" : ""}`}
            >
              {i < currentStep ? <span className="icon icon--sm">check</span> : i + 1}
            </div>
            <span className={`step-label${i === currentStep ? " step-label--active" : ""}`}>
              {label}
            </span>
            {i < steps.length - 1 && <div className="step-connector" />}
          </div>
        ))}
      </div>

      {/* Step 1 – Bank Group */}
      <div className={`import-section${currentStep === 0 ? " import-section--active" : ""}`}>
        <p className="import-section-title">
          <span className="icon">account_balance</span>
          Bank group
        </p>

        {!showNewGroup ? (
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Select existing</label>
              <select
                className="select"
                value={selectedGroupId ?? ""}
                onChange={(e) => {
                  const id = Number(e.target.value) || null;
                  setSelectedGroupId(id);
                  setSelectedAccountId(null);
                }}
              >
                <option value="">— choose group —</option>
                {bankGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ alignSelf: "flex-end" }}
              onClick={() => setShowNewGroup(true)}
            >
              <span className="icon icon--sm">add</span>
              New
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleCreateGroup(e)}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">New group name</label>
                <input
                  className="input"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. mBank, Pekao, PKO"
                  autoFocus
                />
                <div className="color-swatches" style={{ marginTop: 6 }}>
                  {GROUP_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`color-swatch${newGroupColor === color ? " color-swatch--active" : ""}`}
                      style={{ background: color }}
                      onClick={() => setNewGroupColor(color)}
                      title={color}
                    />
                  ))}
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-end" }}>
                Create
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ alignSelf: "flex-end" }}
                onClick={() => {
                  setShowNewGroup(false);
                  setNewGroupName("");
                  setGroupError(null);
                }}
              >
                <span className="icon icon--sm">close</span>
              </button>
            </div>
            {groupError && <p className="error-text">{groupError}</p>}
          </form>
        )}
      </div>

      {/* Step 2 – Account */}
      <div
        className={`import-section${currentStep === 1 ? " import-section--active" : ""}${selectedGroupId === null ? " import-section--locked" : ""}`}
      >
        <p className="import-section-title">
          <span className="icon">savings</span>
          Account
        </p>

        {!showNewAccount ? (
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Select existing</label>
              <select
                className="select"
                value={selectedAccountId ?? ""}
                onChange={(e) => setSelectedAccountId(Number(e.target.value) || null)}
                disabled={!selectedGroupId}
              >
                <option value="">— choose account —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ alignSelf: "flex-end" }}
              disabled={!selectedGroupId}
              onClick={() => setShowNewAccount(true)}
            >
              <span className="icon icon--sm">add</span>
              New
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleCreateAccount(e)}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Account name</label>
                <input
                  className="input"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="e.g. Checking, Savings"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Account number (optional)</label>
                <input
                  className="input"
                  value={newAccountNumber}
                  onChange={(e) => setNewAccountNumber(e.target.value)}
                  placeholder="PL61 1090 1014 …"
                />
              </div>
            </div>
            <div className="form-row" style={{ marginTop: 8 }}>
              <button type="submit" className="btn btn-primary">
                Create account
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setShowNewAccount(false);
                  setNewAccountName("");
                  setNewAccountNumber("");
                  setAccountError(null);
                }}
              >
                Cancel
              </button>
            </div>
            {accountError && <p className="error-text">{accountError}</p>}
          </form>
        )}
      </div>

      {/* Step 3 – File upload */}
      <div
        className={`import-section${currentStep === 2 ? " import-section--active" : ""}${selectedAccountId === null ? " import-section--locked" : ""}`}
      >
        <p className="import-section-title">
          <span className="icon">upload_file</span>
          CSV file
        </p>

        <div
          className={`file-drop${isDragging ? " file-drop--dragging" : ""}${file ? " file-drop--has-file" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <span className="icon icon--xl">
            {file ? "task" : isDragging ? "file_download" : "upload_file"}
          </span>
          {file ? (
            <>
              <p>
                <strong>{file.name}</strong>
              </p>
              <small>{(file.size / 1024).toFixed(1)} KB — click to change</small>
            </>
          ) : (
            <>
              <p>
                Drop CSV here or <strong>browse</strong>
              </p>
              <small>mBank and Pekao formats supported</small>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </div>

        {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}

        <div style={{ marginTop: 14 }}>
          <button
            className="btn btn-primary"
            onClick={() => void handleImport()}
            disabled={!file || !selectedAccountId || isImporting}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {isImporting ? (
              <>
                <span className="icon icon--sm">sync</span>
                Importing…
              </>
            ) : (
              <>
                <span className="icon icon--sm">cloud_upload</span>
                Import transactions
              </>
            )}
          </button>
        </div>
      </div>

      {/* Result summary */}
      {summary && (
        <div className="import-summary">
          <p className="import-summary-title">
            <span className="icon">check_circle</span>
            Import complete
          </p>
          <div className="import-summary-grid">
            <div className="summary-stat">
              <span className="summary-stat-label">Format detected</span>
              <span className="summary-stat-value summary-stat-value--dim" style={{ fontSize: 16 }}>
                {summary.detectedFormat}
              </span>
            </div>
            <div className="summary-stat">
              <span className="summary-stat-label">Parsed</span>
              <span className="summary-stat-value summary-stat-value--dim">
                {summary.parsedCount}
              </span>
            </div>
            <div className="summary-stat">
              <span className="summary-stat-label">Imported</span>
              <span className="summary-stat-value summary-stat-value--green">
                {summary.importedCount}
              </span>
            </div>
            <div className="summary-stat">
              <span className="summary-stat-label">Duplicates skipped</span>
              <span className="summary-stat-value summary-stat-value--dim">
                {summary.duplicateCount}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
