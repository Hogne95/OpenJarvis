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
  AlertTriangle,
  Activity,
  MessageSquare,
  Settings,
  FileText,
  Wifi,
  Database,
} from 'lucide-react';
import {
  AGENTS_LIST_DESCRIPTION,
  AGENTS_LIST_GUIDANCE_ACTIVE,
  AGENTS_LIST_GUIDANCE_EMPTY,
  PERSONAL_WATCHER_TEMPLATE,
  dedupeTemplatesList,
  dedupeVisibleAgents,
  describeManagedAgent,
  humanizeAgentType,
  isPersonalWatcherAgent,
  isRecommendedTemplate,
  normalizeAgentName,
  setupHeadlineForTemplate,
  statusGuidance,
  templateBestForLabel,
  useCasesForAgent,
} from '../lib/agentPresentation';
import { AgentCard } from '../components/Agents/AgentCard';
import { ChannelsTab } from '../components/Agents/ChannelsTab';
import { InteractTab } from '../components/Agents/InteractTab';
import { LaunchWizard } from '../components/Agents/LaunchWizard';
import { LearningTab } from '../components/Agents/LearningTab';
import { LogsTab } from '../components/Agents/LogsTab';
import { MemoryTab } from '../components/Agents/MemoryTab';
import { MessagingTab } from '../components/Agents/MessagingTab';
import { OverviewTab } from '../components/Agents/OverviewTab';
import { TasksTab } from '../components/Agents/TasksTab';

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
    const isWatcherAgent = isPersonalWatcherAgent(selectedAgent);
    const selectedAgentDescription = describeManagedAgent(selectedAgent);
    const selectedAgentGuidance = statusGuidance(selectedAgent);
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
          <OverviewTab
            agent={selectedAgent}
            channels={channels}
            isWatcherAgent={isWatcherAgent}
            useCases={selectedAgentUseCases}
            onTabChange={setDetailTab}
            onRun={handleRun}
            onAgentUpdated={refresh}
          />
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
          <TasksTab
            tasks={tasks}
            agentId={selectedAgent.id}
            onRun={handleRun}
            onTabChange={setDetailTab}
          />
        )}

        {/* Tab: Memory */}
        {detailTab === 'memory' && (
          <MemoryTab summaryMemory={selectedAgent.summary_memory} />
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






