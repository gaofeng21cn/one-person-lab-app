# App Testing

Owner: `one-person-lab-app`
Purpose: `validation_command_selection`
State: `active`
Machine boundary: Test implementations, contracts and their outputs are executable truth.

Choose the smallest lane that exercises the changed owner. Tests do not carry
product design, release policy or a permanent evidence ledger.

## Source And Shell Checks

| Change | Entry | Evidence scope |
| --- | --- | --- |
| App wrappers or contracts | `npm test` | TypeScript, model policy, App-root boundary and isolated Shell-materialization fixtures; no Shell install required. |
| App/Shell contract projection | `npm run test:smoke` | Fast cross-repository structural validation against the configured active Shell. |
| Active Shell behavior | `npm run test:full` | App-selected Shell Vitest suites in isolated sequential node/DOM chunks. |
| Packaged GUI compilation | `npm run validate:gui-shell` | Full active Shell validation, App payload sync and Electron compilation. |
| GUI definition/adapter | `npm run validate:gui-design-system` | Machine contracts and declared asset/path integrity. |
| Runtime projection | `npm run test:runtime-route` | Core dynamic Agent Runtime contract and focused consumer checks. |
| Release contracts/workflows | `npm run test:release-boundary` | Boundary validator plus independent release test files. |
| Studio candidate | `npm run test:candidate:studio` | Explicit candidate contract and source checks; no adoption claim. |
| Documentation rendering | `npm run docs:publishing-templates`, relevant `docs:*` builder | Template, asset and rendered artifact integrity. |

`npm run validate:shell-candidates` without a candidate validates the role
registry only. Detailed candidate checks stay explicit. `npm run test:e2e`,
`test:opl-first-run-vm` and `test:opl-first-run-vm:tart` are separate lanes and
do not run behind ordinary `npm test`.

App contracts define page states and first-run cases in
`contracts/app-page-state-matrix.json` and
`contracts/app-first-run-test-matrix.json`. Consumer behavior should be checked
in the actual Shell. Avoid tests that only freeze prose, headings, forbidden
words or historical completion lists; those cannot establish semantic truth.

## Release And Installed Evidence

The [release guide](../delivery/release/README.md) owns gate membership and
operations. Select VM, packaged-runtime and public readback lanes from the
current release contract for the exact delivery. A generic claim that every
VM lane is optional or mandatory is insufficient.

| Artifact | Entry |
| --- | --- |
| Local release assets/updater metadata | `npm run validate-release -- <asset-directory>` |
| Cohort evidence manifest | `npm run release:evidence:manifest -- --bundle-dir <directory>` |
| Cohort evidence validation | `npm run release:evidence:validate -- --bundle-dir <directory>` |
| Docker/WebUI qualification | [Smoke gates](../delivery/install/docker-webui-smoke-gates.md) |
| Windows WSL2 qualification | [Validation scope](../delivery/validation/windows-wsl2/validation-scope.md) |

Evidence collectors are explicit release operations and can call live owners.
Review their action flags and requested source cohort before running them.
Missing artifacts remain `missing`, `typed_blocker` or `not_applicable` according
to the evidence schema; allowing a missing-evidence report does not close a gate.
Screenshots, contract tests and local compile results cannot replace installed,
public or domain-owner readback.

## Maintenance

`npm run hygiene:fallow -- --format json --summary` scopes analysis to App-owned
wrappers/contracts/docs and excludes external Shell checkouts. Run Shell hygiene
at its owner. Advisory source-size and maintenance budgets stay in explicit
maintenance lanes, not ordinary development or release qualification.

Rerun affected checks after a relevant change or failure. Do not rerun unrelated
heavy suites merely to make a documentation edit appear more thoroughly tested.
