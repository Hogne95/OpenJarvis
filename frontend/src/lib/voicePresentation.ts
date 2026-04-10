import type { SpeechTelemetry } from '../hooks/useSpeech';
import type { VoiceLoopStatus } from './api';

export interface ReactorMetric {
  label: string;
  value: string;
}

export function getVoiceEnvironmentLabel(
  voiceLoop: VoiceLoopStatus | null,
  telemetry: SpeechTelemetry,
): string {
  if (!voiceLoop?.active) return 'Idle';
  if (telemetry.noiseFloor >= 0.014) return 'Noisy room';
  if (telemetry.noiseFloor >= 0.008) return 'Moderate room';
  return 'Clean room';
}

export function getVoiceReadinessLabel(
  voiceLoop: VoiceLoopStatus | null,
  telemetry: SpeechTelemetry,
): string {
  if (!voiceLoop?.active) return 'Standby';
  if (telemetry.speechLikely) return 'Speech detected';
  if (telemetry.activeRatio >= 0.08) return 'Monitoring';
  return 'Ready';
}

export function getVoicePhaseLabel(
  speechState: 'idle' | 'listening' | 'recording' | 'transcribing',
  voiceLoop: VoiceLoopStatus | null,
): string {
  if (speechState === 'listening') return 'Listening';
  if (speechState === 'transcribing') return 'Transcribing';
  if (voiceLoop?.active) return voiceLoop.phase[0].toUpperCase() + voiceLoop.phase.slice(1);
  return 'Idle';
}

export function buildVoiceReactorMetrics(args: {
  apiReachable: boolean | null;
  speechAvailable: boolean | null;
  speechProfileVadEnabled?: boolean;
  speechProfileVadBackend?: string;
  voiceLoop: VoiceLoopStatus | null;
  voiceReadinessLabel: string;
  voiceEnvironmentLabel: string;
  latencyLabel: string;
}): ReactorMetric[] {
  const {
    apiReachable,
    latencyLabel,
    speechAvailable,
    speechProfileVadBackend,
    speechProfileVadEnabled,
    voiceEnvironmentLabel,
    voiceLoop,
    voiceReadinessLabel,
  } = args;
  return [
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
      value: speechProfileVadEnabled
        ? voiceLoop?.vad_backend || speechProfileVadBackend || 'Active'
        : 'Disabled',
    },
    { label: 'Latency', value: latencyLabel },
    { label: 'Mic', value: voiceReadinessLabel },
    { label: 'Room', value: voiceEnvironmentLabel },
  ];
}
