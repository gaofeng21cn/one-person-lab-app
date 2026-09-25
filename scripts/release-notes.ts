import { readActiveShellBuildProfile } from './active-shell-build-profile.ts';
import { collectCommitSubjects, gitRefExists } from './release-notes/command.ts';
import { appendAgentChangeSummary, normalizedSubject, summarizeChanges } from './release-notes/changes.ts';
import {
  buildAppAndShellRepoChanges,
  buildDefaultFamilyRepoWindowChanges,
  buildFamilyRepoChanges,
  mergeFamilyRepoChanges,
} from './release-notes/family-repos.ts';
import {
  buildAgentRuntimeChanges,
  buildBundledVersionLines,
  buildOplPayloadLines,
  buildPayloadUpdateLines,
} from './release-notes/payload.ts';
import { readRemoteFullPackageManifest } from './release-notes/remote-manifest.ts';
import {
  buildReleaseTitle,
  normalizeTag,
  resolvePreviousShellRef,
  readAppShellRepositoryAt,
  resolvePreviousTag,
  resolveShellRef,
} from './release-notes/tags.ts';
import {
  escapeRegExp,
  extractLocalizedReleaseNotes,
  stripVisibleReleaseTitle,
  stripLocalizedReleaseNotes,
} from './release-notes-ai-writer-parts/markdown-normalization.ts';
import { renderReleaseNotesDocument } from './release-notes/document.ts';
import type { ReleaseNoteOptions, ReleaseNotesEvidence } from './release-notes/types.ts';

export type {
  ReleaseNoteOptions,
  ReleaseNotesEvidence,
} from './release-notes/types.ts';

export { buildReleaseTitle } from './release-notes/tags.ts';

const stableInstallCommand = 'brew install --cask gaofeng21cn/one-person-lab/one-person-lab';
const onlineAiReleaseNotesMarker = '<!-- OPL_RELEASE_NOTES_GENERATOR:online-ai -->';

function sectionBounds(markdown: string, heading: string) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return null;
  const next = lines.findIndex((line, index) => index > start && /^##\s+/.test(line.trim()));
  return { lines, start, end: next < 0 ? lines.length : next };
}

function replaceTopLevelSection(markdown: string, heading: string, replacement: string) {
  const bounds = sectionBounds(markdown, heading);
  if (!bounds) throw new Error(`Preview release notes are missing ${heading}.`);
  bounds.lines.splice(bounds.start, bounds.end - bounds.start, ...replacement.trim().split('\n'), '');
  return `${bounds.lines.join('\n').trimEnd()}\n`;
}

function removeTopLevelSection(markdown: string, heading: string) {
  const bounds = sectionBounds(markdown, heading);
  if (!bounds) return markdown;
  bounds.lines.splice(bounds.start, bounds.end - bounds.start);
  return `${bounds.lines.join('\n').trimEnd()}\n`;
}

function replaceOpeningParagraph(markdown: string, title: string, paragraph: string) {
  const lines = markdown.trimEnd().split('\n');
  const titleIndex = lines.findIndex((line) => line.trim() === title);
  if (titleIndex < 0) throw new Error('Preview release notes are missing the exact release title.');
  let contentStart = titleIndex + 1;
  while (contentStart < lines.length && !lines[contentStart]!.trim()) contentStart += 1;
  if (contentStart >= lines.length || /^##\s+/.test(lines[contentStart]!.trim())) {
    lines.splice(titleIndex + 1, 0, '', paragraph, '');
    return `${lines.join('\n').trimEnd()}\n`;
  }
  let contentEnd = contentStart + 1;
  while (contentEnd < lines.length && lines[contentEnd]!.trim()) contentEnd += 1;
  lines.splice(contentStart, contentEnd - contentStart, paragraph);
  return `${lines.join('\n').trimEnd()}\n`;
}

function prependPreviewHighlight(markdown: string) {
  const bounds = sectionBounds(markdown, '## Highlights');
  if (!bounds) throw new Error('Preview release notes are missing ## Highlights.');
  const bullet = '- Use the qualified Standard Desktop package through the temporary Preview Latest pointer.';
  const existing = bounds.lines.slice(bounds.start + 1, bounds.end).filter((line) => line.trim() !== bullet);
  bounds.lines.splice(bounds.start, bounds.end - bounds.start, '## Highlights', bullet, ...existing, '');
  return `${bounds.lines.join('\n').trimEnd()}\n`;
}

function normalizeEnglishPreviewNotes(markdown: string, evidence: ReleaseNotesEvidence) {
  let normalized = markdown.replaceAll(onlineAiReleaseNotesMarker, '').trimEnd();
  if (!new RegExp(`^#?\\s*${escapeRegExp(evidence.release_title)}(?:\\s|$)`).test(normalized)) {
    normalized = `${evidence.release_title}\n\n${normalized}`;
  }
  normalized = removeTopLevelSection(normalized, '## Install Stable');
  normalized = normalized.replaceAll(stableInstallCommand, '');
  normalized = normalized
    .replace(/\bThis Stable release\b/g, 'This qualified manual Preview')
    .replace(/\bthis Stable release\b/g, 'this qualified manual Preview');
  normalized = replaceOpeningParagraph(
    normalized,
    evidence.release_title,
    'This qualified manual Preview is a Standard Desktop update for users who need a temporary Latest before the next qualified Stable takes it back.',
  );
  normalized = prependPreviewHighlight(normalized);
  normalized = replaceTopLevelSection(normalized, '## Compatibility and action required', [
    '## Compatibility and action required',
    '- This qualified Preview may temporarily become Latest for updater users.',
    '- The next qualified Stable reclaims Latest; Preview does not publish Homebrew, Full, Native WebUI, Container WebUI, or the production WebUI follower handoff.',
  ].join('\n'));
  normalized = replaceTopLevelSection(normalized, '## Release scope', [
    '## Release scope',
    `- ${evidence.release_scope}`,
  ].join('\n'));
  return stripVisibleReleaseTitle(normalized, evidence).trimEnd();
}

function normalizeChinesePreviewNotes(markdown: string, evidence: ReleaseNotesEvidence) {
  let normalized = markdown.trim() || evidence.release_title;
  normalized = removeTopLevelSection(normalized, '## Install Stable');
  normalized = removeTopLevelSection(normalized, '## Preview publication');
  normalized = normalized.replaceAll(stableInstallCommand, '');
  normalized = replaceOpeningParagraph(
    normalized,
    evidence.release_title,
    '\u8fd9\u662f\u4e00\u4e2a\u7ecf\u9a8c\u8bc1\u7684\u624b\u5de5 Preview\uff0c\u7528\u4e8e\u5728\u4e0b\u4e00\u4e2a Stable \u4e4b\u524d\u5411\u66f4\u65b0\u7528\u6237\u63d0\u4f9b\u4e34\u65f6 Latest\u3002',
  );
  if (sectionBounds(normalized, '## Compatibility and action required')) {
    normalized = replaceTopLevelSection(normalized, '## Compatibility and action required', [
      '## Compatibility and action required',
      '- \u8fd9\u4e2a\u7ecf\u9a8c\u8bc1\u7684 Preview \u53ef\u4ee5\u4e34\u65f6\u6210\u4e3a\u66f4\u65b0\u7528\u6237\u7684 Latest\u3002',
      '- \u4e0b\u4e00\u4e2a\u7ecf\u9a8c\u8bc1\u7684 Stable \u4f1a\u6536\u56de Latest\uff1bPreview \u4e0d\u53d1\u5e03 Homebrew\u3001Full\u3001Native WebUI\u3001Container WebUI \u6216 production WebUI follower handoff\u3002',
    ].join('\n'));
  }
  if (sectionBounds(normalized, '## Release scope')) {
    normalized = replaceTopLevelSection(normalized, '## Release scope', [
      '## Release scope',
      '- \u4ec5\u53d1\u5e03\u7ecf\u9a8c\u8bc1\u7684\u624b\u5de5 Standard macOS arm64 Desktop Preview\uff0c\u53ef\u4ee5\u4e34\u65f6\u6210\u4e3a Latest\u3002',
    ].join('\n'));
  }
  return `${normalized.trimEnd()}\n\n## Preview publication\n\n- Preview \u53ef\u4ee5\u4e34\u65f6\u6210\u4e3a Latest\uff0c\u4e0b\u4e00\u4e2a\u7ecf\u9a8c\u8bc1\u7684 Stable \u4f1a\u81ea\u52a8\u6536\u56de Latest\u3002\n- Preview \u4e0d\u53d1\u5e03 Homebrew\u3001Full\u3001Native WebUI\u3001Container WebUI \u6216 production WebUI follower handoff\u3002`;
}

export function finalizePreviewReleaseNotesDocument(markdown: string, evidence: ReleaseNotesEvidence) {
  if (evidence.channel !== 'preview') {
    throw new Error('Preview release-note finalization requires channel=preview evidence.');
  }
  if (!markdown.includes(onlineAiReleaseNotesMarker)) {
    throw new Error('Preview release notes are not bound to the online AI writer.');
  }
  const visible = normalizeEnglishPreviewNotes(stripLocalizedReleaseNotes(markdown), evidence);
  const enUS = `${evidence.release_title}\n\n${visible}`;
  const zhCN = normalizeChinesePreviewNotes(extractLocalizedReleaseNotes(markdown, 'zh-CN'), evidence);
  const finalized = `${visible}\n\n<!-- OPL_RELEASE_NOTES:en-US\n${enUS}\n-->\n<!-- OPL_RELEASE_NOTES:zh-CN\n${zhCN}\n-->\n\n${onlineAiReleaseNotesMarker}\n`;
  const publicMarkdown = stripLocalizedReleaseNotes(finalized);
  for (const required of [
    'qualified manual Preview',
    'temporary Preview Latest pointer',
    'next qualified Stable reclaims Latest',
    'does not publish Homebrew, Full, Native WebUI, Container WebUI',
  ]) {
    if (!publicMarkdown.includes(required)) {
      throw new Error(`Preview release notes are missing required publication wording: ${required}`);
    }
  }
  if (/## Install Stable|--stable-macos-install|\bThis Stable release\b/i.test(finalized)) {
    throw new Error('Preview release notes retain forbidden Stable publication wording.');
  }
  if (!/Preview[\s\S]*Latest/.test(zhCN) || !/[\u3400-\u9fff]/.test(zhCN)) {
    throw new Error('Preview release notes are missing the localized temporary Latest explanation.');
  }
  if (!/Preview[\s\S]*Homebrew[\s\S]*Full[\s\S]*Native WebUI[\s\S]*Container WebUI/.test(zhCN)) {
    throw new Error('Preview release notes are missing the localized carrier exclusion boundary.');
  }
  return finalized;
}

export function buildReleaseNotesEvidence(options: ReleaseNoteOptions): ReleaseNotesEvidence {
  if (options.channel !== 'stable' && options.includeFullPackage) {
    throw new Error('Only Stable release notes may include Full first-install payloads.');
  }
  const fullPayloadAuthoritySha256 = options.fullPayloadAuthoritySha256?.trim() || null;
  if (fullPayloadAuthoritySha256 && !/^sha256:[0-9a-f]{64}$/.test(fullPayloadAuthoritySha256)) {
    throw new Error('Full payload authority digest must be an exact sha256 reference.');
  }
  if (!options.includeFullPackage && fullPayloadAuthoritySha256) {
    throw new Error('Standard-only release notes cannot bind a Full payload authority digest.');
  }
  const currentTag = normalizeTag(options.currentTag || options.version);
  if (options.channel === 'preview') {
    if (!/^v\d+\.\d+\.\d+-preview\.r[1-9]\d*$/.test(currentTag)) {
      throw new Error('Preview release notes require an exact vYY.M.D-preview.rN current tag.');
    }
    if (!options.previousTag) {
      throw new Error('Preview release notes require the exact current Latest predecessor tag.');
    }
  }
  const previousTag = resolvePreviousTag(options, currentTag);
  if (
    options.channel === 'preview'
    && (!previousTag || !/^v\d+\.\d+\.\d+(?:(?:-r[1-9]\d*)|(?:-preview\.r[1-9]\d*))?$/.test(previousTag))
  ) {
    throw new Error('Preview release notes predecessor must be an exact Stable or Preview Latest tag.');
  }
  const releaseRepo = options.releaseRepo || 'gaofeng21cn/one-person-lab-app';
  const appCurrentRef = options.currentAppRef || (gitRefExists(currentTag, process.cwd()) ? currentTag : 'HEAD');
  const appPreviousRef = options.previousAppRef || previousTag;
  const shellProfile = readActiveShellBuildProfile();
  const shellRoot = options.shellRoot || '';
  const previousShellRepository = readAppShellRepositoryAt(appPreviousRef);
  const shellTransition = previousShellRepository && previousShellRepository !== shellProfile.repository
    ? { previous_repository: previousShellRepository, current_repository: shellProfile.repository,
        summary: 'One Person Lab App replaces the AionUI application with the Studio DSH/Cordis Application Host, using native Codex sessions and Framework-owned runtime and Package state.' }
    : undefined;
  const shellPreviousRef = shellTransition ? null : resolvePreviousShellRef(shellRoot || null, options.previousShellRef, appPreviousRef);
  const shellCurrentRef = resolveShellRef(shellRoot || null, options.currentShellRef, appCurrentRef);
  const appSubjects = appPreviousRef
    ? collectCommitSubjects(process.cwd(), appPreviousRef, appCurrentRef)
    : collectCommitSubjects(process.cwd(), null, appCurrentRef, 40);
  const shellSubjects = shellRoot
    ? collectCommitSubjects(shellRoot, shellPreviousRef, shellCurrentRef)
    : [];
  const seen = new Set<string>();
  const subjects = [...shellSubjects, ...appSubjects].filter((subject) => {
    const key = normalizedSubject(subject);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  const buckets = summarizeChanges(subjects);
  const bundledVersions = options.includeFullPackage ? buildBundledVersionLines(options.fullPackageManifest) : [];
  const previousFullPackageManifest = options.previousFullPackageManifest
    || (options.channel === 'stable' && options.includeFullPackage && previousTag
      ? readRemoteFullPackageManifest(releaseRepo, previousTag)
      : null);
  const payloadUpdates = options.includeFullPackage
    ? buildPayloadUpdateLines(options.fullPackageManifest, previousFullPackageManifest)
    : [];
  const agentRuntimeChanges = options.includeFullPackage
    ? buildAgentRuntimeChanges(options.fullPackageManifest, previousFullPackageManifest)
    : [];
  const familyRepoChanges = mergeFamilyRepoChanges([
    ...buildAppAndShellRepoChanges({
      releaseRepo,
      previousTag,
      currentTag,
      appSubjects,
      shellSubjects,
      shellRepository: shellProfile.repository,
      shellLabel: shellProfile.id === 'opl-studio' ? 'OPL Studio' : 'OPL Aion Shell',
      shellPreviousRef,
      shellCurrentRef,
    }),
    ...(options.includeFullPackage
      ? buildFamilyRepoChanges(options.fullPackageManifest, previousFullPackageManifest)
      : []),
    ...buildDefaultFamilyRepoWindowChanges(options, previousTag),
  ]);
  appendAgentChangeSummary(buckets, Boolean(options.includeFullPackage));
  const oplPayloadLines = buildOplPayloadLines(options, bundledVersions, payloadUpdates);
  const releaseScope = options.channel === 'nightly'
    ? 'Standard macOS arm64 Nightly package and updater metadata; no Full first-install DMG in the Nightly channel.'
    : options.channel === 'preview'
      ? 'Qualified manual Standard macOS arm64 Desktop publication. It may temporarily become Latest; the next qualified Stable reclaims Latest. Preview does not publish Homebrew, Full, Native WebUI, Container WebUI, or a production WebUI follower handoff.'
      : options.includeFullPackage
        ? 'Standard macOS arm64 updater package plus Full first-install DMG.'
        : 'Standard macOS arm64 updater package is published for this release.';
  return {
    schema: 'opl_app_release_notes_evidence.v1',
    version: options.version,
    channel: options.channel,
    release_title: buildReleaseTitle(options.version),
    release_repo: releaseRepo,
    current_tag: currentTag,
    previous_tag: previousTag,
    shell_transition: shellTransition,
    app_commit_subjects: appSubjects,
    shell_commit_subjects: shellSubjects,
    grouped_changes: buckets,
    payload: {
      include_full_package: Boolean(options.includeFullPackage),
      full_payload_authority_sha256: fullPayloadAuthoritySha256,
      lines: oplPayloadLines,
      bundled_refs: bundledVersions,
      updates_since_previous_stable: payloadUpdates,
    },
    agent_runtime_changes: agentRuntimeChanges,
    family_repo_changes: familyRepoChanges,
    release_scope: releaseScope,
    install_command: options.channel === 'stable' ? stableInstallCommand : null,
    full_changelog_url: previousTag ? `https://github.com/${releaseRepo}/compare/${previousTag}...${currentTag}` : null,
  };
}

export function buildReleaseNotesDocument(options: ReleaseNoteOptions) {
  const evidence = buildReleaseNotesEvidence(options);
  const document = renderReleaseNotesDocument(evidence);
  if (evidence.channel !== 'preview') return document;

  return document
    .replace(
      'This Stable release is for users upgrading the standard One Person Lab App package. It focuses on keeping the built-in research, grant-writing, visual-deliverable, and agent-design entries ready to start.',
      'This qualified manual Preview is for users who need a temporary Standard Desktop update through Latest before the next Stable release.',
    )
    .replace(
      '- Upgrade the standard App package while keeping the built-in OPL session entries aligned.',
      '- Use the qualified Standard Desktop package through the temporary Preview Latest pointer.',
    )
    .replace(
      '- No manual migration is required beyond installing or upgrading this Stable release.',
      '- No manual migration is required beyond installing or upgrading this qualified Preview.',
    )
    .replace(
      '- The Full DMG is appended later to this same Stable release for fresh-machine installation with bundled runtime, Office, and document-intake payloads.',
      '- Preview publishes no Full or Homebrew carrier; use the current Stable paths when those carriers are required.',
    );
}
