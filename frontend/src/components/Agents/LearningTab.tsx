import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchLearningLog, triggerLearning } from '../../lib/api';
import type { LearningLogEntry } from '../../lib/api';

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

export function LearningTab({ agentId, learningEnabled }: { agentId: string; learningEnabled: boolean }) {
  const [logs, setLogs] = useState<LearningLogEntry[]>([]);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    fetchLearningLog(agentId).then(setLogs).catch(() => {});
  }, [agentId]);

  async function handleTrigger() {
    setTriggering(true);
    try {
      await triggerLearning(agentId);
      setTimeout(() => fetchLearningLog(agentId).then(setLogs).catch(() => {}), 1000);
    } catch {
      // Learning refresh is optional; keep the tab calm if the backend rejects it.
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            What This Agent Is Learning
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: learningEnabled ? '#22c55e20' : 'var(--color-bg-secondary)',
              color: learningEnabled ? '#22c55e' : 'var(--color-text-tertiary)',
            }}
          >
            {learningEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer font-medium"
          style={{
            background: 'var(--color-accent)',
            color: '#fff',
            opacity: triggering ? 0.6 : 1,
          }}
        >
          <RefreshCw size={12} className={triggering ? 'animate-spin' : ''} />
          Refresh Insights
        </button>
      </div>
      <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        JARVIS keeps compact lessons here when an agent succeeds, stalls, or needs better defaults later.
      </div>
      {logs.length === 0 ? (
        <div
          className="rounded-xl p-5 text-center"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
            No improvement notes yet
          </div>
          <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            Once this agent has completed a run, JARVIS will start collecting useful lessons and repeated friction here.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((entry) => (
            <div
              key={entry.id}
              className="rounded-lg p-3 text-sm"
              style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ background: 'var(--color-accent)' + '20', color: 'var(--color-accent)' }}
                >
                  {entry.event_type}
                </span>
                <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {formatRelativeTime(entry.created_at)}
                </span>
              </div>
              {entry.description && <p style={{ color: 'var(--color-text-secondary)' }}>{entry.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
