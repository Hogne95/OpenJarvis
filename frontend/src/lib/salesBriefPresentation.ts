import type { InboxSummaryItem } from './api';

type SalesAccount = {
  key: string;
  name: string;
  owner: string;
  status: string;
  next_step: string;
  risk_level: string;
  last_interaction?: string;
};

type SalesLead = {
  key: string;
  name: string;
  company: string;
  owner: string;
  stage: string;
  next_step: string;
  risk_level: string;
  last_interaction?: string;
};

type SalesDeal = {
  key: string;
  title: string;
  account_key: string;
  owner: string;
  stage: string;
  value: string;
  close_target: string;
  next_step: string;
  risk_level: string;
  last_interaction?: string;
};

export type SalesBrief = {
  title: string;
  summary: string;
  details: string;
  counts: Array<{ label: string; value: string }>;
  focusItems: Array<{ label: string; detail: string }>;
  prompt: string;
  plannerPrompt: string;
  accountBriefPrompt: string;
  dealReviewPrompt: string;
  followUpPrompt: string;
  objectionPrompt: string;
  meetingPrepPrompt: string;
  draftRecipient: string;
  draftSubject: string;
  draftBody: string;
  primaryAccountLabel: string;
  primaryDealLabel: string;
};

export function buildSalesBrief(options: {
  enabled: boolean;
  accounts: SalesAccount[];
  leads: SalesLead[];
  deals: SalesDeal[];
  inboxSummary: InboxSummaryItem[];
}): SalesBrief | null {
  const { enabled, accounts, leads, deals, inboxSummary } = options;
  if (!enabled) return null;
  if (!accounts.length && !leads.length && !deals.length) return null;

  const dealStages = deals.reduce<Record<string, number>>((map, item) => {
    const stage = item.stage.trim().toLowerCase() || 'unclassified';
    map[stage] = (map[stage] || 0) + 1;
    return map;
  }, {});
  const highRiskDeals = deals.filter((item) => item.risk_level.trim().toLowerCase().includes('high'));
  const highRiskAccounts = accounts.filter((item) => item.risk_level.trim().toLowerCase().includes('high'));
  const followUpPressure = [...deals.filter((item) => !item.next_step.trim()), ...leads.filter((item) => !item.next_step.trim())];
  const latestSalesInbox =
    inboxSummary.find((item) => {
      const text = `${item.title} ${item.snippet} ${item.author}`.toLowerCase();
      return (
        deals.some((deal) => deal.title && text.includes(deal.title.toLowerCase())) ||
        leads.some((lead) => lead.name && text.includes(lead.name.toLowerCase())) ||
        accounts.some((account) => account.name && text.includes(account.name.toLowerCase()))
      );
    }) || null;
  const primaryDeal = highRiskDeals[0] || deals[0] || null;
  const primaryAccount = highRiskAccounts[0] || accounts[0] || null;
  const primaryLead = leads[0] || null;
  const followUpTarget = followUpPressure[0] || primaryDeal || primaryLead || primaryAccount || null;
  const latestInboxDetail = latestSalesInbox
    ? `Latest inbox signal\nSubject: ${latestSalesInbox.title}\nFrom: ${latestSalesInbox.author}\nSnippet: ${latestSalesInbox.snippet}`
    : 'Latest inbox signal\nNo matching sales email was found in the latest inbox summary.';
  const followUpTargetName = !followUpTarget
    ? 'No target selected'
    : 'title' in followUpTarget
      ? followUpTarget.title || followUpTarget.key
      : followUpTarget.name || followUpTarget.key;
  const followUpTargetCompany =
    !followUpTarget || !('company' in followUpTarget)
      ? 'account_key' in (followUpTarget || {}) && followUpTarget?.account_key
        ? followUpTarget.account_key
        : primaryAccount?.name || 'Unknown'
      : followUpTarget.company || primaryAccount?.name || 'Unknown';
  const followUpTargetStatus = !followUpTarget
    ? 'Unknown'
    : 'status' in followUpTarget
      ? followUpTarget.status || 'Unknown'
      : 'stage' in followUpTarget
        ? followUpTarget.stage || 'Unknown'
        : 'Unknown';
  const topStages = Object.entries(dealStages)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([stage, count]) => `${stage}: ${count}`)
    .join(' | ');
  const focusItems = [
    highRiskDeals[0]
      ? {
          label: 'Highest Risk Deal',
          detail: `${highRiskDeals[0].title || highRiskDeals[0].key} / ${highRiskDeals[0].stage || 'unknown stage'} / next: ${highRiskDeals[0].next_step || 'missing'} / risk: ${highRiskDeals[0].risk_level || 'high'}`,
        }
      : null,
    highRiskAccounts[0]
      ? {
          label: 'At-Risk Account',
          detail: `${highRiskAccounts[0].name || highRiskAccounts[0].key} / owner: ${highRiskAccounts[0].owner || 'unassigned'} / next: ${highRiskAccounts[0].next_step || 'missing'} / risk: ${highRiskAccounts[0].risk_level || 'high'}`,
        }
      : null,
    followUpPressure[0]
      ? {
          label: 'Follow-Up Gap',
          detail: `${'title' in followUpPressure[0] ? followUpPressure[0].title : followUpPressure[0].name || followUpPressure[0].key} has no clear next step. Load outreach or assign follow-up ownership.`,
        }
      : null,
    latestSalesInbox
      ? {
          label: 'Latest Commercial Signal',
          detail: `${latestSalesInbox.author} / ${latestSalesInbox.title} / ${latestSalesInbox.snippet}`,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; detail: string }>;

  const summaryParts = [
    `${deals.length} deal${deals.length === 1 ? '' : 's'} in view`,
    highRiskDeals.length || highRiskAccounts.length
      ? `${highRiskDeals.length + highRiskAccounts.length} risk signal${highRiskDeals.length + highRiskAccounts.length === 1 ? '' : 's'}`
      : 'no major risk signals',
    followUpPressure.length ? `${followUpPressure.length} follow-up gap${followUpPressure.length === 1 ? '' : 's'}` : 'follow-ups mostly defined',
  ];
  const sections = [
    `Accounts: ${accounts.length}`,
    `Leads: ${leads.length}`,
    `Deals: ${deals.length}`,
    `Top deal stages: ${topStages || 'None yet'}`,
    `High-risk deals: ${highRiskDeals.map((item) => item.title || item.key).join(', ') || 'None'}`,
    `High-risk accounts: ${highRiskAccounts.map((item) => item.name || item.key).join(', ') || 'None'}`,
    `Missing next steps: ${followUpPressure.map((item) => ('title' in item ? item.title || item.key : item.name || item.key)).join(', ') || 'None'}`,
    latestSalesInbox
      ? `Latest inbox signal: ${latestSalesInbox.author} / ${latestSalesInbox.title}\n${latestSalesInbox.snippet}`
      : 'Latest inbox signal: None matched to sales memory.',
  ];

  return {
    title: 'Sales Intel',
    summary: summaryParts.join(' · '),
    details: sections.join('\n\n'),
    counts: [
      { label: 'Accounts', value: String(accounts.length) },
      { label: 'Leads', value: String(leads.length) },
      { label: 'Deals', value: String(deals.length) },
      { label: 'Risk Signals', value: String(highRiskDeals.length + highRiskAccounts.length) },
    ],
    focusItems,
    prompt:
      `I have a sales pipeline briefing.\n${sections.join('\n\n')}\n\n` +
      'Turn this into the next best commercial actions, identify stalled or risky opportunities, and suggest the sharpest follow-up moves.',
    plannerPrompt:
      `Sales mission briefing.\n${sections.join('\n\n')}\n\n` +
      'Plan the next safe commercial execution pass: account focus, follow-ups, risks, and the best next actions without losing context.',
    accountBriefPrompt:
      `Act as a senior account strategist.\n${sections.join('\n\n')}\n\n` +
      `Primary account focus\nName: ${primaryAccount?.name || primaryDeal?.account_key || primaryLead?.company || 'No account selected'}\n` +
      `Owner: ${primaryAccount?.owner || primaryDeal?.owner || primaryLead?.owner || 'Unknown'}\n` +
      `Status: ${primaryAccount?.status || primaryDeal?.stage || primaryLead?.stage || 'Unknown'}\n` +
      `Next step: ${primaryAccount?.next_step || primaryDeal?.next_step || primaryLead?.next_step || 'Missing'}\n` +
      `Risk: ${primaryAccount?.risk_level || primaryDeal?.risk_level || primaryLead?.risk_level || 'Unknown'}\n\n` +
      'Write a sharp account brief with relationship state, risks, likely blockers, and the best next commercial move.',
    dealReviewPrompt:
      `Act as a deal review partner.\n${sections.join('\n\n')}\n\n` +
      `Deal to review\nTitle: ${primaryDeal?.title || 'No deal selected'}\n` +
      `Account: ${primaryDeal?.account_key || primaryAccount?.name || 'Unknown'}\n` +
      `Stage: ${primaryDeal?.stage || 'Unknown'}\n` +
      `Value: ${primaryDeal?.value || 'Unknown'}\n` +
      `Close target: ${primaryDeal?.close_target || 'Unknown'}\n` +
      `Next step: ${primaryDeal?.next_step || 'Missing'}\n` +
      `Risk: ${primaryDeal?.risk_level || 'Unknown'}\n\n` +
      'Review this deal for stall risk, missing information, likely objections, and the exact next action needed to move it forward safely.',
    followUpPrompt:
      `Act as a sales follow-up strategist.\n${sections.join('\n\n')}\n\n` +
      `Follow-up target\nName: ${followUpTargetName}\n` +
      `Company/Account: ${followUpTargetCompany}\n` +
      `Owner: ${followUpTarget?.owner || 'Unknown'}\n` +
      `Stage/Status: ${followUpTargetStatus}\n` +
      `Next step: ${followUpTarget?.next_step || 'Missing'}\n` +
      `Last interaction: ${followUpTarget?.last_interaction || 'Unknown'}\n\n` +
      `${latestInboxDetail}\n\n` +
      'Recommend the best follow-up timing, channel, and message strategy. Then draft a short high-quality follow-up outline.',
    objectionPrompt:
      `Act as a B2B sales coach focused on objections and deal friction.\n${sections.join('\n\n')}\n\n` +
      `Primary risk focus\nDeal: ${primaryDeal?.title || 'Unknown'}\n` +
      `Account: ${primaryDeal?.account_key || primaryAccount?.name || 'Unknown'}\n` +
      `Risk signal: ${primaryDeal?.risk_level || primaryAccount?.risk_level || 'Unknown'}\n` +
      `Current next step: ${primaryDeal?.next_step || primaryAccount?.next_step || 'Missing'}\n\n` +
      `${latestInboxDetail}\n\n` +
      'Infer the most likely objections, trust gaps, or internal blockers. Recommend how to respond without sounding defensive or generic.',
    meetingPrepPrompt:
      `Act as a sales meeting prep assistant.\n${sections.join('\n\n')}\n\n` +
      `Meeting focus\nAccount: ${primaryAccount?.name || primaryDeal?.account_key || primaryLead?.company || 'Unknown'}\n` +
      `Deal: ${primaryDeal?.title || 'No active deal selected'}\n` +
      `Stage: ${primaryDeal?.stage || primaryLead?.stage || primaryAccount?.status || 'Unknown'}\n` +
      `Key next step: ${primaryDeal?.next_step || primaryLead?.next_step || primaryAccount?.next_step || 'Missing'}\n` +
      `Risk: ${primaryDeal?.risk_level || primaryAccount?.risk_level || primaryLead?.risk_level || 'Unknown'}\n\n` +
      `${latestInboxDetail}\n\n` +
      'Prepare a concise meeting brief with goals, likely objections, discovery questions, proof points, and the decision or commitment we should leave with.',
    draftRecipient: latestSalesInbox?.author_email || '',
    draftSubject: primaryDeal?.title
      ? `Follow-up on ${primaryDeal.title}`
      : primaryAccount?.name
        ? `Follow-up for ${primaryAccount.name}`
        : primaryLead?.name
          ? `Following up, ${primaryLead.name}`
          : 'Sales follow-up',
    draftBody:
      `Hi,\n\n` +
      `I wanted to follow up regarding ${primaryDeal?.title || primaryAccount?.name || primaryLead?.company || 'our recent discussion'}.\n\n` +
      `Current context:\n` +
      `- Stage/status: ${primaryDeal?.stage || primaryLead?.stage || primaryAccount?.status || 'Unknown'}\n` +
      `- Next step: ${primaryDeal?.next_step || primaryLead?.next_step || primaryAccount?.next_step || 'To be confirmed'}\n` +
      `- Risk focus: ${primaryDeal?.risk_level || primaryAccount?.risk_level || primaryLead?.risk_level || 'None noted'}\n\n` +
      `I would like to keep momentum and align on the best next step. Please let me know what is most useful from our side, or if there is anything blocking progress.\n\n` +
      `Best,\nJARVIS`,
    primaryAccountLabel: primaryAccount
      ? `${primaryAccount.name || primaryAccount.key} / owner: ${primaryAccount.owner || 'unassigned'} / next: ${primaryAccount.next_step || 'missing'}`
      : 'No primary account selected yet.',
    primaryDealLabel: primaryDeal
      ? `${primaryDeal.title || primaryDeal.key} / stage: ${primaryDeal.stage || 'unknown'} / next: ${primaryDeal.next_step || 'missing'}`
      : 'No primary deal selected yet.',
  };
}
