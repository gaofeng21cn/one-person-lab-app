import fs from 'node:fs';
import path from 'node:path';
import { releaseBoundaryChecksForProfile } from '../release-checks.ts';

export const workflowMutationCommandPattern = /gh\s+api\s+(?:--method(?:=|\s+)|-X(?:=|\s*)?)(?:POST|PATCH|PUT|DELETE)\b|gh\s+workflow\s+run|gh\s+run\s+(?:cancel|rerun)|gh\s+release\s+(?:create|edit|upload|delete)|git\b[^\n]*\s(?:push|tag)\b|\bopl\s+release\s+(?:freeze|operation\s+admit|build|verify|publish|reconcile)\b|publish-(?:release|full-addon)\.ts|cleanup-draft-release-candidates\.ts|curl\b[^\n]*(?:--request|-X)\s*(?:POST|PATCH|PUT|DELETE)/;
export const retiredLiveAuthorityPattern = /release[_ -]broker|verify-release-broker|verify-release-session-lease|release_attempt_id|release_mutation_payload_sha256|pre_api_admission_receipt_base64|release[_ -]session[_ -]lease/i;

export function standardUpdaterOrLatest(text: string): boolean {
  return text.includes('uses: ./.github/workflows/opl-updater-upgrade-vm.yml') ||
    /^\s*activate-latest:/m.test(text) ||
    /--latest(?:\s+|=)(?:true|1)/.test(text);
}

export function runReleaseBoundaryTextChecks(appRoot: string): number {
  let failures = 0;

  for (const check of releaseBoundaryChecksForProfile()) {
    const files = check.files ?? [check.file];
    if (check.retired) {
      if (files.some((file) => fs.existsSync(path.join(appRoot, file)))) {
        console.error(`FAIL ${check.id}: ${check.file} is retired and must not exist`);
        failures += 1;
      }
      continue;
    }
    const missingFiles = files.filter((file) => !fs.existsSync(path.join(appRoot, file)));
    if (missingFiles.length > 0) {
      for (const file of missingFiles) {
        console.error(`FAIL ${check.id}: missing ${file}`);
        failures += 1;
      }
      continue;
    }
    const text = files
      .map((file) => fs.readFileSync(path.join(appRoot, file), 'utf8'))
      .join('\n');
    const displayFiles = files.join(', ');
    for (const needle of check.required ?? []) {
      if (!text.includes(needle)) {
        console.error(`FAIL ${check.id}: ${displayFiles} missing ${needle}`);
        failures += 1;
      }
    }
    for (const needle of check.forbidden ?? []) {
      if (text.includes(needle)) {
        console.error(`FAIL ${check.id}: ${displayFiles} still contains ${needle}`);
        failures += 1;
      }
    }
  }

  return failures;
}
