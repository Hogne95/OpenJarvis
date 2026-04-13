import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Square, Paperclip } from 'lucide-react';
import { useAppStore, generateId } from '../../lib/store';
import { streamChat } from '../../lib/sse';
import { fetchSavings } from '../../lib/api';
import { MicButton } from './MicButton';
import { useSpeech } from '../../hooks/useSpeech';
import type { ChatAttachment, ChatMessage, ToolCallInfo, TokenUsage, MessageTelemetry } from '../../types';

type PendingAttachment = {
  id: string;
  name: string;
  size: number;
  content: string;
  truncated: boolean;
};

const MAX_ATTACHMENT_FILES = 5;
const MAX_ATTACHMENT_CHARS = 12000;
const TEXT_FILE_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.jsonl', '.csv', '.tsv', '.xml', '.html', '.htm', '.css',
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.rb', '.php', '.java', '.kt', '.rs', '.go',
  '.c', '.cc', '.cpp', '.h', '.hpp', '.cs', '.swift', '.scala', '.sh', '.bash', '.zsh', '.ps1', '.bat',
  '.toml', '.yaml', '.yml', '.ini', '.cfg', '.conf', '.env', '.sql', '.graphql', '.gql', '.log',
]);

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isTextLikeFile(file: File): boolean {
  if (file.type.startsWith('text/')) return true;
  if (file.type.includes('json') || file.type.includes('xml') || file.type.includes('javascript')) return true;
  const lower = file.name.toLowerCase();
  return Array.from(TEXT_FILE_EXTENSIONS).some((ext) => lower.endsWith(ext));
}

async function readAttachmentFile(file: File): Promise<PendingAttachment> {
  const raw = await file.text();
  const normalized = raw.replace(/\r\n/g, '\n');
  const truncated = normalized.length > MAX_ATTACHMENT_CHARS;
  return {
    id: generateId(),
    name: file.name,
    size: file.size,
    content: truncated
      ? `${normalized.slice(0, MAX_ATTACHMENT_CHARS)}\n\n[File truncated after ${MAX_ATTACHMENT_CHARS.toLocaleString()} characters]`
      : normalized,
    truncated,
  };
}

function buildMessageWithAttachments(content: string, attachments: PendingAttachment[]): string {
  const trimmed = content.trim();
  if (!attachments.length) return trimmed;
  const attachmentBlock = attachments
    .map((file) => {
      const flags = [`size=${formatFileSize(file.size)}`];
      if (file.truncated) flags.push('truncated');
      return `Attached file: ${file.name} (${flags.join(', ')})\n---\n${file.content}`;
    })
    .join('\n\n');
  return trimmed ? `${trimmed}\n\n${attachmentBlock}` : attachmentBlock;
}

function attachmentPreview(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  if (!compact) return 'Empty file';
  return compact.length > 120 ? `${compact.slice(0, 120)}…` : compact;
}

function toChatAttachment(file: PendingAttachment): ChatAttachment {
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    truncated: file.truncated,
    preview: attachmentPreview(file.content),
  };
}

export function InputArea() {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeId = useAppStore((s) => s.activeId);
  const models = useAppStore((s) => s.models);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const streamState = useAppStore((s) => s.streamState);
  const messages = useAppStore((s) => s.messages);
  const speechEnabled = useAppStore((s) => s.settings.speechEnabled);
  const maxTokens = useAppStore((s) => s.settings.maxTokens);
  const temperature = useAppStore((s) => s.settings.temperature);
  const createConversation = useAppStore((s) => s.createConversation);
  const addMessage = useAppStore((s) => s.addMessage);
  const updateLastAssistant = useAppStore((s) => s.updateLastAssistant);
  const setStreamState = useAppStore((s) => s.setStreamState);
  const resetStream = useAppStore((s) => s.resetStream);
  const modelsLoading = useAppStore((s) => s.modelsLoading);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const effectiveModel = selectedModel || models[0]?.id || '';

  const { state: speechState, available: speechAvailable, startRecording, stopRecording } = useSpeech();

  // Abort in-flight stream when the user switches models mid-generation.
  // This prevents errors from trying to continue a stream with a stale model.
  const prevModelRef = useRef(selectedModel);
  useEffect(() => {
    if (prevModelRef.current !== selectedModel && streamState.isStreaming) {
      abortRef.current?.abort();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      resetStream();
      abortRef.current = null;
    }
    prevModelRef.current = selectedModel;
  }, [selectedModel, streamState.isStreaming, resetStream]);

  const micDisabled = !speechEnabled || !speechAvailable || streamState.isStreaming;
  const micReason: 'not-enabled' | 'no-backend' | 'streaming' | undefined =
    !speechEnabled ? 'not-enabled'
    : !speechAvailable ? 'no-backend'
    : streamState.isStreaming ? 'streaming'
    : undefined;

  const handleMicClick = useCallback(async () => {
    if (speechState === 'recording') {
      try {
        const text = await stopRecording();
        if (text) {
          setInput((prev) => (prev ? prev + ' ' + text : text));
        }
      } catch {
        // Error is captured in useSpeech
      }
    } else {
      await startRecording();
    }
  }, [speechState, startRecording, stopRecording]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  const ingestFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (!files.length) return;

    const remainingSlots = Math.max(0, MAX_ATTACHMENT_FILES - attachments.length);
    const selected = files.slice(0, remainingSlots);
    const readable = selected.filter(isTextLikeFile);
    const rejectedCount = files.length - readable.length;

    if (files.length > remainingSlots) {
      setAttachmentNotice(`You can attach up to ${MAX_ATTACHMENT_FILES} text files per message.`);
    } else if (rejectedCount > 0) {
      setAttachmentNotice('Chat attachments currently work with text, code, and config files.');
    } else {
      setAttachmentNotice('');
    }

    if (!readable.length) return;

    try {
      const loaded = await Promise.all(readable.map((file) => readAttachmentFile(file)));
      setAttachments((prev) => {
        const next = [...prev];
        for (const item of loaded) {
          if (!next.some((existing) => existing.name === item.name && existing.content === item.content)) {
            next.push(item);
          }
        }
        return next.slice(0, MAX_ATTACHMENT_FILES);
      });
    } catch {
      setAttachmentNotice('JARVIS could not read one of the selected files.');
    }
  }, [attachments.length]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    resetStream();
  }, [resetStream]);

  const sendMessage = useCallback(async () => {
    const modelId = effectiveModel;
    const visibleContent = input.trim();
    const content = buildMessageWithAttachments(visibleContent, attachments);
    if (!content || streamState.isStreaming || !modelId) return;

    setInput('');
    setAttachments([]);
    setAttachmentNotice('');
    if (!selectedModel && modelId) {
      setSelectedModel(modelId);
    }

    let convId = activeId;
    if (!convId) {
      convId = createConversation(modelId);
    }

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: visibleContent || (attachments.length ? `Attached ${attachments.length} file${attachments.length === 1 ? '' : 's'}` : content),
      timestamp: Date.now(),
      attachments: attachments.length ? attachments.map(toChatAttachment) : undefined,
    };
    addMessage(convId, userMsg);

    // Build API messages with full attachment content before adding assistant placeholder
    const existingMessages = useAppStore.getState().messages.slice(0, -1);
    const apiMessages = [
      ...existingMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      {
        role: userMsg.role,
        content,
      },
    ];

    const assistantMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    addMessage(convId, assistantMsg);

    // Start streaming
    const startTime = Date.now();
    const timer = setInterval(() => {
      setStreamState({ elapsedMs: Date.now() - startTime });
    }, 100);
    timerRef.current = timer;

    const controller = new AbortController();
    abortRef.current = controller;

    let accumulatedContent = '';
    let usage: TokenUsage | undefined;
    let complexity: { score: number; tier: string; suggested_max_tokens: number } | undefined;
    const toolCalls: ToolCallInfo[] = [];
    let lastFlush = 0;
    let ttftMs: number | undefined;

    setStreamState({
      isStreaming: true,
      phase: 'Generating...',
      elapsedMs: 0,
      activeToolCalls: [],
      content: '',
    });
    useAppStore.getState().addLogEntry({
      timestamp: Date.now(),
      level: 'info',
      category: 'chat',
      message: `Request: "${content.slice(0, 80)}${content.length > 80 ? '...' : ''}" → ${selectedModel}`,
    });

    try {
      for await (const sseEvent of streamChat(
        { model: modelId, messages: apiMessages, stream: true, temperature, max_tokens: maxTokens },
        controller.signal,
      )) {
        const eventName = sseEvent.event;

        if (eventName === 'agent_turn_start') {
          setStreamState({ phase: 'Agent thinking...' });
        } else if (eventName === 'inference_start') {
          setStreamState({ phase: 'Generating...' });
          useAppStore.getState().addLogEntry({
            timestamp: Date.now(), level: 'info', category: 'chat',
            message: `Generating with ${modelId}...`,
          });
        } else if (eventName === 'tool_call_start') {
          try {
            const data = JSON.parse(sseEvent.data);
            const tc: ToolCallInfo = {
              id: generateId(),
              tool: data.tool,
              arguments: data.arguments || '',
              status: 'running',
            };
            toolCalls.push(tc);
            setStreamState({
              phase: `Calling ${data.tool}...`,
              activeToolCalls: [...toolCalls],
            });
            updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
            useAppStore.getState().addLogEntry({
              timestamp: Date.now(), level: 'info', category: 'tool',
              message: `Calling ${data.tool}(${data.arguments || ''})`,
            });
          } catch {}
        } else if (eventName === 'tool_call_end') {
          try {
            const data = JSON.parse(sseEvent.data);
            const tc = toolCalls.find(
              (t) => t.tool === data.tool && t.status === 'running',
            );
            if (tc) {
              tc.status = data.success ? 'success' : 'error';
              tc.latency = data.latency;
              tc.result = data.result;
            }
            setStreamState({
              phase: 'Generating...',
              activeToolCalls: [...toolCalls],
            });
            updateLastAssistant(convId, accumulatedContent, [...toolCalls]);
          } catch {}
        } else {
          try {
            const data = JSON.parse(sseEvent.data);
            const delta = data.choices?.[0]?.delta;
            if (data.usage) usage = data.usage;
            if (data.complexity) complexity = data.complexity;
            if (delta?.content) {
              if (!ttftMs) ttftMs = Date.now() - startTime;
              accumulatedContent += delta.content;
              setStreamState({ content: accumulatedContent, phase: '' });

              const now = Date.now();
              if (now - lastFlush >= 80) {
                updateLastAssistant(
                  convId,
                  accumulatedContent,
                  toolCalls.length > 0 ? [...toolCalls] : undefined,
                );
                lastFlush = now;
              }
            }
            if (data.choices?.[0]?.finish_reason === 'stop') break;
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled or model switch — keep whatever was accumulated
        if (!accumulatedContent) accumulatedContent = '(Generation stopped)';
      } else {
        const errMsg = err?.message || String(err);
        accumulatedContent =
          accumulatedContent || `Error: ${errMsg}`;
        useAppStore.getState().addLogEntry({
          timestamp: Date.now(), level: 'error', category: 'chat',
          message: `Stream error: ${errMsg}`,
        });
      }
    } finally {
      if (!accumulatedContent) {
        accumulatedContent = 'No response was generated. Please try again.';
      }
      const totalMs = Date.now() - startTime;
      const _CLOUD_PREFIXES = ['gpt-', 'o1-', 'o3-', 'o4-', 'claude-', 'gemini-', 'openrouter/', 'MiniMax-', 'chatgpt-'];
      const engineLabel = _CLOUD_PREFIXES.some(p => modelId.startsWith(p)) ? 'cloud' : 'ollama';
      const telemetry: MessageTelemetry = {
        engine: engineLabel,
        model_id: modelId,
        total_ms: totalMs,
        ttft_ms: ttftMs,
        tokens_per_sec: usage?.completion_tokens
          ? usage.completion_tokens / (totalMs / 1000)
          : undefined,
        complexity_score: complexity?.score,
        complexity_tier: complexity?.tier,
        suggested_max_tokens: complexity?.suggested_max_tokens,
      };
      updateLastAssistant(
        convId,
        accumulatedContent,
        toolCalls.length > 0 ? toolCalls : undefined,
        usage,
        telemetry,
        undefined,
      );
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      resetStream();
      useAppStore.getState().addLogEntry({
        timestamp: Date.now(), level: 'info', category: 'chat',
        message: `Response: ${accumulatedContent.length} chars`,
      });
      abortRef.current = null;

      window.setTimeout(() => {
        fetchSavings()
          .then((data) => useAppStore.getState().setSavings(data))
          .catch(() => {});
      }, 250);
    }
  }, [
    input,
    attachments,
    activeId,
    effectiveModel,
    models,
    modelsLoading,
    selectedModel,
    streamState.isStreaming,
    createConversation,
    addMessage,
    updateLastAssistant,
    setStreamState,
    resetStream,
    setSelectedModel,
  ]);

  useEffect(() => {
    const handleExternalInput = (event: Event) => {
      const customEvent = event as CustomEvent<{ text?: string; replace?: boolean }>;
      const text = customEvent.detail?.text?.trim();
      if (!text) return;
      if (customEvent.detail?.replace) {
        setInput(text);
      } else {
        setInput((prev) => (prev ? `${prev} ${text}` : text));
      }
      requestAnimationFrame(() => textareaRef.current?.focus());
    };

    const handleSubmitInput = () => {
      void sendMessage();
    };

    const handleInterruptStream = () => {
      if (streamState.isStreaming) stopStreaming();
    };

    window.addEventListener('jarvis:set-input', handleExternalInput as EventListener);
    window.addEventListener('jarvis:submit-input', handleSubmitInput);
    window.addEventListener('jarvis:interrupt-stream', handleInterruptStream);
    return () => {
      window.removeEventListener('jarvis:set-input', handleExternalInput as EventListener);
      window.removeEventListener('jarvis:submit-input', handleSubmitInput);
      window.removeEventListener('jarvis:interrupt-stream', handleInterruptStream);
    };
  }, [sendMessage, stopStreaming, streamState.isStreaming]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (effectiveModel && (input.trim() || attachments.length)) {
        void sendMessage();
      }
    }
  };

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
    setAttachmentNotice('');
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    void ingestFiles(event.dataTransfer.files);
  }, [ingestFiles]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!dragActive) setDragActive(true);
  }, [dragActive]);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDragActive(false);
  }, []);

  const inputPlaceholder = streamState.isStreaming
    ? 'JARVIS is responding...'
    : modelsLoading && !effectiveModel
      ? 'Models are loading... you can type while JARVIS gets ready'
      : !effectiveModel
        ? 'Select a model to send your message'
        : attachments.length
          ? 'Add context or send the attached files'
          : 'Message OpenJarvis or drop in a text file...';

  return (
    <div className="px-4 pb-4 pt-2" style={{ maxWidth: 'var(--chat-max-width)', margin: '0 auto', width: '100%' }}>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className="rounded-2xl px-4 py-3 transition-shadow"
        style={{
          background: 'var(--color-input-bg)',
          border: `1px solid ${dragActive ? 'var(--color-accent)' : 'var(--color-input-border)'}`,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {dragActive ? (
          <div
            className="mb-3 rounded-2xl border border-dashed px-4 py-3 text-center text-sm"
            style={{
              borderColor: 'var(--color-accent)',
              background: 'var(--color-accent-subtle)',
              color: 'var(--color-text-secondary)',
            }}
          >
            Drop text, code, or config files here and JARVIS will attach them to your next message.
          </div>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = event.target.files;
            if (files?.length) void ingestFiles(files);
            event.currentTarget.value = '';
          }}
        />
        <div className="flex items-center gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={inputPlaceholder}
            rows={1}
            className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed"
            style={{ color: 'var(--color-text)', maxHeight: '200px' }}
            disabled={streamState.isStreaming}
          />
          {streamState.isStreaming ? (
            <button
              onClick={stopStreaming}
              className="p-2 rounded-xl transition-colors shrink-0 cursor-pointer"
              style={{ background: 'var(--color-error)', color: 'white' }}
              title="Stop generating"
            >
              <Square size={16} />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-xl transition-colors shrink-0 cursor-pointer"
                style={{ color: 'var(--color-text-secondary)' }}
                title="Attach text files"
              >
                <Paperclip size={16} />
              </button>
              <MicButton
                state={speechState}
                onClick={handleMicClick}
                disabled={micDisabled}
                reason={micReason}
              />
              <button
                onClick={sendMessage}
                disabled={(!input.trim() && !attachments.length) || !effectiveModel}
                className="p-2 rounded-xl transition-colors shrink-0 cursor-pointer disabled:opacity-30 disabled:cursor-default"
                style={{
                  background: input.trim() || attachments.length ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                  color: input.trim() || attachments.length ? 'white' : 'var(--color-text-tertiary)',
                }}
                title="Send message"
              >
                <Send size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
      {attachments.length ? (
        <div className="mt-2 grid gap-2">
          {attachments.map((file) => (
            <div
              key={file.id}
              className="rounded-2xl px-3 py-3 text-[11px]"
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium" style={{ color: 'var(--color-text)' }}>{file.name}</div>
                  <div style={{ color: 'var(--color-text-tertiary)' }}>
                    {formatFileSize(file.size)}{file.truncated ? ' · shortened for chat' : ''}
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveAttachment(file.id)}
                  className="cursor-pointer"
                  style={{ color: 'var(--color-text-tertiary)' }}
                  title={`Remove ${file.name}`}
                >
                  Remove
                </button>
              </div>
              <div className="mt-2 text-xs leading-5" style={{ color: 'var(--color-text-secondary)' }}>
                {attachmentPreview(file.content)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {attachmentNotice ? (
        <div className="mt-2 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
          {attachmentNotice}
        </div>
      ) : null}
      <div className="flex items-center justify-center mt-2 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
        <span>
          <kbd className="font-mono">Enter</kbd> to send &middot;{' '}
          <kbd className="font-mono">Shift+Enter</kbd> for new line &middot; Drop text files to attach
        </span>
      </div>
    </div>
  );
}
