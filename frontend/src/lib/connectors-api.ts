import { fetchWithTimeout, getBase } from './api';
import type { ConnectorInfo, SyncStatus, ConnectRequest } from '../types/connectors';

// ---------------------------------------------------------------------------
// Connectors API
// ---------------------------------------------------------------------------

async function connectorFetch(path: string, init: RequestInit = {}, timeoutMs = 7000): Promise<Response> {
  return fetchWithTimeout(`${getBase()}${path}`, {
    ...init,
    credentials: 'include',
  }, timeoutMs);
}

export interface ConnectorAccount {
  id: string;
  owner_user_id: string;
  provider: string;
  account_type: string;
  label: string;
  external_identity: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function listConnectors(accountId?: string): Promise<ConnectorInfo[]> {
  const suffix = accountId ? `?account_id=${encodeURIComponent(accountId)}` : '';
  const res = await connectorFetch(`/v1/connectors${suffix}`);
  if (!res.ok) throw new Error(`Failed to list connectors: ${res.status}`);
  const data = await res.json();
  return data.connectors || [];
}

export async function getConnector(id: string, accountId?: string): Promise<ConnectorInfo> {
  const suffix = accountId ? `?account_id=${encodeURIComponent(accountId)}` : '';
  const res = await connectorFetch(`/v1/connectors/${encodeURIComponent(id)}${suffix}`);
  if (!res.ok) throw new Error(`Failed to get connector ${id}: ${res.status}`);
  return res.json();
}

export async function connectSource(id: string, req: ConnectRequest, accountId?: string): Promise<ConnectorInfo> {
  const suffix = accountId ? `?account_id=${encodeURIComponent(accountId)}` : '';
  const res = await connectorFetch(`/v1/connectors/${encodeURIComponent(id)}/connect${suffix}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  }, 10000);
  if (!res.ok) throw new Error(`Failed to connect ${id}: ${res.status}`);
  return res.json();
}

export async function disconnectSource(id: string, accountId?: string): Promise<void> {
  const suffix = accountId ? `?account_id=${encodeURIComponent(accountId)}` : '';
  const res = await connectorFetch(`/v1/connectors/${encodeURIComponent(id)}/disconnect${suffix}`, {
    method: 'POST',
  }, 7000);
  if (!res.ok) throw new Error(`Failed to disconnect ${id}: ${res.status}`);
}

export async function getSyncStatus(id: string, accountId?: string): Promise<SyncStatus> {
  const suffix = accountId ? `?account_id=${encodeURIComponent(accountId)}` : '';
  const res = await connectorFetch(`/v1/connectors/${encodeURIComponent(id)}/sync${suffix}`);
  if (!res.ok) throw new Error(`Failed to get sync status for ${id}: ${res.status}`);
  return res.json();
}

export async function triggerSync(id: string, accountId?: string): Promise<{ connector_id: string; chunks_indexed: number; status: string }> {
  const suffix = accountId ? `?account_id=${encodeURIComponent(accountId)}` : '';
  const res = await connectorFetch(`/v1/connectors/${encodeURIComponent(id)}/sync${suffix}`, {
    method: 'POST',
  }, 10000);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Sync failed: ${res.status}`);
  }
  return res.json();
}

export async function listConnectorAccounts(): Promise<ConnectorAccount[]> {
  const res = await connectorFetch('/v1/connectors/accounts');
  if (!res.ok) throw new Error(`Failed to list connector accounts: ${res.status}`);
  const data = await res.json();
  return data.accounts || [];
}

export async function createConnectorAccount(body: {
  provider: string;
  label: string;
  account_type?: string;
  external_identity?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}): Promise<ConnectorAccount> {
  const res = await connectorFetch('/v1/connectors/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 10000);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to create connector account: ${res.status}`);
  }
  return res.json();
}

export async function updateConnectorAccount(
  accountId: string,
  body: Partial<{
    provider: string;
    label: string;
    account_type: string;
    external_identity: string;
    status: string;
    metadata: Record<string, unknown>;
  }>,
): Promise<ConnectorAccount> {
  const res = await connectorFetch(`/v1/connectors/accounts/${encodeURIComponent(accountId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 10000);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to update connector account: ${res.status}`);
  }
  return res.json();
}

export async function deleteConnectorAccount(accountId: string): Promise<void> {
  const res = await connectorFetch(`/v1/connectors/accounts/${encodeURIComponent(accountId)}`, {
    method: 'DELETE',
  }, 10000);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to delete connector account: ${res.status}`);
  }
}
