# Windows WSL2 Diagnostic Validation

Owner: `one-person-lab-app`
Purpose: route the retained V6 diagnostic fixture and its evidence.
State: maintained validation fixture; separate from current product acceptance.

| Reader question | Owner |
| --- | --- |
| How does the current desktop execute on Windows? | [Windows execution reference](../../../architecture/windows-wsl2-execution.md) |
| What does this diagnostic candidate prove? | [V6 validation scope](validation-scope.md) |
| How is an exact V6 run executed and closed? | [Execution runbook](windows-wsl2-v6-execution-runbook.md) |
| Where are VM admission and platform tools defined? | [Windows platform validation](../windows-platform/README.md) |
| What did the original V0-V3 experiments observe? | [Frozen experiment receipts](../../../history/windows-wsl2/README.md) |

## Executable Evidence Owners

`fixtures/v6-materialize-intake.mjs` owns packet materialization and frozen
source selection. `v6-build-seal.ps1` seals a particular Windows build;
`v6-electron-visible-smoke.ps1` records the interactive guest result;
`v6-host-closeout.mjs` validates the evidence joins and terminal host state.
Current runs obtain exact identities from these artifacts, not a copied SHA
table or a historical task's status.

| Evidence | Schema |
| --- | --- |
| Intake packet | [Intake manifest](windows-wsl2-v6-intake-manifest.schema.json) |
| Built artifact | [Build seal](windows-wsl2-v6-build-seal.schema.json) |
| Guest write authority | [Writer lease](windows-wsl2-v6-writer-lease.schema.json) |
| Guest visible smoke | [Guest receipt](windows-wsl2-v6-receipt.schema.json) |
| Terminal host result | [Host closeout](windows-wsl2-v6-host-closeout.schema.json) |

The retired V1-V3 probes are retained only in Git history. Their frozen
receipts remain diagnostic records, not current product tests. New exact-run
receipts belong in the operation's evidence output; this index does not track
live executor assignment or completion.
