import assert from 'node:assert/strict';
import test from 'node:test';
import { validateStudioCloudHandoff } from '../../scripts/validate-studio-cloud-handoff.ts';

function fixture(): any {
  const studioRef = '1'.repeat(40);
  return {
    schema: 'opl_studio_cloud_workspace_image_handoff.v1',
    status: 'preview_image_qualified',
    image: {
      repository: 'ghcr.io/gaofeng21cn/opl-studio-webui',
      index_ref: `ghcr.io/gaofeng21cn/opl-studio-webui@sha256:${'a'.repeat(64)}`,
      index_digest: `sha256:${'a'.repeat(64)}`,
      child_manifests: [
        { platform: 'linux/amd64', digest: `sha256:${'b'.repeat(64)}` },
        { platform: 'linux/arm64', digest: `sha256:${'c'.repeat(64)}` },
      ],
      immutable_tags: ['v0.1.5', `sha-${studioRef}`],
      channel_tag: 'preview',
      forbidden_tags: ['stable'],
    },
    source: { studio_ref: studioRef, app_ref: '2'.repeat(40), framework_ref: '3'.repeat(40), dsh_ref: '4'.repeat(40) },
    runtime: {
      endpoint: 'http:3000', health_path: '/healthz', readiness_path: '/readyz', deployment_mode: 'cloud', auth_mode: 'password', username_default: 'opl',
      environment: ['OPL_WEBUI_DEPLOYMENT_MODE', 'OPL_WEBUI_AUTH_MODE', 'OPL_WEBUI_USERNAME', 'OPL_WEBUI_PASSWORD_FILE', 'OPL_WEBUI_SESSION_SECRET_FILE'],
      cookie_name: 'aionui-session', session_days: 30, csrf: 'session_bound_header',
    },
    container: { user: '1000:1000', read_only_root: true, capabilities_dropped: 'ALL', no_new_privileges: true, volumes: ['/data', '/projects'], staged_inputs_root: '/data/inputs' },
    supply_chain: {
      sbom: 'spdx_present', provenance: 'buildkit_mode_max_present', cosign: 'index_and_child_digests_verified',
      workflow_identity: 'https://github.com/gaofeng21cn/opl-studio/.github/workflows/studio-webui-preview.yml@refs/heads/main',
      oidc_issuer: 'https://token.actions.githubusercontent.com',
    },
    rollback: { previous_index_digest: `sha256:${'d'.repeat(64)}` },
    adoption: { active_shell_adopted: false, release_ready: false, cloud_activation_owner: 'opl-cloud', cloud_activated: false },
  };
}

test('App admits only an immutable signed dual-architecture Studio Preview handoff', () => {
  assert.doesNotThrow(() => validateStudioCloudHandoff(fixture()));
});

test('Studio Preview handoff cannot claim Stable, adoption, or Cloud activation', () => {
  for (const mutate of [
    (value: any) => { value.image.channel_tag = 'stable'; },
    (value: any) => { value.adoption.release_ready = true; },
    (value: any) => { value.adoption.cloud_activated = true; },
    (value: any) => { value.supply_chain.workflow_identity = 'https://example.com/untrusted'; },
    (value: any) => { value.image.child_manifests[1].platform = 'linux/amd64'; },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() => validateStudioCloudHandoff(value));
  }
});
