import { SOURCE_CATALOG } from '../../types/connectors';
import type { ConnectRequest, SyncStatus } from '../../types/connectors';
import { InlineConnectForm, UploadForm } from './DataSourceForms';
import { SyncStatusDisplay } from './SyncStatusDisplay';

type ConnectorSummary = { connector_id: string; display_name: string; connected: boolean; chunks: number };

const iconMap: Record<string, string> = {
  gmail: '\u2709\uFE0F', gmail_imap: '\u2709\uFE0F', gmail_api: '\u2709\uFE0F', slack: '#',
  imessage: '\uD83D\uDCAC', gdrive: '\uD83D\uDCC1', notion: '\uD83D\uDCC4',
  obsidian: '\uD83D\uDCC1', granola: '\uD83C\uDF99\uFE0F', gcalendar: '\uD83D\uDCC5',
  gcontacts: '\uD83D\uDCC7', outlook: '\u2709\uFE0F', apple_notes: '\uD83C\uDF4E',
  dropbox: '\uD83D\uDCE6', whatsapp: '\uD83D\uDCF1', upload: '\uD83D\uDCC2',
};

interface ConnectorSourceGridsProps {
  connected: ConnectorSummary[];
  notConnected: ConnectorSummary[];
  syncStatuses: Record<string, SyncStatus>;
  expandedId: string | null;
  effectiveAccountId?: string | null;
  loading: boolean;
  connectingId: string | null;
  connectStage: string;
  connectError: string;
  needsAccountSelection: boolean;
  onToggleExpanded: (connectorId: string | null) => void;
  onConnect: (connectorId: string, request: ConnectRequest) => void;
  onLoadConnectors: () => void;
}

export function ConnectorSourceGrids({
  connected,
  notConnected,
  syncStatuses,
  expandedId,
  effectiveAccountId,
  loading,
  connectingId,
  connectStage,
  connectError,
  needsAccountSelection,
  onToggleExpanded,
  onConnect,
  onLoadConnectors,
}: ConnectorSourceGridsProps) {
  return (
    <>
        {/* Connected sources grid */}
        {connected.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', marginBottom: 8 }}>
              Connected Now
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6, marginBottom: 12,
            }}>
            {connected.map((c) => {
            const meta = SOURCE_CATALOG.find(s => s.connector_id === c.connector_id);
            const unit = meta?.unitLabel || 'items';
            const sync = syncStatuses[c.connector_id];
            const isReconnecting = expandedId === c.connector_id;
            const hasError = !!sync?.error;
            return (
              <div
                key={c.connector_id}
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: hasError ? '1px solid #7f1d1d' : '1px solid #2a5a3a',
                  borderRadius: 6,
                  overflow: 'hidden',
                  gridColumn: isReconnecting ? '1 / -1' : undefined,
                }}
              >
                <div style={{
                  padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 20 }}>{iconMap[c.connector_id] || '\uD83D\uDD17'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {c.display_name}
                    </div>
                    <SyncStatusDisplay
                      chunks={c.chunks}
                      sync={sync}
                      unitLabel={unit}
                      connectorId={c.connector_id}
                      accountId={effectiveAccountId}
                      onSyncTriggered={onLoadConnectors}
                    />
                  </div>
                  <button
                    onClick={() => onToggleExpanded(isReconnecting ? null : c.connector_id)}
                    style={{
                      fontSize: 10, padding: '3px 10px',
                      background: 'transparent',
                      color: 'var(--color-text-secondary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 4, cursor: 'pointer',
                    }}
                  >
                    {isReconnecting ? 'Cancel' : 'Reconnect'}
                  </button>
                </div>
                {isReconnecting && meta?.steps && (
                  <div style={{ borderTop: '1px solid var(--color-border)', padding: 12 }}>
                    <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 8 }}>
                      Re-enter credentials to reconnect this source.
                    </div>
                    {meta.steps.map((step, i) => (
                      <div
                        key={i}
                        style={{
                          background: 'var(--color-bg)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 6, padding: 10,
                          marginBottom: 8,
                        }}
                      >
                        <div style={{ color: '#7c3aed', fontSize: 10, fontWeight: 600, marginBottom: 3 }}>
                          STEP {i + 1}
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
                    {meta.inputFields && (
                      <InlineConnectForm
                        fields={meta.inputFields}
                        loading={loading}
                        onSubmit={(req) => onConnect(c.connector_id, req)}
                      />
                    )}
                  </div>
                )}
              </div>
              );
            })}
            </div>
          </div>
        )}

        {/* Not connected grid */}
        {notConnected.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', marginBottom: 8 }}>
              Step 3 · Add a Specific App Only If You Need It
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
              These are the manual or advanced setup cards. Use them when a provider sign-in is not available yet or when you want one very specific app connection.
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6,
            }}>
            {notConnected.map((c) => {
            const meta = SOURCE_CATALOG.find(s => s.connector_id === c.connector_id);
            const isExpanded = expandedId === c.connector_id;

            return (
              <div
                key={c.connector_id}
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px dashed var(--color-border)',
                  borderRadius: 6, overflow: 'hidden',
                  opacity: isExpanded ? 1 : 0.6,
                  gridColumn: isExpanded ? '1 / -1' : undefined,
                }}
              >
                <div
                  style={{
                    padding: '12px 14px', display: 'flex',
                    alignItems: 'center', gap: 8,
                    cursor: 'pointer',
                  }}
                  onClick={() => onToggleExpanded(isExpanded ? null : c.connector_id)}
                >
                  <span style={{ fontSize: 20 }}>{iconMap[c.connector_id] || '\uD83D\uDD17'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                      {c.display_name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      Not connected
                    </div>
                  </div>
                  <span style={{ color: '#7c3aed', fontSize: 11, fontWeight: 500 }}>
                    {isExpanded ? '\u2715 Close' : '+ Add'}
                  </span>
                </div>

                {isExpanded && c.connector_id === 'upload' && (
                  <div style={{ borderTop: '1px solid var(--color-border)', padding: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
                      Paste text or upload files (.txt, .md, .pdf, .docx, .csv, .tsv, .xlsx, .pptx) to add them to your knowledge base.
                    </div>
                    <UploadForm onDone={onLoadConnectors} />
                  </div>
                )}

                {isExpanded && c.connector_id !== 'upload' && meta?.steps && (
                  <div style={{ borderTop: '1px solid var(--color-border)', padding: 12 }}>
                    {needsAccountSelection && (
                      <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 10 }}>
                        Choose an account above first so this connector stays inside your private workspace.
                      </div>
                    )}
                    {meta.steps.map((step, i) => (
                      <div
                        key={i}
                        style={{
                          background: 'var(--color-bg)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 6, padding: 10,
                          marginBottom: 8,
                        }}
                      >
                        <div style={{ color: '#7c3aed', fontSize: 10, fontWeight: 600, marginBottom: 3 }}>
                          STEP {i + 1}
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
                    {meta?.inputFields && (
                      <InlineConnectForm
                        fields={meta.inputFields}
                        loading={loading && connectingId === c.connector_id}
                        onSubmit={(req) => onConnect(c.connector_id, req)}
                      />
                    )}
                    {meta?.troubleshooting && (
                      <details className="mt-2">
                        <summary className="text-[11px] cursor-pointer" style={{ color: 'var(--color-text-tertiary)' }}>
                          Having trouble?
                        </summary>
                        <ul className="mt-1 space-y-1">
                          {meta.troubleshooting.map((tip: string, i: number) => (
                            <li key={i} className="text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {/* Connection progress */}
                    {connectingId === c.connector_id && connectStage && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          fontSize: 12, color: '#f59e0b',
                        }}>
                          <div className="animate-spin" style={{
                            width: 12, height: 12, borderRadius: '50%',
                            border: '2px solid #f59e0b',
                            borderTopColor: 'transparent',
                          }} />
                          {connectStage}
                        </div>
                        <div style={{
                          height: 3, borderRadius: 2, marginTop: 6,
                          background: 'var(--color-bg-tertiary)',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%', borderRadius: 2, background: '#f59e0b',
                            width: connectStage.includes('Sync') ? '75%' : connectStage.includes('Connected') ? '50%' : '25%',
                            transition: 'width 0.5s ease',
                          }} />
                        </div>
                      </div>
                    )}
                    {/* Connection error */}
                    {connectError && connectingId === null && expandedId === c.connector_id && (
                      <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>
                        {connectError}
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
            </div>
          </div>
        )}    </>
  );
}
