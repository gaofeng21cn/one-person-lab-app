import fs from 'node:fs';
import path from 'node:path';
import {
  exactObject,
  jobRuns,
  workflowJobs,
  needsExactly,
  parseWorkflow,
  reportFailure,
} from './report.ts';
import { exactReadPermissions, homebrewFullPublisherWorkflowPath } from './workflow-policy.ts';

export function validateHomebrewFullPromotionTopology(appRoot: string): number {
  const id = 'homebrew_full_promotion_topology';
  const publisher = parseWorkflow(appRoot, homebrewFullPublisherWorkflowPath, id);
  if (!publisher) return 1;
  let failures = 0;
  const publisherJobs = workflowJobs(publisher.workflow);
  const publisherInputs = publisher.workflow.on?.workflow_call?.inputs ?? {};
  if (
    JSON.stringify(Object.keys(publisher.workflow.on ?? {})) !== JSON.stringify(['workflow_call'])
    || JSON.stringify(Object.keys(publisherInputs)) !== JSON.stringify(['authority_run_id', 'handoff_base64', 'handoff_sha256'])
    || !exactObject(publisher.workflow.permissions, exactReadPermissions)
    || JSON.stringify(Object.keys(publisherJobs)) !== JSON.stringify(['prepare-candidate', 'publish-cask', 'readback'])
  ) {
    failures += reportFailure(id, 'Full Homebrew reusable must expose only exact handoff inputs and candidate/publish/readback jobs');
  }
  const prepare = publisherJobs['prepare-candidate'];
  const publish = publisherJobs['publish-cask'];
  const readback = publisherJobs.readback;
  if (
    !prepare || prepare.if !== undefined || !exactObject(prepare.permissions, exactReadPermissions)
    || !publish || publish.if !== undefined || !needsExactly(publish, ['prepare-candidate'])
    || publish.environment !== 'release-stable' || !exactObject(publish.permissions, exactReadPermissions)
    || !readback || readback.if !== undefined || !needsExactly(readback, ['prepare-candidate', 'publish-cask'])
    || !exactObject(readback.permissions, exactReadPermissions)
  ) {
    failures += reportFailure(id, 'Full Homebrew reusable must publish the exact hosted-qualified candidate before protected Tap CAS and public readback');
  }
  if (
    /qualify-candidate|opl-first-run-vm\.yml|tart-smoke-summary\.json|smoke_harness_sha|shell-harness|opl-first-run-tart-smoke|--homebrew-cask-file/.test(
      publisher.text,
    )
  ) {
    failures += reportFailure(id, 'Full Homebrew publication must not depend on physical VM certification before protected Tap CAS');
  }
  const prepareRuns = jobRuns(prepare);
  const publishRuns = jobRuns(publish);
  for (const required of [
    'app_full_first_install',
    'inspect_only',
    'version_conflict',
    '--remote-write-mode none',
    'full_dmg_embedded_opl_base',
    'active_framework_count_target',
    'opl-homebrew-full-candidate-${GITHUB_RUN_ID}',
    'homebrew-full-follower-v3:${GITHUB_RUN_ID}',
    't+120*60_000',
    'opl_homebrew_full_observational_binding.v2',
    'workflow_cas_and_unified_attestation_observer',
    'release_mutation_authority_imported:false',
    'max_push_attempts:1',
    'standard_manifest_url=',
    'opl-app-component-manifest.json',
    '--expected-source-commit "$base_target_commitish"',
    'git -C shell-product cat-file -e "$shell_sha:desktop/runtime-bootstrap.mjs"',
    'qualification_receipt_sha256',
    'release-operation-deadline.ts check',
  ]) {
    if (!prepareRuns.includes(required)) failures += reportFailure(id, `Full Homebrew candidate preparation is missing ${required}`);
  }
  for (const required of [
    'release-operation-deadline.ts check',
    'git -C tap-source push --no-force origin "$result_commit:refs/heads/main"',
    'no second push was attempted',
    'opl_homebrew_full_unknown_outcome.v2',
    'required_action:"read_only_reconcile"',
    'git -C tap-source ls-remote origin refs/heads/main',
    'git -C tap-source fetch --no-tags --depth=1 origin "$remote_commit"',
    "git -C tap-source show 'FETCH_HEAD:Casks/one-person-lab-full.rb'",
    'opl_homebrew_full_publication_receipt.v2',
    'authority_model:"workflow_cas_and_unified_attestation_observer"',
    'build_provenance:{app_sha:$app,shell_sha:$shell,framework_sha:$framework}',
  ]) {
    if (!publishRuns.includes(required)) failures += reportFailure(id, `Full Homebrew protected publish is missing ${required}`);
  }
  for (const forbidden of [
    'clean_vm_receipt_sha256',
    'official_profile_first_install',
    'formula_opl_installed_before',
    'formula_opl_installed_after',
  ]) {
    if (publishRuns.includes(forbidden)) {
      failures += reportFailure(id, `Full Homebrew publication must not fabricate optional certification field ${forbidden}`);
    }
  }
  if (/restore-release-checkpoint|framework-executor|opl release (?:operation|publish|reconcile|checkpoint)/.test(publisher.text)) {
    failures += reportFailure(id, 'Full Homebrew observer must not import Framework checkpoint or release mutation authority');
  }
  if ((publishRuns.match(/git -C tap-source push --no-force/g) ?? []).length !== 1) {
    failures += reportFailure(id, 'Full Homebrew publisher must contain exactly one non-force Tap push call');
  }
  if (publisher.text.includes('contents/Casks/one-person-lab-full.rb?ref=main')) {
    failures += reportFailure(id, 'Full Homebrew readback must bind Cask bytes to a fetched exact Tap commit');
  }
  if (
    !publisher.text.includes(
      'OPL_HOMEBREW_TAP_TOKEN: ${{ secrets.OPL_HOMEBREW_TAP_TOKEN }}',
    )
  ) {
    failures += reportFailure(id, 'Full Homebrew token must be scoped to the protected publish job');
  }
  if (prepareRuns.includes('OPL_HOMEBREW_TAP_TOKEN')) {
    failures += reportFailure(id, 'Full Homebrew token must be unreachable before the protected publish job');
  }
  if (/workflow_dispatch:|depends_on formula: "opl"|github-activate-latest|make_latest|release-webui/.test(publisher.text)) {
    failures += reportFailure(id, 'Full Homebrew reusable must remain isolated from Formula, Latest, WebUI, and manual entry paths');
  }
  const vmWorkflow = parseWorkflow(appRoot, '.github/workflows/opl-first-run-vm.yml', id);
  const activeShell = JSON.parse(fs.readFileSync(path.join(appRoot, 'contracts/app-shell-adapter.json'), 'utf8')).active_shell;
  const carriesOfficialProfile = activeShell === 'opl-studio'
    ? Boolean(vmWorkflow?.text.includes('--product-profile "${{ github.workspace }}/contracts/app-product-profile.json"')
      && vmWorkflow.text.includes('scripts/desktop/stable-clean-vm.mjs')
      && vmWorkflow.text.includes("'${{ steps.verification_app.outputs.app_sha }}'"))
    : Boolean(vmWorkflow?.text.includes('oplProductProfile/oplProductProfile.generated.json'));
  if (!carriesOfficialProfile) {
    failures += reportFailure(
      id,
      'Qualification must carry the exact App-owned Official Profile roots into the selected Shell harness',
    );
  }
  return failures;
}
