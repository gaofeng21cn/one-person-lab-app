# Windows Platform Validation

Owner: `one-person-lab-app`
Purpose: route Windows VM admission and qualification infrastructure.
State: maintained validation infrastructure.

This directory contains executable schemas and fixtures consumed by
`scripts/validate-windows-platform-factory.ts`, Windows validation tests and
the updater qualification contract. It is not a record of current host
capacity, VM state, writer assignment or a completed Windows acceptance.

## Factory Cohort

[`windows-platform-factory-plan.json`](windows-platform-factory-plan.json)
retains the original Hyper-V factory cohort. Its validator still requires
`C:\OPL-VMs` as the factory root and
`E:\_Original-E-20260726\OPL-VMs` as a read-only recovery source. These are
machine-enforced inputs for that cohort, not universal installation paths or
a claim that the recovery operation is active. Requests, leases and active VM
or receipt namespaces must not resolve below its recovery tree.

The factory creates two isolated Simplified Chinese Windows 11 VMs:

- `OPL-V6-WSL2-01`, whose guest writer remains unassigned until a fresh
  Windows-host activation receipt is bound into the immutable packet and exact
  V6 writer lease;
- `OPL-WEBUI-CLEAN-01`, which remains powered off with WebUI runtime authority
  `0` until a separate operation is authorized.

Both guests require `zh-CN` installation media, UI, system and user locale and
TIP `0804:00000804`. Their VHDX, checkpoint, VM ID, switch, NAT, IP, port,
runtime and receipt namespaces must be disjoint.

Fresh host readback and operation-specific authority are required before using
this cohort. Historical E-root requests and leases are evidence only. Exact
request, storage, clean-baseline and lease fields are owned by the adjacent
schemas and fixtures, not copied into a second documentation contract.

## Factory Admission

1. Validate C: capacity, NTFS, Disk 0 GPT/WinRE, released F:, zero new Weston
   crash dumps during a bounded observation, official zh-CN ISO identity, and
   copy/hash parity with `windows-platform-post-resize-gate.schema.json`. The
   same receipt binds canonical main/source/delivery commit and tree identities,
   packet manifest SHA256, authenticated and anonymous raw parity, and the
   absorption-audit receipt.
2. Run the storage probe exactly once. An unknown result permits only read-only
   reconciliation, never a second mutation.
3. Use `fixtures/New-OPLWindowsVMRequest.ps1` to create fresh C-root requests
   bound to the current App acceptance, delivery, manifest, post-resize gate and
   storage-probe receipts. E-root requests and old request SHA256 values fail
   closed.
4. Create each VM exactly once. A media-attached checkpoint is only a factory
   checkpoint and cannot satisfy clean baseline admission.
5. After interactive OOBE and guest readback, seal a powered-off
   `OPL-Clean-Windows-zh-CN-*` checkpoint. The attestation binds the same VM UUID,
   configuration path, full VHDX chain, checkpoint, zh-CN/TIP receipt and
   isolated switch/NAT identity.
6. Grant the generic platform lease, then the exact V6 writer lease. The V6
   lease binds the fresh request, delivery, frozen acceptance, manifest, C-root
   paths, powered-off VM identity and clean attestation. It authorizes exactly
   build seal, fixture phase transition, visible smoke and soft shutdown.

## V6 Closeout

The V6 executor performs stopped, running and restart-persistence phases under
one active lease. The final host closeout requires the same VM to be powered
off and records operation-owned process, listener and writer counts as zero.
The independent verdict owner consumes those receipts but does not operate the
VM.

The [V6 runbook](../windows-wsl2/windows-wsl2-v6-execution-runbook.md) owns guest
execution and terminal host closeout. A V6 diagnostic verdict is not current
Windows desktop product acceptance.

After verdict, terminal platform evidence must bind the canonical remote main
commit/tree, authenticated and anonymous raw parity, absorption audit, task-ref
cleanup, released lease, zero ownerless/duplicate writers and both VMs powered
off. At `stage=terminal_closeout`, task worktree, local task branch and remote
task branch removal must all be true and `remaining_source_cleanup_count` must
be zero. VM retention follows the product contract; it is not treated as a Git
development artifact. E: cleanup remains a proposal until C: parity and all
recovery obligations are closed.

## Updater Qualification

The current Windows updater qualification entry is
[`windows-updater-upgrade-vm-preflight.yml`](../../../../.github/workflows/windows-updater-upgrade-vm-preflight.yml).
Its policy is owned by
[`app-release-channel.json`](../../../../contracts/app-release-channel.json),
under `release_platform_matrix.desktop_platform_additive_follower.windows_x64_updater_assets.upgrade_vm_qualification`.
It reuses the platform lease and clean-VM attestation authority; it does not
derive qualification from the old V6 status-only candidate.

[`windows-updater-upgrade-vm-dry-run-receipt.schema.json`](windows-updater-upgrade-vm-dry-run-receipt.schema.json)
defines preflight evidence. Dry-run admission is not an executed upgrade or an
installed acceptance result. The workflow and its validator define current
inputs and the explicit execution gate.
