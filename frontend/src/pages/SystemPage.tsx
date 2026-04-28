import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Cpu, Loader2, Mic, RefreshCw, Siren, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  ensureCoreAgentArchitecture,
  fetchAgentArchitectureStatus,
  getDesktopRuntimeStatus,
  fetchOperatorMemoryContext,
  fetchOperatorMemoryAnalytics,
  fetchOperatorCommanderBrief,
  fetchOperatorCodingBrief,
  addOperatorReviewItem,
  handoffAgentArchitecture,
  fetchRuntimeReadiness,
  fetchSpeechHealth,
  fetchVoiceLoopStatus,
  isTauri,
  restartDesktopRuntime,
  startDesktopRuntime,
  startVoiceLoop,
  stopDesktopRuntime,
  stopVoiceLoop,
  type AgentArchitectureStatus,
  type DesktopRuntimeStatus,
  type OperatorMemoryContextResponse,
  type OperatorMemoryAnalyticsResponse,
  type OperatorCommanderBriefResponse,
  type OperatorCodingCommanderBriefResponse,
  type RuntimeReadiness,
  type SpeechHealth,
  type VoiceLoopStatus,
} from '../lib/api';
import { buildSystemAwarenessCards, buildSystemAwarenessHeadline } from '../lib/systemAwareness';

type RefreshState =
  | 'idle'
  | 'refreshing'
  | 'starting-voice'
  | 'stopping-voice'
  | 'ensuring-agents'
  | 'routing-commander'
  | 'routing-coding'
  | 'starting-runtime'
  | 'stopping-runtime'
  | 'restarting-runtime';
type MemoryLayerCard = [string, OperatorMemoryContextResponse['identity']];

export function SystemPage() {
  const navigate = useNavigate();
  const desktopMode = isTauri();
  const [codingObjective, setCodingObjective] = useState<'default' | 'release' | 'failing-tests' | 'diff-review'>('default');
  const [readiness, setReadiness] = useState<RuntimeReadiness | null>(null);
  const [speech, setSpeech] = useState<SpeechHealth | null>(null);
  const [voiceLoop, setVoiceLoop] = useState<VoiceLoopStatus | null>(null);
  const [architecture, setArchitecture] = useState<AgentArchitectureStatus | null>(null);
  const [desktopRuntime, setDesktopRuntime] = useState<DesktopRuntimeStatus | null>(null);
  const [memoryContext, setMemoryContext] = useState<OperatorMemoryContextResponse | null>(null);
  const [memoryAnalytics, setMemoryAnalytics] = useState<OperatorMemoryAnalyticsResponse | null>(null);
  const [commanderBrief, setCommanderBrief] = useState<OperatorCommanderBriefResponse | null>(null);
  const [codingBrief, setCodingBrief] = useState<OperatorCodingCommanderBriefResponse | null>(null);
  const [busy, setBusy] = useState<RefreshState>('idle');
  const [notice, setNotice] = useState('');
  const awarenessHeadline = useMemo(
    () => buildSystemAwarenessHeadline(architecture?.awareness),
    [architecture?.awareness],
  );
  const awarenessCards = useMemo(
    () => buildSystemAwarenessCards(architecture?.awareness),
    [architecture?.awareness],
  );
  const glanceCards = useMemo(
    () => [
      {
        label: 'Runtime',
        value: readiness
          ? `${readiness.summary.ready}/${readiness.summary.total} ready`
          : desktopRuntime?.setup?.phase || 'checking',
        detail: readiness
          ? `${readiness.summary.blocked} blocked checks still need attention.`
          : desktopRuntime?.setup?.detail || 'Waiting for runtime readiness details.',
      },
      {
        label: 'Voice',
        value: voiceLoop?.active ? `${voiceLoop.phase || 'active'} / armed` : speech?.available ? speech.backend || 'available' : 'standby',
        detail: voiceLoop?.last_error || speech?.reason || 'Voice loop and speech state are stable when armed.',
      },
      {
        label: 'Agents',
        value: architecture?.roles?.some((role) => role.ready)
          ? `${architecture.roles.filter((role) => role.ready).length} ready`
          : 'not provisioned',
        detail: architecture?.mission?.summary || 'Planner, executor, and supporting roles show up here once they are active.',
      },
      {
        label: 'Focus',
        value: commanderBrief?.best_next_step || codingBrief?.best_next_step || 'monitoring',
        detail:
          commanderBrief?.recommendation ||
          memoryAnalytics?.friction_brief?.recommended_focus ||
          'Commander and analytics will surface the main next move here.',
      },
    ],
    [
      architecture?.mission?.summary,
      architecture?.roles,
      codingBrief?.best_next_step,
      commanderBrief?.best_next_step,
      commanderBrief?.recommendation,
      desktopRuntime?.setup?.detail,
      desktopRuntime?.setup?.phase,
      memoryAnalytics?.friction_brief?.recommended_focus,
      readiness?.summary,
      speech?.available,
      speech?.backend,
      speech?.reason,
      voiceLoop?.active,
      voiceLoop?.last_error,
      voiceLoop?.phase,
    ],
  );

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
      const nextDesktopRuntime = desktopMode
        ? await getDesktopRuntimeStatus().catch(() => null)
        : null;
      setReadiness(nextReadiness);
      setSpeech(nextSpeech);
      setVoiceLoop(nextVoice);
      setArchitecture(nextArchitecture);
      setDesktopRuntime(nextDesktopRuntime);
      setMemoryContext(
        await fetchOperatorMemoryContext({
          query: 'What should JARVIS focus on next for this operator?',
          limit: 5,
        }).catch(() => null),
      );
      setMemoryAnalytics(await fetchOperatorMemoryAnalytics().catch(() => null));
      setCommanderBrief(await fetchOperatorCommanderBrief().catch(() => null));
      setCodingBrief(
        await fetchOperatorCodingBrief(codingObjective === 'default' ? '' : codingObjective).catch(() => null),
      );
    } finally {
      setBusy('idle');
    }
  }, [codingObjective, desktopMode]);

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

  async function handleRouteCommanderPlan() {
    if (!commanderBrief?.planner_prompt?.trim()) {
      setNotice('Commander brief is not ready to route yet.');
      return;
    }
    setBusy('routing-commander');
    setNotice('');
      try {
        const next = await handoffAgentArchitecture(commanderBrief.planner_prompt, 'system-commander');
        setArchitecture(next);
        setNotice(commanderBrief.execution_summary || 'Commander plan routed to the planner.');
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Unable to route the commander plan.');
      } finally {
      setBusy('idle');
    }
  }

  async function handleRouteCodingPlan() {
    if (!codingBrief?.planner_prompt?.trim()) {
      setNotice('Coding brief is not ready to route yet.');
      return;
    }
    setBusy('routing-coding');
    setNotice('');
    try {
      const next = await handoffAgentArchitecture(codingBrief.planner_prompt, 'system-coding', {
        objective: codingBrief.objective,
        workflow_mode: codingBrief.workflow_mode,
        repo_name: codingBrief.repo_name,
        repo_root: codingBrief.repo_root,
        branch: codingBrief.branch,
        preferred_checks: codingBrief.preferred_checks,
        deliverables: codingBrief.deliverables,
        exit_criteria: codingBrief.exit_criteria,
        report_template: codingBrief.report_template,
      });
      setArchitecture(next);
      setNotice(codingBrief.execution_summary || 'Coding plan routed to the planner.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to route the coding plan.');
    } finally {
      setBusy('idle');
    }
  }

  async function handleLogReviewItem() {
    setBusy('refreshing');
    setNotice('');
    try {
      await addOperatorReviewItem({
        category: 'quality',
        label: 'Operator review',
        summary: 'A recent answer or workflow felt weaker than expected and should be reviewed.',
        detail: 'Use this as a seed item for prompt, routing, or tool-chain refinement.',
        source: 'system-page',
      });
      setMemoryAnalytics(await fetchOperatorMemoryAnalytics().catch(() => null));
      setNotice('Review item queued for future tuning.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to queue review item.');
    } finally {
      setBusy('idle');
    }
  }

  async function handleDesktopRuntimeAction(
    action: 'start' | 'stop' | 'restart',
  ) {
    setBusy(
      action === 'start'
        ? 'starting-runtime'
        : action === 'stop'
          ? 'stopping-runtime'
          : 'restarting-runtime',
    );
    setNotice('');
    try {
      if (action === 'start') {
        await startDesktopRuntime();
      } else if (action === 'stop') {
        await stopDesktopRuntime();
      } else {
        await restartDesktopRuntime();
      }
      await new Promise((resolve) => window.setTimeout(resolve, action === 'restart' ? 1200 : 700));
      await refresh();
      setNotice(
        action === 'start'
          ? 'JARVIS runtime start requested.'
          : action === 'stop'
            ? 'JARVIS runtime stop requested.'
            : 'JARVIS runtime restart requested.',
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `Unable to ${action} JARVIS runtime.`);
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
              Startup now checks readiness, voice-loop state, and blocked services instead of only starting processes.
              This page keeps startup, readiness, and shutdown controls in one calmer place.
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
              onClick={() => navigate('/desktop')}
              className="rounded-[1rem] border border-cyan-400/15 bg-slate-950/70 px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08]"
            >
              Desktop Shell
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

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {glanceCards.map((card) => (
            <div
              key={card.label}
              className="rounded-[1.2rem] border border-cyan-400/12 bg-slate-950/55 px-4 py-4"
            >
              <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-300/55">{card.label}</div>
              <div className="mt-2 text-sm uppercase tracking-[0.12em] text-cyan-50/92">
                {card.value}
              </div>
              <div className="mt-2 text-xs leading-6 text-slate-200/72">{card.detail}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            {desktopMode ? (
              <div className="rounded-[1.5rem] border border-cyan-400/12 bg-slate-950/55 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/55">JARVIS Runtime</div>
                    <div className="mt-2 text-lg uppercase tracking-[0.18em] text-cyan-50/92">
                      {desktopRuntime?.setup?.phase || 'Runtime control'}
                    </div>
                  </div>
                  <div
                    className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.22em] ${
                      desktopRuntime?.setup?.error
                        ? 'bg-rose-300/10 text-rose-200'
                        : desktopRuntime?.setup?.server_ready
                          ? 'bg-emerald-300/10 text-emerald-200'
                          : 'bg-amber-300/10 text-amber-200'
                    }`}
                  >
                    {desktopRuntime?.setup?.server_ready ? 'running' : 'stopped'}
                  </div>
                </div>
                <div className="mt-3 text-sm leading-7 text-slate-200/76">
                  Start, stop, and restart controls are now inside the normal JARVIS control surface so you can cycle the stack
                  without leaving the app.
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">API Base</div>
                    <div className="mt-2 break-all text-sm text-cyan-50/92">
                      {desktopRuntime?.api_base || 'Unavailable'}
                    </div>
                  </div>
                  <div className="rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">Preferred Model</div>
                    <div className="mt-2 text-sm text-cyan-50/92">
                      {desktopRuntime?.preferred_model || 'Unavailable'}
                    </div>
                  </div>
                </div>
                <div className="mt-4 rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3 text-xs leading-6 text-slate-200/72">
                  {desktopRuntime?.setup?.detail || 'Desktop runtime status is not available yet.'}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => void handleDesktopRuntimeAction('start')}
                    disabled={busy !== 'idle'}
                    className="rounded-[1rem] border border-emerald-300/15 bg-emerald-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.24em] text-emerald-100 transition hover:bg-emerald-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === 'starting-runtime' ? 'Starting' : 'Start Runtime'}
                  </button>
                  <button
                    onClick={() => void handleDesktopRuntimeAction('restart')}
                    disabled={busy !== 'idle'}
                    className="rounded-[1rem] border border-cyan-400/15 bg-cyan-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === 'restarting-runtime' ? 'Restarting' : 'Restart Runtime'}
                  </button>
                  <button
                    onClick={() => void handleDesktopRuntimeAction('stop')}
                    disabled={busy !== 'idle'}
                    className="rounded-[1rem] border border-rose-300/15 bg-rose-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.24em] text-rose-100 transition hover:bg-rose-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === 'stopping-runtime' ? 'Stopping' : 'Stop Runtime'}
                  </button>
                </div>
              </div>
            ) : null}

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

            <div className="rounded-[1.5rem] border border-cyan-400/12 bg-slate-950/55 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/55">System Awareness</div>
                  <div className="mt-2 text-lg uppercase tracking-[0.18em] text-cyan-50/92">{awarenessHeadline.title}</div>
                </div>
                <div
                  className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.22em] ${
                    awarenessHeadline.tone === 'warn'
                      ? 'bg-amber-300/10 text-amber-200'
                      : awarenessHeadline.tone === 'good'
                        ? 'bg-emerald-300/10 text-emerald-200'
                        : 'bg-cyan-300/10 text-cyan-200'
                  }`}
                >
                  {awarenessHeadline.tone === 'warn'
                    ? 'Attention'
                    : awarenessHeadline.tone === 'good'
                      ? 'Steady'
                      : 'Monitoring'}
                </div>
              </div>
              <div className="mt-3 text-sm leading-7 text-slate-200/76">{awarenessHeadline.detail}</div>
              {architecture?.awareness?.mode?.reasons?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {architecture.awareness.mode.reasons.map((reason) => (
                    <div
                      key={reason}
                      className="rounded-full border border-cyan-400/10 bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-cyan-200/72"
                    >
                      {reason}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {awarenessCards.map((card) => (
                  <div key={card.id} className="rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">{card.label}</div>
                      <div
                        className={`text-[10px] uppercase tracking-[0.22em] ${
                          card.tone === 'warn'
                            ? 'text-amber-300/75'
                            : card.tone === 'good'
                              ? 'text-emerald-300/75'
                              : 'text-cyan-300/70'
                        }`}
                      >
                        {card.tone === 'warn' ? 'watch' : card.tone === 'good' ? 'ready' : 'info'}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-cyan-50/92">{card.value}</div>
                    <div className="mt-1 text-xs leading-6 text-slate-200/72">{card.detail}</div>
                  </div>
                ))}
                {!awarenessCards.length ? (
                  <div className="rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3 text-sm text-slate-200/72 lg:col-span-2">
                    Waiting for the architecture snapshot so JARVIS can summarize agents, voice, memory, connectors, and workspace state.
                  </div>
                ) : null}
              </div>
              {architecture?.awareness?.agents?.recent_failures?.length ? (
                <div className="mt-4 space-y-3">
                  {architecture.awareness.agents.recent_failures.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[1rem] border border-amber-300/18 bg-amber-400/[0.05] px-4 py-3"
                    >
                      <div className="text-[10px] uppercase tracking-[0.22em] text-amber-200/70">{item.label}</div>
                      <div className="mt-1 text-sm leading-6 text-slate-200/78">{item.detail}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[1.5rem] border border-cyan-400/12 bg-slate-950/55 p-5">
              <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/55">Commander Brief</div>
              <div className="mt-3 text-sm leading-7 text-slate-200/76">
                JARVIS now turns pressure signals into one clear command recommendation instead of leaving them passive.
                Commander mode compresses memory, blockers, and system state into a bounded next move.
              </div>
              <div className="mt-4 rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">Recommendation</div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                    {commanderBrief?.operating_mode || 'monitoring'}
                  </div>
                </div>
                <div className="mt-2 text-sm text-cyan-50/92">
                  {commanderBrief?.recommendation || 'Waiting for commander guidance.'}
                </div>
                <div className="mt-2 text-xs leading-6 text-slate-200/72">
                  {commanderBrief?.why || 'Commander logic will explain why this recommendation matters once enough state is available.'}
                </div>
                {commanderBrief?.friction_summary ? (
                  <>
                    <div className="mt-3 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Friction Summary</div>
                    <div className="mt-1 text-sm text-slate-200/78">{commanderBrief.friction_summary}</div>
                  </>
                ) : null}
                {commanderBrief?.root_cause ? (
                  <>
                    <div className="mt-3 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Signal</div>
                    <div className="mt-1 text-xs leading-6 text-slate-200/72">{commanderBrief.root_cause}</div>
                  </>
                ) : null}
                <div className="mt-3 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Best Next Step</div>
                <div className="mt-1 text-sm text-slate-200/78">
                  {commanderBrief?.best_next_step || 'No bounded next step selected yet.'}
                </div>
                <div className="mt-3 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Interaction Style</div>
                <div className="mt-1 text-xs leading-6 text-slate-200/72">
                  {commanderBrief?.interaction_style || 'adaptive'}
                </div>
                {commanderBrief?.user_temperament ? (
                  <>
                    <div className="mt-3 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">User Temperament</div>
                    <div className="mt-1 text-xs leading-6 text-slate-200/72">{commanderBrief.user_temperament}</div>
                  </>
                ) : null}
                {commanderBrief?.command_posture ? (
                  <>
                    <div className="mt-3 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Command Posture</div>
                    <div className="mt-1 text-sm text-cyan-50/92">{commanderBrief.command_posture}</div>
                  </>
                ) : null}
                {commanderBrief?.guidance_note ? (
                  <div className="mt-2 text-xs leading-6 text-slate-200/72">{commanderBrief.guidance_note}</div>
                ) : null}
                {commanderBrief?.risks?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {commanderBrief.risks.map((risk) => (
                      <div
                        key={risk}
                        className="rounded-full border border-amber-300/18 bg-amber-400/[0.05] px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-amber-200/74"
                      >
                        {risk}
                      </div>
                    ))}
                  </div>
                ) : null}
                {commanderBrief?.execution_plan?.length ? (
                  <div className="mt-4 grid gap-2">
                    {commanderBrief.execution_plan.map((step) => (
                      <div
                        key={step.phase}
                        className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2"
                      >
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">{step.phase}</div>
                        <div className="mt-1 text-sm text-cyan-50/92">{step.goal}</div>
                        <div className="mt-1 text-xs leading-6 text-slate-200/72">{step.success_signal}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {commanderBrief?.execution_summary ? (
                  <>
                    <div className="mt-4 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Execution Summary</div>
                    <div className="mt-1 text-xs leading-6 text-slate-200/72">{commanderBrief.execution_summary}</div>
                  </>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => void handleRouteCommanderPlan()}
                    disabled={busy !== 'idle' || !commanderBrief?.planner_prompt}
                    className="rounded-[1rem] border border-cyan-400/15 bg-cyan-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === 'routing-commander' ? 'Routing' : 'Route Commander Plan'}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-cyan-400/12 bg-slate-950/55 p-5">
              <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/55">Coding Command Brief</div>
              <div className="mt-3 text-sm leading-7 text-slate-200/76">
                Repo state, verification, and conventions are compressed into one bounded coding command flow.
                This brief turns the active repo into an assess, patch, verify, and report plan.
              </div>
              <div className="mt-4 rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">Repo</div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                    {codingBrief?.branch || 'unknown'}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(['default', 'release', 'failing-tests', 'diff-review'] as const).map((objective) => (
                    <button
                      key={objective}
                      type="button"
                      onClick={() => setCodingObjective(objective)}
                      disabled={busy !== 'idle' && busy !== 'routing-coding'}
                      className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] transition ${
                        codingObjective === objective
                          ? 'border-cyan-300/30 bg-cyan-400/[0.12] text-cyan-100'
                          : 'border-cyan-400/12 bg-slate-950/60 text-cyan-200/70 hover:bg-cyan-400/[0.08]'
                      }`}
                    >
                      {objective}
                    </button>
                  ))}
                </div>
                {codingBrief?.workflow_mode ? (
                  <>
                    <div className="mt-3 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Workflow Mode</div>
                    <div className="mt-1 text-sm text-cyan-50/92">{codingBrief.workflow_mode}</div>
                  </>
                ) : null}
                <div className="mt-2 text-sm text-cyan-50/92">
                  {codingBrief?.recommendation || 'Waiting for coding command guidance.'}
                </div>
                <div className="mt-2 text-xs leading-6 text-slate-200/72">
                  {codingBrief?.why || 'Coding command mode will explain the repo pressure once workspace state is available.'}
                </div>
                <div className="mt-3 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Best Next Step</div>
                <div className="mt-1 text-sm text-slate-200/78">
                  {codingBrief?.best_next_step || 'No coding action selected yet.'}
                </div>
                {codingBrief?.preferred_checks?.length ? (
                  <>
                    <div className="mt-3 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Preferred Checks</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {codingBrief.preferred_checks.map((check) => (
                        <div
                          key={check}
                          className="rounded-full border border-cyan-300/18 bg-cyan-400/[0.05] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-100/80"
                        >
                          {check}
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
                {codingBrief?.risks?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {codingBrief.risks.map((risk) => (
                      <div
                        key={risk}
                        className="rounded-full border border-amber-300/18 bg-amber-400/[0.05] px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-amber-200/74"
                      >
                        {risk}
                      </div>
                    ))}
                  </div>
                ) : null}
                {codingBrief?.phases?.length ? (
                  <div className="mt-4 grid gap-2">
                    {codingBrief.phases.map((step) => (
                      <div
                        key={step.phase}
                        className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2"
                      >
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">{step.phase}</div>
                        <div className="mt-1 text-sm text-cyan-50/92">{step.goal}</div>
                        <div className="mt-1 text-xs leading-6 text-slate-200/72">{step.verification}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {codingBrief?.checklist?.length ? (
                  <>
                    <div className="mt-4 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Checklist</div>
                    <div className="mt-2 grid gap-2">
                      {codingBrief.checklist.map((item) => (
                        <div
                          key={item}
                          className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2 text-xs leading-6 text-slate-200/72"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
                {codingBrief?.deliverables?.length ? (
                  <>
                    <div className="mt-4 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Deliverables</div>
                    <div className="mt-2 grid gap-2">
                      {codingBrief.deliverables.map((item) => (
                        <div
                          key={item}
                          className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2 text-xs leading-6 text-slate-200/72"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
                {codingBrief?.exit_criteria?.length ? (
                  <>
                    <div className="mt-4 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Exit Criteria</div>
                    <div className="mt-2 grid gap-2">
                      {codingBrief.exit_criteria.map((item) => (
                        <div
                          key={item}
                          className="rounded-[0.9rem] border border-emerald-300/12 bg-emerald-400/[0.05] px-3 py-2 text-xs leading-6 text-emerald-100/78"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
                {codingBrief?.report_template ? (
                  <>
                    <div className="mt-4 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Report Template</div>
                    <div className="mt-1 text-xs leading-6 text-slate-200/72">{codingBrief.report_template}</div>
                  </>
                ) : null}
                {codingBrief?.execution_summary ? (
                  <>
                    <div className="mt-4 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Execution Summary</div>
                    <div className="mt-1 text-xs leading-6 text-slate-200/72">{codingBrief.execution_summary}</div>
                  </>
                ) : null}
                {architecture?.handoff?.source === 'system-coding' && architecture.handoff.metadata?.workflow_mode ? (
                  <>
                    <div className="mt-4 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Last Routed Coding Package</div>
                    <div className="mt-2 rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2 text-xs leading-6 text-slate-200/72">
                      <div>Mode: {architecture.handoff.metadata.workflow_mode}</div>
                      {architecture.handoff.metadata.repo_name ? <div>Repo: {architecture.handoff.metadata.repo_name}</div> : null}
                      {architecture.handoff.metadata.branch ? <div>Branch: {architecture.handoff.metadata.branch}</div> : null}
                      {architecture.handoff.metadata.deliverables?.length ? (
                        <div>Deliverables: {architecture.handoff.metadata.deliverables.length}</div>
                      ) : null}
                      {architecture.handoff.metadata.exit_criteria?.length ? (
                        <div>Exit criteria: {architecture.handoff.metadata.exit_criteria.length}</div>
                      ) : null}
                    </div>
                  </>
                ) : null}
                {architecture?.mission?.domain === 'coding' ? (
                  <>
                    <div className="mt-4 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Coding Mission State</div>
                    <div className="mt-2 rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2 text-xs leading-6 text-slate-200/72">
                      <div>Status: {architecture.mission.status} / {architecture.mission.phase}</div>
                      {typeof architecture.mission.result_data?.current_step === 'string' && architecture.mission.result_data.current_step ? (
                        <div>Live step: {architecture.mission.result_data.current_step}</div>
                      ) : null}
                      {typeof architecture.mission.result_data?.step_status === 'string' && architecture.mission.result_data.step_status ? (
                        <div>Step status: {architecture.mission.result_data.step_status}</div>
                      ) : null}
                      {typeof architecture.mission.result_data?.current_detail === 'string' && architecture.mission.result_data.current_detail ? (
                        <div>Detail: {architecture.mission.result_data.current_detail}</div>
                      ) : null}
                      {architecture.handoff?.metadata?.workflow_mode ? (
                        <div>Workflow mode: {architecture.handoff.metadata.workflow_mode}</div>
                      ) : null}
                      <div className="mt-1 text-sm text-cyan-50/92">{architecture.mission.title}</div>
                      <div className="mt-1">{architecture.mission.summary}</div>
                      {architecture.mission.next_step ? <div className="mt-1">Next: {architecture.mission.next_step}</div> : null}
                      {architecture.mission.result ? <div className="mt-1">Outcome: {architecture.mission.result}</div> : null}
                      {typeof architecture.mission.result_data?.workflow === 'object' && architecture.mission.result_data.workflow ? (
                        <div className="mt-2 rounded-[0.8rem] border border-cyan-400/10 bg-black/20 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Workflow Closure</div>
                          {(() => {
                            const workflow = architecture.mission.result_data?.workflow as Record<string, unknown>;
                            const closure =
                              typeof workflow.closure === 'object' && workflow.closure ? (workflow.closure as Record<string, unknown>) : {};
                            const verificationAnchor =
                              typeof closure.verification_anchor === 'string' ? closure.verification_anchor : '';
                            const primaryDeliverable =
                              typeof closure.primary_deliverable === 'string' ? closure.primary_deliverable : '';
                            const primaryExit =
                              typeof closure.primary_exit_criterion === 'string' ? closure.primary_exit_criterion : '';
                            const reportLines = Array.isArray(closure.report_lines) ? closure.report_lines : [];
                            const reportTemplate =
                              typeof workflow.report_template === 'string' ? workflow.report_template : '';
                            return (
                              <div className="mt-1 space-y-1 text-[11px] text-slate-300/72">
                                {verificationAnchor ? <div>Verification: {verificationAnchor}</div> : null}
                                {primaryDeliverable ? <div>Deliverable: {primaryDeliverable}</div> : null}
                                {primaryExit ? <div>Exit: {primaryExit}</div> : null}
                                {reportTemplate ? <div>Report: {reportTemplate}</div> : null}
                                {reportLines.slice(0, 4).map((line, index) => (
                                  <div key={`${index}-${String(line)}`}>Report line: {String(line)}</div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      ) : null}
                      {Array.isArray(architecture.mission.result_data?.steps) && architecture.mission.result_data.steps.length ? (
                        <div className="mt-2">
                          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Recent Steps</div>
                          <div className="mt-1 space-y-1">
                            {architecture.mission.result_data.steps.slice(-3).map((step, index) => {
                              const entry = typeof step === 'object' && step ? (step as Record<string, unknown>) : {};
                              const phase = typeof entry.phase === 'string' ? entry.phase : 'step';
                              const status = typeof entry.status === 'string' ? entry.status : 'info';
                              const detail = typeof entry.detail === 'string' ? entry.detail : '';
                              return (
                                <div key={`${phase}-${index}`} className="text-[11px] text-slate-300/72">
                                  {phase} / {status}{detail ? `: ${detail}` : ''}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      {Array.isArray(architecture.mission.result_data?.artifacts) && architecture.mission.result_data.artifacts.length ? (
                        <div className="mt-2">
                          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Artifacts</div>
                          <div className="mt-1 space-y-1">
                            {architecture.mission.result_data.artifacts.slice(0, 4).map((artifact, index) => (
                              <div key={`${index}-${String(artifact)}`} className="text-[11px] text-slate-300/72">
                                {String(artifact)}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => void handleRouteCodingPlan()}
                    disabled={busy !== 'idle' || !codingBrief?.planner_prompt}
                    className="rounded-[1rem] border border-cyan-400/15 bg-cyan-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === 'routing-coding' ? 'Routing' : 'Route Coding Plan'}
                  </button>
                </div>
              </div>
            </div>

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
                  Stop Voice
                </button>
                <button
                  onClick={() => void handleEnsureAgents()}
                  disabled={busy !== 'idle'}
                  className="rounded-[1rem] border border-cyan-400/15 bg-slate-950/70 px-4 py-3 text-left text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Refresh Core Team
                </button>
                <button
                  onClick={() => void handleLogReviewItem()}
                  disabled={busy !== 'idle'}
                  className="rounded-[1rem] border border-cyan-400/15 bg-slate-950/70 px-4 py-3 text-left text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add Review Note
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
              <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/55">Memory Layers</div>
              <div className="mt-3 text-sm leading-7 text-slate-200/76">
                Profile facts, active work, and longer-lived lessons are separated into visible layers so you can inspect
                what is guiding recommendations.
              </div>
              <div className="mt-4 space-y-3">
                {([
                  ['Identity/Profile', memoryContext?.identity || []],
                  ['Session Focus', memoryContext?.session_focus || []],
                  ['Long-Term Memory', memoryContext?.long_term || []],
                ] as MemoryLayerCard[]).map(([label, items]) => (
                  <div key={label} className="rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">{label}</div>
                    <div className="mt-2 text-sm text-cyan-50/92">
                      {Array.isArray(items) && items.length
                        ? `${items.length} item${items.length === 1 ? '' : 's'}`
                        : 'No relevant items'}
                    </div>
                    {Array.isArray(items) && items.length ? (
                      <div className="mt-2 text-xs leading-6 text-slate-200/72">{String(items[0].detail || '')}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-cyan-400/12 bg-slate-950/55 p-5">
              <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/55">Personal Analytics</div>
              <div className="mt-3 text-sm leading-7 text-slate-200/76">
                Missions, lessons, and operator signals now feed a visible bottleneck summary instead of staying hidden in memory.
                Repeated friction can shape the next recommendation.
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">Friction Brief</div>
                  <div className="mt-2 text-sm text-cyan-50/92">
                    {memoryAnalytics?.friction_brief?.summary || 'Waiting for enough memory signals to isolate the main pressure loop.'}
                  </div>
                  <div className="mt-2 text-xs leading-6 text-slate-200/72">
                    {memoryAnalytics?.friction_brief?.root_cause || 'JARVIS will explain the underlying cause once recurring pressure becomes clear.'}
                  </div>
                  {memoryAnalytics?.friction_brief?.recommended_focus ? (
                    <div className="mt-3 rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2 text-xs leading-6 text-cyan-200/76">
                      Focus: {memoryAnalytics.friction_brief.recommended_focus}
                    </div>
                  ) : null}
                  {memoryAnalytics?.friction_brief?.pressure_points?.length ? (
                    <div className="mt-3 space-y-2">
                      {memoryAnalytics.friction_brief.pressure_points.slice(0, 3).map((item) => (
                        <div key={item} className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2 text-xs leading-6 text-slate-200/72">
                          {item}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">Operating Profile</div>
                  <div className="mt-2 text-sm text-cyan-50/92">
                    {memoryAnalytics?.operating_profile?.summary || 'Waiting for enough profile and usage data to model the user operating style.'}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Execution</div>
                      <div className="mt-1 text-sm text-slate-200/78">{memoryAnalytics?.operating_profile?.execution_mode || 'balanced'}</div>
                    </div>
                    <div className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Briefing</div>
                      <div className="mt-1 text-sm text-slate-200/78">{memoryAnalytics?.operating_profile?.briefing_mode || 'direct'}</div>
                    </div>
                    <div className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2 sm:col-span-2">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Adaptation Note</div>
                      <div className="mt-1 text-xs leading-6 text-slate-200/72">{memoryAnalytics?.operating_profile?.adaptation_note || 'JARVIS will explain how it is adapting to the user style once the signal is clear.'}</div>
                    </div>
                  </div>
                </div>
                <div className="rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">Focus Recommendations</div>
                  <div className="mt-2 space-y-2 text-sm text-cyan-50/92">
                    {(memoryAnalytics?.focus_recommendations || ['Waiting for enough memory signals to generate focus guidance.']).map((item) => (
                      <div key={item} className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">Active Friction</div>
                  <div className="mt-2 space-y-2 text-sm text-cyan-50/92">
                    {(memoryAnalytics?.blocked_missions?.length
                      ? memoryAnalytics.blocked_missions
                      : memoryAnalytics?.active_missions?.slice(0, 2) || []
                    ).map((item) => (
                      <div key={item.id} className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">{item.status} · {item.phase}</div>
                        <div className="mt-1">{item.title}</div>
                        {item.next_step ? <div className="mt-1 text-xs leading-6 text-slate-200/72">{item.next_step}</div> : null}
                      </div>
                    ))}
                    {!memoryAnalytics?.blocked_missions?.length && !memoryAnalytics?.active_missions?.length ? (
                      <div className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2 text-slate-200/72">
                        No active mission bottlenecks recorded yet.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              {memoryAnalytics?.top_lessons?.length ? (
                <div className="mt-4 rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">Top Lessons</div>
                  <div className="mt-3 space-y-2">
                    {memoryAnalytics.top_lessons.slice(0, 3).map((item) => (
                      <div key={item.id} className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2">
                        <div className="text-sm text-cyan-50/92">{item.label}</div>
                        <div className="mt-1 text-xs leading-6 text-slate-200/72">{item.lesson || item.summary || 'Lesson available.'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {memoryAnalytics?.review_items?.length ? (
                <div className="mt-4 rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">Review Queue</div>
                  <div className="mt-3 space-y-2">
                    {memoryAnalytics.review_items.slice(0, 3).map((item) => (
                      <div key={item.id} className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm text-cyan-50/92">{item.label}</div>
                          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">{item.status}</div>
                        </div>
                        <div className="mt-1 text-xs leading-6 text-slate-200/72">{item.summary}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {memoryAnalytics?.recurring_patterns?.length ? (
                <div className="mt-4 rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">Recurring Patterns</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {memoryAnalytics.recurring_patterns.slice(0, 4).map((item) => (
                      <div key={`${item.kind}:${item.key}`} className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">{item.kind.replace('_', ' ')}</div>
                        <div className="mt-1 text-sm text-cyan-50/92">{item.key}</div>
                        <div className="mt-1 text-xs leading-6 text-slate-200/72">{item.count} repeated signal(s)</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {memoryAnalytics?.improvement_opportunities?.length ? (
                <div className="mt-4 rounded-[1rem] border border-cyan-400/10 bg-black/20 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">Improvement Opportunities</div>
                  <div className="mt-3 space-y-2">
                    {memoryAnalytics.improvement_opportunities.slice(0, 4).map((item) => (
                      <div key={item} className="rounded-[0.9rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2 text-sm text-slate-100/80">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
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
