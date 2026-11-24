import type { ReleaseNotesEvidence } from '../release-notes.ts';
import { compactArray } from './evidence-shaping.ts';

type ReleaseNotesLocale = 'en-US' | 'zh-CN';

const technicalDetailsHeadingPattern = /^## Technical details\b.*$/im;

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function extractLocalizedReleaseNotes(markdown: string, locale: ReleaseNotesLocale) {
  const escapedLocale = escapeRegExp(locale);
  const hiddenBlock = markdown.match(
    new RegExp(`<!--\\s*OPL_RELEASE_NOTES:${escapedLocale}\\s*\\n([\\s\\S]*?)\\n?-->`, 'i')
  );
  if (hiddenBlock?.[1]?.trim()) {
    return `${hiddenBlock[1].trimEnd()}\n`;
  }

  const visibleBlock = markdown.match(
    new RegExp(
      `<!--\\s*OPL_RELEASE_NOTES:${escapedLocale}\\s*-->\\s*([\\s\\S]*?)\\s*<!--\\s*/OPL_RELEASE_NOTES:${escapedLocale}\\s*-->`,
      'i'
    )
  );
  if (visibleBlock?.[1]?.trim()) {
    return `${visibleBlock[1].trimEnd()}\n`;
  }
  return '';
}

export function stripLocalizedReleaseNotes(markdown: string) {
  return `${markdown
    .replace(/<!--\s*OPL_RELEASE_NOTES:[A-Za-z-]+\s*\n[\s\S]*?\n?-->\s*/g, '')
    .replace(/<!--\s*OPL_RELEASE_NOTES:[A-Za-z-]+\s*-->[\s\S]*?<!--\s*\/OPL_RELEASE_NOTES:[A-Za-z-]+\s*-->\s*/g, '')
    .replace(/<!--\s*OPL_RELEASE_NOTES:[A-Za-z-]+\s*-->\s*/g, '')
    .trimEnd()}\n`;
}

export function technicalDetailsOffset(markdown: string) {
  const match = technicalDetailsHeadingPattern.exec(markdown);
  return match ? match.index : -1;
}

export function publicMarkdownBeforeTechnicalDetails(markdown: string) {
  const offset = technicalDetailsOffset(markdown);
  return offset >= 0 ? markdown.slice(0, offset) : markdown;
}

export function extractMarkdown(stdout: string) {
  const trimmed = stdout.trim();
  const fenced = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
  return `${(fenced ? fenced[1] : trimmed).trimEnd()}\n`;
}

function buildFallbackZhCNReleaseNotes(visibleMarkdown: string, evidence: ReleaseNotesEvidence) {
  const source = evidence as any;
  const stableAction = source.channel === 'stable' && source.install_command
    ? `\n\n## 安装 Stable\n\n运行 \`${source.install_command}\``
    : '';
  return [
    source.release_title,
    '',
    '本次更新面向普通 One Person Lab App 用户，重点是让首次启动、App 就绪检查和内置 OPL 会话入口更清楚。',
    '',
    '## 改进内容',
    '',
    '- MAS 支持研究和 study 会话。',
    '- MAG 支持基金写作和资助材料会话。',
    '- RCA 支持可视化交付物、幻灯片和报告图形。',
    '- OPL Meta Agent 支持 agent 设计和改进。',
    stableAction,
    '',
    '## 发布范围',
    '',
    visibleMarkdown.includes('Full first-install')
      ? '标准 macOS arm64 更新包，以及 Full 首次安装 DMG。'
      : '标准 macOS arm64 更新包。',
  ].join('\n');
}

function localizedBlockHasReleaseTitle(markdown: string, evidence: ReleaseNotesEvidence) {
  return new RegExp(`^#?\\s*${escapeRegExp(evidence.release_title)}(?:\\s|$)`).test(markdown);
}

export function stripVisibleReleaseTitle(markdown: string, evidence: ReleaseNotesEvidence) {
  const lines = markdown.trimStart().split('\n');
  const titleLine = new RegExp(`^#?\\s*${escapeRegExp(evidence.release_title)}\\s*$`);
  if (!titleLine.test(lines[0]?.trim() || '')) {
    return `${markdown.trimEnd()}\n`;
  }
  lines.shift();
  while (lines[0] !== undefined && !lines[0]!.trim()) lines.shift();
  return `${lines.join('\n').trimEnd()}\n`;
}

function restoreLocalizedBlocks(visibleMarkdown: string, originalMarkdown: string, evidence: ReleaseNotesEvidence) {
  const extractedEnUS = extractLocalizedReleaseNotes(originalMarkdown, 'en-US');
  const enUS = extractedEnUS && localizedBlockHasReleaseTitle(extractedEnUS, evidence)
    ? extractedEnUS
    : ensureReleaseTitle(visibleMarkdown, evidence);
  let zhCN = extractLocalizedReleaseNotes(originalMarkdown, 'zh-CN');
  if (!zhCN || !localizedBlockHasReleaseTitle(zhCN, evidence)) {
    zhCN = buildFallbackZhCNReleaseNotes(visibleMarkdown, evidence);
  }
  if (/(MAS|MAG|RCA)/.test(visibleMarkdown) && !/(MAS|MAG|RCA)/.test(zhCN)) {
    zhCN = `${zhCN.trimEnd()}\n\n本次更新覆盖 MAS、MAG 和 RCA 的 App 入口与相关使用场景。\n`;
  }
  return `${visibleMarkdown.trimEnd()}

<!-- OPL_RELEASE_NOTES:en-US
${enUS.trimEnd()}
-->
<!-- OPL_RELEASE_NOTES:zh-CN
${zhCN.trimEnd()}
-->
`;
}

function stripChineseLines(markdown: string) {
  return markdown
    .split('\n')
    .filter((line) => !/[\u3400-\u9fff]/.test(line))
    .join('\n');
}

function replaceReleaseNoteTerms(markdown: string) {
  return markdown
    .replace(/\brelease notes?\b/gi, 'update summary')
    .replace(/\brelease-note\b/gi, 'update');
}

function sanitizePublicDeveloperTerms(markdown: string) {
  return replaceReleaseNoteTerms(stripChineseLines(markdown))
    .replace(/\bworkflows?\b/gi, 'sessions')
    .replace(/\bvalidation\b/gi, 'checks')
    .replace(/\bgates?\b/gi, 'checks')
    .replace(/\brefs?\b/gi, 'details')
    .replace(/\bSHA(?:-[0-9]+)?\b/g, 'version detail')
    .replace(/\bcohort\b/gi, 'release')
    .replace(/\brelease operator\b/gi, 'release process')
    .replace(/\bowner receipt\b/gi, 'approval record')
    .replace(/\bowner verdict\b/gi, 'approval decision')
    .replace(/\brelease candidate\b/gi, 'release build');
}

function sanitizeTechnicalTailTerms(markdown: string) {
  return replaceReleaseNoteTerms(stripChineseLines(markdown));
}

function sanitizePreTechnicalDeveloperTerms(visibleMarkdown: string) {
  const offset = technicalDetailsOffset(visibleMarkdown);
  if (offset < 0) {
    return sanitizePublicDeveloperTerms(visibleMarkdown);
  }
  const before = sanitizePublicDeveloperTerms(visibleMarkdown.slice(0, offset));
  const after = sanitizeTechnicalTailTerms(visibleMarkdown.slice(offset));
  return `${before}${after}`;
}

function removePayloadEvidenceBeforeTechnical(visibleMarkdown: string, evidence: ReleaseNotesEvidence) {
  const offset = technicalDetailsOffset(visibleMarkdown);
  if (offset < 0) {
    return visibleMarkdown;
  }
  const source = evidence as any;
  const payloadRefs = compactArray<string>(source.payload?.bundled_refs, 24);
  const payloadUpdates = compactArray<string>(source.payload?.updates_since_previous_stable, 24);
  const before = visibleMarkdown
    .slice(0, offset)
    .split('\n')
    .filter((line) => !payloadRefs.some((ref: string) => line.includes(ref)))
    .filter((line) => !payloadUpdates.some((update: string) => line.includes(update)))
    .join('\n')
    .trimEnd();
  return `${before}\n\n${visibleMarkdown.slice(offset).trimStart()}`;
}

function appendSectionIfMissing(markdown: string, heading: string, section: string) {
  if (markdown.includes(heading)) {
    return markdown;
  }
  return `${markdown.trimEnd()}\n\n${section.trimEnd()}\n`;
}

function insertSectionBeforeTechnicalIfMissing(markdown: string, heading: string, section: string) {
  if (!section || markdown.includes(heading)) {
    return markdown;
  }
  const offset = technicalDetailsOffset(markdown);
  if (offset < 0) {
    return appendSectionIfMissing(markdown, heading, section);
  }
  const before = markdown.slice(0, offset).trimEnd();
  const after = markdown.slice(offset).trimStart();
  return `${before}\n\n${section.trimEnd()}\n\n${after}`;
}

function insertSectionBeforeHeadingIfMissing(markdown: string, heading: string, beforeHeading: string, section: string) {
  if (!section || markdown.includes(heading)) {
    return markdown;
  }
  const offset = markdown.indexOf(`\n${beforeHeading}`);
  if (offset < 0) {
    return insertSectionBeforeTechnicalIfMissing(markdown, heading, section);
  }
  const before = markdown.slice(0, offset).trimEnd();
  const after = markdown.slice(offset).trimStart();
  return `${before}\n\n${section.trimEnd()}\n\n${after}`;
}

function formatFamilyUpdate(change: any) {
  const subjects = compactArray(change.change_subjects, 3);
  const subjectText = subjects.length > 0 ? ` Highlights include ${subjects.join('; ')}.` : '';
  const summary = change.change_summary_hint || `${change.label} changed since the previous release.`;
  const count = Number.isFinite(change.commit_count) ? `${change.commit_count} commits. ` : '';
  const compare = change.compare_url ? ` [Compare changes](${change.compare_url})` : '';
  return `- ${change.label}: ${count}${summary}${subjectText}${compare}`;
}

function buildHighlightsSection(evidence: ReleaseNotesEvidence) {
  const source = evidence as any;
  const groupedBullets = compactArray(source.grouped_changes, 4)
    .flatMap((group: any) => compactArray<string>(group.bullets, 1))
    .filter(Boolean);
  const fullPackage = source.payload?.include_full_package
    ? 'Full first-install users get the App plus bundled research, grant, visual, Office, and document-intake tools from one Stable package.'
    : 'Standard App users get refreshed built-in OPL entries for MAS, MAG, RCA, and OPL Meta Agent sessions.';
  const bullets = [
    fullPackage,
    ...groupedBullets,
  ].slice(0, 4);
  return [
    '## Highlights',
    '',
    ...bullets.map((bullet: string) => `- ${bullet}`),
  ].join('\n');
}

function buildWhatImprovedSection(evidence: ReleaseNotesEvidence) {
  const source = evidence as any;
  const bullets = compactArray(source.grouped_changes, 6)
    .flatMap((group: any) => compactArray<string>(group.bullets, 2))
    .filter(Boolean);
  const fallback = [
    'Users can start OPL App sessions with clearer setup, readiness, and built-in agent entry points.',
  ];
  return [
    '## What improved',
    '',
    ...(bullets.length > 0 ? bullets : fallback).map((bullet: string) => `- ${bullet}`),
  ].join('\n');
}

function buildCompatibilitySection(evidence: ReleaseNotesEvidence) {
  const source = evidence as any;
  const bullets = source.channel === 'nightly'
    ? [
      'Nightly builds are for trying the standard App package before Stable.',
      'Use the Stable channel when you need the Full first-install package.',
    ]
    : source.payload?.include_full_package
      ? [
        'No manual migration is required beyond installing or upgrading this Stable release.',
        'Use the Full first-install package for a fresh machine that needs bundled OPL family tools.',
      ]
      : [
        'No manual migration is required beyond installing or upgrading this Stable release.',
        'The Full DMG is appended later to this same Stable release for fresh-machine installation with bundled runtime, Office, and document-intake payloads.',
      ];
  return [
    '## Compatibility and action required',
    '',
    ...bullets.map((bullet: string) => `- ${bullet}`),
  ].join('\n');
}

function buildOpeningBenefitParagraph(evidence: ReleaseNotesEvidence) {
  const source = evidence as any;
  const installAction = source.channel === 'nightly' ? 'try the Nightly package' : 'install or upgrade One Person Lab App';
  return `Users can ${installAction} and open MAS research, MAG grant-writing, RCA visual deliverable, and OPL Meta Agent sessions with clearer setup and built-in OPL entries.`;
}

function ensureOpeningBenefitParagraph(markdown: string, evidence: ReleaseNotesEvidence) {
  const lines = markdown.trimEnd().split('\n');
  const titleIndex = lines.findIndex((line) => new RegExp(`^#?\\s*${escapeRegExp(evidence.release_title)}(?:\\s|$)`).test(line.trim()));
  if (titleIndex < 0) {
    return markdown;
  }
  const nextContentIndex = lines.findIndex((line, index) => index > titleIndex && line.trim());
  if (nextContentIndex < 0 || /^##\s+/.test(lines[nextContentIndex].trim())) {
    lines.splice(titleIndex + 1, 0, '', buildOpeningBenefitParagraph(evidence));
    return `${lines.join('\n').trimEnd()}\n`;
  }
  return markdown;
}

function ensureReleaseTitle(markdown: string, evidence: ReleaseNotesEvidence) {
  const titlePattern = new RegExp(`^#?\\s*${escapeRegExp(evidence.release_title)}(?:\\s|$)`);
  const trimmed = markdown.trimStart();
  if (titlePattern.test(trimmed)) {
    return markdown;
  }
  return `${evidence.release_title}${trimmed ? `\n\n${trimmed}` : '\n'}`;
}

function removeAiProcessPreamble(markdown: string, evidence: ReleaseNotesEvidence) {
  const title = escapeRegExp(evidence.release_title);
  const processPreamble = new RegExp(
    `^\\s*(?:I['’]m|I am)\\b[\\s\\S]{0,700}?${title}`,
    'i',
  );
  const processLine = /\b(?:I['’]m|I am)\b.*\b(?:evidence|update summary|release notes?|technical tail|sections?|requested|user-facing)\b/i;
  const titleLine = new RegExp(`^#?\\s*${title}(?:\\s|$)`);
  const normalized = markdown.replace(processPreamble, evidence.release_title);
  let sawTitle = false;
  return normalized
    .split('\n')
    .filter((line) => !processLine.test(line.trim()))
    .filter((line) => {
      if (!titleLine.test(line.trim())) {
        return true;
      }
      if (!sawTitle) {
        sawTitle = true;
        return true;
      }
      return false;
    })
    .join('\n');
}

function buildInstallSection(evidence: ReleaseNotesEvidence) {
  const source = evidence as any;
  if (source.channel !== 'stable' || !source.install_command) {
    return '';
  }
  return [
    '## Install Stable',
    '',
    `\`${source.install_command}\``,
  ].join('\n');
}

function buildPayloadSection(evidence: ReleaseNotesEvidence) {
  const source = evidence as any;
  const roleBullets = compactArray(source.agent_runtime_changes, 12)
    .map((change: any) => `- ${change.label}: ${change.user_value_hint || change.role || 'Supports App-managed OPL work.'}`);
  const bullets = roleBullets;
  return [
    '## OPL agents and runtime payload',
    '',
    ...(bullets.length > 0 ? bullets : [
      '- Standard package: App-managed MAS, MAG, RCA, and OPL Meta Agent entry surface plus Codex plugin and skill sync policy.',
    ]),
  ].join('\n');
}

function buildFamilyUpdatesSection(evidence: ReleaseNotesEvidence) {
  const source = evidence as any;
  const changes = compactArray(source.family_repo_changes, 12);
  if (changes.length === 0) {
    return '';
  }
  return [
    '## OPL family updates',
    '',
    ...changes.map(formatFamilyUpdate),
  ].join('\n');
}

function buildReleaseScopeSection(evidence: ReleaseNotesEvidence) {
  const source = evidence as any;
  const scope = source.channel === 'nightly'
    ? 'Standard macOS arm64 Nightly package and updater metadata; no Full first-install DMG in the Nightly channel.'
    : source.payload?.include_full_package
      ? 'Standard macOS arm64 updater package plus Full first-install DMG.'
      : 'Standard macOS arm64 updater package.';
  return [
    '## Release scope',
    '',
    `- ${scope}`,
  ].join('\n');
}

function buildTechnicalDetailsSection(evidence: ReleaseNotesEvidence) {
  const source = evidence as any;
  const payloadLines = compactArray<string>(source.payload?.lines, 12);
  const lines = [
    '## Technical details',
    '',
    'These details support release audit and package traceability; ordinary users should not need them for install or upgrade decisions.',
  ];
  if (payloadLines.length > 0) {
    lines.push('', ...payloadLines);
  }
  const familyUpdates = buildFamilyUpdatesSection(evidence);
  if (familyUpdates) {
    lines.push('', familyUpdates);
  }
  if (source.full_changelog_url) {
    lines.push('', `Full Changelog: ${source.full_changelog_url}`);
  }
  return lines.join('\n');
}

export function completeAiReleaseNotesWithEvidence(markdown: string, evidence: ReleaseNotesEvidence) {
  let visible = stripLocalizedReleaseNotes(markdown).trimEnd();
  visible = sanitizePreTechnicalDeveloperTerms(visible);
  visible = removePayloadEvidenceBeforeTechnical(visible, evidence);
  visible = removeAiProcessPreamble(visible, evidence);
  visible = ensureReleaseTitle(visible, evidence);
  visible = ensureOpeningBenefitParagraph(visible, evidence);
  visible = insertSectionBeforeHeadingIfMissing(visible, '## Highlights', '## What improved', buildHighlightsSection(evidence));
  visible = insertSectionBeforeTechnicalIfMissing(visible, '## What improved', buildWhatImprovedSection(evidence));
  const installSection = buildInstallSection(evidence);
  if (installSection) {
    visible = insertSectionBeforeTechnicalIfMissing(visible, '## Install Stable', installSection);
  }
  visible = insertSectionBeforeTechnicalIfMissing(visible, '## OPL agents and runtime payload', buildPayloadSection(evidence));
  visible = insertSectionBeforeTechnicalIfMissing(visible, '## OPL family updates', buildFamilyUpdatesSection(evidence));
  visible = insertSectionBeforeTechnicalIfMissing(visible, '## Release scope', buildReleaseScopeSection(evidence));
  visible = insertSectionBeforeTechnicalIfMissing(visible, '## Compatibility and action required', buildCompatibilitySection(evidence));
  const technical = technicalDetailsOffset(visible);
  if (technical < 0) {
    visible = `${visible.trimEnd()}\n\n${buildTechnicalDetailsSection(evidence)}`;
  } else {
    const beforeTechnical = visible.slice(0, technical).trimEnd();
    const afterTechnical = visible.slice(technical).trimEnd();
    visible = `${beforeTechnical}\n\n${afterTechnical}`;
  }
  const source = evidence as any;
  for (const line of compactArray<string>(source.payload?.lines, 12)) {
    if (!visible.includes(line)) {
      visible = `${visible.trimEnd()}\n${line}`;
    }
  }
  if (source.full_changelog_url && !visible.includes(source.full_changelog_url)) {
    visible = `${visible.trimEnd()}\n\nFull Changelog: ${source.full_changelog_url}`;
  }
  // Evidence-backed fallback sections are inserted after the first cleanup pass.
  // Normalize the complete public document so those sections cannot reintroduce
  // maintainer-only wording before the technical boundary.
  visible = sanitizePreTechnicalDeveloperTerms(visible);
  return restoreLocalizedBlocks(stripVisibleReleaseTitle(visible, evidence), markdown, evidence);
}
