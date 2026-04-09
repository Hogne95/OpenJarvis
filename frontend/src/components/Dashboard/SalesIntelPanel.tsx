export type SalesIntelBrief = {
  title: string;
  summary: string;
  details: string;
  prompt: string;
  plannerPrompt: string;
  accountBriefPrompt: string;
  dealReviewPrompt: string;
  followUpPrompt: string;
  objectionPrompt: string;
  meetingPrepPrompt: string;
  draftRecipient: string;
  draftSubject: string;
  draftBody: string;
  primaryAccountLabel: string;
  primaryDealLabel: string;
  counts: Array<{ label: string; value: string }>;
  focusItems: Array<{ label: string; detail: string }>;
};

export function SalesIntelPanel({
  brief,
  architectureBusy,
  onLoadBrief,
  onRouteToPlanner,
  onMakeTask,
  onLoadPrompt,
  onDraftFollowUp,
  onSaveAccountNote,
  onMarkDealRisk,
}: {
  brief: SalesIntelBrief | null;
  architectureBusy: boolean;
  onLoadBrief: () => void;
  onRouteToPlanner: () => void;
  onMakeTask: () => void;
  onLoadPrompt: (mode: 'account-brief' | 'deal-review' | 'follow-up' | 'objection' | 'meeting-prep') => void;
  onDraftFollowUp: () => void;
  onSaveAccountNote: () => void;
  onMarkDealRisk: () => void;
}) {
  return (
    <div className="mt-4 rounded-[1rem] border border-cyan-400/10 bg-slate-950/55 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/55">Sales Intel</div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">pipeline / deals / follow-up</div>
      </div>
      <div className="mt-2 text-sm leading-7 text-slate-200/75">
        Turn sales memory, inbox activity, and follow-up pressure into a practical pipeline brief.
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
            <button
              type="button"
              onClick={onDraftFollowUp}
              className="rounded-full border border-fuchsia-300/20 bg-fuchsia-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-fuchsia-100 transition hover:border-fuchsia-300/40 hover:bg-fuchsia-500/20"
            >
              Draft Follow-Up
            </button>
            <button
              type="button"
              onClick={onSaveAccountNote}
              className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-amber-100 transition hover:border-amber-300/40 hover:bg-amber-500/20"
            >
              Save Account Note
            </button>
            <button
              type="button"
              onClick={onMarkDealRisk}
              className="rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-rose-100 transition hover:border-rose-300/40 hover:bg-rose-500/20"
            >
              Mark Deal Risk
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">Primary Account</div>
              <div className="mt-2 text-sm leading-6 text-slate-200/76">{brief.primaryAccountLabel}</div>
            </div>
            <div className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">Primary Deal</div>
              <div className="mt-2 text-sm leading-6 text-slate-200/76">{brief.primaryDealLabel}</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/50">Reasoning Modes</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onLoadPrompt('account-brief')}
                className="rounded-full border border-cyan-400/20 bg-slate-950/70 px-3 py-1.5 text-[10px] uppercase tracking-[0.26em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
              >
                Account Brief
              </button>
              <button
                type="button"
                onClick={() => onLoadPrompt('deal-review')}
                className="rounded-full border border-cyan-400/20 bg-slate-950/70 px-3 py-1.5 text-[10px] uppercase tracking-[0.26em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
              >
                Deal Review
              </button>
              <button
                type="button"
                onClick={() => onLoadPrompt('follow-up')}
                className="rounded-full border border-cyan-400/20 bg-slate-950/70 px-3 py-1.5 text-[10px] uppercase tracking-[0.26em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
              >
                Follow-Up Strategy
              </button>
              <button
                type="button"
                onClick={() => onLoadPrompt('objection')}
                className="rounded-full border border-cyan-400/20 bg-slate-950/70 px-3 py-1.5 text-[10px] uppercase tracking-[0.26em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
              >
                Objection Handling
              </button>
              <button
                type="button"
                onClick={() => onLoadPrompt('meeting-prep')}
                className="rounded-full border border-cyan-400/20 bg-slate-950/70 px-3 py-1.5 text-[10px] uppercase tracking-[0.26em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
              >
                Meeting Prep
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3 text-sm leading-6 text-slate-300/72">
          Save a few sales accounts, leads, or deals first. JARVIS will turn them into a live pipeline brief here.
        </div>
      )}
    </div>
  );
}
