import type {
  DurableOperatorMemory,
  WorkspaceChecks,
  WorkspaceRepoCatalog,
  WorkspaceSummary,
  WorkbenchEntry,
} from './api';

type ReviewQueueItem = {
  filePath: string;
  status: string;
};

type CodingTask = {
  title: string;
  filePath: string;
  mode: string;
  status: string;
};

type SelfImproveRun = {
  phase?: string;
  summary?: string;
  detail?: string;
};

type ActiveSelfImproveTask = {
  filePath?: string;
};

export type SelfImproveBrief = {
  title: string;
  summary: string;
  details: string;
  prompt: string;
};

export type SelfImprovePatchPlan = {
  targetFile: string;
  summary: string;
  steps: string[];
  prompt: string;
};

export function buildSelfImproveBrief(options: {
  workspaceSummary: WorkspaceSummary | null;
  workspaceRepos: WorkspaceRepoCatalog | null;
  durableProjects: DurableOperatorMemory['projects'] | undefined;
  normalizeMeetingKey: (value: string) => string;
  latestValidationFailure: WorkbenchEntry | null;
  latestValidationSuccess: WorkbenchEntry | null;
  nextReviewQueueItem: ReviewQueueItem | null;
  nextCodingTask: CodingTask | null;
  workspaceChecks: WorkspaceChecks | null;
}): SelfImproveBrief | null {
  const {
    workspaceSummary,
    workspaceRepos,
    durableProjects,
    normalizeMeetingKey,
    latestValidationFailure,
    latestValidationSuccess,
    nextReviewQueueItem,
    nextCodingTask,
    workspaceChecks,
  } = options;
  const sections: string[] = [];
  const summaryParts: string[] = [];
  const inferredProjectKey = normalizeMeetingKey(workspaceSummary?.root || workspaceSummary?.branch || 'workspace');
  const inferredProjectMemory = durableProjects?.[inferredProjectKey] || null;
  const inferredActiveRepo = workspaceRepos?.repos.find((repo) => repo.root === workspaceRepos.active_root) || null;
  const repoLabel = workspaceSummary?.root || inferredActiveRepo?.root || 'active workspace';

  if (workspaceSummary) {
    sections.push(
      `Workspace\nRoot: ${workspaceSummary.root}\nBranch: ${workspaceSummary.branch || 'unknown'}\nDirty: ${
        workspaceSummary.dirty ? 'yes' : 'no'
      }\nChanged files: ${(workspaceSummary.changed_files || []).slice(0, 8).join(', ') || 'None'}`,
    );
  }

  if (inferredProjectMemory) {
    sections.push(
      `Project memory\nFocus: ${inferredProjectMemory.focus || 'None'}\nStatus: ${
        inferredProjectMemory.status || 'Unknown'
      }\nNext step: ${inferredProjectMemory.next_step || 'None'}\nNotes: ${inferredProjectMemory.notes || 'None'}`,
    );
  }

  if (latestValidationFailure) {
    summaryParts.push('Validation is failing.');
    sections.push(
      `Latest validation failure\nCommand: ${latestValidationFailure.command}\nOutput:\n${latestValidationFailure.output}`,
    );
  } else if (latestValidationSuccess) {
    summaryParts.push('Validation is currently green.');
    sections.push(`Latest validation success\nCommand: ${latestValidationSuccess.command}`);
  }

  if (nextReviewQueueItem) {
    sections.push(`Review queue\nNext file: ${nextReviewQueueItem.filePath}\nStatus: ${nextReviewQueueItem.status}`);
  }

  if (nextCodingTask) {
    sections.push(
      `Coding task\nTitle: ${nextCodingTask.title}\nFile: ${nextCodingTask.filePath}\nMode: ${nextCodingTask.mode}\nStatus: ${nextCodingTask.status}`,
    );
  }

  if (workspaceChecks?.checks?.length) {
    sections.push(
      `Recommended checks\n${workspaceChecks.checks
        .slice(0, 4)
        .map((item) => `${item.label}: ${item.command}`)
        .join('\n')}`,
    );
  }

  if (!sections.length) return null;

  return {
    title: 'Self-Improve',
    summary: summaryParts[0] || `JARVIS has enough coding context to inspect ${repoLabel}.`,
    details: sections.join('\n\n'),
    prompt:
      `Inspect the current JARVIS coding state for "${repoLabel}".\n${sections.join('\n\n')}\n\n` +
      'Identify the highest-value self-improvement step, explain the root cause, and propose the safest next patch.',
  };
}

export function buildSelfImprovePatchPlan(options: {
  activeSelfImproveTask: ActiveSelfImproveTask | null;
  selfImproveTargetFile: string | null | undefined;
  selfImproveRuns: SelfImproveRun[];
  selfImproveBrief: SelfImproveBrief | null;
  latestValidationFailure: WorkbenchEntry | null;
  latestValidationSuccess: WorkbenchEntry | null;
  workspaceChecks: WorkspaceChecks | null;
}): SelfImprovePatchPlan | null {
  const {
    activeSelfImproveTask,
    selfImproveTargetFile,
    selfImproveRuns,
    selfImproveBrief,
    latestValidationFailure,
    latestValidationSuccess,
    workspaceChecks,
  } = options;
  const targetFile = (activeSelfImproveTask?.filePath || selfImproveTargetFile || '').trim();
  const latestRun = selfImproveRuns[0] || null;
  if (!selfImproveBrief && !targetFile && !latestRun) return null;

  const summary =
    latestRun?.phase === 'blocker'
      ? 'A blocker was returned. Focus the target file and prepare the smallest safe patch.'
      : latestRun?.phase === 'patch'
        ? 'A patch landed. Re-check the target and validate the change.'
        : latestValidationFailure
          ? 'Validation is failing. Inspect the target file and prepare the next safe fix.'
          : latestValidationSuccess
            ? 'Validation is green. Review the patch and decide whether to commit or continue refining.'
            : 'JARVIS has enough context to prepare the next self-improvement patch.';

  const steps = [
    targetFile ? `Open ${targetFile} and inspect the active mission scope.` : 'Inspect the highest-signal active file in the current repo.',
    latestRun?.phase === 'blocker' || latestValidationFailure
      ? 'Trace the blocker or validation failure back to the smallest plausible root cause.'
      : latestRun?.phase === 'patch'
        ? 'Review the applied patch and confirm whether it addressed the intended mission.'
        : 'Review the current mission state and identify the smallest safe improvement.',
    workspaceChecks?.checks?.[0]
      ? `Run ${workspaceChecks.checks[0].label} once the next patch is ready.`
      : 'Prepare the next available validation step after the patch.',
  ];

  const prompt =
    `Build the next self-improvement patch plan.\n` +
    `${targetFile ? `Target file: ${targetFile}\n` : ''}` +
    `${selfImproveBrief ? `Mission brief:\n${selfImproveBrief.details}\n\n` : ''}` +
    `${latestRun ? `Latest cycle event (${latestRun.phase}): ${latestRun.summary}\n${latestRun.detail}\n\n` : ''}` +
    `${latestValidationFailure ? `Latest validation failure:\n${latestValidationFailure.command}\n${latestValidationFailure.output}\n\n` : ''}` +
    `Return:\n1. Root cause\n2. Smallest safe patch\n3. Validation step\n4. Risks`;

  return {
    targetFile,
    summary,
    steps,
    prompt,
  };
}
