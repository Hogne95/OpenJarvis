export type FivemCodingBrief = {
  title: string;
  summary: string;
  details: string;
  resourceKey: string;
  framework: string;
  topology: string;
  serverStructure: string;
  nativeFamilies: string[];
  riskTags: string[];
  canonSummary: string;
  canonPriorities: string[];
  canonWatchouts: string[];
  canonExploitPatterns: string[];
  canonConsoleChecks: string[];
  focusItems: Array<{ label: string; detail: string }>;
};

export function FivemCodingPanel({
  brief,
  onLoadPrompt,
  onSaveBrief,
  onLoadSavedBrief,
  recentBriefs,
}: {
  brief: FivemCodingBrief | null;
  onLoadPrompt: (
    mode:
      | 'fivem-review'
      | 'lua-logic'
      | 'native-usage'
      | 'native-reference'
      | 'event-flow'
      | 'state-audit'
      | 'console-debug'
      | 'server-structure'
      | 'resource-architecture'
      | 'fivem-security'
      | 'qbcore-review'
      | 'esx-review'
      | 'ox-review'
      | 'topology-review',
  ) => void;
  onSaveBrief: () => void;
  onLoadSavedBrief: (item: {
    id: string;
    label: string;
    resource_key: string;
    framework: string;
    topology: string;
    summary: string;
    details: string;
    native_families?: string[];
    risk_tags?: string[];
    created_at: string;
  }) => void;
  recentBriefs: Array<{
    id: string;
    label: string;
    resource_key: string;
    framework: string;
    topology: string;
    summary: string;
    details: string;
    native_families?: string[];
    risk_tags?: string[];
    created_at: string;
  }>;
}) {
  if (!brief) return null;
  const matchingHistory = recentBriefs.filter((item) => item.resource_key === brief.resourceKey);
  return (
    <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
      <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">FiveM / Lua Intel</div>
      <div className="text-sm leading-7 text-slate-200/78">{brief.summary}</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-[0.85rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">Framework</div>
          <div className="mt-1 text-sm text-cyan-50/92">{brief.framework}</div>
        </div>
        <div className="rounded-[0.85rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">Topology</div>
          <div className="mt-1 text-sm text-cyan-50/92">{brief.topology}</div>
        </div>
        <div className="rounded-[0.85rem] border border-cyan-400/10 bg-black/20 px-3 py-3 sm:col-span-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">Server Structure</div>
          <div className="mt-1 text-sm text-cyan-50/92">{brief.serverStructure}</div>
        </div>
      </div>
      <div className="mt-3 rounded-[0.85rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">Resource Key</div>
        <div className="mt-1 break-all text-sm text-cyan-50/92">{brief.resourceKey}</div>
      </div>
      {brief.nativeFamilies.length ? (
        <div className="mt-3 rounded-[0.85rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">Native Focus</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {brief.nativeFamilies.map((family) => (
              <div
                key={family}
                className="rounded-full border border-cyan-400/10 bg-cyan-400/[0.06] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-100/78"
              >
                {family}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {brief.riskTags.length ? (
        <div className="mt-3 rounded-[0.85rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">Risk Tags</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {brief.riskTags.map((item) => (
              <div
                key={item}
                className="rounded-full border border-rose-300/10 bg-rose-400/[0.06] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-rose-100/80"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-3 rounded-[0.85rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">Framework Canon</div>
        <div className="mt-2 text-sm leading-6 text-slate-200/76">{brief.canonSummary}</div>
        {brief.canonPriorities.length ? (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">Priorities</div>
            <div className="mt-2 space-y-2">
              {brief.canonPriorities.map((item) => (
                <div key={item} className="rounded-[0.75rem] border border-cyan-400/10 bg-slate-950/40 px-3 py-2 text-xs leading-6 text-slate-200/74">
                  {item}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {brief.canonWatchouts.length ? (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">Watchouts</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {brief.canonWatchouts.map((item) => (
                <div
                  key={item}
                  className="rounded-full border border-amber-300/10 bg-amber-400/[0.06] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-100/80"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {brief.canonExploitPatterns.length ? (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">Exploit Patterns</div>
            <div className="mt-2 space-y-2">
              {brief.canonExploitPatterns.map((item) => (
                <div key={item} className="rounded-[0.75rem] border border-rose-300/10 bg-rose-500/[0.06] px-3 py-2 text-xs leading-6 text-rose-100/78">
                  {item}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {brief.canonConsoleChecks.length ? (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">Console Checks</div>
            <div className="mt-2 space-y-2">
              {brief.canonConsoleChecks.map((item) => (
                <div key={item} className="rounded-[0.75rem] border border-cyan-300/10 bg-cyan-500/[0.06] px-3 py-2 text-xs leading-6 text-cyan-100/78">
                  {item}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3 font-mono text-xs leading-6 text-slate-200/72">
        {brief.details}
      </pre>
      {brief.focusItems.length ? (
        <div className="mt-3 space-y-2">
          {brief.focusItems.map((item) => (
            <div key={`${item.label}-${item.detail}`} className="rounded-[0.85rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/60">{item.label}</div>
              <div className="mt-1 text-sm leading-6 text-slate-200/76">{item.detail}</div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {([
          ['FiveM Review', 'fivem-review'],
          ['Lua Logic', 'lua-logic'],
          ['Native Usage', 'native-usage'],
          ['Native Ref', 'native-reference'],
          ['Event Flow', 'event-flow'],
          ['State Audit', 'state-audit'],
          ['Console Debug', 'console-debug'],
          ['Server Struct', 'server-structure'],
          ['Resource Arch', 'resource-architecture'],
          ['Security Audit', 'fivem-security'],
          ['QBCore', 'qbcore-review'],
          ['ESX', 'esx-review'],
          ['ox_*', 'ox-review'],
          ['Topology', 'topology-review'],
        ] as const).map(([label, mode]) => (
          <button
            key={mode}
            onClick={() => onLoadPrompt(mode)}
            className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-3 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSaveBrief}
          className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-500/20"
        >
          Save Brief
        </button>
      </div>
      {recentBriefs.length ? (
        <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Recent FiveM Briefs</div>
          <div className="mt-3 space-y-3">
            {recentBriefs.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/45 px-3 py-3">
                <div className="text-sm text-cyan-50/92">{item.label}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                  {item.framework || 'fivem'} / {item.topology || 'unknown'} / {item.created_at || 'saved'}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-200/74">{item.summary}</div>
                {item.risk_tags?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.risk_tags.slice(0, 4).map((tag) => (
                      <div
                        key={tag}
                        className="rounded-full border border-rose-300/10 bg-rose-400/[0.06] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-rose-100/80"
                      >
                        {tag}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onLoadSavedBrief(item)}
                    className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-500/20"
                  >
                    Load Brief
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {matchingHistory.length > 1 ? (
        <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Resource History</div>
          <div className="mt-3 space-y-2">
            {matchingHistory.slice(0, 4).map((item) => (
              <div key={`history-${item.id}`} className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/45 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-cyan-50/92">{item.label}</div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">{item.created_at || 'saved'}</div>
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-200/74">{item.summary}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
