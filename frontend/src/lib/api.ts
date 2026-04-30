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

export interface WorkspaceSummary {
  root: string;
  branch: string;
  dirty: boolean;
  changed_count: number;
  changed_files: string[];
  staged_count?: number;
  unstaged_count?: number;
  untracked_count?: number;
  ahead_count?: number;
  behind_count?: number;
  has_upstream?: boolean;
  commit_ready?: boolean;
  push_ready?: boolean;
  top_level: string[];
  remote_url?: string;
  active_root?: string;
  languages?: string[];
  language_counts?: Record<string, number>;
  package_managers?: string[];
  manifests?: string[];
  commands?: Record<string, string[]>;
  conventions?: string[];
}

export interface WorkspaceRepoEntry {
  root: string;
  name: string;
  branch: string;
  remote_url: string;
  last_selected_at: number;
}

export interface WorkspaceRepoCatalog {
  active_root: string;
  repos: WorkspaceRepoEntry[];
}

export interface WorkspaceCommandSuggestion {
  label: string;
  command: string;
  kind: string;
}

export interface WorkspaceChecks {
  root: string;
  checks: WorkspaceCommandSuggestion[];
  git_actions: WorkspaceCommandSuggestion[];
  repo_profile?: {
    languages: string[];
    package_managers: string[];
    conventions: string[];
  };
}

export interface JarvisIntent {
  type: string;
  action: string;
  target: string;
  query: string;
  content: string;
  command: string;
  requires_approval: boolean;
  risk: 'low' | 'medium' | 'high';
  client_action?: string;
}

export interface JarvisIntentExecution {
  intent: JarvisIntent;
  status: 'completed' | 'staged' | 'unsupported' | 'client_action_required';
  message: string;
  result: {
    content?: string;
    metadata?: Record<string, unknown>;
    items?: Array<{
      content: string;
      score: number;
      metadata: Record<string, unknown>;
    }>;
    sources?: Array<{
      title: string;
      url: string;
      snippet: string;
    }>;
    pending?: PendingWorkbenchCommand | null;
    history?: WorkbenchEntry[];
    default_working_dir?: string;
    client_action?: string;
  };
}

export interface VisionAnalysisResult {
  content: string;
  model: string;
  label: string;
  screen_count?: number;
}

export interface VisionTextExtractionResult {
  content: string;
  model: string;
  label: string;
  screen_count?: number;
}

export interface VisionSuggestedActionsResult {
  actions: Array<{
    title: string;
    detail: string;
    prompt: string;
    priority: number;
    desktop_intent: string;
  }>;
  model: string;
  label: string;
  screen_count?: number;
}

export interface VisionSignalsResult {
  summary: string;
  blockers: string[];
  deadlines: string[];
  attention_items: string[];
  model: string;
  label: string;
  screen_count?: number;
}

export interface VisionUiTargetsResult {
  targets: Array<{
    label: string;
    detail: string;
    control_type: 'button' | 'field' | 'menu' | 'panel' | 'tab' | 'link' | 'alert' | 'editor' | 'window' | 'other';
    confidence: number;
    prompt: string;
    desktop_intent: string;
  }>;
  model: string;
  label: string;
  screen_count?: number;
}

export interface VisionUiActionPlanResult {
  summary: string;
  steps: string[];
  prompt: string;
  desktop_intent: string;
  model: string;
  label: string;
  target_label: string;
  screen_count?: number;
}

export interface VisionUiVerifyResult {
  summary: string;
  confidence: number;
  verification_checks: string[];
  evidence: string[];
  risk_level: 'low' | 'medium' | 'high';
  model: string;
  label: string;
  target_label: string;
  screen_count?: number;
}

export interface VisionQueryResult {
  answer: string;
  question: string;
  model: string;
  label: string;
  screen_count?: number;
  history_used?: number;
}

export interface DesktopState {
  active_window_title: string;
  active_process_name: string;
  open_windows: Array<{
    title: string;
    process: string;
  }>;
  active_desktop_target: string;
  active_browser_target: string;
  available?: boolean;
  degraded?: boolean;
  reason?: string;
}

export interface AgentArchitectureRole {
  role: string;
  title: string;
  kind: 'system' | 'managed';
  source: string;
  ready: boolean;
  status: string;
  detail: string;
  agent_id?: string | null;
  agent_name?: string | null;
  agent_type?: string | null;
  active?: boolean;
}

export interface AgentAwarenessSummary {
  id: string;
  label: string;
  value: string;
}

export interface AgentAwarenessIssue {
  id: string;
  label: string;
  detail: string;
  status: string;
}

export interface AgentArchitectureAwareness {
  agents: {
    total: number;
    statuses: Record<string, number>;
    active: Array<{
      id?: string;
      name?: string;
      activity?: string;
      last_activity_at?: number | null;
    }>;
    recent_failures: AgentAwarenessIssue[];
    retrying: Array<{
      id?: string;
      name?: string;
      stall_retries: number;
      activity?: string;
    }>;
  };
  voice: {
    available: boolean;
    phase: string;
    active?: boolean;
  };
  memory: {
    available: boolean;
    mode: string;
    backend?: string | null;
  };
  connectors: {
    multi_account_ready: boolean;
    runtime_mode: string;
  };
  workspace: {
    available: boolean;
    active_root: string;
    repo_count: number;
  };
  mode: {
    level: 'healthy' | 'degraded' | 'minimal';
    detail: string;
    reasons: string[];
    capabilities: string[];
  };
}

export interface AgentArchitectureStatus {
  roles: AgentArchitectureRole[];
  summary: {
    ready_roles: number;
    total_roles: number;
    managed_ready: number;
    managed_total: number;
  };
  created?: Array<{
    role: string;
    agent_id?: string;
    name?: string;
  }>;
  existing?: Array<{
    role: string;
    agent_id?: string;
    name?: string;
  }>;
  handoff?: {
    source: string;
    brief: string;
    metadata?: {
      objective?: string;
      workflow_mode?: string;
      repo_name?: string;
      repo_root?: string;
      branch?: string;
      preferred_checks?: string[];
      deliverables?: string[];
      exit_criteria?: string[];
      report_template?: string;
    };
    planner?: {
      agent_id?: string;
      task_id?: string;
      name?: string;
    };
    executor?: {
      agent_id?: string;
      task_id?: string;
      name?: string;
    };
  };
  mission?: {
    id: string;
    title: string;
    domain: string;
    status: string;
    phase: string;
    summary: string;
    next_step: string;
    result: string;
    retry_hint: string;
    result_data?: Record<string, unknown>;
    next_action?: Record<string, unknown>;
    updated_at?: string;
  };
  awareness?: AgentArchitectureAwareness;
}

export interface AgentArchitectureHandoffMetadata {
  objective?: string;
  workflow_mode?: string;
  repo_name?: string;
  repo_root?: string;
  branch?: string;
  preferred_checks?: string[];
  deliverables?: string[];
  exit_criteria?: string[];
  report_template?: string;
}

export interface ReminderItem {
  kind: 'event' | 'task';
  title: string;
  when: string;
  detail: string;
  source: string;
}

export async function fetchWorkspaceSummary(): Promise<WorkspaceSummary> {
  const res = await authFetch('/v1/workspace/summary', {}, 7000);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Workspace summary fetch failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchWorkspaceRepos(): Promise<WorkspaceRepoCatalog> {
  const res = await authFetch('/v1/workspace/repos', {}, 7000);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Workspace repos fetch failed: ${res.status}`);
  }
  return res.json();
}

export async function registerWorkspaceRepo(path: string): Promise<WorkspaceRepoCatalog> {
  const res = await authFetch('/v1/workspace/repos/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Workspace repo register failed: ${res.status}`);
  }
  return res.json();
}

export async function selectWorkspaceRepo(root: string): Promise<WorkspaceRepoCatalog> {
  const res = await authFetch('/v1/workspace/repos/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ root }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Workspace repo select failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchWorkspaceChecks(): Promise<WorkspaceChecks> {
  const res = await authFetch('/v1/workspace/checks', {}, 7000);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Workspace checks fetch failed: ${res.status}`);
  }
  return res.json();
}

export async function prepareWorkspaceStage(): Promise<{
  root: string;
  command: string;
  ready: boolean;
  changed_count: number;
  staged_count: number;
  unstaged_count: number;
  message: string;
}> {
  const res = await authFetch('/v1/workspace/git/prepare-stage', {
    method: 'POST',
  }, 7000);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Prepare stage failed: ${res.status}`);
  }
  return res.json();
}

export async function prepareWorkspaceCommit(message: string): Promise<{
  root: string;
  command: string;
  message: string;
  ready: boolean;
  changed_count: number;
  staged_count: number;
  unstaged_count: number;
  branch: string;
}> {
  const res = await authFetch('/v1/workspace/git/prepare-commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  }, 7000);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Prepare commit failed: ${res.status}`);
  }
  return res.json();
}

export async function prepareWorkspacePush(): Promise<{
  root: string;
  command: string;
  ready: boolean;
  blocked_reason?: string | null;
  branch: string;
  ahead_count: number;
  behind_count: number;
  has_upstream: boolean;
}> {
  const res = await authFetch('/v1/workspace/git/prepare-push', {}, 7000);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Prepare push failed: ${res.status}`);
  }
  return res.json();
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

export async function parseJarvisIntent(text: string): Promise<JarvisIntent> {
  const res = await authFetch('/v1/jarvis/intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Intent parsing failed: ${res.status}`);
  }
  const data = await res.json();
  return data.intent;
}

export async function executeJarvisIntent(text: string): Promise<JarvisIntentExecution> {
  const res = await authFetch('/v1/jarvis/intent/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Intent execution failed: ${res.status}`);
  }
  return res.json();
}

export async function analyzeVision(body: {
  image_data_url: string;
  note?: string;
  label?: string;
}): Promise<VisionAnalysisResult> {
  const res = await authFetch('/v1/vision/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Vision analysis failed: ${res.status}`);
  }
  return res.json();
}

export async function analyzeVisionMulti(body: {
  images: Array<{
    image_data_url: string;
    label: string;
  }>;
  note?: string;
  label?: string;
}): Promise<VisionAnalysisResult> {
  const res = await authFetch('/v1/vision/analyze-multi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Multi-screen vision analysis failed: ${res.status}`);
  }
  return res.json();
}

export async function extractVisionText(body: {
  image_data_url: string;
  note?: string;
  label?: string;
}): Promise<VisionTextExtractionResult> {
  const res = await authFetch('/v1/vision/extract-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Vision text extraction failed: ${res.status}`);
  }
  return res.json();
}

export async function extractVisionTextMulti(body: {
  images: Array<{
    image_data_url: string;
    label: string;
  }>;
  note?: string;
  label?: string;
}): Promise<VisionTextExtractionResult> {
  const res = await authFetch('/v1/vision/extract-text-multi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Multi-screen vision text extraction failed: ${res.status}`);
  }
  return res.json();
}

export async function suggestVisionActions(body: {
  images: Array<{
    image_data_url: string;
    label: string;
  }>;
  note?: string;
  label?: string;
}): Promise<VisionSuggestedActionsResult> {
  const res = await authFetch('/v1/vision/suggest-actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Vision action suggestions failed: ${res.status}`);
  }
  return res.json();
}

export async function extractVisionSignals(body: {
  images: Array<{
    image_data_url: string;
    label: string;
  }>;
  note?: string;
  label?: string;
}): Promise<VisionSignalsResult> {
  const res = await authFetch('/v1/vision/extract-signals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Vision signal extraction failed: ${res.status}`);
  }
  return res.json();
}

export async function extractVisionUiTargets(body: {
  images: Array<{
    image_data_url: string;
    label: string;
  }>;
  note?: string;
  label?: string;
}): Promise<VisionUiTargetsResult> {
  const res = await authFetch('/v1/vision/ui-targets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Vision UI target extraction failed: ${res.status}`);
  }
  return res.json();
}

export async function planVisionUiAction(body: {
  images: Array<{
    image_data_url: string;
    label: string;
  }>;
  target_label: string;
  target_detail?: string;
  control_type?: string;
  note?: string;
  label?: string;
}): Promise<VisionUiActionPlanResult> {
  const res = await authFetch('/v1/vision/ui-action-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Vision UI action planning failed: ${res.status}`);
  }
  return res.json();
}

export async function verifyVisionUiTarget(body: {
  images: Array<{
    image_data_url: string;
    label: string;
  }>;
  target_label: string;
  target_detail?: string;
  control_type?: string;
  desktop_intent?: string;
  note?: string;
  label?: string;
}): Promise<VisionUiVerifyResult> {
  const res = await authFetch('/v1/vision/ui-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Vision UI verification failed: ${res.status}`);
  }
  return res.json();
}

export async function queryVision(body: {
  images: Array<{
    image_data_url: string;
    label: string;
  }>;
  question: string;
  note?: string;
  label?: string;
  history?: Array<{
    question: string;
    answer: string;
  }>;
}): Promise<VisionQueryResult> {
  const res = await authFetch('/v1/vision/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Visual question answering failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchDesktopState(): Promise<DesktopState> {
  const res = await authFetch('/v1/jarvis/desktop/state', {}, 7000);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Desktop state failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchAgentArchitectureStatus(): Promise<AgentArchitectureStatus> {
  const res = await authFetch('/v1/agent-architecture/status', {}, 7000);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Agent architecture failed: ${res.status}`);
  }
  return res.json();
}

export async function ensureCoreAgentArchitecture(): Promise<AgentArchitectureStatus> {
  const res = await authFetch('/v1/agent-architecture/ensure-core', { method: 'POST' });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Ensure core agent architecture failed: ${res.status}`);
  }
  return res.json();
}

export async function handoffAgentArchitecture(
  brief: string,
  source = 'hud',
  metadata?: AgentArchitectureHandoffMetadata,
): Promise<AgentArchitectureStatus> {
  const res = await authFetch('/v1/agent-architecture/handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief, source, metadata }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Agent handoff failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Agent Manager
// ---------------------------------------------------------------------------

export * from './api/operatorMemory';

export * from './api/agents';
