import { authFetch } from './core';
import type { PendingWorkbenchCommand, WorkbenchEntry } from './workspaceCoding';
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
