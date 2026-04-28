import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight } from 'lucide-react';
import type { ManagedAgent } from '../../lib/api';
import { connectSource, listConnectors } from '../../lib/connectors-api';
import type { ConnectRequest } from '../../types/connectors';
import { SOURCE_CATALOG } from '../../types/connectors';
import {
  recommendedConnectorsForAgent,
  recommendedProvidersForAgent,
} from '../../lib/agentPresentation';

const isDocumentHidden = () => typeof document !== 'undefined' && document.hidden;

const iconMap: Record<string, string> = {
  gmail: '\u2709\uFE0F',
  gmail_imap: '\u2709\uFE0F',
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
};

function InlineConnectForm({
  fields,
  loading,
  onSubmit,
}: {
  fields: Array<{ name: string; placeholder: string; type?: string }>;
  loading: boolean;
  onSubmit: (req: ConnectRequest) => void;
}) {
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const update = (name: string, value: string) =>
    setInputs((p) => ({ ...p, [name]: value }));

  const allFilled = fields.every((f) => inputs[f.name]?.trim());

  const submit = () => {
    const req: ConnectRequest = {};
    for (const f of fields) {
      if (f.name === 'email') req.email = inputs.email;
      else if (f.name === 'password') req.password = inputs.password;
      else if (f.name === 'token') req.token = inputs.token;
      else if (f.name === 'path') req.path = inputs.path;
    }
    if (req.email && req.password) {
      req.token = `${req.email}:${req.password}`;
      req.code = req.token;
    }
    if (req.token && !req.code) req.code = req.token;
    onSubmit(req);
  };

  return (
    <div>
      {fields.map((f) => (
        <input
          key={f.name}
          value={inputs[f.name] || ''}
          onChange={(e) => update(f.name, e.target.value)}
          placeholder={f.placeholder}
          type={f.type || 'text'}
          style={{
            width: '100%', padding: '7px 10px',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 4, color: 'var(--color-text)',
            fontSize: 12, marginBottom: 6,
            boxSizing: 'border-box',
          }}
        />
      ))}
      <button
        onClick={submit}
        disabled={loading || !allFilled}
        style={{
          width: '100%', padding: 8,
          background: loading || !allFilled ? '#444' : '#7c3aed',
          color: 'white', border: 'none',
          borderRadius: 6, fontSize: 12, cursor: 'pointer',
        }}
      >
        {loading ? 'Connecting...' : 'Connect'}
      </button>
    </div>
  );
}

export function ChannelsTab({ agentId, agent }: { agentId: string; agent: ManagedAgent }) {
  const navigate = useNavigate();
  const [connectors, setConnectors] = useState<
    Array<{ connector_id: string; display_name: string; connected: boolean; chunks: number }>
  >([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  void agentId;

  const loadConnectors = useCallback(() => {
    listConnectors()
      .then((list) =>
        setConnectors(
          list.map((c) => ({
            connector_id: c.connector_id,
            display_name: c.display_name,
            connected: c.connected,
            chunks: (c as any).chunks || 0,
          })),
        ),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadConnectors();
    const interval = setInterval(() => {
      if (isDocumentHidden()) return;
      void loadConnectors();
    }, 20000);
    return () => clearInterval(interval);
  }, [loadConnectors]);

  const handleConnect = async (id: string, req: ConnectRequest) => {
    setLoading(true);
    try {
      await connectSource(id, req);
      setExpandedId(null);
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        await loadConnectors();
        const updated = await listConnectors();
        const target = updated.find((c) => c.connector_id === id);
        if (target?.connected) break;
      }
    } catch {
      // Keep the setup panel available so the user can retry.
    } finally {
      setLoading(false);
    }
  };

  const connected = connectors.filter((c) => c.connected);
  const notConnected = connectors.filter((c) => !c.connected);
  const recommendedSources = recommendedConnectorsForAgent(agent)
    .filter((source) => !connected.some((item) => item.connector_id === source.connector_id))
    .slice(0, 3);
  const recommendedProviders = recommendedProvidersForAgent(agent);

  const getMeta = (id: string) =>
    SOURCE_CATALOG.find((s) => s.connector_id === id);

  return (
    <div style={{ padding: 16 }}>
      <div style={{
        color: 'var(--color-text-secondary)',
        fontSize: 12, marginBottom: 12,
      }}>
        Data sources your agent can search across
      </div>

      <div className="grid gap-3 md:grid-cols-2 mb-4">
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            Best First Move
          </div>
          <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {connected.length > 0
              ? 'This agent already has app access. Add another recommended source if you want broader context.'
              : `Start with ${recommendedConnectorsForAgent(agent)[0]?.display_name || 'one relevant app'} so this agent has useful information to work with right away.`}
          </div>
        </div>
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            Why It Helps
          </div>
          <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Connected apps make this agent feel genuinely useful by giving it the sources its role actually depends on.
          </div>
        </div>
      </div>

      {recommendedProviders.length > 0 && (
        <div
          className="rounded-xl p-4 mb-4"
          style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(15,23,42,0.18))', border: '1px solid var(--color-border)' }}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
                Easiest Connection Path
              </div>
              <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Start with a provider sign-in when it is available. One connection can unlock several apps for this specialist.
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/data-sources?focus=providers')}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
              style={{ background: 'var(--color-accent)', color: '#fff' }}
            >
              Open Connected Apps <ChevronRight size={14} />
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {recommendedProviders.map((provider) => (
              <button
                key={provider.provider_id}
                type="button"
                onClick={() => navigate('/data-sources?focus=providers')}
                className="rounded-lg p-3 text-left transition-colors"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    {provider.actionLabel}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.14)', color: '#4ade80' }}>
                    Provider
                  </span>
                </div>
                <div className="mt-2 text-xs leading-5" style={{ color: 'var(--color-text-secondary)' }}>
                  {provider.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {recommendedSources.length > 0 && (
        <div
          className="rounded-xl p-4 mb-4"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.24em] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            Recommended For This Agent
          </div>
          <div className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
            Based on this agent's role, these are the most useful apps to connect first.
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {recommendedSources.map((source) => (
              <button
                key={source.connector_id}
                type="button"
                onClick={() => {
                  if (source.auth_type === 'oauth') {
                    navigate('/data-sources?focus=providers');
                    return;
                  }
                  setExpandedId(source.connector_id);
                }}
                className="rounded-lg p-3 text-left cursor-pointer transition-colors"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span style={{ fontSize: 18 }}>{iconMap[source.connector_id] || 'Link'}</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    {source.display_name}
                  </span>
                </div>
                <div className="text-xs leading-5" style={{ color: 'var(--color-text-secondary)' }}>
                  {source.description}
                </div>
                <div className="mt-3 text-[10px] uppercase tracking-[0.22em]" style={{ color: 'var(--color-accent)' }}>
                  {source.auth_type === 'oauth' ? 'Use Provider Sign-In' : 'Open Setup'}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {connected.length === 0 && recommendedSources.length === 0 && (
        <div
          className="rounded-xl p-5 mb-4 text-center"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
            No connected apps yet
          </div>
          <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            Pick the source this agent is most likely to rely on first, then add more only if you want a broader working context.
          </div>
        </div>
      )}

      {connected.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6, marginBottom: 12,
        }}>
          {connected.map((c) => {
            const meta = SOURCE_CATALOG.find(s => s.connector_id === c.connector_id);
            const unit = meta?.unitLabel || 'items';
            const isReconnecting = expandedId === c.connector_id;
            return (
              <div
                key={c.connector_id}
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid #2a5a3a',
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
                    <div style={{ fontSize: 12, color: c.chunks > 0 ? '#4ade80' : '#f59e0b' }}>
                      {c.chunks > 0
                        ? `${c.chunks.toLocaleString()} ${unit}`
                        : 'Connected - no data synced yet'}
                    </div>
                  </div>
                  <button
                    onClick={() => setExpandedId(isReconnecting ? null : c.connector_id)}
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
                  <div style={{
                    borderTop: '1px solid var(--color-border)',
                    padding: 12,
                  }}>
                    <div style={{
                      fontSize: 12, color: '#f59e0b',
                      marginBottom: 8,
                    }}>
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
                        <div style={{
                          color: '#7c3aed', fontSize: 10,
                          fontWeight: 600, marginBottom: 3,
                        }}>
                          STEP {i + 1}
                        </div>
                        <div style={{ fontSize: 12, marginBottom: step.url ? 4 : 0 }}>
                          {step.label}
                        </div>
                        {step.url && (
                          <a
                            href={step.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: '#60a5fa', fontSize: 11,
                              textDecoration: 'underline',
                            }}
                          >
                            {step.urlLabel || 'Open'} {'\u2192'}
                          </a>
                        )}
                      </div>
                    ))}
                    {meta.inputFields && (
                      <InlineConnectForm
                        fields={meta.inputFields}
                        loading={loading}
                        onSubmit={(req) => handleConnect(c.connector_id, req)}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {notConnected.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
        }}>
          {notConnected.map((c) => {
            const meta = getMeta(c.connector_id);
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
                  onClick={() =>
                    setExpandedId(isExpanded ? null : c.connector_id)
                  }
                >
                  <span style={{ fontSize: 20 }}>{iconMap[c.connector_id] || '\uD83D\uDD17'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600,
                      color: 'var(--color-text-secondary)' }}>
                      {c.display_name}
                    </div>
                    <div style={{ fontSize: 12,
                      color: 'var(--color-text-secondary)' }}>
                      Not connected
                    </div>
                  </div>
                  <span style={{
                    color: '#7c3aed', fontSize: 11, fontWeight: 500,
                  }}>
                    {isExpanded ? '\u2715 Close' : '+ Add'}
                  </span>
                </div>

                {isExpanded && meta?.steps && (
                  <div style={{
                    borderTop: '1px solid var(--color-border)',
                    padding: 12,
                  }}>
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
                        <div style={{
                          color: '#7c3aed', fontSize: 10,
                          fontWeight: 600, marginBottom: 3,
                        }}>
                          STEP {i + 1}
                        </div>
                        <div style={{
                          fontSize: 12, marginBottom: step.url ? 4 : 0,
                        }}>
                          {step.label}
                        </div>
                        {step.url && (
                          <a
                            href={step.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: '#60a5fa', fontSize: 11,
                              textDecoration: 'underline',
                            }}
                          >
                            {step.urlLabel || 'Open'} {'\u2192'}
                          </a>
                        )}
                      </div>
                    ))}
                    {meta.inputFields && (
                      <InlineConnectForm
                        fields={meta.inputFields}
                        loading={loading}
                        onSubmit={(req) =>
                          handleConnect(c.connector_id, req)
                        }
                      />
                    )}
                    <div style={{
                      fontSize: 10, color: 'var(--color-text-secondary)',
                      textAlign: 'center', marginTop: 8,
                    }}>
                      {'\uD83D\uDD12'} Read-only access {'\u00B7'} No data leaves your device
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
