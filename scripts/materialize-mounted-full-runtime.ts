#!/usr/bin/env node
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import zlib from 'node:zlib';

const OFFLINE_SEED_SCHEMA = 'opl_full_offline_seed.v1';
const OFFLINE_SEED_FORMAT = 'tar.zst';
const OFFLINE_SEED_RELATIVE_PATH = 'opl-offline-seed.tar.zst';

async function sha256FileStream(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function extractOfflineSeedArchive(archivePath: string, targetDir: string): Promise<void> {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  const tarChild = spawn('tar', ['-xf', '-', '-C', targetDir], {
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  let stderr = '';
  tarChild.stderr.setEncoding('utf8');
  tarChild.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const exitPromise = new Promise<void>((resolve, reject) => {
    tarChild.once('error', reject);
    tarChild.once('close', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Offline seed tar extraction failed (${signal ?? `exit ${code}`}): ${stderr.trim() || 'corrupt archive'}`,
          ),
        );
      }
    });
  });
  const ignoreStdinError = () => {};
  tarChild.stdin.on('error', ignoreStdinError);
  try {
    await Promise.all([
      exitPromise,
      pipeline(fs.createReadStream(archivePath), zlib.createZstdDecompress(), tarChild.stdin),
    ]);
  } catch (error) {
    if (tarChild.exitCode === null && tarChild.signalCode === null) {
      tarChild.kill('SIGKILL');
    }
    await exitPromise.catch(() => {});
    throw error;
  } finally {
    tarChild.stdin.off('error', ignoreStdinError);
  }
}

export async function materializeMountedFullRuntime(input: {
  resourceDir: string;
  extractDir: string;
}): Promise<string> {
  const resourceDir = path.resolve(input.resourceDir);
  const manifestPath = path.join(resourceDir, 'manifest', 'full-package-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Mounted Full App is missing manifest: ${manifestPath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Mounted Full App manifest is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Mounted Full App manifest must be a JSON object.');
  }
  const manifest = parsed as Record<string, unknown>;
  if (manifest.offline_seed !== undefined) {
    const seed = manifest.offline_seed as Record<string, unknown> | null;
    if (
      !seed
      || typeof seed !== 'object'
      || Array.isArray(seed)
      || seed.schema !== OFFLINE_SEED_SCHEMA
      || seed.format !== OFFLINE_SEED_FORMAT
      || seed.relative_path !== OFFLINE_SEED_RELATIVE_PATH
      || !Number.isSafeInteger(seed.size_bytes)
      || Number(seed.size_bytes) <= 0
      || typeof seed.sha256 !== 'string'
      || !/^[0-9a-f]{64}$/i.test(seed.sha256)
    ) {
      throw new Error('Mounted Full App manifest contains invalid offline_seed metadata.');
    }
    if (fs.existsSync(path.join(resourceDir, 'runtime'))) {
      throw new Error('Mounted Full App must not ship a loose runtime directory beside opl-offline-seed.tar.zst.');
    }
    const seedPath = path.join(resourceDir, OFFLINE_SEED_RELATIVE_PATH);
    let stat: fs.Stats | null = null;
    try {
      stat = fs.statSync(seedPath);
    } catch {
      stat = null;
    }
    if (!stat?.isFile()) {
      throw new Error(`Mounted Full App is missing offline seed archive: ${seedPath}`);
    }
    if (stat.size !== seed.size_bytes) {
      throw new Error(
        `Mounted Full App offline seed size mismatch: expected ${seed.size_bytes}, got ${stat.size}.`,
      );
    }
    const actualSha256 = await sha256FileStream(seedPath);
    if (actualSha256 !== seed.sha256.toLowerCase()) {
      throw new Error(
        `Mounted Full App offline seed sha256 mismatch: expected ${seed.sha256}, got ${actualSha256}.`,
      );
    }
    const resolvedExtractDir = path.resolve(input.extractDir);
    await extractOfflineSeedArchive(seedPath, resolvedExtractDir);
    return resolvedExtractDir;
  }

  const legacyRoot = path.join(resourceDir, 'runtime', 'current');
  if (!fs.existsSync(legacyRoot) || !fs.statSync(legacyRoot).isDirectory()) {
    throw new Error(`Mounted Full App is missing legacy runtime directory: ${legacyRoot}`);
  }
  return path.resolve(legacyRoot);
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'resource-dir': { type: 'string' },
      'extract-dir': { type: 'string' },
    },
    allowPositionals: false,
  });
  const resourceDir = values['resource-dir']?.trim() || '';
  const extractDir = values['extract-dir']?.trim() || '';
  if (!resourceDir || !extractDir) {
    throw new Error('Usage: materialize-mounted-full-runtime.ts --resource-dir <path> --extract-dir <path>');
  }
  const resolved = await materializeMountedFullRuntime({ resourceDir, extractDir });
  process.stdout.write(`${resolved}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
