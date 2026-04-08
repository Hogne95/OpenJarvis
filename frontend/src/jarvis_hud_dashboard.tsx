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
  Flag,
  Folder,
  Mail,
  Mic,
  Radio,
  Reply,
  Siren,
  Shield,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  checkHealth,
  approveActionCenterItem,
  approveWorkbenchCommand,
  createManagedAgent,
  fetchActionCenterStatus,
  fetchDailyDigest,
  fetchDigestSchedule,
  fetchInboxSummary,
  fetchManagedAgents,
  fetchOperatorMemory,
  fetchReminders,
  fetchSpeechHealth,
  fetchSpeechProfile,
  fetchTaskSummary,
  fetchVoiceLoopStatus,
  fetchWorkbenchStatus,
  generateDailyDigest,
  getDailyDigestAudioUrl,
  holdActionCenterItem,
  holdWorkbenchCommand,
  recordOperatorMemorySignal,
  runManagedAgent,
  startVoiceLoop,
  stageCalendarBrief,
  stageEmailDraft,
  stageInboxAction,
  stageTask,
  stageWorkbenchCommand,
  stopVoiceLoop,
  synthesizeSpeech,
  updateDigestSchedule,
  updateOperatorMeeting,
  updateOperatorRelationship,
  updateVoiceLoopState,
  type ActionCenterStatus,
  type DailyDigest,
  type DigestSchedule,
  type DurableOperatorMemory,
  type InboxSummaryItem,
  type ReminderItem,
  type SpeechProfile,
  type TaskSummaryItem,
  type VoiceLoopStatus,
  type WorkbenchStatus,
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

function formatReminderMoment(value: string) {
  if (!value) return 'No time set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function normalizeContactKey(value: string) {
  return value.trim().toLowerCase();
}

function normalizeMeetingKey(value: string) {
  return value.trim().toLowerCase();
}

export default function JarvisHudDashboard() {
  const navigate = useNavigate();
  const messages = useAppStore((s) => s.messages);
  const streamState = useAppStore((s) => s.streamState);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const settings = useAppStore((s) => s.settings);
  const operatorProfile = useAppStore((s) => s.operatorProfile);
  const operatorSignals = useAppStore((s) => s.operatorSignals);
  const logEntries = useAppStore((s) => s.logEntries);
  const managedAgents = useAppStore((s) => s.managedAgents);
  const setSelectedAgentId = useAppStore((s) => s.setSelectedAgentId);
  const updateOperatorProfile = useAppStore((s) => s.updateOperatorProfile);
  const recordOperatorSignal = useAppStore((s) => s.recordOperatorSignal);

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
  const [focusMode, setFocusMode] = useState(false);
  const [workbench, setWorkbench] = useState<WorkbenchStatus | null>(null);
  const [actionCenter, setActionCenter] = useState<ActionCenterStatus | null>(null);
  const [workbenchCommand, setWorkbenchCommand] = useState('');
  const [workbenchDirectory, setWorkbenchDirectory] = useState('');
  const [workbenchTimeout, setWorkbenchTimeout] = useState(30);
  const [workbenchBusy, setWorkbenchBusy] = useState<'stage' | 'approve' | 'hold' | null>(null);
  const [workbenchNotice, setWorkbenchNotice] = useState('');
  const [actionMode, setActionMode] = useState<'email' | 'calendar'>('email');
  const [actionBusy, setActionBusy] = useState<'stage' | 'approve' | 'hold' | null>(null);
  const [actionNotice, setActionNotice] = useState('');
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [calendarTitle, setCalendarTitle] = useState('');
  const [calendarStartAt, setCalendarStartAt] = useState('');
  const [calendarAttendees, setCalendarAttendees] = useState('');
  const [calendarLocation, setCalendarLocation] = useState('');
  const [calendarNotes, setCalendarNotes] = useState('');
  const [calendarEndAt, setCalendarEndAt] = useState('');
  const [inboxSummary, setInboxSummary] = useState<InboxSummaryItem[]>([]);
  const [taskSummary, setTaskSummary] = useState<TaskSummaryItem[]>([]);
  const [dailyDigest, setDailyDigest] = useState<DailyDigest | null>(null);
  const [digestSchedule, setDigestSchedule] = useState<DigestSchedule | null>(null);
  const [durableOperatorMemory, setDurableOperatorMemory] = useState<DurableOperatorMemory | null>(null);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [digestNotice, setDigestNotice] = useState('');
  const [digestBusy, setDigestBusy] = useState(false);
  const [digestScheduleBusy, setDigestScheduleBusy] = useState(false);
  const [relationshipNotice, setRelationshipNotice] = useState('');
  const lastSyncedPhaseRef = useRef('');
  const hasAutoRequestedDigestRef = useRef(false);
  const lastSpokenDigestRef = useRef('');
  const lastChimedReminderRef = useRef('');
  const lastAutoPrepReminderRef = useRef('');
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
      const [action, digest, digestSched, operatorMemory, inbox, tasks, reminderItems, health, speech, agents, connectors, loop, profile, wb] = await Promise.allSettled([
        fetchActionCenterStatus(),
        fetchDailyDigest(),
        fetchDigestSchedule(),
        fetchOperatorMemory(),
        fetchInboxSummary(),
        fetchTaskSummary(),
        fetchReminders(),
        checkHealth(),
        fetchSpeechHealth(),
        fetchManagedAgents(),
        listConnectors(),
        fetchVoiceLoopStatus(),
        fetchSpeechProfile(),
        fetchWorkbenchStatus(),
      ]);

      if (cancelled) return;

      if (action.status === 'fulfilled') setActionCenter(action.value);
      if (digest.status === 'fulfilled') setDailyDigest(digest.value);
      if (digestSched.status === 'fulfilled') setDigestSchedule(digestSched.value);
      if (operatorMemory.status === 'fulfilled') setDurableOperatorMemory(operatorMemory.value);
      if (inbox.status === 'fulfilled') setInboxSummary(inbox.value);
      if (tasks.status === 'fulfilled') setTaskSummary(tasks.value);
      if (reminderItems.status === 'fulfilled') setReminders(reminderItems.value);
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
      if (wb.status === 'fulfilled') {
        setWorkbench(wb.value);
        if (!workbenchDirectory) setWorkbenchDirectory(wb.value.default_working_dir);
      }
    };

    refreshLiveStatus();
    const interval = window.setInterval(refreshLiveStatus, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [managedAgents, workbenchDirectory]);

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
    if (!workbenchNotice) return;
    const timeout = window.setTimeout(() => setWorkbenchNotice(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [workbenchNotice]);

  useEffect(() => {
    if (!actionNotice) return;
    const timeout = window.setTimeout(() => setActionNotice(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [actionNotice]);

  useEffect(() => {
    if (!digestNotice) return;
    const timeout = window.setTimeout(() => setDigestNotice(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [digestNotice]);

  useEffect(() => {
    if (!relationshipNotice) return;
    const timeout = window.setTimeout(() => setRelationshipNotice(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [relationshipNotice]);

  useEffect(() => {
    if (hasAutoRequestedDigestRef.current) return;
    if (digestBusy) return;
    if (dailyDigest || apiReachable === false) return;
    hasAutoRequestedDigestRef.current = true;
    handleGenerateDigest().catch(() => {});
  }, [apiReachable, dailyDigest, digestBusy]);

  useEffect(() => {
    if (!dailyDigest?.text || !speechProfile?.auto_speak) return;
    if (lastSpokenDigestRef.current === dailyDigest.generated_at) return;
    let cancelled = false;
    synthesizeSpeech({
      text: dailyDigest.text,
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
        lastSpokenDigestRef.current = dailyDigest.generated_at;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [dailyDigest?.generated_at, dailyDigest?.text, speechProfile]);

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
  const pendingAction = actionCenter?.pending ?? null;
  const pendingWorkbench = workbench?.pending ?? null;
  const latestActionResult = actionCenter?.history?.[0] ?? null;
  const latestWorkbenchResult = workbench?.history?.[0] ?? null;
  const prioritizedContacts = useMemo(
    () =>
      [
        ...operatorProfile.priorityContacts
          .split(',')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
        ...(durableOperatorMemory?.profile.priority_contacts || []),
        ...operatorSignals.topContacts,
        ...(durableOperatorMemory?.signals.top_contacts || []),
      ].filter((item, index, array) => array.indexOf(item) === index),
    [
      durableOperatorMemory?.profile.priority_contacts,
      durableOperatorMemory?.signals.top_contacts,
      operatorProfile.priorityContacts,
      operatorSignals.topContacts,
    ],
  );
  const sortedInboxSummary = useMemo(() => {
    return [...inboxSummary].sort((left, right) => {
      const leftContact = (left.author_email || left.author).toLowerCase();
      const rightContact = (right.author_email || right.author).toLowerCase();
      const leftPriority = prioritizedContacts.findIndex((item) => leftContact.includes(item));
      const rightPriority = prioritizedContacts.findIndex((item) => rightContact.includes(item));
      const leftRank = leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority;
      const rightRank = rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return (right.timestamp || '').localeCompare(left.timestamp || '');
    });
  }, [inboxSummary, prioritizedContacts]);
  const immediateReminder = useMemo(() => {
    const now = Date.now();
    const enriched = reminders
      .map((item) => {
        const parsed = new Date(item.when).getTime();
        return {
          ...item,
          deltaMs: Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed - now,
        };
      })
      .sort((a, b) => a.deltaMs - b.deltaMs);
    return enriched[0] ?? null;
  }, [reminders]);
  const prepQueue = useMemo(() => {
    const now = Date.now();
    const meetingMemory = durableOperatorMemory?.meetings || {};
    return reminders
      .filter((item) => item.kind === 'event')
      .map((item) => {
        const parsed = new Date(item.when).getTime();
        const deltaMs = Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed - now;
        const memory = meetingMemory[normalizeMeetingKey(item.title)];
        const importanceBoost =
          memory?.importance === 'high' ? 3 : memory?.importance === 'normal' ? 1 : 0;
        const urgencyBoost =
          deltaMs <= 90 * 60 * 1000 ? 4 : deltaMs <= 4 * 60 * 60 * 1000 ? 2 : 0;
        return {
          ...item,
          deltaMs,
          memory,
          score: importanceBoost + urgencyBoost,
        };
      })
      .filter((item) => item.deltaMs >= -15 * 60 * 1000 && item.deltaMs <= 24 * 60 * 60 * 1000)
      .sort((left, right) => {
        if (left.score !== right.score) return right.score - left.score;
        return left.deltaMs - right.deltaMs;
      })
      .slice(0, 3);
  }, [durableOperatorMemory?.meetings, reminders]);

  useEffect(() => {
    if (!immediateReminder) return;
    if (immediateReminder.deltaMs > 2 * 60 * 60 * 1000) return;
    const reminderKey = `${immediateReminder.kind}-${immediateReminder.when}-${immediateReminder.title}`;
    if (lastChimedReminderRef.current === reminderKey) return;
    playAttentionTone();
    lastChimedReminderRef.current = reminderKey;
  }, [immediateReminder]);

  useEffect(() => {
    const nextPrep = prepQueue[0];
    if (!nextPrep) return;
    if (nextPrep.deltaMs > operatorProfile.prepLeadMinutes * 60 * 1000) return;
    const prepKey = `${nextPrep.title}-${nextPrep.when}`;
    if (lastAutoPrepReminderRef.current === prepKey) return;
    if (operatorProfile.autoPrepareMeetings) {
      const prompt = buildMeetingPrepPrompt(nextPrep, nextPrep.memory);
      if (!streamState.isStreaming && streamState.activeToolCalls.length === 0) {
        submitInjectedCommand(prompt);
        setAgentNotice(`Scheduled meeting prep launched for ${nextPrep.title}.`);
      } else {
        injectCommand(prompt);
        setAgentNotice(`Meeting prep queued for ${nextPrep.title} when the console is free.`);
      }
    } else {
      setAgentNotice(
        nextPrep.memory
          ? `Upcoming meeting ready for prep: ${nextPrep.title}. Saved context is available.`
          : `Upcoming meeting detected: ${nextPrep.title}. Consider saving prep context.`,
      );
    }
    lastAutoPrepReminderRef.current = prepKey;
  }, [operatorProfile.autoPrepareMeetings, operatorProfile.prepLeadMinutes, prepQueue, streamState.activeToolCalls.length, streamState.isStreaming]);

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
    {
      icon: Shield,
      label: 'Approval',
      value: activeToolCall || pendingAction || pendingWorkbench ? 'Engaged' : 'Ready',
    },
  ];

  const quickActions = [
    { icon: Radio, label: 'Chat', action: () => navigate('/chat') },
    { icon: Folder, label: 'Sources', action: () => navigate('/data-sources') },
    { icon: Brain, label: 'Agents', action: () => navigate('/agents') },
    { icon: Terminal, label: focusMode ? 'Full HUD' : 'Focus Mode', action: () => setFocusMode((value) => !value) },
  ];

  function injectCommand(text: string) {
    window.dispatchEvent(new CustomEvent('jarvis:set-input', { detail: { text, replace: true } }));
    setVoiceNotice('Command loaded into the deck.');
  }

  function buildMeetingPrepPrompt(
    item: Pick<ReminderItem, 'title' | 'when' | 'detail'>,
    memory?: { prep_style: string; notes: string } | null,
  ) {
    const prepStyle =
      memory?.prep_style || 'Prepare a concise executive brief with context, likely agenda, risks, and talking points.';
    const memoryNotes = memory?.notes ? `\nKnown meeting context: ${memory.notes}` : '';
    return `${prepStyle}\nMeeting: ${item.title}\nWhen: ${item.when}\nDetail: ${item.detail || 'No extra detail.'}${memoryNotes}`;
  }

  function submitInjectedCommand(text: string) {
    if (streamState.isStreaming) {
      window.dispatchEvent(new Event('jarvis:interrupt-stream'));
    }
    audioElementRef.current?.pause();
    injectCommand(text);
    window.dispatchEvent(new Event('jarvis:submit-input'));
  }

  function playAttentionTone() {
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      const context = new AudioContextCtor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(660, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(440, context.currentTime + 0.18);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.24);
      window.setTimeout(() => {
        context.close().catch(() => {});
      }, 350);
    } catch {}
  }

  function prepareReplyDraft(item: InboxSummaryItem) {
    recordOperatorSignal('reply', item.author_email || item.author);
    recordOperatorMemorySignal({ kind: 'reply', contact: item.author_email || item.author })
      .then(setDurableOperatorMemory)
      .catch(() => {});
    setActionMode('email');
    setEmailRecipient(item.author_email || '');
    setEmailSubject(item.title.toLowerCase().startsWith('re:') ? item.title : `Re: ${item.title}`);
    setEmailBody(
      `Hi ${item.author.split('<')[0].trim() || 'there'},\n\nThanks for your email. ` +
        `Please use a ${operatorProfile.replyTone} tone in this reply.\n\n`,
    );
    setActionNotice('Reply draft loaded into Action Center.');
  }

  function triageInboxItem(item: InboxSummaryItem) {
    injectCommand(
      `Summarize this email, explain whether it is urgent, and propose a reply draft.\n` +
        `Subject: ${item.title}\nFrom: ${item.author}\nSnippet: ${item.snippet}`,
    );
  }

  function loadUrgentAssessment(item: InboxSummaryItem) {
    recordOperatorSignal('urgent', item.author_email || item.author);
    recordOperatorMemorySignal({ kind: 'urgent', contact: item.author_email || item.author })
      .then(setDurableOperatorMemory)
      .catch(() => {});
    injectCommand(
      `Assess whether this email is urgent, what deadline risk it contains, and the next best action.\n` +
        `Return a short executive brief.\n` +
        `Subject: ${item.title}\nFrom: ${item.author}\nSnippet: ${item.snippet}`,
    );
  }

  function prepareFollowUp(item: InboxSummaryItem) {
    recordOperatorSignal('reply', item.author_email || item.author);
    recordOperatorMemorySignal({ kind: 'reply', contact: item.author_email || item.author })
      .then(setDurableOperatorMemory)
      .catch(() => {});
    setActionMode('email');
    setEmailRecipient(item.author_email || '');
    setEmailSubject(item.title.toLowerCase().startsWith('re:') ? item.title : `Re: ${item.title}`);
    setEmailBody(
      `Hi ${item.author.split('<')[0].trim() || 'there'},\n\n` +
        `I wanted to follow up on your message about "${item.title}". ` +
        `Please keep the tone ${operatorProfile.replyTone}.\n\n`,
    );
    setActionNotice('Follow-up draft loaded into Action Center.');
  }

  function convertInboxItemToMeeting(item: InboxSummaryItem) {
    recordOperatorSignal('meeting', item.author_email || item.author);
    recordOperatorMemorySignal({ kind: 'meeting', contact: item.author_email || item.author })
      .then(setDurableOperatorMemory)
      .catch(() => {});
    setActionMode('calendar');
    setCalendarTitle(`Follow-up: ${item.title}`);
    setCalendarAttendees(item.author_email || '');
    setCalendarLocation('');
    setCalendarStartAt('');
    setCalendarEndAt('');
    setCalendarNotes(
      `Meeting generated from email thread.\nFrom: ${item.author}\nPreferred work window: ${operatorProfile.workdayStart}-${operatorProfile.workdayEnd}\n\n${item.snippet}`,
    );
    setActionNotice('Meeting draft loaded into Action Center.');
  }

  async function stageInboxMutation(item: InboxSummaryItem, actionKind: 'archive' | 'star') {
    try {
      const messageId = item.doc_id.startsWith('gmail:') ? item.doc_id.slice('gmail:'.length) : item.doc_id;
      const next = await stageInboxAction({
        action_kind: actionKind,
        source: item.source,
        message_id: messageId,
        title: item.title,
        author: item.author,
      });
      setActionCenter(next);
      setActionNotice(`${actionKind === 'archive' ? 'Archive' : 'Star'} action staged for approval.`);
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : 'Unable to stage inbox action.');
    }
  }

  async function createFollowUpTask(title: string, notes: string, dueAt: string = '') {
    try {
      recordOperatorSignal('task');
      recordOperatorMemorySignal({ kind: 'task' })
        .then(setDurableOperatorMemory)
        .catch(() => {});
      const next = await stageTask({
        title,
        notes,
        due_at: dueAt,
      });
      setActionCenter(next);
      setActionNotice('Task staged for approval.');
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : 'Unable to stage task.');
    }
  }

  async function rememberContact(item: InboxSummaryItem) {
    const contact = normalizeContactKey(item.author_email || item.author);
    if (!contact) {
      setRelationshipNotice('No contact identifier available for this sender.');
      return;
    }
    try {
      const next = await updateOperatorRelationship({
        contact,
        name: item.author.split('<')[0].trim(),
        importance: 'high',
        relationship: 'priority contact',
        notes: `Observed from inbox subject "${item.title}".`,
      });
      setDurableOperatorMemory(next);
      setRelationshipNotice('Contact memory saved.');
    } catch (error) {
      setRelationshipNotice(error instanceof Error ? error.message : 'Unable to save contact memory.');
    }
  }

  async function rememberMeeting(item: ReminderItem) {
    const key = normalizeMeetingKey(item.title);
    if (!key) {
      setRelationshipNotice('No meeting title available for memory.');
      return;
    }
    try {
      const next = await updateOperatorMeeting({
        key,
        title: item.title,
        importance: item.kind === 'event' ? 'high' : 'normal',
        prep_style: 'executive brief with context, risks, and talking points',
        notes: item.detail || `Observed from reminder at ${item.when}.`,
      });
      setDurableOperatorMemory(next);
      setRelationshipNotice('Meeting memory saved.');
    } catch (error) {
      setRelationshipNotice(error instanceof Error ? error.message : 'Unable to save meeting memory.');
    }
  }

  function prepareMeetingFromReminder(item: ReminderItem) {
    const key = normalizeMeetingKey(item.title);
    const memory = durableMeetings[key];
    injectCommand(buildMeetingPrepPrompt(item, memory));
    setRelationshipNotice(memory ? 'Loaded meeting prep with saved context.' : 'Meeting prep loaded.');
  }

  async function handleGenerateDigest() {
    setDigestBusy(true);
    try {
      const result = await generateDailyDigest();
      setDailyDigest((current) =>
        current
          ? {
              ...current,
              text: result.text,
              generated_at: new Date().toISOString(),
            }
          : {
              text: result.text,
              sections: {},
              sources_used: [],
              generated_at: new Date().toISOString(),
              model_used: selectedModel || serverInfo?.model || '',
              voice_used: speechProfile?.reply_voice_id || '',
              audio_available: false,
            },
      );
      setDigestNotice('Daily brief generated.');
    } catch (error) {
      setDigestNotice(error instanceof Error ? error.message : 'Unable to generate daily brief.');
    } finally {
      setDigestBusy(false);
    }
  }

  async function handleDigestSchedule(enabled: boolean, cron?: string) {
    setDigestScheduleBusy(true);
    try {
      const next = await updateDigestSchedule({
        enabled,
        cron: cron ?? digestSchedule?.cron ?? '0 8 * * *',
      });
      setDigestSchedule(next);
      setDigestNotice(
        enabled ? `Morning brief scheduled: ${next.cron}` : 'Morning brief schedule disabled.',
      );
    } catch (error) {
      setDigestNotice(error instanceof Error ? error.message : 'Unable to update digest schedule.');
    } finally {
      setDigestScheduleBusy(false);
    }
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

  async function handleStageWorkbenchCommand() {
    if (!workbenchCommand.trim()) {
      setWorkbenchNotice('Enter a command first.');
      return;
    }
    setWorkbenchBusy('stage');
    try {
      const next = await stageWorkbenchCommand({
        command: workbenchCommand,
        working_dir: workbenchDirectory.trim() || undefined,
        timeout: workbenchTimeout,
      });
      setWorkbench(next);
      setWorkbenchNotice('Command staged for approval.');
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to stage command.');
    } finally {
      setWorkbenchBusy(null);
    }
  }

  async function handleApproveWorkbench() {
    setWorkbenchBusy('approve');
    try {
      const next = await approveWorkbenchCommand();
      setWorkbench(next);
      setWorkbenchNotice(next.result ? 'Command executed.' : 'No pending command.');
      if (next.result) {
        useAppStore.getState().addLogEntry({
          timestamp: Date.now(),
          level: next.result.status === 'success' ? 'info' : 'error',
          category: 'tool',
          message: `Workbench ${next.result.status}: ${next.result.command}`,
        });
      }
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to approve command.');
    } finally {
      setWorkbenchBusy(null);
    }
  }

  async function handleHoldWorkbench() {
    setWorkbenchBusy('hold');
    try {
      const next = await holdWorkbenchCommand();
      setWorkbench(next);
      setWorkbenchNotice('Pending command held.');
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to hold command.');
    } finally {
      setWorkbenchBusy(null);
    }
  }

  async function handleStageAction() {
    setActionBusy('stage');
    try {
      let next: ActionCenterStatus;
      if (actionMode === 'email') {
        next = await stageEmailDraft({
          recipient: emailRecipient,
          subject: emailSubject,
          body: emailBody,
          provider: 'gmail',
        });
      } else {
        next = await stageCalendarBrief({
          title: calendarTitle,
          start_at: calendarStartAt,
          end_at: calendarEndAt,
          attendees: calendarAttendees,
          location: calendarLocation,
          notes: calendarNotes,
        });
      }
      setActionCenter(next);
      setActionNotice(actionMode === 'email' ? 'Email draft staged for approval.' : 'Calendar plan staged for approval.');
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : 'Unable to stage action.');
    } finally {
      setActionBusy(null);
    }
  }

  async function handleApproveAction() {
    setActionBusy('approve');
    try {
      const next = await approveActionCenterItem();
      setActionCenter(next);
      setActionNotice(next.result?.result || 'Action approved.');
      if (next.result) {
        useAppStore.getState().addLogEntry({
          timestamp: Date.now(),
          level: next.result.status === 'error' ? 'error' : 'info',
          category: 'tool',
          message: `${next.result.action_type}: ${next.result.result}`,
        });
      }
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : 'Unable to approve action.');
    } finally {
      setActionBusy(null);
    }
  }

  async function handleHoldAction() {
    setActionBusy('hold');
    try {
      const next = await holdActionCenterItem();
      setActionCenter(next);
      setActionNotice('Pending action held.');
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : 'Unable to hold action.');
    } finally {
      setActionBusy(null);
    }
  }

  const approvalLabel = activeToolCall
    ? `Tool running: ${activeToolCall.tool}`
    : pendingAction
    ? `${pendingAction.action_type.replace('_', ' ')} is waiting for approval.`
    : pendingWorkbench
    ? 'Workbench command is waiting for approval.'
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

  const reactorMicDisabledReason = !settings.speechEnabled
    ? 'Enable Speech-to-Text in Settings'
    : !hudSpeechAvailable
    ? 'Speech backend not ready'
    : hudSpeechState === 'transcribing'
    ? 'Transcription in progress'
    : '';

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
  const adaptiveFocus = useMemo(() => {
    const modes = [
      {
        label: 'Reply-driven',
        value: operatorSignals.replyDrafts + (durableOperatorMemory?.signals.reply_drafts || 0),
      },
      {
        label: 'Meeting-driven',
        value: operatorSignals.meetingsCreated + (durableOperatorMemory?.signals.meetings_created || 0),
      },
      {
        label: 'Task-driven',
        value: operatorSignals.tasksCreated + (durableOperatorMemory?.signals.tasks_created || 0),
      },
      {
        label: 'Urgency-driven',
        value: operatorSignals.urgentReviews + (durableOperatorMemory?.signals.urgent_reviews || 0),
      },
    ].sort((a, b) => b.value - a.value);
    return modes[0]?.value ? modes[0].label : 'Learning';
  }, [durableOperatorMemory?.signals, operatorSignals]);
  const durableRelationships = durableOperatorMemory?.relationships || {};
  const durableMeetings = durableOperatorMemory?.meetings || {};

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

          <div className="flex flex-wrap items-center gap-3">
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
            {immediateReminder ? (
              <div className="rounded-[1.2rem] border border-amber-300/20 bg-amber-300/[0.08] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.35em] text-amber-200/70">Immediate Focus</div>
                <div className="mt-1 text-sm text-amber-50/92">{immediateReminder.title}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-amber-100/70">
                  {formatReminderMoment(immediateReminder.when)}
                </div>
              </div>
            ) : null}
            <button
              onClick={() => setFocusMode((value) => !value)}
              className="rounded-[1.2rem] border border-cyan-400/15 bg-cyan-400/[0.08] px-4 py-3 text-sm uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
            >
              {focusMode ? 'Full HUD' : 'Focus Mode'}
            </button>
          </div>
        </header>

        <div className={`grid flex-1 gap-4 ${focusMode ? 'xl:grid-cols-[minmax(920px,1fr)]' : 'xl:grid-cols-[280px_minmax(700px,1fr)_340px]'}`}>
          {!focusMode ? <div className="space-y-4">
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
          </div> : null}

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
                    title={reactorMicDisabledReason || (voiceLoop?.active ? 'Disarm always-listening loop' : 'Arm always-listening loop')}
                    className="relative flex h-40 w-40 items-center justify-center rounded-full border border-cyan-200/28 bg-cyan-300/10 shadow-[0_0_50px_rgba(34,211,238,0.16)] transition hover:bg-cyan-300/14 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="absolute inset-3 rounded-full border border-cyan-100/25" />
                    <div className="jarvis-pulse absolute inset-6 rounded-full border border-cyan-200/40" />
                    <Mic className="h-16 w-16 text-cyan-100 drop-shadow-[0_0_18px_rgba(125,211,252,0.7)]" />
                    {reactorMicDisabledReason ? (
                      <div className="absolute -bottom-16 left-1/2 w-56 -translate-x-1/2 rounded-2xl border border-amber-300/20 bg-slate-950/85 px-3 py-2 text-center text-[10px] uppercase tracking-[0.24em] text-amber-200/90 shadow-[0_0_30px_rgba(251,191,36,0.12)]">
                        {reactorMicDisabledReason}
                      </div>
                    ) : null}
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
                  <div className="text-sm leading-7 text-slate-200/78">
                    {pendingAction
                      ? `${pendingAction.title} - ${pendingAction.summary}`
                      : pendingWorkbench
                      ? `${pendingWorkbench.command} [${pendingWorkbench.working_dir}]`
                      : toolSummary}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={pendingAction ? handleApproveAction : handleApproveWorkbench}
                    disabled={(!pendingAction && !pendingWorkbench) || workbenchBusy !== null || actionBusy !== null}
                    className="rounded-[1.1rem] border border-emerald-400/30 bg-emerald-400/12 px-4 py-3 text-sm uppercase tracking-[0.24em] text-emerald-200 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      {workbenchBusy === 'approve' || actionBusy === 'approve' ? 'Running' : 'Approve'}
                    </span>
                  </button>
                  <button
                    onClick={pendingAction ? handleHoldAction : handleHoldWorkbench}
                    disabled={(!pendingAction && !pendingWorkbench) || workbenchBusy !== null || actionBusy !== null}
                    className="rounded-[1.1rem] border border-rose-400/30 bg-rose-400/12 px-4 py-3 text-sm uppercase tracking-[0.24em] text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <XCircle className="h-4 w-4" />
                      Hold
                    </span>
                  </button>
                </div>

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/12 bg-cyan-400/[0.05] px-4 py-3 text-sm text-slate-100/80">
                  {approvalLabel}
                </div>
                <div className="mt-3 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/45 px-4 py-3 text-sm text-slate-200/76">
                  {actionNotice ||
                    workbenchNotice ||
                    (pendingAction
                      ? 'Approve to send the staged email or finalize the calendar plan.'
                      : pendingWorkbench
                      ? 'Approve to execute the staged terminal command.'
                      : 'No staged action right now.')}
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

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">
                      Action Center
                    </div>
                    <div className="flex gap-2">
                      {(['email', 'calendar'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setActionMode(mode)}
                          className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.24em] transition ${
                            actionMode === mode
                              ? 'border-cyan-300/30 bg-cyan-400/[0.12] text-cyan-50'
                              : 'border-cyan-400/10 bg-slate-950/60 text-cyan-200/65 hover:bg-cyan-400/[0.08]'
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                  {actionMode === 'email' ? (
                    <div className="grid gap-3">
                      <input
                        value={emailRecipient}
                        onChange={(event) => setEmailRecipient(event.target.value)}
                        placeholder="recipient@example.com"
                        className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                      <input
                        value={emailSubject}
                        onChange={(event) => setEmailSubject(event.target.value)}
                        placeholder="Subject"
                        className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                      <textarea
                        value={emailBody}
                        onChange={(event) => setEmailBody(event.target.value)}
                        rows={4}
                        placeholder="Write the email body JARVIS should stage."
                        className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      <input
                        value={calendarTitle}
                        onChange={(event) => setCalendarTitle(event.target.value)}
                        placeholder="Meeting title"
                        className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                      <input
                        value={calendarStartAt}
                        onChange={(event) => setCalendarStartAt(event.target.value)}
                        placeholder="2026-04-08T14:00:00+02:00"
                        className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                      <input
                        value={calendarEndAt}
                        onChange={(event) => setCalendarEndAt(event.target.value)}
                        placeholder="2026-04-08T15:00:00+02:00"
                        className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          value={calendarAttendees}
                          onChange={(event) => setCalendarAttendees(event.target.value)}
                          placeholder="Attendees"
                          className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                        />
                        <input
                          value={calendarLocation}
                          onChange={(event) => setCalendarLocation(event.target.value)}
                          placeholder="Location"
                          className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                        />
                      </div>
                      <textarea
                        value={calendarNotes}
                        onChange={(event) => setCalendarNotes(event.target.value)}
                        rows={3}
                        placeholder="Talking points or notes"
                        className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                    </div>
                  )}
                  <button
                    onClick={handleStageAction}
                    disabled={actionBusy !== null}
                    className="mt-3 w-full rounded-[0.9rem] border border-cyan-300/20 bg-cyan-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.28em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actionBusy === 'stage' ? 'Staging' : 'Stage for Approval'}
                  </button>
                </div>

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">
                    Terminal Workbench
                  </div>
                  <div className="grid gap-3">
                    <input
                      value={workbenchCommand}
                      onChange={(event) => setWorkbenchCommand(event.target.value)}
                      placeholder="pwd, git status, ls, python -V ..."
                      className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <div className="grid gap-3 md:grid-cols-[1fr_120px_160px]">
                      <input
                        value={workbenchDirectory}
                        onChange={(event) => setWorkbenchDirectory(event.target.value)}
                        placeholder="Working directory"
                        className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                      <input
                        type="number"
                        min={1}
                        max={300}
                        value={workbenchTimeout}
                        onChange={(event) => setWorkbenchTimeout(Number(event.target.value) || 30)}
                        className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none"
                      />
                      <button
                        onClick={handleStageWorkbenchCommand}
                        disabled={workbenchBusy !== null}
                        className="rounded-[0.9rem] border border-cyan-300/20 bg-cyan-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.28em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {workbenchBusy === 'stage' ? 'Staging' : 'Stage Command'}
                      </button>
                    </div>
                  </div>
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
              </Panel>
            </div>

            <Panel title="Operator Output" kicker="Recent result">
              <div className="rounded-[1.15rem] border border-cyan-400/10 bg-black/30 p-4 font-mono text-xs leading-6 text-slate-200/78">
                <div className="mb-3 text-[10px] uppercase tracking-[0.32em] text-cyan-300/55">
                  {latestActionResult
                    ? `${latestActionResult.status} · ${latestActionResult.title}`
                    : latestWorkbenchResult
                    ? `${latestWorkbenchResult.status} · ${latestWorkbenchResult.command}`
                    : 'No operator output yet'}
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words">
                  {latestActionResult?.result ||
                    latestWorkbenchResult?.output ||
                    'Stage an action or a safe terminal command and approve it from the gate to see output here.'}
                </pre>
              </div>
            </Panel>
          </div>

          {!focusMode ? <div className="space-y-4">
            <Panel title="Daily Brief" kicker="Morning digest">
              <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3">
                <div className="text-sm leading-7 text-slate-200/78">
                  {dailyDigest?.text || 'No daily brief yet. Generate one to get your current priorities, schedule, and message triage in one pass.'}
                </div>
                <div className="mt-3 text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                  {dailyDigest?.generated_at
                    ? `Generated ${new Date(dailyDigest.generated_at).toLocaleString()}`
                    : 'Digest idle'}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={handleGenerateDigest}
                    disabled={digestBusy}
                    className="rounded-[0.95rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {digestBusy ? 'Generating' : 'Generate Brief'}
                  </button>
                  <button
                    onClick={() => dailyDigest?.audio_available && window.open(getDailyDigestAudioUrl(), '_blank', 'noopener,noreferrer')}
                    disabled={!dailyDigest?.audio_available}
                    className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Open Audio
                  </button>
                </div>
                <div className="mt-3 rounded-[1rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                    Schedule
                  </div>
                  <div className="mt-1 text-sm text-slate-200/76">
                    {digestSchedule?.enabled
                      ? `Enabled · ${digestSchedule.cron}`
                      : 'Disabled · generate on demand'}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <button
                      onClick={() => handleDigestSchedule(true, '0 7 * * *')}
                      disabled={digestScheduleBusy}
                      className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      07:00
                    </button>
                    <button
                      onClick={() => handleDigestSchedule(true, '0 8 * * *')}
                      disabled={digestScheduleBusy}
                      className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      08:00
                    </button>
                    <button
                      onClick={() => handleDigestSchedule(false)}
                      disabled={digestScheduleBusy}
                      className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Off
                    </button>
                  </div>
                </div>
                {digestNotice ? (
                  <div className="mt-3 text-sm text-cyan-100/80">{digestNotice}</div>
                ) : null}
              </div>
            </Panel>

            <Panel title="Operator Profile" kicker="Personalization">
              <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3">
                <div className="grid gap-3">
                  <input
                    value={operatorProfile.honorific}
                    onChange={(event) => updateOperatorProfile({ honorific: event.target.value })}
                    placeholder="Honorific"
                    className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <input
                    value={operatorProfile.replyTone}
                    onChange={(event) => updateOperatorProfile({ replyTone: event.target.value })}
                    placeholder="Preferred reply tone"
                    className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <input
                    value={operatorProfile.priorityContacts}
                    onChange={(event) => updateOperatorProfile({ priorityContacts: event.target.value })}
                    placeholder="Priority contacts"
                    className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={operatorProfile.workdayStart}
                      onChange={(event) => updateOperatorProfile({ workdayStart: event.target.value })}
                      placeholder="08:00"
                      className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <input
                      value={operatorProfile.workdayEnd}
                      onChange={(event) => updateOperatorProfile({ workdayEnd: event.target.value })}
                      placeholder="17:00"
                      className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <input
                      type="number"
                      min={15}
                      max={240}
                      value={operatorProfile.prepLeadMinutes}
                      onChange={(event) =>
                        updateOperatorProfile({
                          prepLeadMinutes: Math.max(15, Math.min(240, Number(event.target.value) || 90)),
                        })
                      }
                      placeholder="Prep lead minutes"
                      className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <button
                      onClick={() =>
                        updateOperatorProfile({
                          autoPrepareMeetings: !operatorProfile.autoPrepareMeetings,
                        })
                      }
                      className={`rounded-[0.9rem] border px-4 py-3 text-xs uppercase tracking-[0.22em] transition ${
                        operatorProfile.autoPrepareMeetings
                          ? 'border-cyan-300/20 bg-cyan-400/[0.08] text-cyan-100 hover:bg-cyan-400/[0.14]'
                          : 'border-cyan-400/10 bg-slate-950/70 text-slate-300 hover:bg-cyan-400/[0.08]'
                      }`}
                    >
                      {operatorProfile.autoPrepareMeetings ? 'Auto Prep On' : 'Auto Prep Off'}
                    </button>
                  </div>
                </div>
                <div className="mt-3 rounded-[1rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                    Learned Pattern
                  </div>
                  <div className="mt-1 text-sm text-slate-200/76">{adaptiveFocus}</div>
                  <div className="mt-2 text-sm text-slate-200/70">
                    Frequent contacts: {operatorSignals.topContacts.length ? operatorSignals.topContacts.join(', ') : 'still learning'}
                  </div>
                </div>
                {durableOperatorMemory?.relationships &&
                Object.keys(durableOperatorMemory.relationships).length > 0 ? (
                  <div className="mt-3 rounded-[1rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                      Contact Memory
                    </div>
                    <div className="mt-2 space-y-2">
                      {Object.entries(durableOperatorMemory.relationships)
                        .slice(0, 3)
                        .map(([contact, relationship]) => (
                          <div
                            key={contact}
                            className="rounded-[0.9rem] border border-cyan-400/10 bg-black/20 px-3 py-2"
                          >
                            <div className="text-xs uppercase tracking-[0.16em] text-cyan-50/90">
                              {relationship.name || contact}
                            </div>
                            <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-cyan-300/60">
                              {relationship.relationship || 'known contact'} · {relationship.importance || 'normal'}
                            </div>
                            {relationship.notes ? (
                              <div className="mt-1 text-xs leading-5 text-slate-300/72">
                                {relationship.notes}
                              </div>
                            ) : null}
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}
                {durableOperatorMemory?.meetings &&
                Object.keys(durableOperatorMemory.meetings).length > 0 ? (
                  <div className="mt-3 rounded-[1rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                      Meeting Memory
                    </div>
                    <div className="mt-2 space-y-2">
                      {Object.entries(durableOperatorMemory.meetings)
                        .slice(0, 3)
                        .map(([key, meeting]) => (
                          <div
                            key={key}
                            className="rounded-[0.9rem] border border-cyan-400/10 bg-black/20 px-3 py-2"
                          >
                            <div className="text-xs uppercase tracking-[0.16em] text-cyan-50/90">
                              {meeting.title || key}
                            </div>
                            <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-cyan-300/60">
                              {meeting.prep_style || 'default prep'} · {meeting.importance || 'normal'}
                            </div>
                            {meeting.notes ? (
                              <div className="mt-1 text-xs leading-5 text-slate-300/72">
                                {meeting.notes}
                              </div>
                            ) : null}
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}
                {relationshipNotice ? (
                  <div className="mt-3 text-sm text-cyan-100/80">{relationshipNotice}</div>
                ) : null}
              </div>
            </Panel>

            <Panel title="Inbox Snapshot" kicker="Recent mail">
              <div className="space-y-3">
                {sortedInboxSummary.length ? (
                  sortedInboxSummary.map((item) => {
                    const relationshipKey = normalizeContactKey(item.author_email || item.author);
                    const relationship = durableRelationships[relationshipKey];
                    return (
                      <div
                      key={`${item.timestamp}-${item.title}-${item.author}`}
                      className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3"
                    >
                      <div className="text-sm uppercase tracking-[0.16em] text-cyan-50/92">
                        {item.title}
                      </div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                        {item.author} · {item.source || 'email'}
                      </div>
                      {relationship ? (
                        <div className="mt-2 rounded-[0.95rem] border border-cyan-400/10 bg-cyan-400/[0.05] px-3 py-2">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-300/60">
                            Contact memory
                          </div>
                          <div className="mt-1 text-sm text-cyan-50/88">
                            {relationship.relationship || 'known contact'} · {relationship.importance || 'normal'}
                          </div>
                          {relationship.notes ? (
                            <div className="mt-1 text-xs leading-5 text-slate-300/72">
                              {relationship.notes}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="mt-2 text-sm leading-6 text-slate-200/72">
                        {item.snippet || 'No preview available.'}
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <button
                          onClick={() => prepareReplyDraft(item)}
                          disabled={!item.author_email}
                          className="rounded-[0.95rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <span className="flex items-center justify-center gap-2">
                            <Reply className="h-3.5 w-3.5" />
                            Reply Draft
                          </span>
                        </button>
                        <button
                          onClick={() => triageInboxItem(item)}
                          className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                        >
                          Triage
                        </button>
                        <button
                          onClick={() => loadUrgentAssessment(item)}
                          className="rounded-[0.95rem] border border-amber-300/18 bg-amber-300/[0.08] px-3 py-2 text-xs uppercase tracking-[0.22em] text-amber-100 transition hover:bg-amber-300/[0.14]"
                        >
                          <span className="flex items-center justify-center gap-2">
                            <Siren className="h-3.5 w-3.5" />
                            Urgent
                          </span>
                        </button>
                        <button
                          onClick={() => prepareFollowUp(item)}
                          disabled={!item.author_email}
                          className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Reply Later
                        </button>
                        <button
                          onClick={() => convertInboxItemToMeeting(item)}
                          className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] sm:col-span-2"
                        >
                          Convert To Meeting
                        </button>
                        <button
                          onClick={() => rememberContact(item)}
                          className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                        >
                          Remember Contact
                        </button>
                        <button
                          onClick={() => stageInboxMutation(item, 'archive')}
                          disabled={!item.supports_mutation}
                          className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Archive
                        </button>
                        <button
                          onClick={() => stageInboxMutation(item, 'star')}
                          disabled={!item.supports_mutation}
                          className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <span className="flex items-center justify-center gap-2">
                            <Flag className="h-3.5 w-3.5" />
                            Star
                          </span>
                        </button>
                        <button
                          onClick={() =>
                            createFollowUpTask(
                              `Follow up: ${item.title}`,
                              `Follow up on email from ${item.author}.\n\n${item.snippet}`,
                            )
                          }
                          className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] sm:col-span-2"
                        >
                          Create Task
                        </button>
                      </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-200/72">
                    No synced inbox messages yet. Connect Gmail or Outlook and run sync to populate this rail.
                  </div>
                )}
              </div>
            </Panel>

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

            <Panel title="Task Rail" kicker="Follow-through">
              <div className="space-y-3">
                {taskSummary.length ? (
                  taskSummary.map((item) => (
                    <div
                      key={`${item.timestamp}-${item.title}-${item.due}`}
                      className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3"
                    >
                      <div className="text-sm uppercase tracking-[0.16em] text-cyan-50/92">
                        {item.title}
                      </div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                        {item.status || 'needsAction'}{item.due ? ` · due ${item.due}` : ''}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-200/72">
                        {item.notes || 'No task notes available.'}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-200/72">
                    No synced tasks yet. Connect Google Tasks and sync to build a follow-through rail.
                  </div>
                )}
              </div>
            </Panel>

            <Panel title="Prep Queue" kicker="Upcoming meetings">
              <div className="space-y-3">
                {prepQueue.length ? (
                  prepQueue.map((item) => (
                    <div
                      key={`${item.title}-${item.when}`}
                      className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3"
                    >
                      <div className="text-sm uppercase tracking-[0.16em] text-cyan-50/92">
                        {item.title}
                      </div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                        {formatReminderMoment(item.when)}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-200/72">
                        {item.memory?.notes || item.detail || 'No additional detail.'}
                      </div>
                      <div className="mt-2 text-[10px] uppercase tracking-[0.22em] text-cyan-300/60">
                        {item.memory?.prep_style || 'default prep'} · {item.memory?.importance || 'normal'}
                      </div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                        Auto prep window: {operatorProfile.prepLeadMinutes} min
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <button
                          onClick={() => prepareMeetingFromReminder(item)}
                          className="rounded-[0.95rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                        >
                          Launch Prep
                        </button>
                        <button
                          onClick={() => rememberMeeting(item)}
                          className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                        >
                          Update Memory
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-200/72">
                    No high-priority meeting prep queued yet. Upcoming events within the next day will appear here.
                  </div>
                )}
              </div>
            </Panel>

            <Panel title="Reminder Rail" kicker="Next up">
              <div className="space-y-3">
                {reminders.length ? (
                  reminders.map((item) => {
                    const meetingMemory =
                      item.kind === 'event' ? durableMeetings[normalizeMeetingKey(item.title)] : null;
                    return (
                      <div
                        key={`${item.kind}-${item.when}-${item.title}`}
                        className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3"
                      >
                      <div className="text-sm uppercase tracking-[0.16em] text-cyan-50/92">
                        {item.title}
                      </div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                        {item.kind} · {item.when}
                      </div>
                      {meetingMemory ? (
                        <div className="mt-2 rounded-[0.95rem] border border-cyan-400/10 bg-cyan-400/[0.05] px-3 py-2">
                          <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-300/60">
                            Saved prep context
                          </div>
                          <div className="mt-1 text-sm text-cyan-50/88">
                            {meetingMemory.prep_style || 'default prep'} · {meetingMemory.importance || 'normal'}
                          </div>
                          {meetingMemory.notes ? (
                            <div className="mt-1 text-xs leading-5 text-slate-300/72">
                              {meetingMemory.notes}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="mt-2 text-sm leading-6 text-slate-200/72">
                        {item.detail || 'No additional detail.'}
                      </div>
                      {item.kind === 'event' ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <button
                            onClick={() => prepareMeetingFromReminder(item)}
                            className="rounded-[0.95rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                          >
                            Meeting Prep
                          </button>
                          <button
                            onClick={() => rememberMeeting(item)}
                            className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                          >
                            Remember Meeting
                          </button>
                        </div>
                      ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-200/72">
                    No near-term reminders yet. Upcoming calendar events and due tasks will surface here.
                  </div>
                )}
              </div>
            </Panel>

          </div> : null}
        </div>
      </div>
    </section>
  );
}
