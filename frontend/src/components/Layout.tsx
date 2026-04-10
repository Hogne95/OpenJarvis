import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { Sidebar } from './Sidebar/Sidebar';
import { SystemPulse } from './SystemPulse';
import { useAppStore } from '../lib/store';
import { checkHealth, logoutAuth } from '../lib/api';

export function Layout() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const apiReachable = useAppStore((s) => s.apiReachable);
  const setApiReachable = useAppStore((s) => s.setApiReachable);
  const currentUser = useAppStore((s) => s.currentUser);
  const clearCurrentUser = useAppStore((s) => s.clearCurrentUser);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const check = () => checkHealth().then(setApiReachable).catch(() => setApiReachable(false));
    check();
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const navigate = useNavigate();
  const logout = async () => {
    setLoggingOut(true);
    try {
      await logoutAuth();
    } catch {
      // Even if the server-side revoke fails, clear local session state.
    } finally {
      clearCurrentUser();
      setLoggingOut(false);
      navigate('/');
    }
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden" style={{ paddingTop: '3px' }}>
      <SystemPulse apiReachable={apiReachable} />
      <div
        className="flex items-center justify-end gap-3 px-4 py-2 text-xs uppercase tracking-[0.18em] shrink-0"
        style={{
          borderBottom: '1px solid rgba(34, 211, 238, 0.08)',
          background: 'rgba(2, 8, 15, 0.72)',
          color: 'var(--color-text-secondary)',
        }}
      >
        <span>{currentUser?.display_name || currentUser?.username || 'Authenticated user'}</span>
        <button
          onClick={() => void logout()}
          disabled={loggingOut}
          className="rounded-full border px-3 py-1 text-[11px] transition"
          style={{
            borderColor: 'rgba(34, 211, 238, 0.18)',
            color: 'var(--color-text)',
            background: loggingOut ? 'rgba(34, 211, 238, 0.12)' : 'transparent',
            cursor: loggingOut ? 'wait' : 'pointer',
          }}
        >
          {loggingOut ? 'Signing out' : 'Sign out'}
        </button>
      </div>

      {/* Health check banner */}
      {apiReachable === false && (
        <div
          className="flex items-center gap-3 px-4 py-2 text-sm shrink-0"
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.15)',
            color: 'var(--color-text)',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: 'var(--color-error)' }}
          />
          <span>Cannot reach OpenJarvis backend</span>
          <button
            onClick={() => navigate('/settings')}
            className="text-sm underline cursor-pointer ml-auto shrink-0"
            style={{ color: 'var(--color-accent)' }}
          >
            Change URL
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <Sidebar />
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/40 md:hidden"
            onClick={() => useAppStore.getState().setSidebarOpen(false)}
          />
        )}
        <main className="flex-1 flex flex-col min-w-0 h-full" style={{ background: 'var(--color-bg)' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
