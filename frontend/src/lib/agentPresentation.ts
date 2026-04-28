import type { AgentTemplate, ManagedAgent } from './api';
import { PROVIDER_CATALOG, SOURCE_CATALOG } from '../types/connectors';

const AGENT_DESCRIPTION_CATALOG: Record<string, string> = {
  'jarvis planner': 'Turns requests into safe plans, priorities, and next steps.',
  'jarvis executor': 'Carries out approved work across tools, coding, and operations.',
  'jarvis vision specialist': 'Interprets screenshots, HUD context, and visual targets.',
  'jarvis inbox triager': 'Sorts inbox pressure, flags urgent items, and suggests next actions.',
  'jarvis meeting prep': 'Builds concise meeting briefings from calendar, inbox, and memory context.',
};

const DEDUPED_SYSTEM_AGENT_NAMES = new Set(Object.keys(AGENT_DESCRIPTION_CATALOG));

export const TEMPLATE_INSTRUCTIONS: Record<string, string> = {
  'personal-watcher': 'Watch my personal inbox and calendar. Only alert me when a new meeting appears, a meeting changes, something today needs preparation, or an email requires a real action from me. Stay quiet for newsletters, promotions, and low-priority noise. When you alert me, keep it short and clearly say what changed, why it matters, and what I should do next.',
  'personal_watcher': 'Watch my personal inbox and calendar. Only alert me when a new meeting appears, a meeting changes, something today needs preparation, or an email requires a real action from me. Stay quiet for newsletters, promotions, and low-priority noise. When you alert me, keep it short and clearly say what changed, why it matters, and what I should do next.',
  'daily-briefing': 'Every morning, give me a fun quote of the day, summarize my top important emails, list any meetings today from my calendar, and tell me the weather for [my city].',
  'daily_briefing': 'Every morning, give me a fun quote of the day, summarize my top important emails, list any meetings today from my calendar, and tell me the weather for [my city].',
  'research-monitor': 'Search for the latest news and papers on [your topic]. Summarize the top 3 most relevant findings and explain why they matter.',
  'research_monitor': 'Search for the latest news and papers on [your topic]. Summarize the top 3 most relevant findings and explain why they matter.',
  'code-reviewer': 'Review the latest commits in [repo]. Check for bugs, security issues, and style violations. Summarize findings with file paths and line numbers.',
  'code_reviewer': 'Review the latest commits in [repo]. Check for bugs, security issues, and style violations. Summarize findings with file paths and line numbers.',
  'meeting-prep': 'Before my next meeting, pull context from my emails, messages, and past meetings with the attendees. Summarize key topics and suggest talking points.',
  'meeting_prep': 'Before my next meeting, pull context from my emails, messages, and past meetings with the attendees. Summarize key topics and suggest talking points.',
  'personal_deep_research': 'Search across all my personal data - messages, emails, meetings, documents, and notes - to answer [my question]. Cite your sources.',
  'inbox_triager': 'Check my recent emails and messages. Categorize them by priority (urgent, important, FYI, spam). Summarize the top items I should act on.',
};

export const PERSONAL_WATCHER_TEMPLATE: AgentTemplate = {
  id: 'personal-watcher',
  name: 'JARVIS Personal Watcher',
  description: 'Watches your personal inbox and calendar, then only reaches out when something actually matters.',
  source: 'built-in',
  agent_type: 'personal_watcher',
  schedule_type: 'manual',
  schedule_value: '',
  tools: ['email', 'calendar', 'memory_store'],
};

export const AGENTS_LIST_DESCRIPTION =
  'Agents are focused specialists that help JARVIS plan, execute, triage, or prepare work without turning every task into one giant chat.';
export const AGENTS_LIST_GUIDANCE_ACTIVE =
  'Pick an agent card to chat with it, inspect its setup, or run it again.';
export const AGENTS_LIST_GUIDANCE_EMPTY =
  'Start with one recommended role first. You can always add more specialists after the first one proves useful.';
export const AGENTS_LIST_NEXT_STEPS_ACTIVE: string[] = [
  'Open any agent to review its setup and current status.',
  'Use Chat when you want direct back-and-forth with one specialist.',
  'Use Run Agent when you want a fresh execution without opening chat first.',
];
export const AGENTS_LIST_NEXT_STEPS_EMPTY: string[] = [
  'Start with a recommended role instead of building everything from scratch.',
  'Keep the first agent manual until you like the results.',
  'Add connected apps later, once the first role is clearly useful.',
];

export function normalizeAgentName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function describeManagedAgent(agent: ManagedAgent): string {
  const known = AGENT_DESCRIPTION_CATALOG[normalizeAgentName(agent.name)];
  if (known) return known;
  const instruction = String(agent.config?.instruction || '').trim();
  if (!instruction) return 'Custom agent with its own tools, schedule, and operating instructions.';
  const compact = instruction.replace(/\s+/g, ' ');
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
}

export function describeTemplate(tpl: AgentTemplate | null): string {
  if (!tpl) {
    return 'Build a custom specialist with your own instruction, tools, and schedule.';
  }
  return tpl.description || setupHeadlineForTemplate(tpl);
}

export function humanizeAgentType(agentType?: string | null): string {
  if (!agentType) return 'General specialist';
  return agentType
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function statusGuidance(agent: ManagedAgent): string {
  if (agent.status === 'running') return agent.current_activity || 'This agent is actively working through its current job.';
  if (agent.status === 'paused') return 'Paused for safety. Resume it when you want it to continue.';
  if (agent.status === 'error' || agent.status === 'stalled' || agent.status === 'needs_attention') {
    return 'Something interrupted this agent. Review the timeline or use recovery to get it back into a safe state.';
  }
  if (agent.status === 'idle') return 'Ready to chat, run on demand, or wait for its next schedule.';
  return 'Available and ready for the next step.';
}

export function recommendedNextSteps(agent: ManagedAgent): string[] {
  const steps: string[] = [];
  if (!agent.summary_memory) {
    steps.push('Run it once so JARVIS can learn what useful output looks like for this role.');
  }
  if (agent.schedule_type === 'manual') {
    steps.push('Keep it manual until the first run feels right, then add a schedule.');
  }
  if (!agent.config?.instruction) {
    steps.push('Add one clear sentence describing the job you want this agent to handle.');
  }
  if ((agent.status === 'error' || agent.status === 'stalled' || agent.status === 'needs_attention') && !steps.length) {
    steps.push('Open the timeline, check the latest blocker, then recover the agent when you are ready.');
  }
  if (!steps.length) {
    steps.push('Use Chat for quick guidance, or Run Agent when you want a fresh execution.');
    steps.push('Open Connected Apps if you want this agent to work with more real-world context.');
  }
  return steps.slice(0, 3);
}

export function recommendedConnectorIdsForAgent(agent: ManagedAgent): string[] {
  const normalized = normalizeAgentName(agent.name);
  const type = String(agent.agent_type || '').toLowerCase();
  const instruction = String(agent.config?.instruction || '').toLowerCase();

  if (normalized.includes('meeting') || type.includes('meeting')) {
    return ['gcalendar', 'gmail', 'outlook', 'granola', 'notion'];
  }
  if (normalized.includes('inbox') || type.includes('triage')) {
    return ['gmail', 'outlook', 'slack', 'notion'];
  }
  if (normalized.includes('vision') || type.includes('vision')) {
    return ['notion', 'gdrive', 'upload'];
  }
  if (type.includes('deep_research') || instruction.includes('research')) {
    return ['notion', 'gdrive', 'gmail', 'slack', 'upload'];
  }
  if (normalized.includes('planner') || normalized.includes('executor')) {
    return ['gmail', 'slack', 'notion', 'gcalendar', 'gdrive'];
  }
  return ['gmail', 'slack', 'notion'];
}

export function recommendedConnectorsForAgent(agent: ManagedAgent) {
  const ids = recommendedConnectorIdsForAgent(agent);
  return ids
    .map((id) => SOURCE_CATALOG.find((source) => source.connector_id === id))
    .filter((value): value is (typeof SOURCE_CATALOG)[number] => Boolean(value));
}

export function recommendedProvidersForAgent(agent: ManagedAgent) {
  const ids = new Set(recommendedConnectorIdsForAgent(agent));
  return PROVIDER_CATALOG
    .filter((provider) =>
      [...provider.connector_ids, ...(provider.fallbackConnectorIds || [])].some((connectorId) => ids.has(connectorId)),
    )
    .sort((a, b) => {
      const order = ['google', 'microsoft', 'github'];
      return order.indexOf(a.provider_id) - order.indexOf(b.provider_id);
    })
    .slice(0, 2);
}

export function recommendedConnectorIdsForTemplate(tpl: AgentTemplate | null): string[] {
  if (!tpl) return ['gmail', 'slack', 'notion'];
  const normalized = (tpl.id || tpl.name || '').toLowerCase();
  if (normalized.includes('personal-watcher') || normalized.includes('personal_watcher')) return ['microsoft_mail', 'outlook', 'gcalendar', 'gmail'];
  if (normalized.includes('meeting')) return ['gcalendar', 'gmail', 'granola'];
  if (normalized.includes('inbox')) return ['gmail', 'outlook', 'slack'];
  if (normalized.includes('vision')) return ['gdrive', 'notion', 'upload'];
  if (normalized.includes('research')) return ['gdrive', 'notion', 'gmail'];
  if (normalized.includes('code')) return ['github', 'slack', 'notion'];
  return ['gmail', 'slack', 'notion'];
}

export function recommendedConnectorsForTemplate(tpl: AgentTemplate | null) {
  return recommendedConnectorIdsForTemplate(tpl)
    .map((id) => SOURCE_CATALOG.find((source) => source.connector_id === id))
    .filter((value): value is (typeof SOURCE_CATALOG)[number] => Boolean(value));
}

export function templateBestForLabel(tpl: AgentTemplate): string {
  const normalized = (tpl.id || tpl.name || '').toLowerCase();
  if (normalized.includes('personal-watcher') || normalized.includes('personal_watcher')) return 'Best for personal alerts';
  if (normalized.includes('planner')) return 'Best for planning';
  if (normalized.includes('executor')) return 'Best for execution';
  if (normalized.includes('vision')) return 'Best for visual context';
  if (normalized.includes('meeting')) return 'Best for meeting prep';
  if (normalized.includes('inbox')) return 'Best for inbox cleanup';
  if (normalized.includes('research')) return 'Best for recurring research';
  if (normalized.includes('code')) return 'Best for code review';
  return 'Focused starter';
}

export function dedupeTemplatesList(items: AgentTemplate[]): AgentTemplate[] {
  const byKey = new Map<string, AgentTemplate>();
  for (const item of [PERSONAL_WATCHER_TEMPLATE, ...items]) {
    const key = item.id?.trim().toLowerCase() || normalizeAgentName(item.name || '');
    byKey.set(key, item);
  }
  return Array.from(byKey.values());
}

export function dedupeVisibleAgents(items: ManagedAgent[]): ManagedAgent[] {
  const seen = new Set<string>();
  return items.filter((agent) => {
    const normalized = normalizeAgentName(agent.name);
    if (!DEDUPED_SYSTEM_AGENT_NAMES.has(normalized)) return true;
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function isPersonalWatcherTemplate(tpl: AgentTemplate | null | undefined): boolean {
  const normalized = (tpl?.id || tpl?.name || '').toLowerCase();
  return normalized.includes('personal-watcher') || normalized.includes('personal_watcher');
}

export function isPersonalWatcherAgent(agent: ManagedAgent | null | undefined): boolean {
  if (!agent) return false;
  const name = normalizeAgentName(agent.name);
  const type = String(agent.agent_type || '').toLowerCase();
  const instruction = String(agent.config?.instruction || '').toLowerCase();
  return (
    type.includes('personal_watcher') ||
    name.includes('personal watcher') ||
    instruction.includes('watch my personal inbox and calendar')
  );
}

export function humanizeTemplateName(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function defaultAgentNameForTemplate(tpl: AgentTemplate | null): string {
  if (!tpl) return 'Custom Agent';
  return tpl.name?.trim() || humanizeTemplateName(tpl.id || 'Agent');
}

export function setupHeadlineForTemplate(tpl: AgentTemplate | null): string {
  if (!tpl) return 'Start with one clear responsibility. You can add more behavior after the first successful run.';
  const normalized = (tpl.id || tpl.name || '').toLowerCase();
  if (normalized.includes('personal-watcher') || normalized.includes('personal_watcher')) return 'Good for watching your personal inbox and calendar, then notifying you only when something really needs attention.';
  if (normalized.includes('planner')) return 'Good for planning, triage, and deciding what JARVIS should do next.';
  if (normalized.includes('executor')) return 'Good for carrying out bounded work once the objective is clear.';
  if (normalized.includes('vision')) return 'Good for screenshots, interface interpretation, and visual context.';
  if (normalized.includes('meeting')) return 'Good for preparing context, talking points, and likely follow-ups.';
  if (normalized.includes('inbox')) return 'Good for reducing inbox pressure and surfacing what matters first.';
  if (normalized.includes('research')) return 'Good for recurring monitoring, summaries, and signal detection.';
  if (normalized.includes('code')) return 'Good for repo reviews, bug-checking, and coding follow-up.';
  return tpl.description || 'Choose this when you want a focused specialist with strong starter defaults.';
}

export function setupChecklistForTemplate(tpl: AgentTemplate | null): string[] {
  if (!tpl) {
    return [
      'Give the agent a short name you will recognize later.',
      'Write one sentence about the exact job you want done.',
      'Leave advanced settings alone unless you already know you need them.',
    ];
  }
  const normalized = (tpl.id || tpl.name || '').toLowerCase();
  if (normalized.includes('personal-watcher') || normalized.includes('personal_watcher')) {
    return [
      'Connect your personal inbox first, then add calendar when it is ready.',
      'Keep this agent manual until the alerts feel calm and useful.',
      'Set up one notification channel you already check often, then test one run before making it more active.',
    ];
  }
  if (normalized.includes('meeting')) {
    return [
      'Connect calendar and inbox sources if you want the strongest prep.',
      'Keep the instruction specific about which meetings or people matter.',
      'Start manual first, then schedule it once the output feels right.',
    ];
  }
  if (normalized.includes('inbox')) {
    return [
      'Connect email or messaging sources before relying on the summaries.',
      'Define what "urgent" means for you in the instruction.',
      'Start manual first, then move to daily or hourly.',
    ];
  }
  if (normalized.includes('code')) {
    return [
      'Point it at a review or repo goal, not a vague coding request.',
      'Use the recommended model unless you know a better local model already.',
      'Keep advanced settings collapsed for the first run.',
    ];
  }
  return [
    'Start with the template defaults.',
    'Keep the first instruction narrow and concrete.',
    'You can fine-tune later once the first run is useful.',
  ];
}

export function useCasesForTemplate(tpl: AgentTemplate | null): string[] {
  if (!tpl) {
    return [
      'Handle one recurring task you do not want to rebuild from scratch.',
      'Summarize a narrow source of information on demand.',
      'Prepare a short report before you take action.',
    ];
  }
  const normalized = (tpl.id || tpl.name || '').toLowerCase();
  if (normalized.includes('personal-watcher') || normalized.includes('personal_watcher')) {
    return [
      'Tell me when a new meeting appears or changes.',
      'Flag emails that need a real reply or decision.',
      'Give me a short daily action list from inbox and calendar.',
    ];
  }
  if (normalized.includes('meeting')) {
    return [
      'Prepare talking points for my next meeting.',
      'Find likely follow-ups from recent mail and notes.',
      'Summarize what I should know before I join.',
    ];
  }
  if (normalized.includes('inbox')) {
    return [
      'Sort recent messages by urgent, important, and FYI.',
      'Draft short replies for action-needed emails.',
      'Find emails that are waiting on me.',
    ];
  }
  if (normalized.includes('planner')) {
    return [
      'Turn a messy goal into a clear next-step plan.',
      'Compare options before I commit to a direction.',
      'List risks and dependencies for a task.',
    ];
  }
  if (normalized.includes('executor')) {
    return [
      'Run a bounded task after the plan is clear.',
      'Follow up on approved actions.',
      'Report what was completed and what blocked.',
    ];
  }
  if (normalized.includes('vision')) {
    return [
      'Explain what is visible in a screenshot.',
      'Find UI issues in a screen or layout.',
      'Turn visual context into next actions.',
    ];
  }
  if (normalized.includes('research')) {
    return [
      'Track a topic and summarize the strongest signals.',
      'Compare sources before I make a decision.',
      'Create a short brief with citations or source notes.',
    ];
  }
  if (normalized.includes('code')) {
    return [
      'Review a diff for bugs and missing checks.',
      'Summarize what changed in a repo.',
      'Prepare a verification plan before commit.',
    ];
  }
  return [
    'Run a focused task with this specialist.',
    'Use connected apps to give it real context.',
    'Keep the first run narrow, then refine from results.',
  ];
}

export function useCasesForAgent(agent: ManagedAgent): string[] {
  const type = String(agent.agent_type || '').toLowerCase();
  const normalized = normalizeAgentName(agent.name);
  if (isPersonalWatcherAgent(agent)) return useCasesForTemplate(PERSONAL_WATCHER_TEMPLATE);
  if (normalized.includes('meeting') || type.includes('meeting')) {
    return useCasesForTemplate({ ...PERSONAL_WATCHER_TEMPLATE, id: 'meeting-prep', name: 'Meeting Prep' });
  }
  if (normalized.includes('inbox') || type.includes('triage')) {
    return useCasesForTemplate({ ...PERSONAL_WATCHER_TEMPLATE, id: 'inbox_triager', name: 'Inbox Triager' });
  }
  if (normalized.includes('planner')) {
    return useCasesForTemplate({ ...PERSONAL_WATCHER_TEMPLATE, id: 'planner', name: 'Planner' });
  }
  if (normalized.includes('executor')) {
    return useCasesForTemplate({ ...PERSONAL_WATCHER_TEMPLATE, id: 'executor', name: 'Executor' });
  }
  if (normalized.includes('vision') || type.includes('vision')) {
    return useCasesForTemplate({ ...PERSONAL_WATCHER_TEMPLATE, id: 'vision', name: 'Vision' });
  }
  if (type.includes('deep_research') || String(agent.config?.instruction || '').toLowerCase().includes('research')) {
    return useCasesForTemplate({ ...PERSONAL_WATCHER_TEMPLATE, id: 'research-monitor', name: 'Research Monitor' });
  }
  if (type.includes('code') || String(agent.config?.instruction || '').toLowerCase().includes('repo')) {
    return useCasesForTemplate({ ...PERSONAL_WATCHER_TEMPLATE, id: 'code-reviewer', name: 'Code Reviewer' });
  }
  return useCasesForTemplate(null);
}

export function isRecommendedTemplate(tpl: AgentTemplate): boolean {
  const normalized = (tpl.id || tpl.name || '').toLowerCase();
  return (
    normalized.includes('personal-watcher') ||
    normalized.includes('personal_watcher') ||
    normalized.includes('planner') ||
    normalized.includes('executor') ||
    normalized.includes('vision') ||
    normalized.includes('inbox') ||
    normalized.includes('meeting')
  );
}
