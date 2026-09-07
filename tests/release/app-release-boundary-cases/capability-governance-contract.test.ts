import {
  assert,
  fs,
  test,
} from './helpers.ts';
import {
  validateComponentCompatibilityReceipt,
  validateInstallExposurePolicy,
} from '../../../scripts/validate-active-shell/install-exposure-policy-validator.ts';
import { validateProductProfile } from '../../../scripts/validate-active-shell/product-profile-validator.ts';

const readJson = (relativePath: string) => JSON.parse(fs.readFileSync(relativePath, 'utf8'));

const compatibilityContext = {
  expected_receipt_path: '/tmp/opl-component-compatibility-receipt.json',
  expected_producer_identity: {
    command_surface: 'opl app compatibility receipt',
    executable_path: '/Applications/One Person Lab.app/Contents/Resources/opl-framework/bin/opl',
    executable_sha256: '1'.repeat(64),
    framework_version: '0.3.5',
    package_ref: 'one-person-lab@0.3.5',
  },
  expected_sources: {
    requirements: {
      path: '/tmp/compatibility-requirements.json',
      sha256: '2'.repeat(64),
    },
    subject: {
      path: '/tmp/compatibility-subject.json',
      sha256: '3'.repeat(64),
    },
  },
  expected_subject: {
    selected_app_artifact: {
      owner_authority: 'gaofeng21cn/one-person-lab-app',
      immutable_release_tag: 'v26.7.30',
      asset_url: 'https://example.invalid/One-Person-Lab.dmg',
      asset_name: 'One-Person-Lab.dmg',
      byte_size: 1024,
      sha256: '4'.repeat(64),
    },
    installed_app_asar: {
      path: '/Applications/One Person Lab.app/Contents/Resources/app.asar',
      sha256: '5'.repeat(64),
    },
    build_receipt: {
      path: '/tmp/build-receipt.json',
      sha256: '6'.repeat(64),
    },
  },
  max_age_seconds: 300,
  now: new Date('2026-07-30T00:00:00.000Z'),
};

function compatibilityReceiptFixture() {
  const requirements = [
    {
      requirement_id: 'framework_receipt_schema',
      component_id: 'opl_framework',
      kind: 'capability_id_with_versioned_schema',
      capability_id: 'opl_component_compatibility_receipt',
      schema_range: '>=1.0.0 <2.0.0',
    },
    {
      requirement_id: 'base_minimum',
      component_id: 'opl_base',
      kind: 'minimum_version',
      version_requirement: '1.2.0',
    },
    {
      requirement_id: 'shell_range',
      component_id: 'opl_shell',
      kind: 'semver_range',
      version_requirement: '>=1.5.0 <3.0.0',
    },
  ];
  const observation = (componentId: string, version: string, capabilities: unknown[] = []) => ({
    component_id: componentId,
    owner_authority: 'one-person-lab',
    version,
    observation_ref: `opl://component-observation/${componentId}`,
    capabilities,
  });
  return {
    schema: 'opl_component_compatibility_receipt.v1',
    owner: 'one-person-lab',
    producer_role: 'opl_framework',
    contract_ref:
      'contracts/app-install-exposure-policy.json#component_interoperability.compatibility_admission',
    producer_contract_ref:
      'contracts/opl-framework/app-component-compatibility-receipt-contract.json',
    producer_identity: {
      ...compatibilityContext.expected_producer_identity,
      executable_sha256: `sha256:${compatibilityContext.expected_producer_identity.executable_sha256}`,
    },
    receipt_ref: `file://${compatibilityContext.expected_receipt_path}`,
    generated_at: '2026-07-30T00:00:00.000Z',
    issued_at: '2026-07-30T00:00:00.000Z',
    expires_at: '2026-07-30T00:05:00.000Z',
    freshness: {
      status: 'fresh',
      generated_at: '2026-07-30T00:00:00.000Z',
      max_age_seconds: 300,
    },
    status: 'compatible',
    sources: {
      requirements: {
        ...compatibilityContext.expected_sources.requirements,
        sha256: `sha256:${compatibilityContext.expected_sources.requirements.sha256}`,
        owner: 'one-person-lab-app',
        schema: 'opl_component_compatibility_requirements.v1',
      },
      subject: {
        ...compatibilityContext.expected_sources.subject,
        sha256: `sha256:${compatibilityContext.expected_sources.subject.sha256}`,
        owner: 'one-person-lab-app',
        schema: 'opl_app_compatibility_subject.v1',
      },
    },
    subject: {
      selected_app_artifact: {
        ...compatibilityContext.expected_subject.selected_app_artifact,
        sha256: `sha256:${compatibilityContext.expected_subject.selected_app_artifact.sha256}`,
      },
      installed_app_asar: {
        ...compatibilityContext.expected_subject.installed_app_asar,
        sha256: `sha256:${compatibilityContext.expected_subject.installed_app_asar.sha256}`,
      },
      build_receipt: {
        ...compatibilityContext.expected_subject.build_receipt,
        sha256: `sha256:${compatibilityContext.expected_subject.build_receipt.sha256}`,
      },
    },
    requirements,
    observed_components: [
      observation('opl_framework', '0.3.5', [
        {
          capability_id: 'opl_component_compatibility_receipt',
          schema_version: '1.0.0',
        },
      ]),
      observation('opl_base', '1.4.0'),
      observation('opl_shell', '2.1.0'),
    ],
    coverage: requirements.map((requirement) => ({
      requirement_id: requirement.requirement_id,
      component_id: requirement.component_id,
      kind: requirement.kind,
      status: 'satisfied',
      observation_ref: `opl://component-observation/${requirement.component_id}`,
      failure_code: null,
    })),
    failures: [],
    authority_boundary: {
      compatibility_only: true,
      selected_artifact_binding_is_subject_evidence_only: true,
      may_require_exact_cross_component_version_or_sha: false,
      may_require_same_cohort: false,
      may_define_package_currentness: false,
      may_claim_release_ready: false,
      may_claim_install_ready: false,
    },
  } as any;
}

function makeRequirementFailure(receipt: any, index: number, code: string) {
  const coverage = receipt.coverage[index];
  coverage.status = 'unsatisfied';
  coverage.failure_code = code;
  receipt.failures = [
    {
      requirement_id: coverage.requirement_id,
      component_id: coverage.component_id,
      code,
    },
  ];
  receipt.status = 'incompatible';
}

test('Flow, carriers, Framework, and App preserve open composition without App lifecycle authority', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const productProfile = readJson('contracts/app-product-profile.json');
  const governance = installExposure.capability_governance;
  const surfaces = new Map(installExposure.installer_surfaces.map((entry: any) => [entry.surface, entry]));
  const standard = surfaces.get('standard_dmg') as any;
  const full = surfaces.get('full_first_install_dmg') as any;

  assert.doesNotThrow(() => validateInstallExposurePolicy(installExposure));
  assert.doesNotThrow(() => validateProductProfile(productProfile, installExposure));
  assert.equal(governance.lifecycle_surface, 'configured_carrier_install_update_remove');
  assert.equal(governance.app_role, 'gui_and_framework_projection_consumer_only');
  assert.equal(governance.managed_inventory.app_second_inventory_allowed, false);
  assert.equal(governance.managed_inventory.source, 'framework_unified_capability_projection');
  assert.equal('open_composition' in governance, false);
  assert.equal('declaration_authority_ref' in governance, false);
  assert.equal(
    installExposure.exposure_classes.some((entry: any) => entry.id === 'companion_tools_codex_skills'),
    false,
  );
  for (const surface of [standard, full]) {
    assert.equal('capability_target_closure' in surface, false);
    assert.equal('capability_source' in surface, false);
    assert.equal('optional_payload_policy' in surface, false);
  }
  assert.equal(governance.credential_policy.full_may_bundle_secrets, false);
  assert.equal(governance.mcp_policy.undeclared_user_server_policy, 'preserve');
  assert.equal(governance.mcp_policy.undeclared_user_server_delete_or_overwrite_allowed, false);

  const secondInventory = structuredClone(installExposure);
  secondInventory.capability_governance.managed_inventory.app_second_inventory_allowed = true;
  assert.throws(() => validateInstallExposurePolicy(secondInventory), /App-owned managed capability inventory/);

  const restoredFrameworkTransaction = structuredClone(installExposure);
  restoredFrameworkTransaction.capability_governance.lifecycle_surface = 'opl_framework_package_transaction';
  assert.throws(
    () => validateInstallExposurePolicy(restoredFrameworkTransaction),
    /carrier -> Framework -> App projection boundary/,
  );

  const requiredPayload = structuredClone(installExposure);
  requiredPayload.installer_surfaces.find((entry: any) => entry.surface === 'full_first_install_dmg')
    .optional_payload_policy = 'required';
  assert.throws(() => validateInstallExposurePolicy(requiredPayload), /must not own Package dependency or payload policy/);
});

test('Framework compatibility receipts admit independent versions only through capability or version requirements', () => {
  const receipt = compatibilityReceiptFixture();
  assert.doesNotThrow(() =>
    validateComponentCompatibilityReceipt(receipt, {
      ...compatibilityContext,
      expected_requirements: receipt.requirements,
    }),
  );

  for (const [index, code] of [
    [0, 'incompatible_missing_capability'],
    [0, 'incompatible_capability_schema'],
    [1, 'incompatible_minimum_version'],
    [2, 'incompatible_semver_range'],
  ] as const) {
    const incompatible = compatibilityReceiptFixture();
    makeRequirementFailure(incompatible, index, code);
    assert.equal(
      validateComponentCompatibilityReceipt(incompatible, {
        ...compatibilityContext,
        expected_requirements: incompatible.requirements,
      }).status,
      'incompatible',
    );
  }
});

test('Framework compatibility receipt validation rejects empty, unbound, expired, and identity-lock claims', () => {
  const emptyRequirements = compatibilityReceiptFixture();
  emptyRequirements.requirements = [];
  emptyRequirements.coverage = [];
  assert.throws(
    () => validateComponentCompatibilityReceipt(emptyRequirements, compatibilityContext),
    /non-empty requirements/,
  );

  const emptyObservations = compatibilityReceiptFixture();
  emptyObservations.observed_components = [];
  emptyObservations.coverage.forEach((entry: any) => {
    entry.observation_ref = null;
  });
  assert.throws(
    () => validateComponentCompatibilityReceipt(emptyObservations, compatibilityContext),
    /Framework observation|without failures/,
  );

  const expired = compatibilityReceiptFixture();
  expired.generated_at = '2026-07-29T23:50:00.000Z';
  expired.issued_at = expired.generated_at;
  expired.expires_at = '2026-07-29T23:55:00.000Z';
  expired.freshness.generated_at = expired.generated_at;
  assert.throws(
    () => validateComponentCompatibilityReceipt(expired, compatibilityContext),
    /expired|freshness/,
  );

  const subjectDrift = compatibilityReceiptFixture();
  subjectDrift.subject.build_receipt.sha256 = `sha256:${'0'.repeat(64)}`;
  assert.throws(
    () => validateComponentCompatibilityReceipt(subjectDrift, compatibilityContext),
    /subject drifted/,
  );

  const producerDrift = compatibilityReceiptFixture();
  producerDrift.producer_identity.framework_version = '0.3.4';
  assert.throws(
    () => validateComponentCompatibilityReceipt(producerDrift, compatibilityContext),
    /producer identity/,
  );

  const forbiddenIdentityFailure = compatibilityReceiptFixture();
  forbiddenIdentityFailure.coverage[0].status = 'unsatisfied';
  forbiddenIdentityFailure.coverage[0].failure_code = 'cross_component_sha_mismatch';
  forbiddenIdentityFailure.failures = [
    {
      requirement_id: forbiddenIdentityFailure.coverage[0].requirement_id,
      component_id: forbiddenIdentityFailure.coverage[0].component_id,
      code: 'cross_component_sha_mismatch',
    },
  ];
  forbiddenIdentityFailure.status = 'incompatible';
  assert.throws(
    () => validateComponentCompatibilityReceipt(forbiddenIdentityFailure, compatibilityContext),
    /failure code inconsistent|Cross-component identity/,
  );

  const missingExecutedProducerBinding = compatibilityReceiptFixture();
  assert.throws(
    () => validateComponentCompatibilityReceipt(missingExecutedProducerBinding, {
      ...compatibilityContext,
      expected_producer_identity: undefined,
    }),
    /executed producer identity binding/,
  );

  const forbiddenAuthorityBoundary = compatibilityReceiptFixture();
  forbiddenAuthorityBoundary.authority_boundary.may_require_same_cohort = true;
  assert.throws(
    () => validateComponentCompatibilityReceipt(forbiddenAuthorityBoundary, compatibilityContext),
    /authority boundary/,
  );
});

test('model precedence keeps a supported App frontier ahead of stale recommendations', () => {
  const installExposure = readJson('contracts/app-install-exposure-policy.json');
  const productProfile = readJson('contracts/app-product-profile.json');
  assert.deepEqual(productProfile.codex.auto_model_policy.resolution_precedence, [
    'explicit_user_selection',
    'fresh_catalog_frontier_then_app_default_when_available',
    'installed_opl_flow_recommendation',
    'fresh_codex_live_default',
    'app_fallback_when_flow_unavailable',
  ]);
  assert.equal(
    productProfile.codex.auto_model_policy.app_fallback_role,
    'configured_default_when_catalog_metadata_is_unavailable',
  );
  assert.equal(
    productProfile.codex.auto_model_policy.policy_source_ref,
    'app_state.agent_packages.status_index.packages.opl-flow.model_projection',
  );
  assert.equal(
    productProfile.codex.auto_model_policy.configured_default_role,
    'app_default_with_catalog_compatibility_fallback',
  );

  const competingAppDefault = structuredClone(productProfile);
  competingAppDefault.codex.auto_model_policy.resolution_precedence = [
    'explicit_user_selection',
    'app_fallback_when_flow_unavailable',
    'installed_opl_flow_recommendation',
    'fresh_codex_live_default',
  ];
  assert.throws(
    () => validateProductProfile(competingAppDefault, installExposure),
    { code: 'app_model_policy_precedence' },
  );
});

test('Full source manifest supplies resolution hints without selecting capabilities', () => {
  const manifest = readJson('contracts/app-full-third-party-source-manifest.json');
  const projection = manifest.projection;

  assert.equal(projection.role, 'selected_capability_source_resolution_hints');
  assert.equal(
    projection.selection_authority,
    'opl-flow_strategy_via_opl-framework_compiler',
  );
  assert.equal(projection.materialization_authority, 'opl_flow_capability_build_lock.v1');
  assert.equal('capability_graph' in projection, false);
  assert.equal(projection.framework_input.selection, 'workflow_input_framework_ref');
  assert.equal(projection.generation_contract.preexisting_release_set_required, false);
  assert.equal(projection.generation_contract.preexisting_lock_required, false);
  assert.equal(projection.generation_contract.payload_inventory_required, false);
  assert.equal(projection.generation_contract.selected_inputs_recorded_after_resolution, true);
  assert.equal(manifest.authority_boundary.manifest_is_dependency_authority, false);
  assert.equal(manifest.authority_boundary.source_versions_are_default_selection_hints, true);
  assert.equal(manifest.authority_boundary.credential_values_may_be_bundled, false);
  assert.equal(manifest.authority_boundary.unknown_user_or_third_party_mcp_may_be_removed, false);
  assert.equal('ui_ux_pro_max' in manifest.sources, false);
});
