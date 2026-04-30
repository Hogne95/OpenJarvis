import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../lib/store';
import {
  listConnectors,
  listConnectorProviders,
  buildConnectorProviderOAuthUrl,
  connectSource,
  getSyncStatus,
  listConnectorAccounts,
  triggerSync,
} from '../../lib/connectors-api';
import type { ConnectorAccount } from '../../lib/connectors-api';
import type { ConnectRequest, ConnectorProviderRuntimeInfo, SyncStatus } from '../../types/connectors';
import { ConnectorAccountsPanel } from './ConnectorAccountsPanel';
import { ConnectorSourceGrids } from './ConnectorSourceGrids';
import { ProviderConnectPanel } from './ProviderConnectPanel';

const isDocumentHidden = () => typeof document !== 'undefined' && document.hidden;
type ConnectorSummary = { connector_id: string; display_name: string; connected: boolean; chunks: number };
const CONNECTOR_SUMMARY_CACHE_KEY = 'openjarvis-connector-summary-cache';

function readConnectorSummaryCache(): ConnectorSummary[] {
  try {
    const raw = localStorage.getItem(CONNECTOR_SUMMARY_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeConnectorSummaryCache(connectors: ConnectorSummary[]) {
  try {
    localStorage.setItem(CONNECTOR_SUMMARY_CACHE_KEY, JSON.stringify(connectors));
  } catch {}
}

// ---------------------------------------------------------------------------
// Data Sources section
// ---------------------------------------------------------------------------

export function DataSourcesSection({ focusProviders = false }: { focusProviders?: boolean }) {
  const currentUser = useAppStore((s) => s.currentUser);
  const providerPanelRef = useRef<HTMLDivElement | null>(null);
  const [accounts, setAccounts] = useState<ConnectorAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsHydrated, setAccountsHydrated] = useState(false);
  const [connectors, setConnectors] = useState<ConnectorSummary[]>(() => readConnectorSummaryCache());
  const [syncStatuses, setSyncStatuses] = useState<Record<string, SyncStatus>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [providerRuntime, setProviderRuntime] = useState<Record<string, ConnectorProviderRuntimeInfo>>({});

  const isSuperadmin = currentUser?.role === 'superadmin';
  const effectiveAccountId = isSuperadmin ? selectedAccountId : selectedAccountId || null;
  const needsAccountSelection = !isSuperadmin && !effectiveAccountId;

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const nextAccounts = await listConnectorAccounts();
      setAccounts(nextAccounts);
      setSelectedAccountId((prev) => {
        if (prev && nextAccounts.some((account) => account.id === prev)) return prev;
        return nextAccounts[0]?.id || null;
      });
    } catch {
      setAccounts([]);
      setSelectedAccountId(null);
    } finally {
      setAccountsLoading(false);
      setAccountsHydrated(true);
    }
  }, []);

  const loadProviderRuntime = useCallback(async () => {
    try {
      const providers = await listConnectorProviders();
      setProviderRuntime(
        Object.fromEntries(providers.map((provider) => [provider.provider, provider])),
      );
    } catch {
      setProviderRuntime({});
    }
  }, []);

  const loadConnectors = useCallback(() => {
    if (needsAccountSelection) {
      setConnectors([]);
      return;
    }
    listConnectors(effectiveAccountId || undefined)
      .then((list) => {
        const next = list.map((c) => ({
            connector_id: c.connector_id,
            display_name: c.display_name,
            connected: c.connected,
            chunks: (c as any).chunks || 0,
          }));
        setConnectors(next);
        writeConnectorSummaryCache(next);
      })
      .catch(() => {});
  }, [effectiveAccountId, needsAccountSelection]);

  // Poll sync status for connected sources
  const loadSyncStatuses = useCallback(async () => {
    if (needsAccountSelection) {
      setSyncStatuses({});
      return;
    }
    const connected = connectors.filter((c) => c.connected);
    const statuses: Record<string, SyncStatus> = {};
    await Promise.all(
      connected.map(async (c) => {
        try {
          statuses[c.connector_id] = await getSyncStatus(c.connector_id, effectiveAccountId || undefined);
        } catch { /* */ }
      }),
    );
    setSyncStatuses((prev) => ({ ...prev, ...statuses }));
  }, [connectors, effectiveAccountId, needsAccountSelection]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProviderRuntime();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [loadProviderRuntime]);

  useEffect(() => {
    if (!focusProviders) return;
    const timer = window.setTimeout(() => {
      providerPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [focusProviders]);

  useEffect(() => {
    if (!accountsHydrated) return;
    const timer = window.setTimeout(() => {
      void loadConnectors();
    }, 80);
    const interval = setInterval(() => {
      if (isDocumentHidden()) return;
      void loadConnectors();
    }, 30000);
    return () => {
      window.clearTimeout(timer);
      clearInterval(interval);
    };
  }, [accountsHydrated, loadConnectors]);

  useEffect(() => {
    if (accountsHydrated && connectors.some((c) => c.connected)) {
      const timer = window.setTimeout(() => {
        void loadSyncStatuses();
      }, 250);
      const interval = setInterval(() => {
        if (isDocumentHidden()) return;
        void loadSyncStatuses();
      }, 25000);
      return () => {
        window.clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, [accountsHydrated, connectors, loadSyncStatuses]);

  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectStage, setConnectStage] = useState<string>('');
  const [connectError, setConnectError] = useState<string>('');

  const handleConnect = async (id: string, req: ConnectRequest) => {
    if (needsAccountSelection) {
      setConnectError('Choose one of your accounts first so JARVIS knows which private connector space to use.');
      return;
    }
    setLoading(true);
    setConnectingId(id);
    setConnectStage('Connecting...');
    setConnectError('');
    try {
      await connectSource(id, req, effectiveAccountId || undefined);
      setConnectStage('Connected! Starting sync...');

      // Wait for connector to show as connected
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const updated = await listConnectors(effectiveAccountId || undefined);
        const target = updated.find((c) => c.connector_id === id);
        if (target?.connected) {
          setConnectors(updated.map((c) => ({
            connector_id: c.connector_id,
            display_name: c.display_name,
            connected: c.connected,
            chunks: (c as any).chunks || 0,
          })));
          break;
        }
        setConnectStage(i < 5 ? 'Authenticating...' : 'Waiting for connection...');
      }

      // Trigger sync
      setConnectStage('Syncing data...');
      try {
        await triggerSync(id, effectiveAccountId || undefined);
      } catch { /* sync may already be running */ }

      // Close form after a brief moment
      await new Promise((r) => setTimeout(r, 1500));
      setExpandedId(null);
      loadConnectors();
      loadSyncStatuses();
    } catch (err: any) {
      let errorMsg = err.message || 'Connection failed';
      if (id === 'gmail_imap' && (errorMsg.includes('auth') || errorMsg.includes('credentials') || errorMsg.includes('LOGIN'))) {
        errorMsg = 'Invalid credentials — make sure you\'re using an App Password (16 characters), not your regular Gmail password.';
      }
      setConnectError(errorMsg);
      setConnectStage('');
    } finally {
      setLoading(false);
      setConnectingId(null);
      setConnectStage('');
    }
  };

  const connected = connectors.filter((c) => c.connected);
  const notConnectedBase = connectors.filter((c) => !c.connected);
  // Always show the upload card in the not-connected list (it has no backend connector)
  const uploadEntry = { connector_id: 'upload', display_name: 'Upload / Paste', connected: false, chunks: 0 };
  const notConnected = notConnectedBase.some((c) => c.connector_id === 'upload')
    ? notConnectedBase
    : [...notConnectedBase, uploadEntry];

  const handleProviderConnect = (providerId: string) => {
    if (needsAccountSelection) {
      setConnectError('Choose an account above first so provider tokens stay inside the right private connector space.');
      return;
    }
    const authUrl = buildConnectorProviderOAuthUrl(providerId, effectiveAccountId || undefined);
    window.open(authUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div>
      <ConnectorAccountsPanel
        accounts={accounts}
        loading={accountsLoading}
        currentUserRole={currentUser?.role}
        selectedAccountId={selectedAccountId}
        onSelectAccount={setSelectedAccountId}
        onAccountsChange={setAccounts}
      />

      <div
        style={{
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          padding: 12,
          marginBottom: 14,
          fontSize: 11,
          color: 'var(--color-text-secondary)',
        }}
      >
        Choose the account workspace you want to use first. JARVIS keeps connected inboxes and private sources scoped there so your data stays separated correctly.
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {isSuperadmin && (
            <>
              <label htmlFor="connector-scope-select" style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                Connector scope
              </label>
              <select
                id="connector-scope-select"
                value={selectedAccountId || ''}
                onChange={(e) => setSelectedAccountId(e.target.value || null)}
                style={{
                  padding: '6px 10px',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  color: 'var(--color-text)',
                  fontSize: 12,
                }}
              >
                <option value="">System-wide connectors</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label} ({account.provider})
                  </option>
                ))}
              </select>
            </>
          )}
          {!isSuperadmin && accountsLoading && <span>Loading your accounts...</span>}
          {!isSuperadmin && needsAccountSelection && !accountsLoading && (
            <span style={{ color: '#f59e0b' }}>
              Add or choose a personal/work account above to unlock private connector setup.
            </span>
          )}
          {!isSuperadmin && effectiveAccountId && (
            <span style={{ color: '#4ade80' }}>
              Connectors below are scoped to your selected account only.
            </span>
          )}
        </div>
      </div>

      <ProviderConnectPanel
        focusProviders={focusProviders}
        providerPanelRef={providerPanelRef}
        providerRuntime={providerRuntime}
        connectors={connectors}
        needsAccountSelection={needsAccountSelection}
        onConnect={handleProviderConnect}
      />
      <ConnectorSourceGrids
        connected={connected}
        notConnected={notConnected}
        syncStatuses={syncStatuses}
        expandedId={expandedId}
        effectiveAccountId={effectiveAccountId}
        loading={loading}
        connectingId={connectingId}
        connectStage={connectStage}
        connectError={connectError}
        needsAccountSelection={needsAccountSelection}
        onToggleExpanded={setExpandedId}
        onConnect={handleConnect}
        onLoadConnectors={loadConnectors}
      />    </div>
  );
}
