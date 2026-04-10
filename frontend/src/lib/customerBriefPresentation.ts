import type { InboxSummaryItem } from './api';

type CustomerAccount = {
  key: string;
  name: string;
  health: string;
  sentiment: string;
  churn_risk: string;
  next_step: string;
};

type CustomerInteraction = {
  key: string;
  contact: string;
  channel: string;
  topic: string;
  urgency: string;
  status: string;
  sentiment: string;
  promised_follow_up: string;
};

export type CustomerBrief = {
  title: string;
  summary: string;
  details: string;
  counts: Array<{ label: string; value: string }>;
  focusItems: Array<{ label: string; detail: string }>;
  prompt: string;
  plannerPrompt: string;
  draftRecipient: string;
  draftSubject: string;
  draftBody: string;
};

export function buildCustomerBrief(options: {
  enabled: boolean;
  accounts: CustomerAccount[];
  interactions: CustomerInteraction[];
  inboxSummary: InboxSummaryItem[];
}): CustomerBrief | null {
  const { enabled, accounts, interactions, inboxSummary } = options;
  if (!enabled) return null;
  if (!accounts.length && !interactions.length) return null;

  const churnAccounts = accounts.filter((item) => item.churn_risk.trim().toLowerCase().includes('high'));
  const unhappyAccounts = accounts.filter((item) => item.sentiment.trim().toLowerCase().includes('negative'));
  const urgentInteractions = interactions.filter((item) => item.urgency.trim().toLowerCase().includes('high'));
  const openFollowUps = interactions.filter(
    (item) => item.promised_follow_up.trim() && item.status.trim().toLowerCase() !== 'closed',
  );
  const latestCustomerInbox =
    inboxSummary.find((item) => {
      const text = `${item.title} ${item.snippet} ${item.author}`.toLowerCase();
      return (
        accounts.some((account) => account.name && text.includes(account.name.toLowerCase())) ||
        interactions.some((interaction) => interaction.contact && text.includes(interaction.contact.toLowerCase()))
      );
    }) || null;
  const primaryAccount = churnAccounts[0] || unhappyAccounts[0] || accounts[0] || null;
  const primaryInteraction = urgentInteractions[0] || openFollowUps[0] || interactions[0] || null;
  const focusItems = [
    primaryAccount
      ? {
          label: 'Customer Health Risk',
          detail: `${primaryAccount.name || primaryAccount.key} / health: ${primaryAccount.health || 'unknown'} / sentiment: ${primaryAccount.sentiment || 'unknown'} / churn risk: ${primaryAccount.churn_risk || 'unknown'} / next: ${primaryAccount.next_step || 'missing'}`,
        }
      : null,
    primaryInteraction
      ? {
          label: 'Interaction To Resolve',
          detail: `${primaryInteraction.contact || primaryInteraction.key} / ${primaryInteraction.channel || 'unknown channel'} / ${primaryInteraction.topic || 'no topic'} / urgency: ${primaryInteraction.urgency || 'unknown'} / follow-up: ${primaryInteraction.promised_follow_up || 'missing'}`,
        }
      : null,
    latestCustomerInbox
      ? {
          label: 'Latest Customer Signal',
          detail: `${latestCustomerInbox.author} / ${latestCustomerInbox.title} / ${latestCustomerInbox.snippet}`,
        }
      : null,
    openFollowUps[0]
      ? {
          label: 'Promised Follow-Up',
          detail: `${openFollowUps[0].contact || openFollowUps[0].key} is still waiting on: ${openFollowUps[0].promised_follow_up}`,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; detail: string }>;

  const summaryParts = [
    `${accounts.length} customer account${accounts.length === 1 ? '' : 's'} tracked`,
    churnAccounts.length
      ? `${churnAccounts.length} churn risk${churnAccounts.length === 1 ? '' : 's'}`
      : 'no major churn risks',
    urgentInteractions.length
      ? `${urgentInteractions.length} urgent interaction${urgentInteractions.length === 1 ? '' : 's'}`
      : 'no urgent interactions',
  ];
  const sections = [
    `Customer accounts: ${accounts.length}`,
    `Customer interactions: ${interactions.length}`,
    `High churn risk: ${churnAccounts.map((item) => item.name || item.key).join(', ') || 'None'}`,
    `Negative sentiment: ${unhappyAccounts.map((item) => item.name || item.key).join(', ') || 'None'}`,
    `Urgent interactions: ${urgentInteractions.map((item) => item.contact || item.key).join(', ') || 'None'}`,
    `Open promised follow-ups: ${openFollowUps.map((item) => item.contact || item.key).join(', ') || 'None'}`,
    latestCustomerInbox
      ? `Latest inbox signal: ${latestCustomerInbox.author} / ${latestCustomerInbox.title}\n${latestCustomerInbox.snippet}`
      : 'Latest inbox signal: None matched to customer memory.',
  ];

  return {
    title: 'Customer Intel',
    summary: summaryParts.join(' Â· '),
    details: sections.join('\n\n'),
    counts: [
      { label: 'Accounts', value: String(accounts.length) },
      { label: 'Interactions', value: String(interactions.length) },
      { label: 'Churn Risk', value: String(churnAccounts.length) },
      { label: 'Urgent', value: String(urgentInteractions.length) },
    ],
    focusItems,
    prompt:
      `I have a customer health briefing.\n${sections.join('\n\n')}\n\n` +
      'Turn this into the next best customer success and support actions, identify churn risk, and recommend the safest follow-up moves.',
    plannerPrompt:
      `Customer mission briefing.\n${sections.join('\n\n')}\n\n` +
      'Plan the next safe customer-success execution pass: who needs attention, what should be escalated, and which follow-ups matter most.',
    draftRecipient: latestCustomerInbox?.author_email || '',
    draftSubject:
      latestCustomerInbox?.title && latestCustomerInbox.title.toLowerCase().startsWith('re:')
        ? latestCustomerInbox.title
        : latestCustomerInbox?.title
          ? `Re: ${latestCustomerInbox.title}`
          : primaryAccount?.name
            ? `Checking in on ${primaryAccount.name}`
            : 'Customer follow-up',
    draftBody:
      `Hi ${((latestCustomerInbox?.author || primaryInteraction?.contact || primaryAccount?.name || 'there').split('<')[0] || 'there').trim()},\n\n` +
      `I wanted to follow up on ${primaryInteraction?.topic || latestCustomerInbox?.title || primaryAccount?.name || 'your recent request'}.\n\n` +
      `Current context:\n` +
      `- Health: ${primaryAccount?.health || 'Unknown'}\n` +
      `- Sentiment: ${primaryAccount?.sentiment || primaryInteraction?.sentiment || 'Unknown'}\n` +
      `- Urgency: ${primaryInteraction?.urgency || 'Unknown'}\n` +
      `- Promised follow-up: ${primaryInteraction?.promised_follow_up || primaryAccount?.next_step || 'We are reviewing the next step'}\n\n` +
      `Thanks for your patience. We are reviewing this carefully and I want to make sure we give you the clearest next step possible.\n\n` +
      `Best,\nJARVIS`,
  };
}
