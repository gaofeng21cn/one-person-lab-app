import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { selectStandardBase, materializeStandardBase, assertStandardBaseProductInputs } from '../../scripts/prepare-full-standard-base.ts';
import { sha256File } from '../../scripts/build-artifact-cohort.ts';

const expected = {
  releaseId: '123', tag: 'v26.11.11', targetCommitish: 'a'.repeat(40),
  bundleDigest: `sha256:${'b'.repeat(64)}`, version: '26.11.11', updaterVersion: '26.11.1191',
  appSha: 'a'.repeat(40), shellSha: 'c'.repeat(40), frameworkSha: 'd'.repeat(40),
};
function fixture(root: string) {
  const name = 'One-Person-Lab-26.11.11-mac-arm64.zip';
  const component = { surface_kind: 'opl_app_component_manifest.v1', release_tag: expected.tag,
    release_version: expected.version, updater_version: expected.updaterVersion, quality_status: 'stable', qualification_disclosure: { stable_qualified: true },
    source_cohort: { app_sha: expected.appSha, shell_sha: expected.shellSha, framework_sha: expected.frameworkSha } };
  const file = path.join(root, 'opl-app-component-manifest.json');
  fs.writeFileSync(file, JSON.stringify(component));
  const asset = { name, digest: `sha256:${'e'.repeat(64)}`, size_bytes: 1234 };
  const attestation = { schema: 'opl_app_release_attestation.v1', status: 'passed',
    release: { repository: 'gaofeng21cn/one-person-lab-app', tag: expected.tag, version: expected.version, bundle_digest: expected.bundleDigest },
    component_manifest: { sha256: `sha256:${sha256File(file)}`, size_bytes: fs.statSync(file).size },
    publication_record: { publication_intent: { payload_assets: [asset, { name: 'opl-app-component-manifest.json', digest: `sha256:${sha256File(file)}`, size_bytes: fs.statSync(file).size }] } },
    protection: { github_native_immutable: false, retroactive_lock_claimed: false, standard_asset_policy: 'sealed_name_size_digest_set_no_overwrite_or_delete' } };
  fs.writeFileSync(path.join(root, 'opl-release-attestation.json'), JSON.stringify(attestation));
  const release = { id: 123, tag_name: expected.tag, target_commitish: expected.targetCommitish,
    draft: false, prerelease: false, published_at: '2026-11-11T00:00:00Z',
    assets: [{ name, size: asset.size_bytes, digest: asset.digest },
      { name: 'opl-app-component-manifest.json', size: fs.statSync(file).size, digest: `sha256:${sha256File(file)}` },
      { name: 'opl-release-attestation.json', size: fs.statSync(path.join(root, 'opl-release-attestation.json')).size, digest: `sha256:${sha256File(path.join(root, 'opl-release-attestation.json'))}` }] };
  fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify(release));
  return { component, release, attestation, asset };
}

test('Full reuses only the exact sealed Standard cohort and machine version', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-base-test-'));
  try {
    const { asset } = fixture(root);
    fs.writeFileSync(path.join(root, asset.name), 'corrupt ZIP');
    assert.throws(() => materializeStandardBase(root, expected, path.join(root, 'output'), 'App.app', 'cn.onepersonlab.opl'), /ZIP bytes differ/);
    assert.deepEqual(selectStandardBase(root, expected), { name: asset.name, size_bytes: asset.size_bytes, sha256: asset.digest });
    for (const key of ['releaseId', 'tag', 'targetCommitish', 'bundleDigest', 'version', 'updaterVersion', 'appSha', 'shellSha', 'frameworkSha']) {
      assert.throws(() => selectStandardBase(root, { ...expected, [key]: key.includes('Sha') || key === 'targetCommitish' ? 'f'.repeat(40) : 'different' }), undefined, key);
    }
    for (const change of [{ draft: true }, { prerelease: true }, { published_at: null }, { assets: [] }]) {
      const { release } = fixture(root);
      fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify({ ...release, ...change }));
      assert.throws(() => selectStandardBase(root, expected));
    }
    fixture(root);
    fs.appendFileSync(path.join(root, 'opl-app-component-manifest.json'), ' ');
    assert.throws(() => selectStandardBase(root, expected), /source cohort or machine version/);
    const { release } = fixture(root);
    release.assets[0].digest = `sha256:${'f'.repeat(64)}`;
    fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify(release));
    assert.throws(() => selectStandardBase(root, expected), /sealed public asset/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test('Full refuses Standard reuse when the executor would inject different product resources', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standard-product-inputs-'));
  const files = ['contracts/app-product-profile.json', 'contracts/app-gui-product-contract.json',
    'contracts/app-shell-adapter.json', 'scripts/official-profile-package-apply.ts'];
  try {
    for (const folder of ['frozen', 'executor']) for (const file of files) {
      const target = path.join(root, folder, file);
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, file);
    }
    assert.doesNotThrow(() => assertStandardBaseProductInputs(path.join(root, 'frozen'), path.join(root, 'executor')));
    for (const file of files) {
      const target = path.join(root, 'executor', file); fs.appendFileSync(target, 'changed');
      assert.throws(() => assertStandardBaseProductInputs(path.join(root, 'frozen'), path.join(root, 'executor')), /product input differs/);
      fs.writeFileSync(target, file);
    }
    assert.throws(() => assertStandardBaseProductInputs('', root), /frozen App product inputs/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
