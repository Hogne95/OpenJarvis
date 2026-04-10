import { useState } from 'react';

interface BootstrapPageProps {
  onSubmit: (payload: {
    username: string;
    password: string;
    display_name: string;
  }) => Promise<void>;
}

const shellStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2rem',
  background:
    'radial-gradient(circle at top, rgba(34,211,238,0.12), transparent 30%), var(--color-bg)',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '32rem',
  border: '1px solid var(--color-border)',
  background: 'rgba(4, 13, 23, 0.94)',
  borderRadius: '1.5rem',
  padding: '1.9rem',
  boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: '0.9rem',
  border: '1px solid var(--color-input-border)',
  background: 'var(--color-input-bg)',
  color: 'var(--color-text)',
  padding: '0.9rem 1rem',
};

export function BootstrapPage({ onSubmit }: BootstrapPageProps) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        username,
        password,
        display_name: displayName,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bootstrap failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={shellStyle}>
      <form onSubmit={submit} style={cardStyle}>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.8rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
            JARVIS Bootstrap
          </div>
          <h1 style={{ marginTop: '0.6rem', fontSize: '1.9rem', fontWeight: 700, color: 'var(--color-text)' }}>
            Create the first admin
          </h1>
          <p style={{ marginTop: '0.5rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            This account becomes the initial JARVIS owner. Future family or friend accounts will stay isolated behind this auth layer.
          </p>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <label style={{ display: 'grid', gap: '0.45rem' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.92rem' }}>Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: '0.45rem' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.92rem' }}>Display name</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: '0.45rem' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.92rem' }}>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: '0.45rem' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.92rem' }}>Confirm password</span>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" style={inputStyle} />
          </label>
        </div>

        {error ? (
          <div style={{ marginTop: '1rem', color: '#fda4af', fontSize: '0.92rem' }}>{error}</div>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          style={{
            marginTop: '1.4rem',
            width: '100%',
            borderRadius: '999px',
            border: 'none',
            padding: '0.95rem 1rem',
            background: submitting ? 'rgba(34,211,238,0.35)' : 'linear-gradient(90deg, #0891b2, #22d3ee)',
            color: '#031018',
            fontWeight: 700,
            cursor: submitting ? 'wait' : 'pointer',
          }}
        >
          {submitting ? 'Creating admin...' : 'Create admin account'}
        </button>
      </form>
    </div>
  );
}
