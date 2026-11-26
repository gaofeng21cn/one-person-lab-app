import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

test('fresh Full admission resolves Scholar Skills from the catalog pinned by the artifact App', () => {
  const catalogRef = 'b'.repeat(40);
  const packageId = 'mas-scholar-skills';
  const index = JSON.stringify({
    schema_version: 'opl_software_catalog_index.v1',
    packages: [{
      package_id: packageId,
      manifest: { package_id: packageId, codex_surface: { carrier_source_commit: scholarSha } },
    }],
  });
  const pin = JSON.stringify({
    repository: 'gaofeng21cn/opl-catalog',
    ref: catalogRef,
    index_sha256: `sha256:${createHash('sha256').update(index).digest('hex')}`,
  });
  const input = { freshBuild: true, appRef: appSha, frameworkRef: 'a'.repeat(40) };
  const runner = (command: string, args: string[]) => {
    if (command === 'gh') {
      assert.deepEqual(args, ['api',
        `repos/gaofeng21cn/one-person-lab-app/contents/contracts/app-software-catalog-source.json?ref=${appSha}`,
        '-H', 'Accept: application/vnd.github.raw+json']);
      return { status: 0, stdout: pin, stderr: '' };
    }
    assert.equal(command, 'curl');
    assert.equal(args.at(-1), `https://raw.githubusercontent.com/gaofeng21cn/opl-catalog/${catalogRef}/catalog-index.json`);
    return { status: 0, stdout: index, stderr: '' };
  };

  assert.equal(resolveFullScholarSkillsRef({ ...input, requestedRef: scholarSha }, runner), scholarSha);
  assert.throws(() => resolveFullScholarSkillsRef({ ...input, requestedRef: catalogRef }, runner), /differs from the frozen software catalog source pin/);
  assert.throws(() => resolveFullScholarSkillsRef(input, (command, args) => {
    const result = runner(command, args);
    return command === 'curl' ? { ...result, stdout: index + '\n' } : result;
  }), /catalog index bytes differ from the frozen SHA-256/);
  assert.throws(() => resolveFullScholarSkillsRef(input, (command, args) => {
    assert.equal(command, 'gh');
    assert.ok(args[1].includes('app-software-catalog-source.json'));
    return { status: 1, stdout: '', stderr: 'gh: rate limit exceeded (HTTP 403)' };
  }), /Read frozen App Full software catalog pin/);
});

test('an older frozen App without a catalog pin uses its original Framework Scholar Skills pin', () => {
  const calls: string[] = [];
  const frameworkRef = 'a'.repeat(40);
  const runner = (command: string, args: string[]) => {
    assert.equal(command, 'gh');
    calls.push(args[1]);
    if (args[1].includes('app-software-catalog-source.json')) {
      return { status: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' };
    }
    return { status: 0, stdout: JSON.stringify({ package_id: 'mas-scholar-skills', codex_surface: { carrier_source_commit: scholarSha } }), stderr: '' };
  };
  const input = { freshBuild: true, appRef: appSha, frameworkRef };
  assert.equal(resolveFullScholarSkillsRef(input, runner), scholarSha);
  assert.deepEqual(calls, [
    `repos/gaofeng21cn/one-person-lab-app/contents/contracts/app-software-catalog-source.json?ref=${appSha}`,
    `repos/gaofeng21cn/one-person-lab/contents/contracts/opl-framework/packages/mas-scholar-skills.json?ref=${frameworkRef}`,
  ]);
  assert.throws(() => resolveFullScholarSkillsRef({ ...input, requestedRef: 'b'.repeat(40) }, runner), /differs from the frozen Framework source pin/);
  assert.throws(() => resolveFullScholarSkillsRef({ ...input, frameworkRef: undefined }, runner), /fresh Full Framework ref must be an exact/);
});

test('fresh Full admission fails before packaging when the frozen App lacks the dynamic local-component seed bridge', () => {
  const calls: string[][] = [];
  const runner = (command: string, args: string[]) => {
    calls.push([command, ...args]);
    if (command === 'git' && args[0] === 'rev-parse') {
      return { status: 0, stdout: `${scholarSha}\n`, stderr: '' };
    }
    if (command === 'gh' && args[0] === 'api' && args[1].includes('one-person-lab/contents/contracts/opl-framework/packages/mas-scholar-skills.json')) {
      return {
        status: 0,
        stdout: JSON.stringify({ package_id: 'mas-scholar-skills', codex_surface: { carrier_source_commit: scholarSha } }),
        stderr: '',
      };
    }
    if (command === 'gh' && args[0] === 'api' && args[1].includes('local-component-seeds.ts')) {
      return { status: 0, stdout: 'export function selectedLocalComponentSeedInputs() {}', stderr: '' };
    }
    if (command === 'gh' && args[0] === 'api' && args[1].includes('runtime-cache.ts')) {
      return { status: 0, stdout: 'local_component_seeds: selectedLocalComponentSeedInputs(options, packageProfile.package_ids)', stderr: '' };
    }
    return { status: 0, stdout: '', stderr: '' };
  };

  assert.throws(() => runFullAddonAdmissionPreflight({
    masScholarSkillsRef: scholarSha,
    artifactAppSha: appSha,
    verificationAppSha: appSha,
    artifactShellSha: appSha,
    verificationShellSha: appSha,
    freshBuild: true,
  }, runner), /dynamic local-component seed bridge/);
  assert.ok(calls.some((entry) => entry.join(' ').includes('local-component-seeds.ts')));
  assert.ok(calls.some((entry) => entry.join(' ').includes('runtime-cache.ts')));
});

test('fresh Full admission records the seed bridge check after the frozen App source passes', () => {
  const runner = (command: string, args: string[]) => {
    if (command === 'git' && args[0] === 'rev-parse') {
      return { status: 0, stdout: `${scholarSha}\n`, stderr: '' };
    }
    if (command === 'gh' && args[0] === 'api' && args[1].includes('one-person-lab/contents/contracts/opl-framework/packages/mas-scholar-skills.json')) {
      return {
        status: 0,
        stdout: JSON.stringify({ package_id: 'mas-scholar-skills', codex_surface: { carrier_source_commit: scholarSha } }),
        stderr: '',
      };
    }
    if (command === 'gh' && args[0] === 'api' && args[1].includes('local-component-seeds.ts')) {
      return {
        status: 0,
        stdout: [
          'selectedLocalComponentSeedInputs',
          "owner.management_scope !== 'local_component'",
          'carrier_source_commit',
          'payload.source_commit !== surface.carrier_source_commit',
        ].join('\n'),
        stderr: '',
      };
    }
    if (command === 'gh' && args[0] === 'api' && args[1].includes('runtime-cache.ts')) {
      return {
        status: 0,
        stdout: 'local_component_seeds selectedLocalComponentSeedInputs( packageProfile.package_ids',
        stderr: '',
      };
    }
    return { status: 0, stdout: '', stderr: '' };
  };

  const receipt = runFullAddonAdmissionPreflight({
    masScholarSkillsRef: scholarSha,
    artifactAppSha: appSha,
    verificationAppSha: appSha,
    artifactShellSha: appSha,
    verificationShellSha: appSha,
    freshBuild: true,
  }, runner);
  assert.equal(receipt.checks.full_seed_contract, 'dynamic_local_component_seed_bridge');
});


test('Full workflow resolves refs after verified checkpoint restore and freezes the fresh build checkout', () => {
  const read = (name: string) => parse(fs.readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8'));
  const full = read('_release-full-addon.yml');
  const steps = full.jobs['restore-standard'].steps;
  const refIndex = steps.findIndex((step: any) => step.id === 'full-refs');
  assert.ok(refIndex > steps.findIndex((step: any) => step.id === 'checkpoint'));
  assert.match(steps[refIndex].run, /--full-manifest "\$CHECKPOINT_DIR\/tracks\/full\/assets\/opl-release-manifest.json"/);
  assert.match(steps[refIndex].run, /--name "opl-full-diagnostics-\$CHECKPOINT_VERSION"/);
  assert.match(steps[refIndex].run, /source_args=\(--fresh-build --framework-ref "\$FULL_CONTENT_FRAMEWORK_REF"\)/);
  assert.equal(steps[refIndex].env.FULL_CONTENT_FRAMEWORK_REF, '${{ inputs.full_content_framework_ref }}');
  assert.equal(full.jobs['full-build'].with.mas_scholar_skills_ref, '${{ needs.restore-standard.outputs.mas_scholar_skills_ref }}');
  const build = read('full-first-install-release.yml');
  const checkout = build.jobs['full-first-install'].steps.find((step: any) => step.name === 'Checkout MAS Scholar Skills');
  assert.equal(checkout.with.ref, '${{ steps.seed-sources.outputs.mas-scholar-skills }}');
  assert.equal(full.jobs['full-clean-vm-qualification'].with.mas_scholar_skills_ref,
    '${{ needs.full-build.outputs.mas_scholar_skills_ref || needs.materialize-full-build.outputs.mas_scholar_skills_ref }}');
});
