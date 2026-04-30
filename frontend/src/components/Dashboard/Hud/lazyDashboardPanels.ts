import { lazy } from 'react';

export const CommanderQueue = lazy(() =>
  import('../CommanderQueue').then((module) => ({ default: module.CommanderQueue })),
);
export const ActionCenterPanel = lazy(() =>
  import('../ActionCenterPanel').then((module) => ({ default: module.ActionCenterPanel })),
);
export const CoreAgentsPanel = lazy(() =>
  import('../CoreAgentsPanel').then((module) => ({ default: module.CoreAgentsPanel })),
);
export const CommercialOpsPanel = lazy(() =>
  import('../CommercialOpsPanel').then((module) => ({ default: module.CommercialOpsPanel })),
);
export const CustomerIntelPanel = lazy(() =>
  import('../CustomerIntelPanel').then((module) => ({ default: module.CustomerIntelPanel })),
);
export const ShopifyIntelPanel = lazy(() =>
  import('../ShopifyIntelPanel').then((module) => ({ default: module.ShopifyIntelPanel })),
);
export const DesignIntelligence = lazy(() =>
  import('../DesignIntelligence').then((module) => ({ default: module.DesignIntelligence })),
);
export const DocumentIntel = lazy(() =>
  import('../DocumentIntel').then((module) => ({ default: module.DocumentIntel })),
);
export const FivemCodingPanel = lazy(() =>
  import('../FivemCodingPanel').then((module) => ({ default: module.FivemCodingPanel })),
);
export const IntentConsoleFeedback = lazy(() =>
  import('../IntentConsoleFeedback').then((module) => ({ default: module.IntentConsoleFeedback })),
);
export const MissionMatrix = lazy(() =>
  import('../MissionMatrix').then((module) => ({ default: module.MissionMatrix })),
);
export const RepoDockPanel = lazy(() =>
  import('../RepoDockPanel').then((module) => ({ default: module.RepoDockPanel })),
);
export const SalesIntelPanel = lazy(() =>
  import('../SalesIntelPanel').then((module) => ({ default: module.SalesIntelPanel })),
);
export const TerminalWorkbenchPanel = lazy(() =>
  import('../TerminalWorkbenchPanel').then((module) => ({ default: module.TerminalWorkbenchPanel })),
);
export const VisualIntelPanel = lazy(() =>
  import('../VisualIntelPanel').then((module) => ({ default: module.VisualIntelPanel })),
);
export const HudInputArea = lazy(() =>
  import('../../Chat/InputArea').then((module) => ({ default: module.InputArea })),
);
