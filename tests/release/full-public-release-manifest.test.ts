import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildFullPublicReleaseManifest } from '../../scripts/build-full-first-install-package.ts';
import { resolveFullCarrierProfile } from '../../scripts/build-full-first-install-package/carrier-profile.ts';

function buildManifestFixture(t: test.TestContext, carrierId: 'aionui' | 'opl-studio') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-public-manifest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const carrier = resolveFullCarrierProfile({ carrierId });
  const dmgName = carrier.artifactNameTemplate
    .replace('${version}', '26.8.1-r5')
    .replace('${arch}', 'mac-arm64');
  const dmgPath = path.join(root, dmgName);
  fs.writeFileSync(dmgPath, 'exact Full DMG fixture bytes\n');

  return {
    carrier,
    manifest: buildFullPublicReleaseManifest({
    version: '26.8.1-r5',
    updaterVersion: '26.8.1005',
    carrier,
    artifactNames: {
      dmg: dmgName,
      manifest: 'full-package-manifest.json',
      runtimeCacheEvents: 'runtime-cache-events.json',
      readme: 'README-Full-First-Install.txt',
    },
    outDir: root,
    fullDmgPath: dmgPath,
    fullPackageManifest: { version: '26.8.1-r5' },
    runtimeCacheEvents: { events: [] },
    runtimeCurrentnessProbePath: path.join(root, 'full-runtime-currentness-probe.json'),
    runtimeNativeTrust: { status: 'passed' },
    appBundleTrimReport: null,
    packageBoundaryAudit: null,
    precompressionGate: null,
      carrier,
    }),
    dmgPath,
    dmgName,
  };
}

test('Full public manifest binds its DMG with a canonical prefixed SHA-256 digest', (t) => {
  const { manifest, dmgPath, dmgName, carrier } = buildManifestFixture(t, 'aionui');
  const expected = crypto.createHash('sha256').update(fs.readFileSync(dmgPath)).digest('hex');

  assert.equal(manifest.assets.length, 1);
  assert.equal(manifest.assets[0].name, dmgName);
  assert.equal(manifest.assets[0].sha256, `sha256:${expected}`);
  assert.match(manifest.assets[0].sha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(manifest.package_kind, carrier.packageKind);
  assert.equal(manifest.carrier.carrier_id, carrier.carrierId);
  assert.equal(manifest.carrier.profile_id, carrier.profileId);
});

test('Studio Full public manifest keeps Studio identity instead of AionUI defaults', (t) => {
  const { manifest, dmgName, carrier } = buildManifestFixture(t, 'opl-studio');

  assert.equal(manifest.package_kind, 'opl_studio_full_first_install_macos_arm64');
  assert.equal(manifest.primary_install_asset, dmgName);
  assert.equal(manifest.carrier.carrier_id, 'opl-studio');
  assert.equal(manifest.carrier.profile_id, 'opl-studio-full-first-install');
  assert.equal(manifest.carrier.bundle_id, 'cn.onepersonlab.opl.studio.preview');
  assert.equal(manifest.carrier.codex_carrier, 'opl_codex_native');
  assert.equal(manifest.carrier.aioncore_required, false);
});
