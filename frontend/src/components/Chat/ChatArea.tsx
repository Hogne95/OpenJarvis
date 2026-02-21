import type { ChatMessage, StreamState, Conversation, ServerInfo } from '../../types';
import { MessageList } from './MessageList';
import { StreamingIndicator } from './StreamingIndicator';
import { InputArea } from './InputArea';

interface ChatAreaProps {
  messages: ChatMessage[];
  streamState: StreamState;
  onSendMessage: (content: string) => void;
  onStopStreaming: () => void;
  activeConversation: Conversation | null;
  serverInfo: ServerInfo | null;
}

export function ChatArea({
  messages,
  streamState,
  onSendMessage,
  onStopStreaming,
  activeConversation,
  serverInfo,
}: ChatAreaProps) {
  // Cumulative token counts for the conversation
  const totalPrompt = messages.reduce(
    (sum, m) => sum + (m.usage?.prompt_tokens || 0),
    0,
  );
  const totalCompletion = messages.reduce(
    (sum, m) => sum + (m.usage?.completion_tokens || 0),
    0,
  );
  const totalTokens = totalPrompt + totalCompletion;

  return (
    <main className="chat-area">
      <div className="chat-header">
        <div className="chat-header-title">
          {activeConversation ? activeConversation.title : 'OpenJarvis Chat'}
        </div>
        <div className="chat-header-meta">
          {serverInfo && (
            <div className="chat-header-info">
              <span className="header-badge model-badge">
                {serverInfo.model || 'unknown'}
              </span>
              {serverInfo.agent && (
                <span className="header-badge agent-badge">
                  {serverInfo.agent}
                </span>
              )}
            </div>
          )}
          {totalTokens > 0 && (
            <div className="chat-header-tokens">
              {totalPrompt.toLocaleString()} in / {totalCompletion.toLocaleString()} out
            </div>
          )}
        </div>
      </div>
      <MessageList messages={messages} isStreaming={streamState.isStreaming} />
      {streamState.isStreaming && (
        <StreamingIndicator
          phase={streamState.phase}
          elapsedMs={streamState.elapsedMs}
          toolCalls={streamState.activeToolCalls}
        />
      )}
      <InputArea
        onSend={onSendMessage}
        onStop={onStopStreaming}
        isStreaming={streamState.isStreaming}
      />
    </main>
  );
}
