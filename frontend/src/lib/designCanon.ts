export type DesignArchetypeId =
  | 'command-center-hud'
  | 'tactical-ops-console'
  | 'premium-game-menu'
  | 'desktop-control-deck'
  | 'editorial-tech-luxury';

export interface DesignArchetype {
  id: DesignArchetypeId;
  label: string;
  summary: string;
  principles: string[];
  dos: string[];
  watchouts: string[];
}

export const DESIGN_ARCHETYPES: DesignArchetype[] = [
  {
    id: 'command-center-hud',
    label: 'Command Center HUD',
    summary: 'A high-trust mission surface with strong hierarchy, status visibility, and disciplined chrome.',
    principles: [
      'Make status and priority readable from a distance.',
      'Use restrained color accents to signal urgency, not decorate everything.',
      'Favor layered panels, clear framing, and operational typography over generic cards.',
      'Treat motion as systems feedback, not entertainment.',
    ],
    dos: [
      'Expose system state, readiness, and active tasks near the top of the layout.',
      'Use dense but calm information clusters with obvious scan paths.',
      'Keep panel titles and action labels short, distinct, and high-contrast.',
    ],
    watchouts: ['generic glassmorphism', 'too many accent colors', 'status hidden below the fold'],
  },
  {
    id: 'tactical-ops-console',
    label: 'Tactical Ops Console',
    summary: 'A sharper, more mission-driven HUD inspired by tactical game overlays and control software.',
    principles: [
      'Optimize for fast recognition under pressure.',
      'Separate monitor surfaces from action surfaces.',
      'Make warnings and approvals feel serious and explicit.',
      'Use angular framing and directional composition with restraint.',
    ],
    dos: [
      'Group controls by decision phase: observe, decide, act, verify.',
      'Make high-risk actions visually heavier than passive metrics.',
      'Use concise microcopy and avoid playful filler language.',
    ],
    watchouts: ['ornamental angles everywhere', 'overcrowded warnings', 'unclear action hierarchy'],
  },
  {
    id: 'premium-game-menu',
    label: 'Premium Game Menu',
    summary: 'A cinematic menu language with bold identity, strong pacing, and polished transitions.',
    principles: [
      'Lead with a strong focal point before exposing system depth.',
      'Use typography and atmosphere to create mood, not only utility.',
      'Let primary actions feel ceremonial and satisfying.',
      'Keep visual surprises intentional and limited.',
    ],
    dos: [
      'Use larger title moments and stronger hero framing.',
      'Balance spectacle with immediately readable navigation.',
      'Keep secondary actions quieter so the primary path feels premium.',
    ],
    watchouts: ['cinematic clutter', 'slow decorative motion', 'spectacle overwhelming utility'],
  },
  {
    id: 'desktop-control-deck',
    label: 'Desktop Control Deck',
    summary: 'A modern command surface for power users that blends software clarity with desktop authority.',
    principles: [
      'Think in workflows, not standalone widgets.',
      'Support long sessions with calm contrast and disciplined density.',
      'Favor practical affordances over ornamental chrome.',
      'Keep panels modular so operators can form mental maps quickly.',
    ],
    dos: [
      'Prioritize keyboard-friendly layout and compact action lanes.',
      'Keep controls near the data they influence.',
      'Make context switches obvious when moving between lanes like vision, coding, and ops.',
    ],
    watchouts: ['detached controls', 'too many isolated widgets', 'weak workflow grouping'],
  },
  {
    id: 'editorial-tech-luxury',
    label: 'Editorial Tech Luxury',
    summary: 'A more premium web-product direction with confident typography, spacing, and storytelling polish.',
    principles: [
      'Use generous rhythm and fewer but stronger visual statements.',
      'Let typography carry confidence before relying on effects.',
      'Pair technical surfaces with premium editorial pacing.',
      'Choose distinctive materials and contrast, not generic gradients everywhere.',
    ],
    dos: [
      'Use fewer visual motifs, but execute them more cleanly.',
      'Create strong section openings and clearer visual cadence.',
      'Reserve glow, blur, and texture for moments that matter.',
    ],
    watchouts: ['luxury without clarity', 'soft contrast', 'over-designed decorative texture'],
  },
];

export const DEFAULT_DESIGN_ARCHETYPE_ID: DesignArchetypeId = 'command-center-hud';

function normalizeDesignValue(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

export function getDesignArchetype(value: string): DesignArchetype {
  const normalized = normalizeDesignValue(value);
  return (
    DESIGN_ARCHETYPES.find(
      (item) =>
        item.id === normalized.replace(/\s+/g, '-') ||
        normalizeDesignValue(item.label) === normalized,
    ) ||
    DESIGN_ARCHETYPES.find((item) => item.id === DEFAULT_DESIGN_ARCHETYPE_ID)!
  );
}
