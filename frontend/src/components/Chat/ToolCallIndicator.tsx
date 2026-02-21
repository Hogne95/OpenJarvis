import type { ToolCallInfo } from '../../types';

interface ToolCallIndicatorProps {
  toolCall: ToolCallInfo;
}

export function ToolCallIndicator({ toolCall }: ToolCallIndicatorProps) {
  return (
    <div className="tool-call">
      <span className={`tool-status ${toolCall.status}`} />
      <span className="tool-name">{toolCall.tool}</span>
      {toolCall.latency !== undefined && (
        <span className="tool-latency">{toolCall.latency.toFixed(0)}ms</span>
      )}
    </div>
  );
}
