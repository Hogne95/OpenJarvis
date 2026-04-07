import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Mic,
  Cpu,
  Brain,
  Shield,
  Activity,
  Search,
  Folder,
  Globe,
  Terminal,
  CheckCircle2,
  XCircle,
  Radio,
  Clock3,
  Sparkles,
} from 'lucide-react';

const statuses = ['Awaiting wake word', 'Listening', 'Thinking', 'Speaking'] as const;
type Status = (typeof statuses)[number];

const panelGlow =
  'border border-cyan-400/25 bg-white/5 backdrop-blur-xl shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_0_24px_rgba(34,211,238,0.12)]';

function Ring({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      className="absolute inset-0 rounded-full border border-cyan-300/30"
      initial={{ scale: 0.86, opacity: 0.7 }}
      animate={{ scale: 1.14, opacity: 0 }}
      transition={{ duration: 2.8, repeat: Infinity, ease: 'easeOut', delay }}
    />
  );
}

function HudPanel({
  title,
  eyebrow,
  children,
  className = '',
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-3xl p-4 ${panelGlow} ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          {eyebrow ? (
            <div className="mb-1 text-[10px] uppercase tracking-[0.35em] text-cyan-300/70">
              {eyebrow}
            </div>
          ) : null}
          <div className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-100/90">
            {title}
          </div>
        </div>
        <div className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.8)]" />
      </div>
      {children}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-cyan-400/10 py-2 text-sm last:border-b-0">
      <span className="text-cyan-200/65">{label}</span>
      <span className="font-medium text-cyan-50">{value}</span>
    </div>
  );
}

export default function JarvisHudDashboard() {
  const [statusIndex, setStatusIndex] = useState(0);
  const [approved, setApproved] = useState<boolean | null>(null);
  const status: Status = statuses[statusIndex];

  useEffect(() => {
    const id = setInterval(() => {
      setStatusIndex((i) => (i + 1) % statuses.length);
      setApproved(null);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  const statusColor = useMemo(() => {
    switch (status) {
      case 'Listening':
        return 'text-emerald-300';
      case 'Thinking':
        return 'text-amber-300';
      case 'Speaking':
        return 'text-cyan-300';
      default:
        return 'text-cyan-100';
    }
  }, [status]);

  const transcript = useMemo(() => {
    switch (status) {
      case 'Listening':
        return 'Can you search the web for Ollama vision models and summarize the best options?';
      case 'Thinking':
        return 'Understood. Preparing a web search with approval required before opening external pages.';
      case 'Speaking':
        return 'I can search the web for Ollama vision models. Shall I proceed?';
      default:
        return "Wake phrase armed. Say 'Hey Jarvis' to begin.";
    }
  }, [status]);

  return (
    <div className="min-h-screen overflow-auto bg-[#030711] text-cyan-50">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.14),transparent_24%),radial-gradient(circle_at_top,rgba(56,189,248,0.1),transparent_30%),linear-gradient(to_bottom,rgba(0,0,0,0.35),rgba(0,0,0,0.85))]" />
      <div className="pointer-events-none fixed inset-0 opacity-20 [background-image:linear-gradient(rgba(125,211,252,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(125,211,252,0.14)_1px,transparent_1px)] [background-size:40px_40px]" />

      <div className="relative mx-auto max-w-[1600px] px-6 py-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.45em] text-cyan-300/70">
              OpenJarvis Command Interface
            </div>
            <h1 className="hud-glow text-3xl font-semibold tracking-[0.12em] text-cyan-50 md:text-4xl">
              J.A.R.V.I.S. Tactical Console
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.25em] text-cyan-200/80">
            <div className={`rounded-full px-4 py-2 ${panelGlow}`}>Local Brain: Online</div>
            <div className={`rounded-full px-4 py-2 ${panelGlow}`}>Model: qwen3:8b</div>
            <div className={`rounded-full px-4 py-2 ${panelGlow}`}>Voice Loop: Armed</div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(620px,1fr)_340px]">
          <div className="space-y-6">
            <HudPanel title="System State" eyebrow="Core">
              <div className="space-y-2">
                <DataRow label="Engine" value="OpenJarvis Multi" />
                <DataRow label="Wake Word" value="Hey Jarvis" />
                <DataRow label="Speech" value="Whisper Small" />
                <DataRow label="Voice" value="Piper Ryan High" />
                <DataRow label="Mode" value="Voice + Dashboard" />
              </div>
            </HudPanel>

            <HudPanel title="Capabilities" eyebrow="Modules">
              <div className="grid gap-3">
                {[
                  [Mic, 'Wake Word + Mic'],
                  [Globe, 'Web Search'],
                  [Folder, 'Files + Notes'],
                  [Terminal, 'Shell Actions'],
                  [Brain, 'Memory'],
                  [Shield, 'Approval Gates'],
                ].map(([Icon, label]) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-2xl border border-cyan-400/15 bg-cyan-400/5 px-3 py-3"
                  >
                    <Icon className="h-4 w-4 text-cyan-300" />
                    <span className="text-sm text-cyan-50/90">{label}</span>
                  </div>
                ))}
              </div>
            </HudPanel>

            <HudPanel title="Recent Memory" eyebrow="Recall">
              <div className="space-y-3 text-sm text-cyan-50/85">
                <div className="rounded-2xl border border-cyan-400/10 bg-cyan-400/5 p-3">
                  User prefers English replies, understands Norwegian input.
                </div>
                <div className="rounded-2xl border border-cyan-400/10 bg-cyan-400/5 p-3">
                  Wake threshold tuned for close-range microphone use.
                </div>
                <div className="rounded-2xl border border-cyan-400/10 bg-cyan-400/5 p-3">
                  Dashboard theme requested: cinematic sci-fi HUD.
                </div>
              </div>
            </HudPanel>
          </div>

          <div className="space-y-6">
            <div className={`relative overflow-hidden rounded-[2rem] p-6 ${panelGlow}`}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.14),transparent_45%)]" />
              <div className="relative grid gap-8 lg:grid-cols-[1fr_320px] lg:items-center">
                <div className="flex flex-col items-center justify-center py-6">
                  <div className="relative flex h-80 w-80 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-400/5 shadow-[0_0_60px_rgba(34,211,238,0.1)]">
                    <Ring delay={0} />
                    <Ring delay={0.8} />
                    <Ring delay={1.6} />
                    <motion.div
                      className="absolute inset-6 rounded-full border border-cyan-300/20"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
                    />
                    <motion.div
                      className="absolute inset-14 rounded-full border border-dashed border-cyan-200/15"
                      animate={{ rotate: -360 }}
                      transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                    />
                    <motion.div
                      className="flex h-32 w-32 items-center justify-center rounded-full border border-cyan-200/30 bg-cyan-300/10 shadow-[0_0_45px_rgba(34,211,238,0.2)]"
                      animate={{
                        scale:
                          status === 'Listening'
                            ? [1, 1.08, 1]
                            : status === 'Speaking'
                            ? [1, 1.04, 1]
                            : 1,
                      }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    >
                      <Mic className="h-12 w-12 text-cyan-200" />
                    </motion.div>
                  </div>

                  <div className="mt-8 text-center">
                    <div className="mb-2 text-[11px] uppercase tracking-[0.45em] text-cyan-300/70">
                      Voice Core Status
                    </div>
                    <div className={`hud-glow text-2xl font-semibold tracking-[0.2em] ${statusColor}`}>
                      {status}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <HudPanel title="Live Transcript" eyebrow="Input">
                    <div className="rounded-2xl border border-cyan-400/10 bg-black/20 p-4 text-sm leading-7 text-cyan-50/90">
                      {transcript}
                    </div>
                  </HudPanel>

                  <HudPanel title="Assistant Reply" eyebrow="Output">
                    <div className="rounded-2xl border border-cyan-400/10 bg-black/20 p-4 text-sm leading-7 text-cyan-50/90">
                      {status === 'Awaiting wake word'
                        ? 'Wake phrase armed.'
                        : 'I can search the web for Ollama vision models. Shall I proceed?'}
                    </div>
                  </HudPanel>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <HudPanel title="Action Approval" eyebrow="Human-in-the-loop">
                <div className="mb-4 text-sm text-cyan-50/85">
                  Search the web for Ollama vision models and open the most relevant results in the browser.
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setApproved(true)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-medium text-emerald-200 transition hover:bg-emerald-400/20"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </button>
                  <button
                    onClick={() => setApproved(false)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm font-medium text-rose-200 transition hover:bg-rose-400/20"
                  >
                    <XCircle className="h-4 w-4" /> Cancel
                  </button>
                </div>
                {approved !== null ? (
                  <div className="mt-4 rounded-2xl border border-cyan-400/10 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-50/85">
                    {approved ? 'Action approved. Dispatching to local backend.' : 'Action cancelled. Standing by.'}
                  </div>
                ) : null}
              </HudPanel>

              <HudPanel title="Telemetry" eyebrow="Runtime">
                <div className="space-y-3">
                  {[
                    ['Wake Score', '0.78'],
                    ['Mic RMS', '0.031'],
                    ['Response Time', '1.2s'],
                    ['Pending Actions', approved === null ? '1' : '0'],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-2xl border border-cyan-400/10 bg-cyan-400/5 px-4 py-3 text-sm"
                    >
                      <span className="text-cyan-200/70">{label}</span>
                      <span className="font-medium text-cyan-50">{value}</span>
                    </div>
                  ))}
                </div>
              </HudPanel>
            </div>
          </div>

          <div className="space-y-6">
            <HudPanel title="Operational Feed" eyebrow="Recent Actions">
              <div className="space-y-3 text-sm">
                {[
                  { icon: Search, text: 'Prepared web search request for Ollama vision models.' },
                  { icon: Folder, text: 'Indexed Downloads and generated size summary.' },
                  { icon: Brain, text: 'Stored user preference: English replies, Norwegian input accepted.' },
                  { icon: Shield, text: 'Approval gate armed for external navigation.' },
                ].map(({ icon: Icon, text }, i) => (
                  <div
                    key={i}
                    className="flex gap-3 rounded-2xl border border-cyan-400/10 bg-cyan-400/5 p-3 text-cyan-50/85"
                  >
                    <Icon className="mt-0.5 h-4 w-4 flex-none text-cyan-300" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>
            </HudPanel>

            <HudPanel title="Subsystems" eyebrow="Health">
              <div className="space-y-3">
                {[
                  [Cpu, 'Local Backend', 'Nominal'],
                  [Activity, 'Voice Pipeline', 'Active'],
                  [Radio, 'Wake Word', 'Armed'],
                  [Clock3, 'Scheduler', 'Ready'],
                  [Sparkles, 'Memory', 'Online'],
                ].map(([Icon, label, state]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-2xl border border-cyan-400/10 bg-cyan-400/5 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-cyan-300" />
                      <span className="text-sm text-cyan-50/90">{label}</span>
                    </div>
                    <span className="text-xs uppercase tracking-[0.22em] text-cyan-300/80">{state}</span>
                  </div>
                ))}
              </div>
            </HudPanel>

            <HudPanel title="Tool Dock" eyebrow="Actions">
              <div className="grid grid-cols-2 gap-3">
                {[
                  [Globe, 'Search'],
                  [Folder, 'Files'],
                  [Terminal, 'Shell'],
                  [Brain, 'Memory'],
                ].map(([Icon, label]) => (
                  <button
                    key={label}
                    className="rounded-2xl border border-cyan-400/15 bg-cyan-400/5 px-4 py-4 text-left transition hover:bg-cyan-400/10"
                  >
                    <Icon className="mb-2 h-4 w-4 text-cyan-300" />
                    <div className="text-sm font-medium text-cyan-50">{label}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-cyan-300/60">Module</div>
                  </button>
                ))}
              </div>
            </HudPanel>
          </div>
        </div>
      </div>
    </div>
  );
}