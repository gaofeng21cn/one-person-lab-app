# App Testing

Owner: `one-person-lab-app`
Purpose: `app_testing_docs`
State: `active`
Machine boundary: Human-readable testing guide. Test code, contracts, and
artifacts are the executable truth.

This directory is the App testing entry point. It orients maintainers to the
smallest relevant validation command, explicit release/VM lanes, and evidence
classification. It does not own release policy, public docs, product design, or
historical provenance:

| Neighbor docs owner | Use for | Boundary |
| --- | --- | --- |
| [`../site/`](../site/) | Latest generated user-readable guide and whitepaper outputs | Public docs are not release/readiness proof |
| [`../product/`](../product/) | App/workbench/product shell design and GUI support | Product acceptance stays in contracts, page-state matrices, shell validation, source, and tests |
| [`../delivery/`](../delivery/) | Release, artifact/package/export, user-guide generation source, screenshots, and verification | Release truth stays in assets, updater metadata, evidence manifests, workflows, validators, CI/logs, and release-boundary tests |
| [`../history/`](../history/) | Retired routes, candidate replay provenance, and process history | Historical only |

## Pull Request Flow

Use the shortest feedback loop that still leaves a reproducible remote record:

```text
fresh origin/main
  -> local preflight and focused tests
  -> PR / merge gate (GitHub-hosted, required)
  -> optional Codex advisory review
  -> administrator merges the PR
  -> fetch origin/main and read back the canonical commit
  -> run release workflows separately
```

`PR / merge gate` is the single required branch-protection context for this
single-maintainer repository. It runs read-only quality checks on GitHub-hosted
Ubuntu and does not dispatch releases, mutate publication state, or require a
self-hosted runner. Codex review remains useful for finding issues, but its
pending or unavailable state does not block a merge.

Tart, clean VM, Hyper-V, and WSL2 checks are optional post-publication
certification lanes. They report `passed`, `failed`, `not_run`, or `unavailable`
against the published bytes and must not be added to this PR merge gate.

## Active Shell Checks

```bash
bun install --cwd shells/aionui --frozen-lockfile
bun run --cwd shells/aionui i18n:types
cd shells/aionui && node scripts/check-i18n.js
npm run test:smoke
npm run test:full
bun run --cwd shells/aionui lint
bun run --cwd shells/aionui validate:opl-package
npm run validate:gui-shell
```

`npm test` and `npm run test:smoke` are the default App development test path.
They run the App-owned active-shell quick validator only; this catches contract,
page-state, product-profile, release-channel, and active shell structural drift
without running the full shell Vitest portfolio.

`npm run test:full` is the App-level full active-shell Vitest runner. It reads
`contracts/app-shell-adapter.json`, enumerates the active shell Vitest suites,
and runs them as isolated sequential `node` / `dom` chunks. The active-shell
validation contract uses this explicit full entry so `validate:gui-shell` and
`scripts/verify.sh full` keep their terminal evidence even though `npm test` is
lighter. The upstream shell entrypoint remains available as
`bun run --cwd shells/aionui test` for direct AionUI intake work.

`validate:gui-shell` is the App-root gate for active shell health plus GUI
compile evidence. It runs the full active shell validation list from
`contracts/app-shell-adapter.json`, syncs App-owned release payloads into the
active shell, and compiles the Electron main, preload, and renderer bundles
through the shell `bun run package` entry.

## Shell Alternative Checks

```bash
npm run validate:shell-candidates
npm run test:candidate:native
npm run validate:candidate:hermes
npm run validate:candidate:agui
```

The command without `--candidate` validates only the fixed role registry:
`active=aionui`, `foreground=opl-native-workbench`, `retained=hermes-codex`, and
`archived=agui-codex`. It intentionally does not read candidate implementation
detail, build a candidate, or turn dormant candidate drift into an AionUI/full/
release blocker.

Native remains the only full foreground-candidate contract and evidence path.
Its optional focused test lives under `tests/optional/` and runs only through
`test:candidate:native`. Hermes and AGUI are role tombstones in the active
registry; their explicit checks consume adapter and replay-runbook truth.
Hermes package/smoke replay additionally requires
`--run-candidate-commands --manual-reference-replay`. None of these commands
proves active-shell adoption, Pixel, Install, Release, or owner acceptance.

## App-Level Checks

```bash
node --experimental-strip-types scripts/validate-active-shell.ts --quick
npm run validate:app-root-boundary
npm run test:release-boundary
node --experimental-strip-types scripts/collect-release-evidence.ts --bundle-dir release-evidence/<version> --action-id <framework-action-id> --execute-action --overwrite --evidence-source-dir artifacts/opl-first-run-vm
npm run release:evidence:manifest -- --bundle-dir release-evidence/<version> --overwrite
npm run release:evidence:validate -- --bundle-dir release-evidence/<version>
npm run test:runtime-route
node --experimental-strip-types scripts/collect-release-evidence.ts --bundle-dir release-evidence/<version> --overwrite --artifact runtime_screenshot=/path/to/runtime.png --require-conditional runtime_screenshot
node --experimental-strip-types scripts/prepare-release-assets.ts build-artifacts release-assets
node --experimental-strip-types scripts/validate-release.ts release-assets
npm run hygiene:fallow -- --format json --summary
```

The App page-state matrix is declared in
`contracts/app-page-state-matrix.json`. The first-run matrix is declared in
`contracts/app-first-run-test-matrix.json`.
The App GUI product contract is declared in
`contracts/app-gui-product-contract.json`; `validate-active-shell.ts --quick`
checks the Codex CLI fixed executor, purpose-first Research/Grant/Presentation/Book
home entries routed to MAS/MAG/RCA/BookForge, hidden home-path executor/provider
selectors with visible App-owned model/reasoning and user-language permission/access
controls, home prompt, App-owned ordinary Settings navigation for Overview,
the seven groups Overview, Account & Models, Connections & Deployment, Workspace,
Agents & Capabilities, Runtime & Maintenance, and Preferences over all ten carrier
routes and second-level destinations, with About
as the only secondary page and Advanced/Update/Theme/Local Services/Personalization
as compatibility redirects, module path source explanation, Stable/Canary release
gating plus scheduled Nightly Standard publication and historical read compatibility, MDS non-default display, and
OPL Flow context before shell validation runs.
The App product profile is declared in
`contracts/app-product-profile.json`; `validate-active-shell.ts --quick` and
`npm run test:release-boundary` verify that the profile still owns only
desktop product defaults and still excludes runtime/provider/domain authority.

`npm run test:release-boundary` is the complete local release-boundary entry:
it runs the App-owned boundary validator once, then executes the independent
case files with a fixed concurrency of four. Case files remain isolated and
named by behavior; do not restore a single import aggregator, because that
serializes the suite and hides file-level ownership. The `release-boundary`
verify lane delegates to this entry instead of running the validator twice.
The App install/exposure policy is declared in
`contracts/app-install-exposure-policy.json`; `validate-active-shell.ts --quick`
verifies that `skill` remains the public semantic ABI, MAS/MAG/RCA stay
plugin-visible domain routes rather than companion skill mirrors, OPL Meta
Agent stays an OPL-generated surface outside the default home path, and all
installer surfaces use the shared first-run progress model.
`npm run test:runtime-route` is the explicit optional-route gate. It verifies the Runtime page matrix and the minimal project-status path: Agent ->
Project scope, one row per canonical Work Item, user-facing status, running and
elapsed state, current and total Token usage, Stage order, current/next Stage,
current Attempt, locale-aware next-step/owner text, responsive layout, and
archive/restore with authoritative refresh/readback. It also rejects provider or
platform repair, software update, module/agent health, raw diagnostics, State
Index, operator drilldown, safe-action catalogs, artifact provenance, release
evidence controls, direct SQLite access, domain truth, owner-receipt authority,
artifact bodies, artifact authority, and domain/readiness verdict claims on the
Runtime surface. Maintenance, Agents, Capabilities, Inspector, and
release-tooling tests verify their respective owner surfaces; Advanced is tested
only as a redirect to Maintenance diagnostics. Default active-shell and release
gates retain the Framework producer/authority checks but do not require the
X0-01 route or its page-level display contract.
P1b App tests prove only the projection-gated optional-resource contract. Active
AionUI must separately prove workspace-only, external-only, and empty projection
rendering in Shell source/DOM tests before the Source axis can become implemented.

Release evidence bundle validation requires `evidence-manifest.json` plus the
contracted artifact files. When a local lane cannot produce clean VM smoke
summaries, remote Release verification, OPL runtime JSON, or screenshots, the
manifest must mark those entries as `missing`; `--allow-missing-evidence` then
validates the gap report without treating it as packaged App evidence.
`collect-release-evidence.ts` can fill the OPL runtime JSON and selected
Framework-action dry-run/execute artifacts from the live Framework CLI and runs
that same missing-evidence validation before reporting collection success. This
is release-tooling behavior, not a Runtime-page action path. It can
also import standard packaged/VM/remote smoke outputs with
`--evidence-source-dir <dir>` and attach explicit overrides with repeated
`--artifact <artifact_id>=<source_path>` flags. Explicit artifact mappings take
precedence over source-dir discovery. Every imported file is copied into the
contract path and then validated through the release evidence bundle validator
instead of trusting its original path.
The Runtime page screenshot is conditional: require it only for an explicit
Runtime-route evidence request with `--require-conditional runtime_screenshot`
or `OPL_RELEASE_EVIDENCE_REQUIRED_CONDITIONALS=runtime_screenshot`.

`hygiene:fallow` is scoped to App-owned root wrappers, contracts, and docs.
`.fallowrc.json` excludes the ignored `shells/aionui/**` external checkout so
App hygiene does not report shell-owned dependency or source findings. It is
not GUI shell build or runtime evidence; use `npm run validate:gui-shell` for
active shell validation and GUI compile proof. Run shell hygiene in the
`gaofeng21cn/opl-aion-shell` repository.

Line-budget or Sentrux checks are scheduled maintenance signals for daily or
strict hygiene lanes. They must not be added to ordinary App development gates,
default smoke checks, active-shell validation, package smoke, or release-boundary
validation. If a maintenance lane needs hard enforcement, keep it explicit and
separately named so normal feature, docs, and release-boundary work is not
blocked by advisory source-size budgeting.

DOM-heavy, E2E, packaged-runtime, and VM checks stay on explicit lanes:
`npm run test:full`, `npm run test:e2e`, `npm run test:opl-first-run-vm`,
`npm run test:opl-first-run-vm:tart`, release evidence validation, and release
workflow gates. Do not move those lanes behind default `npm test` or
`scripts/verify.sh smoke`; use them when the change touches renderer behavior,
packaging, release evidence, or clean-install acceptance.

## Installed App Smoke

After a standard macOS build, run the packaged GUI smoke against the built DMG
and write a fresh artifact directory for the release cohort under review:

```bash
node shells/aionui/scripts/opl-first-run-vm-smoke.mjs \
  --dmg shells/aionui/out/One-Person-Lab-<version>-mac-arm64.dmg \
  --artifacts artifacts/opl-installed-smoke-<stamp> \
  --timeout-ms 180000 \
  --settings-smoke \
  --assistant-route-smoke
```

Treat this as cohort-bound installed-App evidence. The smoke output can support
release review only when the same cohort also has the contracted manifests,
screenshots, VM summaries, remote verification, and release evidence bundle
classification. Older local installed-smoke transcripts and absolute artifact
paths are history/provenance, not current release proof; the old local-smoke
examples are compressed under
`docs/history/process/retired-surface-provenance.md`.

## Release Validation Matrix

This file lists the testing entry points. Release policy, gate membership,
Homebrew sequencing, Full first-install scope, VM profiles, release notes,
candidate records, and promotion rules are owned by
[`docs/delivery/release/README.md`](../delivery/release/README.md),
`contracts/app-release-channel.json`, release workflows, release validators, and
release-boundary tests.

| Surface | Testing entry point | What it proves |
| --- | --- | --- |
| Contract and release-boundary gates | `npm run test:release-boundary` | Runs the App-owned boundary validator once, then checks contracts, workflow shape, release evidence policy, updater/Full separation, and release-note rules in parallel case files. |
| App-owned release boundary only | `npm run validate:release-boundary` | Runs only the workflow/script/asset/contract validator when a focused boundary readback is needed. |
| Standard release assets | `node --experimental-strip-types scripts/validate-release.ts release-assets` | Local release assets and updater metadata have the expected App shape before publish. |
| Active GUI shell validation | `npm run validate:gui-shell` | App-owned product profile and release payload sync into the active shell, and the shell validates/compiles through the App wrapper. |
| Full first-install package | `npm run release:full -- --version <version>` | The Full package builder can assemble declared runtime payloads and manifests for the selected cohort. |
| Evidence bundle | `npm run release:evidence:manifest` and `npm run release:evidence:validate` | The current cohort's artifacts are classified as `present`, `missing`, `typed_blocker`, or `not_applicable`; only bundles with every required and explicitly requested conditional artifact present become packaged App evidence. |
| Root wrapper hygiene | `npm run hygiene:fallow -- --format json --summary` | App-root wrappers, contracts, and docs are free of scoped production hygiene findings; this is not shell build or release evidence. |

Stable, Canary validation, refresh, Homebrew, Full, WebUI, one-shot installer,
VM smoke, and promote flows use different release profiles. Public Nightly is a
schedule-only opt-in Standard prerelease and not an in-App channel selector;
historical artifacts retain read compatibility. Treat the release guide and contract as the SSOT for
those profiles; this testing guide should not duplicate their full workflow policy.

Docker/WebUI smoke gate commands, artifact readback, and typed blocker
boundaries are maintained in
[`../delivery/install/docker-webui-smoke-gates.md`](../delivery/install/docker-webui-smoke-gates.md).
This testing guide only routes maintainers to that verification support surface.

## Release Cohort Evidence Boundary

Release evidence is current only for the named App cohort that produced it.
Remote verification, VM smoke, screenshots, assistant route smoke,
`release-readiness-summary.json`, `release-candidate-record.json`, Homebrew VM
summaries, Docker/WebUI smoke, Full diagnostics, telemetry, and release notes are
release artifacts or CI outputs, not durable truth in this testing guide.

Local testing lanes can validate shape and collect partial evidence. When a lane
cannot produce clean VM summaries, screenshots, remote verification, or packaged
route receipts, leave the artifact classified as `missing`, `typed_blocker`, or
`not_applicable`. `--allow-missing-evidence` reports those gaps only; it does not
prove App release readiness, Stable/latest promotion, Full clean-machine
installability, domain readiness, or family production readiness.

Deterministic VM automation is an optional post-publication installed-App
certification lane. Codex App, Computer Use, and Codex CLI AI self-checks are
diagnostic or exploratory until their findings are converted into contract,
workflow, VM, Playwright, shell, or release-boundary tests.
