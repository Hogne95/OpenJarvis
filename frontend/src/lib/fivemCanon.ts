export type FivemFrameworkId = 'qbcore' | 'esx' | 'ox' | 'native' | 'lua';

export interface FivemFrameworkCanon {
  id: FivemFrameworkId;
  label: string;
  summary: string;
  priorities: string[];
  watchouts: string[];
  exploitPatterns: string[];
  consoleChecks: string[];
  reviewModes: string[];
}

export const FIVEM_FRAMEWORKS: FivemFrameworkCanon[] = [
  {
    id: 'qbcore',
    label: 'QBCore',
    summary: 'A framework-heavy FiveM stack where exports, player state, callbacks, and inventory/money logic need strict server authority.',
    priorities: [
      'Keep item, money, and permission logic authoritative on the server.',
      'Review PlayerData assumptions and callback flow before changing business logic.',
      'Audit exports and shared object access for brittle coupling.',
    ],
    watchouts: ['client-trusted rewards', 'callback misuse', 'PlayerData drift', 'export coupling'],
    exploitPatterns: ['reward events called from client', 'money/item mutation outside server authority', 'unsanitized callback payloads'],
    consoleChecks: ['check server callback failures', 'trace PlayerData nil access', 'inspect export/callback order'],
    reviewModes: ['QBCore', 'Security Audit', 'Event Flow'],
  },
  {
    id: 'esx',
    label: 'ESX',
    summary: 'An ESX-oriented resource where shared object access, jobs/accounts/items, and callback assumptions often hide fragile logic.',
    priorities: [
      'Validate xPlayer lookups and server-side authority for accounts, jobs, and inventory.',
      'Check event payloads and callback return flow for abuse paths.',
      'Review migration-era patterns that mix legacy and newer ESX APIs.',
    ],
    watchouts: ['legacy shared-object patterns', 'client-side inventory trust', 'job/account desync'],
    exploitPatterns: ['client-controlled account or inventory actions', 'legacy shared object leakage', 'weak server validation on job/item events'],
    consoleChecks: ['look for xPlayer nil or missing shared object errors', 'trace callback/event mismatch', 'inspect legacy/new API mix warnings'],
    reviewModes: ['ESX', 'Security Audit', 'State Audit'],
  },
  {
    id: 'ox',
    label: 'ox_*',
    summary: 'A modular ox ecosystem where API correctness, callback boundaries, and dependency assumptions matter as much as raw Lua logic.',
    priorities: [
      'Audit ox_lib, ox_target, ox_inventory, and oxmysql boundaries explicitly.',
      'Check async/database and callback flow for ordering bugs.',
      'Keep UI, targeting, inventory, and persistence concerns clearly separated.',
    ],
    watchouts: ['API mismatch', 'async ordering bugs', 'target/UI coupling', 'database state assumptions'],
    exploitPatterns: ['async inventory/state races', 'target/UI action trust', 'database result assumptions leaking invalid state'],
    consoleChecks: ['inspect ox_lib callback errors', 'trace async/db timing failures', 'check ox resource startup order'],
    reviewModes: ['ox_*', 'Topology', 'Native Ref'],
  },
  {
    id: 'native',
    label: 'Custom / native FiveM',
    summary: 'A native-first resource where event boundaries, entity ownership, and lifecycle discipline are the main review concerns.',
    priorities: [
      'Map client/server ownership before touching gameplay logic.',
      'Audit event payload validation and trust boundaries.',
      'Review entity/ped/vehicle lifecycle and cleanup carefully.',
    ],
    watchouts: ['unsafe events', 'entity ownership confusion', 'cleanup leaks', 'authority inversion'],
    exploitPatterns: ['client-triggered privileged events', 'entity ownership abuse', 'cleanup omissions causing stale gameplay state'],
    consoleChecks: ['trace event registration failures', 'inspect entity/native runtime errors', 'check resource start dependency order'],
    reviewModes: ['FiveM Review', 'Native Ref', 'Event Flow'],
  },
  {
    id: 'lua',
    label: 'Lua',
    summary: 'A general Lua codebase where state flow, nil safety, and sequencing quality drive correctness.',
    priorities: [
      'Check invalid state transitions and hidden assumptions.',
      'Audit nil handling and return-value discipline.',
      'Review long-term maintainability before micro-optimizing.',
    ],
    watchouts: ['nil hazards', 'implicit globals', 'state drift', 'branchy control flow'],
    exploitPatterns: ['implicit global mutation', 'nil-driven silent failure', 'branch-heavy logic hiding invalid state'],
    consoleChecks: ['trace nil indexing in console output', 'inspect load-order errors', 'check global/state initialization timing'],
    reviewModes: ['Lua Logic', 'State Audit'],
  },
];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function getFivemFrameworkCanon(label: string): FivemFrameworkCanon {
  const normalized = normalize(label);
  return (
    FIVEM_FRAMEWORKS.find((item) => normalize(item.label) === normalized) ||
    FIVEM_FRAMEWORKS.find((item) => item.id === normalized) ||
    FIVEM_FRAMEWORKS.find((item) => item.id === 'native')!
  );
}
