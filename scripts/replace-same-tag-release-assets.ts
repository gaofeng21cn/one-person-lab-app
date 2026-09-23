#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

type Asset = { id: number; name: string; size: number; digest: string };
type Release = {
  id: number;
  tag_name: string;
  target_commitish: string;
  immutable: boolean;
  draft: boolean;
  body: string;
  assets: Asset[];
};
type Replacement = { current: Asset; file: string };
type Plan = {
  repository: string;
  release_id: number;
  tag: string;
  target_commitish: string;
  replacements: Replacement[];
  expected_body_sha256?: string;
  body_file?: string;
};
type Prepared = { current: Asset; next: Asset; stage: Asset; file: string };

function fail(message: string): never { throw new Error(message); }

function sha256(value: Buffer | string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function exactAsset(value: Asset, label: string): Asset {
  if (!Number.isSafeInteger(value.id) || value.id <= 0 ||
      !Number.isSafeInteger(value.size) || value.size <= 0 ||
      typeof value.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value.name) ||
      !/^sha256:[0-9a-f]{64}$/.test(value.digest)) fail(`Invalid ${label} identity.`);
  return value;
}

function runGh(args: string[], timeout = 120_000): { ok: boolean; output: string; error: string } {
  const result = spawnSync('gh', args, {
    encoding: 'utf8', timeout, env: { ...process.env, GH_PROMPT_DISABLED: '1' },
  });
  return {
    ok: !result.error && result.status === 0,
    output: result.stdout || '',
    error: (result.stderr || result.error?.message || '').trim(),
  };
}

function gh(args: string[]): string {
  const result = runGh(args);
  if (!result.ok) fail(`gh ${args[0]} failed: ${result.error}`);
  return result.output;
}

function release(plan: Plan): Release {
  const value = JSON.parse(gh(['api', `repos/${plan.repository}/releases/${plan.release_id}`])) as Release;
  if (value.id !== plan.release_id || value.tag_name !== plan.tag ||
      value.target_commitish !== plan.target_commitish || value.immutable || value.draft ||
      !Array.isArray(value.assets)) fail('Release identity or mutable publication state changed.');
  const ref = JSON.parse(gh(['api', `repos/${plan.repository}/git/ref/tags/${plan.tag}`])) as {
    ref?: string; object?: { type?: string; sha?: string };
  };
  if (ref.ref !== `refs/tags/${plan.tag}` || ref.object?.type !== 'commit' ||
      ref.object.sha !== plan.target_commitish) fail('Release tag target changed.');
  if (new Set(value.assets.map((asset) => asset.name)).size !== value.assets.length) {
    fail('Release contains duplicate asset names.');
  }
  return value;
}

function at(record: Release, name: string): Asset | undefined {
  return record.assets.find((asset) => asset.name === name);
}

function matches(observed: Asset | undefined, expected: Asset, name = expected.name): boolean {
  return !!observed && observed.name === name && observed.size === expected.size &&
    observed.digest === expected.digest && (expected.id === 0 || observed.id === expected.id);
}

function bodyMatches(record: Release, digest: string): boolean {
  return sha256(record.body) === digest;
}

function readPlan(file: string): Plan {
  const plan = JSON.parse(fs.readFileSync(file, 'utf8')) as Plan;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(plan.repository) ||
      !Number.isSafeInteger(plan.release_id) || plan.release_id <= 0 ||
      !/^v[A-Za-z0-9][A-Za-z0-9._-]*$/.test(plan.tag) ||
      !/^[0-9a-f]{40}$/.test(plan.target_commitish) ||
      !Array.isArray(plan.replacements) || plan.replacements.length === 0) fail('Invalid replacement plan.');
  if (new Set(plan.replacements.map((item) => item.current.name)).size !== plan.replacements.length) {
    fail('Replacement plan contains duplicate asset names.');
  }
  for (const item of plan.replacements) {
    exactAsset(item.current, 'current asset');
    if (path.basename(item.file) !== item.current.name || !fs.statSync(item.file).isFile()) {
      fail(`Replacement file must be a regular file named ${item.current.name}.`);
    }
  }
  if (plan.body_file && !/^[0-9a-f]{64}$/.test(plan.expected_body_sha256 || '')) {
    fail('Body replacement requires its exact current SHA-256.');
  }
  return plan;
}

function prepare(plan: Plan): Prepared[] {
  return plan.replacements.map(({ current, file }) => {
    const bytes = fs.readFileSync(file);
    const next: Asset = { id: 0, name: current.name, size: bytes.length, digest: `sha256:${sha256(bytes)}` };
    if (next.digest === current.digest && next.size === current.size) fail(`Unchanged replacement: ${next.name}.`);
    const stage = { ...next, name: `${next.name}.stage-${next.digest.slice(7, 23)}` };
    return { current, next, stage, file };
  });
}

function inspect(plan: Plan, prepared: Prepared[], mode: 'stage' | 'promote'): Release {
  const observed = release(plan);
  if (plan.expected_body_sha256 && !bodyMatches(observed, plan.expected_body_sha256)) {
    const wanted = plan.body_file && fs.readFileSync(plan.body_file, 'utf8');
    if (!wanted || observed.body !== wanted) fail('Release body changed outside this replacement.');
  }
  for (const item of prepared) {
    const canonical = at(observed, item.current.name);
    const staged = at(observed, item.stage.name);
    if (canonical && !matches(canonical, item.current) && !matches(canonical, item.next)) {
      fail(`Current asset CAS mismatch: ${item.current.name}.`);
    }
    if (staged && !matches(staged, item.stage)) fail(`Staged asset conflict: ${item.stage.name}.`);
    if (!canonical && !staged) fail(`Both current and staged assets are absent: ${item.current.name}.`);
    if (mode === 'stage' && !matches(canonical, item.current) && !matches(canonical, item.next)) {
      fail(`Cannot stage an asset with no current identity: ${item.current.name}.`);
    }
  }
  return observed;
}

function mutate(plan: Plan, args: string[]): Release {
  const result = runGh(args, 1_800_000);
  const observed = release(plan);
  if (!result.ok) fail(`GitHub mutation outcome must be reconciled from this readback before retry: ${result.error}`);
  return observed;
}

function stage(plan: Plan, prepared: Prepared[]): void {
  for (const item of prepared) {
    let observed = inspect(plan, prepared, 'stage');
    if (at(observed, item.stage.name)) continue;
    if (matches(at(observed, item.current.name), item.next)) continue;
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-stage-'));
    const stageFile = path.join(temp, item.stage.name);
    try {
      fs.linkSync(item.file, stageFile);
      observed = mutate(plan, ['release', 'upload', plan.tag, stageFile, '--repo', plan.repository]);
      if (!matches(at(observed, item.stage.name), item.stage)) fail(`Stage readback failed: ${item.stage.name}.`);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
}

function promote(plan: Plan, prepared: Prepared[]): void {
  const before = inspect(plan, prepared, 'promote');
  for (const item of prepared) {
    const canonical = at(before, item.current.name);
    const staged = at(before, item.stage.name);
    const complete = matches(canonical, item.next) && !staged;
    const ready = (!canonical || matches(canonical, item.current)) && matches(staged, item.stage);
    if (!complete && !ready) fail(`Replacement is not fully staged: ${item.current.name}.`);
  }
  for (const item of prepared) {
    let observed = inspect(plan, prepared, 'promote');
    if (matches(at(observed, item.current.name), item.next) && !at(observed, item.stage.name)) continue;
    if (!matches(at(observed, item.stage.name), item.stage)) fail(`Missing staged candidate: ${item.stage.name}.`);
    if (matches(at(observed, item.current.name), item.current)) {
      observed = mutate(plan, [
        'api', '--method', 'DELETE', `repos/${plan.repository}/releases/assets/${item.current.id}`,
      ]);
      if (at(observed, item.current.name)) fail(`Old asset deletion readback failed: ${item.current.name}.`);
    }
    const stageAsset = at(observed, item.stage.name);
    if (!stageAsset || !matches(stageAsset, item.stage)) fail(`Stage identity changed: ${item.stage.name}.`);
    observed = mutate(plan, [
      'api', '--method', 'PATCH', `repos/${plan.repository}/releases/assets/${stageAsset.id}`,
      '-f', `name=${item.current.name}`,
    ]);
    if (!matches(at(observed, item.current.name), item.next) || at(observed, item.stage.name)) {
      fail(`Promoted asset readback failed: ${item.current.name}.`);
    }
  }
  if (plan.body_file) {
    const nextBody = fs.readFileSync(plan.body_file, 'utf8');
    const observed = inspect(plan, prepared, 'promote');
    if (observed.body !== nextBody) {
      if (!bodyMatches(observed, plan.expected_body_sha256!)) fail('Release body CAS mismatch.');
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-release-body-'));
      try {
        const payload = path.join(temp, 'body.json');
        fs.writeFileSync(payload, JSON.stringify({ body: nextBody }));
        const updated = mutate(plan, [
          'api', '--method', 'PATCH', `repos/${plan.repository}/releases/${plan.release_id}`,
          '--input', payload,
        ]);
        if (updated.body !== nextBody) fail('Release body readback failed.');
      } finally {
        fs.rmSync(temp, { recursive: true, force: true });
      }
    }
  }
}

function main(): void {
  const { values } = parseArgs({ options: {
    plan: { type: 'string' }, stage: { type: 'boolean' }, promote: { type: 'boolean' },
  } });
  if (!values.plan || Number(!!values.stage) + Number(!!values.promote) !== 1) {
    fail('Usage: replace-same-tag-release-assets.ts --plan <file> (--stage | --promote)');
  }
  const plan = readPlan(values.plan);
  const prepared = prepare(plan);
  if (values.stage) stage(plan, prepared);
  else promote(plan, prepared);
  const observed = inspect(plan, prepared, 'promote');
  console.log(JSON.stringify({ release_id: observed.id, tag: observed.tag_name,
    assets: prepared.map((item) => ({ name: item.current.name,
      stage: at(observed, item.stage.name)?.id || null,
      current: at(observed, item.current.name)?.id || null,
      current_digest: at(observed, item.current.name)?.digest || null })),
    body_sha256: sha256(observed.body) }, null, 2));
}

main();
