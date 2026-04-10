import { useMemo } from 'react';
import { useAppStore } from '../lib/store';

type PulseState = 'idle' | 'inferencing' | 'agent-active' | 'hidden';

const PULSE_CONFIG: Record<Exclude<PulseState, 'hidden'>, { color: string; animation: string }> = {
  idle: {
    color: 'rgba(59, 130, 246, 0.3)',
    animation: 'none',
  },
  inferencing: {
    color: '#3b82f6',
    animation: 'pulse-glow 2s ease-in-out infinite',
  },
  'agent-active': {
    color: '#8b5cf6',
    animation: 'pulse-travel 3s linear infinite',
  },
};

export function SystemPulse({ apiReachable }: { apiReachable: boolean | null }) {
  const isStreaming = useAppStore((s) => s.streamState.isStreaming);
  const managedAgents = useAppStore((s) => s.managedAgents);
  const hasRunningAgent = useMemo(
    () => managedAgents.some((agent) => agent.status === 'running'),
    [managedAgents],
  );

  if (apiReachable === false) return null;

  // Priority: agent-active > inferencing > idle
  let state: PulseState = 'idle';
  if (isStreaming) state = 'inferencing';
  if (hasRunningAgent) state = 'agent-active';

  const config = PULSE_CONFIG[state];
  const isTravel = state === 'agent-active';

  return (
    <div
      className="fixed top-0 left-0 right-0 h-[3px] z-50"
      style={{
        background: isTravel
          ? `linear-gradient(90deg, transparent, ${config.color}, transparent)`
          : `linear-gradient(90deg, transparent 5%, ${config.color} 30%, ${config.color} 70%, transparent 95%)`,
        backgroundSize: isTravel ? '200% 100%' : '100% 100%',
        animation: config.animation,
      }}
    />
  );
}
