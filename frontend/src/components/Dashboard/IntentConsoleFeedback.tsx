import type { JarvisIntent, JarvisIntentExecution } from '../../lib/api';

export function IntentConsoleFeedback({
  intentPreview,
  intentExecution,
}: {
  intentPreview: JarvisIntent | null;
  intentExecution: JarvisIntentExecution | null;
}) {
  const metadata = intentExecution?.result?.metadata || null;
  const targetReady = Boolean(metadata?.target_ready);
  const targetReason = String(metadata?.target_reason || 'No readiness note available.');
  const activeWindowTitle = String(metadata?.active_window_title || '');
  const submitMode = String(metadata?.submit_mode || '');
  const showTargetReadiness = Boolean(metadata && ('target_ready' in metadata || 'active_window_title' in metadata));

  return (
    <>
      {intentPreview ? (
        <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Intent Preview</div>
          <div className="mt-1 text-sm text-cyan-50/92">
            {intentPreview.type} / {intentPreview.action}
          </div>
          <div className="mt-1 text-xs uppercase tracking-[0.22em] text-cyan-300/55">
            Risk: {intentPreview.risk} {intentPreview.requires_approval ? '/ approval required' : ''}
          </div>
          <div className="mt-2 text-sm text-slate-200/76">
            {intentPreview.content || intentPreview.query || intentPreview.target || intentPreview.command || 'No extra detail.'}
          </div>
        </div>
      ) : null}

      {intentExecution?.result?.content ? (
        <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Intent Result</div>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm text-slate-200/76">
            {intentExecution.result.content}
          </pre>
        </div>
      ) : null}

      {showTargetReadiness ? (
        <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Target Readiness</div>
            <div className={`text-[10px] uppercase tracking-[0.22em] ${targetReady ? 'text-emerald-300/80' : 'text-amber-300/80'}`}>
              {targetReady ? 'ready' : 'verify first'}
            </div>
          </div>
          <div className="mt-2 text-sm text-slate-200/76">{targetReason}</div>
          {activeWindowTitle ? <div className="mt-2 text-xs text-cyan-200/65">Active window: {activeWindowTitle}</div> : null}
          {submitMode ? <div className="mt-1 text-xs uppercase tracking-[0.18em] text-cyan-200/65">Submit mode: {submitMode}</div> : null}
        </div>
      ) : null}

      {intentExecution?.result?.items?.length ? (
        <div className="mt-3 space-y-2">
          {intentExecution.result.items.slice(0, 3).map((item, index) => (
            <div
              key={`${item.content}-${index}`}
              className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3"
            >
              <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                Memory Match / {item.score.toFixed(2)}
              </div>
              <div className="mt-2 text-sm text-slate-200/76">{item.content}</div>
            </div>
          ))}
        </div>
      ) : null}

      {intentExecution?.result?.sources?.length ? (
        <div className="mt-3 grid gap-2">
          {intentExecution.result.sources.slice(0, 4).map((item) => (
            <div
              key={`${item.url}-${item.title}`}
              className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3"
            >
              <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Web Source</div>
              <div className="mt-1 text-sm text-cyan-50/92">{item.title}</div>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block text-xs text-cyan-300/80 underline-offset-4 hover:underline"
              >
                {item.url}
              </a>
              <div className="mt-2 text-sm text-slate-200/76">{item.snippet}</div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
