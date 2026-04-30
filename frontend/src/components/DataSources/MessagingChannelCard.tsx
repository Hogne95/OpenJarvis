import type { CSSProperties } from 'react';
import type { ChannelBinding } from '../../lib/api';
import type { MessagingChannelConfig } from './messagingChannels';

interface MessagingChannelCardProps {
  channel: MessagingChannelConfig;
  binding?: ChannelBinding;
  isSetup: boolean;
  formValues: Record<string, string>;
  loading: boolean;
  onToggleSetup: () => void;
  onFieldChange: (key: string, value: string) => void;
  onConnect: () => void;
  onRemove: (bindingId: string) => void;
}

export function MessagingChannelCard({
  channel,
  binding,
  isSetup,
  formValues,
  loading,
  onToggleSetup,
  onFieldChange,
  onConnect,
  onRemove,
}: MessagingChannelCardProps) {
  const cfg = (binding?.config || {}) as Record<string, unknown>;
  const canConnect = channel.fields.every((field) => !field.required || formValues[field.key]?.trim());

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    color: 'var(--color-text)',
    fontSize: 12,
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        background: 'var(--color-bg-secondary)',
        border: binding ? '1px solid #2a5a3a' : '1px dashed var(--color-border)',
        borderRadius: 8,
        marginBottom: 10,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px' }}>
        <span style={{ fontSize: 18, marginRight: 10 }}>{channel.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{channel.name}</div>
          <div
            style={{
              fontSize: 11,
              color: binding ? '#4ade80' : 'var(--color-text-secondary)',
            }}
          >
            {binding ? channel.activeLabel(cfg) : channel.description}
          </div>
        </div>
        {binding ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                background: '#2a5a3a',
                color: '#4ade80',
                padding: '2px 8px',
                borderRadius: 10,
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              Active
            </span>
            <button
              onClick={() => onRemove(binding.id)}
              style={{
                fontSize: 10,
                padding: '2px 8px',
                background: 'transparent',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            onClick={onToggleSetup}
            style={{
              fontSize: 10,
              padding: '3px 12px',
              background: '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: 5,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {isSetup ? 'Cancel' : 'Set Up'}
          </button>
        )}
      </div>

      {binding && (
        <div
          style={{
            borderTop: '1px solid var(--color-border)',
            padding: '10px 14px',
            background: 'var(--color-bg)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-text-secondary)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
            }}
          >
            <span style={{ flexShrink: 0 }}>{'\u2192'}</span>
            <span>{channel.howToUse(cfg)}</span>
          </div>
        </div>
      )}

      {isSetup && (
        <div
          style={{
            borderTop: '1px solid var(--color-border)',
            padding: 14,
            background: 'var(--color-bg)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              lineHeight: 1.5,
              color: 'var(--color-text-secondary)',
              marginBottom: 12,
              padding: '8px 10px',
              background: 'var(--color-bg-secondary)',
              borderRadius: 6,
              borderLeft: '3px solid var(--color-accent, #7c3aed)',
            }}
          >
            {channel.setupSteps.map((step, index) => {
              if (step.startsWith('COPYABLE:')) {
                const text = step.slice(9);
                return (
                  <div key={index} style={{ marginBottom: 6, marginTop: 4 }}>
                    <div
                      style={{
                        position: 'relative',
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 4,
                        padding: '8px 10px',
                        fontSize: 10,
                        fontFamily: 'monospace',
                        wordBreak: 'break-all',
                        lineHeight: 1.4,
                        maxHeight: 80,
                        overflowY: 'auto',
                      }}
                    >
                      {text}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(text);
                        }}
                        style={{
                          position: 'sticky',
                          float: 'right',
                          top: 0,
                          fontSize: 10,
                          padding: '2px 8px',
                          background: '#7c3aed',
                          color: 'white',
                          border: 'none',
                          borderRadius: 3,
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={index} style={{ marginBottom: index < channel.setupSteps.length - 1 ? 4 : 0 }}>
                  {step}
                </div>
              );
            })}
          </div>
          {channel.fields.map((field) => (
            <div key={field.key} style={{ marginBottom: 8 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  color: 'var(--color-text-secondary)',
                  marginBottom: 3,
                  fontWeight: 500,
                }}
              >
                {field.label}
                {field.required ? ' *' : ''}
              </label>
              <input
                type={field.type || 'text'}
                value={formValues[field.key] || ''}
                onChange={(event) => onFieldChange(field.key, event.target.value)}
                placeholder={field.placeholder}
                style={inputStyle}
              />
            </div>
          ))}
          <button
            onClick={onConnect}
            disabled={loading || !canConnect}
            style={{
              fontSize: 12,
              padding: '7px 20px',
              background: '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: 5,
              cursor: 'pointer',
              fontWeight: 600,
              opacity: loading || !canConnect ? 0.5 : 1,
              marginTop: 4,
            }}
          >
            {loading ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      )}
    </div>
  );
}
