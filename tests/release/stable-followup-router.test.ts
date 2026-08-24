import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyStableSourceOperation,
  routeCompletedStableRun,
  routeManualStableFollowup,
} from '../../scripts/stable-followup-router.ts';

const sha = 'a'.repeat(40);

function stableRun(displayTitle: string, conclusion = 'success') {
  return {
    id: 424242,
    repository: { full_name: 'gaofeng21cn/one-person-lab-app' },
    head_repository: { full_name: 'gaofeng21cn/one-person-lab-app' },
    path: '.github/workflows/release-stable.yml',
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: sha,
    run_attempt: 1,
    status: 'completed',
    conclusion,
    display_title: displayTitle,
  };
}

test('Stable source operation classification is explicit and fail-closed', () => {
  assert.equal(classifyStableSourceOperation('OPL Stable standard operation:x authority:y run:1'), 'standard');
  assert.equal(classifyStableSourceOperation('OPL Stable resume_standard source:1 run:2'), 'resume_standard');
  assert.equal(classifyStableSourceOperation('OPL Stable append_full source:1 run:2'), 'append_full');
  assert.equal(classifyStableSourceOperation('OPL Stable Studio release ref:a run:2'), 'studio');
  assert.equal(classifyStableSourceOperation('OPL Stable future_operation run:2'), 'unknown');
});

test('successful Standard routes independent additive lanes', () => {
  const route = routeCompletedStableRun(stableRun('OPL Stable standard operation:x authority:y run:424242'));
  assert.deepEqual(route.lanes, {
    observe: true,
    full_addon: true,
    homebrew_standard: true,
    homebrew_full: false,
    desktop_platforms: true,
    repair_additive: false,
  });
});

test('successful Full append routes only Homebrew Full plus observation', () => {
  const route = routeCompletedStableRun(stableRun('OPL Stable append_full source:1 run:424242'));
  assert.deepEqual(route.lanes, {
    observe: true,
    full_addon: false,
    homebrew_standard: false,
    homebrew_full: true,
    desktop_platforms: false,
    repair_additive: false,
  });
});

test('failed and unknown Stable runs remain observation-only', () => {
  for (const run of [
    stableRun('OPL Stable standard operation:x authority:y run:424242', 'failure'),
    stableRun('OPL Stable future_operation run:424242'),
    stableRun('OPL Stable Studio release ref:a run:424242'),
  ]) {
    const route = routeCompletedStableRun(run);
    assert.equal(route.lanes.observe, true);
    assert.deepEqual(Object.values(route.lanes).slice(1), [false, false, false, false, false]);
  }
});

test('manual reconciliation selects exactly one lane', () => {
  const operations = [
    ['reconcile_full_addon', 'full_addon'],
    ['reconcile_homebrew_standard', 'homebrew_standard'],
    ['reconcile_homebrew_full', 'homebrew_full'],
    ['reconcile_desktop_platform', 'desktop_platforms'],
    ['repair_additive', 'repair_additive'],
  ] as const;
  for (const [operation, expectedLane] of operations) {
    const route = routeManualStableFollowup({ sourceRunId: '9', operation });
    assert.equal(route.lanes[expectedLane], true);
    assert.equal(Object.values(route.lanes).filter(Boolean).length, 1);
  }
});

test('router rejects non-canonical source identity and unsupported manual operations', () => {
  assert.throws(
    () => routeCompletedStableRun({ ...stableRun('OPL Stable standard x'), path: '.github/workflows/other.yml' }),
    /canonical Stable run/,
  );
  assert.throws(
    () => routeManualStableFollowup({ sourceRunId: '0', operation: 'reconcile_full_addon' }),
    /positive decimal integer/,
  );
  assert.throws(
    () => routeManualStableFollowup({ sourceRunId: '1', operation: 'rerun_everything' }),
    /Unsupported Stable follow-up operation/,
  );
});
