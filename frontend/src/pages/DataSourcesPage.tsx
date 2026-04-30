import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router';
import {
  fetchManagedAgents,
  createManagedAgent,
} from '../lib/api';
import type { ManagedAgent } from '../lib/api';
import { Database, MessageSquare, Loader2, Plus } from 'lucide-react';
import { DataSourcesSection } from '../components/DataSources/DataSourcesSection';
import { MessagingSection } from '../components/DataSources/MessagingSection';

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function DataSourcesPage() {
  const location = useLocation();
  const [agents, setAgents] = useState<ManagedAgent[]>([]);
  const [activeTab, setActiveTab] = useState<'sources' | 'messaging'>('sources');
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [agentsHydrated, setAgentsHydrated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('tab') === 'reach-me') {
      setActiveTab('messaging');
    }
  }, [location.search]);

  useEffect(() => {
    const handleTabSwitch = (event: Event) => {
      const tab = (event as CustomEvent<string>).detail;
      if (tab === 'messaging' || tab === 'reach-me') setActiveTab('messaging');
      if (tab === 'sources' || tab === 'connected-apps') setActiveTab('sources');
    };
    window.addEventListener('switch-tab', handleTabSwitch as EventListener);
    return () => window.removeEventListener('switch-tab', handleTabSwitch as EventListener);
  }, []);

  const params = new URLSearchParams(location.search);
  const focusProviders = params.get('focus') === 'providers';

  const loadAgents = useCallback(() => {
    fetchManagedAgents({ compact: true })
      .then(setAgents)
      .catch(() => {})
      .finally(() => setAgentsHydrated(true));
  }, []);

  useEffect(() => {
    if (activeTab !== 'messaging' || agentsHydrated) return;
    void loadAgents();
  }, [activeTab, agentsHydrated, loadAgents]);

  // Pick the first agent for messaging channel bindings.
  // If none exists and user opens Messaging tab, auto-create a default one.
  const firstAgent = agents[0];

  const ensureAgent = useCallback(async (): Promise<string | null> => {
    if (firstAgent) return firstAgent.id;
    setCreatingAgent(true);
    try {
      const agent = await createManagedAgent({
        name: "My Assistant",
        template_id: "personal_deep_research",
      });
      setAgents((prev) => [...prev, agent]);
      return agent.id;
    } catch {
      return null;
    } finally {
      setCreatingAgent(false);
    }
  }, [firstAgent]);

  const tabs = [
    { id: 'sources' as const, label: 'Connected Apps', icon: Database },
    { id: 'messaging' as const, label: 'Reach Me', icon: MessageSquare },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
          Connected Apps &amp; Reach Me
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          Connect the apps and accounts JARVIS should understand, then choose how JARVIS can reach you outside the browser when something matters.
        </p>
        <div className="grid gap-3 mt-4 md:grid-cols-3">
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
              Best First Move
            </div>
            <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Add one account, connect one provider or app, then come back later if you want to broaden JARVIS with more sources.
            </div>
          </div>
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
              Keep It Private
            </div>
            <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Accounts and connected sources stay scoped to the selected user and account workspace instead of becoming one shared system inbox.
            </div>
          </div>
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
              Why It Helps
            </div>
            <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Connected sources make search, briefings, and specialist agents much more useful because they can finally work with your real context.
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 px-6 flex gap-1 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors cursor-pointer"
            style={{
              background: activeTab === tab.id ? 'var(--color-accent-subtle)' : 'transparent',
              color: activeTab === tab.id ? 'var(--color-text)' : 'var(--color-text-secondary)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              border: activeTab === tab.id ? '1px solid var(--color-border)' : '1px solid transparent',
            }}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {activeTab === 'sources' && <DataSourcesSection focusProviders={focusProviders} />}
        {activeTab === 'messaging' && (
          firstAgent ? (
            <MessagingSection agentId={firstAgent.id} />
          ) : creatingAgent ? (
            <div className="flex items-center gap-3 p-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              <Loader2 size={16} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
              Setting up your assistant...
            </div>
          ) : (
            <div
              style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                padding: 18,
                maxWidth: 680,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                Set up your first specialist
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
                Reach Me works through a real agent, so the first step is to create one specialist that JARVIS can use for updates, reminders, or alerts.
              </div>
              <div className="grid gap-3 mb-4 md:grid-cols-2">
                <div
                  className="rounded-lg p-4"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
                    Why This Comes First
                  </div>
                  <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    Messaging channels attach to an actual agent, so JARVIS needs one specialist ready before it can wire phone or chat access correctly.
                  </div>
                </div>
                <div
                  className="rounded-lg p-4"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
                    Next Step
                  </div>
                  <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    JARVIS will create one starter specialist for you, then you can connect phone or chat routes to that same specialist without extra setup guesswork.
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {['Create specialist', 'Choose route', 'Send a test'].map((step, index) => (
                  <span
                    key={step}
                    className="px-2.5 py-1.5 rounded-full text-[11px]"
                    style={{ background: 'rgba(124,58,237,0.12)', color: 'var(--color-text)' }}
                  >
                    {index + 1}. {step}
                  </span>
                ))}
              </div>
              <button
                onClick={() => { void ensureAgent(); }}
                disabled={creatingAgent}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 14px',
                  background: creatingAgent ? '#444' : '#7c3aed',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: creatingAgent ? 'default' : 'pointer',
                }}
              >
                <Plus size={14} />
                {creatingAgent ? 'Setting up specialist...' : 'Set up your first specialist'}
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
