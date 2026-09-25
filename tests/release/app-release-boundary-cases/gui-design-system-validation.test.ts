import { after } from 'node:test';
import { validateGuiDesignSystem } from '../../../scripts/validate-gui-design-system.ts';
import {
  resolveShellDshVisualSourceMode,
  validateShellDshVisualSource,
} from '../../../scripts/validate-active-shell/shell-implementation-validator.ts';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { assert, fs, os, path, test, appRoot } from './helpers.ts';

const ownedFixtureRoots = new Set<string>();
after(() => {
  for (const root of ownedFixtureRoots) fs.rmSync(root, { recursive: true, force: true });
  ownedFixtureRoots.clear();
});

const interactionReference = 'historical ChatGPT Codex macOS workflow and spatial interaction observation';
const pixelReference = 'opl-app-approved-visual-baseline-v1 (App-owned)';
const supersededCodexReference = 'ChatGPT Codex macOS 26.707.31428 (2026-07-10)';

function writeFile(root: string, relativePath: string, contents: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  writeFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function copyFixtureFile(root: string, relativePath: string): void {
  writeFile(root, relativePath, fs.readFileSync(path.join(appRoot, relativePath), 'utf8'));
}

function copyFixtureAsset(root: string, relativePath: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(appRoot, relativePath), target);
}

function refreshSourceManifestHash(root: string): void {
  const sourcePath = path.join(root, 'docs/product/gui/evidence/aionui-41301/source-manifest.json');
  const manifestPath = path.join(root, 'docs/product/gui/evidence/aionui-41301/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.source_manifest_sha256 = createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
  writeJson(root, 'docs/product/gui/evidence/aionui-41301/manifest.json', manifest);
}

function createFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gui-design-system-'));
  ownedFixtureRoots.add(root);
  for (const relativePath of [
    'docs/product/gui/README.md',
    'docs/product/gui/ideal-interaction-spec.md',
    'docs/product/gui/visual-system.md',
    'docs/product/gui/codex-to-opl-app-delta.md',
    'docs/product/gui/element-audit.md',
    'docs/product/gui/feature-inventory.md',
    'docs/product/gui/gui-maintenance-policy.md',
    'docs/product/gui/shell-implementation-guide.md',
    'docs/product/gui/shell-conformance-matrix.md',
    'contracts/app-shell-candidates.json',
    'contracts/app-product-profile.json',
    'contracts/app-gui-product-contract.json',
    'contracts/app-gui-visual-source-cohort.json',
    'contracts/app-remote-companion.json',
    'contracts/app-gui-visual-reference-cohort.json',
    'contracts/app-page-state-matrix.json',
    'docs/product/gui/evidence/aionui-41301/manifest.json',
    'docs/product/gui/evidence/aionui-41301/source-manifest.json',
    'package.json',
  ]) {
    copyFixtureFile(root, relativePath);
  }

  // The retained AionUI pixel/source evidence is a historical conformance fixture.
  // It must not accidentally treat the currently selected Studio adapter as AionUI.
  writeJson(root, 'contracts/app-shell-adapter.json', JSON.parse(fs.readFileSync(path.join(appRoot, 'contracts/shell-adapters/aionui.json'), 'utf8')));
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'contracts/app-shell-candidates.json'), 'utf8'));
  registry.active_shell_unchanged = 'aionui';
  registry.active_gui_mainline.shell = 'aionui';
  writeJson(root, 'contracts/app-shell-candidates.json', registry);
  const verifiedAncestor = createShellCheckout(root);
  const shellAdapter = JSON.parse(fs.readFileSync(path.join(root, 'contracts/app-shell-adapter.json'), 'utf8'));
  shellAdapter.shell_source.upstream_ref = verifiedAncestor;
  writeJson(root, 'contracts/app-shell-adapter.json', shellAdapter);
  const evidenceManifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/product/gui/evidence/aionui-41301/manifest.json'), 'utf8'));
  for (const entry of evidenceManifest.entries) copyFixtureAsset(root, entry.screenshot_path);
  return root;
}

function createShellCheckout(root: string): string {
  const shellRoot = path.join(root, 'shells/aionui');
  fs.mkdirSync(shellRoot, { recursive: true });
  execFileSync('git', ['init', '--quiet'], { cwd: shellRoot });
  writeFile(shellRoot, 'README.md', '# fixture shell\n');
  execFileSync('git', ['add', 'README.md'], { cwd: shellRoot });
  execFileSync(
    'git',
    ['-c', 'user.name=OPL Test', '-c', 'user.email=opl-test@example.invalid', 'commit', '--quiet', '-m', 'fixture'],
    { cwd: shellRoot },
  );
  const verifiedAncestor = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: shellRoot, encoding: 'utf8' }).trim();
  writeFile(shellRoot, 'CURRENT.md', '# current fixture shell\n');
  execFileSync('git', ['add', 'CURRENT.md'], { cwd: shellRoot });
  execFileSync(
    'git',
    ['-c', 'user.name=OPL Test', '-c', 'user.email=opl-test@example.invalid', 'commit', '--quiet', '-m', 'current'],
    { cwd: shellRoot },
  );
  return verifiedAncestor;
}

test('GUI design-system validator accepts a complete fixture without promoting release readiness', () => {
  const root = createFixture();
  const summary = validateGuiDesignSystem(root);
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'contracts/app-product-profile.json'), 'utf8'));
  const contract = JSON.parse(fs.readFileSync(path.join(root, 'contracts/app-gui-product-contract.json'), 'utf8'));
  const historicalPixelShellSha =
    contract.interaction_baseline.acceptance_boundary.historical_pixel_shell_sha;
  assert.equal(summary.status, 'consistent');
  assert.equal(summary.release_ready, false);
  assert.deepEqual(summary.visual_source_cohort, {
    contract: 'contracts/app-gui-visual-source-cohort.json',
    source_commit: '47f943859bef60e4160492346772ded9b24f765a',
    source_usage: 'bounded_source_reuse_for_icons_theme_tokens_and_visual_primitive_geometry_only',
  });
  assert.equal(summary.interaction_reference, interactionReference);
  assert.equal(summary.pixel_reference, pixelReference);
  assert.equal(summary.superseded_interaction_reference, supersededCodexReference);
  assert.equal(summary.reference_boundary.app_contract_status, 'aligned_contract');
  assert.equal(summary.reference_boundary.page_state_status, 'aligned_contract');
  assert.equal(summary.reference_boundary.candidate_detail_validation, 'explicit_on_demand');
  assert.equal(summary.state_boundary.ideal_native_rail_visible, true);
  assert.equal(summary.state_boundary.active_aionui_rail_state, 'visible_wide_drawer_narrow');
  assert.equal(summary.state_boundary.active_aionui_conformance.rail_matches_ideal, true);
  assert.equal(summary.state_boundary.active_aionui_conformance.rail_status, 'aligned_contract');
  assert.equal(summary.state_boundary.active_aionui_conformance.inspector_matches_ideal, true);
  assert.equal(summary.state_boundary.active_aionui_conformance.permission_access_mode_status, 'aligned_contract');
  assert.equal(summary.state_boundary.active_aionui_conformance.side_panel_information_architecture_status, 'aligned_contract');
  assert.deepEqual(summary.model_defaults, {
    model: profile.codex.default_model,
    reasoning_effort: profile.codex.default_reasoning_effort,
  });
  assert.deepEqual(summary.visual_evidence, {
    manifest: 'docs/product/gui/evidence/aionui-41301/manifest.json',
    shell_head: historicalPixelShellSha,
    entries_verified: 8,
    packaged_command: true,
  });
  assert.deepEqual(summary.visual_reference_cohort, {
    contract: 'contracts/app-gui-visual-reference-cohort.json',
    reference_baseline_id: 'opl-app-approved-visual-baseline-v1',
    reference_state: 'capture_and_human_approval_required',
    external_product_artifact_required: false,
    scenes_required: 16,
    surface_families: ['home', 'conversation', 'rail', 'settings'],
    viewports: ['desktop', 'narrow'],
    themes: ['light', 'dark'],
    locales: ['zh-CN', 'en-US'],
    reference_assets_complete: false,
    scene_bound_visual_parity: false,
  });
});

test('GUI design-system validator accepts an approved App-owned baseline without promoting release readiness', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const cohortPath = path.join(root, 'contracts/app-gui-visual-reference-cohort.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const cohort = JSON.parse(fs.readFileSync(cohortPath, 'utf8'));
  contract.interaction_baseline.pixel_baseline.state = 'approved';
  cohort.reference.state = 'approved';
  cohort.reference.approval_receipt_file = 'baseline-approval-receipt.json';
  cohort.reference.approval_receipt_sha256 = 'a'.repeat(64);
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);
  writeJson(root, 'contracts/app-gui-visual-reference-cohort.json', cohort);

  const summary = validateGuiDesignSystem(root);
  assert.equal(summary.status, 'consistent');
  assert.equal(summary.visual_reference_cohort.reference_state, 'approved');
  assert.equal(summary.release_ready, false);
});

test('GUI design-system validator fail-closes the pinned DSH phase, deferred, upgrade, and normalization contract', () => {
  const mutations = [
    ['phase_one_behavior_invariants', (cohort: Record<string, unknown>) => {
      (cohort.phase_one_behavior_invariants as string[]).pop();
    }],
    ['deferred_surfaces', (cohort: Record<string, unknown>) => {
      (cohort.deferred_surfaces as string[]).reverse();
    }],
    ['upgrade_policy.required_evidence', (cohort: Record<string, unknown>) => {
      const policy = cohort.upgrade_policy as Record<string, unknown>;
      (policy.required_evidence as string[]).shift();
    }],
    ['shell_adoption.allowed_vendor_normalizations', (cohort: Record<string, unknown>) => {
      (cohort.shell_adoption as Record<string, unknown>).allowed_vendor_normalizations = [];
    }],
  ] as const;

  for (const [label, mutate] of mutations) {
    const root = createFixture();
    const cohortPath = path.join(root, 'contracts/app-gui-visual-source-cohort.json');
    const cohort = JSON.parse(fs.readFileSync(cohortPath, 'utf8')) as Record<string, unknown>;
    mutate(cohort);
    writeJson(root, 'contracts/app-gui-visual-source-cohort.json', cohort);

    assert.throws(
      () => validateGuiDesignSystem(root),
      /visual source cohort must pin the DSH commit, require the Shell source implementation, and keep AionUI limited to visual adapters without runtime or release authority/,
      label,
    );
  }
});

test('GUI design-system validator rejects a weakened visual threshold or undeclared mask reason', () => {
  const root = createFixture();
  const cohortPath = path.join(root, 'contracts/app-gui-visual-reference-cohort.json');
  const cohort = JSON.parse(fs.readFileSync(cohortPath, 'utf8'));
  cohort.comparison_contract.changed_pixel_ratio_max = 0.2;
  cohort.scene_matrix[0].masks.push({
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    reason: 'hide_visual_gap',
  });
  writeJson(root, 'contracts/app-gui-visual-reference-cohort.json', cohort);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /must fail closed on dimensions, pixel thresholds, masks, and exact human review|contains an invalid mask/,
  );
});

test('active-shell DSH source gate reads the manifest, LICENSE, and normalized vendored hashes', () => {
  const normalization = {
    path: 'packages/client/icon.txt',
    kind: 'classic_react_jsx_runtime_import',
    change: "add import React from 'react' without changing glyph markup",
    reason: 'fixture compatibility normalization',
  };
  const makeFixture = () => {
    const shellRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-dsh-source-gate-'));
    const manifestPath = path.join(shellRoot, 'vendor/visual-source-manifest.json');
    const licensePath = path.join(shellRoot, 'vendor/LICENSE');
    const iconPath = path.join(shellRoot, 'vendor/packages/client/icon.txt');
    const license = 'MIT\n';
    const icon = 'normalized icon source\n';
    fs.mkdirSync(path.dirname(iconPath), { recursive: true });
    fs.writeFileSync(licensePath, license, 'utf8');
    fs.writeFileSync(iconPath, icon, 'utf8');

    const sourceContract = {
      upstream: {
        repository: 'https://github.com/deepseek-ai/deepseek-harness.git',
        commit: '4'.repeat(40),
        license: 'MIT',
        license_source_path: 'LICENSE',
      },
      runtime_vendored_source_paths: ['packages/client/icon.txt'],
      adapter_reference_source_paths: [],
      deferred_reference_source_paths: [],
      excluded_source_and_runtime: [],
      shell_adoption: {
        reuse_mode: 'bounded_vendored_visual_source_with_opl_adapters',
        required_source_manifest: 'vendor/visual-source-manifest.json',
        required_license_notice: 'vendor/LICENSE',
        allowed_vendor_normalizations: [normalization],
      },
      evidence_boundary: {
        shell_source_implemented: true,
      },
    };
    const manifest = {
      schema_version: 1,
      schema: 'opl_aionui_dsh_visual_source_manifest.v1',
      upstream: {
        repository: sourceContract.upstream.repository,
        commit: sourceContract.upstream.commit,
        license: sourceContract.upstream.license,
      },
      source_policy: {
        app_contract: 'contracts/app-gui-visual-source-cohort.json',
        reuse_mode: sourceContract.shell_adoption.reuse_mode,
        vendored_files_byte_identical: false,
        import_path_normalizations: [],
        toolchain_compatibility_normalizations: [normalization],
        runtime_authority_imported: false,
      },
      vendored_files: [
        {
          path: 'LICENSE',
          sha256: createHash('sha256').update(license).digest('hex'),
          role: 'license_notice',
        },
        {
          path: 'packages/client/icon.txt',
          upstream_sha256: 'b'.repeat(64),
          sha256: createHash('sha256').update(icon).digest('hex'),
          normalization: normalization.kind,
          role: 'runtime_icon_source',
        },
      ],
      reference_files: [],
    };
    writeJson(shellRoot, 'vendor/visual-source-manifest.json', manifest);
    return { shellRoot, manifestPath, licensePath, iconPath, sourceContract };
  };

  const valid = makeFixture();
  assert.doesNotThrow(() => validateShellDshVisualSource({ shellRoot: valid.shellRoot }, valid.sourceContract));
  assert.equal(resolveShellDshVisualSourceMode({ shellRoot: valid.shellRoot }, valid.sourceContract), true);

  const absentShellRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-dsh-source-absent-'));
  assert.equal(
    resolveShellDshVisualSourceMode(
      { shellRoot: absentShellRoot },
      {
        ...valid.sourceContract,
        evidence_boundary: {
          ...valid.sourceContract.evidence_boundary,
          shell_source_implemented: false,
        },
      },
    ),
    false,
  );
  assert.throws(
    () => resolveShellDshVisualSourceMode({ shellRoot: absentShellRoot }, valid.sourceContract),
    /Missing active shell implementation file/,
  );

  const hashMutations = [
    ['vendored source hash', (fixture: ReturnType<typeof makeFixture>) => fs.writeFileSync(fixture.iconPath, 'tampered\n', 'utf8'), /must match its SHA-256/],
    ['LICENSE hash', (fixture: ReturnType<typeof makeFixture>) => fs.writeFileSync(fixture.licensePath, 'tampered license\n', 'utf8'), /must match its SHA-256/],
    ['pinned commit', (fixture: ReturnType<typeof makeFixture>) => {
      const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
      manifest.upstream.commit = '5'.repeat(40);
      writeJson(fixture.shellRoot, 'vendor/visual-source-manifest.json', manifest);
    }, /must bind the App-pinned repository, commit, and MIT license/],
    ['normalized upstream hash', (fixture: ReturnType<typeof makeFixture>) => {
      const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
      delete manifest.vendored_files[1].upstream_sha256;
      writeJson(fixture.shellRoot, 'vendor/visual-source-manifest.json', manifest);
    }, /must declare its normalization and upstream SHA-256/],
    ['runtime authority policy', (fixture: ReturnType<typeof makeFixture>) => {
      const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
      manifest.source_policy.runtime_authority_imported = true;
      writeJson(fixture.shellRoot, 'vendor/visual-source-manifest.json', manifest);
    }, /must preserve the bounded adapter-only source policy and declared normalizations/],
    ['vendor directory closure', (fixture: ReturnType<typeof makeFixture>) => {
      fs.writeFileSync(path.join(fixture.shellRoot, 'vendor/unregistered.txt'), 'residue\n', 'utf8');
    }, /must contain only the manifest, LICENSE, and declared source files/],
  ] as const;

  for (const [label, mutate, expectedError] of hashMutations) {
    const fixture = makeFixture();
    mutate(fixture);
    assert.throws(
      () => validateShellDshVisualSource({ shellRoot: fixture.shellRoot }, fixture.sourceContract),
      expectedError,
      label,
    );
  }
});

test('GUI design-system validator rejects a missing or reordered visual scene', () => {
  const root = createFixture();
  const cohortPath = path.join(root, 'contracts/app-gui-visual-reference-cohort.json');
  const cohort = JSON.parse(fs.readFileSync(cohortPath, 'utf8'));
  cohort.scene_matrix.reverse();
  cohort.scene_matrix.pop();
  writeJson(root, 'contracts/app-gui-visual-reference-cohort.json', cohort);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /must contain exactly 16 governed scenes|must remain home-default-desktop-light-zh with exact binding fields/,
  );
});

test('GUI design-system validator requires the exact Updates browser route without fallback', () => {
  for (const route of [
    '/settings/environment?section=maintenance',
    '/settings/environment',
  ]) {
    const root = createFixture();
    const cohortPath = path.join(root, 'contracts/app-gui-visual-reference-cohort.json');
    const cohort = JSON.parse(fs.readFileSync(cohortPath, 'utf8'));
    const scene = cohort.scene_matrix.find(
      (entry: { id?: string }) => entry.id === 'settings-maintenance-desktop-dark-zh',
    );
    assert.equal(scene.route, '/settings/environment?section=updates');
    scene.route = route;
    writeJson(root, 'contracts/app-gui-visual-reference-cohort.json', cohort);

    assert.throws(
      () => validateGuiDesignSystem(root),
      /must remain settings-maintenance-desktop-dark-zh with exact binding fields/,
    );
  }
});

test('GUI design-system validator rejects visual evidence ownership drifting into source ownership', () => {
  const root = createFixture();
  const cohortPath = path.join(root, 'contracts/app-gui-visual-reference-cohort.json');
  const cohort = JSON.parse(fs.readFileSync(cohortPath, 'utf8'));
  cohort.evidence_boundary.final_evidence_owner_role = 'source_and_release_owner';
  cohort.evidence_boundary.visual_parity_complete = true;
  writeJson(root, 'contracts/app-gui-visual-reference-cohort.json', cohort);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /must keep source, pixel, installed, release, and final-evidence ownership separate/,
  );
});

test('GUI design-system validator rejects the superseded same-cohort evidence role', () => {
  const root = createFixture();
  const cohortPath = path.join(root, 'contracts/app-gui-visual-reference-cohort.json');
  const cohort = JSON.parse(fs.readFileSync(cohortPath, 'utf8'));
  cohort.evidence_boundary.final_evidence_owner_role =
    'same_cohort_installed_evidence_only_no_source_ownership';
  writeJson(root, 'contracts/app-gui-visual-reference-cohort.json', cohort);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /must keep source, pixel, installed, release, and final-evidence ownership separate/,
  );
});

test('GUI design-system validator rejects explicit candidate detail in default convergence', () => {
  const root = createFixture();
  const packagePath = path.join(root, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.scripts['validate:shell-convergence'] += ' && npm run validate:candidate:studio';
  writeJson(root, 'package.json', packageJson);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /must not pull explicit candidate detail into default gates/,
  );
});

test('GUI design-system validator rejects a fixed Home shortcut limit', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.home.starter_limit = 4;
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /interaction baseline Home, conversation, composer, Agents management, and task summary markers must match the App target/,
  );
});

test('GUI design-system validator rejects prerelease upstream intake and unscoped parity claims', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.gui_maintenance_policy.aionui_upstream_following.channel = 'latest_tag_including_prerelease';
  contract.gui_maintenance_policy.goal.one_to_one_claim_policy = 'product_wide_one_to_one';
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /GUI maintenance policy must version the pinned DSH visual source|GUI maintenance policy must follow stable AionUI tags/,
  );
});

test('GUI design-system validator rejects a Settings return path that can recurse into Settings', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.settings_navigation.return_to_app.settings_destination_forbidden = false;
  contract.settings_navigation.return_to_app.fallback_path = '/settings/general';
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /Settings shell must keep one Back to app action above desktop search or in the narrow titlebar without a desktop titlebar duplicate/,
  );
});

test('GUI design-system validator rejects a duplicate desktop titlebar return control', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const pageStatePath = path.join(root, 'contracts/app-page-state-matrix.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const pageState = JSON.parse(fs.readFileSync(pageStatePath, 'utf8'));
  contract.settings_navigation.return_to_app.desktop_titlebar_duplicate_forbidden = false;
  pageState.settings_shell_navigation.required_dom.expanded = ['settings-titlebar-history-back', 'settings-search-input'];
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);
  writeJson(root, 'contracts/app-page-state-matrix.json', pageState);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /Settings shell must keep one Back to app action above desktop search or in the narrow titlebar without a desktop titlebar duplicate/,
  );
});

test('GUI design-system validator rejects a footer update row or a restored theme preset gallery', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.settings_navigation.footer_update_entry.replaces = 'gateway_account_entry';
  contract.theme_and_branding.allowed_theme_ids.push('codex');
  contract.theme_and_branding.appearance_mode.theme_preset_surface = 'gallery';
  contract.theme_and_branding.appearance_mode.presentation = 'segmented_text_control';
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /Settings appearance must use a single governed baseline with three-state appearance while the account row conditionally reuses the existing App updater/,
  );
});

test('GUI design-system validator rejects a duplicate Capabilities rail entry', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.navigation_rail.top_entries.push('capabilities');
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /interaction baseline navigation rail must preserve the governed desktop and narrow-window skeleton/,
  );
});

test('GUI design-system validator rejects a duplicate Capabilities selection surface', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.capability_selection.selection_surfaces.push('capabilities');
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /interaction baseline Home, conversation, composer, Agents management, and task summary markers must match the App target/,
  );
});

test('GUI design-system validator follows a changed App-profile reasoning default', () => {
  const root = createFixture();
  const profilePath = path.join(root, 'contracts/app-product-profile.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  profile.codex.default_reasoning_effort = 'future-effort';
  writeJson(root, 'contracts/app-product-profile.json', profile);

  assert.equal(validateGuiDesignSystem(root).model_defaults.reasoning_effort, 'future-effort');
});

test('GUI design-system validator ignores explicit Native candidate detail drift', () => {
  const root = createFixture();
  const registryPath = path.join(root, 'contracts/app-shell-candidates.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const native = registry.candidates.find((candidate) => candidate.id === 'opl-studio');
  native.dsh_source_reuse_contract.default_reasoning_effort = 'candidate-only-drift';
  native.required_capabilities = [];
  writeJson(root, 'contracts/app-shell-candidates.json', registry);

  assert.equal(validateGuiDesignSystem(root).status, 'consistent');
});

test('GUI design-system validator reports a collapsed active AionUI rail as a contract deviation', () => {
  const root = createFixture();
  const profilePath = path.join(root, 'contracts', 'app-product-profile.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  profile.gui.home.home_layout.workspace_session_rail_default_state = 'collapsed';
  writeJson(root, 'contracts/app-product-profile.json', profile);

  const summary = validateGuiDesignSystem(root);
  assert.equal(summary.state_boundary.active_aionui_rail_state, 'collapsed');
  assert.equal(summary.state_boundary.active_aionui_conformance.rail_matches_ideal, false);
  assert.equal(summary.state_boundary.active_aionui_conformance.rail_status, 'current_contract_deviation');
  assert.equal(summary.state_boundary.active_aionui_inspector_state, 'collapsed');
  assert.equal(summary.state_boundary.active_aionui_conformance.inspector_matches_ideal, true);
});

test('GUI design-system validator rejects a floating visual source', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.visual_source.selection_policy = 'floating_master';
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);
  assert.throws(
    () => validateGuiDesignSystem(root),
    /visual source policy must bind the pinned DSH cohort/,
  );
});

test('GUI design-system validator rejects an external-product pixel baseline', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.pixel_baseline.owner = 'ChatGPT Codex macOS';
  contract.interaction_baseline.pixel_baseline.external_product_artifact_required = true;
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);
  assert.throws(
    () => validateGuiDesignSystem(root),
    /pixel regression must use the App-owned baseline/,
  );
});

test('GUI design-system validator rejects a superseded visual source schema', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.schema_version = 1;
  contract.interaction_baseline.schema = 'opl_app_codex_interaction_baseline.v1';
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);
  assert.throws(
    () => validateGuiDesignSystem(root),
    /visual source policy must bind the pinned DSH cohort/,
  );
});

test('GUI design-system validator rejects the legacy eight-surface inspector taxonomy', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.context_surfaces.side_panel.primary_tools = ['review', 'terminal', 'browser', 'files'];
  contract.interaction_baseline.context_surfaces.side_panel.secondary_sections = ['artifacts', 'runtime', 'actions', 'memory'];
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);
  assert.throws(() => validateGuiDesignSystem(root), /legacy equal-weight inspector taxonomy/);
});

test('GUI design-system validator rejects mixing OPL target entries into literal Codex observation', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  delete contract.interaction_baseline.literal_observation;
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);
  assert.throws(() => validateGuiDesignSystem(root), /must separate literal Codex observations from OPL-owned target translation/);
});

test('GUI design-system validator rejects removing Runtime from the active AionUI primary rail', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.navigation_rail.top_entries = ['new_task', 'scheduled_tasks', 'archived'];
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);
  assert.throws(
    () => validateGuiDesignSystem(root),
    /interaction baseline navigation rail must preserve the governed desktop and narrow-window skeleton/,
  );
});

test('GUI design-system validator rejects making the core Runtime route optional', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.feature_preservation_policy.runtime_preservation_gate.default_product_requirement = false;
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);
  assert.throws(
    () => validateGuiDesignSystem(root),
    /historical interaction alignment must preserve OPL-owned capabilities and same-change reachability/,
  );
});

test('GUI design-system validator rejects an active Codex visual baseline in candidate governance', () => {
  const root = createFixture();
  const registryPath = path.join(root, 'contracts/app-shell-candidates.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  registry.design_system_governance.interaction_reference.comparison_baseline =
    'ChatGPT Codex macOS 26.707.72221 build 5307';
  writeJson(root, 'contracts/app-shell-candidates.json', registry);
  assert.throws(
    () => validateGuiDesignSystem(root),
    /Codex must remain only a historical workflow and spatial interaction reference/,
  );
});

test('GUI design-system validator rejects a page-state boundary that promotes contract target to source completion', () => {
  const root = createFixture();
  const matrixPath = path.join(root, 'contracts/app-page-state-matrix.json');
  const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
  matrix.acceptance_boundary.contract_target_implies_source_complete = true;
  writeJson(root, 'contracts/app-page-state-matrix.json', matrix);
  assert.throws(
    () => validateGuiDesignSystem(root),
    /page-state acceptance boundary must keep human target separate from source and pixel completion/,
  );
});

test('GUI design-system validator rejects making Runtime optional for an adopted shell', () => {
  const root = createFixture();
  const matrixPath = path.join(root, 'contracts/app-page-state-matrix.json');
  const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));
  matrix.acceptance_boundary.runtime_adopted_shell_required = false;
  writeJson(root, 'contracts/app-page-state-matrix.json', matrix);
  assert.throws(
    () => validateGuiDesignSystem(root),
    /page-state acceptance boundary must keep human target separate from source and pixel completion/,
  );
});

test('GUI design-system validator rejects a historical evidence binding that drifts from its manifest', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.acceptance_boundary.historical_pixel_shell_sha =
    '0000000000000000000000000000000000000000';
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /AionUI 41301 visual evidence manifest must bind eight packaged route\/layout entries/,
  );
});

test('GUI design-system validator rejects treating historical pixels as the current source head', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.acceptance_boundary.current_source_head_source = 'contract_static_sha';
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /interaction baseline must keep the human target separate from source, pixel, and release completion/,
  );
});

test('GUI design-system validator rejects a verified ancestor outside the active checkout', () => {
  const root = createFixture();
  const adapterPath = path.join(root, 'contracts/app-shell-adapter.json');
  const adapter = JSON.parse(fs.readFileSync(adapterPath, 'utf8'));
  adapter.shell_source.upstream_ref = '0000000000000000000000000000000000000000';
  writeJson(root, 'contracts/app-shell-adapter.json', adapter);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /active AionUI checkout [0-9a-f]{40} must contain verified GUI ancestor 0000000000000000000000000000000000000000/,
  );
});

test('GUI design-system validator treats declared Markdown as human-readable content', () => {
  const root = createFixture();
  fs.appendFileSync(
    path.join(root, 'docs/product/gui/shell-conformance-matrix.md'),
    '\nHuman notes may change without changing the machine contract.\n',
  );
  assert.equal(validateGuiDesignSystem(root).status, 'consistent');
});

test('GUI design-system validator rejects artifact preview body copying or unsafe ref guessing', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.artifact_preview.artifact_body_authority = 'shell_copy';
  contract.interaction_baseline.artifact_preview.unsafe_or_unsupported_ref_policy = 'guess_content';
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /artifact preview must reuse the existing Preview surface through a ref-only fail-closed adapter/,
  );
});

test('GUI design-system validator rejects workspace-readiness gating explicit session local inputs', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.conversation_scope.explicit_session_input_policy
    .workspace_readiness_boundary.send_scoped_local_file_inputs_require_workspace_root = true;
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /interaction baseline Home, conversation, composer, Agents management, and task summary markers must match the App target/,
  );
});

test('GUI design-system validator rejects dropping failed send input restoration', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.ordinary_conversation.send_failure_input_policy.concurrent_edit_merge_policy =
    'replace_current_composer';
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /send failures must restore prompt and attachments without overwriting post-submit input/,
  );
});

test('GUI design-system validator rejects weakened Codex subagent projection or private orchestration', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.ordinary_conversation.codex_subagent_activity.display.read_only = false;
  contract.ordinary_conversation.codex_subagent_activity.forbidden_layers = [];
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /Codex subagent activity must stay a read-only single-adapter projection without private orchestration/,
  );
});

test('GUI design-system validator rejects workspace-owned sessions and bound-session project reassignment', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const sessionWorkspaceModel = contract.interaction_baseline.conversation_scope.session_workspace_model;
  sessionWorkspaceModel.workspace_owns_session = true;
  sessionWorkspaceModel.bound_project_reassignment = 'exposed';
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /conversation scope must keep canonical session identity, allow one projectless adoption, and forbid bound-session reassignment/,
  );
});

test('GUI design-system validator rejects removal of projectless one-time project adoption', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const sessionWorkspaceModel = contract.interaction_baseline.conversation_scope.session_workspace_model;
  sessionWorkspaceModel.project_adoption_transition = 'not_exposed';
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /conversation scope must keep canonical session identity, allow one projectless adoption, and forbid bound-session reassignment/,
  );
});

test('GUI design-system validator rejects directory cascade delete and stale Codex cache authority', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const threadDirectory = contract.interaction_baseline.navigation_rail.thread_directory_policy;
  threadDirectory.directory_group_policy.cascade_session_delete_allowed = true;
  threadDirectory.stale_codex_acp_cache_row_policy = 'preserve_in_ordinary_projection';
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /interaction baseline navigation rail must preserve the governed desktop and narrow-window skeleton/,
  );
});

test('GUI design-system validator rejects a full-width rail search row', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.navigation_rail.thread_directory_policy.history_search = {
    placement: 'standalone_row',
    presentation: 'icon_and_text',
    accessible_name_required: true,
    expanded_full_width_row_allowed: true,
  };
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /interaction baseline navigation rail must preserve the governed desktop and narrow-window skeleton/,
  );
});

test('GUI design-system validator rejects stale Codex light surfaces and composer typography', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.visual_target.light_surfaces.navigation_rail = '#F4F4F2';
  contract.interaction_baseline.visual_target.typography.conversation = '16/24/400';
  contract.interaction_baseline.visual_target.composer_elevation = 'outline_only';
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /interaction baseline must reject the legacy equal-weight inspector taxonomy and keep Settings in maintenance/,
  );
});

test('GUI design-system validator rejects weakened B0-14 contrast and evidence boundaries', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.visual_target.accessibility.ordinary_text_min_contrast_ratio = 3;
  contract.interaction_baseline.visual_target.accessibility.source_evidence_closes_pixel_or_install = true;
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /B0-14 accessibility contract must keep WCAG thresholds and source evidence separate from Pixel and Install/,
  );
});

test('GUI design-system validator rejects card-backed or loosely spaced conversation output', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.visual_target.conversation_rendering.paragraph_margin_block_px = 16;
  contract.interaction_baseline.visual_target.conversation_rendering.tool_event = 'card_backed_tool_summary';
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /interaction baseline must reject the legacy equal-weight inspector taxonomy and keep Settings in maintenance/,
  );
});

test('GUI design-system validator rejects restored workspace-scoped project context inputs', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.conversation_scope.project_context_inputs = {
    scope: 'canonical_workspace_path',
  };
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /interaction baseline Home, conversation, composer, Agents management, and task summary markers must match the App target/,
  );
});

test('GUI design-system validator rejects a shell-owned ordinary rail thread history', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.navigation_rail.thread_directory_policy.shell_thread_history_authority = true;
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /interaction baseline navigation rail must preserve the governed desktop and narrow-window skeleton/,
  );
});

test('GUI design-system validator rejects a workspace-only explicit local artifact preview', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.artifact_preview.explicit_local_path_policy.workspace_membership_required = true;
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /artifact preview must reuse the existing Preview surface through a ref-only fail-closed adapter/,
  );
});

test('GUI design-system validator rejects a private thread coordination control plane', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.thread_coordination.adapter = 'second_json_rpc_client';
  contract.interaction_baseline.thread_coordination.model_tool_access = true;
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /thread operations must use one user-initiated Codex App Server adapter without a private coordination control plane/,
  );
});
test('GUI design-system validator rejects an English-first locale default without an explicit preference', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.ui_locale_policy.first_launch_without_preference = 'default_en-US_before_first_render';
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /GUI contract and product profile must detect system locale before first render/,
  );
});





test('GUI design-system validator rejects a false line-comment source-complete claim', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.context_surfaces.review_pane.source_capability_status.inline_comments =
    'source_implemented_shell_annotation_store';
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /interaction baseline must reject the legacy equal-weight inspector taxonomy and keep Settings in maintenance/,
  );
});

test('GUI design-system validator rejects a duplicate Git store for Review parity', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.context_surfaces.review_pane.duplicate_git_store_allowed = true;
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /interaction baseline Home, conversation, composer, Agents management, and task summary markers must match the App target|interaction baseline must reject the legacy equal-weight inspector taxonomy/,
  );
});

test('GUI design-system validator rejects a reintroduced managed Worktree lifecycle', () => {
  const root = createFixture();
  const contractPath = path.join(root, 'contracts/app-gui-product-contract.json');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  contract.interaction_baseline.conversation_scope.local_worktree_lifecycle = {
    state: 'managed_create_reuse',
  };
  writeJson(root, 'contracts/app-gui-product-contract.json', contract);

  assert.throws(
    () => validateGuiDesignSystem(root),
    /interaction baseline Home, conversation, composer, Agents management, and task summary markers must match the App target/,
  );
});

test('GUI design-system validator rejects a candidate-owned ideal target', () => {
  const root = createFixture();
  const registryPath = path.join(root, 'contracts', 'app-shell-candidates.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  registry.design_system_governance.state_boundary.ideal_target.source_candidate = 'opl-studio';
  writeJson(root, 'contracts/app-shell-candidates.json', registry);
  assert.throws(
    () => validateGuiDesignSystem(root),
    /ideal target must be App-owned and flow one-way to shells without a source candidate/,
  );
});

test('GUI design-system validator rejects an App-owned ideal rail regression', () => {
  const root = createFixture();
  const registryPath = path.join(root, 'contracts', 'app-shell-candidates.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  registry.design_system_governance.state_boundary.ideal_target.workspace_session_rail_default_visible = false;
  writeJson(root, 'contracts/app-shell-candidates.json', registry);
  assert.throws(
    () => validateGuiDesignSystem(root),
    /App-owned ideal target must keep the desktop workspace\/session rail visible/,
  );
});

test('GUI design-system validator rejects promoted and source evidence timestamp drift', () => {
  const root = createFixture();
  const sourcePath = path.join(root, 'docs/product/gui/evidence/aionui-41301/source-manifest.json');
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  source.generated_at = '2026-07-11T00:00:00.000Z';
  writeJson(root, 'docs/product/gui/evidence/aionui-41301/source-manifest.json', source);
  refreshSourceManifestHash(root);

  assert.throws(() => validateGuiDesignSystem(root), /must share one exact ISO generated_at timestamp/);
});

test('GUI design-system validator rejects promoted and source evidence scope drift', () => {
  const root = createFixture();
  const sourcePath = path.join(root, 'docs/product/gui/evidence/aionui-41301/source-manifest.json');
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  source.evidence_scope = 'route_state_only';
  writeJson(root, 'docs/product/gui/evidence/aionui-41301/source-manifest.json', source);
  refreshSourceManifestHash(root);

  assert.throws(() => validateGuiDesignSystem(root), /must share the route-state and layout-only evidence_scope/);
});

test('GUI design-system validator rejects promoted and source evidence claim drift', () => {
  const root = createFixture();
  const sourcePath = path.join(root, 'docs/product/gui/evidence/aionui-41301/source-manifest.json');
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  source.claims.parity_1_to_1 = true;
  writeJson(root, 'docs/product/gui/evidence/aionui-41301/source-manifest.json', source);
  refreshSourceManifestHash(root);

  assert.throws(() => validateGuiDesignSystem(root), /evidence claims must be identical and limited to the governed claim set/);
});

test('GUI design-system validator rejects promoted and source evidence entry ID drift', () => {
  const root = createFixture();
  const sourcePath = path.join(root, 'docs/product/gui/evidence/aionui-41301/source-manifest.json');
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  source.entries[0].id = 'stale-entry-id';
  writeJson(root, 'docs/product/gui/evidence/aionui-41301/source-manifest.json', source);
  refreshSourceManifestHash(root);

  assert.throws(() => validateGuiDesignSystem(root), /must preserve the same ordered entry ID set/);
});
