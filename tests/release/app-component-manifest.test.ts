import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const appRoot = path.resolve(import.meta.dirname, '../..');

function asset(name: string, digit: string) {
  return {
    name,
    url: `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.7.13/${name}`,
    digest: `sha256:${digit.repeat(64)}`,
    size: 100,
    contentType: 'application/octet-stream',
  };
}

test('App owner manifest records only immutable standard App artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-component-'));
  const releaseJson = path.join(root, 'release.json');
  const output = path.join(root, 'opl-app-component-manifest.json');
  const standardAssets = [
    asset('latest-arm64-mac.yml', '1'),
    asset('One-Person-Lab-26.7.13-mac-arm64.dmg', '2'),
    asset('One-Person-Lab-26.7.13-mac-arm64.zip', '3'),
    asset('One-Person-Lab-26.7.13-mac-arm64.zip.blockmap', '4'),
    asset('opl-install.sh', '8'),
    asset('opl-app-installer.sh', '5'),
    asset('standard-gatekeeper-launch-policy.json', '6'),
    asset('standard-apple-notarization-receipt.json', '7'),
  ];
  fs.writeFileSync(releaseJson, `${JSON.stringify({
    tagName: 'v26.7.13',
    isDraft: true,
    isPrerelease: false,
    url: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/untagged-test',
    assets: [...standardAssets, asset('One-Person-Lab-Full-26.7.13-mac-arm64.dmg', '6')],
  })}\n`);
  execFileSync(process.execPath, [
    '--experimental-strip-types',
    'scripts/write-opl-app-component-manifest.ts',
    '--version', '26.7.13',
    '--updater-version', '26.7.13',
    '--source-commit', 'a'.repeat(40),
    '--shell-commit', 'b'.repeat(40),
    '--framework-commit', 'c'.repeat(40),
    '--release-json', releaseJson,
    '--output', output,
  ], { cwd: appRoot, encoding: 'utf8' });
  const component = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(component.surface_kind, 'opl_app_component_manifest.v1');
  assert.equal(component.component_id, 'opl-app');
  assert.equal(component.version, '26.7.13');
  assert.equal(component.release_version, '26.7.13');
  assert.equal(component.updater_version, '26.7.13');
  assert.equal(component.quality_status, 'stable');
  assert.equal(component.build_trigger, 'manual');
  assert.equal(component.preview_kind, null);
  assert.deepEqual(component.source_cohort, {
    app_sha: 'a'.repeat(40),
    shell_sha: 'b'.repeat(40),
    framework_sha: 'c'.repeat(40),
  });
  assert.deepEqual(component.distribution_pointer_policy, {
    pointer: 'latest',
    automatic_writer: 'qualified_stable_default',
    explicit_override: 'protected_single_use_exact_version',
    quality_unchanged: true,
    stable_reclaim: 'next_qualified_stable',
  });
  assert.deepEqual(component.qualification_disclosure, {
    stable_qualified: true,
    passed_gates: ['standard_vm'],
    skipped_gates: [],
    failed_gates: [],
    non_stable_notice: false,
  });
  assert.equal(component.primary_artifact.name, 'One-Person-Lab-26.7.13-mac-arm64.dmg');
  assert.equal(component.artifacts.length, 8);
  assert.equal(component.artifacts.some((entry: { name: string }) => entry.name.includes('Full')), false);
  assert.deepEqual(
    component.artifacts.find((entry: { name: string }) => entry.name === 'opl-install.sh'),
    {
      name: 'opl-install.sh',
      ref: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.7.13/opl-install.sh',
      digest: `sha256:${'8'.repeat(64)}`,
      size: 100,
      content_type: 'application/octet-stream',
    },
  );
  assert.deepEqual(
    component.artifacts.find((entry: { name: string }) => entry.name === 'opl-app-installer.sh'),
    {
      name: 'opl-app-installer.sh',
      ref: 'https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v26.7.13/opl-app-installer.sh',
      digest: `sha256:${'5'.repeat(64)}`,
      size: 100,
      content_type: 'application/octet-stream',
    },
  );
  assert.match(component.component_manifest_digest, /^sha256:[0-9a-f]{64}$/);
  const { component_manifest_digest: _digest, ...core } = component;
  assert.equal(
    component.component_manifest_digest,
    `sha256:${crypto.createHash('sha256').update(JSON.stringify(core)).digest('hex')}`,
  );
});

test('App owner manifest keeps quality, build trigger, and Latest pointer policy orthogonal', () => {
  for (const fixture of [
    {
      version: '26.7.24-nightly',
      updaterVersion: '26.7.2490-nightly.0',
      isPrerelease: true,
      qualityStatus: 'preview',
      buildTrigger: 'automated',
    },
    {
      version: '26.7.24-preview.r1',
      updaterVersion: '26.7.2401',
      isPrerelease: false,
      qualityStatus: 'preview',
      buildTrigger: 'manual',
    },
  ] as const) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-component-quality-'));
    try {
      const releaseJson = path.join(root, 'release.json');
      const output = path.join(root, 'manifest.json');
      fs.writeFileSync(releaseJson, `${JSON.stringify({
        tagName: `v${fixture.version}`,
        isDraft: false,
        isPrerelease: fixture.isPrerelease,
        url: `https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/v${fixture.version}`,
        assets: [
          asset('latest-arm64-mac.yml', '1'),
          asset(`One-Person-Lab-${fixture.version}-mac-arm64.dmg`, '2'),
          asset(`One-Person-Lab-${fixture.version}-mac-arm64.zip`, '3'),
          asset(`One-Person-Lab-${fixture.version}-mac-arm64.zip.blockmap`, '4'),
          asset('opl-install.sh', '8'),
          asset('opl-app-installer.sh', '5'),
          asset('standard-gatekeeper-launch-policy.json', '6'),
          asset('standard-apple-notarization-receipt.json', '7'),
        ],
      })}\n`);
      execFileSync(process.execPath, [
        '--experimental-strip-types',
        'scripts/write-opl-app-component-manifest.ts',
        '--version', fixture.version,
        '--updater-version', fixture.updaterVersion,
        '--source-commit', 'b'.repeat(40),
        '--shell-commit', 'c'.repeat(40),
        '--framework-commit', 'd'.repeat(40),
        '--release-json', releaseJson,
        '--output', output,
      ], { cwd: appRoot, encoding: 'utf8' });
      const component = JSON.parse(fs.readFileSync(output, 'utf8'));
      assert.deepEqual(
        [component.quality_status, component.build_trigger, component.preview_kind],
        [fixture.qualityStatus, fixture.buildTrigger, fixture.version.includes('-nightly') ? 'nightly' : 'dev'],
      );
      assert.deepEqual(component.distribution_pointer_policy, {
        pointer: 'latest',
        automatic_writer: 'never',
        explicit_override: 'protected_single_use_exact_version',
        quality_unchanged: true,
        stable_reclaim: 'next_qualified_stable',
      });
      assert.deepEqual(
        component.qualification_disclosure,
        fixture.buildTrigger === 'automated'
          ? {
              stable_qualified: false,
              passed_gates: [],
              skipped_gates: [
                'stable_heavy_vm',
                'homebrew_clean_install',
                'native_webui',
                'container_webui',
                'full',
              ],
              failed_gates: [],
              non_stable_notice: true,
            }
          : {
              stable_qualified: false,
              passed_gates: ['standard_vm'],
              skipped_gates: ['homebrew_clean_install', 'native_webui', 'container_webui', 'full'],
              failed_gates: [],
              non_stable_notice: true,
            },
      );
      assert.equal(component.artifacts.length, fixture.buildTrigger === 'automated' ? 6 : 8);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('App owner manifest fails closed when a standard asset is missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-component-'));
  const releaseJson = path.join(root, 'release.json');
  fs.writeFileSync(releaseJson, `${JSON.stringify({
    tagName: 'v26.7.13',
    isDraft: true,
    isPrerelease: false,
    assets: [asset('One-Person-Lab-26.7.13-mac-arm64.dmg', '2')],
  })}\n`);
  assert.throws(() => execFileSync(process.execPath, [
    '--experimental-strip-types',
    'scripts/write-opl-app-component-manifest.ts',
    '--version', '26.7.13',
    '--updater-version', '26.7.13',
    '--source-commit', 'a'.repeat(40),
    '--shell-commit', 'b'.repeat(40),
    '--framework-commit', 'c'.repeat(40),
    '--release-json', releaseJson,
    '--output', path.join(root, 'manifest.json'),
  ], { cwd: appRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
});

test('Bundle topology binds the component manifest before remote digest verification and Latest activation', () => {
  const bundleWorkflow = fs.readFileSync(
    path.join(appRoot, '.github/workflows/_release-bundle.yml'),
    'utf8',
  );
  const publishWorkflow = fs.readFileSync(
    path.join(appRoot, '.github/workflows/_release-standard-publish.yml'),
    'utf8',
  );
  const bindScript = fs.readFileSync(
    path.join(appRoot, 'scripts/bind-standard-release-track.ts'),
    'utf8',
  );
  const sealIdentity = bundleWorkflow.indexOf('  seal-standard-identity:');
  const checkpoint = bundleWorkflow.indexOf('  checkpoint-standard:');
  const publishReusable = bundleWorkflow.indexOf('  publish-standard:');
  const prePublication = publishWorkflow.indexOf('  pre-publication-admission:');
  const publish = publishWorkflow.indexOf('  publish-standard-nonlatest:');
  const remoteVerify = publishWorkflow.indexOf('  remote-digest-verify:');
  const latest = publishWorkflow.indexOf('  activate-latest:');

  assert.ok(sealIdentity >= 0 && sealIdentity < checkpoint && checkpoint < publishReusable);
  assert.ok(prePublication >= 0 && publish >= 0 && prePublication < publish && publish < remoteVerify && remoteVerify < latest);
  const admission = publishWorkflow.slice(prePublication, publish);
  assert.match(admission, /validate-standard-publication-input\.ts/);
  assert.doesNotMatch(admission, /gh release (?:create|upload|edit)|opl release publish/);
  assert.match(publishWorkflow.slice(publish, remoteVerify), /needs: \[restore, pre-publication-admission\]/);
  assert.match(bundleWorkflow.slice(sealIdentity, checkpoint), /write-opl-app-component-manifest\.ts/);
  assert.match(bundleWorkflow.slice(sealIdentity, checkpoint), /--updater-version '\$\{\{ needs\.freeze\.outputs\.updater_version \}\}'/);
  assert.match(bundleWorkflow.slice(sealIdentity, checkpoint), /app-source\/install\.sh/);
  assert.match(bundleWorkflow.slice(sealIdentity, checkpoint), /generate-frozen-universal-installer\.ts/);
  assert.match(bundleWorkflow.slice(sealIdentity, checkpoint), /standard-assets\/opl-install\.sh/);
  assert.match(bundleWorkflow.slice(sealIdentity, checkpoint), /opl-app-installer\.sh/);
  assert.match(bundleWorkflow.slice(sealIdentity, checkpoint), /cmp "\$source_installer" "\$release_installer"/);
  assert.match(bundleWorkflow.slice(publishReusable), /uses: \.\/\.github\/workflows\/_release-standard-publish\.yml/);
  assert.match(bindScript, /opl_standard_release_identity_receipt\.v2/);
  assert.doesNotMatch(publishWorkflow.slice(remoteVerify, latest), /release_bundle_status\.latest_eligible/);
  assert.match(
    publishWorkflow.slice(remoteVerify, latest),
    /release_bundle_status\.tracks\.standard\.reconcile_required == false/,
  );
  assert.doesNotMatch(`${bundleWorkflow}\n${publishWorkflow}`, /desktop-release-promote\.yml/);
});
