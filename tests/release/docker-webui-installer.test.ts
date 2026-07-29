import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  dockerWebuiImageDigest as imageDigest,
  writeDockerWebuiDiagnostics,
} from './docker-webui-fixtures.ts';
import { shouldRetryConfigureCodexProbe } from '../../scripts/docker-webui-smoke-gate.ts';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const installerPath = path.join(appRoot, 'scripts', 'install-docker-webui.sh');
const smokeGatePath = path.join(appRoot, 'scripts', 'docker-webui-smoke-gate.ts');
const fixtureCommandTimeoutMs = 30_000;

function assertCommandDidNotTimeOut(result: ReturnType<typeof spawnSync>, label: string) {
  if (result.error) {
    throw new Error(`${label} did not terminate within ${fixtureCommandTimeoutMs}ms: ${result.error.message}`);
  }
  return result;
}

function runInstaller(args: string[], env: NodeJS.ProcessEnv = {}) {
  return assertCommandDidNotTimeOut(spawnSync('bash', [installerPath, ...args], {
    cwd: appRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: fixtureCommandTimeoutMs,
    killSignal: 'SIGKILL',
  }), 'Docker/WebUI installer fixture');
}

function writeWindowsEvidence(root: string, overrides: Record<string, unknown> = {}) {
  const diagnostics = path.join(root, 'diagnostics');
  writeDockerWebuiDiagnostics(diagnostics);
  fs.writeFileSync(
    path.join(root, 'api-key-flow-evidence.json'),
    `${JSON.stringify(
      {
        schema: 'opl_docker_webui_api_key_flow_evidence.v1',
        status: 'passed',
        mode: 'webui_proxy_configure_codex',
        endpoint: 'http://127.0.0.1:3000/api/opl-runtime/configure-codex',
        response_http_status: 200,
        response_success: true,
        command: 'opl system configure-codex --api-key-stdin --json',
        stdin_transport: true,
        key_material_recorded: false,
        errors: [],
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(root, 'windows-smoke-evidence.json'),
    `${JSON.stringify(
      {
        schema: 'opl_docker_webui_windows_smoke_evidence.v1',
        gate_id: 'clean_windows_vm',
        status: 'passed',
        host_platform: 'win32',
        observed_at: '2026-06-30T00:00:00Z',
        installer_command:
          'powershell -ExecutionPolicy Bypass -File scripts/install-docker-webui.ps1 -Yes -NoOpen -DiagnosticsDir diagnostics',
        diagnostics_dir: 'diagnostics',
        api_key_flow_evidence: 'api-key-flow-evidence.json',
        ...overrides,
      },
      null,
      2,
    )}\n`,
  );
  return { diagnostics };
}

function runSmokeGate(args: string[]) {
  return assertCommandDidNotTimeOut(spawnSync(process.execPath, ['--experimental-strip-types', smokeGatePath, ...args], {
    cwd: appRoot,
    encoding: 'utf8',
    timeout: fixtureCommandTimeoutMs,
    killSignal: 'SIGKILL',
  }), 'Docker/WebUI smoke-gate fixture');
}

function runWindowsEvidenceGate(evidence: string) {
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-windows-gate-artifacts-'));
  const result = runSmokeGate(['--gate', 'clean_windows_vm', '--evidence', evidence, '--artifacts', artifacts, '--json']);
  const resultPath = path.join(artifacts, 'docker-webui-smoke-gate-result.json');
  const payload = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, 'utf8')) : null;
  return { artifacts, result, payload };
}

function assertPassedWindowsEvidencePayload(payload: any) {
  assert.equal(payload.status, 'passed');
  assert.equal(payload.gate_id, 'clean_windows_vm');
  assert.equal(payload.diagnostics_validation.status, 'passed');
  assert.equal(payload.diagnostics_validation.compose_volume_mapping.status, 'passed');
  assert.equal(payload.diagnostics_validation.preservation_evidence.status, 'passed');
  assert.equal(payload.diagnostics_validation.image_identity.digest, imageDigest);
  assert.equal(payload.image.digest, imageDigest);
  assert.equal(payload.image.currentness_claim, false);
  assert.equal(payload.api_key_flow.status, 'passed');
  assert.equal(payload.api_key_flow.stdin_transport, true);
  assert.equal(payload.evidence_validation.status, 'passed');
  assert.equal(payload.ordinary_user_status.path_id, 'ordinary_docker_webui_user_path');
  assert.equal(payload.ordinary_user_status.access_key_settings.status, 'passed');
  assert.equal(payload.ordinary_user_status.runtime_proxy.status, 'passed');
}

function runPassedWindowsEvidenceGate(evidence: string) {
  const { result, payload } = runWindowsEvidenceGate(evidence);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assertPassedWindowsEvidencePayload(payload);
  return payload;
}

function zipEvidence(evidence: string) {
  const archivePath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-windows-evidence-archive-')),
    'windows-clean-evidence.zip',
  );
  const zipped = assertCommandDidNotTimeOut(spawnSync('zip', ['-qr', archivePath, '.'], {
    cwd: evidence,
    encoding: 'utf8',
    timeout: fixtureCommandTimeoutMs,
    killSignal: 'SIGKILL',
  }), 'Docker/WebUI evidence archive fixture');
  assert.equal(zipped.status, 0, zipped.stderr || zipped.stdout);
  return archivePath;
}

test('Docker/WebUI installer shell parses cleanly', () => {
  const result = assertCommandDidNotTimeOut(spawnSync('bash', ['-n', installerPath], {
    cwd: appRoot,
    encoding: 'utf8',
    timeout: fixtureCommandTimeoutMs,
    killSignal: 'SIGKILL',
  }), 'Docker/WebUI installer syntax fixture');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const installer = fs.readFileSync(installerPath, 'utf8');
  const composeFunction = installer.match(/compose_content\(\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.doesNotMatch(composeFunction, /<<YAML/, 'compose dry-run must not depend on a heredoc writer process');
});

test('Windows Docker/WebUI installer resolves a moving tag once and pins compose to its digest', () => {
  const windowsInstaller = fs.readFileSync(path.join(appRoot, 'scripts', 'install-docker-webui.ps1'), 'utf8');
  const resolver = windowsInstaller.match(/function Resolve-PinnedImageReference \{([\s\S]*?)\n\}/)?.[1] ?? '';
  const pullRoute = windowsInstaller.match(/function Invoke-DockerPullWithPublicGhcrIsolation \{([\s\S]*?)\n\}/)?.[1] ?? '';
  const anonymousPull = windowsInstaller.match(/function Invoke-PublicGhcrAnonymousDockerCommandCapture \{([\s\S]*?)\n\}/)?.[1] ?? '';
  const composeWriter = windowsInstaller.match(/function Write-ComposeFile \{([\s\S]*?)\n\}/)?.[1] ?? '';
  const execution = windowsInstaller.slice(windowsInstaller.indexOf('$tagWasProvided ='));

  assert.match(resolver, /Invoke-DockerPullWithRetry/);
  assert.match(resolver, /Write-Host \$pull\.Output/);
  assert.doesNotMatch(
    resolver,
    /& docker pull/,
    'native docker progress must not leak into the resolver success output',
  );
  assert.match(
    resolver,
    /Invoke-DockerCommandCapture[\s\S]*-Arguments @\("image", "inspect", "--format", "\{\{json \.RepoDigests\}\}"[\s\S]*-TimeoutSeconds 30/,
  );
  assert.match(resolver, /matchingDigests\.Count -ne 1/);
  assert.match(resolver, /@sha256:\[0-9a-f\]\{64\}/);
  assert.match(pullRoute, /Test-PublicOplGhcrImageReference/);
  assert.match(pullRoute, /\[Parameter\(Mandatory = \$true\)\]\[string\]\$DockerCliPath/);
  assert.match(pullRoute, /return Invoke-PublicGhcrAnonymousDockerCommandCapture/);
  assert.match(pullRoute, /-DockerCliPath \$DockerCliPath/);
  assert.match(pullRoute, /return Invoke-DockerCommandCaptureWithTimeout/);
  assert.doesNotMatch(pullRoute, /Test-DockerCredentialHelperFailure/);
  assert.match(anonymousPull, /'\{"auths":\{\}\}'/);
  assert.doesNotMatch(anonymousPull, /"auth"\s*:|"credsStore"\s*:/);
  assert.match(anonymousPull, /Remove-Item -LiteralPath \$temporaryConfigDir -Force -Recurse/);
  assert.doesNotMatch(anonymousPull, /USERPROFILE|\.docker\\config\.json/);
  assert.match(composeWriter, /pull_policy: missing/);
  assert.doesNotMatch(composeWriter, /pull_policy: always/);
  assert.ok(
    execution.indexOf('Assert-DockerCompose') < execution.indexOf('Resolve-PinnedImageReference'),
    'tag resolution must run only after Docker is available',
  );
  assert.match(execution, /\$dockerCliPath = Assert-DockerCli/);
  assert.ok(
    execution.indexOf('Resolve-PinnedImageReference') < execution.indexOf('Write-ComposeFile'),
    'compose must be written only after the immutable digest is resolved',
  );
});

test('Docker/WebUI installer dry-run generates the compose-only startup plan', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-installer-home-'));
  const result = runInstaller(
    [
      '--dry-run',
      '--update',
      '--port',
      '3917',
      '--health-timeout',
      '7',
      '--tag',
      '26.6.30',
      '--data-dir',
      path.join(home, 'data-dir'),
      '--projects-dir',
      path.join(home, 'projects-dir'),
      '--diagnostics-dir',
      path.join(home, 'diagnostics-dir'),
      '--diagnostics-archive',
      path.join(home, 'diagnostics.tar.gz'),
      '--no-open',
    ],
    { HOME: home },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const escapedHome = home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const pattern of [
    /image: ghcr\.io\/gaofeng21cn\/one-person-lab-webui:26\.6\.30/,
    /pull_policy: always/,
    /"127\.0\.0\.1:3917:3000"/,
    /AIONUI_ALLOW_REMOTE: "true"/,
    /AIONUI_DATA_DIR: \/data/,
    /OPL_PROJECTS_DIR: \/projects/,
    new RegExp(`${escapedHome}/data-dir:/data`),
    new RegExp(`${escapedHome}/projects-dir:/projects`),
    /docker compose -f .*compose\.yaml pull/,
    /docker compose -f .*compose\.yaml up -d/,
    /Would wait up to 7s for WebUI HTTP health at http:\/\/localhost:3917\//,
    /Would write diagnostic directory: .*diagnostics-dir/,
    /Would write diagnostic archive: .*diagnostics\.tar\.gz/,
  ]) {
    assert.match(result.stdout, pattern);
  }
  assert.doesNotMatch(result.stdout, /docker run/);
  assert.doesNotMatch(result.stdout, /OPENAI_API_KEY|ANTHROPIC_API_KEY|api_key/i);
  assert.equal(fs.existsSync(path.join(home, 'OnePersonLab')), false, 'dry-run must not create host directories');
});

test('Docker/WebUI installer exposes one host auto-update contract across Linux and macOS', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-auto-update-home-'));
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin);
  const uname = path.join(bin, 'uname');
  fs.writeFileSync(uname, '#!/bin/sh\nprintf "Darwin\\n"\n', 'utf8');
  fs.chmodSync(uname, 0o755);
  const env = { HOME: home, PATH: `${bin}:${process.env.PATH ?? ''}` };
  const enabled = runInstaller(
    ['--dry-run', '--yes', '--update', '--enable-auto-update', '--auto-update-time', '04:15', '--no-open'],
    env,
  );

  assert.equal(enabled.status, 0, enabled.stderr || enabled.stdout);
  assert.match(enabled.stdout, /would write local automatic updater/i);
  assert.match(enabled.stdout, /LaunchAgent cn\.onepersonlab\.webui-update at 04:15/);
  assert.match(enabled.stdout, /Automatic WebUI updates enabled.*:latest at 04:15/);
  const installer = fs.readFileSync(installerPath, 'utf8');
  assert.match(installer, /one-person-lab-webui-update\.timer/);
  assert.match(installer, /Persistent=true/);
  assert.match(installer, /OnStartupSec=5m/);
  assert.match(installer, /cn\.onepersonlab\.webui-update/);
  assert.match(installer, /RunAtLoad/);
  assert.match(installer, /StartCalendarInterval/);
  assert.match(installer, /--pull never --force-recreate/);
  assert.match(
    installer,
    /compose -f "\$COMPOSE_FILE" up -d --pull never --force-recreate/,
  );
  assert.match(installer, /schema=opl_webui_host_auto_update_result\.v1/);
  assert.match(installer, /schema=opl_webui_host_auto_update_config\.v1/);
  assert.match(installer, /compose -f "\$COMPOSE_FILE" ps -q one-person-lab-webui/);
  assert.match(installer, /inspect "\$PREVIOUS_CONTAINER_ID" --format '\{\{\.Image\}\}'/);
  assert.match(installer, /LOCK_OWNER="\$LOCK_DIR\/owner\.pid"/);
  assert.match(installer, /kill -0 "\$lock_pid"/);
  assert.match(installer, /ps -p "\$lock_pid" -o command=/);
  assert.match(installer, /rmdir "\$LOCK_DIR".*return 1/);
  assert.doesNotMatch(
    installer,
    /raw\.githubusercontent\.com.*install-docker-webui\.sh/,
    'the scheduler must execute the locally generated updater rather than mutable branch code',
  );

  const disabled = runInstaller(['--dry-run', '--disable-auto-update'], env);
  assert.equal(disabled.status, 0, disabled.stderr || disabled.stdout);
  assert.match(disabled.stdout, /would unload LaunchAgent cn\.onepersonlab\.webui-update/);
  assert.match(disabled.stdout, /Manual --update remains available/);

  const status = runInstaller(['--auto-update-status'], env);
  assert.equal(status.status, 0, status.stderr || status.stdout);
  assert.match(status.stdout, /scheduler=launchd_user/);
  assert.match(status.stdout, /enabled=false/);
  assert.match(status.stdout, /daily_time=not_configured/);
  assert.match(status.stdout, /status=not_run/);
});

test('Docker/WebUI installer executes the Linux systemd user timer dry-run path', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-linux-auto-update-home-'));
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin);
  const uname = path.join(bin, 'uname');
  fs.writeFileSync(uname, '#!/bin/sh\nprintf "Linux\\n"\n', 'utf8');
  fs.chmodSync(uname, 0o755);
  const enabled = runInstaller(
    ['--dry-run', '--yes', '--update', '--enable-auto-update', '--auto-update-time', '04:15', '--no-open'],
    { HOME: home, PATH: `${bin}:${process.env.PATH ?? ''}` },
  );

  assert.equal(enabled.status, 0, enabled.stderr || enabled.stdout);
  assert.match(enabled.stdout, /systemd user timer one-person-lab-webui-update\.timer at 04:15/);
  assert.match(enabled.stdout, /Automatic WebUI updates enabled.*:latest at 04:15/);

  const disabled = runInstaller(
    ['--dry-run', '--disable-auto-update'],
    { HOME: home, PATH: `${bin}:${process.env.PATH ?? ''}` },
  );
  assert.equal(disabled.status, 0, disabled.stderr || disabled.stdout);
  assert.match(disabled.stdout, /disable systemd user timer one-person-lab-webui-update\.timer/);

  const status = runInstaller(
    ['--auto-update-status'],
    { HOME: home, PATH: `${bin}:${process.env.PATH ?? ''}` },
  );
  assert.equal(status.status, 0, status.stderr || status.stdout);
  assert.match(status.stdout, /scheduler=systemd_user/);
  assert.match(status.stdout, /enabled=false/);
  assert.match(status.stdout, /daily_time=not_configured/);
  assert.match(status.stdout, /status=not_run/);
});

test('Docker/WebUI auto-update rejects custom images and conflicting lifecycle actions', () => {
  const custom = runInstaller([
    '--dry-run',
    '--yes',
    '--enable-auto-update',
    '--tag',
    '26.7.28-r3',
    '--no-open',
  ]);
  assert.notEqual(custom.status, 0);
  assert.match(custom.stderr, /Automatic updates support only .*:latest/);

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-custom-channel-auto-update-home-'));
  const updater = path.join(home, 'OnePersonLab', 'updater');
  fs.mkdirSync(updater, { recursive: true });
  fs.writeFileSync(
    path.join(updater, 'config.env'),
    'schema=opl_webui_host_auto_update_config.v1\nchannel=ghcr.io/gaofeng21cn/one-person-lab-webui:latest\n',
  );
  const configuredCustom = runInstaller(
    ['--dry-run', '--yes', '--tag', '26.7.28-r3', '--no-open'],
    { HOME: home },
  );
  assert.notEqual(configuredCustom.status, 0);
  assert.match(configuredCustom.stderr, /Run --disable-auto-update before switching to a custom image/);

  const conflicting = runInstaller(['--dry-run', '--enable-auto-update', '--disable-auto-update']);
  assert.notEqual(conflicting.status, 0);
  assert.match(conflicting.stderr, /Choose only one of/);

  const invalidTime = runInstaller(['--dry-run', '--enable-auto-update', '--auto-update-time', '25:00']);
  assert.notEqual(invalidTime.status, 0);
  assert.match(invalidTime.stderr, /24-hour HH:MM format/);
});

test('Docker/WebUI installer dry-run can generate the cloud deployment template plan without starting Docker', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-cloud-template-home-'));
  const target = path.join(home, 'cloud');
  const result = runInstaller(['--dry-run', '--cloud-template', '--cloud-template-dir', target], { HOME: home });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Would copy cloud deployment template:/);
  assert.match(result.stdout, /deploy\/docker-webui\/cloud/);
  assert.match(result.stdout, new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(result.stdout, /create secrets\/webui_password/);
  assert.match(result.stdout, /docker compose -f compose\.yaml up -d/);
  assert.doesNotMatch(result.stdout, /docker compose -f .*compose\.yaml up -d\n/);
  assert.equal(fs.existsSync(target), false, 'dry-run must not create the cloud template directory');
});

test('Docker/WebUI installer rejects API key parameters', () => {
  const result = runInstaller(['--dry-run', '--api-key', 'secret']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Do not pass API keys/);

  const providerKeyResult = runInstaller(['--dry-run', '--anthropic-api-key=secret']);
  assert.notEqual(providerKeyResult.status, 0);
  assert.match(providerKeyResult.stderr, /Do not pass API keys/);
});

test('Docker/WebUI installer validates health timeout before running', () => {
  const result = runInstaller(['--dry-run', '--health-timeout', '0']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Health timeout must be a positive integer/);
});

test('Docker/WebUI configure-codex probe retries runtime startup races but stops on secret leakage', () => {
  assert.equal(shouldRetryConfigureCodexProbe({
    errors: ['configure-codex proxy response did not report success=true'],
    elapsedMs: 2_000,
    timeoutMs: 120_000,
  }), true);
  assert.equal(shouldRetryConfigureCodexProbe({
    errors: ['configure-codex proxy response leaked the submitted API key placeholder'],
    elapsedMs: 2_000,
    timeoutMs: 120_000,
  }), false);
  assert.equal(shouldRetryConfigureCodexProbe({
    errors: ['configure-codex proxy response did not report success=true: surface_not_found: Mandatory OPL Flow plugin installer was not found.'],
    elapsedMs: 2_000,
    timeoutMs: 120_000,
  }), false);
  assert.equal(shouldRetryConfigureCodexProbe({
    errors: ['configure-codex proxy response did not report success=true'],
    elapsedMs: 120_000,
    timeoutMs: 120_000,
  }), false);
});

test('Docker/WebUI smoke gate writes typed blocker instead of passing unmatched VM gates', () => {
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-smoke-gate-'));
  const result = runSmokeGate(['--gate', 'clean_windows_vm', '--artifacts', artifacts, '--json']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(fs.readFileSync(path.join(artifacts, 'docker-webui-smoke-gate-result.json'), 'utf8'));
  assert.equal(payload.status, 'typed_blocker');
  assert.equal(payload.gate_id, 'clean_windows_vm');
  assert.match(payload.blocker.code, /windows_vm|requires_windows_vm/);
  assert.equal(payload.schema, 'opl_docker_webui_smoke_gate_result.v1');
  assert.equal(payload.ordinary_user_status.path_id, 'ordinary_docker_webui_user_path');
  assert.equal(payload.ordinary_user_status.priority, 'ordinary_user_path_before_evidence_bundle_language');
  assert.equal(payload.ordinary_user_status.access_key_settings.status, 'typed_blocker');
  assert.ok(payload.ordinary_user_status.must_not_claim.includes('clean_windows_vm_pass_without_clean_windows_evidence'));
});

test('Docker/WebUI clean Windows smoke gate imports minimal Windows evidence', () => {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-windows-evidence-'));
  writeWindowsEvidence(evidence);

  const payload = runPassedWindowsEvidenceGate(evidence);
  assert.equal(payload.host_platform, process.platform);
  assert.equal(payload.evidence.windows_evidence_dir, evidence);
  assert.equal(payload.evidence.windows_diagnostics_dir, path.join(evidence, 'diagnostics'));
  assert.equal(payload.evidence.windows_api_key_flow_evidence, path.join(evidence, 'api-key-flow-evidence.json'));
  assert.equal(payload.ordinary_user_status.settings_entry, 'Settings -> Account & Access');
});

test('Docker/WebUI clean Windows smoke gate imports zipped Windows evidence', () => {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-windows-evidence-'));
  writeWindowsEvidence(evidence);
  const archivePath = zipEvidence(evidence);

  const payload = runPassedWindowsEvidenceGate(archivePath);
  assert.equal(payload.evidence.windows_evidence_archive, archivePath);
  assert.match(payload.evidence.windows_evidence_dir, /windows-evidence-archive/);
});

test('Docker/WebUI clean Windows smoke gate imports PowerShell-style zipped Windows evidence', () => {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-windows-evidence-'));
  const { diagnostics } = writeWindowsEvidence(evidence);
  for (const bomFile of [
    'api-key-flow-evidence.json',
    'windows-smoke-evidence.json',
    path.join('diagnostics', 'data-preservation.txt'),
    path.join('diagnostics', 'metadata.txt'),
  ]) {
    const bomPath = path.join(evidence, bomFile);
    fs.writeFileSync(bomPath, `\uFEFF${fs.readFileSync(bomPath, 'utf8')}`);
  }
  const archivePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-windows-evidence-archive-')), 'windows-clean-evidence.zip');
  const createArchive = assertCommandDidNotTimeOut(spawnSync(
    'python3',
    [
      '-c',
      [
        'import os, sys, zipfile',
        'source, archive = sys.argv[1], sys.argv[2]',
        'with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:',
        '    for root, _, files in os.walk(source):',
        '        for file_name in files:',
        '            full_path = os.path.join(root, file_name)',
        '            rel = os.path.relpath(full_path, source).replace(os.sep, "\\\\")',
        '            zf.write(full_path, rel)',
      ].join('\n'),
      evidence,
      archivePath,
    ],
    { encoding: 'utf8', timeout: fixtureCommandTimeoutMs, killSignal: 'SIGKILL' },
  ), 'PowerShell-style evidence archive fixture');
  assert.equal(createArchive.status, 0, createArchive.stderr || createArchive.stdout);

  const payload = runPassedWindowsEvidenceGate(archivePath);
  assert.equal(payload.diagnostics_validation.preservation_verdict, 'preserved_or_reused');
  assert.equal(payload.data_preservation.status, 'passed');
  assert.equal(payload.evidence.windows_evidence_archive, archivePath);
  assert.ok(fs.existsSync(path.join(payload.evidence.windows_evidence_dir, 'diagnostics', 'compose.yaml')));
  assert.ok(fs.existsSync(path.join(diagnostics, 'data-preservation.txt')));
});

test('Docker/WebUI clean Windows smoke gate rejects unsafe zipped Windows evidence paths', () => {
  const archiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-windows-unsafe-archive-'));
  const archivePath = path.join(archiveRoot, 'windows-clean-evidence.zip');
  fs.writeFileSync(path.join(archiveRoot, '..', 'evil.txt'), 'unsafe\n');
  const zipped = assertCommandDidNotTimeOut(spawnSync('zip', ['-q', archivePath, '../evil.txt'], {
    cwd: archiveRoot,
    encoding: 'utf8',
    timeout: fixtureCommandTimeoutMs,
    killSignal: 'SIGKILL',
  }), 'unsafe archive rejection fixture');
  assert.equal(zipped.status, 0, zipped.stderr || zipped.stdout);

  const { result } = runWindowsEvidenceGate(archivePath);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unsafe parent traversal entry/);
});

for (const { name, mutate, assertPayload } of [
  {
    name: 'incomplete Windows evidence',
    mutate({ diagnostics }: { diagnostics: string }) {
      fs.rmSync(path.join(diagnostics, 'http-probe.txt'));
    },
    assertPayload(payload: any) {
      assert.ok(payload.diagnostics_validation.missing_files.includes('http-probe.txt'));
    },
  },
  {
    name: 'secret-like markers in imported evidence',
    mutate({ diagnostics }: { diagnostics: string }) {
      fs.writeFileSync(path.join(diagnostics, 'docker-compose-logs.txt'), 'Bearer abcdefghijklmnopqrstuvwxyz123456\n');
    },
    assertPayload(payload: any) {
      assert.ok(payload.evidence_validation.forbidden_secret_markers.some((marker: string) => marker.includes('Bearer')));
    },
  },
  {
    name: 'evidence without API key UI flow receipt',
    mutate({ evidence }: { evidence: string }) {
      fs.rmSync(path.join(evidence, 'api-key-flow-evidence.json'));
    },
    assertPayload(payload: any) {
      assert.ok(payload.evidence_validation.errors.some((error: string) => error.includes('API key flow evidence validation failed')));
    },
  },
]) {
  test(`Docker/WebUI clean Windows smoke gate rejects ${name}`, () => {
    const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-windows-evidence-'));
    const { diagnostics } = writeWindowsEvidence(evidence);
    mutate({ evidence, diagnostics });

    const { result, payload } = runWindowsEvidenceGate(evidence);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(payload.status, 'failed');
    assert.equal(payload.evidence_validation.status, 'failed');
    assertPayload(payload);
  });
}
