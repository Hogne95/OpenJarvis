import { authFetch } from './core';
import type { CodingRepoMemory } from './operatorMemory';
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
  metadata?: Record<string, string | boolean>;
}

export interface PendingWorkbenchCommand {
  id: string;
  command: string;
  working_dir: string;
  timeout: number;
  created_at: number;
  status: string;
  metadata?: Record<string, string | boolean>;
}

export interface WorkbenchStatus {
  pending: PendingWorkbenchCommand | null;
  history: WorkbenchEntry[];
  default_working_dir: string;
  result?: WorkbenchEntry;
  coding?: CodingWorkspaceStatus;
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
  summary?: string;
  rationale?: string;
  workflow_phase?: string;
  verification_status?: string;
  suggested_checks?: string[];
  line_count: number;
  changed_line_count?: number;
  added_line_count?: number;
  removed_line_count?: number;
  workflow?: {
    phase: string;
    completed: string[];
    remaining: string[];
    summary: string;
  };
  verification?: {
    status: string;
    suggested_checks: string[];
    latest_run?: {
      command: string;
      success: boolean;
      output: string;
      recorded_at: number;
    } | null;
    guidance: string;
  };
  latest_verification?: {
    command: string;
    success: boolean;
    output: string;
    recorded_at: number;
  } | null;
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
  summary?: string;
  rationale?: string;
  workflow_phase?: string;
  verification_status?: string;
  suggested_checks?: string[];
  latest_verification?: {
    command: string;
    success: boolean;
    output: string;
    recorded_at: number;
  } | null;
  changed_line_count?: number;
  added_line_count?: number;
  removed_line_count?: number;
}

export interface CodingWorkspaceStatus {
  pending: PendingCodeEdit | null;
  history: CodeEditEntry[];
  result?: CodeEditEntry;
  repo_memory?: CodingRepoMemory | null;
}

export interface CodingFileContents {
  repo_root: string;
  file_path: string;
  content: string;
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
  metadata?: Record<string, string | boolean>;
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
  summary?: string;
  rationale?: string;
  verification_commands?: string[];
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

export async function recordCodingVerification(body: {
  command: string;
  success: boolean;
  output?: string;
}): Promise<CodingWorkspaceStatus> {
  const res = await authFetch('/v1/coding/record-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Record coding verification failed: ${res.status}`);
  }
  return res.json();
}

export async function stageCodingVerification(body?: {
  command?: string;
  timeout?: number;
}): Promise<{ coding: CodingWorkspaceStatus; workbench: WorkbenchStatus }> {
  const res = await authFetch('/v1/coding/stage-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Stage coding verification failed: ${res.status}`);
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
