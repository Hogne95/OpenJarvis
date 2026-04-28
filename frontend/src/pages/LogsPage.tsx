import { useRef, useEffect, useMemo, useState } from 'react';
import { ScrollText, Copy, Trash2, Info, AlertTriangle, AlertCircle, Check } from 'lucide-react';
import { useAppStore } from '../lib/store';

const LEVEL_COLORS: Record<string, string> = {
  info: 'var(--color-text)',
  warn: 'var(--color-warning)',
  error: 'var(--color-error)',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function LogsPage() {
  const logEntries = useAppStore((s) => s.logEntries);
  const clearLogs = useAppStore((s) => s.clearLogs);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logEntries.length]);

  const stats = useMemo(() => {
    return logEntries.reduce(
      (acc, entry) => {
        acc[entry.level] = (acc[entry.level] || 0) + 1;
        return acc;
      },
      { info: 0, warn: 0, error: 0 } as Record<string, number>,
    );
  }, [logEntries]);

  const latestEntry = logEntries[logEntries.length - 1];

  const handleCopy = async () => {
    const text = logEntries
      .map((e) => `${formatTime(e.timestamp)} [${e.level}] [${e.category}] ${e.message}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const summaryCards = [
    {
      label: 'Info',
      value: stats.info,
      icon: Info,
      tone: 'var(--color-text-secondary)',
      bg: 'var(--color-bg-secondary)',
    },
    {
      label: 'Warnings',
      value: stats.warn,
      icon: AlertTriangle,
      tone: 'var(--color-warning)',
      bg: 'color-mix(in srgb, var(--color-warning) 14%, transparent)',
    },
    {
      label: 'Errors',
      value: stats.error,
      icon: AlertCircle,
      tone: 'var(--color-error)',
      bg: 'color-mix(in srgb, var(--color-error) 14%, transparent)',
    },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-6">
      <div className="max-w-5xl mx-auto w-full flex flex-col flex-1 overflow-hidden gap-4">
        <div
          className="rounded-3xl p-5 md:p-6 shrink-0"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 10%, transparent), var(--color-surface))',
            border: '1px solid var(--color-border)',
          }}
        >
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div
                  className="rounded-2xl p-3"
                  style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}
                >
                  <ScrollText size={22} />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.28em]" style={{ color: 'var(--color-text-tertiary)' }}>
                    Runtime Trace
                  </div>
                  <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
                    Logs
                  </h1>
                </div>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-7" style={{ color: 'var(--color-text-secondary)' }}>
                Logs are now grouped so health, latest activity, and actions are easier to scan without digging through one plain stream.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy All'}
              </button>
              <button
                onClick={clearLogs}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
              >
                <Trash2 size={12} /> Clear
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.4fr)]">
            {summaryCards.map(({ label, value, icon: Icon, tone, bg }) => (
              <div key={label} className="rounded-2xl px-4 py-3" style={{ background: bg, border: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em]" style={{ color: tone }}>
                  <Icon size={14} />
                  {label}
                </div>
                <div className="mt-2 text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
                  {value}
                </div>
              </div>
            ))}

            <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
              <div className="text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--color-text-tertiary)' }}>
                Latest Activity
              </div>
              {latestEntry ? (
                <>
                  <div className="mt-2 text-sm font-medium" style={{ color: LEVEL_COLORS[latestEntry.level] || 'var(--color-text)' }}>
                    [{latestEntry.category}] {latestEntry.message}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                    {formatTime(latestEntry.timestamp)}
                  </div>
                </>
              ) : (
                <div className="mt-2 text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
                  No activity yet. Logs will appear as JARVIS starts doing work.
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto rounded-3xl p-4 md:p-5 font-mono text-xs leading-relaxed"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          {logEntries.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                No log entries yet
              </div>
              <div className="mt-2 max-w-md mx-auto" style={{ color: 'var(--color-text-tertiary)' }}>
                Logs appear as you chat, switch models, route agent work, and interact with the app.
              </div>
            </div>
          ) : (
            logEntries.map((entry, i) => (
              <div
                key={i}
                className="py-2 px-3 rounded-xl mb-2"
                style={{
                  background: i === logEntries.length - 1 ? 'var(--color-bg-secondary)' : 'transparent',
                  border: i === logEntries.length - 1 ? '1px solid var(--color-border)' : '1px solid transparent',
                }}
              >
                <span style={{ color: 'var(--color-text-tertiary)' }}>{formatTime(entry.timestamp)}</span>{' '}
                <span style={{ color: LEVEL_COLORS[entry.level] || 'var(--color-text)' }}>
                  [{entry.level}]
                </span>{' '}
                <span style={{ color: LEVEL_COLORS[entry.level] || 'var(--color-text)' }}>
                  [{entry.category}]
                </span>{' '}
                <span style={{ color: LEVEL_COLORS[entry.level] || 'var(--color-text)' }}>
                  {entry.message}
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
