import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  sealStudioReleaseCheckpoint,
  sealStudioReleaseQualification,
  validateStudioReleaseCheckpoint,
  validateStudioReleaseQualification,
} from '../../scripts/studio-release-checkpoint.ts';

const identity = {
  appRef: 'a'.repeat(40),
  studioSha: 'b'.repeat(40),
  studioTree: 'c'.repeat(40),
  studioTag: 'v0.1.0',
  frameworkRef: 'd'.repeat(40),
};

function sha256(value: Buffer | string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-studio-checkpoint-'));
  const checkpointRoot = path.join(root, 'checkpoint');
  const qualificationRoot = path.join(root, 'qualification');
  fs.mkdirSync(path.join(checkpointRoot, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(checkpointRoot, 'evidence'), { recursive: true });
  fs.mkdirSync(qualificationRoot);
  const assetNames = [
    'one-person-lab-preview-0.1.0-mac-arm64.dmg',
    'one-person-lab-preview-0.1.0-mac-arm64.zip',
    'one-person-lab-preview-0.1.0-mac-arm64.zip.blockmap',
    'latest-mac.yml',
    'latest-arm64-mac.yml',
  ];
  const assets = assetNames.map((name) => {
    const bytes = Buffer.from(`fixture:${name}\n`);
    fs.writeFileSync(path.join(checkpointRoot, 'assets', name), bytes);
    return { name, size_bytes: bytes.length, sha256: sha256(bytes) };
  });
  const evidence = path.join(checkpointRoot, 'evidence');
  fs.writeFileSync(path.join(evidence, 'app-notarization.json'), '{"status":"Accepted","id":"app"}\n');
  fs.writeFileSync(path.join(evidence, 'apple-credentials-preflight.json'), '{"status":"passed"}\n');
  fs.writeFileSync(path.join(evidence, 'dmg-notarization.json'), '{"notarization":{"status":"Accepted"}}\n');
  fs.writeFileSync(path.join(evidence, 'release-assets.json'), `${JSON.stringify({
    schema: 'opl_studio_release_assets.v1',
    repository: 'gaofeng21cn/opl-studio',
    version: '0.1.0',
    tag: 'v0.1.0',
    assets,
  })}\n`);
  fs.writeFileSync(path.join(evidence, 'release-notes.md'), 'One Person Lab Preview 0.1.0\n');
  fs.writeFileSync(path.join(evidence, 'source-admission.json'), `${JSON.stringify({
    schema: 'opl_studio_protected_release_admission.v2',
    app_executor: { commit_sha: identity.appRef },
    source: { commit_sha: identity.studioSha, tree_sha: identity.studioTree, tag: identity.studioTag },
    framework_bootstrap: {
      framework_ref: identity.frameworkRef,
      installer_url: `https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/${identity.frameworkRef}/install.sh`,
      archive_url: `https://github.com/gaofeng21cn/one-person-lab/archive/${identity.frameworkRef}.tar.gz`,
      resource_path: 'resources/opl-framework-bootstrap/opl-install.sh',
      manifest_path: 'resources/opl-framework-bootstrap/manifest.json',
      install_source_mode: 'archive',
    },
  })}\n`);
  fs.writeFileSync(path.join(qualificationRoot, 'prepublication-qualification.json'), `${JSON.stringify({
    schema: 'opl_macos_desktop_distribution_qualification.v1',
    candidateId: 'opl-studio',
    version: '0.1.0',
    buildVersion: '0.1.0',
    releaseReady: false,
    releaseBlocker: 'public_update_feed_qualification_required',
    releaseBlockers: ['public_update_feed_qualification_required'],
    trust: { gatekeeperAccepted: true, appStapled: true, dmgStapled: true },
  })}\n`);
  return { root, checkpointRoot, qualificationRoot };
}

test('Studio checkpoint seals and validates one exact signed and notarized byte set', () => {
  const { root, checkpointRoot } = fixture();
  const sealed = sealStudioReleaseCheckpoint(checkpointRoot, identity);
  assert.equal(sealed.status, 'signed_notarized');
  assert.equal(sealed.files.length, 11);
  assert.equal(sealed.schema, 'opl_studio_signed_notarized_checkpoint.v2');
  assert.equal(sealed.framework_ref, identity.frameworkRef);
  assert.equal(validateStudioReleaseCheckpoint(checkpointRoot, identity).source.tag, identity.studioTag);
  fs.rmSync(root, { recursive: true, force: true });
});

test('Studio qualification binds the unchanged checkpoint manifest and local trust receipt', () => {
  const { root, checkpointRoot, qualificationRoot } = fixture();
  sealStudioReleaseCheckpoint(checkpointRoot, identity);
  const sealed = sealStudioReleaseQualification({ ...identity, checkpointRoot, qualificationRoot });
  assert.equal(sealed.status, 'qualified');
  assert.equal(sealed.schema, 'opl_studio_prepublication_qualification.v2');
  assert.equal(sealed.framework_ref, identity.frameworkRef);
  assert.match(sealed.checkpoint_manifest_sha256, /^[0-9a-f]{64}$/);
  assert.equal(
    validateStudioReleaseQualification({ ...identity, checkpointRoot, qualificationRoot }).public_feed_pending,
    'public_update_feed_qualification_required',
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test('Studio checkpoint rejects byte, source, and qualification drift', () => {
  const first = fixture();
  sealStudioReleaseCheckpoint(first.checkpointRoot, identity);
  fs.appendFileSync(path.join(first.checkpointRoot, 'assets/latest-mac.yml'), 'drift\n');
  assert.throws(() => validateStudioReleaseCheckpoint(first.checkpointRoot, identity), /bytes do not match/);
  fs.rmSync(first.root, { recursive: true, force: true });

  const second = fixture();
  sealStudioReleaseCheckpoint(second.checkpointRoot, identity);
  assert.throws(
    () => validateStudioReleaseCheckpoint(second.checkpointRoot, { ...identity, studioTree: 'd'.repeat(40) }),
    /tree does not match/,
  );
  assert.throws(
    () => validateStudioReleaseCheckpoint(second.checkpointRoot, { ...identity, frameworkRef: 'e'.repeat(40) }),
    /Framework ref does not match/,
  );
  sealStudioReleaseQualification({ ...identity, checkpointRoot: second.checkpointRoot, qualificationRoot: second.qualificationRoot });
  fs.appendFileSync(path.join(second.qualificationRoot, 'prepublication-qualification.json'), ' ');
  assert.throws(
    () => validateStudioReleaseQualification({ ...identity, checkpointRoot: second.checkpointRoot, qualificationRoot: second.qualificationRoot }),
    /receipt bytes do not match|Unexpected non-whitespace character/,
  );
  fs.rmSync(second.root, { recursive: true, force: true });
});
