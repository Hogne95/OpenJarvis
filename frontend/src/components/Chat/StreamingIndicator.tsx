import type { ToolCallInfo } from '../../types';
import { ToolCallIndicator } from './ToolCallIndicator';

interface StreamingIndicatorProps {
  phase: string;
  elapsedMs: number;
  toolCalls: ToolCallInfo[];
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${seconds}.${tenths}s`;
}

export function StreamingIndicator({
  phase,
  elapsedMs,
  toolCalls,
}: StreamingIndicatorProps) {
  return (
    <div className="streaming-indicator">
      <div className="streaming-bar-container">
        <div className="streaming-bar" />
      </div>
      <span className="streaming-phase">{phase}</span>
      <span className="streaming-elapsed">{formatElapsed(elapsedMs)}</span>
    </div>
  );
}
