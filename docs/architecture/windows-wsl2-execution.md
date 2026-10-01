# Windows WSL2 Execution

Owner: `one-person-lab-app`
Purpose: explain the current Windows desktop execution boundary and its owners.
State: active reference.

The Windows desktop execution boundary is active in
[`app-windows-wsl2-execution.json`](../../contracts/app-windows-wsl2-execution.json).
Windows runs Electron, provisioning and explicit host integration. A dedicated
`OPL-Linux` WSL2 distribution runs the Studio Node Host, Codex and Framework. The earlier
exploration and proposed phases have been superseded by this contract and the
Shell implementation.

## Ownership and Execution

| Surface | Owner and current implementation |
| --- | --- |
| Windows outcome, execution invariant and acceptance | App's Windows execution contract. |
| Guided setup, restart resume, repair and progress | Studio `desktop/windows-provisioning.mjs`, `windows-bootstrap.sh` and the existing App setup projection. |
| Structured transport and cancellation | Studio `desktop/windows-runtime.mjs` and `windows-guest-rpc.mjs`; stops are operation-scoped. |
| Studio Host launch | Studio `desktop/main.mjs` selects `windows-guest-proxy.mjs` and starts `windows-guest-host.mjs` inside the owned guest. |
| Native Codex App Server | Guest-local Studio Host and `opl-codex-native` use the declared Linux executable and `CODEX_HOME`. |
| Framework state, action and credential transport | Guest-local Framework bridge invokes the public owner interfaces; Framework owns their semantics. |
| Guest Host bytes and runtime pins | Studio `scripts/desktop/prepare-wsl-host-payload.mjs` binds the payload to the frozen Shell ref and App bootstrap/qualification inputs. |
| Package lifecycle and domain outcomes | Configured carriers and Package/domain owners; Framework aggregates their readback. |

The execution port accepts logical programs declared by the contract,
structured arguments and bounded stdin. It calls the guest bootstrap inspect,
execute and control entrypoints. It does not provide an unrestricted guest
command channel. Missing or unhealthy WSL enters provisioning or repair; it
cannot select native Windows Codex or Framework as a fallback. Studio does not
launch AionCore. The archived AionUI provisioner and early receipts explain
historical baselines only; they are not the current production implementation.

The packaged Guest Host closure includes a digest-bound archive. Studio verifies
the installed payload, extracts this archive into the owned guest's Linux
filesystem, verifies the extracted inventory and bytes, then starts the Host
from that immutable cache. Cached bytes are rechecked before reuse. This avoids
loading thousands of modules through the mounted NTFS drive; the installed
package remains the source, and Codex/Framework keep their existing owners.
Staging reports the existing initialization activity and elapsed-time heartbeat.
Native admission is asynchronous so package verification cannot block the
Electron window. Bootstrap checks the sources it executes or copies; Host
launch checks the archive and staging entry, then checks the entire extracted
Host inventory inside the guest.

Gateway credentials remain Framework-owned. If Node rejects a certificate
chain on a local TLS inspection path, the Framework control client can use the
system HTTPS transport with its normal certificate checks, bounded responses
and cancellation. Credentials stay in a private stdin pipe and never become
command arguments or qualification output.

Windows protocol activation can normalize `opl://navigate?route=...` to
`opl://navigate/?route=...`. The empty path and the single root slash are
equivalent for this hostname-owned action. Non-root paths, extra parameters,
credentials and routes outside the App registry remain rejected.

Framework installation supplies the cohort-verified Linux Temporal CLI when no
existing executable owner is present. The background-service start action uses
that CLI. A platform supervisor marked `applicable=false` does not imply
configuration drift; the App reads the actual service, worker and scheduler
readiness instead.
On App start, Framework activates prepared runtime updates and restores the
already configured local service, worker and scheduler in the owned Linux
guest. This reuses their persistent state and public lifecycle operations.
The provisioning receipt binds the bootstrap cohort. A changed packaged cohort
repairs the same idle guest once; an unchanged cohort preserves independently
updated Framework state. Foreign identities and active operations block repair.

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
