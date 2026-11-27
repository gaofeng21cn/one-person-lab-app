import {
  exactObject,
  failIf,
  requestsWritePermission,
  jobRuns,
  workflowJobs,
  parseWorkflow,
  reportFailure,
  sameJson,
  validateWorkflowActionPins,
} from './report.ts';
import { exactReadPermissions, validateExactActionPins } from './workflow-policy.ts';
import { workflowMutationCommandPattern } from './mutation-policy.ts';

export function validateReleaseBundleCanaryTopology(appRoot: string): number {
  const id = 'release_bundle_canary_topology';
  const parsed = parseWorkflow(appRoot, '.github/workflows/release-bundle-canary.yml', id);
  if (!parsed) return 1;
  const { workflow, text } = parsed;
  const triggers = workflow.on ?? {};
  const schedule = triggers.schedule;
  const jobs = workflowJobs(workflow);
  const framework = jobs['framework-checkpoint-roundtrip'];
  const contract = jobs.contract;

  let failures = 0;
  failures += failIf(
    id,
    !sameJson(Object.keys(triggers).sort(), ['schedule', 'workflow_dispatch']) ||
      !Array.isArray(schedule) || schedule.length !== 1 || schedule[0]?.cron !== '0 13 * * *',
    'Canary must expose only explicit manual dispatch and the one daily schedule',
  );
  failures += failIf(
    id,
    !exactObject(workflow.concurrency, {
      group: 'opl-release-validation-canary-${{ github.ref }}',
      'cancel-in-progress': true,
    }),
    'Canary must use its own cancellable validation concurrency, not the Stable mutation mutex',
  );
  failures += failIf(id, !exactObject(workflow.permissions, exactReadPermissions), 'Canary permissions must be exactly contents:read/actions:read');
  failures += failIf(
    id,
    /^\s*secrets:/m.test(text) || workflowMutationCommandPattern.test(text) || text.includes('opl-release-bundle-global'),
    'Canary must not receive secrets or contain mutation commands',
  );
  failures += failIf(
    id,
    !sameJson(Object.keys(jobs), ['framework-checkpoint-roundtrip', 'contract']),
    'Canary must contain only Framework checkpoint semantics and App contract verification',
  );
  failures += failIf(
    id,
    !framework || framework['runs-on'] !== 'ubuntu-latest' || framework['timeout-minutes'] !== 20 ||
      !exactObject(framework.permissions, exactReadPermissions) ||
      !jobRuns(framework).includes('packages/runway/tests/cross-engine-handoff.test.ts') ||
      !jobRuns(framework).includes('packages/runway/tests/reconcile-and-lease.test.ts') ||
      !jobRuns(framework).includes('packages/pack/tests/content-lock-and-build.test.ts') ||
      !contract || contract['runs-on'] !== 'ubuntu-latest' || requestsWritePermission(contract.permissions) ||
      !jobRuns(contract).includes('tests/release/release-bundle-workflow-cutover.test.ts') ||
      !jobRuns(contract).includes('tests/release/release-control-plane-boundary.test.ts') ||
      !jobRuns(contract).includes('tests/release/release-bundle-authority.test.ts'),
    'Canary jobs must run the exact read-only contract checks',
  );
  for (const [jobId, job] of Object.entries(jobs)) {
    if (job.uses !== undefined || requestsWritePermission(job.permissions) || job.secrets !== undefined) {
      failures += reportFailure(id, `${jobId} must remain a local read-only check and cannot start a reusable release workflow`);
    }
  }
  failures += validateWorkflowActionPins('.github/workflows/release-bundle-canary.yml', jobs, validateExactActionPins);
  failures += failIf(id, /uses:\s*\.\/\.github\/workflows\//.test(text), 'Canary must not reintroduce reusable release workflow entry jobs');
  return failures;
}
