import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '../lib/store';
import {
  fetchManagedAgents,
  fetchAgentTasks,
  fetchAgentChannels,
  fetchTemplates,
  pauseManagedAgent,
  resumeManagedAgent,
  deleteManagedAgent,
  runManagedAgent,
  recoverManagedAgent,
  fetchManagedAgent,
  fetchAvailableTools,
  saveToolCredentials,
  fetchModels,
  updateManagedAgent,
  fetchWithTimeout,
} from '../lib/api';
import type { AgentTask, ChannelBinding, AgentTemplate, ManagedAgent, ToolInfo } from '../lib/api';
import {
  Plus,
  Bot,
  Pause,
  Play,
  Trash2,
  ChevronLeft,
  ListTodo,
  Brain,
  Zap,
  MoreHorizontal,
  AlertTriangle,
  DollarSign,
  Activity,
  MessageSquare,
  Settings,
  FileText,
  Wifi,
  Database,
  Check,
  Pencil,
} from 'lucide-react';
import {
  AGENTS_LIST_DESCRIPTION,
  AGENTS_LIST_GUIDANCE_ACTIVE,
  AGENTS_LIST_GUIDANCE_EMPTY,
  AGENTS_LIST_NEXT_STEPS_ACTIVE,
  AGENTS_LIST_NEXT_STEPS_EMPTY,
  PERSONAL_WATCHER_TEMPLATE,
  dedupeTemplatesList,
  dedupeVisibleAgents,
  describeManagedAgent,
  humanizeAgentType,
  isPersonalWatcherAgent,
  isRecommendedTemplate,
  normalizeAgentName,
  recommendedConnectorsForAgent,
  recommendedNextSteps,
  setupHeadlineForTemplate,
  statusGuidance,
  templateBestForLabel,
  useCasesForAgent,
} from '../lib/agentPresentation';
import { ChannelsTab } from '../components/Agents/ChannelsTab';
import { InteractTab } from '../components/Agents/InteractTab';
import { LaunchWizard } from '../components/Agents/LaunchWizard';
import { LearningTab } from '../components/Agents/LearningTab';
import { LogsTab } from '../components/Agents/LogsTab';
import { MessagingTab } from '../components/Agents/MessagingTab';

const isDocumentHidden = () => typeof document !== 'undefined' && document.hidden;

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type AgentStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'error'
  | 'archived'
  | 'needs_attention'
  | 'budget_exceeded'
  | 'stalled';

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: '#22c55e',
  running: '#3b82f6',
  paused: '#6b7280',
  error: '#ef4444',
  archived: '#6b7280',
  needs_attention: '#f59e0b',
  budget_exceeded: '#f97316',
  stalled: '#eab308',
};

function statusColor(s: string): string {
  return STATUS_COLOR[s as AgentStatus] || '#6b7280';
}

function StatusBadge({ status }: { status: string }) {
  const color = statusColor(status);
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: color + '20', color }}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = statusColor(status);
  return (
    <span
      className="w-2 h-2 rounded-full inline-block flex-shrink-0"
      style={{ background: color }}
      title={status}
    />
  );
}

function formatCost(cost?: number): string {
  if (cost === undefined || cost === null) return '—';
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
    // Try to display human-readable for common cron patterns
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
      // Daily pattern: 0 H * * *
      if (min === '0' && !isNaN(hourNum) && parts[2] === '*' && parts[3] === '*' && dow === '*') {
        return `Daily at ${formatHour(hourNum)}`;
      }
      // Weekly pattern: 0 H * * days
      if (min === '0' && !isNaN(hourNum) && parts[2] === '*' && parts[3] === '*' && dow !== '*') {
        const DAY_NAMES: Record<string, string> = { '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat', '7': 'Sun' };
        const dayList = dow.split(',').map(d => DAY_NAMES[d] || d).join(', ');
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

// ---------------------------------------------------------------------------
// Overflow menu
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Agent List Card
// ---------------------------------------------------------------------------

function AgentCard({
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
      {/* Row 1: Name + status dot */}
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

      {/* Row 2: Schedule + last run */}
      <div className="text-xs mb-2 flex items-center gap-3" style={{ color: 'var(--color-text-tertiary)' }}>
        <span>{formatSchedule(agent.schedule_type, agent.schedule_value)}</span>
        <span>·</span>
        <span>Last run: {formatRelativeTime(agent.last_run_at)}</span>
      </div>

      {/* Row 3: Stats */}
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

      {/* Budget progress bar */}
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

      {/* Row 4: Actions */}
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

// ---------------------------------------------------------------------------
// Detail view — Configuration grid with editable model
// ---------------------------------------------------------------------------

function AgentInstructionSection({ agent, onAgentUpdated }: { agent: ManagedAgent; onAgentUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const currentInstruction = (agent.config?.instruction as string) || '';

  async function save() {
    try {
      const newConfig = { ...(agent.config || {}), instruction: draft.trim() };
      await updateManagedAgent(agent.id, { config: newConfig });
      onAgentUpdated();
    } catch { /* ignore */ }
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
          {currentInstruction || '(No instruction set — click Edit to add one)'}
        </p>
      )}
    </div>
  );
}

function AgentConfigGrid({ agent, onAgentUpdated }: { agent: ManagedAgent; onAgentUpdated: () => void }) {
  const [editingModel, setEditingModel] = useState(false);
  const [changingModel, setChangingModel] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const currentModel = (agent.config?.model as string) || '(default)';

  // Model availability status: 'available' | 'unavailable' | 'unknown'
  const [modelAvailable, setModelAvailable] = useState<'available' | 'unavailable' | 'unknown'>('unknown');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function checkModel() {
      try {
        const res = await fetchWithTimeout('http://localhost:11434/api/tags', {}, 5000);
        if (!res.ok) { setModelAvailable('unknown'); return; }
        const data = await res.json();
        const loadedNames: string[] = (data.models || []).map((m: { name: string }) => m.name);
        if (!cancelled) {
          setOllamaModels(loadedNames);
          if (currentModel === '(default)') {
            setModelAvailable(loadedNames.length > 0 ? 'available' : 'unknown');
          } else {
            const isLoaded = loadedNames.some(
              (n) => n === currentModel || n.startsWith(currentModel + ':') || currentModel.startsWith(n.split(':')[0])
            );
            setModelAvailable(isLoaded ? 'available' : 'unavailable');
          }
        }
      } catch {
        if (!cancelled) setModelAvailable('unknown');
      }
    }
    checkModel();
    return () => { cancelled = true; };
  }, [currentModel]);

  async function startEditingModel() {
    try {
      const fetched = await fetchModels();
      setModels(fetched.map((m) => m.id));
    } catch { /* ignore */ }
    // Also refresh Ollama models for availability indication
    try {
      const res = await fetchWithTimeout('http://localhost:11434/api/tags', {}, 5000);
      if (res.ok) {
        const data = await res.json();
        setOllamaModels((data.models || []).map((m: { name: string }) => m.name));
      }
    } catch { /* ignore */ }
    setEditingModel(true);
  }

  function isModelLoaded(modelId: string): boolean {
    return ollamaModels.some(
      (n) => n === modelId || n.startsWith(modelId + ':') || modelId.startsWith(n.split(':')[0])
    );
  }

  async function changeModel(newModel: string) {
    setChangingModel(true);
    try {
      const newConfig = { ...(agent.config || {}), model: newModel };
      await updateManagedAgent(agent.id, { config: newConfig });
      onAgentUpdated();
      toast.success(`Model changed to ${newModel}`);
    } catch { /* ignore */ }
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

type AgentLaunchSuccessState = {
  id: string;
  name: string;
  watcher?: boolean;
};

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function AgentsPage() {
  const managedAgents = useAppStore((s) => s.managedAgents);
  const setManagedAgents = useAppStore((s) => s.setManagedAgents);
  const selectedAgentId = useAppStore((s) => s.selectedAgentId);
  const setSelectedAgentId = useAppStore((s) => s.setSelectedAgentId);
  const savings = useAppStore((s) => s.savings);
  const [loading, setLoading] = useState(true);
  const [agentManagerAvailable, setAgentManagerAvailable] = useState<boolean | null>(null);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [channels, setChannels] = useState<ChannelBinding[]>([]);
  const [selectedAgentDetail, setSelectedAgentDetail] = useState<ManagedAgent | null>(null);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [launchSuccess, setLaunchSuccess] = useState<AgentLaunchSuccessState | null>(null);
  const visibleAgents = dedupeVisibleAgents(managedAgents);
  const visibleTemplates = dedupeTemplatesList(templates);
  const recommendedStarterTemplates = visibleTemplates.filter(isRecommendedTemplate);
  const additionalStarterTemplates = visibleTemplates.filter((tpl) => !isRecommendedTemplate(tpl));
  const [detailTab, setDetailTab] = useState<'overview' | 'interact' | 'channels' | 'messaging' | 'tasks' | 'memory' | 'learning' | 'logs'>('interact');
  const shouldLoadTaskHistory = detailTab === 'tasks';
  const shouldLoadOverviewChannels = detailTab === 'overview';

  const refresh = useCallback(async () => {
    try {
      const agents = await fetchManagedAgents({ compact: true });
      setManagedAgents(agents);
      setAgentManagerAvailable(true);
    } catch (err: any) {
      if (err.message?.includes('404')) {
        setAgentManagerAvailable(false);
      }
      setManagedAgents([]);
    } finally {
      setLoading(false);
    }
  }, [setManagedAgents]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const shouldLoadTemplates = showWizard;
    if (!shouldLoadTemplates || templatesLoaded) return;
    fetchTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setTemplatesLoaded(true));
  }, [showWizard, templatesLoaded]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isDocumentHidden()) return;
      void refresh();
    }, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  const selectedAgent =
    (selectedAgentDetail && selectedAgentDetail.id === selectedAgentId ? selectedAgentDetail : null) ||
    managedAgents.find((a) => a.id === selectedAgentId) ||
    null;

  useEffect(() => {
    if (!selectedAgentId) {
      setSelectedAgentDetail(null);
      return;
    }

    const loadSelectedAgentDetail = async () => {
      try {
        const agent = await fetchManagedAgent(selectedAgentId);
        setSelectedAgentDetail(agent);
      } catch {
        setSelectedAgentDetail(null);
      }
    };

    void loadSelectedAgentDetail();
    const interval = setInterval(() => {
      if (isDocumentHidden()) return;
      void loadSelectedAgentDetail();
    }, 30000);
    return () => clearInterval(interval);
  }, [selectedAgentId]);

  useEffect(() => {
    if (!selectedAgentId || !shouldLoadTaskHistory) {
      setTasks([]);
      return;
    }

    const loadSelectedAgentTasks = async () => {
      try {
        const nextTasks = await fetchAgentTasks(selectedAgentId);
        setTasks(nextTasks);
      } catch {
        setTasks([]);
      }
    };

    void loadSelectedAgentTasks();
    const interval = setInterval(() => {
      if (isDocumentHidden()) return;
      void loadSelectedAgentTasks();
    }, 30000);
    return () => clearInterval(interval);
  }, [selectedAgentId, shouldLoadTaskHistory]);

  useEffect(() => {
    if (!selectedAgentId || !shouldLoadOverviewChannels) {
      setChannels([]);
      return;
    }

    const loadSelectedAgentChannels = async () => {
      try {
        const nextChannels = await fetchAgentChannels(selectedAgentId);
        setChannels(nextChannels);
      } catch {
        setChannels([]);
      }
    };

    void loadSelectedAgentChannels();
    const interval = setInterval(() => {
      if (isDocumentHidden()) return;
      void loadSelectedAgentChannels();
    }, 45000);
    return () => clearInterval(interval);
  }, [selectedAgentId, shouldLoadOverviewChannels]);

  const handlePause = async (id: string) => {
    await pauseManagedAgent(id).catch(() => {});
    await refresh();
  };

  const handleResume = async (id: string) => {
    await resumeManagedAgent(id).catch(() => {});
    await refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteManagedAgent(id).catch(() => {});
    if (selectedAgentId === id) setSelectedAgentId(null);
    if (launchSuccess?.id === id) setLaunchSuccess(null);
    await refresh();
  };

  const handleRun = async (id: string) => {
    setSelectedAgentId(id);
    setDetailTab('interact');
    try {
      const result = await runManagedAgent(id);
      if (result.already_running) {
        toast.message('Agent is already running', {
          description: result.current_activity || 'The current run is still in progress.',
        });
      } else if (result.task?.description) {
        toast.success('Agent launched', {
          description: result.task.description,
        });
      }
    } catch (err: any) {
      toast.error('Failed to start agent', {
        description: err.message || 'Unknown error',
      });
      await refresh();
      return;
    }
    await refresh();
    setTimeout(async () => {
      try {
        const agent = await fetchManagedAgent(id);
        if (agent.status === 'error') {
          toast.error(`Agent "${agent.name}" failed`, {
            description: agent.summary_memory?.replace(/^ERROR: /, '') || 'Unknown error',
          });
          useAppStore.getState().addLogEntry({
            timestamp: Date.now(), level: 'error', category: 'model',
            message: `Agent "${agent.name}" failed: ${agent.summary_memory || 'Unknown error'}`,
          });
        }
      } catch {}
      await refresh();
    }, 3000);
  };

  const handleRecover = async (id: string) => {
    try {
      const result = await recoverManagedAgent(id);
      if (result.checkpoint) {
        toast.success('Agent recovered from checkpoint');
      } else {
        toast.success('Agent reset to idle (no checkpoint available)');
      }
      setDetailTab('overview');
    } catch (err: any) {
      toast.error('Recovery failed', {
        description: err.message || 'Unknown error',
      });
    }
    await refresh();
  };

  const prevStatuses = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const agent of managedAgents) {
      const prev = prevStatuses.current[agent.id];
      if (prev && prev !== 'error' && agent.status === 'error') {
        toast.error(`Agent "${agent.name}" failed`, {
          description: agent.summary_memory?.replace(/^ERROR: /, '') || 'Unknown error',
        });
      }
      prevStatuses.current[agent.id] = agent.status;
    }
  }, [managedAgents]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--color-text-tertiary)' }}>
        Loading agents...
      </div>
    );
  }

  // ── Detail View ─────────────────────────────────────────────────────────

  if (selectedAgent) {
    const successRate =
      tasks.length > 0
        ? Math.round((tasks.filter((t) => t.status === 'completed').length / tasks.length) * 100)
        : null;
    const isWatcherAgent = isPersonalWatcherAgent(selectedAgent);
    const selectedAgentDescription = describeManagedAgent(selectedAgent);
    const selectedAgentGuidance = statusGuidance(selectedAgent);
    const selectedAgentNextSteps = recommendedNextSteps(selectedAgent);
    const selectedAgentUseCases = useCasesForAgent(selectedAgent);

      const DETAIL_TABS = [
        { id: 'interact', label: 'Chat', icon: MessageSquare },
        { id: 'overview', label: 'Overview', icon: Activity },
        { id: 'channels', label: 'Connected Apps', icon: Database },
        { id: 'messaging', label: 'Reach Me', icon: Wifi },
        { id: 'tasks', label: 'Runs', icon: ListTodo },
      { id: 'memory', label: 'Memory', icon: Brain },
      { id: 'learning', label: 'Improvements', icon: Settings },
      { id: 'logs', label: 'Timeline', icon: FileText },
    ] as const;

    return (
      <div className="flex-1 overflow-y-auto p-6">
        {/* Back button */}
        <button
          onClick={() => setSelectedAgentId(null)}
          className="flex items-center gap-1 mb-4 text-sm cursor-pointer"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <ChevronLeft size={16} /> Back to agents
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-6">
          <div className="flex items-start gap-3">
            <Bot size={24} style={{ color: 'var(--color-accent)' }} />
            <div>
              <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
                {selectedAgent.name}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={selectedAgent.status} />
                <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {humanizeAgentType(selectedAgent.agent_type)}
                </span>
              </div>
              <p className="text-sm mt-3 max-w-2xl" style={{ color: 'var(--color-text-secondary)' }}>
                {selectedAgentDescription}
              </p>
              <p className="text-xs mt-2 max-w-2xl" style={{ color: 'var(--color-text-tertiary)' }}>
                {selectedAgentGuidance}
              </p>
            </div>
          </div>
          {/* Header actions */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {detailTab === 'interact' ? (
              <span
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: '#22c55e20', color: '#22c55e', border: '1px solid #22c55e40' }}
              >
                <MessageSquare size={13} /> Chat ready — just type below
              </span>
            ) : (
                <button
                  onClick={() => handleRun(selectedAgent.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer font-medium"
                  style={{ background: 'var(--color-accent)', color: '#fff' }}
                >
                <Zap size={13} /> Run Agent
                </button>
            )}
            {(selectedAgent.status === 'running' || selectedAgent.status === 'idle') && (
              <button
                onClick={() => handlePause(selectedAgent.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer"
                style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
              >
                <Pause size={13} /> Pause
              </button>
            )}
            {selectedAgent.status === 'paused' && (
              <button
                onClick={() => handleResume(selectedAgent.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer"
                style={{ background: '#22c55e20', color: '#22c55e', border: '1px solid #22c55e40' }}
              >
                <Play size={13} /> Resume
              </button>
            )}
            {(selectedAgent.status === 'error' || selectedAgent.status === 'stalled' || selectedAgent.status === 'needs_attention') && (
              <button
                onClick={() => handleRecover(selectedAgent.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer"
                style={{ background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440' }}
              >
                <AlertTriangle size={13} /> Reset & Recover
              </button>
            )}
            <button
              onClick={async () => {
                if (window.confirm(`Delete ${selectedAgent.name}? This cannot be undone.`)) {
                  await deleteManagedAgent(selectedAgent.id);
                  setSelectedAgentId(null);
                  await refresh();
                }
              }}
              className="p-1.5 rounded-lg cursor-pointer transition-colors"
              style={{ color: '#ef4444', background: '#ef444415' }}
              title="Delete agent"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 rounded-lg overflow-x-auto" style={{ background: 'var(--color-bg-secondary)' }}>
          {DETAIL_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setDetailTab(id)}
              className="px-3 py-2 rounded-md text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
              style={{
                background: detailTab === id ? 'var(--color-bg)' : 'transparent',
                color: detailTab === id ? 'var(--color-text)' : 'var(--color-text-secondary)',
                fontWeight: detailTab === id ? 500 : 400,
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab: Overview */}
        {detailTab === 'overview' && (
          <div className="space-y-3">
            {/* Instruction */}
            <AgentInstructionSection agent={selectedAgent} onAgentUpdated={refresh} />

            {/* Configuration */}
            <div
              className="p-3 rounded-lg"
              style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
            >
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text)' }}>
                Configuration
              </h3>
              <p className="text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                These are the main operating settings for this agent. You usually only need to change them after you have seen a real run.
              </p>
              <AgentConfigGrid agent={selectedAgent} onAgentUpdated={refresh} />
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                <span className="text-xs font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
                  ID: {selectedAgent.id}
                </span>
              </div>
            </div>

            {/* Hint for deep research agents */}
            {selectedAgent.agent_type === 'deep_research' && (
              <div
                className="flex items-start gap-3 p-3 rounded-lg text-sm"
                style={{
                  background: 'var(--color-accent-subtle)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <Database size={16} style={{ color: 'var(--color-accent)', flexShrink: 0, marginTop: 2 }} />
                <div style={{ color: 'var(--color-text-secondary)' }}>
                  <strong>Tip:</strong> Connect your personal data in the{' '}
                  <button
                    onClick={() => setDetailTab('channels')}
                    className="cursor-pointer underline"
                    style={{ color: 'var(--color-accent)', background: 'none', border: 'none', padding: 0, font: 'inherit' }}
                  >Connected Apps</button>{' '}
                  tab, then set up{' '}
                  <button
                    onClick={() => setDetailTab('messaging')}
                    className="cursor-pointer underline"
                    style={{ color: 'var(--color-accent)', background: 'none', border: 'none', padding: 0, font: 'inherit' }}
                  >Reach Me</button>{' '}
                    to talk to this agent from your phone.
                </div>
              </div>
            )}

            <div
              className="p-4 rounded-lg"
              style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
                Good First Tasks
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {selectedAgentUseCases.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setDetailTab('interact')}
                    className="rounded-lg px-3 py-2 text-left text-sm leading-5 transition-colors"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* Usage stats + savings — single compact row */}
            {(() => {
              const inTok = selectedAgent.input_tokens ?? 0;
              const outTok = selectedAgent.output_tokens ?? 0;
              const modelName = (selectedAgent.config?.model as string) || '';
              const paramMatch = modelName.match(/:(\d+(?:\.\d+)?)b/i);
              const paramsB = paramMatch ? parseFloat(paramMatch[1]) : 9;
              const flops = 2 * paramsB * 1e9 * (inTok + outTok);
              const providers = [
                { label: 'GPT-5.3', inPer1M: 2.0, outPer1M: 10.0 },
                { label: 'Claude Opus 4.6', inPer1M: 5.0, outPer1M: 25.0 },
                { label: 'Gemini 3.1 Pro', inPer1M: 2.0, outPer1M: 12.0 },
              ];
              const energyWh = (inTok + outTok) / 1000 * 0.4;
              const energyKj = energyWh * 3.6;
              const fmtFlops = flops >= 1e15 ? `${(flops / 1e15).toFixed(1)} PFLOPs` : `${(flops / 1e12).toFixed(1)} TFLOPs`;
              const hasSavings = inTok + outTok > 0;
              const sectionTitle = { fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 8 };
              return (
                <div className="p-4 rounded-xl" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                  <div className="flex gap-0 flex-wrap items-stretch">
                    {/* Agent Statistics */}
                    <div className="pr-5">
                      <p style={sectionTitle}>Agent Statistics</p>
                      <div className="flex gap-5">
                        <div>
                          <p className="text-xl font-bold leading-none" style={{ color: 'var(--color-text)' }}>{selectedAgent.total_runs ?? 0}</p>
                          <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>Total Queries</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold leading-none" style={{ color: 'var(--color-text)' }}>{inTok.toLocaleString()}</p>
                          <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>Input Tokens</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold leading-none" style={{ color: 'var(--color-text)' }}>{outTok.toLocaleString()}</p>
                          <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>Output Tokens</p>
                        </div>
                      </div>
                    </div>
                    {hasSavings && (<>
                      <div style={{ width: 1, background: 'var(--color-border)' }} />
                      {/* Local Utilization */}
                      <div className="px-5">
                        <p style={sectionTitle}>Local Utilization</p>
                        <div className="flex gap-5">
                          <div>
                            <p className="text-xl font-bold leading-none" style={{ color: '#22c55e' }}>{fmtFlops}</p>
                            <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>Compute</p>
                          </div>
                          <div>
                            <p className="text-xl font-bold leading-none" style={{ color: '#22c55e' }}>{energyKj.toFixed(2)} kJ</p>
                            <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>Energy</p>
                          </div>
                        </div>
                      </div>
                      <div style={{ width: 1, background: 'var(--color-border)' }} />
                      {/* Dollars Saved */}
                      <div className="pl-5">
                        <p style={sectionTitle}>Dollars Saved vs.</p>
                        <div className="flex gap-5">
                          {providers.map((p) => {
                            const cost = (inTok / 1e6) * p.inPer1M + (outTok / 1e6) * p.outPer1M;
                            return (
                              <div key={p.label}>
                                <p className="text-xl font-bold leading-none" style={{ color: '#22c55e' }}>${cost.toFixed(4)}</p>
                                <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>{p.label}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>)}
                  </div>
                </div>);
            })()}

            {isWatcherAgent && (
              <div
                className="p-4 rounded-lg"
                style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
                  Watcher Setup Path
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div
                    className="rounded-lg p-3"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                      1. Connect inbox
                    </div>
                    <div className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                      Start with personal email so this watcher can actually see meeting changes and action-needed messages.
                    </div>
                    <button
                      onClick={() => setDetailTab('channels')}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                    >
                      <Database size={14} /> Connected Apps
                    </button>
                  </div>
                  <div
                    className="rounded-lg p-3"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                      2. Choose how JARVIS reaches you
                    </div>
                    <div className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                      Pick one route you already check often. One good route is better than three noisy ones.
                    </div>
                    <button
                      onClick={() => setDetailTab('messaging')}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                    >
                      <Wifi size={14} /> Reach Me
                    </button>
                  </div>
                  <div
                    className="rounded-lg p-3"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                      3. Run one calm test
                    </div>
                    <div className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                      Keep it manual first so you can see whether the watcher is useful before it becomes part of your daily routine.
                    </div>
                    <button
                      onClick={() => handleRun(selectedAgent.id)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                      style={{ background: 'var(--color-accent)', color: '#fff' }}
                    >
                      <Zap size={14} /> Run Agent
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div
              className="p-4 rounded-lg"
              style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                    Next best move
                  </h3>
                  <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                    Start with a chat or one run. If you want more context, connect {recommendedConnectorsForAgent(selectedAgent).slice(0, 3).map((source) => source.display_name).join(', ')} next.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setDetailTab('interact')}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                  >
                    <MessageSquare size={14} /> Chat
                  </button>
                  <button
                    onClick={() => handleRun(selectedAgent.id)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                    style={{ background: 'var(--color-accent)', color: '#fff' }}
                  >
                    <Zap size={14} /> Run Agent
                  </button>
                  <button
                    onClick={() => setDetailTab('channels')}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                  >
                    <Database size={14} /> Connected Apps
                  </button>
                </div>
              </div>
            </div>

            {/* Channels summary */}
            {channels.length > 0 && (
              <div
                className="p-4 rounded-lg"
                style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
              >
                  <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                    Reach Me
                  </h3>
                {channels.map((b) => (
                  <div key={b.id} className="text-sm py-1" style={{ color: 'var(--color-text)' }}>
                    {b.channel_type}: {b.routing_mode}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Interact */}
        {detailTab === 'interact' && (
          <InteractTab
            agentId={selectedAgent.id}
            agentStatus={selectedAgent.status}
            agentName={selectedAgent.name}
          />
        )}

        {/* Tab: Channels */}
        {detailTab === 'channels' && (
          <ChannelsTab agentId={selectedAgent.id} agent={selectedAgent} />
        )}

        {/* Tab: Messaging */}
        {detailTab === 'messaging' && (
          <MessagingTab agentId={selectedAgent.id} agent={selectedAgent} />
        )}

        {/* Tab: Tasks */}
        {detailTab === 'tasks' && (
          <div className="space-y-2">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="p-3 rounded-lg"
                style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
              >
                <div className="flex justify-between items-start gap-3">
                  <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                    {t.description}
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                    style={{
                      background: statusColor(t.status) + '20',
                      color: statusColor(t.status),
                    }}
                  >
                    {t.status}
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
                    onClick={() => handleRun(selectedAgent.id)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                    style={{ background: 'var(--color-accent)', color: '#fff' }}
                  >
                    <Zap size={14} /> Run Agent
                  </button>
                  <button
                    onClick={() => setDetailTab('interact')}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                  >
                    <MessageSquare size={14} /> Chat First
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Memory */}
        {detailTab === 'memory' && (
          <div
            className="p-4 rounded-lg"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
          >
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
              <Brain size={14} /> Summary Memory
            </h3>
            <p className="whitespace-pre-wrap text-sm" style={{ color: 'var(--color-text)' }}>
              {selectedAgent.summary_memory || 'No stored memory yet. Once the agent runs, JARVIS will keep a compact summary here.'}
            </p>
          </div>
        )}

        {/* Tab: Learning */}
        {detailTab === 'learning' && (
          <LearningTab agentId={selectedAgent.id} learningEnabled={!!selectedAgent.learning_enabled} />
        )}

        {/* Tab: Logs */}
        {detailTab === 'logs' && (
          <LogsTab agentId={selectedAgent.id} />
        )}
      </div>
    );
  }

  // ── List View ───────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Launch wizard modal */}
      {showWizard && (
        <LaunchWizard
          templates={templates}
          initialTemplateId={pendingTemplateId}
          onClose={() => {
            setShowWizard(false);
            setPendingTemplateId(null);
          }}
          onLaunched={(agent) => {
            setLaunchSuccess({
              id: agent.id,
              name: agent.name,
              watcher: isPersonalWatcherAgent(agent) || pendingTemplateId === PERSONAL_WATCHER_TEMPLATE.id,
            });
            setShowWizard(false);
            setPendingTemplateId(null);
            refresh();
          }}
        />
      )}

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
            Agents
          </h1>
          <div className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Create focused specialists that plan, execute, triage, or prepare work for you.
          </div>
        </div>

        <button
          onClick={() => {
            if (!agentManagerAvailable) return;
            setPendingTemplateId(null);
            setShowWizard(true);
          }}
          disabled={agentManagerAvailable === false}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: agentManagerAvailable === false ? 'var(--color-bg-tertiary)' : 'var(--color-accent)',
            color: agentManagerAvailable === false ? 'var(--color-text-tertiary)' : '#fff',
          }}
        >
            <Plus size={15} /> New Specialist
        </button>
      </div>

      <div
        className="mb-4 grid gap-3 md:grid-cols-3"
      >
        <div
          className="rounded-xl px-4 py-3"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            Best First Move
          </div>
          <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Start with one useful specialist, run it once, and only add more setup when the role already feels helpful.
          </div>
        </div>
        <div
          className="rounded-xl px-4 py-3"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            Keep It Focused
          </div>
          <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Specialists work best when they have one clear job instead of trying to handle every workflow at once.
          </div>
        </div>
        <div
          className="rounded-xl px-4 py-3"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            Why It Helps
          </div>
          <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            A good specialist reduces noise by handling one kind of planning, triage, research, or preparation for you.
          </div>
        </div>
      </div>

      <div
        className="mb-6 rounded-xl px-4 py-3"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {AGENTS_LIST_DESCRIPTION}
          </div>
          <div className="text-xs md:text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            {visibleAgents.length > 0 ? AGENTS_LIST_GUIDANCE_ACTIVE : AGENTS_LIST_GUIDANCE_EMPTY}
          </div>
        </div>
      </div>

      {launchSuccess && (
        <div
          className="mb-6 rounded-xl p-4"
          style={{
            background: 'linear-gradient(135deg, rgba(34,197,94,0.14), rgba(15,23,42,0.18))',
            border: '1px solid rgba(34,197,94,0.28)',
          }}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] mb-2" style={{ color: '#4ade80' }}>
                Agent Ready
              </div>
              <div className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                {launchSuccess.name} was created successfully
              </div>
              <div className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                {launchSuccess.watcher
                  ? 'Best next step: connect your inbox, choose one notification route, then run one calm test before automating anything.'
                  : 'Best next step: open it once, then chat with it or run it before adding more setup.'}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setSelectedAgentId(launchSuccess.id);
                  setDetailTab('overview');
                }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                style={{ background: 'var(--color-accent)', color: '#fff' }}
              >
                <Activity size={14} /> Open Agent
              </button>
              {launchSuccess.watcher ? (
                <>
                  <button
                    onClick={() => {
                      setSelectedAgentId(launchSuccess.id);
                      setDetailTab('channels');
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                    style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                  >
                    <Database size={14} /> Connect Inbox
                  </button>
                  <button
                    onClick={() => {
                      setSelectedAgentId(launchSuccess.id);
                      setDetailTab('messaging');
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                    style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                  >
                    <Wifi size={14} /> Reach Me
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setSelectedAgentId(launchSuccess.id);
                    setDetailTab('interact');
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                  style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                >
                  <MessageSquare size={14} /> Chat With Agent
                </button>
              )}
              <button
                onClick={() => setLaunchSuccess(null)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
                style={{ background: 'transparent', color: 'var(--color-text-tertiary)' }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {agentManagerAvailable === false && (
        <div
          className="mx-4 mt-2 px-4 py-3 rounded-lg flex items-center gap-3 text-sm"
          style={{
            background: 'var(--color-accent-amber-subtle)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            color: 'var(--color-accent-amber)',
          }}
        >
          <AlertTriangle size={16} />
          <span>Agent manager is not enabled. Set <code className="font-mono text-xs">agent_manager.enabled = true</code> in your config.</span>
        </div>
      )}

      {/* Agent cards grid */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {visibleAgents.map((a) => (
          <AgentCard
            key={a.id}
            agent={a}
            onClick={() => {
              setSelectedAgentId(a.id);
              setDetailTab('overview');
            }}
            onPause={handlePause}
            onResume={handleResume}
            onRun={handleRun}
            onRecover={handleRecover}
            onDelete={handleDelete}
            onChat={(id) => {
              setSelectedAgentId(id);
              setDetailTab('interact');
            }}
            onEdit={(id) => {
              setSelectedAgentId(id);
              setDetailTab('overview');
            }}
          />
        ))}
      </div>

      {visibleAgents.length === 0 && (
        <div className="py-12" style={{ color: 'var(--color-text-tertiary)' }}>
          <div
            className="mx-auto max-w-5xl rounded-2xl p-6"
            style={{
              background: 'linear-gradient(135deg, rgba(15,23,42,0.94), rgba(76,29,149,0.16))',
              border: '1px solid var(--color-border)',
            }}
          >
              <div className="text-center mb-8">
                <Bot size={48} className="mx-auto mb-4 opacity-30" />
                <p className="mb-2 font-medium text-lg" style={{ color: 'var(--color-text)' }}>
                  Choose your first specialist
                </p>
                <p className="text-sm max-w-2xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
                  Start with one focused role below. You do not need to configure everything perfectly up front. The best first step is to launch one useful specialist and see how it helps.
                </p>
                <div className="mt-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  Best first path for personal email and meeting alerts: <span style={{ color: 'var(--color-text)' }}>JARVIS Personal Watcher</span>
                </div>
              </div>

            {recommendedStarterTemplates.length > 0 ? (
              <>
                <div className="text-xs font-semibold uppercase tracking-[0.28em] mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
                  Recommended Starters
                </div>
                <div className="mx-auto mb-6 grid gap-3 text-left" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                  {recommendedStarterTemplates.slice(0, 6).map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => {
                        if (!agentManagerAvailable) return;
                        setPendingTemplateId(tpl.id);
                        setShowWizard(true);
                      }}
                      disabled={agentManagerAvailable === false}
                      className="rounded-lg p-4 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
                    >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{tpl.name}</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.14)', color: '#4ade80' }}>
                      Recommended
                    </span>
                  </div>
                      <div className="mt-2 text-[10px] uppercase tracking-[0.2em]" style={{ color: 'var(--color-accent)' }}>
                        {templateBestForLabel(tpl)}
                      </div>
                      <div className="mt-2 text-xs leading-5" style={{ color: 'var(--color-text-secondary)' }}>
                        {setupHeadlineForTemplate(tpl)}
                      </div>
                      <div className="mt-3 text-[10px] uppercase tracking-[0.22em]" style={{ color: 'var(--color-accent)' }}>
                        Set Up Agent
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => {
                    if (!agentManagerAvailable) return;
                    setPendingTemplateId(PERSONAL_WATCHER_TEMPLATE.id);
                    setShowWizard(true);
                  }}
                disabled={agentManagerAvailable === false}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: agentManagerAvailable === false ? 'var(--color-bg-tertiary)' : 'var(--color-accent)',
                  color: agentManagerAvailable === false ? 'var(--color-text-tertiary)' : '#fff',
                }}
              >
                  <Plus size={15} /> Set Up Personal Watcher
                </button>
              <button
                onClick={() => {
                  if (!agentManagerAvailable) return;
                  setPendingTemplateId(null);
                  setShowWizard(true);
                }}
                disabled={agentManagerAvailable === false}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  color: agentManagerAvailable === false ? 'var(--color-text-tertiary)' : 'var(--color-text)',
                }}
              >
                  <Plus size={15} /> See More Specialists
              </button>
            </div>
          </div>




        </div>
      )}
    </div>
  );
}






