import { MessageSquare, Zap } from 'lucide-react';
import type { AgentTask } from '../../lib/api';

type DetailTab = 'overview' | 'interact' | 'channels' | 'messaging' | 'tasks' | 'memory' | 'learning' | 'logs';

const TASK_STATUS_COLOR: Record<string, string> = {
  completed: '#22c55e',
  running: '#3b82f6',
  pending: '#f59e0b',
  failed: '#ef4444',
  error: '#ef4444',
};

function statusColor(status: string) {
  return TASK_STATUS_COLOR[status] || '#6b7280';
}

export function TasksTab({
  tasks,
  agentId,
  onRun,
  onTabChange,
}: {
  tasks: AgentTask[];
  agentId: string;
  onRun: (id: string) => void;
  onTabChange: (tab: DetailTab) => void;
}) {
  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="p-3 rounded-lg"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex justify-between items-start gap-3">
            <span className="text-sm" style={{ color: 'var(--color-text)' }}>
              {task.description}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded flex-shrink-0"
              style={{
                background: statusColor(task.status) + '20',
                color: statusColor(task.status),
              }}
            >
              {task.status}
            </span>
          </div>
        </div>
      ))}

      {tasks.length === 0 && (
        <div
          className="rounded-xl p-5 text-center"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
            No runs yet
          </div>
          <div className="text-sm mb-4" style={{ color: 'var(--color-text-tertiary)' }}>
            Start the agent once and JARVIS will show its recent work here.
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => onRun(agentId)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{ background: 'var(--color-accent)', color: '#fff' }}
            >
              <Zap size={14} /> Run Agent
            </button>
            <button
              onClick={() => onTabChange('interact')}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            >
              <MessageSquare size={14} /> Chat First
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
