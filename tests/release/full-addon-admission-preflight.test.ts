import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { parse } from 'yaml';

import { resolveFullScholarSkillsRef, runFullAddonAdmissionPreflight } from '../../scripts/validate-full-addon-admission.ts';

const scholarSha = '10e9adf0f580670c75e499391a386fc7ea482166';
const appSha = 'c35ddda55f314438bb7cd999110221d23217c883';

function fakeGitRunner(command: string, args: string[]) {
  if (command === 'git' && args[0] === 'rev-parse') {
    return { status: 0, stdout: `${scholarSha}\n`, stderr: '' };
  }
  return { status: 0, stdout: '', stderr: '' };
}

test('Full admission preflight rejects malformed Scholar Skills refs before remote work', () => {
  assert.throws(() => runFullAddonAdmissionPreflight({
    masScholarSkillsRef: 'not-a-sha',
    artifactAppSha: appSha,
    verificationAppSha: appSha,
    artifactShellSha: appSha,
    verificationShellSha: appSha,
  }, fakeGitRunner), /mas_scholar_skills_ref must be an exact lowercase 40-character SHA/);
});

test('Full admission preflight accepts a reachable exact ref for an unchanged cohort', () => {
  const receipt = runFullAddonAdmissionPreflight({
    masScholarSkillsRef: scholarSha,
    artifactAppSha: appSha,
    verificationAppSha: appSha,
    artifactShellSha: appSha,
    verificationShellSha: appSha,
  }, fakeGitRunner);
  assert.deepEqual(receipt.checks, {
    mas_scholar_skills_ref: 'reachable_exact_commit',
    reusable_harness_scope: 'exact_cohort',
  });
  assert.equal(receipt.mas_scholar_skills_ref, scholarSha);
});

test('Full admission preflight rejects reuse when the verification harness changes product paths', () => {
  const verificationAppSha = 'd'.repeat(40);
  const runner = (command: string, args: string[]) => {
    if (command === 'git' && args[0] === 'rev-parse') {
      return { status: 0, stdout: `${scholarSha}\n`, stderr: '' };
    }
    if (command === 'git' && args[0] === 'show') {
      if (args[1].endsWith('app-shell-adapter.json')) {
        return {
          status: 0,
          stdout: JSON.stringify({
            active_shell: 'opl-studio',
            shell_source: { owner_repo: 'gaofeng21cn/opl-studio' },
          }),
          stderr: '',
        };
      }
      return {
        status: 0,
        stdout: JSON.stringify({
          profiles: { full: { semantic_digest: '1'.repeat(64), probe_digest: '2'.repeat(64) } },
        }),
        stderr: '',
      };
    }
    if (command === 'git' && args[0] === 'diff') {
      return { status: 0, stdout: 'src/modules/app-state.ts\n', stderr: '' };
    }
    return { status: 0, stdout: '', stderr: '' };
  };

  assert.throws(() => runFullAddonAdmissionPreflight({
    masScholarSkillsRef: scholarSha,
    artifactAppSha: appSha,
    verificationAppSha,
    artifactShellSha: appSha,
    verificationShellSha: appSha,
  }, runner), /Reusable Full qualification harness is not authorized: app_changed/);
});


test('Full recovery binds Scholar Skills to the existing artifact without reading current main', () => {
  const manifest = {
    resolved_refs: { mas_scholar_skills: { resolved_commit: scholarSha } },
    components: { mas_scholar_skills: { git_commit: scholarSha } },
  };
  const noRemote = () => { throw new Error('recovery cannot resolve current main'); };
  assert.equal(resolveFullScholarSkillsRef({ fullManifest: manifest }, noRemote), scholarSha);
  assert.equal(resolveFullScholarSkillsRef({ fullManifest: { schema: 'opl_public_release_manifest.v1', manifest } }, noRemote), scholarSha);
  assert.throws(() => resolveFullScholarSkillsRef({ fullManifest: manifest, requestedRef: 'a'.repeat(40) }, noRemote), /differs from the existing Full artifact/);
  assert.throws(() => resolveFullScholarSkillsRef({ requestedRef: scholarSha }, noRemote), /require their exact manifest/);
  assert.throws(() => resolveFullScholarSkillsRef({ fullManifest: { ...manifest, components: {} } }, noRemote), /component and resolved ref differ/);
});

test('fresh Full admission freezes one exact Scholar Skills ref for the build', () => {
  const calls: string[][] = [];
  const runner = (_command: string, args: string[]) => {
    calls.push(args);
    return { status: 0, stdout: `${scholarSha}\trefs/heads/main\n`, stderr: '' };
  };
  assert.equal(resolveFullScholarSkillsRef({ freshBuild: true }, runner), scholarSha);
  assert.equal(calls.length, 1);
  assert.equal(resolveFullScholarSkillsRef({ freshBuild: true, requestedRef: scholarSha }, runner), scholarSha);
  assert.equal(calls.length, 1);
  assert.throws(() => resolveFullScholarSkillsRef({ freshBuild: true }, () => ({ status: 0, stdout: '', stderr: '' })), /exactly one ref/);
});


test('Full workflow resolves refs after verified checkpoint restore and freezes the fresh build checkout', () => {
  const read = (name: string) => parse(fs.readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8'));
  const full = read('_release-full-addon.yml');
  const steps = full.jobs['restore-standard'].steps;
  const refIndex = steps.findIndex((step: any) => step.id === 'full-refs');
  assert.ok(refIndex > steps.findIndex((step: any) => step.id === 'checkpoint'));
  assert.match(steps[refIndex].run, /--full-manifest "\$CHECKPOINT_DIR\/tracks\/full\/assets\/opl-release-manifest.json"/);
  assert.match(steps[refIndex].run, /--name "opl-full-diagnostics-\$CHECKPOINT_VERSION"/);
  assert.match(steps[refIndex].run, /source_args=\(--fresh-build\)/);
  assert.equal(full.jobs['full-build'].with.mas_scholar_skills_ref, '${{ needs.restore-standard.outputs.mas_scholar_skills_ref }}');
  const build = read('full-first-install-release.yml');
  const checkout = build.jobs['full-first-install'].steps.find((step: any) => step.name === 'Checkout MAS Scholar Skills');
  assert.equal(checkout.with.ref, "${{ inputs.mas_scholar_skills_ref || 'main' }}");
  assert.equal(full.jobs['full-clean-vm-qualification'].with.mas_scholar_skills_ref,
    '${{ needs.full-build.outputs.mas_scholar_skills_ref || needs.materialize-full-build.outputs.mas_scholar_skills_ref }}');
});
