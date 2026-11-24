import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fail, record, repository } from './receipt.ts';
import { commandRunner, parseJsonOutput } from './probes.ts';
export function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function planDocument(artifactDir: string) {
  const executeCommand = [
    'npm run smoke:docker-webui:native-windows --',
    `--image ${repository}@sha256:<successor_digest>`,
    '--source-run-id <source_run_id>',
    '--expected-version <version>',
    '--expected-app-sha <40hex>',
    '--expected-shell-sha <40hex>',
    '--expected-framework-sha <40hex>',
    '--expected-bundle-digest sha256:<64hex>',
    '--expected-cohort-ref sha256:<64hex>',
    `--artifacts ${artifactDir}`,
    '--json',
  ].join(' ');
  return {
    schema: 'opl_app_webui_native_windows_smoke_plan.v1',
    status: 'ready_for_successor_digest',
    owner: 'native_windows_smoke_lane',
    public_owner: '019f9725-99e2-7731-bdb6-0d7e073e7704',
    clean_windows_owner: '019f91db-b1d4-7011-9429-6694cf3b3224',
    image_template: `${repository}@sha256:<successor_digest>`,
    required_resume_input: [
      'exact_index_digest',
      'source_run_id',
      'version',
      'app_sha',
      'shell_sha',
      'framework_sha',
      'bundle_digest',
      'cohort_ref',
    ],
    execute_command: executeCommand,
    descriptor_command: `npm run smoke:docker-webui:native-windows -- --descriptor-only --image ${repository}@sha256:<digest> --artifacts ${artifactDir}-descriptor`,
    baseline_command: `npm run smoke:docker-webui:native-windows -- --baseline-only --artifacts ${artifactDir}-baseline`,
    output_directory: artifactDir,
    judgments: [
      'input_is_exact_immutable_digest',
      'anonymous_pull_uses_empty_docker_config',
      'image_and_container_identity_match_digest_and_required_labels',
      'producer_version_bundle_cohort_and_repo_shas_match_image_labels_exactly',
      'producer_source_run_id_is_preserved_for_publication_correlation',
      'root_webmanifest_assets_and_local_login_session_pass',
      'windows_chrome_renders_a_hydrated_ui_and_writes_a_screenshot_digest',
      'data_and_projects_markers_survive_recreate',
      'compose_uses_pull_policy_never_and_internal_network_after_initial_pull',
      'no_image_pull_event_occurs_after_initial_pull',
      'task_owned_container_network_and_runtime_directory_are_removed',
    ],
    prohibited: ['tag_input', 'moving_tag_mutation', 'workflow_dispatch', 'publication', 'rerun', 'cancel', 'guessed_digest'],
  };
}

export function collectBaseline(artifactDir: string, commandTimeoutSeconds: number) {
  if (!fs.existsSync('/proc/sys/fs/binfmt_misc/WSLInterop')) fail('Native Windows baseline must run inside WSL2 with Windows interop');
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-webui-native-baseline-'));
  const dockerConfigDir = path.join(runtimeDir, 'docker-config');
  fs.mkdirSync(dockerConfigDir);
  const run = commandRunner(artifactDir, { ...process.env, DOCKER_CONFIG: dockerConfigDir }, commandTimeoutSeconds);
  try {
    const windows = run('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', [
      '-NoProfile',
      '-Command',
      '$os=Get-CimInstance Win32_OperatingSystem; $cs=Get-CimInstance Win32_ComputerSystem; $drives=Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {[pscustomobject]@{device_id=$_.DeviceID;size_bytes=[int64]$_.Size;free_bytes=[int64]$_.FreeSpace}}; [pscustomobject]@{caption=$os.Caption;version=$os.Version;build=$os.BuildNumber;architecture=$os.OSArchitecture;manufacturer=$cs.Manufacturer;model=$cs.Model;hypervisor_present=$cs.HypervisorPresent;drives=@($drives)} | ConvertTo-Json -Depth 4 -Compress',
    ], 'windows-baseline');
    const wslVersion = run('/mnt/c/Windows/System32/wsl.exe', ['--version'], 'wsl-version');
    const wslStatus = run('/mnt/c/Windows/System32/wsl.exe', ['--status'], 'wsl-status');
    const wslDistributions = run('/mnt/c/Windows/System32/wsl.exe', ['--list', '--verbose'], 'wsl-distributions');
    const linux = run('sh', ['-lc', 'uname -a; printf "\\n---os-release---\\n"; cat /etc/os-release; printf "\\n---df---\\n"; df -B1 / /var/lib/docker'], 'linux-baseline');
    const dockerVersion = run('docker', ['version', '--format', '{{json .}}'], 'docker-version');
    const dockerInfo = run('docker', ['info', '--format', '{{json .}}'], 'docker-info');
    const ownedContainers = run('docker', [
      'ps', '-a', '--filter', 'label=dev.onepersonlab.validation.owner=native-windows-smoke', '--format', '{{.ID}}',
    ], 'owned-container-baseline');
    const ownedNetworks = run('docker', [
      'network', 'ls', '--filter', 'label=dev.onepersonlab.validation.owner=native-windows-smoke', '--format', '{{.ID}}',
    ], 'owned-network-baseline');
    const payload = {
      schema: 'opl_app_webui_native_windows_baseline.v1',
      status: 'passed',
      observed_at: new Date().toISOString(),
      platform: 'windows_wsl2',
      windows: parseJsonOutput(windows, 'Windows baseline'),
      wsl2: {
        version_evidence: wslVersion.stdout_path,
        status_evidence: wslStatus.stdout_path,
        distributions_evidence: wslDistributions.stdout_path,
        linux_evidence: linux.stdout_path,
      },
      docker: {
        version: parseJsonOutput(dockerVersion, 'docker version'),
        info: parseJsonOutput(dockerInfo, 'docker info'),
      },
      native_lane_resource_occupancy: {
        containers: ownedContainers.stdout.split(/\r?\n/).filter(Boolean).length,
        networks: ownedNetworks.stdout.split(/\r?\n/).filter(Boolean).length,
      },
      isolated_empty_docker_config: true,
    };
    if (payload.native_lane_resource_occupancy.containers !== 0 || payload.native_lane_resource_occupancy.networks !== 0) {
      fail('Native lane baseline found unexpected task-owned Docker resources');
    }
    writeJson(path.join(artifactDir, 'native-windows-baseline.json'), payload);
    return payload;
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}
