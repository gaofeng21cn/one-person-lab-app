import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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
import { resolveReleasePlatformMatrix } from '../../scripts/resolve-release-platform-matrix.ts';
import { writeSha256Sums } from '../../scripts/write-sha256-sums.ts';
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
  const managedResourcesRoot = path.join(runtimeRoot, 'managed-resources');
  const nodeRoot = path.join(
    managedResourcesRoot,
    'node',
    'node-v24.11.0-linux-x64',
    'bin',
  );
  const codexRoot = path.join(
    managedResourcesRoot,
    'cli',
    'codex',
    '0.144.6',
    'linux-x64',
    'vendor',
    'x86_64-unknown-linux-musl',
    'bin',
  );
  const managedManifest = path.join(managedResourcesRoot, 'manifest.json');
  const node = path.join(nodeRoot, 'node');
  const codex = path.join(codexRoot, 'codex');
  const distributionProductRoot = path.join(packagedTree, 'resources', 'opl-linux');
  fs.mkdirSync(nodeRoot, { recursive: true });
  fs.mkdirSync(codexRoot, { recursive: true });
  fs.mkdirSync(distributionProductRoot, { recursive: true });
  fs.writeFileSync(path.join(out, 'One-Person-Lab-26.7.26-rc.1-win-x64.exe'), 'installer');
  fs.writeFileSync(path.join(runtimeRoot, 'aioncore'), 'aioncore');
  fs.writeFileSync(path.join(runtimeRoot, 'manifest.json'), JSON.stringify({ platform: 'linux', arch: 'x64' }));
  fs.writeFileSync(
    managedManifest,
    JSON.stringify({
      schema: 'opl_aioncore_managed_resources_projection.v1',
      runtimeKey: 'linux-x64',
      source: {
        schemaVersion: 2,
        manifestSha256: 'f'.repeat(64),
        cliNames: ['claude', 'codex'],
      },
      node: {
        version: '24.11.0',
        root: 'node/node-v24.11.0-linux-x64',
        executable: 'bin/node',
      },
      projection: {
        includedCliNames: ['codex'],
        excludedCliNames: ['claude'],
        requiredAbsentPaths: [
          'cli/claude',
          'acp',
          'node_modules/@anthropic-ai/claude-code',
          'node_modules/claude-code',
          'claude',
        ],
      },
      clis: [
        {
          name: 'codex',
          version: '0.144.6',
          root: 'cli/codex/0.144.6/linux-x64',
          executable: 'vendor/x86_64-unknown-linux-musl/bin/codex',
        },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(distributionProductRoot, 'product.json'),
    JSON.stringify({
      framework_ref: frameworkSha,
      framework_install_script_url: `https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/${frameworkSha}/install.sh`,
      framework_source_archive_url: `https://github.com/gaofeng21cn/one-person-lab/archive/${frameworkSha}.tar.gz`,
    }),
  );
  fs.writeFileSync(node, 'node');
  fs.writeFileSync(codex, 'codex');
  return {
    installer: path.join(out, 'One-Person-Lab-26.7.26-rc.1-win-x64.exe'),
    packagedTree,
    managedManifest,
    node,
    codex,
  };
}

function readManagedManifest(input: ReturnType<typeof fixture>) {
  return JSON.parse(fs.readFileSync(input.managedManifest, 'utf8'));
}

function writeManagedManifest(input: ReturnType<typeof fixture>, manifest: unknown) {
  fs.writeFileSync(input.managedManifest, JSON.stringify(manifest));
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
  assert.match(cohort.runtime.node.path, /managed-resources\/node\/node-v24\.11\.0-linux-x64\/bin\/node$/);
  assert.match(
    cohort.runtime.codex.path,
    /managed-resources\/cli\/codex\/0\.144\.6\/linux-x64\/vendor\/.+\/bin\/codex$/,
  );
  assert.ok(cohort.packaged_tree.file_count >= 6);
  assert.equal(cohort.packaged_tree.sha256.length, 64);
});

test('Windows RC cohort rejects retired or malformed managed resource manifests', (t) => {
  const invalidRoot = fixture(t);
  writeManagedManifest(invalidRoot, null);
  assert.throws(() => buildCohort(invalidRoot), /must be a JSON object/);

  const retired = fixture(t);
  writeManagedManifest(retired, {
    acpTools: [{ slug: 'codex-acp', version: '1.1.2' }],
  });
  assert.throws(
    () => buildCohort(retired),
    /must not retain retired acpTools/,
  );

  const oldSchema = fixture(t);
  const oldSchemaManifest = readManagedManifest(oldSchema);
  oldSchemaManifest.schema = 'opl_aioncore_managed_resources_projection.v0';
  writeManagedManifest(oldSchema, oldSchemaManifest);
  assert.throws(() => buildCohort(oldSchema), /must use the OPL Codex-only projection schema v1/);

  const wrongRuntime = fixture(t);
  const wrongRuntimeManifest = readManagedManifest(wrongRuntime);
  wrongRuntimeManifest.runtimeKey = 'win32-x64';
  writeManagedManifest(wrongRuntime, wrongRuntimeManifest);
  assert.throws(() => buildCohort(wrongRuntime), /runtimeKey must be linux-x64/);

  const unsafePath = fixture(t);
  const unsafePathManifest = readManagedManifest(unsafePath);
  unsafePathManifest.node.root = '../node';
  writeManagedManifest(unsafePath, unsafePathManifest);
  assert.throws(() => buildCohort(unsafePath), /normalized portable relative path/);

  const rawProducer = fixture(t);
  const rawProducerManifest = readManagedManifest(rawProducer);
  delete rawProducerManifest.schema;
  rawProducerManifest.schemaVersion = 2;
  writeManagedManifest(rawProducer, rawProducerManifest);
  assert.throws(
    () => buildCohort(rawProducer),
    /must use the OPL Codex-only projection schema v1/,
  );

  const claudeMetadata = fixture(t);
  const claudeMetadataManifest = readManagedManifest(claudeMetadata);
  claudeMetadataManifest.projection.excludedCliNames = [];
  writeManagedManifest(claudeMetadata, claudeMetadataManifest);
  assert.throws(
    () => buildCohort(claudeMetadata),
    /must include only Codex and exclude Claude/,
  );
});

test('Windows RC cohort rejects every forbidden managed resource path', (t) => {
  const forbiddenPaths = [
    'cli/claude',
    'acp',
    'node_modules/@anthropic-ai/claude-code',
    'node_modules/claude-code',
    'claude',
  ];

  for (const relativePath of forbiddenPaths) {
    const input = fixture(t);
    const forbiddenPath = path.join(
      path.dirname(input.managedManifest),
      ...relativePath.split('/'),
    );
    fs.mkdirSync(path.dirname(forbiddenPath), { recursive: true });
    fs.writeFileSync(forbiddenPath, 'forbidden');

    assert.throws(
      () => buildCohort(input),
      new RegExp(`physically exclude Claude: ${relativePath.replaceAll('/', '\\/')}`),
    );
  }
});

test('Windows RC cohort rejects missing Node or missing and duplicate Codex executables', (t) => {
  const missingNode = fixture(t);
  fs.rmSync(missingNode.node);
  assert.throws(() => buildCohort(missingNode), /Node runtime executable is missing/);

  const missingCodex = fixture(t);
  fs.rmSync(missingCodex.codex);
  assert.throws(() => buildCohort(missingCodex), /Codex CLI executable is missing/);

  const duplicateCodex = fixture(t);
  const duplicateManifest = readManagedManifest(duplicateCodex);
  duplicateManifest.clis.push({ ...duplicateManifest.clis[0] });
  writeManagedManifest(duplicateCodex, duplicateManifest);
  assert.throws(
    () => buildCohort(duplicateCodex),
    /exactly one Codex CLI, found 2/,
  );
});

function buildCohort(input: ReturnType<typeof fixture>) {
  return buildWindowsRcBuildCohort({
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
}

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
  assert.match(
    String(windowsNativeRebuild?.run),
    /if \(\$needsElectronRebuild\) \{[\s\S]+Remove-Item \$sqliteNode[\s\S]+bunx --yes @electron\/rebuild@4\.2\.0 -f -w better-sqlite3/,
  );
  assert.doesNotMatch(String(windowsNativeRebuild?.run), /bunx electron-rebuild/);
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
  assert.equal(manual.on.workflow_dispatch.inputs.immutable_release_capability_evidence.type, 'string');
  assert.equal(manual.jobs['build-pipeline'].with.shell_ref, '${{ inputs.shell_ref }}');
  assert.equal(manual.jobs['build-pipeline'].with.framework_ref, '${{ inputs.framework_ref }}');
  assert.equal(
    manual.jobs['build-pipeline'].with.require_windows_updater_assets,
    "${{ needs.prepare-matrix.outputs.publication_mode == 'stable_optional_follower' && contains(needs.prepare-matrix.outputs.platform_ids, 'windows-x64') }}",
  );
  assert.equal(
    manual.jobs['build-pipeline'].with.require_windows_authenticode,
    "${{ needs.prepare-matrix.outputs.publication_mode == 'stable_optional_follower' && contains(needs.prepare-matrix.outputs.platform_ids, 'windows-x64') }}",
  );
  assert.match(manualText, /resolve-release-platform-matrix\.ts/);
  const windows = resolveReleasePlatformMatrix({ policy: 'windows_preview' }).include;
  assert.deepEqual(windows.map((row) => row.platform), ['windows-x64', 'windows-arm64']);
  assert.ok(windows.every((row) => row.os === 'windows-2022'));
  assert.deepEqual(
    resolveReleasePlatformMatrix({ policy: 'manual_all', platform: 'all' }).include.map(
      (row) => row.platform,
    ),
    [
      'macos-arm64',
      'macos-x64',
      'macos-universal',
      'linux-x64',
      'linux-arm64',
      'windows-x64',
      'windows-arm64',
    ],
  );
  assert.deepEqual(
    manual.on.workflow_dispatch.inputs.publication_mode.options,
    ['build_only', 'windows_preview_rc'],
  );
  const publish = manual.jobs['publish-selected-platforms'];
  assert.equal(publish.permissions.contents, 'write');
  assert.equal(publish.permissions.actions, 'read');
  const publisherCheckout = publish.steps.find(
    (step: { name?: string }) => step.name === 'Checkout exact App publisher source',
  );
  assert.equal(publisherCheckout?.with?.ref, '${{ needs.prepare-matrix.outputs.app_ref }}');
  assert.equal(publisherCheckout?.with?.['persist-credentials'], false);
  const publishRun = String(publish.steps.find(
    (step: { name?: string }) => step.name === 'Publish exact platform bytes as one immutable carrier',
  )?.run);
  assert.match(
    publishRun,
    /windows_preview_rc\)[\s\S]*carrier_kind=windows_preview_rc[\s\S]*expected_prerelease=true/,
  );
  assert.match(
    publishRun,
    /Windows updater assets are allowed only for an authority-selected Stable optional windows-x64 build/,
  );
  assert.match(publishRun, /opl-windows-authenticode-receipt\.json/);
  assert.equal(
    publish.steps.find(
      (step: { name?: string }) => step.name === 'Publish exact platform bytes as one immutable carrier',
    )?.env?.IMMUTABLE_RELEASE_CAPABILITY_EVIDENCE,
    '${{ inputs.immutable_release_capability_evidence }}',
  );
  assert.match(publishRun, /test "\$DISPATCH_ACTOR" = "\$REPOSITORY_OWNER"/);
  assert.match(publishRun, /validateGithubImmutableReleaseCapabilityEvidence/);
  assert.match(publishRun, /immutable-capability-evidence-digest\.txt/);
  assert.doesNotMatch(publishRun, /"repos\/\$GITHUB_REPOSITORY\/immutable-releases"/);
  assert.match(publishRun, /jq -S -n/);
  assert.match(publishRun, /test -s "\$manifest_path"/);
  assert.match(publishRun, /test "\$manifest_size" -gt 0/);
  assert.match(publishRun, /opl_app_immutable_platform_adjunct_manifest\.v1/);
  assert.match(publishRun, /immutable_release_capability_evidence_digest/);
  assert.match(publishRun, /fetch_release_including_drafts/);
  assert.match(
    publishRun,
    /gh api --paginate "repos\/\$GITHUB_REPOSITORY\/releases\?per_page=100"[\s\S]*--slurp/,
  );
  assert.match(publishRun, /\[.\[\]\[\] \| select\(.tag_name == \$tag\)\] \| length/);
  assert.match(publishRun, /gh api "repos\/\$GITHUB_REPOSITORY\/releases\/\$release_id"/);
  assert.match(publishRun, /if \[ "\$create_status" -eq 0 \]; then[\s\S]*exit 1/);
  assert.match(publishRun, /if \[ "\$upload_status" -eq 0 \]; then[\s\S]*exit 1/);
  assert.match(publishRun, /if \[ "\$publish_status" -eq 0 \]; then[\s\S]*exit 1/);
  const failureRun = String(publish.steps.find(
    (step: { name?: string }) => step.name === 'Persist typed optional publication failure',
  )?.run);
  assert.match(failureRun, /failure_stage:\$failure_stage/);
  assert.match(failureRun, /mutation_attempt_count:\$attempts/);
  assert.match(failureRun, /immutable_release_capability_evidence_digest/);
  assert.ok(
    publishRun.indexOf('test -s "$manifest_path"')
      < publishRun.indexOf('printf \'draft_release_creation\\n\''),
  );
  assert.match(publishRun, /prerelease:\$prerelease,make_latest:"false"/);
  assert.match(publishRun, /and \.prerelease == \$prerelease[\s\S]*and \.immutable == true/);
  assert.match(publishRun, /test "\$latest_after" = "\$latest_before"/);
  assert.match(publishRun, /One Person Lab Windows Preview __VERSION__/);
  assert.match(publishRun, /download-windows-preview\.ps1/);
  assert.match(publishRun, /persistent Windows BITS job/);
  assert.match(publishRun, /SHA256SUMS\.txt/);
  assert.match(publishRun, /Direct browser download remains available as a fallback/);
  assert.match(publishRun, /Docker\/WebUI as a separate installation path/);
  assert.match(publishRun, /Do not disable Microsoft Defender or SmartScreen/);
  assert.match(publishRun, /does not replace GitHub Latest/);
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

test('Windows RC Preview records exact WSL2-only public release-byte acceptance', () => {
  const release = JSON.parse(fs.readFileSync(path.join(appRoot, 'contracts/app-release-channel.json'), 'utf8'));
  const execution = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts/app-windows-wsl2-execution.json'), 'utf8'),
  );
  const install = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts/app-install-exposure-policy.json'), 'utf8'),
  );
  const target = release.distribution_semantics.approved_targets.windows_x64_rc_preview;
  const routing = install.distribution_install_model.platform_routing.windows_personal;

  assert.equal(
    release.distribution_semantics.implementation_state.windows_x64_rc_preview,
    'live_public_wsl2_only_prerelease_with_terminal_acceptance',
  );
  assert.equal(target.status, 'live_public_wsl2_only_prerelease_with_terminal_acceptance');
  assert.equal(target.mainline_source_absorption_allowed, true);
  assert.equal(target.existing_stable_latest_dependency_allowed, false);
  assert.equal(target.existing_stable_latest_gate_allowed, false);
  assert.equal(target.quality, 'preview');
  assert.equal(target.prerelease_required, true);
  assert.equal(target.latest_allowed, false);
  assert.equal(target.stable_updater_allowed, false);
  assert.equal(target.homebrew_allowed, false);
  assert.equal(target.runtime_execution_substrate, 'dedicated_opl_linux_wsl2');
  assert.equal(target.current_wsl2_only_terminal_claim, true);
  assert.ok(target.blocking_publication_gates.includes(
    'wsl2_only_runtime_for_every_codex_backed_path_without_native_fallback',
  ));
  assert.equal(routing.current_default_runtime_form, 'container_webui');
  assert.equal(routing.desktop_preview_changes_default_route, false);
  assert.equal(routing.wsl2_only_supported_desktop_target_requires_exact_release_acceptance, true);
  assert.equal(execution.release_boundary.mainline_source_absorption_allowed, true);
  assert.equal(execution.release_boundary.existing_stable_latest_dependency_allowed, false);
  assert.equal(execution.release_boundary.existing_stable_latest_gate_allowed, false);
  assert.equal(execution.provisioning.guest_network_recovery.ubuntu_software_source_dns_preflight_required, true);
  assert.equal(execution.provisioning.guest_network_recovery.transient_apt_retry_required, true);
  assert.deepEqual(execution.provisioning.guest_network_recovery.persistent_failure_classification_required, [
    'guest_dns_unavailable',
    'guest_network_unavailable',
    'guest_proxy_unavailable',
    'non_network_guest_bootstrap_failure',
  ]);
  assert.equal(execution.provisioning.guest_network_recovery.third_party_mirror_automatic_selection_allowed, false);
  assert.equal(execution.provisioning.guest_network_recovery.windows_global_proxy_mutation_allowed, false);
  assert.equal(execution.provisioning.guest_network_recovery.user_reinstall_required_after_network_failure, false);

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
  assert.equal(manifest.download.installer_asset, 'One-Person-Lab-26.7.30-rc.4-win-x64.exe');
  assert.equal(
    manifest.download.installer_sha256,
    '40a356d70f488e1687c4786e8c41346f6fbb41333a8265c91eedaf975cbeaead',
  );
  assert.equal(manifest.download.installer_size_bytes, '329575845');
  assert.match(guide, /首次配置显示 \*\*65%\*\*/);
  assert.match(guide, /guest_dns_unavailable/);
  assert.match(guide, /guest_network_unavailable/);
  assert.match(guide, /guest_proxy_unavailable/);
  assert.match(guide, /archive\.ubuntu\.com/);
  assert.match(guide, /security\.ubuntu\.com/);
  assert.match(guide, /不会自动改 Windows 全局代理/);
  assert.match(guide, /不会静默切换到未经项目验证的第三方镜像/);
  assert.equal(manifest.download.installer_size_label, '约 330 MB');
  assert.equal(manifest.download.release_tag, 'windows-rc-26.7.30-rc.4');
  assert.equal(manifest.download.download_helper_asset, 'download-windows-preview.ps1');
  assert.equal(
    manifest.download.download_helper_sha256,
    'ace814a06553acce4c85c26697de8415b15ef8d4127def1063db8752ed80449e',
  );
  assert.equal(manifest.download.download_helper_size_bytes, '10875');
  assert.equal(manifest.download.download_helper_publication_status, 'published_in_exact_windows_preview_rc');
  assert.match(manifest.download.preview_release_url, /windows-rc-26\.7\.30-rc\.4$/);
  for (const term of manifest.required_terms) assert.match(guide, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const phrase of manifest.forbidden_phrases) assert.doesNotMatch(guide, new RegExp(phrase));
  assert.match(guide, /密码、token 和 API Key 不应进入 PowerShell/);
  assert.match(guide, /登录只建立 Gateway 账户会话，不会代替第 6 步的模型访问确认/);
  assert.match(guide, /点击单独出现的“设为模型访问方式”/);
  assert.match(guide, /不要关闭\s+Microsoft Defender/);
  assert.match(guide, /BITS 持久任务/);
  assert.doesNotMatch(guide, /尚未携带下载助手|从下一份包含/);
  assert.match(guide, /不会调用 `Unblock-File`/);
  assert.match(guide, /不会自动切换到聊天群、网盘或任意第三方\s*镜像/);
  assert.match(guide, /这个 RC 的所有 Codex-backed 执行都进入 App 专用的 `OPL-Linux`/);
  assert.match(guide, /Windows Desktop App 不要求 Docker Desktop/);
  assert.match(guide, /当前安装缺少必要的内置运行组件/);
  assert.match(guide, /先点击“重启并重新检测”/);
  assert.match(guide, /点击“打开日志目录”和“复制诊断”/);
  assert.match(guide, /杀毒软件的隔离记录/);
  assert.doesNotMatch(guide, /当前 RC 的桌面会话仍使用随包的原生 Windows/);
});

test('Windows Preview checksum manifest uses portable Node hashing with byte readback', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-windows-preview-checksums-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const installer = path.join(root, 'One-Person-Lab-26.7.30-rc.2-win-x64.exe');
  const downloader = path.join(root, 'download-windows-preview.ps1');
  const output = path.join(root, 'SHA256SUMS.txt');
  fs.writeFileSync(installer, 'installer-bytes');
  fs.writeFileSync(downloader, 'downloader-bytes');

  const result = writeSha256Sums(output, [installer, downloader]);
  const expected = [installer, downloader]
    .map((filePath) => {
      const digest = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
      return `${digest}  ${path.basename(filePath)}`;
    })
    .join('\n');

  assert.equal(fs.readFileSync(output, 'utf8'), `${expected}\n`);
  assert.deepEqual(
    result.entries.map(({ name, sha256 }) => ({ name, sha256 })),
    [installer, downloader].map((filePath) => ({
      name: path.basename(filePath),
      sha256: crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
    })),
  );
});

test('Windows Preview resilient downloader is exact-release, resumable, verified, and packaged', () => {
  const downloader = fs.readFileSync(path.join(appRoot, 'scripts/download-windows-preview.ps1'), 'utf8');
  const build = fs.readFileSync(path.join(appRoot, '.github/workflows/_build-reusable.yml'), 'utf8');
  const publish = fs.readFileSync(path.join(appRoot, '.github/workflows/build-manual.yml'), 'utf8');
  const install = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts/app-install-exposure-policy.json'), 'utf8'),
  );
  const policy = install.distribution_install_model.platform_routing.windows_personal.preview_download_resilience;

  assert.equal(policy.transport, 'windows_bits_persistent_background_transfer');
  assert.equal(policy.mirror_policy.automatic_arbitrary_third_party_mirror_allowed, false);
  assert.deepEqual(policy.mirror_policy.current_additional_approved_sources, []);
  assert.equal(policy.public_github_api_required_for_download, false);
  assert.deepEqual(policy.verification_before_final_name, [
    'release_generated_helper_is_bound_to_exact_immutable_prerelease_tag_asset_digest_and_size',
    'sha256sums_exact_filename_entry',
    'release_bound_embedded_installer_digest_and_size',
    'downloaded_file_sha256',
  ]);
  assert.match(downloader, /Import-Module BitsTransfer/);
  assert.match(downloader, /Get-MatchingBitsJob/);
  assert.match(downloader, /Start-BitsTransfer[\s\S]*-Asynchronous/);
  assert.match(downloader, /Get-BitsTransfer -JobId \$job\.JobId/);
  assert.doesNotMatch(downloader, /\$job\.Id\b/);
  assert.match(downloader, /\[uint64\]::MaxValue/);
  assert.match(downloader, /total size pending/);
  assert.doesNotMatch(downloader, /\[int64\]\$job\.BytesTotal/);
  assert.match(downloader, /Resume-BitsTransfer/);
  assert.match(downloader, /Suspend-BitsTransfer/);
  assert.doesNotMatch(downloader, /"TransientError"\s*\{\s*Resume-BitsTransfer/);
  assert.match(downloader, /BytesTransferred/);
  assert.match(downloader, /BytesTotal/);
  assert.match(downloader, /\$ReleaseTag -cne \$embeddedReleaseTag/);
  assert.match(downloader, /\$AssetName -cne \$embeddedInstallerAsset/);
  assert.match(downloader, /\$expectedSha256 -cne \$embeddedInstallerSha256/);
  assert.match(downloader, /\$releaseAssetBaseUrl = "https:\/\/github\.com\/\$repository\/releases\/download\/\$ReleaseTag"/);
  assert.doesNotMatch(downloader, /api\.github\.com|Invoke-RestMethod|Invoke-WebRequest/);
  assert.match(downloader, /Get-FileHash -LiteralPath \$PathValue -Algorithm SHA256/);
  assert.match(downloader, /Test-InstallerIdentity/);
  assert.match(downloader, /Move-Item -LiteralPath \$installerDownloadPath -Destination \$installerPath/);
  assert.match(downloader, /does not discard the BITS job/);
  assert.match(downloader, /Do not disable Defender or SmartScreen/);
  assert.doesNotMatch(downloader, /Unblock-File/);
  assert.doesNotMatch(downloader, /mirror|registry-mirrors/i);
  assert.match(build, /node --experimental-strip-types \.\.\/\.\.\/scripts\/render-windows-preview-downloader\.ts/);
  assert.match(build, /--release-tag "windows-rc-\$OPL_BUILD_VERSION"/);
  assert.match(build, /--installer "\$installer_path"/);
  assert.match(build, /node --experimental-strip-types \.\.\/\.\.\/scripts\/write-sha256-sums\.ts/);
  assert.match(build, /--output out\/SHA256SUMS\.txt/);
  assert.match(build, /out\/download-windows-preview\.ps1/);
  assert.doesNotMatch(build, /shasum -a 256 .*download-windows-preview\.ps1/);
  assert.match(build, /shells\/aionui\/out\/\*\.ps1/);
  assert.match(build, /shells\/aionui\/out\/SHA256SUMS\.txt/);
  assert.match(publish, /-name 'download-windows-preview\.ps1'/);
  assert.match(publish, /-name 'SHA256SUMS\.txt'/);
  assert.match(publish, /removing the unauthenticated GitHub REST API rate-limit dependency/);
  assert.match(publish, /does not require an unauthenticated GitHub API request/);
});

test('packaged installation-integrity recovery exposes bounded diagnostics and a fresh recheck path', () => {
  const adapter = JSON.parse(fs.readFileSync(path.join(appRoot, 'contracts/app-shell-adapter.json'), 'utf8'));
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
  assert.ok(recovery.required_visible_state.includes('deduplicated_relative_missing_resource_names_when_reported'));
  assert.ok(recovery.diagnostic_copy_forbidden.includes('absolute_user_paths'));
  assert.equal(recovery.log_action.backend_http_dependency_allowed, false);
  assert.equal(recovery.self_heal_or_reinstall_success_claim_without_fresh_readback_allowed, false);
  assert.equal(recovery.smartscreen_or_security_software_bypass_allowed, false);
});
