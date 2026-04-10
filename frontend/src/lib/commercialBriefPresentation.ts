import type { CommercialOpsBrief } from '../components/Dashboard/CommercialOpsPanel';
import type { ShopifySummary } from './api';

type CountItem = { label: string; value: string };
type FocusItem = { label: string; detail: string };

type BriefLike = {
  summary: string;
  prompt: string;
  plannerPrompt: string;
  counts: CountItem[];
  focusItems: FocusItem[];
} | null;

type SalesAccount = {
  key: string;
  name: string;
  owner: string;
  status: string;
  next_step: string;
  risk_level: string;
  last_interaction?: string;
};

type SalesDeal = {
  key: string;
  title: string;
  account_key: string;
  stage: string;
  next_step: string;
  risk_level: string;
  last_interaction?: string;
};

type CustomerAccount = {
  key: string;
  name: string;
  health: string;
  sentiment: string;
  churn_risk: string;
  next_step: string;
  last_interaction?: string;
};

type CustomerInteraction = {
  key: string;
  contact: string;
  topic: string;
  channel: string;
  urgency: string;
  promised_follow_up: string;
  last_interaction?: string;
};

function getCount(brief: BriefLike, label: string) {
  return Number(brief?.counts.find((item) => item.label === label)?.value || 0);
}

export function buildCommercialBrief(options: {
  enabled: boolean;
  salesBrief: BriefLike;
  customerBrief: BriefLike;
  shopifyBrief: BriefLike;
  salesAccounts: SalesAccount[];
  salesDeals: SalesDeal[];
  customerAccounts: CustomerAccount[];
  customerInteractions: CustomerInteraction[];
  shopifySummary: ShopifySummary | null;
}): CommercialOpsBrief | null {
  const {
    enabled,
    salesBrief,
    customerBrief,
    shopifyBrief,
    salesAccounts,
    salesDeals,
    customerAccounts,
    customerInteractions,
    shopifySummary,
  } = options;

  if (!enabled) return null;
  if (!salesBrief && !customerBrief && !shopifyBrief) return null;

  const salesRisk = getCount(salesBrief, 'Risk Signals');
  const customerRisk = getCount(customerBrief, 'Churn Risk');
  const customerUrgent = getCount(customerBrief, 'Urgent');
  const storeOpenOrders = Number(shopifySummary?.open_orders || 0);
  const refundedOrders = Number(shopifySummary?.refunded_orders || 0);
  const canceledOrders = Number(shopifySummary?.canceled_orders || 0);
  const lowStock = Number(shopifySummary?.low_stock_products?.length || 0);
  const repeatCustomers = Number(shopifySummary?.repeat_customers || 0);

  const parseCommercialDate = (value: string) => {
    const parsed = Date.parse(value || '');
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const commercialTimeline = [
    ...salesDeals
      .filter((item) => item.last_interaction?.trim())
      .map((item) => ({
        label: `Deal Â· ${item.title || item.key}`,
        detail: `${item.account_key || 'Unknown account'} / ${item.stage || 'unknown stage'} / next: ${item.next_step || 'missing'} / risk: ${item.risk_level || 'unknown'}`,
        when: item.last_interaction || '',
        ts: parseCommercialDate(item.last_interaction || ''),
      })),
    ...salesAccounts
      .filter((item) => item.last_interaction?.trim())
      .map((item) => ({
        label: `Account Â· ${item.name || item.key}`,
        detail: `${item.status || 'unknown status'} / owner: ${item.owner || 'unassigned'} / next: ${item.next_step || 'missing'} / risk: ${item.risk_level || 'unknown'}`,
        when: item.last_interaction || '',
        ts: parseCommercialDate(item.last_interaction || ''),
      })),
    ...customerAccounts
      .filter((item) => item.last_interaction?.trim())
      .map((item) => ({
        label: `Customer Â· ${item.name || item.key}`,
        detail: `${item.health || 'unknown health'} / sentiment: ${item.sentiment || 'unknown'} / churn: ${item.churn_risk || 'unknown'} / next: ${item.next_step || 'missing'}`,
        when: item.last_interaction || '',
        ts: parseCommercialDate(item.last_interaction || ''),
      })),
    ...customerInteractions
      .filter((item) => item.last_interaction?.trim())
      .map((item) => ({
        label: `Interaction Â· ${item.contact || item.key}`,
        detail: `${item.topic || 'no topic'} / ${item.channel || 'unknown channel'} / urgency: ${item.urgency || 'unknown'} / follow-up: ${item.promised_follow_up || 'missing'}`,
        when: item.last_interaction || '',
        ts: parseCommercialDate(item.last_interaction || ''),
      })),
    ...(shopifySummary
      ? [
          {
            label: `Store Snapshot Â· ${shopifySummary.store}`,
            detail: `${shopifySummary.open_orders} open orders / ${shopifySummary.refunded_orders} refunded / ${shopifySummary.canceled_orders} canceled / ${shopifySummary.low_stock_products.length} low stock`,
            when: new Date().toISOString(),
            ts: Date.now(),
          },
        ]
      : []),
  ]
    .sort((left, right) => right.ts - left.ts)
    .slice(0, 6)
    .map(({ label, detail, when }) => ({ label, detail, when }));

  const focusItems = [
    salesRisk > 0
      ? {
          label: 'Pipeline Risk',
          detail:
            salesBrief?.focusItems[0]?.detail ||
            `${salesRisk} sales risk signal${salesRisk === 1 ? '' : 's'} need review before the next outreach pass.`,
        }
      : null,
    customerRisk > 0 || customerUrgent > 0
      ? {
          label: 'Customer Attention',
          detail:
            customerBrief?.focusItems[0]?.detail ||
            `${customerRisk} churn-risk account${customerRisk === 1 ? '' : 's'} and ${customerUrgent} urgent customer interaction${customerUrgent === 1 ? '' : 's'} are active.`,
        }
      : null,
    storeOpenOrders > 0 || lowStock > 0
      ? {
          label: 'Store Pressure',
          detail:
            shopifyBrief?.focusItems[0]?.detail ||
            `${storeOpenOrders} open order${storeOpenOrders === 1 ? '' : 's'} and ${lowStock} low-stock product${lowStock === 1 ? '' : 's'} need the next ecommerce pass.`,
        }
      : null,
    refundedOrders > 0 || canceledOrders > 0
      ? {
          label: 'Store Friction',
          detail: `${refundedOrders} refunded and ${canceledOrders} canceled order${refundedOrders + canceledOrders === 1 ? '' : 's'} suggest a product, expectation, or fulfillment issue that may affect growth.`,
        }
      : null,
    repeatCustomers > 0
      ? {
          label: 'Retention Opportunity',
          detail: `${repeatCustomers} repeat customer${repeatCustomers === 1 ? '' : 's'} suggest a good moment for retention or upsell follow-up.`,
        }
      : null,
  ].filter((item): item is FocusItem => Boolean(item));

  const details = [
    salesBrief ? `Sales: ${salesBrief.summary}` : '',
    customerBrief ? `Customer: ${customerBrief.summary}` : '',
    shopifyBrief ? `Shopify: ${shopifyBrief.summary}` : '',
    focusItems.length ? `Commercial focus:\n- ${focusItems.map((item) => item.detail).join('\n- ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    title: 'Commercial Ops Brief',
    summary:
      `${salesRisk} pipeline risk Â· ${customerRisk + customerUrgent} customer pressure Â· ` +
      `${storeOpenOrders + lowStock + refundedOrders + canceledOrders} store ops signal${storeOpenOrders + lowStock + refundedOrders + canceledOrders === 1 ? '' : 's'}`,
    details,
    prompt:
      `I need a commercial operating brief across sales, customer, and Shopify.\n\n${details}\n\n` +
      `Give me the next best business actions, the biggest current risks, and the safest first move.`,
    plannerPrompt:
      `Commercial operations planner brief.\n\n${details}\n\n` +
      `Prioritize the next coordinated actions across sales, customer success, and ecommerce operations. Return the safest first move and the next two follow-ups.`,
    counts: [
      { label: 'Pipeline Risk', value: String(salesRisk) },
      { label: 'Customer Pressure', value: String(customerRisk + customerUrgent) },
      { label: 'Open Orders', value: String(storeOpenOrders) },
      { label: 'Low Stock', value: String(lowStock) },
      { label: 'Refunded Orders', value: String(refundedOrders) },
      { label: 'Canceled Orders', value: String(canceledOrders) },
    ],
    focusItems,
    timeline: commercialTimeline,
  };
}
