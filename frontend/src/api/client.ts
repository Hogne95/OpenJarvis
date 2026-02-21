import type { ModelInfo, SavingsData, ServerInfo } from '../types';

const BASE = '';  // relative to same origin

export async function fetchModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${BASE}/v1/models`);
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

export async function fetchSavings(): Promise<SavingsData> {
  const res = await fetch(`${BASE}/v1/savings`);
  if (!res.ok) throw new Error(`Failed to fetch savings: ${res.status}`);
  return res.json();
}

export async function fetchServerInfo(): Promise<ServerInfo> {
  const res = await fetch(`${BASE}/v1/info`);
  if (!res.ok) throw new Error(`Failed to fetch server info: ${res.status}`);
  return res.json();
}
