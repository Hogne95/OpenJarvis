import type {
  AutomationLogEntry,
  DurableOperatorMemory,
  InboxSummaryItem,
  ReminderItem,
} from './api';

export function buildPrioritizedContacts(options: {
  profilePriorityContacts: string;
  durablePriorityContacts: string[] | undefined;
  signalTopContacts: string[];
  durableSignalTopContacts: string[] | undefined;
}): string[] {
  const {
    profilePriorityContacts,
    durablePriorityContacts,
    signalTopContacts,
    durableSignalTopContacts,
  } = options;
  return [
    ...profilePriorityContacts
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
    ...(durablePriorityContacts || []),
    ...signalTopContacts,
    ...(durableSignalTopContacts || []),
  ].filter((item, index, array) => array.indexOf(item) === index);
}

export function sortInboxByPriority(items: InboxSummaryItem[], prioritizedContacts: string[]): InboxSummaryItem[] {
  return [...items].sort((left, right) => {
    const leftContact = (left.author_email || left.author).toLowerCase();
    const rightContact = (right.author_email || right.author).toLowerCase();
    const leftPriority = prioritizedContacts.findIndex((item) => leftContact.includes(item));
    const rightPriority = prioritizedContacts.findIndex((item) => rightContact.includes(item));
    const leftRank = leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority;
    const rightRank = rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return (right.timestamp || '').localeCompare(left.timestamp || '');
  });
}

export function buildActiveAutomationAlerts(
  logs: AutomationLogEntry[],
  dismissedAutomationAlerts: string[],
): AutomationLogEntry[] {
  return [...logs]
    .sort((left, right) => {
      if (left.success !== right.success) return left.success ? 1 : -1;
      return new Date(right.started_at).getTime() - new Date(left.started_at).getTime();
    })
    .slice(0, 4)
    .filter((item) => !dismissedAutomationAlerts.includes(`${item.task_id}:${item.started_at}`));
}

export function filterAutomationAlerts(
  alerts: AutomationLogEntry[],
  filter: 'all' | 'errors' | 'ready',
): AutomationLogEntry[] {
  return alerts.filter((item) => {
    if (filter === 'errors') return !item.success;
    if (filter === 'ready') return item.success;
    return true;
  });
}

export function countAutomationAlerts(alerts: AutomationLogEntry[]): {
  all: number;
  errors: number;
  ready: number;
} {
  return {
    all: alerts.length,
    errors: alerts.filter((item) => !item.success).length,
    ready: alerts.filter((item) => item.success).length,
  };
}

export function getImmediateReminder(reminders: ReminderItem[]): (ReminderItem & { deltaMs: number }) | null {
  const now = Date.now();
  const enriched = reminders
    .map((item) => {
      const parsed = new Date(item.when).getTime();
      return {
        ...item,
        deltaMs: Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed - now,
      };
    })
    .sort((a, b) => a.deltaMs - b.deltaMs);
  return enriched[0] ?? null;
}

export function buildPrepQueue(
  reminders: ReminderItem[],
  meetings: DurableOperatorMemory['meetings'] | undefined,
  normalizeMeetingKey: (value: string) => string,
): Array<
  ReminderItem & {
    deltaMs: number;
    memory: NonNullable<DurableOperatorMemory['meetings']>[string] | undefined;
    score: number;
  }
> {
  const now = Date.now();
  const meetingMemory = meetings || {};
  return reminders
    .filter((item) => item.kind === 'event')
    .map((item) => {
      const parsed = new Date(item.when).getTime();
      const deltaMs = Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed - now;
      const memory = meetingMemory[normalizeMeetingKey(item.title)];
      const importanceBoost =
        memory?.importance === 'high' ? 3 : memory?.importance === 'normal' ? 1 : 0;
      const urgencyBoost =
        deltaMs <= 90 * 60 * 1000 ? 4 : deltaMs <= 4 * 60 * 60 * 1000 ? 2 : 0;
      return {
        ...item,
        deltaMs,
        memory,
        score: importanceBoost + urgencyBoost,
      };
    })
    .filter((item) => item.deltaMs >= -15 * 60 * 1000 && item.deltaMs <= 24 * 60 * 60 * 1000)
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return left.deltaMs - right.deltaMs;
    })
    .slice(0, 3);
}
