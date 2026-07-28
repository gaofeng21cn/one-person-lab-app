import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

import { appRoot } from './app-release-boundary-cases/helpers.ts';
import {
  bindWindowsRcFrameworkManifest,
  isMainModule,
} from '../../scripts/bind-windows-rc-framework-manifest.ts';
import { buildWindowsRcBuildCohort } from '../../scripts/write-windows-rc-build-cohort.ts';

const appSha = 'a'.repeat(40);
const appTree = 'b'.repeat(40);
const shellSha = 'c'.repeat(40);
const shellTree = 'd'.repeat(40);
const frameworkSha = 'e'.repeat(40);

function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-windows-rc-cohort-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const out = path.join(root, 'out');
  const packagedTree = path.join(out, 'win-unpacked');
  const runtimeRoot = path.join(packagedTree, 'resources', 'bundled-aioncore', 'linux-x64');
  const toolRoot = path.join(
    runtimeRoot,
    'managed-resources',
    'acp',
    'codex-acp',
    '1.1.2',
    'linux-x64',
  );
  const codexRoot = path.join(
    toolRoot,
    'node_modules',
    '@openai',
    'codex-linux-x64',
    'vendor',
    'x86_64-unknown-linux-musl',
    'bin',
  );
  const distributionProductRoot = path.join(packagedTree, 'resources', 'opl-linux');
  fs.mkdirSync(codexRoot, { recursive: true });
  fs.mkdirSync(distributionProductRoot, { recursive: true });
  fs.writeFileSync(path.join(out, 'One-Person-Lab-26.7.26-rc.1-win-x64.exe'), 'installer');
  fs.writeFileSync(path.join(runtimeRoot, 'aioncore'), 'aioncore');
  fs.writeFileSync(path.join(runtimeRoot, 'manifest.json'), JSON.stringify({ platform: 'linux', arch: 'x64' }));
  fs.writeFileSync(
    path.join(runtimeRoot, 'managed-resources', 'manifest.json'),
    JSON.stringify({ acpTools: [{ slug: 'codex-acp', version: '1.1.2' }] }),
  );
  fs.writeFileSync(
    path.join(distributionProductRoot, 'product.json'),
    JSON.stringify({
      framework_ref: frameworkSha,
      framework_install_script_url: `https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/${frameworkSha}/install.sh`,
      framework_source_archive_url: `https://github.com/gaofeng21cn/one-person-lab/archive/${frameworkSha}.tar.gz`,
    }),
  );
  fs.writeFileSync(path.join(codexRoot, 'codex'), 'codex');
  fs.writeFileSync(path.join(toolRoot, 'package.json'), '{}');
  return {
    installer: path.join(out, 'One-Person-Lab-26.7.26-rc.1-win-x64.exe'),
    packagedTree,
  };
}

test('Windows RC cohort seals the exact installer, packaged tree, and WSL2-only Linux runtime', (t) => {
  const input = fixture(t);
  const cohort = buildWindowsRcBuildCohort({
    installerPath: input.installer,
    packagedTreePath: input.packagedTree,
    appSha,
    appTree,
    shellSha,
    shellTree,
    frameworkSha,
    version: '26.7.26-rc.1',
    platform: 'win32',
    arch: 'x64',
    actionsRunId: '12345',
    actionsRunAttempt: '1',
    actionsArtifactName: 'windows-build-x64-a1b2c3d',
  });
  assert.equal(cohort.schema, 'opl_windows_rc_build_cohort.v1');
  assert.equal(cohort.release.quality, 'preview');
  assert.equal(cohort.release.latest_allowed, false);
  assert.equal(cohort.source.framework_sha, frameworkSha);
  assert.equal(cohort.target.runtime_key, 'linux-x64');
  assert.equal(cohort.runtime.execution_substrate, 'dedicated_opl_linux_wsl2');
  assert.equal(cohort.runtime.wsl2_only_terminal_claim, true);
  assert.equal(cohort.runtime.native_windows_executor_fallback_allowed, false);
  assert.match(cohort.runtime.distribution_product.path, /resources\/opl-linux\/product\.json$/);
  assert.match(cohort.runtime.codex.path, /@openai\/codex-linux-x64\/vendor\/.+\/bin\/codex$/);
  assert.ok(cohort.packaged_tree.file_count >= 6);
  assert.equal(cohort.packaged_tree.sha256.length, 64);
});

test('Windows RC cohort rejects non-RC versions and missing exact source identities', (t) => {
  const input = fixture(t);
  const base = {
    installerPath: input.installer,
    packagedTreePath: input.packagedTree,
    appSha,
    appTree,
    shellSha,
    shellTree,
    frameworkSha,
    version: '26.7.26-rc.1',
    platform: 'win32',
    arch: 'x64',
    actionsRunId: '12345',
    actionsRunAttempt: '1',
    actionsArtifactName: 'windows-build-x64-a1b2c3d',
  };
  assert.throws(() => buildWindowsRcBuildCohort({ ...base, version: '26.7.26' }), /must match/);
  assert.throws(() => buildWindowsRcBuildCohort({ ...base, appSha: 'main' }), /exact 40-character/);
});

test('manual Windows builds reuse the multi-platform builder and emit a Windows-specific cohort', () => {
  const reusableText = fs.readFileSync(path.join(appRoot, '.github/workflows/_build-reusable.yml'), 'utf8');
  const manualText = fs.readFileSync(path.join(appRoot, '.github/workflows/build-manual.yml'), 'utf8');
  const reusable = parseYaml(reusableText) as any;
  const manual = parseYaml(manualText) as any;
  const steps = reusable.jobs.build.steps as Array<{ name?: string; if?: string; run?: string; with?: any; env?: any }>;
  const macCohort = steps.find((step) => step.name === 'Write build artifact cohort manifest');
  const windowsCohort = steps.find((step) => step.name === 'Write Windows RC build artifact cohort manifest');
  const windowsNativeRebuild = steps.find(
    (step) => step.name === 'Rebuild native modules for Electron (Windows)',
  );
  const windowsRuntime = reusable.jobs['prepare-windows-linux-runtime'];
  const shellResolver = reusable.jobs['resolve-active-shell-ref'];
  const windowsRuntimeDownload = steps.find(
    (step) => step.name === 'Download target-executed Linux runtime',
  );
  const preparedRuntimeBinder = windowsRuntime.steps.find(
    (step: { name?: string }) => step.name === 'Bind Windows RC Framework manifest for prepared runtime',
  );
  const windowsBuilder = steps.find(
    (step) => step.name === 'Build with electron-builder (Windows)',
  );
  const frameworkBinder = steps.find(
    (step) => step.name === 'Bind Windows RC Framework manifest',
  );
  const packagedManifestBinder = steps.find(
    (step) => step.name === 'Bind packaged Windows RC Framework manifest',
  );
  const upload = steps.find((step) => step.name === 'Upload build artifacts');

  assert.match(String(macCohort?.if), /startsWith\(matrix\.platform, 'macos'\)/);
  assert.equal(windowsCohort?.if, "success() && matrix.platform == 'windows-x64'");
  assert.match(String(windowsCohort?.run), /write-windows-rc-build-cohort\.ts/);
  assert.match(String(windowsCohort?.run), /out\/win-unpacked/);
  assert.match(String(windowsCohort?.run), /-name '\*\.exe'/);
  assert.match(String(frameworkBinder?.if), /startsWith\(matrix\.platform, 'windows'\)/);
  assert.equal(frameworkBinder?.shell, 'bash');
  assert.match(String(frameworkBinder?.run), /bind-windows-rc-framework-manifest\.ts/);
  assert.match(String(frameworkBinder?.run), /--framework-ref/);
  assert.equal(packagedManifestBinder?.shell, 'bash');
  assert.match(String(packagedManifestBinder?.run), /bind-windows-rc-framework-manifest\.ts/);
  assert.match(
    String(packagedManifestBinder?.run),
    /--manifest shells\/aionui\/out\/win-unpacked\/resources\/opl-linux\/product\.json/,
  );
  assert.match(String(packagedManifestBinder?.run), /--framework-ref/);
  assert.ok(
    steps.findIndex((step) => step.name === 'Bind packaged Windows RC Framework manifest') >
      steps.findIndex((step) => step.name === 'Build with electron-builder (Windows)'),
  );
  assert.ok(
    steps.findIndex((step) => step.name === 'Write Windows RC build artifact cohort manifest') >
      steps.findIndex((step) => step.name === 'Bind packaged Windows RC Framework manifest'),
  );
  assert.match(String(windowsNativeRebuild?.run), /Start-Process[\s\S]+prebuild-install/);
  assert.match(String(windowsNativeRebuild?.run), /\$prebuild\.ExitCode -ne 0/);
  assert.match(String(windowsNativeRebuild?.run), /falling back to electron-rebuild/);
  assert.match(String(windowsNativeRebuild?.run), /\$needsElectronRebuild = \$prebuildFailed -or -not \(Test-Path \$sqliteNode\)/);
  assert.match(String(windowsNativeRebuild?.run), /if \(\$needsElectronRebuild\) \{[\s\S]+Remove-Item \$sqliteNode[\s\S]+bunx electron-rebuild/);
  assert.match(String(windowsNativeRebuild?.run), /electron-rebuild failed with exit code \$LASTEXITCODE/);
  assert.match(String(windowsRuntime?.if), /contains\(inputs\.matrix, 'windows'\)/);
  assert.equal(shellResolver.outputs.shell_sha, '${{ steps.resolve.outputs.shell_sha }}');
  const resolverCheckout = shellResolver.steps.find(
    (step: { name?: string }) => step.name === 'Checkout requested active shell ref',
  );
  assert.equal(resolverCheckout?.with?.ref, "${{ inputs.shell_ref || 'main' }}");
  assert.match(String(shellResolver.steps.find((step: { id?: string }) => step.id === 'resolve')?.run), /git rev-parse HEAD/);
  assert.deepEqual(windowsRuntime.needs, ['resolve-active-shell-ref']);
  assert.equal(
    windowsRuntime.steps.find((step: { name?: string }) => step.name === 'Checkout active shell')?.with?.ref,
    '${{ needs.resolve-active-shell-ref.outputs.shell_sha }}',
  );
  assert.ok((reusable.jobs.build.needs as string[]).includes('resolve-active-shell-ref'));
  assert.equal(
    steps.find((step) => step.name === 'Checkout active shell')?.with?.ref,
    '${{ needs.resolve-active-shell-ref.outputs.shell_sha }}',
  );
  assert.equal(preparedRuntimeBinder?.shell, 'bash');
  assert.match(String(preparedRuntimeBinder?.run), /bind-windows-rc-framework-manifest\.ts/);
  assert.match(String(preparedRuntimeBinder?.run), /--manifest shells\/aionui\/resources\/opl-linux\/product\.json/);
  assert.match(String(preparedRuntimeBinder?.run), /--framework-ref/);
  assert.match(
    String(windowsRuntime?.steps?.find((step: { name?: string }) =>
      step.name === 'Prepare target-executed Linux runtime')?.run),
    /platform: 'linux'[\s\S]+materializeInternalSymlinksForWindows: true/,
  );
  assert.equal(
    windowsRuntimeDownload?.with?.name,
    'opl-windows-linux-runtime-${{ github.run_id }}',
  );
  assert.equal(
    windowsBuilder?.env?.AIONUI_PREPARED_AIONCORE_RUNTIME_DIR,
    '${{ runner.temp }}/opl-windows-linux-runtime',
  );
  assert.match(String(upload?.with?.path), /opl-windows-rc-build-cohort\.json/);
  assert.equal(manual.on.workflow_dispatch.inputs.shell_ref.type, 'string');
  assert.equal(manual.on.workflow_dispatch.inputs.framework_ref.type, 'string');
  assert.equal(manual.jobs['build-pipeline'].with.shell_ref, '${{ inputs.shell_ref }}');
  assert.equal(manual.jobs['build-pipeline'].with.framework_ref, '${{ inputs.framework_ref }}');
});

test('Windows RC Framework binder writes the exact ref and URLs into the packaged product manifest', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-windows-rc-framework-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifestPath = path.join(root, 'product.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ logical_distribution: 'OPL-Linux', framework_ref: 'f'.repeat(40) }),
  );

  const bound = bindWindowsRcFrameworkManifest(manifestPath, frameworkSha);
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
  assert.throws(
    () => bindWindowsRcFrameworkManifest(manifestPath, 'main'),
    /exact 40-character Git SHA/,
  );
});

test('Windows RC Framework binder recognizes a Windows file URL entrypoint', () => {
  const entry = new URL(
    'file:///D:/a/one-person-lab-app/one-person-lab-app/scripts/bind-windows-rc-framework-manifest.ts',
  );
  assert.equal(isMainModule(entry.href, entry), true);
  assert.equal(
    isMainModule(
      'file:///D:/a/one-person-lab-app/one-person-lab-app/scripts/another-script.ts',
      entry,
    ),
    false,
  );
});

test('Windows RC Preview remains blocked until exact WSL2-only release-byte acceptance', () => {
  const release = JSON.parse(fs.readFileSync(path.join(appRoot, 'contracts/app-release-channel.json'), 'utf8'));
  const execution = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts/app-windows-wsl2-execution.json'), 'utf8'),
  );
  const install = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts/app-install-exposure-policy.json'), 'utf8'),
  );
  const target = release.distribution_semantics.approved_targets.windows_x64_rc_preview;
  const routing = install.distribution_install_model.platform_routing.windows_personal;

  assert.equal(target.mainline_source_absorption_allowed, true);
  assert.equal(target.existing_stable_latest_dependency_allowed, false);
  assert.equal(target.existing_stable_latest_gate_allowed, false);
  assert.equal(target.quality, 'preview');
  assert.equal(target.prerelease_required, true);
  assert.equal(target.latest_allowed, false);
  assert.equal(target.stable_updater_allowed, false);
  assert.equal(target.homebrew_allowed, false);
  assert.equal(target.runtime_execution_substrate, 'dedicated_opl_linux_wsl2');
  assert.equal(target.current_wsl2_only_terminal_claim, false);
  assert.ok(target.blocking_publication_gates.includes(
    'wsl2_only_runtime_for_every_codex_backed_path_without_native_fallback',
  ));
  assert.equal(routing.current_default_runtime_form, 'container_webui');
  assert.equal(routing.desktop_preview_changes_default_route, false);
  assert.equal(routing.wsl2_only_supported_desktop_target_requires_exact_release_acceptance, true);
  assert.equal(execution.release_boundary.mainline_source_absorption_allowed, true);
  assert.equal(execution.release_boundary.existing_stable_latest_dependency_allowed, false);
  assert.equal(execution.release_boundary.existing_stable_latest_gate_allowed, false);

  for (const workflowName of ['release-stable.yml', '_release-bundle.yml', '_release-standard-publish.yml']) {
    const workflow = fs.readFileSync(path.join(appRoot, '.github', 'workflows', workflowName), 'utf8');
    assert.doesNotMatch(workflow, /windows_x64_rc_preview|windows-rc|win-x64/i);
  }
});

test('Windows install guide binds the exact RC assets and preserves credential and SmartScreen boundaries', () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(
      appRoot,
      'docs/delivery/user-guides/windows-app-install/source/windows-app-install.quarto.json',
    ),
    'utf8',
  ));
  const guide = fs.readFileSync(path.join(appRoot, 'docs/guides/windows-app-install/guide.qmd'), 'utf8');

  assert.equal(manifest.state, 'active_preview');
  assert.equal(manifest.download.installer_asset, 'One-Person-Lab-26.7.26-rc.1-win-x64.exe');
  assert.match(manifest.download.preview_release_url, /windows-rc-26\.7\.26-rc\.1$/);
  for (const term of manifest.required_terms) assert.match(guide, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const phrase of manifest.forbidden_phrases) assert.doesNotMatch(guide, new RegExp(phrase));
  assert.match(guide, /密码、token 和 API Key 不应进入 PowerShell/);
  assert.match(guide, /登录只建立 Gateway 账户会话，不会代替第 6 步的模型访问确认/);
  assert.match(guide, /点击单独出现的“设为模型访问方式”/);
  assert.match(guide, /不要关闭\s+Microsoft Defender/);
  assert.match(guide, /这个 RC 的所有 Codex-backed 执行都进入 App 专用的 `OPL-Linux`/);
  assert.doesNotMatch(guide, /当前 RC 的桌面会话仍使用随包的原生 Windows/);
});
