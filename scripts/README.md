# App Root Scripts

The root `scripts/` directory exposes App-level wrappers. The active Electron
shell implementation is checked out from `gaofeng21cn/opl-aion-shell` and
exposes its shell-specific helpers under `shells/aionui/scripts/`.
By default wrappers read `contracts/app-shell-adapter.json`. AionUI is the
active GUI carrier, `opl-native-workbench` is the foreground alternative,
Hermes Desktop / `hermes-codex` is a retained reference candidate, and
AGUI / `agui-codex` is archived technical proof rather than a routine
implementation, validation, or polish lane. Source-only technical validation
can select a different linked shell repo with
`OPL_APP_SHELL_ADAPTER_CONTRACT=contracts/shell-adapters/<candidate>.json`;
Hermes full candidate command execution additionally requires
`--manual-reference-replay` and an actual development need. AGUI selection
should happen only when AGUI replay is explicitly requested.

| Script | Purpose |
| --- | --- |
| `ensure-active-shell.ts` | Clones or validates the selected external shell checkout, defaulting to `shells/aionui`. |
| `gui-launcher.ts` | Opens the installed AionUI mainline by default or the isolated Native Candidate for one local run. Candidate launches receive exact OPL/Codex Runtime identity and default to dry-run-only actions; the launcher never changes release adoption or updater state. |
| `verify.sh` | App-root verification wrapper for smoke, active-shell, release-boundary, candidate-shell, structure, and full lanes without running release packaging by default. |
| `validate-active-shell.ts` | Validates the selected shell adapter contract and runs selected validation commands. |
| `validate-runtime-route.ts` | Explicitly validates the core dynamic Agent Runtime route, including its product contract, page-state matrix, generic typed-view envelope, and required Framework producer. Runtime is required for an adopted shell, while Stable release admission remains independently scoped. |
| `validate-shell-candidates.ts` | Validates only the fixed active/foreground/retained/archived role registry by default. `--candidate opl-native-workbench` enables Native detail validation; Hermes and AGUI remain role tombstones whose explicit validation/replay detail is owned by their adapters and runbooks. Hermes command execution requires `--manual-reference-replay` for an actual technical-verification need. |
| `validate-gui-design-system.ts` | Validates the three-layer GUI definition stack, the 16-scene Codex visual reference cohort, exact mask/pixel/review semantics, shell roles, ideal/native versus active AionUI state markers, profile-owned model defaults, and the non-release evidence boundary. It fails closed when foundation docs or cohort bindings are absent and never promotes docs or visual QA into installed or release readiness. |
| `app-product-profile.ts` | Projects the exact App product profile and App-owned Official Profile apply helper into the selected shell. `--check` rejects profile or helper byte drift so Standard and Full cannot acquire separate root lists or helper behavior. |
| `validate-shell-product-profile-consumer.ts` | Projects the current App profile into a temporary archive of the exact clean Shell commit and runs the real Shell consumer test without writing the source Shell checkout. |
| `release-dispatch-guard.ts` | Performs bounded Git-wire cohort identity and one structured owner workflow-runs query before nonce consumption or after a single dispatch; it has no mutation command. |
| `official-profile-package-apply.ts` | Applies the shared Official Profile only for `first_install` or `explicit_restore`. It reads the generic fast App-state projection, invokes only each root's opaque projected action through `opl app action execute`, and requires fresh root plus required-closure readback. It owns no Package action allowlist, carrier selection, desired-state file, lock, payload store, lifecycle receipt, LKG, or rollback. |
| `prepare-release-assets.ts` | Calls the active shell release asset normalizer from the App root. |
| `validate-release.ts` | Verifies release assets and enforces that standard updater metadata excludes Full first-install assets. |
| `write-opl-app-component-manifest.ts` | Writes the App-owned Standard artifact manifest with its actual source commit and asset digests. This is artifact evidence, not a Package composition authority or installation prerequisite. |
| `read-opl-app-component-manifest-identity.ts` | Reads back the exact published App manifest identity, verifies Stable/Preview, Manual/Automated, derived Dev/Nightly, source/tag/version/digest, and pointer-policy agreement, while retaining a bounded legacy Stable compatibility path. |
| `release-bundle.ts` | Reads the retired App-owned Bundle projection for historical receipt compatibility. It can assemble, verify, or report those records, but cannot admit, build, publish, promote, dispatch, or claim readiness for a live release. |
| `framework-release-adapter.ts` | Adapts App product inputs and exact asset/qualification evidence to the Framework `opl release` ABI. Framework checkpoint state remains authoritative; the adapter does not create an App session, broker ledger, or second release state machine. |
| `verify-remote-release-assets.ts` | Downloads GitHub Release assets and verifies remote size, sha256 digest, updater metadata, Full manifest, Full README language, Full checksums, and Full size budgets. |
| `generate-release-notes.ts` | Builds Stable release-note evidence and deterministic template notes for the LLM writer. Stable compares with the previous Stable release, release names use `One Person Lab v<version>`, and the public body leads with user scenarios, upgrade value, and action items. Commit logs, refs, workflow facts, changelog details, OPL-family changes, and Full payload versions stay in Technical details or evidence artifacts unless they are directly user-visible. Stable publish/promote consumes prepared AI-written notes and must not call AI on the critical path; template output is dry-run/diagnostic only. Nightly uses its own fixed scope-and-risk disclosure. |
| `resolve-preview-release-request.ts` | Freezes one Manual Standard Dev Preview or exact recovery request, immutable App/Shell/Framework identity, qualification disclosure, and whether a separate protected Latest override must be admitted. |
| `resolve-nightly-release-request.ts` | Freezes one scheduled Standard-only Automated Preview request, exact App/Shell/Framework SHAs, same-day revision, and default `make_latest=false`/non-Full/non-WebUI authority. |
| `nightly-release-qualification.ts` | Verifies the exact shared-build Standard asset set and cohort without claiming Stable qualification or requiring the Stable heavy VM gate. |
| `nightly-release-publisher.ts` | Publishes or read-reconciles one immutable GitHub prerelease by exact digest; same-name different bytes and unknown mutation outcomes fail closed without retry. |
| `validate-release-quality-promotion.ts` | Verifies that one exact Preview artifact passed the complete direct-Stable gate set and emits a separate `promote_quality` receipt without rewriting its immutable manifest or moving Latest. |
| `write-latest-pointer-override-authority.ts` | Derives one user-explicit, protected, single-use, non-persistent Preview pointer authority from the immutable component manifest and exact expected-current Latest tag. |
| `validate-standard-latest-admission.ts` | Admits the default qualified-Stable Latest takeover or a Standard publisher's same-run Preview override against exact updater predecessors, component identity, pointer authority, CAS, disclosure, and applicable carrier evidence. |
| `validate-standard-publication-input.ts` | Performs read-only deterministic admission of a checkpoint's Standard component manifest, staged asset set, local file identities, and digest/size bindings before public GitHub Release mutation. |
| `validate-latest-pointer-operation.ts` | Separately admits a pointer-only operation for one already-published exact Dev/Nightly Preview by binding the public release inspection, first Actions attempt, immutable deadline, protected authority, expected-current CAS, quality preservation, and required public readback. |
| `cleanup-draft-release-candidates.ts` | Discovers stale `v<version>-draft.*` and `v<version>-readiness.*` draft Releases after the Stable release exists. It is read-only; deleting a Release or tag requires a separately authorized product change outside the live Bundle executor. |
| `cleanup-webui-ghcr-versions.ts` | Dry-runs or deletes stale `one-person-lab-webui` GHCR package versions according to the App release-channel retention policy. |
| `cleanup-local-artifacts.ts` | Dry-runs or deletes local ignored generated output: `tmp/`, `docs/site/latest/`, generated Full runtime payload dirs, and stale top-level `artifacts/*` run directories. It never manages tool state or external shell checkouts. |
| `install-docker-webui.sh` | Linux/macOS Bash entrypoint for starting the Docker/WebUI image with host `/data` and `/projects` mounts through `docker compose`; Ubuntu may install Docker Engine, while macOS only checks for an existing Docker runtime. After compose startup it waits for the local HTTP endpoint and can write a diagnostic directory or `.tar.gz` package without accepting API keys. |
| `install-docker-webui.ps1` | Windows PowerShell one-click Docker/WebUI installer that writes `compose.yaml`, creates persistent `OnePersonLab` data/projects directories, runs `docker compose up`, waits for the local HTTP endpoint, and can write a diagnostic directory or archive without accepting API keys. |
| `docker-webui-smoke-gate.ts` | Repo-native Docker/WebUI smoke gate runner for clean Linux VM, clean Windows VM, existing Docker, and old data-dir gates. It writes a typed blocker when the current host cannot prove the requested gate instead of returning a false pass. |
| `validate-docker-webui-diagnostics.ts` | Validates installer diagnostic directories for required files, data preservation evidence, and secret-like markers. |
| `publish-release.ts` | Retired direct publisher. It only inspects local assets with explicit `--dry-run`; every non-dry invocation returns typed failure before remote inspection or mutation. Live publication belongs to the protected Framework Bundle executor. |
| `plan-release-candidate.ts` | Read-only projection of the exact `standard`, `resume_standard`, and `append_full` Framework operations. It cannot create state, admit, dispatch, or publish. |
| `closeout-release-run.ts` | Reads historical run/session artifacts for diagnostics only. It has no package entrypoint and cannot advance or reconcile live Framework Bundle state. |
| `verify-release-attestations.ts` | Runs `gh attestation verify` for downloaded release assets or OCI refs and writes `opl_release_attestation_verification.v1` for closeout ingestion. It records build-integrity evidence only and does not replace checksum, remote-readback, VM, or owner evidence. |
| `summarize-github-actions-timing.ts` | Profiles one or more `gh run view --json ...jobs` payloads, including multi-run span, failed/canceled run tax, slow jobs, slow steps, and orchestration time outside Actions. |
| `write-actions-cache-plan.ts` | Writes `opl_actions_cache_plan.v2` before Full runtime materialization and `opl_actions_cache_receipt.v2` after cache-save attempts. It binds the exact App/Shell/Framework cohort, the package dependency closure selected for that build, its source fingerprints, the cache-catalog digest, canonical aggregate input, and per-layer key-input digests; receipt generation additionally requires passed runtime currentness and records hit, duration, and save-failure metrics without claiming artifact or release readiness. |
| `plan-release-gate-reuse.ts` | Retired read-only inspector. It always reports zero reuse authority; only Framework checkpoint receipts may decide completed-stage skips. |
| `release-cohort-lock.ts` | Resolves App, shell, and Framework refs into `opl_app_release_cohort_lock.v1` with immutable SHAs. It is a preparation record only and cannot dispatch, publish, promote, claim readiness, or write runtime truth. |
| `plan-release-cohort.ts` | Reads and renders the retired App cohort projection for historical diagnostics. It has no package entrypoint and only hands off to read-only Framework status inspection. |
| `release-operator.ts` | Retained historical session/operator receipt interpreter. It has no package mutation entrypoint and cannot admit, dispatch, rerun, cancel, rebuild, publish, promote, reconcile, or claim readiness for a new Bundle. |
| `summarize-release-readiness.ts` | Aggregates small Stable gate artifacts and job results into `release-readiness-summary.json` and Markdown without downloading large DMG artifacts. |
| `validate-release-candidate-record.ts` | Inspects historical `release-candidate-record.json` bytes. It never returns promotion admission; the old promotion flag fails closed. |
| `analyze-full-package-size.ts` | Reads `full-package-manifest.json` and reports Full runtime component/layer size, budget use, and optional runtime-root top entries. |
| `collect-release-evidence.ts` | Collects live OPL runtime snapshot, App/operator drilldown, selected safe-action dry-run/execute JSON, and standard smoke source-dir artifacts into a release evidence bundle, writes the manifest, and validates the bundle in missing-evidence mode without claiming absent screenshot, VM, settings, or remote evidence. |
| `write-release-evidence-manifest.ts` | Writes `evidence-manifest.json` for a release evidence bundle and marks absent VM/remote artifacts as missing evidence. |
| `validate-release-evidence-bundle.ts` | Validates a release evidence bundle manifest and artifact files, including real screenshot dimensions; default validation fails closed when required evidence is missing. `runtime_screenshot` is conditional and is enforced only with `--require-conditional runtime_screenshot` or the equivalent environment setting. |
| `smoke-hermes-candidate-tart.ts` | Runs the packaged `One Person Lab Hermes Candidate.app` first-run fixture smoke inside a Tart clean VM, copying guest artifacts back to the App repo. This is candidate technical verification only and does not promote Hermes to the release shell. |

Stable App-root npm entries are `verify`, `typecheck`, `validate:release-boundary`,
`validate:gui-design-system`, `validate:gui-shell`, `validate:shell-candidates`,
`test:smoke`, `test:full`, `release:evidence:manifest`,
`release:evidence:validate`, and `hygiene:fallow`. `npm test` aliases the smoke
entry so ordinary development does not run the full active-shell DOM portfolio;
full shell Vitest evidence remains explicit through `npm run test:full`,
`scripts/verify.sh full`, and the active-shell validation contract. These keep
release boundary/evidence scripts visible as production entrypoints while the
files remain thin App-owned wrappers around contracts and release artifacts.
The core Runtime route uses the explicit `validate:runtime-route` and
`test:runtime-route` entries for focused validation. Its product requirement does not by itself make it a Stable release gate.
App-root fallow config excludes
`shells/aionui/**` and `shells/agui-codex/**` because those paths are ignored
external shell checkouts.
`hygiene:fallow` is not GUI shell build or runtime evidence; `validate:gui-shell`
runs the full active shell validation list and the shell GUI compile path
through App wrappers. Run shell hygiene in `gaofeng21cn/opl-aion-shell`.

Release efficiency policy is `build-once/promote-many`: Framework freezes one
immutable Bundle, then local or GitHub executors transfer checkpoints and exact
assets instead of rebuilding. Recovery starts a new bounded `resume_standard`
or `append_full` operation over the same checkpoint; it never reruns a partial
workflow or reconstructs an App session. Full runtime bundle preparation is
OPL Framework-owned and App-consumed through manifest/lock/readback refs.

Docs generation commands read `docs/delivery/user-guides/macos-app-install`
guide sources and write the public bundle under
`docs/site/latest/macos-app-install/`.

Examples:

```bash
npm run gui
npm run gui -- --shell opl-native-workbench
npm run gui -- --shell opl-native-workbench --plan
node --experimental-strip-types scripts/ensure-active-shell.ts
scripts/verify.sh
scripts/verify.sh structure
scripts/verify.sh release-boundary
npm run test:smoke
npm run test:full
node --experimental-strip-types scripts/validate-active-shell.ts --quick
node --experimental-strip-types scripts/validate-active-shell.ts --only i18n_types,i18n_check,typecheck
node --experimental-strip-types scripts/prepare-release-assets.ts build-artifacts release-assets
node --experimental-strip-types scripts/validate-release.ts release-assets
npm run release:version:validate -- --channel stable --version <YY.M.D>
# Nightly source/qualification diagnostics; the scheduled protected workflow owns publication.
npm run release:version:validate -- --channel nightly --version <YY.M.D-nightly-or-YY.M.D-nightly.r1>
npm run release:nightly-version:resolve -- --base-version <YY.M.D-nightly> --existing-ref-file <path>
npm run release:notes -- --version <version> --channel stable --include-full-package
npm run release:notes -- --version <YY.M.D-nightly-or-rebuild> --channel nightly
npm run verify-remote-release -- --version <version> --include-full-package
npm run verify-remote-release -- --version <YY.M.D-nightly-or-rebuild>
npm run release:cleanup-drafts -- --version <version>
npm run release:cleanup-webui-ghcr -- --summary-path webui-ghcr-cleanup.json
npm run release:cleanup-webui-ghcr -- --rollback-tag <version> --execute
npm run cleanup:local-artifacts
npm run cleanup:local-artifacts -- --execute
npm run cleanup:local-artifacts -- --scope artifacts --keep-days 0 --execute
npm run validate:release-boundary
npm run validate:gui-design-system
npm run release:evidence:manifest -- --bundle-dir release-evidence/<version>
node --experimental-strip-types scripts/collect-release-evidence.ts --bundle-dir release-evidence/<version> --action-id <framework-action-id> --execute-action --overwrite --evidence-source-dir artifacts/opl-first-run-vm
npm run release:evidence:validate -- --bundle-dir release-evidence/<version>
npm run test:runtime-route
node --experimental-strip-types scripts/collect-release-evidence.ts --bundle-dir release-evidence/<version> --overwrite --artifact runtime_screenshot=/path/to/runtime.png --require-conditional runtime_screenshot
npm run hygiene:fallow -- --format json --summary
npm run validate:gui-shell
npm run validate:shell-candidates
npm run test:candidate:native
npm run validate:shell-candidates -- --candidate opl-native-workbench --run-candidate-commands
OPL_APP_SHELL_ADAPTER_CONTRACT=contracts/shell-adapters/opl-native-workbench.json npm run package
# Prior Hermes reference only:
npm run validate:candidate:hermes
# Manual packaged replay only when an actual Hermes development task requires it:
npm run validate:shell-candidates -- --candidate hermes-codex --run-candidate-commands --manual-reference-replay
# Explicit AGUI replay only:
npm run validate:candidate:agui
OPL_APP_SHELL_ADAPTER_CONTRACT=contracts/shell-adapters/agui-codex.json npm run package
npm run smoke:hermes-candidate:tart -- --no-graphics --artifacts artifacts/hermes-candidate-tart-<timestamp> --timeout-ms 600000
npm --prefix shells/hermes run smoke:settings-visual -- --allow-foreground --out out/smoke-settings-visual
npm run release:framework-adapter -- freeze-request --channel stable --version <version> --updater-version <updater-version> --app-root <app-checkout> --shell-root <shell-checkout> --framework-root <framework-checkout> --notes <prepared-notes.md> --notes-evidence <notes-evidence.json> --include-full-package false --package-compatibility-abi opl_packages.v1 --package-compatibility-version-range '>=1 <2' --source-cutoff-observed-at <iso8601> --base-image-index <base-image-index.json> --codex-npm-metadata <codex-npm-metadata.json> --output freeze-request.json
opl release freeze --request freeze-request.json --source-root <release-checkout> --store <bundle-store>
opl release status --bundle <sha256:digest> --store <bundle-store>
opl release checkpoint export --bundle <sha256:digest> --output checkpoint/ --store <bundle-store>
opl release checkpoint import --checkpoint checkpoint/checkpoint.json --store <bundle-store>
opl release verify --bundle <sha256:digest> --qualification-receipt <qualification.json> --track standard --store <bundle-store>
opl release publish --bundle <sha256:digest> --executor-receipt <remote-inspect.json> --store <bundle-store>
npm run release:readiness-summary -- --version <version> --release-mode new_release --include-full-package true --run-vm-smoke true --artifacts-dir <downloaded-small-artifacts-dir> --job-results release-readiness-job-results.json --output release-readiness-summary.json --markdown release-readiness-summary.md
npm run release:candidate-record -- --version <version> --release-mode new_release --preflight release-preflight-summary.json --readiness release-readiness-summary.json --remote-verification remote-release-verification.json --release-owner-receipt-ref <release_owner_receipt_ref>
npm run release:candidate-record:validate -- --version <version> --record release-candidate-record.json
npm run release:candidate-record:status -- --record release-candidate-record.json --format json
npm run release:owner-candidate-record:verify -- --version <version> --owner-record docs/delivery/release/records/v<version>-release-owner-receipt.json --artifacts-dir artifacts/release-closeout/v<version>-<run-id>/artifacts
npm run release:full:size -- --markdown
npm run test:opl-first-run-vm:tart -- --dry-run --source-vm opl-first-run-no-clt-clean-base --dmg dist/standard-release/One-Person-Lab-<version>-mac-arm64.dmg --smoke-profile no-clt-clean-vm --display 1920x1080px --settings-smoke --assistant-route-smoke --runtime-profile standard --codex-package-tarball artifacts/opl-first-run-vm/codex-package-tarballs/openai-codex.tgz --codex-platform-package-tarball artifacts/opl-first-run-vm/codex-package-tarballs/openai-codex-darwin-arm64.tgz --codex-npm-cache-dir artifacts/opl-first-run-vm/codex-npm-cache
npm run test:opl-first-run-vm:tart -- --dry-run --source-vm opl-first-run-no-clt-clean-base --dmg dist/opl-full-release/One-Person-Lab-Full-<version>-mac-arm64.dmg --smoke-profile no-clt-clean-vm --display 1920x1080px --settings-smoke --assistant-route-smoke --runtime-profile full --codex-package-tarball artifacts/opl-first-run-vm/codex-package-tarballs/openai-codex.tgz --codex-platform-package-tarball artifacts/opl-first-run-vm/codex-package-tarballs/openai-codex-darwin-arm64.tgz --codex-npm-cache-dir artifacts/opl-first-run-vm/codex-npm-cache
npm run test:opl-first-run-vm:tart -- --dry-run --source-vm opl-first-run-homebrew-ready-base --install-mode homebrew-cask --homebrew-cask gaofeng21cn/one-person-lab/one-person-lab --smoke-profile homebrew-standard-cask --display 1920x1080px --settings-smoke --assistant-route-smoke --runtime-profile standard --codex-package-tarball artifacts/opl-first-run-vm/codex-package-tarballs/openai-codex.tgz --codex-platform-package-tarball artifacts/opl-first-run-vm/codex-package-tarballs/openai-codex-darwin-arm64.tgz --codex-npm-cache-dir artifacts/opl-first-run-vm/codex-npm-cache
npm run test:opl-first-run-vm:tart -- --dry-run --source-vm opl-first-run-no-clt-clean-base --dmg dist/standard-release/One-Person-Lab-<version>-mac-arm64.dmg --smoke-profile no-clt-clean-vm --display 1920x1080px --runtime-profile standard
OPL_INSTALL_SCRIPT_URL=file:///path/to/one-person-lab/install.sh ./install.sh --with-app --skip-packages
docker build -t one-person-lab-webui:<version> shells/aionui
```

## Immutable Release Bundle

Framework `opl release` owns Bundle identity, the closed schema, canonical
digest, store, portable checkpoint, executor receipts, qualification receipts,
and reconciliation. The App adapter supplies product policy and exact evidence;
it must not copy the Framework schema or persist a parallel session.

Local and GitHub executors consume the same Bundle. They may hand off only at
`frozen`, `standard_built`, `standard_qualified`, `full_built`, or
`full_qualified` by transferring the Framework checkpoint, exact assets, and
receipts. Import revalidates every size and SHA-256, skips completed stages, and
records `rebuild_performed=false`. `source_build_executor` /
`source_build_run_id` remain byte provenance; `checkpoint_transport_executor` /
`transport_run_id` describe only the handoff.

Stable exposes exactly `standard`, `resume_standard`, and `append_full` through
`.github/workflows/release-stable.yml`. Resume imports a checkpoint and cannot
rebuild. Full is additive after Standard qualification and cannot alter Standard
assets, updater metadata, prepared notes, or Latest. Nightly uses a separate
scheduled Standard-only entry that calls the same physical `_build-reusable.yml`,
publishes an Automated Preview with `make_latest=false`, and hands off to
isolated Homebrew and sampled-VM followers. That workflow never moves Latest or
consumes the Stable Bundle, Stable mutex, Full/WebUI lanes, or Stable heavy VM
authority. A separate protected single-use expected-current CAS may temporarily
select an exact published Preview without changing its quality; the next
qualified Stable reclaims Latest by default. The independent daily Canary
remains validation-only and performs no build, VM, or external write.

Unknown build or publish outcomes block checkpoint export and executor
switching until a fresh inspection and Framework reconcile resolve them.
Publish state never travels in a checkpoint: the recipient inspects the remote,
uploads only missing assets, treats the same name and digest as complete, and
fails closed on a digest mismatch. The Canary invokes the real reusable
`standard`, `resume_standard`, and `append_full` topology with public mutation
disabled; contract tests alone are not release admission.

The retired `scripts/release-bundle.ts` projection remains only to read
historical App Bundle receipts. It is not the live Bundle authority and cannot
be used as a mutation or readiness entrypoint.

## App root TypeScript gate

`npm run typecheck` is the App-owned root TypeScript gate. It uses pinned
TypeScript and Node type packages through `npx` so the App remains a thin
product wrapper without a second runtime dependency tree. The root
`tsconfig.json` deliberately lists the maintained App boundary and model-policy
entrypoints; the active shell's full renderer typecheck remains owned by the
shell repository and its own `tsconfig.json`.

For shell alternatives, `npm run validate:shell-candidates` covers only the
minimal fixed-role registry by default. The current foreground candidate is
`opl-native-workbench`; its full contract/evidence path is explicit through
`validate:candidate:native`, `test:candidate:native`, or
`--candidate opl-native-workbench --run-candidate-commands`. Hermes and AGUI are
active-registry tombstones: `validate:candidate:hermes` and
`validate:candidate:agui` validate their explicit routes, while command replay
reads the detailed commands from the selected adapter. Generic App validation
does not duplicate or reinterpret their package manifests.

Candidate validation remains non-release: an explicit command chain may build
the selected `.app` and run its adapter-owned smoke, but it must not switch the
active release shell, claim release readiness, or focus the user's desktop
unless a visual smoke lane explicitly requests it. Packaged Settings visual
smoke is manual/VM evidence only and requires `--allow-foreground`; prefer
Tart/VM when the maintainer is using the Mac.

For `opl-native-workbench`, the current non-live product-surface target includes
basic UI modules, artifact preview tabs, provenance drawer, starter forms,
confirmation/interview cards, desktop/WebUI same-renderer parity, and source
visual smoke. These are candidate technical evidence targets only. Live
Evidence, clean VM, same-cohort user path, owner acceptance, active-shell
adoption, and release-ready proof remain outside candidate validation.

`release:prepare-standard` also copies the App root installer into the active
shell resources as `opl-install.sh`, which is the packaged standard DMG
bootstrap carrier used when clean first launch cannot find `opl`.

Full size policy lives in
`contracts/app-release-channel.json#full_first_install.size_budget` and the Full
manifest `size_budget`; size semantics, measured records, profile boundaries,
runtime boundaries, and optimization priority live in
`contracts/app-release-channel.json#full_first_install.size_policy`;
`docs/delivery/release/README.md` is the release runbook. Release review records the
compressed DMG size, uncompressed runtime size, and layer breakdown, then uses
`verify-remote-release-assets.ts` as the remote verifier size budget check for
published GitHub Release assets. The remote verifier measures compressed Full
DMG bytes from the GitHub asset size and uncompressed runtime bytes from
`opl-release-manifest.json#manifest`
`size_breakdown.total_runtime_uncompressed_bytes`. The Full size analyzer keeps
compressed DMG warning, review threshold, and optional hard limit status
separate: crossing the review threshold records `requires_review`; only an
explicit hard limit records a release-blocking compressed-DMG failure.
`npm run release:full:size -- --markdown` prints the same component and layer
breakdown plus manifest size hotspots for local review and is appended to the
Full GitHub Actions summary. Stable Full release builds use ULMO by default for
the App-owned DMG path; set `OPL_FULL_DMG_FORMAT=UDZO` and
`OPL_FULL_DMG_COMPRESSION_LEVEL=<1-9>` only for an explicit legacy diagnostic
override.
The `750000000`-byte Full DMG threshold is a review trigger, not permission to
remove required offline first-install payloads. The v26.6.21 measured contract
record shows a `1121919153`-byte Full DMG, a `440471386`-byte standard DMG, and
a zlib level 9 estimate of `844079932` bytes, so compression tuning alone is not
enough to return under the review threshold.
The Full workflow also uploads `full-workflow-telemetry.json`, a machine-readable
cache/timing artifact for post-release bottleneck review; use it as tuning input,
not as release truth.
For remote diagnosis, prefer the small `opl-full-diagnostics-<version>` artifact.
It contains `full-workflow-telemetry.json`, `full-package-manifest.json`,
`runtime-cache-events.json`, `SHA256SUMS.txt`, and the Full README, so operators
can compare recorded hashes, manifest commits, and runtime layer cache status
without downloading the large Full DMG. Warmup runs use
`--warm-runtime-cache-only`: after the four runtime layers pass currentness and
native-trust validation, the builder writes cache evidence, removes its staging
tree, and returns before payload sync, Shell/Vite build, DMG compression,
manifest/checksum generation, or release-artifact upload. Release-called Full
builds keep the package artifact enabled for publish and VM consumers.
Published Full release verification prefers the consolidated
`opl-release-manifest.json` plus the Full DMG. During migration it still accepts
the legacy separate `full-package-manifest.json`, `runtime-cache-events.json`,
`full-runtime-currentness-probe.json`, `full-runtime-native-trust.json`,
`full-app-bundle-trim-report.json`, `full-package-boundary-audit.json`,
`README-Full-First-Install.txt`, `SHA256SUMS.txt`, and
`full-local-authorization-policy.json` assets when the consolidated manifest is
not present.
`scripts/summarize-release-readiness.ts` also flattens
`runtime-cache-events.json` into readable cache counts and `miss_written` layer
names in `release-readiness-summary.json`, making fresh cache writes visible in
the final release summary.
Full packaging pruning is governed by
`contracts/full-runtime-prune-policy.json`. That contract is the single
machine-readable source for runtime tree filters, production dependency package
filters, Node toolchain package filters, expected pruned-path assertions,
validation examples, and the external practice refs behind the policy. The
builder, cache key, manifest `runtime_prune_policy`, runtime assertions, and
policy audit command all derive from this contract.

The policy excludes local development indexes, dependency caches, tests, and
runtime/user state such as `.codegraph`, `.git`, `.worktrees`, `.venv`,
`node_modules`, `runtime`, `runtime-state`, `runs`, `sessions`, and `tests`.
It also prunes non-runtime build and report output such as `.github`, `.next`,
`.turbo`, `storybook-static`, `playwright-report`, `test-results`, coverage
directories, and source maps. Production `opl/node_modules` packages are copied
through a narrower filter that removes package tests/docs/fixtures/examples,
snapshots, reports, caches, and `*.map` files while keeping runtime JS, schemas,
assets, and native binaries. Domain-specific allowlists must come from the
owning domain repositories.
The explicit prune policy is recorded in
`full-package-manifest.json` as `runtime_prune_policy`, and
`runtime_assertions.prune_policy_hash` is part of the Full runtime cache key.
Node's global npm/corepack payload is copied through the same non-runtime
policy for package docs/man pages/tests/fixtures/examples, while `node`,
`npm`, and `npx` remain offline executables. Python keeps headers and
`ensurepip` for offline native-extension build/debug support, but stdlib test
suites and bytecode caches are excluded. The manifest also records
`runtime_assertions.offline_required_payloads` and
`runtime_assertions.declared_pruned_paths`; use those fields to audit that
Codex and Temporal archives, Node/Python/uv, officecli, mineru, domain modules,
and packaged skills stayed local instead of becoming lazy downloads.
Run `npm run release:full:prune-audit -- --markdown` before changing prune
rules. With `--runtime-root <path>`, it also reports currently excluded paths,
largest excluded entries, runtime assertions, and optional baseline diff.

The clean first-install gates are wired through
`.github/workflows/opl-first-run-vm.yml` and the active shell Tart smoke helper.
It supports `package_profile=standard`, `package_profile=full`, and
`package_profile=homebrew-standard`. The standard profile resolves
`One-Person-Lab-*-mac-arm64.dmg` excluding Full assets and runs
`--runtime-profile standard`; the Full profile resolves
`One-Person-Lab-Full-*-mac-arm64.dmg` and runs `--runtime-profile full`. The
Homebrew profile starts from a clean Homebrew-ready Tart base, runs
`brew install --cask gaofeng21cn/one-person-lab/one-person-lab`, then opens
`/Applications/One Person Lab.app` through the same packaged-app smoke. The
fully qualified cask ref is the trust-scoped CI/user install path; do not
replace it with broad tap trust or a bare cask token in release gates.
Release workflows pass a same-run workflow artifact for the DMG so draft
candidates do not depend on GitHub Release draft visibility. The release tag
stays in the preflight summary as provenance and remote release verification
remains the published-asset gate. Stable release workflows pass DMG-only
same-run artifacts (`macos-build-arm64-dmg` and
`opl-full-first-install-dmg-<version>-mac-arm64`) into VM gates while retaining
the complete standard and Full artifacts for publish jobs. Each macOS DMG
artifact has a sibling `-cohort` artifact containing the exact App SHA, Shell
SHA, and version. The VM workflow validates that manifest before allocating the
self-hosted VM and rejects an older DMG paired with newer App or Shell smoke
contracts.
Branch-lane evidence runs that should not publish release assets may pass the
same DMG-only artifact name plus `release_artifact_run_id` to download the
artifact from the source Actions run through `actions/download-artifact@v8`
with `run-id`; that handoff is
for VM evidence only and does not replace same-run stable release gates or
remote release verification. These profiles fix
the logical display at
`1920x1080px`, sweep packaged Settings pages, and write profile-scoped artifacts
named `opl-first-run-vm-<profile>-<run_id>`. The Full
profile must prove activation from the clean guest's installed
`/Applications/One Person Lab.app`: installed bundle resources, guest runtime
pointer/wrapper readback, and live `opl system initialize --json` output are the
pre-`/guid` `ready_to_launch` proof source. Host `/Applications`, developer
checkout state, prebaked runtime pointers, cache hits, manifest refs, and remote
asset presence are diagnostics or provenance only. The Full profile keeps Full
runtime readiness on the release-blocking path, and submits the OPL Gateway
configuration wizard only when no usable Codex model access exists. It does not
require the wizard UI when existing Codex login or another provider is already
ready. Command Line Tools, git
availability, and managed repo sync are deferred maintenance. The pre-`/guid`
gate requires only workspace root, Codex CLI, and usable Codex model access; Domain modules,
the family runtime provider, recommended skills, native helpers, CLT, repo sync,
and ecosystem updates are Full readiness or background maintenance and must not
block launch. With
`--codex-functional-check`, the guest smoke writes
`codex-functional-check-summary.json` as a deterministic post-install receipt
for Codex CLI detection, App-managed `opl-flow` context expectation, user
`AGENTS.md` policy, built-in route receipts, and skill/plugin visibility without
calling an external LLM. App-managed `opl-flow` is injected as localized,
session-scoped preset context; it must not write or overwrite workspace
`AGENTS.md`. With `--codex-ai-self-check`, the guest smoke then asks Codex CLI
to read the target installed OPL working mode and deterministic evidence, and
writes `codex-ai-self-check-summary.json` as non-blocking AI-first diagnostic
evidence. Default mode is read-only `diagnose`; it verifies intended behavior
and recommends next actions without replacing deterministic initialization or
the VM gate. The workflow writes a preflight summary
with runner labels, source VM, guest user, package/runtime profile, DMG path,
display, Codex package preflight path, Codex tarball path, Codex npm cache dir,
and artifact output before executing the smoke. The VM artifact includes
`codex-package-preflight.json`, `codex-package-registry-response.json`,
`codex-package-tarballs/openai-codex.tgz`,
`codex-package-tarballs/openai-codex-darwin-arm64.tgz`, and `codex-npm-cache`;
the active shell helper receives those install assets through
`--codex-package-tarball`, `--codex-platform-package-tarball`, and
`--codex-npm-cache-dir`. The root package tarball and the macOS platform binary
package tarball are both install assets; the platform tarball is explicitly
passed so the Framework runtime installer can materialize the native Codex
binary without relying on npm optional dependency resolution in offline guest
state. This preseed/cache surface reduces live registry dependency during Codex
install. The preflight artifact separates blocking
failures from diagnostic warnings: npm metadata, tarball download, and npm cache
add failures block the gate, while a registry metadata mirror download timeout
is recorded as a warning when the exact tarball and npm cache preseed are still
valid. This surface is not readiness truth, runtime truth, or release-owner
receipt, and it never replaces the clean VM install smoke.
The reusable Actions cache for this preseed is keyed by runner OS/architecture,
the frozen Codex version, and both complete tarball SHA-256 values. It never
uses a workflow run, attempt, timestamp, or random value. The restore prefix
keeps one-time compatibility with legacy entries; an exact matched key skips
the save, and only `refs/heads/main` may write a new preseed cache. Per-run
tarballs, diagnostics, and receipts remain Actions artifacts. Run
`npm run validate:release-boundary` after any cache-step change; the validator
parses every workflow and rejects volatile cache identity or an explicit save
without a miss/forced-rebuild guard.
Codex App and Computer Use checks are non-blocking exploratory tools;
release-blocking App readiness must live in deterministic scripts, contracts,
or GitHub Actions gates.
The App VM wrapper exposes
`diagnostic_scope=release_gate|post_publication_optional_certification|bootstrap_only`.
`post_publication_optional_certification` is an independent, non-blocking
consumer of an exact already-published artifact; it never rebuilds, re-signs,
publishes, or authorizes Latest. When no physical capability is admitted, the
dispatcher records `not_run` instead of queueing work or guessing
`unavailable`. Legacy release workflows use `release_gate`;
`desktop-release-diagnostics.yml`
defaults to `bootstrap_only` to skip Codex asset cache restore/prefetch/save,
Settings sweep, assistant route smoke, and Codex functional/AI checks while
still installing and launching the App and collecting bootstrap fatal/native
modal diagnostics. Bootstrap-only artifacts are diagnostic-only and cannot
stand in for stable release evidence.
Scheduled GitHub Actions runs must have repository variable
`OPL_FIRST_RUN_TART_SOURCE` set to a local Tart source VM on the self-hosted
runner; this runner uses `opl-first-run-no-clt-clean-base-26-5-18` for DMG
profiles. The Homebrew profile must use `OPL_FIRST_RUN_HOMEBREW_TART_SOURCE`
or an explicit `tart_source_vm` pointing at a clean VM that already has
Homebrew installed; otherwise the gate fails before App installation.
The VM workflow keeps scheduled runs in a shared cancel-in-progress group, while
release-called and manual runs include the caller run id and package profile in
their concurrency key. Do not collapse standard, Homebrew, and Full VM gates
into one manual group; GitHub keeps only one pending job per concurrency group,
which would cancel one Stable install lane before it can produce readiness
evidence.
The VM workflow checks out only the active shell `scripts/` directory with a
shallow checkout, because the App wrapper calls only
`scripts/opl-first-run-tart-smoke.mjs` and its same-directory guest smoke
helper. If that smoke helper starts depending on other shell paths, update the
workflow checkout and the release-boundary check in the same change.

The daily validation schedule enters `.github/workflows/release-bundle-canary.yml`.
Canary starts the reusable topology in validation-only mode without builds, VMs,
release secrets, external writes, or Stable mutation. A separate daily
`.github/workflows/release-nightly.yml` builds the Standard preview with the
shared physical build and publishes a prerelease with `make_latest=false`; that
scheduled workflow does not change Latest. Its
Homebrew follower is digest-bound and single-attempt; its clean-VM follower is
weekly sampled and non-blocking.

AI release-note drafting is a pre-release preparation path, not publish/promote
critical-path work. Stable prepares and validates AI-written notes before the
expensive build; the exact Markdown and evidence digests become Bundle identity.
Stable publish cannot call AI, replace the prepared notes, or fall back to
template output. Automated Nightly uses a fixed disclosure of its Standard-only,
non-Stable, scheduled `make_latest=false`, and non-heavy-VM scope rather than
calling AI in the scheduled critical path. Any later pointer override separately
discloses the exact Preview quality and skipped or failed gates. The Stable
writer runs the online provider probe first and fails closed when no usable
provider is configured.
Online release drafting uses
`OPL_RELEASE_NOTES_PROVIDER=openai_compatible` with the existing
`OPL_RELEASE_NOTES_CODEX_BASE_URL=https://gflabtoken.cn/v1`,
`OPL_RELEASE_NOTES_CODEX_API_KEY`, and
`OPL_RELEASE_NOTES_MODEL=gpt-5.6-luna` route. Stable keeps Luna first and sets
`OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_MODELS=gpt-5.6-luna,gpt-5.4` so a
transport failure can move to the second online model without falling back to
template copy. The writer also accepts
`OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_BASE_URL` and
`OPL_RELEASE_NOTES_OPENAI_COMPATIBLE_API_KEY` for non-release probes or local
diagnostics. GitHub Models is not in the release path. Online pre-release
drafting runs
`scripts/release-notes-ai-writer.ts --probe-openai-compatible` before accepting
AI-assisted copy and fails closed when the online route is not usable.
Use
`npm run release:notes:probe-ai` to run the same secret-safe probe locally, and
`OPL_RELEASE_NOTES_AI_TIMEOUT_SECONDS` to override the default 75-second
per-model online request timeout.

Stable release verification keeps the heavy installation checks in separate
lanes for speed and debuggability: standard DMG clean VM, Full DMG clean VM,
one-shot App installer, Docker/WebUI, remote verification, and release evidence
bundle validation can identify the exact user installation path that failed.
The sole Stable manual entry is `.github/workflows/release-stable.yml`, with
operations `standard`, `resume_standard`, and `append_full`. `standard` freezes
a new Bundle, completes exact-byte Standard qualification before the first
public mutation, then performs digest-idempotent publication, Homebrew readback,
and Latest activation. `resume_standard` consumes an existing checkpoint and
cannot rebuild. `append_full` consumes a checkpoint at or after
`standard_qualified`, performs only missing Full stages, and cannot modify the
Standard terminal.

Each operation resolves one absolute deadline at admission: 90 minutes for
`standard`, 30 for `resume_standard`, and 50 for `append_full`. Every mutating
job rechecks the operation and deadline before its first remote API, and
`github.run_attempt` must remain `1`. A failure resumes through a new operation
over the same checkpoint; partial workflow reruns, redispatch after an unknown
result, and emergency cancellation from the ordinary executor are forbidden.

Use moving App, Shell, and Framework `main` only during preparation to resolve
exact SHAs. Freeze the resulting complete package binding before an expensive
build. If a source ref, package payload, catalog digest, prepared note, or
qualification input changes, freeze a new Bundle; do not reinterpret a stale
checkpoint. The old cohort plan, Stable session, operator projection, and
broker ledger remain readable only as historical receipts and cannot recommend
or authorize the live operation.

After a successful release, run `npm run docs:macos-guide` to refresh the public
HTML guide plus the shareable PDF/PPTX and detailed PDF artifacts under
`docs/site/latest/macos-app-install/`.

## Release CI operations notes

Release automation has two distinct improvement tracks:

- Release gates prove user installation paths: standard DMG, Full DMG, one-shot
  installer, Docker/WebUI, remote verification, and evidence bundles.
- CI operations reduce wasted runner time and improve diagnostics without
  changing release truth.

`actionlint` belongs to the second track as the workflow semantic gate in the
reusable build quality jobs; Ruby/YAML parsing remains only a syntax check. The
CI gate disables opportunistic external `shellcheck`/`pyflakes` integrations so
host image drift cannot turn historical script-style findings into a release
blocker for packaging or VM telemetry runs.

GitHub Actions `concurrency` belongs to mutation governance. Stable owns the
repository-wide release mutation group; Canary uses a separate validation
group. Neither mutex is proof that any package installed correctly.

Machine-readable release telemetry should be a JSON artifact that records
cache hit/miss, lane timing, package sizes, and image sizes. That artifact is
the evidence base for after-release tuning of cache keys and matrix size; it
does not replace manifests, SHA256SUMS, remote verification, or VM smoke
artifacts. Full remote tuning should read the small
`opl-full-diagnostics-<version>` artifact before downloading any large package
artifact.

The unaliased historical closeout inspector, release-readiness summaries,
candidate records, and owner records remain available to interpret old evidence. They
do not advance a Framework Bundle or authorize a live publication. Historical
local reruns write ignored output under
`artifacts/release-closeout/v<version>-<run_id>/` and should not download large
Standard or Full artifacts merely to explain an old run.

Use `release:actions-timing` when the question is release efficiency across
multiple failed, canceled, and successful GitHub Actions runs. It reads
`gh run view --json ...jobs` output, reports total multi-run span,
failed/canceled run tax, top jobs, top steps, and the orchestration gap outside
the Actions span when `--agent-wall-time` is supplied. It is a profiling tool;
it does not replace Framework status, operation receipts, exact-asset
qualification, or published asset verification.

No-watch readback:

```bash
gh run view <run-id> --repo gaofeng21cn/one-person-lab-app --json status,conclusion,url,updatedAt
opl release status --bundle <sha256:digest> --store <bundle-store> --json
```

The live Stable decision is the Framework Bundle state plus App qualification,
remote readback, Homebrew readback, and operation receipts bound to the same
asset digests. Missing typed evidence fails closed. A checkpoint cannot import
publish or Latest state, so every recipient performs a fresh remote inspection
before a public mutation or promotion.

The one-shot installer section records the fixed public entry command, the
workflow job result as bootstrap status source, the
`opl system initialize --json` setup-flow source, artifact file names, progress
fields, blockers, next step, retry state, and `--skip-packages` state in JSON and
the Markdown summary.

Draft candidate discovery is an explicit read-only metadata step. Use
**OPL Desktop Release Cleanup Drafts** or `release:cleanup-drafts` after the
stable `v<version>` Release is published to list stale
`v<version>-draft.*` and `v<version>-readiness.*` drafts. The live Bundle
control plane exposes no Release or tag deletion mutation; this CLI lists only.
Deletion requires a separately authorized product change. An unknown upload or
publish result must be inspected and reconciled before any new mutation.

WebUI GHCR cleanup is a separate dry-run-first package admin step. Use
`release:cleanup-webui-ghcr` to read
`contracts/app-release-channel.json#webui_ghcr_image.retention_policy`, keep
protected moving tags (`latest`, `stable`, `nightly`), keep the declared recent
stable/nightly windows and rollback tags, then list stale package versions. Pass
`--execute` only after reviewing the summary and only from a token with package
admin / `delete:packages`; ordinary release publishing never deletes GHCR
versions.

Full build speed tuning should start with `full-workflow-telemetry.json`.
`cache.shell_vite_output=true` means the Full workflow restored active-shell
Vite output and invoked the shell build with `--skip-vite`; `false` means it ran
the normal shell build and saved the output for the next run. The cache is
version-scoped because the bundled shell output embeds `OPL_RELEASE_VERSION`.
`cache.electron_artifacts` records whether Electron/Electron Builder downloads
were restored. `runtime-cache-events.json` carries per-layer keys plus
`key_inputs`, which should be used to explain Full runtime cache misses before
changing cache policy. Treat these as cache acceleration signals only, not as
release truth.

Cache ownership and budgets live in
`contracts/app-actions-cache-catalog.json`, not in individual workflows. The
catalog reserves 2 GiB headroom from the repository's 10 GiB allowance and
separates dependency downloads, first-run install seed, compiled output, and
four Full runtime layers. Large caches always use explicit restore plus
`refs/heads/main` miss-only save; branch/PR/release refs are restore-only.
Cache actions whose key is entirely dynamic declare the catalog class through
`OPL_ACTIONS_CACHE_CLASS`; the release validator rejects missing or unknown
class markers.
Ordinary Actions credentials may inventory cache usage and exact IDs but cannot
delete them. Cleanup remains plan-only until an isolated cleanup broker accepts
the protected-key set and exact deletion IDs.
`npm run release:cache-plan -- plan ...` and `... -- receipt ...` are the CLI
surfaces used by the Full workflow to make exact-cohort cache decisions and save
outcomes inspectable. Plan/receipt v2 bind the selected package dependency
closure, exact source fingerprints, each layer's structured key-input digest,
and passed runtime currentness. The
receipt reports hit/miss counts, hit ratio, total layer duration, and save
failures; use those metrics to diagnose acceleration only. The layer ownership,
invalidation matrix, default-on flow, and change rules are documented in
`docs/delivery/actions-cache-architecture.md`. Cache-only warmup runs ahead of a release and is never an
admission gate; the normal Full builder handles an absent/evicted warmup as a
validated miss and writes the missing layer on `main`. Run
`npm run validate:release-boundary` after changing any cache key, prefix, action,
restore fallback, or write condition.

Composite/setup action reuse is used only where a checked-in composite action is
tested and the job still keeps release semantics visible. Active-shell
checkout/setup/cache reuse lives in `.github/actions/setup-active-shell-deps`.
