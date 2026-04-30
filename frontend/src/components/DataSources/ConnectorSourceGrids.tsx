import type { ConnectRequest, SyncStatus } from '../../types/connectors';
import {
  AvailableSourceCard,
  ConnectedSourceCard,
  type ConnectorSummary,
} from './ConnectorSourceCards';

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
      {connected.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', marginBottom: 8 }}>
            Connected Now
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
            {connected.map((connector) => (
              <ConnectedSourceCard
                key={connector.connector_id}
                connector={connector}
                sync={syncStatuses[connector.connector_id]}
                isExpanded={expandedId === connector.connector_id}
                effectiveAccountId={effectiveAccountId}
                loading={loading}
                onToggleExpanded={onToggleExpanded}
                onConnect={onConnect}
                onLoadConnectors={onLoadConnectors}
              />
            ))}
          </div>
        </div>
      )}

      {notConnected.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', marginBottom: 8 }}>
            Step 3 - Add a Specific App Only If You Need It
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
            These are the manual or advanced setup cards. Use them when a provider sign-in is not available yet or when you want one very specific app connection.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {notConnected.map((connector) => (
              <AvailableSourceCard
                key={connector.connector_id}
                connector={connector}
                isExpanded={expandedId === connector.connector_id}
                needsAccountSelection={needsAccountSelection}
                loading={loading}
                connectingId={connectingId}
                connectStage={connectStage}
                connectError={connectError}
                onToggleExpanded={onToggleExpanded}
                onConnect={onConnect}
                onLoadConnectors={onLoadConnectors}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
