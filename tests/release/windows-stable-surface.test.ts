import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

import {
  bindWindowsFrameworkManifest,
  isMainModule,
} from '../../scripts/bind-windows-framework-manifest.ts';
import { resolveReleasePlatformMatrix } from '../../scripts/resolve-release-platform-matrix.ts';
import { appRoot } from './app-release-boundary-cases/helpers.ts';

const frameworkSha = 'e'.repeat(40);

test('manual Windows builds are build-only while Windows x64 Stable uses the same-tag follower', () => {
  const manualPath = path.join(appRoot, '.github/workflows/build-manual.yml');
  const manualSource = fs.readFileSync(manualPath, 'utf8');
  const manual = parseYaml(manualSource) as any;

  assert.equal(manual.permissions.contents, 'read');
  assert.equal(manual.on.workflow_dispatch.inputs.publication_mode, undefined);
  assert.equal(manual.on.workflow_dispatch.inputs.immutable_release_capability_evidence, undefined);
  assert.equal(manual.jobs['publish-selected-platforms'], undefined);
  assert.doesNotMatch(manualSource, /windows_preview_rc|windows-rc-|release-preview|gh release upload/);
  assert.deepEqual(
    resolveReleasePlatformMatrix({ policy: 'manual_all', platform: 'windows-x64' }).include,
    [{
      platform: 'windows-x64',
      os: 'windows-latest',
      command: 'node scripts/build-with-builder.js x64 --win --x64',
      'artifact-name': 'windows-build-x64',
      arch: 'x64',
    }],
  );
});

test('Windows package Framework binder writes the exact immutable ref and URLs', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-windows-framework-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifestPath = path.join(root, 'product.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      logical_distribution: 'OPL-Linux',
      framework_ref: 'f'.repeat(40),
    }),
  );

  const bound = bindWindowsFrameworkManifest(manifestPath, frameworkSha);
  assert.equal(bound.framework_ref, frameworkSha);
  assert.equal(
    bound.framework_install_script_url,
    `https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/${frameworkSha}/install.sh`,
  );
  assert.equal(
    bound.framework_source_archive_url,
    `https://github.com/gaofeng21cn/one-person-lab/archive/${frameworkSha}.tar.gz`,
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), bound);
  assert.throws(() => bindWindowsFrameworkManifest(manifestPath, 'main'), /exact 40-character Git SHA/);
});

test('Windows package Framework binder recognizes a Windows file URL entrypoint', () => {
  const entry = new URL(
    'file:///D:/a/one-person-lab-app/one-person-lab-app/scripts/bind-windows-framework-manifest.ts',
  );
  assert.equal(isMainModule(entry.href, entry), true);
  assert.equal(
    isMainModule('file:///D:/a/one-person-lab-app/one-person-lab-app/scripts/another-script.ts', entry),
    false,
  );
});

test('standalone Windows RC publication is retired without fabricating runtime acceptance', () => {
  const release = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts/app-release-channel.json'), 'utf8'),
  );
  const execution = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts/app-windows-wsl2-execution.json'), 'utf8'),
  );
  const install = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts/app-install-exposure-policy.json'), 'utf8'),
  );
  const history = release.distribution_semantics.publication_history.windows_x64_rc_preview;
  const routing = install.distribution_install_model.platform_routing.windows_personal;

  assert.equal(
    release.distribution_semantics.implementation_state.windows_x64_rc_preview,
    'retired_no_public_release_or_tag_stable_same_tag_successor',
  );
  assert.equal(release.distribution_semantics.approved_targets.windows_x64_rc_preview, undefined);
  assert.equal(history.state, 'retired');
  assert.equal(history.new_publication_workflow_present, false);
  assert.equal(history.runtime_acceptance_inference_allowed, false);
  assert.equal(release.release_platform_matrix.policies.windows_preview, undefined);
  assert.equal(
    release.release_platform_matrix.capabilities['windows-x64'].publication_status,
    'same_stable_release_set',
  );
  assert.equal(
    release.release_platform_matrix.capabilities['windows-arm64'].publication_status,
    'development_validation_only',
  );
  assert.equal(execution.release_boundary.standalone_rc_publication_allowed, false);
  assert.equal(execution.release_boundary.stable_same_tag_windows_asset_publication_allowed, true);
  assert.equal(execution.release_boundary.stable_asset_publication_proves_wsl2_runtime_acceptance, false);
  assert.equal(execution.release_boundary.stable_asset_publication_proves_installed_behavior, false);
  assert.equal(execution.release_boundary.current_wsl2_runtime_acceptance, 'not_claimed');
  assert.equal(routing.current_default_runtime_form, 'desktop');
  assert.equal(routing.desktop_publication_proves_runtime_acceptance, false);
  assert.equal(routing.desktop_publication_proves_installed_behavior, false);
  assert.equal(routing.standalone_rc_preview.state, 'retired');
  assert.equal(routing.standalone_rc_preview.publication_workflow_present, false);
  assert.equal(routing.standalone_rc_preview.download_helper_present, false);

  for (const relativePath of [
    'scripts/download-windows-preview.ps1',
    'scripts/render-windows-preview-downloader.ts',
    'scripts/write-windows-rc-build-cohort.ts',
  ]) {
    assert.equal(fs.existsSync(path.join(appRoot, relativePath)), false, relativePath);
  }
});

test('Windows install guide resolves assets from Latest without copying version-bound release data', () => {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(
        appRoot,
        'docs/delivery/user-guides/windows-app-install/source/windows-app-install.quarto.json',
      ),
      'utf8',
    ),
  );
  const guide = fs.readFileSync(
    path.join(appRoot, 'docs/guides/windows-app-install/guide.qmd'),
    'utf8',
  );

  assert.equal(manifest.state, 'active_latest_release_entry');
  assert.equal(
    manifest.download.release_url,
    'https://github.com/gaofeng21cn/one-person-lab-app/releases/latest',
  );
  assert.equal(
    manifest.download.platform_manifest_url,
    'https://github.com/gaofeng21cn/one-person-lab-app/releases/latest/download/opl-desktop-platforms-manifest.json',
  );
  assert.equal(manifest.download.installer_pattern, 'One-Person-Lab-*-win-x64.exe');
  assert.equal(manifest.download.release_tag, undefined);
  assert.equal(manifest.download.installer_url, undefined);
  assert.equal(manifest.download.installer_sha256, undefined);
  assert.match(guide, /\{\{download\.release_url\}\}/);
  assert.match(guide, /\$latest = "https:\/\/github\.com\/\$repo\/releases\/latest"/);
  assert.match(guide, /\$latest\/download\/opl-desktop-platforms-manifest\.json/);
  assert.match(guide, /\$latest\/download\/opl-windows-updater-assets\.json/);
  assert.match(guide, /Get-FileHash/);
  assert.doesNotMatch(JSON.stringify(manifest), /\bv\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?\b/);
  assert.doesNotMatch(JSON.stringify(manifest), /\/releases\/(?:tag|download)\/v/);
  assert.doesNotMatch(guide, /\{\{download\.(?:release_tag|installer_url|installer_sha256)\}\}/);
  assert.doesNotMatch(guide, /download-windows-preview\.ps1|SHA256SUMS\.txt/);
});

test('ordinary Desktop install docs use Latest URLs instead of fixed release versions', () => {
  const userInstallSources = [
    'README.md',
    'README.zh-CN.md',
    'docs/delivery/install/README.md',
    'docs/delivery/install/README.zh-CN.md',
    'docs/guides/macos-app-install/guide.qmd',
    'docs/guides/macos-app-install/slides.qmd',
    'docs/guides/windows-app-install/guide.qmd',
    'docs/delivery/user-guides/windows-app-install/source/windows-app-install.quarto.json',
  ];

  for (const relativePath of userInstallSources) {
    const source = fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
    assert.doesNotMatch(
      source,
      /one-person-lab-app\/releases\/(?:tag|download)\//,
      `${relativePath} must route ordinary downloads through releases/latest`,
    );
  }
});

test('packaged installation-integrity recovery remains bounded and readback-based', () => {
  const adapter = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts/app-shell-adapter.json'), 'utf8'),
  );
  const recovery = adapter.startup_installation_integrity_recovery;

  assert.equal(recovery.trigger, 'packaged_backend_incomplete_installation');
  assert.equal(recovery.blocking_surface, true);
  assert.deepEqual(recovery.required_actions, [
    'restart_and_recheck_same_installation',
    'copy_redacted_diagnostic_summary',
    'open_local_app_log_directory',
    'open_prefilled_support_issue',
    'open_official_release_download',
  ]);
  assert.ok(recovery.diagnostic_copy_forbidden.includes('absolute_user_paths'));
  assert.equal(recovery.self_heal_or_reinstall_success_claim_without_fresh_readback_allowed, false);
  assert.equal(recovery.smartscreen_or_security_software_bypass_allowed, false);
});
