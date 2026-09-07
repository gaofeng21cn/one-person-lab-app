# v26.7.12 Release Overrun

Historical incident: Codex task `019f51aa-a718-7471-8d4b-5656e18d90d2`
started the release at `2026-07-12 00:32:27 +0800` with a 90-minute budget and
remained active for roughly 18 hours. This record retains the failure mechanism,
not the retired controller or an executable recovery recipe.

VM diagnostics reused a Standard DMG while changing the Shell smoke contract
and expected source refs. The resulting cross-cohort failures caused repeated
patches and VM runs. A separate Full failure selected a broken Standard runtime
root instead of the packaged Full runtime and surfaced as `package_not_installed`.
Polling could not repair that route selection.

Full build `29211495991` produced a DMG, but VM run `29212234534` did not complete
its selected-capability/composer acceptance. Standard publication therefore did
not justify publishing those Full bytes as qualified. The report also exposed
unbounded workflow dispatch, repeated passed gates and oversized job summaries.

The durable lessons are to freeze candidate identity, pair verifier and artifact
cohorts, diagnose the first real failure, reuse unchanged qualified bytes, and
keep bounded summaries separate from full artifacts. The historical
`release:stable` state machine and raw `desktop-release.yml` invocation have
been retired; current commands and recovery are owned by the
[release guide](../../delivery/release/README.md) and App release contracts.
