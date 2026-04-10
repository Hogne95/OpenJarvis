import { create } from 'zustand';
import type {
  Conversation,
  ChatMessage,
  LogEntry,
  ModelInfo,
  MessageTelemetry,
  SavingsData,
  ServerInfo,
  StreamState,
  ToolCallInfo,
  TokenUsage,
} from '../types';
import type { AuthUser, ManagedAgent } from './api';

export interface AgentEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// ── localStorage persistence ──────────────────────────────────────────

const CONVERSATIONS_KEY = 'openjarvis-conversations';
const SETTINGS_KEY = 'openjarvis-settings';
const PROFILE_KEY = 'openjarvis-operator-profile';
const OPERATOR_SIGNALS_KEY = 'openjarvis-operator-signals';
const OPTIN_KEY = 'openjarvis-optin';
const OPTIN_NAME_KEY = 'openjarvis-display-name';
const OPTIN_EMAIL_KEY = 'openjarvis-email';
const OPTIN_ANONID_KEY = 'openjarvis-anon-id';
const OPTIN_SEEN_KEY = 'openjarvis-optin-seen';

let _authStorageScope = 'guest';

function scopedStorageKey(base: string): string {
  return `${base}:${_authStorageScope}`;
}

function readScopedStorage(base: string): string | null {
  return localStorage.getItem(scopedStorageKey(base));
}

function writeScopedStorage(base: string, value: string): void {
  localStorage.setItem(scopedStorageKey(base), value);
}

function setAuthStorageScope(scope: string | null | undefined): void {
  _authStorageScope = (scope || 'guest').trim() || 'guest';
}

interface ConversationStore {
  version: 1;
  conversations: Record<string, Conversation>;
  activeId: string | null;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadConversations(): ConversationStore {
  try {
    const raw = readScopedStorage(CONVERSATIONS_KEY) ?? localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) return { version: 1, conversations: {}, activeId: null };
    const parsed = JSON.parse(raw);
    if (parsed.version === 1) return parsed;
    return { version: 1, conversations: {}, activeId: null };
  } catch {
    return { version: 1, conversations: {}, activeId: null };
  }
}

function saveConversations(store: ConversationStore): void {
  writeScopedStorage(CONVERSATIONS_KEY, JSON.stringify(store));
}

export type ThemeMode = 'light' | 'dark' | 'system';

interface Settings {
  theme: ThemeMode;
  apiUrl: string;
  fontSize: 'small' | 'default' | 'large';
  defaultModel: string;
  defaultAgent: string;
  temperature: number;
  maxTokens: number;
  speechEnabled: boolean;
}

export interface OperatorProfile {
  honorific: string;
  replyTone: string;
  priorityContacts: string;
  workdayStart: string;
  workdayEnd: string;
  hudArchetype: string;
  designStyle: string;
  designInfluences: string;
  referenceInterfaces: string;
  designGoals: string;
  prepLeadMinutes: number;
  autoPrepareMeetings: boolean;
  autoTriageInbox: boolean;
  inboxFocusCount: number;
}

export interface OperatorSignals {
  replyDrafts: number;
  meetingsCreated: number;
  tasksCreated: number;
  urgentReviews: number;
  topContacts: string[];
}

function loadSettings(): Settings {
  const defaults: Settings = {
    theme: 'system',
    apiUrl: '',
    fontSize: 'default',
    defaultModel: '',
    defaultAgent: '',
    temperature: 0.7,
    maxTokens: 4096,
    speechEnabled: false,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadOperatorProfile(): OperatorProfile {
  const defaults: OperatorProfile = {
    honorific: 'sir',
    replyTone: 'clear and concise',
    priorityContacts: '',
    workdayStart: '08:00',
    workdayEnd: '17:00',
    hudArchetype: 'command center HUD',
    designStyle: 'bold, cinematic, high-clarity',
    designInfluences: 'sci-fi command decks, premium game HUDs, high-trust control rooms',
    referenceInterfaces: 'Destiny menus, Dead Space HUD restraint, premium fintech dashboards, pro creative tools',
    designGoals: 'clear hierarchy, strong visual identity, practical usability',
    prepLeadMinutes: 90,
    autoPrepareMeetings: true,
    autoTriageInbox: true,
    inboxFocusCount: 3,
  };
  try {
    const raw = readScopedStorage(PROFILE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

function saveOperatorProfile(profile: OperatorProfile): void {
  writeScopedStorage(PROFILE_KEY, JSON.stringify(profile));
}

function loadOperatorSignals(): OperatorSignals {
  const defaults: OperatorSignals = {
    replyDrafts: 0,
    meetingsCreated: 0,
    tasksCreated: 0,
    urgentReviews: 0,
    topContacts: [],
  };
  try {
    const raw = readScopedStorage(OPERATOR_SIGNALS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

function saveOperatorSignals(signals: OperatorSignals): void {
  writeScopedStorage(OPERATOR_SIGNALS_KEY, JSON.stringify(signals));
}

// ── Store ─────────────────────────────────────────────────────────────

const INITIAL_STREAM: StreamState = {
  isStreaming: false,
  phase: '',
  elapsedMs: 0,
  activeToolCalls: [],
  content: '',
};

interface AppState {
  // Conversations
  conversations: Conversation[];
  activeId: string | null;
  messages: ChatMessage[];
  streamState: StreamState;

  // Models & server
  models: ModelInfo[];
  modelsLoading: boolean;
  selectedModel: string;
  serverInfo: ServerInfo | null;
  savings: SavingsData | null;
  apiReachable: boolean | null;
  authStatusResolved: boolean;
  authBootstrapRequired: boolean;
  currentUser: AuthUser | null;

  // Settings
  settings: Settings;
  operatorProfile: OperatorProfile;
  operatorSignals: OperatorSignals;

  // Command palette
  commandPaletteOpen: boolean;

  // Sidebar
  sidebarOpen: boolean;

  // System panel
  systemPanelOpen: boolean;

  // Opt-in sharing
  optInEnabled: boolean;
  optInDisplayName: string;
  optInEmail: string;
  optInAnonId: string;
  optInModalSeen: boolean;
  optInModalOpen: boolean;

  // Actions: conversations
  loadConversations: () => void;
  createConversation: (model?: string) => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  loadMessages: (conversationId: string | null) => void;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  updateLastAssistant: (
    conversationId: string,
    content: string,
    toolCalls?: ToolCallInfo[],
    usage?: TokenUsage,
    telemetry?: MessageTelemetry,
    audio?: { url: string },
  ) => void;
  setStreamState: (state: Partial<StreamState>) => void;
  resetStream: () => void;

  // Actions: models & server
  setModels: (models: ModelInfo[]) => void;
  setModelsLoading: (loading: boolean) => void;
  setSelectedModel: (model: string) => void;
  setServerInfo: (info: ServerInfo | null) => void;
  setSavings: (data: SavingsData | null) => void;
  setApiReachable: (reachable: boolean | null) => void;
  setAuthStatus: (payload: {
    resolved: boolean;
    bootstrapRequired: boolean;
    currentUser: AuthUser | null;
  }) => void;
  clearCurrentUser: () => void;

  // Actions: settings
  updateSettings: (partial: Partial<Settings>) => void;
  updateOperatorProfile: (partial: Partial<OperatorProfile>) => void;
  recordOperatorSignal: (
    kind: 'reply' | 'meeting' | 'task' | 'urgent',
    contact?: string,
  ) => void;

  // Actions: UI
  setCommandPaletteOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSystemPanel: () => void;
  setSystemPanelOpen: (open: boolean) => void;

  // Agents
  managedAgents: ManagedAgent[];
  managedAgentsLoading: boolean;
  selectedAgentId: string | null;

  // Actions: agents
  setManagedAgents: (agents: ManagedAgent[]) => void;
  setManagedAgentsLoading: (loading: boolean) => void;
  setSelectedAgentId: (id: string | null) => void;

  // Agent events (live stream)
  agentEvents: AgentEvent[];
  addAgentEvent: (event: AgentEvent) => void;
  clearAgentEvents: () => void;

  // Actions: opt-in sharing
  setOptIn: (enabled: boolean, displayName: string, email: string) => void;
  setOptInModalOpen: (open: boolean) => void;
  markOptInModalSeen: () => void;

  // Logs
  logEntries: LogEntry[];
  addLogEntry: (entry: LogEntry) => void;
  clearLogs: () => void;

  // Model loading
  modelLoading: boolean;
  setModelLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => {
  const initial = loadConversations();
  const convList = Object.values(initial.conversations).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

  return {
    conversations: convList,
    activeId: initial.activeId,
    messages:
      initial.activeId && initial.conversations[initial.activeId]
        ? initial.conversations[initial.activeId].messages
        : [],
    streamState: INITIAL_STREAM,

    models: [],
    modelsLoading: true,
    selectedModel: '',
    serverInfo: null,
    savings: null,
    apiReachable: null,
    authStatusResolved: false,
    authBootstrapRequired: false,
    currentUser: null,

    settings: loadSettings(),
    operatorProfile: loadOperatorProfile(),
    operatorSignals: loadOperatorSignals(),

    commandPaletteOpen: false,
    sidebarOpen: true,
    systemPanelOpen: true,

    optInEnabled: localStorage.getItem(OPTIN_KEY) === 'true',
    optInDisplayName: localStorage.getItem(OPTIN_NAME_KEY) || '',
    optInEmail: localStorage.getItem(OPTIN_EMAIL_KEY) || '',
    optInAnonId: localStorage.getItem(OPTIN_ANONID_KEY) || crypto.randomUUID(),
    optInModalSeen: localStorage.getItem(OPTIN_SEEN_KEY) === 'true',
    optInModalOpen: false,

    // ── Conversations ───────────────────────────────────────────────

    loadConversations: () => {
      const store = loadConversations();
      set({
        conversations: Object.values(store.conversations).sort(
          (a, b) => b.updatedAt - a.updatedAt,
        ),
        activeId: store.activeId,
      });
    },

    createConversation: (model?: string) => {
      const store = loadConversations();
      const conv: Conversation = {
        id: generateId(),
        title: 'New chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: model || get().selectedModel || 'default',
        messages: [],
      };
      store.conversations[conv.id] = conv;
      store.activeId = conv.id;
      saveConversations(store);
      set({
        conversations: Object.values(store.conversations).sort(
          (a, b) => b.updatedAt - a.updatedAt,
        ),
        activeId: conv.id,
        messages: [],
      });
      return conv.id;
    },

    selectConversation: (id: string) => {
      const store = loadConversations();
      store.activeId = id;
      saveConversations(store);
      const conv = store.conversations[id];
      set({
        activeId: id,
        messages: conv ? conv.messages : [],
      });
    },

    deleteConversation: (id: string) => {
      const store = loadConversations();
      delete store.conversations[id];
      if (store.activeId === id) {
        const remaining = Object.keys(store.conversations);
        store.activeId = remaining.length > 0 ? remaining[0] : null;
      }
      saveConversations(store);
      const convList = Object.values(store.conversations).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      );
      const activeConv = store.activeId
        ? store.conversations[store.activeId]
        : null;
      set({
        conversations: convList,
        activeId: store.activeId,
        messages: activeConv ? activeConv.messages : [],
      });
    },

    loadMessages: (conversationId: string | null) => {
      if (!conversationId) {
        set({ messages: [] });
        return;
      }
      const store = loadConversations();
      const conv = store.conversations[conversationId];
      set({ messages: conv ? conv.messages : [] });
    },

    addMessage: (conversationId: string, message: ChatMessage) => {
      const store = loadConversations();
      const conv = store.conversations[conversationId];
      if (!conv) return;
      conv.messages.push(message);
      conv.updatedAt = Date.now();
      if (message.role === 'user' && conv.title === 'New chat') {
        conv.title =
          message.content.slice(0, 50) +
          (message.content.length > 50 ? '...' : '');
      }
      saveConversations(store);
      set({
        messages: [...conv.messages],
        conversations: Object.values(store.conversations).sort(
          (a, b) => b.updatedAt - a.updatedAt,
        ),
      });
    },

    updateLastAssistant: (
      conversationId: string,
      content: string,
      toolCalls?: ToolCallInfo[],
      usage?: TokenUsage,
      telemetry?: MessageTelemetry,
      audio?: { url: string },
    ) => {
      const store = loadConversations();
      const conv = store.conversations[conversationId];
      if (!conv) return;
      const lastMsg = conv.messages[conv.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg.content = content;
        if (toolCalls) lastMsg.toolCalls = toolCalls;
        if (usage) lastMsg.usage = usage;
        if (telemetry) lastMsg.telemetry = telemetry;
        if (audio) lastMsg.audio = audio;
        conv.updatedAt = Date.now();
        saveConversations(store);
        set({ messages: [...conv.messages] });
      }
    },

    setStreamState: (partial: Partial<StreamState>) => {
      set((s) => ({ streamState: { ...s.streamState, ...partial } }));
    },

    resetStream: () => {
      set({ streamState: INITIAL_STREAM });
    },

    // ── Models & server ────────────────────────────────────────────

    setModels: (models: ModelInfo[]) => set({ models }),
    setModelsLoading: (loading: boolean) => set({ modelsLoading: loading }),
    setSelectedModel: (model: string) => set({ selectedModel: model }),
    setServerInfo: (info: ServerInfo | null) => set({ serverInfo: info }),
    setSavings: (data: SavingsData | null) => set({ savings: data }),
    setApiReachable: (apiReachable: boolean | null) => set({ apiReachable }),
    setAuthStatus: ({ resolved, bootstrapRequired, currentUser }) =>
      {
        setAuthStorageScope(currentUser?.id);
        const scopedConversations = loadConversations();
        const scopedConversationList = Object.values(scopedConversations.conversations).sort(
          (a, b) => b.updatedAt - a.updatedAt,
        );
        const activeConversation =
          scopedConversations.activeId && scopedConversations.conversations[scopedConversations.activeId]
            ? scopedConversations.conversations[scopedConversations.activeId]
            : null;
        set({
          authStatusResolved: resolved,
          authBootstrapRequired: bootstrapRequired,
          currentUser,
          conversations: scopedConversationList,
          activeId: scopedConversations.activeId,
          messages: activeConversation ? activeConversation.messages : [],
          operatorProfile: loadOperatorProfile(),
          operatorSignals: loadOperatorSignals(),
          optInEnabled: readScopedStorage(OPTIN_KEY) === 'true',
          optInDisplayName: readScopedStorage(OPTIN_NAME_KEY) || '',
          optInEmail: readScopedStorage(OPTIN_EMAIL_KEY) || '',
          optInAnonId: readScopedStorage(OPTIN_ANONID_KEY) || crypto.randomUUID(),
          optInModalSeen: readScopedStorage(OPTIN_SEEN_KEY) === 'true',
        });
      },
    clearCurrentUser: () =>
      {
        setAuthStorageScope(null);
        const guestConversations = loadConversations();
        const guestConversationList = Object.values(guestConversations.conversations).sort(
          (a, b) => b.updatedAt - a.updatedAt,
        );
        const activeConversation =
          guestConversations.activeId && guestConversations.conversations[guestConversations.activeId]
            ? guestConversations.conversations[guestConversations.activeId]
            : null;
        set({
          currentUser: null,
          authStatusResolved: true,
          authBootstrapRequired: false,
          conversations: guestConversationList,
          activeId: guestConversations.activeId,
          messages: activeConversation ? activeConversation.messages : [],
          operatorProfile: loadOperatorProfile(),
          operatorSignals: loadOperatorSignals(),
          optInEnabled: readScopedStorage(OPTIN_KEY) === 'true',
          optInDisplayName: readScopedStorage(OPTIN_NAME_KEY) || '',
          optInEmail: readScopedStorage(OPTIN_EMAIL_KEY) || '',
          optInAnonId: readScopedStorage(OPTIN_ANONID_KEY) || crypto.randomUUID(),
          optInModalSeen: readScopedStorage(OPTIN_SEEN_KEY) === 'true',
          optInModalOpen: false,
        });
      },

    // ── Settings ───────────────────────────────────────────────────

    updateSettings: (partial: Partial<Settings>) => {
      const updated = { ...get().settings, ...partial };
      saveSettings(updated);
      set({ settings: updated });
    },

    updateOperatorProfile: (partial: Partial<OperatorProfile>) => {
      const updated = { ...get().operatorProfile, ...partial };
      saveOperatorProfile(updated);
      set({ operatorProfile: updated });
    },

    recordOperatorSignal: (
      kind: 'reply' | 'meeting' | 'task' | 'urgent',
      contact?: string,
    ) => {
      const current = get().operatorSignals;
      const next: OperatorSignals = {
        ...current,
        replyDrafts: current.replyDrafts + (kind === 'reply' ? 1 : 0),
        meetingsCreated: current.meetingsCreated + (kind === 'meeting' ? 1 : 0),
        tasksCreated: current.tasksCreated + (kind === 'task' ? 1 : 0),
        urgentReviews: current.urgentReviews + (kind === 'urgent' ? 1 : 0),
        topContacts: current.topContacts,
      };
      const cleanedContact = (contact || '').trim().toLowerCase();
      if (cleanedContact) {
        const merged = [cleanedContact, ...current.topContacts.filter((item) => item !== cleanedContact)];
        next.topContacts = merged.slice(0, 8);
      }
      saveOperatorSignals(next);
      set({ operatorSignals: next });
    },

    // ── UI ──────────────────────────────────────────────────────────

    setCommandPaletteOpen: (open: boolean) => set({ commandPaletteOpen: open }),
    toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
    toggleSystemPanel: () => set((s) => ({ systemPanelOpen: !s.systemPanelOpen })),
    setSystemPanelOpen: (open: boolean) => set({ systemPanelOpen: open }),

    // ── Agents ─────────────────────────────────────────────────────

    managedAgents: [],
    managedAgentsLoading: false,
    selectedAgentId: null,

    setManagedAgents: (agents) => set({ managedAgents: agents }),
    setManagedAgentsLoading: (loading) => set({ managedAgentsLoading: loading }),
    setSelectedAgentId: (id) => set({ selectedAgentId: id }),

    agentEvents: [],
    addAgentEvent: (event) => set((s) => ({
      agentEvents: [...s.agentEvents.slice(-99), event],
    })),
    clearAgentEvents: () => set({ agentEvents: [] }),

    // ── Logs ────────────────────────────────────────────────────────
    logEntries: [],
    addLogEntry: (entry) => set((s) => ({
      logEntries: [...s.logEntries.slice(-499), entry],
    })),
    clearLogs: () => set({ logEntries: [] }),

    // ── Model loading ───────────────────────────────────────────────
    modelLoading: false,
    setModelLoading: (loading) => set({ modelLoading: loading }),

    // ── Opt-in sharing ──────────────────────────────────────────────

    setOptIn: (enabled: boolean, displayName: string, email: string) => {
      const anonId = get().optInAnonId;
      writeScopedStorage(OPTIN_KEY, String(enabled));
      writeScopedStorage(OPTIN_NAME_KEY, displayName);
      writeScopedStorage(OPTIN_EMAIL_KEY, email);
      writeScopedStorage(OPTIN_ANONID_KEY, anonId);
      set({ optInEnabled: enabled, optInDisplayName: displayName, optInEmail: email });
    },
    setOptInModalOpen: (open: boolean) => set({ optInModalOpen: open }),
    markOptInModalSeen: () => {
      writeScopedStorage(OPTIN_SEEN_KEY, 'true');
      set({ optInModalSeen: true });
    },
  };
});

export { generateId };
