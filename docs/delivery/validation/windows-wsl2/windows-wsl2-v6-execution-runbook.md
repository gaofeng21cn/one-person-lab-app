# Windows WSL2 V6 Hyper-V Execution Runbook

Owner: `one-person-lab-app`
Purpose: execute and close one exact V6 diagnostic run.
State: `validation_only_non_binding`
Executor task: `authority_bindings.executor_task_id` from the immutable intake manifest
Platform owner task: `authority_bindings.platform_owner_task_id` from the immutable intake manifest
VM: `OPL-V6-WSL2-01`

The [validation scope](validation-scope.md) defines acceptance and exclusions.
This runbook is part of the immutable intake packet. The intake manifest binds
its exact bytes. Do not use the historical Intel VM or its candidate ZIP as an
input. Do not run WebUI, clean-install, Docker, release, or public-promotion
operations in this lane.

## 0. Materialize Intake

From a clean checkout at the exact App acceptance commit, generate one absent
packet directory with the fresh platform-owner and executor identities:

```powershell
node .\docs\delivery\validation\windows-wsl2\fixtures\v6-materialize-intake.mjs `
  --app-sha <APP_ACCEPTANCE_SHA> `
  --platform-owner-task-id <WINDOWS_PLATFORM_OWNER_TASK_ID> `
  --executor-task-id <WINDOWS_EXECUTOR_TASK_ID> `
  --output-dir C:\v6-packet
Get-FileHash -Algorithm SHA256 C:\v6-packet\windows-wsl2-v6-intake-manifest.json
```

The generator owns frozen source identities and packet membership. Publish the
exact packet through its distinct delivery commit before platform admission;
the request and lease bind that delivery plus the manifest digest. An earlier
packet, ZIP or lease cannot authorize the new operation.

## 1. Platform Lease

The platform owner completes reboot/Hyper-V readiness, creates or restores the
clean VM, and issues `writer-lease.json` matching
`windows-wsl2-v6-writer-lease.schema.json`. The lease must bind:

- `host_platform=windows_hyperv`;
- `vm_name=OPL-V6-WSL2-01`;
- `vm_identity=hyperv-vmid:<Get-VM Id>`;
- the exact platform owner and executor task IDs above;
- all four operations: `v6_build_seal`, `v6_fixture_phase_transition`,
  `v6_guest_visible_smoke`, and `v6_soft_shutdown`; and
- a still-active validity window plus a clean-VM attestation for the same VM ID.

On the Windows host, fail closed before entering the guest:

```powershell
$ErrorActionPreference = 'Stop'
$VmName = 'OPL-V6-WSL2-01'
$Vm = Get-VM -Name $VmName -ErrorAction Stop
$VmId = $Vm.Id.Guid.ToString().ToLowerInvariant()
$VmIdentity = "hyperv-vmid:$VmId"
$Vm | Select-Object Name, Id, State
```

The platform owner transfers the exact packet directory and lease to the
executor. The executor verifies the contract-owner-provided intake manifest
SHA256, validates every `packet_files` entry by name, size, and SHA256, and
copies those bytes plus `writer-lease.json` into the absent guest path:

```text
C:\Users\Public\Documents\OnePersonLabValidation\windows-wsl2-v6-v1
```

PowerShell Direct or another platform-owner-approved transport may copy bytes
and later export evidence. It must not be used to run the UI smoke because a
non-interactive session cannot prove a visible Electron window.

## 2. Guest Build Seal

Run the following in a guest PowerShell console. Building may be non-interactive,
but the same active lease must cover it:

```powershell
$ErrorActionPreference = 'Stop'
$Root = 'C:\Users\Public\Documents\OnePersonLabValidation\windows-wsl2-v6-v1'
$ManifestPath = Join-Path $Root 'windows-wsl2-v6-intake-manifest.json'
$LeasePath = Join-Path $Root 'writer-lease.json'
$ManifestSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $ManifestPath).Hash.ToLowerInvariant()
$LeaseSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $LeasePath).Hash.ToLowerInvariant()

& (Join-Path $Root 'v6-build-seal.ps1') `
  -ExpectedIntakeManifestSha256 $ManifestSha `
  -ExpectedWriterLeaseSha256 $LeaseSha

$BuildPath = Join-Path $Root 'v6-build-seal-receipt.json'
$BuildSha = (Get-FileHash -Algorithm SHA256 -LiteralPath $BuildPath).Hash.ToLowerInvariant()
$Build = Get-Content -Raw -LiteralPath $BuildPath | ConvertFrom-Json
$ArtifactSha = $Build.artifact.sha256
Get-Item $BuildPath,(Join-Path $Root $Build.artifact.file_name)
Get-FileHash -Algorithm SHA256 $BuildPath,(Join-Path $Root $Build.artifact.file_name)
```

The command must create, never overwrite, one build receipt and one sealed ZIP.
It must use a fresh detached Shell checkout and absent output directory. A
different ZIP digest is not itself a failure; the build receipt is the
authority for that exact build.

## 3. Interactive Guest Smokes

Run all three smokes from a PowerShell console in the logged-in guest desktop. Do
not run them through PowerShell Direct, a background service, or a hidden
scheduled task.

Prepare the exact source, lease, and artifact arguments:

```powershell
$Manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
$Lease = Get-Content -Raw -LiteralPath $LeasePath | ConvertFrom-Json
$Runner = Join-Path $Root 'v6-electron-visible-smoke.ps1'
$Common = @{
  ExpectedArtifactSha256 = $ArtifactSha
  ExpectedIntakeManifestSha256 = $ManifestSha
  ExpectedBuildReceiptSha256 = $BuildSha
  ExpectedWriterLeaseSha256 = $LeaseSha
  AppSha = $Manifest.source_refs.app_acceptance_sha
  ShellSha = $Manifest.source_refs.shell.git_sha
  FrameworkSha = $Manifest.source_refs.framework_fixture_sha
  PlatformOwnerTaskId = $Lease.platform_owner_task_id
  ExecutorTaskId = $Lease.executor_task_id
  WriterLeaseId = $Lease.lease_id
  WriterLeaseIssuedAt = [datetime]$Lease.issued_at
  WriterLeaseExpiresAt = [datetime]$Lease.expires_at
  VmIdentity = $Lease.vm_identity
}
```

First require the fixture to be stopped and run the stopped smoke:

```powershell
wsl.exe --terminate OPL-Validation-g0001
if ($LASTEXITCODE -ne 0) { throw 'Failed to stop only OPL-Validation-g0001' }
$PhaseDeadline = [DateTime]::UtcNow.AddSeconds(60)
do {
  Start-Sleep -Seconds 1
  $Inventory = wsl.exe --list --verbose
  if ([DateTime]::UtcNow -ge $PhaseDeadline) {
    throw 'Timed out waiting for OPL-Validation-g0001 to stop'
  }
} while ($Inventory -match 'OPL-Validation-g0001\s+Running')

& $Runner @Common -ExpectedPhase stopped -RunId v6-stopped-01
```

Then start only that fixture with a bounded keeper, run the running smoke, and
terminate only that fixture:

```powershell
$PhaseKeeper = Start-Process -FilePath "$env:SystemRoot\System32\wsl.exe" `
  -ArgumentList '-d OPL-Validation-g0001 --exec sleep 2147483647' `
  -PassThru
try {
  $PhaseDeadline = [DateTime]::UtcNow.AddSeconds(60)
  do {
    Start-Sleep -Seconds 1
    if ($PhaseKeeper.HasExited) {
      throw "OPL-Validation-g0001 keeper exited before Running state: $($PhaseKeeper.ExitCode)"
    }
    $Inventory = wsl.exe --list --verbose
    if ([DateTime]::UtcNow -ge $PhaseDeadline) {
      throw 'Timed out waiting for OPL-Validation-g0001 to reach Running state'
    }
  } while ($Inventory -notmatch 'OPL-Validation-g0001\s+Running')

  & $Runner @Common -ExpectedPhase running -RunId v6-running-01
} finally {
  wsl.exe --terminate OPL-Validation-g0001
  if ($LASTEXITCODE -ne 0) { throw 'Failed to stop only OPL-Validation-g0001' }
  if (-not $PhaseKeeper.WaitForExit(30000)) {
    throw 'OPL-Validation-g0001 keeper did not exit after targeted termination'
  }
}
```

Record the guest boot identity, perform one normal Windows restart, sign back in,
recreate `$Root`, `$ManifestPath`, `$LeasePath`, `$ManifestSha`, `$LeaseSha`,
`$BuildPath`, `$BuildSha`, `$Build`, `$ArtifactSha`, `$Manifest`, `$Lease`,
`$Runner`, and `$Common` exactly as above, then run the restart-persistence
phase. This restart is part of `v6_guest_visible_smoke`; it does not add a fifth
lease operation.

Before the restart:

```powershell
$RestartMarker = Join-Path $Root 'evidence\restart-persistence-preboot.txt'
if (Test-Path -LiteralPath $RestartMarker) {
  throw 'Restart-persistence preboot marker already exists'
}
$PreRestartWindowsBootTime =
  (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime()
[System.IO.File]::WriteAllText(
  $RestartMarker,
  $PreRestartWindowsBootTime.ToString('o'),
  [System.Text.UTF8Encoding]::new($false)
)
Restart-Computer
```

After the interactive desktop is available again:

```powershell
$RestartMarker = Join-Path $Root 'evidence\restart-persistence-preboot.txt'
$PreRestartWindowsBootTime = [datetime]::Parse(
  (Get-Content -Raw -LiteralPath $RestartMarker).Trim(),
  [System.Globalization.CultureInfo]::InvariantCulture,
  [System.Globalization.DateTimeStyles]::RoundtripKind
)
$ObservedBootTime =
  (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime()
if ($ObservedBootTime -le $PreRestartWindowsBootTime) {
  throw 'Windows boot time did not advance for restart-persistence'
}

$PhaseKeeper = Start-Process -FilePath "$env:SystemRoot\System32\wsl.exe" `
  -ArgumentList '-d OPL-Validation-g0001 --exec sleep 2147483647' `
  -PassThru
try {
  $PhaseDeadline = [DateTime]::UtcNow.AddSeconds(60)
  do {
    Start-Sleep -Seconds 1
    if ($PhaseKeeper.HasExited) {
      throw "OPL-Validation-g0001 keeper exited before restart-persistence smoke"
    }
    $Inventory = wsl.exe --list --verbose
    if ([DateTime]::UtcNow -ge $PhaseDeadline) {
      throw 'Timed out waiting for restart-persistence fixture state'
    }
  } while ($Inventory -notmatch 'OPL-Validation-g0001\s+Running')

  & $Runner @Common `
    -ExpectedPhase restart_persistence `
    -PreRestartWindowsBootTime $PreRestartWindowsBootTime `
    -RunId v6-restart-persistence-01
} finally {
  wsl.exe --terminate OPL-Validation-g0001
  if ($LASTEXITCODE -ne 0) { throw 'Failed to stop only OPL-Validation-g0001' }
  if (-not $PhaseKeeper.WaitForExit(30000)) {
    throw 'Restart-persistence keeper did not exit after targeted termination'
  }
}
```

Each run must leave zero candidate processes, listeners, writers, and newly
introduced WSL process survivors.
Expected create-once evidence:

```text
evidence\v6-stopped-01\v6-visible-smoke-receipt.json
evidence\v6-stopped-01\v6-visible-window.png
evidence\v6-running-01\v6-visible-smoke-receipt.json
evidence\v6-running-01\v6-visible-window.png
evidence\v6-restart-persistence-01\v6-visible-smoke-receipt.json
evidence\v6-restart-persistence-01\v6-visible-window.png
```

All three receipts must have `status=passed`,
`receipt_stage=guest_smoke_pending_host_closeout`, and
`terminal_v6_verdict=false`. They must bind the same intake manifest, build
receipt, ZIP, extracted tree, VM identity, and lease, with distinct run IDs.

## 4. Host Evidence Export And Closeout

Export without modifying the bytes:

- the intake manifest and writer lease;
- the build-seal receipt and sealed ZIP;
- all three guest receipts and screenshots; and
- private build logs only to quarantine, not to the repository.

Run the following from a clean App checkout that contains this packet. Every
path is on the Windows host and `<...>` values come from the already verified
manifest, lease, build receipt, or `Get-VM` readback:

```powershell
node .\docs\delivery\validation\windows-wsl2\fixtures\v6-host-closeout.mjs `
  --vm-name OPL-V6-WSL2-01 `
  --expected-vm-id <VM_ID> `
  --writer-lease <HOST_WRITER_LEASE_JSON> `
  --expected-writer-lease-sha256 <WRITER_LEASE_SHA256> `
  --intake-manifest <HOST_INTAKE_MANIFEST_JSON> `
  --expected-intake-manifest-sha256 <INTAKE_MANIFEST_SHA256> `
  --build-receipt <HOST_BUILD_SEAL_JSON> `
  --expected-build-receipt-sha256 <BUILD_RECEIPT_SHA256> `
  --stopped-guest-receipt <HOST_STOPPED_RECEIPT_JSON> `
  --stopped-screenshot <HOST_STOPPED_SCREENSHOT_PNG> `
  --running-guest-receipt <HOST_RUNNING_RECEIPT_JSON> `
  --running-screenshot <HOST_RUNNING_SCREENSHOT_PNG> `
  --restart-persistence-guest-receipt <HOST_RESTART_PERSISTENCE_RECEIPT_JSON> `
  --restart-persistence-screenshot <HOST_RESTART_PERSISTENCE_SCREENSHOT_PNG> `
  --candidate-zip <HOST_SEALED_ZIP> `
  --expected-artifact-sha256 <SEALED_ZIP_SHA256> `
  --expected-app-sha <APP_ACCEPTANCE_SHA> `
  --expected-shell-sha 868d6e818583547a5ec982b10b34464a3fa47c10 `
  --expected-framework-sha e260ad46e2cf73ea334d2453d901ee448248d9e0 `
  --release-receipt-id <UNIQUE_RELEASE_RECEIPT_ID> `
  --output-dir <ABSENT_HOST_CLOSEOUT_DIRECTORY> `
  --timeout-seconds 180 `
  --request-soft-shutdown
```

Closeout validates every prior identity before requesting shutdown. It may call
only `Stop-VM -Shutdown`; timeout or any mismatch fails closed. It writes
`writer-release.json` and `v6-host-closeout-receipt.json` with
`terminal_v6_verdict=true` only after `Get-VM` reads the same VM ID in
`State=Off`.

The executor returns the immutable packet identity plus all exported file
SHA256 values and the final closeout directory to the contract owner. The
contract owner independently validates schemas, identity joins, screenshots,
cleanup, and powered-off readback before issuing the product verdict.
