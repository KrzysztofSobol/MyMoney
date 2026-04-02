import { useEffect, useState } from "react";
import type { Account, BankGroup, ImportSummary, Transaction } from "./types";
import { GROUP_COLORS } from "./types";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { OverviewDashboard } from "./components/OverviewDashboard";
import { ImportView } from "./components/ImportView";
import {
  getAllTransactions,
  getAccounts,
  getBankGroups,
  getTransactions,
  createBankGroup,
  updateBankGroup,
  createAccount,
  importCsv,
  clearAccountTransactions,
  clearGroupTransactions,
} from "./services/database";

export type View = "overview" | "dashboard" | "import";

export default function App() {
  const [bankGroups, setBankGroups] = useState<BankGroup[]>([]);
  const [accountsByGroup, setAccountsByGroup] = useState<Record<number, Account[]>>({});
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [activeView, setActiveView] = useState<View>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (selectedAccountId !== null) {
      void getTransactions(selectedAccountId)
        .then(setTransactions)
        .catch(() => setTransactions([]));
    } else {
      setTransactions([]);
    }
  }, [selectedAccountId]);

  async function loadAll() {
    try {
      const groups = await getBankGroups();
      setBankGroups(groups);
      const pairs = await Promise.all(
        groups.map(async (g) => [g.id, await getAccounts(g.id)] as const),
      );
      const byGroup = Object.fromEntries(pairs);
      setAccountsByGroup(byGroup);
      const txs = await getAllTransactions();
      setAllTransactions(txs);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function refreshAllTransactions() {
    try {
      const txs = await getAllTransactions();
      setAllTransactions(txs);
    } catch {
      /* non-fatal */
    }
  }

  function nextAutoColor(existingGroups: BankGroup[]): string {
    return GROUP_COLORS[existingGroups.length % GROUP_COLORS.length] ?? GROUP_COLORS[0];
  }

  async function handleCreateGroup(name: string, color: string): Promise<BankGroup> {
    const group = await createBankGroup(name, color);
    await loadAll();
    return group;
  }

  async function handleUpdateGroupColor(groupId: number, color: string): Promise<void> {
    const group = bankGroups.find((g) => g.id === groupId);
    if (!group) return;
    const updated = await updateBankGroup(groupId, group.name, color);
    setBankGroups((prev) => prev.map((g) => (g.id === groupId ? updated : g)));
  }

  async function handleCreateAccount(
    bankGroupId: number,
    name: string,
    accountNumber?: string,
  ): Promise<Account> {
    const account = await createAccount({ bankGroupId, name, accountNumber });
    const updated = await getAccounts(bankGroupId);
    setAccountsByGroup((prev) => ({ ...prev, [bankGroupId]: updated }));
    return account;
  }

  async function handleImport(accountId: number, file: File): Promise<ImportSummary> {
    const summary = await importCsv({ accountId, file });
    const items = await getTransactions(accountId);
    setTransactions(items);
    await refreshAllTransactions();
    return summary;
  }

  function handleSelectAccount(accountId: number, groupId: number) {
    setSelectedAccountId(accountId);
    setSelectedGroupId(groupId);
    setActiveView("dashboard");
    setSidebarOpen(false);
  }

  function handleSelectGroup(groupId: number) {
    setSelectedGroupId(groupId);
    setSelectedAccountId(null);
    setActiveView("dashboard");
    setSidebarOpen(false);
  }

  async function handleClearAccount(accountId: number) {
    await clearAccountTransactions(accountId);
    setTransactions([]);
    await refreshAllTransactions();
  }

  async function handleClearGroup(groupId: number) {
    await clearGroupTransactions(groupId);
    setTransactions([]);
    await refreshAllTransactions();
  }

  function handleNavigate(view: View) {
    setActiveView(view);
    setSidebarOpen(false);
  }

  const allAccounts = Object.values(accountsByGroup).flat();
  const selectedAccount = allAccounts.find((a) => a.id === selectedAccountId) ?? null;
  const selectedGroup = bankGroups.find((g) => g.id === selectedGroupId) ?? null;
  const autoColor = nextAutoColor(bankGroups);

  return (
    <div className="app-layout">
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar
        bankGroups={bankGroups}
        accountsByGroup={accountsByGroup}
        selectedGroupId={selectedGroupId}
        selectedAccountId={selectedAccountId}
        activeView={activeView}
        sidebarOpen={sidebarOpen}
        autoColor={autoColor}
        onSelectGroup={handleSelectGroup}
        onSelectAccount={handleSelectAccount}
        onNavigate={handleNavigate}
        onCreateGroup={handleCreateGroup}
        onCreateAccount={handleCreateAccount}
        onUpdateGroupColor={handleUpdateGroupColor}
      />

      <div className="main-content">
        <div className="mobile-topbar">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}>
            <span className="icon icon--lg">menu</span>
          </button>
          <span className="topbar-title">MyMoney</span>
        </div>

        {error && <p className="error-banner">{error}</p>}

        {activeView === "overview" && (
          <OverviewDashboard
            bankGroups={bankGroups}
            accountsByGroup={accountsByGroup}
            allTransactions={allTransactions}
          />
        )}

        {activeView === "dashboard" && (
          <Dashboard
            transactions={transactions}
            selectedGroup={selectedGroup}
            selectedAccount={selectedAccount}
            onClearAccount={handleClearAccount}
            onClearGroup={handleClearGroup}
          />
        )}

        {activeView === "import" && (
          <ImportView
            bankGroups={bankGroups}
            accountsByGroup={accountsByGroup}
            autoColor={autoColor}
            onImport={handleImport}
            onCreateGroup={handleCreateGroup}
            onCreateAccount={handleCreateAccount}
          />
        )}
      </div>
    </div>
  );
}
