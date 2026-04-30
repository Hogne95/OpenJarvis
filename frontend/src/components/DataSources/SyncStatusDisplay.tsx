import { useState } from 'react';
import type { CSSProperties } from 'react';
import { triggerSync } from '../../lib/connectors-api';
import type { SyncStatus } from '../../types/connectors';

export function SyncStatusDisplay({
  chunks,
  sync,
  unitLabel,
  connectorId,
  accountId,
  onSyncTriggered,
}: {
  chunks: number;
  sync: SyncStatus | undefined;
  unitLabel: string;
  connectorId: string;
  accountId?: string | null;
  onSyncTriggered: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');

  const handleSync = async () => {
    setSyncing(true);
    setSyncError('');
    try {
      await triggerSync(connectorId, accountId || undefined);
      onSyncTriggered();
    } catch (err: any) {
      setSyncError(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  if (sync?.error) {
    return (
      <div>
        <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 4 }}>Error: {sync.error}</div>
        <button onClick={handleSync} disabled={syncing} style={smallPrimaryButton(syncing)}>
          {syncing ? 'Retrying...' : 'Retry Sync'}
        </button>
      </div>
    );
  }

  if (chunks > 0) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#4ade80' }}>
            {chunks.toLocaleString()} {unitLabel}
          </span>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              fontSize: 9,
              padding: '1px 6px',
              background: 'transparent',
              color: 'var(--color-text-tertiary)',
              border: '1px solid var(--color-border)',
              borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            {syncing ? '...' : 'Re-sync'}
          </button>
        </div>
        {syncError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{syncError}</div>}
      </div>
    );
  }

  if (sync?.state === 'syncing' || syncing) {
    const pct = sync?.items_total && sync.items_total > 0
      ? Math.round((sync.items_synced / sync.items_total) * 100)
      : null;
    const label = sync?.items_total && sync.items_total > 0
      ? `${sync.items_synced.toLocaleString()} / ${sync.items_total.toLocaleString()}`
      : sync?.items_synced && sync.items_synced > 0
        ? `${sync.items_synced.toLocaleString()} items so far`
        : 'Starting...';
    return <ProgressStatus label={`Syncing - ${label}`} pct={pct} />;
  }

  if (sync?.state === 'idle' && sync.items_synced > 0) {
    return <ProgressStatus label={`Indexing ${sync.items_synced.toLocaleString()} items...`} pct={60} indeterminate />;
  }

  const hasSynced = sync?.last_sync != null;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {hasSynced ? 'Synced - 0 items found' : 'Connected - not synced yet'}
        </span>
        <button onClick={handleSync} disabled={syncing} style={smallPrimaryButton(syncing)}>
          {syncing ? 'Syncing...' : hasSynced ? 'Re-sync' : 'Sync Now'}
        </button>
      </div>
      {hasSynced && connectorId === 'slack' && (
        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
          Tip: invite the bot to channels with /invite @OpenJarvis, then re-sync
        </div>
      )}
      {syncError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{syncError}</div>}
    </div>
  );
}

function ProgressStatus({ label, pct, indeterminate = false }: { label: string; pct: number | null; indeterminate?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 4 }}>{label}</div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--color-bg-tertiary)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            borderRadius: 2,
            background: '#f59e0b',
            width: pct != null ? `${pct}%` : '30%',
            transition: 'width 0.5s ease',
            animationName: pct == null || indeterminate ? 'pulse' : undefined,
            animationDuration: pct == null || indeterminate ? '1.5s' : undefined,
            animationIterationCount: pct == null || indeterminate ? 'infinite' : undefined,
          }}
        />
      </div>
    </div>
  );
}

function smallPrimaryButton(disabled: boolean): CSSProperties {
  return {
    fontSize: 10,
    padding: '2px 10px',
    background: '#7c3aed',
    color: 'white',
    border: 'none',
    borderRadius: 3,
    cursor: 'pointer',
    fontWeight: 600,
    opacity: disabled ? 0.5 : 1,
  };
}
