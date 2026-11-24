import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  githubApplyFullRequiredOptionNames,
  githubApplyRequiredOptionNames,
} from '../../framework-release-adapter.ts';

type GithubApplyInvocation = {
  workflow: string;
  job: string;
  step: string;
  options: Set<string>;
  mode: string;
  track: string;
  reconcileOnly: boolean;
};

const githubApplyCallerSpecs = [
  {
    workflow: '.github/workflows/_release-standard-publish.yml',
    job: 'publish-standard-nonlatest',
    track: 'standard',
    requiredOptions: githubApplyRequiredOptionNames,
    reconcileOnlyCalls: 0,
    publicationModes: ['execute', 'rehearsal'],
  },
  {
    workflow: '.github/workflows/_release-full-addon.yml',
    job: 'publish-full',
    track: 'full',
    requiredOptions: githubApplyFullRequiredOptionNames,
    reconcileOnlyCalls: 1,
    publicationModes: ['execute', 'rehearsal'],
  },
  {
    workflow: '.github/workflows/_release-full-addon.yml',
    job: 'restore-standard',
    track: 'full',
    requiredOptions: githubApplyFullRequiredOptionNames,
    reconcileOnlyCalls: 1,
    publicationModes: [],
  },
] as const;

function githubApplyBlocks(run: string): string[] {
  const lines = run.split(/\r?\n/);
  const blocks: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index]!.includes('framework-release-adapter.ts github-apply')) continue;
    const block = [lines[index]!];
    while (block.at(-1)!.trimEnd().endsWith('\\') && index + 1 < lines.length) {
      index += 1;
      block.push(lines[index]!);
    }
    blocks.push(block.join('\n'));
  }
  return blocks;
}

function githubApplyInvocations(appRoot: string): GithubApplyInvocation[] {
  const directory = path.join(appRoot, '.github', 'workflows');
  const invocations: GithubApplyInvocation[] = [];
  for (const file of fs.readdirSync(directory).filter((name) => /\.ya?ml$/.test(name)).sort()) {
    const relative = `.github/workflows/${file}`;
    const workflow = parseYaml(fs.readFileSync(path.join(directory, file), 'utf8')) as Record<string, any>;
    for (const [job, definition] of Object.entries(workflow.jobs ?? {})) {
      for (const step of Array.isArray((definition as Record<string, any>).steps)
        ? (definition as Record<string, any>).steps
        : []) {
        if (typeof step.run !== 'string') continue;
        for (const block of githubApplyBlocks(step.run)) {
          const options = new Set(
            [...block.matchAll(/--([a-z0-9][a-z0-9-]*)(?=\s|$)/g)].map((match) => match[1]!),
          );
          invocations.push({
            workflow: relative,
            job,
            step: String(step.name ?? '<unnamed>'),
            options,
            mode: block.match(/--mutation-mode\s+(rehearsal|execute)(?:\s|\\|$)/)?.[1] ?? '',
            track: block.match(/--track\s+(standard|full)(?:\s|\\|$)/)?.[1] ?? '',
            reconcileOnly: block.includes('--output full-read-only-reconcile.json')
              || block.includes('--output full-resume-reconcile-inspection.json'),
          });
        }
      }
    }
  }
  return invocations;
}

export function validateGithubApplyCallerParity(appRoot: string): number {
  const id = 'github_apply_caller_parser_parity';
  const invocations = githubApplyInvocations(appRoot);
  const registered = new Set(githubApplyCallerSpecs.map((spec) => `${spec.workflow}#${spec.job}`));
  let failures = 0;

  for (const invocation of invocations) {
    if (!registered.has(`${invocation.workflow}#${invocation.job}`)) {
      console.error(`FAIL ${id}: unregistered production github-apply caller ${invocation.workflow}#${invocation.job}`);
      failures += 1;
    }
  }
  for (const spec of githubApplyCallerSpecs) {
    const callers = invocations.filter(
      (invocation) => invocation.workflow === spec.workflow && invocation.job === spec.job,
    );
    const reconciliationCallers = callers.filter((caller) => caller.reconcileOnly);
    const publicationCallers = callers.filter((caller) => !caller.reconcileOnly);
    if (
      reconciliationCallers.length !== spec.reconcileOnlyCalls
      || reconciliationCallers.some((caller) => caller.mode !== 'execute')
    ) {
      console.error(`FAIL ${id}: ${spec.workflow}#${spec.job} has an invalid read-only reconciliation caller set`);
      failures += 1;
      continue;
    }
    const modes = publicationCallers.map((caller) => caller.mode).sort();
    if (JSON.stringify(modes) !== JSON.stringify(spec.publicationModes)) {
      console.error(
        `FAIL ${id}: ${spec.workflow}#${spec.job} publication modes ${JSON.stringify(modes)} `
        + `do not match ${JSON.stringify(spec.publicationModes)}`,
      );
      failures += 1;
      continue;
    }
    for (const caller of callers) {
      const missing = spec.requiredOptions.filter((name) => !caller.options.has(name));
      if (missing.length > 0 || caller.track !== spec.track) {
        console.error(
          `FAIL ${id}: ${caller.workflow}#${caller.job} ${caller.mode || '<missing-mode>'} `
          + `track=${caller.track || '<missing-track>'} missing=${missing.join(',') || '<none>'}`,
        );
        failures += 1;
      }
    }
    const optionSets = publicationCallers.map((caller) => [...caller.options].sort().join(','));
    if (optionSets.length === 2 && optionSets[0] !== optionSets[1]) {
      console.error(`FAIL ${id}: ${spec.workflow} rehearsal and execute option surfaces differ`);
      failures += 1;
    }
  }
  return failures;
}


