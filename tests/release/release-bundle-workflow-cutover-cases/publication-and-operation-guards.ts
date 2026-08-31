import test from 'node:test';
import {
  assert,
  fs,
  path,
  readWorkflow,
  parseWorkflow,
  workflowStep,
  runPortableStandardBuildReceiptStep,
} from "./fixtures.ts";

test('hosted publication restores built checkpoints without reintroducing VM-qualified admission', () => {
  const source = readWorkflow('_release-standard-publish.yml');
  assert.match(source, /standard_built\|standard_qualified\|full_built\|full_qualified/);
  assert.match(source, /stable_built\|stable_qualified\|full_built\|full_qualified/);
  assert.match(source, /Hosted Standard publication requires a checkpoint at or after standard_built/);
  assert.match(source, /Unified hosted publication requires a checkpoint at or after stable_built/);
  assert.doesNotMatch(source, /requires a checkpoint at or after standard_qualified/);
  assert.doesNotMatch(source, /requires an exact stable_qualified checkpoint/);
});

test('mutation unknown states persist evidence and only use bounded read-only reconciliation', () => {
  for (const name of ['_release-standard-publish.yml', '_release-full-addon.yml']) {
    const source = readWorkflow(name);
    assert.match(source, /input-digest\.txt/);
    assert.match(source, /stdout\.txt/);
    assert.match(source, /stderr\.txt/);
    assert.match(source, /if: \$\{\{ always\(\) \}\}/);
    assert.match(source, /--operation-id/);
    assert.match(source, /--operation-started-at/);
    assert.match(source, /--operation-deadline-at/);
  }
  const homebrew = fs.readFileSync(
    path.join(process.cwd(), '.github/actions/release-followups/homebrew-standard/action.yml'),
    'utf8',
  );
  assert.match(homebrew, /timeout --foreground --signal=TERM --kill-after=5s/);
  assert.match(homebrew, /git -C tap-source ls-remote origin refs\/heads\/main/);
  assert.doesNotMatch(homebrew, /for attempt in 1 2 3|three read-only reconciliations/);
  assert.match(homebrew, /push_count=0/);
  assert.match(homebrew, /push_count=1/);
  assert.equal((homebrew.match(/git -C tap-source push --no-force origin/g) ?? []).length, 1);
  const standardSource = readWorkflow('_release-standard-publish.yml');
  const fullSource = readWorkflow('_release-full-addon.yml');
  assert.match(standardSource, /release_bundle_status\.tracks\.standard\.reconcile_required/);
  assert.match(fullSource, /release_bundle_status\.tracks\.full\.reconcile_required/);
  for (const source of [standardSource, fullSource]) {
    assert.match(source, /release_bundle_status\.active_unknown_markers/);
    assert.match(source, /prior_mutation_attempt_id/);
    assert.match(source, /publication_scope/);
    assert.match(source, /outcome_unknown[\s\S]*--outcome unknown[\s\S]*opl release publish[\s\S]*opl release status[\s\S]*opl release reconcile/);
    assert.match(source, /deadline_elapsed[\s\S]*reconcile is not authorized without a persisted unknown outcome/);
  }
  assert.equal((standardSource.match(/framework-release-adapter\.ts github-activate-latest/g) ?? []).length, 2);
  assert.match(standardSource, /case "\$latest_status" in[\s\S]*complete\|idempotent/);
  assert.match(standardSource, /Latest activation was not conclusively read back; no retry was attempted/);
  assert.match(readWorkflow('_release-standard-publish.yml'), /fresh_bounded_read_only_inspect_then_framework_reconcile/);
  assert.match(readWorkflow('_release-full-addon.yml'), /fresh_bounded_read_only_inspect_then_framework_reconcile/);
});

test('Full publication declares the Stable channel and same-tag CAS boundary at the guarded adapter', () => {
  const fullAddon = parseWorkflow('_release-full-addon.yml');
  const prebuildAdmission = fullAddon.jobs['restore-standard'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Admit executor-head Full publication target before build',
  );
  assert.match(String(prebuildAdmission.run), /git -C app-source rev-parse HEAD/);
  assert.match(String(prebuildAdmission.run), /same_release_append_and_asset_cas/);
  assert.match(String(prebuildAdmission.run), /new_release_or_tag_allowed:false/);
  assert.match(String(prebuildAdmission.run), /mutation_authorized:false/);
  assert.match(String(prebuildAdmission.run), /higher_privilege_workflows_token_required:false/);
  const publish = workflowStep(
    '_release-full-addon.yml',
    'publish-full',
    'Append exact Full bytes to the mutable Standard Release',
  );
  assert.match(
    String(publish.run),
    /framework-release-adapter\.ts github-apply[\s\S]*--publication-channel stable/,
  );
  assert.equal(
    (String(publish.run).match(/framework-release-adapter\.ts github-apply/g) ?? []).length,
    3,
  );
  assert.match(String(publish.run), /--mutation-mode rehearsal/);
  assert.match(String(publish.run), /--mutation-mode execute/);
  assert.match(String(publish.run), /--output full-read-only-reconcile\.json/);
  assert.match(String(publish.run), /\.reconciliation\.classification full-read-only-reconcile\.json/);
  assert.match(String(publish.run), /\.mutation_attempted full-read-only-reconcile\.json\)" = false/);
  assert.match(String(publish.run), /full_manifest_executor_app_sha=.*carrier_context\.release_executor\.app_sha/);
  assert.equal(
    (String(publish.run).match(/--executor-app-sha "\$full_manifest_executor_app_sha"/g) ?? []).length,
    3,
  );
  assert.match(String(publish.run), /--standard-attestation "\$standard_attestation"/);
  assert.doesNotMatch(String(publish.run), /adjunct|gh release create|--create/);
  assert.doesNotMatch(String(publish.run), /scripts\/publish-release\.ts/);
});

test('Stable Standard mutation restores once then publishes, readbacks, and activates Latest', () => {
  const workflow = parseWorkflow('_release-standard-publish.yml');
  const publish = workflow.jobs['publish-standard-nonlatest'];
  const readback = workflow.jobs['remote-digest-verify'];
  const latest = workflow.jobs['activate-latest'];
  assert.equal(
    publish.environment,
    "${{ needs.restore.outputs.channel == 'stable' && 'release-stable' || 'release-preview' }}",
  );
  assert.equal(
    publish.steps.filter((step: { uses?: string }) => String(step.uses ?? '').includes('restore-release-checkpoint')).length,
    1,
  );
  assert.equal(
    publish.steps.find((step: { name?: string }) => step.name === 'Read back exact remote Standard digests')?.if,
    "${{ needs.restore.outputs.channel == 'stable' }}",
  );
  assert.equal(
    publish.steps.find((step: { name?: string }) => step.name === 'Activate Latest after exact remote parity')?.if,
    "${{ needs.restore.outputs.channel == 'stable' }}",
  );
  assert.match(String(readback.if), /needs\.restore\.outputs\.channel != 'stable'/);
  assert.match(String(latest.if), /needs\.restore\.outputs\.channel != 'stable'/);
  assert.equal(latest.environment, 'release-preview-latest');
  assert.equal(readback.environment, undefined);
  assert.deepEqual(readback.permissions, { contents: 'read', actions: 'read' });
  assert.equal(
    readback.steps.filter((step: { uses?: string }) => String(step.uses ?? '').includes('restore-release-checkpoint')).length,
    1,
  );
  assert.equal(
    latest.steps.filter((step: { uses?: string }) => String(step.uses ?? '').includes('restore-release-checkpoint')).length,
    1,
  );
  assert.doesNotMatch(readWorkflow('_release-standard-publish.yml'), /needs\.restore\.outputs\.shell_sha\b/);
  assert.match(readWorkflow('_release-standard-publish.yml'), /needs\.restore\.outputs\.shell_ref/);
});

test('Stable Standard publication uses the Contents-write workflow credential', () => {
  const publish = workflowStep(
    '_release-standard-publish.yml',
    'publish-standard-nonlatest',
    'Publish only missing Standard bytes',
  );
  assert.equal(publish.env?.GH_TOKEN, '${{ github.token }}');
  assert.match(String(publish.run), /framework-release-adapter\.ts github-apply/);
  assert.doesNotMatch(String(publish.run), /immutable-releases|preflight-setting-receipt|disabled-setting-receipt/);
});

test('Stable recovery scripts avoid Bash 4-only mapfile on macOS runners', () => {
  for (const relativePath of [
    '.github/workflows/_release-standard-publish.yml',
    '.github/workflows/_release-full-addon.yml',
    '.github/actions/restore-release-checkpoint/action.yml',
  ]) {
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
    assert.doesNotMatch(source, /\bmapfile\b/, relativePath);
  }
});

test('every recoverable Standard unknown artifact carries exactly one original build receipt', () => {
  const workflow = parseWorkflow('_release-standard-publish.yml');
  const jobs = [
    {
      name: 'publish-standard-nonlatest',
      uploadStep: 'Upload Standard publication receipt',
      artifact: 'opl-release-standard-published-${{ github.run_id }}',
      checkpoint: 'standard-github-unknown-checkpoint',
    },
    {
      name: 'activate-latest',
      uploadStep: 'Upload Latest activation receipt',
      artifact: 'opl-release-activation-${{ github.run_id }}',
      checkpoint: 'latest-unknown-checkpoint',
    },
  ] as const;

  for (const job of jobs) {
    const positive = runPortableStandardBuildReceiptStep(job.name, 1);
    assert.equal(positive.result.status, 0, `${job.name}: ${positive.result.stderr}`);
    assert.deepEqual(positive.outputBytes, positive.sourceBytes, job.name);

    for (const receiptCount of [0, 2]) {
      const rejected = runPortableStandardBuildReceiptStep(job.name, receiptCount);
      assert.notEqual(rejected.result.status, 0, `${job.name}:${receiptCount}`);
      assert.equal(rejected.outputBytes, null, `${job.name}:${receiptCount}`);
      assert.match(
        `${rejected.result.stdout}\n${rejected.result.stderr}`,
        new RegExp(`exactly one App-owned standard-build-receipt\\.json; found ${receiptCount}`),
        `${job.name}:${receiptCount}`,
      );
    }

    const symlinkOnly = runPortableStandardBuildReceiptStep(job.name, 'symlink-only');
    assert.notEqual(symlinkOnly.result.status, 0, `${job.name}:symlink-only`);
    assert.equal(symlinkOnly.outputBytes, null, `${job.name}:symlink-only`);
    assert.match(
      `${symlinkOnly.result.stdout}\n${symlinkOnly.result.stderr}`,
      /exactly one App-owned standard-build-receipt\.json; found 0/,
      `${job.name}:symlink-only`,
    );

    const upload = workflow.jobs[job.name].steps.find(
      (step: Record<string, unknown>) => step.name === job.uploadStep,
    );
    assert.ok(upload, `${job.name}:${job.uploadStep}`);
    assert.equal(upload.with.name, job.artifact);
    assert.match(String(upload.with.path), new RegExp(`(?:^|\\n)${job.checkpoint}(?:\\n|$)`));
    assert.match(String(upload.with.path), /(?:^|\n)standard-build-receipt\.json(?:\n|$)/);
  }

  const standardFailure = String(
    workflowStep(
      '_release-standard-publish.yml',
      'publish-standard-nonlatest',
      'Persist typed Standard publication failure',
    ).run,
  );
  assert.match(standardFailure, /opl-release-standard-published-\$\{GITHUB_RUN_ID\}/);
  assert.match(standardFailure, /resume_source:\(if \$framework_reconcile_authorized then \{run_id:\$resume_source_run_id,artifact:\$resume_source_artifact\}/);

  const latestFailure = String(
    workflowStep(
      '_release-standard-publish.yml',
      'activate-latest',
      'Persist typed Latest activation failure',
    ).run,
  );
  assert.match(latestFailure, /opl-release-activation-\$\{GITHUB_RUN_ID\}/);
  assert.match(latestFailure, /resume_source_run_id:\(if \$framework_reconcile_authorized then \$resume_source_run_id else null end\)/);
});

test('every real release build, VM, and mutation job rejects a partial rerun locally', () => {
  const guardedJobs = [
    ['_build-reusable.yml', 'build'],
    ['full-first-install-release.yml', 'full-first-install'],
    ['opl-first-run-vm.yml', 'clean-vm-first-run'],
    ['_release-standard-publish.yml', 'publish-standard-nonlatest'],
    ['_release-standard-publish.yml', 'activate-latest'],
    ['_release-full-addon.yml', 'publish-full'],
  ] as const;

  for (const [workflowName, jobName] of guardedJobs) {
    const workflow = parseWorkflow(workflowName);
    const source = JSON.stringify(workflow.jobs[jobName].steps ?? []);
    assert.match(source, /GITHUB_RUN_ATTEMPT/, `${workflowName}:${jobName}`);
    assert.match(source, /workflow_rerun|Partial rerun/, `${workflowName}:${jobName}`);
  }
  for (const workflowName of ['_release-standard-publish.yml', '_release-full-addon.yml']) {
    const source = readWorkflow(workflowName);
    assert.match(source, /failure_taxonomy:\"workflow_rerun\"/);
    assert.match(source, /input-digest\.txt/);
  }
});

test('the remote Canary is a thin read-only contract check with no reusable release entry', () => {
  const canary = parseWorkflow('release-bundle-canary.yml');
  assert.equal(canary.on.push, undefined);
  assert.equal(canary.on.pull_request, undefined);
  assert.deepEqual(canary.on.schedule, [{ cron: '0 13 * * *' }]);
  assert.equal(canary.on.workflow_dispatch, null);
  assert.deepEqual(canary.permissions, { contents: 'read', actions: 'read' });
  assert.deepEqual(Object.keys(canary.jobs), ['framework-checkpoint-roundtrip', 'contract']);
  const frameworkCheckpointSteps = canary.jobs['framework-checkpoint-roundtrip'].steps;
  const workspaceBuildIndex = frameworkCheckpointSteps.findIndex(
    (step: Record<string, any>) => step.name === 'Build Framework runtime workspaces',
  );
  const checkpointTestIndex = frameworkCheckpointSteps.findIndex(
    (step: Record<string, any>) => step.name === 'Prove checkpoint roundtrip, no rebuild, and expired deadline rejection',
  );
  assert.ok(workspaceBuildIndex >= 0);
  assert.equal(frameworkCheckpointSteps[workspaceBuildIndex].run, 'npm run build:packages');
  assert.ok(workspaceBuildIndex < checkpointTestIndex);
  const contractRun = canary.jobs.contract.steps.find(
    (step: Record<string, unknown>) => step.name === 'Verify release workflow contracts without starting release jobs',
  )?.run;
  assert.match(String(contractRun), /release-bundle-workflow-cutover\.test\.ts/);
  assert.match(String(contractRun), /release-control-plane-boundary\.test\.ts/);
  for (const job of Object.values(canary.jobs) as Array<Record<string, any>>) {
    const permissions = job.permissions ?? canary.permissions;
    assert.equal(permissions.contents, 'read');
    assert.notEqual(permissions['id-token'], 'write');
    assert.notEqual(permissions.packages, 'write');
    assert.equal(job.uses, undefined);
    assert.equal(job.secrets, undefined);
  }
  assert.doesNotMatch(readWorkflow('release-bundle-canary.yml'), /secrets:\s+inherit|uses:\s+\.\/\.github\/workflows\//);
  for (const name of [
    '_release-bundle.yml',
    '_release-standard-publish.yml',
    '_release-full-addon.yml',
    '_build-reusable.yml',
    'full-first-install-release.yml',
    'opl-first-run-vm.yml',
    '_release-homebrew-full-publish.yml',
    'release-webui-stable.yml',
  ]) {
    const workflow = parseWorkflow(name);
    assert.equal(workflow.on.workflow_call.inputs.mode, undefined, `${name} retains a dead Canary mode`);
    assert.equal(workflow.jobs['startup-canary'], undefined, `${name} retains a dead Canary job`);
  }
  const webui = parseWorkflow('_release-webui-carrier.yml');
  assert.deepEqual(webui.permissions, { contents: 'read' });
  assert.equal(webui.jobs['startup-canary'], undefined);
  assert.equal(
    webui.jobs['build-and-qualify'].if,
    "${{ inputs.mode == 'execute' || inputs.mode == 'qualify' || inputs.mode == 'qualify-only' }}",
  );
  assert.equal(
    webui.jobs['build-and-qualify']['continue-on-error'],
    "${{ inputs.mode == 'qualify-only' }}",
  );
  assert.equal(webui.jobs['qualify-receipt'].if, "${{ always() && inputs.mode == 'qualify-only' }}");
  assert.equal(
    webui.jobs['publish-carrier'].if,
    "${{ always() && ((inputs.mode == 'execute' && needs.build-and-qualify.result == 'success') || (inputs.mode == 'publish-prequalified' && inputs.qualified_artifact_run_id != '')) }}",
  );
  assert.deepEqual(webui.jobs['publish-carrier'].permissions, {
    actions: 'read',
    contents: 'read',
    packages: 'write',
  });
});

test('release-bound nested workflows inherit one operation and absolute deadline', () => {
  for (const name of [
    '_build-reusable.yml',
    'full-first-install-release.yml',
    'opl-first-run-vm.yml',
  ]) {
    const workflow = parseWorkflow(name);
    for (const input of ['operation', 'operation_started_at', 'operation_deadline_at']) {
      assert.ok(workflow.on.workflow_call.inputs[input], `${name} is missing ${input}`);
    }
    const source = readWorkflow(name);
    assert.match(source, /GITHUB_RUN_ATTEMPT/);
    assert.match(source, /operation_deadline_at/);
    assert.match(source, /opl_release_nested_admission_receipt\.v1/);
  }

  const bundle = readWorkflow('_release-bundle.yml');
  const standard = readWorkflow('_release-standard-publish.yml');
  const full = readWorkflow('_release-full-addon.yml');
  for (const input of ['operation:', 'operation_started_at:', 'operation_deadline_at:']) {
    assert.match(bundle, new RegExp(input));
    assert.match(standard, new RegExp(input));
    assert.match(full, new RegExp(input));
  }
  const bundleWorkflow = parseWorkflow('_release-bundle.yml');
  assert.equal(
    bundleWorkflow.jobs['standard-build'].with.operation,
    '${{ inputs.operation }}',
  );
  assert.equal(bundleWorkflow.jobs['standard-qualification'], undefined);
});

test('production Standard and Full builds fail closed on Apple distribution trust', () => {
  const bundle = parseWorkflow('_release-bundle.yml');
  const reusableBuild = parseWorkflow('_build-reusable.yml');
  const diagnostics = parseWorkflow('release-diagnostics.yml');
  const fullAddon = parseWorkflow('_release-full-addon.yml');
  const fullBuild = parseWorkflow('full-first-install-release.yml');
  const fullBuildSource = readWorkflow('full-first-install-release.yml');
  const fullAddonSource = readWorkflow('_release-full-addon.yml');
  const protectedPreflightEnvironment = "${{ inputs.require_macos_gatekeeper && 'release-stable' || null }}";
  const protectedMacosBuildEnvironment = "${{ inputs.require_macos_gatekeeper && startsWith(matrix.platform, 'macos') && 'release-stable' || null }}";
  const signingPreflight = reusableBuild.jobs['macos-signing-preflight'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Import Developer ID identity and authenticate notarization',
  );
  const signingPreflightCheckout = reusableBuild.jobs['macos-signing-preflight'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Checkout exact credential preflight source',
  );
  const signingPreflightUpload = reusableBuild.jobs['macos-signing-preflight'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Upload sanitized Apple credential preflight receipt',
  );
  const setupSigning = reusableBuild.jobs.build.steps.find(
    (step: Record<string, unknown>) => step.name === 'Setup macOS code signing (macOS only)',
  );
  const macosBuild = reusableBuild.jobs.build.steps.find(
    (step: Record<string, unknown>) => step.name === 'Build with electron-builder (macOS)',
  );
  const standardFinalizer = reusableBuild.jobs.build.steps.find(
    (step: Record<string, unknown>) => step.name === 'Finalize Standard Developer ID signing and notarization',
  );
  const cleanupSigning = reusableBuild.jobs.build.steps.find(
    (step: Record<string, unknown>) => step.name === 'Clean up keychain (macOS only)',
  );

  assert.equal(bundle.jobs['standard-build'].with.require_macos_gatekeeper, true);
  assert.equal(bundle.jobs['standard-build'].secrets, 'inherit');
  assert.equal(bundle.jobs['standard-clean-vm-qualification'].secrets, 'inherit');
  assert.equal(bundle.jobs['full-candidate'].secrets, 'inherit');
  assert.equal(bundle.jobs['full-candidate'].with.candidate_only, true);
  assert.equal(bundle.jobs['webui-qualify'].with.mode, 'qualify-only');
  assert.equal(bundle.jobs['standard-clean-vm-qualification'].with.diagnostic_scope, 'release_gate');
  assert.equal(bundle.jobs['standard-clean-vm-qualification'].with.package_profile, 'standard');
  assert.deepEqual(bundle.jobs['standard-build'].permissions, {
    contents: 'read',
    actions: 'read',
  });
  assert.equal(reusableBuild.permissions, undefined);
  assert.equal(reusableBuild.jobs['macos-signing-preflight']['runs-on'], 'macos-latest');
  assert.equal(reusableBuild.jobs['macos-signing-preflight']['timeout-minutes'], 10);
  assert.equal(reusableBuild.jobs['macos-signing-preflight'].environment, protectedPreflightEnvironment);
  assert.equal(reusableBuild.jobs.build.environment, protectedMacosBuildEnvironment);
  assert.deepEqual(
    Object.entries(reusableBuild.jobs)
      .filter(([, job]: [string, any]) => job.environment !== undefined)
      .map(([jobName]) => jobName),
    ['macos-signing-preflight', 'build'],
  );
  assert.deepEqual(signingPreflight.env, {
    BUILD_CERTIFICATE_BASE64: '${{ secrets.BUILD_CERTIFICATE_BASE64 }}',
    P12_PASSWORD: '${{ secrets.P12_PASSWORD }}',
    APPLE_ID: '${{ secrets.APPLE_ID }}',
    APPLE_ID_PASSWORD: '${{ secrets.APPLE_ID_PASSWORD }}',
    TEAM_ID: '${{ secrets.TEAM_ID }}',
    IDENTITY: '${{ secrets.IDENTITY }}',
  });
  assert.equal(signingPreflightCheckout.with.ref, '${{ inputs.ref }}');
  assert.match(String(signingPreflight.run), /verify-apple-release-credentials\.ts/);
  assert.equal(
    signingPreflightUpload.with.name,
    'opl-apple-release-credentials-preflight-${{ github.run_id }}',
  );
  assert.deepEqual(Object.keys(diagnostics.on).sort(), ['workflow_call', 'workflow_dispatch']);
  assert.deepEqual(diagnostics.permissions, { contents: 'read', actions: 'read' });
  assert.deepEqual(diagnostics.on.workflow_dispatch.inputs.large_dmg_canary, {
    description: 'Apple credentials only: sign a synthetic Full-sized ULMO DMG without notarization submission.',
    required: false,
    default: false,
    type: 'boolean',
  });
  assert.deepEqual(diagnostics.on.workflow_dispatch.inputs.notary_submission_id, {
    description: 'Apple credentials only: exact existing Apple submission UUID to reconcile read-only.',
    required: false,
    default: '',
    type: 'string',
  });
  const credentialJob = diagnostics.jobs['apple-credentials'];
  assert.equal(credentialJob.if, "${{ github.event_name == 'workflow_dispatch' && inputs.diagnostic == 'apple_credentials' }}");
  assert.equal(credentialJob['runs-on'], 'macos-latest');
  assert.equal(credentialJob.environment, 'release-stable');
  assert.equal(credentialJob['timeout-minutes'], 45);
  assert.equal(credentialJob.concurrency['cancel-in-progress'], false);
  const credentialDiagnostic = credentialJob.steps.find(
    (step: Record<string, unknown>) => step.name === 'Import Developer ID identity and authenticate notarization',
  );
  const credentialReceiptUpload = credentialJob.steps.find(
    (step: Record<string, unknown>) => step.name === 'Upload sanitized Apple credential preflight receipt',
  );
  assert.match(String(credentialDiagnostic.run), /--large-dmg-canary/);
  assert.match(String(credentialDiagnostic.run), /--notary-submission-id/);
  assert.equal(credentialReceiptUpload.if, '${{ always() }}');
  assert.equal(credentialReceiptUpload.with['if-no-files-found'], 'warn');
  assert.equal(
    credentialJob.steps.some(
      (step: Record<string, unknown>) => String(step.run ?? '').includes('verify-apple-release-credentials.ts'),
    ),
    true,
  );
  assert.equal(
    credentialJob.steps.some(
      (step: Record<string, unknown>) => String(step.run ?? '').includes('stable-release-admission-manifest.ts create'),
    ),
    false,
  );
  assert.equal(
    credentialJob.steps.some(
      (step: Record<string, any>) => step.with?.name === 'opl-stable-admission-${{ github.run_id }}',
    ),
    false,
  );
  const stableWorkflow = parseWorkflow('release-stable.yml');
  assert.equal(stableWorkflow.jobs['stable-admission-manifest'].environment, 'release-stable');
  assert.equal(stableWorkflow.jobs['stable-admission-manifest'].steps.some(
    (step: Record<string, unknown>) => String(step.run ?? '').includes('stable-release-admission-manifest.ts create'),
  ), true);
  assert.equal(setupSigning.env.BUILD_CERTIFICATE_BASE64, '${{ secrets.BUILD_CERTIFICATE_BASE64 }}');
  assert.equal(setupSigning.env.P12_PASSWORD, '${{ secrets.P12_PASSWORD }}');
  assert.match(String(setupSigning.run), /security set-keychain-settings -lut 21600 build\.keychain/);
  assert.match(String(setupSigning.run), /security default-keychain -d user -s build\.keychain/);
  assert.match(String(setupSigning.run), /security list-keychains -d user -s build\.keychain/);
  assert.equal(macosBuild.env.appleId, '${{ secrets.APPLE_ID }}');
  assert.equal(macosBuild.env.appleIdPassword, '${{ secrets.APPLE_ID_PASSWORD }}');
  assert.equal(macosBuild.env.teamId, '${{ secrets.TEAM_ID }}');
  assert.equal(macosBuild.env.identity, '${{ secrets.IDENTITY }}');
  assert.equal(standardFinalizer.env.KEYCHAIN_PASSWORD, "${{ secrets.KEYCHAIN_PASSWORD || 'temp-keychain-password' }}");
  assert.match(String(standardFinalizer.run), /security unlock-keychain -p "\$KEYCHAIN_PASSWORD" build\.keychain/);
  assert.match(String(standardFinalizer.run), /security default-keychain -d user -s build\.keychain/);
  assert.match(String(standardFinalizer.run), /security list-keychains -d user -s build\.keychain/);
  assert.match(
    String(standardFinalizer.run),
    /security find-identity -v -p codesigning build\.keychain \| grep -F "\$OPL_RUNTIME_CODESIGN_IDENTITY" >\/dev\/null/,
  );
  const buildSteps = reusableBuild.jobs.build.steps;
  assert.ok(buildSteps.indexOf(setupSigning) < buildSteps.indexOf(standardFinalizer));
  assert.ok(buildSteps.indexOf(standardFinalizer) < buildSteps.indexOf(cleanupSigning));
  assert.equal(cleanupSigning.if, "startsWith(matrix.platform, 'macos') && always()");
  assert.match(String(cleanupSigning.run), /security delete-keychain build\.keychain/);
  assert.equal(fullAddon.jobs['full-build'].secrets, 'inherit');
  assert.equal(fullAddon.jobs['full-clean-vm-qualification'].secrets, 'inherit');
  assert.equal(fullAddon.jobs['full-clean-vm-qualification'].with.diagnostic_scope, 'release_gate');
  assert.equal(fullAddon.jobs['full-clean-vm-qualification'].with.package_profile, 'full');
  assert.equal(
    fullAddon.jobs['full-clean-vm-qualification'].with.verification_app_ref,
    '${{ inputs.verification_app_ref || inputs.full_content_app_ref }}',
  );
  assert.equal(
    fullAddon.jobs['full-clean-vm-qualification'].with.smoke_harness_ref,
    '${{ inputs.smoke_harness_ref || inputs.full_content_shell_ref }}',
  );
  assert.equal(fullBuild.jobs['full-first-install']['runs-on'], 'macos-latest');
  assert.equal(fullBuild.jobs['full-first-install']['continue-on-error'], '${{ inputs.candidate_only }}');
  assert.equal(fullBuild.jobs['full-first-install'].environment, 'release-stable');
  assert.ok(fullBuild.jobs['full-first-install'].steps.some(
    (step: Record<string, unknown>) => step.name === 'Record candidate-only Full failure without blocking Standard',
  ));
  assert.equal(fullBuild.jobs['full-finalizer']['runs-on'], 'macos-latest');
  assert.equal(fullBuild.jobs['full-finalizer'].needs, 'full-first-install');
  assert.equal(fullBuild.jobs['full-finalizer'].environment, 'release-stable');
  assert.equal(fullBuild.jobs['full-finalizer']['timeout-minutes'], 60);
  assert.deepEqual(fullBuild.jobs['full-finalizer'].permissions, {
    contents: 'read',
    actions: 'read',
  });

  const credentialGate = fullBuild.jobs['full-first-install'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Verify Full signing and notarization credentials',
  );
  assert.match(
    String(credentialGate.run),
    /production_release="\$\{\{ \(inputs\.operation == 'append_full' \|\| inputs\.candidate_only\) && inputs\.upload_full_package_artifact \}\}"/,
  );
  assert.match(String(credentialGate.run), /Production Full assets require Developer ID signing and Apple notarization/);
  assert.match(String(credentialGate.run), /Development-only Full build has no Apple credentials/);
  assert.match(String(credentialGate.run), /exit 1/);

  const armBuilder = fullBuild.jobs['full-first-install'];
  const fullFinalizer = fullBuild.jobs['full-finalizer'];
  const handoffUpload = armBuilder.steps.find(
    (step: Record<string, unknown>) => step.name === 'Upload immutable Full finalizer input',
  );
  const handoffDigestNormalization = armBuilder.steps.find(
    (step: Record<string, unknown>) => step.name === 'Normalize immutable Full finalizer artifact digest',
  );
  const handoffPrepare = armBuilder.steps.find(
    (step: Record<string, unknown>) => step.name === 'Prepare immutable Full finalizer input',
  );
  const preFinalizerRuntimeVerification = armBuilder.steps.find(
    (step: Record<string, unknown>) => step.name === 'Verify Full runtime payload before ARM finalization',
  );
  const finalizer = fullFinalizer.steps.find(
    (step: Record<string, unknown>) => step.name === 'Finalize Full Developer ID signing and notarization on ARM',
  );
  const cohortWriter = fullFinalizer.steps.find(
    (step: Record<string, unknown>) => step.name === 'Write ARM-finalized Full build artifact cohort manifest',
  );
  const executorCheckout = fullFinalizer.steps.find(
    (step: Record<string, unknown>) => step.name === 'Checkout canonical Full release executor',
  );
  assert.equal(fullBuild.jobs['full-first-install']['timeout-minutes'], "${{ inputs.operation == 'append_full' && 130 || 90 }}");
  assert.equal(executorCheckout.if, undefined);
  assert.match(String(fullFinalizer.if), /inputs\.operation == 'append_full'/);
  assert.equal(executorCheckout.with.path, 'release-executor');
  assert.equal(executorCheckout.with.ref, '${{ github.sha }}');
  assert.match(
    String(preFinalizerRuntimeVerification.run),
    /\$GITHUB_WORKSPACE\/release-executor\/scripts\/assert-full-runtime-currentness\.ts/,
  );
  assert.match(
    String(preFinalizerRuntimeVerification.run),
    /\$GITHUB_WORKSPACE\/release-executor\/scripts\/verify-full-runtime-native-trust\.ts/,
  );
  assert.doesNotMatch(
    String(preFinalizerRuntimeVerification.run),
    /one-person-lab-app\/scripts\/(?:assert-full-runtime-currentness|verify-full-runtime-native-trust)\.ts/,
  );
  assert.equal(handoffUpload.with['compression-level'], 0);
  assert.ok(
    armBuilder.steps.findIndex((step: Record<string, unknown>) => step.name === 'Upload Actions cache plan and receipt')
      < armBuilder.steps.indexOf(handoffPrepare),
  );
  assert.match(String(handoffPrepare.run), /opl_full_finalizer_input\.v1/);
  assert.match(String(handoffPrepare.run), /source_runner: \{ label: 'macos-latest', arch: process\.arch \}/);
  assert.ok(armBuilder.steps.indexOf(handoffUpload) < armBuilder.steps.indexOf(handoffDigestNormalization));
  assert.equal(
    handoffDigestNormalization.env.RAW_HANDOFF_ARTIFACT_DIGEST,
    '${{ steps.upload_full_finalizer_input.outputs.artifact-digest }}',
  );
  assert.match(String(handoffDigestNormalization.run), /\^\[0-9a-f\]\{64\}\$/);
  assert.match(String(handoffDigestNormalization.run), /canonical_digest="sha256:\$raw_digest"/);
  assert.match(String(handoffDigestNormalization.run), /artifact_digest=%s/);
  assert.equal(
    fullBuild.jobs['full-first-install'].outputs.finalizer_input_digest,
    '${{ steps.normalize_full_finalizer_input_digest.outputs.artifact_digest }}',
  );
  assert.equal(finalizer.if, undefined);
  assert.match(String(finalizer.run), /\$GITHUB_WORKSPACE\/release-executor\/scripts\/notarize-macos-dmg\.ts/);
  assert.match(String(finalizer.run), /full-apple-notarization-receipt\.json/);
  assert.match(String(finalizer.run), /--submitted-candidate-output/);
  assert.match(String(finalizer.run), /--operation-deadline-at/);

  const recoverySeal = fullFinalizer.steps.find(
    (step: Record<string, unknown>) => step.name === 'Seal Apple submission recovery checkpoint before diagnostics',
  );
  const recoveryUpload = fullFinalizer.steps.find(
    (step: Record<string, unknown>) => step.name === 'Upload sealed Apple submission recovery checkpoint',
  );
  assert.equal(recoverySeal.if, '${{ failure() }}');
  assert.equal(recoveryUpload.if, '${{ failure() }}');
  assert.match(String(recoverySeal.run), /opl_apple_notarization_recovery_checkpoint\.v1/);
  assert.match(String(recoverySeal.run), /submission_id/);
  assert.match(String(recoverySeal.run), /retained_for_reconcile/);
  assert.match(String(recoverySeal.run), /same_submission_finalize_only_after_owner_authoritative_reconcile/);
  assert.match(String(recoveryUpload.with.name), /opl-full-apple-recovery/);
  assert.equal(recoveryUpload.with['if-no-files-found'], 'error');
  assert.equal(recoveryUpload.with['compression-level'], 0);
  assert.ok(fullFinalizer.steps.indexOf(finalizer) < fullFinalizer.steps.indexOf(recoverySeal));
  assert.ok(fullFinalizer.steps.indexOf(recoverySeal) < fullFinalizer.steps.indexOf(recoveryUpload));

  const notarizationEvidence = fullFinalizer.steps.find(
    (step: Record<string, unknown>) => step.name === 'Upload ARM Full notarization terminal evidence',
  );
  assert.equal(notarizationEvidence.if, '${{ always() }}');
  assert.match(String(notarizationEvidence.with.name), /opl-full-notarization-evidence/);
  assert.match(String(notarizationEvidence.with.path), /full-runtime-native-trust\.json/);
  assert.match(String(notarizationEvidence.with.path), /submitted-for-notarization\.dmg/);
  assert.equal(notarizationEvidence.with['if-no-files-found'], 'warn');
  assert.equal(notarizationEvidence.with['compression-level'], 0);

  const buildDiagnostics = fullBuild.jobs['full-first-install'].steps.find(
    (step: Record<string, unknown>) => step.name === 'Upload Full diagnostics artifact',
  );
  assert.equal(buildDiagnostics.if, '${{ always() && !inputs.cache_only }}');
  assert.equal(buildDiagnostics.with['if-no-files-found'], 'warn');
  const finalizerDiagnostics = fullFinalizer.steps.find(
    (step: Record<string, unknown>) => step.name === 'Upload ARM-finalized Full diagnostics artifact',
  );
  assert.equal(finalizerDiagnostics.if, '${{ always() }}');
  assert.equal(finalizerDiagnostics.with['if-no-files-found'], 'warn');
  assert.doesNotMatch(
    fullBuildSource,
    /Verify (?:ARM-finalized )?Full artifact plan without (?:a )?release mutation/,
  );
  assert.doesNotMatch(fullBuildSource, /independent_immutable_adjunct_linked_to_existing_standard/);
  assert.equal(
    (fullBuildSource.match(/publication_model: candidateOnly \? 'release_bound_candidate_only' : 'same_tag_mutable_standard_addon'/g) ?? []).length,
    1,
    'candidate-only Full build must not bind a public Standard Release',
  );
  assert.equal(
    (fullBuildSource.match(/publication_model: 'same_tag_mutable_standard_addon'/g) ?? []).length,
    1,
    'append_full finalizer must still bind the same-tag mutable Standard model directly',
  );
  assert.equal(
    (fullBuildSource.match(/standard_asset_overwrite_or_delete_allowed: false/g) ?? []).length,
    2,
    'both Full manifest producers must seal Standard assets against overwrite or deletion',
  );
  assert.match(
    fullAddonSource,
    /Full build manifest does not bind the exact same-tag mutable Standard append target/,
  );

  for (const name of [
    'Upload Full package workflow artifact',
    'Upload Full build artifact cohort manifest',
    'Upload Full DMG-only workflow artifact',
  ]) {
    const upload = fullFinalizer.steps.find(
      (step: Record<string, unknown>) => step.name === name,
    );
    assert.equal(upload.if, '${{ success() }}', `${name} must not upload after notarization or trust failure`);
    if (name !== 'Upload Full build artifact cohort manifest') assert.equal(upload.with['compression-level'], 0);
  }
  const finalTrust = fullFinalizer.steps.find(
    (step: Record<string, unknown>) => step.name === 'Verify ARM-finalized Full distribution trust and bind manifest',
  );
  const finalTrustScript = String(finalTrust.run);
  assert.match(finalTrustScript, /timestamp_signing\.authority_endpoint == "system_default"/);
  assert.match(
    finalTrustScript,
    /\$GITHUB_WORKSPACE\/release-executor\/scripts\/verify-full-runtime-native-trust\.ts/,
  );
  assert.match(finalTrustScript, /--runtime-root "\$mounted_runtime_root"/);
  assert.doesNotMatch(
    finalTrustScript,
    /--require-spctl/,
    'nested runtime executables inherit the notarized App carrier Gatekeeper assessment',
  );
  assert.match(
    finalTrustScript,
    /spctl --assess --type open --context context:primary-signature --verbose=4 "\$dmg_path"/,
  );
  assert.match(
    finalTrustScript,
    /spctl --assess --type execute --verbose=4 "\$mounted_app_path"/,
  );
  assert.match(finalTrustScript, /--expected-team-id "\$EXPECTED_TEAM_ID"/);
  assert.match(finalTrustScript, /--output "\$output_dir\/full-runtime-native-trust\.json"/);
  assert.doesNotMatch(
    finalTrustScript,
    /one-person-lab-app\/scripts\/verify-full-runtime-native-trust\.ts/,
  );
  assert.ok(
    finalTrustScript.indexOf('verify-full-runtime-native-trust.ts')
      < finalTrustScript.indexOf("const runtimeTrust = JSON.parse"),
    'ARM finalizer must regenerate native trust from the final mounted DMG before binding public evidence',
  );
  assert.match(finalTrustScript, /full-finalizer-handoff-receipt\.json/);
  assert.match(
    finalTrustScript,
    /sha256: `sha256:\$\{crypto\.createHash\('sha256'\)/,
    'ARM finalizer must bind the public manifest with the canonical prefixed DMG digest',
  );
  assert.equal(
    (fullBuildSource.match(
      /sha256: `sha256:\$\{crypto\.createHash\('sha256'\)/g,
    ) ?? []).length,
    2,
    'both Full public manifest producers must use the canonical prefixed digest',
  );
  assert.match(
    String(cohortWriter.run),
    /--full-input-manifest one-person-lab-app\/contracts\/app-full-third-party-source-manifest\.json/,
  );
  assert.match(
    String(cohortWriter.run),
    /--full-package-manifest one-person-lab-app\/dist\/opl-full-release\/full-package-manifest\.json/,
  );
});
