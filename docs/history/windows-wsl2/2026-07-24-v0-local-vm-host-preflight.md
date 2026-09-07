# Windows WSL2 Validation Receipt: V0 Local VM Host Preflight

Validation run ID: `20260724-v0-local-vm-host-preflight`
State: `guest_readback_complete`
Lane: `validation_only_non_binding`
Date: `2026-07-24`
Archive context: [Early Windows WSL2 experiments](README.md).

## Scope

This run covered host and guest preflight. It did not install a new
distribution, change Windows policy, mutate an existing WSL distribution, or
run App/Shell execution routes.

## Host Evidence

- Hypervisor: VMware Fusion `26.0.0` build `25388279`
- VM: `OPL Windows 11 Clean Chinese.vmwarevm`
- Canonical VM path:
  `/Users/gaofeng/Virtual Machines.localized/OPL Windows 11 Clean Chinese.vmwarevm/OPL Windows 11 Clean Chinese.vmx`
- Guest declaration: `windows11-64`
- vCPU: `4`
- Memory: `32768 MiB`
- Nested virtualization: `vhv.enable=TRUE`
- Network: VMware NAT (`vmnet8`)
- Shared folder: read/write `one-person-lab-app`
- VMware Tools: running, guest toolbox `13.1.0.0.25218885`
- Guest IP reported by VMware Tools: `172.16.255.128`

## Guest Readback

- Guest identity: `OPL-WIN-CLEAN\oplrunner`
- Guest architecture: `AMD64`
- Windows kernel build: `10.0.26200.8875`
- Windows product API label: `Windows 10 Pro`, version `2009`
- Hypervisor declaration remains `windows11-64`; the product/build naming
  mismatch is recorded for later V0 classification and is not treated as a
  Windows 11 support claim.
- WSL default distribution: `docker-desktop`
- WSL default version: `2`
- WSL package version: `2.7.10.0`
- WSL distribution list: only `docker-desktop`, state `Stopped`, version `2`
- Windows-side `codex` command: not found
- Windows-side `opl` command: not found

## Source Context

- App validation branch base:
  `b8e8e71e23a8e4e5e48452730cb9c1f43b03f5b7`
- App remote `main` observed during V0/V1 setup:
  `674227224c342974929448e67de654c937b32d1e`
- Shell remote `main` observed during V0/V1 setup:
  `984959fc92799dfcb08541b93ec23eb7a99cb494`
- Framework was not executed in V0; its exact V1 test input is recorded in the
  V1 receipt.

## Readback

Authorized disposable guest access was used. No credential value or
authentication transcript is stored in repository evidence.

The separate documented Windows SSH endpoint remains unavailable from this
host. No password reset, offline registry edit, or VM disk mutation was
attempted.

## Cleanup

The VM was stopped after the guest readback completed. No product source,
contract, release workflow, or active gap plan was changed by the validation
attempt. The only persisted changes are this receipt and the linked
validation-boundary documentation.

## Next Safe Step

V0 is complete. V1 has been attempted in the disposable
`OPL-Validation-g0001` fixture and is tracked by the adjacent V1 receipt.
V2-V5 remain unattempted and non-blocking; unrelated development remains
unblocked.
