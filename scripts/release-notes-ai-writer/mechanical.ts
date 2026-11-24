import type { ReleaseNotesEvidence } from '../release-notes.ts';
import { extractLocalizedReleaseNotes, stripLocalizedReleaseNotes } from './markdown-normalization.ts';

export const mechanicalNotesMarker = '<!-- OPL_RELEASE_NOTES_GENERATOR:mechanical -->';
const english = (value: string) => !/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(value);
const inline = (value: string) => value.replace(/\s+/g, ' ').replaceAll('<', '&lt;').replaceAll('>', '&gt;').trim();

/** Record exact supplied facts, never infer improvement or migration safety from commit keywords. */
export function buildMechanicalReleaseNotes(evidence: ReleaseNotesEvidence): string {
  const changes = [...new Set([...evidence.app_commit_subjects, ...evidence.shell_commit_subjects])];
  const visible = [
    'This update packages the changes listed below. Review the recorded changes and installation instructions before upgrading.', '',
    '## Highlights', '- The comparison links below identify the recorded changes in this update.', '',
    '## What improved', '- Automatically written prose is unavailable. Original change records are provided in Technical details without inferred feature or performance claims.', '',
    ...(evidence.install_command ? ['## Install Stable', `\`${evidence.install_command}\``, ''] : []),
    '## Compatibility and action required', '- No migration or backward-compatibility guarantee is inferred from commit records. Follow the installation instructions and review the linked changes.', '',
    '## Release scope', `- ${evidence.release_scope}`, '',
    '## Technical details', ...changes.filter(english).map((value) => '- ' + inline(value)), '',
    '## OPL agents and runtime payload', ...evidence.payload.lines.filter(english), '',
    ...(evidence.family_repo_changes.length ? ['## OPL family updates', ...evidence.family_repo_changes.flatMap((change) => [
      `- ${inline(change.label)}${change.compare_url ? ': [Compare changes](' + change.compare_url + ')' : ''}`,
      ...change.change_subjects.filter(english).map((value) => '  - ' + inline(value)),
    ])] : []),
    ...(evidence.full_changelog_url ? [`Full Changelog: ${evidence.full_changelog_url}`] : []),
  ].join('\n').trimEnd();
  const zh = [evidence.release_title, '',
    '本版收录以下变更。自动文字整理不可用；原始记录不构成功能、性能、迁移安全或兼容性承诺。', '',
    '## 安装与升级', ...(evidence.install_command ? [`\`${evidence.install_command}\``] : []),
    '升级前请核对项目安装说明与变更链接。', '',
    '## 变更记录', ...changes.map((value) => '- ' + inline(value)), '',
    '## 发布范围', evidence.release_scope, '',
    '## 软件包与能力', ...evidence.payload.lines.map(inline),
    ...evidence.family_repo_changes.map((change) => `- ${inline(change.label)}${change.compare_url ? ': ' + change.compare_url : ''}`),
    ...(evidence.full_changelog_url ? [evidence.full_changelog_url] : []),
  ].join('\n');
  return `${visible}\n\n<!-- OPL_RELEASE_NOTES:en-US\n${evidence.release_title}\n\n${visible}\n-->\n<!-- OPL_RELEASE_NOTES:zh-CN\n${zh}\n-->\n\n${mechanicalNotesMarker}\n`;
}

export function validateMechanicalReleaseNotes(notes: string, evidence: ReleaseNotesEvidence): void {
  const visible = stripLocalizedReleaseNotes(notes);
  const en = extractLocalizedReleaseNotes(notes, 'en-US');
  const zh = extractLocalizedReleaseNotes(notes, 'zh-CN');
  if (!notes.includes(mechanicalNotesMarker) || !english(visible) || !en?.startsWith(evidence.release_title)
    || !zh?.startsWith(evidence.release_title) || (evidence.install_command && !visible.includes(evidence.install_command))
    || !visible.includes(evidence.release_scope)
    || evidence.payload.lines.filter(english).some((line) => !visible.includes(line))
    || (evidence.full_changelog_url && !visible.includes(evidence.full_changelog_url))) {
    throw new Error('Mechanical release notes lack exact disclosure or localization facts.');
  }
}
