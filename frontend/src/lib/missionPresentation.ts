import type { DurableOperatorMemory } from './api';

type MissionEntry = NonNullable<DurableOperatorMemory['missions']>[number];

export type DurableMissionLookup = {
  selfImprove: MissionEntry | null;
  planner: MissionEntry | null;
  visual: MissionEntry | null;
  document: MissionEntry | null;
  design: MissionEntry | null;
  sales: MissionEntry | null;
  customer: MissionEntry | null;
  shopify: MissionEntry | null;
  commercial: MissionEntry | null;
  fivem: MissionEntry | null;
};

export function buildDurableMissionLookup(
  missions: DurableOperatorMemory['missions'] | undefined,
): DurableMissionLookup {
  const entries = missions || [];
  return {
    selfImprove: entries.find((item) => item.id === 'mission-self-improve' || item.domain === 'self-improve') || null,
    planner:
      entries.find(
        (item) =>
          item.id === 'planner-executor' || item.id === 'mission-planner-executor' || item.domain === 'planner',
      ) || null,
    visual: entries.find((item) => item.id === 'visual-mission' || item.id === 'mission-visual' || item.domain === 'visual') || null,
    document:
      entries.find((item) => item.id === 'document-mission' || item.id === 'mission-document' || item.domain === 'document') || null,
    design: entries.find((item) => item.id === 'design-mission' || item.id === 'mission-design' || item.domain === 'design') || null,
    sales: entries.find((item) => item.id === 'sales-mission' || item.id === 'mission-sales' || item.domain === 'sales') || null,
    customer:
      entries.find((item) => item.id === 'customer-mission' || item.id === 'mission-customer' || item.domain === 'customer') || null,
    shopify:
      entries.find((item) => item.id === 'shopify-mission' || item.id === 'mission-shopify' || item.domain === 'shopify') || null,
    commercial:
      entries.find((item) => item.id === 'commercial-mission' || item.id === 'mission-commercial' || item.domain === 'commercial') || null,
    fivem: entries.find((item) => item.id === 'fivem-mission' || item.id === 'mission-fivem' || item.domain === 'fivem') || null,
  };
}
