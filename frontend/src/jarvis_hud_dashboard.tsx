import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  AudioLines,
  Brain,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Folder,
  Globe,
  Logs,
  Mic,
  Radio,
  ScanSearch,
  Shield,
  Sparkles,
  Terminal,
  Waves,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { checkHealth, fetchManagedAgents, fetchSpeechHealth } from './lib/api';
import { useAppStore } from './lib/store';
import type { ChatMessage, ToolCallInfo } from './types';
import { InputArea } from './components/Chat/InputArea';

type Status = 'Standby' | 'Listening' | 'Analyzing' | 'Responding';

function Panel({
  title,
  kicker,
  children,
  className = '',
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`jarvis-panel rounded-[1.75rem] p-4 md:p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          {kicker ? (
            <div className="mb-1 text-[10px] uppercase tracking-[0.42em] text-cyan-300/65">
              {kicker}
            </div>
          ) : null}
          <div className="text-sm uppercase tracking-[0.28em] text-cyan-50/90">{title}</div>
        </div>
        <div className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.9)]" />
      </div>
      {children}
    </div>
  );
}

function Equalizer({ bars }: { bars: number[] }) {
  return (
    <div className="flex h-20 items-end gap-2">
      {bars.map((bar, index) => (
        <span
          key={`${bar}-${index}`}
          className="jarvis-bar w-2 rounded-full bg-gradient-to-t from-cyan-500 via-sky-300 to-white/90"
          style={{
            height: `${bar}%`,
            animationDelay: `${index * 120}ms`,
          }}
        />
      ))}
    </div>
  );
}

function formatCurrency(value: number | undefined) {
  const safe = value ?? 0;
  if (safe >= 100) return `$${safe.toFixed(0)}`;
  if (safe >= 1) return `$${safe.toFixed(2)}`;
  return `$${safe.toFixed(3)}`;
}

function formatElapsed(ms: number) {
  if (!ms) return '0.0s';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function compactText(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed || fallback;
}

function latestMessageByRole(messages: ChatMessage[], role: 'user' | 'assistant') {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === role) return messages[index];
  }
  return null;
}

function summarizeToolCall(toolCall: ToolCallInfo | null) {
  if (!toolCall) return 'No active tool calls.';
  const args = toolCall.arguments?.trim();
  if (!args) return `${toolCall.tool} requested.`;
  const compactArgs = args.length > 120 ? `${args.slice(0, 117)}...` : args;
  return `${toolCall.tool}(${compactArgs})`;
}

export default function JarvisHudDashboard() {
  const navigate = useNavigate();
  const messages = useAppStore((s) => s.messages);
  const streamState = useAppStore((s) => s.streamState);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const savings = useAppStore((s) => s.savings);
  const settings = useAppStore((s) => s.settings);
  const conversations = useAppStore((s) => s.conversations);
  const logEntries = useAppStore((s) => s.logEntries);
  const managedAgents = useAppStore((s) => s.managedAgents);

  const [apiReachable, setApiReachable] = useState<boolean | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState<boolean | null>(null);
  const [runningAgentCount, setRunningAgentCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const refreshLiveStatus = async () => {
      const [health, speech, agents] = await Promise.allSettled([
        checkHealth(),
        fetchSpeechHealth(),
        fetchManagedAgents(),
      ]);

      if (cancelled) return;

      setApiReachable(health.status === 'fulfilled' ? health.value : false);
      setSpeechAvailable(
        speech.status === 'fulfilled' ? speech.value.available : false,
      );
      setRunningAgentCount(
        agents.status === 'fulfilled'
          ? agents.value.filter((agent) => agent.status === 'running').length
          : managedAgents.filter((agent) => agent.status === 'running').length,
      );
    };

    refreshLiveStatus();
    const interval = window.setInterval(refreshLiveStatus, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [managedAgents]);

  const latestUserMessage = useMemo(() => latestMessageByRole(messages, 'user'), [messages]);
  const latestAssistantMessage = useMemo(
    () => latestMessageByRole(messages, 'assistant'),
    [messages],
  );
  const latestLogEntries = useMemo(() => [...logEntries].slice(-4).reverse(), [logEntries]);
  const activeToolCall = streamState.activeToolCalls.at(-1) ?? null;

  const status: Status = useMemo(() => {
    if (streamState.isStreaming && streamState.content.trim()) return 'Responding';
    if (streamState.isStreaming || streamState.activeToolCalls.length > 0) return 'Analyzing';
    if (settings.speechEnabled && speechAvailable) return 'Listening';
    return 'Standby';
  }, [settings.speechEnabled, speechAvailable, streamState]);

  const statusMeta = useMemo(() => {
    switch (status) {
      case 'Listening':
        return {
          accent: 'text-emerald-300',
          label: 'Voice capture armed',
          transcript: compactText(
            latestUserMessage?.content || '',
            "Microphone ready. Say 'Hey Jarvis' or use the chat input below.",
          ),
          reply: compactText(
            latestAssistantMessage?.content || '',
            'Speech backend is available and the HUD is waiting for your next command.',
          ),
          bars: [42, 60, 80, 66, 90, 72, 56, 40],
        };
      case 'Analyzing':
        return {
          accent: 'text-amber-300',
          label: streamState.phase || 'Tool / inference activity detected',
          transcript: compactText(
            latestUserMessage?.content || '',
            'Intent received. Preparing model inference and tool routing.',
          ),
          reply: compactText(
            summarizeToolCall(activeToolCall),
            'Inference pipeline engaged.',
          ),
          bars: [32, 38, 54, 62, 58, 48, 34, 22],
        };
      case 'Responding':
        return {
          accent: 'text-sky-300',
          label: streamState.phase || 'Streaming response',
          transcript: compactText(
            latestUserMessage?.content || '',
            'Active request in progress.',
          ),
          reply: compactText(
            streamState.content || latestAssistantMessage?.content || '',
            'Rendering assistant response...',
          ),
          bars: [46, 62, 78, 70, 84, 76, 58, 44],
        };
      default:
        return {
          accent: 'text-cyan-200',
          label: 'System idle',
          transcript: compactText(
            latestUserMessage?.content || '',
            'No active request. Use voice or chat to begin.',
          ),
          reply: compactText(
            latestAssistantMessage?.content || '',
            'All systems nominal. Standing by.',
          ),
          bars: [18, 24, 20, 26, 16, 22, 18, 14],
        };
    }
  }, [activeToolCall, latestAssistantMessage, latestUserMessage, status, streamState.content, streamState.phase]);

  const toolSummary = summarizeToolCall(activeToolCall);
  const totalToolCalls = messages.reduce(
    (sum, message) => sum + (message.toolCalls?.length ?? 0),
    0,
  );
  const tokenRate = latestAssistantMessage?.telemetry?.tokens_per_sec;
  const lastLatency = latestAssistantMessage?.telemetry?.total_ms ?? streamState.elapsedMs;
  const totalSavings = savings?.per_provider.reduce((sum, provider) => sum + provider.total_cost, 0) ?? 0;

  const reactorMetrics = useMemo(
    () => [
      { label: 'API Link', value: apiReachable ? 'Online' : apiReachable === false ? 'Offline' : 'Checking' },
      { label: 'Speech Core', value: speechAvailable ? 'Ready' : speechAvailable === false ? 'Offline' : 'Checking' },
      { label: 'Response Latency', value: formatElapsed(lastLatency) },
      { label: 'Pending Actions', value: streamState.activeToolCalls.length.toString().padStart(2, '0') },
    ],
    [apiReachable, speechAvailable, lastLatency, streamState.activeToolCalls.length],
  );

  const subsystems = [
    { icon: Cpu, label: 'Local Core', value: apiReachable ? 'Nominal' : apiReachable === false ? 'Offline' : 'Check' },
    { icon: Brain, label: 'Reasoner', value: serverInfo?.engine || 'Unknown' },
    { icon: Waves, label: 'Voice Loop', value: settings.speechEnabled ? (speechAvailable ? 'Armed' : 'Needs STT') : 'Disabled' },
    { icon: Shield, label: 'Approval Gate', value: streamState.activeToolCalls.length > 0 ? 'Engaged' : 'Ready' },
  ];

  const tools = [
    { icon: Globe, label: 'Web Intel', sublabel: totalToolCalls > 0 ? `${totalToolCalls} calls seen` : 'Awaiting use' },
    { icon: Folder, label: 'Files', sublabel: `${conversations.length} chats indexed` },
    { icon: Terminal, label: 'Shell', sublabel: activeToolCall ? 'Tool path active' : 'On standby' },
    { icon: Sparkles, label: 'Memory', sublabel: latestAssistantMessage ? 'Session context live' : 'No response yet' },
  ];

  const quickActions = [
    { icon: Radio, label: 'Chat', sublabel: 'Open full conversation view', action: () => navigate('/chat') },
    { icon: Terminal, label: 'Logs', sublabel: 'Inspect runtime events', action: () => navigate('/logs') },
    { icon: Brain, label: 'Agents', sublabel: 'Managed automation control', action: () => navigate('/agents') },
    { icon: Shield, label: 'Settings', sublabel: 'Voice, model, API config', action: () => navigate('/settings') },
  ];

  const missionFeed = [
    `Model selected: ${selectedModel || serverInfo?.model || 'No model selected'}`,
    `Server engine: ${serverInfo?.engine || 'Unavailable'}`,
    `Speech input: ${settings.speechEnabled ? 'Enabled' : 'Disabled'}${speechAvailable === false ? ' (backend missing)' : ''}`,
    `Estimated cloud savings: ${formatCurrency(totalSavings)}`,
  ];

  const timelineItems = latestLogEntries.length
    ? latestLogEntries.map((entry) => ({
        icon:
          entry.category === 'tool'
            ? Shield
            : entry.category === 'chat'
            ? Radio
            : entry.category === 'model'
            ? Brain
            : Activity,
        title: `${entry.category} ${entry.level}`,
        detail: entry.message,
      }))
    : [
        { icon: Radio, title: 'Session ready', detail: 'HUD is live and waiting for activity.' },
        { icon: Activity, title: 'Telemetry', detail: 'Live system binding initialized.' },
      ];

  const targetQueue = [
    latestUserMessage
      ? `Latest user request: ${latestUserMessage.content.slice(0, 88)}${latestUserMessage.content.length > 88 ? '...' : ''}`
      : 'No user request yet. Start with voice or type into chat.',
    activeToolCall
      ? `Current tool action: ${toolSummary}`
      : 'No active tool calls. Approval gate is standing by.',
    latestAssistantMessage
      ? `Latest assistant reply: ${latestAssistantMessage.content.slice(0, 88)}${latestAssistantMessage.content.length > 88 ? '...' : ''}`
      : 'No assistant reply captured yet.',
  ];

  const approvalLabel =
    activeToolCall
      ? `Tool running: ${activeToolCall.tool}`
      : streamState.isStreaming
      ? 'Inference active. No tool approval pending.'
      : 'No pending operator decision';

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#02050d] text-slate-100">
      <div className="jarvis-vignette pointer-events-none absolute inset-0" />
      <div className="jarvis-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="jarvis-scanlines pointer-events-none absolute inset-0 opacity-30" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_70%)]" />
      <div className="pointer-events-none absolute left-[-10%] top-[18%] h-[28rem] w-[28rem] rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-10rem] right-[-4rem] h-[24rem] w-[24rem] rounded-full bg-amber-400/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1700px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="jarvis-panel mb-4 rounded-[1.75rem] px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.5em] text-cyan-300/65">
                Mark XLII Command Interface
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <h1 className="hud-glow text-3xl font-semibold uppercase tracking-[0.22em] text-cyan-50 md:text-5xl">
                  J.A.R.V.I.S.
                </h1>
                <div className="pb-1 text-sm uppercase tracking-[0.35em] text-slate-300/70">
                  Autonomous Tactical Core
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['Voice', settings.speechEnabled ? 'Mic enabled' : 'Mic disabled'],
                ['Model', selectedModel || serverInfo?.model || 'Unassigned'],
                ['Agents', `${runningAgentCount} running`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[1.25rem] border border-cyan-400/15 bg-slate-950/45 px-4 py-3"
                >
                  <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-300/65">{label}</div>
                  <div className="mt-1 text-sm text-cyan-50/90">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-4 xl:grid-cols-[320px_minmax(680px,1fr)_360px]">
          <div className="space-y-4">
            <Panel title="Core Matrix" kicker="Subsystems">
              <div className="space-y-3">
                {subsystems.map(({ icon: Icon, label, value }, index) => (
                  <div
                    key={label}
                    className="jarvis-outline flex items-center justify-between rounded-[1.15rem] px-4 py-3"
                    style={{ animationDelay: `${index * 120}ms` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/8 p-2">
                        <Icon className="h-4 w-4 text-cyan-200" />
                      </div>
                      <div>
                        <div className="text-sm text-cyan-50/90">{label}</div>
                        <div className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/55">
                          Live status
                        </div>
                      </div>
                    </div>
                    <div className="text-xs uppercase tracking-[0.28em] text-emerald-300">{value}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Voice Signature" kicker="Live Input">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-3">
                  <AudioLines className="h-5 w-5 text-emerald-300" />
                </div>
                <div>
                  <div className={`text-sm uppercase tracking-[0.28em] ${statusMeta.accent}`}>{status}</div>
                  <div className="text-xs text-slate-300/65">{statusMeta.label}</div>
                </div>
              </div>
              <Equalizer bars={statusMeta.bars} />
              <div className="mt-4 rounded-[1.15rem] border border-cyan-400/12 bg-slate-950/55 p-4 text-sm leading-7 text-slate-200/80">
                {statusMeta.transcript}
              </div>
            </Panel>

            <Panel title="Mission Feed" kicker="Memory">
              <div className="space-y-3">
                {missionFeed.map((item, index) => (
                  <div
                    key={item}
                    className="flex gap-3 rounded-[1.15rem] border border-cyan-400/10 bg-cyan-400/[0.04] px-3 py-3"
                  >
                    <div className="mt-1 h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.85)]" />
                    <div className="text-sm text-slate-200/78">
                      <span className="mr-2 text-[10px] uppercase tracking-[0.3em] text-cyan-300/50">
                        {`0${index + 1}`}
                      </span>
                      {item}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Arc Reactor Interface" kicker="Command Core" className="overflow-hidden">
              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="relative flex min-h-[32rem] items-center justify-center overflow-hidden rounded-[1.5rem] border border-cyan-400/10 bg-[radial-gradient(circle_at_center,rgba(8,47,73,0.75),rgba(2,6,23,0.95)_62%)] p-6">
                  <div className="jarvis-float absolute inset-[12%] rounded-full border border-cyan-300/12" />
                  <div className="jarvis-spin-slow absolute inset-[16%] rounded-full border border-cyan-300/22" />
                  <div className="jarvis-spin-reverse absolute inset-[24%] rounded-full border border-dashed border-cyan-200/16" />
                  <div className="jarvis-spin-slow absolute inset-[31%] rounded-full border border-sky-300/15" />
                  <div className="absolute inset-[18%] rounded-full border border-cyan-300/10 shadow-[0_0_120px_rgba(34,211,238,0.12)]" />
                  <div className="jarvis-sweep absolute left-1/2 top-1/2 h-[1px] w-[42%] origin-left -translate-y-1/2 bg-gradient-to-r from-cyan-300/0 via-cyan-200 to-cyan-100 shadow-[0_0_18px_rgba(125,211,252,0.9)]" />

                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative flex h-40 w-40 items-center justify-center rounded-full border border-cyan-200/28 bg-cyan-300/10 shadow-[0_0_50px_rgba(34,211,238,0.16)]">
                      <div className="absolute inset-3 rounded-full border border-cyan-100/25" />
                      <div className="jarvis-pulse absolute inset-6 rounded-full border border-cyan-200/40" />
                      <Mic className="h-16 w-16 text-cyan-100 drop-shadow-[0_0_18px_rgba(125,211,252,0.7)]" />
                    </div>
                  </div>

                  <div className="absolute left-6 top-6 rounded-full border border-cyan-400/16 bg-slate-950/50 px-4 py-2 text-[11px] uppercase tracking-[0.34em] text-cyan-200/75">
                    Neural Focus
                  </div>
                  <div className="absolute bottom-6 left-6 right-6 grid gap-3 sm:grid-cols-2">
                    {reactorMetrics.map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-[1rem] border border-cyan-400/12 bg-slate-950/55 px-4 py-3"
                      >
                        <div className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/55">
                          {metric.label}
                        </div>
                        <div className="mt-1 text-lg text-cyan-50">{metric.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[1.4rem] border border-cyan-400/12 bg-slate-950/55 p-4">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.4em] text-cyan-300/60">
                      Assistant Response
                    </div>
                    <div className="hud-glow text-2xl uppercase tracking-[0.26em] text-cyan-50">
                      {status}
                    </div>
                    <div className={`mt-2 text-sm uppercase tracking-[0.24em] ${statusMeta.accent}`}>
                      {statusMeta.label}
                    </div>
                    <p className="mt-4 text-sm leading-7 text-slate-200/75">{statusMeta.reply}</p>
                  </div>

                  <div className="rounded-[1.4rem] border border-amber-300/12 bg-[linear-gradient(180deg,rgba(251,191,36,0.08),rgba(15,23,42,0.55))] p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="rounded-2xl border border-amber-300/20 bg-amber-300/8 p-2">
                        <ScanSearch className="h-5 w-5 text-amber-200" />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.36em] text-amber-200/70">
                          Current Objective
                        </div>
                        <div className="text-sm text-amber-50/90">
                          {activeToolCall ? activeToolCall.tool : 'Awaiting next task'}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[1rem] border border-amber-200/10 bg-black/20 p-4 text-sm leading-7 text-slate-100/78">
                      {toolSummary}
                    </div>
                  </div>
                </div>
              </div>
            </Panel>

            <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <Panel title="Command Deck" kicker="Direct Control">
                <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">
                    Live Command Input
                  </div>
                  <div className="text-sm leading-7 text-slate-200/78">
                    Use the built-in command bar and mic button here to talk to Jarvis directly from the HUD.
                  </div>
                </div>

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-black/20 py-2">
                  <InputArea />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {quickActions.map(({ icon: Icon, label, sublabel, action }) => (
                    <button
                      key={label}
                      onClick={action}
                      className="rounded-[1.1rem] border border-cyan-400/12 bg-slate-950/55 px-4 py-4 text-left transition hover:bg-cyan-400/[0.08]"
                    >
                      <Icon className="mb-3 h-5 w-5 text-cyan-200" />
                      <div className="text-sm uppercase tracking-[0.2em] text-cyan-50/92">{label}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                        {sublabel}
                      </div>
                    </button>
                  ))}
                </div>
              </Panel>

              <Panel title="Approval Gate" kicker="Human-in-the-loop">
                <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">
                    Proposed Action
                  </div>
                  <div className="text-sm leading-7 text-slate-200/78">{toolSummary}</div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.1rem] border border-emerald-400/30 bg-emerald-400/12 px-4 py-3 text-sm uppercase tracking-[0.24em] text-emerald-200">
                    <span className="flex items-center justify-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Ready
                    </span>
                  </div>
                  <div className="rounded-[1.1rem] border border-rose-400/30 bg-rose-400/12 px-4 py-3 text-sm uppercase tracking-[0.24em] text-rose-200">
                    <span className="flex items-center justify-center gap-2">
                      <XCircle className="h-4 w-4" />
                      Hold
                    </span>
                  </div>
                </div>

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/12 bg-cyan-400/[0.05] px-4 py-3 text-sm text-slate-100/80">
                  {approvalLabel}
                </div>
              </Panel>

              <Panel title="Tool Dock" kicker="Direct Access">
                <div className="grid grid-cols-2 gap-3">
                  {tools.map(({ icon: Icon, label, sublabel }) => (
                    <div
                      key={label}
                      className="rounded-[1.1rem] border border-cyan-400/12 bg-slate-950/55 px-4 py-4 text-left"
                    >
                      <Icon className="mb-3 h-5 w-5 text-cyan-200" />
                      <div className="text-sm uppercase tracking-[0.2em] text-cyan-50/92">{label}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                        {sublabel}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>

          <div className="space-y-4">
            <Panel title="Tactical Timeline" kicker="Event Stream">
              <div className="space-y-3">
                {timelineItems.map(({ icon: Icon, title, detail }) => (
                  <div
                    key={`${title}-${detail}`}
                    className="flex gap-3 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3"
                  >
                    <div className="rounded-xl border border-cyan-400/12 bg-cyan-400/[0.07] p-2">
                      <Icon className="h-4 w-4 text-cyan-200" />
                    </div>
                    <div>
                      <div className="text-sm uppercase tracking-[0.18em] text-cyan-50/92">{title}</div>
                      <div className="mt-1 text-sm leading-6 text-slate-200/72">{detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Console Mirror" kicker="Runtime">
              <div className="rounded-[1.15rem] border border-cyan-400/10 bg-black/30 p-4 font-mono text-xs leading-6 text-cyan-100/82">
                {latestLogEntries.length > 0 ? (
                  latestLogEntries.map((entry) => (
                    <div key={`${entry.timestamp}-${entry.message}`} className="border-b border-cyan-400/8 py-2 last:border-b-0">
                      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-cyan-300/55">
                        <Logs className="h-3.5 w-3.5" />
                        <span>{entry.category}</span>
                        <span>{entry.level}</span>
                      </div>
                      <div>{entry.message}</div>
                    </div>
                  ))
                ) : (
                  <div>No runtime logs yet. Send a command to populate the console mirror.</div>
                )}
              </div>
            </Panel>

            <Panel title="Target Queue" kicker="Task Stack">
              <div className="space-y-3">
                {targetQueue.map((item, index) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-[1.15rem] border border-cyan-400/10 bg-cyan-400/[0.04] px-4 py-3"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/16 bg-slate-950/65 text-xs uppercase tracking-[0.25em] text-cyan-200">
                      {index + 1}
                    </div>
                    <div className="flex-1 text-sm leading-6 text-slate-200/78">{item}</div>
                    <ChevronRight className="h-4 w-4 text-cyan-300/55" />
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Operator Profile" kicker="Session">
              <div className="rounded-[1.35rem] border border-cyan-400/10 bg-[linear-gradient(180deg,rgba(34,211,238,0.10),rgba(2,6,23,0.48))] p-5">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-300/10">
                    <Mic className="h-5 w-5 text-cyan-100" />
                  </div>
                  <div>
                    <div className="text-sm uppercase tracking-[0.24em] text-cyan-50/92">OpenJarvis Operator</div>
                    <div className="text-xs uppercase tracking-[0.25em] text-cyan-300/55">Local Session Active</div>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-slate-100/76">
                  <div>Input languages: Norwegian, English</div>
                  <div>Reply language: English</div>
                  <div>Current engine: {serverInfo?.engine || 'Unavailable'}</div>
                  <div>Streaming rate: {tokenRate ? `${tokenRate.toFixed(1)} tok/s` : 'No live throughput yet'}</div>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </section>
  );
}
