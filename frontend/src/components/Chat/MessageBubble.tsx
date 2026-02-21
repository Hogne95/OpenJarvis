import type { ChatMessage } from '../../types';
import { ToolCallIndicator } from './ToolCallIndicator';
import { CopyButton } from './CopyButton';

interface MessageBubbleProps {
  message: ChatMessage;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const usage = message.usage;

  return (
    <div className={`message-bubble ${message.role}`}>
      <div className="message-content">
        {message.content || (message.role === 'assistant' ? '\u200B' : '')}
        {message.role === 'assistant' && message.content && (
          <CopyButton text={message.content} />
        )}
      </div>
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="tool-calls">
          {message.toolCalls.map((tc) => (
            <ToolCallIndicator key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}
      <div className="message-meta">
        <span className="message-time">{formatTime(message.timestamp)}</span>
        {usage && (
          <span className="message-tokens">
            {usage.prompt_tokens} in / {usage.completion_tokens} out
          </span>
        )}
      </div>
    </div>
  );
}
