import { useState, useEffect } from 'react';
import {
  Settings,
  Palette,
  Globe,
  Cpu,
  Database,
  Info,
  Check,
  Sun,
  Moon,
  Monitor,
  Download,
  Upload,
  Trash2,
  Mic,
  Key,
  Search,
  AlertTriangle,
  ShieldAlert,
  UserPlus,
} from 'lucide-react';
import { useAppStore, type ThemeMode } from '../lib/store';
import {
  checkHealth,
  fetchOperatorMemory,
  fetchOperatorMemoryAnalytics,
  fetchRuntimeReadiness,
  fetchSpeechHealth,
  fetchWithTimeout,
  fetchUsers,
  createUserAdmin,
  updateUserAdmin,
  updateOperatorMemoryProfile,
  resetUserPasswordAdmin,
  type RuntimeReadiness,
  type AuthUser,
  type DurableOperatorProfile,
  type OperatorMemoryAnalyticsResponse,
} from '../lib/api';

function OllamaModelList() {
  const [models, setModels] = useState<Array<{ name: string; size: number }>>([]);
  useEffect(() => {
    fetchWithTimeout('http://localhost:11434/api/tags', {}, 5000)
      .then(r => r.json())
      .then(data => setModels((data.models || []).map((m: any) => ({ name: m.name, size: m.size }))))
      .catch(() => setModels([]));
  }, []);
  if (models.length === 0) return <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>No models loaded</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {models.map(m => (
        <span key={m.name} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px]"
          style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
          {m.name} ({(m.size / 1e9).toFixed(1)} GB)
        </span>
      ))}
    </div>
  );
}

function ApiKeyInput({ storageKey, placeholder }: { storageKey: string; placeholder: string }) {
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(storageKey) || ''; } catch { return ''; }
  });
  const [saved, setSaved] = useState(false);
  const save = (v: string) => {
    setValue(v);
    try { if (v) localStorage.setItem(storageKey, v); else localStorage.removeItem(storageKey); } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return (
    <div className="flex items-center gap-2">
      <input type="password" value={value} onChange={e => save(e.target.value)} placeholder={placeholder}
        className="w-48 px-2 py-1 rounded text-xs"
        style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
      {saved && <span className="text-[10px]" style={{ color: '#22c55e' }}>Saved</span>}
    </div>
  );
}

function CloudProviderStatus({ label, storageKey }: { label: string; storageKey: string }) {
  const [hasKey, setHasKey] = useState(false);
  useEffect(() => {
    try { setHasKey(!!localStorage.getItem(storageKey)); } catch { setHasKey(false); }
  }, [storageKey]);
  return (
    <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
        background: hasKey ? '#22c55e' : 'var(--color-text-tertiary)',
      }} />
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text)' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function UserManagementSection({ currentUser }: { currentUser: AuthUser | null }) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    username: '',
    display_name: '',
    password: '',
    role: 'user',
  });

  const canManageUsers = currentUser?.role === 'superadmin' || currentUser?.role === 'admin';

  const loadUsers = async () => {
    if (!canManageUsers) return;
    setLoading(true);
    try {
      setUsers(await fetchUsers());
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, [canManageUsers]);

  if (!canManageUsers) return null;

  const createUser = async () => {
    if (!form.username.trim() || !form.password.trim()) return;
    setSaving(true);
    try {
      const created = await createUserAdmin({
        username: form.username.trim(),
        display_name: form.display_name.trim(),
        password: form.password,
        role: form.role,
      });
      setUsers((prev) => [...prev, created]);
      setForm({ username: '', display_name: '', password: '', role: 'user' });
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const patchUser = async (userId: string, payload: Parameters<typeof updateUserAdmin>[1]) => {
    try {
      const updated = await updateUserAdmin(userId, payload);
      setUsers((prev) => prev.map((user) => (user.id === userId ? updated : user)));
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
    }
  };

  const resetPassword = async (userId: string) => {
    const nextPassword = passwordDrafts[userId]?.trim();
    if (!nextPassword) return;
    try {
      const updated = await resetUserPasswordAdmin(userId, nextPassword);
      setUsers((prev) => prev.map((user) => (user.id === userId ? updated : user)));
      setPasswordDrafts((prev) => ({ ...prev, [userId]: '' }));
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    }
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-bg-secondary)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 12,
  };

  return (
    <Section title="User Management">
      <div className="mb-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        Root cause: login alone is not enough for safe household or friend access. JARVIS now has server-side admin controls so you can create users, restrict roles, disable accounts, and reset passwords without crossing privacy boundaries.
      </div>

      <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
        <input
          value={form.username}
          onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
          placeholder="username"
          style={inputStyle}
        />
        <input
          value={form.display_name}
          onChange={(e) => setForm((prev) => ({ ...prev, display_name: e.target.value }))}
          placeholder="display name"
          style={inputStyle}
        />
        <input
          type="password"
          value={form.password}
          onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
          placeholder="temporary password"
          style={inputStyle}
        />
        <div className="flex gap-2">
          <select
            value={form.role}
            onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
            style={{ ...inputStyle, minWidth: 110 }}
          >
            <option value="user">User</option>
            <option value="restricted">Restricted</option>
            {currentUser?.role === 'superadmin' && <option value="admin">Admin</option>}
          </select>
          <button
            onClick={createUser}
            disabled={saving || !form.username.trim() || !form.password.trim()}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer"
            style={{
              background: saving || !form.username.trim() || !form.password.trim() ? '#444' : 'var(--color-accent)',
              color: 'white',
              border: 'none',
            }}
          >
            <UserPlus size={13} />
            {saving ? 'Adding...' : 'Add user'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Loading users...</div>
      ) : (
        <div className="grid gap-3">
          {users.map((user) => {
            const isSelf = user.id === currentUser?.id;
            const isElevated = user.role === 'admin' || user.role === 'superadmin';
            const canEditElevated = currentUser?.role === 'superadmin';
            return (
              <div
                key={user.id}
                className="rounded-lg p-3"
                style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm" style={{ color: 'var(--color-text)' }}>
                      {user.display_name}
                      <span className="ml-2 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                        @{user.username}
                      </span>
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                      role: {user.role} · status: {user.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={user.role}
                      disabled={isSelf || (isElevated && !canEditElevated)}
                      onChange={(e) => void patchUser(user.id, { role: e.target.value })}
                      style={{ ...inputStyle, minWidth: 110, padding: '6px 8px' }}
                    >
                      <option value="user">User</option>
                      <option value="restricted">Restricted</option>
                      {currentUser?.role === 'superadmin' && <option value="admin">Admin</option>}
                      {currentUser?.role === 'superadmin' && <option value="superadmin">Superadmin</option>}
                    </select>
                    <select
                      value={user.status}
                      disabled={isSelf || (isElevated && !canEditElevated)}
                      onChange={(e) => void patchUser(user.id, { status: e.target.value })}
                      style={{ ...inputStyle, minWidth: 110, padding: '6px 8px' }}
                    >
                      <option value="active">Active</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </div>
                </div>
                {!isSelf && (!isElevated || canEditElevated) && (
                  <div className="flex items-center gap-2 mt-3">
                    <input
                      type="password"
                      value={passwordDrafts[user.id] || ''}
                      onChange={(e) => setPasswordDrafts((prev) => ({ ...prev, [user.id]: e.target.value }))}
                      placeholder="new password"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      onClick={() => void resetPassword(user.id)}
                      disabled={!passwordDrafts[user.id]?.trim()}
                      className="px-3 py-2 rounded-lg text-xs font-medium cursor-pointer"
                      style={{
                        background: !passwordDrafts[user.id]?.trim() ? '#444' : 'var(--color-accent)',
                        color: 'white',
                        border: 'none',
                      }}
                    >
                      Reset password
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mt-3 text-xs" style={{ color: 'var(--color-error)' }}>
          {error}
        </div>
      )}
    </Section>
  );
}

function AssistantProfileSection({ onSaved }: { onSaved: () => void }) {
  const [profile, setProfile] = useState<DurableOperatorProfile | null>(null);
  const [analytics, setAnalytics] = useState<OperatorMemoryAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [memory, nextAnalytics] = await Promise.all([
          fetchOperatorMemory(),
          fetchOperatorMemoryAnalytics().catch(() => null),
        ]);
        if (!cancelled) {
          setProfile(memory.profile);
          setAnalytics(nextAnalytics);
          setError('');
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load assistant profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-bg-secondary)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 12,
  };

  const updateField = (key: keyof DurableOperatorProfile, value: string | string[]) => {
    setProfile((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const updated = await updateOperatorMemoryProfile(profile);
      setProfile(updated.profile);
      setAnalytics(await fetchOperatorMemoryAnalytics().catch(() => null));
      setError('');
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to update assistant profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Personal Assistant Profile">
      <div className="mb-4 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        Root cause: JARVIS could infer your working style, but you could not explicitly shape how it handles you. This profile now lets each user steer tone, depth, autonomy, and decisiveness so personalization is deliberate as well as learned.
      </div>
      {loading ? (
        <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Loading assistant profile...</div>
      ) : profile ? (
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Reply tone</div>
              <input value={profile.reply_tone || ''} onChange={(e) => updateField('reply_tone', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <div className="mb-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Honorific</div>
              <input value={profile.honorific || ''} onChange={(e) => updateField('honorific', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <div className="mb-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Verbosity</div>
              <select value={profile.verbosity_preference || 'adaptive'} onChange={(e) => updateField('verbosity_preference', e.target.value)} style={inputStyle}>
                <option value="adaptive">Adaptive</option>
                <option value="concise-first">Concise first</option>
                <option value="detailed when useful">Detailed when useful</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Technical depth</div>
              <select value={profile.technical_depth || 'adaptive'} onChange={(e) => updateField('technical_depth', e.target.value)} style={inputStyle}>
                <option value="adaptive">Adaptive</option>
                <option value="high">High</option>
                <option value="simple">Simple</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Decisiveness</div>
              <select value={profile.decisiveness_preference || 'recommend clearly'} onChange={(e) => updateField('decisiveness_preference', e.target.value)} style={inputStyle}>
                <option value="recommend clearly">Recommend clearly</option>
                <option value="take the lead and recommend strongly">Take the lead</option>
                <option value="cautious and explicit about tradeoffs">Cautious with tradeoffs</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Autonomy</div>
              <select value={profile.autonomy_preference || 'balanced'} onChange={(e) => updateField('autonomy_preference', e.target.value)} style={inputStyle}>
                <option value="balanced">Balanced</option>
                <option value="high initiative">High initiative</option>
                <option value="guided">Guided</option>
              </select>
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Personality notes</div>
            <textarea
              value={profile.personality_notes || ''}
              onChange={(e) => updateField('personality_notes', e.target.value)}
              rows={3}
              style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
              placeholder="Optional notes about how JARVIS should handle you."
            />
          </div>
          <div
            className="rounded-lg p-3"
            style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
          >
            <div className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>Current JARVIS Handling</div>
            <div className="mt-2 text-xs leading-6" style={{ color: 'var(--color-text-secondary)' }}>
              {analytics?.operating_profile?.summary || 'JARVIS will derive an operating profile once enough profile and usage signals are available.'}
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <div className="rounded-lg px-3 py-2" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <div className="text-[10px] uppercase" style={{ color: 'var(--color-text-tertiary)' }}>Execution</div>
                <div className="mt-1 text-xs" style={{ color: 'var(--color-text)' }}>{analytics?.operating_profile?.execution_mode || 'balanced'}</div>
              </div>
              <div className="rounded-lg px-3 py-2" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <div className="text-[10px] uppercase" style={{ color: 'var(--color-text-tertiary)' }}>Briefing</div>
                <div className="mt-1 text-xs" style={{ color: 'var(--color-text)' }}>{analytics?.operating_profile?.briefing_mode || 'direct'}</div>
              </div>
              <div className="rounded-lg px-3 py-2" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <div className="text-[10px] uppercase" style={{ color: 'var(--color-text-tertiary)' }}>Caution</div>
                <div className="mt-1 text-xs" style={{ color: 'var(--color-text)' }}>{analytics?.operating_profile?.caution_level || 'measured'}</div>
              </div>
            </div>
            <div className="mt-3 text-xs leading-6" style={{ color: 'var(--color-text-tertiary)' }}>
              {analytics?.operating_profile?.adaptation_note || 'JARVIS will explain its adaptation strategy here once the signal is clearer.'}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void saveProfile()}
              disabled={saving}
              className="px-3 py-2 rounded-lg text-xs font-medium cursor-pointer"
              style={{
                background: saving ? '#444' : 'var(--color-accent)',
                color: 'white',
                border: 'none',
              }}
            >
              {saving ? 'Saving...' : 'Save Assistant Profile'}
            </button>
            {error ? <span className="text-xs" style={{ color: 'var(--color-error)' }}>{error}</span> : null}
          </div>
        </div>
      ) : (
        <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Assistant profile unavailable.</div>
      )}
    </Section>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
      <div>
        <div className="text-sm" style={{ color: 'var(--color-text)' }}>{label}</div>
        {description && (
          <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{description}</div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

const themeOptions: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const conversations = useAppStore((s) => s.conversations);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const currentUser = useAppStore((s) => s.currentUser);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [speechBackendAvailable, setSpeechBackendAvailable] = useState<boolean | null>(null);
  const [runtimeReadiness, setRuntimeReadiness] = useState<RuntimeReadiness | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    checkHealth().then(setHealthy);
    fetchSpeechHealth()
      .then((h) => setSpeechBackendAvailable(h.available))
      .catch(() => setSpeechBackendAvailable(false));
    fetchRuntimeReadiness()
      .then(setRuntimeReadiness)
      .catch(() => setRuntimeReadiness(null));
  }, []);

  const showSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleExport = () => {
    const data = localStorage.getItem('openjarvis-conversations') || '{}';
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openjarvis-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (data.version === 1) {
            localStorage.setItem('openjarvis-conversations', JSON.stringify(data));
            useAppStore.getState().loadConversations();
            showSaved();
          }
        } catch {}
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const [confirmClear, setConfirmClear] = useState(false);
  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    localStorage.removeItem('openjarvis-conversations');
    useAppStore.getState().loadConversations();
    setConfirmClear(false);
    showSaved();
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Settings size={24} style={{ color: 'var(--color-accent)' }} />
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
            Settings
          </h1>
          {saved && (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{
              background: 'var(--color-accent-subtle)',
              color: 'var(--color-success)',
            }}>
              <Check size={12} /> Saved
            </span>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <UserManagementSection currentUser={currentUser} />
          <AssistantProfileSection onSaved={showSaved} />

          {/* Appearance */}
          <Section title="Appearance">
            <SettingRow label="Theme" description="Choose how OpenJarvis looks">
              <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--color-bg-secondary)' }}>
                {themeOptions.map((opt) => {
                  const isActive = settings.theme === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => { updateSettings({ theme: opt.value }); showSaved(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer"
                      style={{
                        background: isActive ? 'var(--color-surface)' : 'transparent',
                        color: isActive ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                        boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                      }}
                    >
                      <opt.icon size={14} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </SettingRow>
            <SettingRow label="Font size">
              <select
                value={settings.fontSize}
                onChange={(e) => { updateSettings({ fontSize: e.target.value as any }); showSaved(); }}
                className="text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer"
                style={{
                  background: 'var(--color-bg-secondary)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <option value="small">Small</option>
                <option value="default">Default</option>
                <option value="large">Large</option>
              </select>
            </SettingRow>
          </Section>

          {/* Connection */}
          <Section title="Connection">
            <SettingRow label="Server status" description={serverInfo ? `${serverInfo.engine} / ${serverInfo.model}` : 'Not connected'}>
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: healthy === true ? 'var(--color-success)' : healthy === false ? 'var(--color-error)' : 'var(--color-text-tertiary)' }}
                />
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {healthy === true ? 'Connected' : healthy === false ? 'Disconnected' : 'Checking...'}
                </span>
              </div>
            </SettingRow>
            <SettingRow label="API URL" description="Set if backend runs on a different port or host">
              <input
                type="text"
                value={settings.apiUrl}
                onChange={(e) => { updateSettings({ apiUrl: e.target.value }); showSaved(); }}
                placeholder="http://localhost:8000"
                className="text-sm px-3 py-1.5 rounded-lg outline-none w-56"
                style={{
                  background: 'var(--color-bg-secondary)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                }}
              />
            </SettingRow>
          </Section>

          <Section title="Runtime Readiness">
            <div className="mb-3 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              JARVIS now reports which advanced systems are actually ready before you rely on them.
            </div>
            <SettingRow
              label="Readiness summary"
              description={
                runtimeReadiness
                  ? `${runtimeReadiness.summary.ready}/${runtimeReadiness.summary.total} checks ready`
                  : 'Checking runtime readiness'
              }
            >
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {runtimeReadiness ? `${runtimeReadiness.summary.blocked} blocked` : '...'}
                </span>
              </div>
            </SettingRow>
            <div className="mt-2 grid gap-2">
              {(runtimeReadiness?.checks || []).map((item) => {
                const Icon = item.status === 'ready' ? Check : item.status === 'blocked' ? ShieldAlert : AlertTriangle;
                const color =
                  item.status === 'ready'
                    ? 'var(--color-success)'
                    : item.status === 'blocked'
                    ? 'var(--color-error)'
                    : '#f59e0b';
                return (
                  <div
                    key={item.id}
                    className="rounded-lg px-3 py-3"
                    style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
                      <Icon size={14} style={{ color }} />
                      {item.label}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {item.detail}
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
                      {item.recommendation}
                    </div>
                  </div>
                );
              })}
            </div>
            {runtimeReadiness?.desktop ? (
              <div className="mt-3 rounded-lg px-3 py-3 text-xs" style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                <div style={{ color: 'var(--color-text)' }}>Desktop packaging paths</div>
                <div className="mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
                  Report: {runtimeReadiness.desktop.report_path}
                </div>
                <div style={{ color: 'var(--color-text-tertiary)' }}>
                  Guide: {runtimeReadiness.desktop.guide_path}
                </div>
              </div>
            ) : null}
          </Section>

          {/* Models */}
          <Section title="Models">
            <SettingRow label="Local models (Ollama)" description="Models available for local inference">
              <OllamaModelList />
            </SettingRow>
            <div className="text-xs mt-2 px-1" style={{ color: 'var(--color-text-tertiary)' }}>
              Run <code className="px-1 py-0.5 rounded text-[11px]" style={{ background: 'var(--color-bg-tertiary)' }}>ollama pull &lt;model-name&gt;</code> in your terminal to add more models
            </div>
            <SettingRow label="Cloud providers" description="Green dot means API key is configured">
              <div className="flex flex-wrap gap-3">
                <CloudProviderStatus label="OpenAI" storageKey="openjarvis-openai-key" />
                <CloudProviderStatus label="Anthropic" storageKey="openjarvis-anthropic-key" />
                <CloudProviderStatus label="Google" storageKey="openjarvis-gemini-key" />
                <CloudProviderStatus label="OpenRouter" storageKey="openjarvis-openrouter-key" />
              </div>
            </SettingRow>
          </Section>

          {/* API Keys */}
          <Section title="API Keys">
            <SettingRow label="OpenAI" description="GPT-4, GPT-3.5, etc.">
              <ApiKeyInput storageKey="openjarvis-openai-key" placeholder="sk-..." />
            </SettingRow>
            <SettingRow label="Anthropic" description="Claude models">
              <ApiKeyInput storageKey="openjarvis-anthropic-key" placeholder="sk-ant-..." />
            </SettingRow>
            <SettingRow label="Google" description="Gemini models">
              <ApiKeyInput storageKey="openjarvis-gemini-key" placeholder="AI..." />
            </SettingRow>
            <SettingRow label="OpenRouter" description="Multi-provider routing">
              <ApiKeyInput storageKey="openjarvis-openrouter-key" placeholder="sk-or-..." />
            </SettingRow>
          </Section>

          {/* Tools */}
          <Section title="Tools">
            <SettingRow label="Web Search" description="SerpAPI or Tavily key for web search tool">
              <ApiKeyInput storageKey="openjarvis-search-key" placeholder="API key..." />
            </SettingRow>
          </Section>

          {/* Model defaults */}
          <Section title="Model Defaults">
            <SettingRow label="Temperature" description={`${settings.temperature}`}>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={settings.temperature}
                onChange={(e) => { updateSettings({ temperature: parseFloat(e.target.value) }); showSaved(); }}
                className="w-32 cursor-pointer accent-[var(--color-accent)]"
              />
            </SettingRow>
            <SettingRow label="Max tokens" description={`${settings.maxTokens}`}>
              <input
                type="range"
                min="256"
                max="32768"
                step="256"
                value={settings.maxTokens}
                onChange={(e) => { updateSettings({ maxTokens: parseInt(e.target.value) }); showSaved(); }}
                className="w-32 cursor-pointer accent-[var(--color-accent)]"
              />
            </SettingRow>
          </Section>

          {/* Speech */}
          <Section title="Speech">
            <SettingRow label="Speech-to-Text" description="Enable microphone input for voice dictation">
              <button
                onClick={() => { updateSettings({ speechEnabled: !settings.speechEnabled }); showSaved(); }}
                className="relative w-11 h-6 rounded-full transition-colors cursor-pointer"
                style={{
                  background: settings.speechEnabled ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform bg-white"
                  style={{
                    transform: settings.speechEnabled ? 'translateX(20px)' : 'translateX(0)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                />
              </button>
            </SettingRow>
            <SettingRow label="Backend status" description="Requires Whisper, Deepgram, or another speech backend">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: speechBackendAvailable === true ? 'var(--color-success)'
                      : speechBackendAvailable === false ? 'var(--color-text-tertiary)'
                      : 'var(--color-text-tertiary)',
                  }}
                />
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {speechBackendAvailable === null ? 'Checking...'
                    : speechBackendAvailable ? 'Available'
                    : 'Not configured'}
                </span>
              </div>
            </SettingRow>
            {!speechBackendAvailable && speechBackendAvailable !== null && (
              <div className="text-xs mt-2 px-1" style={{ color: 'var(--color-text-tertiary)' }}>
                Set up a speech backend to use voice input.
                See the <a href="https://open-jarvis.github.io/OpenJarvis/user-guide/tools/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>documentation</a> for details.
              </div>
            )}
          </Section>

          {/* Data */}
          <Section title="Data">
            <SettingRow label="Conversations" description={`${conversations.length} stored locally`}>
              <div className="flex gap-2">
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-bg-secondary)')}
                >
                  <Download size={12} /> Export
                </button>
                <button
                  onClick={handleImport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-bg-secondary)')}
                >
                  <Upload size={12} /> Import
                </button>
              </div>
            </SettingRow>
            <SettingRow label="Clear all data" description="Permanently delete all conversations">
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                style={{
                  color: confirmClear ? 'white' : 'var(--color-error)',
                  background: confirmClear ? 'var(--color-error)' : 'transparent',
                  border: '1px solid var(--color-error)',
                }}
                onMouseEnter={(e) => { if (!confirmClear) e.currentTarget.style.background = 'rgba(220,38,38,0.1)'; }}
                onMouseLeave={(e) => { if (!confirmClear) e.currentTarget.style.background = 'transparent'; }}
              >
                <Trash2 size={12} /> {confirmClear ? 'Click again to confirm' : 'Clear'}
              </button>
            </SettingRow>
          </Section>

          {/* About */}
          <Section title="About">
            <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              <p className="mb-2">
                <span className="font-semibold" style={{ color: 'var(--color-text)' }}>OpenJarvis</span> — Programming abstractions for on-device AI.
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                Part of Intelligence Per Watt, a research initiative at Stanford SAIL.
              </p>
              <div className="flex gap-3 mt-3 text-xs">
                <a
                  href="https://scalingintelligence.stanford.edu/blogs/openjarvis/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Project site
                </a>
                <a
                  href="https://open-jarvis.github.io/OpenJarvis/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--color-accent)' }}
                >
                  Documentation
                </a>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
