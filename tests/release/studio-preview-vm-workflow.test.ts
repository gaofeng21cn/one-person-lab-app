import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const source = fs.readFileSync(path.join(root, '.github/workflows/opl-studio-preview-vm.yml'), 'utf8');
const workflow = parseYaml(source) as Record<string, any>;
const releaseContract = JSON.parse(fs.readFileSync(path.join(root, 'contracts/app-release-channel.json'), 'utf8'));

test('Studio Preview VM qualification owns two clean public-asset profiles without release mutation', () => {
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.deepEqual(Object.keys(workflow.jobs), ['validate-inputs', 'qualify', 'summarize']);
  assert.deepEqual(workflow.jobs.qualify.strategy.matrix.profile, ['standard', 'full']);
  assert.equal(workflow.jobs.qualify.strategy['max-parallel'], 1);
  assert.deepEqual(workflow.jobs.qualify['runs-on'], ['self-hosted', 'macOS', 'ARM64', 'opl-cert-mac-tart']);
  assert.equal(workflow.jobs.qualify.environment, 'release-stable');
  assert.equal(workflow.jobs.qualify['timeout-minutes'], 120);
  assert.equal(workflow.on.workflow_dispatch.inputs.smoke_timeout_ms.default, '600000');
  assert.equal(workflow.on.workflow_dispatch.inputs.framework_ref.required, true);
  assert.equal(workflow.jobs.qualify.steps[0].name, 'Download exact Studio verification harness');
  assert.equal(workflow.jobs.qualify.steps[0].env.VERIFICATION_SOURCE_SHA, '${{ needs.validate-inputs.outputs.verification_source_sha }}');
  assert.match(workflow.jobs.qualify.steps[0].run, /api\.github\.com\/repos\/\$STUDIO_REPOSITORY\/tarball\/\$VERIFICATION_SOURCE_SHA/);
  assert.equal(workflow.jobs.summarize.if, '${{ always() }}');
  assert.doesNotMatch(source, /contents:\s*write|packages:\s*write|gh release (?:create|upload|edit|delete)|--clobber|make_latest/);
});

test('Studio Preview VM qualification requires identity, trust, pages, Gateway, and a real Codex turn', () => {
  for (const required of [
    'one-person-lab-preview-${RELEASE_TAG#v}-mac-arm64.dmg',
    'one-person-lab-preview-full-${RELEASE_TAG#v}-mac-arm64.dmg',
    'git/ref/heads/main',
    'Download exact Studio verification harness',
    'opl-studio-verification-$GITHUB_RUN_ID-${{ matrix.profile }}.tgz',
    'tar -xzf "$archive" --strip-components=1 "$top/package.json" "$top/scripts/desktop"',
    'browser_download_url',
    'for attempt in $(seq 1 6)',
    'curl --http1.1 -fsSL --continue-at - --connect-timeout 30 --max-time 900',
    'resuming the same exact asset',
    'codesign --verify --deep --strict',
    'spctl --assess --type execute',
    'xcrun stapler validate',
    'contracts/shell-adapters/opl-studio.json',
    'opl-release-manifest.json',
    '.manifest.resolved_refs.opl_framework.resolved_commit == $framework',
    'Checkout exact Framework bootstrap source',
    'Prepare exact Framework bootstrap input',
    'git -C "$source_root" archive --format=tar.gz --prefix=one-person-lab/',
    '--framework-source-archive',
    '--framework-ref',
    'Remove exact Framework archive input',
    'Prepare exact external Codex carrier',
    'qualification_external_carrier.package.version',
    'qualification_external_carrier.platform.version',
    'qualification_external_carrier.platform.tarball_url',
    'qualification_external_carrier.platform.tarball_sha256',
    "package/vendor/aarch64-apple-darwin/bin/codex",
    '--codex-platform-package-tarball',
    '--codex-version',
    '--allow-actions',
    'scripts/desktop/qualify-clean-vm.mjs',
    '/package.json',
    '--runtime-profiles "$PROFILE"',
    '--require-gateway-setup',
    '--require-codex-turn',
    '--screenshots-dir',
    '.checks.smoke.checks.codexTurn.simulated == false',
    '(.checks.smoke.checks.codexTurn // {}).completed',
    '(.checks.smoke.checks.codexTurn // {}).finalMessagePresent',
    '(.checks.smoke.checks.codexTurn // {}).simulated',
    'smoke_status=$?',
    'test -s "evidence/$PROFILE/qualification.json"',
    'Ensure profile qualification receipt',
    'qualification_receipt_missing',
    'test ! -e "$dmg.part"',
    'if [ "$smoke_status" -ne 0 ]; then exit "$smoke_status"; fi',
    '.app_qualification.profile // ((.checks.smoke.checks.runtime // {}) | keys | .[0])',
    '(.checks.smoke.checks.runtime // {})[$profile].status',
    '.checks.smoke.checks.ui.settings.panel == true',
    '.checks.smoke.checks.ui.runtime.panel == true',
    '.checks.smoke.checks.ui.inspector.tabs == true',
    'opl_app_studio_preview_vm_qualification.v1',
    'Require complete qualification receipt',
    'release_source_sha:$release_source_sha',
    'verification_source_sha:$verification_source_sha',
    'framework_ref:$framework_ref',
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

test('App contract owns exact Framework and resumable public-asset qualification', () => {
  const policy = releaseContract.successor_delivery_target.public_clean_vm_qualification;
  assert.equal(policy.workflow, '.github/workflows/opl-studio-preview-vm.yml');
  assert.deepEqual(policy.profiles, ['standard', 'full']);
  assert.equal(policy.framework_identity.anonymous_mutable_GitHub_source_download_allowed, false);
  assert.equal(policy.framework_identity.framework_payload_added_to_standard_bundle, false);
  assert.equal(policy.download_policy.resume_partial_download, true);
  assert.equal(policy.codex_identity.app_bundle_codex_allowed, false);
  assert.equal(policy.mutation_policy, 'read_only_public_asset_qualification_no_release_or_asset_mutation');
});
