import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

interface ResetPasswordPageProps {
  onSubmit: (payload: { token: string; password: string }) => Promise<void>;
  tokenHint?: string;
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
  maxWidth: '30rem',
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

export function ResetPasswordPage({ onSubmit, tokenHint = '' }: ResetPasswordPageProps) {
  const navigate = useNavigate();
  const initialToken = useMemo(() => tokenHint.trim(), [tokenHint]);
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ token, password });
      setNotice('Password reset complete. You can sign in now.');
      setTimeout(() => navigate('/'), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={shellStyle}>
      <form onSubmit={submit} style={cardStyle}>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.8rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)' }}>
            JARVIS Recovery
          </div>
          <h1 style={{ marginTop: '0.6rem', fontSize: '1.9rem', fontWeight: 700, color: 'var(--color-text)' }}>
            Reset password
          </h1>
          <p style={{ marginTop: '0.5rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            Use the token from your recovery email to set a new password.
          </p>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <label style={{ display: 'grid', gap: '0.45rem' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.92rem' }}>Reset token</span>
            <input value={token} onChange={(e) => setToken(e.target.value)} autoComplete="one-time-code" style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: '0.45rem' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.92rem' }}>New password</span>
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
        {notice ? (
          <div style={{ marginTop: '1rem', color: '#67e8f9', fontSize: '0.92rem' }}>{notice}</div>
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
          {submitting ? 'Resetting password...' : 'Set new password'}
        </button>

        <button
          type="button"
          onClick={() => navigate('/')}
          style={{
            marginTop: '1rem',
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          Back to sign in
        </button>
      </form>
    </div>
  );
}
