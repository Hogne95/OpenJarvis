import { useCallback, useEffect, useState } from 'react';
import {
  fetchAgentChannels,
  bindAgentChannel,
  unbindAgentChannel,
} from '../../lib/api';
import type { ChannelBinding } from '../../lib/api';
import { MESSAGING_CHANNELS } from './messagingChannels';
import type { MessagingChannelConfig } from './messagingChannels';
import { MessagingChannelCard } from './MessagingChannelCard';
import { SendBlueSection } from './SendBlueSection';

export function MessagingSection({ agentId }: { agentId: string }) {
  const [bindings, setBindings] = useState<ChannelBinding[]>([]);
  const [setupType, setSetupType] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const loadBindings = useCallback(() => {
    fetchAgentChannels(agentId).then(setBindings).catch(() => setBindings([]));
  }, [agentId]);

  useEffect(() => { loadBindings(); }, [loadBindings]);

  const setField = (key: string, value: string) =>
    setFormValues((prev) => ({ ...prev, [key]: value }));

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
    } catch { /* */ } finally { setLoading(false); }
  };

  const handleRemove = async (bindingId: string) => {
    try {
      await unbindAgentChannel(agentId, bindingId);
      loadBindings();
    } catch { /* */ }
  };

  return (
    <div>
      {/* SendBlue */}
      <SendBlueSection
        agentId={agentId}
        binding={bindings.find((b) => b.channel_type === 'sendblue')}
        onDone={loadBindings}
        onRemove={(id) => { unbindAgentChannel(agentId, id).then(loadBindings).catch(() => {}); }}
      />

      {/* Other messaging channels */}
      {MESSAGING_CHANNELS.map((ch) => {
        const binding = bindings.find((b) => b.channel_type === ch.type);
        const isSetup = setupType === ch.type;

        return (
          <MessagingChannelCard
            key={ch.type}
            channel={ch}
            binding={binding}
            isSetup={isSetup}
            formValues={formValues}
            loading={loading}
            onToggleSetup={() => {
              setSetupType(isSetup ? null : ch.type);
              setFormValues({});
            }}
            onFieldChange={setField}
            onConnect={() => handleSetup(ch)}
            onRemove={handleRemove}
          />
        );
      })}
    </div>
  );
}

