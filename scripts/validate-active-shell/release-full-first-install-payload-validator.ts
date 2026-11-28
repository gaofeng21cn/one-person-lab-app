import { assertDeepEqualJson, assertIncludesAll } from './assertions.ts';
export function validateReleaseFullFirstInstallPayloads(releaseChannel) {
  validateReleaseFullCodexCliPayload(releaseChannel.full_first_install?.required_payloads?.codex_cli);
  validateReleaseFullSizeOptimizationPolicy(releaseChannel.full_first_install?.size_policy);
}

function validateReleaseFullCodexCliPayload(codexCli) {
  if (
    codexCli?.compatibility_mode !== 'studio_native_exact_external_binary' ||
    codexCli?.carrier_contract_ref !== 'contracts/app-shell-adapter.json#codex_executable_contract' ||
    codexCli?.resolver_env !== 'OPL_CODEX_BIN' ||
    codexCli?.version_source !== 'contracts/shell-adapters/opl-studio.json#qualification_external_carrier' ||
    codexCli?.projection_schema !== 'opl_codex_native_external_binary.v1' ||
    codexCli?.producer_schema_version !== 1 ||
    codexCli?.aioncore_required !== false ||
    codexCli?.framework_managed_payload_in_full_runtime_allowed !== false ||
    codexCli?.offline_seed_contract_ref !== 'contracts/app-release-qualification-input-manifest.json#runtime_payloads.codex_cli.full_offline_seed'
  ) {
    throw new Error('Release channel Full Codex CLI must use the Studio native external carrier without a Framework duplicate');
  }
  assertDeepEqualJson(
    codexCli.preferred_sources,
    ['studio_opl_codex_native_external_binary_v1'],
    'Release channel Codex CLI preferred sources',
  );
  assertDeepEqualJson(
    codexCli.forbidden_cli_names,
    ['claude'],
    'Release channel forbidden shell CLI names',
  );
  assertDeepEqualJson(
    codexCli.forbidden_framework_runtime_paths,
    ['bin/codex', 'bin/rg', 'vendor/codex', '.runtime-cache/codex-cli'],
    'Release channel forbidden Framework Codex paths',
  );
}

function validateReleaseFullSizeOptimizationPolicy(sizePolicy) {
  if (
    sizePolicy?.offline_first_install_completeness_must_not_regress !== true ||
    sizePolicy?.threshold_semantics?.review_full_dmg_bytes?.status !==
      'review_required_not_release_blocking_by_size_alone' ||
    !/not release-blocking by size alone/.test(sizePolicy?.threshold_semantics?.stable_release_coupling_rule ?? '')
  ) {
    throw new Error('Release channel Full size policy must decouple size review from stable release blocking while preserving offline first-install completeness');
  }
  const artifacts = sizePolicy.optimization_artifacts;
  if (
    artifacts?.schema !== 'opl_full_package_optimization.v1' ||
    artifacts?.manifest_section !== 'package_optimization' ||
    artifacts?.public_manifest !== 'opl-release-manifest.json' ||
    artifacts?.trim_report !== 'opl-release-manifest.json#evidence.app_bundle_trim_report' ||
    artifacts?.trim_report_schema !== 'opl_full_app_bundle_trim_report.v1' ||
    artifacts?.boundary_audit !== 'opl-release-manifest.json#evidence.package_boundary_audit' ||
    artifacts?.boundary_audit_schema !== 'opl_full_package_boundary_audit.v2' ||
    artifacts?.mode !== 'explicit_non_runtime_prune_only' ||
    artifacts?.required_manifest_flags?.offline_first_install_completeness_preserved !== true ||
    artifacts?.required_manifest_flags?.size_review_release_blocking_by_size_alone !== false
  ) {
    throw new Error('Release channel Full size policy must declare package optimization artifacts and manifest flags');
  }
  assertIncludesAll(
    artifacts.required_preserved_payloads,
    [
      'Contents/Resources/opl-full-runtime',
      'Contents/Resources/app.asar',
      'Contents/Resources/app.asar.unpacked',
      'Contents/Frameworks/Electron Framework.framework',
    ],
    'Release channel Full optimization preserved payloads',
  );
  assertIncludesAll(
    artifacts.required_remote_assets,
    ['opl-release-manifest.json'],
    'Release channel Full optimization remote assets',
  );
  assertIncludesAll(
    artifacts.transition_accepted_legacy_remote_assets,
    ['full-app-bundle-trim-report.json', 'full-package-boundary-audit.json'],
    'Release channel Full optimization transition legacy remote assets',
  );
}
