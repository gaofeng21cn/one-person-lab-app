import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';

import {
  validateWindowsUpgradeVmAdmission,
  type WindowsUpgradeVmAdmissionInput,
} from '../../scripts/validate-windows-updater-upgrade-vm-admission.ts';

const appRoot = path.resolve(import.meta.dirname, '../..');
const workflowPath = path.join(
  appRoot,
  '.github',
  'workflows',
  'windows-updater-upgrade-vm-preflight.yml',
);
const harnessPath = path.join(appRoot, 'scripts', 'Test-OPLWindowsUpdaterUpgradeVM.ps1');
const receiptSchemaPath = path.join(
  appRoot,
  'docs',
  'delivery',
  'validation',
  'windows-platform',
  'windows-updater-upgrade-vm-dry-run-receipt.schema.json',
);
const repository = 'gaofeng21cn/one-person-lab-app';
const releaseVersion = '26.8.1-candidate.1';
const updaterVersion = '26.8.101';
const candidateRunId = '30620000001';
const candidateSourceSha = 'a'.repeat(40);
const candidateArtifactName = `opl-windows-signed-candidate-${candidateRunId}`;
const candidateIdentity = `actions-run:${candidateRunId}/artifact:${candidateArtifactName}`;
const installerName = `One-Person-Lab-${releaseVersion}-win-x64.exe`;
const candidateAssetUrl = `https://github.com/${repository}/actions/runs/${candidateRunId}/artifacts/9000000001`;
const now = new Date('2026-08-01T00:02:00.000Z');

function sha256Bytes(bytes: Buffer | string): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filePath: string): string {
  return sha256Bytes(fs.readFileSync(filePath));
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture(
  t: test.TestContext,
  mutate?: (fixture: {
    root: string;
    assetsReceipt: any;
    authenticode: any;
    compatibility: any;
    inventory: any;
  }) => void,
): WindowsUpgradeVmAdmissionInput {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-windows-upgrade-vm-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const installer = Buffer.from('signed Windows candidate fixture bytes\n');
  const installerSha256 = sha256Bytes(installer);
  const installerSha512 = crypto.createHash('sha512').update(installer).digest('base64');
  fs.writeFileSync(path.join(root, installerName), installer);
  fs.writeFileSync(path.join(root, `${installerName}.blockmap`), 'candidate blockmap fixture\n');
  fs.writeFileSync(path.join(root, 'latest.yml'), stringifyYaml({
    version: updaterVersion,
    files: [{ url: installerName, sha512: installerSha512, size: installer.length }],
    path: installerName,
    sha512: installerSha512,
    releaseDate: '2026-08-01T00:00:00.000Z',
  }));
  const assetsReceipt = {
    schema: 'opl_windows_updater_assets_receipt.v1',
    status: 'passed',
    platform: 'windows-x64',
    release_version: releaseVersion,
    updater_version: updaterVersion,
    assets: {
      installer: {
        name: installerName,
        size_bytes: installer.length,
        sha256: `sha256:${installerSha256}`,
        sha512: `sha512:${installerSha512}`,
      },
      metadata: {
        name: 'latest.yml',
        size_bytes: fs.statSync(path.join(root, 'latest.yml')).size,
        sha256: `sha256:${sha256File(path.join(root, 'latest.yml'))}`,
      },
      blockmap: {
        name: `${installerName}.blockmap`,
        size_bytes: fs.statSync(path.join(root, `${installerName}.blockmap`)).size,
        sha256: `sha256:${sha256File(path.join(root, `${installerName}.blockmap`))}`,
      },
    },
    metadata_binding: {
      path: installerName,
      file_url: installerName,
      size_bytes: installer.length,
      sha512: `sha512:${installerSha512}`,
    },
    feed_resolution: 'exact_release_download_base_plus_relative_asset_name',
    code_signing: {
      policy: 'optional_nonblocking',
      status: 'valid_timestamped_authenticode',
      authenticode_receipt: 'opl-windows-authenticode-receipt.json',
      required_for_publication: false,
    },
  };
  const authenticode = {
    schema: 'opl_windows_authenticode_receipt.v1',
    status: 'passed',
    platform: 'windows-x64',
    installer: {
      name: installerName,
      size_bytes: installer.length,
      sha256: `sha256:${installerSha256}`,
    },
    signature: {
      status: 'Valid',
      signature_type: 'Authenticode',
      signer_subject: 'CN=One Person Lab',
      signer_thumbprint: '1'.repeat(40),
      signer_not_before: '2026-01-01T00:00:00.000Z',
      signer_not_after: '2027-01-01T00:00:00.000Z',
      timestamp_verified: true,
      timestamper_subject: 'CN=Trusted Timestamp Authority',
      timestamper_thumbprint: '2'.repeat(40),
    },
    verification_tool: 'Get-AuthenticodeSignature',
  };
  const requirement = {
    requirement_id: 'framework_compatibility_receipt_schema',
    component_id: 'opl_framework',
    kind: 'capability_id_with_versioned_schema',
    capability_id: 'opl_component_compatibility_receipt',
    schema_range: '>=1.0.0 <2.0.0',
  };
  const compatibility = {
    schema: 'opl_component_compatibility_receipt.v1',
    owner: 'one-person-lab',
    producer_role: 'opl_framework',
    contract_ref:
      'contracts/app-install-exposure-policy.json#component_interoperability.compatibility_admission',
    producer_contract_ref:
      'contracts/opl-framework/app-component-compatibility-receipt-contract.json',
    producer_identity: {
      command_surface: 'opl app compatibility receipt',
      executable_path: 'C:\\Program Files\\One Person Lab\\resources\\opl.exe',
      executable_sha256: `sha256:${'3'.repeat(64)}`,
      framework_version: '0.3.5',
      package_ref: 'one-person-lab@0.3.5',
    },
    receipt_ref: 'file:///C:/OPL-Evidence/opl-component-compatibility-receipt.json',
    generated_at: '2026-08-01T00:00:00.000Z',
    issued_at: '2026-08-01T00:00:00.000Z',
    expires_at: '2026-08-01T00:05:00.000Z',
    freshness: {
      status: 'fresh',
      generated_at: '2026-08-01T00:00:00.000Z',
      max_age_seconds: 300,
    },
    status: 'compatible',
    sources: {
      requirements: {
        owner: 'one-person-lab-app',
        schema: 'opl_component_compatibility_requirements.v1',
        path: 'C:\\OPL-Evidence\\requirements.json',
        sha256: `sha256:${'4'.repeat(64)}`,
      },
      subject: {
        owner: 'one-person-lab-app',
        schema: 'opl_app_compatibility_subject.v1',
        path: 'C:\\OPL-Evidence\\subject.json',
        sha256: `sha256:${'5'.repeat(64)}`,
      },
    },
    subject: {
      selected_app_artifact: {
        owner_authority: repository,
        immutable_release_tag: candidateIdentity,
        asset_url: candidateAssetUrl,
        asset_name: installerName,
        byte_size: installer.length,
        sha256: `sha256:${installerSha256}`,
      },
      installed_app_asar: {
        path: 'C:\\Program Files\\One Person Lab\\resources\\app.asar',
        sha256: `sha256:${'6'.repeat(64)}`,
      },
      build_receipt: {
        path: 'C:\\OPL-Evidence\\build-receipt.json',
        sha256: `sha256:${'7'.repeat(64)}`,
      },
    },
    requirements: [requirement],
    observed_components: [{
      component_id: 'opl_framework',
      owner_authority: 'one-person-lab',
      version: '0.3.5',
      observation_ref: 'opl://component-observation/opl_framework',
      capabilities: [{
        capability_id: 'opl_component_compatibility_receipt',
        schema_version: '1.0.0',
      }],
    }],
    coverage: [{
      requirement_id: requirement.requirement_id,
      component_id: requirement.component_id,
      kind: requirement.kind,
      status: 'satisfied',
      observation_ref: 'opl://component-observation/opl_framework',
      failure_code: null,
    }],
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
  };
  const inventory = {
    inventory_status: 'readable',
    runners: [{
      id: 23,
      name: 'gaofeng-workstation-opl-cert-windows-wsl',
      status: 'online',
      busy: false,
      labels: [
        { name: 'self-hosted' },
        { name: 'Windows' },
        { name: 'X64' },
        { name: 'opl-cert-windows-wsl' },
      ],
    }],
  };
  mutate?.({ root, assetsReceipt, authenticode, compatibility, inventory });
  const assetsPath = path.join(root, 'opl-windows-updater-assets.json');
  const authenticodePath = path.join(root, 'opl-windows-authenticode-receipt.json');
  const compatibilityPath = path.join(root, 'opl-component-compatibility-receipt.json');
  writeJson(assetsPath, assetsReceipt);
  writeJson(authenticodePath, authenticode);
  writeJson(compatibilityPath, compatibility);
  return {
    artifactDir: root,
    repository,
    releaseVersion,
    updaterVersion,
    candidateRunId,
    candidateSourceSha,
    candidateArtifactName,
    candidateIdentity,
    candidateAssetUrl,
    expectedUpdaterAssetsReceiptSha256: sha256File(assetsPath),
    expectedAuthenticodeReceiptSha256: sha256File(authenticodePath),
    expectedCompatibilityReceiptSha256: sha256File(compatibilityPath),
    candidateRun: {
      id: Number(candidateRunId),
      repository: { full_name: repository },
      head_repository: { full_name: repository },
      head_sha: candidateSourceSha,
      run_attempt: 1,
      status: 'completed',
      conclusion: 'success',
    },
    runnerInventory: inventory,
    now,
  };
}

test('admits one exact timestamped candidate with fresh compatibility and one online idle runner', (t) => {
  const receipt = validateWindowsUpgradeVmAdmission(createFixture(t));
  assert.equal(receipt.status, 'ready');
  assert.equal(receipt.reason_code, 'admitted');
  assert.equal(receipt.mutation_attempt_count, 0);
  assert.equal(receipt.publication_mutation_allowed, false);
  assert.equal(receipt.install_mutation_allowed, false);
  assert.equal(receipt.release_blocking, false);
  assert.equal(receipt.candidate?.timestamp_verified, true);
  assert.equal(receipt.framework_compatibility?.requirement_count, 1);
  assert.equal(receipt.runner?.name, 'gaofeng-workstation-opl-cert-windows-wsl');
  assert.deepEqual(receipt.required_artifact_triggers, [
    'separate_protected_upgrade_vm_execute_operation',
  ]);
});

test('unsigned or untimestamped candidates fail closed before runner admission', (t) => {
  const input = createFixture(t, ({ authenticode }) => {
    authenticode.signature.timestamp_verified = false;
  });
  const receipt = validateWindowsUpgradeVmAdmission(input);
  assert.equal(receipt.status, 'not_ready');
  assert.equal(receipt.reason_code, 'signed_candidate_unavailable');
  assert.equal(receipt.runner, null);
  assert.equal(receipt.mutation_attempt_count, 0);
});

test('signed optional certification rejects updater receipts that do not bind its Authenticode receipt', (t) => {
  const input = createFixture(t, ({ assetsReceipt }) => {
    assetsReceipt.code_signing.status = 'unsigned';
    assetsReceipt.code_signing.authenticode_receipt = null;
  });
  const receipt = validateWindowsUpgradeVmAdmission(input);
  assert.equal(receipt.status, 'not_ready');
  assert.equal(receipt.reason_code, 'signed_candidate_unavailable');
  assert.equal(receipt.mutation_attempt_count, 0);
});

test('expired or incomplete Framework compatibility receipts fail closed without cohort lockstep', (t) => {
  const expired = createFixture(t, ({ compatibility }) => {
    compatibility.expires_at = '2026-08-01T00:01:00.000Z';
    compatibility.freshness.max_age_seconds = 60;
  });
  const expiredReceipt = validateWindowsUpgradeVmAdmission(expired);
  assert.equal(expiredReceipt.status, 'not_ready');
  assert.equal(expiredReceipt.reason_code, 'framework_compatibility_invalid');

  const incomplete = createFixture(t, ({ compatibility }) => {
    compatibility.coverage = [];
  });
  const incompleteReceipt = validateWindowsUpgradeVmAdmission(incomplete);
  assert.equal(incompleteReceipt.status, 'not_ready');
  assert.equal(incompleteReceipt.reason_code, 'framework_compatibility_invalid');

  const overAuthoritative = createFixture(t, ({ compatibility }) => {
    compatibility.authority_boundary.may_define_package_currentness = true;
  });
  const overAuthoritativeReceipt = validateWindowsUpgradeVmAdmission(overAuthoritative);
  assert.equal(overAuthoritativeReceipt.status, 'not_ready');
  assert.equal(overAuthoritativeReceipt.reason_code, 'framework_compatibility_invalid');
});

test('digest drift and offline runner inventory return typed not_ready with zero mutation', (t) => {
  const drifted = createFixture(t);
  drifted.expectedAuthenticodeReceiptSha256 = '0'.repeat(64);
  const driftedReceipt = validateWindowsUpgradeVmAdmission(drifted);
  assert.equal(driftedReceipt.status, 'not_ready');
  assert.equal(driftedReceipt.reason_code, 'signed_candidate_unavailable');
  assert.equal(driftedReceipt.mutation_attempt_count, 0);

  const offline = createFixture(t, ({ inventory }) => {
    inventory.runners[0].status = 'offline';
  });
  const offlineReceipt = validateWindowsUpgradeVmAdmission(offline);
  assert.equal(offlineReceipt.status, 'not_ready');
  assert.equal(offlineReceipt.reason_code, 'runner_offline');
  assert.deepEqual(offlineReceipt.required_artifact_triggers, [
    'online_idle_windows_qualification_runner',
  ]);
});

test('execute eligibility requires the exact protected confirmation and still grants no mutation authority', (t) => {
  const input = createFixture(t);
  input.mode = 'execute';
  const missing = validateWindowsUpgradeVmAdmission(input);
  assert.equal(missing.status, 'not_ready');
  assert.equal(missing.reason_code, 'execute_confirmation_missing');

  input.confirmation = 'execute_signed_windows_upgrade_in_leased_vm';
  const admitted = validateWindowsUpgradeVmAdmission(input);
  assert.equal(admitted.status, 'ready');
  assert.equal(admitted.publication_mutation_allowed, false);
  assert.equal(admitted.install_mutation_allowed, false);
  assert.equal(admitted.mutation_attempt_count, 0);
});

test('admission receipts are create-only and never overwrite prior evidence', (t) => {
  const input = createFixture(t);
  const outputPath = path.join(input.artifactDir, 'admission.json');
  input.outputPath = outputPath;
  validateWindowsUpgradeVmAdmission(input);
  const original = fs.readFileSync(outputPath);

  assert.throws(
    () => validateWindowsUpgradeVmAdmission(input),
    /EEXIST|file already exists/i,
  );
  assert.deepEqual(fs.readFileSync(outputPath), original);
  assert.deepEqual(
    fs.readdirSync(input.artifactDir).filter((entry) => entry.includes('admission.json.') && entry.endsWith('.tmp')),
    [],
  );
});

test('preflight workflow never queues a self-hosted or publication job', () => {
  const source = fs.readFileSync(workflowPath, 'utf8');
  const workflow = parseYaml(source) as any;
  const upload = workflow.jobs.preflight.steps.find(
    (step: any) => step.name === 'Upload exact read-only preflight receipt',
  );
  assert.deepEqual(Object.keys(workflow.jobs), ['preflight']);
  assert.equal(workflow.jobs.preflight['runs-on'], 'ubuntu-latest');
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.equal(workflow.jobs.preflight.outputs.execute_job_queued, '${{ steps.project.outputs.execute_job_queued }}');
  assert.deepEqual(String(upload?.with?.path).trim().split(/\s+/), [
    'windows-upgrade-preflight/candidate-run.json',
    'windows-upgrade-preflight/runner-inventory.json',
    'windows-upgrade-preflight/admission.json',
  ]);
  assert.match(source, /runner-inventory\.json/);
  assert.match(source, /validate-windows-updater-upgrade-vm-admission\.ts/);
  assert.match(source, /execute_job_queued=false/);
  assert.doesNotMatch(source, /runs-on:\s*\[self-hosted/i);
  assert.doesNotMatch(source, /gh release|make_latest|Restore-VMSnapshot|Start-VM|Start-Process/i);
});

test('release contract keeps Windows qualification optional and nonblocking inside the same Desktop artifact', () => {
  const contract = JSON.parse(
    fs.readFileSync(path.join(appRoot, 'contracts', 'app-release-channel.json'), 'utf8'),
  );
  const qualification = contract.release_platform_matrix.desktop_platform_additive_follower
    .windows_x64_updater_assets.upgrade_vm_qualification;
  assert.equal(qualification.workflow, '.github/workflows/windows-updater-upgrade-vm-preflight.yml');
  assert.equal(qualification.cross_component_exact_cohort_required, false);
  assert.deepEqual(qualification.compatibility_requirement_kinds, [
    'capability_id_with_versioned_schema',
    'minimum_version',
    'semver_range',
  ]);
  assert.equal(qualification.current_execute_available, false);
  assert.equal(qualification.publication_or_install_authority_granted_by_preflight, false);
  assert.equal(qualification.blocks_stable_or_latest, false);
  assert.equal(qualification.factory_authority, 'existing_opl_windows_vm_lease_v2_and_clean_vm_attestation_v2_only');
});

test('PowerShell 5.1 dry-run harness defines the full sequence without executable VM or install mutation', () => {
  const source = fs.readFileSync(harnessPath, 'utf8');
  const sequence = [
    'restore_exact_clean_checkpoint',
    'install_exact_predecessor',
    'write_persistent_data_sentinel',
    'download_candidate_with_electron_updater',
    'fully_exit_and_apply_update',
    'restart_updated_app',
    'verify_version_runtime_and_data_preservation',
    'repeat_update_check_expect_no_update',
  ];
  let previous = -1;
  for (const phase of sequence) {
    const current = source.indexOf(`'${phase}'`);
    assert.ok(current > previous, `${phase} must retain its fixed order`);
    previous = current;
  }
  assert.match(source, /Get-AuthenticodeSignature/);
  assert.match(source, /Get-VMSnapshot/);
  assert.match(source, /mutation_attempt_count = 0/);
  assert.match(source, /execute_available = \$false/);
  assert.match(source, /assets\.metadata\.sha256/);
  assert.match(source, /assets\.blockmap\.sha256/);
  assert.match(source, /code_signing\.policy/);
  assert.match(source, /code_signing\.status/);
  assert.match(source, /code_signing\.authenticode_receipt/);
  assert.match(source, /selected_app_artifact/);
  assert.match(source, /may_define_package_currentness/);
  assert.match(source, /Security\.Cryptography\.SHA256/);
  assert.doesNotMatch(source, /Get-FileHash/);
  assert.doesNotMatch(source, /Restore-VMSnapshot|Start-VM|Stop-VM|Invoke-Command|Start-Process/);
  assert.doesNotMatch(source, /\.Kill\(\$true\)|\.Kill\(true\)/);
});

test('dry-run receipt schema compiles and the harness runs in fixture mode on Windows PowerShell 5.1', (t) => {
  const schema = JSON.parse(fs.readFileSync(receiptSchemaPath, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strictSchema: true, strictTypes: false });
  addFormats(ajv);
  const validateReceipt = ajv.compile(schema);

  const usesWslInterop = process.platform === 'linux' && Boolean(process.env.WSL_DISTRO_NAME);
  if (process.platform !== 'win32' && !usesWslInterop) return;
  const powershell = process.env.PWSH || (process.platform === 'win32'
    ? 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    : 'powershell.exe');
  const toWindowsPath = (filePath: string): string => {
    if (!usesWslInterop) return filePath;
    const converted = spawnSync('wslpath', ['-w', filePath], { encoding: 'utf8' });
    assert.equal(converted.status, 0, converted.stderr || converted.stdout);
    return converted.stdout.trim();
  };
  const windowsHarnessPath = toWindowsPath(harnessPath);
  const escaped = windowsHarnessPath.replaceAll("'", "''");
  const command = [
    '$tokens=$null; $errors=$null;',
    `[System.Management.Automation.Language.Parser]::ParseFile('${escaped}',[ref]$tokens,[ref]$errors) | Out-Null;`,
    'if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }',
  ].join(' ');
  const result = spawnSync(
    powershell,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    { encoding: 'utf8', windowsHide: true },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const input = createFixture(t);
  const compatibilityPath = path.join(
    input.artifactDir,
    'opl-component-compatibility-receipt.json',
  );
  const compatibility = JSON.parse(fs.readFileSync(compatibilityPath, 'utf8'));
  const issuedAt = new Date(Date.now() - 30_000);
  const expiresAt = new Date(issuedAt.getTime() + 300_000);
  compatibility.generated_at = issuedAt.toISOString();
  compatibility.issued_at = issuedAt.toISOString();
  compatibility.expires_at = expiresAt.toISOString();
  compatibility.freshness.generated_at = issuedAt.toISOString();
  writeJson(compatibilityPath, compatibility);
  input.expectedCompatibilityReceiptSha256 = sha256File(compatibilityPath);
  const executionOwnerThread = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const vmUuid = '11111111-2222-4333-8444-555555555555';
  const checkpointId = '66666666-7777-4888-8999-aaaaaaaaaaaa';
  const vmIdentity = `hyperv-vmid:${vmUuid}`;
  const checkpointName = 'OPL-Clean-Windows-zh-CN-Fixture';
  const attestationPath = path.join(input.artifactDir, 'clean-vm-attestation.json');
  const leasePath = path.join(input.artifactDir, 'platform-lease.json');
  const outputPath = path.join(input.artifactDir, 'upgrade-vm-dry-run.json');
  writeJson(attestationPath, {
    schema: 'opl_windows_clean_vm_attestation.v2',
    status: 'attested',
    factory_root: 'C:\\OPL-VMs',
    vm_name: 'OPL-V6-WSL2-01',
    vm_state: 'Off',
    vm_id: vmUuid,
    vm_identity: vmIdentity,
    checkpoint_id: checkpointId,
    checkpoint_name: checkpointName,
    localization: {
      ui_language: 'zh-CN',
      default_input_method_tip: '0804:00000804',
    },
  });
  writeJson(leasePath, {
    schema: 'opl_windows_vm_lease.v2',
    status: 'active',
    factory_root: 'C:\\OPL-VMs',
    vm_name: 'OPL-V6-WSL2-01',
    execution_owner_thread: executionOwnerThread,
    next_owner_thread: executionOwnerThread,
    lease_authorized: true,
    writable_surface_overlap_count: 0,
    vm_uuid: vmUuid,
    clean_vm_attestation: {
      path: attestationPath,
      sha256: sha256File(attestationPath),
      schema: 'opl_windows_clean_vm_attestation.v2',
      vm_identity: vmIdentity,
      checkpoint_id: checkpointId,
      checkpoint_name: checkpointName,
    },
  });

  const dryRun = spawnSync(
    powershell,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      windowsHarnessPath,
      '-Mode',
      'DryRun',
      '-CandidateDirectory',
      toWindowsPath(input.artifactDir),
      '-CandidateDisplayVersion',
      input.releaseVersion,
      '-CandidateUpdaterVersion',
      input.updaterVersion,
      '-ExpectedUpdaterAssetsReceiptSha256',
      input.expectedUpdaterAssetsReceiptSha256,
      '-ExpectedAuthenticodeReceiptSha256',
      input.expectedAuthenticodeReceiptSha256,
      '-ExpectedCompatibilityReceiptSha256',
      input.expectedCompatibilityReceiptSha256,
      '-ExpectedExecutionOwnerThread',
      executionOwnerThread,
      '-PlatformLeasePath',
      toWindowsPath(leasePath),
      '-CleanAttestationPath',
      toWindowsPath(attestationPath),
      '-OutputPath',
      toWindowsPath(outputPath),
      '-FixtureMode',
    ],
    { encoding: 'utf8', windowsHide: true },
  );
  assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
  const receipt = JSON.parse(fs.readFileSync(outputPath, 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(validateReceipt(receipt), true, JSON.stringify(validateReceipt.errors));
  assert.equal(receipt.status, 'dry_run_passed');
  assert.equal(receipt.fixture_mode, true);
  assert.equal(receipt.mutation_attempt_count, 0);
  assert.equal(receipt.execute_available, false);
});
