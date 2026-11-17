import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import ts from 'typescript';
import { readBundledCodexModels, projectBundledCodexModels } from './codex-bundled-models.ts';
import {
  projectCodexModelPolicyContracts,
  type CodexModelPolicyContractBundle,
} from './app-product-profile/codex-model-policy-projection.ts';
import { appRoot } from './app-product-profile/paths.ts';

const contractPaths = {
  productProfile: 'contracts/app-product-profile.json',
  guiProductContract: 'contracts/app-gui-product-contract.json',
  pageStateMatrix: 'contracts/app-page-state-matrix.json',
} as const;

function readBundle(): CodexModelPolicyContractBundle {
  return Object.fromEntries(Object.entries(contractPaths).map(([key, relativePath]) => [
    key,
    JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), 'utf8')),
  ])) as CodexModelPolicyContractBundle;
}

/** Keep unrelated contract formatting intact when regenerating a few fields. */
export function projectJsonText(text: string, nextValue: unknown): string {
  const sourceFile = ts.parseJsonText('contract.json', text);
  const root = sourceFile.statements[0].expression;
  const edits: Array<{ start: number; end: number; text: string }> = [];
  function visit(node: ts.Expression, current: any, next: any): void {
    if (JSON.stringify(current) === JSON.stringify(next)) return;
    if (ts.isObjectLiteralExpression(node) && current && next
      && JSON.stringify(Object.keys(current)) === JSON.stringify(Object.keys(next))) {
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name)) {
          throw new Error('Expected a JSON object property');
        }
        visit(property.initializer, current[property.name.text], next[property.name.text]);
      }
      return;
    }
    const start = node.getStart(sourceFile);
    const indent = text.slice(text.lastIndexOf('\n', start) + 1, start).match(/^\s*/)?.[0] ?? '';
    edits.push({ start, end: node.end, text: JSON.stringify(next, null, 2).replaceAll('\n', `\n${indent}`) });
  }
  visit(root, JSON.parse(text), nextValue);
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }
  return text;
}

function writeBundle(bundle: CodexModelPolicyContractBundle): string[] {
  const changed: string[] = [];
  for (const [key, relativePath] of Object.entries(contractPaths)) {
    const targetPath = path.join(appRoot, relativePath);
    const currentText = fs.readFileSync(targetPath, 'utf8');
    const nextValue = bundle[key as keyof CodexModelPolicyContractBundle];
    if (JSON.stringify(JSON.parse(currentText)) !== JSON.stringify(nextValue)) {
      const next = projectJsonText(currentText, nextValue);
      fs.writeFileSync(targetPath, next, 'utf8');
      changed.push(relativePath);
    }
  }
  return changed;
}

function main(): void {
  const { values } = parseArgs({ options: {
    check: { type: 'boolean' },
    bundled: { type: 'boolean' },
    codex: { type: 'string' },
  }, strict: true });
  if (values.codex && !values.bundled) throw new Error('--codex requires --bundled');
  const current = readBundle();
  const source = values.bundled ? {
    ...current,
    productProfile: projectBundledCodexModels(current.productProfile, readBundledCodexModels(values.codex)),
  } : current;
  const projected = projectCodexModelPolicyContracts(source);
  const checkOnly = values.check;
  if (checkOnly) {
    if (JSON.stringify(current) !== JSON.stringify(projected)) {
      throw new Error(`Codex model policy projections are stale; run npm run codex:model-policy:sync${values.bundled ? ' -- --bundled' : ''}`);
    }
    console.log(JSON.stringify({
      status: 'current',
      authority: 'contracts/app-product-profile.json#codex.auto_model_policy.configured_default',
      role: values.bundled ? 'bundled_catalog_and_app_fallback_projection' : 'app_fallback_projection_only',
      projection: contractPaths.productProfile,
    }, null, 2));
    return;
  }
  console.log(JSON.stringify({
    status: 'synced',
    authority: 'contracts/app-product-profile.json#codex.auto_model_policy.configured_default',
    role: values.bundled ? 'bundled_catalog_and_app_fallback_projection' : 'app_fallback_projection_only',
    changed: writeBundle(projected),
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
