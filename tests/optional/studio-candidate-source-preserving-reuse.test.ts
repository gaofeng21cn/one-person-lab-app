import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  candidateValidationPolicyFromRegistry,
  validateCandidate,
} from '../../scripts/validate-shell-candidates/candidate-contract.ts';
import { validateDeepSeekHarnessSourceEvidence } from '../../scripts/validate-shell-candidates/candidate-evidence.ts';
import type { ShellCandidateRegistry } from '../../scripts/validate-shell-candidates/types.ts';

const registry = JSON.parse(
  fs.readFileSync('contracts/app-shell-candidates.json', 'utf8'),
) as ShellCandidateRegistry;
const policy = candidateValidationPolicyFromRegistry(registry);

function studioCandidate() {
  const candidate = registry.candidates.find((entry) => entry.id === 'opl-studio');
  assert.ok(candidate);
  return structuredClone(candidate);
}

test('Studio contract requires source-preserving DSH reuse instead of pixel reimplementation', () => {
  const candidate = studioCandidate();
  assert.doesNotThrow(() => validateCandidate(candidate, policy));
  assert.equal(
    candidate.dsh_source_reuse_contract?.pixel_evidence_role,
    'detect_regressions_after_source_reuse_and_opl_integration_not_reconstruct_or_approximate_dsh',
  );
  assert.equal(candidate.dsh_source_reuse_contract?.parallel_opl_visual_system_allowed, false);
  assert.equal(
    candidate.dsh_source_reuse_contract?.vendor_byte_policy,
    'pinned_upstream_plus_manifest_bound_reviewed_compatibility_patches',
  );
});

test('Studio contract rejects a parallel visual system or screenshot reconstruction policy', () => {
  const parallel = studioCandidate();
  assert.ok(parallel.dsh_source_reuse_contract);
  parallel.dsh_source_reuse_contract.parallel_opl_visual_system_allowed = true;
  assert.throws(() => validateCandidate(parallel, policy), /source-preserving DSH GUI reuse/);

  const reconstructed = studioCandidate();
  assert.ok(reconstructed.dsh_source_reuse_contract);
  reconstructed.dsh_source_reuse_contract.pixel_evidence_role = 'reconstruct_dsh_from_screenshots';
  assert.throws(() => validateCandidate(reconstructed, policy), /source-preserving DSH GUI reuse/);
});

test('Studio contract closes OPL injection to public extension and host boundaries', () => {
  const candidate = studioCandidate();
  assert.deepEqual(candidate.dsh_source_reuse_contract?.opl_injection_boundary, [
    'brand_text_through_public_props_or_slots',
    'app_owned_data_through_the_host_bridge',
    'capability_classification_through_typed_contributions',
    'host_specific_behavior_through_external_adapters',
  ]);

  assert.ok(candidate.dsh_source_reuse_contract);
  candidate.dsh_source_reuse_contract.opl_injection_boundary = [
    'brand_text_through_public_props_or_slots',
    'global_css_override',
  ];
  assert.throws(
    () => validateCandidate(candidate, policy),
    /opl_injection_boundary/,
  );
});

const dshReference = registry.design_references!.find(reference => reference.id === 'deepseek-harness')!;

function sourceEvidenceFixture() {
  const paths = [...dshReference.adopted_source!.files];
  while (paths.length < 741) paths.push(`packages/client/ui-plugin-manager/src/fixture-${paths.length}.ts`);
  const manifest = {
    upstream: { ref: dshReference.evaluated_ref },
    snapshot: {
      local_root: dshReference.adopted_source!.root,
      package_roots: [...dshReference.adopted_source!.package_roots!],
      file_count: paths.length,
    },
    files: paths.map(path => ({ path })),
  };
  const evidence = {
    vendored_source_root: dshReference.adopted_source!.root,
    vendored_file_count: manifest.files.length,
    vendored_package_roots: [...manifest.snapshot.package_roots],
    direct_reuse_modules: Object.entries(dshReference.adopted_packages!).map(([name, version]) => `${name}@${version}`),
  };
  return { manifest, evidence };
}

test('Studio source evidence follows the manifest inventory and preserves the App-selected PluginManager closure', () => {
  const { manifest, evidence } = sourceEvidenceFixture();
  assert.equal(manifest.files.length, 741);
  assert.equal(manifest.snapshot.package_roots.length, 25);
  assert.doesNotThrow(() => validateDeepSeekHarnessSourceEvidence('opl-studio', evidence, manifest, dshReference));

  // The file count comes from the manifest; adding a file does not require a second numeric constant.
  manifest.files.push({ path: 'packages/client/ui-plugin-manager/src/another-source.ts' });
  manifest.snapshot.file_count = manifest.files.length;
  evidence.vendored_file_count = manifest.files.length;
  assert.doesNotThrow(() => validateDeepSeekHarnessSourceEvidence('opl-studio', evidence, manifest, dshReference));
});

test('Studio source evidence rejects stale counts, missing PluginManager files, and unreviewed roots or dependencies', () => {
  const stale = sourceEvidenceFixture();
  stale.evidence.vendored_file_count = 701;
  assert.throws(() => validateDeepSeekHarnessSourceEvidence('opl-studio', stale.evidence, stale.manifest, dshReference), /source manifest inventory/);

  const missing = sourceEvidenceFixture();
  missing.manifest.files = missing.manifest.files.filter(entry => !entry.path.endsWith('/PluginManagerPage.tsx'));
  missing.manifest.snapshot.file_count = missing.manifest.files.length;
  missing.evidence.vendored_file_count = missing.manifest.files.length;
  assert.throws(() => validateDeepSeekHarnessSourceEvidence('opl-studio', missing.evidence, missing.manifest, dshReference), /App-selected files/);

  const rootDrift = sourceEvidenceFixture();
  rootDrift.manifest.snapshot.package_roots.pop();
  assert.throws(() => validateDeepSeekHarnessSourceEvidence('opl-studio', rootDrift.evidence, rootDrift.manifest, dshReference), /App-selected package roots/);

  const dependencyDrift = sourceEvidenceFixture();
  dependencyDrift.evidence.direct_reuse_modules = dependencyDrift.evidence.direct_reuse_modules.filter(entry => !entry.startsWith('@deepseek-ai/dsh-util-crypto@'));
  assert.throws(() => validateDeepSeekHarnessSourceEvidence('opl-studio', dependencyDrift.evidence, dependencyDrift.manifest, dshReference), /direct_reuse_modules/);
});
