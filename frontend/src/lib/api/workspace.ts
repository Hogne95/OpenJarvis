import { authFetch } from './core';
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
