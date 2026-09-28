#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import {
  inspectQualificationHarnessScope,
  type QualificationHarnessScopeCommandRunner,
  type QualificationHarnessScopeProof,
} from './qualification-harness-scope.ts';

const shaPattern = /^[0-9a-f]{40}$/;

export type FullAddonAdmissionPreflight = {
  schema: 'opl_full_addon_admission_preflight.v1';
  status: 'passed';
  package_profile: 'full';
  checks: {
    mas_scholar_skills_ref: 'reachable_exact_commit';
    reusable_harness_scope: 'exact_cohort' | 'verified_reusable_scope' | 'not_requested';
  };
  mas_scholar_skills_ref: string;
  harness_scope?: QualificationHarnessScopeProof;
};

export type FullAddonAdmissionPreflightInput = {
  masScholarSkillsRef: string;
  artifactAppSha: string;
  verificationAppSha: string;
  artifactShellSha: string;
  verificationShellSha: string;
  profile?: 'full';
};

function exactSha(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!shaPattern.test(normalized)) throw new Error(`${label} must be an exact lowercase 40-character SHA.`);
  return normalized;
}

function defaultRunner(command: string, args: string[], options: { cwd?: string } = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function commitReachable(
  runner: QualificationHarnessScopeCommandRunner,
  repo: string,
  commit: string,
): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-admission-ref-'));
  try {
    const run = (command: string, args: string[], label: string) => {
      const result = runner(command, args, { cwd: root });
      if (result.status !== 0) {
        const detail = result.stderr.trim() || result.stdout.trim() || `${command} exited ${String(result.status)}`;
        throw new Error(`${label}: ${detail}`);
      }
      return result.stdout;
    };
    run('git', ['init', '-q'], `initialize ${repo} ref check`);
    run('git', ['remote', 'add', 'origin', `https://github.com/${repo}.git`], `configure ${repo} ref check`);
    run('git', ['fetch', '--no-tags', '--depth=1', 'origin', commit], `fetch ${repo}@${commit}`);
    const resolved = run('git', ['rev-parse', 'FETCH_HEAD'], `resolve ${repo}@${commit}`).trim().toLowerCase();
    if (resolved !== commit) throw new Error(`${repo}@${commit} resolved to ${resolved}.`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

export function resolveFullScholarSkillsRef(
  input: { requestedRef?: string; fullManifest?: unknown; freshBuild?: boolean },
  runner: QualificationHarnessScopeCommandRunner = defaultRunner,
): string {
  const requested = input.requestedRef?.trim()
    ? exactSha(input.requestedRef, 'mas_scholar_skills_ref') : '';
  if (input.fullManifest !== undefined) {
    const document = input.fullManifest as Record<string, any>;
    const manifest = document?.schema === 'opl_public_release_manifest.v1' ? document.manifest : document;
    const ref = exactSha(String(manifest?.resolved_refs?.mas_scholar_skills?.resolved_commit ?? ''), 'Full manifest Scholar Skills ref');
    const componentRef = manifest?.components?.mas_scholar_skills?.git_commit;
    if (componentRef !== ref) throw new Error('Full manifest Scholar Skills component and resolved ref differ.');
    if (requested && requested !== ref) throw new Error('Requested Scholar Skills ref differs from the existing Full artifact.');
    return ref;
  }
  if (!input.freshBuild) throw new Error('Existing Full artifacts require their exact manifest; no current-main fallback is allowed.');
  if (requested) return requested;
  const result = runner('git', ['ls-remote', 'https://github.com/gaofeng21cn/mas-scholar-skills.git', 'refs/heads/main']);
  if (result.status !== 0) throw new Error(`Resolve fresh Full Scholar Skills source: ${result.stderr.trim()}`);
  const refs = result.stdout.trim().split('\n').map((line) => line.split(/\s+/));
  if (refs.length !== 1 || refs[0][1] !== 'refs/heads/main') throw new Error('Fresh Full Scholar Skills main must resolve to exactly one ref.');
  return exactSha(refs[0][0], 'fresh Full Scholar Skills ref');
}

export function runFullAddonAdmissionPreflight(
  input: FullAddonAdmissionPreflightInput,
  runner: QualificationHarnessScopeCommandRunner = defaultRunner,
): FullAddonAdmissionPreflight {
  const masScholarSkillsRef = exactSha(input.masScholarSkillsRef, 'mas_scholar_skills_ref');
  const artifactAppSha = exactSha(input.artifactAppSha, 'artifact App SHA');
  const verificationAppSha = exactSha(input.verificationAppSha, 'verification App SHA');
  const artifactShellSha = exactSha(input.artifactShellSha, 'artifact Shell SHA');
  const verificationShellSha = exactSha(input.verificationShellSha, 'verification Shell SHA');

  commitReachable(runner, 'gaofeng21cn/mas-scholar-skills', masScholarSkillsRef);

  const harnessChanged = artifactAppSha !== verificationAppSha || artifactShellSha !== verificationShellSha;
  if (!harnessChanged) {
    return {
      schema: 'opl_full_addon_admission_preflight.v1',
      status: 'passed',
      package_profile: 'full',
      checks: {
        mas_scholar_skills_ref: 'reachable_exact_commit',
        reusable_harness_scope: 'exact_cohort',
      },
      mas_scholar_skills_ref: masScholarSkillsRef,
    };
  }

  const harnessScope = inspectQualificationHarnessScope(runner, {
    artifactAppSha,
    verificationAppSha,
    artifactShellSha,
    verificationShellSha,
    profile: input.profile ?? 'full',
  });
  if (!harnessScope.reuse_authorization.allowed) {
    throw new Error(
      `Reusable Full qualification harness is not authorized: ${harnessScope.reuse_authorization.reason}; `
      + `App paths=${harnessScope.reuse_authorization.forbidden_paths.app.join(',') || '<none>'}; `
      + `Shell paths=${harnessScope.reuse_authorization.forbidden_paths.shell.join(',') || '<none>'}.`,
    );
  }
  return {
    schema: 'opl_full_addon_admission_preflight.v1',
    status: 'passed',
    package_profile: 'full',
    checks: {
      mas_scholar_skills_ref: 'reachable_exact_commit',
      reusable_harness_scope: 'verified_reusable_scope',
    },
    mas_scholar_skills_ref: masScholarSkillsRef,
    harness_scope: harnessScope,
  };
}

function main(): void {
  const { values } = parseArgs({
    options: {
      'mas-scholar-skills-ref': { type: 'string' },
      'full-manifest': { type: 'string' },
      'fresh-build': { type: 'boolean', default: false },
      'artifact-app-sha': { type: 'string' },
      'verification-app-sha': { type: 'string' },
      'artifact-shell-sha': { type: 'string' },
      'verification-shell-sha': { type: 'string' },
      profile: { type: 'string', default: 'full' },
    },
    strict: true,
  });
  const required = [
    ['artifact-app-sha', values['artifact-app-sha']],
    ['verification-app-sha', values['verification-app-sha']],
    ['artifact-shell-sha', values['artifact-shell-sha']],
    ['verification-shell-sha', values['verification-shell-sha']],
  ] as const;
  for (const [name, value] of required) if (!value) throw new Error(`Missing --${name}`);
  if (values.profile !== 'full') throw new Error('Full add-on admission preflight only supports --profile full.');
  const masScholarSkillsRef = resolveFullScholarSkillsRef({
    requestedRef: values['mas-scholar-skills-ref'],
    fullManifest: values['full-manifest'] ? JSON.parse(fs.readFileSync(values['full-manifest'], 'utf8')) : undefined,
    freshBuild: values['fresh-build'],
  });
  const result = runFullAddonAdmissionPreflight({
    masScholarSkillsRef,
    artifactAppSha: values['artifact-app-sha']!,
    verificationAppSha: values['verification-app-sha']!,
    artifactShellSha: values['artifact-shell-sha']!,
    verificationShellSha: values['verification-shell-sha']!,
    profile: 'full',
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
