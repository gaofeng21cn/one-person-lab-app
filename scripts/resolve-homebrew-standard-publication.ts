#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { readAppComponentManifestIdentity } from './read-opl-app-component-manifest-identity.ts';

type RecordValue = Record<string, any>;
const sha256 = (bytes: Buffer) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

// The original Standard handoff identifies the publication, while its current
// public manifest identifies the bytes after a qualified same-tag repair.
export function resolveHomebrewStandardPublication(handoff: RecordValue, release: RecordValue, bytes: Buffer) {
  invariant(handoff.schema === 'opl_homebrew_standard_follower_handoff.v1' && handoff.status === 'ready', 'Invalid Standard handoff.');
  invariant(release.id === handoff.release.id && release.tag_name === handoff.release.tag
    && release.target_commitish === handoff.release.target_commitish
    && release.draft === false && release.prerelease === false && release.immutable === false,
  'Public Standard release identity changed.');
  const exactAsset = (name: string) => {
    const matches = release.assets.filter((asset: RecordValue) => asset.name === name);
    invariant(matches.length === 1, `Expected one public ${name} asset.`);
    return matches[0];
  };
  const manifestAsset = exactAsset('opl-app-component-manifest.json');
  invariant(manifestAsset.digest === sha256(bytes) && manifestAsset.size === bytes.length,
    'Public component manifest bytes do not match GitHub.');
  const manifest = JSON.parse(bytes.toString('utf8'));
  const identity = readAppComponentManifestIdentity(manifest, release.tag_name, false, release.target_commitish);
  invariant(identity.quality_status === 'stable', 'Homebrew Standard requires qualified Stable bytes.');
  const dmgName = `One-Person-Lab-${handoff.release.version}-mac-arm64.dmg`;
  const dmg = exactAsset(dmgName);
  const url = `https://github.com/gaofeng21cn/one-person-lab-app/releases/download/${release.tag_name}/${dmgName}`;
  invariant(manifest.primary_artifact.name === dmgName && manifest.primary_artifact.ref === url
    && manifest.primary_artifact.digest === dmg.digest && manifest.primary_artifact.size === dmg.size,
  'Public Standard DMG does not match the component manifest.');
  if (manifest.same_tag_replacement) {
    const oldVersion = String(handoff.release.updater_version).split('.').map(Number);
    const currentVersion = String(identity.updater_version).split('.').map(Number);
    invariant(oldVersion.length === 3 && oldVersion.every(Number.isSafeInteger)
      && currentVersion[0] === oldVersion[0] && currentVersion[1] === oldVersion[1]
      && currentVersion[2] > oldVersion[2], 'Replacement must advance the original Standard machine version.');
  } else {
    invariant(dmg.digest === handoff.standard_dmg.sha256 && dmg.size === handoff.standard_dmg.size_bytes
      && manifestAsset.digest === handoff.component_manifest.sha256
      && manifestAsset.size === handoff.component_manifest.size_bytes
      && identity.updater_version === handoff.release.updater_version,
    'Unqualified changes to the original Standard handoff are not allowed.');
  }
  return { updater_version: identity.updater_version, dmg_name: dmgName, dmg_digest: dmg.digest,
    dmg_size: dmg.size, manifest_digest: manifestAsset.digest, manifest_size: manifestAsset.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { handoff: { type: 'string' }, release: { type: 'string' }, manifest: { type: 'string' } }, strict: true });
  if (!values.handoff || !values.release || !values.manifest) throw new Error('Require --handoff, --release and --manifest.');
  console.log(JSON.stringify(resolveHomebrewStandardPublication(JSON.parse(fs.readFileSync(values.handoff, 'utf8')),
    JSON.parse(fs.readFileSync(values.release, 'utf8')), fs.readFileSync(values.manifest)), null, 2));
}
