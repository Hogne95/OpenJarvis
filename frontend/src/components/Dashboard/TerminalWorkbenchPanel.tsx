export function TerminalWorkbenchPanel({
  workbenchCommand,
  onWorkbenchCommandChange,
  workbenchDirectory,
  onWorkbenchDirectoryChange,
  workbenchTimeout,
  onWorkbenchTimeoutChange,
  onStageWorkbenchCommand,
  workbenchBusy,
}: {
  workbenchCommand: string;
  onWorkbenchCommandChange: (value: string) => void;
  workbenchDirectory: string;
  onWorkbenchDirectoryChange: (value: string) => void;
  workbenchTimeout: number;
  onWorkbenchTimeoutChange: (value: number) => void;
  onStageWorkbenchCommand: () => void;
  workbenchBusy: 'stage' | 'approve' | 'hold' | null;
}) {
  return (
    <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
      <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">Terminal Workbench</div>
      <div className="grid gap-3">
        <input
          value={workbenchCommand}
          onChange={(event) => onWorkbenchCommandChange(event.target.value)}
          placeholder="pwd, git status, ls, python -V ..."
          className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />
        <div className="grid gap-3 md:grid-cols-[1fr_120px_160px]">
          <input
            value={workbenchDirectory}
            onChange={(event) => onWorkbenchDirectoryChange(event.target.value)}
            placeholder="Working directory"
            className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <input
            type="number"
            min={1}
            max={300}
            value={workbenchTimeout}
            onChange={(event) => onWorkbenchTimeoutChange(Number(event.target.value) || 30)}
            className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none"
          />
          <button
            onClick={onStageWorkbenchCommand}
            disabled={workbenchBusy !== null}
            className="rounded-[0.9rem] border border-cyan-300/20 bg-cyan-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.28em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {workbenchBusy === 'stage' ? 'Staging' : 'Stage Command'}
          </button>
        </div>
      </div>
    </div>
  );
}
