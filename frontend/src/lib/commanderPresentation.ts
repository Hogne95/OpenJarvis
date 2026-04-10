import type { OperatorCommanderBriefResponse } from './api';

export type CommanderQueueDisplayItem = {
  id: string;
  priority: number;
  label: string;
  title: string;
  detail: string;
  executionLane?: string;
  verificationSignal?: string;
  actionLabel: string;
  action: () => void;
};

type BuildCommanderQueueOptions = {
  commanderBrief: OperatorCommanderBriefResponse | null | undefined;
  onPlannerHandoff: (prompt: string) => void;
  onOpenSystem: () => void;
};

export function buildCommanderQueueItems({
  commanderBrief,
  onPlannerHandoff,
  onOpenSystem,
}: BuildCommanderQueueOptions): CommanderQueueDisplayItem[] {
  if (!commanderBrief) return [];

  const posture = commanderBrief.command_posture?.trim();
  return commanderBrief.queue.map((item) => ({
    id: `commander-${item.id}`,
    priority: Math.max(40, Math.min(110, item.priority)),
    label: item.label,
    title: item.title,
    detail: posture ? `${item.detail} Posture: ${posture}.` : item.detail,
    executionLane: item.execution_lane,
    verificationSignal: item.verification_signal,
    actionLabel: item.action_label,
    action: () => {
      if (item.action_hint === 'planner_handoff') {
        onPlannerHandoff(
          commanderBrief.planner_prompt ||
            `${item.title}\n\nWhy now: ${commanderBrief.why}\n\nBest next step: ${commanderBrief.best_next_step}`,
        );
        return;
      }
      onOpenSystem();
    },
  }));
}

type BuildCommanderHandoffBriefOptions = {
  trimmedIntent: string;
  visualBrief:
    | {
        title: string;
        details: string;
      }
    | null
    | undefined;
  commanderQueue: Array<{
    label: string;
    title: string;
    detail: string;
  }>;
  commanderBrief: Pick<OperatorCommanderBriefResponse, 'friction_summary' | 'root_cause'> | null | undefined;
  screenContextNote: string;
};

export function buildCommanderHandoffBrief({
  trimmedIntent,
  visualBrief,
  commanderQueue,
  commanderBrief,
  screenContextNote,
}: BuildCommanderHandoffBriefOptions): string {
  if (trimmedIntent) {
    return `User command: ${trimmedIntent}`;
  }
  if (visualBrief) {
    return `Visual brief from ${visualBrief.title}:\n${visualBrief.details}`;
  }
  if (commanderQueue[0]) {
    const frictionSummary = commanderBrief?.friction_summary?.trim();
    const rootCause = commanderBrief?.root_cause?.trim();
    return [
      'Commander queue item:',
      `Label: ${commanderQueue[0].label}`,
      `Title: ${commanderQueue[0].title}`,
      `Detail: ${commanderQueue[0].detail}`,
      frictionSummary ? `Friction: ${frictionSummary}` : '',
      rootCause ? `Root cause: ${rootCause}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (screenContextNote.trim()) {
    return `Current screen note: ${screenContextNote.trim()}`;
  }
  return '';
}
