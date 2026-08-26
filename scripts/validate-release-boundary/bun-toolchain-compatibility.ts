import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { resolveActiveShellPaths } from '../app-shell-adapter.ts';

type JsonRecord = Record<string, any>;

const minimumBunVersionByLockfile = new Map<number, string>([
  [1, '1.0.0'],
  [2, '1.2.0'],
  [3, '1.4.0'],
]);

function versionParts(version: string): number[] | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return match ? match.slice(1).map(Number) : null;
}

function versionAtLeast(actual: string, minimum: string): boolean {
  const actualParts = versionParts(actual);
  const minimumParts = versionParts(minimum);
  if (!actualParts || !minimumParts) return false;
  for (let index = 0; index < actualParts.length; index += 1) {
    if (actualParts[index] !== minimumParts[index]) {
      return actualParts[index]! > minimumParts[index]!;
    }
  }
  return true;
}

function readYaml(filePath: string): JsonRecord {
  return parseYaml(fs.readFileSync(filePath, 'utf8')) as JsonRecord;
}

function stepBunVersion(
  workflow: JsonRecord,
  jobName: string | null,
  stepName: string,
): string {
  const steps =
    jobName === null ? workflow.runs?.steps : workflow.jobs?.[jobName]?.steps;
  const step = Array.isArray(steps)
    ? steps.find((candidate: JsonRecord) => candidate?.name === stepName)
    : null;
  return typeof step?.with?.['bun-version'] === 'string'
    ? step.with['bun-version']
    : '';
}

function shellLockfileVersion(shellRoot: string): number | null {
  const lockfile = fs.readFileSync(path.join(shellRoot, 'bun.lock'), 'utf8');
  const match = lockfile.match(/^\{\s*"lockfileVersion":\s*(\d+)\s*,/);
  return match ? Number(match[1]) : null;
}

function shellDockerfileBunVersion(shellRoot: string): string {
  const dockerfilePath = path.join(shellRoot, 'Dockerfile');
  if (!fs.existsSync(dockerfilePath)) return '';
  const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
  return dockerfile.match(/^ARG OPL_WEBUI_BUN_VERSION=(\d+\.\d+\.\d+)$/m)?.[1] ?? '';
}

export function collectBunToolchainCompatibilityViolations(
  appRoot: string,
  shellRoot = resolveActiveShellPaths().shellRoot,
): string[] {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(
        appRoot,
        'contracts',
        'app-full-third-party-source-manifest.json',
      ),
      'utf8',
    ),
  ) as JsonRecord;
  const appBunVersion = manifest.toolchain?.bun?.version;
  const lockfileVersion = shellLockfileVersion(shellRoot);
  const minimumBunVersion =
    lockfileVersion === null
      ? null
      : (minimumBunVersionByLockfile.get(lockfileVersion) ?? null);
  const callers = [
    {
      id: 'webui-dockerfile',
      version: shellDockerfileBunVersion(shellRoot),
    },
    {
      id: 'setup-active-shell-deps',
      version: stepBunVersion(
        readYaml(
          path.join(
            appRoot,
            '.github',
            'actions',
            'setup-active-shell-deps',
            'action.yml',
          ),
        ),
        null,
        'Setup bun',
      ),
    },
    {
      id: '_build-reusable',
      version: stepBunVersion(
        readYaml(
          path.join(appRoot, '.github', 'workflows', '_build-reusable.yml'),
        ),
        'build',
        'Setup bun',
      ),
    },
    {
      id: 'windows-updater-package-validation',
      version: stepBunVersion(
        readYaml(
          path.join(
            appRoot,
            '.github',
            'workflows',
            'windows-updater-package-validation.yml',
          ),
        ),
        'build-windows-updater-package',
        'Setup Bun',
      ),
    },
  ];
  const violations: string[] = [];
  if (typeof appBunVersion !== 'string' || !versionParts(appBunVersion)) {
    violations.push(
      'Full toolchain manifest must declare one exact Bun semantic version.',
    );
    return violations;
  }
  if (lockfileVersion === null) {
    violations.push(
      'Active Shell bun.lock must declare a numeric lockfileVersion.',
    );
  } else if (minimumBunVersion === null) {
    violations.push(
      `Active Shell bun.lock version ${lockfileVersion} has no admitted Bun compatibility floor.`,
    );
  } else if (!versionAtLeast(appBunVersion, minimumBunVersion)) {
    violations.push(
      `Active Shell bun.lock version ${lockfileVersion} requires Bun ${minimumBunVersion} or newer, got ${appBunVersion}.`,
    );
  }
  for (const caller of callers) {
    if (caller.version !== appBunVersion) {
      violations.push(
        `${caller.id} Bun version ${caller.version || '(missing)'} must equal ${appBunVersion}.`,
      );
    }
  }
  return violations;
}

export function validateBunToolchainCompatibility(appRoot: string): number {
  const violations = collectBunToolchainCompatibilityViolations(appRoot);
  for (const violation of violations)
    console.error(`FAIL bun_toolchain_compatibility: ${violation}`);
  return violations.length;
}
