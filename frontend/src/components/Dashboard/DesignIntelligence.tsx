export type DesignBrief = {
  summary: string;
  creativePrompt: string;
  implementationPrompt: string;
};

export function DesignIntelligence({
  designBrief,
  onLoadPrompt,
  onLoadBrief,
  onRouteToPlanner,
}: {
  designBrief: DesignBrief | null;
  onLoadPrompt: (mode: 'critique' | 'system' | 'creative' | 'implementation') => void;
  onLoadBrief: () => void;
  onRouteToPlanner: () => void;
}) {
  return (
    <div className="mt-4 rounded-[1rem] border border-cyan-400/10 bg-slate-950/55 p-3">
      <div className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/55">Design Intelligence</div>
      <div className="mt-2 text-sm leading-7 text-slate-200/75">
        Turn visual, product, and project context into stronger creative direction and implementation guidance.
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {([
          ['Design Critique', () => onLoadPrompt('critique')],
          ['Design System', () => onLoadPrompt('system')],
          ['Creative Direction', () => onLoadPrompt('creative')],
          ['Design To Code', () => onLoadPrompt('implementation')],
        ] as const).map(([label, action]) => (
          <button
            key={label}
            type="button"
            onClick={action}
            className="rounded-[0.95rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-3 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
          >
            {label}
          </button>
        ))}
      </div>
      {designBrief ? (
        <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Design Brief</div>
          <div className="mt-2 text-sm leading-6 text-cyan-50/88">{designBrief.summary}</div>
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
              className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-500/20"
            >
              Route To Planner
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
