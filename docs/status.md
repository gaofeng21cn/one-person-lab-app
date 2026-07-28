# One Person Lab App Status

Owner: `one-person-lab-app`
Purpose: `app_status`
State: `active`
Machine boundary: Human-readable status. Use `contracts/` and release/test
artifacts for machine decisions.

Package composition Phase 1 is complete and Phase 2 per-family retirement is active. The target SSOT,
functionality-equivalence ledger and frozen implementation boundaries live in
[`active/opl-package-platform-composition-migration.md`](active/opl-package-platform-composition-migration.md).
Its exact blob is canonical documentation authority; current canonical contracts/source and fresh
platform readback remain implementation truth. Already-canonical changes are not reverted, but
task commits/worktrees, tests and owner handoffs are only owner-bound checkpoints until fresh-main
absorption and do not prove implementation completion. The current Framework main already includes owner-channel
Package currentness and package-local required selection, but App-state still
projects old lock/ABI/digest/materialization/receipt/LKG compatibility state. The next action is to
continue the migration plan's per-family producer -> consumer -> OUT -> consumer-zero -> physical
deletion loop. This Phase 2 source authority does not unlock canonical absorption, Stable/Latest,
Package publication, WebUI promotion, real user managed-state mutation, or cleanup; those retain
their own fresh owner gates and do not block zero-overlap source work.

Plugin native profile pointer: `contracts/opl-native-profile.json` only declares
the repo-native profile used by OPL Flow / OPL Doc plugin sync and drift checks.
It is not GUI product truth, release authority, runtime truth, domain truth, or
installation evidence.

Live Evidence deferred / functional structure first is the current App
development rule. Normal App work should first close functional and structural
gaps: App-owned contracts, active-shell sync, AionUI mainline behavior,
`opl-native-workbench` foreground-alternative boundaries, page-state validation, first-run policy,
Settings / Storage / route receipts, and no-authority runtime/domain guards.
Release cohorts, clean-VM proof, packaged GUI smoke, same-cohort user-path
evidence, real user-directory E2E, owner acceptance, and production-ready
claims remain release/lifecycle evidence lanes. They must not block independent
contract/shell cleanup, and contract validation or shell tests must not be
promoted into release-ready or family production-ready proof.

## Current State

- GitHub repo: `gaofeng21cn/one-person-lab-app`.
- App product repo history policy: clean App-owned history only.
- Active shell: `aionui`.
- Active shell root: `shells/aionui` as an external checkout.
- Active shell source repo: `gaofeng21cn/opl-aion-shell`.
- Foreground alternative GUI candidate: `opl-native-workbench`, an independent shell checkout governed by the App candidate registry and adapter contract.
- Retained GUI reference: `hermes-codex`, based on Hermes Desktop. Its active registry entry is a role tombstone; explicit validation, package replay, adapter, and runbook remain available without creating a routinely maintained second product line.
- Archived technical GUI proof: `agui-codex`; do not update or improve it unless AGUI is explicitly requested.
- App product profile: `contracts/app-product-profile.json`.
- Framework dependency: `gaofeng21cn/one-person-lab`.

The App repo must not merge AionUI history into its default branch. AionUI
upstream-following work stays in `opl-aion-shell`; App product release and user
docs stay in `one-person-lab-app`.

Current GUI development follows one active mainline plus explicit alternative
routes: AionUI is the stable App GUI mainline, `opl-native-workbench` is the
foreground alternative candidate, Hermes Desktop / `hermes-codex` is a retained
reference, and AGUI is archived proof. Default shell-candidate validation checks
only the fixed role registry. Native detail remains explicit; Hermes/AGUI detail
lives in adapter and replay-runbook owners rather than duplicated active-registry
snapshots. See `docs/product/gui/gui-shell-candidates.md` for the topology and
commands. Neither retained route receives routine builds, updates, or polish. Treat
`candidate` in AGUI filenames, manifests, scripts, and adapter contracts as a
backward-compatible replay label only; it does not reopen AGUI as a foreground
candidate or default validation target. The App-owned convergence aggregate is
`npm run validate:shell-convergence`: it reuses the active-shell and
shell-candidate validators as structure evidence only. It cannot claim App release readiness,
active-shell adoption, packaged GUI acceptance, production readiness, live user
path evidence, or Live Evidence.

The App product profile is the current owner for desktop session defaults and
user-facing product policy: Codex default model/reasoning, default visible
companion skills, first-run deferred maintenance behavior, and Settings
presentation keys. The active shell consumes the generated copy at the
`shell_contract.paths.product_profile_target` path declared in
`contracts/app-shell-adapter.json`; runtime truth, provider implementation, and
domain truth remain outside App ownership.

The current product boundary is purpose-first: the App is the Codex wrapper and
product truth for ordinary users entering research, grant, presentation, and
general work. Current contracts make MAS/MAG/RCA visible as migration-era
Official Profile examples; the target dynamically projects any installed Agent
Package without a fixed App inventory. The App owns the user path, not domain readiness,
owner-receipt authority, artifact authority, memory body, or OPL family
production readiness.

The active shell upstream intake ref is recorded in
`contracts/app-shell-adapter.json#shell_source.upstream_ref` while preserving
the App-owned product profile. That contract is the active shell source of
truth; the upstream code is implementation material, not product authority. The
shell also keeps Codex ACP tool-call
output display aligned with native Codex behavior by preserving newline-bearing
`raw_output` / `stdout` / `stderr` content in the conversation view. The updater
now selects the macOS ZIP for in-app updates, uses an App-managed local
authorization installer to replace the local App bundle, clears quarantine,
records diagnostics, and relaunches the updated App.

Active shell upgrade hardening is App-owned and machine-checked. The adapter and
GUI contracts own upstream feature classification, ordinary capability filtering,
Team-surface rejection policy, and required implementation probes; this status
file keeps only the current boundary. Use
`contracts/app-shell-adapter.json`, `contracts/app-gui-product-contract.json`,
`contracts/app-product-profile.json`, `scripts/validate-active-shell.ts`, and
the focused release-boundary GUI tests for executable Team and MCP-filtering
truth.

Active-shell Runtime Stage/Attempt detail and telemetry-missing expectations are
single-sourced from
`contracts/app-runtime-bridge.json#stage_run_cockpit_projection`. GUI,
page-state, and user-task-status validators consume that projection as the
cross-contract expectation instead of keeping a second copy in validator
constants.

Settings IA behavior is validated through the Settings control-plane validator.
The GUI product validator checks GUI-to-control-plane consistency and delegates
Settings IA protocol checks instead of keeping a second Settings validator copy.
The product-profile validator compares Settings defaults to its projected
`settings.control_plane` copy rather than importing separate Settings constants.

GUI interaction status is contract-backed as a composer-first Codex canvas with
purpose entries, App-owned model status, collapsed contextual surfaces, and
secondary inspector/detail views. The element audit lives in
`docs/product/gui/element-audit.md`; the target interaction definition lives in
`docs/product/gui/ideal-interaction-spec.md`; machine acceptance is enforced by
`contracts/app-gui-product-contract.json`,
`contracts/app-page-state-matrix.json`,
`contracts/app-product-profile.json`, `scripts/validate-active-shell.ts`, and
focused release-boundary tests. The active shell keeps runtime truth, domain
truth, memory body, and artifact body outside shell authority.

### Current Package Compatibility Snapshot

The following install/exposure paragraphs describe retained machine contracts,
not the target architecture. They must not authorize new fixed ids, version
resolution, lock/payload/receipt consumers, Flow manifest parsing, or carrier
mirrors. Target ownership and deletion order live only in the Package migration
plan.

Install/exposure policy is currently contract-backed in
`contracts/app-install-exposure-policy.json`. The public semantic ABI is the
domain skill; Codex App plugins are distribution/capability bundles, and CLI,
App, direct skill, and product-entry surfaces converge on the same
domain-owned action/stage metadata. MAS/MAG/RCA are current default purpose examples
and plugin-visible domain skills, not companion skill mirrors under
`~/.codex/skills/{med-autoscience,med-autogrant,redcube-ai}`. OPL Meta Agent remains an OPL-generated Codex
surface and an App/CLI-managed ecosystem module, but not a default home
assistant. The current Workflow dependency sync and AionUI whitelist fields are
transition-only; App/Shell must move to Framework/native capability projection
and must not deepen those lists. `agent_installation_contract` currently
also separates ordinary module/agent-pack maintenance from Developer Profile
checkout overrides: ordinary users consume App/CLI-managed maintenance after the
App is installed, while GitHub repo or local checkout sources are an explicit
`source_channel` opt-in. Settings now shows Developer Profile
capabilities instead of a single Developer Mode switch: `source_channel`,
`workspace_trust`, `github_authority`, `agent_automation`, and
`runtime_mutation_scope`. `opl-flow` is an OPL Package with
`package_kind=workflow_plugin_package`, and not a WebUI image, standard updater
carrier target, or a legacy modules-namespace package.
The retained independent agent installation path is pinned by
`contracts/app-install-exposure-policy.json`: MAS/MAG/RCA must register through
Codex plugin registry targets while keeping direct skill compatibility and the
same action/stage metadata; OMA stays on the OPL-generated local Codex plugin
surface. This is current compatibility, not the target identity/currentness model.
Framework currently resolves configured Package sources and
records the exact source and materialized bytes only after installation or
update. No GHCR channel, Release Set, payload inventory, version, or digest is
   an App or Package readiness prerequisite. The machine gate is
`npm run validate:agent-installation`, with optional
`--agent-root <id>=<path>` checks for real plugin roots and
`--codex-skills-root <path>` checks that `med-autoscience` / `med-autogrant` / `redcube-ai` are not also installed as
duplicate bare Codex skill mirrors.

First-install policy is now contract-backed in
`contracts/app-product-profile.json` and
`contracts/app-first-run-test-matrix.json`: `ready_to_launch` runs before
`/guid` and requires only Core readiness: workspace root, Codex CLI, and Codex
config. Full first-install reaches Core ready from bundled runtime on a clean
Mac without requiring CLT, Homebrew, Node, or Git first. Domain modules, the
Temporal-backed family runtime provider, recommended skills, native helpers,
repo sync, module reconcile, CLT installation, companion skills installation,
and ecosystem module updates are Full readiness or App/CLI-managed background
maintenance instead of blocking first launch. Standard packages prefer
App-managed bootstrap and maintenance and cannot use “install
Homebrew/Node/Git first” as the first-screen terminal state. CLT requests use
`xcode-select --install` and wait for user confirmation inside Apple's system
installer. `officecli`, MinerU, and `opl-meta-agent` are App/CLI-managed
ecosystem modules. Active-shell validators derive first-run Core items,
beginner presentation expectations, and first-conversation wait/failure policy
from the product profile instead of keeping a second constants mirror.

First conversation readiness is now part of the App-owned setup contract. The
active shell must warm the ACP conversation and wait for the conversation record
before sending the initial `/guid` message. Slow first-run dependency unpacking
therefore becomes a retryable setup/send state instead of a fixed ACP handshake
timeout or a lost prompt. This does not make Full readiness block first launch.

Temporal auto-configuration is now explicit in the install contract and release
channel. The packaged wrapper exports `OPL_FAMILY_RUNTIME_PROVIDER=temporal`,
`OPL_TEMPORAL_ADDRESS=127.0.0.1:7233`, `OPL_TEMPORAL_NAMESPACE=default`, and
`OPL_TEMPORAL_TASK_QUEUE=opl-stage-attempts`; OPL Framework still owns service
start, worker lifecycle, readiness diagnostics, residency proof, and repair
receipts. Temporal provider readiness remains Full readiness/background
maintenance for ordinary first launch.

First-run and, when the retained X0-01 route is enabled, Runtime readouts are
contract-backed App consumers of OPL Framework surfaces. First-run progress
derives from `opl system initialize --json#system_initialize.setup_flow`. The
optional Runtime route reads
`opl app state --profile fast --json` and consumes only the contracted Work Item,
Stage, Attempt, Token, and visibility projection. Explicit full App state and
`opl runtime app-operator-drilldown --detail full --json` are owned by
Maintenance diagnostics and release tooling, never by Runtime.

When the retained optional X0-01 Runtime route is enabled, its product rule is a
minimal project status surface: Agent -> Project scope, one row per canonical Work Item, user-facing status, running and
elapsed state, current and total Token usage, current/next Stage, current
Attempt, and read-only next-step/owner semantics. Archive/restore is its only
mutation. Provider/platform repair, managed dependencies, updates, raw
diagnostics, State Index, operator drilldown, logs, command refs, and safe-action
catalogs live in Maintenance; Agent Package lifecycle lives in Agents;
Skill/Plugin/Flow and local capability health lives in Capabilities; artifact
provenance lives in Inspector; complete same-cohort
evidence lives in release tooling. The App remains a projection consumer and
never owns runtime truth, provider implementation, domain truth, artifact body,
owner receipts, typed blockers, domain verdicts, App release readiness, or
family production readiness.

The retained optional X0-01 Runtime V2 route's local installed user path was
accepted on the maintainer Mac on 2026-07-15 against
`/Applications/One Person Lab.app`: 9 visible work items,
0 archived after archive/restore readback, complete eight-stage MAS maps,
DM003 cumulative usage of 25,490 tokens, Chinese and English rendering, four
responsive viewport widths, and restart readback all passed without renderer
console or page errors. The exact local cohort, App hash, source refs, and claim
boundary are recorded in
`docs/delivery/release-evidence/runtime-local-installed-acceptance-2026-07-15.json`.
This closes only that historical maintainer-Mac conditional-route user path; it does not claim
Stable/latest publication, public-release cohort equivalence, clean-VM or
cross-machine proof, release readiness, owner acceptance, domain readiness, or
OPL family production readiness.

The upstream AionUI Team surface is disabled for ordinary OPL App use. The
current owner for the exact redirect, sidebar, deep-link, Team MCP scrub,
agent-switching, and IPC mutation gates is the App GUI / shell adapter contract
set plus active-shell validation. This status file does not freeze the probe
list, test names, or historical snapshot examples. Team is independent from
Codex subagents: delegated execution, metadata intake, and canonical discovery
already use the Codex runtime plus the single existing App Server adapter;
ordinary Active/Done/detail/open-thread UI remains partial. A second client,
Team store, scheduler, or shell-owned execution path is forbidden.

The App first-run screen presents that shared model in a beginner-first way:
the primary view shows a plain readiness summary, three user-facing setup
steps, the required Core progress, the single primary start action, and only
the next user-relevant step. Technical phase labels, refresh controls, runtime
settings, raw errors, maintenance actions, Full readiness, background
maintenance, raw command refs, and module/provider/tool details stay inside
collapsed technical details by default. Clean-machine users should see whether
the App is preparing, ready, or needs their attention without being asked to
interpret Homebrew, Node, Git, CLT, runtime provider, module maintenance, or
raw command output as the main installation goal.

This follows mature first-run patterns rather than a custom App-only wizard.
GNOME Initial Setup frames first boot around only a few essential steps that
lack good defaults; VS Code walkthrough guidance keeps onboarding checklists
short and action-oriented; Homebrew's installer history shows that ambiguous
terminal prompts can confuse non-technical users. OPL therefore keeps the App
first screen essential, action-led, and user-language first, while retaining
full diagnostics in collapsed technical details.

## Release State

Standard App release assets and updater metadata are App-owned and currently
macOS arm64-only. Full first-install assets remain explicitly separate from
standard updater metadata. The standard updater is desktop-App-assets only; Full
assets stay as GitHub Release first-install downloads and the explicit stable
`one-person-lab-full` Homebrew cask. The Full cask is currently a legacy,
unmanaged public path with a duplicate Formula/Base risk; the direct Full DMG
is authoritative until the migration gates in
`docs/delivery/distribution-and-install-ssot.md` pass. Standard updater ZIP
trust, App-managed local authorization, Full native-runtime trust, size budgets,
Homebrew tap policy, and release workflow sequencing are governed by
`contracts/app-release-channel.json`, `docs/delivery/release/README.md`, release
workflows, validators, and release artifacts.

Release efficiency now has an explicit target architecture:
`build-once/promote-many`. A frozen App/Shell/Framework cohort should build and
qualify artifacts once, then use the release cohort manifest as the retry and
promote entrypoint. Same-cohort recovery should rerun the failed gate, VM
diagnostic, or promote path instead of restarting the whole release train.
Current target timing is standard 10-20 minutes, Full 35-50 minutes,
same-cohort retry 3-15 minutes, and promote under 5 minutes. The current RCA
classification treats delay as mostly workflow design and retry-shape debt
with a smaller implementation-bug share; status summaries should therefore
name the failed gate and owner route instead of defaulting to full reruns.
Release publish/promote must consume prepared release notes and must not call
AI to generate notes on the critical path. Full runtime bundle preparation is
owned by OPL Framework and consumed by the App through manifest/lock/readback
refs; VM smoke qualifies the exact release artifact for the same cohort.
Standard Stable publication and Latest now follow the GitHub-hosted mandatory
floor: source/contract/build preflight, Standard publication, exact remote
digest and current-Latest readback, and Homebrew publication/readback, all
bound to the same immutable App/Shell/Framework and ZIP/DMG identity. Tart,
clean VM, Hyper-V, and WSL2 checks are asynchronous post-publication optional
certification of those published bytes. Their status is explicit
`passed|failed|not_run|unavailable`; they never block or queue Standard
publication or Latest. Full and Docker/WebUI remain separately tracked
same-cohort add-ons rather than prerequisites for Standard Latest.
The protected `release-manual-full-preview.yml` ingress remains an explicit
non-Stable manual exception with its own protected handoff and self-hosted
label; it does not make self-hosted a Stable/Latest dependency. Self-hosted
machines are selected through exact capability pools for optional certification,
PR/platform advisory acceleration, or nightly/maintenance work. Fleet owns
capability and lease/reservation state; GitHub owns runner registration and
Actions scheduling. An offline, busy, or unproved runner yields typed
`unavailable`/`not_run` evidence while the hosted publication floor continues.
For remote delivery work, run the same frozen cohort locally through the
applicable checks first, capture exact bytes/digests, and use GitHub-hosted
publication as the routine reproducibility path.

The standard updater now treats downloaded and applied as separate states.
`update_downloaded` only proves that the package is cached. Installation success
requires `update_apply_started`, a post-restart running-version switch to the
downloaded target version, and either an applied-version receipt or an explicit
`install-not-applied` recovery state. Active-shell validation checks the
App-managed local authorized macOS installer plus
`auto-update-diagnostics.json#quit-and-install` /
`auto-update-diagnostics.json#install-not-applied`, so a failed replacement is
visible and retryable instead of being mistaken for a completed update.

The transitional managed update plane is App consumption of the OPL Framework
update runner: status/check/plan are read surfaces, and apply/repair/rollback
remain compatibility runner results until native carrier readback replaces their
retained consumers. The App may currently display component receipt refs,
lock/runner status, post-apply sync state, skip reasons, reload guidance and
safe update actions; it still does not implement the update kernel, read managed
artifact bodies, write runtime or domain truth, create owner receipts, mutate
dirty/developer checkouts, silently upgrade Homebrew/system tools, or claim
MAS/MAG/RCA quality/export verdicts.

Release and user-path evidence remains cohort-bound. Evidence manifests,
release-owner records, validators, release artifacts, and workflow outputs own
the artifact classification fields, package-evidence flags, owner-verdict refs,
typed-blocker refs, and install-evidence refs for each cohort. Pending,
typed-blocker, install-evidence, and human-gate refs do not authorize
release-ready, stable/latest promotion, domain readiness, or OPL family
production readiness.

App release-owner receipt records live in `docs/delivery/release/records/` and are
validated through `npm run release:owner-candidate-record:verify`. A recorded
same-cohort owner receipt closes only the App release-owner verdict path for
that cohort; it does not claim OPL family production readiness, domain
readiness, or MAS/MAG/RCA quality/export verdicts.

Detailed run/timing/asset profiles are historical provenance under
`docs/history/process/`. Current release status stays on release owner records,
release artifacts, contracts, workflows, validators, CI outputs, and the release
guide rather than dated status prose.

The approved cleanup tranche is complete. Its current reopening boundary lives in
`docs/active/over-engineering-cleanup.md`, while dated execution details live in
`docs/history/process/2026-07-10-over-engineering-cleanup.md`. Hygiene commands
prove code health only, not currentness, package/install, release, owner acceptance,
or production readiness.

Current release validation is App-root first. Root wrappers prepare App-owned
payloads and call active-shell build/release scripts; `validate:app-root-boundary`
guards that the App root remains the product wrapper and shell build outputs
stay under the active shell checkout. Use `validate:gui-shell` when a change
must prove active-shell validation and GUI compile evidence through the App
wrapper path.

The existing Runtime source is retained as X0-01 and its current behavior is
described below, but it is not a B0/R1/U1 core requirement, default release gate,
or Native phase-1 parity target. Product/page-state/design-system/release hard
gates are now decoupled; full route behavior is checked only by the explicit
`validate:runtime-route` / `test:runtime-route` entries. Runtime page acceptance is declared in
`contracts/app-page-state-matrix.json`: the active shell reads the minimal task
projection through `opl app state --profile fast --json`, uses a 5-10 second
lightweight polling fallback when push projection is unavailable, and exposes
only archive/restore through the Framework action boundary followed by
authoritative refresh/readback. Stage interaction may reveal the complete Stage
order, current/next Stage, and current Attempt, but it cannot lazy-load operator,
provider, State Index, artifact, or safe-action detail. Maintenance diagnostics
and release tooling may independently read full App state or operator drilldown;
release collectors bind those outputs, Runtime screenshots, action receipts,
VM/installed-App smoke, remote verification, and manifests to the same cohort.
Those evidence inputs are not Runtime UI or runtime/domain/artifact readiness
authority.

Current GUI product truth has a compact owner stack: human-readable intent lives
in `docs/product/gui/ideal-interaction-spec.md`,
`docs/product/gui/codex-to-opl-app-delta.md`, and `docs/product/gui/feature-inventory.md`;
machine-readable GUI truth lives in
`contracts/app-gui-product-contract.json`,
`contracts/app-page-state-matrix.json`, `contracts/app-product-profile.json`,
and `contracts/app-shell-adapter.json`. These owners define the ordinary Codex
CLI path, purpose entries, route receipts, model-status surface, Settings
partition, forbidden selectors, Runtime/Settings/Inspector ownership, OMA/MDS
visibility, and
legacy-route redirects. This status file does not duplicate field-level GUI
requirements, literal labels, forbidden-display lists, or test matrices.

Shell alternative work is separated from the active release adapter.
`contracts/app-shell-candidates.json` owns the registry,
`contracts/shell-adapters/opl-native-workbench.json` owns the foreground
alternative adapter when selected, while Hermes and AGUI active-registry entries
are role tombstones whose detailed truth stays in their adapters and runbooks.
`npm run validate:shell-convergence` is the thin aggregate gate for that policy:
it runs the active-shell quick guard and the role-registry-only candidate validator
without maintaining a second JSON readback surface or pulling dormant candidate
detail into default maintenance. `docs/product/gui/opl-native-workbench-plan.md`
owns the active candidate plan. Hermes docs remain prior-candidate reference:
`docs/product/shell-alternatives/hermes-gui-adaptation-plan.md` and
`docs/product/shell-alternatives/hermes-first-run-flow.md`.
`docs/history/shell-candidates/agui-codex-candidate-verification.md` is read only
for explicit AGUI replay or historical audit. Default Stable packaging continues
to resolve `contracts/app-shell-adapter.json` and the active `aionui` shell until
an explicit release-owner decision changes that contract. Public Nightly is the
implemented schedule-only Standard (not Full) prerelease; the first public
publication and follower readbacks remain pending, while historical bytes stay
read-compatible. Its exact boundary is maintained in
`docs/delivery/distribution-and-install-ssot.md`. Scheduled validation uses the
separate non-user Canary lane.

The `opl-native-workbench` route is candidate-structure and non-live product
surface first: candidate registration, adapter contract, independent external
checkout, state/action bridge, basic UI modules, artifact preview tabs,
provenance drawer, starter forms, confirmation/interview cards, desktop/WebUI
same renderer, source visual smoke, package manifest when claimed, docs/runbook,
then later live evidence. K-Dense, OpenClaudeScience / Claude Science, and AGUI
lessons are intake material only: delivery experience, project sandbox,
file/preview/result delivery, structured forms, shared renderer, and
task/provenance framing can be adopted or adapted; external runtime/agent
authority, Pi/DeepAgents/LangGraph-like runtimes, provider/backend marketplaces,
and domain truth ownership are watch-only or rejected.

The closeable current slice is the non-live candidate product surface. It does
not include Live Evidence, packaged GUI acceptance, clean VM proof,
same-cohort user-path evidence, owner acceptance, active-shell adoption, or
release-ready proof. Candidate source/WebUI validation, source visual smoke, and
candidate package evidence must stay tied to the exact candidate cohort before
any stronger technical claim is made.

The current candidate read is technical verification only. Candidate smoke,
manifests, package evidence, shell roadmaps, upstream GUI defaults, and external
reference material do not become App product truth, active-shell adoption, release
readiness, domain readiness, or family production readiness.

Candidate adoption and evidence currentness stay outside this status file.
Adoption requires deliberate App-owned contract changes plus validators,
release-boundary tests, release artifacts, and release-owner decision for the
default adapter.

Release evidence collection is App-owned but cohort-bound. The collector,
manifest validator, release artifacts, release owner records, and release
workflow outputs own the artifact classes and evidence fields for each cohort.
This status file keeps only the authority boundary: current-source or local smoke
evidence does not update a published cohort, does not promote stable/latest, and
does not prove MAS/MAG/RCA/BookForge domain readiness or OPL family production readiness.

Dated local smoke, candidate, current-source release, and migration notes are
compressed under `docs/history/process/`, with no-resurrection rules in
`docs/history/process/retired-surface-provenance.md`. New proof-by-proof records
belong in release artifacts, candidate manifests, CI logs, or precise
history/provenance docs; durable rules fold back into contracts, core docs,
release/testing docs, or the active gap plan.

## Validation Entry Points

```bash
npm run ensure:shell
bun install --cwd shells/aionui --frozen-lockfile
node --experimental-strip-types scripts/validate-active-shell.ts --quick
npm run test:release-boundary
npm run validate:release-boundary
npm run hygiene:fallow -- --format json --summary
npm run validate:gui-shell
npm run validate:shell-candidates
npm run test:candidate:native
npm run validate:candidate:hermes
npm run validate:candidate:agui
bun run i18n:types
bun run test
node --experimental-strip-types scripts/prepare-release-assets.ts build-artifacts release-assets
node --experimental-strip-types scripts/validate-release.ts release-assets
```

Page-state and first-run expectations are declared in
`contracts/app-page-state-matrix.json` and
`contracts/app-first-run-test-matrix.json`.
Product defaults are declared in `contracts/app-product-profile.json`.
