import type { FivemCodingBrief } from '../components/Dashboard/FivemCodingPanel';
import type { WorkspaceSummary } from './api';
import { getFivemFrameworkCanon } from './fivemCanon';

type ProjectMemory = {
  focus?: string;
  status?: string;
  next_step?: string;
  notes?: string;
};

export function buildFivemCodingBrief(options: {
  enabled: boolean;
  workspaceSummary: WorkspaceSummary | null;
  durableProjects: Record<string, ProjectMemory> | undefined;
  editorFilePath: string;
}): FivemCodingBrief | null {
  const { enabled, workspaceSummary, durableProjects, editorFilePath } = options;
  if (!enabled) return null;

  const changedFiles = workspaceSummary?.changed_files || [];
  const projectMemories = Object.values(durableProjects || {});
  const likelyProjectMemory = projectMemories[0] || null;
  const projectText = [
    likelyProjectMemory?.focus || '',
    likelyProjectMemory?.status || '',
    likelyProjectMemory?.next_step || '',
    likelyProjectMemory?.notes || '',
    workspaceSummary?.root || '',
    editorFilePath || '',
    ...changedFiles,
  ]
    .join('\n')
    .toLowerCase();
  const hasLua =
    changedFiles.some((file) => file.toLowerCase().endsWith('.lua')) || editorFilePath.toLowerCase().endsWith('.lua');
  const hasManifest =
    projectText.includes('fxmanifest.lua') ||
    projectText.includes('__resource.lua') ||
    changedFiles.some((file) => /fxmanifest\.lua|__resource\.lua/i.test(file));
  const hasClientScripts =
    /client\.lua|client\/|client_script|client_scripts|registercommand|setnuifocus|sendnuimessage/.test(projectText);
  const hasServerScripts =
    /server\.lua|server\/|server_script|server_scripts|registernetevent|triggerserverevent|triggerclientevent/.test(
      projectText,
    );
  const hasSharedScripts = /shared\.lua|shared\/|shared_script|shared_scripts|config\.lua/.test(projectText);
  const hasNui = /nui|sendnuimessage|setnuifocus|ui_page/.test(projectText);
  const hasStateSignals =
    /statebag|localplayer\.state|player\(.*\)\.state|globalstate|entity\(.+\)\.state/.test(projectText);
  const hasServerCfgSignals =
    /server\.cfg|ensure\s+\w+|start\s+\w+|set\s+sv_|endpoint_add_tcp|endpoint_add_udp|onesync|mysql_connection_string/.test(
      projectText,
    );
  const hasDependencySignals =
    /dependency|dependencies|shared_script|server_script|client_script|provide\s+/.test(projectText);
  const hasFivemSignals =
    hasManifest ||
    /fivem|citizenfx|citizen\.|registernetevent|triggerclientevent|triggerserverevent|setnuifocus|sendnuimessage|playerpedid|getentitycoords|qb-core|qbcore|esx|ox_lib|ox_target|statebag/.test(
      projectText,
    );
  const nativeFamilies = [
    /playerpedid|getplayer|networkisplayeractive|playerid|getplayerserverid/.test(projectText) ? 'player' : null,
    /getentitycoords|doesentityexist|setentitycoords|freezeentityposition|deleteentity|networkgetnetworkidfromentity/.test(
      projectText,
    )
      ? 'entity'
      : null,
    /getvehiclepedisin|createvehicle|setvehicle|taskvehicle|isvehicle/.test(projectText) ? 'vehicle' : null,
    /getped|setped|isped|taskstartscenario|clearpedtasks/.test(projectText) ? 'ped' : null,
    /registernetevent|trigger(server|client)event|triggerlatentevent|addstatebagchangehandler/.test(projectText)
      ? 'network'
      : null,
    /sendnuimessage|setnuifocus|registernuicallback|ui_page/.test(projectText) ? 'ui' : null,
    hasStateSignals ? 'state' : null,
  ].filter((item): item is string => Boolean(item));
  const detectedFramework = /qb-core|qbcore/.test(projectText)
    ? 'QBCore'
    : /\besx\b/.test(projectText)
      ? 'ESX'
      : /ox_lib|ox_target|ox_inventory|oxmysql/.test(projectText)
        ? 'ox_*'
        : hasFivemSignals
          ? 'Custom / native FiveM'
          : 'Lua';
  const frameworkCanon = getFivemFrameworkCanon(detectedFramework);
  const resourceKey = `${workspaceSummary?.root || 'unknown-root'}::${editorFilePath || changedFiles[0] || 'resource'}`;
  const topology =
    [
      hasClientScripts ? 'client' : null,
      hasServerScripts ? 'server' : null,
      hasSharedScripts ? 'shared' : null,
      hasNui ? 'nui' : null,
    ].filter(Boolean).join(' / ') || 'single-surface';
  if (!hasLua && !hasFivemSignals) return null;
  const serverStructure =
    [
      hasServerScripts ? 'server scripts present' : null,
      hasClientScripts ? 'client scripts present' : null,
      hasSharedScripts ? 'shared/config surface present' : null,
      hasNui ? 'NUI surface present' : null,
      hasServerCfgSignals ? 'server.cfg/runtime config signals present' : null,
      hasDependencySignals ? 'manifest/dependency wiring present' : null,
    ].filter(Boolean).join(' | ') || 'single-surface resource with limited runtime signals';
  const riskTags = [
    nativeFamilies.includes('network') ? 'network-trust' : null,
    nativeFamilies.includes('state') ? 'state-desync' : null,
    hasClientScripts && hasServerScripts ? 'cross-boundary' : null,
    hasNui ? 'nui-coupling' : null,
    detectedFramework === 'QBCore' || detectedFramework === 'ESX' || detectedFramework === 'ox_*'
      ? 'framework-coupling'
      : null,
    frameworkCanon.watchouts[0] || null,
  ].filter((item): item is string => Boolean(item));
  const focusItems = [
    hasManifest
      ? {
          label: 'Resource Manifest',
          detail:
            'The workspace looks like a FiveM resource. Review fxmanifest or __resource wiring, dependency declarations, and client/server script boundaries first.',
        }
      : null,
    hasLua
      ? {
          label: 'Lua Surface',
          detail: `${[editorFilePath, ...changedFiles].filter((file) => /\.lua$/i.test(file)).slice(0, 4).join(', ') || 'Lua files detected'} should be reviewed for state flow, event safety, nil handling, and return-value discipline.`,
        }
      : null,
    /registernetevent|triggerclientevent|triggerserverevent|statebag|playerpedid|getentitycoords/.test(projectText)
      ? {
          label: 'Native / Event Usage',
          detail:
            'Network events or FiveM natives are in play. Check authority boundaries, parameter validation, entity ownership, and client/server trust assumptions.',
        }
      : null,
    nativeFamilies.length
      ? {
          label: 'Native Families',
          detail: `Detected native surfaces: ${nativeFamilies.join(', ')}. Review each family for authority, null-safety, and whether the script is calling the right side of the engine.`,
        }
      : null,
    hasStateSignals
      ? {
          label: 'State Flow',
          detail:
            'State bags or shared state patterns are present. Audit replication assumptions, stale reads, and whether writes are happening on the authoritative side.',
        }
      : null,
    /qb-core|qbcore|esx|ox_lib|ox_target/.test(projectText)
      ? {
          label: 'Framework Coupling',
          detail: `Framework detected: ${detectedFramework}. Audit exports, callback usage, player/state APIs, and dependency assumptions before refactoring.`,
        }
      : null,
    hasClientScripts || hasServerScripts || hasSharedScripts || hasNui
      ? {
          label: 'Resource Topology',
          detail: `Detected topology: ${topology}. Review event flow, ownership boundaries, and whether logic is living on the safest side of the resource.`,
        }
      : null,
    hasServerCfgSignals || hasDependencySignals
      ? {
          label: 'Server Structure',
          detail: `Detected structure: ${serverStructure}. Review resource start order, dependency assumptions, framework boot order, and whether runtime config matches how the scripts initialize.`,
        }
      : null,
  ].filter((item): item is { label: string; detail: string } => Boolean(item));
  const details = [
    `Repo root: ${workspaceSummary?.root || 'Unknown'}`,
    `Current file: ${editorFilePath || 'None loaded'}`,
    `Changed files: ${changedFiles.slice(0, 8).join(', ') || 'None'}`,
    `Project focus: ${likelyProjectMemory?.focus || 'Unknown'}`,
    `Project status: ${likelyProjectMemory?.status || 'Unknown'}`,
    `Project next step: ${likelyProjectMemory?.next_step || 'Unknown'}`,
    `Framework: ${detectedFramework}`,
    `Topology: ${topology}`,
    `Server structure: ${serverStructure}`,
    `Native families: ${nativeFamilies.join(', ') || 'Unknown'}`,
    `Canon priorities: ${frameworkCanon.priorities.join(' | ')}`,
    `Canon watchouts: ${frameworkCanon.watchouts.join(' | ')}`,
    `Exploit patterns: ${frameworkCanon.exploitPatterns.join(' | ')}`,
    `Console checks: ${frameworkCanon.consoleChecks.join(' | ')}`,
    `Detected mode: ${hasFivemSignals ? 'FiveM / Lua resource' : 'Lua project'}`,
  ].join('\n');

  return {
    title: hasFivemSignals ? 'FiveM Coding Intel' : 'Lua Coding Intel',
    summary: hasFivemSignals
      ? 'FiveM resource signals detected. JARVIS can now reason about natives, events, resource architecture, and exploit-resistant Lua patterns more directly.'
      : 'Lua signals detected. JARVIS can now review logic, state flow, safety, and maintainability with a stronger Lua-focused lens.',
    details,
    resourceKey,
    framework: detectedFramework,
    topology,
    serverStructure,
    nativeFamilies,
    riskTags,
    canonSummary: frameworkCanon.summary,
    canonPriorities: frameworkCanon.priorities,
    canonWatchouts: frameworkCanon.watchouts,
    canonExploitPatterns: frameworkCanon.exploitPatterns,
    canonConsoleChecks: frameworkCanon.consoleChecks,
    focusItems,
  };
}
