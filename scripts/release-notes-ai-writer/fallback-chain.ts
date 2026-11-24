import type { ReleaseNotesEvidence } from '../release-notes/types.ts';
import { writeWithReleaseNoteFallback, type WriterOptions } from '../release-note-writer-chain.ts';
import { buildAiReleaseNotesPrompt } from './evidence-shaping.ts';
import { extractMarkdown, extractLocalizedReleaseNotes, stripLocalizedReleaseNotes, stripVisibleReleaseTitle } from './markdown-normalization.ts';
import { markAiGeneratedReleaseNotes } from './provider-transport.ts';
import { buildMechanicalReleaseNotes, mechanicalNotesMarker, validateMechanicalReleaseNotes } from './mechanical.ts';

/** Guard format and exact supplied facts; do not synthesize improvement claims from categories. */
function bindGeneratedFacts(content: string, evidence: ReleaseNotesEvidence) {
  const markdown = extractMarkdown(content);
  const en = extractLocalizedReleaseNotes(markdown, 'en-US');
  const zh = extractLocalizedReleaseNotes(markdown, 'zh-CN');
  if (!en?.startsWith(evidence.release_title) || !zh?.startsWith(evidence.release_title)
    || /[\u3400-\u9fff]/.test(en) || !/[\u3400-\u9fff]/.test(zh)) {
    throw new Error('Writer response lacks valid locale blocks.');
  }
  let visible = stripVisibleReleaseTitle(stripLocalizedReleaseNotes(markdown), evidence).trimEnd();
  if (!visible || /[\u3400-\u9fff]/.test(visible)) throw new Error('Invalid public writer language.');
  if (evidence.install_command && !visible.includes(evidence.install_command)) {
    visible += `\n\n## Install Stable\n\n\`${evidence.install_command}\`\n`;
  }
  if (!visible.includes(evidence.release_scope)) visible += `\n\n## Release scope\n\n- ${evidence.release_scope}\n`;
  const facts = [...evidence.payload.lines, ...(evidence.full_changelog_url ? [evidence.full_changelog_url] : [])]
    .filter((fact) => !visible.includes(fact));
  if (facts.length) visible += '\n\n## Technical details\n\n' + facts.join('\n');
  return `${visible}\n\n<!-- OPL_RELEASE_NOTES:en-US\n${evidence.release_title}\n\n${visible}\n-->\n<!-- OPL_RELEASE_NOTES:zh-CN\n${zh}\n-->\n`;
}

export function validatePreparedReleaseNotes(notes: string, evidence: ReleaseNotesEvidence) {
  if (notes.includes(mechanicalNotesMarker)) validateMechanicalReleaseNotes(notes, evidence);
  else {
    const visible = stripLocalizedReleaseNotes(notes);
    const en = extractLocalizedReleaseNotes(notes, 'en-US');
    const zh = extractLocalizedReleaseNotes(notes, 'zh-CN');
    if (!visible.trim() || /[\u3400-\u9fff]/.test(visible) || !en?.startsWith(evidence.release_title)
      || /[\u3400-\u9fff]/.test(en) || !zh?.startsWith(evidence.release_title) || !/[\u3400-\u9fff]/.test(zh)
      || (evidence.install_command && !visible.includes(evidence.install_command))
      || !visible.includes(evidence.release_scope) || evidence.payload.lines.some((line) => !visible.includes(line))
      || (evidence.full_changelog_url && !visible.includes(evidence.full_changelog_url))) {
      throw new Error('Prepared release notes lack exact disclosure or valid locale blocks.');
    }
  }
}
export async function buildFallbackReleaseNotes(evidence: ReleaseNotesEvidence, options: WriterOptions = {}) {
  const result = await writeWithReleaseNoteFallback(buildAiReleaseNotesPrompt(evidence), (content) => {
    if (content.includes(mechanicalNotesMarker)) throw new Error('Model output uses reserved provenance.');
    const notes = markAiGeneratedReleaseNotes(bindGeneratedFacts(content, evidence));
    validatePreparedReleaseNotes(notes, evidence);
    return notes;
  }, () => buildMechanicalReleaseNotes(evidence), options);
  validatePreparedReleaseNotes(result.value, evidence);
  return { notes: result.value, writer: result.writer };
}
