export type CustomerIntelBrief = {
  title: string;
  summary: string;
  details: string;
  prompt: string;
  plannerPrompt: string;
  counts: Array<{ label: string; value: string }>;
  focusItems: Array<{ label: string; detail: string }>;
};

export function CustomerIntelPanel({
  brief,
  architectureBusy,
  onLoadBrief,
  onRouteToPlanner,
  onMakeTask,
}: {
  brief: CustomerIntelBrief | null;
  architectureBusy: boolean;
  onLoadBrief: () => void;
  onRouteToPlanner: () => void;
  onMakeTask: () => void;
}) {
  return (
    <div className="mt-4 rounded-[1rem] border border-cyan-400/10 bg-slate-950/55 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/55">Customer Intel</div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">support / success / churn risk</div>
      </div>
      <div className="mt-2 text-sm leading-7 text-slate-200/75">
        Turn customer memory, live interactions, and inbox pressure into a practical customer-health brief.
      </div>
      {brief ? (
        <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">{brief.title}</div>
          <div className="mt-2 text-sm leading-6 text-cyan-50/88">{brief.summary}</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {brief.counts.map((item) => (
              <div key={item.label} className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">{item.label}</div>
                <div className="mt-1 text-lg text-cyan-50/92">{item.value}</div>
              </div>
            ))}
          </div>
          {brief.focusItems.length ? (
            <div className="mt-3 space-y-2">
              {brief.focusItems.map((item) => (
                <div key={`${item.label}-${item.detail}`} className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">{item.label}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-200/76">{item.detail}</div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onLoadBrief}
              className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-500/20"
            >
              Load Brief
            </button>
            <button
              type="button"
              onClick={onRouteToPlanner}
              disabled={architectureBusy}
              className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {architectureBusy ? 'Routing' : 'Route To Planner'}
            </button>
            <button
              type="button"
              onClick={onMakeTask}
              className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-emerald-100 transition hover:border-emerald-300/40 hover:bg-emerald-500/20"
            >
              Make Task
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3 text-sm leading-6 text-slate-300/72">
          Save a few customer accounts or interactions first. JARVIS will turn them into a live customer-health brief here.
        </div>
      )}
    </div>
  );
}
