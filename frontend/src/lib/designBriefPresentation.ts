import type { DurableOperatorMemory } from './api';
import { getDesignArchetype, type DesignArchetypeId } from './designCanon';

export type HudScorecardItem = {
  label: string;
  score: number;
  note: string;
};

type BasicBrief = {
  summary: string;
  details: string;
};

type ProjectMemory = NonNullable<DurableOperatorMemory['projects']>[string] | null;

export type DesignBrief = {
  title: string;
  summary: string;
  details: string;
  archetypeLabel: string;
  canonSummary: string;
  principles: string[];
  watchouts: string[];
  scorecard: HudScorecardItem[];
  critiquePrompt: string;
  systemPrompt: string;
  creativePrompt: string;
  implementationPrompt: string;
  screenAuditPrompt: string;
  scorecardPrompt: string;
};

export function buildDesignScorecard(options: {
  visualBrief: BasicBrief | null;
  currentProjectMemory: ProjectMemory;
  documentBrief: BasicBrief | null;
  hasSignals: boolean;
  designInfluences: string;
  referenceInterfaces: string;
}): HudScorecardItem[] {
  const { visualBrief, currentProjectMemory, documentBrief, hasSignals, designInfluences, referenceInterfaces } = options;
  const hasVisual = !!visualBrief;
  const hasProject = !!currentProjectMemory;
  const hasDocument = !!documentBrief;
  const hasNamedIdentity = designInfluences.trim() && referenceInterfaces.trim();

  return [
    {
      label: 'Hierarchy',
      score: hasVisual ? 8 : 6,
      note: hasVisual
        ? 'Live visual context is present, which makes hierarchy critique more grounded.'
        : 'Hierarchy can be reasoned about from goals and archetype, but not yet from a captured interface.',
    },
    {
      label: 'Readability',
      score: hasVisual || hasSignals ? 8 : 6,
      note: hasSignals
        ? 'Visual context and extracted signals support a stronger readability review.'
        : 'Readability guidance is present, but still more inferred than observed.',
    },
    {
      label: 'Distinctiveness',
      score: hasNamedIdentity ? 9 : 7,
      note: hasNamedIdentity
        ? 'Named influences and references give JARVIS stronger creative identity cues.'
        : 'Distinctiveness is improving, but benefits from more explicit influences and references.',
    },
    {
      label: 'Density Discipline',
      score: hasProject ? 8 : 7,
      note: hasProject
        ? 'Project context helps keep dense HUD decisions tied to operator workflows.'
        : 'Density guidance is solid, but less workflow-aware without project context.',
    },
    {
      label: 'Motion Discipline',
      score: 7,
      note: 'Motion guidance exists in the canon, but there is still limited explicit motion review memory.',
    },
    {
      label: 'Operator Trust',
      score: hasVisual && hasProject && hasDocument ? 9 : hasVisual || hasProject ? 8 : 7,
      note:
        hasVisual && hasProject && hasDocument
          ? 'Cross-linking visual, project, and document context gives the HUD stronger decision-grade trust.'
          : 'Trust is strong, but improves further when multiple context lanes are active together.',
    },
  ];
}

export function buildDesignBrief(options: {
  enabled: boolean;
  hudArchetype: DesignArchetypeId;
  designInfluences: string;
  referenceInterfaces: string;
  preferredStyle: string;
  designGoals: string;
  visualBrief: BasicBrief | null;
  documentBrief: BasicBrief | null;
  currentProjectMemory: ProjectMemory;
  designScorecard: HudScorecardItem[];
}): DesignBrief | null {
  const {
    enabled,
    hudArchetype,
    designInfluences,
    referenceInterfaces,
    preferredStyle,
    designGoals,
    visualBrief,
    documentBrief,
    currentProjectMemory,
    designScorecard,
  } = options;
  if (!enabled) return null;

  const sections: string[] = [];
  const summaryParts: string[] = [];
  const archetype = getDesignArchetype(hudArchetype);
  const trimmedInfluences = designInfluences.trim();
  const trimmedReferences = referenceInterfaces.trim();
  const trimmedStyle = preferredStyle.trim();
  const trimmedGoals = designGoals.trim();

  sections.push(`HUD archetype: ${archetype.label}`);
  sections.push(`Canon summary: ${archetype.summary}`);
  sections.push(`Design canon principles: ${archetype.principles.join('; ')}`);
  sections.push(`Recommended moves: ${archetype.dos.join('; ')}`);
  sections.push(`Watchouts: ${archetype.watchouts.join('; ')}`);
  summaryParts.push(`${archetype.label}: ${archetype.summary}`);

  if (trimmedStyle) {
    sections.push(`Preferred design style: ${trimmedStyle}`);
    summaryParts.push(`Style: ${trimmedStyle}`);
  }
  if (trimmedInfluences) sections.push(`Design influences: ${trimmedInfluences}`);
  if (trimmedReferences) sections.push(`Reference interfaces: ${trimmedReferences}`);
  if (trimmedGoals) sections.push(`Design goals: ${trimmedGoals}`);
  if (visualBrief) {
    sections.push(`Visual context\n${visualBrief.details}`);
    summaryParts.push(visualBrief.summary);
  }
  if (documentBrief) sections.push(`Document context\n${documentBrief.details}`);
  if (currentProjectMemory) {
    sections.push(
      `Project context\nFocus: ${currentProjectMemory.focus || 'None'}\nStatus: ${currentProjectMemory.status || 'Unknown'}\nNext step: ${
        currentProjectMemory.next_step || 'None'
      }\nNotes: ${currentProjectMemory.notes || 'None'}`,
    );
  }
  if (!sections.length) return null;

  return {
    title: 'Design Intelligence',
    summary: summaryParts.slice(0, 2).join(' ') || 'Design context is ready.',
    details: sections.join('\n\n'),
    archetypeLabel: archetype.label,
    canonSummary: archetype.summary,
    principles: archetype.principles,
    watchouts: archetype.watchouts,
    scorecard: designScorecard,
    critiquePrompt:
      `Act as a senior product designer and creative director.\n${sections.join('\n\n')}\n\n` +
      'Give a concise design critique covering hierarchy, clarity, interaction, aesthetic direction, and the highest-value improvement. Explicitly reference the archetype and whether the current direction is honoring it.',
    systemPrompt:
      `Act as a design systems lead.\n${sections.join('\n\n')}\n\n` +
      'Turn this into a reusable design direction with principles, components, typography, color and motion guidance, implementation notes, and HUD-specific rules for states, chrome, spacing, and scanability.',
    creativePrompt:
      `Act as a strong frontend design partner.\n${sections.join('\n\n')}\n\n` +
      'Propose a more creative visual direction that still preserves usability. Focus on composition, typography, color, motion, distinctive identity, and how to make the interface feel more like a premium game HUD or desktop command deck without becoming noisy.',
    implementationPrompt:
      `Act as a frontend design engineer.\n${sections.join('\n\n')}\n\n` +
      'Translate this design context into implementation guidance: layout structure, component changes, CSS direction, HUD states, motion rules, accessibility checks, and a safe build order.',
    screenAuditPrompt:
      `Act as a principal UI/UX reviewer for premium HUDs, game menus, and desktop command surfaces.\n${sections.join('\n\n')}\n\n` +
      'Using the current visual context if present, audit the interface for hierarchy, readability, panel balance, state communication, motion discipline, visual identity, and interaction clarity. Call out what feels generic, what feels strong, and the top 3 changes that would make the HUD feel more premium and more intentional.',
    scorecardPrompt:
      `Act as a principal UI/UX design reviewer.\n${sections.join('\n\n')}\n\n` +
      `Current HUD scorecard:\n${designScorecard
        .map((item) => `- ${item.label}: ${item.score}/10 - ${item.note}`)
        .join('\n')}\n\n` +
      'Review these category scores, challenge any weak assumptions, then return an improved scorecard with the top corrective moves for hierarchy, readability, distinctiveness, density discipline, motion discipline, and operator trust.',
  };
}
