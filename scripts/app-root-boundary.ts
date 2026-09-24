#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type BoundaryOptions = {
  root?: string;
  phase?: string;
  reportPass?: boolean;
};

const defaultAppRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const forbiddenRootPackageFields = [
  'aioncoreVersion',
  'dependencies',
  'electronRebuild',
  'engines',
  'lint-staged',
  'main',
  'optionalDependencies',
  'overrides',
  'patchedDependencies',
  'productName',
  'resolutions',
  'workspaces',
];

const requiredRootScripts = {
  'validate:app-root-boundary': 'node --experimental-strip-types scripts/app-root-boundary.ts',
  'typecheck': 'tsc --noEmit -p tsconfig.json',
  'gui': 'node --experimental-strip-types scripts/gui-launcher.ts',
  'validate:active-shell': 'node --experimental-strip-types scripts/validate-active-shell.ts',
  'validate:release-boundary': 'node --experimental-strip-types scripts/validate-release-boundary.ts',
  'validate:windows-platform-factory': 'node --experimental-strip-types scripts/validate-windows-platform-factory.ts',
  'release:prepare-standard': 'node --experimental-strip-types scripts/prepare-standard-release-payload.ts',
  'release:framework-adapter': 'node --experimental-strip-types scripts/framework-release-adapter.ts',
  'release:deadline': 'node --experimental-strip-types scripts/release-operation-deadline.ts',
  'release:bind-standard': 'node --experimental-strip-types scripts/bind-standard-release-track.ts',
  'release:historical-candidate-record:status': 'node --experimental-strip-types scripts/validate-release-candidate-record.ts --status',
  'release:historical-bundle:status': 'node --experimental-strip-types scripts/release-bundle.ts status',
  'build-mac:arm64': 'node --experimental-strip-types scripts/prepare-standard-release-payload.ts && node --experimental-strip-types scripts/run-active-shell-command.ts npm run build-mac:arm64',
};

const forbiddenRootBuildArtifacts = [
  'index.js',
  path.join('out', 'main', 'index.js'),
  path.join('out', 'preload', 'index.js'),
  path.join('out', 'renderer', 'index.html'),
];

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function formatPhase(phase: string | undefined): string {
  return phase ? ` (${phase})` : '';
}

function assertRootScripts(packageJson: any, failures: string[]): void {
  if (!packageJson.scripts || typeof packageJson.scripts !== 'object') {
    failures.push('package.json must expose App root wrapper scripts');
    return;
  }

  for (const [scriptName, expectedCommand] of Object.entries(requiredRootScripts)) {
    if (packageJson.scripts[scriptName] !== expectedCommand) {
      failures.push(`package.json script ${scriptName} must stay ${expectedCommand}`);
    }
  }
}

function assertRootPackageJson(packageJsonPath: string, failures: string[]): void {
  if (!fs.existsSync(packageJsonPath)) {
    failures.push('missing App root package.json');
    return;
  }

  const packageJson = readJson(packageJsonPath);
  if (packageJson.name !== 'one-person-lab-app') {
    failures.push(`package.json name must stay one-person-lab-app, got ${JSON.stringify(packageJson.name)}`);
  }
  if (packageJson.private !== true) {
    failures.push('package.json private must stay true for the App product wrapper');
  }
  if (packageJson.type !== 'module') {
    failures.push(`package.json type must stay module, got ${JSON.stringify(packageJson.type)}`);
  }

  assertRootScripts(packageJson, failures);

  const devDependencies = packageJson.devDependencies;
  const expectedDevDependencies = {
    '@types/node': '22.15.3',
    ajv: '8.18.0',
    'ajv-formats': '3.0.1',
    typescript: '5.8.3',
    yaml: '2.8.1',
  };
  const normalizedDevDependencies = devDependencies && typeof devDependencies === 'object'
    ? Object.fromEntries(Object.entries(devDependencies).sort(([left], [right]) => left.localeCompare(right)))
    : devDependencies;
  const normalizedExpectedDevDependencies = Object.fromEntries(
    Object.entries(expectedDevDependencies).sort(([left], [right]) => left.localeCompare(right)),
  );
  if (JSON.stringify(normalizedDevDependencies) !== JSON.stringify(normalizedExpectedDevDependencies)) {
    failures.push('package.json devDependencies must pin the App root typecheck toolchain');
  }

  for (const field of forbiddenRootPackageFields) {
    if (Object.hasOwn(packageJson, field)) {
      failures.push(`package.json must not contain shell package field ${field}`);
    }
  }
}

function assertRootBuildArtifacts(appRoot: string, failures: string[]): void {
  for (const artifact of forbiddenRootBuildArtifacts) {
    const absolutePath = path.join(appRoot, artifact);
    if (fs.existsSync(absolutePath)) {
      failures.push(`shell build artifact must not exist at App root: ${artifact}`);
    }
  }
}

export function assertAppRootBoundary(options: BoundaryOptions = {}): void {
  const appRoot = path.resolve(options.root ?? defaultAppRoot);
  const packageJsonPath = path.join(appRoot, 'package.json');
  const failures: string[] = [];

  assertRootPackageJson(packageJsonPath, failures);
  assertRootBuildArtifacts(appRoot, failures);

  if (failures.length > 0) {
    throw new Error(`App root boundary violation${formatPhase(options.phase)}:\n- ${failures.join('\n- ')}`);
  }

  if (options.reportPass) {
    console.log('PASS: App root package wrapper and shell build artifact boundary are intact');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertAppRootBoundary({ reportPass: true });
}
