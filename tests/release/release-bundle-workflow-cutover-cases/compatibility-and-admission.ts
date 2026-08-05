import test from 'node:test';
import {
  assert,
  fs,
  path,
  readWorkflow,
  parseWorkflow,
  readAdapter,
  runStandardCheckpointStageGuard,
  adapterFixture,
  runFreezeRequest,
  workflowStep,
} from "./fixtures.ts";

test('append_full delegates Full Homebrew without mutating Standard publication surfaces', () => {
  const full = parseWorkflow('_release-full-addon.yml');
  const source = readWorkflow('_release-full-addon.yml');
  for (const retiredJob of ['publish-homebrew-full', 'homebrew-full-vm', 'homebrew-full-readback']) {
    assert.equal(full.jobs[retiredJob], undefined, retiredJob);
  }
  assert.doesNotMatch(
    source,
    /publish-homebrew-full|update-homebrew-tap|OPL_HOMEBREW_TAP_TOKEN|tap-source|Casks\/one-person-lab\.rb|git\b[^\n]*\bpush\b/,
  );
  assert.match(source, /opl_homebrew_full_follower_handoff\.v1/);
  assert.match(source, /completed_stage:"full_qualified"/);
  assert.match(source, /qualification_receipt_sha256/);
  assert.match(source, /operation_control/);
  assert.match(source, /operation_id/);
  assert.match(source, /operation_started_at/);
  assert.match(source, /operation_deadline_at/);
  assert.match(source, /checkpoint_transport_executor/);
  assert.match(source, /transport_run_id/);
  assert.match(source, /homebrew:\*\)/);
  assert.match(source, /Casks\/one-person-lab-full\.rb/);
  assert.match(source, /publication-scope "\$publication_scope"/);
  assert.match(source, /test "\$\(jq -r \.operation_id <<<"\$marker"\)" = "\$operation_id"/);
  assert.match(source, /git -C full-resume-tap fetch --no-tags --depth=1 origin "\$remote_commit"/);
  assert.match(source, /git -C full-resume-tap show 'FETCH_HEAD:Casks\/one-person-lab-full\.rb'/);
  assert.doesNotMatch(source, /contents\/Casks\/one-person-lab-full\.rb\?ref=main/);
  assert.doesNotMatch(source, /github-activate-latest|opl-updater-upgrade-vm\.yml|latest-arm64-mac\.yml/);
  for (const immutableSurface of [
    'standard_assets_modified:false',
    'prepared_notes_modified:false',
    'standard_updater_metadata_modified:false',
    'homebrew_modified:false',
    'latest_modified:false',
  ]) {
    assert.match(source, new RegExp(immutableSurface));
  }
});

test('Standard Homebrew uses inspect-before-write CAS and one bounded non-force push', () => {
  const workflow = parseWorkflow('_release-standard-publish.yml');
  const source = String(
    workflow.jobs['publish-homebrew-standard'].steps.find(
      (step: Record<string, unknown>) => step.name === 'Publish one digest-bound Standard cask commit',
    )?.run ?? '',
  );
  assert.ok(source.indexOf('preplan_remote_commit="$(inspect_remote_head)"') < source.indexOf('--remote-write-mode inspect_only'));
  assert.ok(source.indexOf('--remote-write-mode inspect_only') < source.indexOf('--remote-write-mode direct_commit'));
  assert.match(source, /case "\$cas_decision" in[\s\S]*idempotent\)[\s\S]*write_homebrew_success idempotent "\$base_commit" 0[\s\S]*exit 0/);
  assert.ok(source.indexOf('write_homebrew_success idempotent "$base_commit" 0') < source.indexOf('git -C tap-source commit '));
  assert.ok(source.indexOf('write_homebrew_success idempotent "$base_commit" 0') < source.indexOf('git -C tap-source push --no-force'));
  assert.match(source, /version_conflict\)[\s\S]*new_release_revision_required[\s\S]*exit 1/);
  assert.match(source, /--expected-current-cask-sha256 "\$current_cask_sha"/);
  assert.equal((source.match(/git -C tap-source commit /g) ?? []).length, 1);
  assert.equal((source.match(/git -C tap-source push --no-force/g) ?? []).length, 1);
  assert.match(source, /push_count=\$\(\(push_count \+ 1\)\)[\s\S]*test "\$push_count" -eq 1/);
  assert.doesNotMatch(source, /for attempt in 1 2 3|three read-only reconciliations/);
  assert.match(source, /write_framework_homebrew_receipt unknown/);
  assert.match(source, /opl release publish[\s\S]*homebrew-unknown-persisted\.json/);
  assert.match(source, /opl release checkpoint export[\s\S]*homebrew-unknown-checkpoint/);
  assert.match(source, /opl release status[\s\S]*active_unknown_markers/);
  assert.match(source, /write_framework_homebrew_receipt complete[\s\S]*opl release reconcile/);
  assert.match(source, /--prior-attempt-id/);
  assert.match(source, /--publication-scope external_target/);
  assert.match(source, /push_exit_status/);
  assert.match(source, /release-failure-evidence\/stdout\.txt/);
  assert.match(source, /release-failure-evidence\/stderr\.txt/);
});

test('new Bundle callers do not activate legacy broker or Stable-session admission', () => {
  for (const name of ['_release-bundle.yml', '_release-standard-publish.yml', '_release-full-addon.yml']) {
    const workflow = parseWorkflow(name);
    for (const job of Object.values(workflow.jobs) as Array<Record<string, any>>) {
      if (!job.uses || !String(job.uses).startsWith('./.github/workflows/')) continue;
      assert.equal(job.with?.stable_session_id, undefined, `${name} must not pass legacy stable_session_id`);
      assert.equal(job.with?.release_mutation, undefined, `${name} must not pass legacy release_mutation`);
      assert.equal(job.with?.release_session_lease_base64, undefined, `${name} must not pass a broker lease`);
    }
  }
  for (const name of ['_build-reusable.yml', 'full-first-install-release.yml', 'opl-first-run-vm.yml']) {
    const workflow = parseWorkflow(name);
    const inputs = workflow.on.workflow_call.inputs;
    for (const legacyInput of [
      'stable_session_id',
      'release_session_lease_base64',
      'release_attempt_id',
      'pre_api_admission_receipt_base64',
      'release_mutation',
      'broker_admission_validation_sha256',
    ]) {
      assert.equal(inputs[legacyInput], undefined, `${name} must not declare legacy ${legacyInput}`);
    }
    assert.doesNotMatch(readWorkflow(name), /verify-release-(?:broker-acceptance|session-lease)\.ts/);
  }
});

test('the App adapter freezes the App Standard compatibility union without Package authority', () => {
  const fixture = adapterFixture();
  try {
    const output = path.join(fixture.root, 'freeze-request.json');
    const first = runFreezeRequest(fixture, output);
    assert.equal(first.status, 0, first.stderr);
    const request = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(request.surface_kind, 'opl_release_bundle_freeze_request.v1');
    assert.equal(request.schema_ref, 'contracts/opl-framework/release-bundle-freeze-request.schema.json');
    assert.equal(request.identity_mode, 'app_standard_compatibility');
    assert.deepEqual(request.package_compatibility, {
      abi: 'opl_packages.v1',
      version_range: '>=0.1.0 <1.0.0',
    });
    assert.equal(request.framework_release_set, undefined);
    assert.equal(request.packages, undefined);
    assert.equal(request.source_cutoff, undefined);
    assert.equal(request.frozen_build_inputs, undefined);
    assert.deepEqual(Object.keys(request.tracks), ['standard', 'full']);
    assert.equal(request.tracks.standard.required_for_latest, true);
    assert.deepEqual(request.tracks.standard.required_asset_names, [
      'One-Person-Lab-26.7.20-mac-arm64.dmg',
      'One-Person-Lab-26.7.20-mac-arm64.zip',
      'One-Person-Lab-26.7.20-mac-arm64.zip.blockmap',
      'latest-arm64-mac.yml',
      'opl-app-component-manifest.json',
      'opl-install.sh',
    ]);
    assert.equal(request.tracks.full.required_for_latest, false);
    assert.equal(request.tracks.webui, undefined);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('the App adapter rejects notes without online AI provenance before build', () => {
  const fixture = adapterFixture();
  try {
    fs.writeFileSync(fixture.notesPath, '# One Person Lab v26.7.20\n\nTemplate notes.\n');
    const result = runFreezeRequest(fixture, path.join(fixture.root, 'untrusted-notes.json'));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not bound to the online AI writer/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('the App adapter rejects prepared notes that bind a future Full Package payload', () => {
  const fixture = adapterFixture();
  try {
    fs.writeFileSync(fixture.evidencePath, `${JSON.stringify({
      schema: 'opl_app_release_notes_evidence.v1',
      payload: { include_full_package: true },
    })}\n`);
    const result = runFreezeRequest(fixture, path.join(fixture.root, 'mismatched-notes-intent.json'));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not bind a future Full Package payload/);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Stable Standard publication binds one Desktop carrier without a retired Native artifact', () => {
  const workflow = parseWorkflow('_release-bundle.yml');
  const follower = parseWorkflow('release-webui-follower.yml');
  const source = readWorkflow('_release-bundle.yml');
  const standardSource = readWorkflow('_release-standard-publish.yml');
  const followerSource = readWorkflow('release-webui-follower.yml');
  const webuiSource = readWorkflow('_release-webui-carrier.yml');
  const adapterSource = readAdapter();
  assert.deepEqual(workflow.jobs['standard-build'].needs, ['freeze', 'resolve-platform-matrix']);
  assert.equal(
    workflow.jobs['standard-build'].with.matrix,
    '${{ needs.resolve-platform-matrix.outputs.matrix }}',
  );
  assert.equal(workflow.jobs['standard-build'].with.release_validation_profile, 'stable');
  assert.match(
    String(workflow.jobs['resolve-platform-matrix'].steps.find(
      (step: Record<string, unknown>) => step.id === 'resolve',
    )?.run),
    /resolve-release-platform-matrix\.ts[\s\S]*--policy "\$policy"/,
  );
  assert.deepEqual(
    workflow.jobs['checkpoint-standard'].needs,
    ['admission', 'freeze', 'seal-standard-identity'],
  );
  assert.deepEqual(workflow.jobs['publish-standard'].needs, ['freeze', 'checkpoint-standard']);
  assert.equal(workflow.jobs['prepare-native-webui'], undefined);
  assert.equal(workflow.jobs['prepare-native-webui-macos'], undefined);
  assert.equal(workflow.jobs['publish-native-webui'], undefined);
  assert.equal(workflow.jobs['publish-native-webui-macos'], undefined);
  assert.equal(Object.hasOwn(workflow.jobs['publish-standard'].with, 'qualified_native_artifact_name'), false);
  assert.equal(Object.hasOwn(workflow.jobs['publish-standard'].with, 'qualified_native_macos_artifact_name'), false);
  assert.match(standardSource, /Download exact immutable carrier source/);
  assert.match(standardSource, /Bind consumed Stable operation control into the immutable carrier/);
  assert.match(standardSource, /cp -a "\$control_source_dir" stable-operation-control/);
  assert.doesNotMatch(standardSource, /native-qualified|native-release|qualified_native_|release-native-webui-carrier/);
  const resumeCheckpointUpload = parseWorkflow('_release-standard-publish.yml').jobs.restore.steps.find(
    (step: Record<string, unknown>) => step.name === 'Upload reconciled operation checkpoint',
  ) as Record<string, any>;
  const resumableEvidence = parseWorkflow('_release-standard-publish.yml').jobs.restore.steps.find(
    (step: Record<string, unknown>) =>
      step.name === 'Preserve Stable control in a resumable checkpoint',
  ) as Record<string, any>;
  assert.equal(resumableEvidence.if, "${{ inputs.publication_channel == 'stable' }}");
  assert.match(resumableEvidence.run, /source="checkpoint-identity-bootstrap\/\$directory"/);
  assert.match(resumableEvidence.run, /stable-operation-consumption\.json/);
  assert.match(resumableEvidence.run, /stable-operation-authority\.json/);
  assert.match(resumableEvidence.run, /source-gate\.json/);
  assert.match(resumableEvidence.run, /pre-issued-pre-nonce-guard\.json/);
  assert.match(resumableEvidence.run, /run-authority-reconcile\.json/);
  assert.match(resumeCheckpointUpload.with.path, /stable-operation-control/);
  assert.match(standardSource, /--expected-run-id "\$control_run_id"/);
  const standardPublicationReceipt = workflowStep(
    '_release-standard-publish.yml',
    'publish-standard-nonlatest',
    'Upload Standard publication receipt',
  );
  assert.match(String(standardPublicationReceipt.with.path), /(?:^|\n)\s*stable-operation-control(?:\n|$)/);
  assert.doesNotMatch(String(standardPublicationReceipt.with.path), /native-qualified|native-release/);
  assert.equal(workflow.jobs['webui-carrier'], undefined);
  assert.equal(workflow.jobs['promote-webui-stable'], undefined);
  assert.deepEqual(Object.keys(follower.on), ['workflow_run', 'workflow_dispatch']);
  assert.deepEqual(follower.on.workflow_run.workflows, ['OPL Stable Release Bundle']);
  assert.deepEqual(follower.on.workflow_run.types, ['completed']);
  assert.deepEqual(Object.keys(follower.on.workflow_dispatch.inputs), [
    'source_run_id',
    'failed_follower_run_id',
    'failed_recovery_run_id',
    'failed_recovery_v2_run_id',
    'failed_recovery_v3_run_id',
    'failed_recovery_v4_run_id',
    'failed_recovery_v5_run_id',
    'failed_recovery_v6_run_id',
    'failed_recovery_v7_run_id',
    'failed_recovery_v8_run_id',
    'recovery_confirmation',
  ]);
  assert.equal(follower.on.workflow_dispatch.inputs.failed_recovery_run_id.required, false);
  assert.equal(follower.on.workflow_dispatch.inputs.failed_recovery_run_id.type, 'string');
  assert.equal(follower.on.workflow_dispatch.inputs.failed_recovery_v2_run_id.required, false);
  assert.equal(follower.on.workflow_dispatch.inputs.failed_recovery_v2_run_id.type, 'string');
  assert.equal(follower.on.workflow_dispatch.inputs.failed_recovery_v3_run_id.required, false);
  assert.equal(follower.on.workflow_dispatch.inputs.failed_recovery_v3_run_id.type, 'string');
  assert.equal(follower.on.workflow_dispatch.inputs.failed_recovery_v4_run_id.required, false);
  assert.equal(follower.on.workflow_dispatch.inputs.failed_recovery_v4_run_id.type, 'string');
  assert.equal(follower.on.workflow_dispatch.inputs.failed_recovery_v5_run_id.required, false);
  assert.equal(follower.on.workflow_dispatch.inputs.failed_recovery_v5_run_id.type, 'string');
  assert.equal(follower.on.workflow_dispatch.inputs.failed_recovery_v6_run_id.required, false);
  assert.equal(follower.on.workflow_dispatch.inputs.failed_recovery_v6_run_id.type, 'string');
  assert.equal(follower.on.workflow_dispatch.inputs.failed_recovery_v7_run_id.required, false);
  assert.equal(follower.on.workflow_dispatch.inputs.failed_recovery_v7_run_id.type, 'string');
  assert.equal(follower.on.workflow_dispatch.inputs.failed_recovery_v8_run_id.required, false);
  assert.equal(follower.on.workflow_dispatch.inputs.failed_recovery_v8_run_id.type, 'string');
  assert.deepEqual(follower.on.workflow_dispatch.inputs.recovery_confirmation.options, [
    'recover_exact_failed_webui_follower_v1',
    'recover_exact_failed_webui_follower_v2',
    'recover_exact_failed_webui_follower_v3',
    'recover_exact_failed_webui_follower_v4',
    'recover_exact_failed_webui_follower_v5',
    'recover_exact_failed_webui_follower_v6',
    'recover_exact_failed_webui_follower_v7',
    'recover_exact_failed_webui_follower_v8',
    'recover_exact_failed_webui_follower_v9',
  ]);
  assert.match(followerSource, /\.total_count == 5/);
  assert.match(followerSource, /promote-webui-stable" and \.conclusion == "skipped"/);
  assert.match(followerSource, /failed recovery v1 \$\{FAILED_RECOVERY_RUN_ID\}/);
  assert.match(followerSource, /failed recovery v2 \$\{FAILED_RECOVERY_V2_RUN_ID\}/);
  assert.match(followerSource, /failed recovery v3 \$\{FAILED_RECOVERY_V3_RUN_ID\}/);
  assert.match(followerSource, /failed recovery v4 \$\{FAILED_RECOVERY_V4_RUN_ID\}/);
  assert.match(followerSource, /failed recovery v5 \$\{FAILED_RECOVERY_V5_RUN_ID\}/);
  assert.match(followerSource, /failed recovery v6 \$\{FAILED_RECOVERY_V6_RUN_ID\}/);
  assert.match(followerSource, /failed recovery v7 \$\{FAILED_RECOVERY_V7_RUN_ID\}/);
  assert.match(followerSource, /failed recovery v8 \$\{FAILED_RECOVERY_V8_RUN_ID\}/);
  assert.match(followerSource, /opl_seed_payload_symlink_forbidden/);
  assert.match(followerSource, /expected one exact nested OPL Flow currentness error/);
  assert.match(followerSource, /\.total_count == 3/);
  assert.match(followerSource, /failed-recovery-v3-artifacts\.json/);
  assert.match(followerSource, /failed-recovery-v4-artifacts\.json/);
  assert.match(followerSource, /failed-recovery-v5-artifacts\.json/);
  assert.match(followerSource, /failed-recovery-v6-artifacts\.json/);
  assert.match(followerSource, /failed-recovery-v7-artifacts\.json/);
  assert.match(followerSource, /failed-recovery-v8-artifacts\.json/);
  assert.match(followerSource, /webui-sidecar-reconcile-26\.8\.4-/);
  assert.match(followerSource, /Error: absolute file path detected\./);
  assert.match(followerSource, /sha256:44eb5268eeb16ca2362d46515da59c3db6ae5537fd9bd69ec42b6845618eed23/);
  assert.match(followerSource, /fatal: Not a valid commit name 95640c74e0b14ba2e88056de725c417fd1693cf1/);
  assert.match(followerSource, /FAILED_RECOVERY_V4_RUN_ID: unbound variable/);
  assert.match(followerSource, /configured_codex_plugin_carrier_owner_descriptor_missing/);
  assert.match(followerSource, /e9a5cc46766215e4e301d8a59fcaeffc2e00de7a/);
  assert.match(followerSource, /acdf7738832dcdf569ecea9b63fcbc7d0d47d238/);
  assert.match(followerSource, /runs\?event=workflow_dispatch&per_page=100/);
  assert.equal(follower.jobs['webui-carrier'].needs[0], 'resolve-handoff');
  assert.deepEqual(
    follower.jobs['promote-webui-stable'].needs,
    ['resolve-handoff', 'webui-carrier'],
  );
  assert.equal(
    follower.jobs['webui-carrier'].with.source_artifact_run_id,
    '${{ needs.resolve-handoff.outputs.source_artifact_run_id }}',
  );
  assert.equal(
    follower.jobs['webui-carrier'].with.standard_checkpoint_artifact_name,
    '${{ needs.resolve-handoff.outputs.standard_checkpoint_artifact_name }}',
  );
  assert.equal(
    follower.jobs['webui-carrier'].with.qualified_artifact_run_id,
    '${{ needs.resolve-handoff.outputs.qualified_artifact_run_id }}',
  );
  assert.equal(
    follower.jobs['webui-carrier'].with.qualified_artifact_name,
    '${{ needs.resolve-handoff.outputs.qualified_artifact_name }}',
  );
  assert.doesNotMatch(followerSource, /continue-on-error/);
  assert.match(followerSource, /executor_head_sha:\s*\$head/);
  assert.match(followerSource, /\.release\.cohort\.app_sha \| test/);
  assert.doesNotMatch(
    followerSource,
    /\.release\.cohort\.app_sha == \$head/,
    'resume_standard must keep the original Bundle App SHA independent from the current executor SHA',
  );
  assert.match(standardSource, /webui-follower-handoff\.json/);
  assert.match(standardSource, /test "\$framework_terminal_status" = complete/);
  assert.match(standardSource, /framework_terminal_status:\s*\$framework_terminal_status/);
  for (const id of [
    'app_source',
    'base_image',
    'codex_cli',
    'dockerfile',
    'framework_seed',
    'qualification_harness',
    'shell_webui_source',
  ]) {
    assert.match(adapterSource, new RegExp(id));
  }
  assert.doesNotMatch(adapterSource, /first_party_packages|framework_release_set:|release-set-manifest/);
  assert.equal((source.match(/oras manifest fetch --descriptor "\$\{carrier\}:latest-stable"/g) ?? []).length, 0);
  assert.doesNotMatch(source, /oras login|--password-stdin/);
  assert.doesNotMatch(source, /single_read_at_freeze_admission|--source-cutoff-observed-at/);
  assert.match(webuiSource, /single_read_at_freeze_admission|--source-cutoff-observed-at/);
  assert.doesNotMatch(source, /--frozen-base-release-set-generation|--release-set-manifest/);
  assert.match(source, /--package-compatibility-abi/);
  assert.match(source, /--package-compatibility-version-range/);
  assert.doesNotMatch(source, /--base-image-index|--frozen-codex-tarball/);
  assert.match(webuiSource, /--base-image-index/);
  assert.match(webuiSource, /--frozen-codex-tarball/);
  assert.doesNotMatch(source, /--track webui|webui-qualification-receipt|opl-webui-carrier\.json/);
  assert.match(source, /jq -e '\.tracks\.webui' bundle\/release-bundle\.json/);
  assert.match(source, /expected_checkpoint_stage=standard_built/);
  assert.match(source, /expected_checkpoint_stage=stable_built/);
  assert.doesNotMatch(
    source.slice(source.indexOf('Freeze canonical Framework Bundle')),
    /npm view[^\n]+latest|git ls-remote[^\n]+(?:shells\/aionui|framework-source)[^\n]+after-freeze/,
  );
});

test('Standard checkpoint stage follows the immutable Bundle track set', () => {
  for (const fixture of [
    {
      label: 'Desktop-only Bundle',
      tracks: { standard: {}, full: {} },
      stage: 'standard_built',
    },
    {
      label: 'unified WebUI Bundle',
      tracks: { standard: {}, webui: {}, full: {} },
      stage: 'stable_built',
    },
  ]) {
    const result = runStandardCheckpointStageGuard(fixture.tracks, fixture.stage);
    assert.equal(result.status, 0, `${fixture.label}: ${result.stderr || result.stdout}`);
  }

  for (const fixture of [
    {
      label: 'Desktop-only Bundle rejects unified stage',
      tracks: { standard: {}, full: {} },
      stage: 'stable_built',
      expected: 'standard_built',
    },
    {
      label: 'unified WebUI Bundle rejects Desktop-only stage',
      tracks: { standard: {}, webui: {}, full: {} },
      stage: 'standard_built',
      expected: 'stable_built',
    },
  ]) {
    const result = runStandardCheckpointStageGuard(fixture.tracks, fixture.stage);
    assert.notEqual(result.status, 0, fixture.label);
    assert.match(result.stdout, new RegExp(`expected ${fixture.expected}`));
    assert.match(result.stdout, new RegExp(`got ${fixture.stage}`));
  }
});

test('Standard moving pointers require exact Desktop readback and hosted admission without VM qualification state', () => {
  const workflow = parseWorkflow('_release-standard-publish.yml');
  const source = readWorkflow('_release-standard-publish.yml');
  assert.ok(workflow.jobs['publish-homebrew-standard'].needs.includes('remote-digest-verify'));
  assert.ok(workflow.jobs['activate-latest'].needs.includes('remote-digest-verify'));
  assert.doesNotMatch(source, /docker buildx imagetools inspect "\$(?:latest_)?webui_ref"/);
  assert.doesNotMatch(source, /--track webui --outcome complete/);
  assert.doesNotMatch(source, /stable_promotion_barrier\.satisfied == true/);
  assert.doesNotMatch(source, /latest_eligible == true/);
  assert.match(source, /Unified hosted publication requires a checkpoint at or after stable_built/);
  assert.match(source, /Hosted Standard publication requires a checkpoint at or after standard_built/);
  assert.doesNotMatch(source, /requires a checkpoint at or after standard_qualified/);
  assert.equal(
    (source.match(/if jq -e '\.tracks\.webui' "\$bundle"/g) ?? []).length,
    1,
    'only the historical checkpoint compatibility reader may inspect a legacy WebUI track',
  );
  assert.equal((source.match(/\.release_bundle_status\.tracks\.standard\.reconcile_required == false/g) ?? []).length, 2);
  assert.doesNotMatch(source, /opl-webui-carrier\.json/);
  assert.doesNotMatch(source, /oras tag[^\n]+stable|docker buildx imagetools create[^\n]+stable/);
});

test('Stable and Full publication consume one mutable-Standard attestation and controlled setting receipt chain', () => {
  const standard = readWorkflow('_release-standard-publish.yml');
  const full = readWorkflow('_release-full-addon.yml');
  const adapter = readAdapter();

  assert.match(standard, /github-release-immutability-setting\.ts preflight/);
  assert.match(standard, /github-release-immutability-setting\.ts disable/);
  assert.match(standard, /github-release-immutability-setting\.ts restore/);
  assert.match(standard, /write-release-attestation\.ts/);
  assert.match(
    full,
    /gh release download "\$standard_tag"[\s\S]*--pattern opl-release-attestation\.json/,
  );
  assert.match(full, /test "\$\{#standard_attestations\[@\]\}" -eq 1/);
  assert.match(full, /--standard-attestation "\$standard_attestation"/);
  assert.match(adapter, /standardAttestationIdentity/);
  assert.match(adapter, /Canonical Stable publication requires exactly one unified public attestation/);
  assert.match(adapter, /nativeImmutableRequired: !canonicalMutableStandard/);
  assert.match(adapter, /Controlled mutable Standard readback unexpectedly reports immutable=true/);
  assert.match(full, /index\("stable-operation-publication-record\.json"\) \| not/);
  assert.doesNotMatch(full, /--publication-record|--pattern stable-operation-publication-record\.json/);
});
