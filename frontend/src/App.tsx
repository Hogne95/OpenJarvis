import { Suspense, lazy, useEffect, useState, useCallback, useRef } from 'react';
import { Routes, Route } from 'react-router';
import { Layout } from './components/Layout';
import { CommandPalette } from './components/CommandPalette';
import { SetupScreen } from './components/SetupScreen';
import { Toaster } from './components/ui/sonner';
import { useAppStore } from './lib/store';
import {
  bootstrapAuth,
  fetchModels,
  fetchAuthStatus,
  fetchRecommendedModel,
  fetchRuntimeReadiness,
  fetchServerInfo,
  fetchSavings,
  fetchSpeechHealth,
  fetchVoiceLoopStatus,
  forgotPasswordAuth,
  loginAuth,
  preloadModel,
  resetPasswordAuth,
  submitSavings,
  isTauri,
  startVoiceLoop,
} from './lib/api';
import { OptInModal } from './components/OptInModal';
import { BootstrapPage } from './pages/BootstrapPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

const ChatPage = lazy(() => import('./pages/ChatPage').then((module) => ({ default: module.ChatPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const GetStartedPage = lazy(() => import('./pages/GetStartedPage').then((module) => ({ default: module.GetStartedPage })));
const AgentsPage = lazy(() => import('./pages/AgentsPage').then((module) => ({ default: module.AgentsPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const DataSourcesPage = lazy(() => import('./pages/DataSourcesPage').then((module) => ({ default: module.DataSourcesPage })));
const LogsPage = lazy(() => import('./pages/LogsPage').then((module) => ({ default: module.LogsPage })));
const WorkspacePage = lazy(() => import('./pages/WorkspacePage').then((module) => ({ default: module.WorkspacePage })));
const OperationsPage = lazy(() => import('./pages/OperationsPage').then((module) => ({ default: module.OperationsPage })));
const BriefingsPage = lazy(() => import('./pages/BriefingsPage').then((module) => ({ default: module.BriefingsPage })));
const DesktopPage = lazy(() => import('./pages/DesktopPage').then((module) => ({ default: module.DesktopPage })));
const SystemPage = lazy(() => import('./pages/SystemPage').then((module) => ({ default: module.SystemPage })));

function RouteFallback() {
  return (
    <div className="min-h-screen bg-[#0a0f14] text-cyan-100">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
        <div className="rounded-[1.5rem] border border-cyan-400/10 bg-slate-950/55 px-6 py-5 text-sm uppercase tracking-[0.28em] text-cyan-300/70">
          Loading JARVIS view...
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [setupDone, setSetupDone] = useState(!isTauri());
  const [startupPhase, setStartupPhase] = useState<'idle' | 'checking' | 'arming' | 'ready' | 'warning'>('idle');
  const [startupDetail, setStartupDetail] = useState('');
  const [startupDismissed, setStartupDismissed] = useState(false);
  const handleSetupReady = useCallback(() => setSetupDone(true), []);
  const modelsBootstrapRanRef = useRef(false);
  const warmedModelsRef = useRef<Set<string>>(new Set());
  const serverInfoBootstrapRanRef = useRef(false);
  const optInBootstrapRanRef = useRef(false);
  const startupRanRef = useRef(false);
  const setModels = useAppStore((s) => s.setModels);
  const setModelsLoading = useAppStore((s) => s.setModelsLoading);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const setServerInfo = useAppStore((s) => s.setServerInfo);
  const setSavings = useAppStore((s) => s.setSavings);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const optInEnabled = useAppStore((s) => s.optInEnabled);
  const optInDisplayName = useAppStore((s) => s.optInDisplayName);
  const optInEmail = useAppStore((s) => s.optInEmail);
  const optInAnonId = useAppStore((s) => s.optInAnonId);
  const optInModalSeen = useAppStore((s) => s.optInModalSeen);
  const optInModalOpen = useAppStore((s) => s.optInModalOpen);
  const setOptInModalOpen = useAppStore((s) => s.setOptInModalOpen);
  const markOptInModalSeen = useAppStore((s) => s.markOptInModalSeen);
  const authStatusResolved = useAppStore((s) => s.authStatusResolved);
  const authBootstrapRequired = useAppStore((s) => s.authBootstrapRequired);
  const currentUser = useAppStore((s) => s.currentUser);
  const setAuthStatus = useAppStore((s) => s.setAuthStatus);
  const resetTokenHint = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('token') || ''
    : '';

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    if (settings.theme === 'dark') root.classList.add('dark');
    else if (settings.theme === 'light') root.classList.add('light');
  }, [settings.theme]);

  useEffect(() => {
    modelsBootstrapRanRef.current = false;
    warmedModelsRef.current.clear();
    serverInfoBootstrapRanRef.current = false;
    startupRanRef.current = false;
    setStartupPhase('idle');
    setStartupDetail('');
    setStartupDismissed(false);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!setupDone || authStatusResolved) return;
    let cancelled = false;

    fetchAuthStatus()
      .then((status) => {
        if (cancelled) return;
        setAuthStatus({
          resolved: true,
          bootstrapRequired: status.bootstrap_required,
          currentUser: status.user,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setAuthStatus({
          resolved: true,
          bootstrapRequired: false,
          currentUser: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [authStatusResolved, setAuthStatus, setupDone]);

  useEffect(() => {
    if (!currentUser) return;
    if (modelsBootstrapRanRef.current) return;
    modelsBootstrapRanRef.current = true;
    let cancelled = false;

    fetchModels()
      .then(async (m) => {
        if (cancelled) return;
        setModels(m);
        if (selectedModel || m.length === 0) return;

        try {
          const recommended = await fetchRecommendedModel();
          if (cancelled) return;
          const recommendedId = recommended.model;
          if (recommendedId && m.some((model) => model.id === recommendedId)) {
            setSelectedModel(recommendedId);
            return;
          }
        } catch {
          // Fall back to the first available model when recommendation fails.
        }

        setSelectedModel(m[0].id);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, selectedModel, setModels, setModelsLoading, setSelectedModel]);

  useEffect(() => {
    if (!currentUser || !selectedModel) return;
    if (warmedModelsRef.current.has(selectedModel)) return;
    warmedModelsRef.current.add(selectedModel);

    const timer = window.setTimeout(() => {
      void preloadModel(selectedModel).catch(() => {
        warmedModelsRef.current.delete(selectedModel);
      });
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [currentUser, selectedModel]);

  useEffect(() => {
    if (!currentUser) return;
    if (serverInfoBootstrapRanRef.current) return;
    serverInfoBootstrapRanRef.current = true;
    let cancelled = false;

    fetchServerInfo()
      .then((info) => {
        if (!cancelled) setServerInfo(info);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;

    const refresh = () =>
      fetchSavings()
        .then((data) => {
          if (cancelled) return;
          setSavings(data);
          if (optInEnabled && optInDisplayName && data) {
            const claudeEntry = data.per_provider.find(
              (p) => p.provider === 'claude-opus-4.6',
            );
            const dollarSavings = claudeEntry ? claudeEntry.total_cost : 0;
            const energySaved = data.per_provider.reduce(
              (sum, p) => sum + (p.energy_wh || 0),
              0,
            );
            const flopsSaved = data.per_provider.reduce(
              (sum, p) => sum + (p.flops || 0),
              0,
            );
            submitSavings({
              anon_id: optInAnonId,
              display_name: optInDisplayName,
              email: optInEmail,
              total_calls: data.total_calls,
              total_tokens: data.total_tokens,
              dollar_savings: dollarSavings,
              energy_wh_saved: energySaved,
              flops_saved: flopsSaved,
              token_counting_version: data.token_counting_version ?? 1,
            });
          }
        })
        .catch(() => {});
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser, optInEnabled, optInDisplayName, optInAnonId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (optInBootstrapRanRef.current) return;
    optInBootstrapRanRef.current = true;
    if (!optInModalSeen) {
      setOptInModalOpen(true);
      markOptInModalSeen();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!setupDone || !currentUser || startupRanRef.current) return;
    startupRanRef.current = true;
    let cancelled = false;

    const runStartup = async () => {
      setStartupPhase('checking');
      setStartupDetail('Checking runtime readiness and voice dependencies...');
      try {
        const [readiness, speech, voice] = await Promise.all([
          fetchRuntimeReadiness().catch(() => null),
          fetchSpeechHealth().catch(() => null),
          fetchVoiceLoopStatus().catch(() => null),
        ]);
        if (cancelled) return;

        const blockedCount = readiness?.summary?.blocked || 0;
        const speechAvailable = !!speech?.available;

        if (speechAvailable && !settings.speechEnabled) {
          updateSettings({ speechEnabled: true });
        }

        if (speechAvailable && !voice?.active) {
          setStartupPhase('arming');
          setStartupDetail('Arming the voice loop so JARVIS is ready when the HUD opens...');
          try {
            await startVoiceLoop(['no', 'en']);
          } catch (error) {
            if (!cancelled) {
              setStartupPhase('warning');
              setStartupDetail(error instanceof Error ? error.message : 'Voice loop did not arm during startup.');
              return;
            }
          }
        }

        if (cancelled) return;
        setStartupPhase(blockedCount ? 'warning' : 'ready');
        setStartupDetail(
          blockedCount
            ? 'JARVIS started, but some runtime checks still need attention. Open System for details.'
            : 'JARVIS is ready. Voice and core runtime checks passed.',
        );
      } catch (error) {
        if (cancelled) return;
        setStartupPhase('warning');
        setStartupDetail(error instanceof Error ? error.message : 'Startup procedure could not complete.');
      }
    };

    void runStartup();
    return () => {
      cancelled = true;
    };
  }, [currentUser, setupDone, settings.speechEnabled, updateSettings]);

  const toggleSystemPanel = useAppStore((s) => s.toggleSystemPanel);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault();
        toggleSystemPanel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen, toggleSystemPanel]);

  if (!setupDone) {
    return <SetupScreen onReady={handleSetupReady} />;
  }

  if (!authStatusResolved) {
    return <RouteFallback />;
  }

  if (authBootstrapRequired) {
    return (
      <BootstrapPage
        onSubmit={async (payload) => {
          const result = await bootstrapAuth(payload);
          setAuthStatus({
            resolved: true,
            bootstrapRequired: false,
            currentUser: result.user,
          });
        }}
      />
    );
  }

  if (!currentUser) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route
            path="/forgot-password"
            element={(
              <ForgotPasswordPage
                onSubmit={async (email) => {
                  const result = await forgotPasswordAuth(email);
                  return result.detail;
                }}
              />
            )}
          />
          <Route
            path="/reset-password"
            element={(
              <ResetPasswordPage
                tokenHint={resetTokenHint}
                onSubmit={async (payload) => {
                  await resetPasswordAuth(payload);
                }}
              />
            )}
          />
          <Route
            path="*"
            element={(
              <LoginPage
                onSubmit={async (payload) => {
                  const result = await loginAuth(payload);
                  setAuthStatus({
                    resolved: true,
                    bootstrapRequired: false,
                    currentUser: result.user,
                  });
                }}
              />
            )}
          />
        </Routes>
      </Suspense>
    );
  }

  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route index element={<DashboardPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route element={<Layout />}>
            <Route path="chat" element={<ChatPage />} />
            <Route path="workspace" element={<WorkspacePage />} />
            <Route path="operations" element={<OperationsPage />} />
            <Route path="briefings" element={<BriefingsPage />} />
            <Route path="desktop" element={<DesktopPage />} />
            <Route path="system" element={<SystemPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="get-started" element={<GetStartedPage />} />
                  <Route path="data-sources" element={<DataSourcesPage />} />
                  <Route path="agents" element={<AgentsPage />} />
                  <Route path="admin" element={<AdminPage />} />
                  <Route path="logs" element={<LogsPage />} />
          </Route>
        </Routes>
      </Suspense>
      {!startupDismissed && startupPhase !== 'idle' && startupPhase !== 'ready' ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-start justify-center px-6 py-6">
          <div className="pointer-events-auto w-full max-w-2xl rounded-[1.4rem] border border-cyan-400/12 bg-slate-950/92 p-5 text-cyan-50 shadow-[0_0_40px_rgba(34,211,238,0.14)] backdrop-blur-xl">
            <div className="text-[10px] uppercase tracking-[0.34em] text-cyan-300/60">Startup Procedure</div>
            <div className="mt-3 text-xl uppercase tracking-[0.18em] text-cyan-50">
              {startupPhase === 'checking' ? 'Preparing JARVIS' : 'Startup Attention Needed'}
            </div>
            <div className="mt-3 text-sm leading-7 text-slate-200/76">{startupDetail}</div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => setStartupDismissed(true)}
                className="rounded-[1rem] border border-cyan-400/15 bg-cyan-400/[0.08] px-4 py-3 text-xs uppercase tracking-[0.24em] text-cyan-100 transition hover:bg-cyan-400/[0.14]"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <Toaster position="bottom-right" />
      {commandPaletteOpen && <CommandPalette />}
      {optInModalOpen && (
        <OptInModal onClose={() => setOptInModalOpen(false)} />
      )}
    </>
  );
}
