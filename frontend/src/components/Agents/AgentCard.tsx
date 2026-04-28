import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  DollarSign,
  MessageSquare,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Trash2,
  Zap,
} from 'lucide-react';
import type { ManagedAgent } from '../../lib/api';
import { describeManagedAgent } from '../../lib/agentPresentation';

function statusColor(s: string): string {
  const colors: Record<string, string> = {
    idle: '#22c55e',
    running: '#3b82f6',
    paused: '#f59e0b',
    error: '#ef4444',
    archived: '#6b7280',
    needs_attention: '#f97316',
    budget_exceeded: '#f97316',
    stalled: '#ef4444',
  };
  return colors[s] || '#6b7280';
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className="w-2 h-2 rounded-full inline-block flex-shrink-0"
      style={{ background: statusColor(status) }}
      title={status}
    />
  );
}

function formatCost(cost?: number): string {
  if (cost === undefined || cost === null) return '-';
  return `$${cost.toFixed(4)}`;
}

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

function formatSchedule(type?: string, value?: string): string {
  if (!type || type === 'manual') return 'Manual';
  if (type === 'cron' && value) {
    const parts = value.trim().split(/\s+/);
    if (parts.length === 5) {
      const [min, hour, , , dow] = parts;
      const hourNum = parseInt(hour, 10);
      const formatHour = (h: number) => {
        if (h === 0) return '12:00 AM';
        if (h < 12) return `${h}:00 AM`;
        if (h === 12) return '12:00 PM';
        return `${h - 12}:00 PM`;
      };
      if (min === '0' && !isNaN(hourNum) && parts[2] === '*' && parts[3] === '*' && dow === '*') {
        return `Daily at ${formatHour(hourNum)}`;
      }
      if (min === '0' && !isNaN(hourNum) && parts[2] === '*' && parts[3] === '*' && dow !== '*') {
        const dayNames: Record<string, string> = { '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat', '7': 'Sun' };
        const dayList = dow.split(',').map((d) => dayNames[d] || d).join(', ');
        return `Weekly on ${dayList} at ${formatHour(hourNum)}`;
      }
    }
    return `Cron: ${value}`;
  }
  if (type === 'cron') return 'Cron';
  if (type === 'interval' && value) {
    const total = parseInt(value);
    if (!isNaN(total) && total > 0) {
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      const parts: string[] = [];
      if (h > 0) parts.push(`${h}h`);
      if (m > 0) parts.push(`${m}m`);
      if (s > 0) parts.push(`${s}s`);
      return `Every ${parts.join(' ') || '0s'}`;
    }
    return `Every ${value}`;
  }
  return type || 'Manual';
}

function OverflowMenu({
  agentId,
  onDelete,
}: {
  agentId: string;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="p-1 rounded cursor-pointer"
        style={{ color: 'var(--color-text-tertiary)' }}
        title="More actions"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-6 z-20 rounded-lg py-1 min-w-[120px]"
          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(agentId);
              setOpen(false);
            }}
            className="w-full text-left px-3 py-1.5 text-xs cursor-pointer flex items-center gap-2"
            style={{ color: '#ef4444' }}
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

export function AgentCard({
  agent,
  onClick,
  onPause,
  onResume,
  onRun,
  onRecover,
  onDelete,
  onChat,
  onEdit,
}: {
  agent: ManagedAgent;
  onClick: () => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRun: (id: string) => void;
  onRecover: (id: string) => void;
  onDelete: (id: string) => void;
  onChat: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const canPause = agent.status === 'running' || agent.status === 'idle';
  const canResume = agent.status === 'paused';
  const canRecover = agent.status === 'error' || agent.status === 'stalled' || agent.status === 'needs_attention';
  const description = describeManagedAgent(agent);

  return (
    <div
      onClick={onClick}
      className="p-4 rounded-lg cursor-pointer transition-colors"
      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Bot size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <span className="font-medium text-sm truncate" style={{ color: 'var(--color-text)' }}>
            {agent.name}
          </span>
        </div>
        <StatusDot status={agent.status} />
      </div>

      <div className="text-xs mb-2 leading-5" style={{ color: 'var(--color-text-secondary)' }}>
        {description}
      </div>

      <div className="text-xs mb-2 flex items-center gap-3" style={{ color: 'var(--color-text-tertiary)' }}>
        <span>{formatSchedule(agent.schedule_type, agent.schedule_value)}</span>
        <span>-</span>
        <span>Last run: {formatRelativeTime(agent.last_run_at)}</span>
      </div>

      <div className="flex items-center gap-4 mb-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        <span className="flex items-center gap-1">
          <Activity size={11} />
          {agent.total_runs ?? 0} runs
        </span>
        <span className="flex items-center gap-1">
          <DollarSign size={11} />
          {formatCost(agent.total_cost)}
        </span>
      </div>

      {(agent.config?.max_cost as number) > 0 && (
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--color-text-tertiary)' }}>
            <span>Budget</span>
            <span>
              {formatCost(agent.total_cost)} / ${(agent.config?.max_cost as number).toFixed(0)}
            </span>
          </div>
          <div className="w-full rounded-full h-1.5" style={{ background: 'var(--color-bg)' }}>
            <div
              className="h-1.5 rounded-full transition-all"
              style={{
                width: `${Math.min(100, ((agent.total_cost ?? 0) / (agent.config?.max_cost as number)) * 100)}%`,
                background:
                  ((agent.total_cost ?? 0) / (agent.config?.max_cost as number)) > 0.9
                    ? '#ef4444'
                    : ((agent.total_cost ?? 0) / (agent.config?.max_cost as number)) > 0.75
                      ? '#f59e0b'
                      : '#22c55e',
              }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={(e) => { e.stopPropagation(); onChat(agent.id); }}
          className="p-1.5 rounded cursor-pointer transition-colors"
          style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
          title="Chat with agent"
        >
          <MessageSquare size={13} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(agent.id); }}
          className="p-1.5 rounded cursor-pointer transition-colors"
          style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
          title="Edit agent"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={() => onRun(agent.id)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors"
          style={{ background: 'var(--color-accent)' + '15', color: 'var(--color-accent)' }}
          title="Run now"
        >
          <Zap size={11} /> Run Now
        </button>
        {canPause && (
          <button
            onClick={() => onPause(agent.id)}
            className="p-1 rounded cursor-pointer"
            style={{ color: 'var(--color-text-secondary)' }}
            title="Pause"
          >
            <Pause size={13} />
          </button>
        )}
        {canResume && (
          <button
            onClick={() => onResume(agent.id)}
            className="p-1 rounded cursor-pointer"
            style={{ color: '#22c55e' }}
            title="Resume"
          >
            <Play size={13} />
          </button>
        )}
        {canRecover && (
          <button
            onClick={() => onRecover(agent.id)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer"
            style={{ background: '#ef444420', color: '#ef4444' }}
            title="Recover agent"
          >
            <AlertTriangle size={11} /> Reset & Recover
          </button>
        )}
        <div className="ml-auto">
          <OverflowMenu agentId={agent.id} onDelete={onDelete} />
        </div>
      </div>
    </div>
  );
}
