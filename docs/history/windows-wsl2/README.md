# Early Windows WSL2 Experiments

Owner: `one-person-lab-app`
Purpose: retain diagnostic evidence from the July 2026 pre-product experiments.
State: historical; not current implementation or acceptance.

These receipts preserve their original dates, inputs and bounded observations.
Their next-step statements describe that historical cohort, not current work.
They explain the early managed ACP artifact failure, authentication-bootstrap
boundary and process-cleanup evidence; the current Windows execution contract
and source have since superseded the exploration plan. Retired procedures are
available in Git history and are not runnable alternatives in this directory.

| Receipt | Diagnostic use |
| --- | --- |
| [V0 host preflight](2026-07-24-v0-local-vm-host-preflight.md) | Identifies the original VMware/Windows/WSL environment. |
| [V1 launcher viability](2026-07-24-v1-wsl-launcher-viability.md) | Binds exact component bytes to the failed managed ACP materialization and successful direct probes. |
| [V2 authentication and process ownership](2026-07-24-v2-auth-process-ownership.md) | Distinguishes the observed upstream bootstrap response from tested cancellation and survivor behavior. |
| [V3 independent routes](2026-07-24-v3-independent-route-coverage.md) | Records partial direct route coverage without claiming common executor binding or unrecorded cleanup. |

For current behavior see the [Windows execution reference](../../architecture/windows-wsl2-execution.md).
