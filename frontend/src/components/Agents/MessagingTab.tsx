import { useCallback, useEffect, useState } from 'react';
import {
  bindAgentChannel,
  fetchAgentChannels,
  unbindAgentChannel,
} from '../../lib/api';
import type { ChannelBinding, ManagedAgent } from '../../lib/api';
import {
  MESSAGING_CHANNELS,
  notificationGoalForAgent,
  notificationRulesForAgent,
  recommendedMessagingChannelTypesForAgent,
} from '../../lib/agentMessagingPresentation';
import type { MessagingChannelConfig } from '../../lib/agentMessagingPresentation';
import { SendBlueWizard } from './SendBlueWizard';

export function MessagingTab({ agentId, agent }: { agentId: string; agent: ManagedAgent }) {
  const [bindings, setBindings] = useState<ChannelBinding[]>([]);
  const [setupType, setSetupType] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const loadBindings = useCallback(() => {
    fetchAgentChannels(agentId).then(setBindings).catch(() => setBindings([]));
  }, [agentId]);

  useEffect(() => {
    loadBindings();
  }, [loadBindings]);

  const setField = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSetup = async (ch: MessagingChannelConfig) => {
    const missing = ch.fields.filter((f) => f.required && !formValues[f.key]?.trim());
    if (missing.length > 0) return;

    setLoading(true);
    try {
      const config: Record<string, string> = {};
      for (const f of ch.fields) {
        const v = formValues[f.key]?.trim();
        if (v) config[f.key] = v;
      }
      await bindAgentChannel(agentId, ch.type, config);
      setSetupType(null);
      setFormValues({});
      loadBindings();
    } catch {
      // Keep the tab usable if a provider rejects credentials.
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (bindingId: string) => {
    try {
      await unbindAgentChannel(agentId, bindingId);
      loadBindings();
    } catch {
      // Ignore removal failures; the next refresh will show the true state.
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    color: 'var(--color-text)',
    fontSize: 12,
    boxSizing: 'border-box',
  };

  const recommendedChannelTypes = recommendedMessagingChannelTypesForAgent(agent);
  const recommendedChannels = [
    ...(bindings.some((b) => b.channel_type === 'sendblue')
      ? []
      : [
          {
            type: 'sendblue',
            name: 'SendBlue Phone Chat',
            description: 'Best when you want to message this agent from your phone with the least friction.',
          },
        ]),
    ...MESSAGING_CHANNELS.filter((channel) => recommendedChannelTypes.includes(channel.type)).map((channel) => ({
      type: channel.type,
      name: channel.name,
      description: channel.description,
    })),
  ].slice(0, 2);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginBottom: 14 }}>
        {notificationGoalForAgent(agent)}
      </div>

      <div className="grid gap-3 md:grid-cols-3 mb-4">
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            Best First Notification Path
          </div>
          <div className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            {bindings.length > 0
              ? 'You already have one active route. Add another one only if you want a backup or a separate workflow.'
              : `${recommendedChannels[0]?.name || 'SendBlue Phone Chat'} is the easiest first option when you want JARVIS to reach you outside the dashboard.`}
          </div>
          {recommendedChannels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {recommendedChannels.map((channel) => (
                <button
                  key={channel.type}
                  type="button"
                  onClick={() => {
                    setSetupType(channel.type);
                    setFormValues({});
                  }}
                  className="px-2.5 py-1.5 rounded-full text-[11px] cursor-pointer"
                  style={{ background: 'rgba(124,58,237,0.12)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                >
                  {channel.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            After You Launch
          </div>
          <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Once a channel is active, you can reach this same specialist outside the dashboard from the device you already use most.
          </div>
        </div>

        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
            Good Notification Rules
          </div>
          <div className="space-y-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {notificationRulesForAgent(agent).map((rule) => (
              <div key={rule}>- {rule}</div>
            ))}
          </div>
        </div>
      </div>

      <div
        className="rounded-xl p-4 mb-4"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
          Simple Path
        </div>
        <div className="flex flex-wrap gap-2">
          {['Pick one route', 'Connect it', 'Send one test', 'Keep the rest quiet'].map((step, index) => (
            <span
              key={step}
              className="px-2.5 py-1.5 rounded-full text-[11px]"
              style={{ background: 'rgba(124,58,237,0.12)', color: 'var(--color-text)' }}
            >
              {index + 1}. {step}
            </span>
          ))}
        </div>
      </div>

      <SendBlueWizard
        agentId={agentId}
        binding={bindings.find((b) => b.channel_type === 'sendblue')}
        onDone={loadBindings}
        onRemove={(id) => {
          unbindAgentChannel(agentId, id).then(loadBindings).catch(() => {});
        }}
      />

      <div
        style={{
          fontSize: 10,
          color: 'var(--color-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          margin: '14px 0 8px',
          fontWeight: 600,
        }}
      >
        Other notification options
      </div>

      {bindings.length === 0 && (
        <div
          className="rounded-xl p-5 mb-3 text-center"
          style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
          <div className="text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
            No notification route is active yet
          </div>
          <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            Start with one route you already check often. You can always add another route later if this agent becomes part of your daily workflow.
          </div>
        </div>
      )}

      {MESSAGING_CHANNELS.map((ch) => {
        const binding = bindings.find((b) => b.channel_type === ch.type);
        const cfg = (binding?.config || {}) as Record<string, unknown>;
        const isSetup = setupType === ch.type;
        const canConnect = ch.fields.every((f) => !f.required || formValues[f.key]?.trim());

        return (
          <div
            key={ch.type}
            style={{
              background: 'var(--color-bg-secondary)',
              border: binding ? '1px solid #2a5a3a' : '1px dashed var(--color-border)',
              borderRadius: 8,
              marginBottom: 10,
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px' }}>
              <span style={{ fontSize: 18, marginRight: 10 }}>{ch.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{ch.name}</div>
                <div style={{ fontSize: 11, color: binding ? '#4ade80' : 'var(--color-text-secondary)' }}>
                  {binding ? ch.activeLabel(cfg) : ch.description}
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
                    onClick={() => handleRemove(binding.id)}
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
                  onClick={() => {
                    setSetupType(isSetup ? null : ch.type);
                    setFormValues({});
                  }}
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
                  <span>{ch.howToUse(cfg)}</span>
                </div>
              </div>
            )}

            {isSetup && (
              <div
                style={{
                  borderTop: '1px solid var(--color-border)',
                  padding: '14px',
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
                  {ch.setupSteps.map((step, i) => {
                    if (step.startsWith('COPYABLE:')) {
                      const text = step.slice(9);
                      return (
                        <div key={i} style={{ marginBottom: 6, marginTop: 4 }}>
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
                      <div key={i} style={{ marginBottom: i < ch.setupSteps.length - 1 ? 4 : 0 }}>
                        {step}
                      </div>
                    );
                  })}
                </div>

                {ch.fields.map((field) => (
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
                      onChange={(e) => setField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      style={inputStyle}
                    />
                  </div>
                ))}

                <button
                  onClick={() => handleSetup(ch)}
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
      })}
    </div>
  );
}
