type HudStatus = 'Standby' | 'Listening' | 'Analyzing' | 'Responding';

type BuildHudStatusOptions = {
  isStreaming: boolean;
  streamContent: string;
  activeToolCallCount: number;
  voiceLoopActive: boolean;
  speechEnabled: boolean;
  speechAvailable: boolean;
};

export type HudStatusMeta = {
  accent: string;
  label: string;
  transcript: string;
  reply: string;
  bars: number[];
};

export function getHudStatus(options: BuildHudStatusOptions): HudStatus {
  const { isStreaming, streamContent, activeToolCallCount, voiceLoopActive, speechEnabled, speechAvailable } = options;
  if (isStreaming && streamContent.trim()) return 'Responding';
  if (isStreaming || activeToolCallCount > 0) return 'Analyzing';
  if (voiceLoopActive || (speechEnabled && speechAvailable)) return 'Listening';
  return 'Standby';
}

type BuildHudStatusMetaOptions = {
  status: HudStatus;
  voiceLoopActive: boolean;
  voiceLoopTranscript: string;
  streamPhase: string;
  streamContent: string;
  latestUserMessage: string;
  latestAssistantMessage: string;
  toolSummary: string;
  compactText: (value: string, fallback: string) => string;
};

export function buildHudStatusMeta(options: BuildHudStatusMetaOptions): HudStatusMeta {
  const {
    status,
    voiceLoopActive,
    voiceLoopTranscript,
    streamPhase,
    streamContent,
    latestUserMessage,
    latestAssistantMessage,
    toolSummary,
    compactText,
  } = options;
  switch (status) {
    case 'Listening':
      return {
        accent: 'text-emerald-300',
        label: voiceLoopActive ? 'Voice loop armed' : 'Voice ready',
        transcript: compactText(
          latestUserMessage || voiceLoopTranscript || '',
          'The command core is armed. Speak Norwegian or English.',
        ),
        reply: compactText(
          latestAssistantMessage || '',
          'JARVIS is waiting for your next voice or text command.',
        ),
        bars: [42, 58, 82, 68, 92, 74, 54, 36],
      };
    case 'Analyzing':
      return {
        accent: 'text-amber-300',
        label: streamPhase || 'Routing tools and inference',
        transcript: compactText(
          latestUserMessage || '',
          'Intent received. Routing through tools and model selection.',
        ),
        reply: compactText(toolSummary, 'Working through the current request.'),
        bars: [30, 40, 58, 66, 61, 47, 35, 22],
      };
    case 'Responding':
      return {
        accent: 'text-sky-300',
        label: streamPhase || 'Streaming response',
        transcript: compactText(latestUserMessage || '', 'Active request in progress.'),
        reply: compactText(
          streamContent || latestAssistantMessage || '',
          'Rendering assistant response...',
        ),
        bars: [45, 61, 80, 71, 86, 77, 60, 41],
      };
    default:
      return {
        accent: 'text-cyan-200',
        label: 'System idle',
        transcript: compactText(latestUserMessage || '', 'No active command.'),
        reply: compactText(
          latestAssistantMessage || '',
          'All systems nominal. Use the reactor mic or command deck to begin.',
        ),
        bars: [18, 24, 20, 25, 16, 21, 18, 14],
      };
  }
}
