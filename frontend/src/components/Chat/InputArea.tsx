import { useState, useRef, useCallback } from 'react';

interface InputAreaProps {
  onSend: (content: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

export function InputArea({ onSend, onStop, isStreaming }: InputAreaProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    if (!value.trim() || isStreaming) return;
    onSend(value);
    setValue('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isStreaming, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize textarea
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  };

  return (
    <div className="input-area">
      <div className="input-container">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Shift+Enter for new line)"
          rows={1}
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button className="stop-btn" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!value.trim()}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
