import { ShieldAlert } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { UserManagementSection } from './SettingsPage';

export function AdminPage() {
  const currentUser = useAppStore((s) => s.currentUser);
  const canManageUsers = currentUser?.role === 'superadmin' || currentUser?.role === 'admin';

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--color-error)' }}
            >
              <ShieldAlert size={18} />
            </div>
            <div>
              <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
                Admin
              </h1>
              <div className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Create users, assign roles, disable accounts, and handle password recovery from one dedicated control surface.
              </div>
            </div>
          </div>
        </div>

        {canManageUsers ? (
          <UserManagementSection currentUser={currentUser} />
        ) : (
          <div className="rounded-xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
              Admin access required
            </div>
            <div className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              This page is only available to accounts with the `admin` or `superadmin` role.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
