import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  exactObject,
  jobRuns,
  jobEvidenceText,
  workflowJobs,
  needsExactly,
  parseWorkflow,
  reportFailure,
} from '../report.ts';
import {
  exactReadPermissions,
  exactNightlyPublishPermissions,
  nightlyReleaseWorkflowPath,
  nightlyFollowupWorkflowPath,
} from '../workflow-policy.ts';

export function validateNightlyReleaseTopology(appRoot: string): number {
  const id = 'nightly_release_topology';
  const release = parseWorkflow(appRoot, nightlyReleaseWorkflowPath, id);
  const followup = parseWorkflow(appRoot, nightlyFollowupWorkflowPath, id);
  if (!release || !followup) return [release, followup].filter((value) => !value).length;
  let failures = 0;
  const scheduledNightlyDispatchers = fs.readdirSync(path.join(appRoot, '.github/workflows'))
    .filter((name) => name.endsWith('.yml'))
    .filter((name) => {
      const workflow = parseYaml(
        fs.readFileSync(path.join(appRoot, '.github/workflows', name), 'utf8'),
      ) as Record<string, any>;
      return typeof workflow.name === 'string'
        && /nightly/i.test(workflow.name)
        && Object.prototype.hasOwnProperty.call(workflow.on ?? {}, 'schedule');
    })
    .sort();
  if (JSON.stringify(scheduledNightlyDispatchers) !== JSON.stringify(['release-nightly.yml'])) {
    failures += reportFailure(id, 'Nightly must have exactly one scheduled dispatcher: release-nightly.yml');
  }
  const releaseJobs = workflowJobs(release.workflow);
  const developmentValidationInputs = release.workflow.on?.workflow_dispatch?.inputs ?? {};
  const developmentValidationConfirmation = developmentValidationInputs.operator_confirmation;
  if (
    JSON.stringify(Object.keys(release.workflow.on ?? {}).sort()) !==
      JSON.stringify(['schedule', 'workflow_dispatch'])
    || JSON.stringify(release.workflow.on?.schedule) !== JSON.stringify([{ cron: '17 19 * * *' }])
    || JSON.stringify(Object.keys(developmentValidationInputs)) !== JSON.stringify(['operator_confirmation'])
    || developmentValidationConfirmation?.required !== true
    || developmentValidationConfirmation?.type !== 'string'
    || !exactObject(release.workflow.permissions, exactReadPermissions)
    || !exactObject(release.workflow.concurrency, {
      group: 'opl-standard-nightly',
      'cancel-in-progress': false,
    })
    || JSON.stringify(Object.keys(releaseJobs)) !==
      JSON.stringify(['admission', 'standard-build', 'qualify-and-publish'])
  ) {
    failures += reportFailure(id, 'Nightly must keep one daily production schedule and one user-explicit development-validation entry on the same Standard prerelease lane');
  }
  const admission = releaseJobs.admission;
  const build = releaseJobs['standard-build'];
  const publish = releaseJobs['qualify-and-publish'];
  if (
    !admission
    || !exactObject(admission.permissions, exactReadPermissions)
    || !build
    || build.uses !== './.github/workflows/_build-reusable.yml'
    || !needsExactly(build, ['admission'])
    || !exactObject(build.permissions, exactReadPermissions)
    || build.secrets !== undefined
    || build.with?.require_macos_gatekeeper !== false
    || Object.prototype.hasOwnProperty.call(build.with ?? {}, 'release_bundle_digest')
    || Object.prototype.hasOwnProperty.call(build.with ?? {}, 'release_cohort_ref')
    || Object.prototype.hasOwnProperty.call(build.with ?? {}, 'operation')
    || !publish
    || !needsExactly(publish, ['admission', 'standard-build'])
    || publish.environment !== 'release-nightly'
    || !exactObject(publish.permissions, exactNightlyPublishPermissions)
  ) {
    failures += reportFailure(id, 'Nightly must reuse the physical build without Stable Bundle authority and protect only its thin publisher');
  }
  for (const required of [
    'test "$GITHUB_RUN_ATTEMPT" = 1',
    'GITHUB_EVENT_NAME',
    'publish_nonlatest_nightly',
    'invocation_mode=scheduled_production',
    'invocation_mode=development_validation',
    'authority_source=daily_schedule',
    'authority_source=user_explicit',
    '--invocation-mode "$invocation_mode"',
    '--event "$GITHUB_EVENT_NAME"',
    '--authority-source "$authority_source"',
    '.invocation.mode',
    '.invocation.event',
    '.invocation.authority_source',
    'refs/heads/main',
    'TZ=Asia/Shanghai',
    'resolve-nightly-release-request.ts',
    'nightly-release-qualification.ts',
    'nightly-release-notes.ts',
    'nightly-notes-baseline.json',
    'nightly-notes-evidence.json',
    '--qualification nightly-qualification.json',
    '--shell-root ${{ needs.admission.outputs.shell_root }}',
    '--framework-root framework-source',
    'nightly-release-publisher.ts',
    'require_macos_gatekeeper: false',
    'github_release.make_latest',
    '.include_full',
    'heavy_vm_required',
  ]) {
    if (!release.text.includes(required)) {
      failures += reportFailure(id, `Nightly release is missing ${required}`);
    }
  }
  if (
    /opl-release-bundle-global|uses: \.\/\.github\/workflows\/_release-bundle\.yml|uses: \.\/\.github\/workflows\/opl-first-run-vm\.yml|require_macos_gatekeeper: true|make_latest:\s*(?:true|'true')|_release-full-addon|release-webui|manual-full-preview|update-homebrew|homebrew.*(?:gate|publish|tap|cask)|(?:gate|publish|tap|cask).*homebrew|\btart\b/i.test(
      release.text,
    )
  ) {
    failures += reportFailure(id, 'Nightly source must not enter Stable Bundle, heavy VM, Full, WebUI, Latest, manual Preview, Homebrew, or Tart paths');
  }

  const followupJobs = workflowJobs(followup.workflow);
  const homebrewJob = followupJobs['publish-nightly-cask'];
  const resolve = followupJobs['resolve-sample'];
  const vm = followupJobs['sampled-standard-vm'];
  const followupInputs = followup.workflow.on?.workflow_dispatch?.inputs ?? {};
  if (
    JSON.stringify(Object.keys(followup.workflow.on ?? {}).sort()) !==
      JSON.stringify(['workflow_dispatch', 'workflow_run'])
    || JSON.stringify(followup.workflow.on?.workflow_run?.workflows) !==
      JSON.stringify(['OPL Standard Nightly Release'])
    || JSON.stringify(followup.workflow.on?.workflow_run?.types) !== JSON.stringify(['completed'])
    || JSON.stringify(Object.keys(followupInputs)) !== JSON.stringify(['operation', 'source_run_id', 'smoke_harness_ref', 'framework_executor_ref'])
    || JSON.stringify(followupInputs.operation?.options) !== JSON.stringify([
      'reconcile_homebrew', 'run_sampled_vm',
    ])
    || followupInputs.source_run_id?.required !== true
    || followupInputs.source_run_id?.type !== 'string'
    || followupInputs.smoke_harness_ref?.required !== false
    || followupInputs.smoke_harness_ref?.type !== 'string'
    || followupInputs.framework_executor_ref?.required !== false
    || followupInputs.framework_executor_ref?.type !== 'string'
    || !exactObject(followup.workflow.permissions, exactReadPermissions)
    || followup.workflow.concurrency !== undefined
    || JSON.stringify(Object.keys(followupJobs)) !== JSON.stringify([
      'publish-nightly-cask', 'resolve-sample', 'sampled-standard-vm',
    ])
    || !homebrewJob
    || homebrewJob.if !== "${{ (github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success') || (github.event_name == 'workflow_dispatch' && inputs.operation == 'reconcile_homebrew') }}"
    || homebrewJob.environment !== 'release-nightly'
    || !exactObject(homebrewJob.permissions, exactReadPermissions)
    || !resolve
    || resolve.if !== "${{ (github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success') || (github.event_name == 'workflow_dispatch' && inputs.operation == 'run_sampled_vm') }}"
    || !exactObject(resolve.permissions, exactReadPermissions)
    || !vm
    || vm.if !== "${{ needs.resolve-sample.outputs.sampled == 'true' }}"
    || vm.uses !== './.github/workflows/opl-first-run-vm.yml'
    || !needsExactly(vm, ['resolve-sample'])
    || !exactObject(vm.permissions, exactReadPermissions)
    || vm.with?.package_profile !== 'standard'
    || vm.with?.framework_executor_ref !== "${{ inputs.framework_executor_ref || '' }}"
    || vm.with?.require_macos_gatekeeper !== false
    || Object.prototype.hasOwnProperty.call(vm.with ?? {}, 'release_bundle_digest')
    || Object.prototype.hasOwnProperty.call(vm.with ?? {}, 'operation')
  ) {
    failures += reportFailure(
      id,
      'Nightly follow-ups must expose one hub with mutually exclusive Homebrew and sampled VM lanes',
    );
  }
  const homebrewRuns = jobRuns(homebrewJob);
  for (const required of [
    '.path == ".github/workflows/release-nightly.yml"',
    '.event == "schedule" or .event == "workflow_dispatch"',
    '.actions.run_id == $run',
    '.actions.run_attempt == "1"',
    '.invocation.event == $event',
    'mode: "scheduled_production"',
    'mode: "development_validation"',
    '.cohort.app_sha == $head',
    '.run_attempt == 1',
    'OPL_HOMEBREW_TAP_DEPLOY_KEY',
    'git@github.com:${tap_repo}.git',
    'IdentitiesOnly=yes',
    'StrictHostKeyChecking=yes',
    'update-homebrew-tap.ts',
    '--channel nightly',
    'Casks/one-person-lab-nightly.rb',
    'Casks/one-person-lab.rb',
    'stable_before',
    'stable_after',
    'no retry is allowed',
    'retry_performed:false',
  ]) {
    if (!homebrewRuns.includes(required)) {
      failures += reportFailure(id, `Nightly Homebrew follower is missing ${required}`);
    }
  }
  if ((homebrewRuns.match(/git -C tap-source push --no-force/g) ?? []).length !== 1) {
    failures += reportFailure(id, 'Nightly Homebrew follower must contain exactly one ordinary non-force push');
  }
  if (
    /one-person-lab-full\.rb|make_latest:\s*(?:true|'true')|gh workflow run|gh run (?:rerun|cancel)|OPL_HOMEBREW_TAP_TOKEN|environment:\s*release-stable/.test(
      jobEvidenceText(homebrewJob),
    )
  ) {
    failures += reportFailure(
      id,
      'Nightly Homebrew follower must not contain VM, Full, Latest, dispatch, retry, or Stable credential paths',
    );
  }

  if (
    !jobEvidenceText(resolve).includes('TZ=Asia/Shanghai date +%u')
    || !jobEvidenceText(resolve).includes('.event == "schedule" or .event == "workflow_dispatch"')
    || !jobEvidenceText(resolve).includes('.actions.run_id == $run')
    || !jobEvidenceText(resolve).includes('.actions.run_attempt == "1"')
    || !jobEvidenceText(resolve).includes('.invocation.event == $event')
    || !jobEvidenceText(resolve).includes('mode:"scheduled_production"')
    || !jobEvidenceText(resolve).includes('mode:"development_validation"')
    || !jobEvidenceText(resolve).includes('authority_source:"user_explicit"')
    || !jobEvidenceText(resolve).includes('.cohort.app_sha == $head')
    || !jobEvidenceText(resolve).includes('heavy_vm_blocking == false')
    || /contents: write|packages: write|update-homebrew|make_latest:\s*(?:true|'true')|make_latest\s*==\s*true|gh release/.test(jobEvidenceText(resolve))
  ) {
    failures += reportFailure(id, 'Nightly sampled VM must stay low-frequency and mutation-free');
  }
  return failures;
}
