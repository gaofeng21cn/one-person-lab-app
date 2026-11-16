import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export type BundledCodexModel = {
  slug: string;
  display_name: string;
  visibility: string;
};

export const bundledCodexCatalogSource = 'codex_debug_models_bundled_in_isolated_codex_home';

/** Read the binary's catalog, never the user's configured or refreshed catalog. */
export function readBundledCodexModels(binary = 'codex'): BundledCodexModel[] {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-bundled-models-')));
  const executable = /[\\/]/.test(binary) ? path.resolve(binary) : binary;
  try {
    const output = execFileSync(executable, ['debug', 'models', '--bundled'], {
      cwd: home,
      env: { ...process.env, CODEX_HOME: home },
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return parseBundledCodexModels(JSON.parse(output));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

export function parseBundledCodexModels(value: unknown): BundledCodexModel[] {
  const models = (value as { models?: unknown } | null)?.models;
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error('Codex bundled catalog must contain a non-empty models array');
  }
  const ids = new Set<string>();
  for (const model of models) {
    if (!model || typeof model.slug !== 'string' || !model.slug.trim()
      || typeof model.display_name !== 'string' || !model.display_name.trim()
      || !['list', 'hide'].includes(model.visibility) || ids.has(model.slug)) {
      throw new Error('Codex bundled catalog contains an invalid or duplicate model');
    }
    ids.add(model.slug);
  }
  return models.map(({ slug, display_name, visibility }) => ({ slug, display_name, visibility }));
}

/** Membership follows upstream; Auto's model and reasoning remain App decisions. */
export function projectBundledCodexModels(
  profile: Record<string, any>,
  models: BundledCodexModel[],
): Record<string, any> {
  const next = structuredClone(profile);
  const policy = next.codex.auto_model_policy;
  const defaultModel = policy.configured_default.model;
  const visible = models.filter((model) => model.visibility === 'list');
  if (!visible.some((model) => model.slug === defaultModel)) {
    throw new Error(`App default ${defaultModel} is absent from the visible bundled catalog; review the default policy explicitly`);
  }
  const display = next.gui.home.codex_model_display_options;
  const existing = new Map<string, { label_zh: string; label_en: string }>(
    display.visible_models.map((model: { id: string; label_zh: string; label_en: string }) => [model.id, model]),
  );
  const ordered = [visible.find((model) => model.slug === defaultModel)!,
    ...visible.filter((model) => model.slug !== defaultModel)];
  display.visible_models = ordered.map((model) => {
    const old = existing.get(model.slug);
    const label = model.display_name.replace(/^GPT[- ]/i, '').replaceAll('-', ' ');
    return { id: model.slug, label_zh: old?.label_zh ?? label, label_en: old?.label_en ?? label };
  });
  policy.builtin_model_catalog_source = bundledCodexCatalogSource;
  policy.frontier_model_preference_order = ordered.map((model) => model.slug);
  return next;
}
