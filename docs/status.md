# One Person Lab App Status

Owner: `one-person-lab-app`
Purpose: `app_status`
State: `active`
Machine boundary: Human-readable status. Use `contracts/` and release/test
artifacts for machine decisions.

Package composition Phase 1 is complete and the Phase 2 controlled breaking cutover is active. The
target SSOT, functionality-equivalence ledger and frozen implementation boundaries live in
[`active/opl-package-platform-composition-migration.md`](active/opl-package-platform-composition-migration.md).
Its exact blob is canonical documentation authority; current canonical contracts/source and fresh
platform readback remain implementation truth. Already-canonical changes are not reverted, but
task commits/worktrees, tests and owner handoffs are only owner-bound checkpoints until fresh-main
absorption and do not prove implementation completion. Framework main now provides owner-channel
Package currentness, installed descriptor discovery, configured-carrier actions, fresh
presence/App-state projection and installed-only invocation. Public Package lifecycle actions can
still reach legacy lock, payload, materializer, receipt, rollback or transaction compatibility code.
The next migration step is the successor-only public action and App/Shell consumer cutover, followed
by fresh `OUT-01..OUT-17` carrier acceptance and one bounded legacy Manager deletion batch. The
role-neutral App-contribution Source chain is canonical across App, Framework, AionUI and Relay;
Pixel, Install, Apple Mail review-path and Release proof remain independently unverified. Phase 2
does not itself authorize Package publication, Stable/Latest, WebUI promotion, real user managed-state
mutation or release claims; those retain their own fresh owner gates.

Plugin native profile pointer: `contracts/opl-native-profile.json` only declares
the repo-native profile used by OPL Flow bundled Skills and drift checks. The
retired standalone OPL Doc repo no longer provides a plugin or profile writer.
It is not GUI product truth, release authority, runtime truth, domain truth, or
installation evidence.

Live Evidence deferred / functional structure first is the current App
development rule. Normal App work should first close functional and structural
gaps: App-owned contracts, active-shell sync, AionUI mainline behavior,
`opl-studio` foreground-alternative boundaries, page-state validation, first-run policy,
Settings / Storage / route receipts, and no-authority runtime/domain guards.
Release cohorts, clean-VM proof, packaged GUI smoke, same-cohort user-path
evidence, real user-directory E2E, owner acceptance, and production-ready
claims remain release/lifecycle evidence lanes. They must not block independent
contract/shell cleanup, and contract validation or shell tests must not be
promoted into release-ready or family production-ready proof.

## Current State

### OPL Link Conversation Baseline

OPL Link 的当前产品 SSOT 是 [`product/opl-link.md`](product/opl-link.md) 与
`contracts/app-remote-companion.json`。2026-09-06 起产品保留、开发冻结，只有用户明确手动重启才继续；
不自动登录、部署、探针、提醒或发布。分阶段重启入口为
[Link delivery plan](https://github.com/gaofeng21cn/opl-link/blob/main/docs/delivery-plan.md)。
目标路线保留 Ably Free + Cloudflare Workers Free +
D1 Free：Ably 负责实时密文和通用推送，Worker/D1 负责邀请、配对、短期 scoped JWT、设备授权与
撤销；OPL Cloud、TKE、Cloudflare Tunnel、本机常驻 Service 和 Tencent provider seat 都不是运行或
发布前置。当前 validation release-cohort contract 冻结了 D1 admission hard limit 20、warning
threshold 15；它是 cohort 配置，不是 Ably/Tencent seat 或 TestFlight capacity。Ably realtime、Worker endpoint 与 APNs 尚未通过移动、联通、电信和 Wi-Fi 选择探针，
因此源码已实现不能表述为目标已可用；探针失败后才允许通过明确 decision 切换单一腾讯 cohort，
不双写、不自动 fallback。

配对前必须匹配 owner `opl-link/service` 的 `release-cohort.json` metadata、完整 `config_summary`
和 `config_digest`；metadata 或 digest drift 必须在 claim/transport connection 前 fail closed。
公共 credential wire 只传递 `transport_provider`、opaque `transport_credential`、`key_epoch`、
`credential_expires_at` 与 `push_recipient_id`，由 selected provider adapter 解码；App、Shell、
Framework 和 Codex core 不解析 provider-specific credential fields。
当前 App 合同区分已吸收源码与占位 validation lock，不能把未部署 Worker/D1、
未验证 Ably/APNs 或未 qualification 的 TestFlight carrier 说成当前可用实现。

App-owned `remote_companion_access` view contract、八态配对投影、六个固定配对/设备动作和
transient-secret boundary 已落在 App schema、GUI、profile、page-state 与 wire contracts 中；
这只证明产品合同已更新，不证明 `opl-link/service`、desktop Connector、iOS、Shell、Ably/Worker
live network、APNs 或 TestFlight qualification 已完成。OPL Link 不复用 Weixin/AionCore 的
`channel_access` 语义，也不能因 view type 不同被过滤。

iOS conversation-first UI、E2EE、Ably 双端 adapter、Connector Package、Worker/D1 及 provider-neutral
wire 已有源码；Host/bridge 有历史集成证据，真实 caller 切换与旧栈清理仍未完成。
旧 Tencent adapters、Go/SQLite Service 和旧 TestFlight carrier build 与目标架构不一致。现有 TestFlight build 对 OPL Link 核心
可用性没有验收意义，只证明编译、签名与上传。后续必须先完成网络探针和真实 Worker/D1 + Ably
纵向链路，再补功能面，最后才进入实机、APNs、三网与 TestFlight qualification。
重启前还需关闭消息额度预算、静默 push 节流、撤销信号丢失与无人轮询回收的设计缺口；
20/15 是验证容量上限，不代表免费额度足以支持持续满载。冻结期间保留这些缺口，不用源码测试冒充关闭。

### Computer Use Implementation Ledger

KimiCU `0.5.4` is the default macOS arm64 Desktop Computer Use provider. App
product/distribution contracts and Full offline seed assembly are canonical.
Framework `main` now owns the pinned materializer, existing Codex MCP registry
write, managed-companion projection/actions, and fail-open desktop startup
reconciliation. The AionUI desktop host already invokes
`opl system startup-maintenance --json` during startup, so Standard download and
Full seed materialization share one default runtime path. Installed-host and
release qualification remain independent:

| Axis | Current state | Owner / terminal evidence |
| --- | --- | --- |
| Contract and product SSOT | `canonical_source_complete` | App contracts plus `docs/product/gui/computer-use.md` |
| Full offline seed assembly | `canonical_source_complete` | Exact `KimiCU.app.zip` seed and App package-manifest evidence |
| Framework materializer and state/actions | `canonical_source_complete` | Pinned identity checks, Standard/Full source selection, install/service/MCP reconciliation, `managed_companions[]`, and owner actions on Framework `main` |
| AionUI default startup caller | `canonical_source_complete` | Desktop initialization invokes the Framework startup-maintenance surface |
| AionUI dedicated Capabilities/TCC UX | `canonical_source_complete` | Shell `main` consumes `managed_companions[]`, renders status, and delegates request/recheck/repair/reinstall through Framework-projected actions with full readback |
| Current source-linked host | `effective_ready` | KimiCU identity/service/XPC/TCC/MCP 10 tools and live `list_apps`/Finder state read passed; Playwright registry uses canonical Framework dependency, MCP 24 tools and real Chrome navigation/snapshot passed; Desktop startup reports both providers `already_ready` |
| Standard online / Full offline installed parity | `unverified` | Clean macOS hosts must prove identical installed identity, path, service, MCP tools, TCC state, and structured browser behavior from their packaged carriers |
| Browser provider | `current_source_linked_host_complete_packaged_qualification_pending` | Existing Codex registry and real system Chrome are effective on the current source-linked host; KimiCU remains visual fallback only; packaged Standard/Full proof remains |
| Packaged Install / Release | `unverified` | Packaged bytes, Standard/Full clean VM first run, same-cohort GUI path, signing/notarization, and public release evidence remain independent |
| Next Stable Computer Use qualification | `pending_next_stable_release` | The next Stable candidate must qualify networked Standard before Standard asset publication and offline-seeded Full before `append_full` asset publication, then bind both tracks plus GUI and public asset readback to that Stable cohort |

Source or contract completion must not be promoted into installed or release
readiness. Dynamic lane owner, worktree, checkpoint, and next-action truth stays
in the fresh OPL Flow worktree lifecycle ledger rather than this status file.
This pending qualification is an event-triggered obligation for the next Stable
release operation, not a resident executor or evidence that the current release
is complete. Current source-linked host evidence cannot substitute for it.

The Full packager now reads the KimiCU identity only from
`contracts/app-release-qualification-input-manifest.json#runtime_payloads.kimi_cu`,
verifies the exact archive, materializes it at
`runtime-payloads/<provider_id>/<version>/KimiCU.app.zip`, and records the same
identity reference and archive evidence in `full-package-manifest.json`. This is
source/package assembly evidence only; installed behavior, macOS TCC, clean-VM
parity, signing/notarization, and public release remain independently unverified.
Framework source now consumes that same identity through
`contracts/opl-framework/managed-computer-use.json`; no second provider catalog,
MCP registry, session store, or Agent loop was introduced. AionUI source also
keeps no provider runtime: its localized Capabilities row is a projection/action
consumer only. Pixel-level packaged interaction remains qualification evidence,
not a source-completion blocker.

CU6 browser-provider source implementation now fixes `playwright-mcp` as the
default structured provider and `playwright` as its existing Codex MCP registry
server id. Framework carries pinned `@playwright/mcp@0.0.79`, reuses its existing
managed MCP registry writer and launches isolated/headless real system Chrome;
Shell remains a configured-entry consumer. Standard and Full share the same
registry authority, writer, enablement, behavior and system Chrome requirement,
while Full gains no second provider, engine catalog, session store or browser
seed.

On 2026-08-11, the current source-linked host passed an effective installed
readback. KimiCU `0.5.4` had the expected Bundle/Team/arm64 identity, registered
service, passing XPC, granted Accessibility and Screen Recording, exact 10-tool
MCP handshake, and live `list_apps` plus Finder `get_app_state` calls. The
Playwright registry entry no longer referenced a task worktree; it resolved the
canonical Framework dependency, initialized with all 24 tools, navigated real
Google Chrome `151.0.7922.77` to `example.com`, and returned `Example Domain` in
the structured snapshot. Desktop startup maintenance then reported both managed
companions `already_ready` with no attention or blocking target.

This is current source-linked host evidence only. It does not qualify Standard
or Full packaged installation, clean-VM parity, same-cohort packaged GUI paths,
or public release; those release readbacks remain `unverified`.

- GitHub repo: `gaofeng21cn/one-person-lab-app`.
- App product repo history policy: clean App-owned history only.
- Active shell: `aionui`.
- Active shell root: `shells/aionui` as an external checkout.
- Active shell source repo: `gaofeng21cn/opl-aion-shell`.
- Foreground alternative GUI candidate: `opl-studio`, an independent shell checkout governed by the App candidate registry and adapter contract.
- App product profile: `contracts/app-product-profile.json`.
- Framework dependency: `gaofeng21cn/one-person-lab`.

The App repo must not merge AionUI history into its default branch. AionUI
upstream-following work stays in `opl-aion-shell`; App product release and user
docs stay in `one-person-lab-app`.

Current GUI development follows one active mainline plus one explicit alternative:
AionUI is the stable App GUI mainline and `opl-studio` is the only foreground
alternative candidate. Retired GUI candidate chains have no current registry,
adapter, validator, command or runbook. Default shell-candidate validation checks
only the fixed AionUI/Studio role registry, while Studio detail remains explicit.
See `docs/product/gui/gui-shell-candidates.md` for the topology and commands.
The App-owned convergence aggregate is
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

First-run and the default Runtime readouts are contract-backed App consumers of
OPL Framework surfaces. Runtime is a core, required default App/Release route;
Native phase-one candidate parity may omit it without changing that product
contract. First-run progress derives from
`opl system initialize --json#system_initialize.setup_flow`. The Runtime route
reads `opl app state --profile fast --json` and consumes only the contracted
Work Item, Stage, Attempt, Token, and visibility projection. Explicit full App
state and `opl runtime app-operator-drilldown --detail full --json` are owned by
Maintenance diagnostics and release tooling, never by Runtime.

The Runtime product rule is a minimal project status surface: Agent -> Project
scope, one row per canonical Work Item, user-facing status, running and elapsed
state, current and total Token usage, current/next Stage, current Attempt, and
read-only next-step/owner semantics. Archive/restore is its only
mutation. Provider/platform repair, managed dependencies, updates, raw
diagnostics, State Index, operator drilldown, logs, command refs, and safe-action
catalogs live in Maintenance; Agent Package lifecycle lives in Agents;
Skill/Plugin/Flow and local capability health lives in Capabilities; artifact
provenance lives in Inspector; complete same-cohort
evidence lives in release tooling. The App remains a projection consumer and
never owns runtime truth, provider implementation, domain truth, artifact body,
owner receipts, typed blockers, domain verdicts, App release readiness, or
family production readiness.

The historical optional X0-01 Runtime V2 cohort's local installed user path was
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

The supported product matrix is `Desktop|WebUI x Standard|Full`. Native and
Container are internal WebUI carriers. Standard and Full use the same product
behavior and Official Profile on each surface; Full adds offline seeds and
never enters Standard updater metadata. This product status does not assert
that any exact carrier is currently public or installed. Live availability,
version, digest, updater, Homebrew, OCI, clean-host, and installed state come
only from fresh owner readback.

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
Stable publication and Latest remain carrier-local and follow the
GitHub-hosted mandatory floor: source/contract/build preflight, exact carrier
publication, remote digest and current-Latest readback, all bound to one
immutable App/Shell/Framework cohort and the selected surface/density. Tart,
clean VM, Hyper-V, and WSL2 checks are asynchronous post-publication optional
certification of those published bytes. Their status is explicit
`passed|failed|not_run|unavailable`; they never block or queue another product
cell. Full remains additive to Standard within the same surface, and WebUI
carrier work remains isolated from Desktop pointer mutation.
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

The completed 2026 cleanup details remain historical in
`docs/history/process/2026-07-10-over-engineering-cleanup.md`. Current maintenance
boundaries live in contracts, source, tests, validators, and release evidence.

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
`contracts/shell-adapters/opl-studio.json` owns the foreground alternative
adapter when selected.
`npm run validate:shell-convergence` is the thin aggregate gate for that policy:
it runs the active-shell quick guard and the role-registry-only candidate validator
without maintaining a second JSON readback surface or pulling dormant candidate
detail into default maintenance. `docs/product/gui/opl-studio-plan.md` owns the
active candidate plan. Default Stable packaging continues
to resolve `contracts/app-shell-adapter.json` and the active `aionui` shell until
an explicit release-owner decision changes that contract. Public Nightly is the
implemented Standard (not Full) prerelease whose production default is one daily
schedule. User-explicit `development_validation` may invoke the same protected
path immediately, with invocation/event/authority identity frozen into its
request and publication receipt; public currentness and follower status require
fresh readback, while historical bytes stay read-compatible. Its exact boundary is maintained in
`docs/delivery/distribution-and-install-ssot.md`. Scheduled validation uses the
separate non-user Canary lane.

The `opl-studio` route remains a foreground candidate with an independent
Preview channel: candidate registration, adapter contract, shared Desktop/WebUI
renderer and Host core, authenticated Cloud WebUI, local three-carrier evidence,
and an App-validated immutable OCI handoff. The OCI admission permits only the
dedicated Studio Preview repository and fixed signing identity; it does not make
Studio the active shell, mark App release readiness, or activate an OPL Cloud
Workspace. K-Dense and OpenClaudeScience / Claude Science
lessons are intake material only: delivery experience, project sandbox,
file/preview/result delivery, structured forms, shared renderer, and
task/provenance framing can be adopted or adapted; external runtime/agent
authority, Pi/DeepAgents/LangGraph-like runtimes, provider/backend marketplaces,
and domain truth ownership are watch-only or rejected.

The closeable current slice includes candidate source and an independently
signed Studio WebUI Preview OCI handoff. It does not include Cloud activation,
App Stable adoption, clean VM Desktop proof, owner acceptance, or App
release-ready proof. Candidate and Preview evidence must stay tied to the exact
Studio/App/Framework/DSH cohort before any stronger claim is made.

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

Dated local smoke, candidate, current-source release, and migration notes remain
under `docs/history/process/` or in Git history. Durable rules belong in contracts,
core docs, source, tests, release artifacts, or the active gap plan.

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
npm run test:candidate:studio
bun run i18n:types
bun run test
node --experimental-strip-types scripts/prepare-release-assets.ts build-artifacts release-assets
node --experimental-strip-types scripts/validate-release.ts release-assets
```

Page-state and first-run expectations are declared in
`contracts/app-page-state-matrix.json` and
`contracts/app-first-run-test-matrix.json`.
Product defaults are declared in `contracts/app-product-profile.json`.
