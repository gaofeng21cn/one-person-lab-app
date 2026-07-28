import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

import {
  buildNativeWebuiUploadActions,
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
  assert.deepEqual(Object.keys(parsed.jobs), [
    'resolve-handoff',
    'native-webui-linux-readback',
    'native-webui-macos-readback',
  ]);
  const linux = parsed.jobs['native-webui-linux-readback'];
  const macos = parsed.jobs['native-webui-macos-readback'];
  for (const readback of [linux, macos]) {
    assert.equal(readback.uses, './.github/workflows/_release-native-webui-carrier.yml');
    assert.deepEqual(readback.permissions, { contents: 'read', actions: 'read' });
    assert.equal(readback.with.mode, 'readback');
  }
  assert.equal(linux.with.target_platform, 'linux');
  assert.equal(linux.with.target_architecture, 'x86_64');
  assert.equal(macos.with.target_platform, 'darwin');
  assert.equal(macos.with.target_architecture, 'arm64');
  assert.match(source, /\.path == "\.github\/workflows\/release-stable\.yml"/);
  assert.match(source, /\.run_attempt == 1/);
  assert.match(source, /opl-release-activation-\$\{STABLE_AUTHORITY_RUN_ID\}/);
  assert.match(source, /webui-follower-handoff\.json/);
  assert.match(source, /opl_standard_latest_admission_receipt\.v1/);
  assert.match(source, /framework_terminal_status == "complete"/);
  assert.match(source, /linux_publication_artifact/);
  assert.match(source, /macos_publication_artifact/);
  assert.doesNotMatch(source, /duplicate Native publication artifacts/);
  assert.doesNotMatch(source, /workflow_dispatch:/);
  assert.doesNotMatch(source, /release-webui-stable\.yml|_release-webui-carrier\.yml|packages: write/);
});

test('Native reusable separates non-blocking preparation from post-publish readback', () => {
  const { source, parsed } = workflow('_release-native-webui-carrier.yml');
  assert.deepEqual(Object.keys(parsed.on), ['workflow_call']);
  assert.equal(parsed.permissions, undefined);
  assert.deepEqual(Object.keys(parsed.jobs), ['startup-canary', 'build-and-qualify', 'readback-native-assets']);
  assert.deepEqual(parsed.jobs['build-and-qualify'].permissions, { contents: 'read', actions: 'read' });
  assert.equal(parsed.jobs['build-and-qualify']['continue-on-error'], true);
  assert.equal(parsed.on.workflow_call.outputs.prepare_status.value, '${{ jobs.build-and-qualify.outputs.prepare_status }}');
  assert.equal(parsed.jobs['build-and-qualify'].outputs.prepare_status, '${{ steps.qualified.outputs.prepare_status }}');
  assert.equal(parsed.jobs['build-and-qualify']['runs-on'], "${{ inputs.target_platform == 'darwin' && 'macos-14' || 'ubuntu-latest' }}");
  assert.deepEqual(parsed.jobs['readback-native-assets'].permissions, { contents: 'read', actions: 'read' });
  for (const required of [
    'test "$GITHUB_RUN_ATTEMPT" = 1',
    'test "$(id -u)" -ne 0',
    'repository: gaofeng21cn/opl-aion-shell',
    'repository: gaofeng21cn/one-person-lab',
    'PACK_PLATFORM: ${{ inputs.target_platform }}',
    "PACK_ARCH: ${{ inputs.target_architecture == 'x86_64' && 'x64' || 'arm64' }}",
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
    'release-native-webui-carrier.ts readback',
    'restore-release-checkpoint',
    'GH_TOKEN: ${{ github.token }}',
    'publication-scope external_target',
    'prior_mutation_attempt_id',
    'find imported-checkpoint -type f -name publication-manifest.json',
    'find imported-checkpoint -type f -name standard-identity-receipt.json',
    'test "$(jq -r .operation_id <<<"$marker")"',
    'opl release reconcile',
    'multiple unknown markers',
  ]) assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(
    source,
    /- name: Read back public Native bytes[\s\S]*?env:\n\s+BUNDLE_DIGEST:.*\n\s+GH_TOKEN: \$\{\{ github\.token \}\}/,
  );
  assert.doesNotMatch(source, /ghcr\.io|docker build|docker push|packages: write|make_latest|github-activate-latest/);
  assert.doesNotMatch(source, /release-stable\.yml|_release-full-addon\.yml|publish-native-assets|release-native-webui-carrier\.ts publish|opl release publish/);
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

test('Stable Standard publish consumes Native before the one Release publish', () => {
  const { parsed } = workflow('_release-bundle.yml');
  const prepare = parsed.jobs['prepare-native-webui'];
  const prepareMacos = parsed.jobs['prepare-native-webui-macos'];
  const publish = parsed.jobs['publish-standard'];
  assert.equal(prepare.with.stable_authority_run_id, '${{ github.run_id }}');
  assert.equal(prepare.with.target_platform, 'linux');
  assert.equal(prepare.with.target_architecture, 'x86_64');
  assert.equal(prepareMacos.with.target_platform, 'darwin');
  assert.equal(prepareMacos.with.target_architecture, 'arm64');
  assert.deepEqual(publish.needs, ['freeze', 'checkpoint-standard', 'prepare-native-webui', 'prepare-native-webui-macos']);
  assert.equal(
    publish.with.qualified_native_artifact_name,
    "${{ (inputs.publication_channel || inputs.channel) == 'stable' && needs.prepare-native-webui.outputs.qualified_artifact_name || '' }}",
  );
  assert.equal(
    publish.with.qualified_native_macos_artifact_name,
    "${{ (inputs.publication_channel || inputs.channel) == 'stable' && needs.prepare-native-webui-macos.outputs.qualified_artifact_name || '' }}",
  );
  assert.equal(
    publish.with.qualified_native_source_run_id,
    "${{ (inputs.publication_channel || inputs.channel) == 'stable' && github.run_id || '' }}",
  );
  assert.match(publish.if, /needs\.prepare-native-webui\.result == 'success'/);
  assert.match(publish.if, /needs\.prepare-native-webui\.outputs\.prepare_status == 'qualified'/);
  assert.equal(parsed.jobs['publish-native-webui'], undefined);
  const standard = workflow('_release-standard-publish.yml');
  assert.equal(standard.parsed.on.workflow_call.inputs.qualified_native_artifact_name.default, '');
  assert.match(standard.source, /Bind qualified Native and consumed operation control into one immutable carrier/);
  assert.match(standard.source, /find immutable-carrier-input -type f -path '.*native-qualified\/\*\/publication-manifest\.json'/);
  assert.match(standard.source, /cp -a "\$native_qualified_source_dir" native-qualified/);
  assert.match(standard.source, /test ! -e native-release/);
  assert.match(standard.source, /cp -a native-qualified\/\. native-release\//);
  assert.match(standard.source, /diff -r native-qualified native-release/);
  assert.match(standard.source, /--manifest "native-release\/\$target\/publication-manifest\.json"/);
  assert.match(standard.source, /cp -a "\$control_source_dir" stable-operation-control/);
  assert.doesNotMatch(standard.source, /cd immutable-carrier-input/);
  assert.doesNotMatch(standard.source, /Download exact qualified Native artifact for the unified draft carrier/);
  assert.match(standard.source, /release-native-webui-carrier\.ts upload-actions/);
  assert.match(standard.source, /same-name assets differ/);
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
    platform: 'linux',
    architecture: 'x86_64',
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
    '--platform', current.manifest.platform,
    '--architecture', current.manifest.architecture,
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

test('Native carrier rejects unsupported target metadata before sealing or upload planning', (t) => {
  const current = fixtureManifest(t);
  const byRole = Object.fromEntries(current.manifest.assets.map((asset) => [asset.role, asset.path]));
  for (const target of [
    { platform: 'windows', architecture: 'x86_64' },
    { platform: 'linux', architecture: 'arm64' },
    { platform: 'darwin', architecture: 'x86_64' },
  ]) {
    assert.throws(
      () => sealNativeWebuiPublicationManifest({
        repository: current.manifest.repository,
        version: current.manifest.version,
        releaseBundleDigest: current.manifest.release_bundle_digest,
        stableAuthorityRunId: current.manifest.stable_authority_run_id,
        platform: target.platform as never,
        architecture: target.architecture as never,
        appSha: current.manifest.cohort.app_sha,
        shellSha: current.manifest.cohort.shell_sha,
        frameworkSha: current.manifest.cohort.framework_sha,
        qualificationReceiptPath: current.manifest.qualification_receipt.path,
        assetPaths: byRole,
      }),
      new RegExp(`Unsupported Native WebUI target ${target.platform}-${target.architecture}`),
    );
  }

  const manifestPath = path.join(current.root, 'unsupported-publication-manifest.json');
  const outputPath = path.join(current.root, 'unsupported-upload-actions.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify({ ...current.manifest, platform: 'windows' })}\n`);
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    'scripts/release-native-webui-carrier.ts',
    'upload-actions',
    '--manifest', manifestPath,
    '--output', outputPath,
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /Unsupported Native WebUI target windows-x86_64/);
  assert.equal(fs.existsSync(outputPath), false);
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

test('Native upload actions bind every qualified byte for the unified draft carrier', (t) => {
  const current = fixtureManifest(t);
  const actions = buildNativeWebuiUploadActions(current.manifest);
  assert.equal(actions.schema, 'opl_app_native_webui_upload_actions.v1');
  assert.equal(actions.repository, current.manifest.repository);
  assert.equal(actions.tag, current.manifest.tag);
  assert.equal(actions.upload_actions.length, current.manifest.assets.length);
  assert.deepEqual(
    actions.upload_actions.map((action) => ({
      action: action.action,
      name: action.name,
      source_path: action.source_path,
      size_bytes: action.size_bytes,
      sha256: action.sha256,
    })),
    current.manifest.assets.map((asset) => ({
      action: 'upload',
      name: asset.name,
      source_path: path.resolve(asset.path),
      size_bytes: asset.size_bytes,
      sha256: `sha256:${asset.sha256}`,
    })),
  );
  assert.equal(new Set(actions.upload_actions.map((action) => action.name)).size, current.manifest.assets.length);
  assert.equal(new Set(actions.upload_actions.map((action) => action.source_path)).size, current.manifest.assets.length);
  for (const action of actions.upload_actions) {
    assert.match(action.sha256, /^sha256:[0-9a-f]{64}$/);
  }
});

test('Native upload-actions CLI emits adapter-compatible digest references without a public mutation', (t) => {
  const current = fixtureManifest(t);
  const manifestPath = path.join(current.root, 'publication-manifest.json');
  const outputPath = path.join(current.root, 'upload-actions.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(current.manifest)}\n`);
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types',
    'scripts/release-native-webui-carrier.ts',
    'upload-actions',
    '--manifest', manifestPath,
    '--output', outputPath,
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const actions = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.deepEqual(actions, buildNativeWebuiUploadActions(current.manifest));
  for (const action of actions.upload_actions) {
    assert.match(action.sha256, /^sha256:[0-9a-f]{64}$/);
  }
});

test('Native upload actions retain raw manifest digest verification before prefixing output', (t) => {
  const current = fixtureManifest(t);
  const changed = current.manifest.assets[0];
  fs.appendFileSync(path.resolve(changed.path), 'changed-after-seal');
  assert.throws(
    () => buildNativeWebuiUploadActions(current.manifest),
    /not canonical or its local bytes changed/,
  );
});

test('Native readback remains read-only and legacy post-publish publication is fail-closed', (t) => {
  const current = fixtureManifest(t);
  const runtime = runtimeFor({ manifest: current.manifest, initial: remoteAssets(current.manifest) });
  const receipt = readbackNativeWebuiAssets(current.manifest, runtime);
  assert.equal(receipt.status, 'complete');
  assert.equal(runtime.uploadCalls, 0);
  assert.deepEqual(runtime.uploads, []);
  assert.throws(
    () => publishNativeWebuiAssets(current.manifest, 'gha-legacy-native', runtime),
    /unified Stable draft carrier; post-publish append is forbidden/,
  );
  assert.equal(runtime.uploadCalls, 0);
});
