import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  exactObject,
  failIf,
  jobRuns,
  jobEvidenceText,
  workflowJobs,
  needsExactly,
  parseWorkflow,
  requireSubstrings,
  sameJson,
} from './report.ts';
import {
  exactReadPermissions,
  exactNightlyPublishPermissions,
  nightlyReleaseWorkflowPath,
  nightlyFollowupWorkflowPath,
} from './workflow-policy.ts';

export function validateNightlyReleaseTopology(appRoot: string): number {
  const id = 'nightly_release_topology';
  const release = parseWorkflow(appRoot, nightlyReleaseWorkflowPath, id);
  const followup = parseWorkflow(appRoot, nightlyFollowupWorkflowPath, id);
  if (!release || !followup) return [release, followup].filter((value) => !value).length;

  let failures = 0;
  const scheduledNightlyDispatchers = fs.readdirSync(path.join(appRoot, '.github/workflows'))
    .filter((name) => name.endsWith('.yml'))
    .filter((name) => {
      const workflow = parseYaml(fs.readFileSync(path.join(appRoot, '.github/workflows', name), 'utf8')) as Record<string, any>;
      return typeof workflow.name === 'string' && /nightly/i.test(workflow.name) && Object.prototype.hasOwnProperty.call(workflow.on ?? {}, 'schedule');
    })
    .sort();
  failures += failIf(id, !sameJson(scheduledNightlyDispatchers, ['release-nightly.yml']), 'Nightly must have exactly one scheduled dispatcher: release-nightly.yml');

  const releaseJobs = workflowJobs(release.workflow);
  const devInputs = release.workflow.on?.workflow_dispatch?.inputs ?? {};
  const devConfirm = devInputs.operator_confirmation;
  const controlRun = devInputs.opl_release_control_run_id;
  failures += failIf(
    id,
    !sameJson(Object.keys(release.workflow.on ?? {}).sort(), ['schedule', 'workflow_dispatch']) ||
      !sameJson(release.workflow.on?.schedule, [{ cron: '17 19 * * *' }]) ||
      !sameJson(Object.keys(devInputs), ['operator_confirmation', 'opl_release_control_run_id']) ||
      devConfirm?.required !== false || devConfirm?.type !== 'string' ||
      controlRun?.required !== false || controlRun?.type !== 'string' ||
      !exactObject(release.workflow.permissions, exactReadPermissions) ||
      !exactObject(release.workflow.concurrency, { group: 'opl-standard-nightly', 'cancel-in-progress': false }) ||
      !sameJson(Object.keys(releaseJobs), ['admission', 'standard-build', 'qualify-and-publish']),
    'Nightly requires the local schedule, the controller correlation input, and explicit development validation on one Standard prerelease lane',
  );

  const { admission, 'standard-build': build, 'qualify-and-publish': publish } = releaseJobs;
  const preflight = admission?.steps?.find((step: Record<string, any>) => step.name === 'Check Nightly publication credential availability');
  failures += failIf(
    id,
    !admission || admission.environment !== "${{ github.ref == 'refs/heads/main' && 'release-stable' || null }}" ||
      !exactObject(admission.permissions, exactReadPermissions) ||
      preflight?.env?.NIGHTLY_PUBLISHER_CONFIGURED !== "${{ secrets.OPL_GITHUB_RELEASE_ADMIN_TOKEN != '' }}" ||
      !build || build.uses !== './.github/workflows/_build-reusable.yml' || !needsExactly(build, ['admission']) ||
      !exactObject(build.permissions, exactReadPermissions) || build.secrets !== undefined ||
      build.with?.require_macos_gatekeeper !== false ||
      ['release_bundle_digest', 'release_cohort_ref', 'operation'].some((key) => Object.prototype.hasOwnProperty.call(build.with ?? {}, key)) ||
      !publish || !needsExactly(publish, ['admission', 'standard-build']) ||
      publish.environment !== 'release-stable' || !exactObject(publish.permissions, exactNightlyPublishPermissions),
    'Nightly must check the shared App Release credential before building and use it for publication',
  );
  failures += requireSubstrings(id, release.text, [
    'test "$GITHUB_RUN_ATTEMPT" = 1', 'GITHUB_EVENT_NAME', 'publish_nonlatest_nightly',
    'invocation_mode=scheduled_production', 'invocation_mode=development_validation',
    'authority_source=daily_schedule', 'authority_source=opl_release_control', 'authority_source=user_explicit',
    '--invocation-mode "$invocation_mode"', '--event "$GITHUB_EVENT_NAME"',
    '--authority-source "$authority_source"', '.invocation.mode', '.invocation.event',
    '.invocation.authority_source', 'refs/heads/main', 'TZ=Asia/Shanghai',
    'resolve-nightly-release-request.ts', 'nightly-release-qualification.ts',
    'nightly-release-notes.ts', 'nightly-notes-baseline.json', 'nightly-notes-evidence.json',
    '--qualification nightly-qualification.json', '--shell-root ${{ needs.admission.outputs.shell_root }}',
    '--framework-root framework-source', 'nightly-release-publisher.ts',
    'require_macos_gatekeeper: false', 'github_release.make_latest', '.include_full', 'heavy_vm_required',
  ], 'Nightly release is missing');
  failures += failIf(
    id,
    /opl-release-bundle-global|uses: \.\/\.github\/workflows\/_release-bundle\.yml|uses: \.\/\.github\/workflows\/opl-first-run-vm\.yml|require_macos_gatekeeper: true|make_latest:\s*(?:true|'true')|_release-full-addon|release-webui|manual-full-preview|update-homebrew|homebrew.*(?:gate|publish|tap|cask)|(?:gate|publish|tap|cask).*homebrew|\btart\b/i.test(release.text),
    'Nightly source must not enter Stable Bundle, heavy VM, Full, WebUI, Latest, manual Preview, Homebrew, or Tart paths',
  );

  const followupJobs = workflowJobs(followup.workflow);
  const { 'publish-nightly-cask': homebrewJob, 'resolve-sample': resolve, 'sampled-standard-vm': vm } = followupJobs;
  const followupInputs = followup.workflow.on?.workflow_dispatch?.inputs ?? {};
  failures += failIf(
    id,
    !sameJson(Object.keys(followup.workflow.on ?? {}).sort(), ['workflow_dispatch', 'workflow_run']) ||
      !sameJson(followup.workflow.on?.workflow_run?.workflows, ['OPL Standard Nightly Release']) ||
      !sameJson(followup.workflow.on?.workflow_run?.types, ['completed']) ||
      !sameJson(Object.keys(followupInputs), ['operation', 'source_run_id', 'smoke_harness_ref', 'framework_executor_ref']) ||
      !sameJson(followupInputs.operation?.options, ['reconcile_homebrew', 'run_sampled_vm']) ||
      followupInputs.source_run_id?.required !== true || followupInputs.source_run_id?.type !== 'string' ||
      followupInputs.smoke_harness_ref?.required !== false || followupInputs.smoke_harness_ref?.type !== 'string' ||
      followupInputs.framework_executor_ref?.required !== false || followupInputs.framework_executor_ref?.type !== 'string' ||
      !exactObject(followup.workflow.permissions, exactReadPermissions) || followup.workflow.concurrency !== undefined ||
      !sameJson(Object.keys(followupJobs), ['publish-nightly-cask', 'resolve-sample', 'sampled-standard-vm']) ||
      !homebrewJob || homebrewJob.if !== "${{ (github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success') || (github.event_name == 'workflow_dispatch' && inputs.operation == 'reconcile_homebrew') }}" ||
      homebrewJob.environment !== 'release-nightly' || !exactObject(homebrewJob.permissions, exactReadPermissions) ||
      !resolve || resolve.if !== "${{ (github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success') || (github.event_name == 'workflow_dispatch' && inputs.operation == 'run_sampled_vm') }}" ||
      !exactObject(resolve.permissions, exactReadPermissions) ||
      !vm || vm.if !== "${{ needs.resolve-sample.outputs.sampled == 'true' }}" ||
      vm.uses !== './.github/workflows/opl-first-run-vm.yml' || !needsExactly(vm, ['resolve-sample']) ||
      !exactObject(vm.permissions, exactReadPermissions) || vm.with?.package_profile !== 'standard' ||
      vm.with?.framework_executor_ref !== "${{ inputs.framework_executor_ref || '' }}" ||
      vm.with?.require_macos_gatekeeper !== false ||
      ['release_bundle_digest', 'operation'].some((key) => Object.prototype.hasOwnProperty.call(vm.with ?? {}, key)),
    'Nightly follow-ups must expose one hub with mutually exclusive Homebrew and sampled VM lanes',
  );

  const homebrewRuns = jobRuns(homebrewJob);
  failures += requireSubstrings(id, homebrewRuns, [
    '.path == ".github/workflows/release-nightly.yml"',
    '.event == "schedule" or .event == "workflow_dispatch"',
    '.actions.run_id == $run', '.actions.run_attempt == "1"', '.invocation.event == $event',
    'mode: "scheduled_production"', 'mode: "development_validation"',
    '.cohort.app_sha == $head', '.run_attempt == 1', 'OPL_HOMEBREW_TAP_DEPLOY_KEY',
    'git@github.com:${tap_repo}.git', 'IdentitiesOnly=yes', 'StrictHostKeyChecking=yes',
    'update-homebrew-tap.ts', '--channel nightly', 'Casks/one-person-lab-nightly.rb',
    'Casks/one-person-lab.rb', 'stable_before', 'stable_after', 'no retry is allowed', 'retry_performed:false',
  ], 'Nightly Homebrew follower is missing');
  failures += failIf(id, (homebrewRuns.match(/git -C tap-source push --no-force/g) ?? []).length !== 1, 'Nightly Homebrew follower must contain exactly one ordinary non-force push');
  failures += failIf(
    id,
    /one-person-lab-full\.rb|make_latest:\s*(?:true|'true')|gh workflow run|gh run (?:rerun|cancel)|OPL_HOMEBREW_TAP_TOKEN|environment:\s*release-stable/.test(jobEvidenceText(homebrewJob)),
    'Nightly Homebrew follower must not contain VM, Full, Latest, dispatch, retry, or Stable credential paths',
  );

  const resolveEvidence = jobEvidenceText(resolve);
  failures += failIf(
    id,
    [
      'TZ=Asia/Shanghai date +%u', '.event == "schedule" or .event == "workflow_dispatch"',
      '.actions.run_id == $run', '.actions.run_attempt == "1"', '.invocation.event == $event',
      'mode:"scheduled_production"', 'mode:"development_validation"',
      'authority_source:"user_explicit"', '.cohort.app_sha == $head', 'heavy_vm_blocking == false',
    ].some((needle) => !resolveEvidence.includes(needle)) ||
      /contents: write|packages: write|update-homebrew|make_latest:\s*(?:true|'true')|make_latest\s*==\s*true|gh release/.test(resolveEvidence),
    'Nightly sampled VM must stay low-frequency and mutation-free',
  );
  return failures;
}
