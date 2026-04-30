import { authFetch, getBase } from './core';
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
