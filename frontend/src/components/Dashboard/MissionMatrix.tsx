type MissionPhase = 'detect' | 'plan' | 'act' | 'verify' | 'retry' | 'done';
type MissionStatus = 'idle' | 'active' | 'blocked' | 'complete';

export type MissionMatrixItem = {
  id: string;
  title: string;
  domain: 'self-improve' | 'planner' | 'visual' | 'document' | 'design' | 'sales' | 'customer';
  status: MissionStatus;
  phase: MissionPhase;
  summary: string;
  nextStep: string;
  result: string;
  retryHint?: string;
  nextActionLabel?: string;
  resultMeta?: string[];
  actionLabel: string;
  action?: () => void;
};

function missionPhaseLabel(phase: MissionPhase) {
  switch (phase) {
    case 'detect':
      return 'Detect';
    case 'plan':
      return 'Plan';
    case 'act':
      return 'Act';
    case 'verify':
      return 'Verify';
    case 'retry':
      return 'Retry';
    case 'done':
      return 'Done';
    default:
      return phase;
  }
}

export function MissionMatrix({
  missions,
  onRunMission,
}: {
  missions: Array<MissionMatrixItem & { action: () => void }>;
  onRunMission: (mission: MissionMatrixItem & { action: () => void }) => void | Promise<void>;
}) {
  return (
    <>
      <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3">
        <div className="text-sm uppercase tracking-[0.18em] text-cyan-50/92">
          {missions.length ? `${missions.length} active mission lane${missions.length === 1 ? '' : 's'}` : 'Mission loop standing by'}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
          Detect / Plan / Act / Verify / Retry
        </div>
      </div>
      {missions.length ? (
        <div className="mt-3 space-y-3">
          {missions.slice(0, 4).map((mission) => (
            <div key={mission.id} className="rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-cyan-50/92">{mission.title}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                    {mission.domain} / {mission.status} / {missionPhaseLabel(mission.phase)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void onRunMission(mission)}
                  className="rounded-[0.85rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
                >
                  {mission.actionLabel}
                </button>
              </div>
              <div className="mt-2 text-sm text-slate-200/78">{mission.summary}</div>
              <div className="mt-2 text-xs leading-6 text-slate-300/72">Next: {mission.nextStep}</div>
              <div className="mt-1 text-xs leading-6 text-slate-300/60">Result: {mission.result}</div>
              {mission.nextActionLabel ? (
                <div className="mt-1 text-xs leading-6 text-cyan-200/78">Action: {mission.nextActionLabel}</div>
              ) : null}
              {mission.resultMeta?.length ? (
                <div className="mt-1 flex flex-wrap gap-2">
                  {mission.resultMeta.slice(0, 3).map((item) => (
                    <div
                      key={item}
                      className="rounded-full border border-cyan-400/10 bg-cyan-400/[0.06] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-200/70"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              ) : null}
              {mission.retryHint ? <div className="mt-1 text-xs leading-6 text-amber-200/78">Retry: {mission.retryHint}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-sm leading-6 text-slate-200/76">
          Once JARVIS has a self-improvement mission, delegated brief, or active visual workflow, it will show up here with a shared mission lifecycle.
        </div>
      )}
    </>
  );
}
