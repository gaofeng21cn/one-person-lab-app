import {
  assert,
  appRoot,
  fs,
  os,
  path,
  test,
  runNode,
} from './helpers.ts';
import { validateInstallExposureRuntimeAndDistribution } from '../../../scripts/validate-active-shell/install-exposure-runtime-distribution-validator.ts';
import { validateReleaseChannelContract } from '../../../scripts/validate-active-shell/release-contract-validator.ts';
import {
  appOwnedStorageCarrierBehavior,
  appOwnedWebuiDataVolumeHostActionCapabilityId,
} from '../../../scripts/validate-active-shell/app-contract-constants.ts';

test('Full skill carrier seeds do not discover Flow dependencies or managed-home payloads', () => {
  const source = fs.readFileSync(
    path.join(appRoot, 'scripts', 'build-full-first-install-package', 'skills.ts'),
    'utf8',
  );
  assert.doesNotMatch(source, /opl-flow-capability-policy|workflow-policy\.json/);
  assert.doesNotMatch(source, /\.skills-manager|\.codex['"],\s*['"]skills/);
  assert.match(source, /readAppProductProfile\(\)/);
  assert.match(source, /companion_payloads\.default_packaged_codex_skill_ids/);
});

test('Homebrew tap updater is a local cohort-bound manifest and checksum planner', () => {
  const tapRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-homebrew-tap-test-'));
  const digest = 'b'.repeat(64);
  const releaseUrl = (version: string, assetName: string) =>
    `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/v${version}/${assetName}`;
  const standardDmg = (version: string) => `One-Person-Lab-${version}-mac-arm64.dmg`;
  const fullDmg = (version: string) => `One-Person-Lab-Full-${version}-mac-arm64.dmg`;
  const runTap = ({
    channel = 'stable',
    packageKind,
    version = '26.6.4',
    updaterVersion = version,
    targetFlag = '--cask',
    target,
    manifest,
    download,
    checksum = digest,
    remoteWriteMode,
    expectedCurrentCaskSha256,
    write = false,
  }: {
    channel?: string;
    packageKind?: string;
    version?: string;
    updaterVersion?: string;
    targetFlag?: '--cask' | '--formula';
    target: string;
    manifest: string;
    download: string;
    checksum?: string;
    remoteWriteMode?: string;
    expectedCurrentCaskSha256?: string;
    write?: boolean;
  }) => runNode([
    'scripts/update-homebrew-tap.ts',
    '--channel',
    channel,
    ...(packageKind ? ['--package-kind', packageKind] : []),
    '--version',
    version,
    '--updater-version',
    updaterVersion,
    '--tap-root',
    tapRoot,
    targetFlag,
    target,
    '--manifest-url',
    releaseUrl(version, manifest),
    '--checksum-sha256',
    checksum,
    '--download-url',
    releaseUrl(version, download),
    ...(remoteWriteMode ? ['--remote-write-mode', remoteWriteMode] : []),
    ...(expectedCurrentCaskSha256
      ? ['--expected-current-cask-sha256', expectedCurrentCaskSha256]
      : []),
    ...(write ? ['--write'] : []),
  ]);

  const stableResult = runTap({
    target: 'Casks/one-person-lab.rb',
    manifest: 'latest-arm64-mac.yml',
    download: standardDmg('26.6.4'),
    write: true,
  });
  assert.equal(stableResult.status, 0, stableResult.stderr || stableResult.stdout);
  const stablePlan = JSON.parse(stableResult.stdout);
  assert.equal(stablePlan.channel, 'stable');
  assert.equal(stablePlan.schema, 'opl_homebrew_tap_cas_plan.v1');
  assert.equal(stablePlan.cas.decision, 'write_once');
  assert.equal(stablePlan.cas.write_performed, true);
  assert.equal(stablePlan.package_kind, 'app_standard');
  assert.equal(stablePlan.policy.manifest_required, true);
  assert.equal(stablePlan.policy.checksum_required, true);
  assert.equal(stablePlan.policy.full_first_install_allowed, false);
  assert.equal(stablePlan.policy.homebrew_allowed_software_objects, 'opl_base,opl_app');
  assert.equal(stablePlan.policy.opl_packages_lifecycle_owned_by_homebrew, false);
  assert.equal(stablePlan.policy.opl_packages_lifecycle_owner, 'one-person-lab');
  assert.equal(stablePlan.policy.package_specific_formula_allowed, false);
  assert.equal(stablePlan.policy.package_specific_cask_allowed, false);
  assert.equal(stablePlan.policy.stable_promotion_from_nightly_allowed, false);
  assert.equal(stablePlan.policy.publishes_or_pushes_remote, false);
  const stableCask = fs.readFileSync(path.join(tapRoot, 'Casks', 'one-person-lab.rb'), 'utf8');
  assert.match(stableCask, /latest-arm64-mac\.yml/);
  assert.match(stableCask, new RegExp(digest));
  assert.match(stableCask, /\n  # OPL_HOMEBREW_BOUNDARY_START\n  # channel: stable/);
  assert.match(stableCask, /full_first_install_allowed: false/);
  assert.match(stableCask, /homebrew_allowed_software_objects: opl_base,opl_app/);
  assert.match(stableCask, /opl_packages_lifecycle_owned_by_homebrew: false/);
  assert.match(stableCask, /opl_packages_lifecycle_owner: one-person-lab/);
  assert.match(stableCask, /package_specific_formula_allowed: false/);
  assert.match(stableCask, /package_specific_cask_allowed: false/);
  assert.match(stableCask, /conflicts_with cask: \["one-person-lab-full", "one-person-lab-nightly"\]/);
  assert.match(stableCask, /depends_on formula: "opl"/);
  const stableCaskSha = stablePlan.targets[0].expected_cask_sha256;

  const idempotentInspect = runTap({
    target: 'Casks/one-person-lab.rb',
    manifest: 'latest-arm64-mac.yml',
    download: standardDmg('26.6.4'),
    remoteWriteMode: 'inspect_only',
  });
  assert.equal(idempotentInspect.status, 0, idempotentInspect.stderr || idempotentInspect.stdout);
  const idempotentPlan = JSON.parse(idempotentInspect.stdout);
  assert.equal(idempotentPlan.cas.decision, 'idempotent');
  assert.equal(idempotentPlan.cas.write_performed, false);
  assert.equal(idempotentPlan.targets[0].current_cask_sha256, stableCaskSha);
  assert.equal(idempotentPlan.targets[0].expected_cask_sha256, stableCaskSha);
  assert.equal(fs.readFileSync(path.join(tapRoot, 'Casks', 'one-person-lab.rb'), 'utf8'), stableCask);

  const conflictingDigestInspect = runTap({
    target: 'Casks/one-person-lab.rb',
    manifest: 'latest-arm64-mac.yml',
    download: standardDmg('26.6.4'),
    checksum: 'c'.repeat(64),
    remoteWriteMode: 'inspect_only',
  });
  assert.equal(conflictingDigestInspect.status, 0, conflictingDigestInspect.stderr || conflictingDigestInspect.stdout);
  assert.equal(JSON.parse(conflictingDigestInspect.stdout).cas.decision, 'version_conflict');
  assert.equal(fs.readFileSync(path.join(tapRoot, 'Casks', 'one-person-lab.rb'), 'utf8'), stableCask);

  const conflictingDigestWrite = runTap({
    target: 'Casks/one-person-lab.rb',
    manifest: 'latest-arm64-mac.yml',
    download: standardDmg('26.6.4'),
    checksum: 'c'.repeat(64),
    remoteWriteMode: 'direct_commit',
    expectedCurrentCaskSha256: stableCaskSha,
    write: true,
  });
  assert.notEqual(conflictingDigestWrite.status, 0);
  assert.match(conflictingDigestWrite.stderr, /freeze a new release revision/);
  assert.equal(fs.readFileSync(path.join(tapRoot, 'Casks', 'one-person-lab.rb'), 'utf8'), stableCask);

  const directWriteWithoutCas = runTap({
    version: '26.6.5',
    target: 'Casks/one-person-lab.rb',
    manifest: 'latest-arm64-mac.yml',
    download: standardDmg('26.6.5'),
    remoteWriteMode: 'direct_commit',
    write: true,
  });
  assert.notEqual(directWriteWithoutCas.status, 0);
  assert.match(directWriteWithoutCas.stderr, /require exact --expected-current-cask-sha256/);
  assert.equal(fs.readFileSync(path.join(tapRoot, 'Casks', 'one-person-lab.rb'), 'utf8'), stableCask);

  const staleCaskCas = runTap({
    version: '26.6.5',
    target: 'Casks/one-person-lab.rb',
    manifest: 'latest-arm64-mac.yml',
    download: standardDmg('26.6.5'),
    remoteWriteMode: 'direct_commit',
    expectedCurrentCaskSha256: `sha256:${'f'.repeat(64)}`,
    write: true,
  });
  assert.notEqual(staleCaskCas.status, 0);
  assert.match(staleCaskCas.stderr, /Homebrew Cask CAS mismatch/);
  assert.equal(fs.readFileSync(path.join(tapRoot, 'Casks', 'one-person-lab.rb'), 'utf8'), stableCask);

  const releaseContract = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts', 'app-release-channel.json'), 'utf8'),
  );
  const homebrew = releaseContract.homebrew_tap_distribution;
  assert.deepEqual(homebrew.full_casks, ['one-person-lab-full']);
  assert.deepEqual(homebrew.excluded_casks, []);
  assert.equal(homebrew.allowed_casks.includes('one-person-lab-full'), true);
  assert.equal(homebrew.casks.includes('one-person-lab-full'), true);
  assert.deepEqual(
    homebrew.initial_live_targets,
    ['Casks/one-person-lab.rb', 'Casks/one-person-lab-nightly.rb', 'Casks/one-person-lab-full.rb'],
  );
  assert.equal(homebrew.initial_live_targets.includes('Casks/one-person-lab-full.rb'), true);
  assert.equal(
    homebrew.tap_update_policy.stable.mode,
    'release_bundle_publishes_standard_cask_then_hosted_readback_before_latest',
  );
  assert.equal(homebrew.tap_update_policy.stable.mode, homebrew.tap_update_policy.stable.publication_mode);
  assert.equal(homebrew.tap_update_policy.full.homebrew_publish_allowed, true);
  assert.equal(homebrew.tap_update_policy.full.homebrew_clean_vm_gate_required, false);
  assert.equal(fs.existsSync(path.join(tapRoot, 'Casks', 'one-person-lab-full.rb')), false);

  fs.writeFileSync(
    path.join(tapRoot, 'Casks', 'one-person-lab-full.rb'),
    [
      'cask "one-person-lab-full" do',
      '  version "26.6.300"',
      `  sha256 "${'a'.repeat(64)}"`,
      `  url "${releaseUrl('26.6.3', fullDmg('26.6.3'))}"`,
      '  depends_on formula: "gaofeng21cn/one-person-lab/opl"',
      '  app "One Person Lab.app"',
      'end',
      '',
    ].join('\n'),
  );
  const fullMigration = runTap({
    packageKind: 'app_full_first_install',
    target: 'Casks/one-person-lab-full.rb',
    manifest: 'opl-release-manifest.json',
    download: fullDmg('26.6.4'),
    write: true,
  });
  assert.equal(fullMigration.status, 0, fullMigration.stderr || fullMigration.stdout);
  const fullMigrationPlan = JSON.parse(fullMigration.stdout);
  assert.equal(fullMigrationPlan.cas.decision, 'write_once');
  assert.equal(fullMigrationPlan.cas.write_performed, true);
  const migratedFullCask = fs.readFileSync(path.join(tapRoot, 'Casks', 'one-person-lab-full.rb'), 'utf8');
  assert.doesNotMatch(migratedFullCask, /depends_on formula:/);
  assert.match(migratedFullCask, /framework_carrier: full_dmg_embedded_opl_base/);
  assert.match(migratedFullCask, /active_framework_count_target: 1/);

  const fullMigrationAgain = runTap({
    packageKind: 'app_full_first_install',
    target: 'Casks/one-person-lab-full.rb',
    manifest: 'opl-release-manifest.json',
    download: fullDmg('26.6.4'),
    write: true,
  });
  assert.equal(fullMigrationAgain.status, 0, fullMigrationAgain.stderr || fullMigrationAgain.stdout);
  assert.equal(JSON.parse(fullMigrationAgain.stdout).cas.decision, 'idempotent');
  assert.equal(JSON.parse(fullMigrationAgain.stdout).cas.write_performed, false);
  assert.equal(fs.readFileSync(path.join(tapRoot, 'Casks', 'one-person-lab-full.rb'), 'utf8'), migratedFullCask);

  const stableRefresh = runTap({
    version: '26.6.5',
    target: 'Casks/one-person-lab.rb',
    manifest: 'latest-arm64-mac.yml',
    download: standardDmg('26.6.5'),
    remoteWriteMode: 'direct_commit',
    expectedCurrentCaskSha256: stableCaskSha,
    write: true,
  });
  assert.equal(stableRefresh.status, 0, stableRefresh.stderr || stableRefresh.stdout);
  assert.equal(JSON.parse(stableRefresh.stdout).cas.decision, 'write_once');
  assert.equal(JSON.parse(stableRefresh.stdout).cas.write_performed, true);
  const stableRefreshedCask = fs.readFileSync(path.join(tapRoot, 'Casks', 'one-person-lab.rb'), 'utf8');
  assert.match(stableRefreshedCask, /\n  # OPL_HOMEBREW_BOUNDARY_START\n  # channel: stable/);

  const revisionResult = runTap({
    version: '26.7.20-r1',
    updaterVersion: '26.7.2001',
    target: 'Casks/one-person-lab.rb',
    manifest: 'latest-arm64-mac.yml',
    download: standardDmg('26.7.20-r1'),
    write: true,
  });
  assert.equal(revisionResult.status, 0, revisionResult.stderr || revisionResult.stdout);
  const revisionCask = fs.readFileSync(path.join(tapRoot, 'Casks', 'one-person-lab.rb'), 'utf8');
  assert.match(revisionCask, /version "26\.7\.2001"/);
  assert.match(revisionCask, /releases\/download\/v26\.7\.20-r1\/One-Person-Lab-26\.7\.20-r1-mac-arm64\.dmg/);
  assert.match(revisionCask, /display_version: 26\.7\.20-r1/);
  assert.match(revisionCask, /updater_version: 26\.7\.2001/);

  const packageBundleKind = runTap({
    packageKind: 'package_bundle',
    targetFlag: '--formula',
    target: 'Formula/mag.rb',
    manifest: 'opl-package-manifest.json',
    download: 'mag-0.1.0.tar.gz',
    write: true,
  });
  assert.notEqual(packageBundleKind.status, 0);
  assert.match(packageBundleKind.stderr, /Homebrew tap updates are App cask-only/);

  const nightlyResult = runTap({
    channel: 'nightly',
    version: '26.6.4-nightly.r1',
    target: 'Casks/one-person-lab-nightly.rb',
    manifest: 'latest-arm64-mac.yml',
    download: standardDmg('26.6.4-nightly.r1'),
    write: true,
  });
  assert.equal(nightlyResult.status, 0, nightlyResult.stderr || nightlyResult.stdout);
  const nightlyPlan = JSON.parse(nightlyResult.stdout);
  assert.equal(nightlyPlan.channel, 'nightly');
  assert.equal(nightlyPlan.package_kind, 'app_standard');
  assert.equal(nightlyPlan.targets.length, 1);
  assert.equal(nightlyPlan.targets[0].path, 'Casks/one-person-lab-nightly.rb');
  assert.equal(nightlyPlan.policy.cohort, 'standard_desktop_homebrew_distribution');
  assert.equal(nightlyPlan.policy.full_first_install_allowed, false);
  assert.equal(nightlyPlan.policy.formula_dependency_required, true);
  assert.equal(nightlyPlan.policy.framework_carrier, 'homebrew_formula_opl');
  assert.equal(nightlyPlan.policy.publishes_or_pushes_remote, false);
  assert.equal(nightlyPlan.policy.remote_write_mode, 'none');
  const nightlyCask = fs.readFileSync(
    path.join(tapRoot, 'Casks', 'one-person-lab-nightly.rb'),
    'utf8',
  );
  assert.match(nightlyCask, /# channel: nightly/);
  assert.match(nightlyCask, /# package_kind: app_standard/);
  assert.match(nightlyCask, /# full_first_install_allowed: false/);
  assert.match(nightlyCask, /# publishes_or_pushes_remote: false/);
  assert.match(nightlyCask, /depends_on formula: "opl"/);
  assert.doesNotMatch(nightlyCask, /One-Person-Lab-Full-/);

  const nightlyToStable = runTap({
    channel: 'nightly',
    version: '26.6.4-nightly.r1',
    target: 'Casks/one-person-lab.rb',
    manifest: 'latest-arm64-mac.yml',
    download: standardDmg('26.6.4-nightly.r1'),
  });
  assert.notEqual(nightlyToStable.status, 0);
  assert.match(nightlyToStable.stderr, /may only update the Nightly App cask target/);

  const stableNightlyPromotion = runTap({
    version: '26.6.4-nightly.r1',
    target: 'Casks/one-person-lab.rb',
    manifest: 'latest-arm64-mac.yml',
    download: standardDmg('26.6.4-nightly.r1'),
  });
  assert.notEqual(stableNightlyPromotion.status, 0);
  assert.match(stableNightlyPromotion.stderr, /Stable Homebrew tap updates must use YY\.M\.D/);

  const appToPackageFormula = runTap({
    packageKind: 'app_standard',
    targetFlag: '--formula',
    target: 'Formula/mag.rb',
    manifest: 'opl-package-manifest.json',
    download: 'mag-0.1.0.tar.gz',
  });
  assert.notEqual(appToPackageFormula.status, 0);
  assert.match(appToPackageFormula.stderr, /Homebrew tap updates are App cask-only/);

  const fullLeakInStandardPlan = runTap({
    target: 'Casks/one-person-lab.rb',
    manifest: 'opl-release-manifest.json',
    download: standardDmg('26.6.4'),
  });
  assert.notEqual(fullLeakInStandardPlan.status, 0);
  assert.match(fullLeakInStandardPlan.stderr, /Full first-install payloads/);

  const selfCheck = runNode(['scripts/update-homebrew-tap.ts', '--self-check']);
  assert.equal(selfCheck.status, 0, selfCheck.stderr || selfCheck.stdout);
});

test('generic Package consumer validator accepts repository contracts', () => {
  const result = runNode(['scripts/validate-agent-installation-contract.ts']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /opl_app_generic_package_consumer_contract_validation/);
  assert.match(result.stdout, /opl-app-state-unknown-agent\.fixture\.json/);
  assert.match(result.stdout, /PASS: App consumes generic Package directory/);
});

test('App Package consumers use Framework projections without static Package authority', () => {
  const readContract = (name: string) => JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts', name), 'utf8'),
  );
  const profile = readContract('app-product-profile.json');
  const installExposure = readContract('app-install-exposure-policy.json');
  const schema = readContract('agent-package-surfaces.schema.json');
  const unknownFixture = readContract('fixtures/opl-app-state-unknown-agent.fixture.json');

  assert.equal(fs.existsSync(path.join(appRoot, 'contracts', 'agent-package-registry.json')), false);
  const legacyManifestDir = path.join(appRoot, 'contracts', 'fixtures', 'agent-package-manifests');
  assert.deepEqual(
    fs.existsSync(legacyManifestDir)
      ? fs.readdirSync(legacyManifestDir).filter((name) => name.endsWith('.json'))
      : [],
    [],
  );
  assert.equal('starter_package_metadata' in profile.gui.agent_package_registry, false);
  assert.equal('home_agent_shortcuts' in profile.gui.home, false);
  assert.equal(
    profile.gui.agent_package_registry.directory_projection_authority,
    'app_state.agent_packages.directory.entries',
  );
  assert.equal(profile.gui.agent_package_registry.action_id_allowlist_allowed, false);
  assert.equal(
    installExposure.agent_installation_contract.directory_contract.App_or_Shell_installed_inference_allowed,
    false,
  );
  assert.equal(installExposure.agent_installation_contract.action_contract.action_id_allowlist_allowed, false);
  assert.deepEqual(Object.keys(schema.$defs).sort(), [
    'agent_package_activation_result',
    'directory_entry',
    'home_shortcut',
    'localized_text',
    'projected_action',
  ]);
  const unknownEntry = unknownFixture.app_state.agent_packages.directory.entries[0];
  assert.equal(unknownEntry.package_id, 'future.agent-lab');
  assert.equal(unknownEntry.package_role, 'standard_agent');
  assert.equal(unknownEntry.home_shortcuts.length, 1);
  assert.equal(unknownEntry.available_actions[0].semantic, 'custom');
});

test('unknown Agent Runtime projection stays generic and locally isolated', () => {
  const readContract = (name: string) => JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts', name), 'utf8'),
  );
  const schema = readContract('agent-package-surfaces.schema.json');
  const fixture = readContract('fixtures/opl-app-state-unknown-agent.fixture.json');
  const runtime = fixture.app_state.operator.workbench.work_item_projection_v2;

  assert.deepEqual(runtime.agent_catalog.map((entry: any) => entry.package_id), ['future.agent-lab']);
  assert.deepEqual(runtime.agent_availability.map((entry: any) => entry.package_id), ['future.agent-lab']);
  assert.deepEqual(runtime.items.map((entry: any) => entry.agent_id), ['future.agent-lab']);
  assert.equal(runtime.authority_boundary.projection_only, true);
  assert.equal(runtime.authority_boundary.can_write_domain_truth, false);

  const activationResult = schema.$defs.agent_package_activation_result;
  assert.deepEqual(activationResult.required, [
    'launch_state',
    'launch_allowed',
    'package_id',
    'launch_state_reason',
  ]);
  assert.deepEqual(activationResult.properties.launch_state.enum, [
    'ready',
    'degraded',
    'package_unavailable',
  ]);
  for (const forbidden of ['package_lock', 'use_receipt_ref', 'use_binding', 'package_use_binding']) {
    assert.equal(forbidden in activationResult.properties, false);
  }
});

test('App install policy selects exactly one compatible OPL Framework carrier', () => {
  const policy = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'contracts', 'app-install-exposure-policy.json'), 'utf8'),
  );
  const carrier = policy.distribution_channels.homebrew.framework_core_carrier;

  assert.equal(
    policy.distribution_channels.homebrew.role,
    'app_cask_and_framework_formula_install_index',
  );
  assert.equal(carrier.component, 'opl_framework');
  assert.equal(
    carrier.selection_policy,
    'developer_mode_then_install_origin_and_formula_availability_then_compatibility_handshake',
  );
  assert.deepEqual(carrier.locator_precedence, [
    {
      install_origin: 'explicit_developer_mode',
      carrier: 'developer_checkout',
      locator: '<selected-workspace>/one-person-lab',
    },
    {
      install_origin: 'homebrew_cask',
      carrier: 'system_homebrew_formula',
      formula: 'opl',
      locator: '/opt/homebrew/bin/opl or /usr/local/bin/opl',
      origin_evidence: 'Homebrew Caskroom receipt',
    },
    {
      install_origin: 'dmg_or_direct_download',
      carrier: 'framework_managed_install',
      locator: '~/.opl/one-person-lab',
      installer: 'opl-install.sh --headless --skip-packages',
    },
  ]);
  assert.deepEqual(carrier.pre_formula_transition, {
    allowed: true,
    condition: 'homebrew_cask_receipt_present_and_formula_absent',
    carrier: 'framework_managed_install',
    locator: '~/.opl/one-person-lab',
    installer: 'opl-install.sh --headless --skip-packages',
    selection_status: 'pre_formula_transition',
    must_end_when_formula_available: true,
    incompatible_formula_must_not_fallback: true,
    creates_second_framework_semantics: false,
  });
  assert.deepEqual(carrier.compatibility_handshake, {
    required_before_activation: true,
    protected_consumer_surface: 'opl app state --profile fast --json',
    producer_owner: 'one-person-lab',
    app_requirement_owner: 'one-person-lab-app',
    required_package_name: 'opl-framework',
    required_capability_source_ref:
      'contracts/opl-framework/app-runtime-fast-work-item-projection-contract.json#compatibility_capabilities.ids',
    required_capability_ids: [],
    required_capability_match: 'all',
    optional_enhancement_capabilities: [
      {
        capability_id: 'opl_app.domain_detail_views.v2',
        policy_ref:
          'contracts/app-runtime-bridge.json#work_item_projection.field_contracts.domain_detail_views',
        availability_source: 'producer_capability_ids',
        missing_behavior: 'allow_app_state_activation_and_hide_dependent_detail_surfaces',
      },
    ],
    framework_api_version_policy: {
      recognized_marker: 'p19.stage-runtime',
      marker_alone_sufficient: false,
    },
    fail_closed_on_missing_required_capability_or_incompatible_framework: true,
    missing_required_capability_policy: {
      compatibility_status: 'incompatible_missing_required_capability',
      app_state_activation_allowed: false,
      recovery_owner: 'one-person-lab',
      app_role: 'request_canonical_bootstrap_or_update_and_project_receipts_only',
      canonical_bootstrap_ref:
        'contracts/app-release-channel.json#managed_update_plane.software_lifecycle.public_actions.bootstrap_missing_opl_base',
      canonical_update_ref:
        'contracts/app-release-channel.json#managed_update_plane.software_lifecycle.public_actions.apply_eligible_updates',
      canonical_reconciliation_ref:
        'contracts/app-release-channel.json#managed_update_plane.carrier_reconciliation',
      app_direct_base_mutation_allowed: false,
    },
    missing_optional_enhancement_policy: {
      app_state_activation_allowed: true,
      global_recovery_required: false,
      dependent_surface_policy_ref:
        'contracts/app-runtime-bridge.json#work_item_projection.field_contracts.domain_detail_views.absence_policy',
    },
    receipt_fields: [
      'selected_carrier',
      'framework_version',
      'framework_api_version',
      'app_required_api_range',
      'producer_capability_ids',
      'required_capability_ids',
      'missing_required_capability_ids',
      'compatibility_status',
      'selection_status',
      'active_framework_count',
    ],
  });
  assert.deepEqual(carrier.activation_invariants, {
    active_framework_count: 1,
    dual_runtime_allowed: false,
    split_brain_allowed: false,
    second_framework_fallback_may_activate: false,
  });
  assert.deepEqual(carrier.release_authority, {
    app_carrier_release_truth_owner: 'one-person-lab-app',
    opl_base_release_truth_owner: 'one-person-lab',
    app_release_must_not_publish_or_promote_opl_base: true,
  });

  const splitBrainPolicy = structuredClone(policy);
  splitBrainPolicy.distribution_channels.homebrew.framework_core_carrier.activation_invariants.split_brain_allowed = true;
  assert.throws(
    () => validateInstallExposureRuntimeAndDistribution(splitBrainPolicy),
    /OPL Framework activation invariants/,
  );

  const markerOnlyPolicy = structuredClone(policy);
  markerOnlyPolicy.distribution_channels.homebrew.framework_core_carrier
    .compatibility_handshake.framework_api_version_policy.marker_alone_sufficient = true;
  assert.throws(
    () => validateInstallExposureRuntimeAndDistribution(markerOnlyPolicy),
    /OPL Framework compatibility handshake/,
  );

  const legacyCarrierPolicy = structuredClone(policy);
  legacyCarrierPolicy.distribution_channels.homebrew.framework_core_carrier
    .compatibility_handshake.missing_required_capability_policy.app_state_activation_allowed = true;
  assert.throws(
    () => validateInstallExposureRuntimeAndDistribution(legacyCarrierPolicy),
    /OPL Framework compatibility handshake/,
  );

  const optionalCapabilityAsRequired = structuredClone(policy);
  optionalCapabilityAsRequired.distribution_channels.homebrew.framework_core_carrier
    .compatibility_handshake.required_capability_ids = ['opl_app.domain_detail_views.v2'];
  assert.throws(
    () => validateInstallExposureRuntimeAndDistribution(optionalCapabilityAsRequired),
    /OPL Framework compatibility handshake/,
  );

  const optionalCapabilityGlobalFailure = structuredClone(policy);
  optionalCapabilityGlobalFailure.distribution_channels.homebrew.framework_core_carrier
    .compatibility_handshake.missing_optional_enhancement_policy.app_state_activation_allowed = false;
  assert.throws(
    () => validateInstallExposureRuntimeAndDistribution(optionalCapabilityGlobalFailure),
    /OPL Framework compatibility handshake/,
  );
});

test('App exposes three software objects while configured carriers own Package lifecycle', () => {
  const policy = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'contracts', 'app-install-exposure-policy.json'), 'utf8'),
  );
  const lifecycle = policy.software_lifecycle;

  assert.deepEqual(lifecycle.public_objects, ['opl_base', 'opl_app', 'opl_packages']);
  assert.deepEqual(lifecycle.lifecycle_owners, {
    opl_base: 'one-person-lab',
    opl_app: 'one-person-lab-app',
    opl_packages: 'configured_carrier',
  });
  assert.deepEqual(lifecycle.app_mutation_scope, ['opl_app']);
  assert.equal(lifecycle.base_bootstrap.bootstrap_route, 'opl-install.sh --headless --skip-packages');
  assert.equal(lifecycle.base_bootstrap.app_must_not_implement_installer, true);
  assert.equal(lifecycle.ordinary_component_picker_allowed, false);
  assert.equal(lifecycle.legacy_component_mapping_allowed, false);
  assert.equal(lifecycle.package_lifecycle_carrier, 'configured_carrier');
  assert.equal('transaction_internal_states' in lifecycle, false);
  assert.equal('sync_and_install_contract' in policy, false);

  const invalid = structuredClone(policy);
  invalid.software_lifecycle.app_mutation_scope.push('opl_packages');
  assert.throws(
    () => validateInstallExposureRuntimeAndDistribution(invalid),
    /App mutation scope/,
  );

  const restoredTransactionState = structuredClone(policy);
  restoredTransactionState.software_lifecycle.transaction_internal_states = { opl_packages: ['payload'] };
  assert.throws(
    () => validateInstallExposureRuntimeAndDistribution(restoredTransactionState),
    /three-object software lifecycle/,
  );
});

test('local data lifecycle separates runtime inventory from managed prune and canonical delete authority', () => {
  const release = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'contracts', 'app-release-channel.json'), 'utf8'),
  );
  const localDataLifecycle = release.local_data_lifecycle;
  const runtime = localDataLifecycle.runtime_substrate;
  const deleteBoundary = localDataLifecycle.user_data_artifacts.delete_execution_boundary;
  const ownerStorage = localDataLifecycle.owner_storage_projections;

  assert.doesNotThrow(() => validateReleaseChannelContract(release));
  const futureDatedAllowed = structuredClone(release);
  futureDatedAllowed.github_release_name.calendar_guard.future_dated_versions_allowed = true;
  assert.throws(
    () => validateReleaseChannelContract(futureDatedAllowed),
    /reject future-dated versions/,
  );
  const missingShellRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-local-data-shell-'));
  try {
    assert.throws(
      () => validateReleaseChannelContract(release, { shellRoot: missingShellRoot }),
      /Missing active shell implementation file .*localDataLifecycleBridge/,
    );
  } finally {
    fs.rmSync(missingShellRoot, { recursive: true, force: true });
  }
  assert.deepEqual(
    runtime.inventory_roots.map((root) => root.id),
    ['shell_toolchain_runtime', 'managed_opl_runtime'],
  );
  assert.equal(runtime.prune_authority_root, 'managed_opl_runtime');
  const managedRuntimeRoot = runtime.inventory_roots.find((root) => root.id === 'managed_opl_runtime');
  assert.equal(managedRuntimeRoot.default_platform, 'darwin');
  assert.equal(managedRuntimeRoot.non_darwin_without_override, 'blocked');
  assert.equal(
    runtime.authority_gate.missing_or_invalid_authority,
    'blocked_no_candidates_no_execute',
  );
  assert.equal(deleteBoundary.canonical_verifier, 'verifyConversationArchiveReceipt');
  assert.deepEqual(ownerStorage.sections, ['agent_package_store', 'webui_data_volume']);
  assert.equal(ownerStorage.missing_projection_policy, 'fail_open_keep_shell_owned_categories_available');
  assert.equal(ownerStorage.agent_package_store.ordinary_action, 'navigate_to_/settings/agents');
  assert.equal(Object.hasOwn(ownerStorage.agent_package_store, 'lifecycle_action_ref'), false);
  assert.equal(ownerStorage.agent_package_store.storage_direct_uninstall_allowed, false);
  assert.equal(ownerStorage.webui_data_volume.execution_owner, 'carrier_host');
  assert.equal(ownerStorage.webui_data_volume.webui_container_execution, 'host_action_required_without_docker_socket');
  assert.equal(
    ownerStorage.webui_data_volume.host_action_abi.capability_id,
    appOwnedWebuiDataVolumeHostActionCapabilityId,
  );
  assert.deepEqual(ownerStorage.webui_data_volume.host_action_abi.execute_request_required_fields, [
    'plan_id',
    'plan_hash',
    'exact_confirmation',
  ]);
  assert.deepEqual(ownerStorage.webui_data_volume.host_action_abi.restore_request_required_fields, ['receipt_ref']);
  assert.deepEqual(ownerStorage.webui_data_volume.host_action_abi.restore_result_required_fields, [
    'status',
    'receipt_ref',
    'restore_receipt_ref',
    'readback',
  ]);
  assert.equal(ownerStorage.webui_data_volume.host_action_abi.renderer_raw_path_allowed, false);
  assert.equal(
    ownerStorage.webui_data_volume.host_action_abi.security.duplicate_submission_policy,
    'idempotent_terminal_readback_or_typed_conflict_only',
  );
  assert.equal(ownerStorage.webui_data_volume.generic_docker_prune_allowed, false);
  assert.equal(ownerStorage.webui_data_volume.shell_direct_path_delete_allowed, false);
  assert.deepEqual(localDataLifecycle.storage_carrier_behavior, appOwnedStorageCarrierBehavior);

  const extendedHostAbi = structuredClone(release);
  extendedHostAbi.local_data_lifecycle.owner_storage_projections.webui_data_volume
    .host_action_abi.optional_future_metadata = { version: 2 };
  assert.doesNotThrow(() => validateReleaseChannelContract(extendedHostAbi));

  const conflatedRuntimeRoots = structuredClone(release);
  conflatedRuntimeRoots.local_data_lifecycle.runtime_substrate.inventory_roots[0].derivation =
    "app.getPath('userData')/runtime";
  assert.throws(
    () => validateReleaseChannelContract(conflatedRuntimeRoots),
    /runtime inventory roots/,
  );

  const markerOptional = structuredClone(release);
  markerOptional.local_data_lifecycle.runtime_substrate.authority_gate.current_target_marker = null;
  assert.throws(
    () => validateReleaseChannelContract(markerOptional),
    /fail closed on managed OPL authority and marker checks/,
  );

  const verifierBypassed = structuredClone(release);
  verifierBypassed.local_data_lifecycle.user_data_artifacts.delete_execution_boundary.canonical_verifier =
    'readJsonRecord';
  assert.throws(
    () => validateReleaseChannelContract(verifierBypassed),
    /canonical archive verifier/,
  );

  const unsafeWebuiCleanup = structuredClone(release);
  unsafeWebuiCleanup.local_data_lifecycle.owner_storage_projections.webui_data_volume.generic_docker_prune_allowed = true;
  assert.throws(
    () => validateReleaseChannelContract(unsafeWebuiCleanup),
    /explicit policy surfaces/,
  );

  const blockingOwnerProjection = structuredClone(release);
  blockingOwnerProjection.local_data_lifecycle.owner_storage_projections.missing_projection_policy = 'block_storage_page';
  assert.throws(
    () => validateReleaseChannelContract(blockingOwnerProjection),
    /explicit policy surfaces/,
  );

  const webuiElectronLifecycle = structuredClone(release);
  webuiElectronLifecycle.local_data_lifecycle.storage_carrier_behavior.webui.local_lifecycle_transport =
    'electron_ipc';
  assert.throws(
    () => validateReleaseChannelContract(webuiElectronLifecycle),
    /Storage carrier behavior/,
  );

  const unsafeHostEndpoint = structuredClone(release);
  unsafeHostEndpoint.local_data_lifecycle.owner_storage_projections.webui_data_volume
    .host_action_abi.endpoints.execute.method = 'DELETE';
  assert.throws(
    () => validateReleaseChannelContract(unsafeHostEndpoint),
    /carrier-host action ABI/,
  );

  const rawPathPayload = structuredClone(release);
  rawPathPayload.local_data_lifecycle.owner_storage_projections.webui_data_volume
    .host_action_abi.renderer_payload_allowlist.push('raw_path');
  assert.throws(
    () => validateReleaseChannelContract(rawPathPayload),
    /carrier-host action ABI/,
  );

  const incompleteRestore = structuredClone(release);
  incompleteRestore.local_data_lifecycle.owner_storage_projections.webui_data_volume
    .host_action_abi.restore_result_required_fields = ['receipt_ref'];
  assert.throws(
    () => validateReleaseChannelContract(incompleteRestore),
    /carrier-host action ABI/,
  );
});

test('release contract keeps Standard independent behind Framework checkpoint authority', () => {
  const release = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'contracts', 'app-release-channel.json'), 'utf8'),
  );
  const gui = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'contracts', 'app-gui-product-contract.json'), 'utf8'),
  );
  const control = release.release_bundle_control_plane;
  const legacy = control.legacy_compatibility;

  assert.deepEqual(control.live_authority.stable_operations, [
    'standard',
    'resume_standard',
    'append_full',
  ]);
  assert.equal(control.live_authority.single_live_mutation_authority, true);
  assert.equal(control.live_authority.app_session_broker_or_operator_may_authorize_mutation, false);
  assert.equal(control.checkpoint_transport.import_never_rebuilds, true);
  assert.equal(control.checkpoint_transport.unknown_build_or_publish_outcome_export_allowed, true);
  assert.deepEqual(control.checkpoint_transport.active_unknown_markers.allowed_commands, [
    'status',
    'exact_reconcile',
  ]);
  assert.equal(control.operation_control.stable_operations.resume_standard.deadline_minutes, undefined);
  assert.equal(control.operation_control.stable_operations.resume_standard.control, 'reuse_exact_standard_control');
  assert.equal(control.operation_control.stable_operations.append_full.standard_operation_id_reuse_allowed, false);
  assert.equal(control.operation_control.elapsed_deadline.exact_reconcile_result, 'late_observation');
  assert.equal(control.checkpoint_transport.publish_or_promotion_state_imported, false);
  assert.equal(control.publication.full.may_follow_latest, true);
  assert.equal(control.publication.full.updater_metadata_allowed, false);
  assert.equal(legacy.historical_receipts_remain_readable, true);
  assert.equal(legacy.new_legacy_dispatch_publish_or_rebuild_allowed, false);
  assert.equal(release.release_acceleration.new_session_or_dispatch_allowed, false);
  assert.deepEqual(
    gui.release_channel_policy.stable.diagnostic_lanes,
    release.release_validation_profiles.stable.diagnostic_lanes,
  );
  assert.deepEqual(
    gui.release_channel_policy.stable.post_publication_optional_certification_surfaces,
    release.release_validation_profiles.stable.post_publication_optional_certification_surfaces,
  );
  assert.equal(gui.release_channel_policy.stable.must_gate.includes('full_dmg_clean_vm_smoke'), false);
  assert.equal(gui.release_channel_policy.stable.addon_gate_blocking_standard_terminal, false);
  assert.equal(gui.release_channel_policy.stable.diagnostic_lanes_block_publication_or_latest, false);
  assert.equal(gui.release_channel_policy.stable.optional_certification_blocks_publication_or_latest, false);
  assert.deepEqual(
    release.full_first_install.size_policy.optimization_artifacts.required_evidence,
    [
      'full-package-manifest.json#runtime_assertions.offline_required_payloads',
      'full-runtime-native-trust.json',
    ],
  );
  assert.deepEqual(
    release.full_first_install.size_policy.optimization_artifacts.optional_certification_evidence,
    [
      {
        id: 'full_dmg_clean_vm_smoke',
        policy: 'post_publication_optional_non_blocking',
        allowed_statuses: ['passed', 'failed', 'not_run', 'unavailable'],
      },
    ],
  );

  const competingAuthority = structuredClone(release);
  competingAuthority.release_bundle_control_plane.live_authority
    .app_session_broker_or_operator_may_authorize_mutation = true;
  assert.throws(
    () => validateReleaseChannelContract(competingAuthority),
    /one Framework checkpoint and App executor mutation authority/,
  );

  const rebuiltCheckpoint = structuredClone(release);
  rebuiltCheckpoint.release_bundle_control_plane.checkpoint_transport.import_never_rebuilds = false;
  assert.throws(
    () => validateReleaseChannelContract(rebuiltCheckpoint),
    /preserve exact controls and unknown markers/,
  );

  const missingOperationId = structuredClone(release);
  missingOperationId.release_bundle_control_plane.operation_control.operation_admission_identity_fields = [
    'operation',
    'operation_started_at',
    'operation_deadline_at',
  ];
  assert.throws(
    () => validateReleaseChannelContract(missingOperationId),
    /Standard immutable, resume exact, append independent/,
  );

  for (const field of ['new_operation_id_allowed', 'start_refresh_allowed', 'deadline_refresh_allowed']) {
    const refreshedResume = structuredClone(release);
    refreshedResume.release_bundle_control_plane.operation_control.stable_operations.resume_standard[field] = true;
    assert.throws(
      () => validateReleaseChannelContract(refreshedResume),
      /Standard immutable, resume exact, append independent/,
    );
  }

  for (const field of ['standard_operation_id_reuse_allowed', 'standard_deadline_inheritance_allowed']) {
    const reusedAppendControl = structuredClone(release);
    reusedAppendControl.release_bundle_control_plane.operation_control.stable_operations.append_full[field] = true;
    assert.throws(
      () => validateReleaseChannelContract(reusedAppendControl),
      /Standard immutable, resume exact, append independent/,
    );
  }

  const mismatchedMarker = structuredClone(release);
  mismatchedMarker.release_bundle_control_plane.checkpoint_transport.active_unknown_markers
    .exact_reconcile_match_fields = ['bundle_digest', 'track'];
  assert.throws(
    () => validateReleaseChannelContract(mismatchedMarker),
    /exact reconcile marker fields/,
  );

  const activeMarkerMutation = structuredClone(release);
  activeMarkerMutation.release_bundle_control_plane.checkpoint_transport.active_unknown_markers
    .ordinary_mutations_allowed = true;
  assert.throws(
    () => validateReleaseChannelContract(activeMarkerMutation),
    /preserve exact controls and unknown markers/,
  );

  const latePromotion = structuredClone(release);
  latePromotion.release_bundle_control_plane.operation_control.elapsed_deadline.stage_advanced = true;
  assert.throws(
    () => validateReleaseChannelContract(latePromotion),
    /late reconcile evidence-only/,
  );

  const legacyMutation = structuredClone(release);
  legacyMutation.release_acceleration.new_session_or_dispatch_allowed = true;
  assert.throws(
    () => validateReleaseChannelContract(legacyMutation),
    /historical receipt readers only/,
  );

  const blockingVm = structuredClone(release);
  blockingVm.release_acceleration.vm_gates.find(
    (gate) => gate.id === 'full_dmg_clean_vm_smoke',
  ).gate_policy = 'deterministic_release_blocking';
  assert.throws(
    () => validateReleaseChannelContract(blockingVm),
    /post-publication optional certification/,
  );

  const mismatchedLegacyVm = structuredClone(release);
  mismatchedLegacyVm.release_acceleration.vm_gate.diagnostic_scope = 'release_gate';
  assert.throws(
    () => validateReleaseChannelContract(mismatchedLegacyVm),
    /Legacy Full VM optional certification mirror/,
  );

  const fullVmInStableTerminal = structuredClone(release);
  fullVmInStableTerminal.release_validation_profiles.stable.addon_lanes.push('full_dmg_clean_vm_smoke');
  assert.throws(
    () => validateReleaseChannelContract(fullVmInStableTerminal),
    /outside the Stable publication terminal/,
  );
});

test('managed update payload and public actions use only the three software objects', () => {
  const release = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'contracts', 'app-release-channel.json'), 'utf8'),
  );
  const gui = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'contracts', 'app-gui-product-contract.json'), 'utf8'),
  );
  const pageState = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'contracts', 'app-page-state-matrix.json'), 'utf8'),
  );
  const lifecycle = release.managed_update_plane.software_lifecycle;
  const guiManagedUpdate = gui.framework_surfaces.managed_update_plane;
  const agentsPage = gui.pages.settings_agents;
  const agentsPageState = pageState.pages.find((page) => page.id === 'agents');

  assert.doesNotThrow(() => validateReleaseChannelContract(release));
  assert.deepEqual(lifecycle.public_component_keys, ['opl_base', 'opl_app', 'opl_packages']);
  assert.equal(Object.values(lifecycle.public_actions).some((action) => String(action).includes('--component')), false);
  assert.equal('runtime_substrate_updater' in release, false);
  assert.equal('companion_tools_updater' in release, false);
  assert.deepEqual(guiManagedUpdate.software_objects, lifecycle.public_component_keys);
  assert.deepEqual(guiManagedUpdate.ui_actions, lifecycle.public_actions);
  assert.equal(guiManagedUpdate.ordinary_component_picker_allowed, false);
  assert.equal(
    agentsPage.status_model.source_inputs.some((source: string) => source.startsWith('managed_update.')),
    false,
  );
  assert.equal(
    agentsPageState.status_model.source_inputs.some((source: string) => source.startsWith('managed_update.')),
    false,
  );
  assert.equal(
    JSON.stringify(agentsPage.agent_package_lifecycle_ux.package_projection_contract)
      .includes('med-autoscience'),
    false,
  );

  const legacyComponent = structuredClone(release);
  legacyComponent.managed_update_plane.software_lifecycle.public_component_keys.push('runtime_substrate');
  assert.throws(() => validateReleaseChannelContract(legacyComponent), /public component keys/);
});
