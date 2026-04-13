import { Suspense, lazy, useState, useMemo } from 'react';
import { Copy, Check } from 'lucide-react';
import { AudioPlayer } from './AudioPlayer';
import { ToolCallCard } from './ToolCallCard';
import { XRayFooter } from './XRayFooter';
import type { ChatMessage } from '../../types';

const RichMessageMarkdown = lazy(() =>
  import('./RichMessageMarkdown').then((module) => ({ default: module.RichMessageMarkdown })),
);

function stripThinkTags(text: string): string {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>\s*/gi, '');
  cleaned = cleaned.replace(/^[\s\S]*?<\/think>\s*/i, '');
  return cleaned.trim();
}

function looksLikeRichMarkdown(text: string): boolean {
  return (
    /```/.test(text) ||
    /^\s*#{1,6}\s/m.test(text) ||
    /^\s*[-*+]\s/m.test(text) ||
    /^\s*\d+\.\s/m.test(text) ||
    /\[[^\]]+\]\([^)]+\)/.test(text) ||
    /\|.+\|/.test(text) ||
    /`[^`]+`/.test(text) ||
    /\$\$[\s\S]+\$\$/.test(text)
  );
}

interface Props {
  message: ChatMessage;
}

function CopyMessageButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
      style={{ color: 'var(--color-text-tertiary)' }}
      title="Copy message"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div
          className="max-w-[85%] px-4 py-2.5 text-sm leading-relaxed"
          style={{
            background: 'var(--color-user-bubble)',
            color: 'var(--color-user-bubble-text)',
            borderRadius: 'var(--radius-xl) var(--radius-xl) var(--radius-sm) var(--radius-xl)',
          }}
        >
          {message.content ? (
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {message.content}
            </div>
          ) : null}
          {message.attachments?.length ? (
            <div className={`${message.content ? 'mt-3' : ''} space-y-2`}>
              {message.attachments.map((file) => (
                <div
                  key={file.id}
                  className="rounded-2xl px-3 py-2.5"
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{file.name}</div>
                      <div className="text-[11px] opacity-75">
                        {file.size < 1024
                          ? `${file.size} B`
                          : file.size < 1024 * 1024
                            ? `${(file.size / 1024).toFixed(1)} KB`
                            : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                        {file.truncated ? ' · shortened for chat' : ''}
                      </div>
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.18em] opacity-70">
                      Attached
                    </div>
                  </div>
                  {file.preview ? (
                    <div className="mt-2 text-xs leading-5 opacity-85">
                      {file.preview}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const cleanContent = useMemo(() => stripThinkTags(message.content), [message.content]);
  const useRichMarkdown = useMemo(() => looksLikeRichMarkdown(cleanContent), [cleanContent]);

  return (
    <div className="group mb-6">
      {/* Tool calls */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {message.toolCalls.map((tc) => (
            <ToolCallCard key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}

      {/* Audio player (e.g. morning digest) */}
      {message.audio?.url && <AudioPlayer src={message.audio.url} />}

      {/* Assistant message */}
      {cleanContent && (
        useRichMarkdown ? (
          <Suspense fallback={<div className="whitespace-pre-wrap break-words">{cleanContent}</div>}>
            <RichMessageMarkdown content={cleanContent} />
          </Suspense>
        ) : (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>
            {cleanContent}
          </div>
        )
      )}

      {/* Footer: copy + x-ray */}
      <div className="flex items-center gap-2 mt-1.5">
        <CopyMessageButton content={cleanContent} />
      </div>
      <XRayFooter usage={message.usage} telemetry={message.telemetry} />
    </div>
  );
}
