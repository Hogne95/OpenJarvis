import type {
  DocumentAnalysisResult,
  VisionAnalysisResult,
  VisionQueryResult,
  VisionSignalsResult,
  VisionSuggestedActionsResult,
  VisionTextExtractionResult,
} from './api';

type NamedScreen = {
  label?: string | null;
};

export type IntelBrief = {
  title: string;
  summary: string;
  details: string;
  prompt: string;
};

export type VisualIntelBrief = IntelBrief & {
  dailyOpsPrompt: string;
};

export type DocumentIntelBrief = IntelBrief & {
  memoPrompt: string;
};

export function buildVisualIntelBrief(options: {
  screenSnapshotLabel?: string | null;
  screenDeck: NamedScreen[];
  visionSignals: VisionSignalsResult | null;
  visionAnalysis: VisionAnalysisResult | null;
  visionQuery: VisionQueryResult | null;
  visionSuggestedActions: VisionSuggestedActionsResult | null;
  visionTextExtraction: VisionTextExtractionResult | null;
}): VisualIntelBrief | null {
  const {
    screenSnapshotLabel,
    screenDeck,
    visionSignals,
    visionAnalysis,
    visionQuery,
    visionSuggestedActions,
    visionTextExtraction,
  } = options;
  const visualLabel =
    screenSnapshotLabel || (screenDeck.length > 1 ? 'Multi-Screen Session' : screenDeck[0]?.label) || 'Visual session';
  const sections: string[] = [];
  const summaryParts: string[] = [];

  if (visionSignals) {
    const topSignal =
      visionSignals.blockers[0] || visionSignals.deadlines[0] || visionSignals.attention_items[0] || visionSignals.summary;
    if (topSignal) summaryParts.push(topSignal);
    sections.push(`Signals summary: ${visionSignals.summary || 'No major signals extracted.'}`);
    sections.push(`Blockers: ${visionSignals.blockers.join(' | ') || 'None'}`);
    sections.push(`Deadlines: ${visionSignals.deadlines.join(' | ') || 'None'}`);
    sections.push(`Attention items: ${visionSignals.attention_items.join(' | ') || 'None'}`);
  }

  if (visionAnalysis?.content.trim()) {
    const firstLine = visionAnalysis.content.split('\n').find((line) => line.trim()) || '';
    if (firstLine && !summaryParts.includes(firstLine)) summaryParts.push(firstLine);
    sections.push(`Visual analysis: ${visionAnalysis.content}`);
  }

  if (visionQuery?.answer.trim()) {
    const firstLine = visionQuery.answer.split('\n').find((line) => line.trim()) || '';
    if (firstLine && !summaryParts.includes(firstLine)) summaryParts.push(firstLine);
    sections.push(`Visual Q&A\nQuestion: ${visionQuery.question}\nAnswer: ${visionQuery.answer}`);
  }

  if (visionSuggestedActions?.actions?.length) {
    const topActions = [...visionSuggestedActions.actions]
      .sort((left, right) => right.priority - left.priority)
      .slice(0, 2)
      .map((item, index) => `${index + 1}. ${item.title} - ${item.detail}`);
    if (topActions.length) {
      if (!summaryParts.length) summaryParts.push(topActions[0]);
      sections.push(`Suggested next actions:\n${topActions.join('\n')}`);
    }
  }

  if (visionTextExtraction?.content.trim()) {
    const topLines = visionTextExtraction.content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (topLines.length) sections.push(`Visible text highlights:\n${topLines.join('\n')}`);
  }

  if (!sections.length) return null;

  return {
    title: visualLabel,
    summary: summaryParts[0] || `Visual intel ready from ${visualLabel}.`,
    details: sections.join('\n\n'),
    prompt:
      `I have a visual briefing for "${visualLabel}".\n${sections.join('\n\n')}\n\n` +
      'Turn this into the next best action, note any risks, and tell me what deserves attention first.',
    dailyOpsPrompt:
      `Visual briefing from "${visualLabel}":\n${sections.join('\n\n')}\n\n` +
      'Blend this visual context into my operations brief and highlight anything urgent or blocking.',
  };
}

export function buildDocumentIntelBrief(options: {
  documentAnalysis: DocumentAnalysisResult | null;
  documentAnalysisTitle: string;
}): DocumentIntelBrief | null {
  const { documentAnalysis, documentAnalysisTitle } = options;
  if (!documentAnalysis?.content.trim()) return null;
  const label = documentAnalysisTitle.trim() || documentAnalysis.files[0] || 'Document set';
  const modeLabel = documentAnalysis.mode.replace(/_/g, ' ');
  const summary =
    documentAnalysis.content.split('\n').find((line) => line.trim())?.trim() ||
    `Document analysis ready in ${modeLabel} mode.`;
  const details = `Mode: ${modeLabel}\nFiles: ${documentAnalysis.files.join(', ') || 'Unknown'}\n\n${documentAnalysis.content}`;
  return {
    title: `Document Intel · ${label}`,
    summary,
    details,
    memoPrompt:
      `Create a concise ${modeLabel} deliverable for these documents.\n` +
      `Title: ${label}\nFiles: ${documentAnalysis.files.join(', ')}\n\n${documentAnalysis.content}\n\n` +
      'Return a sharp executive-ready memo with summary, key metrics, risks, open questions, and recommended next step.',
    prompt:
      `I analyzed these documents: ${documentAnalysis.files.join(', ')}.\n` +
      `Mode: ${documentAnalysis.mode}\nTitle: ${label}\n\n${documentAnalysis.content}\n\n` +
      'Turn this into the next best action, decisions, risks, and open questions.',
  };
}
