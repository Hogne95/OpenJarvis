import { useState } from 'react';
import JarvisHudDashboard from '../jarvis_hud_dashboard';
import { ChatArea } from '../components/Chat/ChatArea';
import { useAppStore } from '../lib/store';

export function CodingPage() {
  const [mobileSection, setMobileSection] = useState<'chat' | 'repo'>('chat');
  const messages = useAppStore((s) => s.messages);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const hasConversation = messages.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-cyan-400/10 bg-slate-950/70 px-6 py-5">
        <div className="text-[10px] uppercase tracking-[0.34em] text-cyan-300/60">
          Coding
        </div>
        <div className="mt-2 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-cyan-50">One place for coding with JARVIS</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300/75">
              Talk through the work, connect the repo, inspect the current state, and move through checks and git actions without bouncing between separate pages.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.22em] text-cyan-200/75">
            <span className="rounded-full border border-cyan-400/12 bg-cyan-400/[0.06] px-3 py-1.5">1. Ask</span>
            <span className="rounded-full border border-cyan-400/12 bg-cyan-400/[0.06] px-3 py-1.5">2. Connect Repo</span>
            <span className="rounded-full border border-cyan-400/12 bg-cyan-400/[0.06] px-3 py-1.5">3. Verify</span>
            <span className="rounded-full border border-cyan-400/12 bg-cyan-400/[0.06] px-3 py-1.5">4. Ship</span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-[1.15rem] border border-cyan-400/12 bg-cyan-400/[0.05] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/58">Conversation</div>
            <div className="mt-2 text-sm font-medium text-cyan-50">Start with the problem, not the tool.</div>
            <p className="mt-1 text-sm leading-6 text-slate-300/72">
              Ask JARVIS what changed, where to look, or what to verify before you touch the repo.
            </p>
          </div>
          <div className="rounded-[1.15rem] border border-cyan-400/12 bg-slate-900/72 px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/58">Repo View</div>
            <div className="mt-2 text-sm font-medium text-cyan-50">Keep the working tree in sight.</div>
            <p className="mt-1 text-sm leading-6 text-slate-300/72">
              Connect a repo, inspect its current state, and use the guided checks before you commit or push.
            </p>
          </div>
          <div className="rounded-[1.15rem] border border-cyan-400/12 bg-slate-900/72 px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/58">Finish Line</div>
            <div className="mt-2 text-sm font-medium text-cyan-50">Move from idea to verified change.</div>
            <p className="mt-1 text-sm leading-6 text-slate-300/72">
              Use this page to stay in one flow: understand, adjust, verify, then ship with confidence.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-[1.2rem] border border-cyan-400/12 bg-slate-950/78 px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/58">Best Next Move</div>
              <div className="mt-2 text-sm font-medium text-cyan-50">
                {hasConversation
                  ? 'Keep the coding conversation moving, then verify the repo state before the next git step.'
                  : 'Start by describing the change you want, then open the repo side to inspect the current state.'}
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-300/72">
                {selectedModel
                  ? `Model ready: ${selectedModel}.`
                  : 'Choose a model first so JARVIS can help you think through the change.'}{' '}
                This page works best when chat and repo stay in the same loop.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMobileSection('chat')}
                className="rounded-[0.9rem] border border-cyan-400/14 bg-cyan-400/[0.08] px-4 py-2 text-xs uppercase tracking-[0.22em] text-cyan-50 transition hover:bg-cyan-400/[0.14]"
              >
                {hasConversation ? 'Continue Chat' : 'Start in Chat'}
              </button>
              <button
                type="button"
                onClick={() => setMobileSection('repo')}
                className="rounded-[0.9rem] border border-cyan-400/14 bg-slate-900/80 px-4 py-2 text-xs uppercase tracking-[0.22em] text-cyan-100 transition hover:bg-slate-800/90"
              >
                Open Repo Side
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-[1rem] border border-cyan-400/12 bg-slate-950/78 p-1 xl:hidden">
          <button
            type="button"
            onClick={() => setMobileSection('chat')}
            className="flex-1 rounded-[0.8rem] px-3 py-2 text-xs uppercase tracking-[0.22em] transition"
            style={{
              background: mobileSection === 'chat' ? 'rgba(34, 211, 238, 0.12)' : 'transparent',
              color: mobileSection === 'chat' ? 'rgb(207 250 254)' : 'rgba(186, 230, 253, 0.72)',
            }}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => setMobileSection('repo')}
            className="flex-1 rounded-[0.8rem] px-3 py-2 text-xs uppercase tracking-[0.22em] transition"
            style={{
              background: mobileSection === 'repo' ? 'rgba(34, 211, 238, 0.12)' : 'transparent',
              color: mobileSection === 'repo' ? 'rgb(207 250 254)' : 'rgba(186, 230, 253, 0.72)',
            }}
          >
            Repo
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(360px,0.94fr)_minmax(640px,1.28fr)]">
        <section
          className={`${mobileSection === 'chat' ? 'flex' : 'hidden'} min-h-0 border-b border-cyan-400/10 bg-[radial-gradient(circle_at_top,rgba(8,47,73,0.26),rgba(2,6,23,0.96)_58%)] xl:flex xl:border-b-0 xl:border-r`}
          style={{ borderColor: 'rgba(34, 211, 238, 0.10)' }}
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-cyan-400/10 px-5 py-3">
              <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/60">Chat</div>
              <div className="mt-1 text-sm text-slate-300/74">
                Work through the change with JARVIS before you act on the repo.
              </div>
            </div>
            <ChatArea />
          </div>
        </section>

        <section
          className={`${mobileSection === 'repo' ? 'flex' : 'hidden'} min-h-0 overflow-hidden bg-[linear-gradient(180deg,rgba(2,8,23,0.72),rgba(2,6,23,0.96))] xl:flex`}
        >
          <div className="shrink-0 border-b border-cyan-400/10 px-5 py-3">
            <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/60">Repo</div>
            <div className="mt-1 text-sm text-slate-300/74">
              Connect, inspect, verify, and prepare the next clean git step.
            </div>
          </div>
          <JarvisHudDashboard view="workspace" />
        </section>
      </div>
    </div>
  );
}
