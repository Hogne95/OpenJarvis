import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Send } from 'lucide-react';
import {
  fetchAgentMessages,
  fetchManagedAgent,
  sendAgentMessage,
} from '../../lib/api';
import type { AgentMessage } from '../../lib/api';

const AgentMarkdown = lazy(() =>
  import('../AgentMarkdown').then((module) => ({ default: module.AgentMarkdown })),
);

const isDocumentHidden = () => typeof document !== 'undefined' && document.hidden;

type InteractMessage = AgentMessage & {
  _elapsed?: string;
  _toolCalls?: number;
  _usage?: Record<string, number>;
  _telemetry?: Record<string, unknown>;
};

function AgentResponseFooter({
  msg,
  copiedId,
  onCopy,
}: {
  msg: InteractMessage;
  copiedId: string | null;
  onCopy: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const u = msg._usage;
  const t = msg._telemetry as Record<string, unknown> | undefined;
  const elapsed = msg._elapsed;
  const toolCalls = msg._toolCalls || 0;

  const parts: string[] = [];
  if (t?.engine) parts.push(String(t.engine));
  if (t?.model_id) parts.push(String(t.model_id));
  if (elapsed) parts.push(`${elapsed}s`);
  if (u?.prompt_tokens) parts.push(`${u.prompt_tokens} input tokens`);
  if (u?.completion_tokens) parts.push(`${u.completion_tokens} output tokens`);
  if (toolCalls > 0) parts.push(`${toolCalls} tool ${toolCalls === 1 ? 'call' : 'calls'}`);

  const summary = parts.length > 0 ? parts.join(' - ') : elapsed ? `${elapsed}s` : '';

  const rows: Array<{ label: string; value: string }> = [];
  if (t?.engine) rows.push({ label: 'Engine', value: `${t.engine}${t.model_id ? ` (${t.model_id})` : ''}` });
  if (u) {
    const tokenParts = [];
    if (u.completion_tokens) tokenParts.push(`${u.completion_tokens} generated`);
    if (u.prompt_tokens) tokenParts.push(`${u.prompt_tokens} prompt`);
    if (tokenParts.length) rows.push({ label: 'Tokens', value: tokenParts.join(' - ') });
  }
  if (toolCalls > 0) rows.push({ label: 'Tool calls', value: `${toolCalls}` });
  if (t?.tokens_per_sec) rows.push({ label: 'Speed', value: `${Math.round(Number(t.tokens_per_sec))} tok/s` });
  if (t?.total_ms) rows.push({ label: 'Latency', value: `${(Number(t.total_ms) / 1000).toFixed(1)}s total` });

  if (!summary) return null;

  return (
    <div style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', paddingTop: 4 }}>
        <button
          onClick={() => rows.length > 0 && setExpanded(!expanded)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: rows.length > 0 ? 'pointer' : 'default',
            padding: 0, textAlign: 'left',
          }}
        >
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--color-accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'system-ui' }}>
            {summary}
          </span>
          {rows.length > 0 && (
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
              {expanded ? 'Hide details' : 'Details'}
            </span>
          )}
        </button>
        <button
          onClick={() => onCopy(msg.id)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-tertiary)', padding: 2,
            display: 'flex', alignItems: 'center',
          }}
          title="Copy response"
        >
          {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      {expanded && rows.length > 0 && (
        <div style={{
          borderRadius: 6, marginTop: 4, padding: '6px 10px',
          background: 'rgba(0, 0, 0, 0.15)',
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr',
            columnGap: 12, rowGap: 2,
          }}>
            {rows.map((row) => (
              <div key={row.label} style={{ display: 'contents' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>
                  {row.label}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function InteractTab({
  agentId,
  agentStatus,
  agentName,
}: {
  agentId: string;
  agentStatus: string;
  agentName: string;
}) {
  const [messages, setMessages] = useState<InteractMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [currentActivity, setCurrentActivity] = useState('');
  const [liveStatus, setLiveStatus] = useState(agentStatus);
  const [streamElapsedMs, setStreamElapsedMs] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localMetaRef = useRef<Map<string, {
    _elapsed?: string;
    _toolCalls?: number;
    _usage?: Record<string, number>;
    _telemetry?: Record<string, unknown>;
  }>>(new Map());

  const loadData = useCallback(async () => {
    try {
      const [msgs, agent] = await Promise.all([
        fetchAgentMessages(agentId),
        fetchManagedAgent(agentId),
      ]);
      const merged: InteractMessage[] = msgs.map((m) => {
        const meta = localMetaRef.current.get(m.content?.slice(0, 100) || '');
        return meta ? { ...m, ...meta } : m;
      });
      setMessages(merged);
      setLiveStatus(agent.status);
      setCurrentActivity(agent.current_activity || '');
    } catch {
      // Leave the current transcript visible if a refresh fails.
    }
  }, [agentId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      if (isDocumentHidden()) return;
      void loadData();
    }, waitingForResponse || liveStatus === 'running' ? 2000 : 5000);
    return () => clearInterval(interval);
  }, [loadData, liveStatus, waitingForResponse]);

  useEffect(() => { setLiveStatus(agentStatus); }, [agentStatus]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const hasScrolled = useRef(false);
  useEffect(() => {
    if (!hasScrolled.current && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      hasScrolled.current = true;
    }
  }, [messages]);

  useEffect(() => {
    if (streamingContent) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamingContent]);

  async function handleSend(mode: 'immediate' | 'queued') {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    setSending(true);

    const localMsg: AgentMessage = {
      id: `local-${Date.now()}`,
      agent_id: agentId,
      direction: 'user_to_agent',
      content: text,
      mode,
      status: 'delivered',
      created_at: Date.now() / 1000,
    };
    setMessages((prev) => [localMsg, ...prev]);
    setSending(false);
    setWaitingForResponse(true);
    setProgressLabel('Initializing agent...');
    setStreamingContent('');

    const startTime = Date.now();
    setStreamElapsedMs(0);
    timerRef.current = setInterval(() => {
      setStreamElapsedMs(Date.now() - startTime);
    }, 100);

    let toolCount = 0;
    let responseUsage: Record<string, number> | undefined;
    let responseTelemetry: Record<string, unknown> | undefined;
    try {
      const response = await sendAgentMessage(agentId, text, mode, {
        onProgress: (label) => {
          setProgressLabel(label);
          toolCount++;
        },
        onContentDelta: (_delta, full) => setStreamingContent(full),
        onDone: (_content, usage, telemetry) => {
          setStreamingContent('');
          responseUsage = usage;
          responseTelemetry = telemetry;
        },
      });
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (response && response.content) {
        const meta = {
          _elapsed: elapsed,
          _toolCalls: toolCount,
          _usage: responseUsage,
          _telemetry: responseTelemetry,
        };
        localMetaRef.current.set(response.content.slice(0, 100), meta);
        setMessages((prev) => [
          {
            ...response,
            id: response.id || `response-${Date.now()}`,
            direction: 'agent_to_user' as const,
            ...meta,
          },
          ...prev,
        ]);
      }
      await loadData();
    } catch {
      // Keep the optimistic user message visible.
    } finally {
      setWaitingForResponse(false);
      setStreamingContent('');
      setProgressLabel('');
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setStreamElapsedMs(0);
    }
  }

  const displayMessages = [...messages]
    .filter((m) => m.direction === 'user_to_agent' || m.content.trim())
    .reverse();
  const quickStarters = [
    `What are you best at, ${agentName}?`,
    'Give me one concrete way you can help right now.',
    'What should I connect first to make you more useful?',
  ];

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 320 }}>
      <div className="flex-1 overflow-y-auto space-y-3 pb-4" style={{ maxHeight: 400 }}>
        {displayMessages.length === 0 && !waitingForResponse && (
          <div
            className="rounded-xl p-5 text-center"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
          >
            <div className="text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
              {liveStatus === 'running'
                ? currentActivity || `${agentName} is already working on something.`
                : `Start your first conversation with ${agentName}`}
            </div>
            <div className="text-sm mb-4" style={{ color: 'var(--color-text-tertiary)' }}>
              {liveStatus === 'running'
                ? 'You can still send a message if you want to redirect or clarify the job.'
                : 'A short first message works best. Ask what the agent is best at, what it needs connected, or give it one clear task.'}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {quickStarters.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => setInput(starter)}
                  className="px-3 py-2 rounded-lg text-xs cursor-pointer"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}
        {displayMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.direction === 'user_to_agent' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className="max-w-[75%] px-3 py-2 rounded-lg text-sm"
              style={{
                background: msg.direction === 'user_to_agent' ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
                color: msg.direction === 'user_to_agent' ? '#fff' : 'var(--color-text)',
                border: msg.direction === 'agent_to_user' ? '1px solid var(--color-border)' : 'none',
              }}
            >
              {msg.direction === 'agent_to_user' ? (
                <Suspense fallback={<div className="whitespace-pre-wrap break-words">{msg.content}</div>}>
                  <AgentMarkdown content={msg.content} />
                </Suspense>
              ) : (
                <p>{msg.content}</p>
              )}
              <p className="text-xs mt-1 opacity-70">
                {msg.status === 'pending' ? 'sending...' : new Date(msg.created_at * 1000).toLocaleTimeString()}
              </p>
              {msg.direction === 'agent_to_user' && (
                <AgentResponseFooter msg={msg} copiedId={copiedId} onCopy={(id) => {
                  navigator.clipboard.writeText(msg.content);
                  setCopiedId(id);
                  setTimeout(() => setCopiedId(null), 2000);
                }} />
              )}
            </div>
          </div>
        ))}
        {(waitingForResponse || sending) && !streamingContent && (
          <div className="flex justify-start">
            <div
              className="px-3 py-2 rounded-lg text-sm"
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--color-accent)' }} />
                {sending
                  ? 'Sending message...'
                  : progressLabel || 'Agent is thinking...'}
              </div>
            </div>
          </div>
        )}
        {waitingForResponse && streamingContent && (
          <div className="flex justify-start">
            <div
              className="max-w-[75%] px-3 py-2 rounded-lg text-sm"
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            >
              {progressLabel && (
                <div className="flex items-center gap-2 mb-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--color-accent)' }} />
                  {progressLabel}
                </div>
              )}
              <p className="whitespace-pre-wrap">{streamingContent}</p>
              <p className="text-xs mt-1 opacity-70">
                {streamElapsedMs > 0 && `${(streamElapsedMs / 1000).toFixed(1)}s elapsed`}
              </p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div
        className="mt-3 pt-3"
        style={{ borderTop: '1px solid var(--color-border)' }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend('immediate');
            }
          }}
          placeholder="Send a message to this agent..."
          className="w-full px-3 py-2 rounded-lg text-sm bg-transparent outline-none resize-none"
          style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)', minHeight: 72 }}
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => handleSend('immediate')}
            disabled={sending || waitingForResponse || !input.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer font-medium"
            style={{ background: 'var(--color-accent)', color: '#fff', opacity: sending || !input.trim() ? 0.5 : 1 }}
          >
            <Send size={13} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
