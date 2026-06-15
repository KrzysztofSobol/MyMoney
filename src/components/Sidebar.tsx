import { useEffect, useRef, useState } from "react";
import type { Account, BankGroup } from "../types";
import { GROUP_COLORS } from "../types";
import type { View } from "../App";

interface SidebarProps {
  bankGroups: BankGroup[];
  accountsByGroup: Record<number, Account[]>;
  selectedGroupId: number | null;
  selectedAccountId: number | null;
  activeView: View;
  sidebarOpen: boolean;
  autoColor: string;
  onSelectGroup: (id: number) => void;
  onSelectAccount: (accountId: number, groupId: number) => void;
  onNavigate: (view: View) => void;
  onCreateGroup: (name: string, color: string) => Promise<BankGroup>;
  onCreateAccount: (groupId: number, name: string, accountNumber?: string) => Promise<Account>;
  onUpdateGroupColor: (groupId: number, color: string) => Promise<void>;
  onUpdateGroupName: (groupId: number, name: string) => Promise<void>;
  onDeleteGroup: (groupId: number) => Promise<void>;
  onUpdateAccount: (accountId: number, groupId: number, name: string) => Promise<void>;
  onDeleteAccount: (accountId: number, groupId: number) => Promise<void>;
}

export function Sidebar({
  bankGroups,
  accountsByGroup,
  selectedGroupId,
  selectedAccountId,
  activeView,
  sidebarOpen,
  autoColor,
  onSelectAccount,
  onNavigate,
  onCreateGroup,
  onCreateAccount,
  onUpdateGroupColor,
  onUpdateGroupName,
  onDeleteGroup,
  onUpdateAccount,
  onDeleteAccount,
}: SidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  // Add group
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState(autoColor);
  const [groupError, setGroupError] = useState<string | null>(null);

  // Add account
  const [addingAccountFor, setAddingAccountFor] = useState<number | null>(null);
  const [newAccountName, setNewAccountName] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);

  // Color picker
  const [colorPickerForGroupId, setColorPickerForGroupId] = useState<number | null>(null);
  const [groupColorError, setGroupColorError] = useState<string | null>(null);

  // Rename group
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupError, setEditGroupError] = useState<string | null>(null);

  // Delete group
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<number | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [deleteGroupError, setDeleteGroupError] = useState<string | null>(null);

  // Edit account
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editAccountName, setEditAccountName] = useState("");
  const [editAccountGroupId, setEditAccountGroupId] = useState<number | null>(null);
  const [editAccountError, setEditAccountError] = useState<string | null>(null);

  // Delete account
  const [confirmDeleteAccountId, setConfirmDeleteAccountId] = useState<number | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  const groupInputRef = useRef<HTMLInputElement>(null);
  const accountInputRef = useRef<HTMLInputElement>(null);
  const editGroupInputRef = useRef<HTMLInputElement>(null);
  const editAccountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedGroupId !== null) {
      setExpandedGroups((prev) => new Set([...prev, selectedGroupId]));
    }
  }, [selectedGroupId]);

  useEffect(() => {
    if (addingGroup) {
      setNewGroupColor(autoColor);
      groupInputRef.current?.focus();
    }
  }, [addingGroup, autoColor]);

  useEffect(() => {
    if (addingAccountFor !== null) accountInputRef.current?.focus();
  }, [addingAccountFor]);

  useEffect(() => {
    if (editingGroupId !== null) editGroupInputRef.current?.focus();
  }, [editingGroupId]);

  useEffect(() => {
    if (editingAccountId !== null) editAccountInputRef.current?.focus();
  }, [editingAccountId]);

  function toggleGroup(id: number) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openEditGroup(group: BankGroup) {
    setEditingGroupId(group.id);
    setEditGroupName(group.name);
    setEditGroupError(null);
    setColorPickerForGroupId(null);
    setConfirmDeleteGroupId(null);
  }

  function openEditAccount(account: Account, groupId: number) {
    setEditingAccountId(account.id);
    setEditAccountGroupId(groupId);
    setEditAccountName(account.name);
    setEditAccountError(null);
    setConfirmDeleteAccountId(null);
  }

  async function submitGroup(e: React.FormEvent) {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    setGroupError(null);
    try {
      const group = await onCreateGroup(name, newGroupColor);
      setNewGroupName("");
      setAddingGroup(false);
      setExpandedGroups((prev) => new Set([...prev, group.id]));
    } catch (err) {
      setGroupError((err as Error).message);
    }
  }

  async function submitRenameGroup(e: React.FormEvent) {
    e.preventDefault();
    const name = editGroupName.trim();
    if (!name || editingGroupId === null) return;
    setEditGroupError(null);
    try {
      await onUpdateGroupName(editingGroupId, name);
      setEditingGroupId(null);
    } catch (err) {
      setEditGroupError((err as Error).message);
    }
  }

  async function submitDeleteGroup(groupId: number) {
    setDeletingGroup(true);
    setDeleteGroupError(null);
    try {
      await onDeleteGroup(groupId);
      setConfirmDeleteGroupId(null);
    } catch (err) {
      setDeleteGroupError((err as Error).message);
    } finally {
      setDeletingGroup(false);
    }
  }

  async function submitAccount(e: React.FormEvent, groupId: number) {
    e.preventDefault();
    const name = newAccountName.trim();
    if (!name) return;
    setAccountError(null);
    try {
      await onCreateAccount(groupId, name);
      setNewAccountName("");
      setAddingAccountFor(null);
    } catch (err) {
      setAccountError((err as Error).message);
    }
  }

  async function submitEditAccount(e: React.FormEvent) {
    e.preventDefault();
    const name = editAccountName.trim();
    if (!name || editingAccountId === null || editAccountGroupId === null) return;
    setEditAccountError(null);
    try {
      await onUpdateAccount(editingAccountId, editAccountGroupId, name);
      setEditingAccountId(null);
    } catch (err) {
      setEditAccountError((err as Error).message);
    }
  }

  async function submitDeleteAccount(accountId: number, groupId: number) {
    setDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      await onDeleteAccount(accountId, groupId);
      setConfirmDeleteAccountId(null);
    } catch (err) {
      setDeleteAccountError((err as Error).message);
    } finally {
      setDeletingAccount(false);
    }
  }

  const totalAccounts = Object.values(accountsByGroup).reduce((s, a) => s + a.length, 0);

  return (
    <aside className={`sidebar${sidebarOpen ? " sidebar--open" : ""}`}>
      <div className="sidebar-logo">
        <h1>MyMoney</h1>
        <p>Personal Finance</p>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`sidebar-nav-link${activeView === "overview" ? " sidebar-nav-link--active" : ""}`}
          onClick={() => onNavigate("overview")}
        >
          <span className="icon icon--sm">hub</span>
          Overview
        </button>
        <button
          className={`sidebar-nav-link${activeView === "import" ? " sidebar-nav-link--active" : ""}`}
          onClick={() => onNavigate("import")}
        >
          <span className="icon icon--sm">upload_file</span>
          Import CSV
        </button>
        <button
          className={`sidebar-nav-link${activeView === "budget" ? " sidebar-nav-link--active" : ""}`}
          onClick={() => onNavigate("budget")}
        >
          <span className="icon icon--sm">account_balance_wallet</span>
          Budget
        </button>
      </nav>

      <div className="sidebar-portfolios">
        <p className="sidebar-section-label">Portfolios</p>

        {bankGroups.map((group) => {
          const accounts = accountsByGroup[group.id] ?? [];
          const isExpanded = expandedGroups.has(group.id);
          const isGroupActive = selectedGroupId === group.id && selectedAccountId === null;
          const isEditingThisGroup = editingGroupId === group.id;
          const isConfirmingDeleteGroup = confirmDeleteGroupId === group.id;

          return (
            <div key={group.id} className="sidebar-group">
              {/* ── Group header row ── */}
              {isEditingThisGroup ? (
                <div style={{ padding: "4px 12px 4px 24px" }}>
                  <form onSubmit={(e) => void submitRenameGroup(e)} className="sidebar-inline-form sidebar-inline-form--group" style={{ padding: 0 }}>
                    <input
                      ref={editGroupInputRef}
                      value={editGroupName}
                      onChange={(e) => setEditGroupName(e.target.value)}
                      placeholder="Group name"
                      maxLength={60}
                    />
                    <button type="submit" title="Save">
                      <span className="icon icon--sm">check</span>
                    </button>
                    <button
                      type="button"
                      title="Cancel"
                      onClick={() => { setEditingGroupId(null); setEditGroupError(null); }}
                    >
                      <span className="icon icon--sm">close</span>
                    </button>
                  </form>
                  {editGroupError && (
                    <p className="sidebar-inline-form-error" style={{ paddingLeft: 0, marginTop: 4 }}>
                      {editGroupError}
                    </p>
                  )}
                </div>
              ) : (
                <div className="sidebar-group-header-row">
                  <button
                    type="button"
                    className={`sidebar-group-header${isGroupActive ? " sidebar-group-header--active" : ""}`}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <div className="sidebar-group-header-inner">
                      <span
                        className="sidebar-group-color-dot"
                        style={{ background: group.color }}
                      />
                      <span>{group.name}</span>
                    </div>
                    {accounts.length > 0 && (
                      <span
                        className={`icon sidebar-chevron${isExpanded ? " sidebar-chevron--open" : ""}`}
                      >
                        expand_more
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="sidebar-group-palette"
                    title="Change group color"
                    aria-expanded={colorPickerForGroupId === group.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setGroupColorError(null);
                      setConfirmDeleteGroupId(null);
                      setColorPickerForGroupId((id) => (id === group.id ? null : group.id));
                    }}
                  >
                    <span className="icon icon--sm">palette</span>
                  </button>
                  <button
                    type="button"
                    className="sidebar-group-palette"
                    title="Rename group"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditGroup(group);
                    }}
                  >
                    <span className="icon icon--sm">edit</span>
                  </button>
                  <button
                    type="button"
                    className="sidebar-group-palette sidebar-group-palette--danger"
                    title="Delete group"
                    onClick={(e) => {
                      e.stopPropagation();
                      setColorPickerForGroupId(null);
                      setEditingGroupId(null);
                      setDeleteGroupError(null);
                      setConfirmDeleteGroupId((id) => (id === group.id ? null : group.id));
                    }}
                  >
                    <span className="icon icon--sm">delete</span>
                  </button>
                </div>
              )}

              {/* ── Color picker panel ── */}
              {!isEditingThisGroup && colorPickerForGroupId === group.id && (
                <div className="sidebar-group-color-panel">
                  <p className="sidebar-group-color-panel-label">Color</p>
                  <div className="color-swatches">
                    {GROUP_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`color-swatch${group.color.toLowerCase() === color.toLowerCase() ? " color-swatch--active" : ""}`}
                        style={{ background: color }}
                        title={color}
                        onClick={() => {
                          void (async () => {
                            setGroupColorError(null);
                            try {
                              await onUpdateGroupColor(group.id, color);
                              setColorPickerForGroupId(null);
                            } catch (err) {
                              setGroupColorError((err as Error).message);
                            }
                          })();
                        }}
                      />
                    ))}
                  </div>
                  <label className="sidebar-custom-color-label">
                    <span>Custom</span>
                    <input
                      type="color"
                      className="sidebar-custom-color-input"
                      value={/^#[0-9A-Fa-f]{6}$/.test(group.color) ? group.color : "#69daff"}
                      onChange={(e) => {
                        const hex = e.target.value;
                        void (async () => {
                          setGroupColorError(null);
                          try {
                            await onUpdateGroupColor(group.id, hex);
                          } catch (err) {
                            setGroupColorError((err as Error).message);
                          }
                        })();
                      }}
                    />
                  </label>
                  {groupColorError && (
                    <p className="sidebar-inline-form-error" style={{ paddingLeft: 0, marginTop: 6 }}>
                      {groupColorError}
                    </p>
                  )}
                </div>
              )}

              {/* ── Delete group confirmation ── */}
              {isConfirmingDeleteGroup && (
                <div className="sidebar-delete-panel">
                  <p className="sidebar-delete-panel-text">
                    Delete <strong>{group.name}</strong>?{" "}
                    <span style={{ color: "var(--text-dim)" }}>
                      All accounts and transactions will be removed.
                    </span>
                  </p>
                  <div className="sidebar-delete-panel-actions">
                    <button
                      type="button"
                      className="sidebar-cancel-btn"
                      disabled={deletingGroup}
                      onClick={() => { setConfirmDeleteGroupId(null); setDeleteGroupError(null); }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="sidebar-danger-btn"
                      disabled={deletingGroup}
                      onClick={() => void submitDeleteGroup(group.id)}
                    >
                      <span className="icon icon--sm">delete_forever</span>
                      {deletingGroup ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                  {deleteGroupError && (
                    <p className="sidebar-inline-form-error" style={{ paddingLeft: 0, marginTop: 4 }}>
                      {deleteGroupError}
                    </p>
                  )}
                </div>
              )}

              {/* ── Accounts list ── */}
              {isExpanded && (
                <div className="sidebar-accounts">
                  {accounts.map((account) => {
                    const isEditingThisAccount = editingAccountId === account.id;
                    const isConfirmingDeleteAccount = confirmDeleteAccountId === account.id;

                    return (
                      <div key={account.id}>
                        {/* Account row */}
                        <div className="sidebar-account-row">
                          <button
                            className={`sidebar-account-btn${selectedAccountId === account.id ? " sidebar-account-btn--active" : ""}`}
                            onClick={() => onSelectAccount(account.id, group.id)}
                          >
                            <span
                              className="sidebar-account-dot"
                              style={
                                selectedAccountId === account.id
                                  ? { background: group.color }
                                  : undefined
                              }
                            />
                            <span className="sidebar-account-name">{account.name}</span>
                          </button>
                          <button
                            type="button"
                            className="sidebar-account-action-btn"
                            title="Edit account"
                            onClick={() => {
                              if (isEditingThisAccount) {
                                setEditingAccountId(null);
                              } else {
                                openEditAccount(account, group.id);
                              }
                            }}
                          >
                            <span className="icon icon--sm">edit</span>
                          </button>
                          <button
                            type="button"
                            className="sidebar-account-action-btn sidebar-account-action-btn--danger"
                            title="Delete account"
                            onClick={() => {
                              if (isConfirmingDeleteAccount) {
                                setConfirmDeleteAccountId(null);
                              } else {
                                setConfirmDeleteAccountId(account.id);
                                setDeleteAccountError(null);
                                setEditingAccountId(null);
                              }
                            }}
                          >
                            <span className="icon icon--sm">delete</span>
                          </button>
                        </div>

                        {/* Edit account panel */}
                        {isEditingThisAccount && (
                          <form
                            className="sidebar-account-edit-panel"
                            onSubmit={(e) => void submitEditAccount(e)}
                          >
                            <label className="sidebar-edit-label">Name</label>
                            <div className="sidebar-inline-form" style={{ padding: 0, marginBottom: 6 }}>
                              <input
                                ref={editAccountInputRef}
                                value={editAccountName}
                                onChange={(e) => setEditAccountName(e.target.value)}
                                placeholder="Account name"
                                maxLength={60}
                              />
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button type="submit" className="sidebar-confirm-btn">
                                <span className="icon icon--sm">check</span>
                                Save
                              </button>
                              <button
                                type="button"
                                className="sidebar-cancel-btn"
                                onClick={() => { setEditingAccountId(null); setEditAccountError(null); }}
                              >
                                Cancel
                              </button>
                            </div>
                            {editAccountError && (
                              <p className="sidebar-inline-form-error" style={{ paddingLeft: 0, marginTop: 4 }}>
                                {editAccountError}
                              </p>
                            )}
                          </form>
                        )}

                        {/* Delete account confirmation */}
                        {isConfirmingDeleteAccount && (
                          <div className="sidebar-delete-panel">
                            <p className="sidebar-delete-panel-text">
                              Delete <strong>{account.name}</strong>?{" "}
                              <span style={{ color: "var(--text-dim)" }}>
                                All transactions will be removed.
                              </span>
                            </p>
                            <div className="sidebar-delete-panel-actions">
                              <button
                                type="button"
                                className="sidebar-cancel-btn"
                                disabled={deletingAccount}
                                onClick={() => { setConfirmDeleteAccountId(null); setDeleteAccountError(null); }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="sidebar-danger-btn"
                                disabled={deletingAccount}
                                onClick={() => void submitDeleteAccount(account.id, group.id)}
                              >
                                <span className="icon icon--sm">delete_forever</span>
                                {deletingAccount ? "Deleting…" : "Delete"}
                              </button>
                            </div>
                            {deleteAccountError && (
                              <p className="sidebar-inline-form-error" style={{ paddingLeft: 0, marginTop: 4 }}>
                                {deleteAccountError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add account form */}
                  {addingAccountFor === group.id ? (
                    <>
                      <form
                        className="sidebar-inline-form"
                        onSubmit={(e) => void submitAccount(e, group.id)}
                      >
                        <input
                          ref={accountInputRef}
                          value={newAccountName}
                          onChange={(e) => setNewAccountName(e.target.value)}
                          placeholder="Account name"
                          maxLength={60}
                        />
                        <button type="submit" title="Confirm">
                          <span className="icon icon--sm">check</span>
                        </button>
                        <button
                          type="button"
                          title="Cancel"
                          onClick={() => {
                            setAddingAccountFor(null);
                            setNewAccountName("");
                            setAccountError(null);
                          }}
                        >
                          <span className="icon icon--sm">close</span>
                        </button>
                      </form>
                      {accountError && (
                        <p className="sidebar-inline-form-error">{accountError}</p>
                      )}
                    </>
                  ) : (
                    <button
                      className="sidebar-add-btn"
                      style={{ paddingLeft: 44 }}
                      onClick={() => {
                        setAddingAccountFor(group.id);
                        setAccountError(null);
                      }}
                    >
                      <span className="icon icon--sm">add</span>
                      Add account
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {addingGroup ? (
          <div style={{ padding: "8px 24px" }}>
            <form onSubmit={(e) => void submitGroup(e)}>
              <input
                ref={groupInputRef}
                className="sidebar-inline-input"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name"
                maxLength={60}
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
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button type="submit" className="sidebar-confirm-btn">
                  <span className="icon icon--sm">check</span>
                  Create
                </button>
                <button
                  type="button"
                  className="sidebar-cancel-btn"
                  onClick={() => {
                    setAddingGroup(false);
                    setNewGroupName("");
                    setGroupError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
            {groupError && (
              <p className="sidebar-inline-form-error" style={{ paddingLeft: 0, marginTop: 4 }}>
                {groupError}
              </p>
            )}
          </div>
        ) : (
          <button
            className="sidebar-add-btn"
            style={{ marginTop: 4 }}
            onClick={() => {
              setAddingGroup(true);
              setGroupError(null);
            }}
          >
            <span className="icon icon--sm">add_circle</span>
            Add bank group
          </button>
        )}
      </div>

      <div className="sidebar-footer">
        <p className="sidebar-footer-label">Summary</p>
        <p className="sidebar-footer-value">
          {bankGroups.length} group{bankGroups.length !== 1 ? "s" : ""} ·{" "}
          {totalAccounts} account{totalAccounts !== 1 ? "s" : ""}
        </p>
      </div>
    </aside>
  );
}
