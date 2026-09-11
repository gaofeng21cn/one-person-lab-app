import test from 'node:test';
import {
  assert,
  fs,
  os,
  path,
  applyPublishPlan,
  buildExecutorReceipt,
  repo,
  tag,
  deadlineAt,
  deadlineMs,
  sourceCommit,
  bundleDigest,
  shellCommit,
  frameworkCommit,
  standardOperationId,
  appendFullOperationId,
  workflowAttemptId,
  mutationAdmission,
  expectedMutationAttemptId,
  success,
  releaseResponse,
  fixture,
  asset,
  isReleaseInspect,
  isReleaseView,
  isTagRefReadFor,
  isTagRefCreateFor,
  tagRefResponse,
} from "./fixtures.ts";
import type {
  GitHubAdapterRuntime,
  GitHubCommandOptions,
  Asset,
} from "./fixtures.ts";

test('absent GitHub Release remote inspection yields an empty receipt for the first upload plan', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-absent-release-receipt-'));
  const bundlePath = path.join(root, 'bundle.json');
  const inspectionPath = path.join(root, 'remote-before.json');
  const requiredNames = ['first.zip', 'second.dmg', 'opl-release-attestation.json'];
  try {
    fs.writeFileSync(bundlePath, `${JSON.stringify({
      surface_kind: 'opl_release_bundle.v1',
      bundle_digest: bundleDigest,
      tracks: { standard: { required_asset_names: requiredNames } },
    })}\n`);
    fs.writeFileSync(inspectionPath, `${JSON.stringify({
      surface_kind: 'opl_app_github_release_inspection.v1',
      repository: repo,
      tag,
      release: { exists: false },
      assets: [],
    })}\n`);
    const receipt = buildExecutorReceipt({
      operation: 'remote_inspect',
      'release-operation': 'standard',
      'operation-id': standardOperationId,
      executor: 'remote',
      'attempt-id': workflowAttemptId,
      'remote-target': `github-release:${repo}@${tag}`,
      track: 'standard',
      outcome: 'complete',
      'publication-scope': 'track_assets',
      bundle: bundlePath,
      inspection: inspectionPath,
    } as any);
    assert.deepEqual(receipt.assets, []);
    assert.equal(receipt.outcome, 'complete');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('absent GitHub Release remote inspection rejects missing, non-empty, or duplicate assets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-malformed-absent-release-receipt-'));
  const bundlePath = path.join(root, 'bundle.json');
  const inspectionPath = path.join(root, 'remote-before.json');
  try {
    fs.writeFileSync(bundlePath, `${JSON.stringify({
      surface_kind: 'opl_release_bundle.v1',
      bundle_digest: bundleDigest,
      tracks: { standard: { required_asset_names: ['first.zip', 'second.dmg'] } },
    })}\n`);
    for (const assets of [
      undefined,
      [{ name: 'unexpected.zip' }],
      [{ name: 'first.zip' }, { name: 'first.zip' }],
    ]) {
      fs.writeFileSync(inspectionPath, `${JSON.stringify({
        surface_kind: 'opl_app_github_release_inspection.v1',
        repository: repo,
        tag,
        release: { exists: false },
        ...(assets === undefined ? {} : { assets }),
      })}\n`);
      assert.throws(
        () => buildExecutorReceipt({
          operation: 'remote_inspect',
          'release-operation': 'standard',
          'operation-id': standardOperationId,
          executor: 'remote',
          'attempt-id': workflowAttemptId,
          'remote-target': `github-release:${repo}@${tag}`,
          track: 'standard',
          outcome: 'complete',
          'publication-scope': 'track_assets',
          bundle: bundlePath,
          inspection: inspectionPath,
        } as any),
        /Remote standard absent-release inspection must contain an empty asset list/,
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('existing GitHub Release remote inspection accepts required assets and known Standard evidence only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-partial-release-receipt-'));
  const bundlePath = path.join(root, 'bundle.json');
  const inspectionPath = path.join(root, 'remote-before.json');
  const requiredNames = ['first.zip', 'second.dmg'];
  const execute = (assets: Array<Record<string, unknown>>, allowSameTagFullAssets = false) => {
    fs.writeFileSync(inspectionPath, `${JSON.stringify({
      surface_kind: 'opl_app_github_release_inspection.v1',
      repository: repo,
      tag,
      release: { exists: true, id: 12345 },
      assets,
    })}\n`);
    return buildExecutorReceipt({
      operation: 'remote_inspect',
      'release-operation': allowSameTagFullAssets ? 'resume_standard' : 'standard',
      'operation-id': standardOperationId,
      executor: 'remote',
      'attempt-id': workflowAttemptId,
      'remote-target': `github-release:${repo}@${tag}`,
      track: 'standard',
      outcome: 'complete',
      'publication-scope': 'track_assets',
      bundle: bundlePath,
      inspection: inspectionPath,
      ...(allowSameTagFullAssets ? { 'allow-same-tag-full-assets': 'true' } : {}),
    } as any);
  };
  try {
    fs.writeFileSync(bundlePath, `${JSON.stringify({
      surface_kind: 'opl_release_bundle.v1',
      bundle_digest: bundleDigest,
      release: { channel: 'stable', version: tag.slice(1), tag },
      tracks: {
        standard: { required_asset_names: requiredNames },
        full: { required_asset_names: ['full.dmg', 'full-manifest.json'] },
      },
    })}\n`);

    assert.deepEqual(execute([]).assets, []);
    const second = asset(requiredNames[1]!, '2');
    assert.deepEqual(execute([second]).assets, [{
      name: second.name,
      size_bytes: second.size_bytes,
      sha256: second.sha256,
    }]);
    const attestation = asset('opl-release-attestation.json', '4');
    assert.deepEqual(execute([attestation, second]).assets, [{
      name: second.name,
      size_bytes: second.size_bytes,
      sha256: second.sha256,
    }]);
    assert.throws(
      () => execute([asset('unknown.bin', '3')]),
      /contains unknown asset unknown\.bin/,
    );
    const full = asset('full.dmg', '6');
    assert.throws(() => execute([full]), /contains unknown asset full\.dmg/);
    assert.deepEqual(execute([full, second], true).assets, [{
      name: second.name,
      size_bytes: second.size_bytes,
      sha256: second.sha256,
    }]);
    assert.throws(
      () => execute([full, asset('unknown.bin', '7')], true),
      /contains unknown asset unknown\.bin/,
    );
    assert.throws(() => execute([second, second]), /contains duplicate asset second\.dmg/);
    assert.throws(
      () => execute([attestation, attestation]),
      /contains duplicate asset opl-release-attestation\.json/,
    );
    assert.throws(
      () => execute([{ ...second, sha256: 'sha256:not-a-digest' }]),
      /has no exact digest and positive size/,
    );
    fs.writeFileSync(bundlePath, `${JSON.stringify({
      surface_kind: 'opl_release_bundle.v1',
      bundle_digest: bundleDigest,
      release: { channel: 'preview' },
      tracks: {
        standard: { required_asset_names: requiredNames },
        full: { required_asset_names: ['full.dmg', 'full-manifest.json'] },
      },
    })}\n`);
    assert.throws(
      () => execute([attestation]),
      /contains unknown asset opl-release-attestation\.json/,
    );
    assert.throws(
      () => execute([asset('stable-operation-publication-record.json', '5')]),
      /contains unknown asset stable-operation-publication-record\.json/,
    );
    assert.throws(
      () => execute([full], true),
      /Same-tag Full asset admission requires one Stable resume_standard inspection/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Full remote inspection accepts well-formed additive Standard follower assets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-additive-inspection-'));
  const bundlePath = path.join(root, 'bundle.json');
  const inspectionPath = path.join(root, 'remote-before.json');
  const fullNames = ['full.dmg', 'full-manifest.json'];
    const followerAssets = [asset('latest.yml', '3'), asset('platform.exe', '4'), asset('Full 额外资产+1.bin', '8')];
  try {
    fs.writeFileSync(bundlePath, `${JSON.stringify({
      surface_kind: 'opl_release_bundle.v1',
      bundle_digest: bundleDigest,
      release: { channel: 'stable', version: tag.slice(1), tag },
      tracks: {
        standard: { required_asset_names: ['first.zip', 'second.dmg'] },
        full: { required_asset_names: fullNames },
      },
    })}\n`);
    fs.writeFileSync(inspectionPath, `${JSON.stringify({
      surface_kind: 'opl_app_github_release_inspection.v1',
      repository: repo,
      tag,
      release: { exists: true, id: 12345 },
      assets: [asset(fullNames[0]!, '5'), asset(fullNames[1]!, '6'), ...followerAssets],
    })}\n`);

    const receipt = buildExecutorReceipt({
      operation: 'remote_inspect',
      'release-operation': 'append_full',
      'operation-id': appendFullOperationId,
      executor: 'remote',
      'attempt-id': workflowAttemptId,
      'remote-target': `github-release:${repo}@${tag}`,
      track: 'full',
      outcome: 'complete',
      'publication-scope': 'track_assets',
      bundle: bundlePath,
      inspection: inspectionPath,
    } as any);
    assert.deepEqual(receipt.assets, [
      { name: fullNames[0], size_bytes: 100, sha256: `sha256:${'5'.repeat(64)}` },
      { name: fullNames[1], size_bytes: 100, sha256: `sha256:${'6'.repeat(64)}` },
    ]);
    fs.writeFileSync(inspectionPath, `${JSON.stringify({
      surface_kind: 'opl_app_github_release_inspection.v1',
      repository: repo,
      tag,
      release: { exists: true, id: 12345 },
      assets: [asset(fullNames[0]!, '5'), asset(fullNames[1]!, '6'), asset('../unsafe.bin', '7')],
    })}\n`);
    assert.throws(
      () => buildExecutorReceipt({
        operation: 'remote_inspect',
        'release-operation': 'append_full',
        'operation-id': appendFullOperationId,
        executor: 'remote',
        'attempt-id': workflowAttemptId,
        'remote-target': `github-release:${repo}@${tag}`,
        track: 'full',
        outcome: 'complete',
        'publication-scope': 'track_assets',
        bundle: bundlePath,
        inspection: inspectionPath,
      } as any),
      /unsafe asset basename/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('deadline expiry before asset N prevents asset N and every later mutation', () => {
  const first = asset('first.zip', '1');
  const second = asset('second.yml', '2');
  const files = fixture([first, second]);
  const remoteAssets: Asset[] = [];
  const mutationCalls: string[][] = [];
  const mutationTimes = [deadlineMs - 60_000, deadlineMs];
  const runtime: GitHubAdapterRuntime = {
    now: () => mutationTimes.shift() ?? deadlineMs,
    readTimeoutMs: 1_234,
    mutationTimeoutMs: 120_000,
    run(command, args, options) {
      assert.equal(command, 'gh');
      assert.equal(options.killSignal, 'SIGTERM');
      if (isReleaseInspect(args)) {
        assert.equal(options.timeout, 1_234);
        return success(releaseResponse(remoteAssets, { draft: true, immutable: false }));
      }
      if (args[0] === 'release' && args[1] === 'upload') {
        mutationCalls.push(args);
        assert.equal(options.timeout, 60_000);
        const uploaded = [first, second].find((candidate) => candidate.source_path === args[3]);
        assert.ok(uploaded);
        remoteAssets.push(uploaded);
        return success();
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };

  const result = applyPublishPlan({
    ...mutationAdmission(),
    bundle: files.bundlePath,
    plan: files.planPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);

  assert.equal(result.status, 'deadline_elapsed');
  assert.deepEqual(result.uploaded, [first.name]);
  assert.equal(result.unresolved_asset, second.name);
  assert.equal(result.failure.failure_taxonomy, 'github_mutation_deadline_elapsed');
  assert.equal(result.mutation_attempt_id, expectedMutationAttemptId(
    'asset_upload', `github-release:${repo}@${tag}`, second.name,
  ));
  assert.equal(result.remote_target, `github-release:${repo}@${tag}`);
  assert.equal(result.failure.mutation_attempt_id, result.mutation_attempt_id);
  assert.equal(result.failure.remote_target, result.remote_target);
  assert.equal(result.failure.input_digest.startsWith('sha256:'), true);
  assert.equal(mutationCalls.length, 1);
  assert.equal(mutationCalls[0][3], first.source_path);
});

test('a timed out asset upload stops all mutation and performs only fresh read-only inspection', () => {
  const first = asset('first.zip', '3');
  const second = asset('second.yml', '4');
  const files = fixture([first, second]);
  const calls: Array<{ args: string[]; options: GitHubCommandOptions }> = [];
  let inspections = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 90_000,
    readTimeoutMs: 2_345,
    run(_command, args, options) {
      calls.push({ args, options });
      if (isReleaseInspect(args)) {
        inspections += 1;
        return success(releaseResponse([], { draft: true, immutable: false }));
      }
      if (args[0] === 'release' && args[1] === 'upload') {
        return {
          status: null,
          signal: 'SIGTERM',
          stdout: 'partial stdout',
          stderr: 'timed out stderr',
          error: Object.assign(new Error('spawnSync gh ETIMEDOUT'), { code: 'ETIMEDOUT' }),
        };
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };

  const result = applyPublishPlan({
    ...mutationAdmission(),
    bundle: files.bundlePath,
    plan: files.planPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);

  const uploads = calls.filter(({ args }) => args[0] === 'release' && args[1] === 'upload');
  assert.equal(result.status, 'outcome_unknown');
  assert.equal(result.unresolved_asset, first.name);
  assert.equal(result.retry_disposition, 'read_only_reconcile_only');
  assert.equal(result.failure.failure_taxonomy, 'github_mutation_timeout');
  assert.equal(result.mutation_attempt_id, expectedMutationAttemptId(
    'asset_upload', `github-release:${repo}@${tag}`, first.name,
  ));
  assert.equal(result.remote_target, `github-release:${repo}@${tag}`);
  assert.equal(result.failure.mutation_attempt_id, result.mutation_attempt_id);
  assert.equal(result.failure.remote_target, result.remote_target);
  assert.equal(result.failure.timed_out, true);
  assert.equal(result.failure.stdout, 'partial stdout');
  assert.equal(result.failure.stderr, 'timed out stderr');
  assert.match(result.failure.input_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(uploads.length, 1);
  assert.equal(inspections, 3, 'initial, pre-upload, and one post-timeout inspection are bounded reads');
  assert.ok(calls.filter(({ args }) => isReleaseInspect(args)).every(({ options }) => options.timeout === 2_345));
});

test('a timed out Release create performs one Release mutation and then read-only reconciliation only', () => {
  const files = fixture([asset('first.zip', '5')]);
  const calls: string[][] = [];
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 90_000,
    readTimeoutMs: 2_222,
    run(_command, args, options) {
      calls.push(args);
      if (isReleaseInspect(args)) {
        assert.equal(options.timeout, 2_222);
        return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      }
      if (isReleaseView(args)) return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      if (isTagRefReadFor(args, tag, repo)) {
        assert.equal(options.timeout, 2_222);
        return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      }
      if (args[3] === `repos/${repo}/releases`) {
        return {
          status: null,
          signal: 'SIGTERM',
          stdout: 'possibly created',
          stderr: 'timed out',
          error: Object.assign(new Error('spawnSync gh ETIMEDOUT'), { code: 'ETIMEDOUT' }),
        };
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };

  const result = applyPublishPlan({
    ...mutationAdmission(),
    bundle: files.bundlePath,
    plan: files.planPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);

  assert.equal(result.status, 'outcome_unknown');
  assert.equal(result.failure.mutation, 'release_create');
  assert.equal(result.failure.failure_taxonomy, 'github_mutation_timeout');
  assert.equal(result.mutation_attempt_id, expectedMutationAttemptId(
    'release_create', `github-release:${repo}@${tag}`, tag,
  ));
  assert.equal(result.remote_target, `github-release:${repo}@${tag}`);
  assert.equal(result.failure.mutation_attempt_id, result.mutation_attempt_id);
  assert.equal(result.failure.remote_target, result.remote_target);
  assert.equal(calls.filter((args) => args[3] === `repos/${repo}/releases`).length, 1);
  assert.equal(calls.filter((args) => isTagRefCreateFor(args, repo)).length, 0);
  assert.equal(calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length, 0);
  assert.equal(calls.filter(isReleaseInspect).length, 2, 'one pre-create read and one bounded reconcile read');
});

test('explicit GitHub permission rejection does not become an unknown mutation', () => {
  const files = fixture([asset('first.zip', '6')]);
  let mutations = 0;
  const result = applyPublishPlan({
    ...mutationAdmission(), bundle: files.bundlePath, plan: files.planPath,
    'operation-deadline-at': deadlineAt,
  }, {
    now: () => deadlineMs - 90_000,
    run(_command, args) {
      if (isReleaseInspect(args) || isReleaseView(args) || isTagRefReadFor(args, tag, repo)) {
        return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      }
      if (args[3] === `repos/${repo}/releases`) {
        mutations += 1;
        return { status: 1, stdout: JSON.stringify({ status: '403', message: 'Resource not accessible by integration',
          documentation_url: 'https://docs.github.com/rest/releases/releases#create-a-release' }), stderr: 'HTTP 403' };
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  });
  assert.equal(mutations, 1);
  assert.equal(result.status, 'rejected');
  assert.equal(result.failure.failure_taxonomy, 'github_release_creation_rejected');
  assert.equal(result.reconciliation.observation.release.exists, false);
  assert.equal(result.retry_disposition, 'repair_permission_then_start_new_admitted_operation');
});

test('accepted Release create uses its exact id while the draft remains absent by tag', () => {
  const first = asset('first.zip', '6');
  const files = fixture([first]);
  const calls: string[][] = [];
  const remoteAssets: Asset[] = [];
  let created = false;
  let published = false;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 90_000,
    readTimeoutMs: 2_333,
    run(_command, args, options) {
      calls.push(args);
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/tags/${tag}`) {
        assert.equal(options.timeout, 2_333);
        if (!published) return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
        return success(releaseResponse(remoteAssets, { draft: false, immutable: false }));
      }
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/12345`) {
        assert.equal(created, true);
        assert.equal(options.timeout, 2_333);
        return success(releaseResponse(remoteAssets, {
          draft: !published,
          immutable: false,
        }));
      }
      if (isReleaseView(args)) return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      if (isTagRefReadFor(args, tag, repo)) {
        return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      }
      if (args[3] === `repos/${repo}/releases`) {
        created = true;
        return success(releaseResponse([], { draft: true, immutable: false }));
      }
      if (args[0] === 'release' && args[1] === 'upload') {
        remoteAssets.push(first);
        return success();
      }
      if (args.includes('PATCH')) {
        published = true;
        return success(releaseResponse(remoteAssets, { draft: false, immutable: false }));
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };

  const result = applyPublishPlan({
    ...mutationAdmission(),
    bundle: files.bundlePath,
    plan: files.planPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.uploaded, [first.name]);
  assert.equal(result.inspection.release.id, 12345);
  assert.equal(result.inspection.release.immutable, false);
  assert.equal(calls.filter((args) => isTagRefCreateFor(args, repo)).length, 0);
  assert.equal(calls.filter((args) => args[3] === `repos/${repo}/releases`).length, 1);
  const tagReadIndexes = calls.flatMap((args, index) => (
    isTagRefReadFor(args, tag, repo) ? [index] : []
  ));
  const tagCreateIndex = calls.findIndex((args) => isTagRefCreateFor(args, repo));
  const releaseCreateIndex = calls.findIndex((args) => args[3] === `repos/${repo}/releases`);
  assert.equal(tagReadIndexes.length, 1);
  assert.ok(
    tagReadIndexes[0]! < releaseCreateIndex,
    'the existing tag conflict read must precede atomic Release creation',
  );
  assert.equal(tagCreateIndex, -1);
  assert.equal(
    calls.filter((args) => args[1] === `repos/${repo}/releases/tags/${tag}`).length,
    1,
    'the draft is never re-queried through the by-tag endpoint',
  );
  assert.ok(
    calls.filter((args) => args[1] === `repos/${repo}/releases/12345`).length >= 4,
    'create, upload, and publish readback stay bound to the exact release id',
  );
});

test('a conflicting reserved tag fails closed before Release creation', () => {
  const files = fixture([asset('first.zip', '6')]);
  const calls: string[][] = [];
  const conflictingCommit = 'e'.repeat(40);
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 90_000,
    run(_command, args) {
      calls.push(args);
      if (isReleaseInspect(args)) return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      if (isReleaseView(args)) return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      if (isTagRefReadFor(args, tag, repo)) return tagRefResponse(tag, conflictingCommit);
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };

  assert.throws(
    () => applyPublishPlan({
      ...mutationAdmission(),
      bundle: files.bundlePath,
      plan: files.planPath,
      'operation-deadline-at': deadlineAt,
    }, runtime),
    new RegExp(`Existing refs/tags/${tag} points to ${conflictingCommit}, expected ${sourceCommit}`),
  );
  assert.equal(calls.filter((args) => isTagRefCreateFor(args, repo)).length, 0);
  assert.equal(calls.filter((args) => args[3] === `repos/${repo}/releases`).length, 0);
  assert.equal(calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length, 0);
  assert.equal(calls.filter((args) => args.includes('PATCH')).length, 0);
});

test('an existing draft hidden from the by-tag endpoint is bound by id before any create', () => {
  const first = asset('first.zip', '6');
  const files = fixture([first]);
  const calls: string[][] = [];
  const remoteAssets: Asset[] = [];
  let published = false;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 90_000,
    run(_command, args) {
      calls.push(args);
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/tags/${tag}`) {
        if (!published) return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
        return success(releaseResponse(remoteAssets, { draft: false, immutable: false }));
      }
      if (isReleaseView(args)) {
        return success({ databaseId: 12345, tagName: tag });
      }
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/12345`) {
        return success(releaseResponse(remoteAssets, {
          draft: !published,
          immutable: false,
        }));
      }
      if (args[0] === 'release' && args[1] === 'upload') {
        remoteAssets.push(first);
        return success();
      }
      if (args.includes('PATCH')) {
        published = true;
        return success(releaseResponse(remoteAssets, { draft: false, immutable: false }));
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };

  const result = applyPublishPlan({
    ...mutationAdmission(),
    bundle: files.bundlePath,
    plan: files.planPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.uploaded, [first.name]);
  assert.equal(result.inspection.release.id, 12345);
  assert.equal(calls.filter(isReleaseView).length, 1);
  assert.equal(calls.filter((args) => args.includes('POST')).length, 0);
  assert.ok(
    calls.findIndex(isReleaseView)
      < calls.findIndex((args) => args[1] === `repos/${repo}/releases/12345`),
  );
});

test('accepted Release create with a mismatched response identity fails closed without follow-up mutation', () => {
  const files = fixture([asset('first.zip', '7')]);
  const calls: string[][] = [];
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 90_000,
    run(_command, args) {
      calls.push(args);
      if (isReleaseInspect(args)) return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      if (isReleaseView(args)) return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      if (isTagRefReadFor(args, tag, repo)) {
        return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      }
      if (args[3] === `repos/${repo}/releases`) {
        return success({
          ...releaseResponse([], { draft: true, immutable: false }),
          tag_name: `${tag}-other`,
        });
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };

  const result = applyPublishPlan({
    ...mutationAdmission(),
    bundle: files.bundlePath,
    plan: files.planPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);

  assert.equal(result.status, 'outcome_unknown');
  assert.equal(result.failure.mutation, 'release_create');
  assert.equal(result.failure.failure_taxonomy, 'github_mutation_readback_unknown');
  assert.equal(result.reconciliation.status, 'create_response_invalid');
  assert.match(result.reconciliation.failure.error_message, /conflicts with the exact draft identity/);
  assert.equal(result.reconciliation.fallback.status, 'complete');
  assert.equal(result.reconciliation.fallback.observation.release.exists, false);
  assert.equal(calls.filter((args) => isTagRefCreateFor(args, repo)).length, 0);
  assert.equal(calls.filter((args) => args[3] === `repos/${repo}/releases`).length, 1);
  assert.equal(calls.filter(isReleaseInspect).length, 2);
  assert.equal(calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length, 0);
  assert.equal(calls.filter((args) => args.includes('PATCH')).length, 0);
});
