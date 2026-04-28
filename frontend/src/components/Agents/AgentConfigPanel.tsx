import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  fetchModels,
  fetchWithTimeout,
  updateManagedAgent,
} from '../../lib/api';
import type { ManagedAgent } from '../../lib/api';

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

export function AgentInstructionSection({ agent, onAgentUpdated }: { agent: ManagedAgent; onAgentUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const currentInstruction = (agent.config?.instruction as string) || '';

  async function save() {
    try {
      const newConfig = { ...(agent.config || {}), instruction: draft.trim() };
      await updateManagedAgent(agent.id, { config: newConfig });
      onAgentUpdated();
    } catch {
      // Keep edit mode calm on transient backend errors.
    }
    setEditing(false);
  }

  return (
    <div
      className="p-3 rounded-lg"
      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Instruction</h3>
        {!editing && (
          <button
            onClick={() => { setDraft(currentInstruction); setEditing(true); }}
            className="text-xs px-2 py-0.5 rounded cursor-pointer"
            style={{ color: 'var(--color-accent)', border: '1px solid var(--color-accent)', opacity: 0.8 }}
          >
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg text-sm bg-transparent resize-none"
            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
          />
          <div className="flex gap-2">
            <button onClick={save} className="text-xs px-3 py-1 rounded font-medium cursor-pointer" style={{ background: 'var(--color-accent)', color: '#fff' }}>Save</button>
            <button onClick={() => setEditing(false)} className="text-xs px-3 py-1 rounded cursor-pointer" style={{ color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <p className="text-sm" style={{ color: currentInstruction ? 'var(--color-text)' : 'var(--color-text-tertiary)' }}>
          {currentInstruction || '(No instruction set - click Edit to add one)'}
        </p>
      )}
    </div>
  );
}

export function AgentConfigGrid({ agent, onAgentUpdated }: { agent: ManagedAgent; onAgentUpdated: () => void }) {
  const [editingModel, setEditingModel] = useState(false);
  const [changingModel, setChangingModel] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const currentModel = (agent.config?.model as string) || '(default)';
  const [modelAvailable, setModelAvailable] = useState<'available' | 'unavailable' | 'unknown'>('unknown');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function checkModel() {
      try {
        const res = await fetchWithTimeout('http://localhost:11434/api/tags', {}, 5000);
        if (!res.ok) {
          setModelAvailable('unknown');
          return;
        }
        const data = await res.json();
        const loadedNames: string[] = (data.models || []).map((m: { name: string }) => m.name);
        if (!cancelled) {
          setOllamaModels(loadedNames);
          if (currentModel === '(default)') {
            setModelAvailable(loadedNames.length > 0 ? 'available' : 'unknown');
          } else {
            const isLoaded = loadedNames.some(
              (n) => n === currentModel || n.startsWith(currentModel + ':') || currentModel.startsWith(n.split(':')[0]),
            );
            setModelAvailable(isLoaded ? 'available' : 'unavailable');
          }
        }
      } catch {
        if (!cancelled) setModelAvailable('unknown');
      }
    }
    checkModel();
    return () => {
      cancelled = true;
    };
  }, [currentModel]);

  async function startEditingModel() {
    try {
      const fetched = await fetchModels();
      setModels(fetched.map((m) => m.id));
    } catch {
      // ignore
    }
    try {
      const res = await fetchWithTimeout('http://localhost:11434/api/tags', {}, 5000);
      if (res.ok) {
        const data = await res.json();
        setOllamaModels((data.models || []).map((m: { name: string }) => m.name));
      }
    } catch {
      // ignore
    }
    setEditingModel(true);
  }

  function isModelLoaded(modelId: string): boolean {
    return ollamaModels.some(
      (n) => n === modelId || n.startsWith(`${modelId}:`) || modelId.startsWith(n.split(':')[0]),
    );
  }

  async function changeModel(newModel: string) {
    setChangingModel(true);
    try {
      const newConfig = { ...(agent.config || {}), model: newModel };
      await updateManagedAgent(agent.id, { config: newConfig });
      onAgentUpdated();
      toast.success(`Model changed to ${newModel}`);
    } catch {
      // ignore
    }
    setEditingModel(false);
    setChangingModel(false);
  }

  const modelStatusDot = modelAvailable === 'available'
    ? '#22c55e'
    : modelAvailable === 'unavailable'
      ? '#ef4444'
      : '#888';

  const rows: [string, React.ReactNode][] = [
    ['Intelligence', editingModel ? (
      changingModel ? (
        <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Switching model...</span>
      ) : (
        <select
          autoFocus
          defaultValue={currentModel}
          onChange={(e) => changeModel(e.target.value)}
          onBlur={() => setEditingModel(false)}
          className="text-sm rounded px-1 py-0.5"
          style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
        >
          {models.map((m) => {
            const loaded = isModelLoaded(m);
            return (
              <option key={m} value={m} style={!loaded ? { color: '#888' } : undefined}>
                {m}{!loaded ? ' (not loaded)' : ''}
              </option>
            );
          })}
        </select>
      )
    ) : (
      <span className="flex items-center gap-2">
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: modelStatusDot,
            display: 'inline-block',
            flexShrink: 0,
          }}
          title={
            modelAvailable === 'available' ? 'Model running'
              : modelAvailable === 'unavailable' ? 'Model not available'
                : 'Could not check model status'
          }
        />
        <span style={{ color: 'var(--color-text)' }}>{currentModel}</span>
        {modelAvailable === 'unavailable' && (
          <span className="text-xs" style={{ color: '#ef4444' }}>Not available</span>
        )}
        <button
          onClick={startEditingModel}
          className="text-xs px-2 py-0.5 rounded cursor-pointer"
          style={{
            color: modelAvailable === 'unavailable' ? '#ef4444' : 'var(--color-accent)',
            border: `1px solid ${modelAvailable === 'unavailable' ? '#ef4444' : 'var(--color-accent)'}`,
            opacity: 0.8,
          }}
        >
          Change
        </button>
      </span>
    )],
    ['Agent Type', <span key="at">{agent.agent_type}</span>],
    ['Schedule', <span key="sc">{formatSchedule(agent.schedule_type, agent.schedule_value)}</span>],
    ['Last Run', <span key="lr">{formatRelativeTime(agent.last_run_at)}</span>],
    ['Budget', <span key="bg">{agent.budget ? formatCost(agent.budget) : 'Unlimited'}</span>],
    ['Learning', <span key="le">{agent.learning_enabled ? 'Enabled' : 'Disabled'}</span>],
  ];

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
      {rows.map(([label, value]) => (
        <div key={label as string} className="flex gap-2 items-center text-sm">
          <span className="font-medium" style={{ color: 'var(--color-text-secondary)', minWidth: 110 }}>{label}</span>
          <span style={{ color: 'var(--color-text)' }}>{value}</span>
        </div>
      ))}
    </div>
  );
}
