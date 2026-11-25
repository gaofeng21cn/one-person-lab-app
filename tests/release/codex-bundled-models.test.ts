import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  parseBundledCodexModels,
  projectBundledCodexModels,
  readBundledCodexModels,
} from '../../scripts/codex-bundled-models.ts';
import { projectJsonText } from '../../scripts/sync-codex-model-policy.ts';

const profile = () => JSON.parse(fs.readFileSync('contracts/app-product-profile.json', 'utf8'));
const row = (slug: string, display_name: string, visibility = 'list') => ({ slug, display_name, visibility });

test('bundled refresh adds new official models, removes stale entries and excludes hidden models', () => {
  const source = profile();
  const before = structuredClone(source);
  const configuredDefault = before.codex.auto_model_policy.configured_default.model;
  const next = projectBundledCodexModels(source, parseBundledCodexModels({ models: [
    row('codex-future', 'Future Official'),
    row(configuredDefault, 'GPT-6.2-Astra'),
    row('internal-preview', 'Internal Preview', 'hide'),
  ] }));
  assert.deepEqual(next.codex.auto_model_policy.frontier_model_preference_order, [configuredDefault, 'codex-future']);
  assert.deepEqual(next.gui.home.codex_model_display_options.visible_models, [
    { id: configuredDefault, label_zh: '6.2 Astra', label_en: '6.2 Astra' },
    { id: 'codex-future', label_zh: 'Future Official', label_en: 'Future Official' },
  ]);
  assert.deepEqual(next.codex.auto_model_policy.configured_default, before.codex.auto_model_policy.configured_default);
  assert.deepEqual(next.codex.auto_model_policy.known_model_reasoning_effort_overrides,
    before.codex.auto_model_policy.known_model_reasoning_effort_overrides);
  assert.deepEqual(next.codex.auto_model_policy.custom_model_access_policy,
    before.codex.auto_model_policy.custom_model_access_policy);
  assert.deepEqual(source, before);
});

test('bundled refresh does not silently replace an App default removed or hidden upstream', () => {
  const configuredDefault = profile().codex.auto_model_policy.configured_default.model;
  for (const models of [[row('another', 'Another')], [row(configuredDefault, 'GPT-6.2-Astra', 'hide')]]) {
    assert.throws(() => projectBundledCodexModels(profile(), models), /review the default policy explicitly/);
  }
});

test('invalid bundled output cannot replace the App catalog', () => {
  for (const value of [null, {}, { models: [] }, { models: [row('a', 'A'), row('a', 'A')] },
    { models: [row('a', 'A', 'unknown')] }, { models: [{ slug: 'a' }] }]) {
    assert.throws(() => parseBundledCodexModels(value), /bundled catalog/);
  }
});

test('catalog regeneration preserves unrelated contract text and is idempotent', () => {
  const text = '{\n  "unrelated": ["keep", "inline"],\n  "models": ["old"]\n}\n';
  const next = { unrelated: ['keep', 'inline'], models: ['new', 'another'] };
  const projected = projectJsonText(text, next);
  assert.ok(projected.includes('"unrelated": ["keep", "inline"]'));
  assert.deepEqual(JSON.parse(projected), next);
  assert.equal(projectJsonText(projected, next), projected);
  const added = projectJsonText(text, { ...JSON.parse(text), source: 'bundled' });
  assert.equal(JSON.parse(added).source, 'bundled');
});

test('real subprocess uses bundled mode in an empty home instead of the configured custom catalog',
  { skip: process.platform === 'win32' }, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-model-catalog-test-'));
    try {
      const binary = path.join(directory, 'codex');
      const nodeBin = `'${process.execPath.replaceAll("'", "'\\''")}'`;
      const script = `#!/bin/sh
exec ${nodeBin} --input-type=commonjs - "$@" <<'__OPL_TEST_NODE_EOF__'
const fs = require('node:fs');
const path = require('node:path');
const isolated = process.env.CODEX_HOME;
const clean = isolated !== ${JSON.stringify(process.env.CODEX_HOME ?? '')}
  && process.cwd() === isolated && !fs.existsSync(path.join(isolated, 'config.toml'));
const bundled = process.argv.slice(2).join(' ') === 'debug models --bundled';
console.log(JSON.stringify({ models: clean && bundled
  ? [{ slug: 'official', display_name: 'Official', visibility: 'list' }]
  : [{ slug: 'deepseek-flash', display_name: 'Custom', visibility: 'list' }] }));
__OPL_TEST_NODE_EOF__\n`;
      fs.writeFileSync(binary, script, { mode: 0o755 });
      assert.deepEqual(readBundledCodexModels(binary).map((model) => model.slug), ['official']);
      assert.deepEqual(fs.readdirSync(directory), ['codex']);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
