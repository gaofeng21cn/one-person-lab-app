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

function carrierFixture(kind: 'aionui' | 'opl-studio') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `opl-desktop-release-${kind}-`));
  const contractPath = kind === 'aionui'
    ? path.join(appRoot, 'contracts', 'shell-adapters', 'aionui.json')
    : path.join(appRoot, 'contracts', 'shell-adapters', 'opl-studio.json');
  const contract = readAppShellAdapterContract(contractPath);
  const paths = contract.shell_contract.paths;
  const candidate = kind === 'opl-studio';
  const productName = candidate ? 'One Person Lab Preview' : 'One Person Lab';
  const bundleId = candidate ? 'cn.onepersonlab.opl.studio.preview' : 'cn.onepersonlab.opl';
  const releaseRepository = candidate ? 'gaofeng21cn/opl-studio' : 'gaofeng21cn/one-person-lab-app';
  const artifactName = candidate
    ? 'one-person-lab-preview-${version}-${os}-${arch}.${ext}'
    : 'One-Person-Lab-${env.OPL_RELEASE_VERSION}-${os}-${arch}.${ext}';
  const packageManager = candidate ? 'npm' : 'bun';
  const toolchain = candidate
    ? { electron: '44.0.0', electronBuilder: '26.15.3', electronUpdater: '6.8.9' }
    : { electron: '41.10.3', electronBuilder: '26.15.3', electronUpdater: '6.8.9' };
  const scripts = candidate
    ? {
        'dist:mac': 'electron-builder --mac --publish never',
        'qualify:desktop:mac': 'node scripts/desktop/macos-distribution.mjs',
        'qualify:desktop:updater:local': 'node scripts/desktop/qualify-local-updater.mjs',
      }
    : { 'build-mac:arm64': 'node scripts/build-with-builder.js arm64 --mac --arm64' };
  const commands = candidate
    ? {
        install: 'npm ci',
        build_macos: 'npm run dist:mac',
        qualify_distribution: 'npm run qualify:desktop:mac',
        qualify_updater: 'npm run qualify:desktop:updater:local',
        qualify_prepublication: 'node scripts/desktop/macos-distribution.mjs --require-release-trust',
        qualify_public_release: 'node scripts/desktop/macos-distribution.mjs --require-release-trust --require-public-feed',
      }
    : {
        install: 'bun install --frozen-lockfile',
        build_macos: 'bun run build-mac:arm64',
        qualify_distribution: 'bash scripts/verify-release-assets.sh release-assets',
        qualify_updater: 'app_owned_standard_updater_gates',
        qualify_prepublication: 'app_owned_standard_prepublication_gates',
        qualify_public_release: 'app_owned_standard_public_readback_gates',
      };

  writeJson(path.join(root, paths.package_manifest), {
    name: candidate ? 'opl-studio' : '@office-ai/aionui',
    version: candidate ? '0.1.0' : '1.5.9',
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
      ...(candidate ? {} : { entitlements: 'entitlements.plist' }),
    },
    dmg: { format: 'ULFO' },
    publish: {
      provider: 'github',
      owner: 'gaofeng21cn',
      repo: candidate ? 'opl-studio' : 'one-person-lab-app',
    },
  }));
  writeJson(path.join(root, paths.desktop_release_carrier_manifest!), {
    schema: 'opl_app_desktop_release_carrier.v1',
    owner_repo: contract.shell_source.owner_repo,
    carrier_id: kind,
    product_name: productName,
    bundle_id: bundleId,
    release_role: candidate ? 'candidate_preview' : 'active_stable',
    release_repository: releaseRepository,
    package_manager: packageManager,
    commands,
    artifact_name_template: artifactName,
    entitlements: candidate ? null : 'entitlements.plist',
    carrier_specific_payload: candidate
      ? ['studio_renderer', 'app_state_action_bridge']
      : ['aioncore', 'native_modules'],
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

test('App desktop release kernel resolves both admitted Electron carriers through one contract', () => {
  const aionui = carrierFixture('aionui');
  const studio = carrierFixture('opl-studio');
  try {
    const active = resolveFixture(aionui);
    const candidate = resolveFixture(studio);

    assert.equal(active.releaseRole, 'active_stable');
    assert.equal(active.bundleId, 'cn.onepersonlab.opl');
    assert.equal(candidate.releaseRole, 'candidate_preview');
    assert.equal(candidate.bundleId, 'cn.onepersonlab.opl.studio.preview');
    assert.notEqual(active.bundleId, candidate.bundleId);
    assert.deepEqual(active.toolchain, {
      electron: '41.10.3',
      electron_builder: '26.15.3',
      electron_updater: '6.8.9',
    });
    assert.deepEqual(candidate.toolchain, {
      electron: '44.0.0',
      electron_builder: '26.15.3',
      electron_updater: '6.8.9',
    });
    assert.notDeepEqual(active.toolchain, candidate.toolchain);
    assert.deepEqual(active.macos.targets, ['dmg', 'zip']);
    assert.deepEqual(candidate.stageOrder.at(-1), 'carrier_release_qualification');
  } finally {
    aionui.cleanup();
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

test('App desktop release kernel rejects a carrier using another admitted carrier profile', () => {
  const fixture = carrierFixture('aionui');
  const paths = fixture.contract.shell_contract.paths;
  try {
    const packagePath = path.join(fixture.root, paths.package_manifest);
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    writeJson(packagePath, {
      ...pkg,
      devDependencies: { ...pkg.devDependencies, electron: '44.0.0' },
    });
    assert.throws(() => resolveFixture(fixture), /toolchain drifted from its App-admitted profile/);
  } finally {
    fixture.cleanup();
  }
});
