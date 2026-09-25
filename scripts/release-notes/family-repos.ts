import {
  collectRemoteCompare,
  normalizeRepositoryName,
  readDefaultBranchRef,
  readRemoteReleaseTimestamp,
} from './command.ts';
import {
  buildChangeSummaryHint,
  fallbackChangeSummaryHint,
  humanizeCommitSubject,
} from './changes.ts';
import {
  collectComponentChangeSubjects,
  normalizeComponentVersion,
} from './payload.ts';
import type { FamilyRepoChange, ReleaseNoteOptions } from './types.ts';

const familyPayloadRefSpecs = [
  {
    key: 'opl_framework',
    componentKey: 'opl',
    label: 'OPL Framework',
  },
  {
    key: 'mas',
    componentKey: 'mas',
    label: 'MAS',
  },
  {
    key: 'mag',
    componentKey: 'mag',
    label: 'MAG',
  },
  {
    key: 'rca',
    componentKey: 'rca',
    label: 'RCA',
  },
  {
    key: 'opl_meta_agent',
    componentKey: 'meta_agent',
    label: 'OPL Meta Agent',
  },
  {
    key: 'officecli',
    componentKey: 'officecli',
    label: 'OfficeCLI',
  },
  {
    key: 'mineru',
    componentKey: 'mineru_open_api',
    label: 'MinerU',
  },
] as const;

const defaultFamilyRepoWindowSpecs = [
  {
    label: 'OPL Framework',
    repository: 'gaofeng21cn/one-person-lab',
  },
  {
    label: 'MAS',
    repository: 'gaofeng21cn/med-autoscience',
  },
  {
    label: 'MAG',
    repository: 'gaofeng21cn/med-autogrant',
  },
  {
    label: 'RCA',
    repository: 'gaofeng21cn/redcube-ai',
  },
  {
    label: 'OPL Meta Agent',
    repository: 'gaofeng21cn/opl-meta-agent',
  },
] as const;

function resolvedRefValue(manifest: any, spec: typeof familyPayloadRefSpecs[number]) {
  const resolved = manifest?.resolved_refs?.[spec.key];
  const component = manifest?.components?.[spec.componentKey];
  const repository = typeof resolved?.repository === 'string' ? resolved.repository : null;
  const ref = typeof resolved?.resolved_commit === 'string'
    ? resolved.resolved_commit
    : typeof component?.git_commit === 'string'
      ? component.git_commit
      : null;
  const version = normalizeComponentVersion(spec.label, resolved?.version ?? component?.version);
  return {
    label: typeof resolved?.label === 'string' ? resolved.label : spec.label,
    repository,
    ref,
    version,
  };
}

export function buildFamilyRepoChanges(currentManifest: any, previousManifest: any): FamilyRepoChange[] {
  if (!currentManifest || typeof currentManifest !== 'object') {
    return [];
  }
  return familyPayloadRefSpecs
    .map((spec) => {
      const current = resolvedRefValue(currentManifest, spec);
      const previous = resolvedRefValue(previousManifest, spec);
      if (!current.ref && !current.version) {
        return null;
      }
      const remoteCompare = collectRemoteCompare(current.repository, previous.ref, current.ref);
      const localSubjects = collectComponentChangeSubjects(
        currentManifest?.components?.[spec.componentKey],
        previousManifest?.components?.[spec.componentKey],
      );
      const changeSubjects = remoteCompare.change_subjects.length > 0
        ? remoteCompare.change_subjects
        : localSubjects.slice(0, 8);
      const changed = previous.ref !== current.ref || previous.version !== current.version || changeSubjects.length > 0;
      if (!changed) {
        return null;
      }
      return {
        label: current.label,
        repository: current.repository || previous.repository || '',
        previous_ref: previous.ref,
        current_ref: current.ref,
        previous_version: previous.version,
        current_version: current.version,
        compare_url: remoteCompare.compare_url,
        compare_status: remoteCompare.compare_status,
        commit_count: remoteCompare.commit_count,
        change_subjects: changeSubjects,
        change_summary_hint: buildChangeSummaryHint(spec.label, changeSubjects),
      };
    })
    .filter((change): change is FamilyRepoChange => Boolean(change));
}

export function buildAppAndShellRepoChanges(input: {
  releaseRepo: string;
  previousTag: string | null;
  currentTag: string;
  appSubjects: string[];
  shellSubjects: string[];
  shellRepository: string;
  shellLabel: string;
  shellPreviousRef: string | null;
  shellCurrentRef: string | null;
}) {
  const changes: FamilyRepoChange[] = [];
  if (input.appSubjects.length > 0 || input.previousTag) {
    changes.push({
      label: 'One Person Lab App',
      repository: input.releaseRepo,
      previous_ref: input.previousTag,
      current_ref: input.currentTag,
      previous_version: null,
      current_version: null,
      compare_url: input.previousTag
        ? `https://github.com/${input.releaseRepo}/compare/${input.previousTag}...${input.currentTag}`
        : null,
      compare_status: null,
      commit_count: input.appSubjects.length,
      change_subjects: input.appSubjects.slice(0, 8),
      change_summary_hint: fallbackChangeSummaryHint('One Person Lab App', input.appSubjects),
    });
  }
  if (input.shellCurrentRef && (input.shellSubjects.length > 0 || input.shellPreviousRef !== input.shellCurrentRef)) {
    const remoteCompare = collectRemoteCompare(input.shellRepository, input.shellPreviousRef, input.shellCurrentRef);
    changes.push({
      label: input.shellLabel,
      repository: input.shellRepository,
      previous_ref: input.shellPreviousRef,
      current_ref: input.shellCurrentRef,
      previous_version: null,
      current_version: null,
      compare_url: remoteCompare.compare_url,
      compare_status: remoteCompare.compare_status,
      commit_count: remoteCompare.commit_count ?? input.shellSubjects.length,
      change_subjects: remoteCompare.change_subjects.length > 0 ? remoteCompare.change_subjects : input.shellSubjects.slice(0, 8),
      change_summary_hint: fallbackChangeSummaryHint(input.shellLabel, input.shellSubjects),
    });
  }
  return changes;
}

function shouldCollectDefaultFamilyWindow(options: ReleaseNoteOptions) {
  if (process.env.OPL_RELEASE_NOTES_SKIP_REMOTE_FAMILY_REPOS === '1') {
    return false;
  }
  return options.channel === 'nightly'
    || process.env.GITHUB_ACTIONS === 'true'
    || process.env.OPL_RELEASE_NOTES_INCLUDE_REMOTE_FAMILY === '1';
}

export function buildDefaultFamilyRepoWindowChanges(options: ReleaseNoteOptions, previousTag: string | null) {
  if (!shouldCollectDefaultFamilyWindow(options)) {
    return [];
  }
  const releaseRepo = options.releaseRepo || 'gaofeng21cn/one-person-lab-app';
  const previousTimestamp = readRemoteReleaseTimestamp(releaseRepo, previousTag);
  if (!previousTimestamp) {
    return [];
  }
  return defaultFamilyRepoWindowSpecs
    .map((spec) => {
      const previousRef = readDefaultBranchRef(spec.repository, previousTimestamp);
      const currentRef = readDefaultBranchRef(spec.repository);
      if (!currentRef || previousRef === currentRef) {
        return null;
      }
      const remoteCompare = collectRemoteCompare(spec.repository, previousRef, currentRef);
      return {
        label: spec.label,
        repository: spec.repository,
        previous_ref: previousRef,
        current_ref: currentRef,
        previous_version: null,
        current_version: null,
        compare_url: remoteCompare.compare_url,
        compare_status: remoteCompare.compare_status,
        commit_count: remoteCompare.commit_count,
        change_subjects: remoteCompare.change_subjects,
        change_summary_hint: buildChangeSummaryHint(spec.label, remoteCompare.change_subjects),
      };
    })
    .filter((change): change is FamilyRepoChange => Boolean(change));
}

export function mergeFamilyRepoChanges(changes: FamilyRepoChange[]) {
  const byKey = new Map<string, FamilyRepoChange>();
  for (const change of changes) {
    const key = `${change.label}\n${normalizeRepositoryName(change.repository) || change.repository}`;
    if (!byKey.has(key)) {
      byKey.set(key, change);
    }
  }
  return [...byKey.values()];
}

function formatRefTransition(previousRef: string | null, currentRef: string | null) {
  if (!currentRef) {
    return null;
  }
  const displayRef = (value: string) => (/^v\d+\./.test(value) ? value : value.slice(0, 7));
  const current = displayRef(currentRef);
  return previousRef && previousRef !== currentRef ? `${displayRef(previousRef)} -> ${current}` : current;
}

function formatVersionTransition(previousVersion: string | null, currentVersion: string | null) {
  if (!currentVersion) {
    return null;
  }
  return previousVersion && previousVersion !== currentVersion ? `${previousVersion} -> ${currentVersion}` : currentVersion;
}

function summarizeSubjects(subjects: string[]) {
  const details = subjects
    .map(humanizeCommitSubject)
    .filter(Boolean)
    .slice(0, 3);
  if (details.length === 0) {
    return null;
  }
  return `including ${details.join('; ')}`;
}

export function familyRepoChangeBullet(change: FamilyRepoChange) {
  const transition = formatRefTransition(change.previous_ref, change.current_ref)
    || formatVersionTransition(change.previous_version, change.current_version);
  const canShowCommitCount = change.compare_status === null || change.compare_status === 'ahead';
  const count = canShowCommitCount && typeof change.commit_count === 'number' && change.commit_count > 0
    ? `${change.commit_count} commit${change.commit_count === 1 ? '' : 's'}`
    : null;
  const subjects = summarizeSubjects(change.change_subjects);
  const userSummary = change.change_summary_hint || subjects;
  const audit = [count, transition ? `audit ref ${transition}` : null].filter(Boolean).join(', ');
  if (userSummary && audit) {
    return `- ${change.label}: ${userSummary} (${audit}).`;
  }
  if (userSummary) {
    return `- ${change.label}: ${userSummary}.`;
  }
  return `- ${change.label}: updated in the bundled OPL family payload${audit ? ` (${audit})` : ''}.`;
}
