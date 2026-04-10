import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AppWindow,
  CheckCircle2,
  Cpu,
  Loader2,
  Play,
  Power,
  RadioTower,
  RefreshCw,
  SquareTerminal,
  XCircle,
} from 'lucide-react';
import {
  getDesktopRuntimeStatus,
  hideDesktopWindow,
  isTauri,
  prepareDesktopShutdown,
  quitDesktopApp,
  restartDesktopRuntime,
  showDesktopWindow,
  startDesktopRuntime,
  stopDesktopRuntime,
  type DesktopRuntimeStatus,
} from '../lib/api';

const isDocumentHidden = () => typeof document !== 'undefined' && document.hidden;

type BusyState =
  | 'idle'
  | 'refreshing'
  | 'starting'
  | 'stopping'
  | 'restarting'
  | 'showing'
  | 'hiding'
  | 'standing-down'
  | 'quitting';

function StatusChip({ ready, label }: { ready: boolean; label: string }) {
  return (
    <div
      className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.22em] ${
        ready ? 'bg-emerald-300/10 text-emerald-200' : 'bg-amber-300/10 text-amber-200'
      }`}
    >
      {label}
    </div>
  );
}

export function DesktopPage() {
  const navigate = useNavigate();
  const [runtime, setRuntime] = useState<DesktopRuntimeStatus | null>(null);
  const [busy, setBusy] = useState<BusyState>('idle');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setBusy('refreshing');
    setNotice('');
    try {
      setRuntime(await getDesktopRuntimeStatus());
    } finally {
      setBusy('idle');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      if (isDocumentHidden()) return;
      void getDesktopRuntimeStatus().then(setRuntime);
    }, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function runAction(type: BusyState, action: () => Promise<void>, success: string) {
    setBusy(type);
    setNotice('');
    try {
      await action();
      setNotice(success);
      const next = await getDesktopRuntimeStatus();
      setRuntime(next);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Desktop action failed.');
    } finally {
      setBusy('idle');
    }
  }

  if (!isTauri()) {
    return (
      <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(8,47,73,0.35),rgba(2,6,23,0.96)_48%)] px-6 py-10 text-cyan-50">
        <div className="mx-auto max-w-4xl rounded-[1.6rem] border border-cyan-400/12 bg-slate-950/55 p-6">
          <div className="text-[11px] uppercase tracking-[0.38em] text-cyan-300/60">Desktop Shell</div>
          <h1 className="mt-2 text-3xl uppercase tracking-[0.22em] text-cyan-50">Desktop Runtime</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200/76">
            Root cause of the app-feel gap is that the native runtime only exists inside the Tauri build. Open this page inside the
            desktop app to control startup, tray behavior, and shutdown.
          </p>
        </div>
      </div>
    );
  }

  const setup = runtime?.setup;
  const checks = [
    { label: 'Inference', ready: !!setup?.ollama_ready },
    { label: 'Model', ready: !!setup?.model_ready },
    { label: 'API', ready: !!setup?.server_ready },
  ];

  return (
    <div className="min-h-full overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(8,47,73,0.35),rgba(2,6,23,0.96)_48%)] px-6 py-8 text-cyan-50">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.38em] text-cyan-300/60">Desktop Shell</div>
            <h1 className="mt-2 text-3xl uppercase tracking-[0.22em] text-cyan-50">JARVIS Desktop</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200/76">
              Root cause of the “not a real app yet” feeling was that startup, tray behavior, and shutdown lived half in scripts and
              half in the HUD. This page makes the native desktop runtime a first-class surface.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="rounded-[1rem] border border-cyan-400/15 bg-slate-950/70 px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
            >
              Back To HUD
            </button>
            <button
              onClick={() => void refresh()}
              disabled={busy !== 'idle'}
              className="rounded-[1rem] border border-cyan-400/15 bg-cyan-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'refreshing' ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </div>

        {notice ? (
          <div className="rounded-[1.2rem] border border-cyan-400/12 bg-slate-950/60 px-4 py-3 text-sm text-cyan-100/86">
            {notice}
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div className="rounded-[1.5rem] border border-cyan-400/12 bg-slate-950/55 p-5">
              <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/55">Runtime State</div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <StatusChip ready={setup?.phase === 'ready'} label={setup?.phase || 'unknown'} />
                {checks.map((check) => (
                  <StatusChip key={check.label} ready={check.ready} label={check.label} />
                ))}
              </div>
              <div className="mt-4 rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-4">
                <div className="text-sm uppercase tracking-[0.18em] text-cyan-50/92">Desktop Detail</div>
                <div className="mt-2 text-sm leading-7 text-slate-200/76">{setup?.detail || 'Waiting for desktop runtime status...'}</div>
                {setup?.error ? (
                  <div className="mt-3 rounded-[1rem] border border-rose-300/15 bg-rose-300/10 px-3 py-3 text-sm text-rose-100">
                    {setup.error}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-cyan-400/12 bg-slate-950/55 p-5">
              <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/55">Desktop Runtime</div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {[
                  { label: 'API Base', value: runtime?.api_base || 'Unknown', icon: RadioTower },
                  { label: 'Preferred Model', value: runtime?.preferred_model || 'Unknown', icon: Cpu },
                  { label: 'Project Root', value: runtime?.project_root || 'Not resolved yet', icon: SquareTerminal },
                  { label: 'Window State', value: runtime?.window_visible ? 'Visible' : 'Hidden to tray', icon: AppWindow },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl border border-cyan-400/12 bg-cyan-400/[0.07] p-2">
                        <Icon className="h-4 w-4 text-cyan-200" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">{label}</div>
                        <div className="mt-1 break-words text-sm leading-6 text-cyan-50/92">{value}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[1.5rem] border border-cyan-400/12 bg-slate-950/55 p-5">
              <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/55">Lifecycle Controls</div>
              <div className="mt-4 grid gap-3">
                <button
                  onClick={() => void runAction('starting', startDesktopRuntime, 'Desktop runtime start requested.')}
                  disabled={busy !== 'idle'}
                  className="rounded-[1rem] border border-cyan-400/15 bg-cyan-400/[0.08] px-4 py-3 text-left text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <Play className="h-4 w-4" />
                    Start Runtime
                  </span>
                </button>
                <button
                  onClick={() => void runAction('restarting', restartDesktopRuntime, 'Desktop runtime restart requested.')}
                  disabled={busy !== 'idle'}
                  className="rounded-[1rem] border border-cyan-400/15 bg-slate-950/70 px-4 py-3 text-left text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Restart Runtime
                  </span>
                </button>
                <button
                  onClick={() => void runAction('stopping', stopDesktopRuntime, 'Desktop runtime stopped.')}
                  disabled={busy !== 'idle'}
                  className="rounded-[1rem] border border-cyan-400/15 bg-slate-950/70 px-4 py-3 text-left text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <Power className="h-4 w-4" />
                    Stop Runtime
                  </span>
                </button>
                <button
                  onClick={() => void runAction('showing', showDesktopWindow, 'Main window shown.')}
                  disabled={busy !== 'idle'}
                  className="rounded-[1rem] border border-cyan-400/15 bg-slate-950/70 px-4 py-3 text-left text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Show Window
                </button>
                <button
                  onClick={() => void runAction('hiding', hideDesktopWindow, 'Window hidden to tray.')}
                  disabled={busy !== 'idle'}
                  className="rounded-[1rem] border border-cyan-400/15 bg-slate-950/70 px-4 py-3 text-left text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Hide To Tray
                </button>
                <button
                  onClick={() => void runAction('standing-down', prepareDesktopShutdown, 'Voice and runtime stood down cleanly.')}
                  disabled={busy !== 'idle'}
                  className="rounded-[1rem] border border-cyan-400/15 bg-slate-950/70 px-4 py-3 text-left text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Prepare Shutdown
                </button>
                <button
                  onClick={() => void runAction('quitting', quitDesktopApp, 'Desktop app is shutting down.')}
                  disabled={busy !== 'idle'}
                  className="rounded-[1rem] border border-rose-300/15 bg-rose-300/10 px-4 py-3 text-left text-xs uppercase tracking-[0.24em] text-rose-100 transition hover:bg-rose-300/14 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Quit Desktop App
                </button>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-cyan-400/12 bg-slate-950/55 p-5">
              <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/55">Desktop Guidance</div>
              <div className="mt-3 space-y-3 text-sm leading-7 text-slate-200/76">
                <p>Start runtime if the shell opens before the backend is ready. Restart runtime if voice or the API feel stale.</p>
                <p>Closing the window now hides JARVIS to the tray instead of killing the session. Use quit when you really want to stand it down.</p>
                <p>Shutdown should happen in this order: stop voice activity, stop the runtime, then quit the app.</p>
              </div>
              {busy !== 'idle' ? (
                <div className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-cyan-200/70">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {busy}
                </div>
              ) : null}
              <div className="mt-4 flex items-center gap-2 text-xs text-cyan-200/72">
                {setup?.error ? <XCircle className="h-4 w-4 text-rose-300" /> : <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
                {setup?.error ? 'Desktop runtime needs attention.' : 'Desktop runtime is under native lifecycle control.'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
