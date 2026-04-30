import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  bindAgentChannel,
  sendblueRegisterWebhook,
  sendblueHealth,
} from '../../lib/api';
import type { ChannelBinding } from '../../lib/api';
// SendBlue wizard — simplified for standalone page
export function SendBlueSection({
  agentId,
  binding,
  onDone,
  onRemove,
}: {
  agentId: string;
  binding?: ChannelBinding;
  onDone: () => void;
  onRemove: (id: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [phone, setPhone] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'registering' | 'done' | 'error'>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    if (binding) {
      sendblueHealth().then(setHealth).catch(() => {});
    }
  }, [agentId, binding]);

  const registerWebhook = async () => {
    if (!webhookUrl.trim()) return;
    setWebhookStatus('registering');
    try {
      const url = webhookUrl.trim().replace(/\/+$/, '') + '/v1/channels/sendblue/webhook';
      await sendblueRegisterWebhook(apiKey.trim(), apiSecret.trim(), url);
      setWebhookStatus('done');
    } catch {
      setWebhookStatus('error');
    }
  };

  if (binding) {
    const cfg = (binding.config || {}) as Record<string, unknown>;
    return (
      <div style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid #2a5a3a',
        borderRadius: 8, marginBottom: 10,
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px' }}>
          <span style={{ fontSize: 18, marginRight: 10 }}>{'\uD83D\uDCF1'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>iMessage + SMS</div>
            <div style={{ fontSize: 11, color: '#4ade80' }}>
              Active &mdash; text {(cfg.phone_number as string) || 'your number'} to chat
            </div>
          </div>
          <button
            onClick={() => onRemove(binding.id)}
            style={{
              fontSize: 10, padding: '2px 8px',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: 4, cursor: 'pointer',
            }}
          >Remove</button>
        </div>
        {health && (
          <div style={{
            borderTop: '1px solid var(--color-border)',
            padding: '8px 14px', fontSize: 11,
            color: 'var(--color-text-secondary)',
          }}>
            Webhook: {health.webhook_registered ? 'registered' : 'not registered'}
            {health.phone_number && ` \u2022 ${health.phone_number}`}
          </div>
        )}
      </div>
    );
  }

  const inputStyle: CSSProperties = {
    width: '100%', padding: '6px 10px',
    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
    borderRadius: 4, color: 'var(--color-text)', fontSize: 12,
    boxSizing: 'border-box',
  };

  // Not active — setup wizard
  const steps = [
    {
      title: 'Get SendBlue API keys',
      content: (
        <div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            SendBlue lets your agent send and receive iMessages and SMS. You need an account and API credentials.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <a
              href="https://sendblue.co"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#60a5fa', fontSize: 12, textDecoration: 'underline' }}
            >
              1. Sign up at sendblue.co &rarr;
            </a>
          </div>
          <div style={{ marginBottom: 8 }}>
            <a
              href="https://dashboard.sendblue.co/api-credentials"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#60a5fa', fontSize: 12, textDecoration: 'underline' }}
            >
              2. Go to your API Credentials page &rarr;
            </a>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            Copy the "API Key" and "API Secret" from the credentials page and paste them below.
          </div>
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="API Key" style={{ ...inputStyle, marginTop: 4 }} />
          <input value={apiSecret} onChange={(e) => setApiSecret(e.target.value)}
            placeholder="API Secret" type="password" style={{ ...inputStyle, marginTop: 4 }} />
        </div>
      ),
      canAdvance: apiKey.trim() && apiSecret.trim(),
    },
    {
      title: 'Enter your phone number',
      content: (
        <div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            Which phone number should SendBlue use? This is the number people will text to reach your agent.
          </div>
          <input value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="+1XXXXXXXXXX" style={inputStyle} />
        </div>
      ),
      canAdvance: phone.trim().length >= 10,
    },
    {
      title: 'Set up webhook (ngrok tunnel)',
      content: (
        <div>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            SendBlue needs a public URL to send incoming messages to your local server. Use ngrok to create a tunnel.
          </div>
          <div style={{
            fontSize: 11, lineHeight: 1.6,
            color: 'var(--color-text-secondary)',
            padding: '8px 10px', marginBottom: 10,
            background: 'var(--color-bg-secondary)',
            borderRadius: 6,
            borderLeft: '3px solid var(--color-accent, #7c3aed)',
          }}>
            <div><strong>1.</strong> Open a terminal and run: <code style={{ color: 'var(--color-accent)', background: 'var(--color-bg)', padding: '1px 4px', borderRadius: 3 }}>ngrok http 8000</code></div>
            <div style={{ marginTop: 4 }}><strong>2.</strong> Copy the <code style={{ color: 'var(--color-accent)', background: 'var(--color-bg)', padding: '1px 4px', borderRadius: 3 }}>https://</code> forwarding URL (e.g. https://abc123.ngrok.io)</div>
            <div style={{ marginTop: 4 }}><strong>3.</strong> Paste it below and click "Register Webhook"</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={webhookUrl}
              onChange={(e) => { setWebhookUrl(e.target.value); setWebhookStatus('idle'); }}
              placeholder="https://abc123.ngrok-free.app"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={registerWebhook}
              disabled={!webhookUrl.trim() || webhookStatus === 'registering'}
              style={{
                fontSize: 11, padding: '6px 12px', whiteSpace: 'nowrap',
                background: webhookStatus === 'done' ? '#22c55e' : '#7c3aed',
                color: 'white', border: 'none', borderRadius: 4,
                cursor: 'pointer', fontWeight: 600,
                opacity: !webhookUrl.trim() || webhookStatus === 'registering' ? 0.5 : 1,
              }}
            >
              {webhookStatus === 'registering' ? 'Registering...'
                : webhookStatus === 'done' ? 'Registered!'
                : webhookStatus === 'error' ? 'Retry'
                : 'Register Webhook'}
            </button>
          </div>
          {webhookStatus === 'done' && (
            <div style={{ fontSize: 11, color: '#22c55e', marginTop: 6 }}>
              Webhook registered! Incoming texts will be forwarded to your agent.
            </div>
          )}
          {webhookStatus === 'error' && (
            <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>
              Failed to register webhook. Check your ngrok URL and SendBlue credentials.
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 8 }}>
            Don't have ngrok? <a href="https://ngrok.com/download" target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>Download it free</a>. You can also skip this step and register the webhook later.
          </div>
        </div>
      ),
      canAdvance: true, // webhook is optional — user can skip
    },
  ];

  const handleFinish = async () => {
    setLoading(true);
    setError('');
    try {
      await bindAgentChannel(agentId, 'sendblue', {
        api_key: apiKey.trim(),
        api_secret: apiSecret.trim(),
        phone_number: phone.trim(),
      });
      // If webhook was registered in the wizard, that's already done.
      // If not, try a best-effort registration with the provided URL.
      if (webhookUrl.trim() && webhookStatus !== 'done') {
        try {
          const url = webhookUrl.trim().replace(/\/+$/, '') + '/v1/channels/sendblue/webhook';
          await sendblueRegisterWebhook(apiKey.trim(), apiSecret.trim(), url);
        } catch { /* */ }
      }
      onDone();
      setStep(0);
      setApiKey('');
      setApiSecret('');
      setPhone('');
      setWebhookUrl('');
      setWebhookStatus('idle');
    } catch (err: any) {
      setError(err.message || 'Failed to connect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: 'var(--color-bg-secondary)',
      border: '1px dashed var(--color-border)',
      borderRadius: 8, marginBottom: 10,
      overflow: 'hidden',
    }}>
      <div
        style={{
          display: 'flex', alignItems: 'center',
          padding: '12px 14px', cursor: 'pointer',
        }}
        onClick={() => setStep(step === 0 && !apiKey ? -1 : 0)}
      >
        <span style={{ fontSize: 18, marginRight: 10 }}>{'\uD83D\uDCF1'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>iMessage + SMS (SendBlue)</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
            Let people text your agent from any phone
          </div>
        </div>
        <span style={{ color: '#7c3aed', fontSize: 11, fontWeight: 500 }}>
          {step >= 0 ? 'Set Up' : '+ Add'}
        </span>
      </div>

      {step >= 0 && (
        <div style={{ borderTop: '1px solid var(--color-border)', padding: 14 }}>
          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {steps.map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1, height: 3, borderRadius: 2,
                  background: i <= step ? '#7c3aed' : 'var(--color-border)',
                }}
              />
            ))}
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
            {steps[step]?.title}
          </div>
          {steps[step]?.content}

          {error && (
            <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                style={{
                  fontSize: 12, padding: '6px 16px',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 5, cursor: 'pointer',
                }}
              >Back</button>
            )}
            {step < steps.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!steps[step]?.canAdvance}
                style={{
                  fontSize: 12, padding: '6px 16px',
                  background: '#7c3aed', color: 'white',
                  border: 'none', borderRadius: 5,
                  cursor: 'pointer', fontWeight: 600,
                  opacity: steps[step]?.canAdvance ? 1 : 0.5,
                }}
              >Next</button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={loading || !steps[step]?.canAdvance}
                style={{
                  fontSize: 12, padding: '6px 16px',
                  background: '#7c3aed', color: 'white',
                  border: 'none', borderRadius: 5,
                  cursor: 'pointer', fontWeight: 600,
                  opacity: loading || !steps[step]?.canAdvance ? 0.5 : 1,
                }}
              >{loading ? 'Connecting...' : 'Connect'}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
