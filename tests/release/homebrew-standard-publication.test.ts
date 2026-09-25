import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { createAppComponentManifest } from '../../scripts/write-opl-app-component-manifest.ts';
import { resolveReleaseVersionIdentity } from '../../scripts/release-version.ts';
import { resolveHomebrewStandardPublication } from '../../scripts/resolve-homebrew-standard-publication.ts';

const digest = (s: string | Buffer) => `sha256:${crypto.createHash('sha256').update(s).digest('hex')}`;
function fixture() {
  const version = '26.9.25-r1', tag = `v${version}`, source = 'a'.repeat(40);
  const updaterVersion = resolveReleaseVersionIdentity('stable', version).updaterVersion;
  const assets = ['latest-mac.yml', 'latest-arm64-mac.yml', `One-Person-Lab-${version}-mac-arm64.dmg`, `One-Person-Lab-${version}-mac-arm64.zip`, `One-Person-Lab-${version}-mac-arm64.zip.blockmap`, 'opl-install.sh'].map(name => ({ name, size: 100, digest: digest(name), url: `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/${tag}/${name}` }));
  const manifest: any = createAppComponentManifest({ version, updaterVersion, sourceCommit: source, shellCommit: 'b'.repeat(40), frameworkCommit: 'c'.repeat(40), tag, releaseUrl: `https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/${tag}`, repo: 'gaofeng21cn/one-person-lab-app', assets });
  const bytes = Buffer.from(JSON.stringify(manifest));
  const release = { id: 42, tag_name: tag, target_commitish: source, draft: false, prerelease: false, immutable: false,
    assets: [...assets, { name: 'opl-app-component-manifest.json', size: bytes.length, digest: digest(bytes) }] };
  const handoff = { schema: 'opl_homebrew_standard_follower_handoff.v1', status: 'ready', release: { id: 42, tag, target_commitish: source, version, updater_version: updaterVersion }, standard_dmg: { sha256: manifest.primary_artifact.digest, size_bytes: 100 }, component_manifest: { sha256: digest(bytes), size_bytes: bytes.length } };
  return { manifest, bytes, release, handoff };
}
function seal(f: ReturnType<typeof fixture>) {
  delete f.manifest.component_manifest_digest;
  f.manifest.component_manifest_digest = digest(JSON.stringify(f.manifest));
  f.bytes = Buffer.from(JSON.stringify(f.manifest));
  Object.assign(f.release.assets.at(-1)!, { digest: digest(f.bytes), size: f.bytes.length });
}
test('Standard follower accepts original public bytes and qualified newer same-tag bytes', () => {
  const f = fixture();
  assert.equal(resolveHomebrewStandardPublication(f.handoff, f.release, f.bytes).updater_version, f.handoff.release.updater_version);
  f.manifest.same_tag_replacement = { schema: 'opl_app_same_tag_replacement.v1', tag_source_commit: f.release.target_commitish,
    previous_updater_version: f.manifest.updater_version, previous_manifest_digest: f.manifest.component_manifest_digest,
    qualification_receipt_sha256: digest('qualification'), build_run_id: '20', qualification_run_id: '21' };
  const parts = f.manifest.updater_version.split('.'); parts[2] = String(Number(parts[2]) + 1); f.manifest.updater_version = parts.join('.');
  f.manifest.source_commit = 'd'.repeat(40); f.manifest.source_cohort.app_sha = f.manifest.source_commit;
  f.manifest.primary_artifact.digest = digest('new signed DMG');
  f.release.assets.find(a => a.name.endsWith('.dmg'))!.digest = f.manifest.primary_artifact.digest;
  seal(f);
  assert.equal(resolveHomebrewStandardPublication(f.handoff, f.release, f.bytes).updater_version, f.manifest.updater_version);
  f.release.target_commitish = 'e'.repeat(40);
  assert.throws(() => resolveHomebrewStandardPublication(f.handoff, f.release, f.bytes), /identity changed/);
});
test('Standard follower rejects unbound public bytes, duplicate assets and unqualified replacements', () => {
  const f = fixture();
  assert.throws(() => resolveHomebrewStandardPublication(f.handoff, f.release, Buffer.from('{}')), /manifest bytes/);
  f.release.assets.push(f.release.assets[0]);
  f.release.assets.push(f.release.assets.find(a => a.name.endsWith('.dmg'))!);
  assert.throws(() => resolveHomebrewStandardPublication(f.handoff, f.release, f.bytes), /Expected one public/);
  const g = fixture(); g.manifest.primary_artifact.digest = digest('unsigned replacement');
  g.release.assets.find(a => a.name.endsWith('.dmg'))!.digest = g.manifest.primary_artifact.digest; seal(g);
  assert.throws(() => resolveHomebrewStandardPublication(g.handoff, g.release, g.bytes), /Unqualified changes/);
});
