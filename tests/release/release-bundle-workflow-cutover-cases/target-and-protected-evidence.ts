import test from 'node:test';
import {
  assert,
  fs,
  path,
  parseYaml,
  resolveGithubReleaseCommit,
  createGithubOwnerReleaseNamespaceEvidence,
  readWorkflow,
  parseWorkflow,
  workflowStep,
  runExpectedImmutableReleaseAssetsBuilder,
  runAdmissionGate,
  runStableRestoreVersionIdentity,
} from "./fixtures.ts";

test('Latest target_commitish resolves immutable commit identity from SHA, branch, or tag', () => {
  const appSha = 'a'.repeat(40);
  const tagSha = 'b'.repeat(40);
  const calls: string[] = [];
  const api = (request: string): unknown => {
    calls.push(request);
    const responses: Record<string, unknown> = {
      'repos/test/repo/git/ref/tags/v-release': { object: { type: 'commit', sha: appSha } },
      'repos/test/repo/git/ref/heads/main': { object: { type: 'commit', sha: tagSha } },
      'repos/test/repo/git/ref/tags/v1': { object: { type: 'commit', sha: tagSha } },
      'repos/test/repo/git/ref/heads/annotated': { object: { type: 'tag', sha: 'c'.repeat(40) } },
      [`repos/test/repo/git/tags/${'c'.repeat(40)}`]: { object: { type: 'commit', sha: tagSha } },
    };
    if (request in responses) return responses[request];
    throw new Error('HTTP 404');
  };
  const previousRepository = process.env.GITHUB_REPOSITORY;
  process.env.GITHUB_REPOSITORY = 'test/repo';
  try {
    assert.equal(resolveGithubReleaseCommit(appSha, 'v-release', api), appSha);
    assert.equal(resolveGithubReleaseCommit('main', 'v-release', api), appSha);
    assert.equal(resolveGithubReleaseCommit('v1', 'v-release', api), appSha);
    assert.equal(resolveGithubReleaseCommit('annotated', 'v-release', api), appSha);
    assert.deepEqual(calls, [
      'repos/test/repo/git/ref/tags/v-release',
      'repos/test/repo/git/ref/tags/v-release',
      'repos/test/repo/git/ref/heads/main',
      'repos/test/repo/git/ref/tags/main',
      'repos/test/repo/git/ref/tags/v-release',
      'repos/test/repo/git/ref/heads/v1',
      'repos/test/repo/git/ref/tags/v1',
      'repos/test/repo/git/ref/tags/v-release',
      'repos/test/repo/git/ref/heads/annotated',
      'repos/test/repo/git/tags/' + 'c'.repeat(40),
      'repos/test/repo/git/ref/tags/annotated',
    ]);
  } finally {
    if (previousRepository === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = previousRepository;
  }
});

test('Latest target_commitish rejects missing, ambiguous, and non-commit refs', () => {
  const appSha = 'a'.repeat(40);
  const otherSha = 'b'.repeat(40);
  const api = (request: string): unknown => {
    const responses: Record<string, unknown> = {
      'repos/test/repo/git/ref/tags/v-release': { object: { type: 'commit', sha: appSha } },
      'repos/test/repo/git/ref/heads/ambiguous': { object: { type: 'commit', sha: appSha } },
      'repos/test/repo/git/ref/tags/ambiguous': { object: { type: 'commit', sha: otherSha } },
      'repos/test/repo/git/ref/heads/same-target': { object: { type: 'commit', sha: appSha } },
      'repos/test/repo/git/ref/tags/same-target': { object: { type: 'commit', sha: appSha } },
      'repos/test/repo/git/ref/heads/tree': { object: { type: 'tree', sha: otherSha } },
    };
    if (request in responses) return responses[request];
    throw new Error('HTTP 404');
  };
  const previousRepository = process.env.GITHUB_REPOSITORY;
  process.env.GITHUB_REPOSITORY = 'test/repo';
  try {
    assert.throws(() => resolveGithubReleaseCommit('missing', 'v-release', api), /was not found/);
    assert.throws(() => resolveGithubReleaseCommit('ambiguous', 'v-release', api), /ambiguous/);
    assert.throws(() => resolveGithubReleaseCommit('same-target', 'v-release', api), /ambiguous/);
    assert.throws(() => resolveGithubReleaseCommit('tree', 'v-release', api), /must resolve to a commit object/);
    assert.throws(() => resolveGithubReleaseCommit('../invalid', 'v-release', api), /valid branch\/tag ref/);
    assert.throws(() => resolveGithubReleaseCommit(otherSha, 'v-release', api), /does not match/);
  } finally {
    if (previousRepository === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = previousRepository;
  }
});

test('Standard remote digest builder materializes expected mutable Standard assets without stdin', () => {
  const { result, output, expected } = runExpectedImmutableReleaseAssetsBuilder();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(output, expected);
});

test('active shell ancestry checks receive full history without broadening routine checkouts', () => {
  const setupAction = parseYaml(fs.readFileSync(
    path.join(process.cwd(), '.github', 'actions', 'setup-active-shell-deps', 'action.yml'),
    'utf8',
  ));
  assert.equal(setupAction.inputs['fetch-depth'].default, '1');
  const shellCheckout = setupAction.runs.steps.find(
    (step: Record<string, any>) => step.name === 'Checkout active shell',
  );
  assert.ok(shellCheckout);
  assert.equal(shellCheckout.with['fetch-depth'], '${{ inputs.fetch-depth }}');

  const workflow = parseWorkflow('_build-reusable.yml');
  const resolvedShellRef = '${{ needs.resolve-active-shell-ref.outputs.shell_sha }}';
  for (const [jobId, job] of Object.entries(workflow.jobs) as Array<[string, Record<string, any>]>) {
    const setup = job.steps?.find(
      (step: Record<string, any>) => step.uses === './.github/actions/setup-active-shell-deps',
    );
    if (!setup) continue;
    if (jobId === 'active-shell-tests') {
      assert.equal(setup.with['fetch-depth'], '0');
    } else {
      assert.equal(setup.with['fetch-depth'], undefined, `${jobId} must retain the shallow default`);
    }
    assert.equal(setup.with['shell-ref'], resolvedShellRef, `${jobId} must use the resolved immutable Shell SHA`);
  }
});

test('Stable and protected Manual Preview are isolated from daily-default Nightly and Canary', () => {
  const stable = parseWorkflow('release-stable.yml');
  const canary = parseWorkflow('release-bundle-canary.yml');
  const nightly = parseWorkflow('release-nightly.yml');

  assert.deepEqual(Object.keys(stable.on), ['workflow_dispatch']);
  assert.deepEqual(stable.on.workflow_dispatch.inputs.operation.options, [
    'standard',
    'resume_standard',
    'append_full',
  ]);
  assert.deepEqual(stable.on.workflow_dispatch.inputs.entry.options, [
    'framework_release',
    'studio_carrier_admission',
  ]);
  const mutationMutex = { group: 'opl-release-bundle-global', 'cancel-in-progress': false };
  assert.equal(stable.concurrency, undefined);
  assert.deepEqual(stable.jobs['resume-standard'].concurrency, mutationMutex);
  assert.deepEqual(Object.keys(canary.on).sort(), ['schedule', 'workflow_dispatch']);
  assert.deepEqual(canary.on.schedule, [{ cron: '0 13 * * *' }]);
  assert.equal(canary.on.workflow_dispatch, null);
  assert.deepEqual(canary.concurrency, {
    group: 'opl-release-validation-canary-${{ github.ref }}',
    'cancel-in-progress': true,
  });
  assert.deepEqual(Object.keys(nightly.on).sort(), ['schedule', 'workflow_dispatch']);
  assert.deepEqual(nightly.on.schedule, [{ cron: '17 19 * * *' }]);
  assert.deepEqual(Object.keys(nightly.on.workflow_dispatch.inputs), ['operator_confirmation']);
  assert.equal(nightly.on.workflow_dispatch.inputs.operator_confirmation.required, true);
  assert.equal(nightly.on.workflow_dispatch.inputs.operator_confirmation.type, 'string');
  assert.match(nightly['run-name'], /scheduled-production/);
  assert.match(nightly['run-name'], /development-validation/);
  assert.deepEqual(nightly.concurrency, {
    group: 'opl-standard-nightly',
    'cancel-in-progress': false,
  });
  assert.equal(nightly.jobs['standard-build'].uses, './.github/workflows/_build-reusable.yml');
  assert.equal(nightly.jobs['standard-build'].with.require_macos_gatekeeper, false);
  assert.equal(nightly.jobs['qualify-and-publish'].environment, 'release-nightly');
  assert.equal(stable.jobs.standard.uses, './.github/workflows/_release-bundle.yml');
  assert.equal(stable.jobs['resume-standard'].uses, './.github/workflows/_release-standard-publish.yml');
  assert.equal(stable.jobs['append-full'].uses, './.github/workflows/_release-full-addon.yml');
  assert.equal(
    stable.jobs['append-full'].if,
    "${{ !cancelled() && inputs.operation == 'append_full' && needs.admission.result == 'success' }}",
  );
  assert.equal(
    Object.hasOwn(stable.jobs['resume-standard'].with, 'qualified_native_artifact_name'),
    false,
  );
  assert.equal(
    Object.hasOwn(stable.jobs['resume-standard'].with, 'qualified_native_source_run_id'),
    false,
  );
  assert.equal(stable.jobs['resume-standard'].with.operation_started_at, '${{ needs.admission.outputs.operation_started_at }}');
  assert.equal(stable.jobs['resume-standard'].with.operation_deadline_at, '${{ needs.admission.outputs.operation_deadline_at }}');
  const stableSource = readWorkflow('release-stable.yml');
  assert.doesNotMatch(stableSource, /Native carrier identity|resume-standard-carrier|qualified_native_/);
  assert.match(stableSource, /if \[ "\$OPERATION" = standard \] \|\| \[ "\$OPERATION" = resume_standard \] \|\| \[ "\$OPERATION" = append_full \]; then[\s\S]*actions\/runs\/\$GITHUB_RUN_ID" --jq \.created_at/);
  assert.match(stableSource, /--started-at "\$operation_created_at"/);
  assert.match(stableSource, /operation_started_at="\$\(jq -er \.started_at release-operation-admission\.json\)"/);
  assert.match(stableSource, /operation_deadline_at="\$\(jq -er \.deadline_at release-operation-admission\.json\)"/);
  assert.doesNotMatch(stableSource, /operation_started_at="\$\(timeout[\s\S]*actions\/runs\/\$GITHUB_RUN_ID/);
  assert.doesNotMatch(stableSource, /steps\.admission\.outputs\.operation != 'resume_standard'/);
  assert.doesNotMatch(stableSource, /run_started_at/);
  const bundleSource = readWorkflow('_release-bundle.yml');
  assert.match(bundleSource, /stable:stable\|preview:preview/);
  assert.match(bundleSource, /stable_does_not_use_preview_override/);
  assert.doesNotMatch(bundleSource, /nightly:nightly/);
  assert.doesNotMatch(bundleSource, /resolveNightlyReleaseVersion|nightly-operation-request/);
  const standardPublishSource = readWorkflow('_release-standard-publish.yml');
  assert.match(standardPublishSource, /reason=unsupported_publication_channel/);
  assert.doesNotMatch(standardPublishSource, /^\s*nightly-terminal:/m);
  const bundle = parseWorkflow('_release-bundle.yml');
  const fullAddon = parseWorkflow('_release-full-addon.yml');
  assert.deepEqual(bundle.jobs['publish-standard'].concurrency, mutationMutex);
  assert.deepEqual(fullAddon.jobs['publish-full'].concurrency, mutationMutex);
  assert.doesNotMatch(readWorkflow('_release-standard-publish.yml'), /opl-release-bundle-global/);
});

test('new Standard consumes frozen protected evidence before sealing its run-bound control', () => {
  const stable = parseWorkflow('release-stable.yml');
  assert.equal(stable.env.OPL_FRAMEWORK_RELEASE_ABI_REF, undefined);
  for (const input of ['authority_id', 'operation_id', 'authority_carrier', 'authority_digest']) {
    assert.equal(stable.on.workflow_dispatch.inputs[input].required, false);
    assert.equal(stable.on.workflow_dispatch.inputs[input].default, '');
  }
  assert.match(stable['run-name'], /inputs\.operation == 'standard'/);
  assert.match(
    stable['run-name'],
    /format\('OPL Stable standard operation:\{0\} authority:\{1\} run:\{2\}', inputs\.operation_id, inputs\.authority_id, github\.run_id\)/,
  );
  assert.match(stable['run-name'], /format\('OPL Stable \{0\} \{1\}', inputs\.operation, github\.run_id\)/);
  assert.equal(stable.jobs['source-qualification'], undefined);
  assert.doesNotMatch(
    readWorkflow('release-stable.yml'),
    /uses:\s*\.\/\.github\/workflows\/release-source-qualification\.yml/,
  );
  assert.deepEqual(stable.jobs.admission.needs, ['protected-operation-admission']);
  assert.equal(stable.jobs.admission.if, "${{ always() && inputs.entry == 'framework_release' }}");
  const stableAdmission = String(stable.jobs.admission.steps.find(
    (step: Record<string, unknown>) => step.name === 'Admit one bounded Bundle operation',
  )?.run ?? '');
  assert.match(
    stableAdmission,
    /test -z "\$REQUESTED_VERSION\$REQUESTED_APP_REF\$REQUESTED_SHELL_REF\$REQUESTED_SMOKE_HARNESS_REF\$REQUESTED_FRAMEWORK_REF\$SOURCE_RUN_ID\$SOURCE_ARTIFACT\$PRIOR_FULL_ARTIFACT_RUN_ID"/,
  );
  assert.doesNotMatch(stableAdmission, /SOURCE_QUALIFICATION_RUN_ID="\$GITHUB_RUN_ID"/);
  assert.doesNotMatch(stableAdmission, /needs\.source-qualification/);
  assert.doesNotMatch(stableAdmission, /source-qualification-receipt\.ts verify/);
  assert.match(stableAdmission, /executor_sha="\$\(git -C app-executor rev-parse HEAD\)"/);
  assert.equal(
    stable.jobs.admission.steps.find(
      (step: Record<string, unknown>) => step.name === 'Checkout canonical App executor',
    )?.with?.path,
    'app-executor',
  );
  assert.match(stableAdmission, /APP_REF="\$executor_sha"/);
  assert.match(
    stableAdmission,
    /standard\)[\s\S]*APP_REF='\$\{\{ needs\.protected-operation-admission\.outputs\.app_ref \}\}'/,
  );
  assert.match(stableAdmission, /\[\[ "\$APP_REF" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  assert.doesNotMatch(
    stableAdmission,
    /test "\$(?:app_sha|executor_sha)" = '\$\{\{ needs\.protected-operation-admission\.outputs\.app_ref \}\}'/,
  );
  assert.match(stableAdmission, /echo "app_ref=\$APP_REF"/);
  assert.match(
    stableAdmission,
    /SHELL_REF='\$\{\{ needs\.protected-operation-admission\.outputs\.shell_ref \}\}'/,
  );
  assert.match(
    stableAdmission,
    /FRAMEWORK_SOURCE_REF='\$\{\{ needs\.protected-operation-admission\.outputs\.framework_ref \}\}'/,
  );
  assert.match(stableAdmission, /FRAMEWORK_EXECUTOR_REF="\$FRAMEWORK_SOURCE_REF"/);
  assert.doesNotMatch(stableAdmission, /canonical_(?:app|shell|framework)_sha/);
  assert.doesNotMatch(stableAdmission, /ls-remote/);
  assert.doesNotMatch(stableAdmission, /OPL_FRAMEWORK_(?:RELEASE|CHECKPOINT)_ABI_REF/);
  assert.match(stableAdmission, /resume_standard\|append_full\)[\s\S]*FRAMEWORK_EXECUTOR_REF="\$REQUESTED_FRAMEWORK_REF"/);
  assert.match(stableAdmission, /framework_ref=\$FRAMEWORK_SOURCE_REF/);
  assert.match(stableAdmission, /framework_executor_ref=\$FRAMEWORK_EXECUTOR_REF/);
  assert.doesNotMatch(
    stableAdmission.slice(stableAdmission.indexOf('resume_standard|append_full)')),
    /canonical_framework_sha|OPL_FRAMEWORK_RELEASE_ABI_REF/,
  );
  const protectedControl = stable.jobs['protected-operation-admission'];
  assert.equal(protectedControl.environment, 'release-stable');
  assert.equal(protectedControl.needs, undefined);
  assert.equal(protectedControl.steps.some(
    (step: Record<string, unknown>) => String(step.run ?? '').includes('stable-operation-control.ts materialize-evidence'),
  ), true);
  assert.equal(protectedControl.steps.some(
    (step: Record<string, unknown>) => String(step.run ?? '').includes('stable-operation-control.ts verify-executor'),
  ), true);
  assert.equal(protectedControl.steps.some(
    (step: Record<string, unknown>) => String(step.run ?? '').includes('release-dispatch-guard.ts preflight'),
  ), true);
  assert.equal(protectedControl.steps.some(
    (step: Record<string, unknown>) => String(step.run ?? '').includes('stable-operation-control.ts decode-carrier'),
  ), true);
  assert.equal(protectedControl.steps.some(
    (step: Record<string, unknown>) => String(step.run ?? '').includes('release-dispatch-guard.ts verify-evidence'),
  ), true);
  assert.equal(protectedControl.steps.some(
    (step: Record<string, unknown>) => String(step.run ?? '').includes('stable-operation-control.ts bind'),
  ), true);
  assert.equal(protectedControl.steps.some(
    (step: Record<string, unknown>) => String(step.run ?? '').includes('stable-operation-control.ts verify'),
  ), true);
  const protectedControlRun = protectedControl.steps
    .map((step: Record<string, unknown>) => String(step.run ?? ''))
    .join('\n');
  assert.doesNotMatch(
    protectedControlRun,
    /node --experimental-strip-types app-source\/scripts\/validate-release-source-gate\.ts/,
  );
  assert.equal(
    protectedControl.steps.find(
      (step: Record<string, unknown>) => step.name === 'Checkout frozen App authority cohort',
    )?.with?.ref,
    '${{ steps.authority.outputs.app_ref }}',
  );
  assert.match(protectedControlRun, /app_sha="\$\(git -C app-source rev-parse HEAD\)"/);
  assert.doesNotMatch(
    protectedControlRun,
    /--expected-app-sha "\$GITHUB_SHA"|test "\$app_sha" = "\$GITHUB_SHA"/,
  );
  const authorityStepIndex = protectedControl.steps.findIndex(
    (step: Record<string, unknown>) => String(step.run ?? '').includes('stable-operation-control.ts decode-carrier'),
  );
  const cohortCheckoutIndex = protectedControl.steps.findIndex(
    (step: Record<string, unknown>) => step.name === 'Checkout frozen Shell authority cohort',
  );
  assert.ok(authorityStepIndex >= 0 && authorityStepIndex < cohortCheckoutIndex);
  const stableSource = readWorkflow('release-stable.yml');
  assert.doesNotMatch(stableSource, /openssl rand/);
  assert.doesNotMatch(stableSource, /operation_id="stable-\$\{GITHUB_RUN_ID\}"/);
  assert.doesNotMatch(stableSource, /stable-operation-control\.ts create(?:\s|$)/);
  assert.doesNotMatch(
    String(protectedControl.steps.map((step: Record<string, unknown>) => step.run ?? '').join('\n')),
    /\$\{\{\s*inputs\./,
  );
  assert.match(stableSource, /--operation-id "\$OPERATION_ID"/);
  const bareStandard = runAdmissionGate(
    'release-stable.yml',
    'protected-operation-admission',
    'Reject bare or rerun Stable request before expensive work',
    { operation: 'standard', include_full: 'false' },
  );
  assert.notEqual(bareStandard.status, 0, 'a bare Standard dispatch must fail before any expensive job');
  assert.equal(protectedControl.steps.some(
    (step: Record<string, any>) => step.with?.name === 'opl-stable-operation-control-${{ github.run_id }}',
  ), true);
  const stableAdmissionManifest = stable.jobs['stable-admission-manifest'];
  assert.equal(stableAdmissionManifest.environment, 'release-stable');
  assert.deepEqual(stableAdmissionManifest.needs, ['admission', 'protected-operation-admission']);
  assert.equal(stableAdmissionManifest.steps.some(
    (step: Record<string, unknown>) => step.name === 'Verify protected Apple credentials in the Stable entry',
  ), true);
  assert.equal(stableAdmissionManifest.steps.some(
    (step: Record<string, unknown>) => String(step.run ?? '').includes('stable-release-admission-manifest.ts create'),
  ), true);
  assert.equal(
    stableAdmissionManifest.steps.find(
      (step: Record<string, unknown>) => step.name === 'Checkout frozen App product cohort',
    )?.with?.ref,
    '${{ needs.admission.outputs.app_ref }}',
  );
  const controlDownload = stableAdmissionManifest.steps.find(
    (step: Record<string, unknown>) => step.name === 'Download frozen pre-submit authority evidence',
  ) as Record<string, any>;
  assert.equal(
    controlDownload.with.name,
    'opl-stable-operation-control-${{ github.run_id }}',
  );
  const manifestSeal = String(stableAdmissionManifest.steps.find(
    (step: Record<string, unknown>) => step.name === 'Seal one same-run Stable admission manifest',
  )?.run ?? '');
  assert.match(manifestSeal, /stable-operation-control\.ts verify/);
  assert.match(manifestSeal, /--source-gate "\$source_gate_path"/);
  assert.match(manifestSeal, /--pre-nonce-guard "\$\{pre_nonce_guards\[0\]\}"/);
  assert.match(manifestSeal, /--run-authority-reconcile "\$\{run_reconciles\[0\]\}"/);
  assert.match(manifestSeal, /stable-release-admission-manifest\.ts create[\s\S]*--source-gate "\$source_gate_path"/);
  assert.match(manifestSeal, /--app-source-root app-source/);
  assert.match(manifestSeal, /--failure-output "\$RUNNER_TEMP\/stable-release-admission-failure\.json"/);
  assert.doesNotMatch(manifestSeal, /--source-qualification-receipt/);
  assert.equal(stable.jobs.standard.needs.includes('protected-operation-admission'), true);
  assert.equal(stable.jobs.standard.needs.includes('stable-admission-manifest'), true);
  assert.equal(
    stable.jobs.standard.with.stable_operation_control_artifact,
    'opl-stable-operation-control-${{ github.run_id }}',
  );
  assert.equal(
    stable.jobs.standard.with.stable_admission_artifact,
    'opl-stable-admission-${{ github.run_id }}',
  );
  assert.equal(
    stable.jobs.standard.with.stable_admission_manifest_digest,
    '${{ needs.stable-admission-manifest.outputs.manifest_digest }}',
  );

  const standard = parseWorkflow('_release-standard-publish.yml');
  assert.equal(standard.on.workflow_call.inputs.framework_executor_ref.required, true);
  assert.equal(standard.on.workflow_call.inputs.framework_executor_ref.default, undefined);
  assert.equal(standard.on.workflow_call.inputs.mode, undefined);
  assert.equal(standard.env.OPL_FRAMEWORK_CANARY_MINIMUM_ABI_REF, undefined);
  const standardSource = readWorkflow('_release-standard-publish.yml');
  assert.match(standardSource, /Download checkpoint identity bootstrap/);
  assert.match(standardSource, /Resolve frozen Framework source and current executor identities/);
  assert.match(standardSource, /Framework executor must be an exact lowercase SHA/);

  const full = parseWorkflow('_release-full-addon.yml');
  assert.equal(full.on.workflow_call.inputs.framework_executor_ref.required, true);
  assert.equal(full.on.workflow_call.inputs.framework_executor_ref.default, undefined);
  assert.equal(full.on.workflow_call.inputs.mode, undefined);
  assert.equal(full.env.OPL_FRAMEWORK_CANARY_MINIMUM_ABI_REF, undefined);
  const fullSource = readWorkflow('_release-full-addon.yml');
  assert.match(fullSource, /Download checkpoint identity bootstrap/);
  assert.match(fullSource, /Resolve Bundle-bound Framework identity/);
  assert.match(fullSource, /framework_source_ref=.*sources\.framework\.source_commit/);
  assert.doesNotMatch(fullSource, /Checkpoint Framework source differs from the optional caller expectation/);
  assert.doesNotMatch(fullSource, /OPL_FRAMEWORK_CHECKPOINT_ABI/);

  const standardRestore = workflowStep(
    '_release-standard-publish.yml',
    'restore',
    'Restore portable checkpoint',
  );
  assert.equal(
    standardRestore.with['framework-executor-ref'],
    '${{ steps.framework-binding.outputs.framework_executor_ref }}',
  );
  const standardRestoreSteps = Object.values(standard.jobs)
    .flatMap((job: any) => job.steps ?? [])
    .filter((candidate: any) => [
      './app-source/.github/actions/restore-release-checkpoint',
      './app-executor/.github/actions/restore-release-checkpoint',
    ].includes(candidate.uses));
  assert.equal(standardRestoreSteps.length, 5);
  assert.equal(
    standardRestoreSteps.filter(
      (candidate: any) => candidate.uses === './app-source/.github/actions/restore-release-checkpoint',
    ).length,
    4,
  );
  const publicationRestoreSteps = standardRestoreSteps.filter(
    (candidate: any) => candidate.uses === './app-executor/.github/actions/restore-release-checkpoint',
  );
  assert.equal(publicationRestoreSteps.length, 1);
  assert.equal(publicationRestoreSteps[0].name, 'Restore Standard checkpoint');
  assert.equal(standardRestoreSteps.filter(
    (candidate: any) => candidate.name !== 'Restore portable checkpoint',
  ).every(
    (candidate: any) => candidate.with['framework-executor-ref'] === '${{ needs.restore.outputs.framework_executor_ref }}',
  ), true);
  const fullRestore = workflowStep(
    '_release-full-addon.yml',
    'restore-standard',
    'Restore verified Standard checkpoint',
  );
  assert.equal(
    fullRestore.with['framework-executor-ref'],
    '${{ inputs.framework_executor_ref }}',
  );
  const fullRestoreSteps = Object.values(full.jobs)
    .flatMap((job: any) => job.steps ?? [])
    .filter((candidate: any) => candidate.uses === './app-source/.github/actions/restore-release-checkpoint');
  assert.equal(fullRestoreSteps.length, 4);
  assert.deepEqual(
    fullRestoreSteps.map((candidate: any) => candidate.with['framework-executor-ref']),
    [
      '${{ inputs.framework_executor_ref }}',
      '${{ needs.restore-standard.outputs.framework_executor_ref }}',
      '${{ needs.restore-standard.outputs.framework_executor_ref }}',
      '${{ needs.restore-standard.outputs.framework_executor_ref }}',
    ],
  );
  assert.match(fullSource, /framework_source_ref: \$\{\{ steps\.identity\.outputs\.framework_source_ref \}\}/);
  assert.match(fullSource, /framework_executor_ref: \$\{\{ steps\.checkpoint\.outputs\.framework_executor_ref \}\}/);
});

test('one signed Standard build is sealed once and every final consumer binds its identity digest', () => {
  const bundle = parseWorkflow('_release-bundle.yml');
  const source = readWorkflow('_release-bundle.yml');
  const reusableBuild = parseWorkflow('_build-reusable.yml');
  const cohortUpload = reusableBuild.jobs.build.steps.find(
    (step: any) => step.name === 'Upload build artifact cohort manifest',
  );
  const cohortDownload = bundle.jobs['seal-standard-identity'].steps.find(
    (step: any) => step.name === 'Download the signed Standard build cohort',
  );
  const seal = bundle.jobs['seal-standard-identity'];
  const sealIdentity = seal.steps.find(
    (step: any) => step.name === 'Seal one immutable Standard artifact identity',
  );
  const vmArtifactUpload = seal.steps.find(
    (step: any) => step.name === 'Upload exact-candidate Standard VM artifact',
  );
  const vmCohortUpload = seal.steps.find(
    (step: any) => step.name === 'Upload exact-candidate Standard VM cohort identity',
  );
  assert.equal(
    cohortUpload.with.name,
    "${{ inputs.append_commit_hash && format('{0}-{1}-dmg-cohort', matrix.artifact-name, steps.commit.outputs.short) || format('{0}-dmg-cohort', matrix.artifact-name) }}",
  );
  assert.equal(cohortDownload.with.name, 'macos-build-arm64-dmg-cohort');
  assert.equal(
    seal.outputs.standard_vm_artifact_name,
    '${{ steps.seal.outputs.standard_vm_artifact_name || steps.reuse.outputs.standard_vm_artifact_name }}',
  );
  assert.match(String(sealIdentity.run), /Standard VM carrier requires exactly one bound Standard DMG/);
  assert.match(String(sealIdentity.run), /ln "\$\{standard_dmgs\[0\]\}"/);
  assert.match(String(sealIdentity.run), /cp bound-standard\/standard-identity-receipt\.json bound-standard-vm\/standard-identity-receipt\.json/);
  assert.equal(vmArtifactUpload.with.name, 'opl-release-standard-vm-bound-${{ github.run_id }}');
  assert.equal(vmArtifactUpload.with.path, 'bound-standard-vm');
  assert.equal(vmArtifactUpload.with['compression-level'], 0);
  assert.equal(vmCohortUpload.with.name, 'opl-release-standard-vm-bound-${{ github.run_id }}-cohort');
  assert.equal(vmCohortUpload.with.path, 'standard-cohort');
  assert.equal((source.match(/uses: \.\/\.github\/workflows\/_build-reusable\.yml/g) ?? []).length, 1);
  assert.deepEqual(bundle.jobs['seal-standard-identity'].needs, ['freeze', 'standard-build']);
  assert.equal(bundle.jobs['standard-qualification'], undefined);
  assert.deepEqual(
    bundle.jobs['checkpoint-standard'].needs,
    ['admission', 'freeze', 'seal-standard-identity', 'standard-clean-vm-qualification'],
  );
  const standardCleanVm = bundle.jobs['standard-clean-vm-qualification'];
  assert.equal(standardCleanVm.uses, './.github/workflows/opl-first-run-vm.yml');
  assert.deepEqual(standardCleanVm.needs, ['freeze', 'seal-standard-identity']);
  assert.equal(standardCleanVm.with.package_profile, 'standard');
  assert.equal(standardCleanVm.with.diagnostic_scope, 'release_gate');
  assert.equal(
    standardCleanVm.with.release_artifact_name,
    '${{ needs.seal-standard-identity.outputs.standard_vm_artifact_name }}',
  );
  assert.equal(standardCleanVm.with.require_macos_gatekeeper, true);
  assert.equal(standardCleanVm.secrets, 'inherit');
  assert.equal(
    bundle.jobs['publish-standard'].with.standard_identity_sha256,
    '${{ needs.checkpoint-standard.outputs.standard_identity_sha256 }}',
  );
  assert.match(source, /bind-standard-release-track\.ts/);
  assert.match(source, /opl-release-standard-bound-\$\{GITHUB_RUN_ID\}/);
  assert.match(source, /Standard identity digest mismatch/);

  const firstRun = parseWorkflow('opl-first-run-vm.yml');
  assert.equal(firstRun.on.workflow_call.inputs.standard_identity_sha256.required, false);
  assert.match(readWorkflow('opl-first-run-vm.yml'), /Standard identity digest mismatch/);

  const publish = parseWorkflow('_release-standard-publish.yml');
  assert.equal(publish.on.workflow_call.inputs.standard_identity_sha256.required, false);
  assert.match(readWorkflow('_release-standard-publish.yml'), /Standard identity digest mismatch/);
  assert.equal(publish.jobs['updater-upgrade-qualification'], undefined);
  assert.equal(publish.jobs['updater-upgrade-qualification-highest'], undefined);

  const latestAdmission = fs.readFileSync(
    path.join(process.cwd(), 'scripts', 'validate-standard-latest-admission.ts'),
    'utf8',
  );
  assert.match(latestAdmission, /expectedZipName/);
  assert.match(latestAdmission, /expectedDmgName/);
  assert.match(latestAdmission, /Latest admission ZIP sha256/);
  assert.match(latestAdmission, /Latest admission DMG sha256/);
  assert.match(latestAdmission, /Latest admission ZIP size/);
  assert.match(latestAdmission, /Latest admission DMG size/);
  assert.equal(fs.existsSync(path.join(process.cwd(), '.github/workflows/opl-updater-upgrade-vm.yml')), false);
  assert.doesNotMatch(
    [
      source,
      readWorkflow('_release-standard-publish.yml'),
      readWorkflow('opl-first-run-vm.yml'),
    ].join('\n'),
    /package_release_set|package-release-set|release_set_manifest|\bbom\b/i,
  );
});

test('Stable manifest consumes exactly one protected evidence set before any Standard mutation consumer', () => {
  const stable = parseWorkflow('release-stable.yml');
  const stableAdmissionManifest = stable.jobs['stable-admission-manifest'];
  const manifestSeal = String(stableAdmissionManifest.steps.find(
    (step: Record<string, unknown>) => step.name === 'Seal one same-run Stable admission manifest',
  )?.run ?? '');
  for (const [array, basename] of [
    ['controls', 'stable-operation-control.json'],
    ['source_gates', 'source-gate.json'],
    ['pre_nonce_guards', 'pre-issued-pre-nonce-guard.json'],
    ['run_reconciles', 'run-authority-reconcile.json'],
  ] as const) {
    assert.match(
      manifestSeal,
      new RegExp(`find operation-control-evidence -type f -name ${basename.replace('.', '\\.')} -print`),
    );
    assert.match(manifestSeal, new RegExp(`test "\\$\\{#${array}\\[@\\]\\}" -eq 1`));
  }
  assert.match(manifestSeal, /stable-operation-control\.ts verify[\s\S]*--control "\$control_path"/);
  assert.match(manifestSeal, /--source-gate "\$source_gate_path"/);
  assert.match(manifestSeal, /--pre-nonce-guard "\$\{pre_nonce_guards\[0\]\}"/);
  assert.match(manifestSeal, /--run-authority-reconcile "\$\{run_reconciles\[0\]\}"/);
  assert.match(manifestSeal, /stable-release-admission-manifest\.ts create[\s\S]*--source-gate "\$source_gate_path"/);
  assert.match(manifestSeal, /--failure-output "\$RUNNER_TEMP\/stable-release-admission-failure\.json"/);
  assert.doesNotMatch(manifestSeal, /source-qualification-receipt\.ts/);
  const protectedUpload = stableAdmissionManifest.steps.find(
    (step: Record<string, unknown>) => step.name === 'Upload same-run protected admission evidence',
  );
  assert.match(
    String(protectedUpload?.with?.path ?? ''),
    /\$\{\{ steps\.manifest\.outputs\.source_gate_path \}\}/,
  );
  const failureValidation = stableAdmissionManifest.steps.find(
    (step: Record<string, unknown>) => step.name === 'Validate typed Stable admission failure evidence',
  ) as Record<string, any>;
  assert.equal(
    failureValidation.if,
    "${{ failure() && steps.manifest.outcome == 'failure' }}",
  );
  assert.match(String(failureValidation.run), /opl_stable_release_admission_failure\.v1/);
  assert.match(String(failureValidation.run), /old_authority_or_run_reusable == false/);
  const failureUpload = stableAdmissionManifest.steps.find(
    (step: Record<string, unknown>) => step.name === 'Upload typed Stable admission failure evidence',
  ) as Record<string, any>;
  assert.equal(
    failureUpload.if,
    "${{ failure() && steps.manifest.outcome == 'failure' }}",
  );
  assert.equal(failureUpload.with.name, 'opl-stable-admission-failure-${{ github.run_id }}');
  assert.equal(
    failureUpload.with.path,
    '${{ runner.temp }}/stable-release-admission-failure.json',
  );
  assert.equal(stable.jobs.standard.needs.includes('protected-operation-admission'), true);
  assert.equal(stable.jobs.standard.needs.includes('stable-admission-manifest'), true);
  const bundle = parseWorkflow('_release-bundle.yml');
  assert.equal(bundle.on.workflow_call.inputs.stable_admission_artifact.required, false);
  assert.equal(bundle.on.workflow_call.inputs.stable_admission_manifest_digest.required, false);
  const admissionDownload = workflowStep(
    '_release-bundle.yml',
    'freeze',
    'Download same-run protected Stable admission',
  );
  assert.equal(admissionDownload.if, "${{ inputs.channel == 'stable' }}");
  assert.equal(admissionDownload.with.name, '${{ inputs.stable_admission_artifact }}');
  const freezeIdentity = String(workflowStep(
    '_release-bundle.yml',
    'freeze',
    'Freeze source, version, and compatibility identity',
  ).run);
  assert.match(freezeIdentity, /stableAdmissionManifestDigest/);
  assert.match(freezeIdentity, /EXPECTED_MANIFEST_DIGEST/);
  assert.match(freezeIdentity, /find stable-operation-control -type f -name source-gate\.json/);
  assert.match(freezeIdentity, /source_gate_file_sha256/);
  assert.match(freezeIdentity, /apple_credentials\?\.receipt_sha256/);
  assert.match(freezeIdentity, /producer_run_id !== process\.env\.GITHUB_RUN_ID/);
  assert.match(freezeIdentity, /cohort\?\.app_sha !== process\.env\.EXPECTED_APP_SHA/);
  assert.match(freezeIdentity, /allocator\?\.selected_version !== process\.env\.EXPECTED_VERSION/);
  assert.doesNotMatch(freezeIdentity, /resolveStableReleaseVersion/);
});

test('Standard restore includes the checkpoint-bound owner draft namespace in version collision checks', () => {
  const ownerNamespace = createGithubOwnerReleaseNamespaceEvidence({
    repository: 'gaofeng21cn/one-person-lab-app',
    checkedAt: '2026-07-30T22:14:00.058Z',
    authenticatedUser: { login: 'gaofeng21cn' },
    repositoryObservation: {
      full_name: 'gaofeng21cn/one-person-lab-app',
      owner: { login: 'gaofeng21cn' },
      permissions: { push: true },
    },
    releasePages: [[
      {
        id: 362629121,
        tag_name: 'v26.7.31',
        target_commitish: '3032898363e843cd6773c82e2e77b4f41b00afd2',
        draft: true,
        prerelease: false,
        assets: [],
      },
    ]],
  });
  const sourceGate = {
    schema: 'opl_app_release_source_gate.v1',
    status: 'passed',
    admission: { status: 'passed' },
    typed_blocker: null,
    owner_release_namespace: ownerNamespace,
  };
  const restoreIdentity = String(workflowStep(
    '_release-standard-publish.yml',
    'restore',
    'Resolve checkpoint and predecessor identity',
  ).run);
  assert.match(restoreIdentity, /find stable-operation-control -type f -name source-gate\.json/);
  assert.match(restoreIdentity, /test "\$\{#source_gates\[@\]\}" -eq 1/);
  assert.match(restoreIdentity, /validateGithubOwnerReleaseNamespaceEvidence/);
  assert.match(restoreIdentity, /ownerNamespace\.draft_reservations\.map/);
  assert.ok(
    restoreIdentity.indexOf('ownerNamespace.draft_reservations.map')
      < restoreIdentity.indexOf('resolveStableReleaseVersion(process.env.BASE_VERSION, refs)'),
  );

  const admittedRevision = runStableRestoreVersionIdentity('26.7.31-r1', sourceGate);
  assert.equal(admittedRevision.status, 0, admittedRevision.stderr);

  const staleRevisionZero = runStableRestoreVersionIdentity('26.7.31', sourceGate);
  assert.notEqual(staleRevisionZero.status, 0);
  assert.match(
    staleRevisionZero.stderr,
    /Stable version collision: expected next immutable revision 26\.7\.31-r1, got 26\.7\.31\./,
  );

  const missingOwnerEvidence = runStableRestoreVersionIdentity('26.7.31-r1', {
    ...sourceGate,
    owner_release_namespace: undefined,
  });
  assert.notEqual(missingOwnerEvidence.status, 0);
  assert.match(missingOwnerEvidence.stderr, /GitHub owner release namespace evidence/);
});
