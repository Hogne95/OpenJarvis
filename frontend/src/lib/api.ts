import type { ModelInfo, SavingsData, ServerInfo } from '../types';

// ---------------------------------------------------------------------------
// Supabase config — safe to embed (RLS protects writes)
// ---------------------------------------------------------------------------

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://mtbtgpwzrbostweaanpr.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10YnRncHd6cmJvc3R3ZWFhbnByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODk0OTQsImV4cCI6MjA4ODc2NTQ5NH0._xMlqCfljtXpwPj54H-ghxfLFO-jiq4W2WhpU8vVL1c';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export const isTauri = () => typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

// Cached API base URL fetched from the Tauri backend at startup.
// This avoids hardcoding the port — the Rust backend is the single
// source of truth for JARVIS_PORT.
let _tauriApiBase: string | null = null;

/** Pre-fetch the API base URL from the Tauri backend (call once at init). */
export async function initApiBase(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    _tauriApiBase = await invoke<string>('get_api_base');
  } catch {
    // Command may not exist on older builds; fall through to default.
  }
}

const DESKTOP_API_FALLBACK = 'http://127.0.0.1:8000';

const getSettingsApiUrl = (): string => {
  try {
    const raw = localStorage.getItem('openjarvis-settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.apiUrl) return parsed.apiUrl.replace(/\/+$/, '');
    }
  } catch {}
  return '';
};

export const getBase = (): string => {
  const settingsUrl = getSettingsApiUrl();
  if (settingsUrl) return settingsUrl;
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (isTauri()) return _tauriApiBase || DESKTOP_API_FALLBACK;
  return '';
};

export async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function authFetch(path: string, init: RequestInit = {}, timeoutMs = 0): Promise<Response> {
  const requestInit: RequestInit = {
    ...init,
    credentials: 'include',
  };
  if (timeoutMs > 0) {
    return fetchWithTimeout(`${getBase()}${path}`, requestInit, timeoutMs);
  }
  return fetch(`${getBase()}${path}`, requestInit);
}

async function tauriInvoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  const apiUrl = getBase();
  return invoke<T>(command, { apiUrl, ...args });
}

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
  // Trigger Ollama to load the model into memory (empty prompt, no generation).
  const ollamaUrl = 'http://127.0.0.1:11434';
  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName, prompt: '', keep_alive: '5m' }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Preload failed: ${res.status}`);
  } catch (e: any) {
    if (e.name === 'TimeoutError') throw new Error('Model load timed out (120s)');
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

export interface TranscriptionResult {
  text: string;
  language: string | null;
  confidence: number | null;
  duration_seconds: number;
}

export interface SpeechHealth {
  available: boolean;
  backend?: string;
  reason?: string;
}

export interface VoiceLoopStatus {
  active: boolean;
  always_listening?: boolean;
  phase: 'idle' | 'listening' | 'recording' | 'transcribing' | 'speaking' | 'error';
  session_id: string | null;
  started_at: number | null;
  updated_at: number | null;
  backend_available: boolean;
  backend_name: string | null;
  language_hints: string[];
  wake_phrases?: string[];
  wake_required?: boolean;
  wake_detected?: boolean;
    last_wake_phrase?: string;
    live_vad_enabled?: boolean;
    vad_backend?: string;
    wake_requested_backend?: string;
    wake_backend?: string;
    wake_available?: boolean;
    wake_reason?: string;
    last_vad_rms?: number;
  last_wake_score?: number | null;
  last_transcript: string;
  recent_transcripts?: string[];
  last_command?: string;
  command_count?: number;
  interrupted?: boolean;
  last_transcribe_ms?: number;
  last_process_ms?: number;
  last_audio_duration_seconds?: number;
  interruption_count?: number;
  last_interruption_at?: number | null;
  tts_active?: boolean;
  tts_started_at?: number | null;
  last_error: string;
}

export interface SpeechProfile {
  input_languages: string[];
  reply_language: string;
  wake_phrases: string[];
  live_vad_enabled: boolean;
  vad_backend: string;
  audio_chunk_ms: number;
  wake_backend: string;
  reply_backend: string;
  reply_voice_id: string;
  reply_speed?: number;
  auto_speak: boolean;
  auto_submit_voice_commands: boolean;
  require_wake_phrase: boolean;
}

export interface DocumentAnalysisResult {
  mode: string;
  content: string;
  files: string[];
  model: string;
}

export interface WorkbenchEntry {
  id: string;
  command: string;
  working_dir: string;
  timeout: number;
  created_at: number;
  completed_at: number;
  status: string;
  output: string;
  returncode: number | null;
}

export interface PendingWorkbenchCommand {
  id: string;
  command: string;
  working_dir: string;
  timeout: number;
  created_at: number;
  status: string;
}

export interface WorkbenchStatus {
  pending: PendingWorkbenchCommand | null;
  history: WorkbenchEntry[];
  default_working_dir: string;
  result?: WorkbenchEntry;
}

export interface PendingCodeEdit {
  id: string;
  repo_root: string;
  file_path: string;
  original_content: string;
  updated_content: string;
  diff: string;
  created_at: number;
  status: string;
  line_count: number;
}

export interface CodeEditEntry {
  id: string;
  repo_root: string;
  file_path: string;
  diff: string;
  created_at: number;
  completed_at: number;
  status: string;
  result: string;
}

export interface CodingWorkspaceStatus {
  pending: PendingCodeEdit | null;
  history: CodeEditEntry[];
  result?: CodeEditEntry;
}

export interface CodingFileContents {
  repo_root: string;
  file_path: string;
  content: string;
}

export interface ActionCenterEntry {
  id: string;
  action_type: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  created_at: number;
  completed_at: number;
  status: string;
  result: string;
  metadata?: Record<string, unknown>;
}

export interface PendingActionCenterEntry {
  id: string;
  action_type: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  created_at: number;
  status: string;
}

export interface ActionCenterStatus {
  pending: PendingActionCenterEntry | null;
  history: ActionCenterEntry[];
  result?: ActionCenterEntry;
  capabilities?: ActionCenterCapabilities;
}

export interface ActionCenterProviderCapability {
  id: string;
  label: string;
  connected: boolean;
  direct_send?: boolean;
  direct_create?: boolean;
  execution_mode?: string;
  supports_archive?: boolean;
  supports_star?: boolean;
}

export interface ActionCenterCapabilityGroup {
  ready: boolean;
  preferred_provider: string;
  providers: ActionCenterProviderCapability[];
}

export interface ActionCenterCapabilities {
  email: ActionCenterCapabilityGroup;
  calendar: ActionCenterCapabilityGroup;
  tasks: ActionCenterCapabilityGroup;
  inbox: ActionCenterCapabilityGroup;
}

export interface InboxSummaryItem {
  doc_id: string;
  thread_id: string;
  title: string;
  author: string;
  author_email: string;
  timestamp: string;
  snippet: string;
  source: string;
  account_key: string;
  supports_mutation: boolean;
}

export interface TaskSummaryItem {
  title: string;
  timestamp: string;
  notes: string;
  status: string;
  due: string;
  source: string;
}

export interface DailyDigest {
  text: string;
  sections: Record<string, unknown>;
  sources_used: string[];
  generated_at: string;
  model_used: string;
  voice_used: string;
  audio_available: boolean;
}

export interface DigestSchedule {
  enabled: boolean;
  cron: string;
}

export interface AutomationRoutineStatus {
  routine_id: 'daily_ops' | 'inbox_sweep' | 'meeting_prep';
  status: string;
  next_run: string | null;
  last_run: string | null;
  cron: string;
  agent: string;
}

export interface AutomationStatus {
  available: boolean;
  items: AutomationRoutineStatus[];
}

export interface AutomationLogEntry {
  routine_id: 'daily_ops' | 'inbox_sweep' | 'meeting_prep';
  task_id: string;
  started_at: string;
  finished_at: string | null;
  success: boolean;
  result: string;
  error: string;
}

export interface WorkspaceSummary {
  root: string;
  branch: string;
  dirty: boolean;
  changed_count: number;
  changed_files: string[];
  top_level: string[];
  remote_url?: string;
  active_root?: string;
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
}

export interface DurableOperatorProfile {
  honorific: string;
  reply_tone: string;
  priority_contacts: string[];
  workday_start: string;
  workday_end: string;
  active_desktop_target?: string;
  active_browser_target?: string;
}

export interface DurableOperatorSignals {
  reply_drafts: number;
  meetings_created: number;
  tasks_created: number;
  urgent_reviews: number;
  top_contacts: string[];
}

export interface DurableOperatorMemory {
  profile: DurableOperatorProfile;
  signals: DurableOperatorSignals;
  missions?: Array<{
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
    next_action?: {
      kind: string;
      content?: string;
      label?: string;
      [key: string]: unknown;
    };
    updated_at: string;
  }>;
  explicit_memories?: Array<{
    id: string;
    content: string;
    created_at: string;
    tags: string[];
  }>;
  visual_observations?: Array<{
    id: string;
    label: string;
    source: string;
    note: string;
    created_at: string;
    image_path: string;
  }>;
  visual_insights?: Array<{
    id: string;
    label: string;
    question: string;
    answer: string;
    created_at: string;
  }>;
  visual_briefs?: Array<{
    id: string;
    label: string;
    summary: string;
    details: string;
    created_at: string;
  }>;
  document_briefs?: Array<{
    id: string;
    label: string;
    mode: string;
    summary: string;
    details: string;
    created_at: string;
  }>;
  design_briefs?: Array<{
    id: string;
    label: string;
    archetype: string;
    summary: string;
    details: string;
    scorecard?: Array<{
      label: string;
      score: number;
      note: string;
    }>;
    created_at: string;
  }>;
  fivem_briefs?: Array<{
    id: string;
    label: string;
    resource_key: string;
    framework: string;
    topology: string;
    summary: string;
    details: string;
    native_families?: string[];
    risk_tags?: string[];
    created_at: string;
  }>;
  learning_experiences?: Array<{
    id: string;
    label: string;
    domain: string;
    context_key: string;
    outcome_type: string;
    summary: string;
    lesson: string;
    reuse_hint: string;
    tags: string[];
    confidence?: number;
    use_count?: number;
    last_reused_at?: string;
    created_at: string;
  }>;
  relationships: Record<
    string,
    {
      contact: string;
      name: string;
      importance: string;
      relationship: string;
      notes: string;
    }
  >;
  meetings: Record<
    string,
    {
      key: string;
      title: string;
      importance: string;
      prep_style: string;
      notes: string;
    }
  >;
  projects: Record<
    string,
    {
      key: string;
      title: string;
      focus: string;
      status: string;
      next_step: string;
      notes: string;
    }
  >;
  sales_accounts?: Record<
    string,
    {
      key: string;
      name: string;
      owner: string;
      segment: string;
      status: string;
      next_step: string;
      risk_level: string;
      last_interaction: string;
      notes: string;
    }
  >;
  sales_leads?: Record<
    string,
    {
      key: string;
      name: string;
      company: string;
      owner: string;
      stage: string;
      source: string;
      next_step: string;
      risk_level: string;
      last_interaction: string;
      notes: string;
    }
  >;
  sales_deals?: Record<
    string,
    {
      key: string;
      title: string;
      account_key: string;
      owner: string;
      stage: string;
      value: string;
      close_target: string;
      next_step: string;
      risk_level: string;
      last_interaction: string;
      notes: string;
    }
  >;
  customer_accounts?: Record<
    string,
    {
      key: string;
      name: string;
      owner: string;
      segment: string;
      health: string;
      sentiment: string;
      churn_risk: string;
      next_step: string;
      last_interaction: string;
      notes: string;
    }
  >;
  customer_interactions?: Record<
    string,
    {
      key: string;
      account_key: string;
      contact: string;
      channel: string;
      topic: string;
      sentiment: string;
      urgency: string;
      status: string;
      promised_follow_up: string;
      last_interaction: string;
      notes: string;
    }
  >;
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
  awareness?: AgentArchitectureAwareness;
}

export interface ReminderItem {
  kind: 'event' | 'task';
  title: string;
  when: string;
  detail: string;
  source: string;
}

interface TranscribeAudioOptions {
  filename?: string;
  languageHints?: string[];
}

async function transcribeAudioOnce(
  audioBlob: Blob,
  filename: string,
  language?: string,
): Promise<TranscriptionResult> {
  if (isTauri()) {
    try {
      const buffer = await audioBlob.arrayBuffer();
      return await tauriInvoke<TranscriptionResult>('transcribe_audio', {
        audioData: Array.from(new Uint8Array(buffer)),
        filename,
        language,
      });
    } catch {
      // Fall through to fetch
    }
  }
  const formData = new FormData();
  formData.append('file', audioBlob, filename);
  if (language) formData.append('language', language);
  const res = await fetch(`${getBase()}/v1/speech/transcribe`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
  return res.json();
}

export async function transcribeAudio(
  audioBlob: Blob,
  options: TranscribeAudioOptions = {},
): Promise<TranscriptionResult> {
  const filename = options.filename || 'recording.webm';
  const hintOrder = [undefined, ...(options.languageHints || [])];
  const seen = new Set<string>();
  let lastError: unknown;

  for (const hint of hintOrder) {
    const key = hint || '__auto__';
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const result = await transcribeAudioOnce(audioBlob, filename, hint);
      if (result.text.trim()) return result;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return {
    text: '',
    language: null,
    confidence: null,
    duration_seconds: 0,
  };
}

export async function fetchSpeechHealth(): Promise<SpeechHealth> {
  if (isTauri()) {
    try {
      return await tauriInvoke<SpeechHealth>('speech_health');
    } catch {
      return { available: false };
    }
  }
  const res = await fetchWithTimeout(`${getBase()}/v1/speech/health`, {}, 5000);
  if (!res.ok) return { available: false };
  return res.json();
}

export async function fetchSpeechProfile(): Promise<SpeechProfile> {
  const res = await fetch(`${getBase()}/v1/speech/profile`);
  if (!res.ok) throw new Error(`Speech profile failed: ${res.status}`);
  return res.json();
}

export async function synthesizeSpeech(body: {
  text: string;
  voice_id?: string;
  backend?: string;
  speed?: number;
  output_format?: 'wav' | 'mp3';
}): Promise<Blob> {
  const res = await fetch(`${getBase()}/v1/speech/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Speech synthesis failed: ${res.status}`);
  }
  return res.blob();
}

export async function fetchVoiceLoopStatus(): Promise<VoiceLoopStatus> {
  const res = await fetchWithTimeout(`${getBase()}/v1/voice-loop/status`, {}, 5000);
  if (!res.ok) throw new Error(`Voice loop status failed: ${res.status}`);
  return res.json();
}

export async function startVoiceLoop(languageHints: string[] = ['no', 'en']): Promise<VoiceLoopStatus> {
  const res = await fetch(`${getBase()}/v1/voice-loop/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language_hints: languageHints }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Voice loop start failed: ${res.status}`);
  }
  return res.json();
}

export async function stopVoiceLoop(): Promise<VoiceLoopStatus> {
  const res = await fetch(`${getBase()}/v1/voice-loop/stop`, { method: 'POST' });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Voice loop stop failed: ${res.status}`);
  }
  return res.json();
}

export async function interruptVoiceLoop(reason?: string): Promise<VoiceLoopStatus> {
  const res = await fetch(`${getBase()}/v1/voice-loop/interrupt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Voice loop interrupt failed: ${res.status}`);
  }
  return res.json();
}

export async function updateVoiceLoopState(body: {
  phase: VoiceLoopStatus['phase'];
  transcript?: string;
  error?: string;
}): Promise<VoiceLoopStatus> {
  const res = await fetch(`${getBase()}/v1/voice-loop/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Voice loop state update failed: ${res.status}`);
  }
  return res.json();
}

export async function ingestVoiceTranscript(transcript: string): Promise<VoiceLoopStatus & {
  accepted: boolean;
  wake_matched: boolean;
  command: string;
  message: string;
}> {
  const res = await fetch(`${getBase()}/v1/voice-loop/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Voice transcript ingest failed: ${res.status}`);
  }
  return res.json();
}

export async function processVoiceLoopAudio(
  audioBlob: Blob,
  options: {
    filename?: string;
    languageHints?: string[];
  } = {},
): Promise<
  VoiceLoopStatus & {
    accepted: boolean;
    wake_matched: boolean;
    command: string;
    message: string;
    transcript: string;
    language: string | null;
    confidence: number | null;
    duration_seconds: number;
    interrupted: boolean;
  }
> {
  const formData = new FormData();
  formData.append('file', audioBlob, options.filename || 'voice-loop.webm');
  if (options.languageHints?.length) {
    formData.append('language_hints', options.languageHints.join(','));
  }
  const res = await fetch(`${getBase()}/v1/voice-loop/process-audio`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Voice audio processing failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchWorkbenchStatus(): Promise<WorkbenchStatus> {
  const res = await authFetch('/v1/workbench/status');
  if (!res.ok) throw new Error(`Workbench status failed: ${res.status}`);
  return res.json();
}

export async function stageWorkbenchCommand(body: {
  command: string;
  working_dir?: string;
  timeout?: number;
}): Promise<WorkbenchStatus> {
  const res = await authFetch('/v1/workbench/stage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Workbench staging failed: ${res.status}`);
  }
  return res.json();
}

export async function approveWorkbenchCommand(): Promise<WorkbenchStatus> {
  const res = await authFetch('/v1/workbench/approve', { method: 'POST' });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Workbench approval failed: ${res.status}`);
  }
  return res.json();
}

export async function holdWorkbenchCommand(): Promise<WorkbenchStatus> {
  const res = await authFetch('/v1/workbench/hold', { method: 'POST' });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Workbench hold failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchCodingStatus(): Promise<CodingWorkspaceStatus> {
  const res = await authFetch('/v1/coding/status', {}, 7000);
  if (!res.ok) throw new Error(`Coding status failed: ${res.status}`);
  return res.json();
}

export async function readCodingFile(repo_root: string, file_path: string): Promise<CodingFileContents> {
  const res = await authFetch('/v1/coding/read-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo_root, file_path }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Read file failed: ${res.status}`);
  }
  return res.json();
}

export async function stageCodeEdit(body: {
  repo_root: string;
  file_path: string;
  updated_content: string;
}): Promise<CodingWorkspaceStatus> {
  const res = await authFetch('/v1/coding/stage-edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Stage code edit failed: ${res.status}`);
  }
  return res.json();
}

export async function approveCodeEdit(): Promise<CodingWorkspaceStatus> {
  const res = await authFetch('/v1/coding/approve', { method: 'POST' });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Approve code edit failed: ${res.status}`);
  }
  return res.json();
}

export async function holdCodeEdit(): Promise<CodingWorkspaceStatus> {
  const res = await authFetch('/v1/coding/hold', { method: 'POST' });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Hold code edit failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchActionCenterStatus(): Promise<ActionCenterStatus> {
  const res = await authFetch('/v1/action-center/status', {}, 7000);
  if (!res.ok) throw new Error(`Action center status failed: ${res.status}`);
  return res.json();
}

export async function fetchActionCenterCapabilities(): Promise<ActionCenterCapabilities> {
  const res = await authFetch('/v1/action-center/capabilities');
  if (!res.ok) throw new Error(`Action center capabilities failed: ${res.status}`);
  return res.json();
}

export async function stageEmailDraft(body: {
  recipient: string;
  subject: string;
  body: string;
  provider?: string;
  account_key?: string;
}): Promise<ActionCenterStatus> {
  const res = await authFetch('/v1/action-center/stage-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Email draft staging failed: ${res.status}`);
  }
  return res.json();
}

export async function stageCalendarBrief(body: {
  title: string;
  start_at: string;
  end_at?: string;
  attendees?: string;
  location?: string;
  notes?: string;
  provider?: string;
  account_key?: string;
}): Promise<ActionCenterStatus> {
  const res = await authFetch('/v1/action-center/stage-calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Calendar staging failed: ${res.status}`);
  }
  return res.json();
}

export async function approveActionCenterItem(): Promise<ActionCenterStatus> {
  const res = await authFetch('/v1/action-center/approve', { method: 'POST' });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Action approval failed: ${res.status}`);
  }
  return res.json();
}

export async function holdActionCenterItem(): Promise<ActionCenterStatus> {
  const res = await authFetch('/v1/action-center/hold', { method: 'POST' });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Action hold failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchInboxSummary(limit: number = 5): Promise<InboxSummaryItem[]> {
  const res = await authFetch(`/v1/action-center/inbox-summary?limit=${limit}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Inbox summary failed: ${res.status}`);
  }
  const data = await res.json();
  return data.items || [];
}

export async function stageInboxAction(body: {
  action_kind: 'archive' | 'star';
  source: string;
  message_id: string;
  title: string;
  author: string;
  account_key?: string;
}): Promise<ActionCenterStatus> {
  const res = await authFetch('/v1/action-center/stage-inbox-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Inbox action staging failed: ${res.status}`);
  }
  return res.json();
}

export async function stageTask(body: {
  title: string;
  notes?: string;
  due_at?: string;
  provider?: string;
  account_key?: string;
}): Promise<ActionCenterStatus> {
  const res = await authFetch('/v1/action-center/stage-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Task staging failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchTaskSummary(limit: number = 6): Promise<TaskSummaryItem[]> {
  const res = await authFetch(`/v1/action-center/task-summary?limit=${limit}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Task summary failed: ${res.status}`);
  }
  const data = await res.json();
  return data.items || [];
}

export async function fetchDailyDigest(): Promise<DailyDigest> {
  const res = await authFetch('/api/digest');
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Digest fetch failed: ${res.status}`);
  }
  return res.json();
}

export async function generateDailyDigest(): Promise<{ status: string; text: string }> {
  const res = await authFetch('/api/digest/generate', { method: 'POST' });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Digest generation failed: ${res.status}`);
  }
  return res.json();
}

export function getDailyDigestAudioUrl(): string {
  return `${getBase()}/api/digest/audio`;
}

export async function fetchDigestSchedule(): Promise<DigestSchedule> {
  const res = await authFetch('/api/digest/schedule');
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Digest schedule fetch failed: ${res.status}`);
  }
  return res.json();
}

export async function updateDigestSchedule(body: DigestSchedule): Promise<DigestSchedule> {
  const res = await authFetch('/api/digest/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Digest schedule update failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchAutomationStatus(): Promise<AutomationStatus> {
  const res = await authFetch('/v1/automation/status', {}, 7000);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Automation status fetch failed: ${res.status}`);
  }
  return res.json();
}

export async function updateAutomationRoutine(body: {
  routine_id: 'daily_ops' | 'inbox_sweep' | 'meeting_prep';
  enabled: boolean;
  cron?: string;
  agent?: string;
}): Promise<AutomationStatus> {
  const res = await authFetch('/v1/automation/routine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Automation routine update failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchAutomationLogs(limit: number = 12): Promise<{
  available: boolean;
  items: AutomationLogEntry[];
}> {
  const res = await authFetch(`/v1/automation/logs?limit=${limit}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Automation logs fetch failed: ${res.status}`);
  }
  return res.json();
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

export async function prepareWorkspaceStage(): Promise<{ root: string; command: string }> {
  const res = await authFetch('/v1/workspace/git/prepare-stage', {
    method: 'POST',
  }, 7000);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Prepare stage failed: ${res.status}`);
  }
  return res.json();
}

export async function prepareWorkspaceCommit(message: string): Promise<{ root: string; command: string; message: string }> {
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

export async function prepareWorkspacePush(): Promise<{ root: string; command: string }> {
  const res = await authFetch('/v1/workspace/git/prepare-push', {}, 7000);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Prepare push failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchOperatorMemory(): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory');
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator memory fetch failed: ${res.status}`);
  }
  return res.json();
}

export interface OperatorMemoryContextItem {
  label: string;
  detail: string;
  reason?: string;
}

export interface OperatorMemoryContextResponse {
  query: string;
  identity: OperatorMemoryContextItem[];
  session_focus: OperatorMemoryContextItem[];
  long_term: OperatorMemoryContextItem[];
  flattened: OperatorMemoryContextItem[];
}

export async function fetchOperatorMemoryContext(body: {
  query: string;
  limit?: number;
}): Promise<OperatorMemoryContextResponse> {
  const res = await authFetch('/v1/operator-memory/context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator memory context failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchShopifySummary(): Promise<ShopifySummary> {
  const res = await authFetch('/v1/shopify/summary');
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Shopify summary failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorMemoryProfile(body: Partial<DurableOperatorProfile>): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator profile update failed: ${res.status}`);
  }
  return res.json();
}

export async function recordOperatorMemorySignal(body: {
  kind: 'reply' | 'meeting' | 'task' | 'urgent';
  contact?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/signal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator signal failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorRelationship(body: {
  contact: string;
  name?: string;
  importance?: string;
  relationship?: string;
  notes?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/relationship', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator relationship update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorMeeting(body: {
  key: string;
  title?: string;
  importance?: string;
  prep_style?: string;
  notes?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/meeting', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator meeting update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorProject(body: {
  key: string;
  title?: string;
  focus?: string;
  status?: string;
  next_step?: string;
  notes?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator project update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorSalesAccount(body: {
  key: string;
  name?: string;
  owner?: string;
  segment?: string;
  status?: string;
  next_step?: string;
  risk_level?: string;
  last_interaction?: string;
  notes?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/sales-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Sales account update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorSalesLead(body: {
  key: string;
  name?: string;
  company?: string;
  owner?: string;
  stage?: string;
  source?: string;
  next_step?: string;
  risk_level?: string;
  last_interaction?: string;
  notes?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/sales-lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Sales lead update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorSalesDeal(body: {
  key: string;
  title?: string;
  account_key?: string;
  owner?: string;
  stage?: string;
  value?: string;
  close_target?: string;
  next_step?: string;
  risk_level?: string;
  last_interaction?: string;
  notes?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/sales-deal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Sales deal update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorCustomerAccount(body: {
  key: string;
  name?: string;
  owner?: string;
  segment?: string;
  health?: string;
  sentiment?: string;
  churn_risk?: string;
  next_step?: string;
  last_interaction?: string;
  notes?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/customer-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Customer account update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorCustomerInteraction(body: {
  key: string;
  account_key?: string;
  contact?: string;
  channel?: string;
  topic?: string;
  sentiment?: string;
  urgency?: string;
  status?: string;
  promised_follow_up?: string;
  last_interaction?: string;
  notes?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/customer-interaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Customer interaction update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorVisualObservation(body: {
  label: string;
  source?: string;
  note: string;
  image_data_url?: string;
  created_at?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/visual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator visual update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorVisualInsight(body: {
  label: string;
  question: string;
  answer: string;
  created_at?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/visual-insight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator visual insight update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorVisualBrief(body: {
  label: string;
  summary: string;
  details?: string;
  created_at?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/visual-brief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Visual brief update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorDocumentBrief(body: {
  label: string;
  mode: string;
  summary: string;
  details?: string;
  created_at?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/document-brief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Document brief update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorDesignBrief(body: {
  label: string;
  archetype: string;
  summary: string;
  details?: string;
  scorecard?: Array<{
    label: string;
    score: number;
    note: string;
  }>;
  created_at?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/design-brief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Design brief update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorFivemBrief(body: {
  label: string;
  resource_key: string;
  framework: string;
  topology: string;
  summary: string;
  details?: string;
  native_families?: string[];
  risk_tags?: string[];
  created_at?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/fivem-brief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `FiveM brief update failed: ${res.status}`);
  }
  return res.json();
}

export async function updateOperatorLearningExperience(body: {
  label: string;
  domain: string;
  context_key?: string;
  outcome_type?: string;
  summary: string;
  lesson?: string;
  reuse_hint?: string;
  tags?: string[];
  confidence?: number;
  created_at?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/learning', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Learning experience update failed: ${res.status}`);
  }
  return res.json();
}

export async function markOperatorLearningExperiencesReused(ids: string[], reused_at?: string): Promise<DurableOperatorMemory> {
  const cleaned = ids.map((id) => id.trim()).filter(Boolean);
  if (!cleaned.length) {
    throw new Error('At least one learning experience id is required.');
  }
  const res = await authFetch('/v1/operator-memory/learning/reuse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: cleaned, reused_at }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Learning reuse update failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchOperatorLearningExperiences(params: {
  domain?: string;
  context_key?: string;
  limit?: number;
} = {}): Promise<
  Array<{
    id: string;
    label: string;
    domain: string;
    context_key: string;
    outcome_type: string;
    summary: string;
    lesson: string;
    reuse_hint: string;
    tags: string[];
    confidence?: number;
    use_count?: number;
    last_reused_at?: string;
    created_at: string;
  }>
> {
  const query = new URLSearchParams();
  if (params.domain) query.set('domain', params.domain);
  if (params.context_key) query.set('context_key', params.context_key);
  if (params.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const res = await authFetch(`/v1/operator-memory/learning${suffix}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Learning experiences fetch failed: ${res.status}`);
  }
  const data = await res.json();
  return data.items || [];
}

export async function updateOperatorMission(body: {
  id: string;
  title: string;
  domain?: string;
  status?: string;
  phase?: string;
  summary?: string;
  next_step?: string;
  result?: string;
  retry_hint?: string;
  result_data?: Record<string, unknown>;
  next_action?: Record<string, unknown>;
  updated_at?: string;
}): Promise<DurableOperatorMemory> {
  const res = await authFetch('/v1/operator-memory/mission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator mission update failed: ${res.status}`);
  }
  return res.json();
}

export async function actOnOperatorMission(body: {
  id: string;
  action: 'resume' | 'retry' | 'complete' | 'block';
  summary?: string;
  result?: string;
  retry_hint?: string;
}): Promise<{
  memory: DurableOperatorMemory;
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
    next_action?: {
      kind: string;
      content?: string;
      label?: string;
      [key: string]: unknown;
    };
    updated_at?: string;
  };
  followup?: {
    kind: 'brief' | 'prompt' | string;
    content: string;
    label?: string;
    [key: string]: unknown;
  } | null;
}> {
  const res = await authFetch('/v1/operator-memory/mission/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Operator mission action failed: ${res.status}`);
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

export async function handoffAgentArchitecture(brief: string, source = 'hud'): Promise<AgentArchitectureStatus> {
  const res = await authFetch('/v1/agent-architecture/handoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief, source }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Agent handoff failed: ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Agent Manager
// ---------------------------------------------------------------------------

export interface ManagedAgent {
  id: string;
  name: string;
  agent_type: string;
  config: Record<string, unknown>;
  status: 'idle' | 'running' | 'paused' | 'error' | 'archived' | 'needs_attention' | 'budget_exceeded' | 'stalled';
  summary_memory: string;
  created_at: number;
  updated_at: number;
  // Runtime stats
  total_runs?: number;
  total_cost?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  last_run_at?: number | null;
  // Schedule
  schedule_type?: string;
  schedule_value?: string;
  // Budget
  budget?: number;
  // Learning
  learning_enabled?: boolean;
  // Live progress
  current_activity?: string;
}

export interface AgentTask {
  id: string;
  agent_id: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  progress: Record<string, unknown>;
  findings: unknown[];
  created_at: number;
}

export interface RunManagedAgentResult {
  status: 'running';
  agent_id: string;
  already_running?: boolean;
  current_activity?: string;
  task?: AgentTask | null;
}

export interface ChannelBinding {
  id: string;
  agent_id: string;
  channel_type: string;
  config: Record<string, unknown>;
  session_id: string;
  routing_mode: string;
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  source: 'built-in' | 'user';
  agent_type: string;
  [key: string]: unknown;
}

export interface AgentMessage {
  id: string;
  agent_id: string;
  direction: 'user_to_agent' | 'agent_to_user';
  content: string;
  mode: 'immediate' | 'queued';
  status: 'pending' | 'delivered' | 'responded';
  created_at: number;
}

export async function fetchManagedAgents(options: { compact?: boolean } = {}): Promise<ManagedAgent[]> {
  const query = options.compact ? '?compact=1' : '';
  const res = await authFetch(`/v1/managed-agents${query}`, {}, 7000);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.agents || [];
}

export async function fetchManagedAgent(agentId: string): Promise<ManagedAgent> {
  const res = await authFetch(`/v1/managed-agents/${agentId}`, {}, 7000);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function createManagedAgent(body: {
  name: string;
  agent_type?: string;
  template_id?: string;
  config?: Record<string, unknown>;
}): Promise<ManagedAgent> {
  const res = await authFetch('/v1/managed-agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function updateManagedAgent(
  agentId: string,
  body: Partial<{ name: string; agent_type: string; config: Record<string, unknown> }>,
): Promise<ManagedAgent> {
  const res = await authFetch(`/v1/managed-agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function deleteManagedAgent(agentId: string): Promise<void> {
  const res = await authFetch(`/v1/managed-agents/${agentId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}

export async function pauseManagedAgent(agentId: string): Promise<void> {
  const res = await authFetch(`/v1/managed-agents/${agentId}/pause`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}

export async function resumeManagedAgent(agentId: string): Promise<void> {
  const res = await authFetch(`/v1/managed-agents/${agentId}/resume`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}

export async function fetchAgentTasks(agentId: string): Promise<AgentTask[]> {
  const res = await authFetch(`/v1/managed-agents/${agentId}/tasks`, {}, 7000);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.tasks || [];
}

export async function createAgentTask(agentId: string, description: string): Promise<AgentTask> {
  const res = await authFetch(`/v1/managed-agents/${agentId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function fetchAgentChannels(agentId: string): Promise<ChannelBinding[]> {
  const res = await authFetch(`/v1/managed-agents/${agentId}/channels`, {}, 7000);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.bindings || [];
}

export async function bindAgentChannel(
  agentId: string,
  channelType: string,
  config?: Record<string, unknown>,
): Promise<ChannelBinding> {
  const res = await authFetch(`/v1/managed-agents/${agentId}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_type: channelType,
      config: config || {},
      routing_mode: 'dedicated',
    }),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function unbindAgentChannel(
  agentId: string,
  bindingId: string,
): Promise<void> {
  const res = await authFetch(`/v1/managed-agents/${agentId}/channels/${bindingId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}

// -- SendBlue auto-setup helpers ------------------------------------------

export async function sendblueVerify(
  apiKeyId: string,
  apiSecretKey: string,
): Promise<{ valid: boolean; numbers: string[]; raw: unknown }> {
  const res = await authFetch('/v1/channels/sendblue/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key_id: apiKeyId, api_secret_key: apiSecretKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Verification failed: ${res.status}`);
  }
  return res.json();
}

export async function sendblueRegisterWebhook(
  apiKeyId: string,
  apiSecretKey: string,
  webhookUrl: string,
): Promise<{ registered: boolean; status: number }> {
  const res = await authFetch('/v1/channels/sendblue/register-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key_id: apiKeyId,
      api_secret_key: apiSecretKey,
      webhook_url: webhookUrl,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Webhook registration failed: ${res.status}`);
  }
  return res.json();
}

export async function sendblueTest(
  apiKeyId: string,
  apiSecretKey: string,
  fromNumber: string,
  toNumber: string,
): Promise<{ sent: boolean; status: number }> {
  const res = await authFetch('/v1/channels/sendblue/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key_id: apiKeyId,
      api_secret_key: apiSecretKey,
      from_number: fromNumber,
      to_number: toNumber,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Test message failed: ${res.status}`);
  }
  return res.json();
}

export async function sendblueHealth(): Promise<{ channel_connected: boolean; bridge_wired: boolean; ready: boolean }> {
  const res = await authFetch('/v1/channels/sendblue/health');
  if (!res.ok) return { channel_connected: false, bridge_wired: false, ready: false };
  return res.json();
}

export async function fetchTemplates(): Promise<AgentTemplate[]> {
  const res = await authFetch('/v1/templates');
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.templates || [];
}

export async function runManagedAgent(agentId: string): Promise<RunManagedAgentResult> {
  const res = await authFetch(`/v1/managed-agents/${agentId}/run`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Failed: ${res.status}`);
  }
  return res.json();
}

export async function recoverManagedAgent(agentId: string): Promise<{ recovered: boolean; checkpoint: unknown }> {
  const res = await authFetch(`/v1/managed-agents/${agentId}/recover`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchAgentState(agentId: string): Promise<{
  agent: ManagedAgent;
  tasks: AgentTask[];
  channels: ChannelBinding[];
  messages: AgentMessage[];
  checkpoint: unknown;
}> {
  const res = await authFetch(`/v1/managed-agents/${agentId}/state`);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export async function sendAgentMessage(
  agentId: string,
  content: string,
  mode: 'immediate' | 'queued' = 'queued',
  callbacks?: {
    onProgress?: (label: string) => void;
    onContentDelta?: (delta: string, fullContent: string) => void;
    onDone?: (fullContent: string, usage?: Record<string, number>, telemetry?: Record<string, unknown>) => void;
  },
): Promise<AgentMessage> {
  const res = await authFetch(`/v1/managed-agents/${agentId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, mode, stream: true }),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);

  // If streaming, consume the SSE response so the agent runs
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream') && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';
    let lastUsage: Record<string, number> | undefined;
    let lastTelemetry: Record<string, unknown> | undefined;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          try {
            const chunk = JSON.parse(line.slice(6));
            // Check for tool progress events
            const toolProgress = chunk.choices?.[0]?.tool_progress;
            if (toolProgress) {
              callbacks?.onProgress?.(toolProgress);
            }
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullContent += delta;
              callbacks?.onContentDelta?.(delta, fullContent);
            }
            // Capture usage + telemetry from final chunk
            if (chunk.usage) lastUsage = chunk.usage;
            if (chunk.telemetry) lastTelemetry = chunk.telemetry;
          } catch { /* skip malformed chunks */ }
        }
      }
    } catch { /* stream ended */ }

    callbacks?.onDone?.(fullContent, lastUsage, lastTelemetry);

    return {
      id: '',
      agent_id: agentId,
      direction: 'agent_to_user',
      content: fullContent,
      mode,
      status: 'delivered',
      created_at: Date.now() / 1000,
    };
  }

  return res.json();
}

export async function fetchAgentMessages(agentId: string): Promise<AgentMessage[]> {
  const res = await authFetch(`/v1/managed-agents/${agentId}/messages`, {}, 7000);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.messages || [];
}

export async function fetchErrorAgents(): Promise<ManagedAgent[]> {
  const res = await authFetch('/v1/agents/errors');
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.agents || [];
}

// ---------------------------------------------------------------------------
// Agent Learning + Traces
// ---------------------------------------------------------------------------

export interface LearningLogEntry {
  id: string;
  agent_id: string;
  event_type: string;
  description: string;
  data: Record<string, unknown>;
  created_at: number;
}

export interface AgentTrace {
  id: string;
  outcome: string;
  duration: number;
  started_at: number;
  steps: number;
  error_message?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolInfo {
  name: string;
  description: string;
  category: string;
  source: 'tool' | 'channel';
  requires_credentials: boolean;
  credential_keys: string[];
  configured: boolean;
}

export async function fetchAvailableTools(): Promise<ToolInfo[]> {
  const res = await authFetch('/v1/tools');
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.tools || [];
}

export async function saveToolCredentials(
  toolName: string,
  credentials: Record<string, string>,
): Promise<void> {
  const res = await authFetch(`/v1/tools/${toolName}/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}

export interface AgentTraceDetail {
  id: string;
  agent: string;
  outcome: string;
  duration: number;
  started_at: number;
  steps: Array<{
    step_type: string;
    input: unknown;
    output: string;
    duration: number;
    metadata: Record<string, unknown>;
  }>;
}

export async function fetchLearningLog(agentId: string): Promise<LearningLogEntry[]> {
  const res = await authFetch(`/v1/managed-agents/${agentId}/learning`, {}, 7000);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.learning_log || [];
}

export async function triggerLearning(agentId: string): Promise<void> {
  const res = await authFetch(`/v1/managed-agents/${agentId}/learning/run`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}

export async function fetchAgentTraces(agentId: string, limit = 20): Promise<AgentTrace[]> {
  const res = await authFetch(`/v1/managed-agents/${agentId}/traces?limit=${limit}`, {}, 7000);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const data = await res.json();
  return data.traces || [];
}

export async function fetchAgentTrace(agentId: string, traceId: string): Promise<AgentTraceDetail> {
  const res = await authFetch(`/v1/managed-agents/${agentId}/traces/${traceId}`, {}, 7000);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Leaderboard savings submission (Supabase)
// ---------------------------------------------------------------------------

export interface SavingsSubmission {
  anon_id: string;
  display_name: string;
  email: string;
  total_calls: number;
  total_tokens: number;
  dollar_savings: number;
  energy_wh_saved: number;
  flops_saved: number;
  token_counting_version?: number;
}

export async function submitSavings(data: SavingsSubmission): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/savings_entries?on_conflict=anon_id`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(data),
      },
    );
    return res.ok || res.status === 201 || res.status === 200;
  } catch {
    return false;
  }
}
