import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildArtifactQualificationReceipt,
  validateArtifactQualificationReceipt,
} from '../../scripts/artifact-qualification-receipt.ts';
import type { BuildArtifactCohortV2 } from '../../scripts/build-artifact-cohort.ts';
import { buildQualificationHarnessScopeProof } from '../../scripts/qualification-harness-scope.ts';
import { validateReleaseAddonReadiness } from '../../scripts/validate-release-addon-readiness.ts';

const stableSessionId = `sha256:${'1'.repeat(64)}`;
const releaseCohortRef = `sha256:${'2'.repeat(64)}`;
const artifactSha256 = '3'.repeat(64);
const sourceArtifactName = 'opl-full-first-install-dmg-26.7.13-mac-arm64';

function frozenCodexCliIdentity() {
  const version = '0.144.5';
  const integrity = `sha512-${'A'.repeat(86)}==`;
  return {
    package: '@openai/codex' as const,
    version,
    npm_integrity: integrity,
    tarball_url: `https://registry.npmjs.org/@openai/codex/-/codex-${version}.tgz`,
    tarball_sha256: 'a'.repeat(64),
    platform: {
      package: '@openai/codex' as const,
      version: `${version}-darwin-arm64`,
      npm_integrity: integrity,
      tarball_url: `https://registry.npmjs.org/@openai/codex/-/codex-${version}-darwin-arm64.tgz`,
      tarball_sha256: 'b'.repeat(64),
    },
  };
}

function temporalSupervisorProof() {
  const databasePath = '/Users/opl/Library/Application Support/OPL/state/family-runtime/temporal-server/temporal.sqlite';
  const plistPath = '/Users/opl/Library/LaunchAgents/ai.opl.family-runtime.temporal-service.plist';
  const lifecycleStatus = (pid: number) => ({
    surface_kind: 'temporal_service_lifecycle_status',
    provider_kind: 'temporal',
    service_status: 'running',
    address: '127.0.0.1:7233',
    address_source: 'managed_service_supervisor',
    server_reachable: true,
    supervisor: {
      surface_kind: 'opl_temporal_service_supervisor_state',
      status: 'loaded_running',
      installed: true,
      loaded: true,
      ready: true,
      observed_at: `2026-07-17T00:00:0${pid - 101}.000Z`,
      error: null,
      supported: true,
      applicable: true,
      required: true,
      configuration_current: true,
      process_state: 'running',
      pid,
      run_at_load: true,
      keep_alive: true,
    },
  });
  const readback = (pid: number) => ({
    service_ready: true,
    server_reachable: true,
    service_status: 'running',
    supervisor: {
      surface_kind: 'opl_temporal_service_supervisor_state',
      status: 'loaded_running',
      installed: true,
      loaded: true,
      ready: true,
      observed_at: `2026-07-17T00:00:0${pid - 101}.000Z`,
      error: null,
      supported: true,
      applicable: true,
      required: true,
      configuration_current: true,
      process_state: 'running',
      pid,
      last_exit_status: 0,
      last_exit_signal: null,
      run_at_load: true,
      keep_alive: true,
      throttle_interval_seconds: 15,
      address: '127.0.0.1:7233',
      database_path: databasePath,
      launcher_source: 'temporal_cli_path',
      schedule_independent: true,
    },
  });
  return {
    schema: 'opl_temporal_service_supervisor_proof.v1',
    status: 'passed',
    runtime_profile: 'full',
    applicable: true,
    required: true,
    supervisor_label: 'ai.opl.family-runtime.temporal-service',
    start_action: {
      action_id: 'provider_service_start',
      dry_run: false,
      delegated_surface: 'opl family-runtime service start --provider temporal',
      result: {
        version: 'g2',
        family_runtime_service: {
          surface_id: 'opl_family_runtime_service',
          action: 'start',
          surface_kind: 'temporal_service_lifecycle_start',
          provider_kind: 'temporal',
          start_status: 'started_supervised',
          status: lifecycleStatus(101),
          supervisor_operation: { action: 'install', status: 'ready', ready: true, error: null },
        },
      },
    },
    restart_action: {
      action_id: 'provider_service_restart',
      dry_run: false,
      delegated_surface: 'opl family-runtime service restart --provider temporal',
      result: {
        version: 'g2',
        family_runtime_service: {
          surface_id: 'opl_family_runtime_service',
          action: 'restart',
          surface_kind: 'temporal_service_lifecycle_restart',
          provider_kind: 'temporal',
          restart_status: 'restarted',
          applicable: true,
          ready: true,
          reason: null,
          previous_supervisor_pid: 102,
          supervisor_pid: 103,
          supervisor_pid_changed: true,
          status: lifecycleStatus(103),
          supervisor_operation: { action: 'trigger', status: 'ready', ready: true, error: null },
        },
      },
    },
    plist: {
      path: plistPath,
      label: 'ai.opl.family-runtime.temporal-service',
      program_arguments: ['/runtime/bin/temporal', 'server', 'start-dev', '--db-filename', databasePath],
      run_at_load: true,
      keep_alive: true,
      database_path: databasePath,
    },
    initial_readback: readback(101),
    keep_alive_recovery: {
      termination: { pid: 101, signal: 'SIGTERM', status: 'sent' },
      readback: readback(102),
    },
    restart_readback: readback(103),
    session_reload: {
      bootout: {
        args: ['bootout', 'gui/501/ai.opl.family-runtime.temporal-service'],
        status: 0,
        signal: null,
        stdout: '',
        stderr: '',
      },
      bootstrap: {
        args: ['bootstrap', 'gui/501', plistPath],
        status: 0,
        signal: null,
        stdout: '',
        stderr: '',
      },
      readback: readback(104),
    },
    persistent_database: {
      path: databasePath,
      sqlite_header_valid: true,
      initial_size_bytes: 4096,
      file_identity: '1:42',
      same_file_after_keep_alive_recovery: true,
      same_file_after_restart: true,
      same_file_after_session_reload: true,
    },
  } as const;
}

function writeFixture(root: string) {
  const manifestPath = path.join(root, 'opl-build-cohort.json');
  const receiptPath = path.join(root, 'artifact-qualification-receipt.json');
  const recordPath = path.join(root, 'release-addon-readiness-summary.json');
  const smokeSummaryPath = path.join(root, 'tart-smoke-summary.json');
  const manifest: BuildArtifactCohortV2 = {
    schema: 'opl_app_build_artifact_cohort.v2',
    release: { stable_session_id: stableSessionId, release_cohort_ref: releaseCohortRef },
    cohort: { app_sha: 'a'.repeat(40), shell_sha: 'b'.repeat(40), framework_sha: 'c'.repeat(40) },
    build: { version: '26.7.13', kind: 'full' },
    artifact: { name: 'One-Person-Lab-Full-26.7.13-arm64.dmg', sha256: artifactSha256, size_bytes: 1234 },
    actions: { run_id: '101', run_attempt: '1', artifact_name: sourceArtifactName },
    digests: {
      packaged_tree_sha256: '4'.repeat(64),
      app_product_profile_sha256: '5'.repeat(64),
      gui_product_contract_sha256: '6'.repeat(64),
      smoke_harness_sha256: '7'.repeat(64),
      compiled_expectation_semantic_sha256: '8'.repeat(64),
      compiled_expectation_probe_sha256: '9'.repeat(64),
      qualification_input_manifest_sha256: 'a'.repeat(64),
      full_input_manifest_sha256: 'b'.repeat(64),
      full_package_manifest_sha256: 'c'.repeat(64),
      full_toolchain_observation_receipt_sha256: 'd'.repeat(64),
    },
    qualification_runtime: { codex_cli: frozenCodexCliIdentity() },
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(smokeSummaryPath, `${JSON.stringify({
    surface_id: 'opl_tart_gui_first_run_smoke',
    status: 'passed',
    runtime_profile: 'full',
    temporal_service_supervisor_proof: temporalSupervisorProof(),
  }, null, 2)}\n`);
  const receipt = buildArtifactQualificationReceipt({
    manifest,
    manifestPath,
    result: 'passed',
    packageProfile: 'full',
    qualificationRunId: '202',
    sourceArtifactRunId: '101',
    sourceArtifactName,
    evidenceRef: 'opl-first-run-vm-full-202',
    smokeSummaryPath,
  });
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.writeFileSync(recordPath, `${JSON.stringify({
    schema: 'opl_release_addon_readiness_summary.v1',
    version: '26.7.13',
    job_results: {
      'full-first-install': 'success',
      'remote-verify-full': 'success',
      'full-first-run-vm-smoke': 'failure',
      'docker-webui-smoke': 'success',
      'webui-ghcr-publish': 'success',
      'docker-webui-clean-vm-evidence': 'success',
      'operator-evidence-bundle-validation': 'success',
    },
  }, null, 2)}\n`);
  return { manifestPath, receiptPath, recordPath, smokeSummaryPath, receipt };
}

function options(fixture: ReturnType<typeof writeFixture>) {
  return {
    version: '26.7.13',
    recordPath: fixture.recordPath,
    includeFullPackage: true,
    runVmSmoke: true,
    requireDockerWebui: true,
    fullQualificationReceiptPath: fixture.receiptPath,
    buildArtifactManifestPath: fixture.manifestPath,
    stableSessionId,
    releaseCohortRef,
    sourceArtifactRunId: '101',
    sourceArtifactName,
  };
}

test('qualification receipt accepts an authorized verification harness-only change', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-qualification-harness-'));
  try {
    const fixture = writeFixture(root);
    const smokeHarnessPath = path.join(root, 'opl-first-run-vm-smoke.mjs');
    fs.writeFileSync(smokeHarnessPath, 'fixed smoke harness');
    const verificationAppSha = 'a'.repeat(40);
    const verificationShellSha = 'e'.repeat(40);
    const scopeProof = buildQualificationHarnessScopeProof({
      artifactAppSha: 'a'.repeat(40),
      verificationAppSha,
      appChangedPaths: [],
      artifactShellSha: 'b'.repeat(40),
      verificationShellSha,
      shellChangedPaths: ['scripts/opl-first-run-vm-smoke.mjs'],
    });
    const receipt = buildArtifactQualificationReceipt({
        manifest: JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8')) as BuildArtifactCohortV2,
        manifestPath: fixture.manifestPath,
        result: 'passed',
        packageProfile: 'full',
        qualificationRunId: '203',
        sourceArtifactRunId: '101',
        sourceArtifactName,
        evidenceRef: 'opl-first-run-vm-full-203',
        smokeSummaryPath: fixture.smokeSummaryPath,
        verificationHarness: {
          appSha: verificationAppSha,
          shellSha: verificationShellSha,
          smokeHarnessPath,
          scopeProof,
        },
      });
    assert.equal(receipt.verification_harness?.change_scope, 'harness_mechanics_only');
    assert.deepEqual(validateArtifactQualificationReceipt(receipt, {
      stableSessionId,
      releaseCohortRef,
      version: '26.7.13',
      packageProfile: 'full',
      result: 'passed',
    }), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('passed Full qualification receipt fails closed without the Temporal supervisor proof', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-qualification-temporal-proof-'));
  try {
    const fixture = writeFixture(root);
    const missingProofPath = path.join(root, 'missing-temporal-proof.json');
    fs.writeFileSync(missingProofPath, `${JSON.stringify({
      surface_id: 'opl_tart_gui_first_run_smoke',
      status: 'passed',
      runtime_profile: 'full',
    })}\n`);
    assert.throws(
      () => buildArtifactQualificationReceipt({
        manifest: JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8')) as BuildArtifactCohortV2,
        manifestPath: fixture.manifestPath,
        result: 'passed',
        packageProfile: 'full',
        qualificationRunId: '204',
        sourceArtifactRunId: '101',
        sourceArtifactName,
        evidenceRef: 'opl-first-run-vm-full-204',
        smokeSummaryPath: missingProofPath,
      }),
      /requires a valid Temporal service supervisor proof/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Full v2 requires persistence and enabled Profile packages from the installed build after a daemon restart', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-qualification-daemon-proof-'));
  try {
    const fixture = writeFixture(root);
    const manifest: BuildArtifactCohortV2 = JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8'));
    manifest.qualification_runtime.framework = { api_version: '2.0', version: '2.0.3', official_root_package_ids: ['first'] };
    fs.writeFileSync(fixture.manifestPath, JSON.stringify(manifest));
    const initial = { sqlite_schema_version: 4001, database_path: '/Users/test/Library/Application Support/OPL/state/opl.db',
      database_file_identity: '1:422', packages: [{ package_id: 'first', version: '0.4' }], pid: 101 };
    const proof = {
      schema: 'opl_framework_daemon_proof.v1', status: 'passed', network_mode: 'offline', api_version: '2.0', version: '2.0.3',
      framework_sha: manifest.cohort.framework_sha, full_package_manifest_sha256: manifest.digests.full_package_manifest_sha256,
      before_restart: initial, after_restart: { ...initial, pid: 104 },
    };
    const build = () => buildArtifactQualificationReceipt({
      manifest, manifestPath: fixture.manifestPath, result: 'passed', packageProfile: 'full',
      qualificationRunId: '202', sourceArtifactRunId: '101', sourceArtifactName, evidenceRef: 'vm-202',
      smokeSummaryPath: fixture.smokeSummaryPath,
    });
    assert.throws(build, /Full Framework daemon proof/);
    fs.writeFileSync(fixture.smokeSummaryPath, JSON.stringify({ framework_daemon_proof: proof }));
    const receipt = build();
    fs.writeFileSync(fixture.receiptPath, JSON.stringify(receipt));
    const verify = (candidate: typeof receipt) => validateArtifactQualificationReceipt(candidate, {
      stableSessionId, releaseCohortRef, version: '26.7.13', packageProfile: 'full',
      qualificationRuntime: manifest.qualification_runtime,
    });
    assert.deepEqual(verify(receipt), []);
    for (const failed of [
      { ...proof, full_package_manifest_sha256: '0'.repeat(64) },
      { ...proof, before_restart: { ...initial, pid: 104 } },
      { ...proof, network_mode: 'online' },
      { ...proof, after_restart: { ...proof.after_restart, database_file_identity: '1:423' } },
      { ...proof, before_restart: { ...initial, packages: [] }, after_restart: { ...proof.after_restart, packages: [] } },
    ]) {
      assert.ok(verify({ ...receipt, smoke_summary: { ...receipt.smoke_summary, framework_daemon_proof: failed } }).length);
    }
    assert.ok(verify({ ...fixture.receipt, qualification_runtime: { codex_cli: manifest.qualification_runtime.codex_cli } })
      .includes('Qualification runtime does not match the frozen build'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Standard qualification receipt does not require the Full-only Temporal supervisor proof', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-qualification-standard-'));
  try {
    const fixture = writeFixture(root);
    const standardSmokeSummaryPath = path.join(root, 'standard-smoke-summary.json');
    fs.writeFileSync(standardSmokeSummaryPath, `${JSON.stringify({
      surface_id: 'opl_tart_gui_first_run_smoke',
      status: 'passed',
      runtime_profile: 'standard',
    })}\n`);
    const receipt = buildArtifactQualificationReceipt({
      manifest: JSON.parse(fs.readFileSync(fixture.manifestPath, 'utf8')) as BuildArtifactCohortV2,
      manifestPath: fixture.manifestPath,
      result: 'passed',
      packageProfile: 'standard',
      qualificationRunId: '205',
      sourceArtifactRunId: '101',
      sourceArtifactName,
      evidenceRef: 'opl-first-run-vm-standard-205',
      smokeSummaryPath: standardSmokeSummaryPath,
    });
    assert.equal(receipt.smoke_summary.temporal_service_supervisor_proof, null);
    assert.deepEqual(validateArtifactQualificationReceipt(receipt, {
      stableSessionId,
      releaseCohortRef,
      version: '26.7.13',
      packageProfile: 'standard',
      result: 'passed',
    }), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Full qualification validator rejects tampered plist, PID recovery, and SQLite persistence proof', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-qualification-temporal-proof-'));
  try {
    const fixture = writeFixture(root);
    const receipt = structuredClone(fixture.receipt);
    const proof = receipt.smoke_summary.temporal_service_supervisor_proof!;
    (proof.plist.program_arguments as string[])[4] = '/tmp/ephemeral.sqlite';
    const keepAlive = proof.keep_alive_recovery as {
      readback: { supervisor: { pid: number } };
    };
    const initial = proof.initial_readback as { supervisor: { pid: number } };
    keepAlive.readback.supervisor.pid = initial.supervisor.pid;
    proof.persistent_database.same_file_after_session_reload = false;

    const errors = validateArtifactQualificationReceipt(receipt, {
      stableSessionId,
      releaseCohortRef,
      version: '26.7.13',
      packageProfile: 'full',
      result: 'passed',
    });
    assert.match(errors.join('\n'), /ProgramArguments has an invalid --db-filename/);
    assert.match(errors.join('\n'), /KeepAlive recovery did not produce a fresh PID/);
    assert.match(errors.join('\n'), /same_file_after_session_reload is not true/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Full qualification validator rejects non-success Temporal restart action semantics', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-qualification-temporal-action-'));
  try {
    const fixture = writeFixture(root);
    const cases: Array<{
      name: string;
      mutate: (service: Record<string, unknown>) => void;
      expected: RegExp[];
    }> = [
      {
        name: 'restart_unready',
        mutate: (service) => { service.restart_status = 'restart_unready'; },
        expected: [/restart_status is restart_unready/],
      },
      {
        name: 'ready false',
        mutate: (service) => { service.ready = false; },
        expected: [/family_runtime_service\.ready is not true/],
      },
      {
        name: 'supervisor required false',
        mutate: (service) => {
          const status = service.status as { supervisor: Record<string, unknown> };
          status.supervisor.required = false;
        },
        expected: [/status\.supervisor\.required is not true/],
      },
      {
        name: 'supervisor error',
        mutate: (service) => {
          const status = service.status as { supervisor: Record<string, unknown> };
          status.supervisor.error = 'launchd_unready';
        },
        expected: [/status\.supervisor\.error is launchd_unready/],
      },
      {
        name: 'unchanged supervisor PID',
        mutate: (service) => {
          service.supervisor_pid_changed = false;
          service.supervisor_pid = service.previous_supervisor_pid;
          const status = service.status as { supervisor: Record<string, unknown> };
          status.supervisor.pid = service.previous_supervisor_pid;
        },
        expected: [
          /supervisor_pid_changed is not true/,
          /supervisor PID did not change/,
        ],
      },
    ];
    for (const testCase of cases) {
      const receipt = structuredClone(fixture.receipt);
      const restartAction = receipt.smoke_summary.temporal_service_supervisor_proof!.restart_action;
      const result = restartAction.result as { family_runtime_service: Record<string, unknown> };
      testCase.mutate(result.family_runtime_service);
      const errors = validateArtifactQualificationReceipt(receipt, {
        stableSessionId,
        releaseCohortRef,
        version: '26.7.13',
        packageProfile: 'full',
        result: 'passed',
      });
      for (const expected of testCase.expected) {
        assert.match(errors.join('\n'), expected, testCase.name);
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Full qualification validator rejects malformed Temporal App action receipts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-qualification-temporal-action-'));
  try {
    const fixture = writeFixture(root);
    const cases: Array<{
      name: string;
      mutate: (proof: NonNullable<typeof fixture.receipt.smoke_summary.temporal_service_supervisor_proof>) => void;
      expected: RegExp[];
    }> = [
      {
        name: 'wrong outer action shape',
        mutate: (proof) => {
          proof.start_action.action_id = 'provider_service_status';
          proof.start_action.dry_run = true;
          proof.start_action.delegated_surface = 'opl family-runtime service status --provider temporal';
        },
        expected: [
          /start_action\.action_id is provider_service_status/,
          /start_action\.dry_run is not false/,
          /start_action\.delegated_surface is opl family-runtime service status --provider temporal/,
        ],
      },
      {
        name: 'missing nested service result',
        mutate: (proof) => { proof.start_action.result = { status: 'ready' }; },
        expected: [/start_action\.result\.family_runtime_service is missing/],
      },
      {
        name: 'wrong nested action',
        mutate: (proof) => {
          const result = proof.restart_action.result as { family_runtime_service: Record<string, unknown> };
          result.family_runtime_service.action = 'start';
        },
        expected: [/restart_action\.result\.family_runtime_service\.action is start/],
      },
      {
        name: 'unsupported start status',
        mutate: (proof) => {
          const result = proof.start_action.result as { family_runtime_service: Record<string, unknown> };
          result.family_runtime_service.start_status = 'started';
        },
        expected: [/start_action\.result\.family_runtime_service\.start_status is started/],
      },
    ];
    for (const testCase of cases) {
      const receipt = structuredClone(fixture.receipt);
      testCase.mutate(receipt.smoke_summary.temporal_service_supervisor_proof!);
      const errors = validateArtifactQualificationReceipt(receipt, {
        stableSessionId,
        releaseCohortRef,
        version: '26.7.13',
        packageProfile: 'full',
        result: 'passed',
      });
      for (const expected of testCase.expected) {
        assert.match(errors.join('\n'), expected, testCase.name);
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Full qualification validator cross-binds Temporal action PIDs to their readbacks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-qualification-temporal-action-binding-'));
  try {
    const fixture = writeFixture(root);
    const receipt = structuredClone(fixture.receipt);
    const proof = receipt.smoke_summary.temporal_service_supervisor_proof!;
    const startResult = proof.start_action.result as {
      family_runtime_service: { status: { supervisor: { pid: number } } };
    };
    startResult.family_runtime_service.status.supervisor.pid = 901;
    const restartResult = proof.restart_action.result as {
      family_runtime_service: {
        previous_supervisor_pid: number;
        supervisor_pid: number;
        status: { supervisor: { pid: number } };
      };
    };
    restartResult.family_runtime_service.previous_supervisor_pid = 902;
    restartResult.family_runtime_service.supervisor_pid = 903;
    restartResult.family_runtime_service.status.supervisor.pid = 903;

    const errors = validateArtifactQualificationReceipt(receipt, {
      stableSessionId,
      releaseCohortRef,
      version: '26.7.13',
      packageProfile: 'full',
      result: 'passed',
    });
    assert.match(errors.join('\n'), /start action PID does not match initial readback PID/);
    assert.match(errors.join('\n'), /restart action previous PID does not match KeepAlive readback PID/);
    assert.match(errors.join('\n'), /restart action PID does not match restart readback PID/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('same-artifact Full qualification receipt overrides only the stale Full VM result', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-addon-readiness-'));
  try {
    const fixture = writeFixture(root);
    const result = validateReleaseAddonReadiness(options(fixture));
    assert.equal(result.status, 'verified');
    assert.equal(result.full_qualification_override.applied, true);
    assert.equal(result.job_results['full-first-run-vm-smoke'], 'success');
    assert.equal(result.job_results['docker-webui-smoke'], 'success');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Full qualification override rejects a receipt for different artifact bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-addon-readiness-'));
  try {
    const fixture = writeFixture(root);
    fixture.receipt.artifact.sha256 = '8'.repeat(64);
    fs.writeFileSync(fixture.receiptPath, `${JSON.stringify(fixture.receipt, null, 2)}\n`);
    const result = validateReleaseAddonReadiness(options(fixture));
    assert.equal(result.status, 'blocked');
    assert.equal(result.full_qualification_override.applied, false);
    assert.match(result.errors.join('\n'), /artifact sha256/);
    assert.match(result.errors.join('\n'), /full-first-run-vm-smoke is failure/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Full qualification override rejects a receipt for a different build smoke harness', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-addon-readiness-'));
  try {
    const fixture = writeFixture(root);
    fixture.receipt.build_manifest.smoke_harness_sha256 = '8'.repeat(64);
    fs.writeFileSync(fixture.receiptPath, `${JSON.stringify(fixture.receipt, null, 2)}\n`);
    const result = validateReleaseAddonReadiness(options(fixture));
    assert.equal(result.status, 'blocked');
    assert.equal(result.full_qualification_override.applied, false);
    assert.match(result.errors.join('\n'), /build manifest smoke_harness_sha256/);
    assert.match(result.errors.join('\n'), /full-first-run-vm-smoke is failure/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
