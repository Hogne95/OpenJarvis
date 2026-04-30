import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Mail, Plus, Trash2 } from 'lucide-react';
import {
  createConnectorAccount,
  deleteConnectorAccount,
  type ConnectorAccount,
} from '../../lib/connectors-api';

export function ConnectorAccountsPanel({
  accounts,
  loading,
  currentUserRole,
  selectedAccountId,
  onSelectAccount,
  onAccountsChange,
}: {
  accounts: ConnectorAccount[];
  loading: boolean;
  currentUserRole: string | undefined;
  selectedAccountId?: string | null;
  onSelectAccount?: (accountId: string | null) => void;
  onAccountsChange?: (accounts: ConnectorAccount[]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    provider: 'gmail',
    label: '',
    account_type: 'email',
    external_identity: '',
  });

  const handleCreate = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    try {
      const created = await createConnectorAccount({
        provider: form.provider,
        label: form.label.trim(),
        account_type: form.account_type.trim() || 'email',
        external_identity: form.external_identity.trim(),
        metadata: { created_from: 'data_sources_page' },
      });
      const nextAccounts = [created, ...accounts];
      onAccountsChange?.(nextAccounts);
      if (!selectedAccountId) onSelectAccount?.(created.id);
      setForm((prev) => ({ ...prev, label: '', external_identity: '' }));
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to add account');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (accountId: string) => {
    try {
      await deleteConnectorAccount(accountId);
      const nextAccounts = accounts.filter((account) => account.id !== accountId);
      onAccountsChange?.(nextAccounts);
      if (selectedAccountId === accountId) onSelectAccount?.(nextAccounts[0]?.id || null);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to delete account');
    }
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    color: 'var(--color-text)',
    fontSize: 12,
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        padding: 14,
        marginBottom: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Mail size={18} style={{ color: 'var(--color-accent)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Step 1 - Choose an Account</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
            Keep work and personal data separate so JARVIS knows which private space each connection belongs to.
          </div>
        </div>
      </div>

      <div
        style={{
          fontSize: 11,
          color: 'var(--color-text-secondary)',
          marginBottom: 12,
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          padding: '10px 12px',
        }}
      >
        Start here first. An account is just a private workspace label like Work, Personal, or Side Project.
        {currentUserRole !== 'superadmin' && (
          <div style={{ marginTop: 6 }}>
            Pick one account below, then connect apps into that private space. Other users cannot see or reuse those credentials.
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr auto', gap: 8, marginBottom: 12 }}>
        <select value={form.provider} onChange={(event) => setForm((prev) => ({ ...prev, provider: event.target.value }))} style={inputStyle}>
          <option value="gmail">Email / Google</option>
          <option value="outlook">Email / Microsoft</option>
          <option value="imap">Other Email</option>
          <option value="slack">Slack Workspace</option>
          <option value="custom">Custom</option>
        </select>
        <input
          value={form.label}
          onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
          placeholder="Account name (Work, Personal)"
          style={inputStyle}
        />
        <input
          value={form.external_identity}
          onChange={(event) => setForm((prev) => ({ ...prev, external_identity: event.target.value }))}
          placeholder="Email address or account name"
          style={inputStyle}
        />
        <button
          onClick={handleCreate}
          disabled={saving || !form.label.trim()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '0 12px',
            background: saving || !form.label.trim() ? '#444' : '#7c3aed',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            cursor: 'pointer',
            minHeight: 34,
          }}
        >
          <Plus size={14} />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Loading your accounts...</div>
      ) : accounts.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          No accounts saved yet. Add your personal and work identities here first.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              Active account
            </div>
            <select value={selectedAccountId || ''} onChange={(event) => onSelectAccount?.(event.target.value || null)} style={{ ...inputStyle, maxWidth: 280 }}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label} ({account.provider})
                </option>
              ))}
            </select>
          </div>
          {accounts.map((account) => (
            <div
              key={account.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: '10px 12px',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {account.label}
                  <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
                    {account.provider}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                  {account.external_identity || 'Identity pending'}
                </div>
              </div>
              <span
                style={{
                  fontSize: 10,
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                {account.status}
              </span>
              <button
                onClick={() => handleDelete(account.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 30,
                  height: 30,
                  background: 'transparent',
                  color: '#f87171',
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
                aria-label={`Delete ${account.label}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
