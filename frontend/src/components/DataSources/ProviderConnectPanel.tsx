import type { RefObject } from 'react';
import { PROVIDER_CATALOG } from '../../types/connectors';
import type { ConnectorProviderRuntimeInfo } from '../../types/connectors';

type ConnectorSummary = { connector_id: string; display_name: string; connected: boolean; chunks: number };

interface ProviderConnectPanelProps {
  focusProviders: boolean;
  providerPanelRef: RefObject<HTMLDivElement | null>;
  providerRuntime: Record<string, ConnectorProviderRuntimeInfo>;
  connectors: ConnectorSummary[];
  needsAccountSelection: boolean;
  onConnect: (providerId: string) => void;
}

export function ProviderConnectPanel({
  focusProviders,
  providerPanelRef,
  providerRuntime,
  connectors,
  needsAccountSelection,
  onConnect,
}: ProviderConnectPanelProps) {
  const handleProviderConnect = onConnect;

  return (
    <div
        ref={providerPanelRef}
        style={{
          background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(15,23,42,0.18))',
          border: focusProviders ? '1px solid rgba(34,211,238,0.55)' : '1px solid var(--color-border)',
          boxShadow: focusProviders ? '0 0 0 1px rgba(34,211,238,0.14), 0 20px 60px rgba(8,145,178,0.10)' : undefined,
          borderRadius: 10,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>
                Step 2 · Connect a Provider
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4, maxWidth: 680 }}>
                Use the provider cards first. They are the easiest path because one sign-in can cover the related apps together.
              </div>
              {focusProviders && (
                <div style={{ fontSize: 11, color: '#67e8f9', marginTop: 6 }}>
                  JARVIS brought you here from the agent setup. Pick the provider that matches the inbox, calendar, repo, or messages you want this specialist to use.
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              Best path: connect Google or Microsoft here first, then use the manual cards below only when you need a fallback.
            </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          {PROVIDER_CATALOG.map((provider) => {
            const runtime = providerRuntime[provider.provider_id];
            const connectedCount = connectors.filter((connector) =>
              provider.connector_ids.includes(connector.connector_id) && connector.connected,
            ).length;
            const available = provider.status === 'available';
            const hasRuntimeCredentials = runtime ? runtime.has_credentials : available;
            const buttonDisabled = !available || !hasRuntimeCredentials || needsAccountSelection;

            return (
              <div
                key={provider.provider_id}
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: connectedCount > 0 ? '1px solid #2a5a3a' : '1px solid var(--color-border)',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{provider.display_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                      {provider.description}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      padding: '3px 8px',
                      borderRadius: 999,
                      background: connectedCount > 0 ? 'rgba(34,197,94,0.14)' : 'rgba(148,163,184,0.12)',
                      color: connectedCount > 0 ? '#4ade80' : 'var(--color-text-secondary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {connectedCount > 0 ? 'Connected' : provider.status === 'available' ? 'Ready' : 'Planned'}
                  </span>
                </div>

                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8, lineHeight: 1.5 }}>
                  Covers: {provider.connector_ids.join(', ')}
                </div>
                {provider.note && (
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
                    {provider.note}
                  </div>
                )}
                {runtime && (
                  <div style={{ fontSize: 11, color: runtime.has_credentials ? '#4ade80' : '#f59e0b', marginTop: 8 }}>
                    {runtime.has_credentials
                      ? `${runtime.display_name} OAuth credentials are configured on this JARVIS runtime.`
                      : `${runtime.display_name} still needs OAuth client credentials on this JARVIS runtime.`}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    <button
                      onClick={() => handleProviderConnect(provider.provider_id)}
                      disabled={buttonDisabled}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: buttonDisabled ? '#334155' : '#7c3aed',
                      color: 'white',
                      cursor: buttonDisabled ? 'not-allowed' : 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                      {available ? provider.actionLabel : `Coming Next: ${provider.display_name}`}
                    </button>
                    {runtime?.setup_url && !runtime.has_credentials && (
                      <a
                      href={runtime.setup_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        fontSize: 11,
                        color: '#60a5fa',
                        textDecoration: 'underline',
                      }}
                    >
                      Configure provider credentials &rarr;
                    </a>
                  )}
                </div>

                  {needsAccountSelection && available && (
                    <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 8 }}>
                      Choose an account above first so provider tokens stay inside the right private workspace.
                    </div>
                  )}
                  {available && runtime && !runtime.has_credentials && (
                    <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 8, lineHeight: 1.5 }}>
                      Add the {provider.display_name} client ID and secret on this JARVIS runtime first, then this button becomes a real one-click sign-in.
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>  );
}
