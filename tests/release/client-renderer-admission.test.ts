import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  readAppShellAdapterContract,
  resolveActiveShellPaths,
  resolveClientRendererAdmission,
} from '../../scripts/app-shell-adapter.ts';

const appRoot = process.cwd();

function readJson(relativePath: string): any {
  return JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), 'utf8'));
}

test('active Studio and candidate Studio resolve through one App-owned Client renderer admission profile', () => {
  const profile = readJson('contracts/app-product-profile.json');
  const activeContract = readAppShellAdapterContract();
  const studioContract = readAppShellAdapterContract('contracts/shell-adapters/opl-studio.json');

  assert.deepEqual(resolveClientRendererAdmission(activeContract, profile), {
    schema: 'opl_app_client_renderer_admission.v1',
    rendererId: 'opl-studio',
    status: 'admitted_current_active_shell',
    selectionMode: 'active_release_adapter',
    compatibility: profile.client_renderer_compatibility,
  });
  assert.deepEqual(resolveClientRendererAdmission(studioContract, profile), {
    schema: 'opl_app_client_renderer_admission.v1',
    rendererId: 'opl-studio',
    status: 'candidate_validation_only_not_active_shell_admitted',
    selectionMode: 'candidate_validation_only',
    compatibility: profile.client_renderer_compatibility,
  });

  assert.equal(resolveActiveShellPaths({ contract: activeContract, shellRoot: '/tmp/opl-studio-stable' }).clientRendererAdmission?.rendererId, 'opl-studio');
  assert.equal(resolveActiveShellPaths({ contract: studioContract, shellRoot: '/tmp/opl-studio' }).clientRendererAdmission?.selectionMode, 'candidate_validation_only');
});

test('Client renderer admission rejects shared ABI and renderer-local authority drift', () => {
  const contract = readJson('contracts/app-shell-adapter.json');
  const mutations = [
    (profile: any) => { profile.client_renderer_compatibility.contribution_abi = 'renderer_local.v1'; },
    (profile: any) => { profile.client_renderer_compatibility.standard_view_types = ['list_detail']; },
    (profile: any) => { profile.client_renderer_compatibility.transport_binding_source = 'renderer.transport_bindings'; },
    (profile: any) => { profile.client_renderer_compatibility.transport_binding_schema = 'renderer_transport_bindings.v1'; },
    (profile: any) => { profile.client_renderer_compatibility.transport_binding_migration_state = 'complete'; },
    (profile: any) => { profile.client_renderer_compatibility.transport_binding_event = 'renderer/transport-bindings'; },
    (profile: any) => { profile.client_renderer_compatibility.typed_state_rpc = 'renderer state'; },
    (profile: any) => { profile.client_renderer_compatibility.typed_action_rpc = 'renderer action'; },
    (profile: any) => { profile.client_renderer_compatibility.typed_client_event = 'renderer/event'; },
    (profile: any) => { profile.client_renderer_compatibility.hot_switch_without_revalidation_allowed = true; },
    (profile: any) => { profile.client_renderer_compatibility.app_fixed_brand_registry_allowed = true; },
    (profile: any) => { profile.client_renderer_compatibility.client_fixed_brand_registry_allowed = true; },
    (profile: any) => { profile.client_renderer_compatibility.brand_capability_projection_policy = 'fixed_brand_registry'; },
  ];

  for (const mutate of mutations) {
    const profile = readJson('contracts/app-product-profile.json');
    mutate(profile);
    assert.throws(
      () => resolveClientRendererAdmission(contract, profile),
      /App Client renderer compatibility profile is invalid/,
    );
  }
});

test('active-shell command rejects an incompatible adapter before spawning its command', () => {
  const tempDir = fs.mkdtempSync(path.join(appRoot, 'contracts', '.client-renderer-admission-'));
  const contractPath = path.join(tempDir, 'invalid-adapter.json');
  const spawnedMarker = path.join(tempDir, 'spawned');
  try {
    const contract = readJson('contracts/app-shell-adapter.json');
    contract.client_renderer_admission.status = 'candidate_validation_only_not_active_shell_admitted';
    fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');

    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        'scripts/run-active-shell-command.ts',
        process.execPath,
        '-e',
        `require('node:fs').writeFileSync(${JSON.stringify(spawnedMarker)}, 'spawned')`,
      ],
      {
        cwd: appRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          OPL_APP_SHELL_ADAPTER_CONTRACT: path.relative(appRoot, contractPath),
        },
      },
    );

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /Shell opl-studio is not compatible/);
    assert.equal(fs.existsSync(spawnedMarker), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
