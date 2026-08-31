import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

import { resolveReleasePlatformMatrix } from '../../scripts/resolve-release-platform-matrix.ts';
import {
  activeShellReleaseValidationProfile,
  releaseBoundaryChecksForProfile,
  releaseWorkflowPathsForProfile,
} from '../../scripts/validate-release-boundary/release-checks.ts';
import { validateReleasePlatformMatrix } from '../../scripts/validate-release-boundary/release-contract-policy.ts';
import { validateReleaseChannelContract } from '../../scripts/validate-active-shell/release-contract-validator.ts';

const appRoot = path.resolve(import.meta.dirname, '../..');
const contract = JSON.parse(
  fs.readFileSync(path.join(appRoot, 'contracts/app-release-channel.json'), 'utf8'),
);

test('Stable and Nightly core publication require only macOS ARM64', () => {
  assert.deepEqual(
    resolveReleasePlatformMatrix({ policy: 'stable_required' }).include,
    [
      {
        platform: 'macos-arm64',
        os: 'macos-latest',
        command: 'node scripts/build-with-builder.js arm64 --mac --arm64',
        'artifact-name': 'macos-build-arm64',
        arch: 'arm64',
        native_arch: 'arm64',
      },
    ],
  );
  assert.deepEqual(
    resolveReleasePlatformMatrix({ policy: 'nightly_standard' }).include.map((row) => [
      row.platform,
      row['artifact-name'],
    ]),
    [
      ['macos-arm64', 'nightly-macos-arm64'],
    ],
  );
});

test('all seven capabilities remain buildable while only macOS ARM64 blocks Stable', () => {
  const matrix = contract.release_platform_matrix;
  const capabilityIds = [
    'macos-arm64',
    'macos-x64',
    'macos-universal',
    'linux-x64',
    'linux-arm64',
    'windows-x64',
    'windows-arm64',
  ];
  assert.deepEqual(Object.keys(matrix.capabilities), capabilityIds);
  assert.deepEqual(
    resolveReleasePlatformMatrix({ policy: 'manual_all', platform: 'all' }).include.map(
      (row) => row.platform,
    ),
    capabilityIds,
  );
  assert.equal(matrix.capabilities['macos-arm64'].default_enabled, true);
  assert.equal(matrix.capabilities['macos-arm64'].blocks_stable, true);
  assert.equal(matrix.capabilities['linux-x64'].default_enabled, true);
  assert.equal(matrix.capabilities['windows-x64'].default_enabled, true);
  assert.equal(matrix.capabilities['linux-x64'].blocks_stable, false);
  for (const id of ['macos-x64', 'macos-universal', 'linux-arm64', 'windows-arm64']) {
    assert.equal(matrix.capabilities[id].default_enabled, false);
    assert.equal(matrix.capabilities[id].blocks_stable, false);
    assert.equal(matrix.capabilities[id].stable_allowed, false);
    assert.equal(matrix.capabilities[id].publication_status, 'development_validation_only');
    assert.equal(matrix.capabilities[id].publication_route, null);
  }
  for (const id of ['linux-x64', 'windows-x64']) {
    assert.equal(matrix.capabilities[id].stable_allowed, true);
    assert.ok(matrix.capabilities[id].quality_channels.includes('stable'));
  }
  for (const id of capabilityIds) {
    if (['macos-x64', 'macos-universal', 'linux-arm64', 'windows-arm64'].includes(id)) {
      assert.equal(matrix.capabilities[id].publication_route, null);
    } else {
      assert.equal(typeof matrix.capabilities[id].publication_route, 'string');
    }
    assert.doesNotMatch(matrix.capabilities[id].publication_status, /unavailable/);
  }
});

test('Stable additional Desktop publication is limited to Linux x64 and Windows x64 on the same Release', () => {
  assert.deepEqual(
    contract.release_platform_matrix.policies.stable_desktop_additional.platforms,
    ['linux-x64', 'windows-x64'],
  );
  assert.deepEqual(
    contract.release_platform_matrix.stable_desktop_additional_selection.default,
    ['linux-x64', 'windows-x64'],
  );
  assert.equal(
    contract.release_platform_matrix.desktop_platform_additive_follower.base_release_must_be_published_mutable,
    true,
  );
  assert.equal(
    contract.release_platform_matrix.desktop_platform_additive_follower.new_release_or_tag_allowed,
    false,
  );
  for (const id of ['macos-x64', 'macos-universal', 'linux-arm64']) {
    const capability = contract.release_platform_matrix.capabilities[id];
    assert.equal(capability.stable_allowed, false);
    assert.equal(capability.publication_status, 'development_validation_only');
    assert.equal(capability.publication_route, null);
  }
  const productProfile = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts/app-product-profile.json'), 'utf8'),
  );
  assert.deepEqual(productProfile.product.target_desktop_platforms, ['macos', 'windows', 'linux']);
  assert.deepEqual(productProfile.release_roles.current.admitted_product_platforms, ['macos-arm64']);
  assert.equal(productProfile.release_roles.current.release_channel_ref, 'contracts/app-release-channel.json');
  assert.equal(productProfile.release_roles.successor.target_platforms_are_not_current_release_evidence, true);
  assert.equal('supported_release_platforms' in productProfile.product, false);
});

test('optional Stable publication defaults to Linux x64 plus Windows x64 and remains authority-overridable', () => {
  assert.deepEqual(
    resolveReleasePlatformMatrix({ policy: 'stable_desktop_additional' }).include.map((row) => row.platform),
    ['linux-x64', 'windows-x64'],
  );
  assert.deepEqual(
    resolveReleasePlatformMatrix({ policy: 'stable_desktop_additional', platforms: ['linux-x64'] }).include.map(
      (row) => row.platform,
    ),
    ['linux-x64'],
  );
});

test('resolver accepts only audited policy and platform IDs', () => {
  assert.throws(
    () => resolveReleasePlatformMatrix({ policy: '{"include":[]}' }),
    /Unknown audited release platform policy/,
  );
  assert.throws(
    () => resolveReleasePlatformMatrix({ policy: 'stable_required', platform: 'windows-x64' }),
    /allowed only with manual_all/,
  );
  assert.throws(
    () => resolveReleasePlatformMatrix({ policy: 'manual_all', platform: 'custom-shell-command' }),
    /outside audited policy/,
  );
  assert.deepEqual(
    resolveReleasePlatformMatrix({
      policy: 'stable_desktop_additional',
      platforms: ['windows-x64'],
    }).include.map((entry) => entry.platform),
    ['windows-x64'],
  );
  for (const platform of ['macos-x64', 'macos-universal', 'linux-arm64', 'windows-arm64']) {
    assert.throws(
      () => resolveReleasePlatformMatrix({ policy: 'stable_desktop_additional', platforms: [platform] }),
      /outside audited policy/,
      `${platform} must remain outside the additional Stable Desktop selection`,
    );
  }
  assert.deepEqual(
    resolveReleasePlatformMatrix({
      policy: 'stable_desktop_additional',
      platforms: ['windows-x64'],
    }).include,
    [{
      platform: 'windows-x64',
      os: 'windows-latest',
      command: 'node scripts/build-with-builder.js x64 --win --x64',
      'artifact-name': 'stable-desktop-windows-x64',
      arch: 'x64',
    }],
  );
});

test('workflow callers consume resolver output while reusable build keeps generic matrix input', () => {
  const stable = parseYaml(
    fs.readFileSync(path.join(appRoot, '.github/workflows/release-stable.yml'), 'utf8'),
  ) as any;
  const bundle = parseYaml(
    fs.readFileSync(path.join(appRoot, '.github/workflows/_release-bundle.yml'), 'utf8'),
  ) as any;
  const nightly = parseYaml(
    fs.readFileSync(path.join(appRoot, '.github/workflows/release-nightly.yml'), 'utf8'),
  ) as any;
  const manual = parseYaml(
    fs.readFileSync(path.join(appRoot, '.github/workflows/build-manual.yml'), 'utf8'),
  ) as any;
  const reusable = parseYaml(
    fs.readFileSync(path.join(appRoot, '.github/workflows/_build-reusable.yml'), 'utf8'),
  ) as any;
  const packageValidation = parseYaml(
    fs.readFileSync(path.join(appRoot, '.github/workflows/windows-updater-package-validation.yml'), 'utf8'),
  ) as any;

  assert.equal(stable.on.workflow_dispatch.inputs.desktop_additional_platforms.default, '["linux-x64","windows-x64"]');
  assert.equal(bundle.on.workflow_call.inputs.stable_desktop_additional_platforms.default, '["linux-x64","windows-x64"]');
  assert.equal(bundle.jobs['standard-build'].with.matrix, '${{ needs.resolve-platform-matrix.outputs.matrix }}');
  assert.equal(bundle.jobs['standard-build'].with.release_validation_profile, 'stable');
  const bundleMatrixRun = String(
    bundle.jobs['resolve-platform-matrix'].steps.find((step: any) => step.id === 'resolve')?.run,
  );
  assert.match(bundleMatrixRun, /stable\) policy=stable_required/);
  assert.match(bundleMatrixRun, /preview\) policy=preview_standard/);
  assert.match(bundleMatrixRun, /--policy "\$policy"/);
  assert.equal(nightly.jobs['standard-build'].with.matrix, '${{ needs.admission.outputs.matrix }}');
  assert.equal(nightly.jobs['standard-build'].with.release_validation_profile, 'stable');
  assert.match(
    String(nightly.jobs.admission.steps.find((step: any) => step.id === 'platforms')?.run),
    /--policy nightly_standard/,
  );
  const manualRun = String(manual.jobs['prepare-matrix'].steps.find(
    (step: any) => step.id === 'set-matrix',
  )?.run);
  assert.match(manualRun, /--policy manual_all/);
  assert.match(manualRun, /--platform '\$\{\{ inputs\.platform \}\}'/);
  assert.equal(reusable.on.workflow_call.inputs.matrix.type, 'string');
  assert.equal(reusable.on.workflow_call.inputs.matrix.required, true);
  assert.equal(reusable.on.workflow_call.inputs.release_validation_profile.default, 'aggregate');
  assert.equal(reusable.on.workflow_call.inputs.require_windows_updater_assets.default, false);
  assert.equal(reusable.on.workflow_call.inputs.require_windows_authenticode.default, false);
  assert.equal(reusable.on.workflow_call.inputs.require_macos_gatekeeper.default, false);
  const windowsBuild = reusable.jobs.build.steps.find(
    (step: any) => step.name === 'Build with electron-builder (Windows)',
  );
  assert.match(String(windowsBuild?.run), /config\.nsis\.differentialPackage=true/);
  assert.doesNotMatch(String(windowsBuild?.run), /config\.publish\.(?:provider|url)=/);
  const updaterValidation = reusable.jobs.build.steps.find(
    (step: any) => step.name === 'Validate exact Windows updater asset set',
  );
  assert.equal(
    updaterValidation?.if,
    "matrix.platform == 'windows-x64' && inputs.require_windows_updater_assets",
  );
  assert.match(String(updaterValidation?.run), /validate-windows-updater-assets\.ts/);
  const authenticodeValidation = reusable.jobs.build.steps.find(
    (step: any) => step.name === 'Verify timestamped Windows Authenticode signature',
  );
  assert.equal(
    authenticodeValidation?.if,
    "matrix.platform == 'windows-x64' && inputs.require_windows_authenticode",
  );
  assert.match(String(authenticodeValidation?.run), /Get-AuthenticodeSignature/);
  assert.match(String(authenticodeValidation?.run), /TimeStamperCertificate/);
  const artifactCleanup = reusable.jobs.build.steps.find(
    (step: any) => step.name === 'Clean up non-installer artifacts',
  );
  assert.match(String(artifactCleanup?.run), /! -name 'latest\.yml'/);
  assert.match(String(artifactCleanup?.run), /\.exe\.blockmap/);
  const artifactUpload = reusable.jobs.build.steps.find(
    (step: any) => step.name === 'Upload build artifacts',
  );
  assert.match(String(artifactUpload?.with?.path), /opl-windows-updater-assets\.json/);
  assert.match(String(artifactUpload?.with?.path), /opl-windows-authenticode-receipt\.json/);
  assert.doesNotMatch(String(artifactUpload?.with?.path), /latest-(?:x64-)?mac\.yml/);
  assert.deepEqual(packageValidation.permissions, { contents: 'read' });
  assert.equal(packageValidation.jobs['build-windows-updater-package']['runs-on'], 'windows-latest');
  const validationBuild = packageValidation.jobs['build-windows-updater-package'].steps.find(
    (step: any) => step.name === 'Build updater-capable Windows x64 package',
  );
  assert.match(String(validationBuild?.run), /config\.nsis\.differentialPackage=true/);
  assert.doesNotMatch(String(validationBuild?.run), /config\.publish\.(?:provider|url)=/);
  const validationUpload = packageValidation.jobs['build-windows-updater-package'].steps.find(
    (step: any) => step.name === 'Upload non-published updater validation assets',
  );
  assert.match(String(validationUpload?.with?.path), /latest\.yml/);
  assert.match(String(validationUpload?.with?.path), /\.exe\.blockmap/);
  assert.match(String(validationUpload?.with?.path), /opl-windows-updater-assets\.json/);
  assert.equal(packageValidation.jobs['build-windows-updater-package'].permissions, undefined);
  const releaseBoundary = reusable.jobs['release-boundary'];
  assert.equal(
    releaseBoundary.steps.find((step: any) => step.name === 'Run audited release-boundary profile')
      ?.env?.OPL_RELEASE_VALIDATION_PROFILE,
    '${{ inputs.release_validation_profile }}',
  );
});

test('Stable profile excludes only Windows-specific checks and retains the unified clean-VM workflow', () => {
  const stableIds = new Set(releaseBoundaryChecksForProfile('stable').map((check) => check.id));
  const windowsIds = new Set(
    releaseBoundaryChecksForProfile('windows').map((check) => check.id),
  );
  assert.equal(stableIds.has('docker_webui_clean_vm_workflow'), true);
  assert.equal(windowsIds.has('docker_webui_clean_vm_workflow'), true);
  assert.equal(stableIds.has('immutable_release_bundle_workflow'), true);
  assert.equal(stableIds.has('nightly_standard_release_entry'), true);
  assert.ok(releaseWorkflowPathsForProfile('stable').includes('.github/workflows/_build-reusable.yml'));
  assert.ok(releaseWorkflowPathsForProfile('stable').includes('.github/workflows/build-manual.yml'));
  assert.equal(
    releaseWorkflowPathsForProfile('stable').includes(
      '.github/workflows/docker-webui-clean-vm.yml',
    ),
    true,
  );
});

test('Stable validation fails closed when a required same-Release Desktop route drifts', () => {
  const changed = structuredClone(contract);
  changed.release_platform_matrix.capabilities['windows-x64'].publication_route = null;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    assert.ok(validateReleasePlatformMatrix(changed, 'stable') > 0);
    assert.ok(validateReleasePlatformMatrix(changed, 'aggregate') > 0);
    assert.ok(validateReleasePlatformMatrix(changed, 'windows') > 0);
  } finally {
    console.error = originalConsoleError;
  }
  assert.throws(
    () => validateReleaseChannelContract(changed, null, 'stable'),
    /Release platform matrix/,
  );
  assert.throws(
    () => validateReleaseChannelContract(changed, null, 'aggregate'),
    /Release platform matrix/,
  );
  assert.throws(
    () => validateReleaseChannelContract(changed, null, 'windows'),
    /Release platform matrix/,
  );
});

test('active-shell quick validation defaults to Stable while full validation remains aggregate', () => {
  assert.equal(activeShellReleaseValidationProfile(true, ''), 'stable');
  assert.equal(activeShellReleaseValidationProfile(false, ''), 'aggregate');
  assert.equal(activeShellReleaseValidationProfile(true, 'windows'), 'windows');
  assert.throws(
    () => activeShellReleaseValidationProfile(true, 'unsupported'),
    /Unsupported OPL_RELEASE_VALIDATION_PROFILE/,
  );
});

test('verify release-boundary selector executes aggregate as the complete release test set', () => {
  const verify = fs.readFileSync(path.join(appRoot, 'scripts/verify.sh'), 'utf8');
  const selector = verify.match(
    /node --experimental-strip-types --input-type=module - "\$profile" <<'NODE'\n([\s\S]*?)\nNODE/,
  )?.[1];
  assert.ok(selector, 'release-boundary test selector must remain executable from verify.sh');

  const releaseTests = fs.readdirSync(path.join(appRoot, 'tests/release'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => path.posix.join('tests/release', entry.name));
  const boundaryTests = fs.readdirSync(
    path.join(appRoot, 'tests/release/app-release-boundary-cases'),
    { withFileTypes: true },
  )
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => path.posix.join('tests/release/app-release-boundary-cases', entry.name));
  const allTests = [...releaseTests, ...boundaryTests].sort();
  const windowsOwned = contract.release_platform_matrix.validation_ownership.windows
    .owned_test_paths as string[];

  const select = (profile: string) => {
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--input-type=module', '-', profile],
      { cwd: appRoot, encoding: 'utf8', input: selector },
    );
    return {
      ...result,
      files: result.stdout.trim().split('\n').filter(Boolean),
    };
  };

  const aggregate = select('aggregate');
  assert.equal(aggregate.status, 0, aggregate.stderr);
  assert.deepEqual(aggregate.files, allTests);

  const stable = select('stable');
  assert.equal(stable.status, 0, stable.stderr);
  assert.deepEqual(stable.files, allTests.filter((file) => !windowsOwned.includes(file)));

  const windows = select('windows');
  assert.equal(windows.status, 0, windows.stderr);
  assert.deepEqual(windows.files, [...windowsOwned].sort());

  const unsupported = select('unsupported');
  assert.notEqual(unsupported.status, 0);
  assert.match(unsupported.stderr, /Unsupported release validation profile: unsupported/);
});

test('Windows-only Docker/WebUI cases live only in the Windows-owned test file', () => {
  const windowsOwned = contract.release_platform_matrix.validation_ownership.windows
    .owned_test_paths;
  assert.ok(windowsOwned.includes('tests/release/docker-webui-windows-installer.test.ts'));
  assert.equal(windowsOwned.includes('tests/release/docker-webui-installer.test.ts'), false);
  const sharedInstallerTests = fs.readFileSync(
    path.join(appRoot, 'tests/release/docker-webui-installer.test.ts'),
    'utf8',
  );
  assert.doesNotMatch(sharedInstallerTests, /test\(['"`][^\n]*Windows/);
});

test('Full macOS publication is self-identified, same-tag additive, recoverable, and non-blocking', () => {
  const follower = contract.release_platform_matrix.full_macos_additive_follower;
  assert.equal(follower.workflow, '.github/workflows/release-stable-post-success-followups.yml');
  assert.equal(follower.manual_operation, 'reconcile_full_addon');
  assert.equal(
    follower.trigger,
    'successful_standard_publication_or_manual_target_state_reconcile',
  );
  assert.equal(follower.source_policy, 'full_artifact_self_identity_plus_exact_mutable_standard_asset_set_cas');
  assert.equal(follower.standard_release_prerequisite_required, true);
  assert.equal(follower.cross_component_exact_version_sha_or_cohort_binding_allowed, false);
  assert.equal(
    follower.compatibility_contract_ref,
    'contracts/app-install-exposure-policy.json#component_interoperability.compatibility_admission',
  );
  assert.equal(follower.operation, 'append_full');
  assert.equal(follower.carrier, 'same_standard_release_assets');
  assert.equal(follower.tag_derivation, 'none_use_exact_standard_tag');
  assert.equal(follower.new_release_or_tag_allowed, false);
  assert.equal(follower.target_release_must_be_mutable, true);
  assert.equal(follower.standard_asset_or_latest_mutation_allowed, false);
  assert.deepEqual(follower.target_standard_reference.required_fields, [
    'repository',
    'release_id',
    'tag',
    'target_commitish',
    'immutable',
    'standard_asset_set',
    'standard_attestation',
  ]);
  assert.equal(follower.target_standard_reference.purpose, 'same_release_append_target_and_standard_asset_cas');
  assert.equal(follower.target_standard_reference.cross_component_compatibility_gate_allowed, false);
  assert.equal(follower.blocks_stable_base_terminal, false);
  assert.equal(follower.blocks_latest_activation, false);
  assert.equal(follower.failure_receipt_required, true);
  assert.equal(
    follower.recovery,
    'target_state_reconcile_with_current_canonical_executor_and_no_failed_run_inputs',
  );
  assert.equal(
    follower.automatic_checkpoint_reuse,
    'latest_nonexpired_full_or_append_operation_checkpoint_with_exact_full_content_cohort_in_the_standard_recovery_chain',
  );
  assert.equal(follower.one_active_owner_per_recovery_chain, true);
});

test('additional Desktop platform publication is an independent protected post-success operation', () => {
  const dispatcher = parseYaml(
    fs.readFileSync(
      path.join(appRoot, '.github/workflows/release-stable-post-success-followups.yml'),
      'utf8',
    ),
  ) as any;
  const platformAddon = parseYaml(
    fs.readFileSync(
      path.join(appRoot, '.github/workflows/_release-desktop-platform-addon.yml'),
      'utf8',
    ),
  ) as any;
  const manual = parseYaml(
    fs.readFileSync(path.join(appRoot, '.github/workflows/build-manual.yml'), 'utf8'),
  ) as any;
  const reconcile = dispatcher.jobs['reconcile-desktop-platforms'];
  assert.equal(reconcile.strategy['fail-fast'], false);
  assert.equal(reconcile.uses, './.github/workflows/_release-desktop-platform-addon.yml');
  assert.equal(reconcile.with.platform_id, '${{ matrix.platform_id }}');
  assert.deepEqual(reconcile.permissions, { contents: 'write', actions: 'read' });

  const build = platformAddon.jobs['build-platform'];
  const append = platformAddon.jobs['append-platform'];
  assert.equal(build.uses, './.github/workflows/build-manual.yml');
  assert.equal(build.with.invocation_mode, 'stable_release_set_build');
  assert.equal(build.with.platform_policy, 'stable_desktop_additional');
  assert.equal(build.with.platform_ids, '${{ format(\'["{0}"]\', inputs.platform_id) }}');
  assert.equal(build.with.opl_updater_version, '${{ inputs.updater_version }}');
  assert.equal(
    build.with.skip_code_quality,
    '${{ needs.verify-standard-quality.outputs.skip_code_quality }}',
  );
  assert.deepEqual(build.needs, ['verify-standard-quality']);
  assert.equal(build.concurrency, undefined);
  assert.equal(append.environment, 'release-stable');
  assert.deepEqual(append.concurrency, {
    group: 'opl-release-bundle-global',
    'cancel-in-progress': false,
  });
  assert.deepEqual(append.permissions, { contents: 'write', actions: 'read' });
  const manualMatrixRun = String(
    manual.jobs['prepare-matrix'].steps.find((step: any) => step.id === 'set-matrix')?.run,
  );
  assert.match(
    manualMatrixRun,
    /Stable Release Set accepts only canonical Linux x64 and Windows x64 Desktop subsets/,
  );
  assert.match(manualMatrixRun, /\. == \["linux-x64", "windows-x64"\]/);
  assert.equal(
    manual.jobs['build-pipeline'].with.require_windows_updater_assets,
    "${{ inputs.invocation_mode == 'stable_release_set_build' && contains(needs.prepare-matrix.outputs.platform_ids, 'windows-x64') }}",
  );
  assert.equal(
    manual.jobs['build-pipeline'].with.require_windows_authenticode,
    false,
  );
  assert.equal(
    manual.jobs['build-pipeline'].with.require_macos_gatekeeper,
    "${{ needs.prepare-matrix.outputs.macos_x64_signed_development_validation == 'true' }}",
  );
  assert.equal(manual.jobs['build-pipeline'].with.operation, undefined);
  assert.equal(
    manual.jobs['build-pipeline'].with.cache_role,
    "${{ inputs.invocation_mode == 'stable_release_set_build' && 'stable_desktop_additional' || '' }}",
  );
  assert.equal(
    manual.jobs['build-pipeline'].with.release_bundle_digest,
    "${{ inputs.invocation_mode == 'stable_release_set_build' && inputs.source_bundle_digest || '' }}",
  );
  assert.equal(
    manual.jobs['build-pipeline'].with.release_cohort_ref,
    "${{ inputs.invocation_mode == 'stable_release_set_build' && inputs.source_bundle_digest || '' }}",
  );
  assert.equal(manual.jobs['publish-selected-platforms'], undefined);
  assert.equal(manual.on.workflow_dispatch.inputs.publication_mode, undefined);
  assert.equal(manual.on.workflow_dispatch.inputs.immutable_release_capability_evidence, undefined);
  const manualSource = fs.readFileSync(
    path.join(appRoot, '.github/workflows/build-manual.yml'),
    'utf8',
  );
  assert.doesNotMatch(manualSource, /windows_preview_rc|windows-rc-|release-preview|gh release upload/);
});
