import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  AudioLines,
  BookOpen,
  Brain,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Flag,
  Folder,
  Globe,
  Mail,
  Mic,
  Monitor,
  Radio,
  Reply,
  Siren,
  Sparkles,
  Shield,
  Terminal,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  checkHealth,
  approveActionCenterItem,
  analyzeVision,
  analyzeVisionMulti,
  extractVisionText,
  extractVisionTextMulti,
  suggestVisionActions,
  approveCodeEdit,
  approveWorkbenchCommand,
  createManagedAgent,
  fetchActionCenterStatus,
  fetchAutomationLogs,
  fetchAutomationStatus,
  fetchCodingStatus,
  fetchDailyDigest,
  fetchDesktopState,
  fetchDigestSchedule,
  fetchInboxSummary,
  executeJarvisIntent,
  fetchManagedAgents,
  fetchOperatorMemory,
  parseJarvisIntent,
  fetchReminders,
  fetchSpeechHealth,
  fetchSpeechProfile,
  fetchWorkspaceChecks,
  fetchWorkspaceRepos,
  fetchTaskSummary,
  fetchWorkspaceSummary,
  fetchVoiceLoopStatus,
  fetchWorkbenchStatus,
  generateDailyDigest,
  getDailyDigestAudioUrl,
  holdActionCenterItem,
  holdCodeEdit,
  holdWorkbenchCommand,
  prepareWorkspaceCommit,
  prepareWorkspacePush,
  recordOperatorMemorySignal,
  readCodingFile,
  registerWorkspaceRepo,
  runManagedAgent,
  selectWorkspaceRepo,
  startVoiceLoop,
  stageCalendarBrief,
  stageCodeEdit,
  stageEmailDraft,
  stageInboxAction,
  stageTask,
  stageWorkbenchCommand,
  stopVoiceLoop,
  synthesizeSpeech,
  updateAutomationRoutine,
  updateDigestSchedule,
  updateOperatorMeeting,
  updateOperatorProject,
  updateOperatorRelationship,
  updateOperatorVisualObservation,
  updateVoiceLoopState,
  type ActionCenterStatus,
  type AutomationLogEntry,
  type AutomationStatus,
  type CodingWorkspaceStatus,
  type DailyDigest,
  type DesktopState,
  type DigestSchedule,
  type DurableOperatorMemory,
  type InboxSummaryItem,
  type JarvisIntent,
  type JarvisIntentExecution,
  type VisionAnalysisResult,
  type VisionTextExtractionResult,
  type VisionSuggestedActionsResult,
  type ReminderItem,
  type SpeechProfile,
  type TaskSummaryItem,
  type VoiceLoopStatus,
  type WorkspaceChecks,
  type WorkspaceSummary,
  type WorkspaceRepoCatalog,
  type WorkbenchStatus,
} from './lib/api';
import { listConnectors } from './lib/connectors-api';
import { useAppStore } from './lib/store';
import type { ChatMessage, ToolCallInfo } from './types';
import { InputArea } from './components/Chat/InputArea';
import { useSpeech } from './hooks/useSpeech';

function getApiBase() {
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (envBase) return envBase.replace(/\/$/, '');
  return typeof window !== 'undefined' ? window.location.origin : '';
}

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

const DISMISSED_AUTOMATION_ALERTS_KEY = 'jarvis-dismissed-automation-alerts';
const REVIEW_QUEUE_STATE_KEY = 'jarvis-review-queue-state';
const CODING_TASKS_KEY = 'jarvis-coding-tasks';
const DESKTOP_DRAFT_KEY = 'jarvis-desktop-draft';

function loadDismissedAutomationAlerts() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DISMISSED_AUTOMATION_ALERTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function loadReviewQueueState() {
  if (typeof window === 'undefined') return {} as Record<string, 'pending' | 'in_progress' | 'done'>;
  try {
    const raw = window.localStorage.getItem(REVIEW_QUEUE_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, 'pending' | 'in_progress' | 'done'] =>
        ['pending', 'in_progress', 'done'].includes(String(entry[1])),
      ),
    );
  } catch {
    return {};
  }
}

function loadCodingTasks() {
  if (typeof window === 'undefined') return [] as Array<{
    id: string;
    title: string;
    filePath: string;
    mode: 'review' | 'debug' | 'inspect' | 'fix';
    status: 'pending' | 'in_progress' | 'done';
  }>;
  try {
    const raw = window.localStorage.getItem(CODING_TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is {
            id: string;
            title: string;
            filePath: string;
            mode: 'review' | 'debug' | 'inspect' | 'fix';
            status: 'pending' | 'in_progress' | 'done';
          } =>
            item &&
            typeof item.id === 'string' &&
            typeof item.title === 'string' &&
            typeof item.filePath === 'string' &&
            ['review', 'debug', 'inspect', 'fix'].includes(String(item.mode)) &&
            ['pending', 'in_progress', 'done'].includes(String(item.status)),
        )
      : [];
  } catch {
    return [];
  }
}

function loadDesktopDraft() {
  if (typeof window === 'undefined') {
    return null as null | { target: string; content: string; createdAt: number };
  }
  try {
    const raw = window.localStorage.getItem(DESKTOP_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.target === 'string' &&
      typeof parsed.content === 'string' &&
      typeof parsed.createdAt === 'number'
    ) {
      return parsed as { target: string; content: string; createdAt: number };
    }
  } catch {}
  return null;
}

function formatRoutineLabel(routineId: AutomationLogEntry['routine_id']) {
  switch (routineId) {
    case 'daily_ops':
      return 'Daily Ops';
    case 'inbox_sweep':
      return 'Inbox Sweep';
    case 'meeting_prep':
      return 'Meeting Prep';
    default:
      return routineId;
  }
}

function buildAutomationAnnouncement(log: AutomationLogEntry) {
  const label = formatRoutineLabel(log.routine_id);
  return log.success ? `${label} completed.` : `${label} needs attention.`;
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
  const [connectedConnectorIds, setConnectedConnectorIds] = useState<string[]>([]);
  const [agentNotice, setAgentNotice] = useState('');
  const [agentActionBusy, setAgentActionBusy] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [voiceLoop, setVoiceLoop] = useState<VoiceLoopStatus | null>(null);
  const [speechProfile, setSpeechProfile] = useState<SpeechProfile | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [workbench, setWorkbench] = useState<WorkbenchStatus | null>(null);
  const [actionCenter, setActionCenter] = useState<ActionCenterStatus | null>(null);
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus | null>(null);
  const [automationLogs, setAutomationLogs] = useState<AutomationLogEntry[]>([]);
  const [automationNotice, setAutomationNotice] = useState('');
  const [dismissedAutomationAlerts, setDismissedAutomationAlerts] = useState<string[]>(() =>
    loadDismissedAutomationAlerts(),
  );
  const [alertFilter, setAlertFilter] = useState<'all' | 'errors' | 'ready'>('all');
  const [reviewQueueState, setReviewQueueState] = useState<Record<string, 'pending' | 'in_progress' | 'done'>>(
    () => loadReviewQueueState(),
  );
  const [codingTasks, setCodingTasks] = useState<
    Array<{
      id: string;
      title: string;
      filePath: string;
      mode: 'review' | 'debug' | 'inspect' | 'fix';
      status: 'pending' | 'in_progress' | 'done';
    }>
  >(() => loadCodingTasks());
  const [desktopDraft, setDesktopDraft] = useState<null | { target: string; content: string; createdAt: number }>(
    () => loadDesktopDraft(),
  );
  const [workspaceSummary, setWorkspaceSummary] = useState<WorkspaceSummary | null>(null);
  const [workspaceRepos, setWorkspaceRepos] = useState<WorkspaceRepoCatalog | null>(null);
  const [workspaceChecks, setWorkspaceChecks] = useState<WorkspaceChecks | null>(null);
  const [codingWorkspace, setCodingWorkspace] = useState<CodingWorkspaceStatus | null>(null);
  const [editorFilePath, setEditorFilePath] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorOriginalContent, setEditorOriginalContent] = useState('');
  const [editorBusy, setEditorBusy] = useState<'load' | 'stage' | 'approve' | 'hold' | null>(null);
  const [editorNotice, setEditorNotice] = useState('');
  const [gitCommitMessage, setGitCommitMessage] = useState('');
  const [repoPathInput, setRepoPathInput] = useState('');
  const [repoCloneUrl, setRepoCloneUrl] = useState('');
  const [repoBusy, setRepoBusy] = useState<'register' | 'select' | null>(null);
  const [repoNotice, setRepoNotice] = useState('');
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
  const [desktopState, setDesktopState] = useState<DesktopState | null>(null);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [digestNotice, setDigestNotice] = useState('');
  const [digestBusy, setDigestBusy] = useState(false);
  const [digestScheduleBusy, setDigestScheduleBusy] = useState(false);
  const [relationshipNotice, setRelationshipNotice] = useState('');
  const [projectMemoryNotice, setProjectMemoryNotice] = useState('');
  const [voiceSensitivity, setVoiceSensitivity] = useState<'sensitive' | 'balanced' | 'strict'>('balanced');
  const [intentCommand, setIntentCommand] = useState('');
  const [intentBusy, setIntentBusy] = useState<'classify' | 'run' | 'capture' | null>(null);
  const [intentPreview, setIntentPreview] = useState<JarvisIntent | null>(null);
  const [intentExecution, setIntentExecution] = useState<JarvisIntentExecution | null>(null);
  const [visionAnalysis, setVisionAnalysis] = useState<VisionAnalysisResult | null>(null);
  const [visionTextExtraction, setVisionTextExtraction] = useState<VisionTextExtractionResult | null>(null);
  const [visionSuggestedActions, setVisionSuggestedActions] = useState<VisionSuggestedActionsResult | null>(null);
  const [visionBusy, setVisionBusy] = useState(false);
  const [screenSnapshot, setScreenSnapshot] = useState<{
    dataUrl: string;
    capturedAt: number;
    source: 'screen' | 'upload';
    label: string;
  } | null>(null);
  const [screenDeck, setScreenDeck] = useState<
    Array<{
      dataUrl: string;
      capturedAt: number;
      source: 'screen' | 'upload';
      label: string;
    }>
  >([]);
  const [screenContextNote, setScreenContextNote] = useState('');
  const lastSyncedPhaseRef = useRef('');
  const hasAutoRequestedDigestRef = useRef(false);
  const lastSpokenDigestRef = useRef('');
  const lastChimedReminderRef = useRef('');
  const lastAutoPrepReminderRef = useRef('');
  const lastAutoInboxRef = useRef('');
  const lastSpokenMessageRef = useRef<string>('');
  const lastAutomationAnnouncementRef = useRef('');
  const audioUrlRef = useRef<string | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const lastAutoValidationFailureRef = useRef('');
  const lastAutoValidationSuccessRef = useRef('');

  const {
    state: hudSpeechState,
    error: hudSpeechError,
    available: hudSpeechAvailable,
    telemetry: hudSpeechTelemetry,
    startContinuousListening,
    stopContinuousListening,
  } = useSpeech();
  const voicePersona = useMemo(() => {
    const tone = (durableOperatorMemory?.profile.reply_tone || operatorProfile.replyTone || '').toLowerCase();
    let speed = speechProfile?.reply_speed ?? 0.95;
    if (tone.includes('concise') || tone.includes('direct')) speed += 0.06;
    if (tone.includes('confident')) speed -= 0.03;
    if (tone.includes('calm') || tone.includes('warm')) speed -= 0.06;
    return {
      speed: Math.max(0.8, Math.min(speed, 1.08)),
      honorific: durableOperatorMemory?.profile.honorific || operatorProfile.honorific || 'sir',
    };
  }, [durableOperatorMemory?.profile.honorific, durableOperatorMemory?.profile.reply_tone, operatorProfile.honorific, operatorProfile.replyTone, speechProfile?.reply_speed]);

  useEffect(() => {
    let cancelled = false;

    const refreshLiveStatus = async () => {
      const [action, automation, automationLogResult, coding, digest, digestSched, operatorMemory, inbox, tasks, reminderItems, health, speech, agents, connectors, loop, profile, wb, workspace, repos, checks, desktop] = await Promise.allSettled([
        fetchActionCenterStatus(),
        fetchAutomationStatus(),
        fetchAutomationLogs(),
        fetchCodingStatus(),
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
        fetchWorkspaceSummary(),
        fetchWorkspaceRepos(),
        fetchWorkspaceChecks(),
        fetchDesktopState(),
      ]);

      if (cancelled) return;

      if (action.status === 'fulfilled') setActionCenter(action.value);
      if (automation.status === 'fulfilled') setAutomationStatus(automation.value);
      if (automationLogResult.status === 'fulfilled') setAutomationLogs(automationLogResult.value.items || []);
      if (coding.status === 'fulfilled') setCodingWorkspace(coding.value);
      if (digest.status === 'fulfilled') setDailyDigest(digest.value);
      if (digestSched.status === 'fulfilled') setDigestSchedule(digestSched.value);
      if (operatorMemory.status === 'fulfilled') setDurableOperatorMemory(operatorMemory.value);
      if (inbox.status === 'fulfilled') setInboxSummary(inbox.value);
      if (tasks.status === 'fulfilled') setTaskSummary(tasks.value);
      if (reminderItems.status === 'fulfilled') setReminders(reminderItems.value);
      if (workspace.status === 'fulfilled') setWorkspaceSummary(workspace.value);
      if (repos.status === 'fulfilled') setWorkspaceRepos(repos.value);
      if (checks.status === 'fulfilled') setWorkspaceChecks(checks.value);
      if (desktop.status === 'fulfilled') setDesktopState(desktop.value);
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
        setConnectedConnectorIds(Array.from(ids));
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
    if (!repoNotice) return;
    const timeout = window.setTimeout(() => setRepoNotice(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [repoNotice]);

  useEffect(() => {
    if (!editorNotice) return;
    const timeout = window.setTimeout(() => setEditorNotice(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [editorNotice]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CODING_TASKS_KEY, JSON.stringify(codingTasks));
  }, [codingTasks]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!desktopDraft) {
      window.localStorage.removeItem(DESKTOP_DRAFT_KEY);
      return;
    }
    window.localStorage.setItem(DESKTOP_DRAFT_KEY, JSON.stringify(desktopDraft));
  }, [desktopDraft]);

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
    if (!automationNotice) return;
    const timeout = window.setTimeout(() => setAutomationNotice(''), 7000);
    return () => window.clearTimeout(timeout);
  }, [automationNotice]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      DISMISSED_AUTOMATION_ALERTS_KEY,
      JSON.stringify(dismissedAutomationAlerts),
    );
  }, [dismissedAutomationAlerts]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(REVIEW_QUEUE_STATE_KEY, JSON.stringify(reviewQueueState));
  }, [reviewQueueState]);

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
      text: buildSpokenLine(dailyDigest.text, 'digest'),
      backend: speechProfile.reply_backend,
      voice_id: speechProfile.reply_voice_id,
      speed: voicePersona.speed,
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
  }, [dailyDigest?.generated_at, dailyDigest?.text, speechProfile, voicePersona.speed]);

  useEffect(() => {
    const latestLog = automationLogs[0] ?? null;
    if (!latestLog?.started_at) return;
    const announcementKey = `${latestLog.task_id}:${latestLog.started_at}:${latestLog.success}`;
    if (lastAutomationAnnouncementRef.current === announcementKey) return;
    lastAutomationAnnouncementRef.current = announcementKey;

    const announcement = buildAutomationAnnouncement(latestLog);
    const detail = latestLog.success
      ? latestLog.result || 'Background routine completed and results are ready.'
      : latestLog.error || 'Background routine reported an error.';
    setAutomationNotice(`${announcement} ${detail}`);

    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(`JARVIS · ${formatRoutineLabel(latestLog.routine_id)}`, {
          body: detail,
          silent: true,
        });
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    }

    if (!speechProfile?.auto_speak || streamState.isStreaming || hudSpeechState === 'recording' || hudSpeechState === 'transcribing') {
      return;
    }

    let cancelled = false;
    synthesizeSpeech({
      text: buildSpokenLine(announcement, 'announcement'),
      backend: speechProfile.reply_backend,
      voice_id: speechProfile.reply_voice_id,
      speed: voicePersona.speed,
      output_format: 'wav',
    })
      .then((blob) => {
        if (cancelled) return;
        audioElementRef.current?.pause();
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        const audio = new Audio(url);
        audioElementRef.current = audio;
        audio.play().catch(() => {});
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [automationLogs, hudSpeechState, speechProfile, streamState.isStreaming, voicePersona.speed]);

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
  const pendingCodeEdit = codingWorkspace?.pending ?? null;
  const pendingWorkbench = workbench?.pending ?? null;
  const latestActionResult = actionCenter?.history?.[0] ?? null;
  const latestCodeResult = codingWorkspace?.history?.[0] ?? null;
  const latestWorkbenchResult = workbench?.history?.[0] ?? null;
  const latestValidationFailure = useMemo(() => {
    if (!latestWorkbenchResult || latestWorkbenchResult.status !== 'error') return null;
    const command = latestWorkbenchResult.command.toLowerCase();
    const isValidation =
      command.includes('pytest') ||
      command.includes('ruff') ||
      command.includes('npm test') ||
      command.includes('npm run lint') ||
      command.includes('npm run build') ||
      command.includes('cargo test') ||
      command.includes('cargo check');
    return isValidation ? latestWorkbenchResult : null;
  }, [latestWorkbenchResult]);
  const latestValidationSuccess = useMemo(() => {
    if (!latestWorkbenchResult || latestWorkbenchResult.status !== 'success') return null;
    const command = latestWorkbenchResult.command.toLowerCase();
    const isValidation =
      command.includes('pytest') ||
      command.includes('ruff') ||
      command.includes('npm test') ||
      command.includes('npm run lint') ||
      command.includes('npm run build') ||
      command.includes('cargo test') ||
      command.includes('cargo check');
    if (!isValidation) return null;
    if (latestCodeResult && latestWorkbenchResult.completed_at < latestCodeResult.completed_at) return null;
    return latestWorkbenchResult;
  }, [latestCodeResult, latestWorkbenchResult]);
  const latestAutomationLog = automationLogs[0] ?? null;
  const activeAutomationAlerts = useMemo(
    () =>
      [...automationLogs]
        .sort((left, right) => {
          if (left.success !== right.success) return left.success ? 1 : -1;
          return new Date(right.started_at).getTime() - new Date(left.started_at).getTime();
        })
        .slice(0, 4)
        .filter((item) => !dismissedAutomationAlerts.includes(`${item.task_id}:${item.started_at}`)),
    [automationLogs, dismissedAutomationAlerts],
  );
  const filteredAutomationAlerts = useMemo(
    () =>
      activeAutomationAlerts.filter((item) => {
        if (alertFilter === 'errors') return !item.success;
        if (alertFilter === 'ready') return item.success;
        return true;
      }),
    [activeAutomationAlerts, alertFilter],
  );
  const alertCounts = useMemo(
    () => ({
      all: activeAutomationAlerts.length,
      errors: activeAutomationAlerts.filter((item) => !item.success).length,
      ready: activeAutomationAlerts.filter((item) => item.success).length,
    }),
    [activeAutomationAlerts],
  );
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
  const inboxFocusQueue = useMemo(
    () => sortedInboxSummary.slice(0, Math.max(1, Math.min(5, operatorProfile.inboxFocusCount || 3))),
    [operatorProfile.inboxFocusCount, sortedInboxSummary],
  );
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
  const structuredReviewQueue = useMemo(() => {
    const files = workspaceSummary?.changed_files || [];
    return files.slice(0, 8).map((filePath, index) => ({
      filePath,
      status: reviewQueueState[filePath] || (index === 0 ? 'in_progress' : 'pending'),
    }));
  }, [reviewQueueState, workspaceSummary?.changed_files]);
  const nextReviewQueueItem = useMemo(
    () => structuredReviewQueue.find((item) => item.status !== 'done') || structuredReviewQueue[0] || null,
    [structuredReviewQueue],
  );
  const nextCodingTask = useMemo(
    () => codingTasks.find((task) => task.status !== 'done') || codingTasks[0] || null,
    [codingTasks],
  );
  useEffect(() => {
    if (!latestValidationFailure) {
      lastAutoValidationFailureRef.current = '';
      return;
    }
    const failureKey = latestValidationFailure.id;
    if (lastAutoValidationFailureRef.current === failureKey) return;
    lastAutoValidationFailureRef.current = failureKey;

    const likelyFile =
      latestCodeResult?.file_path ||
      editorFilePath ||
      nextReviewQueueItem?.filePath ||
      workspaceSummary?.changed_files?.[0] ||
      '';

    if (likelyFile) {
      setCodingTasks((current) => {
        const exists = current.some(
          (item) => item.filePath === likelyFile && item.mode === 'fix' && item.status !== 'done',
        );
        if (exists) return current;
        return [
          {
            id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            title: `Fix validation failure in ${likelyFile}`,
            filePath: likelyFile,
            mode: 'fix',
            status: 'pending',
          },
          ...current,
        ];
      });
    }

    if (!streamState.isStreaming && !pendingAction && !pendingCodeEdit && !pendingWorkbench) {
      injectCommand(
        buildValidationFixPrompt(
          latestValidationFailure.command,
          latestValidationFailure.output,
          likelyFile || undefined,
        ),
      );
      setWorkbenchNotice('Validation failure detected. Fix prompt loaded into the command deck.');
    }
  }, [
    editorFilePath,
    latestCodeResult?.file_path,
    latestValidationFailure,
    nextReviewQueueItem?.filePath,
    pendingAction,
    pendingCodeEdit,
    pendingWorkbench,
    streamState.isStreaming,
    workspaceSummary?.changed_files,
  ]);
  useEffect(() => {
    if (!latestValidationSuccess) {
      lastAutoValidationSuccessRef.current = '';
      return;
    }
    const successKey = latestValidationSuccess.id;
    if (lastAutoValidationSuccessRef.current === successKey) return;
    lastAutoValidationSuccessRef.current = successKey;

    const likelyFile =
      latestCodeResult?.file_path ||
      editorFilePath ||
      nextReviewQueueItem?.filePath ||
      workspaceSummary?.changed_files?.[0] ||
      '';
    const suggestedMessage = buildSuggestedCommitMessage(likelyFile || undefined);

    if (!gitCommitMessage.trim()) {
      setGitCommitMessage(suggestedMessage);
    }

    if (likelyFile) {
      setCodingTasks((current) =>
        current.map((item) =>
          item.filePath === likelyFile && item.status !== 'done' ? { ...item, status: 'done' } : item,
        ),
      );
      setReviewQueueState((current) =>
        current[likelyFile] && current[likelyFile] !== 'done' ? { ...current, [likelyFile]: 'done' } : current,
      );
    }

    if (!pendingAction && !pendingCodeEdit && !pendingWorkbench) {
      prepareCommitCommand(suggestedMessage, 'Validation passed. Commit command prepared and ready for approval.');
    } else {
      setWorkbenchNotice('Validation passed. Commit message drafted for the next approval step.');
    }
  }, [
    editorFilePath,
    gitCommitMessage,
    latestCodeResult?.file_path,
    latestValidationSuccess,
    nextReviewQueueItem?.filePath,
    pendingAction,
    pendingCodeEdit,
    pendingWorkbench,
    workspaceSummary?.changed_files,
  ]);
  const commanderQueue = useMemo(() => {
    const items: Array<{
      id: string;
      priority: number;
      label: string;
      title: string;
      detail: string;
      actionLabel: string;
      action: () => void;
    }> = [];

    if (pendingAction) {
      items.push({
        id: `approval-action-${pendingAction.id}`,
        priority: 100,
        label: 'Approval',
        title: pendingAction.title,
        detail: `${pendingAction.action_type.replace('_', ' ')} is waiting in the approval gate.`,
        actionLabel: 'Open Gate',
        action: () => setFocusMode(false),
      });
    }

    if (pendingWorkbench) {
      items.push({
        id: `approval-workbench-${pendingWorkbench.id}`,
        priority: 95,
        label: 'Workbench',
        title: pendingWorkbench.command,
        detail: 'Terminal work is staged and waiting for approval.',
        actionLabel: 'Review Command',
        action: () => setFocusMode(false),
      });
    }

    if (pendingCodeEdit) {
      items.push({
        id: `approval-code-${pendingCodeEdit.id}`,
        priority: 93,
        label: 'Code Edit',
        title: pendingCodeEdit.file_path,
        detail: `Staged diff with ${pendingCodeEdit.line_count} lines is waiting for approval.`,
        actionLabel: 'Review Diff',
        action: () => setFocusMode(false),
      });
    }

    activeAutomationAlerts
      .filter((item) => !item.success)
      .slice(0, 2)
      .forEach((item, index) => {
        items.push({
          id: `alert-${item.task_id}-${item.started_at}`,
          priority: 90 - index,
          label: 'Routine Error',
          title: formatRoutineLabel(item.routine_id),
          detail: item.error || 'Background routine needs attention.',
          actionLabel: 'Open Alert',
          action: () => setAlertFilter('errors'),
        });
      });

    if (prepQueue[0]) {
      items.push({
        id: `meeting-${prepQueue[0].title}-${prepQueue[0].when}`,
        priority: 70,
        label: 'Meeting Prep',
        title: prepQueue[0].title,
        detail: `Upcoming ${formatReminderMoment(prepQueue[0].when)}${prepQueue[0].memory ? ' with saved context' : ''}.`,
        actionLabel: 'Prep Meeting',
        action: () => prepareMeetingFromReminder(prepQueue[0]),
      });
    }

    if (inboxFocusQueue[0]) {
      items.push({
        id: `inbox-${inboxFocusQueue[0].doc_id}`,
        priority: 60,
        label: 'Inbox',
        title: inboxFocusQueue[0].title,
        detail: `From ${inboxFocusQueue[0].author}. ${inboxFocusQueue[0].snippet || 'Priority message ready for draft.'}`,
        actionLabel: 'Draft Reply',
        action: () => prepareReplyDraft(inboxFocusQueue[0]),
      });
    }

    if (nextReviewQueueItem) {
      items.push({
        id: `review-${nextReviewQueueItem.filePath}`,
        priority: nextReviewQueueItem.status === 'in_progress' ? 58 : 55,
        label: 'Code Review',
        title: nextReviewQueueItem.filePath,
        detail:
          nextReviewQueueItem.status === 'in_progress'
            ? 'File review is already in motion. Continue the current repo pass.'
            : 'Changed file is waiting in the review queue.',
        actionLabel: nextReviewQueueItem.status === 'in_progress' ? 'Continue Review' : 'Start Review',
        action: () => loadFileCodingPrompt(nextReviewQueueItem.filePath, 'review'),
      });
    }

    if (latestValidationFailure) {
      items.push({
        id: `validation-${latestValidationFailure.id}`,
        priority: 57,
        label: 'Validation',
        title: latestValidationFailure.command,
        detail: 'Latest validation run failed. Load a fix prompt or rerun after another patch.',
        actionLabel: 'Fix Failure',
        action: () =>
          injectCommand(
            `A validation command failed.\nCommand: ${latestValidationFailure.command}\nOutput:\n${latestValidationFailure.output}\nDiagnose the root cause and propose the next safe code change.`,
          ),
      });
    }

    if (latestValidationSuccess) {
      items.push({
        id: `validation-success-${latestValidationSuccess.id}`,
        priority: 55,
        label: 'Ready To Commit',
        title: latestValidationSuccess.command,
        detail: 'Latest validation run passed. Prepare the commit and keep the coding loop moving.',
        actionLabel: 'Prepare Commit',
        action: () =>
          prepareCommitCommand(
            gitCommitMessage.trim() || buildSuggestedCommitMessage(latestCodeResult?.file_path || editorFilePath || undefined),
            'Commit command prepared from the latest green validation run.',
          ),
      });
    }

    if (visionAnalysis?.content.trim()) {
      const firstLine = visionAnalysis.content.split('\n').find((line) => line.trim()) || 'Visual analysis ready.';
      items.push({
        id: `vision-${screenSnapshot?.capturedAt || 'current'}`,
        priority: 54,
        label: 'Visual Intel',
        title: screenSnapshot?.label || 'Visual analysis',
        detail: firstLine,
        actionLabel: 'Load Insight',
        action: () =>
          injectCommand(
            `I have a vision analysis result for "${screenSnapshot?.label || 'this visual'}".\n${visionAnalysis.content}\nTurn this into the next concrete action and ask one clarifying question if needed.`,
          ),
      });
    }

    if (nextCodingTask) {
      items.push({
        id: `coding-task-${nextCodingTask.id}`,
        priority: nextCodingTask.status === 'in_progress' ? 54 : 52,
        label: 'Coding Task',
        title: nextCodingTask.title,
        detail: `${nextCodingTask.filePath} is queued for ${nextCodingTask.mode}.`,
        actionLabel: nextCodingTask.status === 'in_progress' ? 'Continue Task' : 'Start Task',
        action: () => loadFileCodingPrompt(nextCodingTask.filePath, nextCodingTask.mode === 'fix' ? 'debug' : nextCodingTask.mode),
      });
    }

    if (activeAutomationAlerts.find((item) => item.success && item.routine_id === 'daily_ops')) {
      items.push({
        id: 'daily-ops-ready',
        priority: 40,
        label: 'Briefing',
        title: 'Daily Ops ready',
        detail: 'A fresh cross-system operations brief is available.',
        actionLabel: 'Open Brief',
        action: () => setFocusMode(false),
      });
    }

    return items.sort((left, right) => right.priority - left.priority).slice(0, 6);
  }, [activeAutomationAlerts, editorFilePath, gitCommitMessage, inboxFocusQueue, latestCodeResult?.file_path, latestValidationFailure, latestValidationSuccess, nextCodingTask, nextReviewQueueItem, pendingAction, pendingCodeEdit, pendingWorkbench, prepQueue, screenSnapshot?.capturedAt, screenSnapshot?.label, visionAnalysis?.content]);
  const connectorCapabilities = useMemo(() => {
    const ids = new Set(connectedConnectorIds);
    const gmailConnected = ids.has('gmail') || ids.has('gmail_imap');
    const googleCalendarConnected = ids.has('gcalendar');
    const googleTasksConnected = ids.has('google_tasks');
    const outlookConnected = ids.has('outlook');
    return [
      {
        label: 'Email Drafts',
        value: connectorSummary.emailReady ? 'Ready' : 'Not connected',
      },
      {
        label: 'Inbox Mutations',
        value: gmailConnected ? 'Gmail path ready' : 'Limited',
      },
      {
        label: 'Calendar Create',
        value: googleCalendarConnected ? 'Google path ready' : outlookConnected ? 'Outlook context only' : 'Limited',
      },
      {
        label: 'Task Create',
        value: googleTasksConnected ? 'Google Tasks ready' : 'Limited',
      },
    ];
  }, [connectedConnectorIds, connectorSummary.emailReady]);
  const actionCenterExecutionHint = useMemo(() => {
    const ids = new Set(connectedConnectorIds);
    const gmailConnected = ids.has('gmail') || ids.has('gmail_imap');
    const googleCalendarConnected = ids.has('gcalendar');
    const outlookConnected = ids.has('outlook');
    if (actionMode === 'email') {
      if (!connectorSummary.emailReady) {
        return {
          ready: false,
          label: 'Connect Gmail or Outlook to stage email drafts.',
          button: 'Email Source Needed',
        };
      }
      return {
        ready: true,
        label: gmailConnected
          ? 'Email actions can proceed through the Gmail path when scopes allow.'
          : 'Email draft staging is available. Direct send may depend on provider support.',
        button: 'Stage for Approval',
      };
    }

    if (googleCalendarConnected) {
      return {
        ready: true,
        label: 'Calendar actions can attempt direct Google Calendar creation.',
        button: 'Stage for Approval',
      };
    }
    if (outlookConnected) {
      return {
        ready: true,
        label: 'Calendar planning is available. Outlook may still require manual create after approval.',
        button: 'Stage for Approval',
      };
    }
    return {
      ready: false,
      label: 'Connect Google Calendar or Outlook to stage calendar actions.',
      button: 'Calendar Source Needed',
    };
  }, [actionMode, connectedConnectorIds, connectorSummary.emailReady]);
  const apiBase = useMemo(() => getApiBase(), []);

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

  useEffect(() => {
    const nextInbox = inboxFocusQueue[0];
    if (!nextInbox) return;
    if (!operatorProfile.autoTriageInbox) return;
    const inboxKey = `${nextInbox.timestamp}-${nextInbox.title}-${nextInbox.author}`;
    if (lastAutoInboxRef.current === inboxKey) return;
    if (!streamState.isStreaming && streamState.activeToolCalls.length === 0) {
      prepareReplyDraft(nextInbox);
      setAgentNotice(`Priority inbox draft prepared for ${nextInbox.author}.`);
    } else {
      setAgentNotice(`Priority inbox item queued: ${nextInbox.title}.`);
    }
    lastAutoInboxRef.current = inboxKey;
  }, [inboxFocusQueue, operatorProfile.autoTriageInbox, streamState.activeToolCalls.length, streamState.isStreaming]);

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
  const voiceEnvironmentLabel = useMemo(() => {
    if (!voiceLoop?.active) return 'Idle';
    if (hudSpeechTelemetry.noiseFloor >= 0.014) return 'Noisy room';
    if (hudSpeechTelemetry.noiseFloor >= 0.008) return 'Moderate room';
    return 'Clean room';
  }, [hudSpeechTelemetry.noiseFloor, voiceLoop?.active]);
  const voiceReadinessLabel = useMemo(() => {
    if (!voiceLoop?.active) return 'Standby';
    if (hudSpeechTelemetry.speechLikely) return 'Speech detected';
    if (hudSpeechTelemetry.activeRatio >= 0.08) return 'Monitoring';
    return 'Ready';
  }, [hudSpeechTelemetry.activeRatio, hudSpeechTelemetry.speechLikely, voiceLoop?.active]);
  const currentProjectKey = useMemo(
    () => normalizeMeetingKey(workspaceSummary?.root || workspaceSummary?.branch || 'workspace'),
    [workspaceSummary?.branch, workspaceSummary?.root],
  );
  const currentProjectMemory = durableOperatorMemory?.projects?.[currentProjectKey] || null;
  const activeWorkspaceRepo = useMemo(
    () => workspaceRepos?.repos.find((repo) => repo.root === workspaceRepos.active_root) || null,
    [workspaceRepos],
  );

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
      {
        label: 'Mic',
        value: voiceReadinessLabel,
      },
      {
        label: 'Room',
        value: voiceEnvironmentLabel,
      },
    ],
    [apiReachable, latestAssistantMessage?.telemetry?.total_ms, speechAvailable, speechProfile?.live_vad_enabled, speechProfile?.vad_backend, streamState.elapsedMs, voiceEnvironmentLabel, voiceLoop, voiceReadinessLabel],
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
      value: activeToolCall || pendingAction || pendingCodeEdit || pendingWorkbench ? 'Engaged' : 'Ready',
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

  function buildSpokenLine(text: string, purpose: 'digest' | 'announcement' | 'reply' = 'reply') {
    const cleaned = text.trim();
    if (!cleaned) return cleaned;
    const honorific = voicePersona.honorific.trim();
    if (purpose === 'announcement' && honorific && !cleaned.toLowerCase().startsWith(honorific.toLowerCase())) {
      return `${honorific}, ${cleaned}`;
    }
    return cleaned;
  }

  async function classifyIntentCommand() {
    const text = intentCommand.trim();
    if (!text) {
      setWorkbenchNotice('Enter a command to classify first.');
      return;
    }
    setIntentBusy('classify');
    try {
      const preview = await parseJarvisIntent(text);
      setIntentPreview(preview);
      setIntentExecution(null);
      setWorkbenchNotice(`Intent classified as ${preview.type}.${preview.action ? ` ${preview.action}` : ''}`);
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Intent classification failed.');
    } finally {
      setIntentBusy(null);
    }
  }

  async function captureScreenSnapshot(labelOverride?: string, append = false) {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      setWorkbenchNotice('Screen capture is not available in this browser.');
      return null;
    }
    setIntentBusy('capture');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((resolve) => {
        if (video.readyState >= 2) resolve(null);
        else video.onloadedmetadata = () => resolve(null);
      });
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas capture unavailable.');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      stream.getTracks().forEach((track) => track.stop());
      const dataUrl = canvas.toDataURL('image/png');
      const nextSnapshot: {
        dataUrl: string;
        capturedAt: number;
        source: 'screen' | 'upload';
        label: string;
      } = {
        dataUrl,
        capturedAt: Date.now(),
        source: 'screen',
        label: labelOverride || `Screen ${append ? screenDeck.length + 1 : 1}`,
      };
      setScreenSnapshot(nextSnapshot);
      setScreenDeck((current) => (append ? [...current, nextSnapshot] : [nextSnapshot]));
      setVisionAnalysis(null);
      setVisionTextExtraction(null);
      setVisionSuggestedActions(null);
      setScreenContextNote('');
      setWorkbenchNotice('Screen snapshot captured. Review it in the HUD and load a screen-help prompt when needed.');
      return dataUrl;
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Screen capture failed.');
      return null;
    } finally {
      setIntentBusy(null);
    }
  }

  async function uploadVisualSnapshot() {
    if (typeof document === 'undefined') {
      setWorkbenchNotice('Image upload is not available in this environment.');
      return null;
    }
    setIntentBusy('capture');
    try {
      const file = await new Promise<File | null>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/webp,image/gif';
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.click();
      });
      if (!file) {
        setWorkbenchNotice('Image upload cancelled.');
        return null;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Image upload failed.'));
        reader.readAsDataURL(file);
      });
      const nextSnapshot: {
        dataUrl: string;
        capturedAt: number;
        source: 'screen' | 'upload';
        label: string;
      } = {
        dataUrl,
        capturedAt: Date.now(),
        source: 'upload',
        label: file.name || 'Uploaded Image',
      };
      setScreenSnapshot(nextSnapshot);
      setScreenDeck([nextSnapshot]);
      setVisionAnalysis(null);
      setVisionTextExtraction(null);
      setVisionSuggestedActions(null);
      setScreenContextNote('');
      setWorkbenchNotice('Image uploaded into the visual console. Add context or load an analysis prompt.');
      return dataUrl;
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Image upload failed.');
      return null;
    } finally {
      setIntentBusy(null);
    }
  }

  async function runIntentCommand() {
    const text = intentCommand.trim();
    if (!text) {
      setWorkbenchNotice('Enter a command to run first.');
      return;
    }
    setIntentBusy('run');
    try {
      const next = await executeJarvisIntent(text);
      setIntentPreview(next.intent);
      setIntentExecution(next);
      if (next.result.pending || next.result.history) {
        setWorkbench((current) => ({
          pending: next.result.pending ?? current?.pending ?? null,
          history: next.result.history ?? current?.history ?? [],
          default_working_dir: next.result.default_working_dir ?? current?.default_working_dir ?? workbenchDirectory,
        }));
      }
      if (next.status === 'client_action_required' || next.intent.client_action === 'capture_screen') {
        const captured = await captureScreenSnapshot();
        if (captured) {
          injectCommand(
            'I captured a fresh screen snapshot in the HUD. Help me reason about what I should focus on next, then ask one clarifying question before giving step-by-step guidance.',
          );
        }
      }
      if (next.status === 'client_action_required' || next.intent.client_action === 'capture_screens') {
        const first = await captureScreenSnapshot('Screen 1');
        if (first) {
          setWorkbenchNotice('First screen captured. Use Add Screen to capture the rest of your setup, then run Analyze All.');
        }
      }
      if (next.status === 'client_action_required' || next.intent.client_action === 'upload_image') {
        const uploaded = await uploadVisualSnapshot();
        if (uploaded) {
          injectCommand(
            'I uploaded an image into the HUD. Help me understand what matters in it, then ask one clarifying question before giving step-by-step guidance.',
          );
        }
      }
      if (
        next.intent.type === 'desktop' &&
        ['compose_message', 'compose_clipboard_message', 'compose_selection_message'].includes(next.intent.action) &&
        next.status === 'staged'
      ) {
        setDesktopDraft({
          target: next.intent.target || durableOperatorMemory?.profile.active_desktop_target || 'active target',
          content: next.intent.content || intentCommand.trim(),
          createdAt: Date.now(),
        });
      }
      if (next.intent.type === 'desktop' && next.intent.action === 'submit_message' && next.status === 'staged') {
        setDesktopDraft(null);
      }
      setWorkbenchNotice(next.message);
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Intent execution failed.');
    } finally {
      setIntentBusy(null);
    }
  }

  function loadIntentPreset(text: string) {
    setIntentCommand(text);
    setIntentPreview(null);
    setIntentExecution(null);
    setWorkbenchNotice('Preset loaded into the intent console.');
  }

  async function createTaskFromScreenContext() {
    if (!screenSnapshot) {
      setWorkbenchNotice('Capture or upload a visual snapshot first.');
      return;
    }
    const note = screenContextNote.trim();
    if (!note) {
      setWorkbenchNotice('Add a short visual context note first.');
      return;
    }
    setActionBusy('stage');
    try {
      const sourceLabel = screenSnapshot.source === 'upload' ? 'Image' : 'Screen';
      const next = await stageTask({
        title: `Screen follow-up · ${new Date(screenSnapshot.capturedAt).toLocaleTimeString()}`,
        notes: note,
      });
      setActionCenter(next);
      setActionNotice(`${sourceLabel} follow-up task staged for approval.`);
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : 'Unable to stage task from visual context.');
    } finally {
      setActionBusy(null);
    }
  }

  async function rememberScreenContext() {
    if (!screenSnapshot) {
      setWorkbenchNotice('Capture or upload a visual snapshot first.');
      return;
    }
    const note = screenContextNote.trim();
    if (!note) {
      setWorkbenchNotice('Add a short visual context note first.');
      return;
    }
    setIntentBusy('run');
    try {
      const next = await executeJarvisIntent(`Remember ${screenSnapshot.label}: ${note}`);
      setIntentPreview(next.intent);
      setIntentExecution(next);
      const memory =
        (await updateOperatorVisualObservation({
          label: screenSnapshot.label,
          source: screenSnapshot.source,
          note,
          image_data_url: screenSnapshot.dataUrl,
          created_at: new Date(screenSnapshot.capturedAt).toISOString(),
        }).catch(() => null)) ||
        (await fetchOperatorMemory().catch(() => null));
      if (memory) setDurableOperatorMemory(memory);
      setWorkbenchNotice(`${screenSnapshot.source === 'upload' ? 'Image' : 'Screen'} context saved to explicit memory.`);
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to remember visual context.');
    } finally {
      setIntentBusy(null);
    }
  }

  async function restoreVisualObservation(observation: NonNullable<DurableOperatorMemory['visual_observations']>[number]) {
    const assetUrl =
      observation.image_path && apiBase
        ? `${apiBase}/v1/operator-memory/visual/${encodeURIComponent(observation.id)}/asset`
        : '';
    if (!assetUrl) {
      setWorkbenchNotice('This visual memory has no stored image asset to restore.');
      return;
    }
    try {
      const response = await fetch(assetUrl);
      if (!response.ok) throw new Error(`Unable to load visual asset: ${response.status}`);
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Unable to decode visual asset.'));
        reader.readAsDataURL(blob);
      });
      setScreenSnapshot({
        dataUrl,
        capturedAt: observation.created_at ? new Date(observation.created_at).getTime() || Date.now() : Date.now(),
        source: observation.source === 'upload' ? 'upload' : 'screen',
        label: observation.label,
      });
      setScreenDeck([
        {
          dataUrl,
          capturedAt: observation.created_at ? new Date(observation.created_at).getTime() || Date.now() : Date.now(),
          source: observation.source === 'upload' ? 'upload' : 'screen',
          label: observation.label,
        },
      ]);
      setVisionAnalysis(null);
      setVisionTextExtraction(null);
      setVisionSuggestedActions(null);
      setScreenContextNote(observation.note || '');
      setWorkbenchNotice('Visual memory restored into the HUD.');
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to restore visual memory.');
    }
  }

  async function analyzeCurrentVisual() {
    if (!screenSnapshot) {
      setWorkbenchNotice('Capture or upload a visual snapshot first.');
      return;
    }
    setVisionBusy(true);
    try {
      const result = await analyzeVision({
        image_data_url: screenSnapshot.dataUrl,
        note: screenContextNote.trim() || undefined,
        label: screenSnapshot.label,
      });
      setVisionAnalysis(result);
      setVisionTextExtraction(null);
      setVisionSuggestedActions(null);
      setWorkbenchNotice('Vision analysis complete.');
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Vision analysis failed.');
    } finally {
      setVisionBusy(false);
    }
  }

  async function analyzeAllScreens() {
    if (!screenDeck.length) {
      setWorkbenchNotice('Capture at least one screen first.');
      return;
    }
    setVisionBusy(true);
    try {
      const result =
        screenDeck.length === 1
          ? await analyzeVision({
              image_data_url: screenDeck[0].dataUrl,
              note: screenContextNote.trim() || undefined,
              label: screenDeck[0].label,
            })
          : await analyzeVisionMulti({
              images: screenDeck.map((item) => ({
                image_data_url: item.dataUrl,
                label: item.label,
              })),
              note: screenContextNote.trim() || undefined,
              label: 'Multi-Screen Session',
            });
      setVisionAnalysis(result);
      setVisionTextExtraction(null);
      setVisionSuggestedActions(null);
      setWorkbenchNotice(
        screenDeck.length === 1 ? 'Vision analysis complete.' : `Multi-screen analysis complete for ${screenDeck.length} screens.`,
      );
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Multi-screen vision analysis failed.');
    } finally {
      setVisionBusy(false);
    }
  }

  async function extractCurrentVisualText() {
    if (!screenSnapshot) {
      setWorkbenchNotice('Capture or upload a visual snapshot first.');
      return;
    }
    setVisionBusy(true);
    try {
      const result = await extractVisionText({
        image_data_url: screenSnapshot.dataUrl,
        note: screenContextNote.trim() || undefined,
        label: screenSnapshot.label,
      });
      setVisionTextExtraction(result);
      setVisionAnalysis(null);
      setVisionSuggestedActions(null);
      setWorkbenchNotice('Visual text extraction complete.');
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Vision text extraction failed.');
    } finally {
      setVisionBusy(false);
    }
  }

  async function extractAllScreensText() {
    if (!screenDeck.length) {
      setWorkbenchNotice('Capture at least one screen first.');
      return;
    }
    setVisionBusy(true);
    try {
      const result =
        screenDeck.length === 1
          ? await extractVisionText({
              image_data_url: screenDeck[0].dataUrl,
              note: screenContextNote.trim() || undefined,
              label: screenDeck[0].label,
            })
          : await extractVisionTextMulti({
              images: screenDeck.map((item) => ({
                image_data_url: item.dataUrl,
                label: item.label,
              })),
              note: screenContextNote.trim() || undefined,
              label: 'Multi-Screen Session',
            });
      setVisionTextExtraction(result);
      setVisionAnalysis(null);
      setVisionSuggestedActions(null);
      setWorkbenchNotice(
        screenDeck.length === 1
          ? 'Visual text extraction complete.'
          : `Multi-screen text extraction complete for ${screenDeck.length} screens.`,
      );
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Multi-screen vision text extraction failed.');
    } finally {
      setVisionBusy(false);
    }
  }

  async function createTaskFromVisionResult() {
    const source = visionAnalysis?.content?.trim() || visionTextExtraction?.content?.trim() || '';
    if (!source) {
      setWorkbenchNotice('Run analysis or text extraction first.');
      return;
    }
    setActionBusy('stage');
    try {
      const next = await stageTask({
        title: `Visual follow-up · ${new Date().toLocaleTimeString()}`,
        notes: source,
      });
      setActionCenter(next);
      setActionNotice('Vision follow-up task staged for approval.');
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : 'Unable to stage vision follow-up task.');
    } finally {
      setActionBusy(null);
    }
  }

  async function suggestVisualActions() {
    if (!screenDeck.length) {
      setWorkbenchNotice('Capture at least one screen first.');
      return;
    }
    setVisionBusy(true);
    try {
      const result = await suggestVisionActions({
        images: screenDeck.map((item) => ({
          image_data_url: item.dataUrl,
          label: item.label,
        })),
        note: screenContextNote.trim() || undefined,
        label: screenDeck.length > 1 ? 'Multi-Screen Session' : screenDeck[0].label,
      });
      setVisionSuggestedActions(result);
      setWorkbenchNotice(`Visual action suggestions ready${result.actions.length ? ` (${result.actions.length})` : ''}.`);
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Vision action suggestions failed.');
    } finally {
      setVisionBusy(false);
    }
  }

  useEffect(() => {
    if (!visionAnalysis?.content.trim()) return;
    const firstLine = visionAnalysis.content.split('\n').find((line) => line.trim()) || '';
    if (!firstLine) return;
    setVoiceNotice(`Visual analysis ready: ${firstLine}`);
  }, [visionAnalysis?.content]);

  function interruptAssistantOutput(reason?: string) {
    audioElementRef.current?.pause();
    window.dispatchEvent(new Event('jarvis:interrupt-stream'));
    if (reason) setVoiceNotice(reason);
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

  function loadCodingPrompt(
    mode: 'inspect' | 'debug' | 'review' | 'refactor',
  ) {
    const projectContext = currentProjectMemory
      ? `\nKnown project focus: ${currentProjectMemory.focus || 'none'}\nProject status: ${currentProjectMemory.status || 'unknown'}\nNext step: ${currentProjectMemory.next_step || 'not recorded'}\nProject notes: ${currentProjectMemory.notes || 'none'}`
      : '';
    const prompts = {
      inspect:
        `Act as my repository copilot. Inspect the current project state, identify the most important active area, summarize risks, and propose the next concrete step.${projectContext}`,
      debug:
        `Act as my debugging copilot. Inspect the current repo state, identify the most likely failure points, propose a short diagnostic plan, and only then suggest the first safe fix.${projectContext}`,
      review:
        `Act as my code reviewer. Focus on bugs, regressions, missing tests, and risky behavior. Start with the highest-severity findings and keep summaries brief.${projectContext}`,
      refactor:
        `Act as my refactoring copilot. Identify one safe, high-value cleanup that improves maintainability without changing intended behavior, then propose the smallest implementation plan.${projectContext}`,
    } as const;
    injectCommand(prompts[mode]);
    setWorkbenchNotice(
      mode === 'inspect'
        ? 'Repository inspection prompt loaded.'
        : mode === 'debug'
        ? 'Debug prompt loaded.'
        : mode === 'review'
        ? 'Review prompt loaded.'
        : 'Refactor prompt loaded.',
    );
  }

  function loadWorkbenchPreset(
    preset: 'status' | 'changed-files' | 'test-scan' | 'python-version',
  ) {
    const command =
      preset === 'status'
        ? 'git status --short'
        : preset === 'changed-files'
        ? 'git diff --name-only'
        : preset === 'test-scan'
        ? 'rg -n "pytest|unittest|vitest|jest|playwright" .'
        : 'python --version';
    setWorkbenchCommand(command);
    setWorkbenchNotice('Workbench preset loaded. Stage it when ready.');
  }

  async function handleRegisterRepo() {
    const path = repoPathInput.trim();
    if (!path) {
      setRepoNotice('Enter a local Git repo path first.');
      return;
    }
    setRepoBusy('register');
    try {
      const next = await registerWorkspaceRepo(path);
      setWorkspaceRepos(next);
      const active = next.repos.find((repo) => repo.root === next.active_root);
      if (active) {
        setWorkbenchDirectory(active.root);
        const summary = await fetchWorkspaceSummary();
        setWorkspaceSummary(summary);
        setRepoNotice(`Connected ${active.name}.`);
      }
      setRepoPathInput('');
    } catch (error) {
      setRepoNotice(error instanceof Error ? error.message : 'Repo registration failed.');
    } finally {
      setRepoBusy(null);
    }
  }

  async function handleSelectRepo(root: string) {
    setRepoBusy('select');
    try {
      const next = await selectWorkspaceRepo(root);
      setWorkspaceRepos(next);
      setWorkbenchDirectory(root);
      const summary = await fetchWorkspaceSummary();
      setWorkspaceSummary(summary);
      const active = next.repos.find((repo) => repo.root === root);
      setRepoNotice(active ? `Switched to ${active.name}.` : 'Repository selected.');
    } catch (error) {
      setRepoNotice(error instanceof Error ? error.message : 'Repo selection failed.');
    } finally {
      setRepoBusy(null);
    }
  }

  function loadCloneRepoCommand() {
    const cloneUrl = repoCloneUrl.trim();
    if (!cloneUrl) {
      setRepoNotice('Enter a GitHub clone URL first.');
      return;
    }
    const summaryRoot = workspaceSummary?.root || workbench?.default_working_dir || workbenchDirectory;
    const workingRoot = summaryRoot.replace(/[\\/][^\\/]+$/, '') || summaryRoot;
    setWorkbenchDirectory(workingRoot || workbenchDirectory);
    setWorkbenchCommand(`git clone ${cloneUrl}`);
    setWorkbenchNotice('Clone command loaded. Review and stage it when ready.');
  }

  async function openFileInEditor(filePath: string) {
    const repoRoot = workspaceSummary?.root;
    if (!repoRoot) {
      setEditorNotice('No active repository selected.');
      return;
    }
    setEditorBusy('load');
    try {
      const result = await readCodingFile(repoRoot, filePath);
      setEditorFilePath(result.file_path);
      setEditorContent(result.content);
      setEditorOriginalContent(result.content);
      setEditorNotice(`Loaded ${result.file_path} into the editor.`);
      setReviewQueueState((current) => ({ ...current, [filePath]: 'in_progress' }));
    } catch (error) {
      setEditorNotice(error instanceof Error ? error.message : 'Failed to load file.');
    } finally {
      setEditorBusy(null);
    }
  }

  function stageSuggestedCommand(command: string) {
    setWorkbenchCommand(command);
    setWorkbenchDirectory(workspaceSummary?.root || workbenchDirectory);
    setWorkbenchNotice('Suggested command loaded. Stage it when ready.');
  }

  function buildValidationFixPrompt(command: string, output: string, filePath?: string) {
    const projectContext = currentProjectMemory
      ? `\nKnown project focus: ${currentProjectMemory.focus || 'none'}\nProject status: ${currentProjectMemory.status || 'unknown'}\nNext step: ${currentProjectMemory.next_step || 'not recorded'}`
      : '';
    const fileHint = filePath ? `\nLikely file to inspect first: ${filePath}` : '';
    return `A validation command failed.\nCommand: ${command}${fileHint}\nOutput:\n${output}\nDiagnose the root cause, identify the highest-signal next patch, and keep the fix safe and minimal.${projectContext}`;
  }

  function buildSuggestedCommitMessage(filePath?: string) {
    const normalized = filePath?.split('/').pop()?.split('\\').pop() || 'workspace';
    const focus = currentProjectMemory?.focus?.trim();
    if (focus) {
      return `feat: advance ${focus.toLowerCase()}`;
    }
    const cleanName = normalized.replace(/\.[^.]+$/, '').replace(/[_\s]+/g, '-');
    return `feat: update ${cleanName}`;
  }

  async function prepareCommitCommand(message: string, notice = 'Commit command prepared. Stage it when ready.') {
    if (!message) {
      setWorkbenchNotice('Enter a commit message first.');
      return;
    }
    try {
      const prepared = await prepareWorkspaceCommit(message);
      setWorkbenchDirectory(prepared.root);
      setWorkbenchCommand(prepared.command);
      setWorkbenchNotice(notice);
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to prepare commit command.');
    }
  }

  async function loadPreparedCommitCommand() {
    await prepareCommitCommand(gitCommitMessage.trim());
  }

  async function loadPreparedPushCommand() {
    try {
      const prepared = await prepareWorkspacePush();
      setWorkbenchDirectory(prepared.root);
      setWorkbenchCommand(prepared.command);
      setWorkbenchNotice('Push command prepared. Stage it when ready.');
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to prepare push command.');
    }
  }

  function loadFileCodingPrompt(
    filePath: string,
    mode: 'inspect' | 'debug' | 'review',
  ) {
    const projectContext = currentProjectMemory
      ? `\nKnown project focus: ${currentProjectMemory.focus || 'none'}\nProject status: ${currentProjectMemory.status || 'unknown'}\nNext step: ${currentProjectMemory.next_step || 'not recorded'}`
      : '';
    const prompt =
      mode === 'inspect'
        ? `Inspect this file in the context of the current repository and explain what it does, what looks risky, and the next safe action.\nFile: ${filePath}${projectContext}`
        : mode === 'debug'
        ? `Debug this file in the context of the current repository. Identify the most likely failure points, likely regressions, and the first safe diagnostic step.\nFile: ${filePath}${projectContext}`
        : `Review this file in the context of the current repository. Focus on bugs, regressions, missing tests, and risky behavior.\nFile: ${filePath}${projectContext}`;
    injectCommand(prompt);
    setReviewQueueState((current) => ({ ...current, [filePath]: 'in_progress' }));
    setCodingTasks((current) =>
      current.map((item) =>
        item.filePath === filePath && (item.mode === mode || (item.mode === 'fix' && mode === 'debug'))
          ? { ...item, status: 'in_progress' }
          : item,
      ),
    );
    setWorkbenchNotice(`${mode === 'inspect' ? 'Inspect' : mode === 'debug' ? 'Debug' : 'Review'} prompt loaded for ${filePath}.`);
  }

  function loadFileWorkbenchPreset(filePath: string) {
    setWorkbenchCommand(`git diff -- ${filePath}`);
    setReviewQueueState((current) => ({ ...current, [filePath]: 'in_progress' }));
    setWorkbenchNotice(`Diff preset loaded for ${filePath}. Stage it when ready.`);
  }

  function markReviewQueueStatus(filePath: string, status: 'pending' | 'in_progress' | 'done') {
    setReviewQueueState((current) => ({ ...current, [filePath]: status }));
    setWorkbenchNotice(
      status === 'done'
        ? `${filePath} marked done in review queue.`
        : status === 'in_progress'
        ? `${filePath} marked in progress.`
        : `${filePath} moved back to pending.`,
    );
  }

  function addCodingTask(
    filePath: string,
    mode: 'review' | 'debug' | 'inspect' | 'fix',
    title?: string,
  ) {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    setCodingTasks((current) => [
      {
        id,
        title: title || `${mode === 'fix' ? 'Fix' : mode[0].toUpperCase() + mode.slice(1)} ${filePath}`,
        filePath,
        mode,
        status: 'pending',
      },
      ...current.filter((item) => !(item.filePath === filePath && item.mode === mode)),
    ]);
    setWorkbenchNotice(`Coding task added for ${filePath}.`);
  }

  function updateCodingTaskStatus(taskId: string, status: 'pending' | 'in_progress' | 'done') {
    setCodingTasks((current) =>
      current.map((item) => (item.id === taskId ? { ...item, status } : item)),
    );
  }

  async function saveCurrentProjectMemory() {
    try {
      const next = await updateOperatorProject({
        key: currentProjectKey,
        title: workspaceSummary?.root?.split(/[\\/]/).slice(-1)[0] || workspaceSummary?.branch || 'Workspace',
        focus:
          currentProjectMemory?.focus ||
          (workspaceSummary?.changed_files?.[0]
            ? `Review and stabilize ${workspaceSummary.changed_files[0]}`
            : 'Maintain repository stability'),
        status:
          workspaceSummary?.dirty
            ? `${workspaceSummary.changed_count} changed files in progress`
            : currentProjectMemory?.status || 'clean working tree',
        next_step:
          currentProjectMemory?.next_step ||
          (workspaceSummary?.changed_files?.[0]
            ? `Review ${workspaceSummary.changed_files[0]}`
            : 'Inspect repository state and choose next task'),
        notes:
          currentProjectMemory?.notes ||
          `Branch: ${workspaceSummary?.branch || 'unknown'}; top level: ${(workspaceSummary?.top_level || []).join(', ')}`,
      });
      setDurableOperatorMemory(next);
      setProjectMemoryNotice('Project memory saved.');
    } catch (error) {
      setProjectMemoryNotice(error instanceof Error ? error.message : 'Unable to save project memory.');
    }
  }

  function buildDailyOpsPrompt() {
    const inboxLines = inboxFocusQueue
      .slice(0, 3)
      .map(
        (item, index) =>
          `${index + 1}. ${item.title} from ${item.author} — ${item.snippet || 'No preview available.'}`,
      )
      .join('\n');
    const meetingLines = prepQueue
      .slice(0, 2)
      .map(
        (item, index) =>
          `${index + 1}. ${item.title} at ${item.when} — ${item.detail || 'No extra detail.'}`,
      )
      .join('\n');
    const taskLines = taskSummary
      .slice(0, 3)
      .map(
        (item, index) =>
          `${index + 1}. ${item.title}${item.due ? ` (due ${item.due})` : ''} — ${item.notes || 'No notes.'}`,
      )
      .join('\n');

    return (
      'Act as my executive operations copilot. Build a concise operations brief with priorities, risks, reply recommendations, and next actions.\n' +
      `Top inbox items:\n${inboxLines || 'None'}\n\n` +
      `Upcoming meetings:\n${meetingLines || 'None'}\n\n` +
      `Open tasks:\n${taskLines || 'None'}`
    );
  }

  function dismissAutomationAlert(item: AutomationLogEntry) {
    const key = `${item.task_id}:${item.started_at}`;
    setDismissedAutomationAlerts((current) => (current.includes(key) ? current : [...current, key]));
  }

  function clearAutomationAlerts() {
    setDismissedAutomationAlerts(
      automationLogs.slice(0, 8).map((item) => `${item.task_id}:${item.started_at}`),
    );
  }

  function handleAutomationFollowup(item: AutomationLogEntry) {
    if (item.routine_id === 'daily_ops') {
      runDailyOpsSweep();
      dismissAutomationAlert(item);
      return;
    }

    if (item.routine_id === 'inbox_sweep') {
      if (inboxFocusQueue[0]) {
        prepareReplyDraft(inboxFocusQueue[0]);
        setAgentNotice(`Priority inbox draft prepared for ${inboxFocusQueue[0].author}.`);
      } else {
        injectCommand(buildDailyOpsPrompt());
      }
      dismissAutomationAlert(item);
      return;
    }

    if (prepQueue[0]) {
      prepareMeetingFromReminder(prepQueue[0]);
      setAgentNotice(`Meeting prep loaded for ${prepQueue[0].title}.`);
    } else {
      injectCommand('Prepare the next important meeting with context, risks, and talking points.');
    }
    dismissAutomationAlert(item);
  }

  function submitInjectedCommand(text: string) {
    if (streamState.isStreaming) {
      window.dispatchEvent(new Event('jarvis:interrupt-stream'));
    }
    audioElementRef.current?.pause();
    injectCommand(text);
    window.dispatchEvent(new Event('jarvis:submit-input'));
  }

  function runDailyOpsSweep() {
    const prompt = buildDailyOpsPrompt();
    if (!streamState.isStreaming && streamState.activeToolCalls.length === 0) {
      submitInjectedCommand(prompt);
      setAgentNotice('Daily ops sweep launched.');
    } else {
      injectCommand(prompt);
      setAgentNotice('Daily ops sweep queued in the command deck.');
    }
  }

  async function toggleServerRoutine(
    routineId: 'daily_ops' | 'inbox_sweep' | 'meeting_prep',
    enabled: boolean,
    cron?: string,
  ) {
    try {
      const next = await updateAutomationRoutine({
        routine_id: routineId,
        enabled,
        cron,
        agent: 'orchestrator',
      });
      setAutomationStatus(next);
      setAgentNotice(
        enabled
          ? `Server routine enabled: ${routineId.replace('_', ' ')}.`
          : `Server routine disabled: ${routineId.replace('_', ' ')}.`,
      );
    } catch (error) {
      setAgentNotice(error instanceof Error ? error.message : 'Unable to update server routine.');
    }
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
        sensitivity: voiceSensitivity,
        onChunkProcessed: (result) => {
          setVoiceLoop(result);
          if (result.interrupted) {
            interruptAssistantOutput('Voice interruption detected. Standing by for your next command.');
          }
          if (result.accepted && result.command.trim()) {
            interruptAssistantOutput(
              (speechProfile?.auto_submit_voice_commands ?? true)
                ? 'Wake phrase confirmed. Interrupting current output and sending command.'
                : 'Wake phrase confirmed. Interrupting current output and loading command.',
            );
            if (speechProfile?.auto_submit_voice_commands ?? true) {
              submitInjectedCommand(result.command);
            } else {
              injectCommand(result.command);
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

  async function handleStageCodeEdit() {
    if (!workspaceSummary?.root || !editorFilePath.trim()) {
      setEditorNotice('Load a file into the editor first.');
      return;
    }
    setEditorBusy('stage');
    try {
      const next = await stageCodeEdit({
        repo_root: workspaceSummary.root,
        file_path: editorFilePath,
        updated_content: editorContent,
      });
      setCodingWorkspace(next);
      setEditorNotice(`Staged diff for ${editorFilePath}.`);
    } catch (error) {
      setEditorNotice(error instanceof Error ? error.message : 'Unable to stage code edit.');
    } finally {
      setEditorBusy(null);
    }
  }

  async function handleApproveCodeEdit() {
    setEditorBusy('approve');
    try {
      const next = await approveCodeEdit();
      setCodingWorkspace(next);
      setEditorOriginalContent(editorContent);
      setEditorNotice(next.result?.result || 'Code edit applied.');
      const summary = await fetchWorkspaceSummary();
      setWorkspaceSummary(summary);
      const checks = await fetchWorkspaceChecks().catch(() => null);
      if (checks) {
        setWorkspaceChecks(checks);
        const primaryCheck = checks.checks[0];
        if (primaryCheck) {
          setWorkbenchCommand(primaryCheck.command);
          setWorkbenchDirectory(summary.root);
          setWorkbenchNotice(`Primary validation check loaded: ${primaryCheck.label}. Stage it when ready.`);
        }
      }
      useAppStore.getState().addLogEntry({
        timestamp: Date.now(),
        level: 'info',
        category: 'tool',
        message: next.result?.result || 'Code edit applied.',
      });
    } catch (error) {
      setEditorNotice(error instanceof Error ? error.message : 'Unable to apply code edit.');
    } finally {
      setEditorBusy(null);
    }
  }

  async function handleHoldCodeEdit() {
    setEditorBusy('hold');
    try {
      const next = await holdCodeEdit();
      setCodingWorkspace(next);
      setEditorNotice('Pending code edit held.');
    } catch (error) {
      setEditorNotice(error instanceof Error ? error.message : 'Unable to hold code edit.');
    } finally {
      setEditorBusy(null);
    }
  }

  const approvalLabel = activeToolCall
    ? `Tool running: ${activeToolCall.tool}`
    : pendingAction
    ? `${pendingAction.action_type.replace('_', ' ')} is waiting for approval.`
    : pendingCodeEdit
    ? `Code edit for ${pendingCodeEdit.file_path} is waiting for approval.`
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
              ['Alerts', activeAutomationAlerts.length ? `${activeAutomationAlerts.length} active` : 'Clear'],
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
            {automationNotice ? (
              <div className="rounded-[1.2rem] border border-emerald-300/20 bg-emerald-300/[0.08] px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.35em] text-emerald-200/70">Operations Alert</div>
                <div className="mt-1 text-sm text-emerald-50/92">{automationNotice}</div>
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
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      {([
                        ['sensitive', 'Sensitive'],
                        ['balanced', 'Balanced'],
                        ['strict', 'Strict'],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          onClick={() => setVoiceSensitivity(value)}
                          className={`rounded-[0.9rem] border px-3 py-2 text-[10px] uppercase tracking-[0.22em] transition ${
                            voiceSensitivity === value
                              ? 'border-cyan-300/20 bg-cyan-400/[0.08] text-cyan-100'
                              : 'border-cyan-400/10 bg-slate-950/70 text-slate-300 hover:bg-cyan-400/[0.08]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
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
                      : pendingCodeEdit
                      ? `${pendingCodeEdit.file_path} - staged code diff awaiting approval`
                      : pendingWorkbench
                      ? `${pendingWorkbench.command} [${pendingWorkbench.working_dir}]`
                      : toolSummary}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={pendingAction ? handleApproveAction : pendingCodeEdit ? handleApproveCodeEdit : handleApproveWorkbench}
                    disabled={(!pendingAction && !pendingCodeEdit && !pendingWorkbench) || workbenchBusy !== null || actionBusy !== null || editorBusy !== null}
                    className="rounded-[1.1rem] border border-emerald-400/30 bg-emerald-400/12 px-4 py-3 text-sm uppercase tracking-[0.24em] text-emerald-200 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      {workbenchBusy === 'approve' || actionBusy === 'approve' || editorBusy === 'approve' ? 'Running' : 'Approve'}
                    </span>
                  </button>
                  <button
                    onClick={pendingAction ? handleHoldAction : pendingCodeEdit ? handleHoldCodeEdit : handleHoldWorkbench}
                    disabled={(!pendingAction && !pendingCodeEdit && !pendingWorkbench) || workbenchBusy !== null || actionBusy !== null || editorBusy !== null}
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
                    editorNotice ||
                    workbenchNotice ||
                    (pendingAction
                      ? 'Approve to send the staged email or finalize the calendar plan.'
                      : pendingCodeEdit
                      ? 'Approve to apply the staged file diff to the active repository.'
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
                      Intent Console
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/60">
                      memory · web · desktop · visual
                    </div>
                  </div>
                  <div className="text-sm leading-7 text-slate-200/78">
                    One structured lane for memory, web search, desktop control, and visual awareness.
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Active Desktop Target</div>
                      <div className="mt-1 text-sm text-cyan-50/90">
                        {durableOperatorMemory?.profile.active_desktop_target || 'None locked yet'}
                      </div>
                    </div>
                    <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Active Browser</div>
                      <div className="mt-1 text-sm text-cyan-50/90">
                        {durableOperatorMemory?.profile.active_browser_target || 'Chrome fallback'}
                      </div>
                    </div>
                  </div>
                  {desktopState ? (
                    <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Desktop State</div>
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                          {desktopState.active_process_name || 'No active process'}
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-cyan-50/90">
                        {desktopState.active_window_title || 'No active window detected.'}
                      </div>
                      {desktopState.open_windows.length ? (
                        <div className="mt-3 grid gap-2">
                          {desktopState.open_windows.slice(0, 4).map((item) => (
                            <div
                              key={`${item.process}-${item.title}`}
                              className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2"
                            >
                              <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                                {item.process}
                              </div>
                              <div className="mt-1 text-sm text-slate-200/78">{item.title}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {intentExecution?.result?.metadata &&
                  'page_title' in intentExecution.result.metadata &&
                  intentExecution.intent.type === 'desktop' ? (
                    <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Active Page</div>
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                          {String(intentExecution.result.metadata.browser || 'desktop')}
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-cyan-50/90">
                        {String(intentExecution.result.metadata.page_title || intentExecution.result.metadata.window_title || 'No page detected.')}
                      </div>
                      {'page_url' in intentExecution.result.metadata && intentExecution.result.metadata.page_url ? (
                        <div className="mt-2 break-all text-xs text-cyan-200/65">
                          {String(intentExecution.result.metadata.page_url)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {intentExecution?.result?.metadata &&
                  'document_title' in intentExecution.result.metadata &&
                  intentExecution.intent.type === 'desktop' ? (
                    <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Active Document</div>
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                          {String(intentExecution.result.metadata.app || 'desktop')}
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-cyan-50/90">
                        {String(intentExecution.result.metadata.document_title || intentExecution.result.metadata.window_title || 'No document detected.')}
                      </div>
                    </div>
                  ) : null}
                  {desktopDraft ? (
                    <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Desktop Draft Deck</div>
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                          {new Date(desktopDraft.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="mt-2 text-xs uppercase tracking-[0.18em] text-cyan-200/65">
                        Target: {desktopDraft.target || 'active target'}
                      </div>
                      <div className="mt-2 text-sm text-slate-200/78">{desktopDraft.content}</div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => loadIntentPreset(`Draft ${desktopDraft.content} into ${desktopDraft.target}`)}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                        >
                          Reload Draft
                        </button>
                        <button
                          onClick={() =>
                            loadIntentPreset(
                              desktopDraft.target ? `Submit message in ${desktopDraft.target}` : 'Submit message',
                            )
                          }
                          className="rounded-[0.85rem] border border-emerald-300/18 bg-emerald-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-emerald-100 transition hover:bg-emerald-400/[0.14]"
                        >
                          Prepare Submit
                        </button>
                        <button
                          onClick={() => setDesktopDraft(null)}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                        >
                          Clear Draft
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_140px_140px]">
                    <input
                      value={intentCommand}
                      onChange={(event) => setIntentCommand(event.target.value)}
                      placeholder="Switch to Chrome"
                      className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <button
                      onClick={classifyIntentCommand}
                      disabled={intentBusy !== null}
                      className="rounded-[0.9rem] border border-cyan-400/12 bg-slate-950/70 px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {intentBusy === 'classify' ? 'Reading' : 'Classify'}
                    </button>
                    <button
                      onClick={runIntentCommand}
                      disabled={intentBusy !== null}
                      className="rounded-[0.9rem] border border-cyan-300/20 bg-cyan-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {intentBusy === 'run' ? 'Running' : 'Run Intent'}
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {([
                      { label: 'Remember', text: 'Remember my gym is at 18:00 on weekdays', icon: BookOpen },
                      { label: 'Recall', text: 'What do you know about my workday?', icon: Sparkles },
                      { label: 'List Memory', text: 'List my memories', icon: Brain },
                      { label: 'Forget', text: 'Forget gym', icon: XCircle },
                      { label: 'Web Search', text: 'Search the web for the latest Ollama models', icon: Globe },
                      { label: 'Open YouTube', text: 'Open YouTube', icon: Radio },
                      { label: 'Switch App', text: 'Switch to Chrome', icon: Monitor },
                      { label: 'Active Window', text: 'What window is active', icon: Activity },
                      { label: 'Active Page', text: 'What page is active', icon: Globe },
                      { label: 'Active Doc', text: 'What document is active', icon: Folder },
                      { label: 'Active URL', text: 'What URL is active', icon: Globe },
                      { label: 'Remember Page', text: 'Remember active page', icon: BookOpen },
                      { label: 'Remember Doc', text: 'Remember active document', icon: BookOpen },
                      { label: 'Lock Active', text: 'Use active window as target', icon: Shield },
                      { label: 'Open Apps', text: 'List open apps', icon: Cpu },
                      { label: 'Lock Browser', text: 'Set edge as browser target', icon: Shield },
                      { label: 'Clear Target', text: 'Clear target', icon: XCircle },
                      { label: 'Clipboard', text: 'What is on my clipboard', icon: BookOpen },
                      { label: 'Selection', text: 'What text is selected', icon: BookOpen },
                      { label: 'Remember Clipboard', text: 'Remember clipboard', icon: Brain },
                      { label: 'Remember Selection', text: 'Remember selected text', icon: Brain },
                      { label: 'Search Clipboard', text: 'Search clipboard in browser', icon: Globe },
                      { label: 'Search Selection', text: 'Search selected text in browser', icon: Globe },
                      { label: 'Clipboard URL', text: 'Open clipboard as URL', icon: Monitor },
                      { label: 'Selection URL', text: 'Open selected text as URL', icon: Monitor },
                      { label: 'Copy Page URL', text: 'Copy active URL', icon: Reply },
                      { label: 'Copy Text', text: 'Copy deployment checklist to clipboard', icon: Reply },
                      { label: 'Type In App', text: 'Type hello from Jarvis into Notepad', icon: Terminal },
                      { label: 'Shortcut', text: 'Press ctrl shift esc', icon: Cpu },
                      { label: 'Minimize', text: 'Minimize window', icon: ChevronRight },
                      { label: 'Show Desktop', text: 'Show desktop', icon: Monitor },
                      { label: 'Refresh', text: 'Refresh page', icon: Activity },
                      { label: 'New Tab', text: 'New tab', icon: Globe },
                      { label: 'Browser Search', text: 'Search browser for latest ollama models', icon: Globe },
                      { label: 'Go To URL', text: 'Go to github.com', icon: Monitor },
                      { label: 'Open In Code', text: 'Open C:\\Users\\hogne\\OpenJarvis in VS Code', icon: Terminal },
                      { label: 'DevTools', text: 'Open devtools', icon: Wrench },
                      { label: 'Back', text: 'Go back', icon: ChevronRight },
                      { label: 'Play/Pause', text: 'Play pause', icon: AudioLines },
                      { label: 'Next Track', text: 'Next track', icon: Radio },
                      { label: 'Volume Up', text: 'Volume up', icon: Activity },
                      { label: 'Draft Message', text: 'Draft hello team, standup starts in five minutes into Slack', icon: Mail },
                      { label: 'Draft Clipboard', text: 'Draft clipboard into Slack', icon: Mail },
                      { label: 'Draft Selection', text: 'Draft selected text into Slack', icon: Mail },
                      { label: 'Submit Message', text: 'Submit message in Slack', icon: CheckCircle2 },
                      { label: 'Project Search', text: 'Search project for voice loop', icon: Folder },
                      { label: 'Clipboard Search', text: 'Search project for clipboard', icon: Folder },
                      { label: 'Selection Search', text: 'Search project for selected text', icon: Folder },
                      { label: 'Palette', text: 'Open command palette', icon: Sparkles },
                      { label: 'Reveal Path', text: 'Reveal C:\\Users\\hogne\\OpenJarvis in Explorer', icon: Folder },
                      { label: 'Find PDFs', text: 'Find all PDFs in downloads', icon: Folder },
                      { label: 'Screen Brief', text: 'What is on my screen?', icon: Monitor },
                      { label: 'All Screens', text: 'What is on my screens?', icon: Monitor },
                      { label: 'Upload Image', text: 'Analyze this image', icon: Sparkles },
                    ] as const).map(({ label, text, icon: Icon }) => (
                      <button
                        key={label}
                        onClick={() => loadIntentPreset(text)}
                        className="rounded-[0.95rem] border border-cyan-400/12 bg-black/20 px-3 py-3 text-left transition hover:bg-cyan-400/[0.08]"
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-cyan-200" />
                          <div className="text-xs uppercase tracking-[0.22em] text-cyan-50/92">{label}</div>
                        </div>
                        <div className="mt-2 text-xs text-slate-300/72">{text}</div>
                      </button>
                    ))}
                  </div>
                  {intentPreview ? (
                    <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Intent Preview</div>
                      <div className="mt-1 text-sm text-cyan-50/92">
                        {intentPreview.type} · {intentPreview.action}
                      </div>
                      <div className="mt-1 text-xs uppercase tracking-[0.22em] text-cyan-300/55">
                        Risk: {intentPreview.risk} {intentPreview.requires_approval ? '· approval required' : ''}
                      </div>
                      <div className="mt-2 text-sm text-slate-200/76">
                        {intentPreview.content || intentPreview.query || intentPreview.target || intentPreview.command || 'No extra detail.'}
                      </div>
                    </div>
                  ) : null}
                  {intentExecution?.result?.content ? (
                    <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Intent Result</div>
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm text-slate-200/76">
                        {intentExecution.result.content}
                      </pre>
                    </div>
                  ) : null}
                  {intentExecution?.result?.metadata &&
                  ('target_ready' in intentExecution.result.metadata ||
                    'active_window_title' in intentExecution.result.metadata) ? (
                    <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      {(() => {
                        const targetReady = Boolean(intentExecution.result.metadata?.target_ready);
                        const targetReason = String(intentExecution.result.metadata?.target_reason || 'No readiness note available.');
                        const activeWindowTitle = String(intentExecution.result.metadata?.active_window_title || '');
                        const submitMode = String(intentExecution.result.metadata?.submit_mode || '');
                        return (
                          <>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Target Readiness</div>
                        <div
                          className={`text-[10px] uppercase tracking-[0.22em] ${targetReady ? 'text-emerald-300/80' : 'text-amber-300/80'}`}
                        >
                          {targetReady ? 'ready' : 'verify first'}
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-slate-200/76">
                        {targetReason}
                      </div>
                      {activeWindowTitle ? (
                        <div className="mt-2 text-xs text-cyan-200/65">
                          Active window: {activeWindowTitle}
                        </div>
                      ) : null}
                      {submitMode ? (
                        <div className="mt-1 text-xs uppercase tracking-[0.18em] text-cyan-200/65">
                          Submit mode: {submitMode}
                        </div>
                      ) : null}
                          </>
                        );
                      })()}
                    </div>
                  ) : null}
                  {intentExecution?.result?.items?.length ? (
                    <div className="mt-3 space-y-2">
                      {intentExecution.result.items.slice(0, 3).map((item, index) => (
                        <div
                          key={`${item.content}-${index}`}
                          className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3"
                        >
                          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                            Memory Match · {item.score.toFixed(2)}
                          </div>
                          <div className="mt-2 text-sm text-slate-200/76">{item.content}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {intentExecution?.result?.sources?.length ? (
                    <div className="mt-3 grid gap-2">
                      {intentExecution.result.sources.slice(0, 4).map((item) => (
                        <div
                          key={`${item.url}-${item.title}`}
                          className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3"
                        >
                          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Web Source</div>
                          <div className="mt-1 text-sm text-cyan-50/92">{item.title}</div>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 block text-xs text-cyan-300/80 underline-offset-4 hover:underline"
                          >
                            {item.url}
                          </a>
                          <div className="mt-2 text-sm text-slate-200/76">{item.snippet}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {screenSnapshot ? (
                    <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                          {screenSnapshot.source === 'upload' ? 'Visual Upload' : 'Screen Snapshot'}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                          {new Date(screenSnapshot.capturedAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-slate-300/65">{screenSnapshot.label}</div>
                      <img
                        src={screenSnapshot.dataUrl}
                        alt={screenSnapshot.label}
                        className="mt-3 max-h-48 w-full rounded-[0.95rem] border border-cyan-400/10 object-cover"
                      />
                      <textarea
                        value={screenContextNote}
                        onChange={(event) => setScreenContextNote(event.target.value)}
                        placeholder="What matters in this visual? Add a short note so JARVIS can turn it into a task or memory."
                        className="mt-3 min-h-[84px] w-full rounded-[0.95rem] border border-cyan-400/10 bg-slate-950/70 px-3 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                      {screenDeck.length > 1 ? (
                        <div className="mt-3">
                          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                            Screen Deck · {screenDeck.length}
                          </div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {screenDeck.map((item) => (
                              <button
                                key={`${item.label}-${item.capturedAt}`}
                                onClick={() => {
                                  setScreenSnapshot(item);
                                  setVisionAnalysis(null);
                                }}
                                className={`rounded-[0.9rem] border px-3 py-3 text-left transition ${
                                  screenSnapshot?.capturedAt === item.capturedAt
                                    ? 'border-cyan-300/30 bg-cyan-400/[0.1]'
                                    : 'border-cyan-400/10 bg-slate-950/55 hover:bg-cyan-400/[0.08]'
                                }`}
                              >
                                <div className="text-xs uppercase tracking-[0.2em] text-cyan-100/85">{item.label}</div>
                                <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-cyan-300/55">
                                  {new Date(item.capturedAt).toLocaleTimeString()}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => captureScreenSnapshot(`Screen ${screenDeck.length + 1}`, true)}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                        >
                          Add Screen
                        </button>
                        <button
                          onClick={() =>
                            injectCommand(
                              screenSnapshot.source === 'upload'
                                ? 'I uploaded an image into the HUD. Help me figure out what the most important visible detail is, then ask one clarifying question before you suggest the next action.'
                                : 'I captured a screen snapshot in the HUD. Help me figure out what the most important visible task is, then ask one clarifying question before you suggest the next action.',
                            )
                          }
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                        >
                          Load Visual Prompt
                        </button>
                        <button
                          onClick={analyzeCurrentVisual}
                          disabled={visionBusy}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {visionBusy ? 'Analyzing' : 'Analyze'}
                        </button>
                        <button
                          onClick={extractCurrentVisualText}
                          disabled={visionBusy}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {visionBusy ? 'Extracting' : 'Extract Text'}
                        </button>
                        <button
                          onClick={analyzeAllScreens}
                          disabled={visionBusy || !screenDeck.length}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {visionBusy ? 'Analyzing' : `Analyze All${screenDeck.length > 1 ? ` (${screenDeck.length})` : ''}`}
                        </button>
                        <button
                          onClick={extractAllScreensText}
                          disabled={visionBusy || !screenDeck.length}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {visionBusy ? 'Extracting' : `Extract All${screenDeck.length > 1 ? ` (${screenDeck.length})` : ''}`}
                        </button>
                        <button
                          onClick={createTaskFromScreenContext}
                          disabled={actionBusy !== null || !screenContextNote.trim()}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Make Task
                        </button>
                        <button
                          onClick={rememberScreenContext}
                          disabled={intentBusy !== null || !screenContextNote.trim()}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Remember
                        </button>
                        <button
                          onClick={createTaskFromVisionResult}
                          disabled={actionBusy !== null || (!visionAnalysis?.content && !visionTextExtraction?.content)}
                          className="rounded-[0.85rem] border border-emerald-300/18 bg-emerald-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-emerald-100 transition hover:bg-emerald-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Task From Vision
                        </button>
                        <button
                          onClick={suggestVisualActions}
                          disabled={visionBusy || !screenDeck.length}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {visionBusy ? 'Planning' : 'Suggest Actions'}
                        </button>
                        <button
                          onClick={() => {
                            setScreenSnapshot(null);
                            setScreenDeck([]);
                            setScreenContextNote('');
                            setVisionAnalysis(null);
                            setVisionTextExtraction(null);
                            setVisionSuggestedActions(null);
                          }}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                        >
                          Clear Visual
                        </button>
                      </div>
                      {visionAnalysis?.content ? (
                        <div className="mt-3 rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Vision Analysis</div>
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                              {visionAnalysis.model}
                              {visionAnalysis.screen_count ? ` · ${visionAnalysis.screen_count} screens` : ''}
                            </div>
                          </div>
                          <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200/76">
                            {visionAnalysis.content}
                          </pre>
                        </div>
                      ) : null}
                      {visionTextExtraction?.content ? (
                        <div className="mt-3 rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Visible Text</div>
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                              {visionTextExtraction.model}
                              {visionTextExtraction.screen_count ? ` · ${visionTextExtraction.screen_count} screens` : ''}
                            </div>
                          </div>
                          <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200/76">
                            {visionTextExtraction.content}
                          </pre>
                        </div>
                      ) : null}
                      {visionSuggestedActions?.actions?.length ? (
                        <div className="mt-3 rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Visual Next Actions</div>
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                              {visionSuggestedActions.model}
                              {visionSuggestedActions.screen_count ? ` · ${visionSuggestedActions.screen_count} screens` : ''}
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2">
                            {visionSuggestedActions.actions.map((item, index) => (
                              <div
                                key={`${item.title}-${index}`}
                                className="rounded-[0.9rem] border border-cyan-400/10 bg-black/20 px-3 py-3"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-xs uppercase tracking-[0.2em] text-cyan-100/85">{item.title}</div>
                                  <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/55">
                                    priority {item.priority}
                                  </div>
                                </div>
                                <div className="mt-2 text-sm text-slate-200/76">{item.detail}</div>
                                <div className="mt-3 flex gap-2">
                                  <button
                                    onClick={() => injectCommand(item.prompt)}
                                    className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                                  >
                                    Load Prompt
                                  </button>
                                  <button
                                    onClick={async () => {
                                      setActionBusy('stage');
                                      try {
                                        const next = await stageTask({
                                          title: item.title,
                                          notes: `${item.detail}\n\n${item.prompt}`,
                                        });
                                        setActionCenter(next);
                                        setActionNotice('Visual action staged as a task.');
                                      } catch (error) {
                                        setActionNotice(error instanceof Error ? error.message : 'Unable to stage visual action.');
                                      } finally {
                                        setActionBusy(null);
                                      }
                                    }}
                                    className="rounded-[0.85rem] border border-emerald-300/18 bg-emerald-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-emerald-100 transition hover:bg-emerald-400/[0.14]"
                                  >
                                    Stage Task
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {durableOperatorMemory?.visual_observations?.length ? (
                    <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Recent Visual Memory</div>
                      <div className="mt-3 grid gap-2">
                        {durableOperatorMemory.visual_observations.slice(0, 3).map((item) => (
                          <div
                            key={item.id}
                            className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3"
                          >
                            {item.image_path ? (
                              <img
                                src={`${apiBase}/v1/operator-memory/visual/${encodeURIComponent(item.id)}/asset`}
                                alt={item.label}
                                className="mb-3 max-h-32 w-full rounded-[0.85rem] border border-cyan-400/10 object-cover"
                              />
                            ) : null}
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs uppercase tracking-[0.2em] text-cyan-100/85">{item.label}</div>
                              <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                                {item.source}
                              </div>
                            </div>
                            <div className="mt-2 text-sm text-slate-200/76">{item.note}</div>
                            <div className="mt-3 flex gap-2">
                              <button
                                onClick={() => restoreVisualObservation(item)}
                                className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                              >
                                Reload
                              </button>
                              <button
                                onClick={() =>
                                  injectCommand(
                                    `I restored a saved visual memory called "${item.label}". Help me continue from this context: ${item.note}`,
                                  )
                                }
                                className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                              >
                                Load Prompt
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
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
                    disabled={actionBusy !== null || !actionCenterExecutionHint.ready}
                    className="mt-3 w-full rounded-[0.9rem] border border-cyan-300/20 bg-cyan-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.28em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actionBusy === 'stage' ? 'Staging' : actionCenterExecutionHint.button}
                  </button>
                  <div className="mt-3 rounded-[0.9rem] border border-cyan-400/10 bg-black/20 px-3 py-3 text-sm text-slate-200/76">
                    {actionCenterExecutionHint.label}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {connectorCapabilities.map((item) => (
                      <div
                        key={item.label}
                        className="rounded-[0.9rem] border border-cyan-400/10 bg-black/20 px-3 py-3"
                      >
                        <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/55">{item.label}</div>
                        <div className="mt-1 text-sm text-slate-200/76">{item.value}</div>
                      </div>
                    ))}
                  </div>
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

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">
                    Repo Dock
                  </div>
                  <div className="grid gap-3">
                    <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Active Repo</div>
                      <div className="mt-1 text-sm text-cyan-50/92">
                        {activeWorkspaceRepo?.name || workspaceSummary?.root?.split(/[\\\\/]/).slice(-1)[0] || 'Workspace'}
                      </div>
                      <div className="mt-1 text-xs text-slate-300/70">
                        {activeWorkspaceRepo?.remote_url || workspaceSummary?.remote_url || workspaceSummary?.root || 'No repo registered yet.'}
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[1fr_160px]">
                      <input
                        value={repoPathInput}
                        onChange={(event) => setRepoPathInput(event.target.value)}
                        placeholder="C:\\dev\\my-repo or /mnt/c/dev/my-repo"
                        className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                      <button
                        onClick={handleRegisterRepo}
                        disabled={repoBusy !== null}
                        className="rounded-[0.9rem] border border-cyan-300/20 bg-cyan-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.28em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {repoBusy === 'register' ? 'Connecting' : 'Connect Repo'}
                      </button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[1fr_160px]">
                      <input
                        value={repoCloneUrl}
                        onChange={(event) => setRepoCloneUrl(event.target.value)}
                        placeholder="https://github.com/org/repo.git"
                        className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                      />
                      <button
                        onClick={loadCloneRepoCommand}
                        className="rounded-[0.9rem] border border-cyan-400/12 bg-slate-950/70 px-4 py-3 text-xs uppercase tracking-[0.28em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                      >
                        Load Clone Cmd
                      </button>
                    </div>
                    {workspaceRepos?.repos?.length ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {workspaceRepos.repos.slice(0, 6).map((repo) => (
                          <button
                            key={repo.root}
                            onClick={() => handleSelectRepo(repo.root)}
                            disabled={repoBusy !== null || repo.root === workspaceRepos.active_root}
                            className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3 text-left transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">
                              {repo.root === workspaceRepos.active_root ? 'Active' : 'Tracked'}
                            </div>
                            <div className="mt-1 text-sm text-cyan-50/92">{repo.name}</div>
                            <div className="mt-1 text-xs text-slate-300/70">{repo.branch}</div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {repoNotice ? <div className="text-sm text-cyan-100/80">{repoNotice}</div> : null}
                  </div>
                </div>

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">
                    Validation Loop
                  </div>
                  <div className="text-sm leading-7 text-slate-200/78">
                    Suggested checks for the active repo. Load them into the workbench, then approve execution from the gate.
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(workspaceChecks?.checks || []).map((item) => (
                      <button
                        key={`${item.kind}-${item.command}`}
                        onClick={() => stageSuggestedCommand(item.command)}
                        className="rounded-[0.95rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-3 text-left transition hover:bg-cyan-400/[0.14]"
                      >
                        <div className="text-xs uppercase tracking-[0.22em] text-cyan-50/92">{item.label}</div>
                        <div className="mt-1 text-xs text-slate-300/72">{item.command}</div>
                      </button>
                    ))}
                    {!workspaceChecks?.checks?.length ? (
                      <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3 text-sm text-slate-200/72 sm:col-span-2">
                        No suggested checks detected for this repo yet.
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px_180px]">
                    <input
                      value={gitCommitMessage}
                      onChange={(event) => setGitCommitMessage(event.target.value)}
                      placeholder="feat: improve HUD coding workflow"
                      className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <button
                      onClick={loadPreparedCommitCommand}
                      className="rounded-[0.9rem] border border-cyan-400/12 bg-slate-950/70 px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                    >
                      Prepare Commit
                    </button>
                    <button
                      onClick={loadPreparedPushCommand}
                      className="rounded-[0.9rem] border border-cyan-400/12 bg-slate-950/70 px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                    >
                      Prepare Push
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(workspaceChecks?.git_actions || []).map((item) => (
                      <button
                        key={`${item.kind}-${item.command}`}
                        onClick={() => stageSuggestedCommand(item.command)}
                        className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-3 text-left transition hover:bg-cyan-400/[0.08]"
                      >
                        <div className="text-xs uppercase tracking-[0.22em] text-cyan-50/92">{item.label}</div>
                        <div className="mt-1 text-xs text-slate-300/72">{item.command}</div>
                      </button>
                    ))}
                  </div>
                  {latestValidationFailure ? (
                    <div className="mt-3 rounded-[0.95rem] border border-amber-400/20 bg-amber-400/[0.06] px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-amber-200/70">Latest Failure</div>
                      <div className="mt-1 text-sm text-amber-50/90">{latestValidationFailure.command}</div>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() =>
                            injectCommand(
                              `A validation command failed.\nCommand: ${latestValidationFailure.command}\nOutput:\n${latestValidationFailure.output}\nDiagnose the root cause and propose the next safe patch.`,
                            )
                          }
                          className="rounded-[0.85rem] border border-amber-300/20 bg-amber-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-amber-100 transition hover:bg-amber-400/[0.14]"
                        >
                          Load Fix Prompt
                        </button>
                        <button
                          onClick={() => stageSuggestedCommand(latestValidationFailure.command)}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                        >
                          Rerun Check
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {latestValidationSuccess ? (
                    <div className="mt-3 rounded-[0.95rem] border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-200/70">Latest Green Check</div>
                      <div className="mt-1 text-sm text-emerald-50/90">{latestValidationSuccess.command}</div>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() =>
                            prepareCommitCommand(
                              gitCommitMessage.trim() || buildSuggestedCommitMessage(latestCodeResult?.file_path || editorFilePath || undefined),
                              'Commit command prepared from the latest green validation run.',
                            )
                          }
                          className="rounded-[0.85rem] border border-emerald-300/20 bg-emerald-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-emerald-100 transition hover:bg-emerald-400/[0.14]"
                        >
                          Prepare Commit
                        </button>
                        <button
                          onClick={loadPreparedPushCommand}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                        >
                          Prepare Push
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">
                    Coding Presets
                  </div>
                  <div className="text-sm leading-7 text-slate-200/78">
                    Fast repo-aware actions for inspection, debugging, review, and safe shell staging.
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {([
                      ['Inspect Repo', () => loadCodingPrompt('inspect')],
                      ['Debug Mode', () => loadCodingPrompt('debug')],
                      ['Review Mode', () => loadCodingPrompt('review')],
                      ['Refactor Mode', () => loadCodingPrompt('refactor')],
                    ] as const).map(([label, action]) => (
                      <button
                        key={label}
                        onClick={action}
                        className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-3 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {([
                      ['Git Status', () => loadWorkbenchPreset('status')],
                      ['Changed Files', () => loadWorkbenchPreset('changed-files')],
                      ['Test Scan', () => loadWorkbenchPreset('test-scan')],
                      ['Python Version', () => loadWorkbenchPreset('python-version')],
                    ] as const).map(([label, action]) => (
                      <button
                        key={label}
                        onClick={action}
                        className="rounded-[0.95rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-3 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">
                    Repo State
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Branch</div>
                      <div className="mt-1 text-sm text-cyan-50/92">{workspaceSummary?.branch || 'Unknown'}</div>
                    </div>
                    <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Worktree</div>
                      <div className="mt-1 text-sm text-cyan-50/92">
                        {workspaceSummary ? (workspaceSummary.dirty ? `${workspaceSummary.changed_count} changed` : 'Clean') : 'Checking'}
                      </div>
                    </div>
                    <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Root</div>
                      <div className="mt-1 text-sm text-cyan-50/92">{workspaceSummary?.root?.split(/[\\\\/]/).slice(-1)[0] || 'Workspace'}</div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Changed Files</div>
                    {workspaceSummary?.changed_files?.length ? (
                      <div className="mt-2 space-y-2">
                        {workspaceSummary.changed_files.slice(0, 5).map((filePath) => (
                          <div
                            key={filePath}
                            className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/60 px-3 py-3"
                          >
                            <div className="text-sm text-cyan-50/92">{filePath}</div>
                            <div className="mt-2 grid gap-2 sm:grid-cols-4">
                              <button
                                onClick={() => loadFileCodingPrompt(filePath, 'review')}
                                className="rounded-[0.8rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                              >
                                Review
                              </button>
                              <button
                                onClick={() => loadFileCodingPrompt(filePath, 'debug')}
                                className="rounded-[0.8rem] border border-cyan-400/12 bg-slate-950/70 px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                              >
                                Debug
                              </button>
                              <button
                                onClick={() => loadFileCodingPrompt(filePath, 'inspect')}
                                className="rounded-[0.8rem] border border-cyan-400/12 bg-slate-950/70 px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                              >
                                Inspect
                              </button>
                              <button
                                onClick={() => loadFileWorkbenchPreset(filePath)}
                                className="rounded-[0.8rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                              >
                                Diff
                              </button>
                              <button
                                onClick={() => openFileInEditor(filePath)}
                                className="rounded-[0.8rem] border border-cyan-400/12 bg-slate-950/70 px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => addCodingTask(filePath, 'fix', `Fix ${filePath}`)}
                                className="rounded-[0.8rem] border border-amber-300/20 bg-amber-400/[0.08] px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-amber-100 transition hover:bg-amber-400/[0.14]"
                              >
                                Task
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm leading-6 text-slate-200/76">
                        No tracked changes reported.
                      </div>
                    )}
                  </div>
                  <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Top Level</div>
                    <div className="mt-2 text-sm leading-6 text-slate-200/76">
                      {workspaceSummary?.top_level?.length ? workspaceSummary.top_level.join(' · ') : 'Loading workspace layout...'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">
                    Code Editor
                  </div>
                  <div className="grid gap-3">
                    <input
                      value={editorFilePath}
                      onChange={(event) => setEditorFilePath(event.target.value)}
                      placeholder="Relative file path inside the active repo"
                      className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <textarea
                      value={editorContent}
                      onChange={(event) => setEditorContent(event.target.value)}
                      rows={12}
                      placeholder="Load a file from Repo State, then edit it here."
                      className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_180px]">
                      <button
                        onClick={() => editorFilePath && openFileInEditor(editorFilePath)}
                        disabled={editorBusy !== null || !editorFilePath.trim()}
                        className="rounded-[0.9rem] border border-cyan-400/12 bg-slate-950/70 px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {editorBusy === 'load' ? 'Loading' : 'Reload File'}
                      </button>
                      <button
                        onClick={() => {
                          setEditorContent(editorOriginalContent);
                          setEditorNotice('Editor reset to the last loaded file state.');
                        }}
                        disabled={editorBusy !== null || !editorFilePath.trim()}
                        className="rounded-[0.9rem] border border-cyan-400/12 bg-slate-950/70 px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Reset Draft
                      </button>
                      <button
                        onClick={handleStageCodeEdit}
                        disabled={editorBusy !== null || !editorFilePath.trim()}
                        className="rounded-[0.9rem] border border-cyan-300/20 bg-cyan-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.28em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {editorBusy === 'stage' ? 'Staging' : 'Stage Diff'}
                      </button>
                    </div>
                    {pendingCodeEdit ? (
                      <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Staged Diff</div>
                        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-200/76">
                          {pendingCodeEdit.diff}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">
                    Review Queue
                  </div>
                  {structuredReviewQueue.length ? (
                    <div className="space-y-2">
                      {structuredReviewQueue.map((item) => (
                        <div
                          key={item.filePath}
                          className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm text-cyan-50/92">{item.filePath}</div>
                              <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                                {item.status === 'done'
                                  ? 'done'
                                  : item.status === 'in_progress'
                                  ? 'in progress'
                                  : 'pending'}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => loadFileCodingPrompt(item.filePath, 'review')}
                                className="rounded-[0.8rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                              >
                                Open
                              </button>
                              <button
                                onClick={() => openFileInEditor(item.filePath)}
                                className="rounded-[0.8rem] border border-cyan-400/12 bg-slate-950/70 px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => markReviewQueueStatus(item.filePath, item.status === 'done' ? 'pending' : 'done')}
                                className="rounded-[0.8rem] border border-cyan-400/12 bg-slate-950/70 px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                              >
                                {item.status === 'done' ? 'Reopen' : 'Done'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm leading-6 text-slate-200/76">
                      No changed files in queue right now.
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">
                    Coding Tasks
                  </div>
                  {codingTasks.length ? (
                    <div className="space-y-2">
                      {codingTasks.slice(0, 8).map((task) => (
                        <div
                          key={task.id}
                          className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm text-cyan-50/92">{task.title}</div>
                              <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                                {task.status === 'done' ? 'done' : task.status === 'in_progress' ? 'in progress' : 'pending'} · {task.filePath}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => loadFileCodingPrompt(task.filePath, task.mode === 'fix' ? 'debug' : task.mode)}
                                className="rounded-[0.8rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                              >
                                Open
                              </button>
                              <button
                                onClick={() => updateCodingTaskStatus(task.id, task.status === 'done' ? 'pending' : 'done')}
                                className="rounded-[0.8rem] border border-cyan-400/12 bg-slate-950/70 px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                              >
                                {task.status === 'done' ? 'Reopen' : 'Done'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm leading-6 text-slate-200/76">
                      No coding tasks yet. Add one from a changed file with Review, Debug, Inspect, or Edit.
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">
                    Project Memory
                  </div>
                  <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Focus</div>
                    <div className="mt-1 text-sm text-slate-200/76">
                      {currentProjectMemory?.focus || 'No saved project focus yet.'}
                    </div>
                  </div>
                  <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Status / Next Step</div>
                    <div className="mt-1 text-sm text-slate-200/76">
                      {currentProjectMemory?.status || 'No saved status.'}
                    </div>
                    <div className="mt-2 text-sm text-cyan-50/92">
                      {currentProjectMemory?.next_step || 'No saved next step.'}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={saveCurrentProjectMemory}
                      className="rounded-[0.95rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-3 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                    >
                      Save Project State
                    </button>
                    <button
                      onClick={() => loadCodingPrompt('inspect')}
                      className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-3 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                    >
                      Use In Prompt
                    </button>
                  </div>
                  {projectMemoryNotice ? (
                    <div className="mt-3 text-sm text-cyan-100/80">{projectMemoryNotice}</div>
                  ) : null}
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
                  {latestAutomationLog
                    ? `${latestAutomationLog.success ? 'ok' : 'error'} · routine ${latestAutomationLog.routine_id}`
                    : latestActionResult
                    ? `${latestActionResult.status} · ${latestActionResult.title}`
                    : latestCodeResult
                    ? `${latestCodeResult.status} · ${latestCodeResult.file_path}`
                    : latestWorkbenchResult
                    ? `${latestWorkbenchResult.status} · ${latestWorkbenchResult.command}`
                    : 'No operator output yet'}
                </div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words">
                  {latestAutomationLog?.result ||
                    latestAutomationLog?.error ||
                    latestActionResult?.result ||
                    latestCodeResult?.diff ||
                    latestWorkbenchResult?.output ||
                    'Stage an action or a safe terminal command and approve it from the gate to see output here.'}
                </pre>
              </div>
            </Panel>

            <Panel title="Commander Queue" kicker="Next best actions">
              <div className="space-y-3">
                {commanderQueue.length ? (
                  commanderQueue.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">{item.label}</div>
                          <div className="mt-1 text-sm uppercase tracking-[0.14em] text-cyan-50/92">{item.title}</div>
                        </div>
                        <button
                          onClick={item.action}
                          className="rounded-[0.85rem] border border-cyan-300/20 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                        >
                          {item.actionLabel}
                        </button>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-200/72">{item.detail}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-200/72">
                    No urgent work in queue. JARVIS is clear to listen, monitor, and prepare the next routine.
                  </div>
                )}
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

            <Panel title="Automation Matrix" kicker="Operator routines">
              <div className="space-y-3">
                <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                    Morning Brief
                  </div>
                  <div className="mt-1 text-sm text-slate-200/76">
                    {digestSchedule?.enabled ? `Scheduled · ${digestSchedule.cron}` : 'Manual only'}
                  </div>
                </div>
                <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                    Meeting Prep
                  </div>
                  <div className="mt-1 text-sm text-slate-200/76">
                    {operatorProfile.autoPrepareMeetings
                      ? `Auto at ${operatorProfile.prepLeadMinutes} min lead`
                      : 'Manual queue only'}
                  </div>
                </div>
                <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                    Inbox Sweep
                  </div>
                  <div className="mt-1 text-sm text-slate-200/76">
                    {operatorProfile.autoTriageInbox
                      ? `Auto queue of ${operatorProfile.inboxFocusCount}`
                      : 'Manual queue only'}
                  </div>
                </div>
                <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                    Server Routines
                  </div>
                  <div className="mt-1 text-sm text-slate-200/76">
                    {automationStatus?.available
                      ? `${automationStatus.items.length} persistent routines configured`
                      : 'Scheduler not active in server config'}
                  </div>
                  {automationStatus?.available ? (
                    <div className="mt-3 space-y-2">
                      {([
                        ['daily_ops', 'Daily Ops', '0 8 * * *'],
                        ['inbox_sweep', 'Inbox Sweep', '0 9 * * *'],
                        ['meeting_prep', 'Meeting Prep', '0 * * * *'],
                      ] as const).map(([routineId, label, cron]) => {
                        const routine = automationStatus.items.find((item) => item.routine_id === routineId);
                        const active = routine?.status === 'active';
                        return (
                          <div
                            key={routineId}
                            className="flex items-center justify-between gap-3 rounded-[0.9rem] border border-cyan-400/10 bg-black/20 px-3 py-2"
                          >
                            <div>
                              <div className="text-xs uppercase tracking-[0.16em] text-cyan-50/90">{label}</div>
                              <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-cyan-300/55">
                                {active ? `${routine?.cron || cron} · next ${routine?.next_run || 'pending'}` : 'disabled'}
                              </div>
                            </div>
                            <button
                              onClick={() => toggleServerRoutine(routineId, !active, cron)}
                              className={`rounded-[0.85rem] border px-3 py-2 text-[10px] uppercase tracking-[0.22em] transition ${
                                active
                                  ? 'border-cyan-300/20 bg-cyan-400/[0.08] text-cyan-100 hover:bg-cyan-400/[0.14]'
                                  : 'border-cyan-400/10 bg-slate-950/70 text-slate-300 hover:bg-cyan-400/[0.08]'
                              }`}
                            >
                              {active ? 'Disable' : 'Enable'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={runDailyOpsSweep}
                    className="rounded-[0.95rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                  >
                    Run Daily Ops
                  </button>
                  <button
                    onClick={() => prepQueue[0] && prepareMeetingFromReminder(prepQueue[0])}
                    disabled={!prepQueue.length}
                    className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Prime Next Meeting
                  </button>
                </div>
              </div>
            </Panel>

            <Panel title="Alert Center" kicker="Actionable updates">
              <div className="space-y-3">
                {activeAutomationAlerts.length ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-2">
                      {([
                        ['all', `All ${alertCounts.all}`],
                        ['errors', `Errors ${alertCounts.errors}`],
                        ['ready', `Ready ${alertCounts.ready}`],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          onClick={() => setAlertFilter(value)}
                          className={`rounded-[0.85rem] border px-3 py-2 text-[10px] uppercase tracking-[0.22em] transition ${
                            alertFilter === value
                              ? 'border-cyan-300/20 bg-cyan-400/[0.08] text-cyan-100'
                              : 'border-cyan-400/10 bg-slate-950/70 text-slate-300 hover:bg-cyan-400/[0.08]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={clearAutomationAlerts}
                      className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-slate-300 transition hover:bg-cyan-400/[0.08]"
                    >
                      Clear All
                    </button>
                  </div>
                ) : null}
                {filteredAutomationAlerts.length ? (
                  filteredAutomationAlerts.map((item) => (
                    <div
                      key={`${item.task_id}:${item.started_at}`}
                      className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm uppercase tracking-[0.16em] text-cyan-50/92">
                            {formatRoutineLabel(item.routine_id)}
                          </div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                            {item.success ? 'ready for review' : 'needs attention'} · {formatReminderMoment(item.started_at)}
                          </div>
                        </div>
                        <div className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
                          item.success ? 'bg-emerald-300/10 text-emerald-200' : 'bg-amber-300/10 text-amber-200'
                        }`}>
                          {item.success ? 'Ready' : 'Error'}
                        </div>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-200/72">
                        {item.result || item.error || 'No output captured.'}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleAutomationFollowup(item)}
                          className="rounded-[0.85rem] border border-cyan-300/20 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                        >
                          {item.routine_id === 'daily_ops'
                            ? 'Run Again'
                            : item.routine_id === 'inbox_sweep'
                            ? 'Open Inbox Draft'
                            : 'Open Meeting Prep'}
                        </button>
                        <button
                          onClick={() => dismissAutomationAlert(item)}
                          className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-slate-300 transition hover:bg-cyan-400/[0.08]"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))
                ) : activeAutomationAlerts.length ? (
                  <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-200/72">
                    No alerts match the current filter.
                  </div>
                ) : (
                  <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-200/72">
                    No active alerts right now. Background routines will surface here when they finish.
                  </div>
                )}
              </div>
            </Panel>

            <Panel title="Operations Log" kicker="Background runs">
              <div className="space-y-3">
                {automationLogs.length ? (
                  automationLogs.slice(0, 6).map((item) => (
                    <div
                      key={`${item.task_id}-${item.started_at}`}
                      className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3"
                    >
                      <div className="text-sm uppercase tracking-[0.16em] text-cyan-50/92">
                        {item.routine_id.replace('_', ' ')}
                      </div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                        {item.success ? 'success' : 'error'} · {formatReminderMoment(item.started_at)}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-200/72">
                        {item.result || item.error || 'No output captured.'}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-200/72">
                    No background routine runs recorded yet. Enable a server routine and let it execute to populate this log.
                  </div>
                )}
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
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={operatorProfile.inboxFocusCount}
                      onChange={(event) =>
                        updateOperatorProfile({
                          inboxFocusCount: Math.max(1, Math.min(5, Number(event.target.value) || 3)),
                        })
                      }
                      placeholder="Inbox focus count"
                      className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <button
                      onClick={() =>
                        updateOperatorProfile({
                          autoTriageInbox: !operatorProfile.autoTriageInbox,
                        })
                      }
                      className={`rounded-[0.9rem] border px-4 py-3 text-xs uppercase tracking-[0.22em] transition ${
                        operatorProfile.autoTriageInbox
                          ? 'border-cyan-300/20 bg-cyan-400/[0.08] text-cyan-100 hover:bg-cyan-400/[0.14]'
                          : 'border-cyan-400/10 bg-slate-950/70 text-slate-300 hover:bg-cyan-400/[0.08]'
                      }`}
                    >
                      {operatorProfile.autoTriageInbox ? 'Auto Inbox On' : 'Auto Inbox Off'}
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

            <Panel title="Inbox Queue" kicker="Priority focus">
              <div className="space-y-3">
                {inboxFocusQueue.length ? (
                  inboxFocusQueue.map((item) => (
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
                      <div className="mt-2 text-sm leading-6 text-slate-200/72">
                        {item.snippet || 'No preview available.'}
                      </div>
                      <div className="mt-2 text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                        Auto queue size: {operatorProfile.inboxFocusCount}
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <button
                          onClick={() => prepareReplyDraft(item)}
                          disabled={!item.author_email}
                          className="rounded-[0.95rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Draft Reply
                        </button>
                        <button
                          onClick={() => triageInboxItem(item)}
                          className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                        >
                          Triage
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-200/72">
                    No priority inbox items yet. Connect mail and sync to build an operator queue.
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
