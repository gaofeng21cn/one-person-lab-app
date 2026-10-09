#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export function verifyCompletedWebui(input: { receipt: any; run: any; runId: string; version: string }) {
  const { receipt, run, runId, version } = input;
  assert.equal(String(run.id), runId);
  assert.equal(run.repository.full_name, 'gaofeng21cn/one-person-lab-app');
  assert.equal(run.path, '.github/workflows/release-webui-development.yml');
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'success');
  assert.equal(run.run_attempt, 1);
  assert.equal(receipt.schema, 'opl_app_webui_stable_promotion_receipt.v5');
  assert.equal(receipt.status, 'complete');
  assert.equal(receipt.retry_allowed, false);
  assert.equal(receipt.authority_mode, 'independent_stable');
  assert.equal(receipt.promotion_executor.run_id, runId);
  assert.equal(receipt.promotion_executor.app_head_sha, run.head_sha);
  assert.equal(receipt.release.version, version);
  // All Docker source roles belong to its completed independent promotion.
  assert.match(receipt.release.app_sha, /^[0-9a-f]{40}$/);
  assert.match(receipt.release.shell_sha, /^[0-9a-f]{40}$/);
  assert.match(receipt.release.framework_sha, /^[0-9a-f]{40}$/);
  assert.match(receipt.release.bundle_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(receipt.release.cohort_ref, receipt.release.bundle_digest);
  assert.equal(receipt.target.repository, 'ghcr.io/gaofeng21cn/one-person-lab-webui');
  assert.match(receipt.target.digest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(receipt.target.platforms.map((platform: any) => `${platform.os}/${platform.architecture}`).sort(), ['linux/amd64', 'linux/arm64']);
  for (const tag of ['stable', 'latest']) assert.equal(receipt.anonymous_readback[tag].digest, receipt.target.digest);
  return receipt.target.digest as string;
}

async function main() {
  const { values } = parseArgs({ options: Object.fromEntries(['receipt', 'run', 'run-id', 'version', 'output'].map(key => [key, { type: 'string' as const }])) });
  const required = (key: string) => { assert(values[key], `Missing --${key}`); return values[key] as string; };
  const receipt = JSON.parse(fs.readFileSync(required('receipt'), 'utf8'));
  const digest = verifyCompletedWebui({ receipt, run: JSON.parse(fs.readFileSync(required('run'), 'utf8')),
    runId: required('run-id'), version: required('version') });
  const repository = 'gaofeng21cn/one-person-lab-webui';
  const response = await fetch(`https://ghcr.io/token?service=ghcr.io&scope=repository:${repository}:pull`, { signal: AbortSignal.timeout(30_000) });
  assert(response.ok, 'Anonymous OCI token request failed');
  const token = (await response.json() as any).token;
  const readbacks = [];
  for (const tag of [required('version'), 'stable', 'latest']) {
    const result = await fetch(`https://ghcr.io/v2/${repository}/manifests/${tag}`, { headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json',
    }, signal: AbortSignal.timeout(30_000) });
    assert(result.ok, `Anonymous ${tag} readback failed`);
    const bytes = Buffer.from(await result.arrayBuffer());
    assert.equal(`sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`, digest);
    const manifests = JSON.parse(bytes.toString()).manifests;
    for (const platform of receipt.target.platforms) assert(manifests.some((manifest: any) => manifest.digest === platform.digest
      && manifest.platform.os === platform.os && manifest.platform.architecture === platform.architecture));
    readbacks.push({ tag, digest });
  }
  fs.writeFileSync(required('output'), JSON.stringify({ schema: 'opl_completed_webui_reconciliation.v1', status: 'complete',
    source_run_id: required('run-id'), source: receipt.release, mutation_performed: false, rebuild_performed: false, readbacks }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
