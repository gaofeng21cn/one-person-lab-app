import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { appRoot } from './release-readiness/helpers.ts';

const installerPath = path.join(appRoot, 'scripts', 'install-docker-webui.ps1');
const pwshPath = findPwsh();

function findPwsh() {
  if (process.env.PWSH) {
    return process.env.PWSH;
  }
  if (process.platform === 'win32') {
    for (const executable of ['powershell.exe', 'pwsh.exe']) {
      const result = spawnSync('where.exe', [executable], { encoding: 'utf8' });
      const resolved = result.stdout.split(/\r?\n/).map((entry) => entry.trim()).find(Boolean);
      if (result.status === 0 && resolved) return resolved;
    }
    return '';
  }
  const result = spawnSync('/bin/sh', ['-lc', 'command -v pwsh'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function runPwsh(args: string[]) {
  if (!pwshPath) {
    return null;
  }
  return spawnSync(pwshPath, args, { cwd: appRoot, encoding: 'utf8' });
}

function extractPowerShellFunction(source: string, name: string) {
  const start = source.indexOf(`function ${name} {`);
  assert.notEqual(start, -1, `missing PowerShell function ${name}`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

function powerShellSingleQuoted(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runPwshHarness(source: string) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-pwsh-harness-'));
  const harnessPath = path.join(tempRoot, 'harness.ps1');
  fs.writeFileSync(harnessPath, source, 'utf8');
  return runPwsh(['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', harnessPath]);
}

test('Windows Docker/WebUI installer parses and dry-runs when PowerShell is available', { timeout: 30_000 }, () => {
  assert.match(fs.readFileSync(installerPath, 'utf8'), /\[int\]\$HealthTimeoutSeconds = 600/);
  if (!pwshPath) {
    return;
  }
  const escapedInstallerPath = installerPath.replaceAll("'", "''");
  const parse = runPwsh([
    '-NoLogo',
    '-NoProfile',
    '-Command',
    `$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile('${escapedInstallerPath}',[ref]$tokens,[ref]$errors) | Out-Null;if($errors.Count){$errors | ForEach-Object { Write-Error $_ }; exit 1 }`,
  ]);
  assert.ok(parse, 'pwsh should be available for this test');
  assert.equal(parse.status, 0, parse.stderr || parse.stdout);

  const tempRoot = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-windows-installer-')),
  );
  const dataDir = path.join(tempRoot, 'data');
  const projectsDir = path.join(tempRoot, 'projects');
  const dryRun = runPwsh([
    '-NoLogo',
    '-NoProfile',
    '-File',
    installerPath,
    '-DryRun',
    '-Yes',
    '-Update',
    '-EnableAutoUpdate',
    '-AutoUpdateTime',
    '03:00',
    '-Port',
    '3133',
    '-HealthTimeoutSeconds',
    '5',
    '-DataDir',
    dataDir,
    '-ProjectsDir',
    projectsDir,
    '-DiagnosticsDir',
    path.join(tempRoot, 'diagnostics'),
    '-DiagnosticsArchive',
    path.join(tempRoot, 'diagnostics.zip'),
    '-NoOpen',
  ]);
  assert.ok(dryRun, 'pwsh should be available for this test');
  assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
  assert.match(dryRun.stdout, /Dry run: would write/);
  assert.match(dryRun.stdout, /127\.0\.0\.1:3133:3000/);
  assert.match(dryRun.stdout, /ghcr\.io\/gaofeng21cn\/one-person-lab-webui:latest/);
  assert.match(dryRun.stdout, /pull_policy: missing/);
  assert.match(dryRun.stdout, /restart: unless-stopped/);
  assert.match(dryRun.stdout, /Update mode: pull the configured WebUI image from the host and recreate the compose service/);
  assert.match(dryRun.stdout, /docker compose .* pull/);
  assert.match(dryRun.stdout, /docker compose .* up -d/);
  assert.match(dryRun.stdout, /would register scheduled task One Person Lab WebUI Latest Update at 03:00 and at the current user's next logon/);
  assert.match(dryRun.stdout, /would wait up to 5s for WebUI HTTP health at http:\/\/localhost:3133\//);
  assert.match(dryRun.stdout, /would write daily launcher .*Start-OnePersonLab\.ps1/);
  assert.match(dryRun.stdout, /would create desktop shortcut %USERPROFILE%\\Desktop\\One Person Lab\.lnk/);
  assert.match(dryRun.stdout, /would write diagnostic directory .*diagnostics/);
  assert.match(dryRun.stdout, /would write diagnostic archive .*diagnostics\.zip/);
  const normalizedDryRun = dryRun.stdout.toLocaleLowerCase('en-US');
  assert.ok(normalizedDryRun.includes(`${dataDir}:/data`.toLocaleLowerCase('en-US')));
  assert.ok(normalizedDryRun.includes(`${projectsDir}:/projects`.toLocaleLowerCase('en-US')));
  assert.equal(fs.existsSync(path.join(tempRoot, 'compose.yaml')), false, 'dry-run must not create compose.yaml');

  const rejected = runPwsh(['-NoProfile', '-File', installerPath, '-DryRun', '-ApiKey', 'secret']);
  assert.ok(rejected);
  assert.notEqual(rejected.status, 0);
});

test('Windows Docker/WebUI prerequisite mode is explicit and dry-runnable when PowerShell is available', { timeout: 30_000 }, () => {
  if (!pwshPath) {
    return;
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-windows-prereq-'));
  const dryRun = runPwsh([
    '-NoLogo',
    '-NoProfile',
    '-File',
    installerPath,
    '-DryRun',
    '-Yes',
    '-InstallPrerequisites',
    '-Port',
    '3134',
    '-DataDir',
    path.join(tempRoot, 'data'),
    '-ProjectsDir',
    path.join(tempRoot, 'projects'),
    '-NoOpen',
  ]);
  assert.ok(dryRun, 'pwsh should be available for this test');
  assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
  assert.match(dryRun.stdout, /would install Docker Desktop with winget if docker CLI is missing/);
  assert.match(dryRun.stdout, /would enable WSL 2 prerequisites before checking wsl --status/);
  assert.match(dryRun.stdout, /127\.0\.0\.1:3134:3000/);
  assert.equal(fs.existsSync(path.join(tempRoot, 'compose.yaml')), false, 'dry-run must not create compose.yaml');
});

test('Windows Docker/WebUI ordinary mode starts Docker Desktop when the CLI exists but the daemon is stopped', () => {
  const installer = fs.readFileSync(installerPath, 'utf8');
  const startFunction = installer.slice(
    installer.indexOf('function Start-DockerDesktopIfPresent'),
    installer.indexOf('function Wait-DockerDaemon'),
  );
  const captureFunction = installer.slice(
    installer.indexOf('function Invoke-DockerCommandCaptureWithTimeout'),
    installer.indexOf('function Wait-DockerDaemon'),
  );
  const dockerAssertion = installer.slice(
    installer.indexOf('function Assert-DockerCli'),
    installer.indexOf('function Assert-DockerCompose'),
  );

  assert.match(
    startFunction,
    /Invoke-DockerCommandCapture\s+`\s+-DockerCliPath \$DockerCliPath\s+`\s+-Arguments @\("desktop", "start"\)/,
  );
  assert.match(startFunction, /TimeoutSeconds 30/);
  assert.match(startFunction, /Start-Process -FilePath \$dockerDesktop/);
  assert.match(captureFunction, /\[switch\]\$StreamOutput/);
  assert.match(captureFunction, /Convert-ToWindowsProcessArgument/);
  assert.match(captureFunction, /\[System\.Diagnostics\.ProcessStartInfo\]::new\(\)/);
  assert.match(captureFunction, /\$startInfo\.RedirectStandardOutput = \$true/);
  assert.match(captureFunction, /\$startInfo\.RedirectStandardError = \$true/);
  assert.match(captureFunction, /\$process\.StandardOutput/);
  assert.match(captureFunction, /\$process\.StandardError/);
  assert.match(captureFunction, /Reader\.ReadAsync/);
  assert.match(captureFunction, /\.WaitForExit\(250\)/);
  assert.match(captureFunction, /\$deadline = \$startedAt\.AddSeconds\(\$TimeoutSeconds\)/);
  assert.doesNotMatch(
    captureFunction,
    /-WindowStyle Hidden/,
    'redirected Docker commands must retain a readable process exit code on Windows PowerShell',
  );
  assert.match(captureFunction, /TimeoutSeconds = 120/);
  assert.match(captureFunction, /Invoke-DockerCommandCaptureWithTimeout/);
  assert.match(
    dockerAssertion,
    /Invoke-DockerCommandCapture\s+`\s+-DockerCliPath \$dockerCliPath\s+`\s+-Arguments @\("--version"\)/,
  );
  assert.match(
    dockerAssertion,
    /if \(\$info\.ExitCode -ne 0\) \{\s+Start-DockerDesktopIfPresent -DockerCliPath \$dockerCliPath\s+Wait-DockerDaemon -DockerCliPath \$dockerCliPath/s,
  );
  assert.doesNotMatch(
    dockerAssertion,
    /if \(\$InstallPrerequisites\) \{\s+Start-DockerDesktopIfPresent/s,
    'daemon recovery must also run from the ordinary non-administrator installer path',
  );
});

test('Windows Docker/WebUI reads WSL status from a process exit code, not an unset LASTEXITCODE', () => {
  const installer = fs.readFileSync(installerPath, 'utf8');
  const wslStatus = extractPowerShellFunction(installer, 'Invoke-WslStatus');
  const wslAssertion = extractPowerShellFunction(installer, 'Assert-Wsl2');

  assert.match(wslStatus, /Start-Process\s+`\s+-FilePath \$WslPath/);
  assert.match(wslStatus, /-ArgumentList @\("--status"\)/);
  assert.match(wslStatus, /-Wait\s+`\s+-PassThru/);
  assert.match(wslStatus, /-RedirectStandardOutput \$stdoutPath/);
  assert.match(wslStatus, /-RedirectStandardError \$stderrPath/);
  assert.match(wslAssertion, /Invoke-WslStatus -WslPath \$wsl\.Source/);
  assert.match(wslAssertion, /\$status\.ExitCode -ne 0/);
  assert.doesNotMatch(wslAssertion, /\$LASTEXITCODE/);
});

test('Windows Docker/WebUI installs a reusable health-gated desktop launcher', () => {
  const installer = fs.readFileSync(installerPath, 'utf8');
  const launcherWriter = installer.slice(
    installer.indexOf('function Write-WebUiLauncher'),
    installer.indexOf('function Write-WebUiAutoUpdater'),
  );
  const execution = installer.slice(installer.indexOf('$tagWasProvided ='));

  assert.match(launcherWriter, /Invoke-DockerCommand -Arguments @\("compose", "-f", \$composePath, "up", "-d"\)/);
  assert.doesNotMatch(launcherWriter, /compose -f \$composePath down/);
  assert.match(launcherWriter, /ArgumentList @\("desktop", "start"\)/);
  assert.match(launcherWriter, /desktopStart\.WaitForExit\(30000\)/);
  assert.match(launcherWriter, /Stop-Process -Id \$desktopStart\.Id -Force/);
  assert.match(launcherWriter, /AddSeconds\(180\)/);
  assert.match(launcherWriter, /Invoke-WebRequest -Uri \$url -Method Head/);
  assert.match(launcherWriter, /Invoke-WebRequest -Uri \$url -Method Get/);
  assert.match(launcherWriter, /Start-Process -FilePath \$url/);
  assert.match(launcherWriter, /function Invoke-DockerCommand/);
  assert.match(launcherWriter, /\[System\.Diagnostics\.ProcessStartInfo\]::new\(\)/);
  assert.match(launcherWriter, /\$startInfo\.RedirectStandardOutput = \$true/);
  assert.doesNotMatch(launcherWriter, /& \$dockerCliPath/);
  assert.match(launcherWriter, /Language\.Parser\]::ParseInput/);
  assert.match(launcherWriter, /Generated One Person Lab launcher is invalid/);
  assert.match(launcherWriter, /CreateShortcut\(\$shortcutPath\)/);
  assert.match(launcherWriter, /One Person Lab\.lnk/);
  assert.match(execution, /Install-WebUiLauncher -DockerCliPath \$dockerCliPath/);
  assert.match(installer, /restart: unless-stopped/);
});

test('Windows Docker/WebUI refreshes stale PATH and resolves docker.exe without relying on PATHEXT', {
  skip: process.platform === 'win32' && pwshPath
    ? false
    : 'requires native Windows PowerShell',
}, () => {
  const installer = fs.readFileSync(installerPath, 'utf8');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-docker-cli-resolution-'));
  const dockerBin = path.join(tempRoot, 'persisted-docker-bin');
  const dockerExe = path.join(dockerBin, 'docker.exe');
  fs.mkdirSync(dockerBin, { recursive: true });
  fs.writeFileSync(dockerExe, '');
  const canonicalDockerExe = fs.realpathSync.native(dockerExe);

  const result = runPwshHarness([
    extractPowerShellFunction(installer, 'Refresh-ProcessPathFromEnvironment'),
    extractPowerShellFunction(installer, 'Resolve-DockerCliPath'),
    `$env:Path = ${powerShellSingleQuoted(path.join(tempRoot, 'stale-process-path'))}`,
    "$env:PATHEXT = '.CPL'",
    `Refresh-ProcessPathFromEnvironment -MachinePath ${powerShellSingleQuoted(dockerBin)} -UserPath ''`,
    '$resolved = Resolve-DockerCliPath',
    `if (-not [string]::Equals($resolved, ${powerShellSingleQuoted(canonicalDockerExe)}, [System.StringComparison]::OrdinalIgnoreCase)) { throw "unexpected docker path: $resolved" }`,
  ].join('\n\n'));

  assert.ok(result);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('Windows Docker/WebUI does not invoke winget for a non-admin per-user Docker Desktop install outside PATH', {
  skip: process.platform === 'win32' && pwshPath
    ? false
    : 'requires native Windows PowerShell',
}, () => {
  const installer = fs.readFileSync(installerPath, 'utf8');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-existing-docker-desktop-'));
  const localAppData = path.join(tempRoot, 'local');
  const desktopExe = path.join(localAppData, 'Programs', 'DockerDesktop', 'Docker Desktop.exe');
  fs.mkdirSync(path.dirname(desktopExe), { recursive: true });
  fs.writeFileSync(desktopExe, '');

  const result = runPwshHarness([
    extractPowerShellFunction(installer, 'Resolve-DockerDesktopApplicationPath'),
    extractPowerShellFunction(installer, 'Resolve-DockerCliPath'),
    extractPowerShellFunction(installer, 'Install-DockerDesktopPrerequisite'),
    '$InstallPrerequisites = $true',
    `$env:ProgramFiles = ${powerShellSingleQuoted(tempRoot)}`,
    `$env:LOCALAPPDATA = ${powerShellSingleQuoted(localAppData)}`,
    "$env:Path = ''",
    "$env:PATHEXT = '.CPL'",
    'function Test-Administrator { return $false }',
    'function Write-Step { param([string]$Message) }',
    "function Invoke-StepCommand { throw 'winget must not be invoked' }",
    'Install-DockerDesktopPrerequisite',
  ].join('\n\n'));

  assert.ok(result);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('Windows Docker/WebUI image resolution returns only the pinned image reference', () => {
  const installer = fs.readFileSync(installerPath, 'utf8');
  const resolver = installer.slice(
    installer.indexOf('function Resolve-PinnedImageReference'),
    installer.indexOf('function Convert-ToComposeScalar'),
  );

  assert.match(resolver, /Invoke-DockerPullWithRetry/);
  assert.match(resolver, /-Arguments @\("pull", \$RequestedImageReference\)/);
  assert.match(resolver, /-ImageReference \$RequestedImageReference/);
  assert.match(resolver, /-not \$pull\.OutputWasStreamed/);
  assert.doesNotMatch(resolver, /& docker pull/);
});

test('Windows Docker/WebUI image pulls stream progress, identify Docker proxy configuration, and remain bounded', () => {
  const installer = fs.readFileSync(installerPath, 'utf8');
  const boundedCapture = installer.slice(
    installer.indexOf('function Invoke-DockerCommandCaptureWithTimeout'),
    installer.indexOf('function Test-PublicOplGhcrImageReference'),
  );
  const resolver = installer.slice(
    installer.indexOf('function Resolve-PinnedImageReference'),
    installer.indexOf('function Convert-ToComposeScalar'),
  );

  assert.match(installer, /\[int\]\$DockerPullTimeoutSeconds = 1800/);
  assert.match(installer, /\[int\]\$DockerPullStallTimeoutSeconds = 180/);
  assert.match(installer, /\[int\]\$DockerPullRetryCount = 2/);
  assert.match(boundedCapture, /\.WaitForExit\(250\)/);
  assert.match(boundedCapture, /\[System\.Diagnostics\.ProcessStartInfo\]::new\(\)/);
  assert.match(boundedCapture, /\$startInfo\.RedirectStandardOutput = \$true/);
  assert.match(boundedCapture, /\$startInfo\.RedirectStandardError = \$true/);
  assert.match(boundedCapture, /\$streamState\.Reader\.ReadAsync/);
  assert.match(boundedCapture, /Write-Host \$chunk -NoNewline/);
  assert.match(boundedCapture, /Docker Desktop -> Settings -> Resources -> Proxies/);
  assert.match(boundedCapture, /\$nextHeartbeatAt = \$startedAt\.AddSeconds\(20\)/);
  assert.match(boundedCapture, /\$NoOutputTimeoutSeconds/);
  assert.match(boundedCapture, /\$stalled = \$true/);
  assert.match(boundedCapture, /if \(-not \$process\.HasExited\)/);
  assert.match(boundedCapture, /taskkill\.exe" \/PID \$process\.Id \/T \/F 2>\$null/);
  assert.match(boundedCapture, /catch \[System\.InvalidOperationException\]/);
  assert.match(boundedCapture, /\$process\.WaitForExit\(\)/);
  assert.doesNotMatch(boundedCapture, /\$process\.WaitForExit\(\$TimeoutSeconds \* 1000\)/);
  assert.match(boundedCapture, /ExitCode = 124/);
  assert.match(boundedCapture, /TimedOut = \$true/);
  assert.match(resolver, /if \(\$pull\.TimedOut\)/);
  assert.match(resolver, /The stalled pull was stopped/);
  assert.match(resolver, /made no layer progress/);
  assert.match(resolver, /Invoke-DockerCommandCapture[\s\S]*"image", "inspect"/);
  assert.match(installer, /function Invoke-DockerPullWithRetry/);
  assert.match(installer, /Test-DockerPullNetworkFailure/);
  assert.match(installer, /retrying image pull in/);
});

test('Windows Docker/WebUI reports first-time setup progress while waiting for HTTP health', () => {
  const installer = fs.readFileSync(installerPath, 'utf8');
  const healthWait = extractPowerShellFunction(installer, 'Wait-WebUiHealth');

  assert.match(healthWait, /\$nextHeartbeatAt = \$startedAt\.AddSeconds\(20\)/);
  assert.match(healthWait, /WebUI is still completing first-time setup/);
  assert.match(healthWait, /Docker Engine also needs GitHub\/GHCR access/);
  assert.match(healthWait, /Docker Desktop -> Settings -> Resources -> Proxies/);
});

test('Windows Docker/WebUI isolates public OPL GHCR pulls from host credentials', () => {
  const installer = fs.readFileSync(installerPath, 'utf8');
  const fallback = installer.slice(
    installer.indexOf('function Test-PublicOplGhcrImageReference'),
    installer.indexOf('function Wait-DockerDaemon'),
  );

  assert.match(fallback, /ghcr\\\.io\/gaofeng21cn\/one-person-lab-webui/);
  assert.match(fallback, /return Invoke-PublicGhcrAnonymousDockerCommandCapture/);
  assert.match(fallback, /return Invoke-DockerCommandCaptureWithTimeout/);
  assert.match(fallback, /-StreamOutput/);
  assert.doesNotMatch(fallback, /Test-DockerCredentialHelperFailure/);
  assert.match(fallback, /@\('--config', \$temporaryConfigDir\) \+ \$Arguments/);
  assert.match(fallback, /Remove-Item -LiteralPath \$temporaryConfigDir -Force -Recurse/);
});

test('Windows Docker/WebUI compose commands use exit codes instead of native stderr exceptions', () => {
  const installer = fs.readFileSync(installerPath, 'utf8');
  const composeUp = installer.slice(
    installer.indexOf('function Invoke-DockerComposeUp'),
    installer.indexOf('function Test-WebUiHttpHealth'),
  );

  assert.match(composeUp, /Invoke-DockerPullWithRetry/);
  assert.match(composeUp, /-Arguments \$pullArgs/);
  assert.match(composeUp, /-ImageReference \$ImageReference/);
  assert.match(composeUp, /Invoke-DockerCommandCapture -DockerCliPath \$DockerCliPath -Arguments \$upArgs/);
  assert.match(composeUp, /\$pull\.ExitCode -ne 0/);
  assert.match(composeUp, /\$up\.ExitCode -ne 0/);
  assert.doesNotMatch(composeUp, /& docker/);
});

test('Windows Docker/WebUI uses the resolved absolute docker.exe path for every native Docker invocation', () => {
  const installer = fs.readFileSync(installerPath, 'utf8');
  const resolver = installer.slice(
    installer.indexOf('function Refresh-ProcessPathFromEnvironment'),
    installer.indexOf('function Invoke-DiagnosticDockerCommand'),
  );
  const diagnostics = installer.slice(
    installer.indexOf('function Invoke-DiagnosticDockerCommand'),
    installer.indexOf('function Install-Wsl2Prerequisites'),
  );
  const execution = installer.slice(installer.indexOf('$tagWasProvided ='));

  assert.match(resolver, /Get-Command docker\.exe -CommandType Application/);
  assert.match(resolver, /Docker\\Docker\\resources\\bin\\docker\.exe/);
  assert.match(resolver, /Programs\\DockerDesktop\\resources\\bin\\docker\.exe/);
  assert.match(diagnostics, /Invoke-DockerCommandCapture/);
  assert.doesNotMatch(diagnostics, /\$output = & \$DockerCliPath @Arguments/);
  assert.match(installer, /\$startInfo\.FileName = \$DockerCliPath/);
  assert.match(installer, /\$startInfo\.Arguments = \$argumentLine/);
  assert.match(execution, /\$dockerCliPath = Assert-DockerCli/);
  assert.match(execution, /Resolve-PinnedImageReference -DockerCliPath \$dockerCliPath/);
  assert.match(execution, /Invoke-DockerComposeUp -DockerCliPath \$dockerCliPath/);
  assert.match(execution, /Collect-WebUiDiagnostics -DockerCliPath \$dockerCliPath/);
  assert.doesNotMatch(installer, /Get-Command docker(?!\.exe)/);
  assert.doesNotMatch(installer, /& docker(?:\s|$)/);
});

test('Windows Docker/WebUI health timeout classifies external input only with remote network evidence', () => {
  const installer = fs.readFileSync(installerPath, 'utf8');
  const healthWait = extractPowerShellFunction(installer, 'Wait-WebUiHealth');
  const classification = extractPowerShellFunction(installer, 'Get-WebUiHealthTimeoutClassification');
  assert.match(installer, /function Get-WebUiHealthTimeoutClassification/);
  assert.match(classification, /docker-compose-logs\.txt/);
  assert.match(classification, /ghcr\\\.io/);
  assert.match(classification, /github\\\.com/);
  assert.match(classification, /networkFailurePattern/);
  assert.match(classification, /networkErrorContextPattern/);
  assert.match(classification, /could not resolve/);
  assert.match(classification, /networkAdjacentFailurePattern/);
  assert.match(classification, /lineIndex - 1/);
  assert.match(classification, /lineIndex \+ 1/);
  assert.match(classification, /lineIndex -lt \$evidenceLines\.Count/);
  assert.match(classification, /if \(\$line -match \$networkFailurePattern -or \$line -match \$networkErrorContextPattern\)/);
  assert.match(healthWait, /Get-WebUiHealthTimeoutClassification -TargetDir \$failureDir/);
  assert.match(healthWait, /health-timeout-classification\.txt/);
  assert.match(healthWait, /external_input_required/);
  assert.match(healthWait, /local_startup_failure/);
  assert.match(healthWait, /Diagnostics do not establish a GitHub\/GHCR network blockage/);
  assert.match(installer, /Docker Desktop -> Settings -> Resources -> Proxies/);
  assert.doesNotMatch(healthWait, /throw "external_input_required: WebUI did not become reachable[\s\S]*First-time Official Profile initialization/);
});

test('Windows Docker/WebUI requires failure context for generic TLS/DNS/certificate terms', () => {
  const installer = fs.readFileSync(installerPath, 'utf8');
  const classification = extractPowerShellFunction(installer, 'Get-WebUiHealthTimeoutClassification');
  const primaryPattern = classification.match(/\$networkFailurePattern = "([^"]+)"/)?.[1] ?? '';
  assert.doesNotMatch(primaryPattern, /\b(?:dns|tls|ssl|certificate)\b/);
  assert.match(classification, /\$networkErrorContextPattern =/);
  assert.match(classification, /\$networkErrorContextPattern\)/);
  assert.match(classification, /(?:error|err|failed|failure|unable|cannot|could not)/i);
});

test('Windows Docker/WebUI automatic updates stay on the limited host-side latest route', () => {
  const installer = fs.readFileSync(installerPath, 'utf8');
  const autoUpdateWriter = installer.slice(
    installer.indexOf('function Write-WebUiAutoUpdater'),
    installer.indexOf('function Disable-WebUiAutoUpdate'),
  );
  const autoUpdateRegistration = installer.slice(
    installer.indexOf('function Register-WebUiAutoUpdate'),
    installer.indexOf('function Invoke-DockerComposeUp'),
  );

  assert.doesNotMatch(
    installer,
    /raw\.githubusercontent\.com\/gaofeng21cn\/one-person-lab-app\/main\/scripts\/install-docker-webui\.ps1/,
    'the scheduled task must not download and execute a mutable main-branch installer',
  );
  assert.match(autoUpdateWriter, /Copy-Item -LiteralPath \$InstallerSourcePath/);
  assert.match(autoUpdateWriter, /Move-Item -LiteralPath \$installerTemporaryPath -Destination \$installerPath/);
  assert.match(autoUpdateWriter, /`"-Update`"/);
  assert.match(autoUpdateWriter, /`"-Yes`"/);
  assert.match(autoUpdateWriter, /`"-NoOpen`"/);
  assert.match(autoUpdateRegistration, /New-ScheduledTaskPrincipal/);
  assert.match(autoUpdateRegistration, /New-ScheduledTaskTrigger -Daily -At \$scheduleTime/);
  assert.match(autoUpdateRegistration, /New-ScheduledTaskTrigger -AtLogOn -User \$currentUser/);
  assert.match(autoUpdateRegistration, /-Trigger \$triggers/);
  assert.match(autoUpdateRegistration, /-LogonType Interactive/);
  assert.match(autoUpdateRegistration, /-RunLevel Limited/);
  assert.match(autoUpdateRegistration, /-StartWhenAvailable/);
  assert.match(autoUpdateRegistration, /-MultipleInstances IgnoreNew/);
  assert.match(installer, /\[switch\]\$AutoUpdateStatus/);
  assert.match(installer, /function Show-WebUiAutoUpdateStatus/);
  assert.match(installer, /schema=opl_webui_host_auto_update_result\.v1/);
  assert.match(installer, /schema=opl_webui_host_auto_update_config\.v1/);
  assert.match(installer, /daily_time=not_configured/);
  assert.match(autoUpdateWriter, /`\$installerExitCode = `\$LASTEXITCODE/);
  assert.match(autoUpdateWriter, /function Test-RestoredWebUiHealth/);
  assert.match(autoUpdateWriter, /`\$rollbackDeadline = \(Get-Date\)\.AddSeconds\(`\$healthTimeoutSeconds\)/);
  assert.match(autoUpdateWriter, /if \(Test-RestoredWebUiHealth\)/);
  assert.match(autoUpdateWriter, /phase=installer_update/);
  assert.match(autoUpdateWriter, /phase=health/);
  assert.match(installer, /function Test-WebUiAutoUpdateConfigured/);
  assert.match(installer, /Run -DisableAutoUpdate before switching to a custom image/);
  assert.doesNotMatch(autoUpdateWriter, /docker\.sock|Docker socket/i);
});
