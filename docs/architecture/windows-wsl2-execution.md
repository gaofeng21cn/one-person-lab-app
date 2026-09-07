# Windows WSL2 Execution

Owner: `one-person-lab-app`
Purpose: explain the current Windows desktop execution boundary and its owners.
State: active reference.

The Windows desktop execution boundary is active in
[`app-windows-wsl2-execution.json`](../../contracts/app-windows-wsl2-execution.json).
Windows runs Electron, provisioning and explicit host integration. A dedicated
`OPL-Linux` WSL2 distribution runs AionCore, Codex and Framework. The earlier
exploration and proposed phases have been superseded by this contract and the
Shell implementation.

## Ownership and Execution

| Surface | Owner and current implementation |
| --- | --- |
| Windows outcome, execution invariant and acceptance | App's Windows execution contract. |
| Guided setup, restart resume, repair and progress | `opl-aion-shell`, `packages/desktop/src/process/services/windows-wsl/provisioner.ts` and `provisioningWindow.ts`. |
| Structured transport and cancellation | Shell's `packages/desktop/src/process/services/runtime-execution/windowsWslRuntimeExecution.ts`. |
| AionCore backend launch | Shell's `packages/desktop/src/index.ts` selects `windowsWslBackendProcessController.ts` on Windows. |
| Direct Codex App Server | Shell's `codexAppServer/adapter.ts` selects the WSL runtime on Windows. |
| Framework state, action and credential transport | Shell's `bridge/oplRuntimeBridge.ts` transports owner commands through the same WSL runtime; Framework owns their semantics. |
| AionCore bytes and protocol | Unmodified official upstream release, selected and installed through the complete App/Shell delivery path. |
| Package lifecycle and domain outcomes | Configured carriers and Package/domain owners; Framework aggregates their readback. |

The execution port accepts logical programs declared by the contract,
structured arguments and bounded stdin. It calls the guest bootstrap inspect,
execute and control entrypoints. It does not provide an unrestricted guest
command channel. Missing or unhealthy WSL enters provisioning or repair; it
cannot select native Windows AionCore, Codex or Framework as a fallback.

The distribution belongs to the OPL installation. Existing user distributions,
the Windows default distribution and `docker-desktop` are not adopted or
modified. The guest user, `CODEX_HOME`, workspace root and common route identity
are declared in the contract. Linux paths remain execution identities; Windows
path presentation uses the Shell's distribution-bound projection.

## Provisioning and Recovery

The App exposes one guided setup surface. Shell owns Windows feature checks,
any necessary UAC request, restart resume, owned-distribution setup, guest
initialization and route validation. The contract defines the projection
states; this document does not maintain a second state list.

Long-running setup reports activity and elapsed time. Progress heartbeat does
not mean exact percentage completion. Guest network failures use bounded
retries and distinguish DNS, network, proxy and other bootstrap failures.
Recovery resumes the existing operation after inspecting its result; it does
not ask the user to reinstall while work is active or silently alter the
Windows global proxy or select a third-party mirror.

Cancellation and cleanup target only owned execution. Global WSL shutdown and
unknown-data deletion are forbidden. Distribution unregister requires explicit
user removal. Framework and Package changes continue through their actual
owners; the Windows provisioner does not acquire their installation or update
authority.

## Release and Evidence

[`app-release-channel.json`](../../contracts/app-release-channel.json) owns the
release platform matrix. Windows x64 assets use the same Stable release tag as
the desktop release through the additional-platform path. The standalone
Windows RC publication route is retired. Signing status must be explicit;
unsigned assets cannot claim production signing.

The Windows execution contract records `current_wsl2_runtime_acceptance` as
`not_claimed`. Source implementation and permission to publish Stable assets
do not establish installed runtime acceptance. Exact no-WSL installation,
UAC/restart resume, common Linux executor identity across all routes, real
requests, cancellation, persistence, repair and data retention must be proved
against the installed candidate before claiming that acceptance.

The [Windows platform validation index](../delivery/validation/windows-platform/README.md)
routes VM infrastructure and updater qualification. The
[V6 validation index](../delivery/validation/windows-wsl2/README.md) covers a
separate frozen diagnostic candidate, whose result cannot qualify the current
desktop product. [Early experiment receipts](../history/windows-wsl2/README.md)
retain their original cohort and partial outcomes for diagnosis.
