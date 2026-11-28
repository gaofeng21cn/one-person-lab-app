import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  validateOPLStudioCarrierEvidenceManifest,
  type OPLStudioCarrierEvidenceEntry,
  type OPLStudioCarrierEvidenceManifest,
} from '../../scripts/validate-shell-candidates/candidate-evidence.ts';
import type {
  OPLStudioCarrierId,
  ShellCandidate,
  ShellCandidateRegistry,
} from '../../scripts/validate-shell-candidates/types.ts';

const registry = JSON.parse(
  fs.readFileSync('contracts/app-shell-adapter.json', 'utf8'),
) as ShellCandidateRegistry;
const candidate = registry.candidates.find((entry) => entry.id === 'opl-studio') as ShellCandidate;
assert.ok(registry.carrier_evidence_contract);
const carrierEvidenceContract = registry.carrier_evidence_contract;

const artifactPaths: Record<OPLStudioCarrierId, string> = {
  electron_desktop: 'out/mac-arm64/One Person Lab Preview.app',
  standalone_headless_webui: 'dist/webui/index.html',
  docker_webui: 'out/docker-local-smoke.json',
};

function writeFile(root: string, relativePath: string, contents = ''): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function flatSourceRef(ref: string): string {
  return ref.replace(/^plugins\/core\//, 'plugins/');
}

function createCandidateTree(sourceRefForFixture = (ref: string) => ref): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-studio-carriers-'));
  const contract = carrierEvidenceContract;
  assert.ok(contract);
  for (const expected of Object.values(contract.entries)) {
    for (const sourceRef of [...expected.source_refs, expected.update_adapter_source.ref]) {
      writeFile(root, sourceRefForFixture(sourceRef));
    }
  }
  writeFile(root, 'out/mac-arm64/One Person Lab Preview.app/Contents/Info.plist', '<plist/>');
  writeFile(root, 'out/mac-arm64/One Person Lab Preview.app/Contents/MacOS/One Person Lab Preview', '#!/bin/sh\n');
  fs.chmodSync(
    path.join(root, 'out/mac-arm64/One Person Lab Preview.app/Contents/MacOS/One Person Lab Preview'),
    0o755,
  );
  writeFile(root, artifactPaths.standalone_headless_webui, '<!doctype html>');
  writeFile(root, artifactPaths.docker_webui, '{"status":"headless_docker_smoke_passed"}\n');
  return root;
}

function carrierEntry(carrierId: OPLStudioCarrierId): OPLStudioCarrierEvidenceEntry {
  const contract = carrierEvidenceContract;
  assert.ok(contract);
  const expected = contract.entries[carrierId];
  return {
    carrier_id: carrierId,
    source_implementation: { status: 'implemented', refs: [...expected.source_refs] },
    package_build: {
      status: 'passed_local_candidate_build',
      artifact_kind: expected.package_artifact_kind,
      artifact_path: artifactPaths[carrierId],
    },
    local_qualification: {
      status: 'passed_local_candidate_qualification',
      commands: [...expected.qualification_commands],
    },
    user_service_manager_source: structuredClone(expected.user_service_manager_source),
    distribution_wiring: {
      status: expected.distribution_wiring_status,
      current_aionui_release_evidence_reused: false,
    },
    update_adapter_source: structuredClone(expected.update_adapter_source),
    update_wiring: { status: expected.update_wiring_status },
    release: structuredClone(expected.release),
    ...(carrierId === 'docker_webui'
      ? {
          multi_arch_qualification: expected.multi_arch_qualification,
          signature_verification: expected.signature_verification,
        }
      : {}),
  };
}

function carrierManifest(): OPLStudioCarrierEvidenceManifest {
  const contract = carrierEvidenceContract;
  assert.ok(contract);
  return {
    schema: 'opl_studio_carrier_evidence.v1',
    candidate_id: 'opl-studio',
    source_commit: '0123456789abcdef0123456789abcdef01234567',
    candidate_only: true,
    release_authority: false,
    product_profile_owner: 'one-person-lab-app',
    default_release_shell_unchanged: true,
    active_shell_adopted: false,
    runtime_authority_transfer: false,
    domain_truth_owned: false,
    shared_renderer: 'deepseek_harness_derived_react',
    shared_host_core: contract.shared_host_core,
    bridge_abi: 'opl_app_host_bridge.v1',
    carriers: {
      electron_desktop: carrierEntry('electron_desktop'),
      standalone_headless_webui: carrierEntry('standalone_headless_webui'),
      docker_webui: carrierEntry('docker_webui'),
    },
  };
}

test('OPL Studio carrier evidence accepts one candidate-only entry per approved runtime form', (t) => {
  const root = createCandidateTree();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.doesNotThrow(() => validateOPLStudioCarrierEvidenceManifest(candidate, carrierManifest(), root));
});

test('OPL Studio carrier evidence accepts original flat paths only for a flat checkout', (t) => {
  const flatRoot = createCandidateTree(flatSourceRef);
  const groupedRoot = createCandidateTree();
  t.after(() => {
    fs.rmSync(flatRoot, { recursive: true, force: true });
    fs.rmSync(groupedRoot, { recursive: true, force: true });
  });
  const manifest = carrierManifest();
  manifest.shared_host_core = flatSourceRef(manifest.shared_host_core);
  for (const entry of Object.values(manifest.carriers)) {
    entry.source_implementation.refs = entry.source_implementation.refs.map(flatSourceRef);
  }
  assert.doesNotThrow(() => validateOPLStudioCarrierEvidenceManifest(candidate, manifest, flatRoot));
  assert.throws(() => validateOPLStudioCarrierEvidenceManifest(candidate, manifest, groupedRoot), /authority boundary/);
});

test('OPL Studio carrier evidence rejects a missing carrier entry', (t) => {
  const root = createCandidateTree();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = carrierManifest();
  delete (manifest.carriers as Partial<typeof manifest.carriers>).standalone_headless_webui;
  assert.throws(
    () => validateOPLStudioCarrierEvidenceManifest(candidate, manifest, root),
    /carrier evidence entries/,
  );
});

test('OPL Studio carrier evidence cannot claim release authority', (t) => {
  const root = createCandidateTree();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = carrierManifest();
  (manifest as { release_authority: boolean }).release_authority = true;
  assert.throws(
    () => validateOPLStudioCarrierEvidenceManifest(candidate, manifest, root),
    /carrier evidence authority boundary/,
  );
});

test('OPL Studio carrier evidence rejects distribution or release status promotion without admission evidence', (t) => {
  const root = createCandidateTree();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const wired = carrierManifest();
  (wired.carriers.standalone_headless_webui.distribution_wiring as { status: string }).status = 'wired';
  assert.throws(
    () => validateOPLStudioCarrierEvidenceManifest(candidate, wired, root),
    /standalone_headless_webui candidate evidence status/,
  );

  const admitted = carrierManifest();
  (admitted.carriers.docker_webui.release as { release_admission: string }).release_admission = 'admitted';
  assert.throws(
    () => validateOPLStudioCarrierEvidenceManifest(candidate, admitted, root),
    /docker_webui candidate evidence status/,
  );
});

test('OPL Studio carrier evidence cannot reuse retired AionUI release evidence', (t) => {
  const root = createCandidateTree();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = carrierManifest();
  (manifest.carriers.electron_desktop.distribution_wiring as {
    current_aionui_release_evidence_reused: boolean;
  }).current_aionui_release_evidence_reused = true;
  assert.throws(
    () => validateOPLStudioCarrierEvidenceManifest(candidate, manifest, root),
    /electron_desktop candidate evidence status/,
  );
});
