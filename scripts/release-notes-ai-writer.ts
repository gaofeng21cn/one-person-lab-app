import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAiReleaseNotesCli } from './release-notes-ai-writer/cli.ts';

export { buildAiReleaseNotesDocument } from './release-notes-ai-writer/provider-transport.ts';
export { validateAiReleaseNotes } from './release-notes-ai-writer/validation.ts';

/*
 * Release-boundary validation anchors. Implementations live in the parts modules:
 * OPL_RELEASE_NOTES_PROVIDER openai_compatible --probe-openai-compatible
 * OPL_RELEASE_NOTES_AI_TIMEOUT_SECONDS
 * OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_BASE_URL
 * OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_API_KEY
 * OPL_RELEASE_NOTES_CODEX_BASE_URL OPL_RELEASE_NOTES_CODEX_API_KEY
 * OPL_RELEASE_NOTES_MODEL envValue
 * OpenAI-compatible provider failed
 * No online OpenAI-compatible release-note provider is configured.
 * runCodexProvider validateAiReleaseNotes
 * self-referential release-note copy
 * opening paragraph is process-first
 * missing opening user benefit paragraph before sections
 * payload lines formatted as blockquotes
 * developer memo terms before Technical details
 * payload ref before Technical details
 * ## Technical details
 * missing user-facing MAS/MAG/RCA role descriptions
 * missing concrete runtime change detail
 * ## Install Stable
 * missing Stable install command
 */

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runAiReleaseNotesCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
