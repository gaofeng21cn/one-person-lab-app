import test from 'node:test';
import {
  assert,
  fs,
  path,
  parseYaml,
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

test('Standard Homebrew follower uses same-tag inspect-before-write CAS and cannot block core publication', () => {
  const workflow = parseWorkflow('release-stable-post-success-followups.yml');
  assert.deepEqual(Object.keys(workflow.on), ['workflow_run', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.workflow_run.workflows, ['OPL Stable Release Bundle']);
  assert.ok(workflow.on.workflow_dispatch.inputs.operation.options.includes('reconcile_homebrew_standard'));
  const job = workflow.jobs['publish-standard-cask'];
  assert.equal(job.if, "${{ needs.route.outputs.homebrew_standard == 'true' }}");
  const actionSource = fs.readFileSync(
    path.join(process.cwd(), '.github/actions/release-followups/homebrew-standard/action.yml'),
    'utf8',
  );
  const action = parseYaml(actionSource);
  const source = String(
    action.runs.steps.find(
      (step: Record<string, unknown>) => step.name === 'Apply one exact-CAS Standard Cask update',
    )?.run ?? '',
  );
  const bindStep = action.runs.steps.find(
    (step: Record<string, unknown>) => step.name === 'Bind one successful Standard publication run',
  );
  const checkoutStep = job.steps.find(
    (step: Record<string, unknown>) => step.name === 'Checkout canonical Homebrew Standard follower',
  );
  assert.equal(checkoutStep?.with?.ref, 'main');
  assert.equal(checkoutStep?.with?.['persist-credentials'], false);
  assert.match(String(bindStep?.run), /test "\$GITHUB_REF" = refs\/heads\/main/);
  assert.match(String(bindStep?.run), /test "\$RECONCILE_CONFIRMATION" = reconcile_published_homebrew_standard/);
  assert.match(String(bindStep?.run), /\.commit\.sha current-main\.json/);
  assert.match(String(bindStep?.run), /\.head_sha == \$head/);
  assert.match(source, /opl_homebrew_standard_follower_handoff\.v1/);
  assert.match(source, /same_tag_replacement_allowed: true/);
  assert.ok(source.indexOf('tap_base="$(git -C tap-source rev-parse HEAD)"') < source.indexOf('--remote-write-mode inspect_only'));
  assert.ok(source.indexOf('--remote-write-mode inspect_only') < source.indexOf('--remote-write-mode direct_commit'));
  assert.match(source, /test "\$decision" = idempotent \|\| test "\$decision" = write_once/);
  assert.match(source, /--expected-current-cask-sha256 "\$current_cask"/);
  assert.equal((source.match(/git -C tap-source commit /g) ?? []).length, 1);
  assert.equal((source.match(/git -C tap-source push --no-force/g) ?? []).length, 1);
  assert.match(source, /push_count=1/);
  assert.doesNotMatch(source, /for attempt in 1 2 3|three read-only reconciliations/);
  assert.doesNotMatch(source, /new_release_revision_required|version_conflict/);
  assert.match(source, /push_exit_status/);
  assert.match(source, /core_release_or_latest_blocked:false/);
  assert.match(source, /the core Release and Latest remain complete/);
  assert.equal(
    job.steps.some((step: Record<string, unknown>) => step.uses === './.github/actions/release-followups/homebrew-standard'),
    true,
  );
  assert.equal(fs.existsSync(path.join(process.cwd(), '.github/workflows/release-homebrew-standard-follower.yml')), false);
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
      'latest-mac.yml',
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
  const source = readWorkflow('_release-bundle.yml');
  const standardSource = readWorkflow('_release-standard-publish.yml');
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
    ['admission', 'freeze', 'seal-standard-identity', 'standard-clean-vm-qualification'],
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
  assert.doesNotMatch(standardSource, /webui-follower-handoff\.json|release-webui-follower/);
  assert.doesNotMatch(webuiSource, /stable_authority_run_id|production_recovery|development_validation/);
  assert.match(standardSource, /test "\$framework_terminal_status" = complete/);
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

test('Standard moving pointers require exact Desktop readback and a protected clean-VM checkpoint sidecar', () => {
  const workflow = parseWorkflow('_release-standard-publish.yml');
  const source = readWorkflow('_release-standard-publish.yml');
  assert.equal(workflow.jobs['publish-homebrew-standard'], undefined);
  assert.equal(workflow.jobs['homebrew-standard-readback'], undefined);
  assert.deepEqual(workflow.jobs['activate-latest'].needs, ['restore', 'remote-digest-verify']);
  assert.match(source, /homebrew-standard-handoff\.json/);
  assert.doesNotMatch(source, /OPL_HOMEBREW_TAP_TOKEN|git -C tap-source push/);
  assert.doesNotMatch(source, /docker buildx imagetools inspect "\$(?:latest_)?webui_ref"/);
  assert.doesNotMatch(source, /--track webui --outcome complete/);
  assert.doesNotMatch(source, /stable_promotion_barrier\.satisfied == true/);
  assert.doesNotMatch(source, /latest_eligible == true/);
  assert.match(source, /Unified hosted publication requires a checkpoint at or after stable_built/);
  assert.match(source, /Hosted Standard publication requires a checkpoint at or after standard_built/);
  assert.doesNotMatch(source, /requires a checkpoint at or after standard_qualified/);
  const sidecar = workflow.jobs.restore.steps.find(
    (step: Record<string, unknown>) => step.name === 'Verify protected Standard clean-VM checkpoint sidecar',
  );
  assert.equal(sidecar.if, "${{ inputs.publication_channel == 'stable' }}");
  assert.match(String(sidecar.run), /standard-clean-vm-qualification-receipt\.json/);
  assert.match(String(sidecar.run), /standard-clean-vm-qualification-receipt\.sha256/);
  assert.match(String(sidecar.run), /test "\$observed_sha" = "\$expected_sha"/);
  assert.match(String(sidecar.run), /\.qualification\.result == "passed"/);
  assert.equal(
    (source.match(/if jq -e '\.tracks\.webui' "\$bundle"/g) ?? []).length,
    1,
    'only the historical checkpoint compatibility reader may inspect a legacy WebUI track',
  );
  assert.equal((source.match(/\.release_bundle_status\.tracks\.standard\.reconcile_required == false/g) ?? []).length, 2);
  assert.doesNotMatch(source, /opl-webui-carrier\.json/);
  assert.doesNotMatch(source, /oras tag[^\n]+stable|docker buildx imagetools create[^\n]+stable/);
});

test('Stable and Full publication consume one mutable-Standard attestation without repository setting control', () => {
  const standard = readWorkflow('_release-standard-publish.yml');
  const full = readWorkflow('_release-full-addon.yml');
  const adapter = readAdapter();

  assert.doesNotMatch(
    standard,
    /immutable-releases|github-release-immutability-setting|preflight-setting-receipt|disabled-setting-receipt/,
  );
  assert.match(standard, /write-release-attestation\.ts/);
  assert.match(
    full,
    /gh release download "\$standard_tag"[\s\S]*--pattern opl-release-attestation\.json/,
  );
  assert.match(full, /test "\$\{#standard_attestations\[@\]\}" -eq 1/);
  assert.match(full, /--standard-attestation "\$standard_attestation"/);
  assert.match(adapter, /standardAttestationIdentity/);
  assert.match(adapter, /Canonical Stable publication requires exactly one unified public attestation/);
  assert.match(adapter, /assertCanonicalStandardPublicationBoundary/);
  assert.match(adapter, /github_native_immutable_expected: false/);
  assert.match(full, /index\("stable-operation-publication-record\.json"\) \| not/);
  assert.doesNotMatch(full, /--publication-record|--pattern stable-operation-publication-record\.json/);
});
