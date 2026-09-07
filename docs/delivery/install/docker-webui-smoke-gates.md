# Docker/WebUI Smoke Gates

Owner: `one-person-lab-app`
Purpose: `docker_webui_smoke_gate_runbook`
State: `active_support`
Machine boundary: Human-readable verification and readiness-boundary support.
Machine policy stays in `contracts/app-install-exposure-policy.json`; pass/fail
truth stays in workflow outputs and uploaded smoke gate artifacts.

This runbook owns the App-side execution entry for Docker/WebUI installer smoke
evidence. It does not replace the install exposure contract, and it does not
turn local container smoke into clean VM proof.

SSOT split: the contract owns required policy, the operator guide owns the
install route, this runbook owns verification commands and artifact readback,
the public README owns the user entry, and generated guide files are payload
artifacts only.

## Stable Gate Policy

The standalone installer smoke uses this required environment:

- `clean_linux_vm`: a clean Linux VM runs `install-docker-webui.sh --yes`.

Windows Docker Desktop/WSL2 is a Windows/Docker host concern. The following
gates provide additional host and data-preservation diagnostics:

- `clean_windows_vm`: a clean Windows VM runs `install-docker-webui.ps1 -Yes`.
- `existing_docker`: a host with Docker already working reruns the installer
  without reinstalling Docker.
- `existing_old_onepersonlab_data_dir`: a host with existing
  `OnePersonLab/data` proves the installer preserves or migrates data instead
  of deleting it.

Contract-only rows and docs are not pass evidence. The gate runner writes a
typed blocker when the current host cannot prove a requested gate.

## Bounded Recovery Loop

Windows VM validation must pursue the usable terminal state. A timeout or
non-zero exit stops the **current operation**, not the validation objective.
The operator keeps one active recovery loop for one `RunId`:

1. Run the clean-install fixture and retain its run directory.
2. If an installer command, Docker query, or worker exceeds its budget, stop
   only that validation process tree and write the structured breakpoint.
   Do not start parallel `vmrun`, PowerShell, Docker, or browser probes.
3. Read `supervisor-breakpoint.json`, `runner-error.txt`, and the bounded host
   readback once. Repair the first reported issue, for example by restoring
   Docker Desktop readiness, resolving GHCR connectivity, or freeing only
   unreferenced validation artifacts.
4. Re-read the authoritative host state, then resume the same `RunId`. Do not
   blindly rerun an operation whose external result is unknown.
5. Continue until the installer, data preservation, scheduled-task, digest,
   HTTP, and UI checks all pass. Only a missing permission, safety/data
   integrity risk, or required external input may pause the objective.

The fixture defaults are deliberately finite: a 55-minute interactive worker
budget, a 5 GiB C: free-space floor, and 30-second Docker/WSL readback calls.
The floor stops the validation worker before the guest disk is exhausted; it
does not authorize Docker prune, data deletion, or deletion of referenced
images. Repair the storage condition and resume the same `RunId`.

When Docker Desktop is the first breakpoint, allow one targeted restart after
the bounded readback, then read state again. A second failure is a repair
breakpoint with logs and next action, not a reason to wait indefinitely or to
claim success.

## Commands

Run these from the App repo root:

```bash
npm run smoke:docker-webui:linux-clean-vm -- --artifacts tmp/docker-webui-smoke/linux-clean
npm run smoke:docker-webui:windows-clean-vm -- --artifacts tmp/docker-webui-smoke/windows-clean
npm run smoke:docker-webui:existing-docker -- --artifacts tmp/docker-webui-smoke/existing-docker
npm run smoke:docker-webui:old-data -- --artifacts tmp/docker-webui-smoke/old-data
```

### Windows + WSL2 Native Post-Public Smoke

The native Windows lane is a fast post-public digest acceptance lane. It does
not replace `clean_windows_vm`, test Docker Desktop installation, or own any
source, workflow, tag, dispatch, or publication mutation. Its input must be the
exact public WebUI digest supplied by the unique publication owner.

Before the successor digest exists, generate the bounded command, output, and
judgment plan without inventing a digest:

```bash
npm run smoke:docker-webui:native-windows -- \
  --plan-only \
  --artifacts tmp/docker-webui-native-windows-smoke/successor-plan
```

Capture the current Windows, WSL2, Docker, storage, and zero-owned-resource
baseline without pulling or starting an image:

```bash
npm run smoke:docker-webui:native-windows -- \
  --baseline-only \
  --artifacts tmp/docker-webui-native-windows-smoke/baseline
```

An optional anonymous descriptor readback may inspect an existing immutable
prestate without pulling or running it:

```bash
npm run smoke:docker-webui:native-windows -- \
  --descriptor-only \
  --image ghcr.io/gaofeng21cn/one-person-lab-webui@sha256:<exact-digest> \
  --artifacts tmp/docker-webui-native-windows-smoke/prestate-descriptor
```

After the publication owner supplies the successor digest, run:

```bash
npm run smoke:docker-webui:native-windows -- \
  --image ghcr.io/gaofeng21cn/one-person-lab-webui@sha256:<successor-digest> \
  --source-run-id <source-run-id> \
  --expected-version <version> \
  --expected-app-sha <40hex> \
  --expected-shell-sha <40hex> \
  --expected-framework-sha <40hex> \
  --expected-bundle-digest sha256:<64hex> \
  --expected-cohort-ref sha256:<64hex> \
  --artifacts tmp/docker-webui-native-windows-smoke/successor \
  --json
```

The runner uses an empty isolated `DOCKER_CONFIG` for anonymous pull-by-digest,
then starts the pinned image twice with `pull_policy: never`, `--pull never`,
and an internal Docker network. The WebUI service remains attached only to the
internal network. A non-root, read-only TCP ingress made from the same exact
image connects that network to the loopback-only host port, avoiding Docker
Desktop's suppression of published ports on internal-only networks without
granting the WebUI service an outbound route. It has no host bind or volume;
three bounded ephemeral `tmpfs` mounts cover the image-declared data volumes.
It verifies required OCI labels, the actual
container image ID, `/`, `/manifest.webmanifest`, JS/CSS assets, the local
`/api/auth/user` session, a hydrated Windows Chrome render with screenshot
digest, and `/data` plus `/projects` marker persistence across
recreation. Docker image events after the initial pull must contain zero pull
events. The six expected OCI label values must exactly match the publication
owner's version, bundle/cohort digests, and App/Shell/Framework SHAs. The
publication source run ID is preserved in the receipt as correlation evidence;
it is not represented as an image label. Cleanup is owner/run-id scoped and must leave zero task-owned
containers, networks, or runtime directories; it never prunes Docker and does
not remove the pulled image.

If a bounded operation completed the exact pull but failed before HTTP
qualification, a repaired operation may reuse that local image without a
second registry request only when `--reuse-local-image` is paired with
`--initial-pull-evidence <prior-command-index.json>` and
`--initial-pull-evidence-sha256 sha256:<digest>`. The runner verifies those
exact bytes, rejects any additional pull command, requires every prior Compose
start to use `--pull never`, and then re-inspects the local image by exact
digest. The final receipt binds the prior command-index digest and proves the
total exact pull count remained one.

The terminal artifact is
`native-windows-smoke-receipt.json`, validated against
`contracts/app-webui-native-windows-smoke-receipt.schema.json` and by:

```bash
npm run smoke:docker-webui:native-windows -- \
  --validate-receipt tmp/docker-webui-native-windows-smoke/successor/native-windows-smoke-receipt.json \
  --json
```

Capability split:

| Lane | Owned acceptance | Explicitly not owned |
| --- | --- | --- |
| Windows + WSL2 native | Exact digest pull, labels, health/UI/local login, persistence, no-secondary-fetch, bounded receipt, cleanup | Source, App/Shell/Framework main, workflows, tags, dispatch, publication |
| Intel iMac Windows VM | Clean Windows user, Docker Desktop installer/update, public tutorial, soft shutdown | Native WSL2 digest harness and public publication |

Each artifact directory must be uploaded as one reviewer-visible package. Keep
the four directories separate so release review can map evidence back to the
gate that produced it:

- `tmp/docker-webui-smoke/linux-clean/`
- `tmp/docker-webui-smoke/windows-clean/`
- `tmp/docker-webui-smoke/existing-docker/`
- `tmp/docker-webui-smoke/old-data/`

Each directory must include `docker-webui-smoke-gate-result.json`,
`diagnostics/`, `api-key-flow-evidence.json`, command stdout/stderr files when
commands were run, and the diagnostics archive when the installer produced one.
Do not upload only logs or screenshots; they are supporting evidence, not the
gate result.

For the Windows clean VM gate, the VM operator may upload either the evidence
directory itself or a `.zip` archive produced by the installer. The importer
accepts both forms and applies the same manifest, diagnostics, API key flow,
and secret-scan validation after extracting the archive.

Docker/WebUI image updates are a host-side lane. The accepted update path is to
rerun the one-click installer or use `install-docker-webui.sh --update` /
`install-docker-webui.ps1 -Update`, which runs Docker Compose from the host to
pull the configured image and recreate the service while preserving mounted
`/data` and `/projects`. Do not treat WebUI self-update through a Docker socket,
a Docker socket mount, Watchtower, or any container-side auto-updater as release
evidence for this lane.

Image digest evidence is split in two. The local compose/container image digest
identifies what is running or installed. An optional remote GHCR digest readback
may mark the local image as `current`, `update_available`, `unknown`, or
`not_checked`, but that status is only user/operator guidance. It does not prove
release readiness, live latest/currentness, or that a host update was applied.

OPL body updates inside WebUI use the Linux runtime maintenance path, not the
Docker image lane. The accepted user action is the Settings/Updates
Framework-owned apply route, backed by:

```bash
opl update apply --json
opl update rollback --json
```

For Docker/WebUI this must apply the OPL Framework runtime artifact under the
mounted data root, normally `/data/opl/framework`, with `/data/opl/framework.previous`
available for rollback. Evidence for this lane is the OPL Framework target
receipt inside the managed-update result:

- apply execution status is `completed`;
- `startup_maintenance.details.framework_targets[]` contains
  `target_id=opl-framework`, `status=completed`, and
  `reason=framework_runtime_artifact_applied`;
- the target root is under the mounted data root, not the image seed root;
- the result includes `source_archive_sha256`, `metadata_ref`,
  `previous_root`, and `rollback_ref`;
- rollback execution status is `completed` and returns
  `reason=framework_runtime_rollback_completed`.

This proves Linux/Docker WebUI can update the OPL runtime body through the
shared Framework updater. It does not prove that GHCR `latest` is current, that
a new WebUI image has been published, or that the host Installation Carrier has
been refreshed.

## Standalone workflow

[`docker-webui-clean-vm.yml`](../../../.github/workflows/docker-webui-clean-vm.yml)
is a manual diagnostic producer with read-only repository permissions. Choose
`platform=linux` on a clean hosted Ubuntu runner, or `platform=windows` on a
disposable self-hosted Windows machine with Docker Desktop and WSL 2. Bind an
exact image digest when accepting a particular publication.

The workflow uploads its platform evidence and validation result. There is no
Desktop Stable evidence-import job or Docker gate in the primary macOS release.
Independent Docker publication and promotion use the qualification described in
the [release guide](../release/README.md).

## Gate Result Readback

`docker-webui-smoke-gate-result.json` uses
`opl_docker_webui_smoke_gate_result.v1`. Reviewers must verify these fields
before accepting an artifact:

- `gate` and `gate_id` identify the requested environment.
- `status` is `passed`, `typed_blocker`, or `failed`.
- `typed_blocker` is present as `null` for non-blocked results and as a
  structured owner route for `typed_blocker` results.
- `diagnostics_validation.status` is `passed` for any `passed` gate.
- `health.url`, `health.status`, and `health.http_status` summarize the WebUI
  HTTP probe.
- `compose.path` and `compose.status` identify the compose file readback.
- `container` and `image` summarize container/image evidence captured from
  Docker.
- `data_preservation.status`, `data_preservation.verdict`, and
  `data_preservation.summary` summarize old-data behavior.
- `api_key_flow.status` proves the WebUI/API proxy accepted the first-run API
  key action and called `opl system configure-codex --api-key-stdin --json`
  without putting key material in the command line or artifact.
- `secret_scan.status` is `passed` and
  `secret_scan.forbidden_secret_markers` is empty.

Validate an uploaded gate result without rerunning Docker or the installer:

```bash
node --experimental-strip-types scripts/docker-webui-smoke-gate.ts \
  --validate-result <artifact-dir>/docker-webui-smoke-gate-result.json \
  --json
```

For `clean_windows_vm`, a non-Windows App checkout cannot execute the VM gate
itself. Import the artifact set produced on the Windows VM instead:

```bash
npm run smoke:docker-webui:windows-clean-vm -- \
  --evidence <windows-artifact-dir> \
  --artifacts tmp/docker-webui-smoke/windows-clean-import
```

If the VM produced `windows-clean-evidence.zip`, import the archive directly:

```bash
npm run smoke:docker-webui:windows-clean-vm -- \
  --evidence windows-clean-evidence.zip \
  --artifacts tmp/docker-webui-smoke/windows-clean-import
```

Without `--evidence`, the Windows gate still writes a typed blocker rather than
claiming the local host proved a clean Windows VM run.

On the Windows VM, let the installer create the uploadable evidence skeleton:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-docker-webui.ps1 `
  -Yes `
  -NoOpen `
  -EvidenceDir windows-clean-evidence `
  -EvidenceArchive windows-clean-evidence.zip
```

If a clean Windows runner is available, use the standalone workflow instead of
collecting the zip by hand:

```bash
npm run smoke:docker-webui:windows-clean-vm:dispatch -- --execute --json
```

That operator helper reads repository self-hosted runner inventory with the
local `gh` token, passes the normalized inventory into the workflow as
`runner_inventory_json`, and dispatches
`.github/workflows/docker-webui-clean-vm.yml` with `platform=windows`. When no matching runner
exists, the workflow uploads `docker-webui-clean-windows-vm-runner-blocker` with
`typed_blocker.code=missing_clean_windows_self_hosted_runner`; this is a
blocked evidence artifact, not a clean Windows pass.

Use dry-run mode before dispatching if you need to inspect the command and
runner inventory:

```bash
npm run smoke:docker-webui:windows-clean-vm:dispatch -- --json
```

```text
.github/workflows/docker-webui-clean-vm.yml (platform=windows)
artifact: docker-webui-clean-windows-vm-evidence
default runner labels: ["self-hosted","Windows","X64","docker-webui-clean-vm"]
```

That workflow runs the same PowerShell installer with `-EvidenceDir` and
`-EvidenceArchive`, imports the archive through
`scripts/docker-webui-smoke-gate.ts --gate clean_windows_vm --evidence`, and
uploads the raw evidence, zip archive, imported gate result, and validation
summary. Its result proves only the selected diagnostic environment.

### Clean Windows Runner Bootstrap

The clean Windows gate needs a real disposable Windows machine. A GitHub-hosted
`windows-latest` runner is not acceptable evidence because this path must prove
Docker Desktop and WSL 2 on the same class of host a Windows beginner would use.

Use a fresh Windows 11 x64 VM when possible. Do not reuse a developer machine
with existing OPL data for this gate. The runner must be online, idle, and carry
these labels:

```text
self-hosted
Windows
X64
docker-webui-clean-vm
```

When a self-hosted runner is not available, the same evidence can be collected
manually in a disposable Windows VM that supports Docker Desktop's WSL 2
backend. A booted VM alone is not pass evidence: import its artifact and
validate the `clean_windows_vm` result.

Guest PowerShell command inside the clean Windows VM:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-docker-webui.ps1 `
  -Yes `
  -NoOpen `
  -EvidenceDir windows-clean-evidence `
  -EvidenceArchive windows-clean-evidence.zip
```

Host import and readback commands from the App repo:

```bash
npm run smoke:docker-webui:windows-clean-vm -- \
  --evidence <path-to-windows-clean-evidence.zip-or-dir> \
  --artifacts tmp/docker-webui-smoke/windows-clean-import \
  --json

node --experimental-strip-types scripts/docker-webui-smoke-gate.ts \
  --validate-result tmp/docker-webui-smoke/windows-clean-import/docker-webui-smoke-gate-result.json \
  --json
```

Keep the raw `windows-clean-evidence/` directory, `windows-clean-evidence.zip`,
the imported `docker-webui-smoke-gate-result.json`, and the validation output in
the evidence folder. A VirtualBox, VMware, or local-host failure should remain a
typed blocker with its owner route and probe logs; do not rewrite it as a clean
Windows pass.

Bootstrap checklist for the VM operator:

1. Install Windows updates and enable WSL 2.
2. Install Docker Desktop, enable the WSL 2 backend, start Docker Desktop, and
   verify these commands in PowerShell:

   ```powershell
   docker version
   docker compose version
   ```

3. In GitHub, open
   `gaofeng21cn/one-person-lab-app -> Settings -> Actions -> Runners -> New
   self-hosted runner`, choose Windows x64, and use GitHub's generated
   registration token. Keep the generated registration token out of docs, logs,
   artifacts, and chat.
4. Add the custom label `docker-webui-clean-vm` during runner configuration.
   GitHub supplies `self-hosted`, `Windows`, and `X64`.
5. Start the runner as a short-lived foreground runner or as a service. Confirm
   the repository runner inventory shows it as online and idle.
6. From the App repo on an operator machine, dispatch the smoke:

   ```bash
   npm run smoke:docker-webui:windows-clean-vm:dispatch -- --execute --json
   ```

7. If the workflow uploads `docker-webui-clean-windows-vm-evidence`, download
   and validate the result:

   ```bash
   gh run download <run-id> \
     --repo gaofeng21cn/one-person-lab-app \
     --name docker-webui-clean-windows-vm-evidence \
     --dir tmp/docker-webui-clean-windows-run-<run-id>

   node --experimental-strip-types scripts/docker-webui-smoke-gate.ts \
     --validate-result tmp/docker-webui-clean-windows-run-<run-id>/docker-webui-clean-windows-vm/docker-webui-smoke-gate-result.json \
     --json
   ```

8. After evidence is collected, remove or stop the self-hosted runner and delete
   the disposable VM if it was created only for this gate.

If the dispatch uploads `docker-webui-clean-windows-vm-runner-blocker` instead,
read `runner-preflight.json`. A `missing_clean_windows_self_hosted_runner`
blocker means the repository inventory was readable but no online idle runner
matched the required labels. A `runner_inventory_unreadable` blocker means an
operator must either grant runner inventory read access or provide
`runner_inventory_json` through the dispatch helper.

`-EvidenceDir` defaults diagnostics into `windows-clean-evidence/diagnostics`
and writes `windows-clean-evidence/windows-smoke-evidence.json`. It also calls
the WebUI access backend to write `api-key-flow-evidence.json`, proving the UI
path reaches `opl system configure-codex --api-key-stdin --json` without putting
access material in installer arguments or diagnostics. If that receipt cannot
be collected, the installer fails the evidence package instead of producing a
placeholder that could be mistaken for pass evidence.

`-EvidenceArchive` packages the complete evidence directory into one uploadable
zip after the manifest, diagnostics, and access receipt exist. It requires
`-EvidenceDir`; the standalone importer accepts either the raw directory or zip.

## Diagnostic Directory

Installer diagnostics must include:

- `metadata.txt`
- `diagnostics-manifest.json`
- `compose.yaml`
- `docker-version.txt`
- `docker-compose-version.txt`
- `docker-compose-ps.txt`
- `docker-compose-logs.txt`
- `docker-image.txt`
- `http-probe.txt`
- `directories.txt`
- `data-preservation.txt`

Validate a captured diagnostic directory with:

```bash
npm run validate:docker-webui-diagnostics -- --diagnostics-dir <diagnostics-dir> --json
```

The validator checks required files, secret-like markers, and the preservation
verdict. It is structural evidence only; it does not prove a VM gate was run on
the right host.

## API Key Flow Evidence

The beginner path requires API keys to be entered inside the WebUI, not passed
to the installer. A passed smoke gate must therefore include
`api-key-flow-evidence.json` with schema
`opl_docker_webui_api_key_flow_evidence.v1`.

The evidence must prove only the safe transport shape:

- the WebUI endpoint is `/api/opl-runtime/configure-codex`;
- the command is the redacted `opl system configure-codex --api-key-stdin
  --json`;
- `stdin_transport` is `true`;
- `key_material_recorded` is `false`;
- no API key-like marker appears in the evidence or diagnostics.

This receipt does not prove a real provider key is valid. It proves that the
new-user UI path writes through the Framework-owned stdin command without
leaking key material into shell history, compose files, diagnostics, or uploaded
artifacts.

## Windows Evidence Import

A Windows VM artifact directory, or zip archive, must contain:

- `windows-smoke-evidence.json`
- `diagnostics/` with the diagnostic files listed above

Archives produced by PowerShell `Compress-Archive` may store paths with
Windows backslash separators, and PowerShell text files may carry a UTF-8 BOM.
The App importer treats both as normal Windows evidence shape, then normalizes
paths before applying zip-slip checks, manifest validation, diagnostics
validation, API key flow validation, and secret scanning.

The manifest must use schema `opl_docker_webui_windows_smoke_evidence.v1` and
bind the artifact to `gate_id: clean_windows_vm`, `status: passed`,
`host_platform: win32`, an `observed_at` timestamp, an `installer_command` that
references `install-docker-webui.ps1` with `-Yes`, and `diagnostics_dir:
diagnostics`. It must also reference `api_key_flow_evidence:
api-key-flow-evidence.json`.

Example:

```json
{
  "schema": "opl_docker_webui_windows_smoke_evidence.v1",
  "gate_id": "clean_windows_vm",
  "status": "passed",
  "host_platform": "win32",
  "observed_at": "2026-06-30T00:00:00Z",
  "installer_command": "powershell -ExecutionPolicy Bypass -File scripts/install-docker-webui.ps1 -Yes -NoOpen -DiagnosticsDir diagnostics",
  "diagnostics_dir": "diagnostics",
  "api_key_flow_evidence": "api-key-flow-evidence.json"
}
```

The importer validates the manifest, runs the diagnostic validator, and scans
the artifact directory for API key-like plaintext markers. It also validates the
API key flow receipt. Do not put API keys in installer arguments, environment
dumps, compose files, diagnostics, API key flow receipts, or artifact manifests.

## Completion Boundary

Accept only a structurally valid `docker-webui-smoke-gate-result.json` with
`status=passed`, no typed blocker, and the required host, HTTP, container,
compose, data-preservation, credential-transport and secret-scan evidence.
For old data, compare the pre/post inventory; a new empty directory is not
preservation proof. Screenshots and logs support the result but cannot replace it.

A local developer host cannot prove a clean VM. A transport receipt cannot prove
real provider access. A passed installer diagnostic cannot authorize Docker
publication, Desktop Stable or domain readiness. Keep failures and missing
environments explicit in the typed result.
