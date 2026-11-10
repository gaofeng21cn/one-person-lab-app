import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  candidateValidationPolicyFromRegistry,
  validateCandidate,
} from '../../scripts/validate-shell-candidates/candidate-contract.ts';
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
