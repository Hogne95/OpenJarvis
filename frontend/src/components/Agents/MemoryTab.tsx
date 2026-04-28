import { Brain } from 'lucide-react';

export function MemoryTab({ summaryMemory }: { summaryMemory?: string | null }) {
  return (
    <div
      className="p-4 rounded-lg"
      style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
    >
      <h3 className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
        <Brain size={14} /> Summary Memory
      </h3>
      <p className="whitespace-pre-wrap text-sm" style={{ color: 'var(--color-text)' }}>
        {summaryMemory || 'No stored memory yet. Once the agent runs, JARVIS will keep a compact summary here.'}
      </p>
    </div>
  );
}
