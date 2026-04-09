export type DesignBrief = {
  summary: string;
  details: string;
  critiquePrompt: string;
  systemPrompt: string;
  creativePrompt: string;
  implementationPrompt: string;
  screenAuditPrompt: string;
  scorecardPrompt: string;
  archetypeLabel: string;
  canonSummary: string;
  principles: string[];
  watchouts: string[];
  scorecard: Array<{
    label: string;
    score: number;
    note: string;
  }>;
};

export function DesignIntelligence({
  designBrief,
  currentArchetype,
  presetArchetypes,
  recentBriefs,
  onApplyArchetype,
  onLoadPrompt,
  onLoadBrief,
  onRouteToPlanner,
  onSaveBrief,
  onLoadSavedBrief,
  onAuditSavedBrief,
}: {
  designBrief: DesignBrief | null;
  currentArchetype: string;
  presetArchetypes: Array<{ id: string; label: string }>;
  recentBriefs: Array<{
    id: string;
    label: string;
    archetype: string;
    summary: string;
    details: string;
    scorecard?: Array<{
      label: string;
      score: number;
      note: string;
    }>;
    created_at: string;
  }>;
  onApplyArchetype: (value: string) => void;
  onLoadPrompt: (mode: 'critique' | 'system' | 'creative' | 'implementation' | 'screen-audit' | 'scorecard') => void;
  onLoadBrief: () => void;
  onRouteToPlanner: () => void;
  onSaveBrief: () => void;
  onLoadSavedBrief: (item: {
    id: string;
    label: string;
    archetype: string;
    summary: string;
    details: string;
    scorecard?: Array<{
      label: string;
      score: number;
      note: string;
    }>;
    created_at: string;
  }) => void;
  onAuditSavedBrief: (item: {
    id: string;
    label: string;
    archetype: string;
    summary: string;
    details: string;
    scorecard?: Array<{
      label: string;
      score: number;
      note: string;
    }>;
    created_at: string;
  }) => void;
}) {
  const recentAverages = recentBriefs
    .map((item) => {
      const scorecard = item.scorecard || [];
      if (!scorecard.length) return null;
      const average = scorecard.reduce((sum, entry) => sum + entry.score, 0) / scorecard.length;
      return { id: item.id, average };
    })
    .filter(Boolean) as Array<{ id: string; average: number }>;
  const latestAverage = recentAverages[0]?.average ?? null;
  const previousAverage = recentAverages[1]?.average ?? null;
  const averageDelta =
    latestAverage !== null && previousAverage !== null ? latestAverage - previousAverage : null;

  return (
    <div className="mt-4 rounded-[1rem] border border-cyan-400/10 bg-slate-950/55 p-3">
      <div className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/55">Design Intelligence</div>
      <div className="mt-2 text-sm leading-7 text-slate-200/75">
        Turn visual, product, and project context into stronger creative direction and implementation guidance.
      </div>
      <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Current Archetype</div>
        <div className="mt-2 text-sm leading-6 text-cyan-50/88">{currentArchetype}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {presetArchetypes.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onApplyArchetype(preset.label)}
              className={`rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.24em] transition ${
                currentArchetype === preset.label
                  ? 'border-cyan-300/40 bg-cyan-400/18 text-cyan-50'
                  : 'border-cyan-400/16 bg-cyan-500/8 text-cyan-100 hover:border-cyan-300/30 hover:bg-cyan-500/18'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {([
          ['Design Critique', () => onLoadPrompt('critique')],
          ['Design System', () => onLoadPrompt('system')],
          ['Creative Direction', () => onLoadPrompt('creative')],
          ['Design To Code', () => onLoadPrompt('implementation')],
          ['Screen Audit', () => onLoadPrompt('screen-audit')],
          ['HUD Scorecard', () => onLoadPrompt('scorecard')],
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
      {latestAverage !== null ? (
        <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Score Trend</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-sm text-cyan-50/92">Latest average HUD score</div>
            <div className="text-lg text-cyan-50">{latestAverage.toFixed(1)}/10</div>
          </div>
          <div className="mt-2 text-sm text-slate-300/72">
            {averageDelta === null
              ? 'Trend will appear after at least two saved design briefs.'
              : averageDelta > 0
              ? `Improving by ${averageDelta.toFixed(1)} points versus the previous saved brief.`
              : averageDelta < 0
              ? `Down by ${Math.abs(averageDelta).toFixed(1)} points versus the previous saved brief.`
              : 'Flat versus the previous saved brief.'}
          </div>
        </div>
      ) : null}
      {designBrief ? (
        <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Design Brief</div>
          <div className="mt-2 text-sm leading-6 text-cyan-50/88">{designBrief.summary}</div>
          <div className="mt-3 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Design Canon</div>
          <div className="mt-2 text-sm leading-6 text-slate-200/74">{designBrief.archetypeLabel}</div>
          <div className="mt-2 text-sm leading-6 text-slate-300/70">{designBrief.canonSummary}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {designBrief.principles.map((principle) => (
              <span
                key={principle}
                className="rounded-full border border-cyan-400/14 bg-cyan-500/8 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-cyan-100/85"
              >
                {principle}
              </span>
            ))}
          </div>
          <div className="mt-3 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Watchouts</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {designBrief.watchouts.map((watchout) => (
              <span
                key={watchout}
                className="rounded-full border border-amber-400/18 bg-amber-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-amber-100/88"
              >
                {watchout}
              </span>
            ))}
          </div>
          <div className="mt-3 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">HUD Scorecard</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {designBrief.scorecard.map((item) => (
              <div
                key={item.label}
                className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">{item.label}</div>
                  <div className="text-sm text-cyan-50/92">{item.score}/10</div>
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-300/72">{item.note}</div>
              </div>
            ))}
          </div>
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
              onClick={onSaveBrief}
              className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-500/20"
            >
              Save Brief
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
      {recentBriefs.length ? (
        <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Recent Design Briefs</div>
          <div className="mt-3 space-y-3">
            {recentBriefs.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/45 px-3 py-3">
                <div className="text-sm text-cyan-50/92">{item.label}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                  {item.archetype || 'design'} / {item.created_at || 'saved'}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-200/74">{item.summary}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onLoadSavedBrief(item)}
                    className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-500/20"
                  >
                    Load Brief
                  </button>
                  <button
                    type="button"
                    onClick={() => onAuditSavedBrief(item)}
                    className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-500/20"
                  >
                    Audit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
