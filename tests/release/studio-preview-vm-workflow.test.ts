import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const source = fs.readFileSync(path.join(root, '.github/workflows/opl-studio-preview-vm.yml'), 'utf8');
const workflow = parseYaml(source) as Record<string, any>;

test('Studio Preview VM qualification owns two clean public-asset profiles without release mutation', () => {
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.deepEqual(Object.keys(workflow.jobs), ['validate-inputs', 'qualify', 'summarize']);
  assert.deepEqual(workflow.jobs.qualify.strategy.matrix.profile, ['standard', 'full']);
  assert.equal(workflow.jobs.qualify.strategy['max-parallel'], 1);
  assert.deepEqual(workflow.jobs.qualify['runs-on'], ['self-hosted', 'macOS', 'ARM64', 'opl-cert-mac-tart']);
  assert.equal(workflow.jobs.qualify.environment, 'release-stable');
  assert.equal(workflow.jobs.qualify.steps[0].with.repository, 'gaofeng21cn/opl-studio');
  assert.equal(workflow.jobs.qualify.steps[0].with.ref, '${{ needs.validate-inputs.outputs.verification_source_sha }}');
  assert.equal(workflow.jobs.summarize.if, '${{ always() }}');
  assert.doesNotMatch(source, /contents:\s*write|packages:\s*write|gh release (?:create|upload|edit|delete)|--clobber|make_latest/);
});

test('Studio Preview VM qualification requires identity, trust, pages, Gateway, and a real Codex turn', () => {
  for (const required of [
    'one-person-lab-preview-${RELEASE_TAG#v}-mac-arm64.dmg',
    'one-person-lab-preview-full-${RELEASE_TAG#v}-mac-arm64.dmg',
    'git/ref/heads/main',
    'gh release download "$RELEASE_TAG"',
    'codesign --verify --deep --strict',
    'spctl --assess --type execute',
    'xcrun stapler validate',
    'contracts/shell-adapters/opl-studio.json',
    'Prepare exact external Codex carrier',
    'qualification_external_carrier.package.version',
    'qualification_external_carrier.platform.version',
    'qualification_external_carrier.platform.tarball_url',
    'qualification_external_carrier.platform.tarball_sha256',
    "package/vendor/aarch64-apple-darwin/bin/codex",
    '--codex-platform-package-tarball',
    '--codex-version',
    'scripts/desktop/qualify-clean-vm.mjs',
    '--runtime-profiles "$PROFILE"',
    '--require-gateway-setup',
    '--require-codex-turn',
    '--screenshots-dir',
    '.checks.smoke.checks.codexTurn.simulated == false',
    '.checks.smoke.checks.ui.settings.panel == true',
    '.checks.smoke.checks.ui.runtime.panel == true',
    '.checks.smoke.checks.ui.inspector.tabs == true',
    'opl_app_studio_preview_vm_qualification.v1',
    'release_source_sha:$release_source_sha',
    'verification_source_sha:$verification_source_sha',
  ]) assert.ok(source.includes(required), required);
});

test('Studio Preview VM qualification keeps release-test credentials ephemeral and out of evidence', () => {
  assert.match(source, /OPL_GATEWAY_RELEASE_TEST_ACCOUNT_EMAIL/);
  assert.match(source, /OPL_GATEWAY_RELEASE_TEST_ACCOUNT_PASSWORD/);
  assert.match(source, /--gateway-credentials-file/);
  assert.match(source, /Remove protected Gateway input/);
  assert.match(source, /Remove exact external Codex carrier input/);
  assert.match(source, /Remove downloaded public DMG from evidence/);
  assert.match(source, /Reject protected credentials in evidence/);
  assert.match(source, /if: \$\{\{ always\(\) && steps\.evidence-scan\.outcome == 'success' \}\}/);
  assert.doesNotMatch(source, /--gateway-account-email\s|--gateway-account-password\s/);
});
