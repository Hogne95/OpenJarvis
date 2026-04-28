import { Database, MessageSquare, Wifi, Zap } from 'lucide-react';
import type { ChannelBinding, ManagedAgent } from '../../lib/api';
import { recommendedConnectorsForAgent } from '../../lib/agentPresentation';
import { AgentConfigGrid, AgentInstructionSection } from './AgentConfigPanel';

type DetailTab = 'overview' | 'interact' | 'channels' | 'messaging' | 'tasks' | 'memory' | 'learning' | 'logs';

export function OverviewTab({
  agent,
  channels,
  isWatcherAgent,
  useCases,
  onTabChange,
  onRun,
  onAgentUpdated,
}: {
  agent: ManagedAgent;
  channels: ChannelBinding[];
  isWatcherAgent: boolean;
  useCases: string[];
  onTabChange: (tab: DetailTab) => void;
  onRun: (id: string) => void;
  onAgentUpdated: () => void;
}) {
  return (
    <div className="space-y-3">
      <AgentInstructionSection agent={agent} onAgentUpdated={onAgentUpdated} />

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
        <AgentConfigGrid agent={agent} onAgentUpdated={onAgentUpdated} />
        <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
          <span className="text-xs font-mono" style={{ color: 'var(--color-text-tertiary)' }}>
            ID: {agent.id}
          </span>
        </div>
      </div>

      {agent.agent_type === 'deep_research' && (
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
              onClick={() => onTabChange('channels')}
              className="cursor-pointer underline"
              style={{ color: 'var(--color-accent)', background: 'none', border: 'none', padding: 0, font: 'inherit' }}
            >Connected Apps</button>{' '}
            tab, then set up{' '}
            <button
              onClick={() => onTabChange('messaging')}
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
          {useCases.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onTabChange('interact')}
              className="rounded-lg px-3 py-2 text-left text-sm leading-5 transition-colors"
              style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <AgentUsageStats agent={agent} />

      {isWatcherAgent && (
        <div
          className="p-4 rounded-lg"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
            Watcher Setup Path
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <WatcherStep
              title="1. Connect inbox"
              body="Start with personal email so this watcher can actually see meeting changes and action-needed messages."
              action="Connected Apps"
              icon={<Database size={14} />}
              onClick={() => onTabChange('channels')}
            />
            <WatcherStep
              title="2. Choose how JARVIS reaches you"
              body="Pick one route you already check often. One good route is better than three noisy ones."
              action="Reach Me"
              icon={<Wifi size={14} />}
              onClick={() => onTabChange('messaging')}
            />
            <WatcherStep
              title="3. Run one calm test"
              body="Keep it manual first so you can see whether the watcher is useful before it becomes part of your daily routine."
              action="Run Agent"
              icon={<Zap size={14} />}
              onClick={() => onRun(agent.id)}
              primary
            />
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
              Start with a chat or one run. If you want more context, connect {recommendedConnectorsForAgent(agent).slice(0, 3).map((source) => source.display_name).join(', ')} next.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <OverviewAction icon={<MessageSquare size={14} />} label="Chat" onClick={() => onTabChange('interact')} />
            <OverviewAction icon={<Zap size={14} />} label="Run Agent" onClick={() => onRun(agent.id)} primary />
            <OverviewAction icon={<Database size={14} />} label="Connected Apps" onClick={() => onTabChange('channels')} />
          </div>
        </div>
      </div>

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
  );
}

function WatcherStep({
  title,
  body,
  action,
  icon,
  onClick,
  primary,
}: {
  title: string;
  body: string;
  action: string;
  icon: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
      <div className="text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
        {title}
      </div>
      <div className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
        {body}
      </div>
      <button
        onClick={onClick}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
        style={primary ? { background: 'var(--color-accent)', color: '#fff' } : { background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
      >
        {icon} {action}
      </button>
    </div>
  );
}

function OverviewAction({
  icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer"
      style={primary ? { background: 'var(--color-accent)', color: '#fff' } : { background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
    >
      {icon} {label}
    </button>
  );
}

function AgentUsageStats({ agent }: { agent: ManagedAgent }) {
  const inTok = agent.input_tokens ?? 0;
  const outTok = agent.output_tokens ?? 0;
  const modelName = (agent.config?.model as string) || '';
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
        <div className="pr-5">
          <p style={sectionTitle}>Agent Statistics</p>
          <div className="flex gap-5">
            <Stat value={agent.total_runs ?? 0} label="Total Queries" />
            <Stat value={inTok.toLocaleString()} label="Input Tokens" />
            <Stat value={outTok.toLocaleString()} label="Output Tokens" />
          </div>
        </div>
        {hasSavings && (
          <>
            <div style={{ width: 1, background: 'var(--color-border)' }} />
            <div className="px-5">
              <p style={sectionTitle}>Local Utilization</p>
              <div className="flex gap-5">
                <Stat value={fmtFlops} label="Compute" green />
                <Stat value={`${energyKj.toFixed(2)} kJ`} label="Energy" green />
              </div>
            </div>
            <div style={{ width: 1, background: 'var(--color-border)' }} />
            <div className="pl-5">
              <p style={sectionTitle}>Dollars Saved vs.</p>
              <div className="flex gap-5">
                {providers.map((p) => {
                  const cost = (inTok / 1e6) * p.inPer1M + (outTok / 1e6) * p.outPer1M;
                  return <Stat key={p.label} value={`$${cost.toFixed(4)}`} label={p.label} green />;
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ value, label, green }: { value: string | number; label: string; green?: boolean }) {
  return (
    <div>
      <p className="text-xl font-bold leading-none" style={{ color: green ? '#22c55e' : 'var(--color-text)' }}>{value}</p>
      <p className="text-xs mt-1" style={{ color: 'var(--color-text-tertiary)' }}>{label}</p>
    </div>
  );
}
