import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stringify as stringifyYaml } from 'yaml';

import {
  readAppShellAdapterContract,
  type ShellAdapterContract,
} from '../../scripts/app-shell-adapter.ts';
import { resolveDesktopReleaseCarrier } from '../../scripts/desktop-release-carrier.ts';

const appRoot = path.resolve(import.meta.dirname, '../..');

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

function carrierFixture(kind: 'opl-studio') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `opl-desktop-release-${kind}-`));
  const contractPath = path.join(appRoot, 'contracts', 'shell-adapters', 'opl-studio.json');
  const contract = readAppShellAdapterContract(contractPath);
  const paths = contract.shell_contract.paths;
  const productName = 'One Person Lab Preview';
  const bundleId = 'cn.onepersonlab.opl.studio.preview';
  const releaseRepository = 'gaofeng21cn/opl-studio';
  const artifactName = 'one-person-lab-preview-${version}-${os}-${arch}.${ext}';
  const packageManager = 'npm';
  const toolchain = { electron: '44.9.1', electronBuilder: '26.15.3', electronUpdater: '6.8.9' };
  const scripts = {
    'dist:mac': 'electron-builder --mac --publish never',
    'qualify:desktop:mac': 'node scripts/desktop/macos-distribution.mjs',
    'qualify:desktop:updater:local': 'node scripts/desktop/qualify-local-updater.mjs',
  };
  const commands = {
    install: 'npm ci',
    build_macos: 'npm run dist:mac',
    qualify_distribution: 'npm run qualify:desktop:mac',
    qualify_updater: 'npm run qualify:desktop:updater:local',
    qualify_prepublication: 'node scripts/desktop/macos-distribution.mjs --require-release-trust',
    qualify_public_release: 'node scripts/desktop/macos-distribution.mjs --require-release-trust --require-public-feed',
  };

  writeJson(path.join(root, paths.package_manifest), {
    name: 'opl-studio',
    version: '0.1.0',
    scripts,
    dependencies: { 'electron-updater': toolchain.electronUpdater },
    devDependencies: { electron: toolchain.electron, 'electron-builder': toolchain.electronBuilder },
  });
  writeText(path.join(root, paths.electron_builder_config), stringifyYaml({
    appId: bundleId,
    productName,
    artifactName,
    mac: {
      target: ['dmg', 'zip'],
      hardenedRuntime: true,
      entitlements: 'entitlements.plist',
    },
    dmg: { format: 'ULFO' },
    publish: {
      provider: 'github',
      owner: 'gaofeng21cn',
      repo: 'opl-studio',
    },
  }));
  writeJson(path.join(root, paths.desktop_release_carrier_manifest!), {
    schema: 'opl_app_desktop_release_carrier.v1',
    owner_repo: contract.shell_source.owner_repo,
    carrier_id: kind,
    product_name: productName,
    bundle_id: bundleId,
    release_role: 'candidate_preview',
    release_repository: releaseRepository,
    package_manager: packageManager,
    commands,
    artifact_name_template: artifactName,
    entitlements: 'entitlements.plist',
    carrier_specific_payload: ['studio_renderer', 'app_state_action_bridge'],
  });

  return {
    root,
    contract,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function resolveFixture(fixture: { root: string; contract: ShellAdapterContract }) {
  return resolveDesktopReleaseCarrier({ contract: fixture.contract, shellRoot: fixture.root });
}

test('App desktop release kernel resolves the isolated Studio Preview carrier through one contract', () => {
  const studio = carrierFixture('opl-studio');
  try {
    const candidate = resolveFixture(studio);

    assert.equal(candidate.releaseRole, 'candidate_preview');
    assert.equal(candidate.bundleId, 'cn.onepersonlab.opl.studio.preview');
    assert.deepEqual(candidate.toolchain, {
      electron: '44.9.1',
      electron_builder: '26.15.3',
      electron_updater: '6.8.9',
    });
    assert.deepEqual(candidate.macos.targets, ['dmg', 'zip']);
    assert.deepEqual(candidate.stageOrder.at(-1), 'carrier_release_qualification');
  } finally {
    studio.cleanup();
  }
});

test('App desktop release kernel fails closed on carrier identity or toolchain drift', () => {
  const fixture = carrierFixture('opl-studio');
  const paths = fixture.contract.shell_contract.paths;
  try {
    const manifestPath = path.join(fixture.root, paths.desktop_release_carrier_manifest!);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    writeJson(manifestPath, { ...manifest, bundle_id: 'com.example.opl.studio.preview' });
    assert.throws(() => resolveFixture(fixture), /One Person Lab brand domain/);

    writeJson(manifestPath, manifest);
    const packagePath = path.join(fixture.root, paths.package_manifest);
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    writeJson(packagePath, {
      ...pkg,
      devDependencies: { ...pkg.devDependencies, 'electron-builder': '26.8.1' },
    });
    assert.throws(() => resolveFixture(fixture), /toolchain drifted from its App-admitted profile/);
  } finally {
    fixture.cleanup();
  }
});

test('App desktop release kernel has no AionUI carrier profile', () => {
  const release = JSON.parse(fs.readFileSync(path.join(appRoot, 'contracts/app-release-channel.json'), 'utf8'));
  assert.deepEqual(Object.keys(release.desktop_release_kernel.toolchain_profiles), ['opl-studio']);
  assert.equal(release.full_first_install.carrier_profiles.aionui, undefined);
});
