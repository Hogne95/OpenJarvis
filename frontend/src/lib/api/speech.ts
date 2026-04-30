import {
  fetchWithTimeout,
  getBase,
  isTauri,
  tauriInvoke,
} from './core';
export interface TranscriptionResult {
  text: string;
  language: string | null;
  confidence: number | null;
  duration_seconds: number;
}

export interface SpeechHealth {
  available: boolean;
  backend?: string;
  reason?: string;
}

export interface VoiceLoopStatus {
  active: boolean;
  always_listening?: boolean;
  phase: 'idle' | 'listening' | 'recording' | 'transcribing' | 'speaking' | 'error';
  session_id: string | null;
  started_at: number | null;
  updated_at: number | null;
  backend_available: boolean;
  backend_name: string | null;
  language_hints: string[];
  wake_phrases?: string[];
  wake_required?: boolean;
  wake_detected?: boolean;
    last_wake_phrase?: string;
    live_vad_enabled?: boolean;
    vad_backend?: string;
    wake_requested_backend?: string;
    wake_backend?: string;
    wake_available?: boolean;
    wake_reason?: string;
    last_vad_rms?: number;
  last_wake_score?: number | null;
  last_transcript: string;
  recent_transcripts?: string[];
  last_command?: string;
  command_count?: number;
  interrupted?: boolean;
  last_transcribe_ms?: number;
  last_process_ms?: number;
  last_audio_duration_seconds?: number;
  interruption_count?: number;
  last_interruption_at?: number | null;
  tts_active?: boolean;
  tts_started_at?: number | null;
  last_error: string;
}

export interface SpeechProfile {
  input_languages: string[];
  reply_language: string;
  wake_phrases: string[];
  live_vad_enabled: boolean;
  vad_backend: string;
  audio_chunk_ms: number;
  wake_backend: string;
  reply_backend: string;
  reply_voice_id: string;
  reply_speed?: number;
  auto_speak: boolean;
  auto_submit_voice_commands: boolean;
  require_wake_phrase: boolean;
}

interface TranscribeAudioOptions {
  filename?: string;
  languageHints?: string[];
}

async function transcribeAudioOnce(
  audioBlob: Blob,
  filename: string,
  language?: string,
): Promise<TranscriptionResult> {
  if (isTauri()) {
    try {
      const buffer = await audioBlob.arrayBuffer();
      return await tauriInvoke<TranscriptionResult>('transcribe_audio', {
        audioData: Array.from(new Uint8Array(buffer)),
        filename,
        language,
      });
    } catch {
      // Fall through to fetch
    }
  }
  const formData = new FormData();
  formData.append('file', audioBlob, filename);
  if (language) formData.append('language', language);
  const res = await fetch(`${getBase()}/v1/speech/transcribe`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
  return res.json();
}

export async function transcribeAudio(
  audioBlob: Blob,
  options: TranscribeAudioOptions = {},
): Promise<TranscriptionResult> {
  const filename = options.filename || 'recording.webm';
  const hintOrder = [undefined, ...(options.languageHints || [])];
  const seen = new Set<string>();
  let lastError: unknown;

  for (const hint of hintOrder) {
    const key = hint || '__auto__';
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const result = await transcribeAudioOnce(audioBlob, filename, hint);
      if (result.text.trim()) return result;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return {
    text: '',
    language: null,
    confidence: null,
    duration_seconds: 0,
  };
}

export async function fetchSpeechHealth(): Promise<SpeechHealth> {
  if (isTauri()) {
    try {
      return await tauriInvoke<SpeechHealth>('speech_health');
    } catch {
      return { available: false };
    }
  }
  const res = await fetchWithTimeout(`${getBase()}/v1/speech/health`, {}, 5000);
  if (!res.ok) return { available: false };
  return res.json();
}

export async function fetchSpeechProfile(): Promise<SpeechProfile> {
  const res = await fetch(`${getBase()}/v1/speech/profile`);
  if (!res.ok) throw new Error(`Speech profile failed: ${res.status}`);
  return res.json();
}

export async function synthesizeSpeech(body: {
  text: string;
  voice_id?: string;
  backend?: string;
  speed?: number;
  output_format?: 'wav' | 'mp3';
}): Promise<Blob> {
  const res = await fetch(`${getBase()}/v1/speech/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Speech synthesis failed: ${res.status}`);
  }
  return res.blob();
}

export async function fetchVoiceLoopStatus(): Promise<VoiceLoopStatus> {
  const res = await fetchWithTimeout(`${getBase()}/v1/voice-loop/status`, {}, 5000);
  if (!res.ok) throw new Error(`Voice loop status failed: ${res.status}`);
  return res.json();
}

export async function startVoiceLoop(languageHints: string[] = ['no', 'en']): Promise<VoiceLoopStatus> {
  const res = await fetch(`${getBase()}/v1/voice-loop/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language_hints: languageHints }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Voice loop start failed: ${res.status}`);
  }
  return res.json();
}

export async function stopVoiceLoop(): Promise<VoiceLoopStatus> {
  const res = await fetch(`${getBase()}/v1/voice-loop/stop`, { method: 'POST' });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Voice loop stop failed: ${res.status}`);
  }
  return res.json();
}

export async function interruptVoiceLoop(reason?: string): Promise<VoiceLoopStatus> {
  const res = await fetch(`${getBase()}/v1/voice-loop/interrupt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Voice loop interrupt failed: ${res.status}`);
  }
  return res.json();
}

export async function updateVoiceLoopState(body: {
  phase: VoiceLoopStatus['phase'];
  transcript?: string;
  error?: string;
}): Promise<VoiceLoopStatus> {
  const res = await fetch(`${getBase()}/v1/voice-loop/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Voice loop state update failed: ${res.status}`);
  }
  return res.json();
}

export async function ingestVoiceTranscript(transcript: string): Promise<VoiceLoopStatus & {
  accepted: boolean;
  wake_matched: boolean;
  command: string;
  message: string;
}> {
  const res = await fetch(`${getBase()}/v1/voice-loop/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Voice transcript ingest failed: ${res.status}`);
  }
  return res.json();
}

export async function processVoiceLoopAudio(
  audioBlob: Blob,
  options: {
    filename?: string;
    languageHints?: string[];
  } = {},
): Promise<
  VoiceLoopStatus & {
    accepted: boolean;
    wake_matched: boolean;
    command: string;
    message: string;
    transcript: string;
    language: string | null;
    confidence: number | null;
    duration_seconds: number;
    interrupted: boolean;
  }
> {
  const formData = new FormData();
  formData.append('file', audioBlob, options.filename || 'voice-loop.webm');
  if (options.languageHints?.length) {
    formData.append('language_hints', options.languageHints.join(','));
  }
  const res = await fetch(`${getBase()}/v1/voice-loop/process-audio`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || `Voice audio processing failed: ${res.status}`);
  }
  return res.json();
}
