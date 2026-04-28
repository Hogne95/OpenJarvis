import type { ManagedAgent } from './api';
import { normalizeAgentName } from './agentPresentation';

export interface ChannelField {
  key: string;
  label: string;
  placeholder: string;
  type?: 'text' | 'password';
  required?: boolean;
}

export interface MessagingChannelConfig {
  type: string;
  name: string;
  icon: string;
  description: string;
  setupSteps: string[];
  fields: ChannelField[];
  activeLabel: (cfg: Record<string, unknown>) => string;
  howToUse: (cfg: Record<string, unknown>) => string;
}

export const MESSAGING_CHANNELS: MessagingChannelConfig[] = [
  {
    type: 'slack',
    name: 'Slack',
    icon: '#',
    description: 'DM your agent in any Slack workspace',
    setupSteps: [
      '1. Go to api.slack.com/apps -> click "Create New App" -> choose "From an app manifest"',
      '2. Select your workspace. When asked for the manifest format, choose JSON. Then paste the manifest below (click "Copy" to copy it):',
      'COPYABLE:{"display_information":{"name":"OpenJarvis"},"features":{"app_home":{"home_tab_enabled":true,"messages_tab_enabled":true,"messages_tab_read_only_enabled":false},"bot_user":{"display_name":"OpenJarvis","always_online":true}},"oauth_config":{"scopes":{"bot":["chat:write","im:write","im:read","im:history","mpim:read","mpim:history","users:read","channels:read","channels:history","channels:join","groups:read","groups:history","app_mentions:read"]}},"settings":{"event_subscriptions":{"bot_events":["message.im"]},"socket_mode_enabled":true}}',
      '3. Click "Next" -> review the summary -> click "Create". Then go to "Install App" in the left sidebar -> click "Install to Workspace" -> click "Allow"',
      '4. In the left sidebar, click "OAuth & Permissions". Copy the "Bot User OAuth Token" (starts with xoxb-...)',
      '5. In the left sidebar, click "Basic Information" -> scroll to "App-Level Tokens" -> click "Generate Token and Scopes" -> name it "socket" -> click "Add Scope" -> select "connections:write" -> click "Generate" -> copy the token (starts with xapp-...)',
      '6. (Optional) Still in "Basic Information", scroll to "Display Information" -> upload the OpenJarvis icon as the app icon',
      '7. Paste both tokens below and click Connect',
    ],
    fields: [
      { key: 'bot_token', label: 'Bot Token', placeholder: 'xoxb-...', type: 'password', required: true },
      { key: 'app_token', label: 'App Token', placeholder: 'xapp-...', type: 'password', required: true },
    ],
    activeLabel: () => 'Connected to Slack',
    howToUse: () => 'Open Slack and DM @OpenJarvis to talk to your agent.',
  },
];

export function recommendedMessagingChannelTypesForAgent(agent: ManagedAgent): string[] {
  const role = (agent.agent_type || '').toLowerCase();
  if (role.includes('inbox') || role.includes('meeting')) return ['sendblue', 'slack'];
  if (role.includes('vision')) return ['slack'];
  if (role.includes('research')) return ['slack'];
  if (role.includes('planner') || role.includes('executor')) return ['sendblue', 'slack'];
  return ['sendblue', 'slack'];
}

export function notificationGoalForAgent(agent: ManagedAgent): string {
  const role = (agent.agent_type || '').toLowerCase();
  const normalized = normalizeAgentName(agent.name);
  if (role.includes('meeting') || normalized.includes('watcher')) {
    return 'Choose where JARVIS should notify you about meeting changes, calendar prep, and important personal updates.';
  }
  if (role.includes('inbox')) {
    return 'Choose where JARVIS should notify you when a message or email needs a real action from you.';
  }
  return 'Choose where JARVIS should reach you when this agent has something worth your attention.';
}

export function notificationRulesForAgent(agent: ManagedAgent): string[] {
  const role = (agent.agent_type || '').toLowerCase();
  const normalized = normalizeAgentName(agent.name);
  if (role.includes('meeting') || normalized.includes('watcher')) {
    return [
      'New meeting added or an existing meeting changes',
      'Something today needs preparation',
      'An email needs a real action, reply, or confirmation',
    ];
  }
  if (role.includes('inbox')) {
    return [
      'A message clearly needs a reply or action',
      'Something urgent has changed since the last check',
      'Low-priority noise should stay quiet',
    ];
  }
  return [
    'Only notify when something is worth your attention',
    'Prefer short alerts with a clear next step',
    'Stay quiet when the update is low-value',
  ];
}
