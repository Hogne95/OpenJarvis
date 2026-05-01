import type { ModelInfo, SavingsData, ServerInfo } from '../types';
import type { CodingRepoMemory } from './api/operatorMemory';
import type { PendingWorkbenchCommand, WorkbenchEntry } from './api/workspaceCoding';
import {
  authFetch,
  fetchWithTimeout,
  getBase,
  isTauri,
  tauriInvoke,
} from './api/core';
export { fetchWithTimeout, getBase, initApiBase, isTauri } from './api/core';
// ---------------------------------------------------------------------------
// Setup status (desktop only)
// ---------------------------------------------------------------------------

export interface SetupStatus {
  phase: string;
  detail: string;
  ollama_ready: boolean;
  server_ready: boolean;
  model_ready: boolean;
  error: string | null;
}

export interface DesktopRuntimeStatus {
  api_base: string;
  preferred_model: string;
  project_root: string | null;
  window_visible: boolean;
  hide_to_tray: boolean;
  setup: SetupStatus;
}

export interface RuntimeReadinessCheck {
  id: string;
  label: string;
  status: 'ready' | 'warning' | 'blocked';
  detail: string;
  recommendation: string;
}

export interface RuntimeReadiness {
  summary: {
    ready: number;
    blocked: number;
    total: number;
  };
  checks: RuntimeReadinessCheck[];
  desktop: {
    report_path: string;
    scripts: {
      check: string;
      policy: string;
      collect: string;
    };
    guide_path: string;
  };
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  last_login_at: string | null;
}

export interface AuthStatus {
  bootstrap_required: boolean;
  authenticated: boolean;
  user: AuthUser | null;
}

export interface ShopifySummary {
  store: string;
  orders: number;
  open_orders: number;
  canceled_orders: number;
  refunded_orders: number;
  customers: number;
  products: number;
  active_products: number;
  estimated_revenue: number;
  repeat_customers: number;
  low_stock_products: Array<{
    title: string;
    inventory: number;
  }>;
  top_customers: Array<{
    name: string;
    total_spent: string;
    orders_count: number;
  }>;
  top_products: Array<{
    title: string;
    status: string;
    variant_count: number;
  }>;
}

export async function getSetupStatus(): Promise<SetupStatus | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<SetupStatus>('get_setup_status');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function fetchModels(): Promise<ModelInfo[]> {
  if (isTauri()) {
    try {
      const result = await tauriInvoke<{ data?: ModelInfo[] }>('fetch_models');
      return result?.data || [];
    } catch {
      // Fall through to fetch
    }
  }
  const res = await fetch(`${getBase()}/v1/models`);
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

export async function fetchRecommendedModel(): Promise<{ model: string; reason: string }> {
  const res = await fetch(`${getBase()}/v1/recommended-model`);
  if (!res.ok) return { model: '', reason: 'Failed to fetch' };
  return res.json();
}

export async function pullModel(modelName: string): Promise<void> {
  // In Tauri, go through the Rust backend directly (avoids CORS / timeout
  // issues with long model downloads via fetch).
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('pull_ollama_model', { modelName });
      return;
    } catch (e: any) {
      throw new Error(e?.message || e || 'Download failed');
    }
  }
  const res = await fetch(`${getBase()}/v1/models/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelName }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to pull model: ${detail}`);
  }
}

export async function deleteModel(modelName: string): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('delete_ollama_model', { modelName });
      return;
    } catch (e: any) {
      throw new Error(e?.message || e || 'Delete failed');
    }
  }
  const res = await fetch(`${getBase()}/v1/models/${encodeURIComponent(modelName)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to delete model: ${detail}`);
  }
}

const _CLOUD_PREFIXES = ['gpt-', 'o1-', 'o3-', 'o4-', 'claude-', 'gemini-', 'openrouter/'];

export async function preloadModel(modelName: string): Promise<void> {
  // Cloud models don't need Ollama preloading
  if (_CLOUD_PREFIXES.some(p => modelName.startsWith(p))) {
    return;
  }
  try {
    const res = await authFetch('/v1/models/preload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName, keep_alive: '3m' }),
    }, 25_000);
    if (res.ok) return;
  } catch {
    // Fall back to direct Ollama for older servers or dev-mode restarts.
  }
  // Trigger Ollama to load the model into memory (empty prompt, no generation).
  const ollamaUrl = 'http://127.0.0.1:11434';
  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName, prompt: '', keep_alive: '3m' }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new Error(`Preload failed: ${res.status}`);
  } catch (e: any) {
    if (e.name === 'TimeoutError') throw new Error('Model load timed out (25s)');
    throw e;
  }
}

export async function fetchSavings(): Promise<SavingsData> {
  const res = await fetch(`${getBase()}/v1/savings`);
  if (!res.ok) throw new Error(`Failed to fetch savings: ${res.status}`);
  return res.json();
}

export async function fetchServerInfo(): Promise<ServerInfo> {
  const res = await fetch(`${getBase()}/v1/info`);
  if (!res.ok) throw new Error(`Failed to fetch server info: ${res.status}`);
  return res.json();
}

export async function checkHealth(): Promise<boolean> {
  if (isTauri()) {
    try {
      await tauriInvoke('check_health', { apiUrl: getBase() });
      return true;
    } catch {
      return false;
    }
  }
  try {
    const res = await fetch(`${getBase()}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await authFetch('/v1/auth/status');
  if (!res.ok) throw new Error(`Failed to fetch auth status: ${res.status}`);
  return res.json();
}

export async function bootstrapAuth(payload: {
  username: string;
  password: string;
  display_name?: string;
  email?: string;
}): Promise<{ user: AuthUser }> {
  const res = await authFetch('/v1/auth/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Bootstrap failed: ${res.status}`);
  }
  return res.json();
}

export async function loginAuth(payload: {
  username: string;
  password: string;
}): Promise<{ user: AuthUser }> {
  const res = await authFetch('/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Login failed: ${res.status}`);
  }
  return res.json();
}

export async function logoutAuth(): Promise<void> {
  const res = await authFetch('/v1/auth/logout', { method: 'POST' });
  if (!res.ok) throw new Error(`Logout failed: ${res.status}`);
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const res = await authFetch('/v1/auth/me');
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Failed to fetch current user: ${res.status}`);
  }
  const data = await res.json();
  return data.user;
}

export async function fetchUsers(): Promise<AuthUser[]> {
  const res = await authFetch('/v1/auth/users');
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Failed to fetch users: ${res.status}`);
  }
  const data = await res.json();
  return data.users || [];
}

export async function createUserAdmin(payload: {
  username: string;
  password: string;
  display_name?: string;
  email?: string;
  role?: string;
}): Promise<AuthUser> {
  const res = await authFetch('/v1/auth/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Failed to create user: ${res.status}`);
  }
  const data = await res.json();
  return data.user;
}

export async function updateUserAdmin(
  userId: string,
  payload: Partial<{
    display_name: string;
    email: string;
    role: string;
    status: string;
  }>,
): Promise<AuthUser> {
  const res = await authFetch(`/v1/auth/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Failed to update user: ${res.status}`);
  }
  const data = await res.json();
  return data.user;
}

export async function resetUserPasswordAdmin(userId: string, password: string): Promise<AuthUser> {
  const res = await authFetch(`/v1/auth/users/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Failed to reset password: ${res.status}`);
  }
  const data = await res.json();
  return data.user;
}

export async function forgotPasswordAuth(email: string): Promise<{ ok: boolean; detail: string }> {
  const res = await authFetch('/v1/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Forgot password failed: ${res.status}`);
  }
  return res.json();
}

export async function resetPasswordAuth(payload: {
  token: string;
  password: string;
}): Promise<{ user: AuthUser }> {
  const res = await authFetch('/v1/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || `Reset password failed: ${res.status}`);
  }
  return res.json();
}

export async function getDesktopRuntimeStatus(): Promise<DesktopRuntimeStatus | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<DesktopRuntimeStatus>('get_desktop_runtime_status');
  } catch {
    return null;
  }
}

export async function startDesktopRuntime(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('start_backend');
}

export async function stopDesktopRuntime(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('stop_backend');
}

export async function restartDesktopRuntime(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('restart_backend');
}

export async function showDesktopWindow(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('show_main_window');
}

export async function hideDesktopWindow(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('hide_main_window');
}

export async function prepareDesktopShutdown(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('prepare_shutdown');
}

export async function quitDesktopApp(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('quit_desktop');
}

export async function fetchRuntimeReadiness(): Promise<RuntimeReadiness> {
  const res = await fetch(`${getBase()}/v1/readiness`);
  if (!res.ok) throw new Error(`Runtime readiness failed: ${res.status}`);
  return res.json();
}

export async function analyzeDocumentFiles(params: {
  files: File[];
  mode: 'summary' | 'business_review' | 'finance_review' | 'investment_memo' | 'kpi_extract';
  title?: string;
}): Promise<DocumentAnalysisResult> {
  const formData = new FormData();
  for (const file of params.files) {
    formData.append('files', file);
  }
  formData.append('mode', params.mode);
  if (params.title) formData.append('title', params.title);
  const res = await fetch(`${getBase()}/v1/connectors/upload/analyze/files`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Document analysis failed: ${res.status}`);
  }
  return res.json();
}

export async function exportDocumentAnalysis(params: {
  title: string;
  mode: 'summary' | 'business_review' | 'finance_review' | 'investment_memo' | 'kpi_extract' | string;
  content: string;
  format: 'docx' | 'xlsx' | 'txt';
}): Promise<Blob> {
  const res = await fetch(`${getBase()}/v1/connectors/upload/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Document export failed: ${res.status}`);
  }
  return res.blob();
}

export async function fetchEnergy(): Promise<unknown> {
  if (isTauri()) {
    try {
      return await tauriInvoke('fetch_energy', { apiUrl: getBase() });
    } catch {}
  }
  const res = await fetch(`${getBase()}/v1/telemetry/energy`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function fetchTelemetry(): Promise<unknown> {
  if (isTauri()) {
    try {
      return await tauriInvoke('fetch_telemetry', { apiUrl: getBase() });
    } catch {}
  }
  const res = await fetch(`${getBase()}/v1/telemetry/stats`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function fetchTraces(limit: number = 50): Promise<unknown> {
  if (isTauri()) {
    try {
      return await tauriInvoke('fetch_traces', { apiUrl: getBase(), limit });
    } catch {}
  }
  const res = await fetch(`${getBase()}/v1/traces?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Speech
// ---------------------------------------------------------------------------

export * from './api/speech';

export interface DocumentAnalysisResult {
  mode: string;
  content: string;
  files: string[];
  model: string;
}

export * from './api/workspaceCoding';

export * from './api/actionCenter';

export * from './api/workspace';

export * from './api/visionDesktop';

export interface ReminderItem {
  kind: 'event' | 'task';
  title: string;
  when: string;
  detail: string;
  source: string;
}

export async function fetchReminders(limit: number = 8): Promise<ReminderItem[]> {
  const res = await authFetch(`/v1/action-center/reminders?limit=${limit}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Reminder fetch failed: ${res.status}`);
  }
  const data = await res.json();
  return data.items || [];
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Agent Manager
// ---------------------------------------------------------------------------

export * from './api/operatorMemory';

export * from './api/agents';
