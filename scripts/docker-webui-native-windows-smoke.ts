#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { JsonRecord } from './docker-webui-native-windows-smoke/receipt.ts';
import type { CommandResult } from './docker-webui-native-windows-smoke/probes.ts';
import {
  buildComposeYaml,
  digestFile,
  fail,
  ingressProxyScript,
  parseImmutableImageRef,
  publicationInput,
  proxyEnvironmentKeys,
  readJson,
  receiptSchema,
  record,
  repository,
  requiredImageLabels,
  runIdValue,
  stringValue,
  validateLabels,
  validateNativeWindowsSmokeReceipt,
  verifyPriorExactPullEvidence,
} from './docker-webui-native-windows-smoke/receipt.ts';
import {
  cleanupEvidence,
  commandRunner,
  parseJsonOutput,
  probeWebui,
  renderWindowsUi,
} from './docker-webui-native-windows-smoke/probes.ts';
import { collectBaseline, planDocument, writeJson } from './docker-webui-native-windows-smoke/artifacts.ts';

export {
  buildComposeYaml,
  cleanupEvidence,
  commandRunner,
  parseImmutableImageRef,
  probeWebui,
  renderWindowsUi,
  validateNativeWindowsSmokeReceipt,
  verifyPriorExactPullEvidence,
};

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function execute() {
  const { values } = parseArgs({
    options: {
      image: { type: 'string' },
      artifacts: { type: 'string' },
      port: { type: 'string' },
      'run-id': { type: 'string' },
      'plan-only': { type: 'boolean' },
      'baseline-only': { type: 'boolean' },
      'descriptor-only': { type: 'boolean' },
      'validate-receipt': { type: 'string' },
      'pull-timeout': { type: 'string' },
      'command-timeout': { type: 'string' },
      'health-timeout': { type: 'string' },
      'expected-app-sha': { type: 'string' },
      'expected-shell-sha': { type: 'string' },
      'expected-framework-sha': { type: 'string' },
      'expected-version': { type: 'string' },
      'expected-bundle-digest': { type: 'string' },
      'expected-cohort-ref': { type: 'string' },
      'source-run-id': { type: 'string' },
      'reuse-local-image': { type: 'boolean' },
      'initial-pull-evidence': { type: 'string' },
      'initial-pull-evidence-sha256': { type: 'string' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    console.log(`Usage:\n  npm run smoke:docker-webui:native-windows -- --plan-only [--artifacts <dir>]\n  npm run smoke:docker-webui:native-windows -- --baseline-only [--artifacts <dir>]\n  npm run smoke:docker-webui:native-windows -- --descriptor-only --image ${repository}@sha256:<digest> [--artifacts <dir>]\n  npm run smoke:docker-webui:native-windows -- --image ${repository}@sha256:<digest> --source-run-id <run> --expected-version <version> --expected-app-sha <sha> --expected-shell-sha <sha> --expected-framework-sha <sha> --expected-bundle-digest sha256:<digest> --expected-cohort-ref sha256:<digest> [--reuse-local-image --initial-pull-evidence <command-index.json> --initial-pull-evidence-sha256 sha256:<digest>] [--artifacts <dir>] [--port <port>] [--json]\n  npm run smoke:docker-webui:native-windows -- --validate-receipt <file> [--json]`);
    return;
  }
  if (values['validate-receipt']) {
    const summary = validateNativeWindowsSmokeReceipt(readJson(path.resolve(values['validate-receipt'])));
    console.log(JSON.stringify(summary, null, values.json ? 0 : 2));
    return;
  }

  const executionRunId = values['plan-only'] || values['baseline-only'] ? '' : runIdValue(values['run-id']);
  const modeDirectory = values['plan-only'] ? 'successor-plan' : values['baseline-only'] ? 'baseline' : executionRunId;
  const artifactDir = path.resolve(values.artifacts ?? path.join(appRoot, 'tmp', 'docker-webui-native-windows-smoke', modeDirectory));
  fs.mkdirSync(artifactDir, { recursive: true });
  if (values['plan-only']) {
    const plan = planDocument(artifactDir);
    writeJson(path.join(artifactDir, 'native-windows-smoke-plan.json'), plan);
    console.log(JSON.stringify(plan, null, values.json ? 0 : 2));
    return;
  }
  if (values['baseline-only']) {
    const commandTimeoutSeconds = Number(values['command-timeout'] ?? 60);
    if (!Number.isInteger(commandTimeoutSeconds) || commandTimeoutSeconds < 1) fail('--command-timeout is invalid');
    const baseline = collectBaseline(artifactDir, commandTimeoutSeconds);
    console.log(JSON.stringify(baseline, null, values.json ? 0 : 2));
    return;
  }
  const identity = parseImmutableImageRef(stringValue(values.image, '--image'));
  const runId = executionRunId;
  const port = Number(values.port ?? 33173);
  const pullTimeoutSeconds = Number(values['pull-timeout'] ?? 1800);
  const commandTimeoutSeconds = Number(values['command-timeout'] ?? 60);
  const healthTimeoutSeconds = Number(values['health-timeout'] ?? 300);
  for (const [label, number] of [['port', port], ['pull-timeout', pullTimeoutSeconds], ['command-timeout', commandTimeoutSeconds], ['health-timeout', healthTimeoutSeconds]] as const) {
    if (!Number.isInteger(number) || number < 1 || (label === 'port' && number > 65535)) fail(`--${label} is invalid`);
  }

  const publication = values['descriptor-only'] ? null : publicationInput({
    source_run_id: values['source-run-id'],
    version: values['expected-version'],
    app_sha: values['expected-app-sha'],
    shell_sha: values['expected-shell-sha'],
    framework_sha: values['expected-framework-sha'],
    bundle_digest: values['expected-bundle-digest'],
    cohort_ref: values['expected-cohort-ref'],
    label_parity: 'passed',
  }, 'full smoke publication input');

  if (!values['descriptor-only'] && !fs.existsSync('/proc/sys/fs/binfmt_misc/WSLInterop')) {
    fail('Native Windows smoke must run inside WSL2 with Windows interop');
  }
  const reuseLocalImage = values['reuse-local-image'] === true;
  let priorPullEvidence: { path: string; sha256: string } | null = null;
  if (!values['descriptor-only'] && reuseLocalImage) {
    priorPullEvidence = verifyPriorExactPullEvidence(
      stringValue(values['initial-pull-evidence'], '--initial-pull-evidence'),
      identity.requestedRef,
      stringValue(values['initial-pull-evidence-sha256'], '--initial-pull-evidence-sha256'),
    );
  } else if (values['initial-pull-evidence'] || values['initial-pull-evidence-sha256']) {
    fail('--initial-pull-evidence and --initial-pull-evidence-sha256 require full smoke with --reuse-local-image');
  }
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), `opl-webui-${runId}-`));
  const dockerConfigDir = path.join(runtimeDir, 'docker-config');
  const dataDir = path.join(runtimeDir, 'data');
  const projectsDir = path.join(runtimeDir, 'projects');
  fs.mkdirSync(dockerConfigDir);
  fs.mkdirSync(dataDir);
  fs.mkdirSync(projectsDir);
  const baseEnv = { ...process.env, DOCKER_CONFIG: dockerConfigDir };
  const run = commandRunner(artifactDir, baseEnv, commandTimeoutSeconds);
  const commands: Omit<CommandResult, 'stdout' | 'stderr'>[] = [];
  const capture = (...args: Parameters<typeof run>) => {
    const result = run(...args);
    const { stdout: _stdout, stderr: _stderr, ...summary } = result;
    commands.push(summary);
    return result;
  };

  if (values['descriptor-only']) {
    try {
      const descriptor = capture('docker', ['manifest', 'inspect', identity.requestedRef], 'anonymous-descriptor', commandTimeoutSeconds);
      const payload = {
        schema: 'opl_app_webui_anonymous_descriptor_readback.v1',
        status: 'passed',
        observed_at: new Date().toISOString(),
        requested_ref: identity.requestedRef,
        repository: identity.repository,
        digest: identity.digest,
        isolated_empty_docker_config: true,
        descriptor: parseJsonOutput(descriptor, 'docker manifest inspect'),
        commands,
      };
      writeJson(path.join(artifactDir, 'anonymous-descriptor-readback.json'), payload);
      console.log(JSON.stringify(payload, null, values.json ? 0 : 2));
      return;
    } finally {
      fs.rmSync(runtimeDir, { recursive: true, force: true });
    }
  }
  if (!publication) fail('full smoke publication input is required');
  const projectName = `opl-native-${runId}`.slice(0, 63);
  const containerName = `${projectName}-webui`;
  const ingressContainerName = `${containerName}-ingress`;
  const internalNetworkName = `${projectName}_native-smoke-internal`;
  const ingressNetworkName = `${projectName}_native-smoke-ingress`;
  const composePath = path.join(runtimeDir, 'compose.yaml');
  const dataMarkerRelative = `.opl-native-smoke/${runId}/data-marker.txt`;
  const projectsMarkerRelative = `.opl-native-smoke/${runId}/projects-marker.txt`;
  fs.mkdirSync(path.dirname(path.join(dataDir, dataMarkerRelative)), { recursive: true });
  fs.mkdirSync(path.dirname(path.join(projectsDir, projectsMarkerRelative)), { recursive: true });
  fs.writeFileSync(path.join(dataDir, dataMarkerRelative), `data:${runId}\n`);
  fs.writeFileSync(path.join(projectsDir, projectsMarkerRelative), `projects:${runId}\n`);
  fs.writeFileSync(composePath, buildComposeYaml({ imageRef: identity.requestedRef, containerName, dataDir, projectsDir, port, runId }));

  const expectedLabels: JsonRecord = {
    'org.opencontainers.image.revision': publication.app_sha,
    'org.opencontainers.image.version': publication.version,
    'dev.onepersonlab.release.bundle-digest': publication.bundle_digest,
    'dev.onepersonlab.release.cohort-ref': publication.cohort_ref,
    'dev.onepersonlab.release.shell-revision': publication.shell_sha,
    'dev.onepersonlab.release.framework-revision': publication.framework_sha,
  };
  const receiptPath = path.join(artifactDir, 'native-windows-smoke-receipt.json');
  const failurePath = path.join(artifactDir, 'failure.json');
  let receipt: JsonRecord | null = null;
  let failure: JsonRecord | null = null;
  let eventSince = 0;
  let pullProvenance: JsonRecord | null = null;
  try {
    const windows = capture('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', [
      '-NoProfile',
      '-Command',
      '$os=Get-CimInstance Win32_OperatingSystem; $c=Get-PSDrive C; [pscustomobject]@{caption=$os.Caption;version=$os.Version;build=$os.BuildNumber;architecture=$os.OSArchitecture;c_free_bytes=[int64]$c.Free} | ConvertTo-Json -Compress',
    ], 'windows-baseline');
    const wsl = capture('sh', ['-lc', 'uname -a; printf "\\n---os-release---\\n"; cat /etc/os-release; printf "\\n---df---\\n"; df -B1 / /var/lib/docker'], 'wsl-baseline');
    const dockerVersion = capture('docker', ['version', '--format', '{{json .}}'], 'docker-version');
    const dockerInfo = capture('docker', ['info', '--format', '{{json .}}'], 'docker-info');
    const preContainers = capture('docker', ['ps', '-a', '--no-trunc', '--format', '{{json .}}'], 'pre-containers');
    const preImages = capture('docker', ['image', 'ls', '--no-trunc', '--digests', '--format', '{{json .}}'], 'pre-images');

    if (priorPullEvidence) {
      pullProvenance = {
        mode: 'reused_prior_exact_pull',
        exact_pull_ref: identity.requestedRef,
        exact_pull_count_total: 1,
        evidence_path: priorPullEvidence.path,
        evidence_sha256: priorPullEvidence.sha256,
      };
    } else {
      capture('docker', ['pull', identity.requestedRef], 'anonymous-pull-by-digest', pullTimeoutSeconds);
      pullProvenance = {
        mode: 'performed_in_this_run',
        exact_pull_ref: identity.requestedRef,
        exact_pull_count_total: 1,
        evidence_path: 'command-index.json',
        evidence_sha256: null,
      };
    }
    const imageInspectResult = capture('docker', ['image', 'inspect', identity.requestedRef], 'image-inspect');
    const imageInspectRaw = parseJsonOutput(imageInspectResult, 'docker image inspect');
    if (!Array.isArray(imageInspectRaw) || imageInspectRaw.length !== 1) fail('docker image inspect must return exactly one image');
    const imageInspect = record(imageInspectRaw[0], 'image inspect[0]');
    const imageId = stringValue(imageInspect.Id, 'image inspect Id');
    const repoDigests = Array.isArray(imageInspect.RepoDigests) ? imageInspect.RepoDigests.filter((entry): entry is string => typeof entry === 'string') : [];
    if (!repoDigests.includes(identity.requestedRef)) fail('pulled image RepoDigests does not include the requested immutable ref');
    if (imageInspect.Os !== 'linux' || imageInspect.Architecture !== 'amd64') fail('pulled image must be linux/amd64');
    const imageConfig = record(imageInspect.Config, 'image inspect Config');
    const imageLabels = record(imageConfig.Labels, 'image inspect Config.Labels');
    validateLabels(imageLabels, expectedLabels);

    eventSince = Math.floor(Date.now() / 1000) + 1;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    capture('docker', ['compose', '-p', projectName, '-f', composePath, 'up', '-d', '--pull', 'never'], 'compose-up-first', commandTimeoutSeconds);
    const firstHttp = await probeWebui(`http://127.0.0.1:${port}`, healthTimeoutSeconds);
    capture('docker', ['exec', containerName, 'cat', `/data/${dataMarkerRelative}`], 'data-marker-first');
    capture('docker', ['exec', containerName, 'cat', `/projects/${projectsMarkerRelative}`], 'projects-marker-first');
    capture('docker', ['compose', '-p', projectName, '-f', composePath, 'down', '--remove-orphans', '--timeout', '15'], 'compose-down-between');
    capture('docker', ['compose', '-p', projectName, '-f', composePath, 'up', '-d', '--pull', 'never'], 'compose-up-second', commandTimeoutSeconds);
    const baseUrl = `http://127.0.0.1:${port}`;
    const secondHttp = await probeWebui(baseUrl, healthTimeoutSeconds);
    const ui = renderWindowsUi({ run: capture, artifactDir, runtimeDir, url: `${baseUrl}/`, timeoutSeconds: healthTimeoutSeconds });
    capture('docker', ['exec', containerName, 'cat', `/data/${dataMarkerRelative}`], 'data-marker-second');
    capture('docker', ['exec', containerName, 'cat', `/projects/${projectsMarkerRelative}`], 'projects-marker-second');
    const containerInspectResult = capture('docker', ['inspect', containerName], 'container-inspect');
    const containerInspectRaw = parseJsonOutput(containerInspectResult, 'docker inspect');
    if (!Array.isArray(containerInspectRaw) || containerInspectRaw.length !== 1) fail('docker inspect must return exactly one container');
    const containerInspect = record(containerInspectRaw[0], 'container inspect[0]');
    const containerConfig = record(containerInspect.Config, 'container inspect Config');
    const containerHostConfig = record(containerInspect.HostConfig, 'container inspect HostConfig');
    const containerLabels = record(containerConfig.Labels, 'container inspect Config.Labels');
    const containerNetworks = Object.keys(
      record(record(containerInspect.NetworkSettings, 'container inspect NetworkSettings').Networks, 'container inspect networks'),
    ).sort();
    if (containerInspect.Image !== imageId) fail('running container image ID does not match pulled image ID');
    if (containerHostConfig.PortBindings && Object.keys(record(containerHostConfig.PortBindings, 'container port bindings')).length > 0) {
      fail('WebUI container must not publish a host port directly');
    }
    if (containerNetworks.length !== 1 || containerNetworks[0] !== internalNetworkName) {
      fail('WebUI container must attach only to the internal smoke network');
    }
    validateLabels(containerLabels, expectedLabels);
    if (containerLabels['dev.onepersonlab.validation.owner'] !== 'native-windows-smoke' || containerLabels['dev.onepersonlab.validation.run-id'] !== runId) {
      fail('running container is not bound to this validation owner and run ID');
    }
    const ingressInspectResult = capture('docker', ['inspect', ingressContainerName], 'ingress-container-inspect');
    const ingressInspectRaw = parseJsonOutput(ingressInspectResult, 'docker inspect ingress');
    if (!Array.isArray(ingressInspectRaw) || ingressInspectRaw.length !== 1) fail('docker inspect must return exactly one ingress container');
    const ingressInspect = record(ingressInspectRaw[0], 'ingress inspect[0]');
    const ingressConfig = record(ingressInspect.Config, 'ingress inspect Config');
    const ingressHostConfig = record(ingressInspect.HostConfig, 'ingress inspect HostConfig');
    const ingressLabels = record(ingressConfig.Labels, 'ingress inspect Config.Labels');
    const ingressNetworks = Object.keys(
      record(record(ingressInspect.NetworkSettings, 'ingress inspect NetworkSettings').Networks, 'ingress inspect networks'),
    ).sort();
    const ingressMounts = Array.isArray(ingressInspect.Mounts) ? ingressInspect.Mounts : [];
    const ingressHostMounts = ingressMounts.filter((value) => {
      const mount = record(value, 'ingress mount');
      return mount.Type === 'bind' || mount.Type === 'volume';
    });
    const ingressTmpfsMounts = ingressMounts.filter((value) => record(value, 'ingress mount').Type === 'tmpfs');
    const ingressEntrypoint = Array.isArray(ingressConfig.Entrypoint) ? ingressConfig.Entrypoint : [];
    const ingressCommand = Array.isArray(ingressConfig.Cmd) ? ingressConfig.Cmd : [];
    const capDrop = Array.isArray(ingressHostConfig.CapDrop) ? ingressHostConfig.CapDrop.map(String) : [];
    const securityOpt = Array.isArray(ingressHostConfig.SecurityOpt) ? ingressHostConfig.SecurityOpt.map(String) : [];
    const ingressEnvironment = Array.isArray(ingressConfig.Env) ? ingressConfig.Env.map(String) : [];
    const ingressPortBindings = record(ingressHostConfig.PortBindings, 'ingress port bindings');
    const ingressPort3000 = ingressPortBindings['3000/tcp'];
    if (ingressInspect.Image !== imageId || ingressLabels['dev.onepersonlab.validation.role'] !== 'ingress') {
      fail('ingress container must use the exact pulled image and fixed ingress role');
    }
    validateLabels(ingressLabels, expectedLabels);
    if (
      ingressLabels['dev.onepersonlab.validation.owner'] !== 'native-windows-smoke' ||
      ingressLabels['dev.onepersonlab.validation.run-id'] !== runId
    ) {
      fail('ingress container must bind native smoke ownership and run ID');
    }
    if (
      ingressEntrypoint.length !== 2 ||
      ingressEntrypoint[0] !== '/usr/local/bin/node' ||
      ingressEntrypoint[1] !== '-e' ||
      ingressCommand.length !== 1 ||
      ingressCommand[0] !== ingressProxyScript
    ) {
      fail('ingress container must run only the fixed Node TCP proxy');
    }
    if (proxyEnvironmentKeys.some((key) => !ingressEnvironment.includes(`${key}=`))) {
      fail('ingress container must clear all proxy environment variables');
    }
    if (
      ingressHostConfig.ReadonlyRootfs !== true ||
      !capDrop.includes('ALL') ||
      !securityOpt.some((value) => value === 'no-new-privileges' || value === 'no-new-privileges:true')
    ) {
      fail('ingress container must use a read-only rootfs, drop all capabilities, and prevent privilege escalation');
    }
    if (
      (Array.isArray(ingressHostConfig.Binds) && ingressHostConfig.Binds.length > 0) ||
      ingressHostMounts.length > 0 ||
      ingressTmpfsMounts.length !== 3
    ) {
      fail('ingress container must replace image volumes with three ephemeral tmpfs mounts and no host state');
    }
    if (
      ingressNetworks.length !== 2 ||
      !ingressNetworks.includes(internalNetworkName) ||
      !ingressNetworks.includes(ingressNetworkName)
    ) {
      fail('ingress container must attach only to the internal and host-ingress smoke networks');
    }
    if (
      Object.keys(ingressPortBindings).length !== 1 ||
      !Array.isArray(ingressPort3000) ||
      ingressPort3000.length !== 1 ||
      record(ingressPort3000[0], 'ingress port binding').HostIp !== '127.0.0.1' ||
      record(ingressPort3000[0], 'ingress port binding').HostPort !== String(port)
    ) {
      fail('ingress container must publish only the requested loopback port');
    }
    const networkInspectResult = capture(
      'docker',
      ['network', 'inspect', internalNetworkName, ingressNetworkName],
      'smoke-network-inspect',
    );
    const networkInspectRaw = parseJsonOutput(networkInspectResult, 'docker network inspect');
    if (!Array.isArray(networkInspectRaw) || networkInspectRaw.length !== 2) {
      fail('docker network inspect must return both smoke networks');
    }
    const inspectedNetworks = new Map(networkInspectRaw.map((value) => {
      const network = record(value, 'smoke network');
      return [stringValue(network.Name, 'smoke network name'), network];
    }));
    const inspectedInternalNetwork = record(inspectedNetworks.get(internalNetworkName), 'internal smoke network');
    const inspectedIngressNetwork = record(inspectedNetworks.get(ingressNetworkName), 'ingress smoke network');
    if (inspectedInternalNetwork.Internal !== true || inspectedIngressNetwork.Internal !== false) {
      fail('WebUI smoke network must be internal and host-ingress network must be non-internal');
    }
    const containerLogs = capture('docker', ['logs', '--tail', '500', containerName], 'container-logs');
    const ingressLogs = capture('docker', ['logs', '--tail', '100', ingressContainerName], 'ingress-container-logs');
    if (/\bnpm\s+(?:ci|install)\b|\bgit\s+clone\b/i.test(`${containerLogs.stdout}\n${containerLogs.stderr}`) || /\bnpm\b|\bgit\b|\bcurl\b|\bwget\b/i.test(`${ingressLogs.stdout}\n${ingressLogs.stderr}`)) {
      fail('container logs show a forbidden secondary dependency fetch command');
    }
    const eventUntil = Math.floor(Date.now() / 1000) + 1;
    const imageEvents = capture('docker', [
      'events', '--since', String(eventSince), '--until', String(eventUntil), '--filter', 'type=image', '--format', '{{json .}}',
    ], 'image-events-after-pull');
    const pullEvents = imageEvents.stdout.split(/\r?\n/).filter((line) => line.trim()).filter((line) => {
      try {
        const event = record(JSON.parse(line), 'docker image event');
        return String(event.Action ?? event.status ?? '').toLowerCase() === 'pull';
      } catch {
        return /\bpull\b/i.test(line);
      }
    });
    if (pullEvents.length !== 0) fail('Docker recorded an image pull after the initial exact-digest pull');

    receipt = {
      schema: receiptSchema,
      status: 'passed',
      run_id: runId,
      observed_at: new Date().toISOString(),
      lane: 'windows_wsl2_native_post_public_smoke',
      publication,
      image: {
        requested_ref: identity.requestedRef,
        repository: identity.repository,
        digest: identity.digest,
        image_id: imageId,
        repo_digests: repoDigests,
        os: imageInspect.Os,
        architecture: imageInspect.Architecture,
        labels: Object.fromEntries(requiredImageLabels.map((key) => [key, imageLabels[key]])),
      },
      host: {
        platform: 'windows_wsl2',
        wsl2: { raw_evidence: wsl.stdout_path },
        docker: {
          version: parseJsonOutput(dockerVersion, 'docker version'),
          info: parseJsonOutput(dockerInfo, 'docker info'),
          pre_containers_evidence: preContainers.stdout_path,
          pre_images_evidence: preImages.stdout_path,
        },
        storage: { windows: parseJsonOutput(windows, 'Windows baseline'), wsl_evidence: wsl.stdout_path },
      },
      runtime: {
        container_name: containerName,
        container_id: stringValue(containerInspect.Id, 'container inspect Id'),
        container_image_id: String(containerInspect.Image),
        container_labels: {
          ...Object.fromEntries(requiredImageLabels.map((key) => [key, containerLabels[key]])),
          'dev.onepersonlab.validation.owner': containerLabels['dev.onepersonlab.validation.owner'],
          'dev.onepersonlab.validation.run-id': containerLabels['dev.onepersonlab.validation.run-id'],
        },
        internal_network: true,
        internal_network_name: internalNetworkName,
        network_names: containerNetworks,
        ingress: {
          container_name: ingressContainerName,
          container_id: stringValue(ingressInspect.Id, 'ingress inspect Id'),
          container_image_id: String(ingressInspect.Image),
          container_labels: {
            ...Object.fromEntries(requiredImageLabels.map((key) => [key, ingressLabels[key]])),
            'dev.onepersonlab.validation.owner': ingressLabels['dev.onepersonlab.validation.owner'],
            'dev.onepersonlab.validation.run-id': ingressLabels['dev.onepersonlab.validation.run-id'],
            'dev.onepersonlab.validation.role': ingressLabels['dev.onepersonlab.validation.role'],
          },
          same_exact_image: ingressInspect.Image === imageId,
          read_only: ingressHostConfig.ReadonlyRootfs === true,
          host_volumes: ingressHostMounts.length,
          tmpfs_mounts: ingressTmpfsMounts.length,
          non_root: ingressConfig.User === '65532:65532',
          fixed_node_tcp_proxy: ingressEntrypoint[0] === '/usr/local/bin/node' &&
            ingressEntrypoint[1] === '-e' &&
            ingressCommand[0] === ingressProxyScript,
          cap_drop_all: capDrop.includes('ALL'),
          no_new_privileges: securityOpt.some((value) => value === 'no-new-privileges' || value === 'no-new-privileges:true'),
          proxy_environment_cleared: proxyEnvironmentKeys.every((key) => ingressEnvironment.includes(`${key}=`)),
          network_names: ingressNetworks,
        },
      },
      http: secondHttp,
      ui,
      persistence: {
        status: 'passed',
        data_marker: 'preserved',
        projects_marker: 'preserved',
        recreate_count: 1,
      },
      no_secondary_fetch: {
        status: 'passed',
        isolated_empty_docker_config: true,
        compose_pull_policy: 'never',
        compose_up_pull_mode: 'never',
        internal_network: inspectedInternalNetwork.Internal === true,
        image_pull_events_after_initial_pull: pullEvents.length,
        ingress_uses_same_exact_image: ingressInspect.Image === imageId,
        webui_only_internal_network: containerNetworks.length === 1 &&
          containerNetworks[0] === internalNetworkName &&
          inspectedInternalNetwork.Internal === true &&
          inspectedIngressNetwork.Internal === false,
        pull_provenance: pullProvenance,
      },
      cleanup: {
        status: 'pending',
        owned_containers_remaining: -1,
        owned_networks_remaining: -1,
        runtime_directory_remaining: true,
      },
      bounded_execution: {
        pull_timeout_seconds: pullTimeoutSeconds,
        command_timeout_seconds: commandTimeoutSeconds,
        health_timeout_seconds: healthTimeoutSeconds,
        cleanup_always_runs: true,
      },
      failure: null,
      first_http_evidence: firstHttp,
    };
  } catch (error) {
    failure = {
      message: error instanceof Error ? error.message : String(error),
      observed_at: new Date().toISOString(),
      event_since: eventSince || null,
    };
    writeJson(failurePath, failure);
  } finally {
    const composeDown = capture(
      'docker',
      ['compose', '-p', projectName, '-f', composePath, 'down', '--remove-orphans', '--timeout', '15'],
      'cleanup-compose-down',
      commandTimeoutSeconds,
      true,
    );
    const remainingContainers = capture('docker', [
      'ps', '-a', '--filter', 'label=dev.onepersonlab.validation.owner=native-windows-smoke', '--filter', `label=dev.onepersonlab.validation.run-id=${runId}`, '--format', '{{.ID}}',
    ], 'cleanup-container-readback', commandTimeoutSeconds, true);
    const remainingNetworks = capture('docker', [
      'network', 'ls', '--filter', 'label=dev.onepersonlab.validation.owner=native-windows-smoke', '--filter', `label=dev.onepersonlab.validation.run-id=${runId}`, '--format', '{{.ID}}',
    ], 'cleanup-network-readback', commandTimeoutSeconds, true);
    fs.rmSync(runtimeDir, { recursive: true, force: true });
    const cleanup = cleanupEvidence(composeDown, remainingContainers, remainingNetworks, fs.existsSync(runtimeDir));
    const commandIndexPath = path.join(artifactDir, 'command-index.json');
    writeJson(commandIndexPath, { schema: 'opl_app_webui_native_windows_command_index.v1', commands });
    if (pullProvenance?.mode === 'performed_in_this_run') {
      pullProvenance.evidence_path = path.basename(commandIndexPath);
      pullProvenance.evidence_sha256 = digestFile(commandIndexPath);
    }
    if (receipt) {
      receipt.cleanup = cleanup;
      delete receipt.first_http_evidence;
      try {
        validateNativeWindowsSmokeReceipt(receipt);
      } catch (error) {
        failure = { message: error instanceof Error ? error.message : String(error), observed_at: new Date().toISOString() };
      }
      if (!failure) writeJson(receiptPath, receipt);
    }
    if (failure) writeJson(failurePath, failure);
  }
  if (failure || !receipt) fail(`Native Windows smoke failed; see ${failurePath}`);
  console.log(JSON.stringify({ status: 'passed', receipt: receiptPath, image_ref: identity.requestedRef, cleanup: receipt.cleanup }, null, values.json ? 0 : 2));
}
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  execute().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
