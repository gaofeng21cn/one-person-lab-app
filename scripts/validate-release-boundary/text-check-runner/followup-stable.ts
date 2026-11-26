import {
  exactObject,
  failIf,
  hasStableMutationMutex,
  requestsWritePermission,
  jobRuns,
  actionSteps,
  hasLocalStep,
  localActionUse,
  workflowJobs,
  needsExactly,
  parseWorkflow,
  reportFailure,
  requireSubstrings,
  sameJson,
} from './report.ts';
import {
  exactReadPermissions,
  exactStableEntryPermissions,
  stableReleaseControlRunner,
  stableFollowupWorkflowPath,
  stableFollowupActionPaths,
  postPublicationOptionalCertificationWorkflowPath,
  desktopPlatformAddonWorkflowPath,
  isAuthorizedFullAddonFollowerWriteJob,
  isAuthorizedStableDesktopFollowupWriteJob,
  validateExactActionPins,
} from './workflow-policy.ts';

export function validateStableFollowupTopology(appRoot: string): number {
  const id = 'stable_followup_topology';
  const hub = parseWorkflow(appRoot, stableFollowupWorkflowPath, id);
  const actions = Object.fromEntries(
    Object.entries(stableFollowupActionPaths).map(([name, relativePath]) => [name, parseWorkflow(appRoot, relativePath, id)]),
  ) as Record<keyof typeof stableFollowupActionPaths, ReturnType<typeof parseWorkflow>>;
  const desktopPlatformAddon = parseWorkflow(appRoot, desktopPlatformAddonWorkflowPath, id);
  const optionalCertification = parseWorkflow(appRoot, postPublicationOptionalCertificationWorkflowPath, id);
  const optionalCertificationVm = parseWorkflow(appRoot, '.github/workflows/opl-first-run-vm.yml', id);
  const missing = [hub, ...Object.values(actions), desktopPlatformAddon, optionalCertification, optionalCertificationVm].filter((v) => !v).length;
  if (missing > 0 || !hub || !desktopPlatformAddon || !optionalCertification || !optionalCertificationVm) return missing;

  let failures = 0;
  const triggers = hub.workflow.on ?? {};
  const dispatchInputs = triggers.workflow_dispatch?.inputs ?? {};
  const jobs = workflowJobs(hub.workflow);
  failures += failIf(
    id,
    !sameJson(Object.keys(triggers).sort(), ['workflow_call', 'workflow_dispatch', 'workflow_run']) ||
      !sameJson(triggers.workflow_run?.workflows, ['OPL Stable Release Bundle']) ||
      !sameJson(triggers.workflow_run?.types, ['completed']) ||
      !sameJson(Object.keys(dispatchInputs).sort(), [
        'desktop_artifact_run_id', 'desktop_platform', 'desktop_shell_ref',
        'expected_old_asset_digest', 'expected_old_asset_id', 'operation',
        'operator_confirmation', 'repair_source_commit', 'smoke_harness_ref', 'source_run_id',
      ]) ||
      !sameJson(dispatchInputs.operation?.options, [
        'reconcile_full_addon', 'reconcile_homebrew_standard', 'reconcile_homebrew_full',
        'reconcile_desktop_platform', 'repair_additive',
      ]) ||
      !exactObject(hub.workflow.permissions, exactReadPermissions) || hub.workflow.concurrency !== undefined ||
      !sameJson(Object.keys(jobs).sort(), [
        'admit', 'observe', 'publish-homebrew-full', 'publish-standard-cask', 'receipt',
        'reconcile-desktop-platforms', 'reconcile-full-addon', 'repair-additive', 'repair-admit',
        'resolve-homebrew-full', 'route',
      ]),
    'Stable follow-ups must expose one automatic/manual hub with only the five independent additive operations',
  );

  const { route, observe, 'publish-standard-cask': standard, 'resolve-homebrew-full': resolveFull, 'publish-homebrew-full': publishFull } = jobs;
  failures += failIf(
    id,
    !route || route['runs-on'] !== stableReleaseControlRunner || route['timeout-minutes'] !== 10 ||
      Object.prototype.hasOwnProperty.call(route, 'needs') || requestsWritePermission(route.permissions) ||
      !jobRuns(route).includes('stable-followup-router.ts'),
    'Stable follow-up routing must be one read-only typed decision job',
  );
  failures += failIf(
    id,
    !observe || observe.if !== "${{ needs.route.outputs.observe == 'true' }}" || !needsExactly(observe, ['route']) ||
      !exactObject(observe.permissions, exactReadPermissions) || !hasLocalStep(observe, localActionUse(stableFollowupActionPaths.observe)) ||
      !standard || standard.if !== "${{ needs.route.outputs.homebrew_standard == 'true' }}" || !needsExactly(standard, ['route']) ||
      standard.environment !== 'release-stable' || !exactObject(standard.permissions, exactReadPermissions) ||
      !exactObject(standard.concurrency, { group: 'opl-homebrew-standard-${{ needs.route.outputs.source_run_id }}', 'cancel-in-progress': false }) ||
      !hasLocalStep(standard, localActionUse(stableFollowupActionPaths.homebrewStandard)) ||
      !resolveFull || resolveFull.if !== "${{ needs.route.outputs.homebrew_full == 'true' }}" || !needsExactly(resolveFull, ['route']) ||
      !exactObject(resolveFull.permissions, exactReadPermissions) || !hasLocalStep(resolveFull, localActionUse(stableFollowupActionPaths.homebrewFullHandoff)) ||
      !publishFull || !needsExactly(publishFull, ['resolve-homebrew-full']) ||
      publishFull.uses !== './.github/workflows/_release-homebrew-full-publish.yml' ||
      !exactObject(publishFull.permissions, exactReadPermissions) || publishFull.secrets !== 'inherit' ||
      Object.prototype.hasOwnProperty.call(publishFull, 'steps'),
    'Stable observation and Homebrew lanes must be mutually routed leaves with no second public entry',
  );
  failures += failIf(
    id,
    !isAuthorizedFullAddonFollowerWriteJob(stableFollowupWorkflowPath, 'reconcile-full-addon', jobs['reconcile-full-addon']),
    'Stable Full reconciliation must be one source-bound controller action',
  );
  failures += failIf(
    id,
    !isAuthorizedStableDesktopFollowupWriteJob(stableFollowupWorkflowPath, 'reconcile-desktop-platforms', jobs['reconcile-desktop-platforms']) ||
      !isAuthorizedStableDesktopFollowupWriteJob(stableFollowupWorkflowPath, 'repair-additive', jobs['repair-additive']),
    'Stable Desktop and additive repair writes must remain isolated protected leaves',
  );
  failures += failIf(
    id,
    jobs.admit?.if !== "${{ needs.route.outputs.desktop_platforms == 'true' }}" || !needsExactly(jobs.admit, ['route']) ||
      jobs['repair-admit']?.if !== "${{ needs.route.outputs.repair_additive == 'true' }}" || !needsExactly(jobs['repair-admit'], ['route']),
    'Stable Desktop and repair admission must be selected only by the typed router',
  );

  const { observe: observeAction, fullAddon: fullAddonAction, homebrewStandard: homebrewStandardAction, homebrewFullHandoff: homebrewFullAction } = actions;
  if ([observeAction, fullAddonAction, homebrewStandardAction, homebrewFullAction].some((a) => !a || a.workflow.runs?.using !== 'composite')) {
    failures += reportFailure(id, 'Every Stable follower implementation leaf must be a local composite action');
  } else {
    for (const [name, action] of Object.entries(actions)) {
      if (action) failures += validateExactActionPins(stableFollowupActionPaths[name as keyof typeof stableFollowupActionPaths], 'composite', actionSteps(action.workflow));
    }
    failures += requireSubstrings(id, observeAction!.text, ['release-attempt-observability.ts', 'opl-release-attempt-observation-${{ inputs.source_run_id }}'], 'Stable observation leaf is missing');
    failures += requireSubstrings(id, fullAddonAction!.text, [
      'RECONCILE_CONFIRMATION: reconcile_full_addon', 'opl-release-standard-checkpoint-$SOURCE_RUN_ID',
      'opl-release-standard-operation-checkpoint-$SOURCE_RUN_ID', 'stable-release-dispatch.ts', 'append-full',
      '--execute', 'published|owner_identified|dispatched', '.plan.source.run_id', 'waits_for_owner_completion:false', 'opl_app_full_addon_follower.v1',
    ], 'Stable Full action is missing');
    failures += failIf(
      id,
      /failed_(?:follower|recovery)_run_id|actions\/workflows\/release-stable\.yml\/dispatches|gh run (?:rerun|cancel)|seq 1 840/.test(fullAddonAction!.text),
      'Stable Full action must reconcile target state without polling or a second dispatcher',
    );
    const homebrewStandardRuns = actionSteps(homebrewStandardAction!.workflow).map((s) => typeof s.run === 'string' ? s.run : '').join('\n');
    failures += requireSubstrings(id, homebrewStandardRuns, [
      'reconcile_published_homebrew_standard', 'opl_homebrew_standard_follower_handoff.v1', 'same_tag_replacement_allowed: true',
      'core_release_or_latest_blocking: false', '--remote-write-mode inspect_only', '--remote-write-mode direct_commit',
      '--expected-current-cask-sha256', 'idempotent_concurrent', 'core_release_or_latest_blocked:false',
      'second_push_attempted:false', 'current-main.json',
    ], 'Stable Homebrew Standard action is missing');
    failures += failIf(id, (homebrewStandardRuns.match(/git -C tap-source push --no-force/g) ?? []).length !== 1, 'Stable Homebrew Standard action must contain exactly one non-force push');
    failures += failIf(
      id,
      /for attempt in 1 2 3|new_release_revision_required|gh release (?:create|edit|upload|delete)/.test(homebrewStandardRuns),
      'Stable Homebrew Standard action must use one same-tag CAS without release or version allocation',
    );
    failures += requireSubstrings(id, homebrewFullAction!.text, [
      'reconcile_published_homebrew_full', 'opl-release-full-published-${AUTHORITY_RUN_ID}', 'homebrew-full-handoff.json',
      'opl_homebrew_full_follower_handoff.v1', '.source.completed_stage == "full_qualified"',
      '.source.checkpoint_transport_executor == "github_actions"', '.homebrew_modified == false', 'test "$GITHUB_REF" = refs/heads/main',
    ], 'Stable Homebrew Full handoff action is missing');
    failures += failIf(
      id,
      /git\b[^\n]*\bpush\b|OPL_HOMEBREW_TAP_TOKEN|failed_(?:follower|recovery)_run_id/.test(homebrewFullAction!.text),
      'Stable Homebrew Full handoff must not own Tap mutation or recovery history',
    );
  }

  const desktopAddonJobs = workflowJobs(desktopPlatformAddon.workflow);
  const { 'build-platform': desktopBuild, 'append-platform': desktopAppend, receipt: desktopReceipt } = desktopAddonJobs;
  failures += failIf(
    id,
    !sameJson(Object.keys(desktopPlatformAddon.workflow.on ?? {}), ['workflow_call']) ||
      !exactObject(desktopPlatformAddon.workflow.permissions, exactReadPermissions) ||
      !sameJson(Object.keys(desktopAddonJobs), ['verify-standard-quality', 'build-platform', 'append-platform', 'receipt']) ||
      desktopBuild?.uses !== './.github/workflows/build-manual.yml' || desktopBuild?.concurrency !== undefined ||
      typeof desktopBuild?.with?.platform_ids !== 'string' || !desktopBuild.with.platform_ids.includes('inputs.platform_id') ||
      !desktopAppend || !needsExactly(desktopAppend, ['verify-standard-quality', 'build-platform']) ||
      desktopAppend.environment !== 'release-stable' || !exactObject(desktopAppend.permissions, exactStableEntryPermissions) ||
      !hasStableMutationMutex(desktopAppend) || !desktopReceipt || desktopReceipt.if !== '${{ always() }}' ||
      !needsExactly(desktopReceipt, ['verify-standard-quality', 'build-platform', 'append-platform']),
    'Desktop add-on must keep build, same-tag append, and receipt as one reusable leaf',
  );

  const certificationTriggers = optionalCertification.workflow.on ?? {};
  const certificationJobs = workflowJobs(optionalCertification.workflow);
  failures += failIf(
    id,
    !sameJson(Object.keys(certificationTriggers).sort(), ['workflow_dispatch', 'workflow_run']) ||
      !sameJson(certificationTriggers.workflow_run?.workflows, ['OPL Stable Follow-ups']) ||
      !sameJson(certificationTriggers.workflow_run?.types, ['completed']) ||
      !sameJson(certificationTriggers.workflow_dispatch?.inputs?.operation?.options, ['verify_existing_repair', 'verify_existing_desktop']) ||
      !exactObject(optionalCertification.workflow.permissions, exactReadPermissions) ||
      optionalCertification.workflow.concurrency?.group !== "opl-desktop-artifact-certification-${{ github.event_name == 'workflow_dispatch' && inputs.followup_run_id || github.event.workflow_run.id }}" ||
      optionalCertification.workflow.concurrency?.['cancel-in-progress'] !== false ||
      !sameJson(Object.keys(certificationJobs), ['resolve-app-release', 'certify-linux-x64', 'admit-macos-vm', 'certify-standard-vm', 'receipt']),
    'Optional certification must be a read-only follower of the single Stable follow-up hub',
  );
  for (const jobId of ['resolve-app-release', 'certify-linux-x64', 'admit-macos-vm', 'receipt']) {
    const job = certificationJobs[jobId];
    failures += failIf(id, !job || job['runs-on'] !== 'ubuntu-latest' || !Array.isArray(job.steps), `Optional certification job ${jobId} must stay GitHub-hosted`);
  }
  const certifyStandardVm = certificationJobs['certify-standard-vm'];
  failures += failIf(
    id,
    !certifyStandardVm || certifyStandardVm.uses !== './.github/workflows/opl-first-run-vm.yml' ||
      Object.prototype.hasOwnProperty.call(certifyStandardVm, 'steps') ||
      Object.prototype.hasOwnProperty.call(certifyStandardVm, 'runs-on') ||
      !exactObject(certifyStandardVm.permissions, exactReadPermissions) ||
      !exactObject(certifyStandardVm.with, {
        release_tag: '${{ needs.resolve-app-release.outputs.tag }}',
        published_artifact_name: '${{ needs.resolve-app-release.outputs.standard_artifact_name }}',
        published_artifact_digest: '${{ needs.resolve-app-release.outputs.standard_artifact_digest }}',
        artifact_app_ref: '${{ needs.resolve-app-release.outputs.app_sha }}',
        shell_ref: '${{ needs.resolve-app-release.outputs.shell_sha }}',
        smoke_harness_ref: '${{ needs.resolve-app-release.outputs.shell_sha }}',
        framework_ref: '${{ needs.resolve-app-release.outputs.framework_sha }}',
        package_profile: 'standard',
        diagnostic_scope: 'post_publication_optional_certification',
        require_macos_gatekeeper: true,
      }),
    'Optional macOS certification must consume exact published Standard bytes',
  );
  failures += requireSubstrings(id, optionalCertification.text, [
    '.path == ".github/workflows/release-stable-post-success-followups.yml"',
    'opl-stable-app-release-followup-${source_run_id}', 'opl-stable-desktop-append-${source_run_id}',
    'opl_app_desktop_artifacts_certification.v1', 'required_for_publication:false',
    'remaining:[]', 'reason_code=operator_deferred',
  ], 'Optional certification is missing');
  failures += failIf(
    id,
    /contents: write|packages: write|gh workflow run|gh run (?:rerun|cancel)|gh release (?:create|edit|upload|delete)|opl release (?:build|publish|reconcile)|codesign|notarize/.test(optionalCertification.text),
    'Optional certification must not dispatch, rebuild, sign, or publish',
  );
  failures += requireSubstrings(id, optionalCertificationVm.text, [
    'published_artifact_name', 'published_artifact_digest', 'post_publication_status',
    'post_publication_reason_code', 'post_publication_job_started', 'post_publication_execution_started',
    'post_publication_classification_valid', 'PUBLISHED_ARTIFACT_NAME: ${{ inputs.published_artifact_name }}',
    'download_pattern="$PUBLISHED_ARTIFACT_NAME"', 'keys == ["reason_code","schema","source_vm","status"]',
    '.source_vm == $source_vm', '.framework_source_archive == null',
    'clone_vm|configure_display|start_vm|wait_for_ip|wait_for_ssh',
    'actual_digest="sha256:$(shasum -a 256 "$dmg_path"',
    "diagnostic_scope != 'post_publication_optional_certification'",
  ], 'Optional certification VM path is missing');
  failures += failIf(
    id,
    optionalCertificationVm.text.includes("download_pattern='${{ inputs.published_artifact_name }}'"),
    'Optional certification VM must pass published artifact names through step env',
  );
  return failures;
}
