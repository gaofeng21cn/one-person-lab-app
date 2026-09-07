# V6 Diagnostic Validation Scope

Owner: `one-person-lab-app`
Purpose: define what the retained V6 diagnostic candidate can prove.
State: maintained validation fixture; not current product acceptance.

V6 is a separate Windows Electron status-only candidate. Its intake generator
binds a frozen Shell source and Framework fixture; fresh packets and leases
identify each run. It is not the current desktop WSL2 implementation described
by the [Windows execution reference](../../../architecture/windows-wsl2-execution.md).
Passing this fixture does not complete current product installation, supported
platform, upgrade or release acceptance.

## Allowed Evidence

The visibly gated candidate discovers only `OPL-Validation-g0001` and reports
bounded guest identity, AionCore health, direct Codex App Server and read-only
Framework state. ACP, authenticated bootstrap and WebSocket conversation remain
`unverified` or `unavailable` unless independently proved; there is no usable
chat/composer in this candidate. Correctly rendering an unavailable capability
is a projection pass and remains a negative capability outcome.

One exact artifact and build seal must pass distinct stopped, running and
post-restart guest phases. Each guest receipt remains
`guest_smoke_pending_host_closeout`, with `terminal_v6_verdict=false`.
The host closeout joins receipt, screenshot, source, artifact, extracted-tree,
VM and active-lease identities before bounded soft shutdown. Only fresh
`Get-VM` readback of the exact VM in `Off` state and zero operation-owned
process/listener/writer counts can release the writer and produce a terminal
V6 verdict. Hard power-off or a partial guest pass cannot substitute.

## Operating Boundary

The native Windows platform owner and guest executor must be identified by
fresh intake and lease receipts. Historical task IDs, passwords and prior
handoffs do not establish current authority. The retained generator enforces
distinct platform-owner and executor identities and excludes its original
source custodian; those cohort constraints belong to the generator and schemas.

Run only under the exact VM writer lease. The lane permits its build seal,
fixture phase transitions, interactive visible smoke and soft shutdown.
Login, password reset, general Framework actions, installer, importer, repair,
update, Docker and public release operations are outside this diagnostic lane.
Preserve unrelated distributions, Docker and user data. An unknown external
result requires inspection before any repeated mutation.

Receipts contain stable status, versions, digests and bounded response shape.
Passwords, tokens, endpoints, full state/environment dumps, thread or prompt
bodies and raw logs stay out of repository evidence. Private diagnostics remain
in the operation's quarantine and are removed after bounded evidence is retained.

The [execution runbook](windows-wsl2-v6-execution-runbook.md) owns commands and
ordering. The schemas and executable validators own accepted receipt shapes.
Changes to fixtures require focused validation, including target-Windows
PowerShell parsing; documentation alone cannot authorize or prove execution.
