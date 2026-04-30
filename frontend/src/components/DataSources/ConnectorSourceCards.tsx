import { SOURCE_CATALOG } from '../../types/connectors';
import type { ConnectRequest, SyncStatus } from '../../types/connectors';
import { InlineConnectForm, UploadForm } from './DataSourceForms';
import { SyncStatusDisplay } from './SyncStatusDisplay';

export type ConnectorSummary = {
  connector_id: string;
  display_name: string;
  connected: boolean;
  chunks: number;
};

const iconMap: Record<string, string> = {
  gmail: '\u2709\uFE0F',
  gmail_imap: '\u2709\uFE0F',
  gmail_api: '\u2709\uFE0F',
  slack: '#',
  imessage: '\uD83D\uDCAC',
  gdrive: '\uD83D\uDCC1',
  notion: '\uD83D\uDCC4',
  obsidian: '\uD83D\uDCC1',
  granola: '\uD83C\uDF99\uFE0F',
  gcalendar: '\uD83D\uDCC5',
  gcontacts: '\uD83D\uDCC7',
  outlook: '\u2709\uFE0F',
  apple_notes: '\uD83C\uDF4E',
  dropbox: '\uD83D\uDCE6',
  whatsapp: '\uD83D\uDCF1',
  upload: '\uD83D\uDCC2',
};

function SetupSteps({ steps }: { steps: Array<{ label: string; url?: string; urlLabel?: string }> }) {
  return (
    <>
      {steps.map((step, index) => (
        <div
          key={index}
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            padding: 10,
            marginBottom: 8,
          }}
        >
          <div style={{ color: '#7c3aed', fontSize: 10, fontWeight: 600, marginBottom: 3 }}>
            STEP {index + 1}
          </div>
          <div style={{ fontSize: 12, marginBottom: step.url ? 4 : 0 }}>{step.label}</div>
          {step.url && (
            <a
              href={step.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#60a5fa', fontSize: 11, textDecoration: 'underline' }}
            >
              {step.urlLabel || 'Open'} &rarr;
            </a>
          )}
        </div>
      ))}
    </>
  );
}

export function ConnectedSourceCard({
  connector,
  sync,
  isExpanded,
  effectiveAccountId,
  loading,
  onToggleExpanded,
  onConnect,
  onLoadConnectors,
}: {
  connector: ConnectorSummary;
  sync?: SyncStatus;
  isExpanded: boolean;
  effectiveAccountId?: string | null;
  loading: boolean;
  onToggleExpanded: (connectorId: string | null) => void;
  onConnect: (connectorId: string, request: ConnectRequest) => void;
  onLoadConnectors: () => void;
}) {
  const meta = SOURCE_CATALOG.find((source) => source.connector_id === connector.connector_id);
  const unit = meta?.unitLabel || 'items';
  const hasError = !!sync?.error;

  return (
    <div
      style={{
        background: 'var(--color-bg-secondary)',
        border: hasError ? '1px solid #7f1d1d' : '1px solid #2a5a3a',
        borderRadius: 6,
        overflow: 'hidden',
        gridColumn: isExpanded ? '1 / -1' : undefined,
      }}
    >
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 20 }}>{iconMap[connector.connector_id] || '\uD83D\uDD17'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{connector.display_name}</div>
          <SyncStatusDisplay
            chunks={connector.chunks}
            sync={sync}
            unitLabel={unit}
            connectorId={connector.connector_id}
            accountId={effectiveAccountId}
            onSyncTriggered={onLoadConnectors}
          />
        </div>
        <button
          onClick={() => onToggleExpanded(isExpanded ? null : connector.connector_id)}
          style={{
            fontSize: 10,
            padding: '3px 10px',
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {isExpanded ? 'Cancel' : 'Reconnect'}
        </button>
      </div>
      {isExpanded && meta?.steps && (
        <div style={{ borderTop: '1px solid var(--color-border)', padding: 12 }}>
          <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 8 }}>
            Re-enter credentials to reconnect this source.
          </div>
          <SetupSteps steps={meta.steps} />
          {meta.inputFields && (
            <InlineConnectForm
              fields={meta.inputFields}
              loading={loading}
              onSubmit={(request) => onConnect(connector.connector_id, request)}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function AvailableSourceCard({
  connector,
  isExpanded,
  needsAccountSelection,
  loading,
  connectingId,
  connectStage,
  connectError,
  onToggleExpanded,
  onConnect,
  onLoadConnectors,
}: {
  connector: ConnectorSummary;
  isExpanded: boolean;
  needsAccountSelection: boolean;
  loading: boolean;
  connectingId: string | null;
  connectStage: string;
  connectError: string;
  onToggleExpanded: (connectorId: string | null) => void;
  onConnect: (connectorId: string, request: ConnectRequest) => void;
  onLoadConnectors: () => void;
}) {
  const meta = SOURCE_CATALOG.find((source) => source.connector_id === connector.connector_id);

  return (
    <div
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px dashed var(--color-border)',
        borderRadius: 6,
        overflow: 'hidden',
        opacity: isExpanded ? 1 : 0.6,
        gridColumn: isExpanded ? '1 / -1' : undefined,
      }}
    >
      <div
        style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        onClick={() => onToggleExpanded(isExpanded ? null : connector.connector_id)}
      >
        <span style={{ fontSize: 20 }}>{iconMap[connector.connector_id] || '\uD83D\uDD17'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            {connector.display_name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Not connected</div>
        </div>
        <span style={{ color: '#7c3aed', fontSize: 11, fontWeight: 500 }}>
          {isExpanded ? '\u2715 Close' : '+ Add'}
        </span>
      </div>

      {isExpanded && connector.connector_id === 'upload' && (
        <div style={{ borderTop: '1px solid var(--color-border)', padding: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
            Paste text or upload files (.txt, .md, .pdf, .docx, .csv, .tsv, .xlsx, .pptx) to add them to your knowledge base.
          </div>
          <UploadForm onDone={onLoadConnectors} />
        </div>
      )}

      {isExpanded && connector.connector_id !== 'upload' && meta?.steps && (
        <div style={{ borderTop: '1px solid var(--color-border)', padding: 12 }}>
          {needsAccountSelection && (
            <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 10 }}>
              Choose an account above first so this connector stays inside your private workspace.
            </div>
          )}
          <SetupSteps steps={meta.steps} />
          {meta.inputFields && (
            <InlineConnectForm
              fields={meta.inputFields}
              loading={loading && connectingId === connector.connector_id}
              onSubmit={(request) => onConnect(connector.connector_id, request)}
            />
          )}
          {meta.troubleshooting && (
            <details className="mt-2">
              <summary className="text-[11px] cursor-pointer" style={{ color: 'var(--color-text-tertiary)' }}>
                Having trouble?
              </summary>
              <ul className="mt-1 space-y-1">
                {meta.troubleshooting.map((tip: string, index: number) => (
                  <li key={index} className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    {tip}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {connectingId === connector.connector_id && connectStage && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#f59e0b' }}>
                <div
                  className="animate-spin"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    border: '2px solid #f59e0b',
                    borderTopColor: 'transparent',
                  }}
                />
                {connectStage}
              </div>
              <div
                style={{
                  height: 3,
                  borderRadius: 2,
                  marginTop: 6,
                  background: 'var(--color-bg-tertiary)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    borderRadius: 2,
                    background: '#f59e0b',
                    width: connectStage.includes('Sync') ? '75%' : connectStage.includes('Connected') ? '50%' : '25%',
                    transition: 'width 0.5s ease',
                  }}
                />
              </div>
            </div>
          )}
          {connectError && connectingId === null && isExpanded && (
            <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{connectError}</div>
          )}
        </div>
      )}
    </div>
  );
}
