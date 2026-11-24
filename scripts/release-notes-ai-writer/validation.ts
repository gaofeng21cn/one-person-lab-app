import type { ReleaseNotesEvidence } from '../release-notes.ts';
import {
  escapeRegExp,
  extractLocalizedReleaseNotes,
  publicMarkdownBeforeTechnicalDetails,
  stripLocalizedReleaseNotes,
  technicalDetailsOffset,
} from './markdown-normalization.ts';

const releaseNotesLocales = ['en-US', 'zh-CN'] as const;
const vaguePhrases = [
  'Strengthened package builds',
  'Updated the OPL App package with the current',
  'Refreshed user guidance',
  'Cleaned up tests',
  'Improved runtime and provider status visibility',
  'This Stable release focuses on changes since',
  'This Nightly prerelease focuses on changes since',
];

const processFirstPatterns = [
  /\brelease notes?\b/i,
  /\bCI\b/i,
  /\bworkflow\b/i,
  /\bworkflows\b/i,
  /\bcontract(?:s)?\b/i,
  /\bgate(?:d|s)?\b/i,
  /\bvalidation\b/i,
  /\bmachine-checkable\b/i,
  /\btelemetry\b/i,
];

const userWorkflowPattern = /\b(research|study|studies|grant|funding|visual deliverable|slides?|graphics?|document extraction|OCR|PDF|Office|first launch|first-run|clean install|new Full install|upgrade|ready to use|built-in OPL entries|agent surfaces|agent sessions?)\b/i;

const agentRolePatterns = [
  /\bMAS\b[\s\S]{0,160}\b(research|study|studies)\b/i,
  /\bMAG\b[\s\S]{0,160}\b(grant|funding)\b/i,
  /\bRCA\b[\s\S]{0,180}\b(visual[- ]deliverable|slides?|graphics?|report)\b/i,
];

const runtimeChangeDetailPatterns = [
  /\b(currentness|closeout|handoff|route[- ]back|blocker|redrive|paper)\b/i,
  /\b(progress[- ]first|owner payloads?|generated[- ]interface)\b/i,
  /\b(provider currentness|operator evidence)\b/i,
  /\b(work[- ]order|agent design|agent testing|Foundry)\b/i,
  /\b(runtime state|state\/action|provider liveness|supervision)\b/i,
];

const technicalDetailsHeadingPattern = /^## Technical details\b.*$/im;

const developerMemoTermPatterns = [
  ['refs', /\brefs?\b/i],
  ['SHA', /\bSHA(?:-[0-9]+)?\b/],
  ['cohort', /\bcohort\b/i],
  ['gate', /\bgate(?:d|s)?\b/i],
  ['workflow', /\bworkflows?\b/i],
  ['validation', /\bvalidation\b/i],
  ['release operator', /\brelease operator\b/i],
  ['owner receipt', /\bowner receipt\b/i],
  ['owner verdict', /\bowner verdict\b/i],
  ['release candidate', /\brelease candidate\b/i],
] as const;

function validateEnglishReleaseNotesMarkdown(markdown: string, evidence: ReleaseNotesEvidence) {
  const failures: string[] = [];
  const firstParagraph = markdown
    .split(/\n\s*\n/)
    .find((block) => !/^#?\s*One Person Lab\b/i.test(block.trim()))
    ?.trim() || '';
  if (/[\u3400-\u9fff]/.test(markdown)) {
    failures.push('contains Chinese text');
  }
  const firstLine = markdown.trimStart().split('\n', 1)[0]?.trim() || '';
  if (new RegExp(`^#?\\s*${escapeRegExp(evidence.release_title)}\\s*$`).test(firstLine)) {
    failures.push('repeats the GitHub Release name as the body title');
  }
  for (const required of ['## Highlights', '## What improved', '## Compatibility and action required', '## OPL agents and runtime payload', '## Release scope']) {
    if (!markdown.includes(required)) {
      failures.push(`missing ${required}`);
    }
  }
  if (evidence.channel === 'nightly' && !/Nightly standard package.*MAS, MAG, RCA, and OPL Meta Agent.*Codex plugin.*skill sync policy/i.test(markdown)) {
    failures.push('missing Nightly agent entry surface');
  }
  if (evidence.channel === 'stable') {
    if (!markdown.includes('## Install Stable')) {
      failures.push('missing Stable install section');
    }
    if (!evidence.install_command || !markdown.includes(evidence.install_command)) {
      failures.push('missing Stable install command');
    }
  }
  if (evidence.channel === 'nightly' && evidence.install_command && markdown.includes(evidence.install_command)) {
    failures.push('Nightly release notes include Stable install command');
  }
  if (evidence.payload.include_full_package && !/(?:Build-time payload refs|Packaged component refs):/.test(markdown)) {
    failures.push('missing Full payload refs');
  }
  if (evidence.payload.include_full_package && evidence.payload.updates_since_previous_stable.length > 0 && !/(?:Payload|Component) updates since previous Stable:/.test(markdown)) {
    failures.push('missing Full payload update summary');
  }
  const technicalOffset = technicalDetailsOffset(markdown);
  for (const ref of evidence.payload.bundled_refs) {
    if (!markdown.includes(ref)) {
      failures.push(`missing payload ref: ${ref}`);
    } else if (evidence.payload.include_full_package && technicalOffset < 0) {
      failures.push('payload refs missing Technical details section');
    } else if (evidence.payload.include_full_package && markdown.indexOf(ref) < technicalOffset) {
      failures.push(`payload ref before Technical details: ${ref}`);
    }
  }
  const payloadUpdatesOffset = Math.max(
    markdown.indexOf('Payload updates since previous Stable:'),
    markdown.indexOf('Component updates since previous Stable:'),
  );
  if (payloadUpdatesOffset >= 0 && technicalOffset >= 0 && payloadUpdatesOffset < technicalOffset) {
    failures.push('payload update summary before Technical details');
  }
  if (evidence.family_repo_changes?.length > 0) {
    if (!markdown.includes('## OPL family updates')) {
      failures.push('missing OPL family updates section');
    }
    for (const change of evidence.family_repo_changes) {
      if (!markdown.includes(change.label)) {
        failures.push(`missing OPL family repo change: ${change.label}`);
      }
    }
  }
  if (evidence.full_changelog_url && !markdown.includes(evidence.full_changelog_url)) {
    failures.push('missing Full Changelog link');
  }
  const vagueMatches = vaguePhrases.filter((phrase) => markdown.includes(phrase));
  if (vagueMatches.length > 0) {
    failures.push(`vague boilerplate: ${vagueMatches.join(', ')}`);
  }
  const userFacingMarkdown = publicMarkdownBeforeTechnicalDetails(markdown);
  if (/\brelease notes?\b/i.test(userFacingMarkdown) || /\brelease-note\b/i.test(userFacingMarkdown)) {
    failures.push('self-referential release-note copy');
  }
  if (/^##\s+/m.test(firstParagraph)) {
    failures.push('missing opening user benefit paragraph before sections');
  }
  if (/^>\s*-\s+/m.test(markdown)) {
    failures.push('payload lines formatted as blockquotes');
  }
  if (processFirstPatterns.some((pattern) => pattern.test(firstParagraph)) && !userWorkflowPattern.test(firstParagraph)) {
    failures.push('opening paragraph is process-first');
  }
  const preTechnicalMarkdown = publicMarkdownBeforeTechnicalDetails(markdown);
  const developerMemoTerms = developerMemoTermPatterns
    .filter(([, pattern]) => pattern.test(preTechnicalMarkdown))
    .map(([label]) => label);
  if (developerMemoTerms.length > 0) {
    failures.push(`developer memo terms before Technical details: ${developerMemoTerms.join(', ')}`);
  }
  if (!userWorkflowPattern.test(markdown)) {
    failures.push('missing concrete user impact');
  }
  if (!/(MAS|MAG|RCA)/.test(markdown)) {
    failures.push('missing OPL agent names');
  }
  if (evidence.agent_runtime_changes?.length > 0) {
    const changedLabels = new Set(evidence.agent_runtime_changes.map((change) => change.label));
    for (const label of ['MAS', 'MAG', 'RCA']) {
      if (changedLabels.has(label) && !new RegExp(`\\b${label}\\b`).test(markdown)) {
        failures.push(`missing changed agent: ${label}`);
      }
    }
    const roleFailures = agentRolePatterns
      .filter((pattern) => !pattern.test(markdown))
      .map((pattern) => String(pattern));
    if (['MAS', 'MAG', 'RCA'].every((label) => changedLabels.has(label)) && roleFailures.length > 0) {
      failures.push('missing user-facing MAS/MAG/RCA role descriptions');
    }
    const hasConcreteHints = evidence.agent_runtime_changes.some((change: any) => Boolean(change.change_summary_hint) || change.change_subjects?.length > 0);
    if (hasConcreteHints && !runtimeChangeDetailPatterns.some((pattern) => pattern.test(markdown))) {
      failures.push('missing concrete runtime change detail');
    }
  }
  if (failures.length > 0) {
    throw new Error(`AI release notes failed quality gate: ${failures.join('; ')}`);
  }
}

function validateLocalizedReleaseNotes(markdown: string, evidence: ReleaseNotesEvidence) {
  const failures: string[] = [];
  for (const locale of releaseNotesLocales) {
    const localized = extractLocalizedReleaseNotes(markdown, locale);
    if (!localized) {
      failures.push(`missing localized ${locale} block`);
      continue;
    }
    if (!new RegExp(`^#?\\s*${escapeRegExp(evidence.release_title)}(?:\\s|$)`).test(localized)) {
      failures.push(`localized ${locale} block missing release title`);
    }
    if (locale === 'en-US' && /[\u3400-\u9fff]/.test(localized)) {
      failures.push('localized en-US block contains Chinese text');
    }
    if (locale === 'zh-CN' && !/[\u3400-\u9fff]/.test(localized)) {
      failures.push('localized zh-CN block does not contain Chinese text');
    }
    if (locale === 'zh-CN' && /(MAS|MAG|RCA)/.test(stripLocalizedReleaseNotes(markdown)) && !/(MAS|MAG|RCA)/.test(localized)) {
      failures.push('localized zh-CN block missing OPL agent names');
    }
  }
  if (failures.length > 0) {
    throw new Error(`AI release notes failed localization gate: ${failures.join('; ')}`);
  }
}

export function validateAiReleaseNotes(markdown: string, evidence: ReleaseNotesEvidence) {
  validateEnglishReleaseNotesMarkdown(stripLocalizedReleaseNotes(markdown), evidence);
  validateLocalizedReleaseNotes(markdown, evidence);
}
