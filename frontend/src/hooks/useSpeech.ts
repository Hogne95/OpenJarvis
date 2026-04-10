import { useState, useCallback, useRef, useEffect } from 'react';
import { transcribeAudio, fetchSpeechHealth, processVoiceLoopAudio } from '../lib/api';

export type SpeechState = 'idle' | 'listening' | 'recording' | 'transcribing';

interface ContinuousListenOptions {
  chunkMs?: number;
  languageHints?: string[];
  sensitivity?: 'sensitive' | 'balanced' | 'strict';
  onChunkProcessed?: (result: Awaited<ReturnType<typeof processVoiceLoopAudio>>) => void;
  onError?: (error: Error) => void;
}

export interface SpeechTelemetry {
  noiseFloor: number;
  activeRatio: number;
  peakRms: number;
  speechLikely: boolean;
}

const RMS_SPEECH_THRESHOLD = 0.012;
const PEAK_SPEECH_THRESHOLD = 0.035;
const MIN_ACTIVE_FRAME_RATIO = 0.18;
const NOISE_FLOOR_MIN = 0.0025;
const NOISE_FLOOR_MAX = 0.02;
const NOISE_FLOOR_LEARN_RATE = 0.08;
const ACTIVE_NOISE_HOLD = 0.92;

export function useSpeech() {
  const [state, setState] = useState<SpeechState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
  const [telemetry, setTelemetry] = useState<SpeechTelemetry>({
    noiseFloor: NOISE_FLOOR_MIN,
    activeRatio: 0,
    peakRms: 0,
    speechLikely: false,
  });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const continuousRef = useRef(false);
  const continuousSessionRef = useRef(0);
  const processingQueueRef = useRef(Promise.resolve());
  const continuousOptionsRef = useRef<ContinuousListenOptions | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const silenceGainNodeRef = useRef<GainNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const captureRateRef = useRef(16000);
  const flushIntervalRef = useRef<number | null>(null);
  const speechEnergyRef = useRef({ frames: 0, activeFrames: 0, peakRms: 0 });
  const noiseFloorRef = useRef(NOISE_FLOOR_MIN);

  // Check if speech backend is available on mount
  useEffect(() => {
    fetchSpeechHealth()
      .then((health) => setAvailable(health.available))
      .catch(() => setAvailable(false));
  }, []);

  const languageHints = useCallback(() => {
    const locale = (navigator.language || '').toLowerCase();
    const hints = ['no', 'en'];
    if (locale.startsWith('en')) return ['en', 'no'];
    if (locale.startsWith('nb') || locale.startsWith('nn') || locale.startsWith('no')) {
      return ['no', 'en'];
    }
    return hints;
  }, []);

  const stopMediaTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const resetContinuousAudioGraph = useCallback(() => {
    if (flushIntervalRef.current !== null) {
      window.clearInterval(flushIntervalRef.current);
      flushIntervalRef.current = null;
    }
    processorNodeRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    silenceGainNodeRef.current?.disconnect();
    processorNodeRef.current = null;
    sourceNodeRef.current = null;
    silenceGainNodeRef.current = null;
    pcmChunksRef.current = [];
    speechEnergyRef.current = { frames: 0, activeFrames: 0, peakRms: 0 };
    noiseFloorRef.current = NOISE_FLOOR_MIN;
    setTelemetry({
      noiseFloor: NOISE_FLOOR_MIN,
      activeRatio: 0,
      peakRms: 0,
      speechLikely: false,
    });
    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (ctx) void ctx.close().catch(() => {});
  }, []);

  const encodeWav = useCallback((samples: Float32Array, sampleRate: number): Blob => {
    const pcm = new Int16Array(samples.length);
    for (let index = 0; index < samples.length; index += 1) {
      const clamped = Math.max(-1, Math.min(1, samples[index]));
      pcm[index] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }

    const buffer = new ArrayBuffer(44 + pcm.length * 2);
    const view = new DataView(buffer);
    const writeString = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + pcm.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, pcm.length * 2, true);

    let offset = 44;
    for (let index = 0; index < pcm.length; index += 1, offset += 2) {
      view.setInt16(offset, pcm[index], true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }, []);

  const flushContinuousAudio = useCallback(async () => {
    if (!continuousRef.current || pcmChunksRef.current.length === 0) return;
    const buffers = pcmChunksRef.current;
    const energy = speechEnergyRef.current;
    pcmChunksRef.current = [];
    speechEnergyRef.current = { frames: 0, activeFrames: 0, peakRms: 0 };
    const totalLength = buffers.reduce((sum, chunk) => sum + chunk.length, 0);
    if (!totalLength) return;
    const activeRatio = energy.frames ? energy.activeFrames / energy.frames : 0;
    const sensitivity = continuousOptionsRef.current?.sensitivity || 'balanced';
    const sensitivityMultiplier =
      sensitivity === 'sensitive' ? 0.82 : sensitivity === 'strict' ? 1.22 : 1;
    const adaptivePeakThreshold = Math.max(
      PEAK_SPEECH_THRESHOLD * sensitivityMultiplier,
      noiseFloorRef.current * (3.2 * sensitivityMultiplier),
    );
    const hasEnoughSpeech = energy.peakRms >= adaptivePeakThreshold || activeRatio >= MIN_ACTIVE_FRAME_RATIO;
    setTelemetry({
      noiseFloor: noiseFloorRef.current,
      activeRatio,
      peakRms: energy.peakRms,
      speechLikely: hasEnoughSpeech,
    });
    if (!hasEnoughSpeech) return;

    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of buffers) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const activeOptions = continuousOptionsRef.current;
    const sessionId = continuousSessionRef.current;
    const blob = encodeWav(merged, captureRateRef.current);
    processingQueueRef.current = processingQueueRef.current
      .catch(() => {})
      .then(async () => {
        if (!continuousRef.current || continuousSessionRef.current !== sessionId) return;
        setState('transcribing');
        try {
          const result = await processVoiceLoopAudio(blob, {
            filename: 'voice-loop.wav',
            languageHints: activeOptions?.languageHints || languageHints(),
          });
          if (!continuousRef.current || continuousSessionRef.current !== sessionId) return;
          activeOptions?.onChunkProcessed?.(result);
          if (continuousRef.current && continuousSessionRef.current === sessionId) setState('listening');
        } catch (err) {
          const nextError = err instanceof Error ? err : new Error('Voice loop processing failed');
          if (!continuousRef.current || continuousSessionRef.current !== sessionId) return;
          setError(nextError.message);
          activeOptions?.onError?.(nextError);
          if (continuousRef.current && continuousSessionRef.current === sessionId) setState('listening');
        }
      });
  }, [encodeWav, languageHints]);

  const startRecording = useCallback(async (): Promise<void> => {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone not supported in this browser');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setState('recording');
    } catch (err) {
      setError('Microphone access denied');
      setState('idle');
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== 'recording') {
        reject(new Error('Not recording'));
        return;
      }

      recorder.onstop = async () => {
        setState('transcribing');

        stopMediaTracks();

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];

        try {
          const result = await transcribeAudio(blob, {
            filename: 'recording.webm',
            languageHints: languageHints(),
          });
          setState('idle');
          resolve(result.text);
        } catch (err) {
          setState('idle');
          const msg = err instanceof Error ? err.message : 'Transcription failed';
          setError(msg);
          reject(err);
        }
      };

      recorder.stop();
    });
  }, [languageHints, stopMediaTracks]);

  const startContinuousListening = useCallback(
    async (options: ContinuousListenOptions = {}): Promise<void> => {
      setError(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Microphone not supported in this browser');
        return;
      }

      continuousRef.current = true;
      continuousSessionRef.current += 1;
      continuousOptionsRef.current = options;
      processingQueueRef.current = Promise.resolve();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        streamRef.current = stream;
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        captureRateRef.current = audioContext.sampleRate;
        const source = audioContext.createMediaStreamSource(stream);
        sourceNodeRef.current = source;
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorNodeRef.current = processor;
        const silenceGain = audioContext.createGain();
        silenceGain.gain.value = 0;
        silenceGainNodeRef.current = silenceGain;

        processor.onaudioprocess = (event) => {
          if (!continuousRef.current) return;
          const channelData = event.inputBuffer.getChannelData(0);
          let sumSquares = 0;
          for (let index = 0; index < channelData.length; index += 1) {
            const sample = channelData[index];
            sumSquares += sample * sample;
          }
          const rms = Math.sqrt(sumSquares / channelData.length);
          const currentNoiseFloor = noiseFloorRef.current;
          const learningTarget =
            rms < currentNoiseFloor * 2.4
              ? rms
              : currentNoiseFloor * ACTIVE_NOISE_HOLD;
          const nextNoiseFloor =
            currentNoiseFloor * (1 - NOISE_FLOOR_LEARN_RATE) + learningTarget * NOISE_FLOOR_LEARN_RATE;
          noiseFloorRef.current = Math.max(NOISE_FLOOR_MIN, Math.min(NOISE_FLOOR_MAX, nextNoiseFloor));
          const sensitivity = continuousOptionsRef.current?.sensitivity || 'balanced';
          const sensitivityMultiplier =
            sensitivity === 'sensitive' ? 0.82 : sensitivity === 'strict' ? 1.22 : 1;
          const adaptiveSpeechThreshold = Math.max(
            RMS_SPEECH_THRESHOLD * sensitivityMultiplier,
            noiseFloorRef.current * (2.15 * sensitivityMultiplier),
          );
          speechEnergyRef.current.frames += 1;
          if (rms >= adaptiveSpeechThreshold) {
            speechEnergyRef.current.activeFrames += 1;
          }
          if (rms > speechEnergyRef.current.peakRms) {
            speechEnergyRef.current.peakRms = rms;
          }
          pcmChunksRef.current.push(new Float32Array(channelData));
        };

        source.connect(processor);
        processor.connect(silenceGain);
        silenceGain.connect(audioContext.destination);
        flushIntervalRef.current = window.setInterval(() => {
          void flushContinuousAudio();
        }, options.chunkMs ?? 2200);
        setTelemetry({
          noiseFloor: noiseFloorRef.current,
          activeRatio: 0,
          peakRms: 0,
          speechLikely: false,
        });
        setState('listening');
      } catch (err) {
        continuousRef.current = false;
        setError('Microphone access denied');
        setState('idle');
      }
    },
    [languageHints, stopMediaTracks],
  );

  const stopContinuousListening = useCallback(async (options: { flushPendingAudio?: boolean } = {}): Promise<void> => {
    continuousRef.current = false;
    continuousSessionRef.current += 1;
    continuousOptionsRef.current = null;
    const flushPendingAudio = options.flushPendingAudio ?? false;

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    if (flushPendingAudio) {
      await flushContinuousAudio();
    } else {
      pcmChunksRef.current = [];
      speechEnergyRef.current = { frames: 0, activeFrames: 0, peakRms: 0 };
    }
    resetContinuousAudioGraph();
    stopMediaTracks();

    try {
      await processingQueueRef.current;
    } finally {
      setState('idle');
    }
  }, [flushContinuousAudio, resetContinuousAudioGraph, stopMediaTracks]);

  useEffect(() => {
    return () => {
      continuousRef.current = false;
      continuousSessionRef.current += 1;
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      resetContinuousAudioGraph();
      stopMediaTracks();
    };
  }, [resetContinuousAudioGraph, stopMediaTracks]);

  return {
    state,
    error,
    available,
    telemetry,
    startRecording,
    stopRecording,
    startContinuousListening,
    stopContinuousListening,
    isRecording: state === 'recording',
    isTranscribing: state === 'transcribing',
    isListening: state === 'listening',
  };
}
