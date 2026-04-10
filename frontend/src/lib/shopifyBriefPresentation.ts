import type { ShopifySummary } from './api';
import type { ShopifyIntelBrief } from '../components/Dashboard/ShopifyIntelPanel';

export function buildShopifyBrief(options: {
  enabled: boolean;
  shopifySummary: ShopifySummary | null;
}): ShopifyIntelBrief | null {
  const { enabled, shopifySummary } = options;
  if (!enabled) return null;
  if (!shopifySummary) return null;

  const topCustomer = shopifySummary.top_customers[0] || null;
  const topProduct = shopifySummary.top_products[0] || null;
  const lowStock = shopifySummary.low_stock_products || [];
  const fulfillmentPressure = shopifySummary.open_orders > 0;
  const refundPressure = shopifySummary.refunded_orders > 0 || shopifySummary.canceled_orders > 0;
  const retentionSignal = shopifySummary.repeat_customers > 0;
  const focusItems = [
    fulfillmentPressure
      ? {
          label: 'Fulfillment Pressure',
          detail: `${shopifySummary.open_orders} open order${shopifySummary.open_orders === 1 ? '' : 's'} still need attention in ${shopifySummary.store}. Review shipping, support, or fulfillment blockers first.`,
        }
      : null,
    lowStock.length
      ? {
          label: 'Stock Risk',
          detail: `Low-stock watch is active for ${lowStock.length} product${lowStock.length === 1 ? '' : 's'}, led by ${lowStock.slice(0, 3).map((item) => `${item.title} (${item.inventory})`).join(', ')}.`,
        }
      : null,
    refundPressure
      ? {
          label: 'Refund / Cancel Risk',
          detail: `${shopifySummary.refunded_orders} refunded and ${shopifySummary.canceled_orders} canceled order${shopifySummary.refunded_orders + shopifySummary.canceled_orders === 1 ? '' : 's'} were detected in the recent store window. Review product quality, fulfillment friction, or customer-expectation gaps.`,
        }
      : null,
    retentionSignal
      ? {
          label: 'Retention Opportunity',
          detail: `${shopifySummary.repeat_customers} repeat customer${shopifySummary.repeat_customers === 1 ? '' : 's'} were detected. ${topCustomer ? `${topCustomer.name} is the current strongest customer signal.` : 'Use repeat purchase behavior to guide the next retention move.'}`,
        }
      : null,
    topProduct
      ? {
          label: 'Product Momentum',
          detail: `${topProduct.title} is the strongest current product signal with status ${topProduct.status} and ${topProduct.variant_count} variant${topProduct.variant_count === 1 ? '' : 's'}.`,
        }
      : null,
  ].filter((item): item is { label: string; detail: string } => Boolean(item));

  const details =
    `Store: ${shopifySummary.store}\n` +
    `Orders: ${shopifySummary.orders}\n` +
    `Open orders: ${shopifySummary.open_orders}\n` +
    `Refunded orders: ${shopifySummary.refunded_orders}\n` +
    `Canceled orders: ${shopifySummary.canceled_orders}\n` +
    `Customers: ${shopifySummary.customers}\n` +
    `Products: ${shopifySummary.products}\n` +
    `Active products: ${shopifySummary.active_products}\n` +
    `Estimated revenue: ${shopifySummary.estimated_revenue}\n` +
    `Repeat customers: ${shopifySummary.repeat_customers}\n` +
    `Low stock products: ${lowStock.length}\n` +
    `Top customers: ${shopifySummary.top_customers.map((item) => `${item.name} (${item.total_spent})`).join(', ') || 'None'}\n` +
    `Top products: ${shopifySummary.top_products.map((item) => `${item.title} (${item.status})`).join(', ') || 'None'}`;

  return {
    title: `Shopify Intel Â· ${shopifySummary.store}`,
    summary: `${shopifySummary.orders} recent orders Â· ${shopifySummary.open_orders} open Â· ${lowStock.length} low-stock watch Â· revenue ${shopifySummary.estimated_revenue}`,
    details,
    prompt:
      `I have a Shopify store summary.\n` +
      `${details}\n\n` +
      `Turn this into the next best ecommerce operating actions, risks, and opportunities.`,
    plannerPrompt:
      `Shopify operations brief.\n${details}\n\nFocus on the next best ecommerce operating actions across fulfillment pressure, low-stock risk, retention opportunity, and product momentum. Return a prioritized store-ops plan with the safest first move.`,
    counts: [
      { label: 'Open Orders', value: String(shopifySummary.open_orders) },
      { label: 'Refunded Orders', value: String(shopifySummary.refunded_orders) },
      { label: 'Canceled Orders', value: String(shopifySummary.canceled_orders) },
      { label: 'Low Stock', value: String(lowStock.length) },
      { label: 'Repeat Customers', value: String(shopifySummary.repeat_customers) },
    ],
    focusItems,
  };
}
