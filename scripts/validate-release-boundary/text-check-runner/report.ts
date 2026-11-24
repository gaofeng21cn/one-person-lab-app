import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

export function reportFailure(id: string, message: string): number {
  console.error(`FAIL ${id}: ${message}`);
  return 1;
}

const workflowParseCache = new Map<string, {
  workflow: Record<string, any>;
  text: string;
}>();

export function parseWorkflow(appRoot: string, relativePath: string, id: string): {
  workflow: Record<string, any>;
  text: string;
} | null {
  const absolutePath = path.join(appRoot, relativePath);
  try {
    const text = fs.readFileSync(absolutePath, 'utf8');
    const cached = workflowParseCache.get(absolutePath);
    if (cached?.text === text) return cached;
    const parsed = { workflow: parseYaml(text) as Record<string, any>, text };
    workflowParseCache.set(absolutePath, parsed);
    return parsed;
  } catch (error) {
    reportFailure(id, `${relativePath} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export function exactObject(value: unknown, expected: Record<string, unknown>): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  return Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([name, expectedValue]) => actual[name] === expectedValue);
}

export function hasStableMutationMutex(job: Record<string, any> | undefined): boolean {
  return job?.concurrency?.group === 'opl-release-bundle-global'
    && job.concurrency?.['cancel-in-progress'] === false;
}

export function requestsWritePermission(value: unknown): boolean {
  if (value === 'write-all') return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).some((permission) => permission === 'write');
}

export function jobRuns(job: Record<string, any> | undefined): string {
  return (Array.isArray(job?.steps) ? job.steps as Array<Record<string, any>> : [])
    .map((step) => typeof step.run === 'string' ? step.run : '')
    .join('\n');
}

export function jobEvidenceText(job: Record<string, any> | undefined): string {
  return (Array.isArray(job?.steps) ? job.steps as Array<Record<string, any>> : [])
    .map((step) => [
      typeof step.name === 'string' ? step.name : '',
      typeof step.run === 'string' ? step.run : '',
      typeof step.uses === 'string' ? step.uses : '',
      step.with && typeof step.with === 'object' ? JSON.stringify(step.with) : '',
    ].join('\n'))
    .join('\n');
}

export function actionSteps(action: Record<string, any>): Array<Record<string, any>> {
  return Array.isArray(action.runs?.steps)
    ? action.runs.steps as Array<Record<string, any>>
    : [];
}

export function hasLocalStep(job: Record<string, any> | undefined, uses: string): boolean {
  return Array.isArray(job?.steps)
    && job.steps.some((step: Record<string, any>) => step.uses === uses);
}

export function localActionUse(actionPath: string): string {
  return `./${actionPath.replace(/\/action\.yml$/, '')}`;
}

export function workflowJobs(workflow: Record<string, any>): Record<string, Record<string, any>> {
  return workflow.jobs && typeof workflow.jobs === 'object'
    ? workflow.jobs as Record<string, Record<string, any>>
    : {};
}

export function needsExactly(job: Record<string, any>, expected: string[]): boolean {
  const needs = typeof job.needs === 'string' ? [job.needs] : job.needs;
  return Array.isArray(needs) && needs.length === expected.length &&
    expected.every((name, index) => needs[index] === name);
}
