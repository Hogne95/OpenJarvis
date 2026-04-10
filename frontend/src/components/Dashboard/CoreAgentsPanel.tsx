import type { AgentArchitectureStatus, AgentTask } from '../../lib/api';
import { buildSystemAwarenessCards, buildSystemAwarenessHeadline } from '../../lib/systemAwareness';

type RoleKey = 'voice' | 'planner' | 'executor' | 'vision' | 'memory';

export function CoreAgentsPanel({
  architecture,
  architectureBusy,
  agentNotice,
  architectureTaskOutcome,
  designTaskOutcome,
  fivemTaskOutcome,
  roleTasks,
  onEnsureCoreTeam,
  onPlannerHandoff,
  onRunRole,
}: {
  architecture: AgentArchitectureStatus | null;
  architectureBusy: boolean;
  agentNotice: string;
  architectureTaskOutcome:
    | {
        kind: 'failed' | 'completed';
        label: string;
        task: AgentTask;
        summary: string;
      }
    | null;
  designTaskOutcome:
    | {
        kind: 'failed' | 'completed';
        label: string;
        task: AgentTask;
        summary: string;
      }
    | null;
  fivemTaskOutcome:
    | {
        kind: 'failed' | 'completed';
        label: string;
        task: AgentTask;
        summary: string;
      }
    | null;
  roleTasks: Partial<Record<RoleKey, AgentTask[]>>;
  onEnsureCoreTeam: () => void;
  onPlannerHandoff: () => void;
  onRunRole: (role: string) => void;
}) {
  const awarenessCards = buildSystemAwarenessCards(architecture?.awareness);
  const awarenessHeadline = buildSystemAwarenessHeadline(architecture?.awareness);
  return (
    <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm uppercase tracking-[0.18em] text-cyan-50/92">
            {architecture
              ? `${architecture.summary.ready_roles}/${architecture.summary.total_roles} roles ready`
              : 'Role status pending'}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
            Voice, planner, executor, vision, and memory
          </div>
        </div>
        <button
          type="button"
          onClick={onEnsureCoreTeam}
          disabled={architectureBusy}
          className="rounded-[0.95rem] border border-cyan-400/12 bg-cyan-400/[0.08] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.14] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {architectureBusy ? 'Provisioning' : 'Ensure Core Team'}
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onPlannerHandoff}
          disabled={architectureBusy}
          className="rounded-[0.95rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {architectureBusy ? 'Routing' : 'Planner Handoff'}
        </button>
      </div>
      {architecture?.handoff ? (
        <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">Latest Handoff</div>
          <div className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200/76">
            {architecture.handoff.brief}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
            Planner {architecture.handoff.planner?.task_id || 'queued'} / Executor {architecture.handoff.executor?.task_id || 'queued'}
          </div>
        </div>
      ) : null}
      {architecture?.awareness ? (
        <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">System Awareness</div>
              <div className="mt-1 text-sm text-cyan-50/92">{awarenessHeadline.title}</div>
            </div>
            <div
              className={`text-[10px] uppercase tracking-[0.22em] ${
                awarenessHeadline.tone === 'warn'
                  ? 'text-amber-300/75'
                  : awarenessHeadline.tone === 'good'
                    ? 'text-emerald-300/75'
                    : 'text-cyan-300/70'
              }`}
            >
              {awarenessHeadline.tone === 'warn'
                ? 'watch'
                : awarenessHeadline.tone === 'good'
                  ? 'steady'
                  : 'monitor'}
            </div>
          </div>
          <div className="mt-2 text-sm text-slate-200/76">{awarenessHeadline.detail}</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {awarenessCards.map((card) => (
              <div key={card.id} className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">{card.label}</div>
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
                <div className="mt-1 text-sm text-cyan-50/92">{card.value}</div>
                <div className="mt-1 text-xs leading-6 text-slate-200/72">{card.detail}</div>
              </div>
            ))}
          </div>
          {architecture.awareness.agents.recent_failures.length ? (
            <div className="mt-3 space-y-2">
              {architecture.awareness.agents.recent_failures.slice(0, 2).map((item) => (
                <div
                  key={item.id}
                  className="rounded-[0.85rem] border border-amber-300/18 bg-amber-400/[0.05] px-3 py-2"
                >
                  <div className="text-[10px] uppercase tracking-[0.22em] text-amber-200/70">{item.label}</div>
                  <div className="mt-1 text-sm text-slate-200/78">{item.detail}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {architectureTaskOutcome ? (
        <div className="mt-3 rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
              {architectureTaskOutcome.kind === 'failed' ? 'Latest Agent Blocker' : 'Latest Agent Outcome'}
            </div>
            <div
              className={`text-[10px] uppercase tracking-[0.22em] ${
                architectureTaskOutcome.kind === 'failed' ? 'text-amber-300/75' : 'text-emerald-300/75'
              }`}
            >
              {architectureTaskOutcome.label}
            </div>
          </div>
          <div className="mt-2 text-sm text-slate-200/76">{architectureTaskOutcome.summary}</div>
        </div>
      ) : null}
      {designTaskOutcome ? (
        <div className="mt-3 rounded-[0.95rem] border border-violet-300/16 bg-violet-500/[0.06] px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-[0.22em] text-violet-200/72">
              {designTaskOutcome.kind === 'failed' ? 'Latest Design Blocker' : 'Latest Design Outcome'}
            </div>
            <div
              className={`text-[10px] uppercase tracking-[0.22em] ${
                designTaskOutcome.kind === 'failed' ? 'text-amber-300/75' : 'text-emerald-300/75'
              }`}
            >
              {designTaskOutcome.label}
            </div>
          </div>
          <div className="mt-2 text-sm text-slate-200/76">{designTaskOutcome.summary}</div>
        </div>
      ) : null}
      {fivemTaskOutcome ? (
        <div className="mt-3 rounded-[0.95rem] border border-sky-300/16 bg-sky-500/[0.06] px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-[0.22em] text-sky-200/72">
              {fivemTaskOutcome.kind === 'failed' ? 'Latest FiveM Blocker' : 'Latest FiveM Outcome'}
            </div>
            <div
              className={`text-[10px] uppercase tracking-[0.22em] ${
                fivemTaskOutcome.kind === 'failed' ? 'text-amber-300/75' : 'text-emerald-300/75'
              }`}
            >
              {fivemTaskOutcome.label}
            </div>
          </div>
          <div className="mt-2 text-sm text-slate-200/76">{fivemTaskOutcome.summary}</div>
        </div>
      ) : null}
      <div className="mt-3 grid gap-2">
        {(architecture?.roles || []).map((role) => (
          <div key={role.role} className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-cyan-50/92">{role.title}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">
                  {role.status} / {role.source}
                </div>
              </div>
              {role.agent_id ? (
                <button
                  type="button"
                  onClick={() => onRunRole(role.role)}
                  disabled={architectureBusy || role.status === 'running'}
                  className="rounded-[0.85rem] border border-cyan-400/12 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-cyan-400/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {role.status === 'running' ? 'Running' : 'Run'}
                </button>
              ) : (
                <div className={`text-[10px] uppercase tracking-[0.22em] ${role.ready ? 'text-emerald-300/75' : 'text-amber-300/75'}`}>
                  {role.ready ? 'Ready' : 'Needs role'}
                </div>
              )}
            </div>
            <div className="mt-2 text-sm text-slate-200/76">{role.detail}</div>
            {roleTasks[role.role as RoleKey]?.length ? (
              <div className="mt-3 grid gap-2">
                {roleTasks[role.role as RoleKey]?.slice(0, 2).map((task) => (
                  <div key={task.id} className="rounded-[0.85rem] border border-cyan-400/10 bg-slate-950/55 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/55">{task.status}</div>
                      <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300/45">
                        {new Date(task.created_at * 1000).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="mt-1 line-clamp-3 text-sm text-slate-200/72">{task.description}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {!architecture?.roles?.length ? (
          <div className="rounded-[0.95rem] border border-cyan-400/10 bg-black/20 px-3 py-3 text-sm text-slate-200/72">
            Agent architecture status will appear once the backend reports the core roles.
          </div>
        ) : null}
      </div>
      <div className="mt-4 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-100/78">
        {agentNotice || 'Launch inbox and meeting agents directly from the HUD.'}
      </div>
    </div>
  );
}
