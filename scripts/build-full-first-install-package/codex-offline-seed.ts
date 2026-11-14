import fs from 'node:fs';
import path from 'node:path';
import { withVerifiedPinnedArchive, assertPinnedArchive } from './archive-output.ts';
import { copySingleFile, directorySizeBytes } from './filesystem.ts';

export function codexSeedArchives(identity) {
  if (identity?.package !== '@openai/codex' || !/^\d+\.\d+\.\d+$/.test(identity.version ?? '')
    || identity.platform?.os !== 'darwin' || identity.platform?.cpu !== 'arm64'
    || identity.platform.version !== `${identity.version}-darwin-arm64`) {
    throw new Error('Full Codex seed requires the operation-resolved stable macOS arm64 identity.');
  }
  return [identity, identity.platform].map((entry, index) => {
    if (!/^https:\/\//.test(entry.tarball_url ?? '') || !/^[a-f0-9]{64}$/.test(entry.tarball_sha256 ?? '')
      || !Number.isSafeInteger(entry.tarball_size_bytes) || entry.tarball_size_bytes <= 0 || !entry.npm_integrity) {
      throw new Error('Full Codex seed requires verified archive identity from OPL_RELEASE_DEPENDENCY_MANIFEST.');
    }
    return {
      path: `runtime-payloads/codex-cli/${identity.version}/${index ? 'platform' : 'package'}.tgz`,
      kind: index ? 'platform' : 'package',
      url: entry.tarball_url, sha256: entry.tarball_sha256, sizeBytes: entry.tarball_size_bytes,
      npm_integrity: entry.npm_integrity,
    };
  });
}

export function materializeFullCodexOfflineSeed(prepared, input: Record<string, any> = {}) {
  const identity = input.identity ?? JSON.parse(fs.readFileSync(process.env.OPL_RELEASE_DEPENDENCY_MANIFEST || '', 'utf8')).runtime_payloads?.codex_cli;
  const archives = codexSeedArchives(identity);
  const payloads = archives.map((archive) => withVerifiedPinnedArchive({
    ...archive, label: `Full Codex ${archive.kind} seed`, sourcePath: input[`${archive.kind}Path`],
  }, (source) => {
    copySingleFile(source, path.join(prepared.runtimeRoot, archive.path));
    return { path: archive.path, exists: true, size_bytes: archive.sizeBytes,
      archive_sha256: archive.sha256, role: 'studio_owned_first_install_seed' };
  }));
  const seed = {
    schema: 'opl_full_codex_offline_seed.v1',
    version: identity.version,
    selection_policy: 'latest_stable_at_operation_start',
    materialization_role: 'studio_owned_first_install_seed',
    installation_owner: 'one-person-lab',
    archives: Object.fromEntries(archives.map((archive) => [archive.kind, {
      path: archive.path, sha256: archive.sha256, size_bytes: archive.sizeBytes,
      npm_integrity: archive.npm_integrity,
    }])),
  };
  const manifestPath = path.join(prepared.runtimeRoot, 'manifest', 'full-package-manifest.json');
  const previous = prepared.manifest;
  let manifest = { ...previous, codex_offline_seed: seed,
    runtime_assertions: { ...previous.runtime_assertions,
      offline_required_payloads: [...(previous.runtime_assertions?.offline_required_payloads ?? [])
        .filter((item) => !item.path.startsWith('runtime-payloads/codex-cli/')), ...payloads] } };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  for (let attempt = 0; attempt < 8; attempt++) {
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const size = directorySizeBytes(prepared.runtimeRoot);
    manifest = { ...manifest, size_breakdown: { ...manifest.size_breakdown,
      total_runtime_uncompressed_bytes: size,
      offline_seeds: { ...manifest.size_breakdown?.offline_seeds,
        size_bytes: directorySizeBytes(path.join(prepared.runtimeRoot, 'runtime-payloads')),
        codex: { version: seed.version, size_bytes: payloads.reduce((sum, entry) => sum + entry.size_bytes, 0) } } } };
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    if (directorySizeBytes(prepared.runtimeRoot) === size) {
      prepared.manifest = manifest;
      return seed;
    }
  }
  throw new Error('Full manifest size did not stabilize after adding the Codex offline seed.');
}

export function assertFullCodexOfflineSeed(runtimeRoot, seed) {
  if (seed?.schema !== 'opl_full_codex_offline_seed.v1' || !/^\d+\.\d+\.\d+$/.test(seed.version ?? '')) {
    throw new Error('Full package is missing its Codex offline seed.');
  }
  for (const kind of ['package', 'platform']) {
    const archive = seed.archives?.[kind];
    if (archive?.path !== `runtime-payloads/codex-cli/${seed.version}/${kind}.tgz`) {
      throw new Error('Full Codex seed archive path is invalid.');
    }
    assertPinnedArchive(path.join(runtimeRoot, archive.path), {
      label: `Full Codex ${kind} seed`, sha256: archive.sha256, sizeBytes: archive.size_bytes,
    });
  }
  return true;
}
