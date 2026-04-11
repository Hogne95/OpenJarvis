import { useState } from 'react';
import { useNavigate } from 'react-router';

interface LoginPageProps {
  onSubmit: (payload: { username: string; password: string }) => Promise<void>;
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
  maxWidth: '28rem',
  border: '1px solid var(--color-border)',
  background: 'rgba(4, 13, 23, 0.92)',
  borderRadius: '1.5rem',
  padding: '1.75rem',
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

export function LoginPage({ onSubmit }: LoginPageProps) {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({ username, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={shellStyle}>
      <form onSubmit={submit} style={cardStyle}>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.8rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
            JARVIS Access
          </div>
          <h1 style={{ marginTop: '0.6rem', fontSize: '1.9rem', fontWeight: 700, color: 'var(--color-text)' }}>
            Sign in
          </h1>
          <p style={{ marginTop: '0.5rem', color: 'var(--color-text-secondary)' }}>
            Your workspace, inboxes, and assistant context stay isolated to your account.
          </p>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <label style={{ display: 'grid', gap: '0.45rem' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.92rem' }}>Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: '0.45rem' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.92rem' }}>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={inputStyle} />
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
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => navigate('/forgot-password')}
            style={{
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: '0.9rem',
              textDecoration: 'underline',
              textUnderlineOffset: '0.18rem',
            }}
          >
            Forgot password?
          </button>
          <button
            type="button"
            onClick={() => navigate('/reset-password')}
            style={{
              background: 'transparent',
              color: 'var(--color-text-tertiary)',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Have a reset token?
          </button>
        </div>
      </form>
    </div>
  );
}
