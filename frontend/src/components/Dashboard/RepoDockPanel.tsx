export function RepoDockPanel({
  activeWorkspaceRepo,
  workspaceSummary,
  repoPathInput,
  onRepoPathInputChange,
  onRegisterRepo,
  repoBusy,
  repoCloneUrl,
  onRepoCloneUrlChange,
  onLoadCloneRepoCommand,
  workspaceRepos,
  onSelectRepo,
  repoNotice,
}: {
  activeWorkspaceRepo: any;
  workspaceSummary: any;
  repoPathInput: string;
  onRepoPathInputChange: (value: string) => void;
  onRegisterRepo: () => void;
  repoBusy: 'register' | 'select' | null;
  repoCloneUrl: string;
  onRepoCloneUrlChange: (value: string) => void;
  onLoadCloneRepoCommand: () => void;
  workspaceRepos: any;
  onSelectRepo: (root: string) => void;
  repoNotice: string;
}) {
  const activeRepoName =
    activeWorkspaceRepo?.name || workspaceSummary?.root?.split(/[\\\\/]/).slice(-1)[0] || 'No repo selected';
  const activeRepoDetail =
    activeWorkspaceRepo?.remote_url || workspaceSummary?.remote_url || workspaceSummary?.root || 'Connect a repo to unlock coding, review, and safe git actions.';
  const trackedRepos = workspaceRepos?.repos || [];
  const hasTrackedRepos = trackedRepos.length > 0;
  const changedCount = workspaceSummary?.changed_count || 0;
  const currentBranch = workspaceSummary?.branch || activeWorkspaceRepo?.branch || 'Unknown';
  const connectSummary = hasTrackedRepos
    ? `You already have ${trackedRepos.length} tracked repo${trackedRepos.length === 1 ? '' : 's'}. Pick one below or connect a new one.`
    : 'Start by connecting a repo that is already on this computer, or prepare a safe clone command first.';

  return (
    <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
      <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">Connected Repo</div>
      <div className="grid gap-3">
        <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Active Repo</div>
          <div className="mt-1 text-sm text-cyan-50/92">
            {activeRepoName}
          </div>
          <div className="mt-1 text-xs text-slate-300/70">
            {activeRepoDetail}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Branch</div>
            <div className="mt-1 text-sm text-cyan-50/92">{currentBranch}</div>
          </div>
          <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Changes</div>
            <div className="mt-1 text-sm text-cyan-50/92">{changedCount ? `${changedCount} file${changedCount === 1 ? '' : 's'} changed` : 'Repo is calm'}</div>
          </div>
          <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Best Next Move</div>
            <div className="mt-1 text-sm text-cyan-50/92">{hasTrackedRepos ? 'Pick a repo and inspect it' : 'Connect your first repo'}</div>
          </div>
        </div>

        <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Quick Guidance</div>
          <div className="mt-2 text-sm leading-6 text-slate-200/80">
            {connectSummary}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Connect an Existing Repo</div>
          <div className="mb-3 text-xs leading-6 text-slate-300/70">
            Use this when the repo is already on your machine and you want JARVIS to start working with it right away.
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_160px]">
            <input
              value={repoPathInput}
              onChange={(event) => onRepoPathInputChange(event.target.value)}
              placeholder="Local repo path, for example C:\\dev\\my-repo"
              className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <button
              onClick={onRegisterRepo}
              disabled={repoBusy !== null}
              className="rounded-[0.9rem] border border-cyan-300/20 bg-cyan-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.28em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {repoBusy === 'register' ? 'Connecting' : 'Connect Repo'}
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Or Prepare a Safe Clone</div>
          <div className="mb-3 text-xs leading-6 text-slate-300/70">
            Use this when the repo is not on this machine yet and you want JARVIS to prepare the clone step first.
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_160px]">
            <input
              value={repoCloneUrl}
              onChange={(event) => onRepoCloneUrlChange(event.target.value)}
              placeholder="Clone URL, for example https://github.com/org/repo.git"
              className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <button
              onClick={onLoadCloneRepoCommand}
              className="rounded-[0.9rem] border border-cyan-400/12 bg-slate-950/70 px-4 py-3 text-xs uppercase tracking-[0.28em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
            >
              Prepare Clone
            </button>
          </div>
        </div>

        {hasTrackedRepos ? (
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Tracked Repos</div>
            <div className="mb-3 text-xs leading-6 text-slate-300/70">
              Jump back into a repo you already connected.
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
            {trackedRepos.slice(0, 6).map((repo: any) => (
              <button
                key={repo.root}
                onClick={() => onSelectRepo(repo.root)}
                disabled={repoBusy !== null || repo.root === workspaceRepos.active_root}
                className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3 text-left transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">
                  {repo.root === workspaceRepos.active_root ? 'Active' : 'Tracked'}
                </div>
                <div className="mt-1 text-sm text-cyan-50/92">{repo.name}</div>
                <div className="mt-1 text-xs text-slate-300/70">
                  {repo.branch ? `Branch: ${repo.branch}` : 'Branch unknown'}
                </div>
              </button>
            ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3 text-sm text-slate-200/72">
            No tracked repos yet. Connect one local repo or load a clone command to get started.
          </div>
        )}
        {repoNotice ? <div className="text-sm text-cyan-100/80">{repoNotice}</div> : null}
      </div>
    </div>
  );
}
