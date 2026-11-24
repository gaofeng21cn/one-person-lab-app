
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type JsonRecord = Record<string, unknown>;

export const repository = 'ghcr.io/gaofeng21cn/one-person-lab-webui';
export const receiptSchema = 'opl_app_webui_native_windows_smoke_receipt.v1';
const immutableRefPattern = new RegExp(`^${repository.replaceAll('.', '\\.')}@(sha256:[0-9a-f]{64})$`);
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const gitShaPattern = /^[0-9a-f]{40}$/;
export const requiredImageLabels = [
  'org.opencontainers.image.source',
  'org.opencontainers.image.revision',
  'org.opencontainers.image.version',
  'dev.onepersonlab.release.bundle-digest',
  'dev.onepersonlab.release.cohort-ref',
  'dev.onepersonlab.release.shell-revision',
  'dev.onepersonlab.release.framework-revision',
] as const;
export const ingressProxyScript = [
  "const net=require('net')",
  "const close=(a,b)=>{a.destroy();b.destroy()}",
  "net.createServer(client=>{const upstream=net.connect({host:'webui',port:3000});client.pipe(upstream);upstream.pipe(client);client.on('error',()=>close(client,upstream));upstream.on('error',()=>close(client,upstream))}).listen(3000,'0.0.0.0')",
].join(';');
export const proxyEnvironmentKeys = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
] as const;


export function fail(message: string): never {
  throw new Error(message);
}

export function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value as JsonRecord;
}

export function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string`);
  return value;
}

export function booleanValue(value: unknown, expected: boolean, label: string): void {
  if (value !== expected) fail(`${label} must be ${String(expected)}`);
}

export function integerValue(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) fail(`${label} must be an integer`);
  return Number(value);
}

export function parseImmutableImageRef(imageRef: string) {
  const match = imageRef.match(immutableRefPattern);
  if (!match) {
    fail(`--image must be ${repository}@sha256:<64 lowercase hex>; tags and guessed digests are forbidden`);
  }
  return { repository, digest: match[1], requestedRef: imageRef };
}

export function runIdValue(input = ''): string {
  if (input) {
    if (!/^[a-z0-9][a-z0-9-]{5,63}$/.test(input)) fail('--run-id must use 6-64 lowercase letters, digits, or hyphens');
    return input;
  }
  return `native-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex')}`;
}

export function buildComposeYaml(options: {
  imageRef: string;
  containerName: string;
  dataDir: string;
  projectsDir: string;
  port: number;
  runId: string;
}) {
  const quote = (value: string) => JSON.stringify(value);
  const ingressName = `${options.containerName}-ingress`;
  return [
    'services:',
    '  webui:',
    `    image: ${quote(options.imageRef)}`,
    '    pull_policy: never',
    `    container_name: ${quote(options.containerName)}`,
    '    restart: "no"',
    '    environment:',
    '      OPL_DATA_DIR: /data',
    '      OPL_PROJECTS_DIR: /projects',
    '    volumes:',
    `      - ${quote(`${options.dataDir}:/data`)}`,
    `      - ${quote(`${options.projectsDir}:/projects`)}`,
    '    labels:',
    '      dev.onepersonlab.validation.owner: native-windows-smoke',
    `      dev.onepersonlab.validation.run-id: ${quote(options.runId)}`,
    '    networks:',
    '      - native-smoke-internal',
    '  ingress:',
    `    image: ${quote(options.imageRef)}`,
    '    pull_policy: never',
    `    container_name: ${quote(ingressName)}`,
    '    restart: "no"',
    '    user: "65532:65532"',
    '    read_only: true',
    '    cap_drop:',
    '      - ALL',
    '    security_opt:',
    '      - no-new-privileges:true',
    '    environment:',
    ...proxyEnvironmentKeys.map((key) => `      ${key}: ""`),
    '    tmpfs:',
    '      - /data:rw,noexec,nosuid,nodev,size=64k,mode=1777',
    '      - /projects:rw,noexec,nosuid,nodev,size=64k,mode=1777',
    '      - /recovery:rw,noexec,nosuid,nodev,size=64k,mode=1777',
    '    entrypoint: ["/usr/local/bin/node", "-e"]',
    `    command: [${quote(ingressProxyScript)}]`,
    '    depends_on:',
    '      - webui',
    '    ports:',
    `      - ${quote(`127.0.0.1:${options.port}:3000`)}`,
    '    labels:',
    '      dev.onepersonlab.validation.owner: native-windows-smoke',
    `      dev.onepersonlab.validation.run-id: ${quote(options.runId)}`,
    '      dev.onepersonlab.validation.role: ingress',
    '    networks:',
    '      - native-smoke-internal',
    '      - native-smoke-ingress',
    'networks:',
    '  native-smoke-internal:',
    '    internal: true',
    '    labels:',
    '      dev.onepersonlab.validation.owner: native-windows-smoke',
    `      dev.onepersonlab.validation.run-id: ${quote(options.runId)}`,
    '  native-smoke-ingress:',
    '    labels:',
    '      dev.onepersonlab.validation.owner: native-windows-smoke',
    `      dev.onepersonlab.validation.run-id: ${quote(options.runId)}`,
    '',
  ].join('\n');
}

export function verifyPriorExactPullEvidence(filePath: string, requestedRef: string, expectedSha256: string) {
  const resolved = path.resolve(filePath);
  if (!digestPattern.test(expectedSha256)) {
    fail('--initial-pull-evidence-sha256 must be a sha256 digest');
  }
  const actualSha256 = digestFile(resolved);
  if (actualSha256 !== expectedSha256) {
    fail(`--initial-pull-evidence sha256 mismatch: expected ${expectedSha256}, got ${actualSha256}`);
  }
  const index = record(readJson(resolved), 'prior pull command index');
  if (index.schema !== 'opl_app_webui_native_windows_command_index.v1' || !Array.isArray(index.commands)) {
    fail('--initial-pull-evidence must be a native Windows smoke command index');
  }
  const commands = index.commands.map((value) => record(value, 'prior command'));
  const pulls = commands.filter((value) => {
    const command = value.command;
    return Array.isArray(command) && command[0] === 'docker' && (
      command[1] === 'pull' ||
      (command[1] === 'image' && command.includes('pull')) ||
      (command[1] === 'compose' && command.includes('pull'))
    );
  });
  if (
    pulls.length !== 1 ||
    !Array.isArray(pulls[0].command) ||
    pulls[0].command.length !== 3 ||
    pulls[0].command[0] !== 'docker' ||
    pulls[0].command[1] !== 'pull' ||
    pulls[0].command[2] !== requestedRef ||
    pulls[0].status !== 0 ||
    pulls[0].timed_out !== false
  ) {
    fail('--initial-pull-evidence must prove exactly one successful bounded pull of the requested digest');
  }
  for (const value of commands) {
    const command = value.command;
    if (!Array.isArray(command) || command[0] !== 'docker' || command[1] !== 'compose' || !command.includes('up')) continue;
    const pullIndex = command.indexOf('--pull');
    if (pullIndex < 0 || command[pullIndex + 1] !== 'never') {
      fail('--initial-pull-evidence must prove every compose up used --pull never');
    }
  }
  return { path: resolved, sha256: actualSha256 };
}

export function validateLabels(labels: JsonRecord, expected: JsonRecord = {}) {
  for (const key of requiredImageLabels) stringValue(labels[key], `image.labels.${key}`);
  if (labels['org.opencontainers.image.source'] !== 'https://github.com/gaofeng21cn/one-person-lab-app') {
    fail('image.labels.org.opencontainers.image.source must identify the App repository');
  }
  for (const key of ['org.opencontainers.image.revision', 'dev.onepersonlab.release.shell-revision', 'dev.onepersonlab.release.framework-revision']) {
    if (!gitShaPattern.test(String(labels[key]))) fail(`image.labels.${key} must be a lowercase 40-character Git SHA`);
  }
  for (const key of ['dev.onepersonlab.release.bundle-digest', 'dev.onepersonlab.release.cohort-ref']) {
    if (!digestPattern.test(String(labels[key]))) fail(`image.labels.${key} must be a sha256 digest`);
  }
  for (const [key, wanted] of Object.entries(expected)) {
    if (wanted && labels[key] !== wanted) fail(`image.labels.${key} expected ${wanted}, got ${String(labels[key])}`);
  }
}

export function publicationInput(value: unknown, label = 'receipt.publication') {
  const publication = record(value, label);
  const sourceRunId = stringValue(publication.source_run_id, `${label}.source_run_id`);
  if (!/^[1-9][0-9]*$/.test(sourceRunId)) fail(`${label}.source_run_id must be a positive decimal GitHub Actions run id`);
  const version = stringValue(publication.version, `${label}.version`);
  const appSha = stringValue(publication.app_sha, `${label}.app_sha`);
  const shellSha = stringValue(publication.shell_sha, `${label}.shell_sha`);
  const frameworkSha = stringValue(publication.framework_sha, `${label}.framework_sha`);
  for (const [field, sha] of [['app_sha', appSha], ['shell_sha', shellSha], ['framework_sha', frameworkSha]] as const) {
    if (!gitShaPattern.test(sha)) fail(`${label}.${field} must be a lowercase 40-character Git SHA`);
  }
  const bundleDigest = stringValue(publication.bundle_digest, `${label}.bundle_digest`);
  const cohortRef = stringValue(publication.cohort_ref, `${label}.cohort_ref`);
  for (const [field, digest] of [['bundle_digest', bundleDigest], ['cohort_ref', cohortRef]] as const) {
    if (!digestPattern.test(digest)) fail(`${label}.${field} must be a sha256 digest`);
  }
  if (publication.label_parity !== 'passed') fail(`${label}.label_parity must be passed`);
  return {
    source_run_id: sourceRunId,
    version,
    app_sha: appSha,
    shell_sha: shellSha,
    framework_sha: frameworkSha,
    bundle_digest: bundleDigest,
    cohort_ref: cohortRef,
    label_parity: 'passed',
  };
}

function validateHttpProbe(value: unknown, label: string) {
  const probe = record(value, label);
  if (probe.status !== 'passed') fail(`${label}.status must be passed`);
  const status = integerValue(probe.http_status, `${label}.http_status`);
  if (status < 200 || status >= 400) fail(`${label}.http_status must be 2xx or 3xx`);
  stringValue(probe.url, `${label}.url`);
  return probe;
}

export function digestFile(filePath: string) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

export function validateNativeWindowsSmokeReceipt(value: unknown) {
  const receipt = record(value, 'receipt');
  if (receipt.schema !== receiptSchema) fail(`receipt.schema must be ${receiptSchema}`);
  if (receipt.status !== 'passed') fail('receipt.status must be passed');
  if (receipt.lane !== 'windows_wsl2_native_post_public_smoke') fail('receipt.lane is invalid');
  runIdValue(stringValue(receipt.run_id, 'receipt.run_id'));
  if (Number.isNaN(Date.parse(stringValue(receipt.observed_at, 'receipt.observed_at')))) fail('receipt.observed_at must be a timestamp');

  const publication = publicationInput(receipt.publication);

  const image = record(receipt.image, 'receipt.image');
  const identity = parseImmutableImageRef(stringValue(image.requested_ref, 'receipt.image.requested_ref'));
  if (image.repository !== repository || image.digest !== identity.digest) fail('receipt.image identity does not match requested_ref');
  stringValue(image.image_id, 'receipt.image.image_id');
  if (!Array.isArray(image.repo_digests) || !image.repo_digests.includes(identity.requestedRef)) {
    fail('receipt.image.repo_digests must contain the requested immutable ref');
  }
  if (image.os !== 'linux' || image.architecture !== 'amd64') fail('receipt.image platform must be linux/amd64');
  validateLabels(record(image.labels, 'receipt.image.labels'), {
    'org.opencontainers.image.revision': publication.app_sha,
    'org.opencontainers.image.version': publication.version,
    'dev.onepersonlab.release.bundle-digest': publication.bundle_digest,
    'dev.onepersonlab.release.cohort-ref': publication.cohort_ref,
    'dev.onepersonlab.release.shell-revision': publication.shell_sha,
    'dev.onepersonlab.release.framework-revision': publication.framework_sha,
  });

  const host = record(receipt.host, 'receipt.host');
  if (host.platform !== 'windows_wsl2') fail('receipt.host.platform must be windows_wsl2');
  record(host.wsl2, 'receipt.host.wsl2');
  record(host.docker, 'receipt.host.docker');
  record(host.storage, 'receipt.host.storage');

  const runtime = record(receipt.runtime, 'receipt.runtime');
  stringValue(runtime.container_name, 'receipt.runtime.container_name');
  stringValue(runtime.container_id, 'receipt.runtime.container_id');
  if (runtime.container_image_id !== image.image_id) fail('receipt.runtime.container_image_id must match receipt.image.image_id');
  booleanValue(runtime.internal_network, true, 'receipt.runtime.internal_network');
  const internalNetworkName = stringValue(runtime.internal_network_name, 'receipt.runtime.internal_network_name');
  if (!internalNetworkName.endsWith('_native-smoke-internal')) {
    fail('receipt.runtime.internal_network_name is invalid');
  }
  const ingressNetworkName = `${internalNetworkName.slice(0, -'_native-smoke-internal'.length)}_native-smoke-ingress`;
  if (
    !Array.isArray(runtime.network_names) ||
    runtime.network_names.length !== 1 ||
    runtime.network_names[0] !== internalNetworkName
  ) {
    fail('receipt.runtime.network_names must contain only the internal smoke network');
  }
  const containerLabels = record(runtime.container_labels, 'receipt.runtime.container_labels');
  validateLabels(containerLabels, {
    'org.opencontainers.image.revision': publication.app_sha,
    'org.opencontainers.image.version': publication.version,
    'dev.onepersonlab.release.bundle-digest': publication.bundle_digest,
    'dev.onepersonlab.release.cohort-ref': publication.cohort_ref,
    'dev.onepersonlab.release.shell-revision': publication.shell_sha,
    'dev.onepersonlab.release.framework-revision': publication.framework_sha,
  });
  if (containerLabels['dev.onepersonlab.validation.owner'] !== 'native-windows-smoke') {
    fail('receipt.runtime.container_labels must bind native-windows-smoke ownership');
  }
  if (containerLabels['dev.onepersonlab.validation.run-id'] !== receipt.run_id) {
    fail('receipt.runtime.container_labels must bind the receipt run id');
  }
  const ingress = record(runtime.ingress, 'receipt.runtime.ingress');
  stringValue(ingress.container_name, 'receipt.runtime.ingress.container_name');
  stringValue(ingress.container_id, 'receipt.runtime.ingress.container_id');
  const ingressLabels = record(ingress.container_labels, 'receipt.runtime.ingress.container_labels');
  validateLabels(ingressLabels, {
    'org.opencontainers.image.revision': publication.app_sha,
    'org.opencontainers.image.version': publication.version,
    'dev.onepersonlab.release.bundle-digest': publication.bundle_digest,
    'dev.onepersonlab.release.cohort-ref': publication.cohort_ref,
    'dev.onepersonlab.release.shell-revision': publication.shell_sha,
    'dev.onepersonlab.release.framework-revision': publication.framework_sha,
  });
  if (
    ingress.container_image_id !== image.image_id ||
    ingressLabels['dev.onepersonlab.validation.owner'] !== 'native-windows-smoke' ||
    ingressLabels['dev.onepersonlab.validation.run-id'] !== receipt.run_id ||
    ingressLabels['dev.onepersonlab.validation.role'] !== 'ingress' ||
    ingress.same_exact_image !== true ||
    ingress.read_only !== true ||
    ingress.host_volumes !== 0 ||
    ingress.tmpfs_mounts !== 3 ||
    ingress.non_root !== true ||
    ingress.fixed_node_tcp_proxy !== true ||
    ingress.cap_drop_all !== true ||
    ingress.no_new_privileges !== true ||
    ingress.proxy_environment_cleared !== true ||
    !Array.isArray(ingress.network_names) ||
    ingress.network_names.length !== 2 ||
    new Set(ingress.network_names).size !== 2 ||
    !ingress.network_names.includes(internalNetworkName) ||
    !ingress.network_names.includes(ingressNetworkName)
  ) fail('receipt.runtime.ingress must bind the fixed ingress to the exact image without writable host state');

  const http = record(receipt.http, 'receipt.http');
  validateHttpProbe(http.root, 'receipt.http.root');
  validateHttpProbe(http.webmanifest, 'receipt.http.webmanifest');
  if (!Array.isArray(http.assets) || http.assets.length < 1) fail('receipt.http.assets must contain at least one passed asset');
  http.assets.forEach((probe, index) => validateHttpProbe(probe, `receipt.http.assets[${index}]`));
  const login = validateHttpProbe(http.login_session, 'receipt.http.login_session');
  booleanValue(login.session_cookie_observed, true, 'receipt.http.login_session.session_cookie_observed');
  booleanValue(login.json_object, true, 'receipt.http.login_session.json_object');

  const ui = record(receipt.ui, 'receipt.ui');
  if (ui.status !== 'passed' || ui.browser !== 'windows_chrome_headless') fail('receipt.ui must contain a passed Windows Chrome render');
  stringValue(ui.url, 'receipt.ui.url');
  booleanValue(ui.root_hydrated, true, 'receipt.ui.root_hydrated');
  if (integerValue(ui.visible_text_chars, 'receipt.ui.visible_text_chars') < 20) fail('receipt.ui.visible_text_chars must be at least 20');
  const screenshot = record(ui.screenshot, 'receipt.ui.screenshot');
  stringValue(screenshot.path, 'receipt.ui.screenshot.path');
  if (integerValue(screenshot.bytes, 'receipt.ui.screenshot.bytes') < 1000) fail('receipt.ui.screenshot.bytes must be at least 1000');
  if (!digestPattern.test(String(screenshot.sha256))) fail('receipt.ui.screenshot.sha256 must be a sha256 digest');

  const persistence = record(receipt.persistence, 'receipt.persistence');
  if (persistence.status !== 'passed' || persistence.data_marker !== 'preserved' || persistence.projects_marker !== 'preserved') {
    fail('receipt.persistence must prove both markers were preserved');
  }
  if (integerValue(persistence.recreate_count, 'receipt.persistence.recreate_count') < 1) fail('receipt.persistence.recreate_count must be positive');

  const noFetch = record(receipt.no_secondary_fetch, 'receipt.no_secondary_fetch');
  if (noFetch.status !== 'passed') fail('receipt.no_secondary_fetch.status must be passed');
  booleanValue(noFetch.isolated_empty_docker_config, true, 'receipt.no_secondary_fetch.isolated_empty_docker_config');
  if (noFetch.compose_pull_policy !== 'never' || noFetch.compose_up_pull_mode !== 'never') fail('receipt.no_secondary_fetch must use never pull policy');
  booleanValue(noFetch.internal_network, true, 'receipt.no_secondary_fetch.internal_network');
  if (noFetch.image_pull_events_after_initial_pull !== 0) fail('receipt.no_secondary_fetch must have zero later image pull events');
  if (noFetch.ingress_uses_same_exact_image !== true || noFetch.webui_only_internal_network !== true) {
    fail('receipt.no_secondary_fetch must bind the fixed ingress to the exact image and isolate WebUI on the internal network');
  }
  const pullProvenance = record(noFetch.pull_provenance, 'receipt.no_secondary_fetch.pull_provenance');
  if (!['performed_in_this_run', 'reused_prior_exact_pull'].includes(String(pullProvenance.mode))) {
    fail('receipt.no_secondary_fetch.pull_provenance.mode is invalid');
  }
  if (pullProvenance.exact_pull_ref !== identity.requestedRef || pullProvenance.exact_pull_count_total !== 1) {
    fail('receipt.no_secondary_fetch.pull_provenance must prove one exact digest pull');
  }
  stringValue(pullProvenance.evidence_path, 'receipt.no_secondary_fetch.pull_provenance.evidence_path');
  if (!digestPattern.test(String(pullProvenance.evidence_sha256))) {
    fail('receipt.no_secondary_fetch.pull_provenance.evidence_sha256 must be a sha256 digest');
  }

  const cleanup = record(receipt.cleanup, 'receipt.cleanup');
  if (
    cleanup.status !== 'passed' ||
    cleanup.owned_containers_remaining !== 0 ||
    cleanup.owned_networks_remaining !== 0 ||
    cleanup.runtime_directory_remaining !== false
  ) fail('receipt.cleanup must prove zero task-owned runtime remains');

  const bounded = record(receipt.bounded_execution, 'receipt.bounded_execution');
  for (const field of ['pull_timeout_seconds', 'command_timeout_seconds', 'health_timeout_seconds']) {
    if (integerValue(bounded[field], `receipt.bounded_execution.${field}`) < 1) fail(`receipt.bounded_execution.${field} must be positive`);
  }
  booleanValue(bounded.cleanup_always_runs, true, 'receipt.bounded_execution.cleanup_always_runs');
  return {
    schema: receiptSchema,
    status: 'passed',
    image_ref: identity.requestedRef,
    run_id: receipt.run_id,
    source_run_id: publication.source_run_id,
  };
}

export function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
}
