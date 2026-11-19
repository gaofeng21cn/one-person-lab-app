import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { downloadArtifact } from './download-github-artifact.mjs';

const repository = 'gaofeng21cn/opl-studio';
const workflow = '.github/workflows/release-plugin-composition-test.yml';
const artifact = 'dsh-plugin-composition-build-input';
const prefix = 'opl-desktop-stable-release:dsh-composition:';

export function readCompositionFingerprint(fingerprint) {
  if (typeof fingerprint !== 'string' || !fingerprint.startsWith(prefix)) return null;
  const match = /^([1-9][0-9]*):([0-9a-f]{64})(?::smoke-harness:[0-9a-f]{40})?$/.exec(fingerprint.slice(prefix.length));
  if (!match) throw new Error('Malformed Stable DSH composition fingerprint');
  return { runId: match[1], digest: `sha256:${match[2]}` };
}

function githubJson(endpoint) {
  return JSON.parse(execFileSync('gh', ['api', `repos/${repository}/${endpoint}`], { encoding: 'utf8' }));
}

export function verifyCompositionReceipt(receipt, { appSha, shellSha }) {
  if (receipt.schema !== 'opl_dsh_plugin_composition_receipt.v1'
    || receipt.registry !== 'https://npm.pkg.github.com'
    || receipt.app_product_commit !== appSha || receipt.tested_on_sha !== shellSha) {
    throw new Error('Studio composition receipt differs from the frozen App and Studio commits');
  }
}

async function prepare({ runId, digest, appSha, shellSha, directory, cache }) {
  const run = githubJson(`actions/runs/${runId}`);
  if (String(run.id) !== runId || run.path !== workflow || run.head_branch !== 'main'
    || run.repository?.full_name !== repository || run.head_sha !== shellSha || run.conclusion !== 'success') {
    throw new Error('Expected a successful Studio main composition run for the frozen Studio commit');
  }
  await downloadArtifact({
    ...process.env,
    GITHUB_REPOSITORY: repository,
    OPL_ARTIFACT_RUN_ID: runId,
    OPL_ARTIFACT_NAME: artifact,
    OPL_ARTIFACT_DEST: directory,
    OPL_ARTIFACT_CACHE: cache,
    OPL_ARTIFACT_EXPECTED_DIGEST: digest,
  });
  verifyCompositionReceipt(JSON.parse(fs.readFileSync(path.join(directory, 'composition_receipt.json'), 'utf8')), {
    appSha, shellSha,
  });
}

function verifyLocalInput({ fingerprint, appSha, shellSha, directory }) {
  const admission = readCompositionFingerprint(fingerprint);
  if (!admission) throw new Error('Stable DSH composition admission is required');
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'composition_receipt.json'), 'utf8'));
  verifyCompositionReceipt(receipt, { appSha, shellSha });
}

async function main() {
  const { positionals: [command], values } = parseArgs({
    allowPositionals: true,
    options: {
      'run-id': { type: 'string' }, fingerprint: { type: 'string' }, 'app-sha': { type: 'string' },
      'shell-sha': { type: 'string' }, directory: { type: 'string' },
    },
  });
  const appSha = values['app-sha'];
  const shellSha = values['shell-sha'];
  if (![appSha, shellSha].every(sha => /^[0-9a-f]{40}$/.test(sha ?? ''))) {
    throw new Error('Exact App and Studio commit IDs are required for composition admission');
  }
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-dsh-composition-'));
  try {
    const cache = path.join(workspace, 'cache');
    if (command === 'resolve') {
      const runId = values['run-id'];
      if (!/^[1-9][0-9]*$/.test(runId ?? '')) throw new Error('Exact Studio composition run ID required');
      const matches = githubJson(`actions/runs/${runId}/artifacts?per_page=100`).artifacts
        .filter(entry => entry.name === artifact && !entry.expired);
      const digest = matches[0]?.digest;
      if (matches.length !== 1 || !/^sha256:[0-9a-f]{64}$/.test(digest ?? '')) {
        throw new Error('Studio composition run must retain one tested build input with an archive digest');
      }
      await prepare({ runId, digest, appSha, shellSha, directory: path.join(workspace, 'input'), cache });
      console.log(`${prefix}${runId}:${digest.slice(7)}`);
      return;
    }
    if (command === 'download' && values.directory) {
      const admission = readCompositionFingerprint(values.fingerprint);
      if (!admission) throw new Error('Stable DSH composition admission is required');
      await prepare({ ...admission, appSha, shellSha, directory: values.directory, cache });
      return;
    }
    if (command === 'verify' && values.directory) {
      verifyLocalInput({ fingerprint: values.fingerprint, appSha, shellSha, directory: values.directory });
      return;
    }
    throw new Error('Expected resolve --run-id, download --fingerprint, or verify --fingerprint');
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
