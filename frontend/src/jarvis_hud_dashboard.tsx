import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
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
  analyzeDocumentFiles,
  exportDocumentAnalysis,
  approveActionCenterItem,
  analyzeVision,
  analyzeVisionMulti,
  extractVisionSignals,
  extractVisionUiTargets,
  extractVisionText,
  extractVisionTextMulti,
  suggestVisionActions,
  approveCodeEdit,
  approveWorkbenchCommand,
  createManagedAgent,
  fetchActionCenterStatus,
  fetchAgentArchitectureStatus,
  fetchAgentTasks,
  fetchAutomationLogs,
  fetchAutomationStatus,
  fetchCodingStatus,
  fetchDailyDigest,
  fetchDesktopState,
  fetchDigestSchedule,
  fetchInboxSummary,
  executeJarvisIntent,
  ensureCoreAgentArchitecture,
  handoffAgentArchitecture,
  fetchManagedAgents,
  fetchOperatorMemory,
  fetchShopifySummary,
  parseJarvisIntent,
  fetchReminders,
  fetchSpeechHealth,
  fetchSpeechProfile,
  fetchWorkspaceChecks,
  fetchWorkspaceRepos,
  fetchTaskSummary,
  planVisionUiAction,
  queryVision,
  verifyVisionUiTarget,
  fetchWorkspaceSummary,
  fetchVoiceLoopStatus,
  fetchWorkbenchStatus,
  generateDailyDigest,
  getDailyDigestAudioUrl,
  holdActionCenterItem,
  holdCodeEdit,
  holdWorkbenchCommand,
  interruptVoiceLoop,
  prepareWorkspaceStage,
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
  stageCodingVerification,
  stageEmailDraft,
  stageInboxAction,
  stageTask,
  stageWorkbenchCommand,
  stopVoiceLoop,
  synthesizeSpeech,
  updateAutomationRoutine,
  updateDigestSchedule,
  updateOperatorMeeting,
  actOnOperatorMission,
  updateOperatorProject,
  updateOperatorRelationship,
  updateOperatorMission,
  updateOperatorSalesAccount,
  updateOperatorSalesDeal,
  updateOperatorDocumentBrief,
  updateOperatorDesignBrief,
  updateOperatorFivemBrief,
  fetchOperatorLearningExperiences,
  fetchOperatorCommanderBrief,
  markOperatorLearningExperiencesReused,
  updateOperatorLearningExperience,
  updateOperatorVisualBrief,
  updateOperatorVisualInsight,
  updateOperatorVisualObservation,
  updateVoiceLoopState,
  type ActionCenterCapabilities,
  type ActionCenterStatus,
  type AgentTask,
  type AgentArchitectureStatus,
  type AutomationLogEntry,
  type AutomationStatus,
  type CodingWorkspaceStatus,
  type DailyDigest,
  type DocumentAnalysisResult,
  type DesktopState,
  type DigestSchedule,
  type DurableOperatorMemory,
  type OperatorCommanderBriefResponse,
  type InboxSummaryItem,
  type JarvisIntent,
  type JarvisIntentExecution,
  type VisionAnalysisResult,
  type VisionSignalsResult,
  type VisionTextExtractionResult,
  type VisionSuggestedActionsResult,
  type VisionUiActionPlanResult,
  type VisionUiTargetsResult,
  type VisionUiVerifyResult,
  type VisionQueryResult,
  type ReminderItem,
  type ShopifySummary,
  type SpeechProfile,
  type TaskSummaryItem,
  type VoiceLoopStatus,
  type WorkspaceChecks,
  type WorkspaceSummary,
  type WorkspaceRepoCatalog,
  type WorkbenchStatus,
} from './lib/api';
import { listConnectors } from './lib/connectors-api';
import { buildCommercialBrief } from './lib/commercialBriefPresentation';
import { buildCommanderHandoffBrief, buildCommanderQueueItems } from './lib/commanderPresentation';
import { buildCustomerBrief } from './lib/customerBriefPresentation';
import { DESIGN_ARCHETYPES, getDesignArchetype, type DesignArchetypeId } from './lib/designCanon';
import { buildDesignBrief, buildDesignScorecard } from './lib/designBriefPresentation';
import { buildDocumentIntelBrief, buildVisualIntelBrief } from './lib/intelBriefPresentation';
import { buildFivemCodingBrief } from './lib/fivemBriefPresentation';
import {
  buildCommercialMission,
  buildDesignMission,
  buildDurableMissionLookup,
  buildFivemMission,
} from './lib/missionPresentation';
import { buildSalesBrief } from './lib/salesBriefPresentation';
import { buildShopifyBrief } from './lib/shopifyBriefPresentation';
import { buildSelfImproveBrief, buildSelfImprovePatchPlan } from './lib/selfImprovePresentation';
import {
  buildActiveAutomationAlerts,
  buildPrepQueue,
  buildPrioritizedContacts,
  countAutomationAlerts,
  filterAutomationAlerts,
  getImmediateReminder,
  sortInboxByPriority,
} from './lib/hudOperationsPresentation';
import { buildHudStatusMeta, getHudStatus } from './lib/hudStatusPresentation';
import { useAppStore } from './lib/store';
import { subscribeAgentEvents } from './lib/agentEvents';
import {
  buildVoiceReactorMetrics,
  getVoiceEnvironmentLabel,
  getVoicePhaseLabel,
  getVoiceReadinessLabel,
} from './lib/voicePresentation';
import type { ChatMessage, ToolCallInfo } from './types';
import type { CommercialOpsBrief } from './components/Dashboard/CommercialOpsPanel';
import type { FivemCodingBrief } from './components/Dashboard/FivemCodingPanel';
import type { MissionMatrixItem } from './components/Dashboard/MissionMatrix';
import type { ShopifyIntelBrief } from './components/Dashboard/ShopifyIntelPanel';
import { getFivemFrameworkCanon } from './lib/fivemCanon';
import { useSpeech } from './hooks/useSpeech';

const CommanderQueue = lazy(() =>
  import('./components/Dashboard/CommanderQueue').then((module) => ({ default: module.CommanderQueue })),
);
const ActionCenterPanel = lazy(() =>
  import('./components/Dashboard/ActionCenterPanel').then((module) => ({ default: module.ActionCenterPanel })),
);
const CoreAgentsPanel = lazy(() =>
  import('./components/Dashboard/CoreAgentsPanel').then((module) => ({ default: module.CoreAgentsPanel })),
);
const CommercialOpsPanel = lazy(() =>
  import('./components/Dashboard/CommercialOpsPanel').then((module) => ({ default: module.CommercialOpsPanel })),
);
const CustomerIntelPanel = lazy(() =>
  import('./components/Dashboard/CustomerIntelPanel').then((module) => ({ default: module.CustomerIntelPanel })),
);
const ShopifyIntelPanel = lazy(() =>
  import('./components/Dashboard/ShopifyIntelPanel').then((module) => ({ default: module.ShopifyIntelPanel })),
);
const DesignIntelligence = lazy(() =>
  import('./components/Dashboard/DesignIntelligence').then((module) => ({ default: module.DesignIntelligence })),
);
const DocumentIntel = lazy(() =>
  import('./components/Dashboard/DocumentIntel').then((module) => ({ default: module.DocumentIntel })),
);
const FivemCodingPanel = lazy(() =>
  import('./components/Dashboard/FivemCodingPanel').then((module) => ({ default: module.FivemCodingPanel })),
);
const IntentConsoleFeedback = lazy(() =>
  import('./components/Dashboard/IntentConsoleFeedback').then((module) => ({ default: module.IntentConsoleFeedback })),
);
const MissionMatrix = lazy(() =>
  import('./components/Dashboard/MissionMatrix').then((module) => ({ default: module.MissionMatrix })),
);
const RepoDockPanel = lazy(() =>
  import('./components/Dashboard/RepoDockPanel').then((module) => ({ default: module.RepoDockPanel })),
);
const SalesIntelPanel = lazy(() =>
  import('./components/Dashboard/SalesIntelPanel').then((module) => ({ default: module.SalesIntelPanel })),
);
const TerminalWorkbenchPanel = lazy(() =>
  import('./components/Dashboard/TerminalWorkbenchPanel').then((module) => ({ default: module.TerminalWorkbenchPanel })),
);
const VisualIntelPanel = lazy(() =>
  import('./components/Dashboard/VisualIntelPanel').then((module) => ({ default: module.VisualIntelPanel })),
);
const HudInputArea = lazy(() =>
  import('./components/Chat/InputArea').then((module) => ({ default: module.InputArea })),
);

function getApiBase() {
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (envBase) return envBase.replace(/\/$/, '');
  return typeof window !== 'undefined' ? window.location.origin : '';
}

type Status = 'Standby' | 'Listening' | 'Analyzing' | 'Responding';
type MissionPhase = 'detect' | 'plan' | 'act' | 'verify' | 'retry' | 'done';

type MissionStatus = 'idle' | 'active' | 'blocked' | 'complete';

type ConnectorSummary = {
  totalConnected: number;
  emailReady: boolean;
  calendarReady: boolean;
  docsReady: boolean;
  messagingReady: boolean;
  emailProvider: 'gmail' | 'outlook' | '';
  calendarProvider: 'gcalendar' | 'outlook' | '';
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

function missionPhaseLabel(phase: MissionPhase) {
  switch (phase) {
    case 'detect':
      return 'Detect';
    case 'plan':
      return 'Plan';
    case 'act':
      return 'Act';
    case 'verify':
      return 'Verify';
    case 'retry':
      return 'Retry';
    case 'done':
      return 'Done';
    default:
      return phase;
  }
}

function summarizeMissionMeta(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  return Object.entries(record)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
    .slice(0, 3)
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${String(value)}`);
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

function DashboardSectionFallback({ label = 'Loading panel...' }: { label?: string }) {
  return <div className="text-sm text-slate-200/72">{label}</div>;
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
const SELF_IMPROVE_RUNS_KEY = 'jarvis-self-improve-runs';

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

function loadSelfImproveRuns() {
  if (typeof window === 'undefined') {
    return [] as Array<{
      id: string;
      source: string;
      phase: 'brief' | 'route' | 'patch' | 'check' | 'outcome' | 'blocker';
      summary: string;
      detail: string;
      createdAt: number;
    }>;
  }
  try {
    const raw = window.localStorage.getItem(SELF_IMPROVE_RUNS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is {
            id: string;
            source: string;
            phase: 'brief' | 'route' | 'patch' | 'check' | 'outcome' | 'blocker';
            summary: string;
            detail: string;
            createdAt: number;
          } =>
            item &&
            typeof item.id === 'string' &&
            typeof item.source === 'string' &&
            ['brief', 'route', 'patch', 'check', 'outcome', 'blocker'].includes(String(item.phase)) &&
            typeof item.summary === 'string' &&
            typeof item.detail === 'string' &&
            typeof item.createdAt === 'number',
        )
      : [];
  } catch {
    return [];
  }
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

export default function JarvisHudDashboard({
  view = 'dashboard',
}: {
  view?: 'dashboard' | 'workspace' | 'operations' | 'briefings';
}) {
  const navigate = useNavigate();
  const isDashboardView = view === 'dashboard';
  const isWorkspaceView = view === 'workspace';
  const isOperationsView = view === 'operations';
  const isBriefingsView = view === 'briefings';
  const needsArchitectureTaskPolling = isDashboardView || isWorkspaceView || isOperationsView;
  const needsWorkspaceStatusPolling = isDashboardView || isWorkspaceView || isOperationsView;
  const needsExtendedIntelBriefs = isDashboardView || isWorkspaceView || isOperationsView;
  const needsOperatorMemoryBundle = isDashboardView || isOperationsView || isBriefingsView;
  const needsInboxBundle = isDashboardView || isOperationsView || isBriefingsView;
  const needsDigestBundle = isDashboardView;
  const needsCommanderBundle = isDashboardView || isOperationsView;
  const needsVoiceStatusPolling = isDashboardView || isOperationsView || isBriefingsView;
  const needsActionCenterPolling = isDashboardView || isOperationsView || isBriefingsView;
  const needsAutomationPolling = isDashboardView || isOperationsView;
  const needsAgentPresencePolling = isDashboardView || isOperationsView;
  const needsLearningPolling = isDashboardView || isWorkspaceView;
  const needsCodingFastPolling = isDashboardView || isWorkspaceView;
  const needsWorkbenchFastPolling = isDashboardView || isWorkspaceView;
  const needsConnectorSummary = isDashboardView || isWorkspaceView || isOperationsView || isBriefingsView;
  const activeConversationId = useAppStore((s) => s.activeId);
  const messages = useAppStore((s) => s.messages);
  const streamState = useAppStore((s) => s.streamState);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const settings = useAppStore((s) => s.settings);
  const operatorProfile = useAppStore((s) => s.operatorProfile);
  const operatorSignals = useAppStore((s) => s.operatorSignals);
  const logEntries = useAppStore((s) => s.logEntries);
  const managedAgents = useAppStore((s) => s.managedAgents);
  const setManagedAgents = useAppStore((s) => s.setManagedAgents);
  const apiReachable = useAppStore((s) => s.apiReachable);
  const setApiReachable = useAppStore((s) => s.setApiReachable);
  const setSelectedAgentId = useAppStore((s) => s.setSelectedAgentId);
  const updateOperatorProfile = useAppStore((s) => s.updateOperatorProfile);
  const recordOperatorSignal = useAppStore((s) => s.recordOperatorSignal);

  const [speechAvailable, setSpeechAvailable] = useState<boolean | null>(null);
  const [connectorSummary, setConnectorSummary] = useState<ConnectorSummary>({
    totalConnected: 0,
    emailReady: false,
    calendarReady: false,
    docsReady: false,
    messagingReady: false,
    emailProvider: '',
    calendarProvider: '',
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
  const [agentArchitecture, setAgentArchitecture] = useState<AgentArchitectureStatus | null>(null);
  const [agentRoleTasks, setAgentRoleTasks] = useState<Record<string, AgentTask[]>>({});
  const [architectureBusy, setArchitectureBusy] = useState(false);
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
  const [selfImproveRuns, setSelfImproveRuns] = useState<
    Array<{
      id: string;
      source: string;
      phase: 'brief' | 'route' | 'patch' | 'check' | 'outcome' | 'blocker';
      summary: string;
      detail: string;
      createdAt: number;
    }>
  >(() => loadSelfImproveRuns());
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
  const [workbenchBusy, setWorkbenchBusy] = useState<'prepare' | 'stage' | 'approve' | 'hold' | null>(null);
  const [workbenchNotice, setWorkbenchNotice] = useState('');
  const lastLearningFetchKeyRef = useRef('');
  const [actionMode, setActionMode] = useState<'email' | 'calendar'>('email');
  const [actionBusy, setActionBusy] = useState<'stage' | 'approve' | 'hold' | null>(null);
  const [actionNotice, setActionNotice] = useState('');
  const [actionAccountKey, setActionAccountKey] = useState('');
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
  const [commanderBrief, setCommanderBrief] = useState<OperatorCommanderBriefResponse | null>(null);
  const [desktopState, setDesktopState] = useState<DesktopState | null>(null);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [digestNotice, setDigestNotice] = useState('');
  const [digestBusy, setDigestBusy] = useState(false);
  const [digestScheduleBusy, setDigestScheduleBusy] = useState(false);
  const [relationshipNotice, setRelationshipNotice] = useState('');
  const [projectMemoryNotice, setProjectMemoryNotice] = useState('');
  const [voiceSensitivity, setVoiceSensitivity] = useState<'sensitive' | 'balanced' | 'strict'>('balanced');
  const [voicePlaybackActive, setVoicePlaybackActive] = useState(false);
  const [intentCommand, setIntentCommand] = useState('');
  const [intentBusy, setIntentBusy] = useState<'classify' | 'run' | 'capture' | null>(null);
  const [intentPreview, setIntentPreview] = useState<JarvisIntent | null>(null);
  const [intentExecution, setIntentExecution] = useState<JarvisIntentExecution | null>(null);
  const [visionAnalysis, setVisionAnalysis] = useState<VisionAnalysisResult | null>(null);
  const [visionSignals, setVisionSignals] = useState<VisionSignalsResult | null>(null);
  const [visionTextExtraction, setVisionTextExtraction] = useState<VisionTextExtractionResult | null>(null);
  const [visionSuggestedActions, setVisionSuggestedActions] = useState<VisionSuggestedActionsResult | null>(null);
  const [visionUiTargets, setVisionUiTargets] = useState<VisionUiTargetsResult | null>(null);
  const [visionUiPlan, setVisionUiPlan] = useState<VisionUiActionPlanResult | null>(null);
  const [visionUiVerify, setVisionUiVerify] = useState<VisionUiVerifyResult | null>(null);
  const [visionQuery, setVisionQuery] = useState<VisionQueryResult | null>(null);
  const [visionQuestion, setVisionQuestion] = useState('');
  const [visionBusy, setVisionBusy] = useState(false);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const [documentAnalysisMode, setDocumentAnalysisMode] = useState<'summary' | 'business_review' | 'finance_review' | 'investment_memo' | 'kpi_extract'>('summary');
  const [documentAnalysisTitle, setDocumentAnalysisTitle] = useState('');
  const [documentAnalysis, setDocumentAnalysis] = useState<DocumentAnalysisResult | null>(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [rankedLearningItems, setRankedLearningItems] = useState<
    Array<{
      id: string;
      label: string;
      domain: string;
      context_key: string;
      outcome_type: string;
      summary: string;
      lesson: string;
      reuse_hint: string;
      tags: string[];
      confidence?: number;
      use_count?: number;
      last_reused_at?: string;
      created_at: string;
    }>
  >([]);
  const [shopifySummary, setShopifySummary] = useState<ShopifySummary | null>(null);
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
  const speechHistoryPrimedRef = useRef(false);
  const lastAutomationAnnouncementRef = useRef('');
  const audioUrlRef = useRef<string | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const lastAutoValidationFailureRef = useRef('');
  const lastAutoValidationSuccessRef = useRef('');
  const lastAutoArchitectureVisualRef = useRef('');
  const lastAutoArchitectureDigestRef = useRef('');
  const lastAutoArchitectureSelfImproveRef = useRef('');
  const lastAutoArchitectureDesignRef = useRef('');
  const lastAutoArchitectureShopifyRef = useRef('');
  const lastAutoArchitectureCommercialRef = useRef('');
  const lastAutoArchitectureFivemRef = useRef('');
  const lastSelfImproveOutcomeRef = useRef('');
  const lastSelfImproveFollowupRef = useRef('');
  const lastSelfImprovePatchRef = useRef('');
  const lastDesignOutcomeRef = useRef('');
  const lastDesignTaskRef = useRef('');
  const lastFivemOutcomeRef = useRef('');
  const lastFivemTaskRef = useRef('');
  const lastCommercialOutcomeRef = useRef('');
  const lastMissionSyncRef = useRef('');
  const lastLearningRecordRef = useRef('');
  const lastSpeechDetectedAtRef = useRef(0);
  const lastVoicePlaybackAtRef = useRef(0);
  const fastRefreshInFlightRef = useRef(false);
  const slowRefreshInFlightRef = useRef(false);
  const desktopStateFailureCountRef = useRef(0);
  const desktopStateCooldownUntilRef = useRef(0);
  const agentEventRefreshTimerRef = useRef<number | null>(null);

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
  const canAutoSpeak = useMemo(() => {
    if (!speechProfile?.auto_speak || !voiceLoop?.active) return false;
    if (streamState.isStreaming || streamState.activeToolCalls.length > 0 || hudSpeechState === 'recording' || hudSpeechState === 'transcribing') return false;
    if (hudSpeechTelemetry.speechLikely) return false;
    if (hudSpeechTelemetry.noiseFloor >= 0.02) return false;
    return true;
  }, [hudSpeechState, hudSpeechTelemetry.noiseFloor, hudSpeechTelemetry.speechLikely, speechProfile?.auto_speak, streamState.activeToolCalls.length, streamState.isStreaming, voiceLoop?.active]);
  const runningAgentCount = useMemo(
    () => managedAgents.filter((agent) => agent.status === 'running').length,
    [managedAgents],
  );

  useEffect(() => {
    let cancelled = false;

    const refreshFastStatus = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (fastRefreshInFlightRef.current) return;
      fastRefreshInFlightRef.current = true;
      try {
        const [action, automation, coding, health, speech, loop, wb] = await Promise.allSettled([
          needsActionCenterPolling ? fetchActionCenterStatus() : Promise.resolve<ActionCenterStatus | null>(null),
          needsAutomationPolling ? fetchAutomationStatus() : Promise.resolve<AutomationStatus | null>(null),
          needsCodingFastPolling ? fetchCodingStatus() : Promise.resolve<CodingWorkspaceStatus | null>(null),
          checkHealth(),
          needsVoiceStatusPolling ? fetchSpeechHealth() : Promise.resolve(null),
          needsVoiceStatusPolling ? fetchVoiceLoopStatus() : Promise.resolve<VoiceLoopStatus | null>(null),
          needsWorkbenchFastPolling ? fetchWorkbenchStatus() : Promise.resolve<WorkbenchStatus | null>(null),
        ]);

        if (cancelled) return;

        if (action.status === 'fulfilled' && action.value) setActionCenter(action.value);
        if (automation.status === 'fulfilled' && automation.value) setAutomationStatus(automation.value);
        if (coding.status === 'fulfilled' && coding.value) setCodingWorkspace(coding.value);
        if (loop.status === 'fulfilled' && loop.value) setVoiceLoop(loop.value);
        if (wb.status === 'fulfilled' && wb.value) {
          const workbenchValue = wb.value;
          setWorkbench(workbenchValue);
          setWorkbenchDirectory((current) => current || workbenchValue.default_working_dir);
        }
        if (health.status === 'fulfilled') setApiReachable(health.value);
        if (health.status === 'rejected') setApiReachable(false);
        if (speech.status === 'fulfilled' && speech.value) setSpeechAvailable(speech.value.available);
      } finally {
        fastRefreshInFlightRef.current = false;
      }
    };

    const refreshSlowStatus = async (mode: 'light' | 'full' = 'full') => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (slowRefreshInFlightRef.current) return;
      slowRefreshInFlightRef.current = true;
      try {
        const includeExtended = mode === 'full';
        const desktopStateRequest =
          !includeExtended || !needsWorkspaceStatusPolling || desktopStateCooldownUntilRef.current > Date.now()
            ? Promise.resolve<DesktopState | null>(null)
            : fetchDesktopState()
                .then((value) => {
                  desktopStateFailureCountRef.current = 0;
                  desktopStateCooldownUntilRef.current = 0;
                  return value;
                })
                .catch((error) => {
                  desktopStateFailureCountRef.current += 1;
                  if (desktopStateFailureCountRef.current >= 3) {
                    desktopStateCooldownUntilRef.current = Date.now() + 2 * 60 * 1000;
                  }
                  throw error;
                });

        const [
          automationLogResult,
          digest,
          digestSched,
          operatorMemory,
          inbox,
          tasks,
          reminderItems,
          agents,
          connectors,
          profile,
          commander,
          workspace,
          repos,
          checks,
          desktop,
          architecture,
        ] = await Promise.allSettled([
          includeExtended && needsAutomationPolling ? fetchAutomationLogs() : Promise.resolve({ items: [] }),
          includeExtended && needsDigestBundle ? fetchDailyDigest() : Promise.resolve<DailyDigest | null>(null),
          includeExtended && needsDigestBundle ? fetchDigestSchedule() : Promise.resolve<DigestSchedule | null>(null),
          includeExtended && needsOperatorMemoryBundle ? fetchOperatorMemory() : Promise.resolve<DurableOperatorMemory | null>(null),
          includeExtended && needsInboxBundle ? fetchInboxSummary() : Promise.resolve<InboxSummaryItem[]>([]),
          includeExtended && needsInboxBundle ? fetchTaskSummary() : Promise.resolve<TaskSummaryItem[]>([]),
          includeExtended && needsInboxBundle ? fetchReminders() : Promise.resolve<ReminderItem[]>([]),
          includeExtended && needsAgentPresencePolling ? fetchManagedAgents({ compact: true }) : Promise.resolve([] as typeof managedAgents),
          includeExtended && needsConnectorSummary ? listConnectors() : Promise.resolve([]),
          includeExtended && needsVoiceStatusPolling ? fetchSpeechProfile() : Promise.resolve<SpeechProfile | null>(null),
          includeExtended && needsCommanderBundle ? fetchOperatorCommanderBrief() : Promise.resolve<OperatorCommanderBriefResponse | null>(null),
          includeExtended && needsWorkspaceStatusPolling ? fetchWorkspaceSummary() : Promise.resolve<WorkspaceSummary | null>(null),
          includeExtended && needsWorkspaceStatusPolling ? fetchWorkspaceRepos() : Promise.resolve<WorkspaceRepoCatalog | null>(null),
          includeExtended && needsWorkspaceStatusPolling ? fetchWorkspaceChecks() : Promise.resolve<WorkspaceChecks | null>(null),
          desktopStateRequest,
          includeExtended && needsArchitectureTaskPolling ? fetchAgentArchitectureStatus() : Promise.resolve<AgentArchitectureStatus | null>(null),
        ]);

        if (cancelled) return;

        if (automationLogResult.status === 'fulfilled') setAutomationLogs(automationLogResult.value.items || []);
        if (digest.status === 'fulfilled') setDailyDigest(digest.value);
        if (digestSched.status === 'fulfilled') setDigestSchedule(digestSched.value);
        if (operatorMemory.status === 'fulfilled') setDurableOperatorMemory(operatorMemory.value);
        if (commander.status === 'fulfilled' && commander.value) setCommanderBrief(commander.value);
        if (inbox.status === 'fulfilled') setInboxSummary(inbox.value);
        if (tasks.status === 'fulfilled') setTaskSummary(tasks.value);
        if (reminderItems.status === 'fulfilled') setReminders(reminderItems.value);
        if (workspace.status === 'fulfilled' && workspace.value) setWorkspaceSummary(workspace.value);
        if (repos.status === 'fulfilled' && repos.value) setWorkspaceRepos(repos.value);
        if (checks.status === 'fulfilled' && checks.value) setWorkspaceChecks(checks.value);
        if (desktop.status === 'fulfilled' && desktop.value) setDesktopState(desktop.value);
        if (architecture.status === 'fulfilled' && architecture.value) setAgentArchitecture(architecture.value);
        if (profile.status === 'fulfilled') setSpeechProfile(profile.value);
        if (agents.status === 'fulfilled' && includeExtended && needsAgentPresencePolling) setManagedAgents(agents.value);

        if (connectors.status === 'fulfilled' && includeExtended && needsConnectorSummary) {
          const connected = connectors.value.filter((connector) => connector.connected);
          const ids = new Set(connected.map((connector) => connector.connector_id));
          setConnectedConnectorIds(Array.from(ids));
          setConnectorSummary({
            totalConnected: connected.length,
            emailReady: ids.has('gmail') || ids.has('gmail_imap') || ids.has('outlook'),
            calendarReady: ids.has('gcalendar') || ids.has('outlook'),
            docsReady: ids.has('gdrive') || ids.has('notion') || ids.has('obsidian'),
            messagingReady: ids.has('slack') || ids.has('imessage') || ids.has('whatsapp'),
            emailProvider: ids.has('gmail') ? 'gmail' : ids.has('outlook') ? 'outlook' : ids.has('gmail_imap') ? 'gmail' : '',
            calendarProvider: ids.has('gcalendar') ? 'gcalendar' : ids.has('outlook') ? 'outlook' : '',
          });
        }
      } finally {
        slowRefreshInFlightRef.current = false;
      }
    };

    void refreshFastStatus();
    void refreshSlowStatus('light');
    const deferredSlowRefresh = window.setTimeout(() => {
      void refreshSlowStatus('full');
    }, isWorkspaceView ? 2200 : isOperationsView ? 2600 : 2400);
    const fastInterval = window.setInterval(() => {
      void refreshFastStatus();
    }, 8000);
    const slowInterval = window.setInterval(() => {
      void refreshSlowStatus('full');
    }, 30000);
    return () => {
      cancelled = true;
      window.clearTimeout(deferredSlowRefresh);
      window.clearInterval(fastInterval);
      window.clearInterval(slowInterval);
    };
  }, [
    needsCodingFastPolling,
    needsArchitectureTaskPolling,
    needsAutomationPolling,
    needsCommanderBundle,
    needsConnectorSummary,
    needsDigestBundle,
    needsInboxBundle,
    needsOperatorMemoryBundle,
    needsWorkbenchFastPolling,
    needsWorkspaceStatusPolling,
    isOperationsView,
    isWorkspaceView,
    setManagedAgents,
  ]);

  useEffect(() => {
    if (typeof document !== 'undefined' && document.hidden) return undefined;

    const scheduleRefresh = () => {
      if (agentEventRefreshTimerRef.current !== null) {
        window.clearTimeout(agentEventRefreshTimerRef.current);
      }
      agentEventRefreshTimerRef.current = window.setTimeout(() => {
        void Promise.allSettled([
          needsAgentPresencePolling ? fetchManagedAgents({ compact: true }).then(setManagedAgents) : Promise.resolve(),
          needsArchitectureTaskPolling
            ? fetchAgentArchitectureStatus().then((value) => {
                if (value) setAgentArchitecture(value);
              })
            : Promise.resolve(),
        ]).finally(() => {
          agentEventRefreshTimerRef.current = null;
        });
      }, 1200);
    };

    const unsubscribe = subscribeAgentEvents((event) => {
      if (!event?.type) return;
      scheduleRefresh();
    });

    const handleVisibility = () => {
      if (!document.hidden) scheduleRefresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibility);
      if (agentEventRefreshTimerRef.current !== null) {
        window.clearTimeout(agentEventRefreshTimerRef.current);
        agentEventRefreshTimerRef.current = null;
      }
    };
  }, [needsAgentPresencePolling, needsArchitectureTaskPolling, setManagedAgents]);

  useEffect(() => {
    let cancelled = false;
    if (!needsArchitectureTaskPolling || !needsAgentPresencePolling) {
      setAgentRoleTasks({});
      return;
    }
    const managedRoles = (agentArchitecture?.roles || []).filter((role) => role.kind === 'managed' && role.agent_id);
    if (!managedRoles.length) {
      setAgentRoleTasks({});
      return;
    }
    const loadRoleTasks = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const pairs = await Promise.all(
        managedRoles.map(async (role) => {
          try {
            const tasks = await fetchAgentTasks(role.agent_id as string);
            return [role.role, tasks.slice(0, 3)] as const;
          } catch {
            return [role.role, []] as const;
          }
        }),
      );
      if (cancelled) return;
      setAgentRoleTasks(Object.fromEntries(pairs));
    };
    const initialDelay = window.setTimeout(() => {
      void loadRoleTasks();
    }, 4200);
    const timer = window.setInterval(loadRoleTasks, 20000);
    return () => {
      cancelled = true;
      window.clearTimeout(initialDelay);
      window.clearInterval(timer);
    };
  }, [agentArchitecture, needsAgentPresencePolling, needsArchitectureTaskPolling]);

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
    if (hudSpeechState === 'recording' || hudSpeechState === 'transcribing' || hudSpeechTelemetry.speechLikely) {
      lastSpeechDetectedAtRef.current = Date.now();
    }
  }, [hudSpeechState, hudSpeechTelemetry.speechLikely]);

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
    window.localStorage.setItem(SELF_IMPROVE_RUNS_KEY, JSON.stringify(selfImproveRuns.slice(0, 20)));
  }, [selfImproveRuns]);

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
    if (!isDashboardView) return;
    if (dailyDigest || apiReachable === false) return;
    const timer = window.setTimeout(() => {
      hasAutoRequestedDigestRef.current = true;
      handleGenerateDigest().catch(() => {});
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [apiReachable, dailyDigest, digestBusy, isDashboardView]);

  useEffect(() => {
    if (!dailyDigest?.text || !canAutoSpeak) return;
    if (lastSpokenDigestRef.current === dailyDigest.generated_at) return;
    let cancelled = false;
    playHudSpeech(dailyDigest.text, 'digest')
      .then((played) => {
        if (cancelled) return;
        if (!played) return;
        lastSpokenDigestRef.current = dailyDigest.generated_at;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [canAutoSpeak, dailyDigest?.generated_at, dailyDigest?.text, playHudSpeech]);

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

    if (!canAutoSpeak) {
      return;
    }

    let cancelled = false;
    playHudSpeech(announcement, 'announcement')
      .then((played) => {
        if (cancelled) return;
        if (!played) return;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [automationLogs, canAutoSpeak, playHudSpeech]);

  useEffect(() => {
    if (hudSpeechState !== 'recording' && hudSpeechState !== 'transcribing' && !hudSpeechTelemetry.speechLikely) return;
    if (!audioElementRef.current) return;
    audioElementRef.current.pause();
  }, [hudSpeechState, hudSpeechTelemetry.speechLikely]);

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
  useEffect(() => {
    speechHistoryPrimedRef.current = false;
    lastSpokenMessageRef.current = '';
  }, [activeConversationId]);
  useEffect(() => {
    if (speechHistoryPrimedRef.current) return;
    if (streamState.isStreaming) return;
    if (messages.length === 0) return;
    lastSpokenMessageRef.current = latestAssistantMessage?.content?.trim() || '';
    speechHistoryPrimedRef.current = true;
  }, [latestAssistantMessage?.content, messages.length, streamState.isStreaming]);
  useEffect(() => {
    if (!latestUserMessage?.content?.trim()) return;
    lastSpeechDetectedAtRef.current = Date.now();
  }, [latestUserMessage?.content]);
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
  const actionCenterCapabilities = (actionCenter?.capabilities ?? null) as ActionCenterCapabilities | null;
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
    () => buildActiveAutomationAlerts(automationLogs, dismissedAutomationAlerts),
    [automationLogs, dismissedAutomationAlerts],
  );
  const filteredAutomationAlerts = useMemo(
    () => filterAutomationAlerts(activeAutomationAlerts, alertFilter),
    [activeAutomationAlerts, alertFilter],
  );
  const alertCounts = useMemo(
    () => countAutomationAlerts(activeAutomationAlerts),
    [activeAutomationAlerts],
  );
  const prioritizedContacts = useMemo(
    () =>
      buildPrioritizedContacts({
        profilePriorityContacts: operatorProfile.priorityContacts,
        durablePriorityContacts: durableOperatorMemory?.profile.priority_contacts,
        signalTopContacts: operatorSignals.topContacts,
        durableSignalTopContacts: durableOperatorMemory?.signals.top_contacts,
      }),
    [
      durableOperatorMemory?.profile.priority_contacts,
      durableOperatorMemory?.signals.top_contacts,
      operatorProfile.priorityContacts,
      operatorSignals.topContacts,
    ],
  );
  const sortedInboxSummary = useMemo(
    () => sortInboxByPriority(inboxSummary, prioritizedContacts),
    [inboxSummary, prioritizedContacts],
  );
  const inboxFocusQueue = useMemo(
    () => sortedInboxSummary.slice(0, Math.max(1, Math.min(5, operatorProfile.inboxFocusCount || 3))),
    [operatorProfile.inboxFocusCount, sortedInboxSummary],
  );
  const immediateReminder = useMemo(() => getImmediateReminder(reminders), [reminders]);
  const prepQueue = useMemo(
    () => buildPrepQueue(reminders, durableOperatorMemory?.meetings, normalizeMeetingKey),
    [durableOperatorMemory?.meetings, reminders],
  );
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
  const selfImproveTargetFile = useMemo(
    () =>
      latestCodeResult?.file_path ||
      nextCodingTask?.filePath ||
      nextReviewQueueItem?.filePath ||
      workspaceSummary?.changed_files?.[0] ||
      editorFilePath ||
      '',
    [editorFilePath, latestCodeResult?.file_path, nextCodingTask?.filePath, nextReviewQueueItem?.filePath, workspaceSummary?.changed_files],
  );
  const activeSelfImproveTask = useMemo(
    () =>
      codingTasks.find((task) => task.title.startsWith('Self-improve ') && task.status !== 'done') ||
      codingTasks.find((task) => task.title.startsWith('Self-improve ')) ||
      null,
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
    const isSelfImproveFailure =
      !!activeSelfImproveTask &&
      !!likelyFile &&
      activeSelfImproveTask.filePath === likelyFile;

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
      void rememberLearningExperience({
        label: likelyFile ? `Validation failure · ${likelyFile}` : 'Validation failure',
        domain: isSelfImproveFailure ? 'self-improve' : 'coding',
        context_key: likelyFile || '',
        outcome_type: 'mistake',
        summary: `Validation failed for ${latestValidationFailure.command}.`,
        lesson: latestValidationFailure.output || 'The latest validation run failed and needs root-cause isolation.',
        reuse_hint: 'Reduce the patch scope, inspect the failing boundary first, and rerun the same check before widening the fix.',
        tags: ['validation', 'failure', likelyFile ? 'file-scoped' : 'repo'],
      }).catch(() => null);
      if (isSelfImproveFailure) {
        recordSelfImproveRun(
          'blocker',
          'Validation failed for the self-improvement mission.',
          `${latestValidationFailure.command}\n${latestValidationFailure.output}`,
          'self-improve-validation',
        );
        ensureSelfImproveTask('in_progress');
        loadSelfImproveRepairStep(
          `Validation command failed: ${latestValidationFailure.command}\n${latestValidationFailure.output}`,
          'self-improve-validation',
        ).catch(() => null);
      } else {
        injectCommand(
          buildValidationFixPrompt(
            latestValidationFailure.command,
            latestValidationFailure.output,
            likelyFile || undefined,
          ),
        );
        setWorkbenchNotice('Validation failure detected. Fix prompt loaded into the command deck.');
      }
    }
  }, [
    activeSelfImproveTask,
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
    const isSelfImproveSuccess =
      !!activeSelfImproveTask &&
      !!likelyFile &&
      activeSelfImproveTask.filePath === likelyFile;
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

    if (isSelfImproveSuccess) {
      recordSelfImproveRun(
        'outcome',
        'Validation passed for the self-improvement mission.',
        latestValidationSuccess.command,
        'self-improve-validation',
      );
      ensureSelfImproveTask('done');
    }
    void rememberLearningExperience({
      label: likelyFile ? `Validation green · ${likelyFile}` : 'Validation green',
      domain: isSelfImproveSuccess ? 'self-improve' : 'coding',
      context_key: likelyFile || '',
      outcome_type: 'success',
      summary: `Validation passed for ${latestValidationSuccess.command}.`,
      lesson: 'The current patch shape held through the active validation command.',
      reuse_hint: 'Reuse this patch/check pattern when the same file or failure family appears again, then commit or continue with a narrowly scoped follow-up.',
      tags: ['validation', 'success', likelyFile ? 'file-scoped' : 'repo'],
    }).catch(() => null);

    if (!pendingAction && !pendingCodeEdit && !pendingWorkbench) {
      prepareCommitCommand(suggestedMessage, 'Validation passed. Commit command prepared and ready for approval.');
    } else {
      setWorkbenchNotice('Validation passed. Commit message drafted for the next approval step.');
    }
  }, [
    activeSelfImproveTask,
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
  const visualBrief = useMemo(
    () =>
      buildVisualIntelBrief({
        screenSnapshotLabel: screenSnapshot?.label,
        screenDeck,
        visionSignals,
        visionAnalysis,
        visionQuery,
        visionSuggestedActions,
        visionTextExtraction,
      }),
    [
      screenDeck,
      screenSnapshot?.label,
      visionAnalysis,
      visionQuery,
      visionSignals,
      visionSuggestedActions,
      visionTextExtraction,
    ],
  );
  const documentBrief = useMemo(
    () =>
      buildDocumentIntelBrief({
        documentAnalysis,
        documentAnalysisTitle,
      }),
    [documentAnalysis, documentAnalysisTitle],
  );
  const legacySalesBrief = useMemo(() => {
    if (!needsExtendedIntelBriefs) return null;
    const accounts = Object.values(durableOperatorMemory?.sales_accounts || {});
    const leads = Object.values(durableOperatorMemory?.sales_leads || {});
    const deals = Object.values(durableOperatorMemory?.sales_deals || {});
    if (!accounts.length && !leads.length && !deals.length) return null;

    const dealStages = deals.reduce<Record<string, number>>((map, item) => {
      const stage = item.stage.trim().toLowerCase() || 'unclassified';
      map[stage] = (map[stage] || 0) + 1;
      return map;
    }, {});
    const highRiskDeals = deals.filter((item) => item.risk_level.trim().toLowerCase().includes('high'));
    const highRiskAccounts = accounts.filter((item) => item.risk_level.trim().toLowerCase().includes('high'));
    const followUpPressure = [
      ...deals.filter((item) => !item.next_step.trim()),
      ...leads.filter((item) => !item.next_step.trim()),
    ];
    const latestSalesInbox = inboxSummary.find((item) => {
      const text = `${item.title} ${item.snippet} ${item.author}`.toLowerCase();
      return (
        deals.some((deal) => deal.title && text.includes(deal.title.toLowerCase())) ||
        leads.some((lead) => lead.name && text.includes(lead.name.toLowerCase())) ||
        accounts.some((account) => account.name && text.includes(account.name.toLowerCase()))
      );
    });
    const primaryDeal = highRiskDeals[0] || deals[0] || null;
    const primaryAccount = highRiskAccounts[0] || accounts[0] || null;
    const primaryLead = leads[0] || null;
    const followUpTarget = followUpPressure[0] || primaryDeal || primaryLead || primaryAccount || null;
    const latestInboxDetail = latestSalesInbox
      ? `Latest inbox signal\nSubject: ${latestSalesInbox.title}\nFrom: ${latestSalesInbox.author}\nSnippet: ${latestSalesInbox.snippet}`
      : 'Latest inbox signal\nNo matching sales email was found in the latest inbox summary.';
    const followUpTargetName = !followUpTarget
      ? 'No target selected'
      : 'title' in followUpTarget
      ? followUpTarget.title || followUpTarget.key
      : followUpTarget.name || followUpTarget.key;
    const followUpTargetCompany =
      !followUpTarget || !('company' in followUpTarget)
        ? 'account_key' in (followUpTarget || {}) && followUpTarget?.account_key
          ? followUpTarget.account_key
          : primaryAccount?.name || 'Unknown'
        : followUpTarget.company || primaryAccount?.name || 'Unknown';
    const followUpTargetStatus =
      !followUpTarget
        ? 'Unknown'
        : 'status' in followUpTarget
        ? followUpTarget.status || 'Unknown'
        : 'stage' in followUpTarget
        ? followUpTarget.stage || 'Unknown'
        : 'Unknown';
    const topStages = Object.entries(dealStages)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([stage, count]) => `${stage}: ${count}`)
      .join(' | ');
    const focusItems = [
      highRiskDeals[0]
        ? {
            label: 'Highest Risk Deal',
            detail: `${highRiskDeals[0].title || highRiskDeals[0].key} / ${highRiskDeals[0].stage || 'unknown stage'} / next: ${highRiskDeals[0].next_step || 'missing'} / risk: ${highRiskDeals[0].risk_level || 'high'}`,
          }
        : null,
      highRiskAccounts[0]
        ? {
            label: 'At-Risk Account',
            detail: `${highRiskAccounts[0].name || highRiskAccounts[0].key} / owner: ${highRiskAccounts[0].owner || 'unassigned'} / next: ${highRiskAccounts[0].next_step || 'missing'} / risk: ${highRiskAccounts[0].risk_level || 'high'}`,
          }
        : null,
      followUpPressure[0]
        ? {
            label: 'Follow-Up Gap',
            detail: `${'title' in followUpPressure[0] ? followUpPressure[0].title : followUpPressure[0].name || followUpPressure[0].key} has no clear next step. Load outreach or assign follow-up ownership.`,
          }
        : null,
      latestSalesInbox
        ? {
            label: 'Latest Commercial Signal',
            detail: `${latestSalesInbox.author} / ${latestSalesInbox.title} / ${latestSalesInbox.snippet}`,
          }
        : null,
    ].filter(Boolean) as Array<{ label: string; detail: string }>;

    const summaryParts = [
      `${deals.length} deal${deals.length === 1 ? '' : 's'} in view`,
      highRiskDeals.length || highRiskAccounts.length
        ? `${highRiskDeals.length + highRiskAccounts.length} risk signal${highRiskDeals.length + highRiskAccounts.length === 1 ? '' : 's'}`
        : 'no major risk signals',
      followUpPressure.length ? `${followUpPressure.length} follow-up gap${followUpPressure.length === 1 ? '' : 's'}` : 'follow-ups mostly defined',
    ];
    const sections = [
      `Accounts: ${accounts.length}`,
      `Leads: ${leads.length}`,
      `Deals: ${deals.length}`,
      `Top deal stages: ${topStages || 'None yet'}`,
      `High-risk deals: ${highRiskDeals.map((item) => item.title || item.key).join(', ') || 'None'}`,
      `High-risk accounts: ${highRiskAccounts.map((item) => item.name || item.key).join(', ') || 'None'}`,
      `Missing next steps: ${followUpPressure
        .map((item) => ('title' in item ? item.title || item.key : item.name || item.key))
        .join(', ') || 'None'}`,
      latestSalesInbox
        ? `Latest inbox signal: ${latestSalesInbox.author} / ${latestSalesInbox.title}\n${latestSalesInbox.snippet}`
        : 'Latest inbox signal: None matched to sales memory.',
    ];

    return {
      title: 'Sales Intel',
      summary: summaryParts.join(' · '),
      details: sections.join('\n\n'),
      counts: [
        { label: 'Accounts', value: String(accounts.length) },
        { label: 'Leads', value: String(leads.length) },
        { label: 'Deals', value: String(deals.length) },
        { label: 'Risk Signals', value: String(highRiskDeals.length + highRiskAccounts.length) },
      ],
      focusItems,
      prompt:
        `I have a sales pipeline briefing.\n${sections.join('\n\n')}\n\n` +
        'Turn this into the next best commercial actions, identify stalled or risky opportunities, and suggest the sharpest follow-up moves.',
      plannerPrompt:
        `Sales mission briefing.\n${sections.join('\n\n')}\n\n` +
        'Plan the next safe commercial execution pass: account focus, follow-ups, risks, and the best next actions without losing context.',
      accountBriefPrompt:
        `Act as a senior account strategist.\n${sections.join('\n\n')}\n\n` +
        `Primary account focus\nName: ${primaryAccount?.name || primaryDeal?.account_key || primaryLead?.company || 'No account selected'}\n` +
        `Owner: ${primaryAccount?.owner || primaryDeal?.owner || primaryLead?.owner || 'Unknown'}\n` +
        `Status: ${primaryAccount?.status || primaryDeal?.stage || primaryLead?.stage || 'Unknown'}\n` +
        `Next step: ${primaryAccount?.next_step || primaryDeal?.next_step || primaryLead?.next_step || 'Missing'}\n` +
        `Risk: ${primaryAccount?.risk_level || primaryDeal?.risk_level || primaryLead?.risk_level || 'Unknown'}\n\n` +
        'Write a sharp account brief with relationship state, risks, likely blockers, and the best next commercial move.',
      dealReviewPrompt:
        `Act as a deal review partner.\n${sections.join('\n\n')}\n\n` +
        `Deal to review\nTitle: ${primaryDeal?.title || 'No deal selected'}\n` +
        `Account: ${primaryDeal?.account_key || primaryAccount?.name || 'Unknown'}\n` +
        `Stage: ${primaryDeal?.stage || 'Unknown'}\n` +
        `Value: ${primaryDeal?.value || 'Unknown'}\n` +
        `Close target: ${primaryDeal?.close_target || 'Unknown'}\n` +
        `Next step: ${primaryDeal?.next_step || 'Missing'}\n` +
        `Risk: ${primaryDeal?.risk_level || 'Unknown'}\n\n` +
        'Review this deal for stall risk, missing information, likely objections, and the exact next action needed to move it forward safely.',
      followUpPrompt:
        `Act as a sales follow-up strategist.\n${sections.join('\n\n')}\n\n` +
        `Follow-up target\nName: ${followUpTargetName}\n` +
        `Company/Account: ${followUpTargetCompany}\n` +
        `Owner: ${followUpTarget?.owner || 'Unknown'}\n` +
        `Stage/Status: ${followUpTargetStatus}\n` +
        `Next step: ${followUpTarget?.next_step || 'Missing'}\n` +
        `Last interaction: ${followUpTarget?.last_interaction || 'Unknown'}\n\n` +
        `${latestInboxDetail}\n\n` +
        'Recommend the best follow-up timing, channel, and message strategy. Then draft a short high-quality follow-up outline.',
      objectionPrompt:
        `Act as a B2B sales coach focused on objections and deal friction.\n${sections.join('\n\n')}\n\n` +
        `Primary risk focus\nDeal: ${primaryDeal?.title || 'Unknown'}\n` +
        `Account: ${primaryDeal?.account_key || primaryAccount?.name || 'Unknown'}\n` +
        `Risk signal: ${primaryDeal?.risk_level || primaryAccount?.risk_level || 'Unknown'}\n` +
        `Current next step: ${primaryDeal?.next_step || primaryAccount?.next_step || 'Missing'}\n\n` +
        `${latestInboxDetail}\n\n` +
        'Infer the most likely objections, trust gaps, or internal blockers. Recommend how to respond without sounding defensive or generic.',
      meetingPrepPrompt:
        `Act as a sales meeting prep assistant.\n${sections.join('\n\n')}\n\n` +
        `Meeting focus\nAccount: ${primaryAccount?.name || primaryDeal?.account_key || primaryLead?.company || 'Unknown'}\n` +
        `Deal: ${primaryDeal?.title || 'No active deal selected'}\n` +
        `Stage: ${primaryDeal?.stage || primaryLead?.stage || primaryAccount?.status || 'Unknown'}\n` +
        `Key next step: ${primaryDeal?.next_step || primaryLead?.next_step || primaryAccount?.next_step || 'Missing'}\n` +
        `Risk: ${primaryDeal?.risk_level || primaryAccount?.risk_level || primaryLead?.risk_level || 'Unknown'}\n\n` +
        `${latestInboxDetail}\n\n` +
        'Prepare a concise meeting brief with goals, likely objections, discovery questions, proof points, and the decision or commitment we should leave with.',
      draftRecipient: latestSalesInbox?.author_email || '',
      draftSubject: primaryDeal?.title
        ? `Follow-up on ${primaryDeal.title}`
        : primaryAccount?.name
        ? `Follow-up for ${primaryAccount.name}`
        : primaryLead?.name
        ? `Following up, ${primaryLead.name}`
        : 'Sales follow-up',
      draftBody:
        `Hi,\n\n` +
        `I wanted to follow up regarding ${primaryDeal?.title || primaryAccount?.name || primaryLead?.company || 'our recent discussion'}.\n\n` +
        `Current context:\n` +
        `- Stage/status: ${primaryDeal?.stage || primaryLead?.stage || primaryAccount?.status || 'Unknown'}\n` +
        `- Next step: ${primaryDeal?.next_step || primaryLead?.next_step || primaryAccount?.next_step || 'To be confirmed'}\n` +
        `- Risk focus: ${primaryDeal?.risk_level || primaryAccount?.risk_level || primaryLead?.risk_level || 'None noted'}\n\n` +
        `I would like to keep momentum and align on the best next step. Please let me know what is most useful from our side, or if there is anything blocking progress.\n\n` +
        `Best,\nJARVIS`,
      primaryAccountLabel: primaryAccount
        ? `${primaryAccount.name || primaryAccount.key} / owner: ${primaryAccount.owner || 'unassigned'} / next: ${primaryAccount.next_step || 'missing'}`
        : 'No primary account selected yet.',
      primaryDealLabel: primaryDeal
        ? `${primaryDeal.title || primaryDeal.key} / stage: ${primaryDeal.stage || 'unknown'} / next: ${primaryDeal.next_step || 'missing'}`
        : 'No primary deal selected yet.',
    };
  }, [durableOperatorMemory?.sales_accounts, durableOperatorMemory?.sales_deals, durableOperatorMemory?.sales_leads, inboxSummary, needsExtendedIntelBriefs]);
  const salesBrief = useMemo(
    () =>
      buildSalesBrief({
        enabled: needsExtendedIntelBriefs,
        accounts: Object.values(durableOperatorMemory?.sales_accounts || {}),
        leads: Object.values(durableOperatorMemory?.sales_leads || {}),
        deals: Object.values(durableOperatorMemory?.sales_deals || {}),
        inboxSummary,
      }),
    [
      durableOperatorMemory?.sales_accounts,
      durableOperatorMemory?.sales_deals,
      durableOperatorMemory?.sales_leads,
      inboxSummary,
      needsExtendedIntelBriefs,
    ],
  );

  const legacyCustomerBrief = useMemo(() => {
    if (!needsExtendedIntelBriefs) return null;
    const accounts = Object.values(durableOperatorMemory?.customer_accounts || {});
    const interactions = Object.values(durableOperatorMemory?.customer_interactions || {});
    if (!accounts.length && !interactions.length) return null;

    const churnAccounts = accounts.filter((item) => item.churn_risk.trim().toLowerCase().includes('high'));
    const unhappyAccounts = accounts.filter((item) => item.sentiment.trim().toLowerCase().includes('negative'));
    const urgentInteractions = interactions.filter((item) => item.urgency.trim().toLowerCase().includes('high'));
    const openFollowUps = interactions.filter(
      (item) => item.promised_follow_up.trim() && item.status.trim().toLowerCase() !== 'closed',
    );
    const latestCustomerInbox = inboxSummary.find((item) => {
      const text = `${item.title} ${item.snippet} ${item.author}`.toLowerCase();
      return (
        accounts.some((account) => account.name && text.includes(account.name.toLowerCase())) ||
        interactions.some((interaction) => interaction.contact && text.includes(interaction.contact.toLowerCase()))
      );
    });
    const primaryAccount = churnAccounts[0] || unhappyAccounts[0] || accounts[0] || null;
    const primaryInteraction = urgentInteractions[0] || openFollowUps[0] || interactions[0] || null;
    const focusItems = [
      primaryAccount
        ? {
            label: 'Customer Health Risk',
            detail: `${primaryAccount.name || primaryAccount.key} / health: ${primaryAccount.health || 'unknown'} / sentiment: ${primaryAccount.sentiment || 'unknown'} / churn risk: ${primaryAccount.churn_risk || 'unknown'} / next: ${primaryAccount.next_step || 'missing'}`,
          }
        : null,
      primaryInteraction
        ? {
            label: 'Interaction To Resolve',
            detail: `${primaryInteraction.contact || primaryInteraction.key} / ${primaryInteraction.channel || 'unknown channel'} / ${primaryInteraction.topic || 'no topic'} / urgency: ${primaryInteraction.urgency || 'unknown'} / follow-up: ${primaryInteraction.promised_follow_up || 'missing'}`,
          }
        : null,
      latestCustomerInbox
        ? {
            label: 'Latest Customer Signal',
            detail: `${latestCustomerInbox.author} / ${latestCustomerInbox.title} / ${latestCustomerInbox.snippet}`,
          }
        : null,
      openFollowUps[0]
        ? {
            label: 'Promised Follow-Up',
            detail: `${openFollowUps[0].contact || openFollowUps[0].key} is still waiting on: ${openFollowUps[0].promised_follow_up}`,
          }
        : null,
    ].filter(Boolean) as Array<{ label: string; detail: string }>;

    const summaryParts = [
      `${accounts.length} customer account${accounts.length === 1 ? '' : 's'} tracked`,
      churnAccounts.length
        ? `${churnAccounts.length} churn risk${churnAccounts.length === 1 ? '' : 's'}`
        : 'no major churn risks',
      urgentInteractions.length
        ? `${urgentInteractions.length} urgent interaction${urgentInteractions.length === 1 ? '' : 's'}`
        : 'no urgent interactions',
    ];
    const sections = [
      `Customer accounts: ${accounts.length}`,
      `Customer interactions: ${interactions.length}`,
      `High churn risk: ${churnAccounts.map((item) => item.name || item.key).join(', ') || 'None'}`,
      `Negative sentiment: ${unhappyAccounts.map((item) => item.name || item.key).join(', ') || 'None'}`,
      `Urgent interactions: ${urgentInteractions.map((item) => item.contact || item.key).join(', ') || 'None'}`,
      `Open promised follow-ups: ${openFollowUps.map((item) => item.contact || item.key).join(', ') || 'None'}`,
      latestCustomerInbox
        ? `Latest inbox signal: ${latestCustomerInbox.author} / ${latestCustomerInbox.title}\n${latestCustomerInbox.snippet}`
        : 'Latest inbox signal: None matched to customer memory.',
    ];

    return {
      title: 'Customer Intel',
      summary: summaryParts.join(' · '),
      details: sections.join('\n\n'),
      counts: [
        { label: 'Accounts', value: String(accounts.length) },
        { label: 'Interactions', value: String(interactions.length) },
        { label: 'Churn Risk', value: String(churnAccounts.length) },
        { label: 'Urgent', value: String(urgentInteractions.length) },
      ],
      focusItems,
      prompt:
        `I have a customer health briefing.\n${sections.join('\n\n')}\n\n` +
        'Turn this into the next best customer success and support actions, identify churn risk, and recommend the safest follow-up moves.',
      plannerPrompt:
        `Customer mission briefing.\n${sections.join('\n\n')}\n\n` +
        'Plan the next safe customer-success execution pass: who needs attention, what should be escalated, and which follow-ups matter most.',
      draftRecipient: latestCustomerInbox?.author_email || '',
      draftSubject:
        latestCustomerInbox?.title && latestCustomerInbox.title.toLowerCase().startsWith('re:')
          ? latestCustomerInbox.title
          : latestCustomerInbox?.title
          ? `Re: ${latestCustomerInbox.title}`
          : primaryAccount?.name
          ? `Checking in on ${primaryAccount.name}`
          : 'Customer follow-up',
      draftBody:
        `Hi ${((latestCustomerInbox?.author || primaryInteraction?.contact || primaryAccount?.name || 'there').split('<')[0] || 'there').trim()},\n\n` +
        `I wanted to follow up on ${primaryInteraction?.topic || latestCustomerInbox?.title || primaryAccount?.name || 'your recent request'}.\n\n` +
        `Current context:\n` +
        `- Health: ${primaryAccount?.health || 'Unknown'}\n` +
        `- Sentiment: ${primaryAccount?.sentiment || primaryInteraction?.sentiment || 'Unknown'}\n` +
        `- Urgency: ${primaryInteraction?.urgency || 'Unknown'}\n` +
        `- Promised follow-up: ${primaryInteraction?.promised_follow_up || primaryAccount?.next_step || 'We are reviewing the next step'}\n\n` +
        `Thanks for your patience. We are reviewing this carefully and I want to make sure we give you the clearest next step possible.\n\n` +
        `Best,\nJARVIS`,
    };
  }, [durableOperatorMemory?.customer_accounts, durableOperatorMemory?.customer_interactions, inboxSummary, needsExtendedIntelBriefs]);
  const customerBrief = useMemo(
    () =>
      buildCustomerBrief({
        enabled: needsExtendedIntelBriefs,
        accounts: Object.values(durableOperatorMemory?.customer_accounts || {}),
        interactions: Object.values(durableOperatorMemory?.customer_interactions || {}),
        inboxSummary,
      }),
    [
      durableOperatorMemory?.customer_accounts,
      durableOperatorMemory?.customer_interactions,
      inboxSummary,
      needsExtendedIntelBriefs,
    ],
  );

  const legacyShopifyBrief = useMemo(() => {
    if (!needsExtendedIntelBriefs) return null;
    if (!shopifySummary) return null;
    const topCustomer = shopifySummary.top_customers[0] || null;
    const topProduct = shopifySummary.top_products[0] || null;
    const lowStock = shopifySummary.low_stock_products || [];
    const fulfillmentPressure = shopifySummary.open_orders > 0;
    const refundPressure = shopifySummary.refunded_orders > 0 || shopifySummary.canceled_orders > 0;
    const retentionSignal = shopifySummary.repeat_customers > 0;
    const focusItems = [
      fulfillmentPressure
        ? {
            label: 'Fulfillment Pressure',
            detail: `${shopifySummary.open_orders} open order${shopifySummary.open_orders === 1 ? '' : 's'} still need attention in ${shopifySummary.store}. Review shipping, support, or fulfillment blockers first.`,
          }
        : null,
      lowStock.length
        ? {
            label: 'Stock Risk',
            detail: `Low-stock watch is active for ${lowStock.length} product${lowStock.length === 1 ? '' : 's'}, led by ${lowStock.slice(0, 3).map((item) => `${item.title} (${item.inventory})`).join(', ')}.`,
          }
        : null,
      refundPressure
        ? {
            label: 'Refund / Cancel Risk',
            detail: `${shopifySummary.refunded_orders} refunded and ${shopifySummary.canceled_orders} canceled order${shopifySummary.refunded_orders + shopifySummary.canceled_orders === 1 ? '' : 's'} were detected in the recent store window. Review product quality, fulfillment friction, or customer-expectation gaps.`,
          }
        : null,
      retentionSignal
        ? {
            label: 'Retention Opportunity',
            detail: `${shopifySummary.repeat_customers} repeat customer${shopifySummary.repeat_customers === 1 ? '' : 's'} were detected. ${topCustomer ? `${topCustomer.name} is the current strongest customer signal.` : 'Use repeat purchase behavior to guide the next retention move.'}`,
          }
        : null,
      topProduct
        ? {
            label: 'Product Momentum',
            detail: `${topProduct.title} is the strongest current product signal with status ${topProduct.status} and ${topProduct.variant_count} variant${topProduct.variant_count === 1 ? '' : 's'}.`,
          }
        : null,
    ].filter((item): item is { label: string; detail: string } => Boolean(item));
    const details =
      `Store: ${shopifySummary.store}\n` +
      `Orders: ${shopifySummary.orders}\n` +
      `Open orders: ${shopifySummary.open_orders}\n` +
      `Refunded orders: ${shopifySummary.refunded_orders}\n` +
      `Canceled orders: ${shopifySummary.canceled_orders}\n` +
      `Customers: ${shopifySummary.customers}\n` +
      `Products: ${shopifySummary.products}\n` +
      `Active products: ${shopifySummary.active_products}\n` +
      `Estimated revenue: ${shopifySummary.estimated_revenue}\n` +
      `Repeat customers: ${shopifySummary.repeat_customers}\n` +
      `Low stock products: ${lowStock.length}\n` +
      `Top customers: ${shopifySummary.top_customers.map((item) => `${item.name} (${item.total_spent})`).join(', ') || 'None'}\n` +
      `Top products: ${shopifySummary.top_products.map((item) => `${item.title} (${item.status})`).join(', ') || 'None'}`;
    return {
      title: `Shopify Intel · ${shopifySummary.store}`,
      summary:
        `${shopifySummary.orders} recent orders · ${shopifySummary.open_orders} open · ${lowStock.length} low-stock watch · revenue ${shopifySummary.estimated_revenue}`,
      details,
      prompt:
        `I have a Shopify store summary.\n` +
        `${details}\n\n` +
        `Turn this into the next best ecommerce operating actions, risks, and opportunities.`,
      plannerPrompt:
        `Shopify operations brief.\n${details}\n\nFocus on the next best ecommerce operating actions across fulfillment pressure, low-stock risk, retention opportunity, and product momentum. Return a prioritized store-ops plan with the safest first move.`,
      counts: [
        { label: 'Open Orders', value: String(shopifySummary.open_orders) },
        { label: 'Refunded Orders', value: String(shopifySummary.refunded_orders) },
        { label: 'Canceled Orders', value: String(shopifySummary.canceled_orders) },
        { label: 'Low Stock', value: String(lowStock.length) },
        { label: 'Repeat Customers', value: String(shopifySummary.repeat_customers) },
      ],
      focusItems,
    } satisfies ShopifyIntelBrief;
  }, [needsExtendedIntelBriefs, shopifySummary]);
  const shopifyBrief = useMemo(
    () =>
      buildShopifyBrief({
        enabled: needsExtendedIntelBriefs,
        shopifySummary,
      }),
    [needsExtendedIntelBriefs, shopifySummary],
  );

  const legacyCommercialBrief = useMemo(() => {
    if (!needsExtendedIntelBriefs) return null;
    if (!salesBrief && !customerBrief && !shopifyBrief) return null;
    const salesAccounts = Object.values(durableOperatorMemory?.sales_accounts || {});
    const salesDeals = Object.values(durableOperatorMemory?.sales_deals || {});
    const customerAccounts = Object.values(durableOperatorMemory?.customer_accounts || {});
    const customerInteractions = Object.values(durableOperatorMemory?.customer_interactions || {});
    const salesRisk = Number(salesBrief?.counts.find((item) => item.label === 'Risk Signals')?.value || 0);
    const customerRisk = Number(customerBrief?.counts.find((item) => item.label === 'Churn Risk')?.value || 0);
    const customerUrgent = Number(customerBrief?.counts.find((item) => item.label === 'Urgent')?.value || 0);
    const storeOpenOrders = Number(shopifySummary?.open_orders || 0);
    const refundedOrders = Number(shopifySummary?.refunded_orders || 0);
    const canceledOrders = Number(shopifySummary?.canceled_orders || 0);
    const lowStock = Number(shopifySummary?.low_stock_products?.length || 0);
    const repeatCustomers = Number(shopifySummary?.repeat_customers || 0);
    const parseCommercialDate = (value: string) => {
      const parsed = Date.parse(value || '');
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    const commercialTimeline = [
      ...salesDeals
        .filter((item) => item.last_interaction.trim())
        .map((item) => ({
          label: `Deal · ${item.title || item.key}`,
          detail: `${item.account_key || 'Unknown account'} / ${item.stage || 'unknown stage'} / next: ${item.next_step || 'missing'} / risk: ${item.risk_level || 'unknown'}`,
          when: item.last_interaction,
          ts: parseCommercialDate(item.last_interaction),
        })),
      ...salesAccounts
        .filter((item) => item.last_interaction.trim())
        .map((item) => ({
          label: `Account · ${item.name || item.key}`,
          detail: `${item.status || 'unknown status'} / owner: ${item.owner || 'unassigned'} / next: ${item.next_step || 'missing'} / risk: ${item.risk_level || 'unknown'}`,
          when: item.last_interaction,
          ts: parseCommercialDate(item.last_interaction),
        })),
      ...customerAccounts
        .filter((item) => item.last_interaction.trim())
        .map((item) => ({
          label: `Customer · ${item.name || item.key}`,
          detail: `${item.health || 'unknown health'} / sentiment: ${item.sentiment || 'unknown'} / churn: ${item.churn_risk || 'unknown'} / next: ${item.next_step || 'missing'}`,
          when: item.last_interaction,
          ts: parseCommercialDate(item.last_interaction),
        })),
      ...customerInteractions
        .filter((item) => item.last_interaction.trim())
        .map((item) => ({
          label: `Interaction · ${item.contact || item.key}`,
          detail: `${item.topic || 'no topic'} / ${item.channel || 'unknown channel'} / urgency: ${item.urgency || 'unknown'} / follow-up: ${item.promised_follow_up || 'missing'}`,
          when: item.last_interaction,
          ts: parseCommercialDate(item.last_interaction),
        })),
      ...(shopifySummary
        ? [
            {
              label: `Store Snapshot · ${shopifySummary.store}`,
              detail: `${shopifySummary.open_orders} open orders / ${shopifySummary.refunded_orders} refunded / ${shopifySummary.canceled_orders} canceled / ${shopifySummary.low_stock_products.length} low stock`,
              when: new Date().toISOString(),
              ts: Date.now(),
            },
          ]
        : []),
    ]
      .sort((left, right) => right.ts - left.ts)
      .slice(0, 6)
      .map(({ label, detail, when }) => ({ label, detail, when }));
    const focusItems = [
      salesRisk > 0
        ? {
            label: 'Pipeline Risk',
            detail: salesBrief?.focusItems[0]?.detail || `${salesRisk} sales risk signal${salesRisk === 1 ? '' : 's'} need review before the next outreach pass.`,
          }
        : null,
      customerRisk > 0 || customerUrgent > 0
        ? {
            label: 'Customer Attention',
            detail:
              customerBrief?.focusItems[0]?.detail ||
              `${customerRisk} churn-risk account${customerRisk === 1 ? '' : 's'} and ${customerUrgent} urgent customer interaction${customerUrgent === 1 ? '' : 's'} are active.`,
          }
        : null,
      storeOpenOrders > 0 || lowStock > 0
        ? {
            label: 'Store Pressure',
            detail:
              shopifyBrief?.focusItems[0]?.detail ||
              `${storeOpenOrders} open order${storeOpenOrders === 1 ? '' : 's'} and ${lowStock} low-stock product${lowStock === 1 ? '' : 's'} need the next ecommerce pass.`,
          }
        : null,
      refundedOrders > 0 || canceledOrders > 0
        ? {
            label: 'Store Friction',
            detail: `${refundedOrders} refunded and ${canceledOrders} canceled order${refundedOrders + canceledOrders === 1 ? '' : 's'} suggest a product, expectation, or fulfillment issue that may affect growth.`,
          }
        : null,
      repeatCustomers > 0
        ? {
            label: 'Retention Opportunity',
            detail: `${repeatCustomers} repeat customer${repeatCustomers === 1 ? '' : 's'} suggest a good moment for retention or upsell follow-up.`,
          }
        : null,
    ].filter((item): item is { label: string; detail: string } => Boolean(item));
    const details = [
      salesBrief ? `Sales: ${salesBrief.summary}` : '',
      customerBrief ? `Customer: ${customerBrief.summary}` : '',
      shopifyBrief ? `Shopify: ${shopifyBrief.summary}` : '',
      focusItems.length ? `Commercial focus:\n- ${focusItems.map((item) => item.detail).join('\n- ')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    return {
      title: 'Commercial Ops Brief',
      summary:
        `${salesRisk} pipeline risk · ${customerRisk + customerUrgent} customer pressure · ` +
        `${storeOpenOrders + lowStock + refundedOrders + canceledOrders} store ops signal${storeOpenOrders + lowStock + refundedOrders + canceledOrders === 1 ? '' : 's'}`,
      details,
      prompt:
        `I need a commercial operating brief across sales, customer, and Shopify.\n\n${details}\n\n` +
        `Give me the next best business actions, the biggest current risks, and the safest first move.`,
      plannerPrompt:
        `Commercial operations planner brief.\n\n${details}\n\n` +
        `Prioritize the next coordinated actions across sales, customer success, and ecommerce operations. Return the safest first move and the next two follow-ups.`,
      counts: [
        { label: 'Pipeline Risk', value: String(salesRisk) },
        { label: 'Customer Pressure', value: String(customerRisk + customerUrgent) },
        { label: 'Open Orders', value: String(storeOpenOrders) },
        { label: 'Low Stock', value: String(lowStock) },
        { label: 'Refunded Orders', value: String(refundedOrders) },
        { label: 'Canceled Orders', value: String(canceledOrders) },
      ],
      focusItems,
      timeline: commercialTimeline,
    } satisfies CommercialOpsBrief;
  }, [customerBrief, durableOperatorMemory?.customer_accounts, durableOperatorMemory?.customer_interactions, durableOperatorMemory?.sales_accounts, durableOperatorMemory?.sales_deals, needsExtendedIntelBriefs, salesBrief, shopifyBrief, shopifySummary]);
  const commercialBrief = useMemo(
    () =>
      buildCommercialBrief({
        enabled: needsExtendedIntelBriefs,
        salesBrief,
        customerBrief,
        shopifyBrief,
        salesAccounts: Object.values(durableOperatorMemory?.sales_accounts || {}),
        salesDeals: Object.values(durableOperatorMemory?.sales_deals || {}),
        customerAccounts: Object.values(durableOperatorMemory?.customer_accounts || {}),
        customerInteractions: Object.values(durableOperatorMemory?.customer_interactions || {}),
        shopifySummary,
      }),
    [
      customerBrief,
      durableOperatorMemory?.customer_accounts,
      durableOperatorMemory?.customer_interactions,
      durableOperatorMemory?.sales_accounts,
      durableOperatorMemory?.sales_deals,
      needsExtendedIntelBriefs,
      salesBrief,
      shopifyBrief,
      shopifySummary,
    ],
  );

  const legacyFivemCodingBrief = useMemo(() => {
    if (!needsExtendedIntelBriefs) return null;
    const changedFiles = workspaceSummary?.changed_files || [];
    const projectMemories = Object.values(durableOperatorMemory?.projects || {});
    const likelyProjectMemory = projectMemories[0] || null;
    const projectText = [
      likelyProjectMemory?.focus || '',
      likelyProjectMemory?.status || '',
      likelyProjectMemory?.next_step || '',
      likelyProjectMemory?.notes || '',
      workspaceSummary?.root || '',
      editorFilePath || '',
      ...changedFiles,
    ]
      .join('\n')
      .toLowerCase();
    const hasLua = changedFiles.some((file) => file.toLowerCase().endsWith('.lua')) || editorFilePath.toLowerCase().endsWith('.lua');
    const hasManifest =
      projectText.includes('fxmanifest.lua') ||
      projectText.includes('__resource.lua') ||
      changedFiles.some((file) => /fxmanifest\.lua|__resource\.lua/i.test(file));
    const hasClientScripts = /client\.lua|client\/|client_script|client_scripts|registercommand|setnuifocus|sendnuimessage/.test(projectText);
    const hasServerScripts = /server\.lua|server\/|server_script|server_scripts|registernetevent|triggerserverevent|triggerclientevent/.test(projectText);
    const hasSharedScripts = /shared\.lua|shared\/|shared_script|shared_scripts|config\.lua/.test(projectText);
    const hasNui = /nui|sendnuimessage|setnuifocus|ui_page/.test(projectText);
    const hasStateSignals = /statebag|localplayer\.state|player\(.*\)\.state|globalstate|entity\(.+\)\.state/.test(projectText);
    const hasServerCfgSignals =
      /server\.cfg|ensure\s+\w+|start\s+\w+|set\s+sv_|endpoint_add_tcp|endpoint_add_udp|onesync|mysql_connection_string/.test(projectText);
    const hasDependencySignals = /dependency|dependencies|shared_script|server_script|client_script|provide\s+/.test(projectText);
    const hasFivemSignals =
      hasManifest ||
      /fivem|citizenfx|citizen\.|registernetevent|triggerclientevent|triggerserverevent|setnuifocus|sendnuimessage|playerpedid|getentitycoords|qb-core|qbcore|esx|ox_lib|ox_target|statebag/.test(
        projectText,
      );
    const nativeFamilies = [
      /playerpedid|getplayer|networkisplayeractive|playerid|getplayerserverid/.test(projectText) ? 'player' : null,
      /getentitycoords|doesentityexist|setentitycoords|freezeentityposition|deleteentity|networkgetnetworkidfromentity/.test(projectText)
        ? 'entity'
        : null,
      /getvehiclepedisin|createvehicle|setvehicle|taskvehicle|isvehicle/.test(projectText) ? 'vehicle' : null,
      /getped|setped|isped|taskstartscenario|clearpedtasks/.test(projectText) ? 'ped' : null,
      /registernetevent|trigger(server|client)event|triggerlatentevent|addstatebagchangehandler/.test(projectText) ? 'network' : null,
      /sendnuimessage|setnuifocus|registernuicallback|ui_page/.test(projectText) ? 'ui' : null,
      hasStateSignals ? 'state' : null,
    ].filter((item): item is string => Boolean(item));
    const detectedFramework = /qb-core|qbcore/.test(projectText)
      ? 'QBCore'
      : /\besx\b/.test(projectText)
      ? 'ESX'
      : /ox_lib|ox_target|ox_inventory|oxmysql/.test(projectText)
      ? 'ox_*'
      : hasFivemSignals
      ? 'Custom / native FiveM'
      : 'Lua';
    const frameworkCanon = getFivemFrameworkCanon(detectedFramework);
    const resourceKey = `${workspaceSummary?.root || 'unknown-root'}::${editorFilePath || changedFiles[0] || 'resource'}`;
    const topology = [
      hasClientScripts ? 'client' : null,
      hasServerScripts ? 'server' : null,
      hasSharedScripts ? 'shared' : null,
      hasNui ? 'nui' : null,
    ].filter(Boolean).join(' / ') || 'single-surface';
    if (!hasLua && !hasFivemSignals) return null;
    const serverStructure =
      [
        hasServerScripts ? 'server scripts present' : null,
        hasClientScripts ? 'client scripts present' : null,
        hasSharedScripts ? 'shared/config surface present' : null,
        hasNui ? 'NUI surface present' : null,
        hasServerCfgSignals ? 'server.cfg/runtime config signals present' : null,
        hasDependencySignals ? 'manifest/dependency wiring present' : null,
      ].filter(Boolean).join(' | ') || 'single-surface resource with limited runtime signals';
    const riskTags = [
      nativeFamilies.includes('network') ? 'network-trust' : null,
      nativeFamilies.includes('state') ? 'state-desync' : null,
      hasClientScripts && hasServerScripts ? 'cross-boundary' : null,
      hasNui ? 'nui-coupling' : null,
      detectedFramework === 'QBCore' || detectedFramework === 'ESX' || detectedFramework === 'ox_*' ? 'framework-coupling' : null,
      frameworkCanon.watchouts[0] || null,
    ].filter((item): item is string => Boolean(item));
    const focusItems = [
      hasManifest
        ? {
            label: 'Resource Manifest',
            detail: 'The workspace looks like a FiveM resource. Review fxmanifest or __resource wiring, dependency declarations, and client/server script boundaries first.',
          }
        : null,
      hasLua
        ? {
            label: 'Lua Surface',
            detail: `${[editorFilePath, ...changedFiles].filter((file) => /\.lua$/i.test(file)).slice(0, 4).join(', ') || 'Lua files detected'} should be reviewed for state flow, event safety, nil handling, and return-value discipline.`,
          }
        : null,
      /registernetevent|triggerclientevent|triggerserverevent|statebag|playerpedid|getentitycoords/.test(projectText)
        ? {
            label: 'Native / Event Usage',
            detail: 'Network events or FiveM natives are in play. Check authority boundaries, parameter validation, entity ownership, and client/server trust assumptions.',
          }
        : null,
      nativeFamilies.length
        ? {
            label: 'Native Families',
            detail: `Detected native surfaces: ${nativeFamilies.join(', ')}. Review each family for authority, null-safety, and whether the script is calling the right side of the engine.`,
          }
        : null,
      hasStateSignals
        ? {
            label: 'State Flow',
            detail: 'State bags or shared state patterns are present. Audit replication assumptions, stale reads, and whether writes are happening on the authoritative side.',
          }
        : null,
      /qb-core|qbcore|esx|ox_lib|ox_target/.test(projectText)
        ? {
            label: 'Framework Coupling',
            detail: `Framework detected: ${detectedFramework}. Audit exports, callback usage, player/state APIs, and dependency assumptions before refactoring.`,
          }
        : null,
      hasClientScripts || hasServerScripts || hasSharedScripts || hasNui
        ? {
            label: 'Resource Topology',
            detail: `Detected topology: ${topology}. Review event flow, ownership boundaries, and whether logic is living on the safest side of the resource.`,
          }
        : null,
      hasServerCfgSignals || hasDependencySignals
        ? {
            label: 'Server Structure',
            detail: `Detected structure: ${serverStructure}. Review resource start order, dependency assumptions, framework boot order, and whether runtime config matches how the scripts initialize.`,
          }
        : null,
    ].filter((item): item is { label: string; detail: string } => Boolean(item));
    const details = [
      `Repo root: ${workspaceSummary?.root || 'Unknown'}`,
      `Current file: ${editorFilePath || 'None loaded'}`,
      `Changed files: ${changedFiles.slice(0, 8).join(', ') || 'None'}`,
      `Project focus: ${likelyProjectMemory?.focus || 'Unknown'}`,
      `Project status: ${likelyProjectMemory?.status || 'Unknown'}`,
      `Project next step: ${likelyProjectMemory?.next_step || 'Unknown'}`,
      `Framework: ${detectedFramework}`,
      `Topology: ${topology}`,
      `Server structure: ${serverStructure}`,
      `Native families: ${nativeFamilies.join(', ') || 'Unknown'}`,
      `Canon priorities: ${frameworkCanon.priorities.join(' | ')}`,
      `Canon watchouts: ${frameworkCanon.watchouts.join(' | ')}`,
      `Exploit patterns: ${frameworkCanon.exploitPatterns.join(' | ')}`,
      `Console checks: ${frameworkCanon.consoleChecks.join(' | ')}`,
      `Detected mode: ${hasFivemSignals ? 'FiveM / Lua resource' : 'Lua project'}`,
    ].join('\n');
    return {
      title: hasFivemSignals ? 'FiveM Coding Intel' : 'Lua Coding Intel',
      summary: hasFivemSignals
        ? 'FiveM resource signals detected. JARVIS can now reason about natives, events, resource architecture, and exploit-resistant Lua patterns more directly.'
        : 'Lua signals detected. JARVIS can now review logic, state flow, safety, and maintainability with a stronger Lua-focused lens.',
      details,
      resourceKey,
      framework: detectedFramework,
      topology,
      serverStructure,
      nativeFamilies,
      riskTags,
      canonSummary: frameworkCanon.summary,
      canonPriorities: frameworkCanon.priorities,
      canonWatchouts: frameworkCanon.watchouts,
      canonExploitPatterns: frameworkCanon.exploitPatterns,
      canonConsoleChecks: frameworkCanon.consoleChecks,
      focusItems,
    } satisfies FivemCodingBrief;
  }, [durableOperatorMemory?.projects, editorFilePath, needsExtendedIntelBriefs, workspaceSummary?.changed_files, workspaceSummary?.root]);
  const fivemCodingBrief = useMemo(
    () =>
      buildFivemCodingBrief({
        enabled: needsExtendedIntelBriefs,
        workspaceSummary,
        durableProjects: durableOperatorMemory?.projects,
        editorFilePath,
      }),
    [durableOperatorMemory?.projects, editorFilePath, needsExtendedIntelBriefs, workspaceSummary],
  );
  const recentLearningExperiences = useMemo(() => durableOperatorMemory?.learning_experiences || [], [durableOperatorMemory?.learning_experiences]);
  const codingLearningContext = useMemo(() => {
    const baseItems = rankedLearningItems.length ? rankedLearningItems : recentLearningExperiences;
    const items = baseItems.filter((item) =>
      ['coding', 'self-improve', 'fivem'].includes((item.domain || '').toLowerCase()),
    );
    return items
      .sort(
        (left, right) =>
          (((right.outcome_type || '') === 'anti-pattern' ? 1 : 0) - ((left.outcome_type || '') === 'anti-pattern' ? 1 : 0)) ||
          ((right.confidence || 0) - (left.confidence || 0)) ||
          ((right.use_count || 0) - (left.use_count || 0)),
      )
      .slice(0, 4);
  }, [rankedLearningItems, recentLearningExperiences]);
  const fivemLearningContext = useMemo(() => {
    const resourceKey = fivemCodingBrief?.resourceKey || '';
    const baseItems = rankedLearningItems.length ? rankedLearningItems : recentLearningExperiences;
    const items = baseItems.filter((item) => {
      const domain = (item.domain || '').toLowerCase();
      if (domain !== 'fivem' && domain !== 'coding') return false;
      if (!resourceKey) return true;
      return !item.context_key || item.context_key === resourceKey;
    });
    return items
      .sort(
        (left, right) =>
          (((right.outcome_type || '') === 'anti-pattern' ? 1 : 0) - ((left.outcome_type || '') === 'anti-pattern' ? 1 : 0)) ||
          ((right.confidence || 0) - (left.confidence || 0)) ||
          ((right.use_count || 0) - (left.use_count || 0)),
      )
      .slice(0, 4);
  }, [fivemCodingBrief?.resourceKey, rankedLearningItems, recentLearningExperiences]);
  useEffect(() => {
    if (!needsLearningPolling) {
      setRankedLearningItems([]);
      lastLearningFetchKeyRef.current = '';
      return;
    }
    const domain = fivemCodingBrief ? 'fivem' : 'coding';
    const contextKey =
      fivemCodingBrief?.resourceKey ||
      latestCodeResult?.file_path ||
      editorFilePath ||
      nextReviewQueueItem?.filePath ||
      workspaceSummary?.changed_files?.[0] ||
      '';
    const fetchKey = `${domain}:${contextKey}`;
    if (fetchKey === lastLearningFetchKeyRef.current) return;
    const timeout = window.setTimeout(() => {
      fetchOperatorLearningExperiences({ domain, context_key: contextKey, limit: 4 })
        .then((items) => {
          lastLearningFetchKeyRef.current = fetchKey;
          setRankedLearningItems(items);
        })
        .catch(() => setRankedLearningItems([]));
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [editorFilePath, fivemCodingBrief, latestCodeResult?.file_path, needsLearningPolling, nextReviewQueueItem?.filePath, workspaceSummary?.changed_files]);

  function loadSalesPrompt(mode: 'account-brief' | 'deal-review' | 'follow-up' | 'objection' | 'meeting-prep') {
    if (!salesBrief) {
      setWorkbenchNotice('Build a sales brief first.');
      return;
    }
    const promptByMode = {
      'account-brief': salesBrief.accountBriefPrompt,
      'deal-review': salesBrief.dealReviewPrompt,
      'follow-up': salesBrief.followUpPrompt,
      objection: salesBrief.objectionPrompt,
      'meeting-prep': salesBrief.meetingPrepPrompt,
    } as const;
    const noticeByMode = {
      'account-brief': 'Sales account brief prompt loaded.',
      'deal-review': 'Sales deal review prompt loaded.',
      'follow-up': 'Sales follow-up strategy prompt loaded.',
      objection: 'Sales objection-handling prompt loaded.',
      'meeting-prep': 'Sales meeting prep prompt loaded.',
    } as const;
    injectCommand(promptByMode[mode]);
    setWorkbenchNotice(noticeByMode[mode]);
  }

  function loadCustomerReplyDraft() {
    if (!customerBrief) {
      setWorkbenchNotice('Build a customer brief first.');
      return;
    }
    setActionMode('email');
    setEmailRecipient(customerBrief.draftRecipient);
    setEmailSubject(customerBrief.draftSubject);
    setEmailBody(customerBrief.draftBody);
    setActionNotice(
      customerBrief.draftRecipient
        ? 'Customer reply draft loaded into Action Center.'
        : 'Customer reply draft loaded into Action Center. Add a recipient before staging approval.',
    );
  }

  async function escalateCustomerIssue() {
    if (!customerBrief) {
      setWorkbenchNotice('Build a customer brief first.');
      return;
    }
    await createFollowUpTask(
      'Escalate customer issue',
      `${customerBrief.details}\n\nEscalation requested from Customer Intel.\nReview churn risk, promised follow-ups, and the safest next response.`,
    );
  }

  async function refreshShopifyIntel() {
    try {
      const next = await fetchShopifySummary();
      setShopifySummary(next);
      setWorkbenchNotice('Shopify summary loaded into the HUD.');
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to load Shopify summary.');
    }
  }

  function loadSalesFollowUpDraft() {
    if (!salesBrief) {
      setWorkbenchNotice('Build a sales brief first.');
      return;
    }
    setActionMode('email');
    setEmailRecipient(salesBrief.draftRecipient);
    setEmailSubject(salesBrief.draftSubject);
    setEmailBody(salesBrief.draftBody);
    setActionNotice(
      salesBrief.draftRecipient
        ? 'Sales follow-up draft loaded into Action Center.'
        : 'Sales follow-up draft loaded into Action Center. Add a recipient before staging approval.',
    );
  }

  async function savePrimarySalesAccountNote() {
    if (!salesBrief) {
      setWorkbenchNotice('Build a sales brief first.');
      return;
    }
    const accounts = Object.values(durableOperatorMemory?.sales_accounts || {});
    const deals = Object.values(durableOperatorMemory?.sales_deals || {});
    const primaryAccount =
      accounts.find((item) => item.risk_level.trim().toLowerCase().includes('high')) ||
      accounts[0] ||
      null;
    const primaryDeal =
      deals.find((item) => item.risk_level.trim().toLowerCase().includes('high')) ||
      deals[0] ||
      null;
    if (!primaryAccount) {
      setWorkbenchNotice('No sales account available to annotate yet.');
      return;
    }
    const note =
      `[${new Date().toISOString()}] Sales Intel note\n` +
      `${salesBrief.summary}\n\n` +
      `Primary deal: ${primaryDeal?.title || 'None'}\n` +
      `Suggested follow-up: ${primaryDeal?.next_step || primaryAccount.next_step || 'Review next move'}\n` +
      `Source: HUD sales lane`;
    try {
      const next = await updateOperatorSalesAccount({
        key: primaryAccount.key,
        notes: [primaryAccount.notes?.trim(), note].filter(Boolean).join('\n\n'),
        last_interaction: new Date().toISOString(),
      });
      setDurableOperatorMemory(next);
      setWorkbenchNotice(`Saved a sales note for ${primaryAccount.name || primaryAccount.key}.`);
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to save the sales account note.');
    }
  }

  async function markPrimaryDealRisk() {
    if (!salesBrief) {
      setWorkbenchNotice('Build a sales brief first.');
      return;
    }
    const deals = Object.values(durableOperatorMemory?.sales_deals || {});
    const primaryDeal =
      deals.find((item) => item.risk_level.trim().toLowerCase().includes('high')) ||
      deals[0] ||
      null;
    if (!primaryDeal) {
      setWorkbenchNotice('No sales deal available to mark right now.');
      return;
    }
    const nextStep = primaryDeal.next_step?.trim() || 'Needs explicit follow-up plan and owner confirmation.';
    const note =
      `[${new Date().toISOString()}] Sales Intel risk escalation\n` +
      `${salesBrief.summary}\n\n` +
      `Escalated from HUD sales lane.\n` +
      `Next step: ${nextStep}`;
    try {
      const next = await updateOperatorSalesDeal({
        key: primaryDeal.key,
        risk_level: 'high',
        notes: [primaryDeal.notes?.trim(), note].filter(Boolean).join('\n\n'),
        next_step: nextStep,
        last_interaction: new Date().toISOString(),
      });
      setDurableOperatorMemory(next);
      setWorkbenchNotice(`Marked ${primaryDeal.title || primaryDeal.key} as high risk in sales memory.`);
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to update the sales deal risk.');
    }
  }
  const architectureTaskOutcome = useMemo(() => {
    const plannerTask = agentRoleTasks.planner?.[0] || null;
    const executorTask = agentRoleTasks.executor?.[0] || null;
    const handoffSource = agentArchitecture?.handoff?.source || '';
    const roleLabel = (task: AgentTask) => {
      const baseLabel = task.agent_id === plannerTask?.agent_id ? 'Planner' : 'Executor';
      if (handoffSource.startsWith('design')) return `Design ${baseLabel}`;
      if (handoffSource.startsWith('fivem')) return `FiveM ${baseLabel}`;
      return baseLabel;
    };
    const tasks = [plannerTask, executorTask].filter(Boolean) as AgentTask[];
    const failed = tasks.find((task) => task.status === 'failed');
    if (failed) {
      return {
        kind: 'failed' as const,
        label: roleLabel(failed),
        task: failed,
        summary: failed.description,
      };
    }
    const completed = tasks.find((task) => task.status === 'completed');
    if (completed) {
      return {
        kind: 'completed' as const,
        label: roleLabel(completed),
        task: completed,
        summary: completed.description,
      };
    }
    return null;
  }, [agentArchitecture?.handoff?.source, agentRoleTasks.executor, agentRoleTasks.planner]);
  const designArchitectureTaskOutcome = useMemo(() => {
    if (!agentArchitecture?.handoff?.source?.startsWith('design')) return null;
    return architectureTaskOutcome;
  }, [agentArchitecture?.handoff?.source, architectureTaskOutcome]);
  const fivemArchitectureTaskOutcome = useMemo(() => {
    if (!agentArchitecture?.handoff?.source?.startsWith('fivem')) return null;
    return architectureTaskOutcome;
  }, [agentArchitecture?.handoff?.source, architectureTaskOutcome]);
  const selfImproveBrief = useMemo(
    () =>
      buildSelfImproveBrief({
        workspaceSummary,
        workspaceRepos,
        durableProjects: durableOperatorMemory?.projects,
        normalizeMeetingKey,
        latestValidationFailure,
        latestValidationSuccess,
        nextReviewQueueItem,
        nextCodingTask,
        workspaceChecks,
      }),
    [
      durableOperatorMemory?.projects,
      latestValidationFailure,
      latestValidationSuccess,
      nextCodingTask,
      nextReviewQueueItem,
      workspaceChecks,
      workspaceRepos,
      workspaceSummary,
    ],
  );
  const selfImprovePatchPlan = useMemo(
    () =>
      buildSelfImprovePatchPlan({
        activeSelfImproveTask,
        selfImproveTargetFile,
        selfImproveRuns,
        selfImproveBrief,
        latestValidationFailure,
        latestValidationSuccess,
        workspaceChecks,
      }),
    [
      activeSelfImproveTask,
      latestValidationFailure,
      latestValidationSuccess,
      selfImproveBrief,
      selfImproveRuns,
      selfImproveTargetFile,
      workspaceChecks,
    ],
  );
  const durableMissionLookup = useMemo(
    () => buildDurableMissionLookup(durableOperatorMemory?.missions),
    [durableOperatorMemory?.missions],
  );
  const autonomyMissions = useMemo(() => {
    if (!needsExtendedIntelBriefs) return [];
      const missions: Array<MissionMatrixItem & { action: () => void }> = [];
      const savedDesignBrief = durableOperatorMemory?.design_briefs?.[0] || null;

      if (selfImproveBrief || activeSelfImproveTask || selfImproveRuns[0]) {
        const latestRun = selfImproveRuns[0] || null;
        const blocked = latestRun?.phase === 'blocker';
        const completed = latestRun?.phase === 'outcome' && activeSelfImproveTask?.status === 'done';
        const durable = durableMissionLookup.selfImprove;
        const phase: MissionPhase = completed
          ? 'done'
          : blocked
        ? 'retry'
        : latestRun?.phase === 'patch'
        ? 'verify'
        : latestRun?.phase === 'check'
        ? 'verify'
        : latestRun?.phase === 'route'
        ? 'act'
        : 'plan';
        missions.push({
          id: durable?.id || 'mission-self-improve',
          title: durable?.title || activeSelfImproveTask?.title || 'Self-improvement mission',
          domain: 'self-improve',
          status: ((durable?.status as MissionStatus | undefined) || (completed ? 'complete' : blocked ? 'blocked' : 'active')),
          phase: ((durable?.phase as MissionPhase | undefined) || phase),
          summary:
            durable?.summary ||
            selfImprovePatchPlan?.summary ||
            selfImproveBrief?.summary ||
            latestRun?.summary ||
            'Self-improvement context is ready.',
          nextStep:
            durable?.next_step ||
            selfImprovePatchPlan?.steps[0] ||
            (blocked
              ? 'Load the repair step and focus the target file.'
              : workspaceChecks?.checks?.[0]
              ? `Run ${workspaceChecks.checks[0].label}.`
              : 'Load the self-improvement brief.'),
          result: durable?.result || latestRun?.detail || architectureTaskOutcome?.summary || 'Awaiting the next self-improvement result.',
          retryHint: durable?.retry_hint || (blocked ? 'Retry the mission after preparing the smallest safe patch.' : undefined),
          nextActionLabel: typeof durable?.next_action?.label === 'string' ? durable.next_action.label : undefined,
          resultMeta: summarizeMissionMeta(durable?.result_data),
          actionLabel: blocked ? 'Load Repair' : selfImprovePatchPlan ? 'Load Plan' : 'Load Brief',
          action: () =>
            blocked
            ? void loadSelfImproveRepairStep(latestRun?.detail || selfImproveBrief?.summary || 'Self-improvement blocker detected.', 'self-improve-mission')
            : selfImprovePatchPlan
            ? injectCommand(selfImprovePatchPlan.prompt)
            : selfImproveBrief
            ? injectCommand(selfImproveBrief.prompt)
            : setFocusMode(false),
      });
    }

      if (agentArchitecture?.handoff?.brief || architectureTaskOutcome || agentRoleTasks.planner?.[0] || agentRoleTasks.executor?.[0]) {
        const blocked = architectureTaskOutcome?.kind === 'failed';
        const hasOutcome = architectureTaskOutcome?.kind === 'completed';
        const durable = durableMissionLookup.planner;
        missions.push({
          id: durable?.id || 'mission-planner-executor',
          title: durable?.title || 'Planner -> Executor',
          domain: 'planner',
          status: ((durable?.status as MissionStatus | undefined) || (blocked ? 'blocked' : hasOutcome ? 'complete' : 'active')),
          phase: ((durable?.phase as MissionPhase | undefined) || (blocked ? 'retry' : hasOutcome ? 'done' : agentRoleTasks.executor?.[0] ? 'act' : 'plan')),
          summary: durable?.summary || agentArchitecture?.handoff?.brief || architectureTaskOutcome?.summary || 'Planner handoff ready.',
          nextStep: durable?.next_step || (blocked
            ? 'Review the blocker and retry the mission.'
            : hasOutcome
            ? 'Review the latest outcome and decide whether to continue.'
            : 'Open Core Agents and watch the delegated work progress.'),
          result: durable?.result || architectureTaskOutcome?.summary || 'No planner/executor outcome reported yet.',
          retryHint: durable?.retry_hint || (blocked ? 'Retry after clarifying the brief or reducing mission scope.' : undefined),
          nextActionLabel: typeof durable?.next_action?.label === 'string' ? durable.next_action.label : undefined,
          resultMeta: summarizeMissionMeta(durable?.result_data),
          actionLabel: blocked ? 'Retry Mission' : 'Open Core Agents',
          action: () =>
            blocked && selfImproveBrief
            ? void handoffWithBrief(selfImproveBrief.prompt, 'self-improve')
            : setFocusMode(false),
      });
    }

      if (visualBrief || visionSuggestedActions?.actions?.length || visionUiPlan?.summary || visionQuery?.answer) {
        const topVisualAction = visionSuggestedActions?.actions?.slice().sort((left, right) => right.priority - left.priority)[0] || null;
        const durable = durableMissionLookup.visual;
        missions.push({
          id: durable?.id || 'mission-visual',
          title: durable?.title || visualBrief?.title || screenSnapshot?.label || 'Visual mission',
          domain: 'visual',
          status: ((durable?.status as MissionStatus | undefined) || (topVisualAction || visionUiPlan?.summary ? 'active' : 'idle')),
          phase: ((durable?.phase as MissionPhase | undefined) || (topVisualAction?.desktop_intent ? 'act' : visionUiPlan?.summary ? 'plan' : 'detect')),
          summary: durable?.summary || visualBrief?.summary || visionUiPlan?.summary || visionQuery?.answer || 'Visual context captured.',
          nextStep:
            durable?.next_step ||
            topVisualAction?.title ||
            visionUiPlan?.steps?.[0] ||
            'Ask a visual question or extract the next UI target.',
          result:
            durable?.result ||
            topVisualAction?.detail ||
            visionUiVerify?.summary ||
            visionSignals?.summary ||
            'No resolved visual action yet.',
          retryHint: durable?.retry_hint || undefined,
          nextActionLabel: typeof durable?.next_action?.label === 'string' ? durable.next_action.label : undefined,
          resultMeta: summarizeMissionMeta(durable?.result_data),
          actionLabel: topVisualAction?.desktop_intent ? 'Stage Desktop' : 'Load Visual',
          action: () =>
            topVisualAction?.desktop_intent
            ? stageVisualDesktopIntent(topVisualAction.desktop_intent)
            : topVisualAction
            ? injectCommand(topVisualAction.prompt)
            : visualBrief
            ? injectCommand(visualBrief.prompt)
            : setFocusMode(false),
      });
    }

      if (documentBrief || durableMissionLookup.document) {
        const durable = durableMissionLookup.document;
        missions.push({
          id: durable?.id || 'mission-document',
          title: durable?.title || documentBrief?.title || 'Document Intel mission',
          domain: 'document',
          status: ((durable?.status as MissionStatus | undefined) || (documentAnalysis ? 'complete' : 'active')),
          phase: ((durable?.phase as MissionPhase | undefined) || (documentAnalysis ? 'done' : 'plan')),
          summary: durable?.summary || documentBrief?.summary || 'Document analysis lane is ready.',
          nextStep:
            durable?.next_step ||
            (documentAnalysis
              ? 'Review the document brief and route it to planning, tasks, or next decisions.'
              : 'Upload documents and run analysis.'),
          result: durable?.result || documentBrief?.details || 'Awaiting the next document result.',
          retryHint: durable?.retry_hint || undefined,
          nextActionLabel: typeof durable?.next_action?.label === 'string' ? durable.next_action.label : undefined,
          resultMeta: summarizeMissionMeta(durable?.result_data),
          actionLabel: documentAnalysis ? 'Load Brief' : 'Open Intel',
          action: () => (documentBrief ? injectCommand(documentBrief.prompt) : setFocusMode(false)),
        });
      }

      if (salesBrief || durableMissionLookup.sales) {
        const durable = durableMissionLookup.sales;
        const hasRisk = salesBrief?.counts.find((item) => item.label === 'Risk Signals' && Number(item.value) > 0);
        const hasFollowUpGap = salesBrief?.summary.toLowerCase().includes('follow-up gap');
        missions.push({
          id: durable?.id || 'mission-sales',
          title: durable?.title || salesBrief?.title || 'Sales mission',
          domain: 'sales',
          status: ((durable?.status as MissionStatus | undefined) || (salesBrief ? 'active' : 'idle')),
          phase:
            ((durable?.phase as MissionPhase | undefined) ||
              (hasRisk ? 'plan' : hasFollowUpGap ? 'act' : salesBrief ? 'verify' : 'detect')),
          summary: durable?.summary || salesBrief?.summary || 'Sales lane is ready.',
          nextStep:
            durable?.next_step ||
            (hasRisk
              ? 'Review the riskiest deal and assign the next move.'
              : hasFollowUpGap
              ? 'Resolve the next follow-up gap.'
              : 'Audit the current pipeline and prepare the sharpest outreach.'),
          result:
            durable?.result ||
            (hasRisk
              ? 'Risk signals detected in the pipeline.'
              : hasFollowUpGap
              ? 'One or more sales records still lack a clear next step.'
              : 'Sales memory is stable and ready for the next commercial pass.'),
          retryHint:
            durable?.retry_hint ||
            'Reload Sales Intel, draft the next follow-up, or route the brief to planner for a deeper commercial pass.',
          resultMeta: summarizeMissionMeta(durable?.result_data),
          actionLabel: salesBrief ? 'Load Brief' : 'Open Sales',
          action: () => (salesBrief ? injectCommand(salesBrief.prompt) : setFocusMode(false)),
        });
      }

      if (customerBrief || durableMissionLookup.customer) {
        const durable = durableMissionLookup.customer;
        const hasChurnRisk = customerBrief?.counts.find((item) => item.label === 'Churn Risk' && Number(item.value) > 0);
        const hasUrgent = customerBrief?.counts.find((item) => item.label === 'Urgent' && Number(item.value) > 0);
        missions.push({
          id: durable?.id || 'mission-customer',
          title: durable?.title || customerBrief?.title || 'Customer mission',
          domain: 'customer',
          status: ((durable?.status as MissionStatus | undefined) || (customerBrief ? 'active' : 'idle')),
          phase:
            ((durable?.phase as MissionPhase | undefined) ||
              (hasUrgent ? 'act' : hasChurnRisk ? 'plan' : customerBrief ? 'verify' : 'detect')),
          summary: durable?.summary || customerBrief?.summary || 'Customer lane is ready.',
          nextStep:
            durable?.next_step ||
            (hasUrgent
              ? 'Draft the next customer reply or escalate the issue.'
              : hasChurnRisk
              ? 'Review the highest-risk customer account and resolve the next follow-up.'
              : 'Audit current customer health and support activity.'),
          result:
            durable?.result ||
            (hasUrgent
              ? 'Urgent customer interaction detected.'
              : hasChurnRisk
              ? 'Customer churn risk signals are active.'
              : 'Customer context is stable and ready for the next support pass.'),
          retryHint:
            durable?.retry_hint ||
            'Reload Customer Intel, draft the next reply, or route the customer brief to planner for deeper support coordination.',
          nextActionLabel: typeof durable?.next_action?.label === 'string' ? durable.next_action.label : undefined,
          resultMeta: summarizeMissionMeta(durable?.result_data),
          actionLabel: customerBrief ? 'Load Brief' : 'Open Customer',
          action: () => (customerBrief ? injectCommand(customerBrief.prompt) : setFocusMode(false)),
        });
      }

      if (shopifyBrief || durableMissionLookup.shopify) {
        const durable = durableMissionLookup.shopify;
        const hasOpenOrders = Number(shopifySummary?.open_orders || 0) > 0;
        const hasLowStock = Number(shopifySummary?.low_stock_products?.length || 0) > 0;
        const hasRepeatBase = Number(shopifySummary?.repeat_customers || 0) > 0;
        missions.push({
          id: durable?.id || 'mission-shopify',
          title: durable?.title || shopifyBrief?.title || 'Shopify mission',
          domain: 'shopify',
          status: ((durable?.status as MissionStatus | undefined) || (shopifyBrief ? 'active' : 'idle')),
          phase:
            ((durable?.phase as MissionPhase | undefined) ||
              (hasLowStock ? 'act' : hasOpenOrders ? 'verify' : hasRepeatBase ? 'plan' : shopifyBrief ? 'detect' : 'detect')),
          summary: durable?.summary || shopifyBrief?.summary || 'Shopify lane is ready.',
          nextStep:
            durable?.next_step ||
            (hasLowStock
              ? 'Review the low-stock watch and decide what needs replenishment first.'
              : hasOpenOrders
              ? 'Review open orders and look for fulfillment or support risks.'
              : hasRepeatBase
              ? 'Use repeat-customer signals to plan the next retention or campaign move.'
              : 'Refresh Shopify intel and review store performance.'),
          result:
            durable?.result ||
            (hasLowStock
              ? 'Low-stock products need attention.'
              : hasOpenOrders
              ? 'Open orders are still active in the store.'
              : hasRepeatBase
              ? 'Repeat-customer behavior is available for the next ecommerce pass.'
              : 'Store summary is ready for the next operating review.'),
          retryHint:
            durable?.retry_hint ||
            'Reload Shopify Intel, route the brief to planner, or create a store-ops task for the highest-impact issue.',
          nextActionLabel: typeof durable?.next_action?.label === 'string' ? durable.next_action.label : undefined,
          resultData: durable?.result_data || {
            store: shopifySummary?.store || '',
            open_orders: shopifySummary?.open_orders || 0,
            low_stock_products: shopifySummary?.low_stock_products?.length || 0,
            repeat_customers: shopifySummary?.repeat_customers || 0,
          },
          nextAction: durable?.next_action || (shopifyBrief
            ? {
                kind: hasLowStock || hasOpenOrders ? 'task' : 'brief',
                content: hasLowStock || hasOpenOrders ? shopifyBrief.details : shopifyBrief.plannerPrompt,
                label: hasLowStock ? 'Resolve Store Risk' : hasOpenOrders ? 'Review Open Orders' : 'Shopify Ops Brief',
                source: 'shopify-mission',
              }
            : undefined),
          resultMeta: durable?.result_data
            ? summarizeMissionMeta(durable.result_data)
            : [
                `open orders: ${shopifySummary?.open_orders || 0}`,
                `low stock: ${shopifySummary?.low_stock_products?.length || 0}`,
                `repeat customers: ${shopifySummary?.repeat_customers || 0}`,
              ],
          actionLabel: shopifyBrief ? 'Load Brief' : 'Open Shopify',
          action: () => (shopifyBrief ? injectCommand(shopifyBrief.prompt) : setFocusMode(false)),
        });
      }

      const commercialMission = buildCommercialMission({
        durable: durableMissionLookup.commercial,
        commercialBrief,
        summarizeMissionMeta,
        injectCommercialBrief: () => injectCommand(commercialBrief?.prompt || ''),
        fallbackAction: () => setFocusMode(false),
      });
      if (commercialMission) {
        missions.push(commercialMission);
      }

      const fivemMission = buildFivemMission({
        durable: durableMissionLookup.fivem,
        fivemCodingBrief,
        summarizeMissionMeta,
        loadFivemReview: () => loadFivemCodingPrompt('fivem-review'),
        fallbackAction: () => setFocusMode(false),
      });
      if (fivemMission) {
        missions.push(fivemMission);
      }

      const designMission = buildDesignMission({
        durable: durableMissionLookup.design,
        savedDesignBrief,
        summarizeMissionMeta,
        loadDesignScorecard: () => loadDesignPrompt('scorecard'),
        loadDesignBrief: () => injectCommand(savedDesignBrief?.details || savedDesignBrief?.summary || ''),
        fallbackAction: () => setFocusMode(false),
      });
      if (designMission) {
        missions.push(designMission);
      }

    return missions;
  }, [
    activeSelfImproveTask?.status,
    activeSelfImproveTask?.title,
    agentArchitecture?.handoff?.brief,
    agentRoleTasks.executor,
    agentRoleTasks.planner,
    architectureTaskOutcome,
    documentAnalysis,
    documentBrief,
    durableOperatorMemory?.design_briefs,
    needsExtendedIntelBriefs,
    screenSnapshot?.label,
      selfImproveBrief,
      selfImprovePatchPlan,
      selfImproveRuns,
      durableMissionLookup,
      visionQuery?.answer,
      visionSignals?.summary,
      visionSuggestedActions?.actions,
    visionUiPlan?.steps,
    visionUiPlan?.summary,
      visionUiVerify?.summary,
    visualBrief,
    workspaceChecks?.checks,
  ]);
  async function runMissionAction(
    mission: {
      id: string;
      status: MissionStatus;
      summary: string;
      retryHint?: string;
      action: () => void;
    },
  ) {
    let handledFollowup = false;
    try {
      const next = await actOnOperatorMission({
        id: mission.id,
        action: mission.status === 'blocked' ? 'retry' : mission.status === 'complete' ? 'complete' : 'resume',
        summary: mission.summary,
        retry_hint: mission.retryHint,
      });
      setDurableOperatorMemory(next.memory);
      const followup = next.followup;
      if (followup?.content?.trim()) {
        if (followup.kind === 'handoff') {
          await handoffWithBrief(followup.content, String(followup.source || 'mission-action'));
          handledFollowup = true;
        } else if (followup.kind === 'brief') {
          if (mission.id.includes('planner') || String(followup.source || '').includes('planner')) {
            await handoffWithBrief(followup.content, 'mission-action');
          } else {
            injectCommand(followup.content);
          }
          handledFollowup = true;
        } else if (followup.kind === 'prompt') {
          injectCommand(followup.content);
          handledFollowup = true;
        } else if (followup.kind === 'task') {
          await createFollowUpTask(
            String(followup.label || mission.summary || 'Mission follow-up'),
            followup.content,
          );
          handledFollowup = true;
        }
      }
    } catch {
      // Keep the local action path working even if the durable mission update fails.
    }
    if (!handledFollowup) {
      mission.action();
    }
  }
  const commanderQueue = useMemo(() => {
    if (!needsExtendedIntelBriefs) return [];
    const items = buildCommanderQueueItems({
      commanderBrief,
      onPlannerHandoff: (prompt) => {
        void handoffWithBrief(prompt, 'commander-brief');
      },
      onOpenSystem: () => navigate('/system'),
    });

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

    if (selfImproveBrief) {
      const plannerReady = agentArchitecture?.roles?.some(
        (role) => role.role === 'planner' && role.ready && !!role.agent_id,
      );
      const executorReady = agentArchitecture?.roles?.some(
        (role) => role.role === 'executor' && role.ready && !!role.agent_id,
      );
      const canRouteToPlanner = plannerReady && executorReady;
      items.push({
        id: `self-improve-${selfImproveBrief.title}`,
        priority: latestValidationFailure ? 62 : nextCodingTask || nextReviewQueueItem ? 56 : 51,
        label: 'Self-Improve',
        title: selfImproveBrief.title,
        detail: selfImproveBrief.summary,
        actionLabel: canRouteToPlanner ? 'Route Plan' : 'Load Brief',
        action: () =>
          canRouteToPlanner
            ? void handoffWithBrief(selfImproveBrief.prompt, 'self-improve')
            : injectCommand(selfImproveBrief.prompt),
      });
    }

    if (visualBrief) {
      items.push({
        id: `visual-brief-${visualBrief.title}`,
        priority: 59,
        label: 'Visual Brief',
        title: visualBrief.title,
        detail: visualBrief.summary,
        actionLabel: 'Load Brief',
        action: () => injectCommand(visualBrief.prompt),
      });
    }

    if (documentBrief) {
      items.push({
        id: `document-brief-${documentBrief.title}`,
        priority: 58,
        label: 'Document Intel',
        title: documentBrief.title,
        detail: documentBrief.summary,
        actionLabel: 'Load Brief',
        action: () => injectCommand(documentBrief.prompt),
      });
    }

    if (salesBrief) {
      items.push({
        id: `sales-brief-${salesBrief.title}`,
        priority: 59,
        label: 'Sales Intel',
        title: salesBrief.title,
        detail: salesBrief.summary,
        actionLabel: 'Load Brief',
        action: () => injectCommand(salesBrief.prompt),
      });
    }

    if (customerBrief) {
      items.push({
        id: `customer-brief-${customerBrief.title}`,
        priority: 58,
        label: 'Customer Intel',
        title: customerBrief.title,
        detail: customerBrief.summary,
        actionLabel: 'Load Brief',
        action: () => injectCommand(customerBrief.prompt),
      });
    }

    if (shopifyBrief) {
      items.push({
        id: `shopify-brief-${shopifySummary?.store || 'store'}`,
        priority: 57,
        label: 'Shopify Intel',
        title: shopifyBrief.title,
        detail: shopifyBrief.summary,
        actionLabel: 'Load Brief',
        action: () => injectCommand(shopifyBrief.prompt),
      });
    }
    if (commercialBrief) {
      items.push({
        id: 'commercial-ops-brief',
        priority: 58,
        label: 'Commercial Ops',
        title: commercialBrief.title,
        detail: commercialBrief.summary,
        actionLabel: 'Load Brief',
        action: () => injectCommand(commercialBrief.prompt),
      });
    }
    if (fivemCodingBrief) {
      const nativeLabel = fivemCodingBrief.nativeFamilies.length ? ` / ${fivemCodingBrief.nativeFamilies.join(', ')}` : '';
      items.push({
        id: 'fivem-coding-brief',
        priority: 56,
        label: 'FiveM Intel',
        title: fivemCodingBrief.title,
        detail: `${fivemCodingBrief.framework} / ${fivemCodingBrief.topology}${nativeLabel}`,
        actionLabel: 'Review',
        action: () => loadFivemCodingPrompt('fivem-review'),
      });
    }

    if (agentArchitecture?.handoff?.brief) {
      items.push({
        id: `agent-handoff-${agentArchitecture.handoff.planner?.task_id || agentArchitecture.handoff.executor?.task_id || 'current'}`,
        priority: 61,
        label: 'Agent Handoff',
        title: 'Planner -> Executor',
        detail: agentArchitecture.handoff.brief,
        actionLabel: 'Open Core Agents',
        action: () => setFocusMode(false),
      });
    }

    if (architectureTaskOutcome) {
      const isDesignOutcome = agentArchitecture?.handoff?.source?.startsWith('design');
      items.push({
        id: `agent-outcome-${architectureTaskOutcome.task.id}`,
        priority: architectureTaskOutcome.kind === 'failed' ? 66 : 59,
        label:
          architectureTaskOutcome.kind === 'failed'
            ? isDesignOutcome
              ? 'Design Blocker'
              : 'Agent Blocker'
            : isDesignOutcome
            ? 'Design Outcome'
            : 'Agent Outcome',
        title: `${architectureTaskOutcome.label} ${architectureTaskOutcome.kind}`,
        detail: architectureTaskOutcome.summary,
        actionLabel: 'Open Core Agents',
        action: () => setFocusMode(false),
      });
    }

    const plannerTask = agentRoleTasks.planner?.[0];
    if (plannerTask) {
      items.push({
        id: `planner-task-${plannerTask.id}`,
        priority: plannerTask.status === 'active' ? 64 : 58,
        label: 'Planner Task',
        title: 'JARVIS Planner',
        detail: plannerTask.description,
        actionLabel: 'Open Core Agents',
        action: () => setFocusMode(false),
      });
    }

    const executorTask = agentRoleTasks.executor?.[0];
    if (executorTask) {
      items.push({
        id: `executor-task-${executorTask.id}`,
        priority: executorTask.status === 'active' ? 63 : 57,
        label: 'Executor Task',
        title: 'JARVIS Executor',
        detail: executorTask.description,
        actionLabel: 'Open Core Agents',
        action: () => setFocusMode(false),
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

    if (visionTextExtraction?.content.trim()) {
      const firstLine = visionTextExtraction.content.split('\n').find((line) => line.trim()) || 'Visible text extracted.';
      items.push({
        id: `vision-text-${screenSnapshot?.capturedAt || 'current'}`,
        priority: 53,
        label: 'Visible Text',
        title: screenSnapshot?.label || 'Visual text',
        detail: firstLine,
        actionLabel: 'Load Text',
        action: () =>
          injectCommand(
            `I extracted visible text from "${screenSnapshot?.label || 'this visual'}".\n${visionTextExtraction.content}\nSummarize what matters and turn it into the next concrete action.`,
          ),
      });
    }

    if (visionSignals && (visionSignals.blockers.length || visionSignals.deadlines.length || visionSignals.attention_items.length)) {
      const topSignal =
        visionSignals.blockers[0] || visionSignals.deadlines[0] || visionSignals.attention_items[0] || visionSignals.summary;
      items.push({
        id: `vision-signals-${screenSnapshot?.capturedAt || 'current'}`,
        priority: visionSignals.blockers.length ? 58 : visionSignals.deadlines.length ? 57 : 52,
        label: 'Visual Signals',
        title: screenSnapshot?.label || 'Screen signals',
        detail: topSignal || 'Visual signals ready.',
        actionLabel: 'Load Signals',
        action: () =>
          injectCommand(
            `I extracted structured visual signals from "${screenSnapshot?.label || 'this visual'}".\nSummary: ${visionSignals.summary || 'No summary.'}\nBlockers: ${visionSignals.blockers.join(' | ') || 'None'}\nDeadlines: ${visionSignals.deadlines.join(' | ') || 'None'}\nAttention items: ${visionSignals.attention_items.join(' | ') || 'None'}\nTurn this into the next concrete action.`,
          ),
      });
    }

    if (visionSuggestedActions?.actions?.length) {
      const topVisualAction = [...visionSuggestedActions.actions].sort((left, right) => right.priority - left.priority)[0];
      if (topVisualAction) {
        items.push({
          id: `vision-action-${topVisualAction.title}-${screenSnapshot?.capturedAt || 'current'}`,
          priority: 56,
          label: 'Visual Action',
          title: topVisualAction.title,
          detail: topVisualAction.detail,
          actionLabel: topVisualAction.desktop_intent ? 'Stage Desktop' : 'Load Prompt',
          action: () =>
            topVisualAction.desktop_intent
              ? stageVisualDesktopIntent(topVisualAction.desktop_intent)
              : injectCommand(topVisualAction.prompt),
        });
      }
    }

    if (visionUiTargets?.targets?.length) {
      const topVisualTarget = [...visionUiTargets.targets].sort((left, right) => right.confidence - left.confidence)[0];
      if (topVisualTarget) {
        items.push({
          id: `vision-target-${topVisualTarget.label}-${screenSnapshot?.capturedAt || 'current'}`,
          priority: topVisualTarget.control_type === 'alert' ? 57 : 55,
          label: 'UI Target',
          title: topVisualTarget.label,
          detail: topVisualTarget.detail || `${topVisualTarget.control_type} detected on screen.`,
          actionLabel: topVisualTarget.desktop_intent ? 'Stage Desktop' : 'Load Target',
          action: () =>
            topVisualTarget.desktop_intent
              ? stageVisualDesktopIntent(topVisualTarget.desktop_intent)
              : injectCommand(topVisualTarget.prompt),
        });
      }
    }

    if (visionUiPlan?.summary.trim()) {
      items.push({
        id: `vision-plan-${visionUiPlan.target_label}-${screenSnapshot?.capturedAt || 'current'}`,
        priority: 56,
        label: 'UI Plan',
        title: visionUiPlan.target_label,
        detail: visionUiPlan.summary,
        actionLabel: visionUiPlan.desktop_intent ? 'Stage Desktop' : 'Load Plan',
        action: () =>
          visionUiPlan.desktop_intent
            ? stageVisualDesktopIntent(visionUiPlan.desktop_intent)
            : injectCommand(visionUiPlan.prompt || visionUiPlan.steps.join('\n')),
      });
    }

    if (visionUiVerify?.summary.trim()) {
      items.push({
        id: `vision-verify-${visionUiVerify.target_label}-${screenSnapshot?.capturedAt || 'current'}`,
        priority: visionUiVerify.risk_level === 'high' ? 58 : 55,
        label: 'UI Verify',
        title: visionUiVerify.target_label,
        detail: visionUiVerify.summary,
        actionLabel: 'Load Verify',
        action: () =>
          injectCommand(
            `I verified the visual UI target "${visionUiVerify.target_label}".\nSummary: ${visionUiVerify.summary}\nConfidence: ${visionUiVerify.confidence}\nRisk: ${visionUiVerify.risk_level}\nChecks: ${visionUiVerify.verification_checks.join(' | ') || 'None'}\nEvidence: ${visionUiVerify.evidence.join(' | ') || 'None'}\nTurn this into the safest next action.`,
          ),
      });
    }

    if (visionQuery?.answer.trim()) {
      items.push({
        id: `vision-query-${screenSnapshot?.capturedAt || 'current'}`,
        priority: 54,
        label: 'Visual Q&A',
        title: visionQuery.question,
        detail: visionQuery.answer.split('\n').find((line) => line.trim()) || 'Visual answer ready.',
        actionLabel: 'Load Answer',
        action: () =>
          injectCommand(
            `I asked JARVIS a visual question.\nQuestion: ${visionQuery.question}\nAnswer:\n${visionQuery.answer}\nTurn this into the best next step.`,
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

    if (selfImproveRuns[0]) {
      items.push({
        id: `self-improve-run-${selfImproveRuns[0].id}`,
        priority: selfImproveRuns[0].phase === 'blocker' ? 60 : selfImproveRuns[0].phase === 'outcome' ? 56 : 50,
        label: 'Self-Improve Loop',
        title: selfImproveRuns[0].summary,
        detail: selfImproveRuns[0].detail,
        actionLabel: selfImproveBrief ? 'Load Brief' : 'Open Coding',
        action: () => (selfImproveBrief ? injectCommand(selfImproveBrief.prompt) : setFocusMode(false)),
      });
    }

    if (selfImprovePatchPlan) {
      items.push({
        id: `self-improve-plan-${selfImprovePatchPlan.targetFile || 'workspace'}`,
        priority: selfImproveRuns[0]?.phase === 'blocker' ? 61 : 54,
        label: 'Patch Plan',
        title: selfImprovePatchPlan.targetFile || 'Workspace patch plan',
        detail: selfImprovePatchPlan.summary,
        actionLabel: 'Load Plan',
        action: () => injectCommand(selfImprovePatchPlan.prompt),
      });
    }

    if (autonomyMissions[0]) {
      items.push({
        id: `mission-${autonomyMissions[0].id}`,
        priority:
          autonomyMissions[0].status === 'blocked'
            ? 67
            : autonomyMissions[0].status === 'active'
            ? 53
            : 45,
        label: 'Mission Loop',
        title: autonomyMissions[0].title,
        detail: `${missionPhaseLabel(autonomyMissions[0].phase)} · ${autonomyMissions[0].nextStep}`,
        actionLabel: autonomyMissions[0].actionLabel,
        action: autonomyMissions[0].action,
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
  }, [activeAutomationAlerts, agentArchitecture?.handoff?.brief, agentArchitecture?.handoff?.executor?.task_id, agentArchitecture?.handoff?.planner?.task_id, agentArchitecture?.roles, agentRoleTasks.executor, agentRoleTasks.planner, architectureTaskOutcome, autonomyMissions, commercialBrief, customerBrief, documentBrief, editorFilePath, gitCommitMessage, inboxFocusQueue, latestCodeResult?.file_path, latestValidationFailure, latestValidationSuccess, needsExtendedIntelBriefs, nextCodingTask, nextReviewQueueItem, pendingAction, pendingCodeEdit, pendingWorkbench, prepQueue, salesBrief, screenSnapshot?.capturedAt, screenSnapshot?.label, selfImproveBrief, selfImprovePatchPlan, selfImproveRuns, shopifyBrief, shopifySummary?.store, visionAnalysis?.content, visionQuery?.answer, visionQuery?.question, visionSignals, visionSuggestedActions?.actions, visionTextExtraction?.content, visionUiPlan?.summary, visionUiPlan?.target_label, visionUiTargets?.targets, visionUiVerify?.summary, visionUiVerify?.risk_level, visionUiVerify?.target_label, visualBrief]);
  const connectorCapabilities = useMemo(() => {
    const ids = new Set(connectedConnectorIds);
    const gmailConnected = ids.has('gmail') || ids.has('gmail_imap');
    const googleCalendarConnected = ids.has('gcalendar');
    const googleTasksConnected = ids.has('google_tasks');
    const outlookConnected = ids.has('outlook');
    const emailProvider = actionCenterCapabilities?.email.preferred_provider || connectorSummary.emailProvider;
    const calendarProvider = actionCenterCapabilities?.calendar.preferred_provider || connectorSummary.calendarProvider;
    const inboxDirect = actionCenterCapabilities?.inbox.providers.find((item) => item.id === 'gmail')?.supports_archive;
    const taskDirect = actionCenterCapabilities?.tasks.providers.find((item) => item.id === 'google_tasks')?.direct_create;
    return [
      {
        label: 'Email Drafts',
        value: (actionCenterCapabilities?.email.ready ?? connectorSummary.emailReady)
          ? emailProvider === 'outlook'
            ? 'Outlook manual draft path'
            : emailProvider === 'gmail'
            ? 'Gmail direct send path'
            : 'Draft path ready'
          : 'Not connected',
      },
      {
        label: 'Inbox Mutations',
        value: inboxDirect || gmailConnected ? 'Gmail REST ready' : outlookConnected ? 'Outlook read-only' : 'Limited',
      },
      {
        label: 'Calendar Create',
        value:
          calendarProvider === 'gcalendar'
            ? 'Google direct create path'
            : calendarProvider === 'outlook'
            ? 'Outlook manual plan path'
            : googleCalendarConnected
            ? 'Google path ready'
            : outlookConnected
            ? 'Outlook manual plan path'
            : 'Limited',
      },
      {
        label: 'Task Create',
        value: taskDirect || googleTasksConnected ? 'Google Tasks direct path' : 'Limited',
      },
    ];
  }, [actionCenterCapabilities, connectedConnectorIds, connectorSummary.calendarProvider, connectorSummary.emailProvider, connectorSummary.emailReady]);
  const actionCenterExecutionHint = useMemo(() => {
    const ids = new Set(connectedConnectorIds);
    const gmailConnected = ids.has('gmail') || ids.has('gmail_imap');
    const googleCalendarConnected = ids.has('gcalendar');
    const outlookConnected = ids.has('outlook');
    if (actionMode === 'email') {
      if (!(actionCenterCapabilities?.email.ready ?? connectorSummary.emailReady)) {
        return {
          ready: false,
          label: 'Connect Gmail or Outlook to stage email drafts.',
          button: 'Email Source Needed',
          provider: '',
        };
      }
      const preferredProvider =
        actionCenterCapabilities?.email.preferred_provider || connectorSummary.emailProvider || (gmailConnected ? 'gmail' : 'outlook');
      const emailCapability = actionCenterCapabilities?.email.providers.find((item) => item.id === preferredProvider);
      return {
        ready: true,
        label:
          emailCapability?.direct_send
            ? 'Email actions can proceed directly through the Gmail REST path.'
            : preferredProvider === 'outlook'
            ? 'Email draft staging is available through Outlook. Approval will keep this in draft-ready mode for operator review.'
            : 'Email staging is available, but direct send is limited for the connected provider.',
        button: 'Stage for Approval',
        provider: preferredProvider === 'gmail' ? 'Gmail' : 'Outlook',
      };
    }

    if (actionCenterCapabilities?.calendar.preferred_provider === 'gcalendar' || googleCalendarConnected) {
      return {
        ready: true,
        label: 'Calendar actions can attempt direct Google Calendar creation.',
        button: 'Stage for Approval',
        provider: 'Google Calendar',
      };
    }
    if (actionCenterCapabilities?.calendar.preferred_provider === 'outlook' || outlookConnected) {
      return {
        ready: true,
        label: 'Calendar planning is available. Outlook will keep this as a manual-plan approval step.',
        button: 'Stage for Approval',
        provider: 'Outlook',
      };
    }
    return {
      ready: false,
      label: 'Connect Google Calendar or Outlook to stage calendar actions.',
      button: 'Calendar Source Needed',
      provider: '',
    };
  }, [actionCenterCapabilities, actionMode, connectedConnectorIds, connectorSummary.emailProvider, connectorSummary.emailReady]);

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

  const status: Status = useMemo(
    () =>
      getHudStatus({
        isStreaming: streamState.isStreaming,
        streamContent: streamState.content,
        activeToolCallCount: streamState.activeToolCalls.length,
        voiceLoopActive: !!voiceLoop?.active,
        speechEnabled: settings.speechEnabled,
        speechAvailable: !!speechAvailable,
      }),
    [
      settings.speechEnabled,
      speechAvailable,
      streamState.activeToolCalls.length,
      streamState.content,
      streamState.isStreaming,
      voiceLoop?.active,
    ],
  );

  const statusMeta = useMemo(
    () =>
      buildHudStatusMeta({
        status,
        voiceLoopActive: !!voiceLoop?.active,
        voiceLoopTranscript: voiceLoop?.last_transcript || '',
        streamPhase: streamState.phase || '',
        streamContent: streamState.content,
        latestUserMessage: latestUserMessage?.content || '',
        latestAssistantMessage: latestAssistantMessage?.content || '',
        toolSummary,
        compactText,
      }),
    [
      latestAssistantMessage?.content,
      latestUserMessage?.content,
      status,
      streamState.content,
      streamState.phase,
      toolSummary,
      voiceLoop?.active,
      voiceLoop?.last_transcript,
    ],
  );
  const voiceEnvironmentLabel = useMemo(
    () => getVoiceEnvironmentLabel(voiceLoop, hudSpeechTelemetry),
    [hudSpeechTelemetry, voiceLoop],
  );
  const voiceReadinessLabel = useMemo(
    () => getVoiceReadinessLabel(voiceLoop, hudSpeechTelemetry),
    [hudSpeechTelemetry, voiceLoop],
  );
  const currentProjectKey = useMemo(
    () => normalizeMeetingKey(workspaceSummary?.root || workspaceSummary?.branch || 'workspace'),
    [workspaceSummary?.branch, workspaceSummary?.root],
  );
  const currentProjectMemory = durableOperatorMemory?.projects?.[currentProjectKey] || null;
  const designScorecard = useMemo(
    () =>
      buildDesignScorecard({
        visualBrief,
        currentProjectMemory,
        documentBrief,
        hasSignals: !!visionSignals || !!visionQuery?.answer?.trim(),
        designInfluences: operatorProfile.designInfluences,
        referenceInterfaces: operatorProfile.referenceInterfaces,
      }),
    [
      currentProjectMemory,
      documentBrief,
      operatorProfile.designInfluences,
      operatorProfile.referenceInterfaces,
      visionQuery?.answer,
      visionSignals,
      visualBrief,
    ],
  );
  const designBrief = useMemo(
    () =>
      buildDesignBrief({
        enabled: needsExtendedIntelBriefs,
        hudArchetype: operatorProfile.hudArchetype as DesignArchetypeId,
        designInfluences: operatorProfile.designInfluences,
        referenceInterfaces: operatorProfile.referenceInterfaces,
        preferredStyle: operatorProfile.designStyle,
        designGoals: operatorProfile.designGoals,
        visualBrief,
        documentBrief,
        currentProjectMemory,
        designScorecard,
      }),
    [
      currentProjectMemory,
      designScorecard,
      documentBrief,
      needsExtendedIntelBriefs,
      operatorProfile.designGoals,
      operatorProfile.designInfluences,
      operatorProfile.referenceInterfaces,
      operatorProfile.designStyle,
      operatorProfile.hudArchetype,
      visualBrief,
    ],
  );
  const activeWorkspaceRepo = useMemo(
    () => workspaceRepos?.repos.find((repo) => repo.root === workspaceRepos.active_root) || null,
    [workspaceRepos],
  );
  const reactorMetrics = useMemo(
    () =>
      buildVoiceReactorMetrics({
        apiReachable,
        speechAvailable,
        speechProfileVadEnabled: speechProfile?.live_vad_enabled,
        speechProfileVadBackend: speechProfile?.vad_backend,
        voiceLoop,
        voiceReadinessLabel,
        voiceEnvironmentLabel,
        latencyLabel: formatElapsed(latestAssistantMessage?.telemetry?.total_ms ?? streamState.elapsedMs),
      }),
    [
      apiReachable,
      latestAssistantMessage?.telemetry?.total_ms,
      speechAvailable,
      speechProfile?.live_vad_enabled,
      speechProfile?.vad_backend,
      streamState.elapsedMs,
      voiceEnvironmentLabel,
      voiceLoop,
      voiceReadinessLabel,
    ],
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
  const viewSummary = useMemo(() => {
    if (isWorkspaceView) {
      return {
        title: 'Workspace keeps repo actions, approvals, and direct command control in one calmer lane.',
        cards: [
          {
            label: 'Best For',
            value: 'coding and repo flow',
            detail: 'Use this when you want the shortest path to staged diffs, workbench status, and the next safe repo action.',
          },
          {
            label: 'Primary Focus',
            value: pendingCodeEdit ? 'review staged diff' : activeWorkspaceRepo?.name || 'active workspace',
            detail: pendingCodeEdit
              ? 'A coding change is already waiting in the approval gate.'
              : workspaceSummary?.root || 'Repo checks, summaries, and command input stay centered here.',
          },
          {
            label: 'Next Good Move',
            value: workspaceChecks?.checks?.[0]?.label || 'inspect repo state',
            detail: workspaceChecks?.checks?.[0]?.command || 'Run the next check or prepare the next git action once the workspace looks clean.',
          },
        ],
      };
    }
    if (isOperationsView) {
      return {
        title: 'Operations is the coordination deck for missions, automations, alerts, and active system pressure.',
        cards: [
          {
            label: 'Best For',
            value: 'coordination and triage',
            detail: 'Use this when you want to steer active missions, resolve blockers, and manage the next operational move.',
          },
          {
            label: 'Primary Focus',
            value: automationNotice || autonomyMissions[0]?.title || 'system coordination',
            detail: autonomyMissions[0]?.summary || 'Mission loops, commander pressure, and background automation signals stay strongest here.',
          },
          {
            label: 'Next Good Move',
            value: commanderQueue[0]?.title || 'review mission queue',
            detail: commanderQueue[0]?.detail || 'Open the highest-priority queue item or continue the most urgent mission.',
          },
        ],
      };
    }
    if (isBriefingsView) {
      return {
        title: 'Briefings is the reading deck for synthesized insight across visuals, documents, customers, sales, and store operations.',
        cards: [
          {
            label: 'Best For',
            value: 'reading and planning',
            detail: 'Use this when you want synthesized context before routing, drafting, or creating follow-up work.',
          },
          {
            label: 'Primary Focus',
            value: visualBrief?.title || documentBrief?.title || salesBrief?.title || customerBrief?.title || 'latest brief',
            detail:
              visualBrief?.summary ||
              documentBrief?.summary ||
              salesBrief?.summary ||
              customerBrief?.summary ||
              'Saved and live intel briefs collect here so you can scan before acting.',
          },
          {
            label: 'Next Good Move',
            value: 'load one brief',
            detail: 'Pick the brief with the clearest pressure signal, then route it to planner or turn it into a task.',
          },
        ],
      };
    }
    return {
      title: 'Dashboard is the live command deck for voice, approvals, missions, and the next best move across JARVIS.',
      cards: [
        {
          label: 'Best For',
          value: 'live command and awareness',
          detail: 'Use this when you want the broadest real-time picture of JARVIS without leaving the main control surface.',
        },
        {
          label: 'Primary Focus',
          value: status,
          detail: statusMeta.reply,
        },
        {
          label: 'Next Good Move',
          value: commanderQueue[0]?.title || immediateReminder?.title || 'review command core',
          detail:
            commanderQueue[0]?.detail ||
            (immediateReminder ? `Immediate reminder set for ${formatReminderMoment(immediateReminder.when)}.` : 'Start from Command Core or the highest-priority queue item.'),
        },
      ],
    };
  }, [
    activeWorkspaceRepo?.name,
    autonomyMissions,
    automationNotice,
    commanderQueue,
    customerBrief?.summary,
    customerBrief?.title,
    documentBrief?.summary,
    documentBrief?.title,
    immediateReminder,
    isBriefingsView,
    isOperationsView,
    isWorkspaceView,
    pendingCodeEdit,
    salesBrief?.summary,
    salesBrief?.title,
    status,
    statusMeta.reply,
    visualBrief?.summary,
    visualBrief?.title,
    workspaceChecks?.checks,
    workspaceSummary?.root,
  ]);

  function injectCommand(text: string) {
    window.dispatchEvent(new CustomEvent('jarvis:set-input', { detail: { text, replace: true } }));
    setVoiceNotice('Command loaded into the deck.');
  }

  function recordSelfImproveRun(
    phase: 'brief' | 'route' | 'patch' | 'check' | 'outcome' | 'blocker',
    summary: string,
    detail: string,
    source = 'self-improve',
  ) {
    setSelfImproveRuns((current) => [
      {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        source,
        phase,
        summary,
        detail,
        createdAt: Date.now(),
      },
      ...current,
    ].slice(0, 20));
  }

  function ensureSelfImproveTask(status: 'pending' | 'in_progress' | 'done' = 'pending') {
    const filePath = selfImproveTargetFile.trim();
    if (!filePath) return;
    const title = `Self-improve ${filePath}`;
    setCodingTasks((current) => {
      const existing = current.find((item) => item.title === title);
      if (existing) {
        return current.map((item) => (item.id === existing.id ? { ...item, status } : item));
      }
      return [
        {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          filePath,
          mode: 'fix',
          status,
        },
        ...current,
      ];
    });
  }

  async function focusSelfImproveTarget() {
    const filePath = (activeSelfImproveTask?.filePath || selfImproveTargetFile).trim();
    if (!filePath) return;
    if (editorFilePath === filePath && editorContent.trim()) return;
    await openFileInEditor(filePath).catch(() => null);
  }

  async function loadSelfImproveRepairStep(summary: string, source = 'self-improve') {
    ensureSelfImproveTask('in_progress');
    await focusSelfImproveTarget();
    const filePath = (activeSelfImproveTask?.filePath || selfImproveTargetFile).trim();
    const prompt =
      `A self-improvement agent run returned a blocker.\nSummary: ${summary}\n` +
      `${filePath ? `Target file: ${filePath}\n` : ''}` +
      `${selfImproveBrief ? `Current self-improvement brief:\n${selfImproveBrief.details}\n\n` : ''}` +
      'Explain the root cause, identify the smallest safe fix, and prepare the next patch.';
    recordSelfImproveRun('brief', 'Loaded the next self-improvement repair step.', summary, source);
    injectCommand(prompt);
    setWorkbenchNotice(
      filePath
        ? `Self-improvement blocker detected. Repair prompt loaded for ${filePath}.`
        : 'Self-improvement blocker detected. Repair prompt loaded into the command deck.',
    );
  }

  function primeSelfImproveValidation(source = 'self-improve') {
    if (workspaceChecks?.checks?.[0]) {
      ensureSelfImproveTask('in_progress');
      recordSelfImproveRun(
        'check',
        'Primed the next validation step for the self-improvement mission.',
        workspaceChecks.checks[0].command,
        source,
      );
      stageSuggestedCommand(workspaceChecks.checks[0].command);
      setWorkbenchNotice(`Self-improvement outcome received. Next validation check loaded: ${workspaceChecks.checks[0].label}.`);
      return true;
    }
    return false;
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

  function canSpeakForPurpose(purpose: 'digest' | 'announcement' | 'reply') {
    if (!canAutoSpeak) return false;
    const now = Date.now();
    const sinceSpeech = now - lastSpeechDetectedAtRef.current;
    const sincePlayback = now - lastVoicePlaybackAtRef.current;
    if (purpose === 'reply') {
      return sinceSpeech >= 1200 && sincePlayback >= 1500;
    }
    if (hudSpeechTelemetry.noiseFloor >= 0.014) return false;
    return sinceSpeech >= 2200 && sincePlayback >= 2600;
  }

  function stopHudSpeechPlayback() {
    const audio = audioElementRef.current;
    if (audio) {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // Ignore media reset issues from interrupted blobs.
      }
    }
    audioElementRef.current = null;
    setVoicePlaybackActive(false);
  }

  async function playHudSpeech(text: string, purpose: 'digest' | 'announcement' | 'reply' = 'reply') {
    if (!speechProfile || !canSpeakForPurpose(purpose)) return false;
    const spoken = buildSpokenLine(text, purpose);
    if (!spoken) return false;
    let speed = voicePersona.speed;
    if (purpose === 'digest') speed = Math.max(0.8, speed - 0.05);
    else if (purpose === 'announcement') speed = Math.max(0.82, speed - 0.03);
    if (hudSpeechTelemetry.noiseFloor >= 0.01) speed = Math.min(1.08, speed + 0.03);
    const blob = await synthesizeSpeech({
      text: spoken,
      backend: speechProfile.reply_backend,
      voice_id: speechProfile.reply_voice_id,
      speed,
      output_format: 'wav',
    });
    stopHudSpeechPlayback();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = URL.createObjectURL(blob);
    audioUrlRef.current = url;
    const audio = new Audio(url);
    audio.onended = () => {
      if (audioElementRef.current === audio) {
        audioElementRef.current = null;
        setVoicePlaybackActive(false);
      }
    };
    audio.onpause = () => {
      if (audioElementRef.current === audio && audio.ended === false) {
        audioElementRef.current = null;
        setVoicePlaybackActive(false);
      }
    };
    audioElementRef.current = audio;
    setVoicePlaybackActive(true);
    lastVoicePlaybackAtRef.current = Date.now();
    await audio.play().catch(() => {
      if (audioElementRef.current === audio) {
        audioElementRef.current = null;
      }
      setVoicePlaybackActive(false);
    });
    return true;
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
      setVisionSignals(null);
      setVisionTextExtraction(null);
      setVisionSuggestedActions(null);
      setVisionUiTargets(null);
      setVisionUiPlan(null);
      setVisionUiVerify(null);
      setVisionQuery(null);
      setVisionQuestion('');
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
      setVisionSignals(null);
      setVisionTextExtraction(null);
      setVisionSuggestedActions(null);
      setVisionUiTargets(null);
      setVisionUiPlan(null);
      setVisionUiVerify(null);
      setVisionQuery(null);
      setVisionQuestion('');
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

  async function selectDocumentFiles() {
    if (typeof document === 'undefined') {
      setWorkbenchNotice('Document upload is not available in this environment.');
      return;
    }
    const files = await new Promise<File[]>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = '.txt,.md,.pdf,.docx,.csv,.tsv,.xlsx,.pptx';
      input.onchange = () => resolve(Array.from(input.files || []));
      input.click();
    });
    if (!files.length) {
      setWorkbenchNotice('Document upload cancelled.');
      return;
    }
    setDocumentFiles(files);
    setDocumentAnalysis(null);
    setWorkbenchNotice(`Loaded ${files.length} document${files.length === 1 ? '' : 's'} for analysis.`);
  }

  async function analyzeCurrentDocuments() {
    if (!documentFiles.length) {
      setWorkbenchNotice('Upload one or more documents first.');
      return;
    }
    setDocumentBusy(true);
    try {
      const result = await analyzeDocumentFiles({
        files: documentFiles,
        mode: documentAnalysisMode,
        title: documentAnalysisTitle.trim() || undefined,
      });
      setDocumentAnalysis(result);
      setWorkbenchNotice(`Document analysis ready in ${documentAnalysisMode.replace('_', ' ')} mode.`);
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Document analysis failed.');
    } finally {
      setDocumentBusy(false);
    }
  }

  async function saveDocumentBrief() {
    if (!documentBrief || !documentAnalysis) {
      setWorkbenchNotice('Build a document analysis first.');
      return;
    }
    try {
      const next = await updateOperatorDocumentBrief({
        label: documentBrief.title,
        mode: documentAnalysis.mode,
        summary: documentBrief.summary,
        details: documentBrief.details,
        created_at: new Date().toISOString(),
      });
      setDurableOperatorMemory(next);
      void rememberLearningExperience({
        label: documentBrief.title,
        domain: 'document',
        context_key: documentAnalysis.files.join(','),
        outcome_type: 'success',
        summary: documentBrief.summary,
        lesson: documentBrief.details.split('\n').slice(0, 3).join(' '),
        reuse_hint: 'Reuse this document mode and summary structure when similar files or review tasks appear again.',
        tags: ['document', documentAnalysis.mode],
      }).catch(() => null);
      setWorkbenchNotice('Document brief saved to durable memory.');
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to save document brief.');
    }
  }

  async function saveFivemBrief() {
    if (!fivemCodingBrief) {
      setWorkbenchNotice('Build a FiveM or Lua brief first.');
      return;
    }
    try {
      const next = await updateOperatorFivemBrief({
        label: fivemCodingBrief.title,
        resource_key: fivemCodingBrief.resourceKey,
        framework: fivemCodingBrief.framework,
        topology: fivemCodingBrief.topology,
        summary: fivemCodingBrief.summary,
        details: fivemCodingBrief.details,
        native_families: fivemCodingBrief.nativeFamilies,
        risk_tags: fivemCodingBrief.riskTags,
        created_at: new Date().toISOString(),
      });
      setDurableOperatorMemory(next);
      setWorkbenchNotice('FiveM brief saved to durable memory.');
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to save FiveM brief.');
    }
  }

  async function rememberLearningExperience(body: {
    label: string;
    domain: string;
    context_key?: string;
    outcome_type?: string;
    summary: string;
    lesson?: string;
    reuse_hint?: string;
    tags?: string[];
  }) {
    const key = [
      body.domain,
      body.context_key || '',
      body.outcome_type || 'lesson',
      body.summary,
      body.lesson || '',
    ].join('::');
    if (lastLearningRecordRef.current === key) return durableOperatorMemory;
    lastLearningRecordRef.current = key;
    try {
      const next = await updateOperatorLearningExperience({
        ...body,
        created_at: new Date().toISOString(),
      });
      setDurableOperatorMemory(next);
      return next;
    } catch (error) {
      lastLearningRecordRef.current = '';
      throw error;
    }
  }

  async function noteLearningReuse(items: Array<{ id: string }>) {
    const ids = Array.from(new Set(items.map((item) => item.id?.trim()).filter(Boolean)));
    if (!ids.length) return;
    try {
      const next = await markOperatorLearningExperiencesReused(ids, new Date().toISOString());
      setDurableOperatorMemory(next);
    } catch {
      // Keep reuse tracking best-effort so prompts and handoffs never fail on memory bookkeeping.
    }
  }

  async function exportCurrentDocumentAnalysis(format: 'docx' | 'xlsx' | 'txt') {
    if (!documentAnalysis || !documentBrief) {
      setWorkbenchNotice('Build a document analysis first.');
      return;
    }
    try {
      const blob = await exportDocumentAnalysis({
        title: documentBrief.title,
        mode: documentAnalysis.mode,
        content: documentAnalysis.content,
        format,
      });
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `${documentBrief.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'document-intel'}.${format}`;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setWorkbenchNotice(`Document analysis exported as ${format.toUpperCase()}.`);
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to export document analysis.');
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
      if (next.status === 'client_action_required' || next.intent.client_action === 'capture_screen_targets') {
        const captured = await captureScreenSnapshot();
        if (captured) {
          await extractVisualUiTargets();
        }
      }
      if (next.status === 'client_action_required' || next.intent.client_action === 'capture_screens_targets') {
        const first = await captureScreenSnapshot('Screen 1');
        if (first) {
          setWorkbenchNotice('First screen captured. Use Add Screen for the rest of your setup, then click Find UI Targets.');
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
      if (next.status === 'client_action_required' || next.intent.client_action === 'upload_image_targets') {
        const uploaded = await uploadVisualSnapshot();
        if (uploaded) {
          await extractVisualUiTargets();
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
      setVisionSignals(null);
      setVisionTextExtraction(null);
      setVisionSuggestedActions(null);
      setVisionUiTargets(null);
      setVisionUiPlan(null);
      setVisionUiVerify(null);
      setVisionQuery(null);
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
      setVisionSignals(null);
      setVisionTextExtraction(null);
      setVisionSuggestedActions(null);
      setVisionUiTargets(null);
      setVisionUiPlan(null);
      setVisionUiVerify(null);
      setVisionQuery(null);
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
      setVisionSignals(null);
      setVisionTextExtraction(null);
      setVisionSuggestedActions(null);
      setVisionUiTargets(null);
      setVisionUiPlan(null);
      setVisionUiVerify(null);
      setVisionQuery(null);
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
      setVisionSignals(null);
      setVisionSuggestedActions(null);
      setVisionUiTargets(null);
      setVisionUiPlan(null);
      setVisionUiVerify(null);
      setVisionQuery(null);
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
      setVisionSignals(null);
      setVisionSuggestedActions(null);
      setVisionUiTargets(null);
      setVisionUiPlan(null);
      setVisionUiVerify(null);
      setVisionQuery(null);
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

  async function rememberVisionResult() {
    const source = visionAnalysis?.content?.trim() || visionTextExtraction?.content?.trim() || '';
    if (!source) {
      setWorkbenchNotice('Run analysis or text extraction first.');
      return;
    }
    setIntentBusy('run');
    try {
      const label = screenSnapshot?.label || 'visual result';
      const next = await executeJarvisIntent(`Remember ${label}: ${source}`);
      setIntentPreview(next.intent);
      setIntentExecution(next);
      const memory = await fetchOperatorMemory().catch(() => null);
      if (memory) setDurableOperatorMemory(memory);
      setWorkbenchNotice('Vision result saved to memory.');
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to remember vision result.');
    } finally {
      setIntentBusy(null);
    }
  }

  async function saveVisualBrief() {
    if (!visualBrief) {
      setWorkbenchNotice('Build a visual brief first.');
      return;
    }
    try {
      const memory = await updateOperatorVisualBrief({
        label: visualBrief.title,
        summary: visualBrief.summary,
        details: visualBrief.details,
        created_at: new Date().toISOString(),
      });
      setDurableOperatorMemory(memory);
      void rememberLearningExperience({
        label: visualBrief.title,
        domain: 'visual',
        context_key: screenSnapshot?.label || screenDeck[0]?.label || visualBrief.title,
        outcome_type: 'success',
        summary: visualBrief.summary,
        lesson: visualBrief.details.split('\n').slice(0, 3).join(' '),
        reuse_hint: 'Reuse these visual signals and next-action cues when similar screen state appears again.',
        tags: ['visual', 'brief'],
      }).catch(() => null);
      setWorkbenchNotice('Visual brief saved to durable memory.');
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to save visual brief.');
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
      setVisionSignals(null);
      setVisionUiTargets(null);
      setVisionUiPlan(null);
      setVisionUiVerify(null);
      setVisionQuery(null);
      setWorkbenchNotice(`Visual action suggestions ready${result.actions.length ? ` (${result.actions.length})` : ''}.`);
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Vision action suggestions failed.');
    } finally {
      setVisionBusy(false);
    }
  }

  async function extractVisualSignals() {
    if (!screenDeck.length) {
      setWorkbenchNotice('Capture at least one screen first.');
      return;
    }
    setVisionBusy(true);
    try {
      const result = await extractVisionSignals({
        images: screenDeck.map((item) => ({
          image_data_url: item.dataUrl,
          label: item.label,
        })),
        note: screenContextNote.trim() || undefined,
        label: screenDeck.length > 1 ? 'Multi-Screen Session' : screenDeck[0].label,
      });
      setVisionSignals(result);
      setVisionAnalysis(null);
      setVisionTextExtraction(null);
      setVisionSuggestedActions(null);
      setVisionUiTargets(null);
      setVisionUiPlan(null);
      setVisionUiVerify(null);
      setVisionQuery(null);
      setWorkbenchNotice('Visual signals extracted.');
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Vision signal extraction failed.');
    } finally {
      setVisionBusy(false);
    }
  }

  async function extractVisualUiTargets() {
    if (!screenDeck.length) {
      setWorkbenchNotice('Capture at least one screen first.');
      return;
    }
    setVisionBusy(true);
    try {
      const result = await extractVisionUiTargets({
        images: screenDeck.map((item) => ({
          image_data_url: item.dataUrl,
          label: item.label,
        })),
        note: screenContextNote.trim() || undefined,
        label: screenDeck.length > 1 ? 'Multi-Screen Session' : screenDeck[0].label,
      });
      setVisionUiTargets(result);
      setVisionAnalysis(null);
      setVisionSignals(null);
      setVisionTextExtraction(null);
      setVisionSuggestedActions(null);
      setVisionUiPlan(null);
      setVisionUiVerify(null);
      setVisionQuery(null);
      setWorkbenchNotice(`UI targets extracted${result.targets.length ? ` (${result.targets.length})` : ''}.`);
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Vision UI target extraction failed.');
    } finally {
      setVisionBusy(false);
    }
  }

  async function planVisualUiTarget(target: VisionUiTargetsResult['targets'][number]) {
    if (!screenDeck.length) {
      setWorkbenchNotice('Capture at least one screen first.');
      return;
    }
    setVisionBusy(true);
    try {
      const result = await planVisionUiAction({
        images: screenDeck.map((item) => ({
          image_data_url: item.dataUrl,
          label: item.label,
        })),
        target_label: target.label,
        target_detail: target.detail,
        control_type: target.control_type,
        note: screenContextNote.trim() || undefined,
        label: screenDeck.length > 1 ? 'Multi-Screen Session' : screenDeck[0].label,
      });
      setVisionUiPlan(result);
      setWorkbenchNotice(`Interaction plan ready for ${target.label}.`);
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Vision UI planning failed.');
    } finally {
      setVisionBusy(false);
    }
  }

  async function verifyVisualUiTarget(target: VisionUiTargetsResult['targets'][number]) {
    if (!screenDeck.length) {
      setWorkbenchNotice('Capture at least one screen first.');
      return;
    }
    setVisionBusy(true);
    try {
      const result = await verifyVisionUiTarget({
        images: screenDeck.map((item) => ({
          image_data_url: item.dataUrl,
          label: item.label,
        })),
        target_label: target.label,
        target_detail: target.detail,
        control_type: target.control_type,
        desktop_intent: target.desktop_intent,
        note: screenContextNote.trim() || undefined,
        label: screenDeck.length > 1 ? 'Multi-Screen Session' : screenDeck[0].label,
      });
      setVisionUiVerify(result);
      setWorkbenchNotice(`Verification ready for ${target.label}.`);
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Vision UI verification failed.');
    } finally {
      setVisionBusy(false);
    }
  }

  async function askVisualQuestion() {
    const question = visionQuestion.trim();
    const activeVisualLabel = screenDeck.length > 1 ? 'Multi-Screen Session' : screenDeck[0]?.label || 'Screen';
    const recentVisualHistory =
      durableOperatorMemory?.visual_insights
        ?.filter((item) => item.label === activeVisualLabel)
        .slice(0, 3)
        .map((item) => ({
          question: item.question,
          answer: item.answer,
        })) || [];
    if (!screenDeck.length) {
      setWorkbenchNotice('Capture at least one screen first.');
      return;
    }
    if (!question) {
      setWorkbenchNotice('Ask a visual question first.');
      return;
    }
    setVisionBusy(true);
    try {
      const result = await queryVision({
        images: screenDeck.map((item) => ({
          image_data_url: item.dataUrl,
          label: item.label,
        })),
        question,
        note: screenContextNote.trim() || undefined,
        label: activeVisualLabel,
        history: recentVisualHistory,
      });
      setVisionQuery(result);
      const memory = await updateOperatorVisualInsight({
        label: activeVisualLabel,
        question,
        answer: result.answer,
        created_at: new Date().toISOString(),
      }).catch(() => null);
      if (memory) setDurableOperatorMemory(memory);
      setWorkbenchNotice(
        result.history_used
          ? `Visual answer ready with ${result.history_used} recent context item${result.history_used === 1 ? '' : 's'}.`
          : 'Visual answer ready.',
      );
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Visual question answering failed.');
    } finally {
      setVisionBusy(false);
    }
  }

  async function stageVisualDesktopIntent(command: string) {
    if (!command.trim()) {
      setWorkbenchNotice('This visual action does not include a direct desktop command.');
      return;
    }
    setIntentBusy('run');
    try {
      const next = await executeJarvisIntent(command);
      setIntentPreview(next.intent);
      setIntentExecution(next);
      if (next.result.pending || next.result.history) {
        setWorkbench((current) => ({
          pending: next.result.pending ?? current?.pending ?? null,
          history: next.result.history ?? current?.history ?? [],
          default_working_dir: next.result.default_working_dir ?? current?.default_working_dir ?? workbenchDirectory,
        }));
      }
      setWorkbenchNotice(next.message);
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to stage visual desktop action.');
    } finally {
      setIntentBusy(null);
    }
  }

  useEffect(() => {
    if (!visionAnalysis?.content.trim()) return;
    const firstLine = visionAnalysis.content.split('\n').find((line) => line.trim()) || '';
    if (!firstLine) return;
    setVoiceNotice(`Visual analysis ready: ${firstLine}`);
  }, [visionAnalysis?.content]);

  function interruptAssistantOutput(reason?: string) {
    stopHudSpeechPlayback();
    window.dispatchEvent(new Event('jarvis:interrupt-stream'));
    void interruptVoiceLoop(reason).then(setVoiceLoop).catch(() => {});
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
    mode: 'inspect' | 'debug' | 'review' | 'refactor' | 'logic',
  ) {
    void noteLearningReuse(codingLearningContext);
    const learningContext = codingLearningContext.length
      ? `\nRecent learned lessons:\n${codingLearningContext
          .map(
            (item, index) =>
              `${index + 1}. [${item.domain}/${item.outcome_type}] ${item.summary}${item.outcome_type === 'anti-pattern' ? '\nAvoid: Do not repeat this pattern unless the surrounding constraints have clearly changed.' : ''}${item.lesson ? `\nLesson: ${item.lesson}` : ''}${item.reuse_hint ? `\nReuse hint: ${item.reuse_hint}` : ''}`,
          )
          .join('\n\n')}`
      : '';
    const projectContext = currentProjectMemory
      ? `\nKnown project focus: ${currentProjectMemory.focus || 'none'}\nProject status: ${currentProjectMemory.status || 'unknown'}\nNext step: ${currentProjectMemory.next_step || 'not recorded'}\nProject notes: ${currentProjectMemory.notes || 'none'}`
      : '';
    const prompts = {
      inspect:
        `Act as my repository copilot. Inspect the current project state, identify the most important active area, summarize risks, and propose the next concrete step.${projectContext}${learningContext}`,
      debug:
        `Act as my debugging copilot. Inspect the current repo state, identify the most likely failure points, propose a short diagnostic plan, and only then suggest the first safe fix.${projectContext}${learningContext}`,
      review:
        `Act as my code reviewer. Focus on bugs, regressions, missing tests, and risky behavior. Start with the highest-severity findings and keep summaries brief.${projectContext}${learningContext}`,
      refactor:
        `Act as my refactoring copilot. Identify one safe, high-value cleanup that improves maintainability without changing intended behavior, then propose the smallest implementation plan.${projectContext}${learningContext}`,
      logic:
        `Act as my logic reviewer. Focus on control flow, hidden assumptions, invalid state transitions, nil/undefined handling, race conditions, event ordering, and places where the code can silently do the wrong thing.${projectContext}${learningContext}`,
    } as const;
    injectCommand(prompts[mode]);
    setWorkbenchNotice(
      mode === 'inspect'
        ? 'Repository inspection prompt loaded.'
        : mode === 'debug'
        ? 'Debug prompt loaded.'
        : mode === 'review'
        ? 'Review prompt loaded.'
        : mode === 'logic'
        ? 'Logic audit prompt loaded.'
        : 'Refactor prompt loaded.',
    );
  }

  function loadFivemCodingPrompt(
    mode:
      | 'fivem-review'
      | 'lua-logic'
      | 'native-usage'
      | 'native-reference'
      | 'event-flow'
      | 'state-audit'
      | 'console-debug'
      | 'server-structure'
      | 'resource-architecture'
      | 'fivem-security'
      | 'qbcore-review'
      | 'esx-review'
      | 'ox-review'
      | 'topology-review',
  ) {
    void noteLearningReuse(fivemLearningContext);
    const changedFiles = (workspaceSummary?.changed_files || []).slice(0, 8).join(', ') || 'None';
    const learningContext = fivemLearningContext.length
      ? `Recent learned FiveM lessons\n${fivemLearningContext
          .map(
            (item, index) =>
              `${index + 1}. [${item.outcome_type}] ${item.summary}${item.outcome_type === 'anti-pattern' ? '\nAvoid: Treat this as a known risky FiveM pattern and only proceed if you can justify the exception.' : ''}${item.lesson ? `\nLesson: ${item.lesson}` : ''}${item.reuse_hint ? `\nReuse hint: ${item.reuse_hint}` : ''}`,
          )
          .join('\n\n')}`
      : '';
    const context = [
      `Repo root: ${workspaceSummary?.root || 'Unknown'}`,
      `Current file: ${editorFilePath || 'None loaded'}`,
      `Changed files: ${changedFiles}`,
      currentProjectMemory
        ? `Project context\nFocus: ${currentProjectMemory.focus || 'None'}\nStatus: ${currentProjectMemory.status || 'Unknown'}\nNext step: ${currentProjectMemory.next_step || 'None'}\nNotes: ${currentProjectMemory.notes || 'None'}`
        : '',
      learningContext,
      fivemCodingBrief
        ? `FiveM/Lua intel\n${fivemCodingBrief.details}\nCanon summary: ${fivemCodingBrief.canonSummary}\nCanon priorities: ${fivemCodingBrief.canonPriorities.join('; ')}\nCanon watchouts: ${fivemCodingBrief.canonWatchouts.join('; ')}\nExploit patterns: ${fivemCodingBrief.canonExploitPatterns.join('; ')}\nConsole checks: ${fivemCodingBrief.canonConsoleChecks.join('; ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    const prompts = {
      'fivem-review':
        `Act as a senior FiveM script reviewer.\n${context}\n\nReview this resource for client/server boundary mistakes, unsafe network events, native misuse, framework coupling, missing validation, and likely gameplay regressions. Start with the highest-severity findings.`,
      'lua-logic':
        `Act as a senior Lua engineer.\n${context}\n\nAudit the logic carefully for invalid state flow, nil handling, hidden assumptions, return-value misuse, event sequencing issues, and maintainability risks. Prefer concrete bug risks over style comments.`,
      'native-usage':
        `Act as a FiveM native and gameplay-systems specialist.\n${context}\n\nReview all likely native usage patterns, entity ownership assumptions, ped/vehicle/object lifecycle handling, and whether the script is using the safest and clearest native patterns for production gameplay code.`,
      'native-reference':
        `Act as a FiveM native reference guide and gameplay systems reviewer.\n${context}\n\nGroup the detected native families, explain what each family is likely doing in this resource, call out the main misuse risks, and list the safest review checkpoints before editing the script.`,
      'event-flow':
        `Act as a FiveM event-flow reviewer.\n${context}\n\nTrace the likely client, server, shared, and NUI event flow. Identify trust-boundary mistakes, missing validation, duplicated responsibility, and places where the wrong side of the resource appears to own the logic.`,
      'state-audit':
        `Act as a senior Lua gameplay engineer.\n${context}\n\nAudit shared state, state bag usage, lifecycle ordering, cache invalidation, and nil/undefined risk. Focus on logic bugs and desync risks instead of style commentary.`,
      'console-debug':
        `Act as a FiveM runtime debugging specialist.\n${context}\n\nAssume this needs to be debugged from the FiveM server/client console first. Identify the most likely runtime failures, the log lines or console symptoms to inspect, the safest debug sequence, and the first low-risk instrumentation step before editing code.`,
      'server-structure':
        `Act as a FiveM server structure reviewer.\n${context}\n\nMap the likely server.cfg/runtime configuration, resource ensure/start order, dependency wiring, framework boot order, and shared/client/server initialization flow. Point out brittle startup assumptions and the safest structural fixes.`,
      'resource-architecture':
        `Act as a FiveM resource architect.\n${context}\n\nReview resource structure, fxmanifest or __resource organization, shared/client/server separation, exports, callbacks, NUI boundaries, and dependency layout. Propose the safest architectural improvements without breaking behavior.`,
      'fivem-security':
        `Act as a FiveM security reviewer.\n${context}\n\nAudit for exploit risks, client-trust mistakes, insecure event handlers, missing permission checks, unsanitized payloads, item/money/state abuse risks, and weak server authority. Prioritize real abuse paths.`,
      'qbcore-review':
        `Act as a senior QBCore reviewer.\n${context}\n\nReview this script for QBCore-specific coupling, exports, player object usage, callback flow, item/money/state handling, and common framework migration or exploit mistakes.`,
      'esx-review':
        `Act as a senior ESX reviewer.\n${context}\n\nReview this script for ESX-specific patterns, shared object usage, callback flow, job/account/item handling, and common framework misuse or fragile assumptions.`,
      'ox-review':
        `Act as an ox_* ecosystem reviewer.\n${context}\n\nReview this script for ox_lib, ox_target, ox_inventory, oxmysql, and related usage. Focus on API correctness, callback/events, UI integration, targeting flow, and dependency assumptions.`,
      'topology-review':
        `Act as a FiveM resource topology reviewer.\n${context}\n\nMap the resource topology across client, server, shared, and NUI surfaces. Identify misplaced logic, insecure trust boundaries, duplicated state, and the safest restructuring order.`,
    } as const;
    injectCommand(prompts[mode]);
    setWorkbenchNotice(
      mode === 'fivem-review'
        ? 'FiveM review prompt loaded.'
        : mode === 'lua-logic'
        ? 'Lua logic prompt loaded.'
        : mode === 'native-usage'
        ? 'FiveM native-usage prompt loaded.'
        : mode === 'native-reference'
        ? 'FiveM native reference prompt loaded.'
        : mode === 'event-flow'
        ? 'FiveM event-flow prompt loaded.'
        : mode === 'state-audit'
        ? 'FiveM state-audit prompt loaded.'
        : mode === 'console-debug'
        ? 'FiveM console-debug prompt loaded.'
        : mode === 'server-structure'
        ? 'FiveM server-structure prompt loaded.'
        : mode === 'resource-architecture'
        ? 'FiveM resource-architecture prompt loaded.'
        : mode === 'qbcore-review'
        ? 'QBCore review prompt loaded.'
        : mode === 'esx-review'
        ? 'ESX review prompt loaded.'
        : mode === 'ox-review'
        ? 'ox_* review prompt loaded.'
        : mode === 'topology-review'
        ? 'Resource topology prompt loaded.'
        : 'FiveM security prompt loaded.',
    );
  }

  function loadDesignPrompt(
    mode: 'critique' | 'system' | 'creative' | 'implementation' | 'screen-audit' | 'scorecard',
  ) {
    const archetype = getDesignArchetype(operatorProfile.hudArchetype);
    const fallbackSections = [
      `HUD archetype: ${archetype.label}`,
      `Canon summary: ${archetype.summary}`,
      `Design canon principles: ${archetype.principles.join('; ')}`,
      `Watchouts: ${archetype.watchouts.join('; ')}`,
      operatorProfile.designInfluences.trim()
        ? `Design influences: ${operatorProfile.designInfluences.trim()}`
        : '',
      operatorProfile.referenceInterfaces.trim()
        ? `Reference interfaces: ${operatorProfile.referenceInterfaces.trim()}`
        : '',
      operatorProfile.designStyle.trim() ? `Preferred design style: ${operatorProfile.designStyle.trim()}` : '',
      operatorProfile.designGoals.trim() ? `Design goals: ${operatorProfile.designGoals.trim()}` : '',
      currentProjectMemory
        ? `Project context\nFocus: ${currentProjectMemory.focus || 'None'}\nStatus: ${currentProjectMemory.status || 'Unknown'}\nNext step: ${currentProjectMemory.next_step || 'None'}`
        : '',
    ].filter(Boolean);
    const fallbackBase = fallbackSections.join('\n\n');
    const prompt =
      mode === 'critique'
        ? designBrief?.critiquePrompt ||
          `Act as a senior product designer and critique the current interface or concept.\n${fallbackBase}\n\nFocus on hierarchy, clarity, usability, whether the work matches the archetype, and the highest-value improvement.`
        : mode === 'system'
        ? designBrief?.systemPrompt ||
          `Act as a design systems lead.\n${fallbackBase}\n\nDefine reusable principles, components, typography, color, motion, and HUD-specific layout rules.`
        : mode === 'creative'
        ? designBrief?.creativePrompt ||
          `Act as a creative frontend design partner.\n${fallbackBase}\n\nPropose a more distinctive visual direction while keeping usability strong and preserving a premium game-menu or command-deck feel.`
        : mode === 'screen-audit'
        ? designBrief?.screenAuditPrompt ||
          `Act as a principal UI/UX reviewer for premium HUDs, game menus, and desktop command surfaces.\n${fallbackBase}\n\nAudit the current interface for hierarchy, readability, panel balance, state communication, and premium feel. Name the top 3 changes that would most improve the HUD.`
        : mode === 'scorecard'
        ? designBrief?.scorecardPrompt ||
          `Act as a principal UI/UX design reviewer.\n${fallbackBase}\n\nCreate a HUD scorecard for hierarchy, readability, distinctiveness, density discipline, motion discipline, and operator trust. Give each category a score out of 10 and the top corrective moves.`
        : designBrief?.implementationPrompt ||
          `Act as a frontend design engineer.\n${fallbackBase}\n\nTranslate the current design direction into concrete implementation guidance, HUD-state behavior, and a safe build order.`;
    injectCommand(prompt);
    setWorkbenchNotice(
      mode === 'critique'
        ? 'Design critique prompt loaded.'
        : mode === 'system'
        ? 'Design system prompt loaded.'
        : mode === 'creative'
        ? 'Creative direction prompt loaded.'
        : mode === 'screen-audit'
        ? 'Screen audit prompt loaded.'
        : mode === 'scorecard'
        ? 'HUD scorecard prompt loaded.'
        : 'Design implementation prompt loaded.',
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
    setWorkbenchBusy('prepare');
    try {
      const prepared = await prepareWorkspaceCommit(message);
      if (!gitCommitMessage.trim()) {
        setGitCommitMessage(prepared.message);
      }
      setWorkbenchDirectory(prepared.root);
      setWorkbenchCommand(prepared.command);
      setWorkbenchNotice(
        prepared.ready
          ? notice
          : `Commit command prepared with caution: ${prepared.changed_count} changed file(s), ${prepared.staged_count} staged, ${prepared.unstaged_count} unstaged.`,
      );
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to prepare commit command.');
    } finally {
      setWorkbenchBusy(null);
    }
  }

  async function loadPreparedCommitCommand() {
    await prepareCommitCommand(gitCommitMessage.trim());
  }

  async function loadPreparedStageCommand() {
    setWorkbenchBusy('prepare');
    try {
      const prepared = await prepareWorkspaceStage();
      setWorkbenchDirectory(prepared.root);
      setWorkbenchCommand(prepared.command);
      setWorkbenchNotice(
        prepared.ready
          ? prepared.message || 'Stage command prepared for the active workspace repo.'
          : prepared.message || 'No working tree changes detected.',
      );
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to prepare stage command.');
    } finally {
      setWorkbenchBusy(null);
    }
  }

  async function loadPreparedPushCommand() {
    setWorkbenchBusy('prepare');
    try {
      const prepared = await prepareWorkspacePush();
      setWorkbenchDirectory(prepared.root);
      setWorkbenchCommand(prepared.command);
      setWorkbenchNotice(
        prepared.ready
          ? `Push command prepared for ${prepared.branch}.`
          : prepared.blocked_reason || 'Push command is not ready yet for this repository.',
      );
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to prepare push command.');
    } finally {
      setWorkbenchBusy(null);
    }
  }

  async function handleStageCodingVerification(command?: string) {
    setWorkbenchBusy('prepare');
    try {
      const staged = await stageCodingVerification(command ? { command } : undefined);
      setCodingWorkspace(staged.coding);
      setWorkbench(staged.workbench);
      const selectedCommand =
        staged.workbench.pending?.command ||
        command ||
        pendingCodeEdit?.verification?.suggested_checks?.[0] ||
        'verification command';
      setWorkbenchNotice(`Verification staged: ${selectedCommand}`);
    } catch (error) {
      setWorkbenchNotice(error instanceof Error ? error.message : 'Unable to stage patch verification.');
    } finally {
      setWorkbenchBusy(null);
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
      `Open tasks:\n${taskLines || 'None'}` +
      `${visualBrief ? `\n\nVisual intelligence:\n${visualBrief.details}` : ''}`
    );
  }

  function buildArchitectureHandoffBrief() {
    const trimmedIntent = intentCommand.trim();
    return buildCommanderHandoffBrief({
      trimmedIntent,
      visualBrief: visualBrief ? { title: visualBrief.title, details: visualBrief.details } : null,
      commanderQueue,
      commanderBrief,
      screenContextNote,
    });
  }

  function buildLearningContextForSource(source: string) {
    const normalized = source.trim().toLowerCase();
    const currentFile =
      latestCodeResult?.file_path ||
      editorFilePath ||
      nextReviewQueueItem?.filePath ||
      workspaceSummary?.changed_files?.[0] ||
      '';
    const currentResourceKey = fivemCodingBrief?.resourceKey || '';
    return (durableOperatorMemory?.learning_experiences || [])
      .filter((item) => {
        const domain = (item.domain || '').toLowerCase();
        const contextKey = item.context_key || '';
        if (normalized.startsWith('fivem')) {
          return (domain === 'fivem' || domain === 'coding') && (!currentResourceKey || !contextKey || contextKey === currentResourceKey);
        }
        if (normalized.startsWith('design')) {
          return domain === 'design';
        }
        if (normalized.startsWith('self-improve') || normalized.includes('coding')) {
          return ['coding', 'self-improve', 'fivem'].includes(domain) && (!currentFile || !contextKey || contextKey === currentFile);
        }
        if (normalized.startsWith('visual')) {
          return domain === 'visual' || domain === 'design';
        }
        if (normalized.startsWith('document')) {
          return domain === 'document';
        }
        if (
          normalized.startsWith('commercial') ||
          normalized.startsWith('sales') ||
          normalized.startsWith('customer') ||
          normalized.startsWith('shopify')
        ) {
          return ['commercial', 'sales', 'customer', 'shopify'].includes(domain);
        }
        return true;
      })
      .sort(
        (left, right) =>
          ((right.confidence || 0) - (left.confidence || 0)) ||
          ((right.use_count || 0) - (left.use_count || 0)) ||
          ((right.created_at || '').localeCompare(left.created_at || '')),
      )
      .slice(0, 4);
  }

  async function handoffWithBrief(brief: string, source = 'hud') {
    const cleanedBrief = brief.trim();
    if (!cleanedBrief) {
      setAgentNotice('There is no current command, visual brief, or queue item to hand off.');
      return;
    }
    const learningItems = buildLearningContextForSource(source);
    const enrichedBrief = learningItems.length
      ? `${cleanedBrief}\n\nRecent learned lessons\n${learningItems
          .map(
            (item, index) =>
              `${index + 1}. [${item.domain}/${item.outcome_type}] ${item.summary}${item.lesson ? `\nLesson: ${item.lesson}` : ''}${item.reuse_hint ? `\nReuse hint: ${item.reuse_hint}` : ''}`,
          )
          .join('\n\n')}`
      : cleanedBrief;
    void noteLearningReuse(learningItems);
    setArchitectureBusy(true);
    setAgentNotice('');
    if (source.startsWith('self-improve')) {
      recordSelfImproveRun('route', 'Self-improvement brief routed to planner and executor.', enrichedBrief, source);
    }
    try {
      const next = await handoffAgentArchitecture(enrichedBrief, source);
      setAgentArchitecture(next);
      const plannerAgentId = next.handoff?.planner?.agent_id;
      const executorAgentId = next.handoff?.executor?.agent_id;
      if (plannerAgentId) {
        await runManagedAgent(plannerAgentId).catch(() => null);
      }
      if (executorAgentId) {
        await runManagedAgent(executorAgentId).catch(() => null);
      }
      const refreshed = await fetchAgentArchitectureStatus().catch(() => null);
      if (refreshed) setAgentArchitecture(refreshed);
      const plannerTaskId = next.handoff?.planner?.task_id;
      const executorTaskId = next.handoff?.executor?.task_id;
      setAgentNotice(
        `Planner delegated the current brief to the executor${plannerTaskId || executorTaskId ? ` (planner ${plannerTaskId || 'queued'}, executor ${executorTaskId || 'queued'})` : ''}${learningItems.length ? ` with ${learningItems.length} learned hint${learningItems.length === 1 ? '' : 's'}` : ''}.`,
      );
    } catch (error) {
      setAgentNotice(error instanceof Error ? error.message : 'Unable to create planner handoff.');
    } finally {
      setArchitectureBusy(false);
    }
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
    setActionAccountKey(item.account_key || '');
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
    setActionAccountKey(item.account_key || '');
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
    setActionAccountKey(item.account_key || '');
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
        account_key: item.account_key || undefined,
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
        provider: actionCenterCapabilities?.tasks.preferred_provider || 'google_tasks',
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
      const refreshAgents = async () => {
        const latest = await fetchManagedAgents({ compact: true }).catch(() => null);
        if (latest) setManagedAgents(latest);
      };
      if (kind === 'inbox') {
        const result = await runManagedAgent(agent.id);
        await refreshAgents();
        const taskLabel = result.task?.description ? ` Task: ${result.task.description}` : '';
        if (result.already_running) {
          setAgentNotice(`Inbox Triager was already running.${taskLabel}`);
        } else if (result.current_activity) {
          setAgentNotice(`Inbox Triager launched. ${result.current_activity}${taskLabel ? ` ${taskLabel}` : ''}`);
        } else {
          setAgentNotice(`Inbox Triager is running in Agents.${taskLabel}`);
        }
      } else {
        await refreshAgents();
        setAgentNotice('Meeting Prep agent is ready in Agents.');
      }
      navigate('/agents');
    } catch (error) {
      setAgentNotice(error instanceof Error ? error.message : 'Unable to launch agent');
    } finally {
      setAgentActionBusy(null);
    }
  }

  async function ensureCoreArchitecture() {
    setArchitectureBusy(true);
    setAgentNotice('');
    try {
      const next = await ensureCoreAgentArchitecture();
      setAgentArchitecture(next);
      const createdCount = next.created?.length || 0;
      setAgentNotice(
        createdCount
          ? `Core agent architecture updated. ${createdCount} specialist role${createdCount === 1 ? '' : 's'} provisioned.`
          : 'Core agent architecture already provisioned.',
      );
    } catch (error) {
      setAgentNotice(error instanceof Error ? error.message : 'Unable to provision core agent architecture.');
    } finally {
      setArchitectureBusy(false);
    }
  }

  async function runArchitectureRole(role: string) {
    const target = agentArchitecture?.roles.find((item) => item.role === role);
    if (!target?.agent_id) {
      setAgentNotice(`${role[0]?.toUpperCase() || ''}${role.slice(1)} role is not provisioned yet.`);
      return;
    }
    setArchitectureBusy(true);
    try {
      await runManagedAgent(target.agent_id);
      setAgentNotice(`${target.title} launched in Agents.`);
      const refreshed = await fetchAgentArchitectureStatus().catch(() => null);
      if (refreshed) setAgentArchitecture(refreshed);
      navigate('/agents');
    } catch (error) {
      setAgentNotice(error instanceof Error ? error.message : `Unable to run ${target.title}.`);
    } finally {
      setArchitectureBusy(false);
    }
  }

  async function handoffToArchitecture() {
    const brief = buildArchitectureHandoffBrief();
    await handoffWithBrief(brief, 'hud');
  }

  useEffect(() => {
    const plannerReady = agentArchitecture?.roles?.some((role) => role.role === 'planner' && role.ready && !!role.agent_id);
    const executorReady = agentArchitecture?.roles?.some((role) => role.role === 'executor' && role.ready && !!role.agent_id);
    const savedDesignBrief = durableOperatorMemory?.design_briefs?.[0] || null;
    const weakestDesignArea = savedDesignBrief?.scorecard?.length
      ? savedDesignBrief.scorecard.slice().sort((left, right) => left.score - right.score)[0]
      : null;
    const systemBusy =
      architectureBusy ||
      !!pendingAction ||
      !!pendingCodeEdit ||
      !!pendingWorkbench ||
      streamState.isStreaming ||
      editorBusy !== null ||
      actionBusy !== null ||
      workbenchBusy !== null;
    if (!plannerReady || !executorReady || systemBusy) return;

    if (visualBrief) {
      const visualKey = `${visualBrief.title}:${visualBrief.summary}`;
      if (lastAutoArchitectureVisualRef.current !== visualKey) {
        lastAutoArchitectureVisualRef.current = visualKey;
        handoffWithBrief(visualBrief.prompt, 'visual-auto').catch(() => null);
        return;
      }
    }

    if (dailyDigest?.generated_at && dailyDigest.text?.trim()) {
      const digestKey = dailyDigest.generated_at;
      if (lastAutoArchitectureDigestRef.current !== digestKey) {
        lastAutoArchitectureDigestRef.current = digestKey;
        handoffWithBrief(buildDailyOpsPrompt(), 'daily-ops-auto').catch(() => null);
        return;
      }
    }

    if (selfImproveBrief) {
      const selfImproveKey = `${selfImproveBrief.summary}:${selfImproveBrief.details}`;
      if (lastAutoArchitectureSelfImproveRef.current !== selfImproveKey) {
        lastAutoArchitectureSelfImproveRef.current = selfImproveKey;
        ensureSelfImproveTask('in_progress');
        handoffWithBrief(selfImproveBrief.prompt, 'self-improve-auto').catch(() => null);
        return;
      }
    }

    if (savedDesignBrief && weakestDesignArea && weakestDesignArea.score < 8) {
      const designKey = `${savedDesignBrief.id}:${weakestDesignArea.label}:${weakestDesignArea.score}`;
      if (lastAutoArchitectureDesignRef.current !== designKey) {
        lastAutoArchitectureDesignRef.current = designKey;
        handoffWithBrief(
          `Design mission follow-up.\nSaved brief: ${savedDesignBrief.label}\nArchetype: ${savedDesignBrief.archetype || 'design'}\nWeakest HUD area: ${weakestDesignArea.label} (${weakestDesignArea.score}/10)\n\n${savedDesignBrief.details || savedDesignBrief.summary}\n\nPlan the safest next HUD improvement pass to raise this weakest area without breaking working voice features.`,
          'design-auto',
        ).catch(() => null);
        return;
      }
    }

    if (shopifyBrief && shopifySummary) {
      const needsStoreAttention =
        Number(shopifySummary.open_orders || 0) > 0 || Number(shopifySummary.low_stock_products?.length || 0) > 0;
      if (needsStoreAttention) {
        const shopifyKey = `${shopifySummary.store}:${shopifySummary.open_orders}:${shopifySummary.low_stock_products?.length || 0}:${shopifySummary.repeat_customers}`;
        if (lastAutoArchitectureShopifyRef.current !== shopifyKey) {
          lastAutoArchitectureShopifyRef.current = shopifyKey;
          handoffWithBrief(
            `${shopifyBrief.prompt}\n\nFocus the next ecommerce operating pass on open orders, low-stock risk, and the safest next store actions.`,
            'shopify-auto',
          ).catch(() => null);
        }
      }
    }

    if (commercialBrief) {
      const customerPressure = Number(commercialBrief.counts.find((item) => item.label === 'Customer Pressure')?.value || 0);
      const storePressure =
        Number(commercialBrief.counts.find((item) => item.label === 'Open Orders')?.value || 0) +
        Number(commercialBrief.counts.find((item) => item.label === 'Low Stock')?.value || 0);
      const needsCommercialAttention = customerPressure > 0 || storePressure > 0;
      if (needsCommercialAttention) {
        const commercialKey = `${commercialBrief.summary}:${customerPressure}:${storePressure}`;
        if (lastAutoArchitectureCommercialRef.current !== commercialKey) {
          lastAutoArchitectureCommercialRef.current = commercialKey;
          handoffWithBrief(
            `${commercialBrief.plannerPrompt}\n\nFocus the next commercial operating pass on the most urgent cross-functional risk first.`,
            'commercial-auto',
          ).catch(() => null);
        }
      }
    }

    if (fivemCodingBrief) {
      const complexTopology =
        fivemCodingBrief.topology.includes('client') && fivemCodingBrief.topology.includes('server');
      const frameworkHeavy =
        fivemCodingBrief.framework === 'QBCore' || fivemCodingBrief.framework === 'ESX' || fivemCodingBrief.framework === 'ox_*';
      const hasNetworkOrState =
        fivemCodingBrief.nativeFamilies.includes('network') || fivemCodingBrief.nativeFamilies.includes('state');
      if (complexTopology || frameworkHeavy || hasNetworkOrState) {
        const fivemKey = `${fivemCodingBrief.framework}:${fivemCodingBrief.topology}:${fivemCodingBrief.nativeFamilies.join(',')}`;
        if (lastAutoArchitectureFivemRef.current !== fivemKey) {
          lastAutoArchitectureFivemRef.current = fivemKey;
          handoffWithBrief(
            `${fivemCodingBrief.details}\n\nFocus the next FiveM pass on safe client/server ownership, native usage, event validation, and exploit-resistant Lua logic.`,
            'fivem-auto',
          ).catch(() => null);
        }
      }
    }
  }, [
    actionBusy,
    agentArchitecture?.roles,
    architectureBusy,
    buildDailyOpsPrompt,
    commercialBrief,
    dailyDigest?.generated_at,
    dailyDigest?.text,
    durableOperatorMemory?.design_briefs,
    editorBusy,
    fivemCodingBrief,
    handoffWithBrief,
    pendingAction,
    pendingCodeEdit,
    pendingWorkbench,
    selfImproveBrief,
    shopifyBrief,
    shopifySummary,
    streamState.isStreaming,
    visualBrief,
    workbenchBusy,
  ]);

  useEffect(() => {
    if (!architectureTaskOutcome || !agentArchitecture?.handoff?.source?.startsWith('self-improve')) return;
    const outcomeKey = `${agentArchitecture.handoff.source}:${architectureTaskOutcome.task.id}:${architectureTaskOutcome.kind}`;
    if (lastSelfImproveOutcomeRef.current === outcomeKey) return;
    lastSelfImproveOutcomeRef.current = outcomeKey;
    recordSelfImproveRun(
      architectureTaskOutcome.kind === 'failed' ? 'blocker' : 'outcome',
      architectureTaskOutcome.kind === 'failed'
        ? 'Self-improvement cycle returned a blocker.'
        : 'Self-improvement cycle returned an outcome.',
      architectureTaskOutcome.summary,
      agentArchitecture.handoff.source,
    );
    ensureSelfImproveTask(architectureTaskOutcome.kind === 'failed' ? 'in_progress' : 'done');
  }, [agentArchitecture?.handoff?.source, architectureTaskOutcome]);

  useEffect(() => {
    if (!architectureTaskOutcome || !agentArchitecture?.handoff?.source?.startsWith('design')) return;
    const outcomeKey = `${agentArchitecture.handoff.source}:${architectureTaskOutcome.task.id}:${architectureTaskOutcome.kind}`;
    if (lastDesignOutcomeRef.current === outcomeKey) return;
    lastDesignOutcomeRef.current = outcomeKey;
    void updateOperatorMission({
      id: 'design-mission',
      title: 'HUD Design mission',
      domain: 'design',
      status: architectureTaskOutcome.kind === 'failed' ? 'blocked' : 'complete',
      phase: architectureTaskOutcome.kind === 'failed' ? 'retry' : 'done',
      summary:
        architectureTaskOutcome.kind === 'failed'
          ? 'Design mission returned a blocker.'
          : 'Design mission returned an outcome.',
      next_step:
        architectureTaskOutcome.kind === 'failed'
          ? 'Review the design blocker, re-run the scorecard, and prepare the next HUD refinement pass.'
          : 'Review the design outcome and decide whether to start the next HUD pass.',
      result: architectureTaskOutcome.summary,
      retry_hint:
        architectureTaskOutcome.kind === 'failed'
          ? 'Retry after narrowing the HUD change or improving the weakest scored area.'
          : '',
      result_data: {
        source: agentArchitecture.handoff.source,
        task_id: architectureTaskOutcome.task.id,
        kind: architectureTaskOutcome.kind,
        label: architectureTaskOutcome.label,
      },
      next_action: {
        kind: 'prompt',
        content: architectureTaskOutcome.summary,
        label: architectureTaskOutcome.kind === 'failed' ? 'Design Repair' : 'Design Review',
      },
      updated_at: new Date().toISOString(),
    })
      .then((memory) => {
        setDurableOperatorMemory(memory);
        void rememberLearningExperience({
          label: architectureTaskOutcome.kind === 'failed' ? 'Design blocker' : 'Design outcome',
          domain: 'design',
          context_key: 'hud',
          outcome_type: architectureTaskOutcome.kind === 'failed' ? 'mistake' : 'success',
          summary: architectureTaskOutcome.summary,
          lesson:
            architectureTaskOutcome.kind === 'failed'
              ? 'The current HUD direction still has a weak area that needs a smaller, more targeted refinement pass.'
              : 'The current HUD pass produced a design result worth reusing in the next interface iteration.',
          reuse_hint:
            architectureTaskOutcome.kind === 'failed'
              ? 'Start from the weakest scored area and avoid broad visual changes until that surface is corrected.'
              : 'Carry the strongest hierarchy and clarity decisions forward into the next HUD pass.',
          tags: ['design', architectureTaskOutcome.kind],
        }).catch(() => null);
      })
      .catch(() => {
        lastDesignOutcomeRef.current = '';
      });
  }, [agentArchitecture?.handoff?.source, architectureTaskOutcome]);

  useEffect(() => {
    if (!architectureTaskOutcome || !agentArchitecture?.handoff?.source?.startsWith('fivem')) return;
    const outcomeKey = `${agentArchitecture.handoff.source}:${architectureTaskOutcome.task.id}:${architectureTaskOutcome.kind}`;
    if (lastFivemOutcomeRef.current === outcomeKey) return;
    lastFivemOutcomeRef.current = outcomeKey;
    const savedFivemBrief = durableOperatorMemory?.fivem_briefs?.[0] || null;
    void updateOperatorMission({
      id: 'fivem-mission',
      title: 'FiveM mission',
      domain: 'fivem',
      status: architectureTaskOutcome.kind === 'failed' ? 'blocked' : 'complete',
      phase: architectureTaskOutcome.kind === 'failed' ? 'retry' : 'done',
      summary:
        architectureTaskOutcome.kind === 'failed'
          ? 'FiveM mission returned a blocker.'
          : 'FiveM mission returned an outcome.',
      next_step:
        architectureTaskOutcome.kind === 'failed'
          ? 'Review the blocker, reload the saved FiveM brief, and isolate the safest resource boundary or native fix.'
          : 'Review the FiveM outcome and decide whether the next resource pass should be implementation or validation.',
      result: architectureTaskOutcome.summary,
      retry_hint:
        architectureTaskOutcome.kind === 'failed'
          ? 'Retry after narrowing the risky event, authority, or framework boundary.'
          : '',
      result_data: {
        source: agentArchitecture.handoff.source,
        task_id: architectureTaskOutcome.task.id,
        kind: architectureTaskOutcome.kind,
        label: architectureTaskOutcome.label,
        framework: savedFivemBrief?.framework || fivemCodingBrief?.framework || '',
        topology: savedFivemBrief?.topology || fivemCodingBrief?.topology || '',
        native_families: (savedFivemBrief?.native_families || fivemCodingBrief?.nativeFamilies || []).join(', '),
      },
      next_action: {
        kind: 'prompt',
        content: architectureTaskOutcome.summary,
        label: architectureTaskOutcome.kind === 'failed' ? 'FiveM Repair' : 'FiveM Review',
      },
      updated_at: new Date().toISOString(),
    })
      .then((memory) => {
        setDurableOperatorMemory(memory);
        void rememberLearningExperience({
          label: architectureTaskOutcome.kind === 'failed' ? 'FiveM blocker' : 'FiveM outcome',
          domain: 'fivem',
          context_key: savedFivemBrief?.resource_key || fivemCodingBrief?.resourceKey || '',
          outcome_type: architectureTaskOutcome.kind === 'failed' ? 'mistake' : 'success',
          summary: architectureTaskOutcome.summary,
          lesson:
            architectureTaskOutcome.kind === 'failed'
              ? 'The current FiveM resource pass hit a risky boundary in framework, topology, or native flow.'
              : 'The current FiveM review/patch direction produced a result worth reusing on similar resources.',
          reuse_hint:
            architectureTaskOutcome.kind === 'failed'
              ? 'Narrow the next pass to one authority boundary, native family, or startup assumption before patching again.'
              : 'Reuse the same framework/topology reasoning pattern when similar resource surfaces appear again.',
          tags: [
            'fivem',
            architectureTaskOutcome.kind,
            savedFivemBrief?.framework || fivemCodingBrief?.framework || 'framework-unknown',
          ],
        }).catch(() => null);
      })
      .catch(() => {
        lastFivemOutcomeRef.current = '';
      });
  }, [agentArchitecture?.handoff?.source, architectureTaskOutcome, durableOperatorMemory?.fivem_briefs, fivemCodingBrief]);

  useEffect(() => {
    if (!architectureTaskOutcome || !agentArchitecture?.handoff?.source?.startsWith('commercial')) return;
    const outcomeKey = `${agentArchitecture.handoff.source}:${architectureTaskOutcome.task.id}:${architectureTaskOutcome.kind}`;
    if (lastCommercialOutcomeRef.current === outcomeKey) return;
    lastCommercialOutcomeRef.current = outcomeKey;
    void rememberLearningExperience({
      label: architectureTaskOutcome.kind === 'failed' ? 'Commercial blocker' : 'Commercial outcome',
      domain: 'commercial',
      context_key: 'commercial-ops',
      outcome_type: architectureTaskOutcome.kind === 'failed' ? 'mistake' : 'success',
      summary: architectureTaskOutcome.summary,
      lesson:
        architectureTaskOutcome.kind === 'failed'
          ? 'The current commercial plan still has unresolved cross-functional pressure.'
          : 'The current commercial plan produced a reusable business operating move.',
      reuse_hint:
        architectureTaskOutcome.kind === 'failed'
          ? 'Narrow the next commercial pass to the highest combined customer/store/pipeline risk first.'
          : 'Reuse this sequencing when the same mix of pipeline, customer, and ecommerce signals appears again.',
      tags: ['commercial', architectureTaskOutcome.kind],
    }).catch(() => {
      lastCommercialOutcomeRef.current = '';
    });
  }, [agentArchitecture?.handoff?.source, architectureTaskOutcome]);

  useEffect(() => {
    if (!architectureTaskOutcome || !agentArchitecture?.handoff?.source?.startsWith('design')) return;
    if (architectureTaskOutcome.kind !== 'failed') return;
    if (pendingAction || pendingCodeEdit || pendingWorkbench || actionBusy !== null) return;

    const savedDesignBrief = durableOperatorMemory?.design_briefs?.[0] || null;
    const weakestArea = savedDesignBrief?.scorecard?.length
      ? savedDesignBrief.scorecard.slice().sort((left, right) => left.score - right.score)[0]
      : null;
    const taskKey = `${architectureTaskOutcome.task.id}:${weakestArea?.label || 'design'}`;
    if (lastDesignTaskRef.current === taskKey) return;
    lastDesignTaskRef.current = taskKey;

    const weakestLabel = weakestArea?.label || 'HUD design quality';
    const weakestScore = typeof weakestArea?.score === 'number' ? `${weakestArea.score}/10` : 'unscored';
    const weakestNote = weakestArea?.note || 'Review the latest design blocker and tighten the next HUD pass.';

    createFollowUpTask(
      `Improve HUD ${weakestLabel}`,
      `Design blocker detected.\n\nWeakest area: ${weakestLabel} (${weakestScore})\nGuidance: ${weakestNote}\n\nLatest design blocker:\n${architectureTaskOutcome.summary}\n\nUse the saved design brief and HUD scorecard to prepare the next safe implementation pass without breaking working voice features.`,
    ).catch(() => {
      lastDesignTaskRef.current = '';
    });
  }, [
    actionBusy,
    agentArchitecture?.handoff?.source,
    architectureTaskOutcome,
    durableOperatorMemory?.design_briefs,
    pendingAction,
    pendingCodeEdit,
    pendingWorkbench,
  ]);

  useEffect(() => {
    if (!architectureTaskOutcome || !agentArchitecture?.handoff?.source?.startsWith('fivem')) return;
    if (architectureTaskOutcome.kind !== 'failed') return;
    if (pendingAction || pendingCodeEdit || pendingWorkbench || actionBusy !== null) return;

    const savedFivemBrief = durableOperatorMemory?.fivem_briefs?.[0] || null;
    const taskKey = `${architectureTaskOutcome.task.id}:${savedFivemBrief?.id || fivemCodingBrief?.framework || 'fivem'}`;
    if (lastFivemTaskRef.current === taskKey) return;
    lastFivemTaskRef.current = taskKey;

    const framework = savedFivemBrief?.framework || fivemCodingBrief?.framework || 'FiveM';
    const topology = savedFivemBrief?.topology || fivemCodingBrief?.topology || 'unknown topology';
    const nativeFamilies =
      (savedFivemBrief?.native_families || fivemCodingBrief?.nativeFamilies || []).join(', ') || 'unknown native families';
    const guidance = savedFivemBrief?.details || fivemCodingBrief?.details || 'Reload the FiveM brief and isolate the smallest safe fix.';

    createFollowUpTask(
      `Resolve ${framework} script blocker`,
      `FiveM blocker detected.\n\nFramework: ${framework}\nTopology: ${topology}\nNative families: ${nativeFamilies}\n\nLatest blocker:\n${architectureTaskOutcome.summary}\n\nSaved FiveM guidance:\n${guidance}\n\nPrepare the next safe scripting pass without breaking working voice features or unrelated repo behavior.`,
    ).catch(() => {
      lastFivemTaskRef.current = '';
    });
  }, [
    actionBusy,
    agentArchitecture?.handoff?.source,
    architectureTaskOutcome,
    durableOperatorMemory?.fivem_briefs,
    fivemCodingBrief,
    pendingAction,
    pendingCodeEdit,
    pendingWorkbench,
  ]);

  useEffect(() => {
    if (!architectureTaskOutcome || !agentArchitecture?.handoff?.source?.startsWith('design')) return;
    if (architectureTaskOutcome.kind !== 'failed') return;
    if (pendingAction || pendingCodeEdit || pendingWorkbench || actionBusy !== null) return;

    const savedDesignBrief = durableOperatorMemory?.design_briefs?.[0] || null;
    const weakestArea = savedDesignBrief?.scorecard?.length
      ? savedDesignBrief.scorecard.slice().sort((left, right) => left.score - right.score)[0]
      : null;
    const taskKey = `${architectureTaskOutcome.task.id}:${weakestArea?.label || 'design'}`;
    if (lastDesignTaskRef.current === taskKey) return;
    lastDesignTaskRef.current = taskKey;

    const weakestLabel = weakestArea?.label || 'HUD design quality';
    const weakestScore = typeof weakestArea?.score === 'number' ? `${weakestArea.score}/10` : 'unscored';
    const weakestNote = weakestArea?.note || 'Review the latest design blocker and tighten the next HUD pass.';
    createFollowUpTask(
      `Improve HUD ${weakestLabel}`,
      `Design blocker detected.\n\nWeakest area: ${weakestLabel} (${weakestScore})\nGuidance: ${weakestNote}\n\nLatest design blocker:\n${architectureTaskOutcome.summary}\n\nUse the saved design brief and HUD scorecard to prepare the next safe implementation pass without breaking working voice features.`,
    ).catch(() => {
      lastDesignTaskRef.current = '';
    });
  }, [
    actionBusy,
    agentArchitecture?.handoff?.source,
    architectureTaskOutcome,
    durableOperatorMemory?.design_briefs,
    pendingAction,
    pendingCodeEdit,
    pendingWorkbench,
  ]);

  useEffect(() => {
    if (!latestCodeResult || !activeSelfImproveTask) return;
    if (latestCodeResult.file_path !== activeSelfImproveTask.filePath) return;
    const patchKey = `${latestCodeResult.id}:${latestCodeResult.completed_at}`;
    if (lastSelfImprovePatchRef.current === patchKey) return;
    lastSelfImprovePatchRef.current = patchKey;

    recordSelfImproveRun(
      'patch',
      `Applied patch to ${latestCodeResult.file_path}.`,
      latestCodeResult.result || latestCodeResult.diff || 'Code edit applied.',
      'self-improve-patch',
    );
    ensureSelfImproveTask('in_progress');

    const systemBusy =
      architectureBusy ||
      !!pendingAction ||
      !!pendingCodeEdit ||
      !!pendingWorkbench ||
      streamState.isStreaming ||
      editorBusy !== null ||
      actionBusy !== null ||
      workbenchBusy !== null;
    if (!systemBusy && workspaceChecks?.checks?.[0]) {
      stageSuggestedCommand(workspaceChecks.checks[0].command);
      setWorkbenchNotice(`Self-improvement patch applied. Validation loaded: ${workspaceChecks.checks[0].label}.`);
    }
  }, [
    actionBusy,
    activeSelfImproveTask,
    architectureBusy,
    editorBusy,
    latestCodeResult,
    pendingAction,
    pendingCodeEdit,
    pendingWorkbench,
    streamState.isStreaming,
    workbenchBusy,
    workspaceChecks?.checks,
  ]);

  useEffect(() => {
    if (!autonomyMissions.length) {
      lastMissionSyncRef.current = '';
      return;
    }
    const payload = autonomyMissions.map((mission) => ({
      id: mission.id,
      title: mission.title,
      domain: mission.domain,
      status: mission.status,
      phase: mission.phase,
      summary: mission.summary,
      next_step: mission.nextStep,
      result: mission.result,
      retry_hint: mission.retryHint || '',
      result_data: mission.resultData,
      next_action: mission.nextAction,
      updated_at: new Date().toISOString(),
    }));
    const serialized = JSON.stringify(payload);
    if (lastMissionSyncRef.current === serialized) return;
    lastMissionSyncRef.current = serialized;
    Promise.all(payload.map((mission) => updateOperatorMission(mission)))
      .then((results) => {
        const latest = results[results.length - 1];
        if (latest) setDurableOperatorMemory(latest);
      })
      .catch(() => {
        lastMissionSyncRef.current = '';
      });
  }, [autonomyMissions]);

  useEffect(() => {
    if (!architectureTaskOutcome || !agentArchitecture?.handoff?.source?.startsWith('self-improve')) return;
    const systemBusy =
      architectureBusy ||
      !!pendingAction ||
      !!pendingCodeEdit ||
      !!pendingWorkbench ||
      streamState.isStreaming ||
      editorBusy !== null ||
      actionBusy !== null ||
      workbenchBusy !== null;
    if (systemBusy) return;

    const followupKey = `${agentArchitecture.handoff.source}:${architectureTaskOutcome.task.id}:${architectureTaskOutcome.kind}`;
    if (lastSelfImproveFollowupRef.current === followupKey) return;
    lastSelfImproveFollowupRef.current = followupKey;

    if (architectureTaskOutcome.kind === 'failed') {
      loadSelfImproveRepairStep(architectureTaskOutcome.summary, agentArchitecture.handoff.source).catch(() => null);
      return;
    }

    if (primeSelfImproveValidation(agentArchitecture.handoff.source)) {
      return;
    }

    if (selfImproveBrief) {
      ensureSelfImproveTask('in_progress');
      injectCommand(selfImproveBrief.prompt);
      setWorkbenchNotice('Self-improvement outcome received. Brief reloaded for the next patch step.');
    }
  }, [
    actionBusy,
    agentArchitecture?.handoff?.source,
    architectureBusy,
    architectureTaskOutcome,
    editorBusy,
    editorContent,
    editorFilePath,
    pendingAction,
    pendingCodeEdit,
    pendingWorkbench,
    selfImproveBrief,
    activeSelfImproveTask?.filePath,
    selfImproveTargetFile,
    streamState.isStreaming,
    workbenchBusy,
    workspaceChecks?.checks,
  ]);

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
        stopHudSpeechPlayback();
        await stopContinuousListening({ flushPendingAudio: false });
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
    if (!voiceLoop?.active && !voicePlaybackActive && !streamState.isStreaming) return;
    try {
      stopHudSpeechPlayback();
      window.dispatchEvent(new Event('jarvis:interrupt-stream'));
      if (voiceLoop?.active) {
        await stopContinuousListening({ flushPendingAudio: false });
        const snapshot = await stopVoiceLoop();
        setVoiceLoop(snapshot);
      } else {
        const snapshot = await interruptVoiceLoop('Voice stopped by user.');
        setVoiceLoop(snapshot);
      }
      setVoiceNotice('Voice stopped.');
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
      if (next.coding) {
        setCodingWorkspace(next.coding);
      }
      setWorkbenchNotice(next.result ? 'Command executed.' : 'No pending command.');
      if (next.result) {
        useAppStore.getState().addLogEntry({
          timestamp: Date.now(),
          level: next.result.status === 'success' ? 'info' : 'error',
          category: 'tool',
          message: `Workbench ${next.result.status}: ${next.result.command}`,
        });
        if (next.result.metadata?.coding_verification) {
          const verificationPassed = next.result.status === 'success';
          setWorkbenchNotice(
            verificationPassed
              ? 'Verification completed and patch state updated.'
              : 'Verification failed. Patch state updated with the failure.',
          );
        }
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
          provider: actionCenterCapabilities?.email.preferred_provider || connectorSummary.emailProvider || 'gmail',
          account_key: actionAccountKey || undefined,
        });
      } else {
        next = await stageCalendarBrief({
          title: calendarTitle,
          start_at: calendarStartAt,
          end_at: calendarEndAt,
          attendees: calendarAttendees,
          location: calendarLocation,
          notes: calendarNotes,
          provider: actionCenterCapabilities?.calendar.preferred_provider || connectorSummary.calendarProvider || '',
          account_key: actionAccountKey || undefined,
        });
      }
      setActionCenter(next);
      setActionNotice(actionMode === 'email' ? 'Email draft staged for approval.' : 'Calendar plan staged for approval.');
      setActionAccountKey('');
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

  const voicePhaseLabel = getVoicePhaseLabel(hudSpeechState, voiceLoop);

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
    if (!canAutoSpeak) return;
    const text = latestAssistantMessage?.content?.trim();
    if (!text || text === lastSpokenMessageRef.current) return;

    let cancelled = false;
    playHudSpeech(text, 'reply')
      .then((played) => {
        if (cancelled) return;
        if (!played) return;
        lastSpokenMessageRef.current = text;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [canAutoSpeak, latestAssistantMessage?.content, playHudSpeech]);

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
            <div className="flex flex-wrap gap-2">
              {([
                ['/dashboard', 'Home'],
                ['/workspace', 'Workspace'],
                ['/briefings', 'Briefings'],
                ['/operations', 'Operations'],
                ['/system', 'System'],
              ] as const).map(([path, label]) => (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className={`rounded-[1.1rem] border px-4 py-3 text-sm uppercase tracking-[0.22em] transition ${
                    (path === '/dashboard' && isDashboardView) ||
                    (path === '/workspace' && isWorkspaceView) ||
                    (path === '/briefings' && isBriefingsView) ||
                    (path === '/operations' && isOperationsView)
                      ? 'border-cyan-300/20 bg-cyan-400/[0.12] text-cyan-50'
                      : 'border-cyan-400/12 bg-slate-950/55 text-cyan-100 hover:bg-cyan-400/[0.08]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setFocusMode((value) => !value)}
              className="rounded-[1.2rem] border border-cyan-400/15 bg-cyan-400/[0.08] px-4 py-3 text-sm uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
            >
              {focusMode ? 'Full HUD' : 'Focus Mode'}
            </button>
          </div>
	        </header>

        <div className="mb-4 grid gap-3 xl:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))]">
          <div className="rounded-[1.4rem] border border-cyan-400/12 bg-slate-950/55 px-4 py-4">
            <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">View Guide</div>
            <div className="mt-2 text-sm leading-7 text-slate-200/78">{viewSummary.title}</div>
          </div>
            {viewSummary.cards.map((card) => (
              <div
                key={card.label}
                className="rounded-[1.4rem] border border-cyan-400/12 bg-slate-950/55 px-4 py-4"
              >
                <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/55">{card.label}</div>
                <div className="mt-2 text-sm uppercase tracking-[0.14em] text-cyan-50/92">{card.value}</div>
                <div className="mt-2 text-xs leading-6 text-slate-200/72">{card.detail}</div>
              </div>
            ))}
            {isWorkspaceView ? (
              <div className="xl:col-span-4 rounded-[1.4rem] border border-cyan-400/12 bg-slate-950/55 px-4 py-4">
                <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">Workspace Flow</div>
                <div className="mt-3 grid gap-3 md:grid-cols-4">
                  {[
                    {
                      label: '1. Connect',
                      value: activeWorkspaceRepo?.name || 'Choose a repo',
                      detail: activeWorkspaceRepo?.root || 'Start by selecting the repo JARVIS should work inside.',
                    },
                    {
                      label: '2. Inspect',
                      value: workspaceSummary?.dirty ? `${workspaceSummary.changed_count} changed files` : 'Repo is calm',
                      detail: workspaceSummary?.dirty
                        ? 'Look through Repo Overview first so you know what changed before editing or shipping.'
                        : 'Repo Overview is the quickest place to confirm branch, worktree, and changed files.',
                    },
                    {
                      label: '3. Verify',
                      value: workspaceChecks?.checks?.[0]?.label || 'Pick the next check',
                      detail: workspaceChecks?.checks?.[0]?.command || 'Use Verify Changes to run the next recommended check.',
                    },
                    {
                      label: '4. Ship',
                      value: workspaceSummary?.push_ready ? 'Ready to publish' : workspaceSummary?.commit_ready ? 'Ready to review commit' : 'Not ready yet',
                      detail: workspaceSummary?.push_ready
                        ? 'Review Push is the last step once your local commits are ready.'
                        : workspaceSummary?.commit_ready
                        ? 'Review Commit is the next good move once the repo looks green.'
                        : 'Once checks are green, move into Review Commit and Review Push.',
                    },
                  ].map((step) => (
                    <div
                      key={step.label}
                      className="rounded-[1rem] border border-cyan-400/10 bg-black/20 px-3 py-3"
                    >
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">{step.label}</div>
                      <div className="mt-2 text-sm uppercase tracking-[0.14em] text-cyan-50/92">{step.value}</div>
                      <div className="mt-2 text-xs leading-6 text-slate-200/72">{step.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

	        <div
          className={`grid flex-1 gap-4 ${
            isDashboardView
              ? focusMode
                ? 'xl:grid-cols-[minmax(920px,1fr)]'
                : 'xl:grid-cols-[280px_minmax(780px,1fr)]'
              : isOperationsView
              ? focusMode
                ? 'xl:grid-cols-[minmax(920px,1fr)]'
                : 'xl:grid-cols-[300px_minmax(780px,1fr)]'
              : 'xl:grid-cols-[minmax(980px,1fr)]'
          }`}
        >
          {(isDashboardView || isOperationsView) && !focusMode ? <div className="space-y-4">
            {isDashboardView ? (
              <>
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
              </>
            ) : null}

            {isOperationsView ? (
              <>
            <Panel title="Core Agents" kicker="Explicit architecture">
              <Suspense fallback={<DashboardSectionFallback label="Loading core agents..." />}>
                <CoreAgentsPanel
                  architecture={agentArchitecture}
                  architectureBusy={architectureBusy}
                  agentNotice={agentNotice}
                  architectureTaskOutcome={architectureTaskOutcome}
                  designTaskOutcome={designArchitectureTaskOutcome}
                  fivemTaskOutcome={fivemArchitectureTaskOutcome}
                  roleTasks={agentRoleTasks}
                  onEnsureCoreTeam={ensureCoreArchitecture}
                  onPlannerHandoff={handoffToArchitecture}
                  onRunRole={runArchitectureRole}
                />
              </Suspense>
            </Panel>

            <Panel title="Mission Matrix" kicker="Shared autonomy loop">
              <Suspense fallback={<DashboardSectionFallback label="Loading mission matrix..." />}>
                <MissionMatrix missions={autonomyMissions} onRunMission={runMissionAction} />
              </Suspense>
            </Panel>
              </>
            ) : null}
          </div> : null}

          <div className="space-y-4">
            {isDashboardView ? (
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
                             }. Engine: ${voiceLoop?.wake_backend || speechProfile?.wake_backend || 'transcript'}${
                                voiceLoop?.wake_available === false && voiceLoop?.wake_requested_backend
                                  ? ` (fallback from ${voiceLoop.wake_requested_backend})`
                                  : ''
                              }.`
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
                        disabled={!voiceLoop?.active && !voicePlaybackActive && !streamState.isStreaming}
                        className="rounded-[1rem] border border-slate-400/20 bg-slate-900/70 px-4 py-3 text-xs uppercase tracking-[0.28em] text-slate-200 transition hover:border-cyan-400/20 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Stop Reply
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
                      {voiceLoop?.wake_available === false && voiceLoop?.wake_reason ? (
                        <div className="mt-2 text-[11px] leading-5 text-amber-200/80">
                          Wake fallback active: {voiceLoop.wake_reason}
                        </div>
                      ) : null}
                      {voiceLoop?.last_wake_score != null ? (
                        <div className="mt-2 text-[11px] uppercase tracking-[0.28em] text-cyan-300/55">
                          Wake score: {voiceLoop.last_wake_score.toFixed(2)}
                        </div>
                      ) : null}
                      {(voiceLoop?.last_transcribe_ms || voiceLoop?.last_process_ms) ? (
                        <div className="mt-2 text-[11px] uppercase tracking-[0.28em] text-cyan-300/55">
                          STT: {Math.round(voiceLoop?.last_transcribe_ms || 0)}ms · Loop: {Math.round(voiceLoop?.last_process_ms || 0)}ms
                        </div>
                      ) : null}
                  </div>
                </div>
              </div>
            </Panel>
            ) : null}

            {(isDashboardView || isWorkspaceView) ? (
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
                {pendingCodeEdit?.verification?.suggested_checks?.length && !pendingWorkbench ? (
                  <button
                    onClick={() => handleStageCodingVerification()}
                    disabled={workbenchBusy !== null || actionBusy !== null || editorBusy !== null}
                    className="mt-3 w-full rounded-[1.05rem] border border-cyan-400/20 bg-cyan-400/[0.08] px-4 py-3 text-sm uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Stage Verification
                  </button>
                ) : null}

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
                      ? pendingCodeEdit.verification?.suggested_checks?.length
                        ? `Approve to apply the staged file diff, or stage verification first: ${pendingCodeEdit.verification.suggested_checks[0]}`
                        : 'Approve to apply the staged file diff to the active repository.'
                      : pendingWorkbench
                      ? 'Approve to execute the staged terminal command.'
                      : 'No staged action right now.')}
                </div>
              </Panel>

              {isWorkspaceView ? (
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
                  <Suspense fallback={<DashboardSectionFallback label="Loading command input..." />}>
                    <HudInputArea />
                  </Suspense>
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
                    <Suspense fallback={<DashboardSectionFallback label="Loading sales intelligence..." />}>
                      <SalesIntelPanel
                        brief={salesBrief}
                        architectureBusy={architectureBusy}
                        onLoadBrief={() => injectCommand(salesBrief?.prompt || '')}
                        onRouteToPlanner={() => void handoffWithBrief(salesBrief?.plannerPrompt || salesBrief?.prompt || '', 'sales-intel')}
                        onMakeTask={() =>
                          createFollowUpTask(
                            'Sales follow-up review',
                            salesBrief?.details || salesBrief?.summary || 'Review the current pipeline, risks, and next follow-ups.',
                          )
                        }
                        onLoadPrompt={loadSalesPrompt}
                        onDraftFollowUp={loadSalesFollowUpDraft}
                        onSaveAccountNote={() => void savePrimarySalesAccountNote()}
                        onMarkDealRisk={() => void markPrimaryDealRisk()}
                      />
                    </Suspense>
                    <Suspense fallback={<DashboardSectionFallback label="Loading customer intelligence..." />}>
                      <CustomerIntelPanel
                        brief={customerBrief}
                        architectureBusy={architectureBusy}
                        onLoadBrief={() => injectCommand(customerBrief?.prompt || '')}
                        onRouteToPlanner={() => void handoffWithBrief(customerBrief?.plannerPrompt || customerBrief?.prompt || '', 'customer-intel')}
                        onMakeTask={() =>
                          createFollowUpTask(
                            'Customer health review',
                            customerBrief?.details || customerBrief?.summary || 'Review customer health, churn risk, and the next follow-up actions.',
                          )
                        }
                        onDraftReply={loadCustomerReplyDraft}
                        onEscalate={() => void escalateCustomerIssue()}
                      />
                    </Suspense>
                    <Suspense fallback={<DashboardSectionFallback label="Loading shopify intelligence..." />}>
                      <ShopifyIntelPanel
                        brief={shopifyBrief}
                        summary={shopifySummary}
                        architectureBusy={architectureBusy}
                        onRefresh={() => void refreshShopifyIntel()}
                        onLoadBrief={() => injectCommand(shopifyBrief?.prompt || '')}
                        onRouteToPlanner={() => void handoffWithBrief(shopifyBrief?.plannerPrompt || shopifyBrief?.prompt || '', 'shopify-intel')}
                        onMakeTask={() =>
                          createFollowUpTask(
                            'Shopify ops review',
                            shopifyBrief?.details || shopifyBrief?.summary || 'Review store performance, open orders, stock risk, and the next ecommerce actions.',
                          )
                        }
                      />
                    </Suspense>
                    <Suspense fallback={<DashboardSectionFallback label="Loading commercial operations..." />}>
                      <CommercialOpsPanel
                        brief={commercialBrief}
                        architectureBusy={architectureBusy}
                        onLoadBrief={() => injectCommand(commercialBrief?.prompt || '')}
                        onRouteToPlanner={() => void handoffWithBrief(commercialBrief?.plannerPrompt || commercialBrief?.prompt || '', 'commercial-ops')}
                        onMakeTask={() =>
                          createFollowUpTask(
                            'Commercial ops review',
                            commercialBrief?.details || commercialBrief?.summary || 'Review combined sales, customer, and store operations signals.',
                          )
                        }
                      />
                    </Suspense>
                    <Suspense fallback={<DashboardSectionFallback label="Loading document intelligence..." />}>
                      <DocumentIntel
                          title={documentAnalysisTitle}
                        onTitleChange={setDocumentAnalysisTitle}
                        mode={documentAnalysisMode}
                        onModeChange={setDocumentAnalysisMode}
                        onSelectFiles={() => void selectDocumentFiles()}
                        onAnalyze={() => void analyzeCurrentDocuments()}
                        files={documentFiles}
                        busy={documentBusy}
                        analysis={documentAnalysis}
                        brief={documentBrief}
                        architectureBusy={architectureBusy}
                        onLoadAnalysis={() =>
                          injectCommand(
                            documentBrief?.prompt ||
                              `I analyzed these documents: ${documentAnalysis?.files.join(', ') || ''}.
Mode: ${documentAnalysis?.mode || ''}

${documentAnalysis?.content || ''}

Turn this into the next best action, decisions, and risks.`,
                          )
                        }
                        onRouteToPlanner={() => void handoffWithBrief(documentBrief?.prompt || documentAnalysis?.content || '', 'document-intel')}
                        onPrepareMemo={() => injectCommand(documentBrief?.memoPrompt || documentAnalysis?.content || '')}
                        onSaveBrief={() => void saveDocumentBrief()}
                        onExportDocx={() => void exportCurrentDocumentAnalysis('docx')}
                        onExportSecondary={() => void exportCurrentDocumentAnalysis(documentAnalysis?.mode === 'kpi_extract' ? 'xlsx' : 'txt')}
                        secondaryExportLabel={documentAnalysis?.mode === 'kpi_extract' ? 'Export XLSX' : 'Export TXT'}
                        onMakeTask={() =>
                          createFollowUpTask(
                            `Document review / ${documentAnalysisTitle.trim() || documentAnalysis?.files[0] || 'analysis'}`,
                            documentAnalysis?.content || '',
                          )
                        }
                        recentBriefs={durableOperatorMemory?.document_briefs || []}
                        onLoadSavedBrief={(item) =>
                          injectCommand(
                            `I saved a document brief.
Label: ${item.label}
Mode: ${item.mode}
Summary: ${item.summary}
Details:
${item.details}
Continue from this document context and suggest the next best action.`,
                          )
                        }
                        onMemoSavedBrief={(item) =>
                          injectCommand(
                            `Create a concise executive memo from this saved document brief.
Label: ${item.label}
Mode: ${item.mode}
Summary: ${item.summary}
Details:
${item.details}`,
                          )
                        }
                      />
                  </Suspense>
                  <Suspense fallback={<DashboardSectionFallback label="Loading intent feedback..." />}>
                    <IntentConsoleFeedback intentPreview={intentPreview} intentExecution={intentExecution} />
                  </Suspense>
                  <Suspense fallback={<DashboardSectionFallback label="Loading visual intel..." />}>
                    <VisualIntelPanel
                      screenSnapshot={screenSnapshot}
                      screenDeck={screenDeck}
                      screenContextNote={screenContextNote}
                      setScreenContextNote={setScreenContextNote}
                      setScreenSnapshot={setScreenSnapshot}
                      setScreenDeck={setScreenDeck}
                      captureScreenSnapshot={captureScreenSnapshot}
                      injectCommand={injectCommand}
                      analyzeCurrentVisual={analyzeCurrentVisual}
                      visionBusy={visionBusy}
                      extractCurrentVisualText={extractCurrentVisualText}
                      analyzeAllScreens={analyzeAllScreens}
                      extractAllScreensText={extractAllScreensText}
                      createTaskFromScreenContext={createTaskFromScreenContext}
                      actionBusy={actionBusy}
                      rememberScreenContext={rememberScreenContext}
                      intentBusy={intentBusy}
                      visionAnalysis={visionAnalysis}
                      visionTextExtraction={visionTextExtraction}
                      createTaskFromVisionResult={createTaskFromVisionResult}
                      rememberVisionResult={rememberVisionResult}
                      suggestVisualActions={suggestVisualActions}
                      extractVisualSignals={extractVisualSignals}
                      extractVisualUiTargets={extractVisualUiTargets}
                      setVisionAnalysis={setVisionAnalysis}
                      setVisionSignals={setVisionSignals}
                      setVisionTextExtraction={setVisionTextExtraction}
                      setVisionSuggestedActions={setVisionSuggestedActions}
                      setVisionUiTargets={setVisionUiTargets}
                      setVisionUiPlan={setVisionUiPlan}
                      setVisionUiVerify={setVisionUiVerify}
                      setVisionQuery={setVisionQuery}
                      setVisionQuestion={setVisionQuestion}
                      visionQuestion={visionQuestion}
                      askVisualQuestion={askVisualQuestion}
                      visualBrief={visualBrief}
                      architectureBusy={architectureBusy}
                      handoffWithBrief={handoffWithBrief}
                      buildDailyOpsPrompt={buildDailyOpsPrompt}
                      saveVisualBrief={saveVisualBrief}
                      visionSignals={visionSignals}
                      visionQuery={visionQuery}
                      visionUiTargets={visionUiTargets}
                      visionUiVerify={visionUiVerify}
                      verifyVisualUiTarget={verifyVisualUiTarget}
                      visionUiPlan={visionUiPlan}
                      planVisualUiTarget={planVisualUiTarget}
                      visionSuggestedActions={visionSuggestedActions}
                      stageVisualDesktopIntent={stageVisualDesktopIntent}
                      stageTask={stageTask}
                      setActionBusy={setActionBusy}
                      setActionCenter={setActionCenter}
                      setActionNotice={setActionNotice}
                      durableOperatorMemory={durableOperatorMemory}
                      apiBase={apiBase}
                      restoreVisualObservation={restoreVisualObservation}
                      setWorkbenchNotice={setWorkbenchNotice}
                      loadDesignAudit={() => loadDesignPrompt('screen-audit')}
                      saveDesignBriefFromVisual={() => {
                        if (!designBrief || !visualBrief) {
                          setWorkbenchNotice('Capture or analyze a visual first so JARVIS has design context to save.');
                          return;
                        }
                        void updateOperatorDesignBrief({
                          label: `Design Audit · ${visualBrief.title}`,
                          archetype: designBrief.archetypeLabel,
                          summary: designBrief.summary,
                          details: `${designBrief.details}\n\nVisual source: ${visualBrief.title}\n${visualBrief.details}`,
                          scorecard: designBrief.scorecard,
                          created_at: new Date().toISOString(),
                        })
                          .then((memory) => {
                            setDurableOperatorMemory(memory);
                            setWorkbenchNotice('Design brief saved from live visual context.');
                          })
                          .catch((error) =>
                            setWorkbenchNotice(
                              error instanceof Error ? error.message : 'Failed to save design brief from visual context.',
                            ),
                          );
                      }}
                    />
                  </Suspense>
                </div>
                <Suspense fallback={<DashboardSectionFallback label="Loading action center..." />}>
                  <ActionCenterPanel
                    actionMode={actionMode}
                    onActionModeChange={(mode) => {
                      setActionMode(mode);
                      setActionAccountKey('');
                    }}
                    emailRecipient={emailRecipient}
                    onEmailRecipientChange={setEmailRecipient}
                    emailSubject={emailSubject}
                    onEmailSubjectChange={setEmailSubject}
                    emailBody={emailBody}
                    onEmailBodyChange={setEmailBody}
                    calendarTitle={calendarTitle}
                    onCalendarTitleChange={setCalendarTitle}
                    calendarStartAt={calendarStartAt}
                    onCalendarStartAtChange={setCalendarStartAt}
                    calendarEndAt={calendarEndAt}
                    onCalendarEndAtChange={setCalendarEndAt}
                    calendarAttendees={calendarAttendees}
                    onCalendarAttendeesChange={setCalendarAttendees}
                    calendarLocation={calendarLocation}
                    onCalendarLocationChange={setCalendarLocation}
                    calendarNotes={calendarNotes}
                    onCalendarNotesChange={setCalendarNotes}
                    onStageAction={handleStageAction}
                    actionBusy={actionBusy}
                    executionHint={actionCenterExecutionHint}
                    connectorCapabilities={connectorCapabilities}
                  />
                </Suspense>

                <Suspense fallback={<DashboardSectionFallback label="Loading terminal workbench..." />}>
                  <TerminalWorkbenchPanel
                    workbenchCommand={workbenchCommand}
                    onWorkbenchCommandChange={setWorkbenchCommand}
                    workbenchDirectory={workbenchDirectory}
                    onWorkbenchDirectoryChange={setWorkbenchDirectory}
                    workbenchTimeout={workbenchTimeout}
                    onWorkbenchTimeoutChange={setWorkbenchTimeout}
                    onStageWorkbenchCommand={handleStageWorkbenchCommand}
                    workbenchBusy={workbenchBusy}
                  />
                </Suspense>

                <Suspense fallback={<DashboardSectionFallback label="Loading repo dock..." />}>
                  <RepoDockPanel
                    activeWorkspaceRepo={activeWorkspaceRepo}
                    workspaceSummary={workspaceSummary}
                    repoPathInput={repoPathInput}
                    onRepoPathInputChange={setRepoPathInput}
                    onRegisterRepo={handleRegisterRepo}
                    repoBusy={repoBusy}
                    repoCloneUrl={repoCloneUrl}
                    onRepoCloneUrlChange={setRepoCloneUrl}
                    onLoadCloneRepoCommand={loadCloneRepoCommand}
                    workspaceRepos={workspaceRepos}
                    onSelectRepo={handleSelectRepo}
                    repoNotice={repoNotice}
                  />
                </Suspense>

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">
                    Verify Changes
                  </div>
                  <div className="text-sm leading-7 text-slate-200/78">
                    Run the next recommended check, then move into commit and push once the repo is green.
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Next Check</div>
                      <div className="mt-1 text-sm text-cyan-50/92">
                        {workspaceChecks?.checks?.[0]?.label || 'No suggested check yet'}
                      </div>
                    </div>
                    <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Commit Readiness</div>
                      <div className="mt-1 text-sm text-cyan-50/92">
                        {workspaceSummary?.commit_ready ? 'Ready to review commit' : 'Not ready yet'}
                      </div>
                    </div>
                    <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Push Readiness</div>
                      <div className="mt-1 text-sm text-cyan-50/92">
                        {workspaceSummary?.push_ready ? 'Ready to review push' : 'Still local'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                      Recommended Checks
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
                        JARVIS has not suggested checks for this repo yet.
                      </div>
                    ) : null}
                  </div>
                  </div>
                  <div className="mt-3">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                      Git Review Actions
                    </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_160px_160px_160px]">
                    <input
                      value={gitCommitMessage}
                      onChange={(event) => setGitCommitMessage(event.target.value)}
                      placeholder="Leave blank to auto-generate a commit message"
                      className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <button
                      onClick={loadPreparedStageCommand}
                      disabled={workbenchBusy !== null}
                      className="rounded-[0.9rem] border border-cyan-400/12 bg-slate-950/70 px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                    >
                      {workbenchBusy === 'prepare' ? 'Preparing' : 'Stage Changes'}
                    </button>
                    <button
                      onClick={loadPreparedCommitCommand}
                      disabled={workbenchBusy !== null}
                      className="rounded-[0.9rem] border border-cyan-400/12 bg-slate-950/70 px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                    >
                      {workbenchBusy === 'prepare' ? 'Preparing' : 'Review Commit'}
                    </button>
                    <button
                      onClick={loadPreparedPushCommand}
                      disabled={workbenchBusy !== null}
                      className="rounded-[0.9rem] border border-cyan-400/12 bg-slate-950/70 px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                    >
                      {workbenchBusy === 'prepare' ? 'Preparing' : 'Review Push'}
                    </button>
                  </div>
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
                          Review Commit
                        </button>
                        <button
                          onClick={loadPreparedPushCommand}
                          className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                        >
                          Review Push
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">
                    Self-Improve
                  </div>
                  {selfImproveBrief ? (
                    <div className="space-y-3">
                      {activeSelfImproveTask ? (
                        <div className="rounded-[0.95rem] border border-cyan-400/10 bg-cyan-400/[0.06] px-3 py-3">
                          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Active Mission</div>
                          <div className="mt-1 text-sm text-cyan-50/92">{activeSelfImproveTask.title}</div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-cyan-300/55">
                            {activeSelfImproveTask.status} · {activeSelfImproveTask.filePath}
                          </div>
                        </div>
                      ) : null}
                      <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                        <div className="text-sm text-cyan-50/92">{selfImproveBrief.summary}</div>
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-200/72">
                          {selfImproveBrief.details}
                        </pre>
                      </div>
                      {selfImprovePatchPlan ? (
                        <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Patch Plan</div>
                          <div className="mt-1 text-sm text-cyan-50/92">{selfImprovePatchPlan.summary}</div>
                          {selfImprovePatchPlan.targetFile ? (
                            <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-cyan-300/55">
                              target · {selfImprovePatchPlan.targetFile}
                            </div>
                          ) : null}
                          <div className="mt-2 space-y-2">
                            {selfImprovePatchPlan.steps.map((step, index) => (
                              <div key={`${index}-${step}`} className="text-sm leading-6 text-slate-200/76">
                                {index + 1}. {step}
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <button
                              onClick={() => injectCommand(selfImprovePatchPlan.prompt)}
                              className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                            >
                              Load Plan
                            </button>
                            <button
                              onClick={() => focusSelfImproveTarget().catch(() => null)}
                              disabled={!selfImprovePatchPlan.targetFile}
                              className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Focus File
                            </button>
                            <button
                              onClick={() => primeSelfImproveValidation('self-improve-plan')}
                              disabled={!workspaceChecks?.checks?.[0]}
                              className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Prime Check
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <div className="grid gap-2 sm:grid-cols-3">
                        <button
                          onClick={() => {
                            ensureSelfImproveTask('in_progress');
                            recordSelfImproveRun('brief', 'Loaded self-improvement brief into the command core.', selfImproveBrief.summary);
                            injectCommand(selfImproveBrief.prompt);
                          }}
                          className="rounded-[0.9rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-3 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                        >
                          Load Brief
                        </button>
                        <button
                          onClick={() => {
                            ensureSelfImproveTask('in_progress');
                            handoffWithBrief(selfImproveBrief.prompt, 'self-improve').catch(() => null);
                          }}
                          disabled={!agentArchitecture?.roles?.some((role) => role.role === 'planner' && role.ready && !!role.agent_id)}
                          className="rounded-[0.9rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-3 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Route To Planner
                        </button>
                        <button
                          onClick={() =>
                            workspaceChecks?.checks?.[0]
                              ? (recordSelfImproveRun(
                                  'check',
                                  'Primed the top recommended validation command.',
                                  workspaceChecks.checks[0].command,
                                ),
                                ensureSelfImproveTask('in_progress'),
                                stageSuggestedCommand(workspaceChecks.checks[0].command))
                              : (recordSelfImproveRun(
                                  'brief',
                                  'No check was available, so the self-improvement brief was loaded instead.',
                                  selfImproveBrief.summary,
                                ),
                                ensureSelfImproveTask('in_progress'),
                                injectCommand(selfImproveBrief.prompt))
                          }
                          className="rounded-[0.9rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-3 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                        >
                          Prime Check
                        </button>
                      </div>
                      {architectureTaskOutcome && agentArchitecture?.handoff?.source?.startsWith('self-improve') ? (
                        <div
                          className={`rounded-[0.95rem] border px-3 py-3 ${
                            architectureTaskOutcome.kind === 'failed'
                              ? 'border-amber-400/20 bg-amber-400/[0.06]'
                              : 'border-emerald-400/20 bg-emerald-400/[0.06]'
                          }`}
                        >
                          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Latest Self-Improve Outcome</div>
                          <div className="mt-1 text-sm text-cyan-50/92">{architectureTaskOutcome.summary}</div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <button
                              onClick={() =>
                                architectureTaskOutcome.kind === 'failed'
                                  ? void loadSelfImproveRepairStep(architectureTaskOutcome.summary, 'self-improve-manual')
                                  : workspaceChecks?.checks?.[0]
                                  ? primeSelfImproveValidation('self-improve-manual')
                                  : injectCommand(selfImproveBrief.prompt)
                              }
                              className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                            >
                              {architectureTaskOutcome.kind === 'failed' ? 'Load Repair' : 'Run Next Check'}
                            </button>
                            <button
                              onClick={() => handoffWithBrief(selfImproveBrief.prompt, 'self-improve').catch(() => null)}
                              disabled={architectureBusy}
                              className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {architectureBusy ? 'Routing' : 'Retry Mission'}
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Self-Improve Cycle</div>
                        {selfImproveRuns.length ? (
                          <div className="mt-2 space-y-2">
                            {selfImproveRuns.slice(0, 4).map((item) => (
                              <div key={item.id} className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/60 px-3 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-xs uppercase tracking-[0.18em] text-cyan-50/92">
                                    {item.phase} · {item.source}
                                  </div>
                                  <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/55">
                                    {new Date(item.createdAt).toLocaleTimeString()}
                                  </div>
                                </div>
                                <div className="mt-1 text-sm text-slate-200/78">{item.summary}</div>
                                <div className="mt-1 text-xs leading-6 text-slate-300/72">{item.detail}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 text-sm leading-6 text-slate-200/76">
                            Self-improvement runs will appear here once JARVIS loads, routes, or resolves a coding improvement loop.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm leading-6 text-slate-200/76">
                      JARVIS will surface a self-improvement brief once repo state, project memory, or validation context is available.
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">
                    Coding Shortcuts
                  </div>
                  <div className="text-sm leading-7 text-slate-200/78">
                    Quick repo-aware actions to understand the codebase, review changes, and plan the next safe move.
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {([
                      ['Understand Repo', () => loadCodingPrompt('inspect')],
                      ['Debug Issue', () => loadCodingPrompt('debug')],
                      ['Review Code', () => loadCodingPrompt('review')],
                      ['Check Logic', () => loadCodingPrompt('logic')],
                      ['Plan Cleanup', () => loadCodingPrompt('refactor')],
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
                  <Suspense fallback={<DashboardSectionFallback label="Loading FiveM coding intelligence..." />}>
                    <FivemCodingPanel
                      brief={fivemCodingBrief}
                      onLoadPrompt={loadFivemCodingPrompt}
                      onSaveBrief={saveFivemBrief}
                      recentBriefs={durableOperatorMemory?.fivem_briefs || []}
                      onLoadSavedBrief={(item) =>
                        injectCommand(
                          `I saved a FiveM brief.\nLabel: ${item.label}\nResource key: ${item.resource_key}\nFramework: ${item.framework}\nTopology: ${item.topology}\nNative families: ${(item.native_families || []).join(', ') || 'unknown'}\nRisk tags: ${(item.risk_tags || []).join(', ') || 'unknown'}\nSummary: ${item.summary}\nDetails:\n${item.details}\n\nContinue the FiveM/Lua review from this saved context and suggest the next safest change or audit.`,
                        )
                      }
                    />
                  </Suspense>
                  <div className="mt-3 rounded-[1rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Recent Learnings</div>
                    {(rankedLearningItems.length || recentLearningExperiences.length) ? (
                      <div className="mt-3 space-y-2">
                        {(rankedLearningItems.length ? rankedLearningItems : recentLearningExperiences).slice(0, 4).map((item) => (
                          <div key={item.id} className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/45 px-3 py-3">
                            <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-cyan-300/55">
                              <span>{item.domain || 'general'}</span>
                              <span>·</span>
                              <span>{item.outcome_type || 'lesson'}</span>
                              {item.outcome_type === 'anti-pattern' ? (
                                <>
                                  <span>·</span>
                                  <span className="text-amber-300/80">avoid</span>
                                </>
                              ) : null}
                              {typeof item.confidence === 'number' ? (
                                <>
                                  <span>·</span>
                                  <span>{Math.round(item.confidence * 100)}% confidence</span>
                                </>
                              ) : null}
                              {typeof item.use_count === 'number' ? (
                                <>
                                  <span>·</span>
                                  <span>{item.use_count} reuse{item.use_count === 1 ? '' : 's'}</span>
                                </>
                              ) : null}
                              {item.context_key ? (
                                <>
                                  <span>·</span>
                                  <span className="truncate">{item.context_key}</span>
                                </>
                              ) : null}
                            </div>
                            <div className="mt-1 text-sm text-cyan-50/92">{item.label}</div>
                            <div className="mt-1 text-sm leading-6 text-slate-200/76">{item.summary}</div>
                            {item.lesson ? <div className="mt-1 text-xs leading-6 text-slate-300/72">Lesson: {item.lesson}</div> : null}
                            {item.reuse_hint ? <div className="mt-1 text-xs leading-6 text-cyan-200/72">Reuse hint: {item.reuse_hint}</div> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm leading-6 text-slate-200/76">
                        JARVIS will start storing reusable lessons here when validation, FiveM, design, and mission outcomes succeed or fail.
                      </div>
                    )}
                  </div>
                  <Suspense fallback={<DashboardSectionFallback label="Loading design intelligence..." />}>
                    <DesignIntelligence
                      designBrief={designBrief}
                      currentArchetype={getDesignArchetype(operatorProfile.hudArchetype).label}
                      presetArchetypes={DESIGN_ARCHETYPES.map((item) => ({ id: item.id, label: item.label }))}
                      recentBriefs={durableOperatorMemory?.design_briefs || []}
                      onApplyArchetype={(value) => updateOperatorProfile({ hudArchetype: value })}
                      onLoadPrompt={loadDesignPrompt}
                      onLoadBrief={() => injectCommand(designBrief?.creativePrompt || '')}
                      onRouteToPlanner={() => void handoffWithBrief(designBrief?.implementationPrompt || '', 'design-intel')}
                      onSaveBrief={() => {
                        if (!designBrief) return;
                        void updateOperatorDesignBrief({
                          label: 'Design Intelligence',
                          archetype: designBrief.archetypeLabel,
                          summary: designBrief.summary,
                          details: designBrief.details,
                          scorecard: designBrief.scorecard,
                          created_at: new Date().toISOString(),
                        })
                          .then((memory) => {
                            setDurableOperatorMemory(memory);
                            setWorkbenchNotice('Design brief saved to operator memory.');
                          })
                          .catch((error) => setWorkbenchNotice(error instanceof Error ? error.message : 'Failed to save design brief.'));
                      }}
                      onLoadSavedBrief={(item) => injectCommand(item.details || item.summary)}
                      onAuditSavedBrief={(item) =>
                        injectCommand(
                          `Act as a principal UI/UX reviewer for premium HUDs, game menus, and desktop command surfaces.\nSaved design brief label: ${item.label}\nArchetype: ${item.archetype || 'design'}\n\n${item.details || item.summary}\n\nReview this direction for hierarchy, premium feel, interaction clarity, and the top 3 changes that would strengthen the HUD.`,
                        )
                      }
                    />
                  </Suspense>
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
                    Repo Overview
                  </div>
                  <div className="mb-3 text-sm leading-7 text-slate-200/78">
                    Keep the current branch, worktree, and changed files in view before you edit, commit, or push.
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
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Staged</div>
                      <div className="mt-1 text-sm text-cyan-50/92">{workspaceSummary?.staged_count ?? 0}</div>
                    </div>
                    <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Unstaged</div>
                      <div className="mt-1 text-sm text-cyan-50/92">{workspaceSummary?.unstaged_count ?? 0}</div>
                    </div>
                    <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Ahead / Behind</div>
                      <div className="mt-1 text-sm text-cyan-50/92">
                        {workspaceSummary ? `${workspaceSummary.ahead_count ?? 0} / ${workspaceSummary.behind_count ?? 0}` : '0 / 0'}
                      </div>
                    </div>
                    <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Upstream</div>
                      <div className="mt-1 text-sm text-cyan-50/92">
                        {workspaceSummary ? (workspaceSummary.has_upstream ? 'Linked' : 'Missing') : 'Checking'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3 text-sm text-cyan-50/82">
                    {workspaceSummary
                      ? workspaceSummary.push_ready
                        ? `Push-ready on ${workspaceSummary.branch}. ${workspaceSummary.ahead_count ?? 0} local commit(s) are ready to publish.`
                        : workspaceSummary.commit_ready
                        ? `Commit-ready with ${workspaceSummary.changed_count} changed file(s). Stage and review before pushing.`
                        : workspaceSummary.dirty
                        ? 'Local changes exist, but more staging or cleanup is needed before commit/push.'
                        : 'Workspace is clean. No commit or push action is pending.'
                      : 'Inspecting repository readiness.'}
                  </div>
                  <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Changed Files</div>
                    <div className="mt-2 text-xs leading-6 text-slate-300/70">
                      Pick a file to review, inspect, edit, or turn into a task without losing your place in the repo.
                    </div>
                    {workspaceSummary?.changed_files?.length ? (
                      <div className="mt-2 space-y-2">
                        {workspaceSummary.changed_files.slice(0, 5).map((filePath) => (
                          <div
                            key={filePath}
                            className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/60 px-3 py-3"
                          >
                            <div className="text-sm text-cyan-50/92">{filePath}</div>
                            <div className="mt-2 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
                              <div>
                                <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-cyan-300/55">Understand</div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <button
                                    onClick={() => loadFileCodingPrompt(filePath, 'review')}
                                    className="rounded-[0.8rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                                  >
                                    Review
                                  </button>
                                  <button
                                    onClick={() => loadFileCodingPrompt(filePath, 'inspect')}
                                    className="rounded-[0.8rem] border border-cyan-400/12 bg-slate-950/70 px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                                  >
                                    Inspect
                                  </button>
                                  <button
                                    onClick={() => loadFileCodingPrompt(filePath, 'debug')}
                                    className="rounded-[0.8rem] border border-cyan-400/12 bg-slate-950/70 px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                                  >
                                    Debug
                                  </button>
                                  <button
                                    onClick={() => loadFileWorkbenchPreset(filePath)}
                                    className="rounded-[0.8rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-2 py-2 text-[10px] uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                                  >
                                    View Diff
                                  </button>
                                </div>
                              </div>
                              <div>
                                <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-cyan-300/55">Act</div>
                                <div className="grid gap-2 sm:grid-cols-2">
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
                                    Add Task
                                  </button>
                                </div>
                              </div>
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
                  <div className="mb-3 text-sm leading-7 text-slate-200/78">
                    Load a file from the repo, adjust the draft here, then stage the diff when you are ready to review it.
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
                        placeholder="Choose a file from Repo Overview, then edit it here."
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
              ) : null}
            </div>
            ) : null}

            {(isDashboardView || isWorkspaceView || isOperationsView) ? (
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
            ) : null}

            {(isDashboardView || isWorkspaceView || isOperationsView) ? (
            <Panel title="Commander Queue" kicker="Next best actions">
              <Suspense fallback={<DashboardSectionFallback label="Loading commander queue..." />}>
                <CommanderQueue items={commanderQueue} />
              </Suspense>
            </Panel>
            ) : null}
          </div>

          {(isOperationsView || isBriefingsView) && !focusMode ? <div className="space-y-4">
            {isBriefingsView ? (
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
                {visualBrief ? (
                  <div className="mt-3 rounded-[1rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">Visual Intel</div>
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">{visualBrief.title}</div>
                    </div>
                    <div className="mt-2 text-sm text-slate-200/76">{visualBrief.summary}</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        onClick={() => injectCommand(buildDailyOpsPrompt())}
                        className="rounded-[0.95rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                      >
                        Blend Visual Intel
                      </button>
                      <button
                        onClick={() => handoffWithBrief(buildDailyOpsPrompt(), 'daily-ops')}
                        disabled={architectureBusy}
                        className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {architectureBusy ? 'Routing' : 'Route Daily Ops'}
                      </button>
                      <button
                        onClick={() => injectCommand(visualBrief.prompt)}
                        className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                      >
                        Open Visual Brief
                      </button>
                      <button
                        onClick={saveVisualBrief}
                        className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
                      >
                        Save Brief
                      </button>
                    </div>
                  </div>
                ) : null}
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
            ) : null}

            {isOperationsView ? (
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
            ) : null}

            {isOperationsView ? (
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
            ) : null}

            {isOperationsView ? (
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
            ) : null}

            {isOperationsView ? (
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
                  <input
                    value={operatorProfile.hudArchetype}
                    onChange={(event) => updateOperatorProfile({ hudArchetype: event.target.value })}
                    placeholder="HUD archetype"
                    className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <input
                    value={operatorProfile.designStyle}
                    onChange={(event) => updateOperatorProfile({ designStyle: event.target.value })}
                    placeholder="Preferred design style"
                    className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <input
                    value={operatorProfile.designInfluences}
                    onChange={(event) => updateOperatorProfile({ designInfluences: event.target.value })}
                    placeholder="Design influences"
                    className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <input
                    value={operatorProfile.referenceInterfaces}
                    onChange={(event) => updateOperatorProfile({ referenceInterfaces: event.target.value })}
                    placeholder="Reference interfaces"
                    className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <input
                    value={operatorProfile.designGoals}
                    onChange={(event) => updateOperatorProfile({ designGoals: event.target.value })}
                    placeholder="Design goals"
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
            ) : null}

            {isBriefingsView ? (
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
            ) : null}

            {isBriefingsView ? (
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
            ) : null}

            {isBriefingsView ? (
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
            ) : null}

            {isBriefingsView ? (
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
            ) : null}

            {isBriefingsView ? (
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
            ) : null}

            {isBriefingsView ? (
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
            ) : null}

          </div> : null}
        </div>
      </div>
    </section>
  );
}
