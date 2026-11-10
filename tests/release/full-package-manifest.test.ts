import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { materializeFullKimiCuOfflineSeed } from '../../scripts/build-full-first-install-package.ts';
import {
  KIMI_CU_QUALIFICATION_IDENTITY_REF,
  kimiCuOfflineSeedRelativePath,
  readKimiCuQualificationIdentity,
} from '../../scripts/build-full-first-install-package/runtime-layers.ts';

const appRoot = path.resolve(import.meta.dirname, '../..');

test('Full Computer Use seed identity is read from the App qualification manifest', () => {
  const identity = { ...readKimiCuQualificationIdentity(appRoot), version: '0.6.6' };
  const qualificationManifest = JSON.parse(fs.readFileSync(
    path.join(appRoot, 'contracts', 'app-release-qualification-input-manifest.json'),
    'utf8',
  ));

  const { version: _resolvedVersion, ...identityWithoutVersion } = identity;
  assert.deepEqual(identityWithoutVersion, qualificationManifest.runtime_payloads.kimi_cu);
  assert.equal(
    KIMI_CU_QUALIFICATION_IDENTITY_REF,
    'contracts/app-release-qualification-input-manifest.json#runtime_payloads.kimi_cu',
  );
  assert.equal(
    kimiCuOfflineSeedRelativePath(identity),
    `runtime-payloads/${identity.provider_id}/${identity.version}/KimiCU.app.zip`,
  );
});

test('Full package materializes the verified KimiCU archive and records one derived seed projection', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-kimi-cu-manifest-'));
  const sourceArchive = path.join(tempRoot, 'source', 'KimiCU.app.zip');
  const runtimeRoot = path.join(tempRoot, 'runtime', 'current');
  const archiveBytes = Buffer.from('KimiCU archive fixture\n');
  fs.mkdirSync(path.dirname(sourceArchive), { recursive: true });
  fs.writeFileSync(sourceArchive, archiveBytes);

  const canonicalIdentity = { ...readKimiCuQualificationIdentity(appRoot), version: '0.6.6' };
  const identity = {
    ...canonicalIdentity,
    archive_url: 'https://example.invalid/kimi-cu.zip',
    archive_sha256: crypto.createHash('sha256').update(archiveBytes).digest('hex'),
    archive_size_bytes: archiveBytes.length,
  };
  const prepared = {
    runtimeRoot,
    manifest: {
      manifest_version: 2,
      runtime_assertions: {
        offline_required_payloads: [
          { path: 'vendor/temporal/temporal_cli_darwin_arm64.tar.gz', exists: true },
        ],
      },
      size_breakdown: {
        total_runtime_uncompressed_bytes: 0,
        layers: {},
      },
    },
  };

  try {
    const result = materializeFullKimiCuOfflineSeed(prepared, {
      identity,
      sourcePath: sourceArchive,
    });
    const seedRelativePath = kimiCuOfflineSeedRelativePath(identity);
    const seedPath = path.join(runtimeRoot, ...seedRelativePath.split('/'));
    const persistedManifest = JSON.parse(fs.readFileSync(
      path.join(runtimeRoot, 'manifest', 'full-package-manifest.json'),
      'utf8',
    ));

    assert.deepEqual(fs.readFileSync(seedPath), archiveBytes);
    assert.equal(result.seed.path, seedRelativePath);
    assert.equal(prepared.manifest, result.manifest);
    assert.equal(
      persistedManifest.computer_use_offline_seed.qualification_identity_ref,
      KIMI_CU_QUALIFICATION_IDENTITY_REF,
    );
    assert.equal(persistedManifest.computer_use_offline_seed.provider_id, canonicalIdentity.provider_id);
    assert.equal(persistedManifest.computer_use_offline_seed.version, canonicalIdentity.version);
    assert.equal(persistedManifest.computer_use_offline_seed.runtime_relative_path, seedRelativePath);
    assert.equal(persistedManifest.computer_use_offline_seed.archive_sha256, identity.archive_sha256);
    assert.equal(persistedManifest.computer_use_offline_seed.archive_size_bytes, archiveBytes.length);
    assert.equal(persistedManifest.computer_use_offline_seed.defines_second_provider_or_behavior, false);
    assert.equal(
      persistedManifest.runtime_assertions.offline_required_payloads
        .filter((entry) => entry.path === seedRelativePath).length,
      1,
    );
    assert.equal(persistedManifest.runtime_assertions.computer_use_offline_seed.status, 'packaged');
    assert.equal(
      persistedManifest.size_breakdown.offline_seeds.computer_use.relative_path,
      seedRelativePath,
    );
    assert.ok(persistedManifest.size_breakdown.total_runtime_uncompressed_bytes > archiveBytes.length);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('Full package rejects KimiCU seed bytes that drift from the qualification identity', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-kimi-cu-drift-'));
  const sourceArchive = path.join(tempRoot, 'KimiCU.app.zip');
  fs.writeFileSync(sourceArchive, 'drifted archive');
  const prepared = {
    runtimeRoot: path.join(tempRoot, 'runtime'),
    manifest: { runtime_assertions: { offline_required_payloads: [] } },
  };

  try {
    const canonicalIdentity = readKimiCuQualificationIdentity(appRoot);
    const archiveBytes = Buffer.from('expected archive');
    assert.throws(
      () => materializeFullKimiCuOfflineSeed(prepared, {
        identity: {
          ...canonicalIdentity,
          version: '0.6.6',
          archive_url: 'https://example.invalid/kimi-cu.zip',
          archive_sha256: crypto.createHash('sha256').update(archiveBytes).digest('hex'),
          archive_size_bytes: archiveBytes.length,
        },
        sourcePath: sourceArchive,
      }),
      /size drifted|SHA-256 drifted/,
    );
    assert.equal(fs.existsSync(path.join(prepared.runtimeRoot, 'runtime-payloads')), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('Full package rejects an unresolved KimiCU archive before attempting download', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-kimi-cu-unresolved-'));
  const prepared = {
    runtimeRoot: path.join(tempRoot, 'runtime'),
    manifest: { runtime_assertions: { offline_required_payloads: [] } },
  };

  try {
    assert.throws(
      () => materializeFullKimiCuOfflineSeed(prepared, {
        identity: { ...readKimiCuQualificationIdentity(appRoot), version: '0.6.6' },
      }),
      /resolved archive identity from OPL_RELEASE_DEPENDENCY_MANIFEST/,
    );
    assert.equal(fs.existsSync(prepared.runtimeRoot), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
