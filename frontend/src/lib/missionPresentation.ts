import type { CommercialOpsBrief } from '../components/Dashboard/CommercialOpsPanel';
import type { FivemCodingBrief } from '../components/Dashboard/FivemCodingPanel';
import type { MissionMatrixItem } from '../components/Dashboard/MissionMatrix';
import type { DurableOperatorMemory } from './api';

type MissionEntry = NonNullable<DurableOperatorMemory['missions']>[number];
type MissionPhase = 'detect' | 'plan' | 'act' | 'verify' | 'retry' | 'done';
type MissionStatus = 'idle' | 'active' | 'blocked' | 'complete';
type MissionActionItem = MissionMatrixItem & { action: () => void };
type DesignBriefEntry = NonNullable<DurableOperatorMemory['design_briefs']>[number];

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

export function buildCommercialMission(options: {
  durable: MissionEntry | null;
  commercialBrief: CommercialOpsBrief | null;
  summarizeMissionMeta: (payload: unknown) => string[];
  injectCommercialBrief: () => void;
  fallbackAction: () => void;
}): MissionActionItem | null {
  const { durable, commercialBrief, summarizeMissionMeta, injectCommercialBrief, fallbackAction } = options;
  if (!commercialBrief && !durable) return null;

  const pipelineRisk = Number(commercialBrief?.counts.find((item) => item.label === 'Pipeline Risk')?.value || 0);
  const customerPressure = Number(commercialBrief?.counts.find((item) => item.label === 'Customer Pressure')?.value || 0);
  const storePressure =
    Number(commercialBrief?.counts.find((item) => item.label === 'Open Orders')?.value || 0) +
    Number(commercialBrief?.counts.find((item) => item.label === 'Low Stock')?.value || 0);

  return {
    id: durable?.id || 'mission-commercial',
    title: durable?.title || commercialBrief?.title || 'Commercial mission',
    domain: 'commercial',
    status: ((durable?.status as MissionStatus | undefined) || (commercialBrief ? 'active' : 'idle')),
    phase:
      ((durable?.phase as MissionPhase | undefined) ||
        (customerPressure > 0 || storePressure > 0 ? 'act' : pipelineRisk > 0 ? 'plan' : commercialBrief ? 'verify' : 'detect')),
    summary: durable?.summary || commercialBrief?.summary || 'Commercial ops lane is ready.',
    nextStep:
      durable?.next_step ||
      (customerPressure > 0
        ? 'Resolve the highest customer pressure before it spreads into churn.'
        : storePressure > 0
          ? 'Review open orders and stock risk before the next commercial push.'
          : pipelineRisk > 0
            ? 'Review the riskiest deal and align the next business move.'
            : 'Review the combined commercial brief and pick the next cross-functional action.'),
    result:
      durable?.result ||
      (customerPressure > 0
        ? 'Customer pressure is active.'
        : storePressure > 0
          ? 'Store operations need attention.'
          : pipelineRisk > 0
            ? 'Pipeline risk is still present.'
            : 'Commercial signals are stable and ready for the next growth pass.'),
    retryHint:
      durable?.retry_hint ||
      'Reload Commercial Ops, route it to planner, or create a task for the most urgent cross-functional issue.',
    nextActionLabel: typeof durable?.next_action?.label === 'string' ? durable.next_action.label : undefined,
    resultData: durable?.result_data || {
      pipeline_risk: pipelineRisk,
      customer_pressure: customerPressure,
      store_pressure: storePressure,
    },
    nextAction:
      durable?.next_action ||
      (commercialBrief
        ? {
            kind: customerPressure > 0 || storePressure > 0 ? 'task' : 'brief',
            content: customerPressure > 0 || storePressure > 0 ? commercialBrief.details : commercialBrief.plannerPrompt,
            label:
              customerPressure > 0
                ? 'Resolve Customer Pressure'
                : storePressure > 0
                  ? 'Review Store Ops'
                  : 'Commercial Ops Brief',
            source: 'commercial-mission',
          }
        : undefined),
    resultMeta: durable?.result_data
      ? summarizeMissionMeta(durable.result_data)
      : [`pipeline risk: ${pipelineRisk}`, `customer pressure: ${customerPressure}`, `store pressure: ${storePressure}`],
    actionLabel: commercialBrief ? 'Load Brief' : 'Open Commercial',
    action: () => (commercialBrief ? injectCommercialBrief() : fallbackAction()),
  };
}

export function buildFivemMission(options: {
  durable: MissionEntry | null;
  fivemCodingBrief: FivemCodingBrief | null;
  summarizeMissionMeta: (payload: unknown) => string[];
  loadFivemReview: () => void;
  fallbackAction: () => void;
}): MissionActionItem | null {
  const { durable, fivemCodingBrief, summarizeMissionMeta, loadFivemReview, fallbackAction } = options;
  if (!fivemCodingBrief && !durable) return null;

  const isFrameworkSpecific =
    fivemCodingBrief?.framework === 'QBCore' ||
    fivemCodingBrief?.framework === 'ESX' ||
    fivemCodingBrief?.framework === 'ox_*';
  const hasComplexTopology =
    (fivemCodingBrief?.topology || '').includes('client') &&
    (fivemCodingBrief?.topology || '').includes('server');

  return {
    id: durable?.id || 'mission-fivem',
    title: durable?.title || fivemCodingBrief?.title || 'FiveM mission',
    domain: 'fivem',
    status: ((durable?.status as MissionStatus | undefined) || (fivemCodingBrief ? 'active' : 'idle')),
    phase:
      ((durable?.phase as MissionPhase | undefined) ||
        (hasComplexTopology ? 'plan' : isFrameworkSpecific ? 'verify' : fivemCodingBrief ? 'detect' : 'detect')),
    summary: durable?.summary || fivemCodingBrief?.summary || 'FiveM/Lua coding lane is ready.',
    nextStep:
      durable?.next_step ||
      (hasComplexTopology
        ? 'Review client/server/shared boundaries and event flow before the next patch.'
        : isFrameworkSpecific
          ? `Audit ${fivemCodingBrief?.framework} usage and exports before changing logic.`
          : 'Load the FiveM/Lua review brief and inspect the current script flow.'),
    result:
      durable?.result ||
      fivemCodingBrief?.focusItems[0]?.detail ||
      'FiveM/Lua context is ready for deeper review.',
    retryHint:
      durable?.retry_hint ||
      'Reload FiveM/Lua intel, run the most relevant framework/security review, or route the brief into planner for a safer implementation pass.',
    nextActionLabel: typeof durable?.next_action?.label === 'string' ? durable.next_action.label : undefined,
    resultData: durable?.result_data || {
      framework: fivemCodingBrief?.framework || 'Unknown',
      topology: fivemCodingBrief?.topology || 'Unknown',
      focus_area: fivemCodingBrief?.focusItems[0]?.label || 'FiveM review',
      native_families: (fivemCodingBrief?.nativeFamilies || []).join(', '),
    },
    nextAction:
      durable?.next_action ||
      (fivemCodingBrief
        ? {
            kind: hasComplexTopology || isFrameworkSpecific ? 'task' : 'prompt',
            content: fivemCodingBrief.details,
            label: hasComplexTopology
              ? 'Review Resource Boundaries'
              : isFrameworkSpecific
                ? `Review ${fivemCodingBrief.framework}`
                : 'FiveM Review',
            source: 'fivem-mission',
          }
        : undefined),
    resultMeta: durable?.result_data
      ? summarizeMissionMeta(durable.result_data)
      : [
          `framework: ${fivemCodingBrief?.framework || 'Unknown'}`,
          `topology: ${fivemCodingBrief?.topology || 'Unknown'}`,
          `native families: ${(fivemCodingBrief?.nativeFamilies || []).join(', ') || 'Unknown'}`,
        ],
    actionLabel: fivemCodingBrief ? 'Open FiveM Intel' : 'Open Coding',
    action: () => (fivemCodingBrief ? loadFivemReview() : fallbackAction()),
  };
}

export function buildDesignMission(options: {
  durable: MissionEntry | null;
  savedDesignBrief: DesignBriefEntry | null;
  summarizeMissionMeta: (payload: unknown) => string[];
  loadDesignScorecard: () => void;
  loadDesignBrief: () => void;
  fallbackAction: () => void;
}): MissionActionItem | null {
  const { durable, savedDesignBrief, summarizeMissionMeta, loadDesignScorecard, loadDesignBrief, fallbackAction } = options;
  if (!savedDesignBrief && !durable) return null;

  const scoreAverage = savedDesignBrief?.scorecard?.length
    ? savedDesignBrief.scorecard.reduce((sum, item) => sum + item.score, 0) / savedDesignBrief.scorecard.length
    : null;
  const weakestArea = savedDesignBrief?.scorecard?.slice().sort((left, right) => left.score - right.score)[0] || null;

  return {
    id: durable?.id || 'mission-design',
    title: durable?.title || 'HUD Design mission',
    domain: 'design',
    status: ((durable?.status as MissionStatus | undefined) || (savedDesignBrief ? 'active' : 'idle')),
    phase:
      ((durable?.phase as MissionPhase | undefined) ||
        (weakestArea && weakestArea.score < 8 ? 'plan' : savedDesignBrief ? 'verify' : 'detect')),
    summary:
      durable?.summary ||
      savedDesignBrief?.summary ||
      'Design intelligence is ready to guide the next HUD improvement pass.',
    nextStep:
      durable?.next_step ||
      (weakestArea
        ? `Improve ${weakestArea.label.toLowerCase()} in the next HUD pass.`
        : 'Run a design critique or HUD scorecard review.'),
    result:
      durable?.result ||
      (weakestArea
        ? `${weakestArea.label}: ${weakestArea.score}/10. ${weakestArea.note}`
        : 'Awaiting the next design review result.'),
    retryHint:
      durable?.retry_hint ||
      (weakestArea && weakestArea.score < 8
        ? 'Re-audit the HUD after the next layout or styling pass.'
        : undefined),
    nextActionLabel: typeof durable?.next_action?.label === 'string' ? durable.next_action.label : undefined,
    resultMeta:
      summarizeMissionMeta(durable?.result_data) ||
      (scoreAverage !== null
        ? [`avg ${scoreAverage.toFixed(1)}/10`, weakestArea ? `weakest ${weakestArea.label}` : 'scorecard ready']
        : undefined),
    actionLabel: weakestArea ? 'Load Scorecard' : 'Load Design Brief',
    action: () =>
      weakestArea ? loadDesignScorecard() : savedDesignBrief ? loadDesignBrief() : fallbackAction(),
  };
}
