import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

import {
  planNativeWebuiAssetPublication,
  publishNativeWebuiAssets,
  readbackNativeWebuiAssets,
  sealNativeWebuiPublicationManifest,
  type NativeWebuiGitHubRuntime,
  type NativeWebuiLocalAsset,
  type NativeWebuiRemoteAsset,
} from '../../scripts/release-native-webui-carrier.ts';

const workflowRoot = path.join(process.cwd(), '.github', 'workflows');

function workflow(name: string): { source: string; parsed: Record<string, any> } {
  const source = fs.readFileSync(path.join(workflowRoot, name), 'utf8');
  return { source, parsed: parseYaml(source) as Record<string, any> };
}

function digest(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

test('Native follower performs only post-Stable exact public readback', () => {
  const { source, parsed } = workflow('release-native-webui-follower.yml');
  assert.deepEqual(Object.keys(parsed.on), ['workflow_run']);
  assert.deepEqual(parsed.on.workflow_run.workflows, ['OPL Stable Release Bundle']);
  assert.deepEqual(parsed.on.workflow_run.types, ['completed']);
  assert.deepEqual(parsed.permissions, { contents: 'read', actions: 'read' });
  assert.deepEqual(Object.keys(parsed.jobs), ['resolve-handoff', 'native-webui-carrier']);
  assert.equal(parsed.jobs['native-webui-carrier'].uses, './.github/workflows/_release-native-webui-carrier.yml');
  assert.deepEqual(parsed.jobs['native-webui-carrier'].permissions, { contents: 'read', actions: 'read' });
  assert.equal(parsed.jobs['native-webui-carrier'].with.mode, 'readback');
  assert.match(source, /\.path == "\.github\/workflows\/release-stable\.yml"/);
  assert.match(source, /\.run_attempt == 1/);
  assert.match(source, /opl-release-activation-\$\{STABLE_AUTHORITY_RUN_ID\}/);
  assert.match(source, /webui-follower-handoff\.json/);
  assert.match(source, /opl_standard_latest_admission_receipt\.v1/);
  assert.match(source, /framework_terminal_status == "complete"/);
  assert.doesNotMatch(source, /workflow_dispatch:/);
  assert.doesNotMatch(source, /release-webui-stable\.yml|_release-webui-carrier\.yml|packages: write/);
});

test('Native reusable separates non-blocking preparation, protected additive publication, and readback', () => {
  const { source, parsed } = workflow('_release-native-webui-carrier.yml');
  assert.deepEqual(Object.keys(parsed.on), ['workflow_call']);
  assert.equal(parsed.permissions, undefined);
  assert.deepEqual(Object.keys(parsed.jobs), ['startup-canary', 'build-and-qualify', 'publish-native-assets', 'readback-native-assets']);
  assert.deepEqual(parsed.jobs['build-and-qualify'].permissions, { contents: 'read', actions: 'read' });
  assert.equal(parsed.jobs['build-and-qualify']['continue-on-error'], true);
  assert.equal(parsed.on.workflow_call.outputs.prepare_status.value, '${{ jobs.build-and-qualify.outputs.prepare_status }}');
  assert.equal(parsed.jobs['build-and-qualify'].outputs.prepare_status, '${{ steps.qualified.outputs.prepare_status }}');
  assert.equal(parsed.jobs['publish-native-assets'].environment, 'release-stable');
  assert.equal(parsed.jobs['publish-native-assets']['continue-on-error'], true);
  assert.equal(parsed.jobs['publish-native-assets'].permissions, undefined);
  assert.deepEqual(parsed.jobs['readback-native-assets'].permissions, { contents: 'read', actions: 'read' });
  for (const required of [
    'test "$GITHUB_RUN_ATTEMPT" = 1',
    'test "$(id -u)" -ne 0',
    'repository: gaofeng21cn/opl-aion-shell',
    'repository: gaofeng21cn/one-person-lab',
    'desired_root_package_ids',
    'OPL_SOURCE_ARCHIVE_URL',
    'tests/unit/web-cli/nativeDistribution.test.ts',
    'tests/unit/web-cli/packWebCli.test.ts',
    '0.0.1',
    '--rollback',
    'user-sentinel.txt',
    'project-sentinel.txt',
    'official-profile-first-install-complete',
    'qualified|qualification_failed',
    'http://127.0.0.1:${port}/',
    'release-native-webui-carrier.ts publish',
    'release-native-webui-carrier.ts readback',
    'restore-release-checkpoint',
    'GH_TOKEN: ${{ github.token }}',
    'publication-scope external_target',
    'prior_mutation_attempt_id',
    'find native-release/native-publication-checkpoint -type f -name checkpoint.json',
    'test -f native-release/publication-manifest.json',
    'test "$(jq -r .operation_id <<<"$marker")"',
    'opl release reconcile',
    'latest_modified',
    'container_registry_modified',
    'homebrew_modified',
    'multiple unknown markers',
  ]) assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(
    source,
    /- name: Read back public Native bytes[\s\S]*?env:\n\s+BUNDLE_DIGEST:.*\n\s+GH_TOKEN: \$\{\{ github\.token \}\}/,
  );
  assert.doesNotMatch(source, /ghcr\.io|docker build|docker push|packages: write|make_latest|github-activate-latest/);
  assert.doesNotMatch(source, /release-stable\.yml|_release-full-addon\.yml/);
});

test('Native qualification renders a pinned installer without resolving GitHub Latest', (t) => {
  const { source } = workflow('_release-native-webui-carrier.yml');
  const materializationLine = source
    .split('\n')
    .find((line) => line.includes("sed '") && line.includes('scripts/install-web.sh'));
  const expression = materializationLine?.match(/sed '([^']+)' scripts\/install-web\.sh/)?.[1];
  assert.ok(expression, 'Native workflow must materialize the pinned installer with an explicit sed expression');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-native-webui-installer-version-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const embeddedVersion = '26.7.25';
  const explicitVersion = '26.7.26';
  const shellRoot = process.env.OPL_APP_SHELL_ROOT?.trim() || path.join(process.cwd(), 'shells', 'aionui');
  const shellInstaller = path.join(shellRoot, 'scripts', 'install-web.sh');
  const sourceInstaller = path.join(root, 'install-web.source.sh');
  const generatedInstaller = path.join(root, 'native-release', 'install-web.sh');
  const mirrorRoot = path.join(root, 'native-release');
  const fakeBin = path.join(root, 'fake-bin');
  const curlLog = path.join(root, 'curl.log');
  const defaultAssignment = 'VERSION="${VERSION:-__VERSION__}"';
  const generatedAssignment = `VERSION="\${VERSION:-${embeddedVersion}}"`;
  const placeholderLine = '    local version_placeholder="__VER""SION__"';
  const guardLine = '    if [[ "$VERSION" == "latest" || "$VERSION" == "$version_placeholder" ]]; then';

  fs.mkdirSync(path.dirname(generatedInstaller), { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  const sourceBytes = fs.readFileSync(shellInstaller, 'utf8');
  assert.equal(
    sourceBytes.split('\n').filter((line) => line === defaultAssignment).length,
    1,
    'selected Shell installer must expose exactly one CI default-version assignment',
  );
  assert.ok(sourceBytes.includes(placeholderLine), 'selected Shell installer must retain the split placeholder');
  assert.ok(sourceBytes.includes(guardLine), 'selected Shell installer must retain the placeholder guard');
  fs.writeFileSync(sourceInstaller, sourceBytes);
  fs.writeFileSync(path.join(fakeBin, 'curl'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$OPL_NATIVE_WEBUI_CURL_LOG"
exit 99
`);
  fs.chmodSync(path.join(fakeBin, 'curl'), 0o755);

  const materialized = spawnSync('sed', [expression.replace('${{ inputs.opl_version }}', embeddedVersion), sourceInstaller], {
    encoding: 'utf8',
  });
  assert.equal(materialized.status, 0, materialized.stderr);
  assert.equal(
    materialized.stdout,
    sourceBytes.replace(defaultAssignment, generatedAssignment),
    'Native materialization must change only the selected Shell default-version assignment',
  );
  assert.ok(materialized.stdout.includes(placeholderLine), 'materialization must preserve the split placeholder');
  assert.ok(materialized.stdout.includes(guardLine), 'materialization must preserve the placeholder guard');
  fs.writeFileSync(generatedInstaller, materialized.stdout);
  fs.chmodSync(generatedInstaller, 0o755);

  const runInstaller = (args: string[]) => spawnSync('bash', [generatedInstaller, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: path.join(root, 'home'),
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      OPL_NATIVE_WEBUI_CURL_LOG: curlLog,
    },
  });
  const defaultResult = runInstaller(['--mirror', `file://${mirrorRoot}`, '--no-path', '--no-symlink']);
  assert.equal(defaultResult.status, 1, `${defaultResult.stdout}\n${defaultResult.stderr}`);
  assert.match(defaultResult.stdout, new RegExp(`Using specified version: .*v${embeddedVersion}`));
  assert.match(defaultResult.stderr, /OPL artifact metadata not found at local mirror/);

  const explicitResult = runInstaller([
    '--mirror', `file://${mirrorRoot}`,
    '--version', explicitVersion,
    '--no-path',
    '--no-symlink',
  ]);
  assert.equal(explicitResult.status, 1, `${explicitResult.stdout}\n${explicitResult.stderr}`);
  assert.match(explicitResult.stdout, new RegExp(`Using specified version: .*v${explicitVersion}`));
  assert.match(explicitResult.stderr, /OPL artifact metadata not found at local mirror/);
  assert.equal(fs.existsSync(curlLog), false, 'an explicit local version must not resolve GitHub Latest');
});

test('Standard publishes Native only from a qualified same-run artifact without changing Desktop success', () => {
  const { parsed } = workflow('_release-bundle.yml');
  const prepare = parsed.jobs['prepare-native-webui'];
  const publish = parsed.jobs['publish-native-webui'];
  assert.equal(prepare.with.stable_authority_run_id, '${{ github.run_id }}');
  assert.equal(publish.with.stable_authority_run_id, '${{ github.run_id }}');
  assert.equal(publish.with.source_run_id, '${{ needs.checkpoint-standard.outputs.source_run_id }}');
  assert.equal(publish.with.qualified_artifact_name, '${{ needs.prepare-native-webui.outputs.qualified_artifact_name }}');
  assert.match(publish.if, /needs\.publish-standard\.result == 'success'/);
  assert.match(publish.if, /needs\.prepare-native-webui\.result == 'success'/);
  assert.match(publish.if, /needs\.prepare-native-webui\.outputs\.prepare_status == 'qualified'/);
  assert.doesNotMatch(publish.if, /failure\(\)/);
});

test('asset plan is idempotent and rejects same-name different bytes', () => {
  const local: NativeWebuiLocalAsset = {
    role: 'runtime_tarball',
    name: 'runtime.tar.gz',
    path: '/tmp/runtime.tar.gz',
    size_bytes: 42,
    sha256: 'a'.repeat(64),
  };
  assert.deepEqual(planNativeWebuiAssetPublication([local], []), [{ ...local, action: 'upload' }]);
  assert.deepEqual(planNativeWebuiAssetPublication([local], [{
    name: local.name,
    size: local.size_bytes,
    digest: `sha256:${local.sha256}`,
  }]), [{ ...local, action: 'reuse' }]);
  assert.throws(() => planNativeWebuiAssetPublication([local], [{
    name: local.name,
    size: local.size_bytes,
    digest: `sha256:${'b'.repeat(64)}`,
  }]), /already exists with different bytes/);
  assert.throws(() => planNativeWebuiAssetPublication([local], [
    { name: local.name, size: local.size_bytes, digest: `sha256:${local.sha256}` },
    { name: local.name, size: local.size_bytes, digest: `sha256:${local.sha256}` },
  ]), /duplicate Native WebUI asset names/);
});

function fixtureManifest(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.opl-native-publication-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const version = '26.7.25';
  const names = {
    runtime_tarball: `one-person-lab-webui-${version}-linux-x86_64.tar.gz`,
    runtime_metadata: `one-person-lab-webui-${version}-linux-x86_64.tar.gz.sha256`,
    installer: 'install-web.sh',
    installer_sha256: 'install-web.sh.sha256',
    qualification_receipt: `one-person-lab-webui-${version}-linux-x86_64.qualification.json`,
  };
  const paths = Object.fromEntries(Object.entries(names).map(([role, name]) => [role, path.join(root, name)])) as Record<keyof typeof names, string>;
  fs.writeFileSync(paths.runtime_tarball, 'runtime-bytes');
  fs.writeFileSync(paths.runtime_metadata, 'runtime-metadata');
  fs.writeFileSync(paths.installer, '#!/bin/sh\n');
  fs.writeFileSync(paths.installer_sha256, `${digest('#!/bin/sh\n')}  install-web.sh\n`);
  fs.writeFileSync(paths.qualification_receipt, `${JSON.stringify({
    schema: 'opl_app_native_webui_qualification_receipt.v1',
    status: 'passed',
    version,
    release_bundle_digest: `sha256:${'d'.repeat(64)}`,
    stable_authority_run_id: '123',
    platform: 'linux',
    architecture: 'x86_64',
    non_root: true,
    cohort: { app_sha: 'a'.repeat(40), shell_sha: 'b'.repeat(40), framework_sha: 'c'.repeat(40) },
    lifecycle: {
      first_install: 'passed',
      same_version_idempotence: 'passed',
      cross_version_update: 'passed',
      rollback: 'passed',
      data_preservation: 'passed',
      http_health: 'passed',
      official_profile_first_install: 'passed',
    },
  })}\n`);
  const manifest = sealNativeWebuiPublicationManifest({
    repository: 'gaofeng21cn/one-person-lab-app',
    version,
    releaseBundleDigest: `sha256:${'d'.repeat(64)}`,
    stableAuthorityRunId: '123',
    appSha: 'a'.repeat(40),
    shellSha: 'b'.repeat(40),
    frameworkSha: 'c'.repeat(40),
    qualificationReceiptPath: path.relative(process.cwd(), paths.qualification_receipt),
    assetPaths: Object.fromEntries(Object.entries(paths).map(([role, file]) => [
      role,
      path.relative(process.cwd(), file),
    ])) as Record<keyof typeof names, string>,
  });
  return { root, manifest };
}

test('Native seal CLI accepts the workflow qualification receipt path without escaping the checkout', (t) => {
  const current = fixtureManifest(t);
  const byRole = Object.fromEntries(current.manifest.assets.map((asset) => [asset.role, asset.path]));
  const output = path.join(current.root, 'cli-publication-manifest.json');
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    'scripts/release-native-webui-carrier.ts',
    'seal',
    '--repository', current.manifest.repository,
    '--version', current.manifest.version,
    '--release-bundle-digest', current.manifest.release_bundle_digest,
    '--stable-authority-run-id', current.manifest.stable_authority_run_id,
    '--app-sha', current.manifest.cohort.app_sha,
    '--shell-sha', current.manifest.cohort.shell_sha,
    '--framework-sha', current.manifest.cohort.framework_sha,
    '--runtime-tarball', byRole.runtime_tarball,
    '--runtime-metadata', byRole.runtime_metadata,
    '--installer', byRole.installer,
    '--installer-sha256', byRole.installer_sha256,
    '--qualification-receipt', current.manifest.qualification_receipt.path,
    '--output', output,
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), current.manifest);
});

function remoteAssets(manifest: ReturnType<typeof fixtureManifest>['manifest']): NativeWebuiRemoteAsset[] {
  return manifest.assets.map((asset, index) => ({
    id: index + 1,
    name: asset.name,
    size: asset.size_bytes,
    digest: `sha256:${asset.sha256}`,
    browser_download_url: `https://example.invalid/${asset.name}`,
  }));
}

function runtimeFor(input: {
  manifest: ReturnType<typeof fixtureManifest>['manifest'];
  initial: NativeWebuiRemoteAsset[];
  uploadStatus?: number;
  exposeAfterUpload?: boolean;
  anonymousReadbackStatus?: number;
}): NativeWebuiGitHubRuntime & { uploads: string[]; uploadCalls: number } {
  let assets = [...input.initial];
  const uploads: string[] = [];
  let uploadCalls = 0;
  return {
    uploads,
    get uploadCalls() { return uploadCalls; },
    run(command, args) {
      if (command === 'gh' && args[0] === 'api') {
        return {
          status: 0,
          stdout: JSON.stringify({
            tag_name: input.manifest.tag,
            draft: false,
            prerelease: false,
            target_commitish: input.manifest.cohort.app_sha,
            assets,
          }),
          stderr: '',
        };
      }
      if (command === 'gh' && args[0] === 'release' && args[1] === 'upload') {
        uploadCalls += 1;
        const localPaths = args.slice(3, args.indexOf('--repo'));
        const localAssets = localPaths.map((localPath) => {
          const local = input.manifest.assets.find((asset) => path.resolve(asset.path) === localPath);
          assert.ok(local);
          return local;
        });
        uploads.push(...localAssets.map((local) => local.name));
        if (input.exposeAfterUpload !== false) {
          assets = [...assets, ...localAssets.map((local) => ({
            name: local.name,
            size: local.size_bytes,
            digest: `sha256:${local.sha256}`,
            browser_download_url: `https://example.invalid/${local.name}`,
          }))];
        }
        return { status: input.uploadStatus ?? 0, stdout: '', stderr: input.uploadStatus ? 'unknown' : '' };
      }
      if (command === 'curl') {
        if (input.anonymousReadbackStatus) {
          return { status: input.anonymousReadbackStatus, stdout: '', stderr: 'anonymous readback failed' };
        }
        const output = args[args.indexOf('--output') + 1];
        const name = path.basename(args.at(-1) ?? '');
        const local = input.manifest.assets.find((asset) => asset.name === name);
        assert.ok(local);
        fs.copyFileSync(path.resolve(local.path), output);
        return { status: 0, stdout: '', stderr: '' };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    },
  };
}

test('publisher performs zero mutations for exact remote bytes and verifies anonymous bytes', (t) => {
  const current = fixtureManifest(t);
  const runtime = runtimeFor({ manifest: current.manifest, initial: remoteAssets(current.manifest) });
  const receipt = publishNativeWebuiAssets(current.manifest, 'gha-123-native', runtime);
  assert.equal(receipt.status, 'idempotent');
  assert.deepEqual(runtime.uploads, []);
  assert.equal(receipt.anonymous_readback.length, 5);
  assert.equal(receipt.latest_modified, false);
  assert.equal(receipt.container_registry_modified, false);
});

test('publisher never converts a zero-mutation public readback failure into idempotent completion', (t) => {
  const current = fixtureManifest(t);
  const runtime = runtimeFor({
    manifest: current.manifest,
    initial: remoteAssets(current.manifest),
    anonymousReadbackStatus: 22,
  });
  const receipt = publishNativeWebuiAssets(current.manifest, 'gha-126-native', runtime);
  assert.equal(receipt.status, 'public_readback_failed');
  assert.equal(runtime.uploadCalls, 0);
  assert.deepEqual(runtime.uploads, []);
  assert.deepEqual(receipt.requested_uploads, []);
  assert.equal(receipt.retry_disposition, 'fix_public_readback_then_freeze_a_new_standard_bundle_no_upload_retry');
});

test('publisher invokes one asset-set mutation and leaves unknown resolution to Framework readback', (t) => {
  const reconciled = fixtureManifest(t);
  const reconciledRuntime = runtimeFor({
    manifest: reconciled.manifest,
    initial: [],
    uploadStatus: 1,
    exposeAfterUpload: true,
  });
  const reconciledReceipt = publishNativeWebuiAssets(reconciled.manifest, 'gha-124-native', reconciledRuntime);
  assert.equal(reconciledReceipt.status, 'outcome_unknown');
  assert.equal(reconciledRuntime.uploadCalls, 1);
  assert.equal(reconciledRuntime.uploads.length, 5);
  assert.deepEqual(reconciledReceipt.requested_uploads, reconciled.manifest.assets.map((asset) => asset.name));
  assert.equal(readbackNativeWebuiAssets(reconciled.manifest, reconciledRuntime).status, 'complete');

  const unknown = fixtureManifest(t);
  const unknownRuntime = runtimeFor({
    manifest: unknown.manifest,
    initial: [],
    uploadStatus: 1,
    exposeAfterUpload: false,
  });
  const unknownReceipt = publishNativeWebuiAssets(unknown.manifest, 'gha-125-native', unknownRuntime);
  assert.equal(unknownReceipt.status, 'outcome_unknown');
  assert.equal(unknownRuntime.uploadCalls, 1);
  assert.deepEqual(unknownRuntime.uploads, unknown.manifest.assets.map((asset) => asset.name));
  assert.equal(unknownReceipt.retry_disposition, 'persist_framework_marker_then_exact_read_only_reconcile_no_upload_retry');
});
