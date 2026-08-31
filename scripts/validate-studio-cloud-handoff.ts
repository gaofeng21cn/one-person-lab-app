#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = 'ghcr.io/gaofeng21cn/opl-studio-webui';
const workflowIdentity = 'https://github.com/gaofeng21cn/opl-studio/.github/workflows/studio-webui-preview.yml@refs/heads/main';
const oidcIssuer = 'https://token.actions.githubusercontent.com';
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const shaPattern = /^[0-9a-f]{40}$/;

function equal(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} does not match the App-owned Studio Preview contract`);
  }
}

function exactDigest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !digestPattern.test(value)) throw new Error(`${label} must be an exact OCI digest`);
  return value;
}

function exactSha(value: unknown, label: string): string {
  if (typeof value !== 'string' || !shaPattern.test(value)) throw new Error(`${label} must be an exact Git SHA`);
  return value;
}

export function validateStudioCloudHandoff(value: any): void {
  equal(value?.schema, 'opl_studio_cloud_workspace_image_handoff.v1', 'handoff schema');
  equal(value?.status, 'preview_image_qualified', 'handoff status');
  equal(value?.image?.repository, repository, 'image repository');
  const indexDigest = exactDigest(value?.image?.index_digest, 'image.index_digest');
  equal(value?.image?.index_ref, `${repository}@${indexDigest}`, 'image.index_ref');
  const children = value?.image?.child_manifests;
  if (!Array.isArray(children) || children.length !== 2) throw new Error('image.child_manifests must contain exactly two native manifests');
  equal(children.map((entry: any) => entry.platform), ['linux/amd64', 'linux/arm64'], 'child platforms');
  const childDigests = children.map((entry: any, index: number) => exactDigest(entry.digest, `child_manifests[${index}].digest`));
  if (new Set([indexDigest, ...childDigests]).size !== 3) throw new Error('index and child digests must be distinct');
  const studioRef = exactSha(value?.source?.studio_ref, 'source.studio_ref');
  for (const field of ['app_ref', 'framework_ref', 'dsh_ref']) exactSha(value?.source?.[field], `source.${field}`);
  equal(value?.image?.immutable_tags, [`v${value?.image?.immutable_tags?.[0]?.slice(1)}`, `sha-${studioRef}`], 'immutable tags');
  if (!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(value.image.immutable_tags[0])) throw new Error('version tag must be numeric SemVer');
  equal(value?.image?.channel_tag, 'preview', 'channel tag');
  equal(value?.image?.forbidden_tags, ['stable'], 'forbidden tags');
  equal(value?.runtime, {
    endpoint: 'http:3000',
    health_path: '/healthz',
    readiness_path: '/readyz',
    deployment_mode: 'cloud',
    auth_mode: 'password',
    username_default: 'opl',
    environment: ['OPL_WEBUI_DEPLOYMENT_MODE', 'OPL_WEBUI_AUTH_MODE', 'OPL_WEBUI_USERNAME', 'OPL_WEBUI_PASSWORD_FILE', 'OPL_WEBUI_SESSION_SECRET_FILE'],
    cookie_name: 'aionui-session',
    session_days: 30,
    csrf: 'session_bound_header',
  }, 'runtime ABI');
  equal(value?.container, {
    user: '1000:1000',
    read_only_root: true,
    capabilities_dropped: 'ALL',
    no_new_privileges: true,
    volumes: ['/data', '/projects'],
    staged_inputs_root: '/data/inputs',
  }, 'container ABI');
  equal(value?.supply_chain, {
    sbom: 'spdx_present',
    provenance: 'buildkit_mode_max_present',
    cosign: 'index_and_child_digests_verified',
    workflow_identity: workflowIdentity,
    oidc_issuer: oidcIssuer,
  }, 'supply-chain evidence');
  const previousDigest = value?.rollback?.previous_index_digest;
  if (previousDigest !== null) exactDigest(previousDigest, 'rollback.previous_index_digest');
  equal(value?.adoption, {
    active_shell_adopted: false,
    release_ready: false,
    cloud_activation_owner: 'opl-cloud',
    cloud_activated: false,
  }, 'adoption boundary');
}

function main(): void {
  const handoffPath = process.argv[2];
  if (!handoffPath) throw new Error('usage: validate-studio-cloud-handoff.ts <handoff.json>');
  const absolutePath = path.resolve(handoffPath);
  validateStudioCloudHandoff(JSON.parse(fs.readFileSync(absolutePath, 'utf8')));
  console.log(JSON.stringify({ status: 'studio_cloud_handoff_valid', handoff: absolutePath }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
