import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Cpu, Loader2, Mic, RefreshCw, Siren, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  ensureCoreAgentArchitecture,
  fetchAgentArchitectureStatus,
  fetchRuntimeReadiness,
  fetchSpeechHealth,
  fetchVoiceLoopStatus,
  startVoiceLoop,
  stopVoiceLoop,
  type AgentArchitectureStatus,
  type RuntimeReadiness,
  type SpeechHealth,
  type VoiceLoopStatus,
} from '../lib/api';

type RefreshState = 'idle' | 'refreshing' | 'starting-voice' | 'stopping-voice' | 'ensuring-agents';

export function SystemPage() {
  const navigate = useNavigate();
  const [readiness, setReadiness] = useState<RuntimeReadiness | null>(null);
  const [speech, setSpeech] = useState<SpeechHealth | null>(null);
  const [voiceLoop, setVoiceLoop] = useState<VoiceLoopStatus | null>(null);
  const [architecture, setArchitecture] = useState<AgentArchitectureStatus | null>(null);
  const [busy, setBusy] = useState<RefreshState>('idle');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setBusy('refreshing');
    setNotice('');
    try {
      const [nextReadiness, nextSpeech, nextVoice, nextArchitecture] = await Promise.all([
        fetchRuntimeReadiness().catch(() => null),
        fetchSpeechHealth().catch(() => null),
        fetchVoiceLoopStatus().catch(() => null),
        fetchAgentArchitectureStatus().catch(() => null),
      ]);
      setReadiness(nextReadiness);
      setSpeech(nextSpeech);
      setVoiceLoop(nextVoice);
      setArchitecture(nextArchitecture);
    } finally {
      setBusy('idle');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleStartVoice() {
    setBusy('starting-voice');
    setNotice('');
    try {
      const next = await startVoiceLoop(['no', 'en']);
      setVoiceLoop(next);
      setNotice('Voice loop armed and ready.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to start voice loop.');
    } finally {
      setBusy('idle');
    }
  }

  async function handleStopVoice() {
    setBusy('stopping-voice');
    setNotice('');
    try {
      const next = await stopVoiceLoop();
      setVoiceLoop(next);
      setNotice('Voice loop disarmed.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to stop voice loop.');
    } finally {
      setBusy('idle');
    }
  }

  async function handleEnsureAgents() {
    setBusy('ensuring-agents');
    setNotice('');
    try {
      const next = await ensureCoreAgentArchitecture();
      setArchitecture(next);
      setNotice('Core agent architecture checked and refreshed.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to ensure the core agent team.');
    } finally {
      setBusy('idle');
    }
  }

  return (
    <div className="min-h-full overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(8,47,73,0.35),rgba(2,6,23,0.96)_48%)] px-6 py-8 text-cyan-50">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.38em] text-cyan-300/60">System Lifecycle</div>
            <h1 className="mt-2 text-3xl uppercase tracking-[0.22em] text-cyan-50">JARVIS Startup</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200/76">
              Root cause of the voice pain was that launch only started processes. It did not verify readiness, arm the voice loop,
              or surface what was still blocked. This page keeps startup, readiness, and shutdown controls in one calmer place.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void refresh()}
              disabled={busy !== 'idle'}
              className="rounded-[1rem] border border-cyan-400/15 bg-cyan-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'refreshing' ? 'Refreshing' : 'Refresh'}
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="rounded-[1rem] border border-cyan-400/15 bg-slate-950/70 px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
            >
              Back To HUD
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
              <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/55">Runtime Readiness</div>
              <div className="mt-4 grid gap-3">
                {(readiness?.checks || []).map((check) => (
                  <div
                    key={check.id}
                    className="rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm uppercase tracking-[0.18em] text-cyan-50/92">{check.label}</div>
                      <div
                        className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.22em] ${
                          check.status === 'ready'
                            ? 'bg-emerald-300/10 text-emerald-200'
                            : check.status === 'warning'
                            ? 'bg-amber-300/10 text-amber-200'
                            : 'bg-rose-300/10 text-rose-200'
                        }`}
                      >
                        {check.status}
                      </div>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-200/76">{check.detail}</div>
                    {check.recommendation ? (
                      <div className="mt-2 text-xs leading-6 text-cyan-200/72">{check.recommendation}</div>
                    ) : null}
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
                  onClick={() => void handleStartVoice()}
                  disabled={busy !== 'idle' || !speech?.available || !!voiceLoop?.active}
                  className="rounded-[1rem] border border-cyan-400/15 bg-cyan-400/[0.08] px-4 py-3 text-left text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Start Voice
                </button>
                <button
                  onClick={() => void handleStopVoice()}
                  disabled={busy !== 'idle' || !voiceLoop?.active}
                  className="rounded-[1rem] border border-cyan-400/15 bg-slate-950/70 px-4 py-3 text-left text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Stand Down Voice
                </button>
                <button
                  onClick={() => void handleEnsureAgents()}
                  disabled={busy !== 'idle'}
                  className="rounded-[1rem] border border-cyan-400/15 bg-slate-950/70 px-4 py-3 text-left text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Ensure Core Team
                </button>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-cyan-400/12 bg-slate-950/55 p-5">
              <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/55">Status</div>
              <div className="mt-4 space-y-3">
                {[
                  {
                    label: 'Speech',
                    value: speech?.available ? speech.backend || 'available' : speech?.reason || 'unavailable',
                    icon: Mic,
                    ready: !!speech?.available,
                  },
                  {
                    label: 'Voice Loop',
                    value: voiceLoop?.active ? `${voiceLoop.phase} · armed` : voiceLoop?.last_error || 'idle',
                    icon: Cpu,
                    ready: !!voiceLoop?.active,
                  },
                  {
                    label: 'Core Agents',
                    value: architecture?.roles?.filter((role) => role.ready).length
                      ? `${architecture.roles.filter((role) => role.ready).length} ready`
                      : 'not provisioned',
                    icon: Siren,
                    ready: !!architecture?.roles?.some((role) => role.ready),
                  },
                ].map(({ label, value, icon: Icon, ready }) => (
                  <div key={label} className="rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl border border-cyan-400/12 bg-cyan-400/[0.07] p-2">
                        <Icon className="h-4 w-4 text-cyan-200" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">{label}</div>
                        <div className="mt-1 text-sm text-cyan-50/92">{value}</div>
                      </div>
                      {ready ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                      ) : (
                        <XCircle className="h-4 w-4 text-amber-300" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-cyan-400/12 bg-slate-950/55 p-5">
              <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/55">Launch Guidance</div>
              <div className="mt-3 text-sm leading-7 text-slate-200/76">
                Startup is now intended to do three things in order: verify runtime readiness, arm the voice loop, and show you
                exactly what is still blocked. Shutdown should start by standing down voice before you close the session.
              </div>
              {busy !== 'idle' ? (
                <div className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-cyan-200/70">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {busy}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
