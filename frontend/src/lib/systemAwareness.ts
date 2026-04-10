import type { AgentArchitectureAwareness } from './api';

export type AwarenessTone = 'good' | 'warn' | 'neutral';

export type SystemAwarenessCard = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: AwarenessTone;
};

export type SystemAwarenessHeadline = {
  title: string;
  detail: string;
  tone: AwarenessTone;
};

function toneFrom(condition: boolean, fallback: AwarenessTone = 'neutral'): AwarenessTone {
  return condition ? 'good' : fallback;
}

export function buildSystemAwarenessCards(
  awareness: AgentArchitectureAwareness | null | undefined,
): SystemAwarenessCard[] {
  if (!awareness) return [];
  const runningAgents = awareness.agents.statuses.running || 0;
  const issueCount = awareness.agents.recent_failures.length;
  const retryCount = awareness.agents.retrying.length;
  return [
    {
      id: 'agents',
      label: 'Agents',
      value: runningAgents ? `${runningAgents} active` : `${awareness.agents.total} provisioned`,
      detail:
        issueCount > 0
          ? `${issueCount} attention item${issueCount === 1 ? '' : 's'}`
          : retryCount > 0
            ? `${retryCount} retry loop${retryCount === 1 ? '' : 's'} in flight`
            : 'Core team is quiet',
      tone: runningAgents > 0 && issueCount === 0 ? 'good' : issueCount > 0 ? 'warn' : 'neutral',
    },
    {
      id: 'voice',
      label: 'Voice',
      value: awareness.voice.available ? awareness.voice.phase : 'offline',
      detail: awareness.voice.available
        ? awareness.voice.active
          ? 'Loop armed and ready'
          : 'Voice stack available but idle'
        : 'Voice loop unavailable in this runtime',
      tone: toneFrom(awareness.voice.available, 'warn'),
    },
    {
      id: 'memory',
      label: 'Memory',
      value: awareness.memory.mode || 'unknown',
      detail: awareness.memory.backend || 'Operator-only fallback',
      tone: toneFrom(awareness.memory.available, 'warn'),
    },
    {
      id: 'connectors',
      label: 'Connectors',
      value: awareness.connectors.runtime_mode,
      detail: awareness.connectors.multi_account_ready
        ? 'Private account model ready'
        : 'Connector runtime still constrained',
      tone: toneFrom(awareness.connectors.multi_account_ready, 'warn'),
    },
    {
      id: 'workspace',
      label: 'Workspace',
      value: awareness.workspace.active_root
        ? awareness.workspace.active_root.split(/[\\/]/).slice(-1)[0] || awareness.workspace.active_root
        : 'No active repo',
      detail: awareness.workspace.available
        ? `${awareness.workspace.repo_count} repo${awareness.workspace.repo_count === 1 ? '' : 's'} tracked`
        : 'Workspace registry unavailable',
      tone: toneFrom(awareness.workspace.available, 'warn'),
    },
  ];
}

export function buildSystemAwarenessHeadline(
  awareness: AgentArchitectureAwareness | null | undefined,
): SystemAwarenessHeadline {
  if (!awareness) {
    return {
      title: 'Awareness pending',
      detail: 'Architecture snapshot has not arrived yet.',
      tone: 'neutral',
    };
  }
  if (awareness.mode.level === 'minimal') {
    return {
      title: 'Fallback mode',
      detail: awareness.mode.detail,
      tone: 'warn',
    };
  }
  if (awareness.mode.level === 'degraded') {
    return {
      title: 'Degraded but operational',
      detail:
        awareness.mode.reasons[0] || awareness.mode.detail || 'JARVIS is staying online with reduced capability.',
      tone: 'neutral',
    };
  }
  const issueCount = awareness.agents.recent_failures.length;
  const retryCount = awareness.agents.retrying.length;
  if (issueCount > 0) {
    return {
      title: 'Attention needed',
      detail: `${issueCount} agent blocker${issueCount === 1 ? '' : 's'} surfaced in the latest architecture sweep.`,
      tone: 'warn',
    };
  }
  if (retryCount > 0) {
    return {
      title: 'Recovering',
      detail: `${retryCount} agent retr${retryCount === 1 ? 'y is' : 'ies are'} being watched for safe recovery.`,
      tone: 'neutral',
    };
  }
  return {
    title: 'Operationally steady',
    detail:
      awareness.mode.capabilities.length > 0
        ? `Active capabilities: ${awareness.mode.capabilities.join(', ')}.`
        : 'Voice, memory, connectors, and workspace context are reporting through the shared awareness model.',
    tone: 'good',
  };
}
