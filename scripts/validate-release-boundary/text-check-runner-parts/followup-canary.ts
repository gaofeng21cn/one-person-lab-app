import {
  exactObject,
  requestsWritePermission,
  jobRuns,
  workflowJobs,
  parseWorkflow,
  reportFailure,
} from './report.ts';
import { exactReadPermissions, validateExactActionPins } from './workflow-policy.ts';
import { workflowMutationCommandPattern } from './mutation-policy.ts';

export function validateReleaseBundleCanaryTopology(appRoot: string): number {
  const id = 'release_bundle_canary_topology';
  const parsed = parseWorkflow(appRoot, '.github/workflows/release-bundle-canary.yml', id);
  if (!parsed) return 1;
  const { workflow, text } = parsed;
  let failures = 0;
  const triggers = workflow.on ?? {};
  const schedule = triggers.schedule;
  if (JSON.stringify(Object.keys(triggers).sort()) !==
      JSON.stringify(['schedule', 'workflow_dispatch']) ||
      !Array.isArray(schedule) || schedule.length !== 1 ||
      schedule[0]?.cron !== '0 13 * * *') {
    failures += reportFailure(id, 'Canary must expose only explicit manual dispatch and the one daily schedule');
  }
  if (!exactObject(workflow.concurrency, {
    group: 'opl-release-validation-canary-${{ github.ref }}',
    'cancel-in-progress': true,
  })) {
    failures += reportFailure(id, 'Canary must use its own cancellable validation concurrency, not the Stable mutation mutex');
  }
  if (!exactObject(workflow.permissions, exactReadPermissions)) {
    failures += reportFailure(id, 'Canary permissions must be exactly contents:read/actions:read');
  }
  if (/^\s*secrets:/m.test(text) || workflowMutationCommandPattern.test(text) ||
      text.includes('opl-release-bundle-global')) {
    failures += reportFailure(id, 'Canary must not receive secrets or contain mutation commands');
  }

  const jobs = workflowJobs(workflow);
  if (JSON.stringify(Object.keys(jobs)) !== JSON.stringify([
    'framework-checkpoint-roundtrip', 'contract',
  ])) {
    failures += reportFailure(
      id,
      'Canary must contain only Framework checkpoint semantics and App contract verification',
    );
  }
  const framework = jobs['framework-checkpoint-roundtrip'];
  const contract = jobs.contract;
  if (
    !framework
    || framework['runs-on'] !== 'ubuntu-latest'
    || framework['timeout-minutes'] !== 20
    || !exactObject(framework.permissions, exactReadPermissions)
    || !jobRuns(framework).includes("--test-name-pattern='portable checkpoint switches executors|elapsed absolute deadline blocks'")
    || !jobRuns(framework).includes('tests/src/cli/cases/release-bundle.test.ts')
    || !contract
    || contract['runs-on'] !== 'ubuntu-latest'
    || requestsWritePermission(contract.permissions)
    || !jobRuns(contract).includes('tests/release/release-bundle-workflow-cutover.test.ts')
    || !jobRuns(contract).includes('tests/release/release-control-plane-boundary.test.ts')
  ) {
    failures += reportFailure(id, 'Canary jobs must run the two exact read-only contract checks');
  }
  for (const [jobId, job] of Object.entries(jobs)) {
    if (job.uses !== undefined || requestsWritePermission(job.permissions) || job.secrets !== undefined) {
      failures += reportFailure(
        id,
        `${jobId} must remain a local read-only check and cannot start a reusable release workflow`,
      );
    }
    failures += validateExactActionPins(
      '.github/workflows/release-bundle-canary.yml',
      jobId,
      Array.isArray(job.steps) ? job.steps : [],
    );
  }
  if (/uses:\s*\.\/\.github\/workflows\//.test(text)) {
    failures += reportFailure(id, 'Canary must not reintroduce reusable release workflow entry jobs');
  }
  return failures;
}
