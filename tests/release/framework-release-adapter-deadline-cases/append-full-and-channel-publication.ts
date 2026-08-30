import test from 'node:test';
import {
  assert,
  fs,
  path,
  applyPublishPlan,
  fullAddonPublicReleaseBody,
  fullAddonIdentity,
  inspectRelease,
  repo,
  canonicalRepo,
  version,
  tag,
  deadlineAt,
  deadlineMs,
  notes,
  legacyNotes,
  projectedLegacyNotes,
  sourceCommit,
  executorCommit,
  standardOperationId,
  stableAuthorityRunId,
  durablePublicationRecord,
  mutationAdmission,
  previewFixture,
  success,
  releaseResponse,
  fixture,
  asset,
  isReleaseInspect,
  isReleaseViewFor,
  isTagRefReadFor,
  isTagRefCreateFor,
  tagRefResponse,
  fullPublicationRuntime,
  sha256Evidence,
} from "./fixtures.ts";
import type {
  GitHubAdapterRuntime,
  Asset,
} from "./fixtures.ts";

test('append_full rehearsal binds the same mutable Standard and forbids release-level mutations', () => {
  const files = fixture([], 'append_full');
  const bundle = JSON.parse(fs.readFileSync(files.bundlePath, 'utf8'));
  const addon = fullAddonIdentity(bundle, files.uploadActions, files.standardAttestationPath);
  const calls: string[][] = [];
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      calls.push(args);
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/tags/${tag}`) {
        return success(releaseResponse(files.standardAssets, { immutable: false }));
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };

  const result = applyPublishPlan({
    ...mutationAdmission('append_full', 'full'),
    'mutation-mode': 'rehearsal',
    bundle: files.bundlePath,
    plan: files.planPath,
    'standard-attestation': files.standardAttestationPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);

  assert.equal(result.status, 'rehearsal_complete');
  assert.equal(result.mutation_authorized, false);
  assert.equal(result.mutation_attempted, false);
  assert.equal(result.tag, tag);
  assert.equal(result.target_commitish, sourceCommit);
  assert.equal(result.addon.target_standard_release.release_id, 12345);
  assert.equal(result.addon.release_executor.app_sha, executorCommit);
  assert.deepEqual(result.forbidden_mutations, ['tag_reserve', 'release_create', 'release_publish', 'latest_patch']);
  assert.equal(calls.some((args) => isTagRefCreateFor(args, repo)), false);
  assert.equal(calls.some((args) => args.includes('POST') || args.includes('PATCH')), false);
  assert.equal(addon.tag, tag);
});

test('append_full rejects a mismatched executor identity before GitHub', () => {
  const files = fixture([], 'append_full');
  let calls = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run() {
      calls += 1;
      return success();
    },
  };

  assert.throws(
    () => applyPublishPlan({
      ...mutationAdmission('append_full', 'full'),
      'executor-app-sha': sourceCommit,
      bundle: files.bundlePath,
      plan: files.planPath,
      'standard-attestation': files.standardAttestationPath,
      'operation-deadline-at': deadlineAt,
    }, runtime),
    /must match the exact release executor/,
  );
  assert.equal(calls, 0);
});

test('append_full uploads the two missing same-tag assets then publishes visible Full notes', () => {
  const files = fixture([], 'append_full');
  const simulated = fullPublicationRuntime(files);

  const result = applyPublishPlan({
    ...mutationAdmission('append_full', 'full'),
    bundle: files.bundlePath,
    plan: files.planPath,
    'standard-attestation': files.standardAttestationPath,
    'operation-deadline-at': deadlineAt,
  }, simulated.runtime);

  assert.equal(result.status, 'complete');
  assert.equal(result.tag, tag);
  assert.equal(result.inspection.release.target_commitish, sourceCommit);
  assert.equal(result.inspection.release.immutable, false);
  assert.deepEqual(result.uploaded, files.uploadActions.map((asset) => asset.name));
  assert.deepEqual(simulated.remoteAssets.slice(-2).map((asset) => asset.name), [
    `One-Person-Lab-Full-${version}-mac-arm64.dmg`,
    'opl-release-manifest.json',
  ]);
  assert.equal(
    simulated.calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length,
    2,
  );
  assert.equal(simulated.calls.filter((args) => args.includes('PATCH')).length, 1);
  assert.equal(simulated.mutationInputs.length, 1);
  assert.match(simulated.mutationInputs[0], /Full first-install/);
  assert.match(simulated.mutationInputs[0], new RegExp(`One-Person-Lab-Full-${version}-mac-arm64\\.dmg`));
  assert.match(simulated.mutationInputs[0], new RegExp(files.uploadActions[0].sha256));
  assert.equal(simulated.calls.some((args) => isTagRefCreateFor(args, repo)), false);
  assert.equal(simulated.calls.some((args) => args[3] === `repos/${repo}/releases`), false);
  assert.equal(result.standard_assets_modified, false);
  assert.equal(result.release_notes_modified, true);
  assert.equal(result.release_notes_patch_applied, true);
  assert.equal(result.latest_modified, false);
});

test('append_full release visibility is idempotent after exact assets and notes are public', () => {
  const files = fixture([], 'append_full');
  const simulated = fullPublicationRuntime(files);
  const input = {
    ...mutationAdmission('append_full', 'full'),
    bundle: files.bundlePath,
    plan: files.planPath,
    'standard-attestation': files.standardAttestationPath,
    'operation-deadline-at': deadlineAt,
  };

  const first = applyPublishPlan(input, simulated.runtime);
  const second = applyPublishPlan(input, simulated.runtime);

  assert.equal(first.status, 'complete');
  assert.equal(first.release_notes_patch_applied, true);
  assert.equal(second.status, 'complete');
  assert.equal(second.release_notes_patch_applied, false);
  assert.deepEqual(second.uploaded, []);
  assert.equal(simulated.calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length, 2);
  assert.equal(simulated.calls.filter((args) => args.includes('PATCH')).length, 1);
});

test('append_full keeps additive Standard follower assets observational and exact', () => {
  const files = fixture([], 'append_full');
  const follower = asset('latest.yml', '1');
  const simulated = fullPublicationRuntime(files, { additionalAssets: [follower] });

  const result = applyPublishPlan({
    ...mutationAdmission('append_full', 'full'),
    bundle: files.bundlePath,
    plan: files.planPath,
    'standard-attestation': files.standardAttestationPath,
    'operation-deadline-at': deadlineAt,
  }, simulated.runtime);

  assert.equal(result.status, 'complete');
  assert.equal(result.inspection.assets.find((item: Record<string, unknown>) => item.name === follower.name)?.sha256, follower.sha256);
  assert.equal(result.inspection.assets.find((item: Record<string, unknown>) => item.name === follower.name)?.size_bytes, follower.size_bytes);
  assert.deepEqual(simulated.remoteAssets.at(-3)?.name, follower.name);
  assert.equal(simulated.calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length, 2);
});

test('append_full binds a legacy frozen Bundle to the projected same-tag public body', () => {
  const files = fixture([], 'append_full');
  const bundle = JSON.parse(fs.readFileSync(files.bundlePath, 'utf8'));
  bundle.prepared_notes.markdown = legacyNotes;
  fs.writeFileSync(files.bundlePath, `${JSON.stringify(bundle)}\n`);
  const calls: string[][] = [];
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      calls.push(args);
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/tags/${tag}`) {
        return success(releaseResponse(files.standardAssets, {
          immutable: false,
          body: projectedLegacyNotes,
        }));
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };

  const result = applyPublishPlan({
    ...mutationAdmission('append_full', 'full'),
    'mutation-mode': 'rehearsal',
    bundle: files.bundlePath,
    plan: files.planPath,
    'standard-attestation': files.standardAttestationPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);

  assert.equal(result.status, 'rehearsal_complete');
  assert.equal(result.preexisting_release.body_sha256, sha256Evidence(projectedLegacyNotes).slice('sha256:'.length));
  assert.equal(calls.length, 1);
});

test('an identity failure after an accepted Full mutation returns unknown with no retry', () => {
  const files = fixture([], 'append_full');
  const simulated = fullPublicationRuntime(files, {
    targetDriftAfterFirstUpload: 'f'.repeat(40),
  });

  const result = applyPublishPlan({
      ...mutationAdmission('append_full', 'full'),
      bundle: files.bundlePath,
      plan: files.planPath,
      'standard-attestation': files.standardAttestationPath,
      'operation-deadline-at': deadlineAt,
    }, simulated.runtime);
  assert.equal(result.status, 'outcome_unknown');
  assert.equal(result.retry_disposition, 'read_only_reconcile_only');
  assert.match(result.failure.reason, /published mutable Standard Release/);
  assert.equal(
    simulated.calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length,
    1,
  );
  assert.equal(simulated.calls.filter((args) => args.includes('PATCH')).length, 0);
});

test('append_full identity fails closed without its own manifest before GitHub inspection', () => {
  const files = fixture([], 'append_full');
  const bundle = JSON.parse(fs.readFileSync(files.bundlePath, 'utf8'));
  let calls = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run() {
      calls += 1;
      throw new Error('No GitHub read is allowed before Full self-identity validation.');
    },
  };
  assert.throws(
    () => fullAddonIdentity(bundle, [], files.standardAttestationPath),
    /exactly one opl-release-manifest\.json upload action/,
  );
  assert.equal(calls, 0);
});

test('an exact same-tag Full append is idempotent with zero mutation', () => {
  const files = fixture([], 'append_full');
  const bundle = JSON.parse(fs.readFileSync(files.bundlePath, 'utf8'));
  const addon = fullAddonIdentity(bundle, files.uploadActions, files.standardAttestationPath);
  const fullBody = fullAddonPublicReleaseBody(bundle, addon);
  const calls: string[][] = [];
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      calls.push(args);
      if (args[0] === 'api' && (
        args[1] === `repos/${repo}/releases/tags/${tag}`
        || args[1] === `repos/${repo}/releases/12345`
      )) {
        return success(releaseResponse(
          [...files.standardAssets, ...files.uploadActions],
          { immutable: false, body: fullBody },
        ));
      }
      throw new Error(`Unexpected gh call: ${args.join(' ')}`);
    },
  };
  const result = applyPublishPlan({
    ...mutationAdmission('append_full', 'full'),
    bundle: files.bundlePath,
    plan: files.planPath,
    'standard-attestation': files.standardAttestationPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);
  assert.equal(result.status, 'complete');
  assert.equal(result.addon.tag, tag);
  assert.equal(result.addon.release_url, `https://github.com/${repo}/releases/tag/${tag}`);
  assert.equal(
    result.addon.asset_download_base_url,
    `https://github.com/${repo}/releases/download/${tag}`,
  );
  assert.equal(calls.every((args) => args[0] === 'api'), true);
});

test('append_full reconcile_only performs bounded inspection and classifies complete, incomplete, conflict, or unknown', () => {
  for (const expected of ['complete', 'incomplete', 'conflict', 'unknown'] as const) {
    const files = fixture([], 'append_full');
    const plan = JSON.parse(fs.readFileSync(files.planPath, 'utf8'));
    plan.release_bundle_publish.status = 'reconcile_only';
    fs.writeFileSync(files.planPath, `${JSON.stringify(plan)}\n`);
    const calls: string[][] = [];
    const bundle = JSON.parse(fs.readFileSync(files.bundlePath, 'utf8'));
    const addon = fullAddonIdentity(bundle, files.uploadActions, files.standardAttestationPath);
    const fullBody = fullAddonPublicReleaseBody(bundle, addon);
    const runtime: GitHubAdapterRuntime = {
      now: () => deadlineMs - 60_000,
      run(_command, args) {
        calls.push(args);
        if (expected === 'unknown') return { status: 1, stdout: '', stderr: 'network unavailable' };
        const standardAssets = expected === 'conflict'
          ? [{ ...files.standardAssets[0]!, sha256: `sha256:${'0'.repeat(64)}` }, ...files.standardAssets.slice(1)]
          : files.standardAssets;
        const assets = expected === 'complete'
          ? [...standardAssets, ...files.uploadActions]
          : standardAssets;
        return success(releaseResponse(assets, {
          immutable: false,
          body: expected === 'complete' ? fullBody : notes,
        }));
      },
    };
    const result = applyPublishPlan({
      ...mutationAdmission('append_full', 'full'),
      bundle: files.bundlePath,
      plan: files.planPath,
      'standard-attestation': files.standardAttestationPath,
      'operation-deadline-at': deadlineAt,
    }, runtime);
    assert.equal(result.status, 'reconcile_only');
    assert.equal(result.mutation_attempted, false);
    assert.equal(result.mutation_authorized, false);
    assert.equal(result.reconciliation.classification, expected);
    assert.equal(calls.some((args) => args.includes('POST') || args.includes('PATCH')), false);
    assert.equal(calls.some((args) => args[0] === 'release' && args[1] === 'upload'), false);
  }
});

test('github-apply publishes a Nightly Bundle as prerelease and never as Latest', () => {
  const files = fixture([]);
  const nightlyVersion = '26.7.22-nightly';
  const bundle = JSON.parse(fs.readFileSync(files.bundlePath, 'utf8'));
  bundle.release = {
    channel: 'nightly',
    version: nightlyVersion,
    updater_version: '26.7.2290-nightly.0',
    tag: `v${nightlyVersion}`,
    prerelease: true,
  };
  fs.writeFileSync(files.bundlePath, `${JSON.stringify(bundle)}\n`);
  const calls: Array<{ args: string[]; stdin?: string }> = [];
  let tagReserved = false;
  let exists = false;
  let published = false;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args, options) {
      calls.push({ args, stdin: options.input });
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/tags/v${nightlyVersion}`) {
        if (!exists) return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
        return success({
          id: 12345,
          tag_name: `v${nightlyVersion}`,
          name: `One Person Lab v${nightlyVersion}`,
          draft: !published,
          prerelease: true,
          target_commitish: sourceCommit,
          body: notes,
          immutable: false,
          assets: [],
        });
      }
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/12345`) {
        return success({
          id: 12345,
          tag_name: `v${nightlyVersion}`,
          name: `One Person Lab v${nightlyVersion}`,
          draft: !published,
          prerelease: true,
          target_commitish: sourceCommit,
          body: notes,
          immutable: false,
          assets: [],
        });
      }
      if (isReleaseViewFor(args, `v${nightlyVersion}`, repo)) {
        return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      }
      if (isTagRefReadFor(args, `v${nightlyVersion}`, repo)) {
        return tagReserved
          ? tagRefResponse(`v${nightlyVersion}`)
          : { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      }
      if (isTagRefCreateFor(args, repo)) {
        tagReserved = true;
        return tagRefResponse(`v${nightlyVersion}`);
      }
      if (args[3] === `repos/${repo}/releases`) {
        exists = true;
        return success({
          id: 12345,
          tag_name: `v${nightlyVersion}`,
          name: `One Person Lab v${nightlyVersion}`,
          draft: true,
          prerelease: true,
          target_commitish: sourceCommit,
          body: notes,
          immutable: false,
          assets: [],
        });
      }
      if (args.includes('PATCH')) {
        published = true;
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
    'publication-channel': 'nightly',
  }, runtime);
  assert.equal(result.status, 'complete');
  const create = calls.find(({ args }) => args[3] === `repos/${repo}/releases`);
  assert.ok(create?.stdin);
  const payload = JSON.parse(create.stdin);
  assert.equal(payload.prerelease, true);
  assert.equal(payload.draft, true);
  assert.equal(payload.make_latest, 'false');
});

test('github-apply publishes a qualified Preview as a non-prerelease without implicitly changing Latest', () => {
  const files = previewFixture();
  const calls: Array<{ args: string[]; stdin?: string }> = [];
  let tagReserved = false;
  let exists = false;
  let published = false;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args, options) {
      calls.push({ args, stdin: options.input });
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/tags/${files.previewTag}`) {
        if (!exists) return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
        return success({
          id: 12345,
          tag_name: files.previewTag,
          name: `One Person Lab v${files.previewVersion}`,
          draft: !published,
          prerelease: false,
          target_commitish: sourceCommit,
          body: notes,
          immutable: false,
          assets: [],
        });
      }
      if (args[0] === 'api' && args[1] === `repos/${repo}/releases/12345`) {
        return success({
          id: 12345,
          tag_name: files.previewTag,
          name: `One Person Lab v${files.previewVersion}`,
          draft: !published,
          prerelease: false,
          target_commitish: sourceCommit,
          body: notes,
          immutable: false,
          assets: [],
        });
      }
      if (isReleaseViewFor(args, files.previewTag, repo)) {
        return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      }
      if (isTagRefReadFor(args, files.previewTag, repo)) {
        return tagReserved
          ? tagRefResponse(files.previewTag)
          : { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      }
      if (isTagRefCreateFor(args, repo)) {
        tagReserved = true;
        return tagRefResponse(files.previewTag);
      }
      if (args[3] === `repos/${repo}/releases`) {
        exists = true;
        return success({
          id: 12345,
          tag_name: files.previewTag,
          name: `One Person Lab v${files.previewVersion}`,
          draft: true,
          prerelease: false,
          target_commitish: sourceCommit,
          body: notes,
          immutable: false,
          assets: [],
        });
      }
      if (args.includes('PATCH')) {
        published = true;
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
    'publication-channel': 'preview',
  }, runtime);
  assert.equal(result.status, 'complete');
  const create = calls.find(({ args }) => args[3] === `repos/${repo}/releases`);
  assert.ok(create?.stdin);
  const payload = JSON.parse(create.stdin);
  assert.equal(payload.prerelease, false);
  assert.equal(payload.draft, true);
  assert.equal(payload.make_latest, 'false');
});

test('release inspection treats an absent immutable field as false, never true', () => {
  const response = releaseResponse([]);
  delete response.immutable;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      assert.equal(isReleaseInspect(args), true);
      return success(response);
    },
  };
  assert.equal(inspectRelease(repo, tag, runtime).release.immutable, false);
});

test('canonical Stable publication fails closed without its bound publication record', () => {
  const files = fixture([asset('first.zip', '1')]);
  const bundle = JSON.parse(fs.readFileSync(files.bundlePath, 'utf8'));
  bundle.sources.app.repo = canonicalRepo;
  fs.writeFileSync(files.bundlePath, `${JSON.stringify(bundle)}\n`);
  let calls = 0;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run() {
      calls += 1;
      return success();
    },
  };

  assert.throws(
    () => applyPublishPlan({
      ...mutationAdmission(),
      bundle: files.bundlePath,
      plan: files.planPath,
      'operation-deadline-at': deadlineAt,
    }, runtime),
    (error: any) => {
      assert.equal(error.result.status, 'failed');
      assert.equal(error.result.failure.failure_taxonomy, 'github_publication_record_invalid');
      return true;
    },
  );
  assert.equal(calls, 2, 'only bounded tag and draft discovery reads are allowed before evidence rejection');
});

test('canonical Stable publication consumes internal authority evidence without a repository setting dependency', () => {
  const first = asset('first.zip', '2');
  const files = fixture([first]);
  const bundle = JSON.parse(fs.readFileSync(files.bundlePath, 'utf8'));
  bundle.sources.app.repo = canonicalRepo;
  fs.writeFileSync(files.bundlePath, `${JSON.stringify(bundle)}\n`);
  const durable = durablePublicationRecord(files.root, [first]);
  assert.notEqual(durable.operationId, standardOperationId);
  const attestationPath = path.join(files.root, 'opl-release-attestation.json');
  const attestationBytes = Buffer.from(`${JSON.stringify({
    schema: 'opl_app_release_attestation.v1',
    status: 'passed',
    release: { repository: canonicalRepo, tag, version, bundle_digest: bundle.bundle_digest },
    publication_record: JSON.parse(fs.readFileSync(durable.recordPath, 'utf8')),
    protection: {
      github_native_immutable: false,
      retroactive_lock_claimed: false,
      standard_asset_policy: 'sealed_name_size_digest_set_no_overwrite_or_delete',
    },
  })}\n`);
  fs.writeFileSync(attestationPath, attestationBytes);
  const attestationAction = {
    action: 'upload',
    name: 'opl-release-attestation.json',
    source_path: attestationPath,
    size_bytes: attestationBytes.length,
    sha256: sha256Evidence(attestationBytes),
  };
  const installerSidecarActions = [
    ['install-docker-webui.sh', '#!/usr/bin/env bash\nexit 0\n'],
    ['install-docker-webui.ps1', 'exit 0\n'],
  ].map(([name, content]) => {
    const sourcePath = path.join(files.root, name);
    const bytes = Buffer.from(content);
    fs.writeFileSync(sourcePath, bytes);
    return {
      action: 'upload',
      name,
      source_path: sourcePath,
      size_bytes: bytes.length,
      sha256: sha256Evidence(bytes),
    };
  });
  const additionalPath = path.join(files.root, 'additional-upload-actions.json');
  fs.writeFileSync(additionalPath, `${JSON.stringify({
    schema: 'opl_app_release_upload_actions.v1',
    upload_actions: [attestationAction, ...installerSidecarActions],
  })}\n`);
  const calls: string[][] = [];
  const remoteAssets: Asset[] = [];
  let tagReserved = false;
  let exists = false;
  let published = false;
  const runtime: GitHubAdapterRuntime = {
    now: () => deadlineMs - 60_000,
    run(_command, args) {
      calls.push(args);
      if (args[0] === 'api' && args[1] === `repos/${canonicalRepo}/releases/tags/${tag}`) {
        if (!exists) return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
        return success(releaseResponse(remoteAssets, {
          draft: !published,
          immutable: false,
        }));
      }
      if (args[0] === 'api' && args[1] === `repos/${canonicalRepo}/releases/12345`) {
        return success(releaseResponse(remoteAssets, {
          draft: !published,
          immutable: false,
        }));
      }
      if (isReleaseViewFor(args, tag, canonicalRepo)) {
        return { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      }
      if (isTagRefReadFor(args, tag, canonicalRepo)) {
        return tagReserved
          ? tagRefResponse(tag)
          : { status: 1, stdout: '', stderr: 'HTTP 404 Not Found' };
      }
      if (isTagRefCreateFor(args, canonicalRepo)) {
        tagReserved = true;
        return tagRefResponse(tag);
      }
      if (args[3] === `repos/${canonicalRepo}/releases`) {
        exists = true;
        return success(releaseResponse([], { draft: true, immutable: false }));
      }
      if (args[0] === 'release' && args[1] === 'upload') {
        const uploaded = [first, attestationAction, ...installerSidecarActions].find(
          (candidate) => candidate.source_path === args[3],
        );
        assert.ok(uploaded);
        remoteAssets.push({
          name: uploaded.name,
          source_path: uploaded.source_path,
          size_bytes: uploaded.size_bytes,
          sha256: uploaded.sha256,
        });
        return success();
      }
      if (args.includes('PATCH')) {
        published = true;
        return success();
      }
      throw new Error(`Unexpected GitHub call: ${args.join(' ')}`);
    },
  };

  assert.throws(
    () => applyPublishPlan({
      ...mutationAdmission(),
      'authority-run-id': '30325431855',
      bundle: files.bundlePath,
      plan: files.planPath,
      'additional-upload-actions': additionalPath,
      'publication-record': durable.recordPath,
      'operation-deadline-at': deadlineAt,
    }, runtime),
    (error: any) => {
      assert.equal(
        error.result.failure.validation_error,
        'Publication record authority run does not match the admitted Stable source run.',
      );
      return true;
    },
  );
  assert.equal(exists, false);
  assert.deepEqual(remoteAssets, []);

  const result = applyPublishPlan({
    ...mutationAdmission(),
    'authority-run-id': stableAuthorityRunId,
    bundle: files.bundlePath,
    plan: files.planPath,
    'additional-upload-actions': additionalPath,
    'publication-record': durable.recordPath,
    'operation-deadline-at': deadlineAt,
  }, runtime);

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.uploaded, [
    first.name,
    attestationAction.name,
    ...installerSidecarActions.map((action) => action.name),
  ]);
  assert.equal(
    calls.some((args) => args[0] === 'api' && args[1] === `repos/${canonicalRepo}/immutable-releases`),
    false,
  );
  assert.equal(result.inspection.release.immutable, false);
  assert.equal(result.github_native_immutable, false);
});
