import type { ReactNode } from 'react';
import type { AutomationLogEntry } from '../../../lib/api';
import type { ChatMessage, ToolCallInfo } from '../../../types';
export function getApiBase() {
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (envBase) return envBase.replace(/\/$/, '');
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export type Status = 'Standby' | 'Listening' | 'Analyzing' | 'Responding';
export type MissionPhase = 'detect' | 'plan' | 'act' | 'verify' | 'retry' | 'done';

export type MissionStatus = 'idle' | 'active' | 'blocked' | 'complete';

export type ConnectorSummary = {
  totalConnected: number;
  emailReady: boolean;
  calendarReady: boolean;
  docsReady: boolean;
  messagingReady: boolean;
  emailProvider: 'gmail' | 'outlook' | '';
  calendarProvider: 'gcalendar' | 'outlook' | '';
};

export function Panel({
  title,
  kicker,
  children,
  className = '',
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`jarvis-panel rounded-[1.75rem] p-4 md:p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          {kicker ? (
            <div className="mb-1 text-[10px] uppercase tracking-[0.42em] text-cyan-300/65">
              {kicker}
            </div>
          ) : null}
          <div className="text-sm uppercase tracking-[0.28em] text-cyan-50/90">{title}</div>
        </div>
        <div className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.9)]" />
      </div>
      {children}
    </div>
  );
}

export function missionPhaseLabel(phase: MissionPhase) {
  switch (phase) {
    case 'detect':
      return 'Detect';
    case 'plan':
      return 'Plan';
    case 'act':
      return 'Act';
    case 'verify':
      return 'Verify';
    case 'retry':
      return 'Retry';
    case 'done':
      return 'Done';
    default:
      return phase;
  }
}

export function summarizeMissionMeta(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  return Object.entries(record)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
    .slice(0, 3)
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${String(value)}`);
}

export function Equalizer({ bars }: { bars: number[] }) {
  return (
    <div className="flex h-20 items-end gap-2">
      {bars.map((bar, index) => (
        <span
          key={`${bar}-${index}`}
          className="jarvis-bar w-2 rounded-full bg-gradient-to-t from-cyan-500 via-sky-300 to-white/90"
          style={{ height: `${bar}%`, animationDelay: `${index * 120}ms` }}
        />
      ))}
    </div>
  );
}

export function formatElapsed(ms: number) {
  if (!ms) return '0.0s';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function compactText(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function latestMessageByRole(messages: ChatMessage[], role: 'user' | 'assistant') {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === role) return messages[index];
  }
  return null;
}

export function summarizeToolCall(toolCall: ToolCallInfo | null) {
  if (!toolCall) return 'No active tool call.';
  const args = toolCall.arguments?.trim();
  if (!args) return `${toolCall.tool} requested.`;
  const compactArgs = args.length > 100 ? `${args.slice(0, 97)}...` : args;
  return `${toolCall.tool}(${compactArgs})`;
}

export function detectLanguageHints() {
  const locale = (navigator.language || '').toLowerCase();
  if (locale.startsWith('en')) return ['en', 'no'];
  if (locale.startsWith('nb') || locale.startsWith('nn') || locale.startsWith('no')) {
    return ['no', 'en'];
  }
  return ['no', 'en'];
}

export function formatReminderMoment(value: string) {
  if (!value) return 'No time set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export function DashboardSectionFallback({ label = 'Loading panel...' }: { label?: string }) {
  return <div className="text-sm text-slate-200/72">{label}</div>;
}

export function normalizeContactKey(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeMeetingKey(value: string) {
  return value.trim().toLowerCase();
}

export const DISMISSED_AUTOMATION_ALERTS_KEY = 'jarvis-dismissed-automation-alerts';
export const REVIEW_QUEUE_STATE_KEY = 'jarvis-review-queue-state';
export const CODING_TASKS_KEY = 'jarvis-coding-tasks';
export const DESKTOP_DRAFT_KEY = 'jarvis-desktop-draft';
export const SELF_IMPROVE_RUNS_KEY = 'jarvis-self-improve-runs';

export function loadDismissedAutomationAlerts() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DISMISSED_AUTOMATION_ALERTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function loadReviewQueueState() {
  if (typeof window === 'undefined') return {} as Record<string, 'pending' | 'in_progress' | 'done'>;
  try {
    const raw = window.localStorage.getItem(REVIEW_QUEUE_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, 'pending' | 'in_progress' | 'done'] =>
        ['pending', 'in_progress', 'done'].includes(String(entry[1])),
      ),
    );
  } catch {
    return {};
  }
}

export function loadCodingTasks() {
  if (typeof window === 'undefined') return [] as Array<{
    id: string;
    title: string;
    filePath: string;
    mode: 'review' | 'debug' | 'inspect' | 'fix';
    status: 'pending' | 'in_progress' | 'done';
  }>;
  try {
    const raw = window.localStorage.getItem(CODING_TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is {
            id: string;
            title: string;
            filePath: string;
            mode: 'review' | 'debug' | 'inspect' | 'fix';
            status: 'pending' | 'in_progress' | 'done';
          } =>
            item &&
            typeof item.id === 'string' &&
            typeof item.title === 'string' &&
            typeof item.filePath === 'string' &&
            ['review', 'debug', 'inspect', 'fix'].includes(String(item.mode)) &&
            ['pending', 'in_progress', 'done'].includes(String(item.status)),
        )
      : [];
  } catch {
    return [];
  }
}

export function loadDesktopDraft() {
  if (typeof window === 'undefined') {
    return null as null | { target: string; content: string; createdAt: number };
  }
  try {
    const raw = window.localStorage.getItem(DESKTOP_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.target === 'string' &&
      typeof parsed.content === 'string' &&
      typeof parsed.createdAt === 'number'
    ) {
      return parsed as { target: string; content: string; createdAt: number };
    }
  } catch {}
  return null;
}

export function loadSelfImproveRuns() {
  if (typeof window === 'undefined') {
    return [] as Array<{
      id: string;
      source: string;
      phase: 'brief' | 'route' | 'patch' | 'check' | 'outcome' | 'blocker';
      summary: string;
      detail: string;
      createdAt: number;
    }>;
  }
  try {
    const raw = window.localStorage.getItem(SELF_IMPROVE_RUNS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is {
            id: string;
            source: string;
            phase: 'brief' | 'route' | 'patch' | 'check' | 'outcome' | 'blocker';
            summary: string;
            detail: string;
            createdAt: number;
          } =>
            item &&
            typeof item.id === 'string' &&
            typeof item.source === 'string' &&
            ['brief', 'route', 'patch', 'check', 'outcome', 'blocker'].includes(String(item.phase)) &&
            typeof item.summary === 'string' &&
            typeof item.detail === 'string' &&
            typeof item.createdAt === 'number',
        )
      : [];
  } catch {
    return [];
  }
}

export function formatRoutineLabel(routineId: AutomationLogEntry['routine_id']) {
  switch (routineId) {
    case 'daily_ops':
      return 'Daily Ops';
    case 'inbox_sweep':
      return 'Inbox Sweep';
    case 'meeting_prep':
      return 'Meeting Prep';
    default:
      return routineId;
  }
}

export function buildAutomationAnnouncement(log: AutomationLogEntry) {
  const label = formatRoutineLabel(log.routine_id);
  return log.success ? `${label} completed.` : `${label} needs attention.`;
}
