import { useCallback, useEffect, useState } from 'react';
import { fetchAgentTraces, fetchLearningLog } from '../../lib/api';
import type { AgentTrace, LearningLogEntry } from '../../lib/api';

const isDocumentHidden = () => typeof document !== 'undefined' && document.hidden;

function formatRelativeTime(ts?: number | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - ts * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

type TimelineEntry =
  | { kind: 'trace'; data: AgentTrace; ts: number }
  | { kind: 'learning'; data: LearningLogEntry; ts: number };

function learningEventColor(eventType: string) {
  if (eventType === 'query_start') return '#3b82f6';
  if (eventType === 'query_complete') return '#22c55e';
  if (eventType === 'tool_call') return '#f59e0b';
  if (eventType === 'tool_result') return '#8b5cf6';
  if (eventType === 'query_error') return '#ef4444';
  return 'var(--color-text-secondary)';
}

function learningEventLabel(eventType: string) {
  if (eventType === 'query_start') return 'Query';
  if (eventType === 'query_complete') return 'Complete';
  if (eventType === 'tool_call') return 'Tool Call';
  if (eventType === 'tool_result') return 'Tool Result';
  if (eventType === 'query_error') return 'Error';
  return eventType;
}

export function LogsTab({ agentId }: { agentId: string }) {
  const [traces, setTraces] = useState<AgentTrace[]>([]);
  const [learningEntries, setLearningEntries] = useState<LearningLogEntry[]>([]);
  const [expandedTrace, setExpandedTrace] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [t, l] = await Promise.all([
        fetchAgentTraces(agentId),
        fetchLearningLog(agentId),
      ]);
      setTraces(t);
      setLearningEntries(l);
    } catch {
      // Keep the timeline stable during transient backend refresh failures.
    }
  }, [agentId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      if (isDocumentHidden()) return;
      void loadData();
    }, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  const timeline: TimelineEntry[] = [
    ...traces.map((t): TimelineEntry => ({ kind: 'trace', data: t, ts: t.started_at })),
    ...learningEntries.map((e): TimelineEntry => ({ kind: 'learning', data: e, ts: e.created_at })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          Recent Timeline
        </span>
        <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {timeline.length} entr{timeline.length !== 1 ? 'ies' : 'y'} (auto-refreshing)
        </span>
      </div>
      <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        This timeline shows runs, tool activity, and recovery signals so you can quickly see what happened without digging into raw logs.
      </div>
      {timeline.length === 0 ? (
        <div
          className="rounded-xl p-5 text-center"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
            No timeline activity yet
          </div>
          <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            Chat with the agent or run it once to generate its first visible timeline.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {timeline.map((entry) => {
            if (entry.kind === 'learning') {
              const e = entry.data;
              return (
                <div
                  key={`learn-${e.id}`}
                  className="rounded-lg p-3 text-sm"
                  style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full inline-block"
                        style={{ background: learningEventColor(e.event_type) }}
                      />
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{
                          background: `${learningEventColor(e.event_type)}20`,
                          color: learningEventColor(e.event_type),
                        }}
                      >
                        {learningEventLabel(e.event_type)}
                      </span>
                    </div>
                    <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                      {formatRelativeTime(e.created_at)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {e.description}
                  </div>
                </div>
              );
            }

            const t = entry.data;
            const errorDetail = t.metadata?.error_detail as
              | { error_type: string; error_message: string; suggested_action: string }
              | undefined;
            const isError = t.outcome !== 'success';
            const isExpanded = expandedTrace === t.id;

            return (
              <div
                key={`trace-${t.id}`}
                className="rounded-lg p-3 text-sm cursor-pointer"
                style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
                onClick={() => isError && errorDetail && setExpandedTrace(isExpanded ? null : t.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ background: t.outcome === 'success' ? '#22c55e' : '#ef4444' }}
                    />
                    <span style={{ color: 'var(--color-text)' }}>{t.outcome}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}
                    >
                      Trace
                    </span>
                    {errorDetail && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{
                          background: errorDetail.error_type === 'fatal'
                            ? '#ef444420'
                            : errorDetail.error_type === 'escalate'
                              ? '#f59e0b20'
                              : '#3b82f620',
                          color: errorDetail.error_type === 'fatal'
                            ? '#ef4444'
                            : errorDetail.error_type === 'escalate'
                              ? '#f59e0b'
                              : '#3b82f6',
                        }}
                      >
                        {errorDetail.error_type}
                      </span>
                    )}
                  </div>
                  <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {formatRelativeTime(t.started_at)}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  <span>{t.duration.toFixed(1)}s</span>
                  <span>{t.steps} step{t.steps !== 1 ? 's' : ''}</span>
                </div>
                {isExpanded && errorDetail && (
                  <div className="mt-2 pt-2 space-y-1.5 text-xs" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <div>
                      <span className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>Error: </span>
                      <span style={{ color: 'var(--color-text)' }}>{errorDetail.error_message}</span>
                    </div>
                    <div>
                      <span className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>Action: </span>
                      <span style={{ color: 'var(--color-text)' }}>{errorDetail.suggested_action}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
