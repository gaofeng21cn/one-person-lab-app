import test from 'node:test';
import {
  assert,
  crypto,
  fs,
  os,
  path,
  spawnSync,
  assertReleaseOperationDeadline,
  readWorkflow,
  parseWorkflow,
  minimumCompatibleFrameworkAbiRef,
  rejectedBundle,
  transportProvenanceFields,
  frameworkOwnedLineageFields,
  workflowStep,
  runAdmissionGate,
} from "./fixtures.ts";

test('Standard notes and Bundle freeze stay independent from Full and Package authority', () => {
  const workflow = parseWorkflow('_release-bundle.yml');
  const source = readWorkflow('_release-bundle.yml');
  const standardPublishSource = readWorkflow('_release-standard-publish.yml');
  const frameworkCheckout = workflowStep(
    '_release-bundle.yml',
    'freeze',
    'Checkout Framework source and executor',
  );
  assert.equal(frameworkCheckout.with.repository, 'gaofeng21cn/one-person-lab');
  assert.equal(frameworkCheckout.with.ref, "${{ inputs.framework_ref || 'main' }}");
  assert.equal(frameworkCheckout.with.path, 'framework-source');
  const identityScript = String(workflowStep(
    '_release-bundle.yml',
    'freeze',
    'Freeze source, version, and compatibility identity',
  ).run);
  assert.match(identityScript, /\[ "\$app_sha" = "\$REQUESTED_APP_REF" \]/);
  assert.match(identityScript, /\[ "\$shell_sha" = "\$REQUESTED_SHELL_REF" \]/);
  assert.match(identityScript, /\[ "\$framework_sha" = "\$REQUESTED_FRAMEWORK_REF" \]/);
  assert.doesNotMatch(identityScript, /canonical_(?:app|shell|framework)_sha/);
  assert.doesNotMatch(identityScript, /ls-remote[^\n]*refs\/heads\/main/);
  for (const scratchPath of [
    '$RUNNER_TEMP/opl-published-releases-$GITHUB_RUN_ID.json',
    '$RUNNER_TEMP/opl-published-tags-$GITHUB_RUN_ID.txt',
    '$RUNNER_TEMP/opl-stable-version-order-$GITHUB_RUN_ID.json',
    '$RUNNER_TEMP/opl-previous-latest-$GITHUB_RUN_ID.json',
  ]) {
    assert.ok(identityScript.includes(scratchPath), `identity scratch is not outside the App tree: ${scratchPath}`);
  }
  assert.doesNotMatch(identityScript, /nightly-tags|resolveNightlyReleaseVersion/);
  assert.doesNotMatch(
    identityScript,
    /> (?:published-releases\.json|published-tags\.txt|stable-version-order\.json|previous-latest\.json|nightly-tags\.txt)/,
  );
  assert.equal(workflow.jobs['full-notes-authority'], undefined);
  assert.deepEqual(workflow.jobs.freeze.needs, ['admission']);
  assert.equal(workflow.jobs.freeze['runs-on'], 'macos-latest');
  assert.doesNotMatch(source, /prepare-release-notes-full-payload-authority|notes-full-payload-authority/);
  assert.doesNotMatch(source, /release_set_manifest|latest-stable-descriptor|base-release-set/);
  assert.match(source, /resolve-github-target-commit\.ts/);
  assert.match(standardPublishSource, /resolve-github-target-commit\.ts/);

  const step = workflowStep(
    '_release-bundle.yml',
    'freeze',
    'Prepare and validate online AI notes',
  );
  assert.equal(step.env.OPL_RELEASE_NOTES_MODE, 'ai');
  assert.equal(step.env.OPL_RELEASE_NOTES_PROVIDER, 'openai_compatible');
  assert.equal(step.env.OPL_RELEASE_NOTES_MODEL, 'gpt-5.6-luna');
  assert.equal(
    step.env.OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_MODELS,
    'gpt-5.6-luna,gpt-5.4',
  );
  const script = String(step.run);
  assert.doesNotMatch(script, /--include-full-package|--full-payload-authority|--full-package-manifest/);
  assert.match(script, /notes_root="\$RUNNER_TEMP\/opl-release-prepared-notes-\$GITHUB_RUN_ID"/);
  assert.match(script, /set --\nif \(\( \$\{#notes_intent_args\[@\]\} \)\); then/);
  assert.match(script, /set -- "\$\{notes_intent_args\[@\]\}"/);
  assert.match(script, /^\s*"\$@"\s*\\$/m);
  assert.doesNotMatch(script, /^\s*"\$\{notes_intent_args\[@\]\}"\s*\\$/m);
  assert.match(script, /--evidence-output "\$notes_root\/notes-evidence\.json"/);
  assert.doesNotMatch(script, /One-Person-Lab-Manual|dist\/opl-full-release|full-package-manifest\.json/);
  const guard = script.match(/set --\n\s*if \(\( \$\{#notes_intent_args\[@\]\} \)\); then\n\s*set -- "\$\{notes_intent_args\[@\]\}"\n\s*fi/)?.[0];
  assert.ok(guard);
  for (const [name, initial, expected] of [
    ['empty', 'notes_intent_args=()', []],
    ['nonempty', 'notes_intent_args=(one "two words" three)', ['one', 'two words', 'three']],
  ] as const) {
    const result = spawnSync('/bin/bash', ['-u', '-c', [
      initial,
      guard,
      'printf "%s\\0" "$@"',
    ].join('\n')], { encoding: 'buffer' });
    assert.equal(result.status, 0, `${name}: ${String(result.stderr)}`);
    assert.deepEqual(
      result.stdout.toString().split('\0').filter(Boolean),
      expected,
      `${name} Bash 3.2 argument forwarding drifted`,
    );
  }

  const freezeScript = String(workflowStep(
    '_release-bundle.yml',
    'freeze',
    'Freeze canonical Framework Bundle',
  ).run);
  assert.match(freezeScript, /--notes "\$notes_root\/notes\.md"/);
  assert.match(freezeScript, /--notes-evidence "\$notes_root\/notes-evidence\.json"/);
  assert.match(freezeScript, /--package-compatibility-abi '\$\{\{ inputs\.package_compatibility_abi \}\}'/);
  assert.match(freezeScript, /--package-compatibility-version-range '\$\{\{ inputs\.package_compatibility_version_range \}\}'/);
  assert.doesNotMatch(freezeScript, /--release-set-manifest|--frozen-base-release-set|--notes-full-payload-authority/);
  assert.doesNotMatch(freezeScript, /oras manifest fetch|npm view|--base-image-index|--frozen-codex-tarball/);
  assert.doesNotMatch(freezeScript, /(?:^|\n)\s*docker(?:\s|$)/);
  assert.ok(
    freezeScript.indexOf('scripts/framework-release-adapter.ts freeze-request')
      < freezeScript.indexOf('cp "$notes_root/notes-evidence.json" notes-evidence.json'),
  );

  const releaseContract = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'contracts', 'app-release-channel.json'), 'utf8'),
  );
  const binding = releaseContract.release_bundle_control_plane.prepared_notes.full_payload_authority_binding;
  assert.equal(binding.schema, 'opl_app_release_notes_full_payload_authority.v1');
  assert.equal(binding.evidence_digest_path, 'payload.full_payload_authority_sha256');
  assert.equal(binding.comparison, 'canonical_json_exact_field_set_and_values');
  assert.equal(binding.new_standard_consumes_same_file, false);
  assert.equal(binding.legacy_bundle_read_compatibility_only, true);
});

test('every release-bound low-level admission rejects missing, invalid, or permanently rejected identity', () => {
  const digest = `sha256:${'a'.repeat(64)}`;
  const baseInputs = {
    opl_version: '26.8.1-r5',
    operation_started_at: '2026-07-21T00:00:00.000Z',
    operation_deadline_at: '2099-07-21T00:00:00.000Z',
    release_bundle_digest: digest,
    ref: '1'.repeat(40),
    artifact_app_ref: '1'.repeat(40),
    app_ref: '1'.repeat(40),
    artifact_app_sha: '1'.repeat(40),
    shell_ref: '2'.repeat(40),
    framework_ref: '3'.repeat(40),
    baseline_dmg_sha256: '4'.repeat(64),
    standard_identity_sha256: `sha256:${'5'.repeat(64)}`,
    target_standard_release_id: '363488678',
    target_standard_release_tag: 'v26.8.1-r5',
    target_standard_target_commitish: '6'.repeat(40),
  };
  const gates = [
    {
      workflow: '_build-reusable.yml',
      job: 'build',
      step: 'Admit one-shot release-bound build',
      operation: 'standard',
      fields: ['release_bundle_digest', 'ref', 'shell_ref', 'framework_ref'],
    },
    {
      workflow: 'opl-first-run-vm.yml',
      job: 'validate-vm-inputs',
      step: 'Admit one-shot release-bound qualification',
      operation: 'standard',
      fields: ['release_bundle_digest', 'artifact_app_ref', 'shell_ref', 'framework_ref'],
    },
    {
      workflow: 'opl-updater-upgrade-vm.yml',
      job: 'upgrade',
      step: 'Reject replay and invalid frozen identities',
      operation: 'resume_standard',
      fields: ['release_bundle_digest', 'app_ref', 'shell_ref', 'framework_ref'],
    },
    {
      workflow: 'full-first-install-release.yml',
      job: 'full-first-install',
      step: 'Admit one-shot release-bound Full build',
      operation: 'append_full',
      fields: [
        'release_bundle_digest',
        'artifact_app_sha',
        'shell_ref',
        'framework_ref',
        'target_standard_release_id',
        'target_standard_release_tag',
        'target_standard_target_commitish',
      ],
    },
  ] as const;

  for (const gate of gates) {
    const admission = workflowStep(gate.workflow, gate.job, gate.step);
    const source = String(admission.run);
    assert.match(source, /opl_release_nested_admission_receipt\.v1/);
    assert.match(source, /input-digest\.txt/);
    assert.match(source, /stdout\.txt/);
    assert.match(source, /stderr\.txt/);
    assert.match(source, /input_digest:\$input_digest/);
    assert.match(source, new RegExp(rejectedBundle));
    const validInputs = { ...baseInputs, operation: gate.operation };
    const valid = runAdmissionGate(gate.workflow, gate.job, gate.step, validInputs);
    assert.equal(valid.status, 0, `${gate.workflow} valid gate failed: ${valid.stderr}`);

    for (const field of gate.fields) {
      const missing = runAdmissionGate(gate.workflow, gate.job, gate.step, { ...validInputs, [field]: '' });
      assert.notEqual(missing.status, 0, `${gate.workflow} accepted missing ${field}`);
      const invalidValue = field === 'release_bundle_digest' ? 'sha256:not-exact' : 'A'.repeat(40);
      const invalid = runAdmissionGate(gate.workflow, gate.job, gate.step, {
        ...validInputs,
        [field]: invalidValue,
      });
      assert.notEqual(invalid.status, 0, `${gate.workflow} accepted invalid ${field}`);
    }

    const rejected = runAdmissionGate(gate.workflow, gate.job, gate.step, {
      ...validInputs,
      release_bundle_digest: rejectedBundle,
    });
    assert.notEqual(rejected.status, 0, `${gate.workflow} accepted the permanently rejected Bundle`);
  }

  for (const [workflow, job, step] of [
    ['_build-reusable.yml', 'build', 'Admit one-shot release-bound build'],
    ['opl-first-run-vm.yml', 'validate-vm-inputs', 'Admit one-shot release-bound qualification'],
    ['full-first-install-release.yml', 'full-first-install', 'Admit one-shot release-bound Full build'],
  ]) {
    assert.equal(workflowStep(workflow, job, step).if, "${{ inputs.operation != '' }}");
  }
});

test('the live control plane is split into Standard build, Standard publish, and additive Full workflows', () => {
  const bundle = parseWorkflow('_release-bundle.yml');
  const standard = parseWorkflow('_release-standard-publish.yml');
  const full = parseWorkflow('_release-full-addon.yml');

  assert.deepEqual(Object.keys(bundle.on), ['workflow_call']);
  assert.deepEqual(Object.keys(standard.on), ['workflow_call']);
  assert.deepEqual(Object.keys(full.on), ['workflow_call']);
  assert.equal(bundle.permissions, undefined);
  assert.equal(standard.permissions, undefined);
  assert.equal(full.permissions, undefined);
  assert.deepEqual(Object.keys(bundle.jobs), [
    'startup-canary',
    'resolve-platform-matrix',
    'admission',
    'freeze',
    'standard-build',
    'seal-standard-identity',
    'standard-clean-vm-qualification',
    'checkpoint-standard',
    'publish-standard',
  ]);
  assert.ok(standard.jobs.restore);
  assert.equal(standard.jobs['updater-upgrade-qualification'], undefined);
  assert.equal(standard.jobs['homebrew-standard-vm'], undefined);
  assert.ok(standard.jobs['publish-standard-nonlatest']);
  assert.ok(standard.jobs['activate-latest']);
  assert.ok(full.jobs['restore-standard']);
  assert.ok(full.jobs['materialize-full-build']);
  assert.ok(full.jobs['checkpoint-full']);
  assert.ok(full.jobs.provenance);
  assert.ok(full.jobs['publish-full']);
  for (const [workflow, inheritedMutationJobs] of [
    [bundle, new Set(['publish-standard'])],
    [standard, new Set(['publish-standard-nonlatest', 'activate-latest'])],
    [full, new Set(['publish-full'])],
  ] as const) {
    for (const [jobId, job] of Object.entries(workflow.jobs) as Array<[string, Record<string, any>]>) {
      if (inheritedMutationJobs.has(jobId)) {
        assert.equal(job.permissions, undefined, `${jobId} must inherit the caller permission ceiling`);
      } else {
        assert.deepEqual(job.permissions, { contents: 'read', actions: 'read' }, `${jobId} must be read-only`);
      }
    }
  }
  assert.doesNotMatch(`${readWorkflow('_release-bundle.yml')}\n${readWorkflow('_release-standard-publish.yml')}\n${readWorkflow('_release-full-addon.yml')}`, /release[_ -]broker|stable[_ -]session[_ -]lease/i);
});

test('append_full preserves the Standard checkpoint while binding a fresh Full content cohort', () => {
  const controller = parseWorkflow('release-stable.yml');
  const full = parseWorkflow('_release-full-addon.yml');
  const controllerAdmission = workflowStep(
    'release-stable.yml',
    'admission',
    'Admit one bounded Bundle operation',
  );
  const controllerAdmissionRun = String(controllerAdmission.run);
  const append = controller.jobs['append-full'].with;

  assert.equal(controller.on.workflow_dispatch.inputs.app_ref.required, false);
  assert.equal(controllerAdmission.env.REQUESTED_APP_REF, '${{ inputs.app_ref }}');
  assert.match(controllerAdmissionRun, /APP_REF="\$REQUESTED_APP_REF"/);
  assert.match(controllerAdmissionRun, /FRAMEWORK_SOURCE_REF="\$FRAMEWORK_EXECUTOR_REF"/);
  assert.equal(append.source_run_id, '${{ needs.admission.outputs.source_run_id }}');
  assert.equal(append.source_artifact, '${{ needs.admission.outputs.source_artifact }}');
  assert.equal(append.full_content_app_ref, '${{ needs.admission.outputs.app_ref }}');
  assert.equal(append.full_content_shell_ref, '${{ needs.admission.outputs.shell_ref }}');
  assert.equal(append.full_content_framework_ref, '${{ needs.admission.outputs.framework_ref }}');
  assert.equal(controller.jobs['resume-standard'].with.full_content_app_ref, undefined);

  for (const input of ['full_content_app_ref', 'full_content_shell_ref', 'full_content_framework_ref']) {
    assert.equal(full.on.workflow_call.inputs[input].required, true);
  }
  assert.equal(full.jobs['full-build'].with.artifact_app_sha, '${{ inputs.full_content_app_ref }}');
  assert.equal(full.jobs['full-build'].with.shell_ref, '${{ inputs.full_content_shell_ref }}');
  assert.equal(full.jobs['full-build'].with.framework_ref, '${{ inputs.full_content_framework_ref }}');
  assert.equal(
    full.jobs['full-build'].with.release_bundle_digest,
    '${{ needs.restore-standard.outputs.bundle_digest }}',
  );
  assert.equal(
    full.jobs['full-clean-vm-qualification'].with.artifact_app_ref,
    '${{ inputs.full_content_app_ref }}',
  );
  assert.equal(
    full.jobs['full-clean-vm-qualification'].with.shell_ref,
    '${{ inputs.full_content_shell_ref }}',
  );
  assert.equal(
    full.jobs['full-clean-vm-qualification'].with.framework_ref,
    '${{ inputs.full_content_framework_ref }}',
  );

  const hostedQualification = workflowStep(
    '_release-full-addon.yml',
    'full-qualification',
    'Verify exact hosted Full core qualification',
  );
  assert.equal(hostedQualification.env.FULL_CONTENT_APP_REF, '${{ inputs.full_content_app_ref }}');
  assert.equal(hostedQualification.env.FULL_CONTENT_SHELL_REF, '${{ inputs.full_content_shell_ref }}');
  assert.equal(hostedQualification.env.FULL_CONTENT_FRAMEWORK_REF, '${{ inputs.full_content_framework_ref }}');
  assert.match(String(hostedQualification.run), /carrier_context\.full_content_sources/);
  for (const step of [
    workflowStep('_release-full-addon.yml', 'checkpoint-full', 'Bind Full bytes and export additive checkpoint'),
    workflowStep('_release-full-addon.yml', 'publish-full', 'Append exact Full bytes to the mutable Standard Release'),
  ]) {
    const run = String(step.run);
    assert.match(run, /carrier_context\.full_content_sources/);
    assert.match(run, /inputs\.full_content_app_ref/);
    assert.match(run, /inputs\.full_content_shell_ref/);
    assert.match(run, /inputs\.full_content_framework_ref/);
  }

  const publishRun = String(
    workflowStep(
      '_release-full-addon.yml',
      'publish-full',
      'Append exact Full bytes to the mutable Standard Release',
    ).run,
  );
  const fullManifestCheckEnd = publishRun.indexOf(`' "$full_manifest" >/dev/null`);
  assert.notEqual(fullManifestCheckEnd, -1);
  const fullManifestCheckStart = publishRun.lastIndexOf('jq -e \\', fullManifestCheckEnd);
  assert.notEqual(fullManifestCheckStart, -1);
  const fullManifestCheck = publishRun.slice(fullManifestCheckStart, fullManifestCheckEnd);
  assert.match(fullManifestCheck, /--arg app '\$\{\{ inputs\.full_content_app_ref \}\}'/);
  assert.match(fullManifestCheck, /--arg shell '\$\{\{ inputs\.full_content_shell_ref \}\}'/);
  assert.match(fullManifestCheck, /--arg framework '\$\{\{ inputs\.full_content_framework_ref \}\}'/);
});

test('resume admission preserves Standard identity and rotates only an expired execution window', () => {
  const workflow = parseWorkflow('_release-standard-publish.yml');
  const source = readWorkflow('_release-standard-publish.yml');
  const restore = workflow.jobs.restore;
  const reconcile = workflowStep(
    '_release-standard-publish.yml',
    'restore',
    'Reconcile imported outcome and rotate only an expired Standard window',
  );
  const reconcileRun = String(reconcile.run);
  const operationRef = '${{ needs.restore.outputs.release_operation }}';
  const originalStartedAt = '2026-07-24T09:04:32Z';
  const originalDeadlineAt = '2026-07-24T10:34:32Z';

  assert.doesNotThrow(() => assertReleaseOperationDeadline({
    operation: 'resume_standard',
    startedAt: originalStartedAt,
    deadlineAt: '2026-07-24T09:34:32Z',
    now: '2026-07-24T09:20:00Z',
  }));
  assert.doesNotThrow(() => assertReleaseOperationDeadline({
    operation: 'standard',
    startedAt: originalStartedAt,
    deadlineAt: originalDeadlineAt,
    now: '2026-07-24T10:20:00Z',
  }));
  assert.throws(() => assertReleaseOperationDeadline({
    operation: 'resume_standard',
    startedAt: originalStartedAt,
    deadlineAt: originalDeadlineAt,
    now: '2026-07-24T09:20:00Z',
  }), /exactly 30 minutes/);

  assert.equal(restore.outputs.release_operation, '${{ steps.operation.outputs.release_operation }}');
  assert.equal(
    restore.outputs.standard_bound_artifact_run_id,
    '${{ steps.standard-identity.outputs.standard_bound_artifact_run_id }}',
  );
  assert.equal(
    restore.outputs.standard_bound_artifact_name,
    '${{ steps.standard-identity.outputs.standard_bound_artifact_name }}',
  );
  assert.match(reconcileRun, /requested_operation='\$\{\{ inputs\.operation \}\}'/);
  assert.match(reconcileRun, /case "\$requested_operation" in standard\|resume_standard/);
  assert.match(reconcileRun, /previous_operation_started_at="\$\(jq -er '[^']*operation_controls\.standard\.operation_started_at/);
  assert.match(reconcileRun, /previous_operation_deadline_at="\$\(jq -er '[^']*operation_controls\.standard\.operation_deadline_at/);
  assert.match(reconcileRun, /deadline_elapsed[^]*release_operation=resume_standard/);
  assert.match(reconcileRun, /operation_started_at='\$\{\{ inputs\.operation_started_at \}\}'/);
  assert.match(reconcileRun, /operation_deadline_at='\$\{\{ inputs\.operation_deadline_at \}\}'/);
  assert.match(reconcileRun, /operation-status-after-admit\.json/);
  assert.match(reconcileRun, /operation-admit-result\.json[^]*checkpoint export/);
  assert.match(reconcileRun, /echo "release_operation=\$release_operation"/);
  assert.match(reconcileRun, /echo "operation_started_at=\$operation_started_at"/);
  assert.match(reconcileRun, /echo "operation_deadline_at=\$operation_deadline_at"/);

  const publish = workflow.jobs['publish-standard-nonlatest'];
  const frozenAppCheckout = workflowStep(
    '_release-standard-publish.yml',
    'publish-standard-nonlatest',
    'Checkout frozen App content',
  );
  const releaseExecutorCheckout = workflowStep(
    '_release-standard-publish.yml',
    'publish-standard-nonlatest',
    'Checkout canonical App executor',
  );
  assert.equal(frozenAppCheckout.with.ref, '${{ needs.restore.outputs.app_ref }}');
  assert.equal(frozenAppCheckout.with.path, 'app-source');
  assert.equal(releaseExecutorCheckout.with.ref, '${{ github.sha }}');
  assert.equal(releaseExecutorCheckout.with.path, 'app-executor');
  assert.notEqual(frozenAppCheckout.with.ref, releaseExecutorCheckout.with.ref);
  const controlExecutorResolution = String(workflowStep(
    '_release-standard-publish.yml',
    'publish-standard-nonlatest',
    'Resolve immutable Stable control executor',
  ).run);
  assert.match(controlExecutorResolution, /actions\/runs\/\$control_run_id/);
  assert.match(controlExecutorResolution, /\.path == "\.github\/workflows\/release-stable\.yml"/);
  assert.match(controlExecutorResolution, /\.event == "workflow_dispatch"/);
  assert.match(controlExecutorResolution, /\.head_branch == "main"/);
  assert.match(controlExecutorResolution, /\.run_attempt == 1/);
  const controlExecutorCheckout = workflowStep(
    '_release-standard-publish.yml',
    'publish-standard-nonlatest',
    'Checkout immutable Stable control executor',
  );
  assert.equal(controlExecutorCheckout.with.ref, '${{ steps.control-executor.outputs.app_sha }}');
  assert.equal(controlExecutorCheckout.with.path, 'control-executor');
  assert.equal(
    workflowStep(
      '_release-standard-publish.yml',
      'publish-standard-nonlatest',
      'Restore Standard checkpoint',
    ).uses,
    './app-executor/.github/actions/restore-release-checkpoint',
  );

  const controlVerification = String(workflowStep(
    '_release-standard-publish.yml',
    'publish-standard-nonlatest',
    'Bind consumed Stable operation control into the immutable carrier',
  ).run);
  assert.match(controlVerification, /app-executor\/scripts\/stable-operation-control\.ts verify/);
  assert.match(controlVerification, /--app-root control-executor/);
  assert.doesNotMatch(controlVerification, /app-source\/scripts\//);

  const publicationControl = String(workflowStep(
    '_release-standard-publish.yml',
    'publish-standard-nonlatest',
    'Publish only missing Standard bytes',
  ).run);
  for (const script of [
    'release-operation-deadline.ts',
    'framework-release-adapter.ts',
    'stable-operation-publication-record.ts',
    'write-release-attestation.ts',
  ]) {
    assert.ok(
      publicationControl.includes(`app-executor/scripts/${script}`),
      `${script} is not bound to the canonical release executor checkout`,
    );
  }
  assert.doesNotMatch(publicationControl, /node[^\n]*app-source\/scripts\//);
  assert.deepEqual(
    [...publicationControl.matchAll(/app-source\/scripts\/(install-docker-webui\.(?:sh|ps1))/g)]
      .map((match) => match[1])
      .sort(),
    ['install-docker-webui.ps1', 'install-docker-webui.sh'],
  );
  assert.match(publicationControl, /standard-build-receipt\.json > planned-payload-assets\.json/);
  assert.match(publicationControl, /\.tracks\.standard\.required_asset_names as \$required/);
  assert.doesNotMatch(
    publicationControl,
    /jq '\{assets: \(\.release_bundle_publish\.receipt\.details\.upload_actions/,
  );
  assert.match(publicationControl, /gh release download '[^']+'[^]*--pattern opl-release-attestation\.json/);
  assert.match(publicationControl, /remote_attestation_sha[^]*shasum -a 256 "\$downloaded_attestation"/);
  assert.match(
    publicationControl,
    /cmp expected-publication-record\.canonical\.json attested-publication-record\.canonical\.json/,
  );
  assert.match(
    publicationControl,
    /standard-recovery-payload-actions\.json[^]*standard-publication-upload-actions\.json/,
  );

  const standardPublicationSource = readWorkflow('_release-standard-publish.yml');
  assert.doesNotMatch(
    standardPublicationSource,
    /immutable-releases|github-release-immutability-setting|restore-repository-immutability/,
  );
  assert.equal(parseWorkflow('_release-standard-publish.yml').jobs['restore-repository-immutability'], undefined);

  const boundEvidenceDownload = (publish.steps ?? []).find(
    (step: Record<string, unknown>) => step.name === 'Download internal Standard trust evidence',
  );
  assert.equal(
    boundEvidenceDownload?.with?.name,
    '${{ needs.restore.outputs.standard_bound_artifact_name }}',
  );
  assert.equal(
    boundEvidenceDownload?.with?.['run-id'],
    '${{ needs.restore.outputs.standard_bound_artifact_run_id }}',
  );
  assert.match(
    source,
    /producer_run_id="\$\(jq -er '\.source\.run_id \| strings \| select\(test\("\^\[1-9\]\[0-9\]\*\$"\)\)' "\$identity_receipt"\)"/,
  );
  assert.match(source, /standard_bound_artifact_name=opl-release-standard-bound-\$producer_run_id/);
  assert.doesNotMatch(
    JSON.stringify(boundEvidenceDownload),
    /needs\.restore\.outputs\.source_run_id/,
  );
  assert.match(
    source,
    /publication_record_args\+=\(--authority-run-id '\$\{\{ needs\.restore\.outputs\.standard_bound_artifact_run_id \}\}'\)/,
  );
  assert.doesNotMatch(
    source,
    /publication_record_args\+=\(--authority-run-id '\$\{\{ needs\.restore\.outputs\.source_run_id \}\}'\)/,
  );

  for (const jobId of [
    'publish-standard-nonlatest',
    'remote-digest-verify',
    'publish-homebrew-standard',
  ]) {
    const jobSource = JSON.stringify(workflow.jobs[jobId]);
    assert.match(jobSource, /needs\.restore\.outputs\.release_operation/);
    assert.doesNotMatch(jobSource, /inputs\.operation/);
  }

  assert.match(source, /test "\$\(jq -r \.rebuild_performed <<<"\$CHECKPOINT_IMPORT"\)" = false/);
  assert.doesNotMatch(source, /uses:\s*\.\/\.github\/workflows\/_release-bundle\.yml/);
  assert.doesNotMatch(source, /opl release (?:freeze|build|verify)\b/);
});

test('Standard publication materializes the complete frozen payload when the Framework upload delta is empty or partial', () => {
  const publicationControl = String(workflowStep(
    '_release-standard-publish.yml',
    'publish-standard-nonlatest',
    'Publish only missing Standard bytes',
  ).run);
  const startMarker = '# START complete-standard-payload-materialization';
  const endMarker = '# END complete-standard-payload-materialization';
  const start = publicationControl.indexOf(startMarker);
  const end = publicationControl.indexOf(endMarker);
  assert.notEqual(start, -1);
  assert.ok(end > start);
  const materialize = publicationControl.slice(start + startMarker.length, end);

  const runFixture = (options: {
    plannedNames?: string[];
    requiredNames?: string[];
    corruptAsset?: string;
  } = {}) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-complete-payload-'));
    const assetsDir = path.join(root, 'standard-assets');
    fs.mkdirSync(assetsDir);
    const identities = [
      { name: 'zeta.bin', bytes: Buffer.from('zeta payload\n') },
      { name: 'alpha.json', bytes: Buffer.from('{"alpha":true}\n') },
    ].map(({ name, bytes }) => {
      fs.writeFileSync(path.join(assetsDir, name), bytes);
      return {
        name,
        size_bytes: bytes.length,
        sha256: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
      };
    });
    if (options.corruptAsset) {
      fs.appendFileSync(path.join(assetsDir, options.corruptAsset), 'corrupt');
    }
    fs.writeFileSync(
      path.join(root, 'standard-build-receipt.json'),
      `${JSON.stringify({ assets: identities })}\n`,
    );
    fs.writeFileSync(
      path.join(root, 'release-bundle.json'),
      `${JSON.stringify({
        tracks: {
          standard: {
            required_asset_names: options.requiredNames ?? identities.map(({ name }) => name),
          },
        },
      })}\n`,
    );
    fs.writeFileSync(
      path.join(root, 'publish-plan.json'),
      `${JSON.stringify({
        release_bundle_publish: {
          receipt: {
            details: {
              upload_actions: (options.plannedNames ?? []).map((name) => ({ name })),
            },
          },
        },
      })}\n`,
    );
    const result = spawnSync('bash', ['-e', '-u', '-o', 'pipefail', '-c', [
      'bundle=release-bundle.json',
      `standard_assets_dir=${JSON.stringify(assetsDir)}`,
      materialize,
    ].join('\n')], { cwd: root, encoding: 'utf8' });
    const readOutput = (name: string) => {
      const output = path.join(root, name);
      return fs.existsSync(output) && fs.statSync(output).size > 0
        ? JSON.parse(fs.readFileSync(output, 'utf8'))
        : null;
    };
    return {
      root,
      result,
      identities,
      plannedPayload: readOutput('planned-payload-assets.json'),
      recoveryActions: readOutput('standard-recovery-payload-actions.json'),
    };
  };

  const emptyDelta = runFixture();
  try {
    assert.equal(emptyDelta.result.status, 0, emptyDelta.result.stderr);
    assert.deepEqual(
      emptyDelta.plannedPayload.assets.map((asset: Record<string, unknown>) => asset.name),
      ['alpha.json', 'zeta.bin'],
    );
    assert.deepEqual(
      emptyDelta.recoveryActions.upload_actions.map((action: Record<string, unknown>) => action.name),
      ['zeta.bin', 'alpha.json'],
    );
  } finally {
    fs.rmSync(emptyDelta.root, { recursive: true, force: true });
  }

  const partialDelta = runFixture({ plannedNames: ['zeta.bin'] });
  try {
    assert.equal(partialDelta.result.status, 0, partialDelta.result.stderr);
    assert.deepEqual(
      partialDelta.recoveryActions.upload_actions.map((action: Record<string, unknown>) => action.name),
      ['alpha.json'],
    );
  } finally {
    fs.rmSync(partialDelta.root, { recursive: true, force: true });
  }

  for (const invalid of [
    runFixture({ requiredNames: ['zeta.bin'] }),
    runFixture({ corruptAsset: 'alpha.json' }),
    runFixture({ plannedNames: ['zeta.bin', 'zeta.bin'] }),
  ]) {
    try {
      assert.notEqual(invalid.result.status, 0, 'invalid frozen payload evidence passed');
    } finally {
      fs.rmSync(invalid.root, { recursive: true, force: true });
    }
  }
});

test('checkpoint state lineage remains Framework-owned while App exposes transport provenance only', () => {
  for (const name of ['_release-bundle.yml', '_release-standard-publish.yml', '_release-full-addon.yml']) {
    const workflow = parseWorkflow(name);
    const inputs = workflow.on.workflow_call.inputs;
    const outputs = workflow.on.workflow_call.outputs;
    for (const field of [...transportProvenanceFields, ...frameworkOwnedLineageFields]) {
      assert.equal(inputs[field], undefined, `${name} must not accept operator-supplied ${field}`);
    }
    for (const field of transportProvenanceFields) {
      assert.ok(outputs[field], `${name} must expose ${field}`);
    }
    for (const field of frameworkOwnedLineageFields) {
      assert.equal(outputs[field], undefined, `${name} must not project Framework-owned ${field}`);
    }
    assert.match(readWorkflow(name), new RegExp(minimumCompatibleFrameworkAbiRef));
    assert.match(readWorkflow(name), new RegExp(rejectedBundle));
  }

  const bundleSource = readWorkflow('_release-bundle.yml');
  assert.match(bundleSource, /standard-build-receipt\.json/);
  assert.match(bundleSource, /checkpoint_transport_executor=github_actions/);
  const fullSource = readWorkflow('_release-full-addon.yml');
  assert.match(fullSource, /standard-build-receipt\.json/);
  assert.match(fullSource, /full-build-receipt\.json/);
  assert.doesNotMatch(readWorkflow('_release-standard-publish.yml'), /bound_standard_v1|checkpoint-migration/);

  const action = fs.readFileSync(path.join(process.cwd(), '.github', 'actions', 'restore-release-checkpoint', 'action.yml'), 'utf8');
  assert.match(action, /rebuild_performed/);
  assert.match(action, /publish_state_imported/);
  assert.match(action, /opl release checkpoint import/);
  assert.match(action, /opl release status/);
  assert.doesNotMatch(action, /standard-build-receipt\.json|full-build-receipt\.json/);
  for (const field of transportProvenanceFields) assert.match(action, new RegExp(field));
  for (const field of frameworkOwnedLineageFields) assert.doesNotMatch(action, new RegExp(field));
});

test('completed Full stages skip work already proven by the checkpoint', () => {
  const full = parseWorkflow('_release-full-addon.yml');
  assert.match(String(full.jobs['full-build'].if), /standard_qualified/);
  assert.match(String(full.jobs['materialize-full-build'].if), /full_built/);
  assert.match(String(full.jobs['full-qualification'].if), /standard_qualified/);
  assert.match(String(full.jobs['full-qualification'].if), /full_built/);
  assert.match(String(full.jobs['checkpoint-full'].if), /needs\.full-build\.result == 'success'/);
  assert.match(String(full.jobs['checkpoint-full'].if), /needs\.materialize-full-build\.result == 'success'/);
  assert.match(String(full.jobs['checkpoint-full'].if), /needs\.restore-standard\.outputs\.completed_stage == 'full_built'/);
  assert.doesNotMatch(String(full.jobs['checkpoint-full'].if), /needs\.full-qualification\.result == 'success'/);
  assert.match(String(full.jobs.provenance.if), /full_qualified/);
  assert.match(String(full.jobs['publish-full'].if), /completed_stage == 'full_qualified'/);

  const bind = full.jobs['checkpoint-full'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Bind Full bytes and export additive checkpoint',
  );
  const run = String(bind?.run ?? '');
  assert.match(run, /standard_qualified\)/);
  assert.match(run, /full_built\)/);
  assert.match(run, /cp "\$original_full_receipt" full-build-receipt\.json/);
  assert.equal((run.match(/opl release build/g) ?? []).length, 1);
  assert.match(run, /--hosted-core-qualification "\$hosted_receipt"/);
  assert.match(run, /standard-clean-vm-qualification-receipt\.json/);
  assert.match(run, /full-clean-vm-qualification-receipt\.json/);
  assert.match(run, /Full clean-VM qualification digest mismatch/);
  assert.match(run, /if \[ "\$QUALIFICATION_COMPLETE" = true \]/);
  assert.match(run, /checkpoint export/);
  assert.doesNotMatch(run, /--legacy-qualification/);
  const qualification = full.jobs['full-qualification'];
  assert.equal(qualification['runs-on'], 'macos-latest');
  assert.equal(qualification.uses, undefined);
  assert.deepEqual(qualification.permissions, { contents: 'read', actions: 'read' });
  const qualificationRun = qualification.steps
    .map((step: Record<string, unknown>) => String(step.run ?? ''))
    .join('\n');
  assert.match(qualificationRun, /hdiutil attach "\$dmg_path" -nobrowse -readonly/);
  assert.match(qualificationRun, /codesign --verify --deep --strict/);
  assert.match(qualificationRun, /xcrun stapler validate/);
  assert.match(qualificationRun, /spctl --assess/);
  assert.doesNotMatch(qualificationRun, /opl-first-run-vm|tart\b/i);
  const cleanVmQualification = full.jobs['full-clean-vm-qualification'];
  assert.equal(cleanVmQualification.uses, './.github/workflows/opl-first-run-vm.yml');
  assert.deepEqual(cleanVmQualification.needs, [
    'restore-standard',
    'full-build',
    'materialize-full-build',
    'full-qualification',
  ]);
  assert.equal(cleanVmQualification.with.package_profile, 'full');
  assert.equal(cleanVmQualification.with.diagnostic_scope, 'release_gate');
  assert.equal(
    cleanVmQualification.with.verification_app_ref,
    "${{ inputs.smoke_harness_ref != '' && github.sha || inputs.full_content_app_ref }}",
  );
  assert.equal(
    cleanVmQualification.with.smoke_harness_ref,
    '${{ inputs.smoke_harness_ref || inputs.full_content_shell_ref }}',
  );
  assert.equal(cleanVmQualification.secrets, 'inherit');
  const reusableFullVerification = workflowStep(
    '_release-full-addon.yml',
    'materialize-full-build',
    'Verify reusable Full bytes and failed-run identity',
  );
  assert.equal(reusableFullVerification.env.SMOKE_HARNESS_REF, '${{ inputs.smoke_harness_ref }}');
  const reusableFullVerificationRun = String(reusableFullVerification.run);
  assert.match(
    reusableFullVerificationRun,
    /\.retry\.disposition == "same_artifact_retry_allowed"\s+or \(\$smoke_harness_ref != "" and \.retry\.disposition == "new_cohort_required"\)/,
  );
  assert.match(
    reusableFullVerificationRun,
    /artifact_producer_run_id=.*\.actions\.run_id/,
  );
  assert.match(
    reusableFullVerificationRun,
    /\.identity\.source_artifact_run_id == \$producer_run_id/,
  );
  assert.match(
    reusableFullVerificationRun,
    /\.retry\.disposition == "reconcile_only"[\s\S]*\.failure == \{type:"none",boundary:"passed",classification:"passed"\}[\s\S]*\.evidence\.strict_qualification_receipt_sha256/,
  );
  assert.match(
    reusableFullVerificationRun,
    /\.evidence\.scope_proof\.classification == "harness_mechanics_only"[\s\S]*\.evidence\.scope_proof\.artifact_semantic_digest == \$semantic_digest/,
  );
  assert.equal(
    full.jobs['materialize-full-build'].outputs.artifact_producer_run_id,
    '${{ steps.full_source.outputs.artifact_producer_run_id }}',
  );
  assert.equal(
    cleanVmQualification.with.release_artifact_run_id,
    '${{ needs.materialize-full-build.outputs.artifact_producer_run_id || github.run_id }}',
  );
  const checkpointFull = full.jobs['checkpoint-full'];
  const checkpointFullRun = checkpointFull.steps
    .map((step: Record<string, unknown>) => String(step.run ?? ''))
    .join('\n');
  assert.match(
    checkpointFullRun,
    /--arg source_artifact_run_id '\$\{\{ needs\.materialize-full-build\.outputs\.artifact_producer_run_id \|\| github\.run_id \}\}'/,
  );
  assert.match(readWorkflow('_release-full-addon.yml'), /rebuild_performed/);
});

test('mandatory publication ancestors allow only the protected exact-candidate clean-install gates', () => {
  const releaseContract = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'contracts', 'app-release-channel.json'), 'utf8'),
  );
  const vmGates = releaseContract.release_acceleration.vm_gates;
  assert.deepEqual(
    vmGates.map((gate: Record<string, unknown>) => gate.id),
    [
      'standard_dmg_clean_vm_smoke',
      'homebrew_standard_cask_clean_vm_smoke',
      'full_dmg_clean_vm_smoke',
    ],
  );
  const gatesById = Object.fromEntries(vmGates.map((gate: Record<string, unknown>) => [gate.id, gate]));
  for (const gateId of ['standard_dmg_clean_vm_smoke', 'full_dmg_clean_vm_smoke']) {
    const gate = gatesById[gateId];
    assert.equal(gate.diagnostic_scope, 'release_gate');
    assert.equal(gate.gate_policy, 'required_prepublication_same_candidate');
    assert.ok(Array.isArray(gate.certification_readiness));
    assert.deepEqual(gate.release_blocking_readiness, [
      'gateway_account_login',
      'official_profile_first_install',
      'fresh_framework_agent_projection',
    ]);
  }
  assert.equal(
    gatesById.homebrew_standard_cask_clean_vm_smoke.diagnostic_scope,
    'post_publication_optional_certification',
  );
  assert.equal(
    gatesById.homebrew_standard_cask_clean_vm_smoke.gate_policy,
    'optional_non_blocking_same_published_artifact',
  );
  const stableValidation = releaseContract.release_validation_profiles.stable;
  assert.equal(stableValidation.addon_gate_blocking_standard_terminal, false);
  assert.equal(stableValidation.required_lanes.includes('standard_dmg_clean_vm_smoke'), true);
  assert.equal(stableValidation.addon_lanes.includes('full_dmg_clean_vm_smoke'), true);
  assert.deepEqual(stableValidation.same_candidate_prepublication_clean_install_gates, [
    'standard_dmg_clean_vm_smoke',
    'full_dmg_clean_vm_smoke',
  ]);
  assert.equal(
    stableValidation.post_publication_optional_certification_surfaces.includes('full_dmg_clean_vm_smoke'),
    false,
  );

  const standard = parseWorkflow('_release-standard-publish.yml');
  const publish = standard.jobs['publish-standard-nonlatest'];
  const homebrew = standard.jobs['publish-homebrew-standard'];
  const latest = standard.jobs['activate-latest'];

  const ancestors = (jobName: string): string[] => {
    const found = new Set<string>();
    const visit = (name: string) => {
      for (const dependency of standard.jobs[name]?.needs ?? []) {
        if (!found.has(dependency)) {
          found.add(dependency);
          visit(dependency);
        }
      }
    };
    visit(jobName);
    return [...found].sort();
  };
  for (const jobName of ['publish-standard-nonlatest', 'remote-digest-verify', 'publish-homebrew-standard']) {
    for (const ancestor of ancestors(jobName)) {
      assert.doesNotMatch(
        JSON.stringify(standard.jobs[ancestor]),
        /self-hosted|(?:^|[^a-z])tart(?:[^a-z]|$)|opl-first-run-vm/i,
        `${jobName} directly depends on unexpected physical execution ${ancestor}`,
      );
    }
  }
  assert.deepEqual(publish.needs, ['restore', 'pre-publication-admission']);
  assert.ok(homebrew.needs.includes('remote-digest-verify'));
  assert.equal(
    latest.if,
    "${{ needs.restore.result == 'success' && needs.remote-digest-verify.result == 'success' }}",
  );
  assert.deepEqual(latest.needs, ['restore', 'remote-digest-verify', 'homebrew-standard-readback']);
  const full = parseWorkflow('_release-full-addon.yml');
  const fullAncestors = (jobName: string): string[] => {
    const found = new Set<string>();
    const visit = (name: string) => {
      const needs = full.jobs[name]?.needs;
      for (const dependency of typeof needs === 'string' ? [needs] : needs ?? []) {
        if (!found.has(dependency)) {
          found.add(dependency);
          visit(dependency);
        }
      }
    };
    visit(jobName);
    return [...found].sort();
  };
  assert.ok(fullAncestors('publish-full').includes('full-qualification'));
  assert.ok(fullAncestors('publish-full').includes('full-clean-vm-qualification'));
  const fullPhysicalAncestors = fullAncestors('publish-full').filter((ancestor) =>
    /self-hosted|(?:^|[^a-z])tart(?:[^a-z]|$)|opl-first-run-vm/i.test(JSON.stringify(full.jobs[ancestor])),
  );
  assert.deepEqual(fullPhysicalAncestors, ['full-clean-vm-qualification']);
  const bundle = parseWorkflow('_release-bundle.yml');
  assert.equal(bundle.jobs['standard-clean-vm-qualification'].uses, './.github/workflows/opl-first-run-vm.yml');
  assert.deepEqual(bundle.jobs['checkpoint-standard'].needs, [
    'admission',
    'freeze',
    'seal-standard-identity',
    'standard-clean-vm-qualification',
  ]);
  assert.equal(standard.jobs['updater-upgrade-qualification'], undefined);
  assert.equal(standard.jobs['updater-upgrade-qualification-highest'], undefined);
  assert.equal(standard.jobs['homebrew-standard-vm'], undefined);
  assert.match(readWorkflow('_release-standard-publish.yml'), /highest_public_stable/);
  assert.doesNotMatch(readWorkflow('_release-bundle.yml'), /resolveStableReleaseVersion/);
  assert.match(readWorkflow('_release-bundle.yml'), /resolvePreviewReleaseVersion/);
  assert.match(readWorkflow('_release-bundle.yml'), /stableAdmissionManifestDigest/);
  assert.match(readWorkflow('_release-bundle.yml'), /ghcr\.io\/token\?scope=repository:gaofeng21cn\/one-person-lab-webui:pull/);
  assert.match(readWorkflow('_release-bundle.yml'), /ghcr\.io\/v2\/gaofeng21cn\/one-person-lab-webui\/manifests/);
  assert.doesNotMatch(readWorkflow('_release-bundle.yml'), /PUBLISHED_WEBUI_TAGS_TXT/);
  assert.match(readWorkflow('_release-bundle.yml'), /--published-releases-json/);

  const updater = readWorkflow('opl-updater-upgrade-vm.yml');
  assert.match(updater, /candidate_zip_size/);
  assert.match(updater, /candidate_zip_sha256/);
  assert.match(updater, /tracks\/standard\/assets\.json/);
  assert.match(updater, /candidate ZIP entry must be unique/);
  assert.match(updater, /sha256:\$candidate_zip_sha256.*\$checkpoint_zip_sha256/);
  assert.match(updater, /candidate_zip_size.*checkpoint_zip_size/);
  assert.match(updater, /metadata_declared_sha512/);
  assert.match(updater, /metadata_declared_size/);
  assert.match(updater, /same_candidate_zip_downloaded/);
  assert.match(updater, /find candidate -type f -name latest-mac\.yml/);
  assert.match(updater, /find candidate -type f -name latest-arm64-mac\.yml/);
  assert.match(updater, /cmp -s "\$metadata" "\$compatibility_metadata"/);

  const fingerprint = String(workflowStep(
    'opl-updater-upgrade-vm.yml',
    'upgrade',
    'Download and fingerprint the installed predecessor',
  ).run);
  const metadataParser = fingerprint.match(
    /metadata_json="\$\(ruby -ryaml -rjson -e '\n([\s\S]*?)\n\s*' "\$metadata" "\$\(basename "\$zip"\)"\)"/,
  )?.[1];
  assert.ok(metadataParser, 'updater metadata parser is missing');
  assert.match(
    metadataParser,
    /YAML\.safe_load\(File\.read\(ARGV\[0\]\), permitted_classes: \[Time\], aliases: true\)/,
  );
  assert.match(metadataParser, /File\.basename\(candidate\["url"\]\.to_s\) == name/);
  assert.match(fingerprint, /Candidate ZIP SHA-256 does not match tracks\/standard\/assets\.json/);
  assert.match(fingerprint, /Candidate ZIP size does not match tracks\/standard\/assets\.json/);
  assert.match(fingerprint, /Updater metadata SHA-512 does not match candidate ZIP/);
  assert.match(fingerprint, /Updater metadata size does not match candidate ZIP/);

  const metadataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-updater-time-metadata-'));
  const zipName = 'One-Person-Lab-26.7.26-mac-arm64.zip';
  const metadataPath = path.join(metadataRoot, 'latest-arm64-mac.yml');
  try {
    fs.writeFileSync(metadataPath, [
      'version: 26.7.2600',
      'releaseDate: 2026-07-25T21:29:28Z',
      'files:',
      `  - url: ${zipName}`,
      '    sha512: updater-sha512',
      '    size: 465998660',
      '',
    ].join('\n'));
    const parsedMetadata = spawnSync('ruby', [
      '-ryaml',
      '-rjson',
      '-e',
      metadataParser,
      metadataPath,
      zipName,
    ], { encoding: 'utf8' });
    assert.equal(parsedMetadata.status, 0, parsedMetadata.stderr);
    assert.deepEqual(JSON.parse(parsedMetadata.stdout), {
      sha512: 'updater-sha512',
      size: 465998660,
      url: zipName,
    });
  } finally {
    fs.rmSync(metadataRoot, { recursive: true, force: true });
  }

  const sha512Command = fingerprint.match(/^\s*actual_sha512="\$\((.+)\)"$/m)?.[1];
  assert.ok(sha512Command, 'updater SHA-512 calculation is missing');
  assert.match(sha512Command, /openssl dgst -sha512 -binary "\$zip" \| base64 \| awk '\{printf "%s", \$0\}'/);

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-updater-sha512-'));
  const fixture = path.join(fixtureRoot, 'candidate.zip');
  fs.writeFileSync(fixture, 'opl-updater-sha512-regression-2\n');
  const expected = crypto.createHash('sha512').update(fs.readFileSync(fixture)).digest('base64');
  assert.ok(expected.includes('n'), 'regression fixture must exercise lowercase n in the Base64 alphabet');
  const calculated = spawnSync('/bin/bash', ['-c', [
    'set -euo pipefail',
    `zip=${JSON.stringify(fixture)}`,
    `actual_sha512="$(${sha512Command})"`,
    'printf %s "$actual_sha512"',
  ].join('\n')], { encoding: 'utf8' });
  assert.equal(calculated.status, 0, calculated.stderr);
  assert.equal(calculated.stdout, expected);
});
