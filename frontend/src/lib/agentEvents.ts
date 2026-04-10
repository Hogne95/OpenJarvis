import { getBase } from './api';

export interface AgentEventMessage {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

function getAgentEventsUrl(agentId?: string): string {
  const base = getBase() || window.location.origin;
  const url = new URL(base, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/v1/agents/events';
  if (agentId) url.searchParams.set('agent_id', agentId);
  return url.toString();
}

export function subscribeAgentEvents(
  onMessage: (message: AgentEventMessage) => void,
  options: {
    agentId?: string;
    onError?: () => void;
  } = {},
): () => void {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    return () => {};
  }

  const socket = new WebSocket(getAgentEventsUrl(options.agentId));
  socket.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data) as AgentEventMessage);
    } catch {
      // Ignore malformed events; polling remains the fallback source of truth.
    }
  };
  socket.onerror = () => {
    options.onError?.();
  };

  return () => {
    socket.close();
  };
}
