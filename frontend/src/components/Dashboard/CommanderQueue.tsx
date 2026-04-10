import type { CommanderQueueDisplayItem as CommanderQueueItem } from '../../lib/commanderPresentation';

export function CommanderQueue({
  items,
}: {
  items: CommanderQueueItem[];
}) {
  return (
    <div className="space-y-3">
      {items.length ? (
        items.map((item) => (
          <div
            key={item.id}
            className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">{item.label}</div>
                <div className="mt-1 text-sm uppercase tracking-[0.14em] text-cyan-50/92">{item.title}</div>
              </div>
              <button
                type="button"
                onClick={item.action}
                className="rounded-[0.85rem] border border-cyan-300/20 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
              >
                {item.actionLabel}
              </button>
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-200/72">{item.detail}</div>
            {(item.executionLane || item.verificationSignal) ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {item.executionLane ? (
                  <div className="rounded-full border border-cyan-300/15 bg-cyan-400/[0.06] px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-cyan-200/80">
                    {item.executionLane}
                  </div>
                ) : null}
                {item.verificationSignal ? (
                  <div className="text-xs leading-5 text-slate-300/68">
                    Verify: {item.verificationSignal}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ))
      ) : (
        <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-200/72">
          No urgent work in queue. JARVIS is clear to listen, monitor, and prepare the next routine.
        </div>
      )}
    </div>
  );
}
