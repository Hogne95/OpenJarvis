import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  AudioLines,
  Brain,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Folder,
  Mail,
  Mic,
  Radio,
  Shield,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  checkHealth,
  createManagedAgent,
  fetchManagedAgents,
  fetchSpeechHealth,
  fetchSpeechProfile,
  fetchVoiceLoopStatus,
  runManagedAgent,
  startVoiceLoop,
  stopVoiceLoop,
  synthesizeSpeech,
  updateVoiceLoopState,
  type SpeechProfile,
  type VoiceLoopStatus,
} from './lib/api';
import { listConnectors } from './lib/connectors-api';
import { useAppStore } from './lib/store';
import type { ChatMessage, ToolCallInfo } from './types';
import { InputArea } from './components/Chat/InputArea';
import { useSpeech } from './hooks/useSpeech';

type Status = 'Standby' | 'Listening' | 'Analyzing' | 'Responding';

type ConnectorSummary = {
  totalConnected: number;
  emailReady: boolean;
  calendarReady: boolean;
  docsReady: boolean;
  messagingReady: boolean;
};

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
          style={{ height: `${bar}%`, animationDelay: `${index * 120}ms` }}
        />
      ))}
    </div>
  );
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
  if (!toolCall) return 'No active tool call.';
  const args = toolCall.arguments?.trim();
  if (!args) return `${toolCall.tool} requested.`;
  const compactArgs = args.length > 100 ? `${args.slice(0, 97)}...` : args;
  return `${toolCall.tool}(${compactArgs})`;
}

function detectLanguageHints() {
  const locale = (navigator.language || '').toLowerCase();
  if (locale.startsWith('en')) return ['en', 'no'];
  if (locale.startsWith('nb') || locale.startsWith('nn') || locale.startsWith('no')) {
    return ['no', 'en'];
  }
  return ['no', 'en'];
}

export default function JarvisHudDashboard() {
  const navigate = useNavigate();
  const messages = useAppStore((s) => s.messages);
  const streamState = useAppStore((s) => s.streamState);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const settings = useAppStore((s) => s.settings);
  const logEntries = useAppStore((s) => s.logEntries);
  const managedAgents = useAppStore((s) => s.managedAgents);
  const setSelectedAgentId = useAppStore((s) => s.setSelectedAgentId);

  const [apiReachable, setApiReachable] = useState<boolean | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState<boolean | null>(null);
  const [runningAgentCount, setRunningAgentCount] = useState(0);
  const [connectorSummary, setConnectorSummary] = useState<ConnectorSummary>({
    totalConnected: 0,
    emailReady: false,
    calendarReady: false,
    docsReady: false,
    messagingReady: false,
  });
  const [agentNotice, setAgentNotice] = useState('');
  const [agentActionBusy, setAgentActionBusy] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [voiceLoop, setVoiceLoop] = useState<VoiceLoopStatus | null>(null);
  const [speechProfile, setSpeechProfile] = useState<SpeechProfile | null>(null);
  const lastSyncedPhaseRef = useRef('');
  const lastSpokenMessageRef = useRef<string>('');
  const audioUrlRef = useRef<string | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const {
    state: hudSpeechState,
    error: hudSpeechError,
    available: hudSpeechAvailable,
    startContinuousListening,
    stopContinuousListening,
  } = useSpeech();

  useEffect(() => {
    let cancelled = false;

    const refreshLiveStatus = async () => {
      const [health, speech, agents, connectors, loop, profile] = await Promise.allSettled([
        checkHealth(),
        fetchSpeechHealth(),
        fetchManagedAgents(),
        listConnectors(),
        fetchVoiceLoopStatus(),
        fetchSpeechProfile(),
      ]);

      if (cancelled) return;

      setApiReachable(health.status === 'fulfilled' ? health.value : false);
      setSpeechAvailable(speech.status === 'fulfilled' ? speech.value.available : false);
      setRunningAgentCount(
        agents.status === 'fulfilled'
          ? agents.value.filter((agent) => agent.status === 'running').length
          : managedAgents.filter((agent) => agent.status === 'running').length,
      );

      if (connectors.status === 'fulfilled') {
        const connected = connectors.value.filter((connector) => connector.connected);
        const ids = new Set(connected.map((connector) => connector.connector_id));
        setConnectorSummary({
          totalConnected: connected.length,
          emailReady: ids.has('gmail_imap') || ids.has('outlook'),
          calendarReady: ids.has('gcalendar') || ids.has('outlook'),
          docsReady: ids.has('gdrive') || ids.has('notion') || ids.has('obsidian'),
          messagingReady: ids.has('slack') || ids.has('imessage') || ids.has('whatsapp'),
        });
      }

      if (loop.status === 'fulfilled') setVoiceLoop(loop.value);
      if (profile.status === 'fulfilled') setSpeechProfile(profile.value);
    };

    refreshLiveStatus();
    const interval = window.setInterval(refreshLiveStatus, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [managedAgents]);

  useEffect(() => {
    return () => {
      audioElementRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!voiceNotice) return;
    const timeout = window.setTimeout(() => setVoiceNotice(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [voiceNotice]);

  useEffect(() => {
    if (!voiceLoop?.active) {
      lastSyncedPhaseRef.current = '';
      return;
    }

    let desiredPhase: VoiceLoopStatus['phase'] = 'listening';
    if (hudSpeechError) desiredPhase = 'error';
    else if (hudSpeechState === 'recording') desiredPhase = 'recording';
    else if (hudSpeechState === 'transcribing') desiredPhase = 'transcribing';
    else if (streamState.isStreaming) desiredPhase = 'speaking';

    if (lastSyncedPhaseRef.current === desiredPhase) return;
    lastSyncedPhaseRef.current = desiredPhase;

    updateVoiceLoopState({
      phase: desiredPhase,
      error: desiredPhase === 'error' ? hudSpeechError || 'Voice capture failed' : undefined,
    })
      .then(setVoiceLoop)
      .catch(() => {});
  }, [hudSpeechError, hudSpeechState, streamState.isStreaming, voiceLoop?.active]);

  const latestUserMessage = useMemo(() => latestMessageByRole(messages, 'user'), [messages]);
  const latestAssistantMessage = useMemo(
    () => latestMessageByRole(messages, 'assistant'),
    [messages],
  );
  const activeToolCall =
    streamState.activeToolCalls.length > 0
      ? streamState.activeToolCalls[streamState.activeToolCalls.length - 1]
      : null;
  const latestLogEntries = useMemo(() => [...logEntries].slice(-5).reverse(), [logEntries]);
  const toolSummary = summarizeToolCall(activeToolCall);

  const status: Status = useMemo(() => {
    if (streamState.isStreaming && streamState.content.trim()) return 'Responding';
    if (streamState.isStreaming || streamState.activeToolCalls.length > 0) return 'Analyzing';
    if (voiceLoop?.active || (settings.speechEnabled && speechAvailable)) return 'Listening';
    return 'Standby';
  }, [settings.speechEnabled, speechAvailable, streamState, voiceLoop?.active]);

  const statusMeta = useMemo(() => {
    switch (status) {
      case 'Listening':
        return {
          accent: 'text-emerald-300',
          label: voiceLoop?.active ? 'Voice loop armed' : 'Voice ready',
          transcript: compactText(
            latestUserMessage?.content || voiceLoop?.last_transcript || '',
            'The command core is armed. Speak Norwegian or English.',
          ),
          reply: compactText(
            latestAssistantMessage?.content || '',
            'JARVIS is waiting for your next voice or text command.',
          ),
          bars: [42, 58, 82, 68, 92, 74, 54, 36],
        };
      case 'Analyzing':
        return {
          accent: 'text-amber-300',
          label: streamState.phase || 'Routing tools and inference',
          transcript: compactText(
            latestUserMessage?.content || '',
            'Intent received. Routing through tools and model selection.',
          ),
          reply: compactText(toolSummary, 'Working through the current request.'),
          bars: [30, 40, 58, 66, 61, 47, 35, 22],
        };
      case 'Responding':
        return {
          accent: 'text-sky-300',
          label: streamState.phase || 'Streaming response',
          transcript: compactText(latestUserMessage?.content || '', 'Active request in progress.'),
          reply: compactText(
            streamState.content || latestAssistantMessage?.content || '',
            'Rendering assistant response...',
          ),
          bars: [45, 61, 80, 71, 86, 77, 60, 41],
        };
      default:
        return {
          accent: 'text-cyan-200',
          label: 'System idle',
          transcript: compactText(latestUserMessage?.content || '', 'No active command.'),
          reply: compactText(
            latestAssistantMessage?.content || '',
            'All systems nominal. Use the reactor mic or command deck to begin.',
          ),
          bars: [18, 24, 20, 25, 16, 21, 18, 14],
        };
    }
  }, [latestAssistantMessage, latestUserMessage, status, streamState.content, streamState.phase, toolSummary, voiceLoop?.active, voiceLoop?.last_transcript]);

  const reactorMetrics = useMemo(
    () => [
      {
        label: 'API Link',
        value: apiReachable ? 'Online' : apiReachable === false ? 'Offline' : 'Checking',
      },
      {
        label: 'Speech Core',
        value: voiceLoop?.backend_available
          ? voiceLoop.backend_name || 'Ready'
          : speechAvailable
          ? 'Ready'
          : speechAvailable === false
          ? 'Offline'
          : 'Checking',
      },
      { label: 'Voice Loop', value: voiceLoop?.active ? voiceLoop.phase : 'Idle' },
      {
        label: 'VAD',
        value: speechProfile?.live_vad_enabled
          ? voiceLoop?.vad_backend || speechProfile?.vad_backend || 'Active'
          : 'Disabled',
      },
      {
        label: 'Latency',
        value: formatElapsed(latestAssistantMessage?.telemetry?.total_ms ?? streamState.elapsedMs),
      },
    ],
    [apiReachable, latestAssistantMessage?.telemetry?.total_ms, speechAvailable, speechProfile?.live_vad_enabled, speechProfile?.vad_backend, streamState.elapsedMs, voiceLoop],
  );

  const coreMatrix = [
    { icon: Cpu, label: 'Local Core', value: apiReachable ? 'Nominal' : 'Checking' },
    { icon: Brain, label: 'Reasoner', value: serverInfo?.engine || 'Unknown' },
    {
      icon: AudioLines,
      label: 'Voice',
      value: settings.speechEnabled
        ? voiceLoop?.active
          ? voiceLoop.phase
          : hudSpeechAvailable
          ? 'Ready'
          : 'Needs STT'
        : 'Disabled',
    },
    { icon: Shield, label: 'Approval', value: activeToolCall ? 'Engaged' : 'Ready' },
  ];

  const sourceReadiness = [
    { icon: Mail, label: 'Inbox', value: connectorSummary.emailReady ? 'Connected' : 'Setup' },
    {
      icon: CalendarDays,
      label: 'Calendar',
      value: connectorSummary.calendarReady ? 'Connected' : 'Setup',
    },
    { icon: Folder, label: 'Knowledge', value: connectorSummary.docsReady ? 'Connected' : 'Optional' },
  ];

  const quickActions = [
    { icon: Radio, label: 'Chat', action: () => navigate('/chat') },
    { icon: Folder, label: 'Sources', action: () => navigate('/data-sources') },
    { icon: Brain, label: 'Agents', action: () => navigate('/agents') },
    { icon: Terminal, label: 'Logs', action: () => navigate('/logs') },
  ];

  function injectCommand(text: string) {
    window.dispatchEvent(new CustomEvent('jarvis:set-input', { detail: { text, replace: true } }));
    setVoiceNotice('Command loaded into the deck.');
  }

  function submitInjectedCommand(text: string) {
    if (streamState.isStreaming) {
      window.dispatchEvent(new Event('jarvis:interrupt-stream'));
    }
    audioElementRef.current?.pause();
    injectCommand(text);
    window.dispatchEvent(new Event('jarvis:submit-input'));
  }

  async function ensureAgent(kind: 'inbox' | 'meeting-prep') {
    const existing = managedAgents.find((agent) =>
      kind === 'inbox'
        ? agent.name === 'JARVIS Inbox Triager'
        : agent.name === 'JARVIS Meeting Prep',
    );
    if (existing) return existing;

    if (kind === 'inbox') {
      return createManagedAgent({
        name: 'JARVIS Inbox Triager',
        template_id: 'inbox_triager',
        config: {
          model: selectedModel || undefined,
          schedule_type: 'manual',
          instruction:
            'Monitor my connected email and messaging sources, highlight urgent items first, and keep summaries concise and actionable.',
        },
      });
    }

    return createManagedAgent({
      name: 'JARVIS Meeting Prep',
      agent_type: 'deep_research',
      config: {
        model: selectedModel || undefined,
        schedule_type: 'manual',
        max_turns: 8,
        temperature: 0.2,
        tools: ['knowledge_search', 'knowledge_sql', 'scan_chunks', 'think'],
        system_prompt:
          'You are a meeting preparation assistant. Search the user knowledge base, emails, notes, and calendar context to prepare concise meeting briefs with participants, recent context, likely topics, and recommended talking points.',
      },
    });
  }

  async function launchAssistantAgent(kind: 'inbox' | 'meeting-prep') {
    setAgentActionBusy(kind);
    setAgentNotice('');
    try {
      const agent = await ensureAgent(kind);
      setSelectedAgentId(agent.id);
      if (kind === 'inbox') {
        await runManagedAgent(agent.id);
        setAgentNotice('Inbox Triager launched in Agents.');
      } else {
        setAgentNotice('Meeting Prep agent is ready in Agents.');
      }
      navigate('/agents');
    } catch (error) {
      setAgentNotice(error instanceof Error ? error.message : 'Unable to launch agent');
    } finally {
      setAgentActionBusy(null);
    }
  }

  const missionProfiles = [
    {
      icon: Mail,
      label: 'Inbox Triage',
      sublabel: connectorSummary.emailReady ? 'Launch managed inbox agent' : 'Connect Gmail or Outlook first',
      action: () => launchAssistantAgent('inbox'),
    },
    {
      icon: CalendarDays,
      label: 'Calendar Brief',
      sublabel: connectorSummary.calendarReady ? 'Load a planning prompt' : 'Connect calendar for context',
      action: () =>
        injectCommand(
          "What's on my calendar today, which meetings need preparation, and what should I focus on first?",
        ),
    },
    {
      icon: Brain,
      label: 'Meeting Prep',
      sublabel: 'Open a dedicated preparation agent',
      action: () => launchAssistantAgent('meeting-prep'),
    },
    {
      icon: Wrench,
      label: 'Coding Assist',
      sublabel: 'Load a repository copilot prompt',
      action: () =>
        injectCommand(
          'Act as my coding assistant for this repository. Inspect the current state, propose the next concrete step, and help me execute it safely.',
        ),
    },
  ];

  async function handleReactorMic() {
    if (!settings.speechEnabled) {
      setVoiceNotice('Enable Speech-to-Text in Settings first.');
      return;
    }
    if (!hudSpeechAvailable) {
      setVoiceNotice('Speech backend is not ready yet.');
      return;
    }

    if (voiceLoop?.active) {
      try {
        await stopContinuousListening();
        const snapshot = await stopVoiceLoop();
        setVoiceLoop(snapshot);
        setVoiceNotice('Always-listening voice loop disarmed.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to stop voice loop.';
        setVoiceNotice(message);
      }
      return;
    }

    try {
      const languageHints = detectLanguageHints();
      const snapshot = await startVoiceLoop(languageHints);
      setVoiceLoop(snapshot);
      await startContinuousListening({
        chunkMs: speechProfile?.audio_chunk_ms || 2200,
        languageHints,
        onChunkProcessed: (result) => {
          setVoiceLoop(result);
          if (result.accepted && result.command.trim()) {
            if (speechProfile?.auto_submit_voice_commands ?? true) {
              submitInjectedCommand(result.command);
              setVoiceNotice('Wake phrase confirmed. Command sent.');
            } else {
              injectCommand(result.command);
              setVoiceNotice('Wake phrase confirmed. Command loaded into the deck.');
            }
            return;
          }
          if (result.message && result.transcript.trim()) {
            setVoiceNotice(result.message);
          }
        },
        onError: (error) => {
          setVoiceNotice(error.message);
        },
      });
      setVoiceNotice('Always-listening voice loop armed.');
    } catch (error) {
      setVoiceNotice(error instanceof Error ? error.message : 'Unable to start voice loop.');
    }
  }

  async function handleDisarmVoiceLoop() {
    if (!voiceLoop?.active) return;
    try {
      await stopContinuousListening();
      const snapshot = await stopVoiceLoop();
      setVoiceLoop(snapshot);
      setVoiceNotice('Voice loop disarmed.');
    } catch (error) {
      setVoiceNotice(error instanceof Error ? error.message : 'Unable to stop voice loop.');
    }
  }

  const approvalLabel = activeToolCall
    ? `Tool running: ${activeToolCall.tool}`
    : streamState.isStreaming
    ? 'Inference active. No tool approval pending.'
    : 'No pending operator decision';

  const voicePhaseLabel =
    hudSpeechState === 'listening'
      ? 'Listening'
      : hudSpeechState === 'transcribing'
      ? 'Transcribing'
      : voiceLoop?.active
      ? voiceLoop.phase[0].toUpperCase() + voiceLoop.phase.slice(1)
      : 'Idle';

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
      ];

  useEffect(() => {
    if (!speechProfile?.auto_speak || !voiceLoop?.active) return;
    const text = latestAssistantMessage?.content?.trim();
    if (!text || text === lastSpokenMessageRef.current) return;

    let cancelled = false;
    synthesizeSpeech({
      text,
      backend: speechProfile.reply_backend,
      voice_id: speechProfile.reply_voice_id,
      speed: speechProfile.reply_speed,
      output_format: 'wav',
    })
      .then((blob) => {
        if (cancelled) return;
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        const audio = new Audio(url);
        audioElementRef.current = audio;
        audio.play().catch(() => {});
        lastSpokenMessageRef.current = text;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [latestAssistantMessage?.content, speechProfile, voiceLoop?.active]);

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#02050d] text-slate-100">
      <div className="jarvis-vignette pointer-events-none absolute inset-0" />
      <div className="jarvis-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="jarvis-scanlines pointer-events-none absolute inset-0 opacity-30" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-4 pb-6 pt-4 sm:px-6 lg:px-8">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-[1.85rem] border border-cyan-400/15 bg-slate-950/55 px-5 py-4 shadow-[0_0_50px_rgba(8,145,178,0.12)] backdrop-blur-xl">
          <div>
            <div className="text-[10px] uppercase tracking-[0.42em] text-cyan-300/65">
              JARVIS Command HUD
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="hud-glow text-2xl uppercase tracking-[0.32em] text-cyan-50">
                Executive Assistant
              </div>
              <div className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.3em] ${statusMeta.accent}`}>
                {status}
              </div>
            </div>
              <div className="mt-2 text-sm text-slate-200/70">
              Norwegian + English input. English replies. Wake phrase, male voice, and always-listening loop enabled.
              </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Model', selectedModel || serverInfo?.model || 'Unassigned'],
              ['Voice', voiceLoop?.active ? voicePhaseLabel : settings.speechEnabled ? 'Ready' : 'Disabled'],
              ['Agents', `${runningAgentCount} running`],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[1.2rem] border border-cyan-400/15 bg-slate-950/45 px-4 py-3"
              >
                <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-300/65">{label}</div>
                <div className="mt-1 text-sm text-cyan-50/90">{value}</div>
              </div>
            ))}
          </div>
        </header>

        <div className="grid flex-1 gap-4 xl:grid-cols-[280px_minmax(700px,1fr)_340px]">
          <div className="space-y-4">
            <Panel title="Core Matrix" kicker="Subsystems">
              <div className="space-y-3">
                {coreMatrix.map(({ icon: Icon, label, value }) => (
                  <div
                    key={label}
                    className="jarvis-outline flex items-center justify-between rounded-[1.15rem] px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/8 p-2">
                        <Icon className="h-4 w-4 text-cyan-200" />
                      </div>
                      <div className="text-sm text-cyan-50/90">{label}</div>
                    </div>
                    <div className="text-xs uppercase tracking-[0.28em] text-emerald-300">{value}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Mission Launchpad" kicker="Useful actions">
              <div className="grid gap-3">
                {missionProfiles.map(({ icon: Icon, label, sublabel, action }) => (
                  <button
                    key={label}
                    onClick={action}
                    disabled={agentActionBusy !== null}
                    className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 px-4 py-4 text-left transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl border border-cyan-400/12 bg-cyan-400/[0.07] p-2">
                        <Icon className="h-4 w-4 text-cyan-200" />
                      </div>
                      <div>
                        <div className="text-sm uppercase tracking-[0.18em] text-cyan-50/92">{label}</div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                          {agentActionBusy && label.includes('Inbox') && agentActionBusy === 'inbox'
                            ? 'Launching...'
                            : agentActionBusy && label.includes('Meeting') && agentActionBusy === 'meeting-prep'
                            ? 'Launching...'
                            : sublabel}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-100/78">
                {agentNotice || 'Launch inbox and meeting agents directly from the HUD.'}
              </div>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Command Core" kicker="Reactor">
              <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
                <div className="relative flex min-h-[30rem] items-center justify-center overflow-hidden rounded-[1.5rem] border border-cyan-400/10 bg-[radial-gradient(circle_at_center,rgba(8,47,73,0.75),rgba(2,6,23,0.95)_62%)] p-6">
                  <div className="jarvis-float absolute inset-[12%] rounded-full border border-cyan-300/12" />
                  <div className="jarvis-spin-slow absolute inset-[16%] rounded-full border border-cyan-300/22" />
                  <div className="jarvis-spin-reverse absolute inset-[24%] rounded-full border border-dashed border-cyan-200/16" />
                  <div className="jarvis-spin-slow absolute inset-[31%] rounded-full border border-sky-300/15" />
                  <div className="absolute inset-[18%] rounded-full border border-cyan-300/10 shadow-[0_0_120px_rgba(34,211,238,0.12)]" />
                  <div className="jarvis-sweep absolute left-1/2 top-1/2 h-[1px] w-[42%] origin-left -translate-y-1/2 bg-gradient-to-r from-cyan-300/0 via-cyan-200 to-cyan-100 shadow-[0_0_18px_rgba(125,211,252,0.9)]" />

                  <button
                    onClick={handleReactorMic}
                    disabled={!settings.speechEnabled || !hudSpeechAvailable || hudSpeechState === 'transcribing'}
                    className="relative flex h-40 w-40 items-center justify-center rounded-full border border-cyan-200/28 bg-cyan-300/10 shadow-[0_0_50px_rgba(34,211,238,0.16)] transition hover:bg-cyan-300/14 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="absolute inset-3 rounded-full border border-cyan-100/25" />
                    <div className="jarvis-pulse absolute inset-6 rounded-full border border-cyan-200/40" />
                    <Mic className="h-16 w-16 text-cyan-100 drop-shadow-[0_0_18px_rgba(125,211,252,0.7)]" />
                  </button>

                  <div className="absolute left-6 top-6 rounded-full border border-cyan-400/16 bg-slate-950/50 px-4 py-2 text-[11px] uppercase tracking-[0.34em] text-cyan-200/75">
                    Voice Phase: {voicePhaseLabel}
                  </div>
                  <div className="absolute right-6 top-6 rounded-full border border-cyan-400/16 bg-slate-950/50 px-4 py-2 text-[11px] uppercase tracking-[0.34em] text-cyan-200/75">
                    {voiceLoop?.active ? 'Loop Armed' : 'Loop Idle'}
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
                    <div className="mt-5">
                      <Equalizer bars={statusMeta.bars} />
                    </div>
                  </div>

                  <div className="rounded-[1.4rem] border border-cyan-400/12 bg-slate-950/55 p-4">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.4em] text-cyan-300/60">
                      Voice Loop Control
                    </div>
                    <div className="text-sm uppercase tracking-[0.24em] text-cyan-50">
                      {voiceLoop?.active ? 'Active session' : 'Inactive session'}
                    </div>
                    <div className="mt-2 text-sm leading-7 text-slate-200/75">
                      {hudSpeechError ||
                        voiceLoop?.last_error ||
                        voiceNotice ||
                        (settings.speechEnabled
                          ? `Press the reactor mic to toggle the always-listening loop. Wake phrase: ${
                              speechProfile?.wake_phrases?.[0] || 'hey jarvis'
                            }. Engine: ${voiceLoop?.wake_backend || speechProfile?.wake_backend || 'transcript'}.`
                          : 'Enable Speech-to-Text in Settings to activate voice control.')}
                    </div>
                    <div className="mt-4 flex gap-3">
                      <button
                        onClick={handleReactorMic}
                        disabled={!settings.speechEnabled || !hudSpeechAvailable || hudSpeechState === 'transcribing'}
                        className="rounded-[1rem] border border-cyan-300/20 bg-cyan-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.28em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {voiceLoop?.active ? 'Disarm Voice' : 'Arm Voice'}
                      </button>
                      <button
                        onClick={handleDisarmVoiceLoop}
                        disabled={!voiceLoop?.active}
                        className="rounded-[1rem] border border-slate-400/20 bg-slate-900/70 px-4 py-3 text-xs uppercase tracking-[0.28em] text-slate-200 transition hover:border-cyan-400/20 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Disarm
                      </button>
                    </div>
                  </div>

                  <div className="rounded-[1.4rem] border border-cyan-400/12 bg-slate-950/55 p-4">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.4em] text-cyan-300/60">
                      Latest Transcript
                    </div>
                    <p className="text-sm leading-7 text-slate-200/75">{statusMeta.transcript}</p>
                    <div className="mt-4 text-[11px] uppercase tracking-[0.28em] text-cyan-300/55">
                      Reply voice: {speechProfile?.reply_voice_id || 'am_michael'} via {speechProfile?.reply_backend || 'kokoro'}
                    </div>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.28em] text-cyan-300/55">
                      VAD: {voiceLoop?.vad_backend || speechProfile?.vad_backend || 'energy'} · Wake: {voiceLoop?.wake_backend || speechProfile?.wake_backend || 'transcript'}
                    </div>
                    {voiceLoop?.last_wake_score != null ? (
                      <div className="mt-2 text-[11px] uppercase tracking-[0.28em] text-cyan-300/55">
                        Wake score: {voiceLoop.last_wake_score.toFixed(2)}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </Panel>

            <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
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

              <Panel title="Direct Control" kicker="Command deck">
                <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">
                    Live Command Input
                  </div>
                  <div className="text-sm leading-7 text-slate-200/78">
                    Use text or the small mic here. The reactor mic arms the active voice loop.
                  </div>
                </div>

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-black/20 py-2">
                  <InputArea />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {quickActions.map(({ icon: Icon, label, action }) => (
                    <button
                      key={label}
                      onClick={action}
                      className="rounded-[1.1rem] border border-cyan-400/12 bg-slate-950/55 px-4 py-4 text-left transition hover:bg-cyan-400/[0.08]"
                    >
                      <Icon className="mb-3 h-5 w-5 text-cyan-200" />
                      <div className="text-sm uppercase tracking-[0.2em] text-cyan-50/92">{label}</div>
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {sourceReadiness.map(({ icon: Icon, label, value }) => (
                    <div
                      key={label}
                      className="rounded-[1rem] border border-cyan-400/10 bg-slate-950/45 px-3 py-3"
                    >
                      <Icon className="mb-2 h-4 w-4 text-cyan-200" />
                      <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/55">{label}</div>
                      <div className="mt-1 text-sm text-cyan-50/90">{value}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>

          <div className="space-y-4">
            <Panel title="Tactical Timeline" kicker="Event stream">
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

            <Panel title="Session Focus" kicker="Current state">
              <div className="space-y-3">
                {[
                  voiceLoop?.active
                    ? `Voice loop is ${voicePhaseLabel.toLowerCase()} and ready for the next command.`
                    : 'Voice loop is idle until you arm the reactor mic.',
                  connectorSummary.emailReady
                    ? 'Inbox sources are connected for triage and summaries.'
                    : 'Connect an email source to unlock inbox workflows.',
                  connectorSummary.calendarReady
                    ? 'Calendar context is available for planning and meeting prep.'
                    : 'Connect a calendar to improve planning and meeting prep.',
                  runningAgentCount > 0
                    ? `${runningAgentCount} managed agent${runningAgentCount === 1 ? '' : 's'} currently running.`
                    : 'No managed agents are running right now.',
                ].map((item, index) => (
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
          </div>
        </div>
      </div>
    </section>
  );
}
