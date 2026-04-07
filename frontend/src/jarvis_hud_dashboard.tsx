import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  AudioLines,
  Brain,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Folder,
  Globe,
  Mic,
  Radio,
  ScanSearch,
  Shield,
  Sparkles,
  Terminal,
  Waves,
  XCircle,
} from 'lucide-react';

const statuses = ['Standby', 'Listening', 'Analyzing', 'Responding'] as const;
type Status = (typeof statuses)[number];

const statusMeta: Record<
  Status,
  {
    accent: string;
    label: string;
    transcript: string;
    reply: string;
    bars: number[];
  }
> = {
  Standby: {
    accent: 'text-cyan-200',
    label: 'Wake phrase armed',
    transcript: "Awaiting user input. Say 'Hey Jarvis' to wake the assistant.",
    reply: 'All systems nominal. Standing by for a voice or text command.',
    bars: [18, 26, 22, 28, 16, 24, 20, 14],
  },
  Listening: {
    accent: 'text-emerald-300',
    label: 'Voice capture live',
    transcript: 'Jarvis, open the tactical dashboard and summarize the local system state.',
    reply: 'Capturing multilingual speech input and assembling a local intent draft.',
    bars: [48, 72, 84, 66, 92, 70, 56, 44],
  },
  Analyzing: {
    accent: 'text-amber-300',
    label: 'Inference in progress',
    transcript: 'Intent parsed. Preparing a response and checking approval-gated actions.',
    reply: 'Cross-referencing memory, tools, and system telemetry before responding.',
    bars: [34, 40, 56, 64, 60, 52, 38, 28],
  },
  Responding: {
    accent: 'text-sky-300',
    label: 'Voice synthesis active',
    transcript: 'Request understood. Rendering the JARVIS HUD and keeping voice controls online.',
    reply: 'Dashboard is live. Voice pipeline remains armed and approval checks remain enforced.',
    bars: [42, 58, 76, 62, 70, 82, 64, 46],
  },
};

const subsystems = [
  { icon: Cpu, label: 'Local Core', value: 'Nominal' },
  { icon: Brain, label: 'Reasoner', value: 'Ready' },
  { icon: Waves, label: 'Voice Loop', value: 'Armed' },
  { icon: Shield, label: 'Approval Gate', value: 'Online' },
];

const tools = [
  { icon: Globe, label: 'Web Intel' },
  { icon: Folder, label: 'Files' },
  { icon: Terminal, label: 'Shell' },
  { icon: Sparkles, label: 'Memory' },
];

const missionFeed = [
  'English responses locked. Norwegian speech input remains accepted.',
  'Voice wake loop preserved to avoid breaking working mic behavior.',
  'Dashboard route detached from default app chrome.',
  'Legacy static dashboard moved off the primary HUD route.',
];

function Panel({
  title,
  kicker,
  children,
  className = '',
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`jarvis-panel rounded-[1.75rem] p-4 md:p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          {kicker ? (
            <div className="mb-1 text-[10px] uppercase tracking-[0.42em] text-cyan-300/65">
              {kicker}
            </div>
          ) : null}
          <div className="text-sm uppercase tracking-[0.28em] text-cyan-50/90">{title}</div>
        </div>
        <div className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.9)]" />
      </div>
      {children}
    </div>
  );
}

function Equalizer({ bars }: { bars: number[] }) {
  return (
    <div className="flex h-20 items-end gap-2">
      {bars.map((bar, index) => (
        <span
          key={`${bar}-${index}`}
          className="jarvis-bar w-2 rounded-full bg-gradient-to-t from-cyan-500 via-sky-300 to-white/90"
          style={{
            height: `${bar}%`,
            animationDelay: `${index * 120}ms`,
          }}
        />
      ))}
    </div>
  );
}

export default function JarvisHudDashboard() {
  const [statusIndex, setStatusIndex] = useState(0);
  const [approved, setApproved] = useState<boolean | null>(null);
  const status = statuses[statusIndex];
  const meta = statusMeta[status];

  useEffect(() => {
    const id = window.setInterval(() => {
      setStatusIndex((current) => (current + 1) % statuses.length);
    }, 3600);
    return () => window.clearInterval(id);
  }, []);

  const reactorMetrics = useMemo(
    () => [
      { label: 'Wake Confidence', value: status === 'Listening' ? '0.94' : '0.81' },
      { label: 'Response Latency', value: status === 'Analyzing' ? '1.4s' : '0.8s' },
      { label: 'Noise Floor', value: '-42 dB' },
      { label: 'Pending Actions', value: approved === null ? '01' : '00' },
    ],
    [approved, status],
  );

  const approvalLabel =
    approved === null
      ? 'Awaiting operator decision'
      : approved
      ? 'Action approved for local execution'
      : 'Action rejected and held';

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#02050d] text-slate-100">
      <div className="jarvis-vignette pointer-events-none absolute inset-0" />
      <div className="jarvis-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="jarvis-scanlines pointer-events-none absolute inset-0 opacity-30" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_70%)]" />
      <div className="pointer-events-none absolute left-[-10%] top-[18%] h-[28rem] w-[28rem] rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-10rem] right-[-4rem] h-[24rem] w-[24rem] rounded-full bg-amber-400/10 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1700px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="jarvis-panel mb-4 rounded-[1.75rem] px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.5em] text-cyan-300/65">
                Mark XLII Command Interface
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <h1 className="hud-glow text-3xl font-semibold uppercase tracking-[0.22em] text-cyan-50 md:text-5xl">
                  J.A.R.V.I.S.
                </h1>
                <div className="pb-1 text-sm uppercase tracking-[0.35em] text-slate-300/70">
                  Autonomous Tactical Core
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['Voice', 'Norwegian + English input'],
                ['Output', 'English only'],
                ['Execution', 'Approval required'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[1.25rem] border border-cyan-400/15 bg-slate-950/45 px-4 py-3"
                >
                  <div className="text-[10px] uppercase tracking-[0.35em] text-cyan-300/65">{label}</div>
                  <div className="mt-1 text-sm text-cyan-50/90">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-4 xl:grid-cols-[320px_minmax(680px,1fr)_360px]">
          <div className="space-y-4">
            <Panel title="Core Matrix" kicker="Subsystems">
              <div className="space-y-3">
                {subsystems.map(({ icon: Icon, label, value }, index) => (
                  <div
                    key={label}
                    className="jarvis-outline flex items-center justify-between rounded-[1.15rem] px-4 py-3"
                    style={{ animationDelay: `${index * 120}ms` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/8 p-2">
                        <Icon className="h-4 w-4 text-cyan-200" />
                      </div>
                      <div>
                        <div className="text-sm text-cyan-50/90">{label}</div>
                        <div className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/55">
                          Local node
                        </div>
                      </div>
                    </div>
                    <div className="text-xs uppercase tracking-[0.28em] text-emerald-300">{value}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Voice Signature" kicker="Live Input">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-3">
                  <AudioLines className="h-5 w-5 text-emerald-300" />
                </div>
                <div>
                  <div className={`text-sm uppercase tracking-[0.28em] ${meta.accent}`}>{status}</div>
                  <div className="text-xs text-slate-300/65">{meta.label}</div>
                </div>
              </div>
              <Equalizer bars={meta.bars} />
              <div className="mt-4 rounded-[1.15rem] border border-cyan-400/12 bg-slate-950/55 p-4 text-sm leading-7 text-slate-200/80">
                {meta.transcript}
              </div>
            </Panel>

            <Panel title="Mission Feed" kicker="Memory">
              <div className="space-y-3">
                {missionFeed.map((item, index) => (
                  <div
                    key={item}
                    className="flex gap-3 rounded-[1.15rem] border border-cyan-400/10 bg-cyan-400/[0.04] px-3 py-3"
                  >
                    <div className="mt-1 h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.85)]" />
                    <div className="text-sm text-slate-200/78">
                      <span className="mr-2 text-[10px] uppercase tracking-[0.3em] text-cyan-300/50">
                        {`0${index + 1}`}
                      </span>
                      {item}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Arc Reactor Interface" kicker="Command Core" className="overflow-hidden">
              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="relative flex min-h-[32rem] items-center justify-center overflow-hidden rounded-[1.5rem] border border-cyan-400/10 bg-[radial-gradient(circle_at_center,rgba(8,47,73,0.75),rgba(2,6,23,0.95)_62%)] p-6">
                  <div className="jarvis-float absolute inset-[12%] rounded-full border border-cyan-300/12" />
                  <div className="jarvis-spin-slow absolute inset-[16%] rounded-full border border-cyan-300/22" />
                  <div className="jarvis-spin-reverse absolute inset-[24%] rounded-full border border-dashed border-cyan-200/16" />
                  <div className="jarvis-spin-slow absolute inset-[31%] rounded-full border border-sky-300/15" />
                  <div className="absolute inset-[18%] rounded-full border border-cyan-300/10 shadow-[0_0_120px_rgba(34,211,238,0.12)]" />
                  <div className="jarvis-sweep absolute left-1/2 top-1/2 h-[1px] w-[42%] origin-left -translate-y-1/2 bg-gradient-to-r from-cyan-300/0 via-cyan-200 to-cyan-100 shadow-[0_0_18px_rgba(125,211,252,0.9)]" />

                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative flex h-40 w-40 items-center justify-center rounded-full border border-cyan-200/28 bg-cyan-300/10 shadow-[0_0_50px_rgba(34,211,238,0.16)]">
                      <div className="absolute inset-3 rounded-full border border-cyan-100/25" />
                      <div className="jarvis-pulse absolute inset-6 rounded-full border border-cyan-200/40" />
                      <Mic className="h-16 w-16 text-cyan-100 drop-shadow-[0_0_18px_rgba(125,211,252,0.7)]" />
                    </div>
                  </div>

                  <div className="absolute left-6 top-6 rounded-full border border-cyan-400/16 bg-slate-950/50 px-4 py-2 text-[11px] uppercase tracking-[0.34em] text-cyan-200/75">
                    Neural Focus
                  </div>
                  <div className="absolute bottom-6 left-6 right-6 grid gap-3 sm:grid-cols-2">
                    {reactorMetrics.map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-[1rem] border border-cyan-400/12 bg-slate-950/55 px-4 py-3"
                      >
                        <div className="text-[10px] uppercase tracking-[0.32em] text-cyan-300/55">
                          {metric.label}
                        </div>
                        <div className="mt-1 text-lg text-cyan-50">{metric.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-[1.4rem] border border-cyan-400/12 bg-slate-950/55 p-4">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.4em] text-cyan-300/60">
                      Assistant Response
                    </div>
                    <div className="hud-glow text-2xl uppercase tracking-[0.26em] text-cyan-50">
                      {status}
                    </div>
                    <div className={`mt-2 text-sm uppercase tracking-[0.24em] ${meta.accent}`}>
                      {meta.label}
                    </div>
                    <p className="mt-4 text-sm leading-7 text-slate-200/75">{meta.reply}</p>
                  </div>

                  <div className="rounded-[1.4rem] border border-amber-300/12 bg-[linear-gradient(180deg,rgba(251,191,36,0.08),rgba(15,23,42,0.55))] p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="rounded-2xl border border-amber-300/20 bg-amber-300/8 p-2">
                        <ScanSearch className="h-5 w-5 text-amber-200" />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.36em] text-amber-200/70">
                          Current Objective
                        </div>
                        <div className="text-sm text-amber-50/90">Render true JARVIS HUD</div>
                      </div>
                    </div>
                    <div className="rounded-[1rem] border border-amber-200/10 bg-black/20 p-4 text-sm leading-7 text-slate-100/78">
                      Build a cinematic dashboard surface with motion, radial targeting geometry, and a stronger
                      command-center silhouette while preserving the working voice pipeline.
                    </div>
                  </div>
                </div>
              </div>
            </Panel>

            <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <Panel title="Approval Gate" kicker="Human-in-the-loop">
                <div className="rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/55 p-4">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.35em] text-cyan-300/55">
                    Proposed Action
                  </div>
                  <div className="text-sm leading-7 text-slate-200/78">
                    Search the web for current Ollama-compatible multimodal models and present the best local options.
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={() => setApproved(true)}
                    className="rounded-[1.1rem] border border-emerald-400/30 bg-emerald-400/12 px-4 py-3 text-sm uppercase tracking-[0.24em] text-emerald-200 transition hover:bg-emerald-400/18"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </span>
                  </button>
                  <button
                    onClick={() => setApproved(false)}
                    className="rounded-[1.1rem] border border-rose-400/30 bg-rose-400/12 px-4 py-3 text-sm uppercase tracking-[0.24em] text-rose-200 transition hover:bg-rose-400/18"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <XCircle className="h-4 w-4" />
                      Reject
                    </span>
                  </button>
                </div>

                <div className="mt-4 rounded-[1.15rem] border border-cyan-400/12 bg-cyan-400/[0.05] px-4 py-3 text-sm text-slate-100/80">
                  {approvalLabel}
                </div>
              </Panel>

              <Panel title="Tool Dock" kicker="Direct Access">
                <div className="grid grid-cols-2 gap-3">
                  {tools.map(({ icon: Icon, label }) => (
                    <button
                      key={label}
                      className="rounded-[1.1rem] border border-cyan-400/12 bg-slate-950/55 px-4 py-4 text-left transition hover:bg-cyan-400/[0.08]"
                    >
                      <Icon className="mb-3 h-5 w-5 text-cyan-200" />
                      <div className="text-sm uppercase tracking-[0.2em] text-cyan-50/92">{label}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.28em] text-cyan-300/55">
                        Module Ready
                      </div>
                    </button>
                  ))}
                </div>
              </Panel>
            </div>
          </div>

          <div className="space-y-4">
            <Panel title="Tactical Timeline" kicker="Event Stream">
              <div className="space-y-3">
                {[
                  { icon: Radio, title: 'Wake loop', detail: 'Hotword monitoring active with local mic input.' },
                  { icon: Activity, title: 'Telemetry', detail: 'CPU, latency, and voice metrics synchronized.' },
                  { icon: Shield, title: 'Action policy', detail: 'External navigation remains approval-gated.' },
                  { icon: Brain, title: 'Memory', detail: 'Preference profile loaded for language and tone.' },
                ].map(({ icon: Icon, title, detail }) => (
                  <div
                    key={title}
                    className="flex gap-3 rounded-[1.15rem] border border-cyan-400/10 bg-slate-950/50 px-4 py-3"
                  >
                    <div className="rounded-xl border border-cyan-400/12 bg-cyan-400/[0.07] p-2">
                      <Icon className="h-4 w-4 text-cyan-200" />
                    </div>
                    <div>
                      <div className="text-sm uppercase tracking-[0.18em] text-cyan-50/92">{title}</div>
                      <div className="mt-1 text-sm leading-6 text-slate-200/72">{detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Target Queue" kicker="Task Stack">
              <div className="space-y-3">
                {[
                  'Replace stock dashboard silhouette with a dedicated HUD surface.',
                  'Keep voice features stable while modernizing the UI shell.',
                  'Prepare the command center for live status bindings next.',
                ].map((item, index) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-[1.15rem] border border-cyan-400/10 bg-cyan-400/[0.04] px-4 py-3"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/16 bg-slate-950/65 text-xs uppercase tracking-[0.25em] text-cyan-200">
                      {index + 1}
                    </div>
                    <div className="flex-1 text-sm leading-6 text-slate-200/78">{item}</div>
                    <ChevronRight className="h-4 w-4 text-cyan-300/55" />
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Operator Profile" kicker="Session">
              <div className="rounded-[1.35rem] border border-cyan-400/10 bg-[linear-gradient(180deg,rgba(34,211,238,0.10),rgba(2,6,23,0.48))] p-5">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-300/10">
                    <Mic className="h-5 w-5 text-cyan-100" />
                  </div>
                  <div>
                    <div className="text-sm uppercase tracking-[0.24em] text-cyan-50/92">OpenJarvis Operator</div>
                    <div className="text-xs uppercase tracking-[0.25em] text-cyan-300/55">Local Session Active</div>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-slate-100/76">
                  <div>Input languages: Norwegian, English</div>
                  <div>Reply language: English</div>
                  <div>Visual profile: cinematic command HUD</div>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </section>
  );
}
