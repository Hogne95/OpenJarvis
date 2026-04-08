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
  return (
    <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
      <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">Repo Dock</div>
      <div className="grid gap-3">
        <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Active Repo</div>
          <div className="mt-1 text-sm text-cyan-50/92">
            {activeWorkspaceRepo?.name || workspaceSummary?.root?.split(/[\\\\/]/).slice(-1)[0] || 'Workspace'}
          </div>
          <div className="mt-1 text-xs text-slate-300/70">
            {activeWorkspaceRepo?.remote_url || workspaceSummary?.remote_url || workspaceSummary?.root || 'No repo registered yet.'}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_160px]">
          <input
            value={repoPathInput}
            onChange={(event) => onRepoPathInputChange(event.target.value)}
            placeholder="C:\\dev\\my-repo or /mnt/c/dev/my-repo"
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
        <div className="grid gap-3 md:grid-cols-[1fr_160px]">
          <input
            value={repoCloneUrl}
            onChange={(event) => onRepoCloneUrlChange(event.target.value)}
            placeholder="https://github.com/org/repo.git"
            className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <button
            onClick={onLoadCloneRepoCommand}
            className="rounded-[0.9rem] border border-cyan-400/12 bg-slate-950/70 px-4 py-3 text-xs uppercase tracking-[0.28em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
          >
            Load Clone Cmd
          </button>
        </div>
        {workspaceRepos?.repos?.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {workspaceRepos.repos.slice(0, 6).map((repo: any) => (
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
                <div className="mt-1 text-xs text-slate-300/70">{repo.branch}</div>
              </button>
            ))}
          </div>
        ) : null}
        {repoNotice ? <div className="text-sm text-cyan-100/80">{repoNotice}</div> : null}
      </div>
    </div>
  );
}
