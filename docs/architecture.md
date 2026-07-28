# One Person Lab App Architecture

Owner: `one-person-lab-app`
Purpose: `app_architecture_boundary`
State: `active_truth`
Machine boundary: Human-readable architecture note. Machine-readable truth lives in `contracts/`, source, release artifacts, updater metadata, and test results.

The App product layer is a consumer of the OPL Framework and domain agents:

```text
One Person Lab App
  -> App product contracts and release wrappers
  -> active shell checkout
  -> OPL Framework CLI JSON / contracts / provider receipts
  -> installed OPL Agent Packages and domain-owned projections from MAS, MAG,
     RCA, OMA, BookForge, and future agents
```

The App owns desktop packaging, update flow, first-run product behavior, release
evidence collection, user guides, screenshots, GUI product truth, page-state
tests, and release gates. OPL Framework owns provider integration, generic
discovery/aggregation, action adapters, runtime read models, `opl app state`,
and `opl app action` producers. Temporal owns workflow/activity execution facts.
Domain agents own business task lifecycle, domain truth, quality/export
verdicts, memory body, artifact body, owner receipts, typed views, and blockers.

## OPL Ecology Model And Flexibility Boundary

The intended analogy is:

```text
OPL Base       ~= R
OPL App        ~= RStudio (a replaceable GUI/deployment carrier)
OPL Package    ~= R Package
Registry       ~= CRAN index (discovery metadata, not installed truth)
Build manifest ~= a record of the inputs actually included in one build
```

This model is a product and maintenance constraint, not a claim that the
current implementation is complete. The design target is maximum composition:
any compliant package, shell, registry, or deployment carrier can be added,
removed, or replaced without editing the App for every package. The same
generic complexity must have one owner.

First-party OPL Packages currently publish their complete official bytes to
independent GHCR repositories. Immutable version refs identify exact bytes,
`candidate` carries Preview input, and each Package owner alone advances its
Stable/LKG `latest-stable` after full qualification; bare `latest` is retired
and Nightly is not a Package consumption channel. The shared
`one-person-lab-manifest:latest-stable` is not ordinary currentness and remains
only a Full/offline/integration-test/QA snapshot. GHCR is the official
first-party publication store, while the Package's identity, installed truth,
capabilities, dependencies, task state, and typed views remain carrier- and
executor-neutral.

Package composition, physical carriage, and execution are independent:

```text
OPL Package = executor-neutral identity + capabilities + dependencies
Carrier     = Codex Plugin Manager / Git / OS package manager / local platform
Executor    = Codex CLI / Claude Code / Hermes Agent / future executor
```

Codex Plugin Manager is the first carrier adapter, not the Package identity,
installed truth, capability contract, or only lifecycle authority. The current
ordinary App may remain fixed to Codex CLI without making Package descriptors
depend on Codex plugin ids, marketplace layout, Codex home paths, or manifest
shape.

The target Package boundary is deliberately smaller than a custom package
manager:

1. **Declare identity and presence.** A Package declares its stable identity,
   `kind`, entrypoint, required/optional package or capability identities, and
   optional App descriptors. A required edge means “must be present and
   callable”, not “must match this version range, ABI, digest, payload, or
   cohort”.
2. **Delegate lifecycle.** Codex Plugin Manager, Git, an OS package manager, or
   another configured platform installs and updates the Package through a
   carrier adapter. OPL Framework adds only a thin adapter where a platform
   cannot expose the needed generic operation.
3. **Discover and aggregate.** Framework discovers what is installed, checks
   required presence/callability and executor-route readiness, then projects
   one generic status/action model. It does not need a second copy of platform
   lock, payload, materialization, rollback, or transaction state.
4. **Render dynamically.** App and replaceable shells render Package,
   shortcut, task, and typed-view descriptors without Package-id branches.

`contracts/opl-app-contributions.schema.json` defines the optional
`app_contributions` field of the common Package contract. It is role-agnostic:
any `package_role` may contribute navigation, views, commands, or badges. A
contribution block declares `opl-app-contributions.v1`, contains at least one
non-empty collection, uses stable ids and localized labels or titles, and may
only select the App-owned `list_detail`, `timeline`, `approval_diff`,
`task_board`, `artifact_view`, or `activity_log` view types. Navigation points
to a view in the same block; view commands point to commands in that block;
data, badge values, and actions remain references to Framework-projected or
domain-owned truth.

The App owns this schema and the reusable renderers. Framework validates and
projects Package declarations. Shells resolve the projected references and
render the standard views without filtering on `package_role` or branching on
Package ids. One invalid block is rejected as a unit without hiding valid
contributions from other Packages. A Package or Codex Plugin cannot contribute
React, Electron, HTML, JavaScript, component, filesystem path, URL, or other
executable UI code. Native UI evolution therefore remains an App/Shell release,
while Package integration remains data-driven.

Contribution reads use the Framework-owned `opl app contribution read` broker.
Its successful JSON must contain the `opl_app_contribution` envelope with
`surface_kind=opl_app_package_contribution.v1`, the current Package/ref/operation
identity, and a Package response with
`schema_version=opl-package-app-contribution-response.v1`, `ok=true`, matching
ref/operation, and `result`. The descriptor's current `view_type`, never the
broker response, selects one of the six App-owned renderers; malformed identity,
schema, success, or renderer payload fails closed.

Contribution writes never give the Shell a second mutation authority. The
Package-owned execute broker is an internal Framework delegated surface only;
the Shell may write only through `opl app action execute --action
package_contribution_execute --payload <json> --json`. Until the current App
state/action catalog exposes that exact action, contribution commands remain
hidden or disabled while valid read-only views continue to render. The canonical
action response must wrap the same validated broker envelope at
`app_action_execution.result.opl_app_contribution`.

This is presence-based composition, not version-based dependency resolution.
Breaking interface changes are handled by publishing a new capability identity
or adapting at the owning Package boundary, rather than by growing a central
SemVer/ABI solver. Exact refs, digests, immutable bytes, receipts, and frozen
manifests remain valid for one build or release artifact that must be
reproduced; they are not Package composition, installation, or runtime
readiness prerequisites.

The App owns one **App Official Profile** containing replaceable default root
Packages. Standard and Full consume the same profile. It is evaluated only
during first installation or an explicit user action to restore the official
combination. It is not an ecosystem ceiling, a required fixed closure, or a
background enforcement loop: after a user removes a Package, ordinary startup
and silent maintenance must not reinstall it. Full differs only by carrying an
offline seed for the same desired roots. Required dependencies such as
`MAS -> MAS Scholar Skills` are expanded when MAS is selected; failure affects
MAS only and does not block Base, App, plain Codex, or unrelated Packages.

### Package And Carrier Currentness

The following are separate dimensions and must not share a currentness flag:

| Dimension | Owner and meaning |
| --- | --- |
| Package publication | A first-party Package owner publishes complete bytes to its own GHCR repository. Immutable version refs are exact, `candidate` is Preview input, and only a fully qualified digest advances that owner's Stable/LKG `latest-stable`; bare `latest` is retired. Other owners may use another declared store. |
| Package carrier | Codex Plugin Manager, Git, an OS package manager, or a Package-declared runtime adapter installs and updates one Package. The thin Base OCI adapter only downloads, verifies, and hands off bytes; it never installs or updates a Package. |
| Installed truth | Framework aggregates fresh carrier readback for the complete Package; a Plugin projection alone cannot prove a runtime-bearing Package installed. |
| Executor route | Codex CLI, Claude Code, Hermes Agent, or another executor reports route readiness without redefining Package identity or installed state. |
| Official defaults | App Official Profile selects first-install or explicit-restore roots only. |
| Package maintenance | Each installed Package updates independently through its platform route; App schedules eligible silent updates and renders aggregate status. |
| App release | App Release Bundle and updater publish the App binary. |
| Deployment carrier | Desktop, Container WebUI, Homebrew, or headless installer transports Base/App or an optional offline seed; Native WebUI is an approved target carrier pending its own published artifact and host qualification. |
| Cadence | Daily/scheduled CI checks source health or triggers independent maintenance; cadence does not create a release authority. |

Developer, external, manual, online, bundled, and offline inputs remain valid
carrier/source adapters. Base retains a thin OCI download adapter for first-party
GHCR bytes because Codex Plugin Manager does not consume OCI directly. Codex
owns Plugin/config/cache activation. Base only downloads and verifies OCI bytes,
then hands them to the Package-declared carrier/runtime adapter. The Package
owner defines complete-runtime activation and health, the adapter executes it,
and Framework aggregates fresh readback. This keeps Plugin-only installation
from silently truncating functionality without turning Base into another
Package lifecycle owner. No adapter defines global currentness, and App/Shell
never choose versions or duplicate carrier lifecycle state. Ordinary user
status is limited to installed, updating, current, unavailable, and attention;
raw source, version, digest, lock, payload, receipt, or physical-path detail
belongs only to diagnostics when the owning platform actually exposes it.

### 2026-07-24 Audit And Migration State

This boundary is now partially canonical. Ordinary Package invocation consumes
only the current installed carrier snapshot; it does not read owner or shared
catalogs, select an update, reconcile currentness, or manufacture an
`offline_lkg` success. The current installed lock is a compatibility selection
record for that snapshot, not durable Package authority. Explicit lifecycle
routes still contain repository resolution, lock and payload/materialization,
use/lifecycle receipts, rollback, and a SQLite mutation mutex. Fixed starter
metadata and copied agent-specific runtime consumers also remain. These retained
surfaces must not be deepened and are deleted only after replacement and
consumer-zero proof.
The executable migration and deletion gates live in
[`active/opl-package-platform-composition-migration.md`](active/opl-package-platform-composition-migration.md).

The migration plan is the sole authority for its current phase, implementation
work packages, acceptance and deletion order. Architecture does not authorize
contract/source/public mutation, and this docs lane is not an independent
Stable, Package publication, or Foundry release gate.

The earlier Durable Package study correctly rejected a generic filesystem
transaction engine and cross-Package atomicity, but its smaller
intent/lock/receipt design still assumes OPL owns a package manager. Platform
delegation supersedes that implementation recommendation. Its useful retained
lessons are local failure, fresh readback, no silent overwrite, and independent
Package progress. A mutation owner should provide idempotency and bounded fresh
inspect; a thin adapter must reject external drift, symlink/path escape and
unexpected ownership rather than overwrite them. No durable journal should be
built unless one remaining thin adapter later demonstrates a reproducible crash
gap that its native platform cannot handle, and any remedy must stay
adapter-local rather than recreate Package intent, lock, receipt, LKG or a
shared recovery ledger.

The current first-party online transition is intentionally narrow:

```text
Package owner -> immutable version -> candidate qualification -> per-Package GHCR latest-stable
              -> Base thin OCI download adapter
              -> Codex Plugin/config/cache activation
              -> Package-declared carrier/runtime adapter activation
              -> Framework fresh aggregate readback
```

During migration, explicit maintenance or migration diagnostics may shadow-read
the legacy shared manifest. Ordinary invocation never does. A shadow read cannot
select an update target, define currentness/readiness, or infer installed state;
owner-source failure remains visible attention. The shared manifest may be
removed from ordinary maintenance only
after an unchanged Release Set no longer hides a newer per-Package
`latest-stable`, MAS plus ScholarSkills remain callable without unrelated
updates, Codex Plugin/config/cache and the complete runtime survive restart,
and Full offline installs the same Official Profile without network access.

Release health remains a separate question. `quality_status`, `build_trigger`,
and Latest are independent: Latest is an updater pointer, not proof that the
selected artifact is Stable. Fresh terminal evidence is still required for:

```text
qualified App Stable -> GitHub Latest expected-current CAS -> updater readback
exact published Preview + protected single-use authority
                     -> GitHub Latest expected-current CAS
                     -> non-Stable/skipped-gate disclosure + updater readback
WebUI exact digest -> :stable -> anonymous pull
one installed Package silent update -> dependent presence retained
                                  -> Base/App/unrelated Packages unchanged
```

The carrier strategy is official-capability-first. AionUI/AionCore supplies the
default implementation baseline; OPL contracts authorize only a thin adaptation
or an explicit product cut such as Team. A surface is not disabled merely because
it is absent from an OPL allowlist, and an upstream-absent complex feature is not
privately implemented without a protected B0/R1/U1 user result. Rejected,
retired, and private legacy features are outside the ordinary repair mainline.
This rule reduces fork maintenance without transferring App, Framework, package,
or domain authority to upstream.

GUI 产品定义刻意分层。`docs/product/gui/ideal-interaction-spec.md` 定义不绑定具体 shell 的目标交互：Codex App 形态、chat-first、次级 context 默认收起。`docs/product/gui/codex-to-opl-app-delta.md` 定义 Codex baseline 之上的 OPL 专用增量：purpose routing、domain skill profiles、runtime bridge refs、installation policy、evidence 和 authority boundaries。`docs/product/gui/feature-inventory.md` 跟踪跨 shell 能力清单和参考模式。机器可读验收再进入 `contracts/`、page-state matrices、source、package manifests、smoke evidence 和 release gates。

The current machine-contract compatibility snapshot follows; fields for
assistant profiles, starter metadata, Package invocation receipts, companion
skills, and Package install exposure are not the target Package architecture.
`contracts/app-gui-product-contract.json` is the canonical App-owned GUI product contract. It covers the Codex CLI fixed executor experience, hidden home and ordinary-conversation backend/provider selectors, visible App-owned model/reasoning and user-language permission/access controls, purpose-first home entries, migration-era assistant/profile metadata, the home prompt, and the App-owned Settings IA: seven visible groups over ten stable carrier routes, with Resources & Connections under Connections & Deployment, Instructions & Context under Agents & Capabilities, and Service Status / Updates & Repair / Logs & Diagnostics under Runtime & Maintenance. It also owns About as the bottom auxiliary page, compatibility redirects, startup snapshot/performance policy, first-launch `ready_to_launch` before the first conversation but never before `/guid`, module path source explanation, Stable gates, MDS retirement from default display, and the OPL Flow context shown in Settings. Release quality is Stable or Preview, build trigger is Manual or Automated, and `preview_kind` is derived: Manual Preview is Dev, Automated Preview is Nightly, and Stable has no preview kind. Nightly is therefore the automated Standard-density Preview: one App dispatcher publishes immutable GitHub prerelease assets with `include_full=false` and scheduled `make_latest=false`, while Homebrew and sampled VM run only as post-publication followers. A separate protected single-use pointer operation may temporarily select an exact published Nightly without changing its Preview quality; the next qualified Stable reclaims Latest by default. Canary is a separate validation-only schedule. Authenticated ordinary launch routes directly to `/guid`; fast App state and managed-agent discovery hydrate in the background rather than through a visible `StartupGate`. The installed launch target is at most 1,500 ms from OS launch request to a visible, enabled, focusable Guid composer, but remains an unverified target rather than a measured SLA. Storage owns local data lifecycle inventory, archive/restore proof, runtime pointer prune, updater cache cleanup, and bounded log rotation controls. Current first-party Agent shortcuts are replaceable examples discovered through the Official Profile and Package projection, not a fixed inventory, count, or upper bound. Current invocation receipts, locked payload refs and visible companion fields are compatibility surfaces to delete after generic Package/capability consumers land; they are not target identity, dependency, currentness, or readiness authority. `contracts/app-runtime-bridge.json` is the App-owned bridge contract that binds a replaceable shell adapter to OPL-owned CLI state/action/drilldown surfaces. `contracts/app-product-profile.json` carries desktop session defaults, first-run intent, Full readiness/background maintenance behavior, Settings presentation and startup policy, legacy settings route redirects, install exposure refs, migration-era assistant/profile metadata, and generated shell profile data. App/Shell do not parse OPL Flow's companion Skill list. `contracts/app-page-state-matrix.json` and `contracts/app-first-run-test-matrix.json` define page-state and first-run expectations.

Capability governance follows one authority chain: an installed OPL Flow Package
declares capability intent, configured carriers install missing identities,
Framework checks presence/callability and projects aggregate state/actions, and
OPL App renders that projection. App and Shell do not parse Flow, freeze its
dependency graph, or maintain a second Skill, Plugin, CLI, or MCP inventory.
Standard and Full remain independent carriers; neither requires a Flow lock or
optional payload for App readiness. See
[`capability-governance.md`](capability-governance.md).

Professional agent ownership is deliberately split to keep the App generic.
Every professional agent, including OPL standard agents, is a Package with
`kind=agent`. The App owns the unified Package UX, Home shortcut preference,
Codex launch, and Runtime presentation; the selected platform owns install and
update mechanics; Framework owns only generic discovery, dependency-presence
checks, state aggregation, and thin action adapters. In Settings, Agents lists
discovered Package descriptors with integrated Home shortcut management.
Capabilities separately owns generic Skills, Plugins, and workflow capability
presentation. Neither page owns a professional agent's workflow, task
lifecycle, stage model, prompt internals, artifact schema, or domain verdict.

The minimum target chain is:

```text
App Official Profile or explicit user choice
  -> platform-native install/update
  -> Framework installed discovery + presence check
  -> Package descriptors
       -> Settings row
       -> optional Home shortcut
       -> Agent task projection
       -> optional typed Runtime view
```

There is no App-maintained Agent list beside the Package directory. A new
compliant Package becomes manageable without App code changes. Registry and
direct-manifest sources may remain discovery inputs, but they do not create an
OPL-specific currentness solver. Framework aggregates fresh carrier readback for
the complete Package; no single carrier, Plugin projection, App cache, lock, or
receipt is complete installed truth by itself.
During migration, `contracts/agent-package-surfaces.schema.json`,
`contracts/fixtures/agent-package-manifests/`, starter metadata, package locks,
receipts, `rollback_ref`, and `physical_surface` are compatibility inputs only.
Consumers must move to the minimum descriptor/status model before those mirrors
are deleted.

Home entry ownership is split deliberately for GUI replacement. Agent Package
descriptors provide shortcut label, icon, launch target, and default-visibility
hint; the App stores only the user's visibility/order preference and renders
the result. Existing MAS/MAG/RCA/BookForge/OMA shortcuts are Official Profile
defaults, not hard-coded App identities. Removing a Package removes its
shortcut, and installing any compliant Agent Package may add one without App
source changes.

Skill ownership uses the same simple rule. Codex plugin packaging is the
preferred distribution surface when available; a Package declares required and
optional capability identities, and Framework checks only presence and
callability. A required capability may be another Package, as in
`MAS -> MAS Scholar Skills`. No version range, bundled payload, checksum, or
receipt is required for composition. AionUI-internal skills remain outside
ordinary capability selection. Agent Packages stay in Settings/Agents; generic
Skill/Plugin/Flow capability presentation stays in Settings/Capabilities.

Skill, Tool, Plugin, MCP, Agent producer, and typed-view capabilities are
discovered from installed Packages or their native platform; the App does not
maintain parallel allowlists for any of them. User presentation preferences may
hide entries without redefining availability. Narrow product cuts such as
disabled Team remain explicit negative policy and must not become a general
capability catalog.

The App consumes the OPL three-layer capability model without becoming any of
the three layers' owner. `professional_skill` is the package-declared expert
playbook launched through Codex or a package shortcut. `skill_local_deterministic_helper`
is a helper such as `kernel.py` that travels with that skill pack and may be
displayed as packaged payload/readback. `programmatic_substrate` and
`authority_surface` remain Framework or domain-owned producers: package
validation, connector receipts, runtime queues, App state, owner receipts,
typed blockers, quality/export verdicts, and release evidence. The App may
show install status, shortcut state, launch receipts, and refs-only runtime
projection for all three, but it must not turn helper presence, package
materialization, shell rendering, or App validation into a professional-agent
result, domain readiness, release readiness, or owner acceptance claim.

The home executor boundary is intentionally narrower than upstream AionUI. The App currently fixes Codex CLI as its ordinary executor and shows shortcuts for installed Agent Packages; it is not a general multi-backend agent launcher and does not own a built-in assistant inventory. Active shells may retain upstream AionUI agent/backend settings for development or diagnostics, but the App home path and ordinary Codex conversation path must not surface Aion CLI, Claude Code, backend switching, provider lists, or permission-mode choices as normal user controls. The visible model selector is App-owned and bounded by the product profile.

That fixed-executor product policy does not bind the OPL Package ecosystem to
Codex. Package identity, installed state, Home preference, business Work Item,
required-capability presence, and typed views remain stable across executor
changes. An absent Claude Code or Hermes adapter makes only that executor route
unavailable; it must not make a Package installed through another carrier
disappear. If Codex Plugin Manager is the Package's only physical carrier and
is removed, fresh carrier readback must instead report the Package as
physically unavailable rather than preserving a false installed state.

Settings boundary 也遵循同样拆分。用户看到七个一级组：Overview、Account & Models、Connections & Deployment、Workspace、Agents & Capabilities、Runtime & Maintenance、Preferences；底层继续保留 `general`、`gateway`、`access`、`workspace`、`agents`、`capabilities`、`resources`、`environment`、`storage`、`appearance` 十个 carrier route。Resources & Connections 是 Connections & Deployment 的唯一二级目的地；Workspace 只组织 Working Directory 与 Data & Storage；Instructions & Context 归 Agents & Capabilities，但复用 `workspace#personalization` transport；Runtime & Maintenance 在同一个 Environment carrier 上互斥展示 Service Status、Updates & Repair、Logs & Diagnostics。About 是底部唯一 auxiliary page；Advanced 只 redirect 到 `environment#diagnostics`，Update、Theme、Local Services 和 Personalization redirect 到 owner anchors。Overview 只展示一个 Background tasks 摘要，Temporal server/worker/scheduler 明细留在 Service Status。桌面日志目录归 Logs & Diagnostics；WebUI 只读显示其 carrier owner 投影。Desktop workspace root 走 Framework owner action，WebUI 不修改宿主 bind。首窗从持久化窄快照或 loading shell 渲染，不等待完整 fast JSON 或 drilldown；cold/warm 预算均为 1,500 ms，startup projection 上限 262,144 bytes，完整 fast read 只做共享后台 single-flight，Agents/Capabilities/Storage/About 详情按需加载。Agents 只消费 Framework 汇总的 installed Package descriptors/status/actions；Shell 不读取 registry、manifest、lock、payload、receipt、checkout 或物理路径来合成 Package 行。Overview、runtime、system、model、agent、assistants、skills-hub、tools、display、webui、pet 等 legacy upstream routes redirect 到 App-owned destinations。

Installation and maintenance expose exactly three software objects:

| Object | Architecture boundary |
| --- | --- |
| OPL Base | The Framework-owned headless CLI/runtime prerequisite. Homebrew Formula `opl` and `opl-install.sh --headless --skip-packages` are carrier adapters for the same Base identity. When Base is missing, the App may offer one-click bootstrap through that installer and show progress/readback, but it does not implement, update, repair, or roll back Base. Runtime dependencies and companion-tool integration appear only as `dependency_status` / `integration_status` details under Base. |
| OPL App | The App-owned GUI/control plane and the only software object the App mutates. Homebrew Cask and signed installer/DMG are carrier adapters for the same App identity. Standard updater and host-route state remain App details through `host_update_route` and `host_executor_required`; carrier choice does not change ownership. |
| OPL Packages | Open capability units discovered dynamically; MAS, MAS Scholar Skills and OPL Flow are examples, not a fixed inventory. Carrier platforms own installation/update mechanics; Framework discovers executor-neutral Package identities, checks required presence, aggregates status and per-executor route readiness, and supplies thin action adapters only where needed. App/Shell render the generic projection and never select a version, treat a Codex plugin id as Package identity, or reproduce platform lifecycle state. |

标准 App updater 仍只替换 `opl_app` 二进制。新版本运行后，App 重新读取 Framework 聚合状态；已安装 Package 的静默更新各自走平台原生生命周期或薄 Framework adapter。OPL Flow 不设 App-owned 专用更新路径；App 不复制冲突名单、不直接删除 Skill、不直接写用户 profile，也不从 App 版本切换合成 Package mutation。

`managed_update.components` therefore has exactly `opl_base`, `opl_app`, and
`opl_packages`. The ordinary App has no version/component picker. Full may carry
offline Package seed bytes for first install, but uses the same Official Profile
and platform install path as Standard. User data/artifacts remain a separate
storage and cleanup boundary, not a software updater object.

Runtime is a target core App capability, while remaining display and routing
only. The owner chain is:

| Owner | Runtime responsibility |
| --- | --- |
| Agent Package | Business task identity, lifecycle, user status, progress, next action, and optional domain views. |
| Temporal | Queued/running state, workflow/activity attempt, heartbeat, retry, and terminal execution facts. |
| OPL Framework | Join and validate Agent/Temporal projections; expose one bounded generic read/action interface. |
| OPL App / Shell | Define information hierarchy and render generic fields; never infer domain or execution truth. |

This target supersedes the old `X0-01 retained optional route` classification.
Until contracts/source/tests migrate, that old classification remains current
implementation truth and must not be confused with completion.

Runtime discovers Agent producers dynamically from installed Package
descriptors. A new Agent Package can provide task rows without adding its id to
App scope or availability lists. Package availability stays in Settings;
Runtime shows only tasks from available producers. A failure in one producer or
Temporal binding degrades that producer's rows and does not hide other Agents.

Domain detail uses one typed extension:

```text
task descriptor
  -> views[] { view_id, view_kind, title, availability, read_action }
  -> opl app view read
  -> renderer selected only by view_kind
```

MAS may publish a research-roadmap view, but MAS owns its schema, scientific
semantics, copy, and evolution. Framework validates and proxies the declared
view; App registers only reusable `view_kind` renderers. App must not carry a
MAS schema, stage map, package id switch, or medical interpretation. An unknown
or invalid view kind produces a local unsupported-view state while the task row,
other detail, and other Agents continue working.

OPL App is the local-first workbench for One Person Lab. The current required
surfaces are the macOS desktop App and U1-05 Docker/WebUI on Linux, Windows, a
server, or a cloud VM. They keep the same project, task, artifact, progress, and
receipt language. Hosted OPL Workspace is X0-03 and appears only after account,
storage, isolation, backend, and owner policy exist; it is not a current ordinary
App requirement or default release gate.

OPL App and Docker/WebUI present the same chat-first product model and consume
the same Framework state/action contracts. A conditionally retained OPL Workspace may add hosted URL, account,
isolation, storage volume, and managed-resource receipts, and the user still
sees the same App task flow: choose the work, confirm the resource plan when
needed, run the task, review artifacts and receipts, and continue. When a real
X0-04 owner/backend exists, OPL Console may manage organization policy, users, quota, billing, Workspace lifecycle,
connector approval, environment policy, and managed resource packages for
Console-managed resources. User-provided local, SSH, or HPC resources remain
self-managed unless Framework projections explicitly mark them as
Console-managed.

OPL Fabric is an X0-04 retained resource reference, not an ordinary Settings
top-level product or required App layer. When a real owner/backend exists it appears as refs-only
resource context: OPL Gateway for AI access, OPL Connect for connector
readiness, OPL Compute for local/remote/managed execution, Storage refs for
where work lands, and Environment Catalog refs for template, version, source,
and task fit. The user-facing flow is plan, approve, execute, monitor, collect,
and receipt. The App may display those refs and call `opl app action`; it does
not own compute scheduling, storage authority, connector credentials,
environment bodies, billing, or Console policy truth.

The App runtime/resource/task/data-lifecycle split is kept in one owner matrix
instead of a new control layer. `contracts/app-runtime-bridge.json#runtime_surface_owner_matrix`
binds OPL Runtime Payload / Fabric, Environment Materializer, WorkItemProjection v2,
legacy/current-task TaskRunProjection v2, OPL
Fabric resource refs, local data lifecycle, the active shell, and Homebrew into
their owner roles. The matrix is deliberately narrow: App owns product policy
and release gates, OPL Framework owns family projections and runtime receipts,
Aion renders, and Homebrew mirrors release cohorts only. New runtime/resource
surfaces should extend that matrix and the existing projection contracts before
adding any shell-local task store, resource state machine, cleanup authority, or
distribution currentness gate.

The target Runtime projection keeps Agent business state and Temporal execution
state separate even when both appear in one row. The Agent says what the work
means and what comes next; Temporal says whether execution is queued, running,
retrying, heartbeating, or terminal. Framework joins by opaque task/execution
refs and reports unknown rather than guessing. Shells may filter and render but
cannot deduplicate heuristically, estimate missing telemetry, or turn provider
activity into business progress.

Current-task context, the cross-project Runtime list, and item detail consume the
same owner projection. Artifact provenance, reviewer evidence, workflow refs,
and domain actions remain owner refs; raw logs and Temporal operator diagnostics
remain Maintenance detail. The active shell is a thin renderer, not reviewer
logic, artifact-body access, readiness judgment, or a shell-owned task store.
The historical landing reference is
`docs/product/gui/claude-science-runtime-task-awareness-plan.md`; its MAS-specific
schema is not a target App contract.

The upstream AionUI Team surface is not an OPL ordinary-user capability. It is
configured around shell-local team leaders and agents, so the active shell keeps
Team mode disabled, hides the Team sidebar entry, rejects Team deep links, and
redirects any compatible `/team/*` route back to the App-owned home path. This is
independent from Codex subagents: delegated execution, metadata intake, and canonical
thread discovery already use the Codex runtime plus the single existing App Server
adapter; ordinary Active/Done/detail/open-thread UI remains partial. No shell may
add a second App Server client, Team store, scheduler, or execution authority.

Active shell upgrades now carry an App-owned upstream intake ledger in
`contracts/app-shell-adapter.json#upstream_intake`. Each upstream feature must be
classified as `accepted`, `rejected`, `redirected`, or `requires_app_contract`
before it can ride a release. AionUI Team is classified `rejected` for ordinary
surfaces. The corresponding `implementation_probes` are required release gates:
Team mode disabled, `/team` route redirect, sidebar gate, Team-created redirect
no-op, ordinary conversation Team MCP snapshot scrub, agent switching without
Team MCP inheritance, Team deep-link rejection, and IPC bridge mutation
rejection before HTTP. Ordinary capability MCP filtering is executable data in
the GUI contract and product profile through `forbidden_mcp_matchers` and
`scrub_extra_keys`, not example text.

Live bridge conformance is intentionally opt-in. `validate-active-shell.ts
--quick` validates the App-owned bridge contract by default. When
`OPL_APP_LIVE_CONFORMANCE=1`, `OPL_APP_LIVE_OPL_ROOT` points at a local OPL
Framework checkout, and `OPL_APP_LIVE_ACTION_FIXTURE` names a safe action id,
the same validation runs `./bin/opl app state --profile fast --json`,
`./bin/opl app state --profile full --json`, and `./bin/opl app action execute
--action <fixture> --dry-run --json`. The live check only asserts JSON
availability, fast output below 500KB, and `opl_app_state.v1` schema/surface; it
does not import Framework runtime state or domain truth into the App repo.

The active shell is an external checkout and an implementation carrier. `contracts/app-shell-adapter.json` requires the shell to implement the App GUI contract and declares that upstream AionUI behavior is implementation material only, never App product authority. Root release and validation scripts prepare App-owned payloads and call shell build/test commands, but shell implementation changes belong in `gaofeng21cn/opl-aion-shell` unless the App contract or wrapper itself changes.

GUI operation has two independent axes. The **active release shell** chooses the
Stable implementation carrier and remains owned by
`contracts/app-shell-adapter.json`. A **local GUI launch target** chooses which
installed or developer GUI client to open for one local run; it does not mutate
the active adapter, release role, updater channel, or adoption state. The canonical
operating policy and landing route live in
`docs/product/gui/gui-shell-candidates.md` and
`contracts/app-shell-candidates.json#interactive_launcher_policy`.

```text
App contracts / product profile
  -> local GUI launcher -> AionUI client
                        -> OPL Native Workbench client
  -> App runtime bridge -> OPL Framework state/action
  -> typed host bridge  -> Codex App Server thread/turn authority
```

The clients share this logical control plane, not a renderer dependency tree or
private data store. GUI frameworks, lockfiles, bundles, window state, local cache,
and updater identity remain isolated. Codex thread history remains App Server
authority; GUI-local SQLite/localStorage may hold preferences, drafts, or
rebuildable cache only and must not become cross-shell thread truth. Physical
Runtime parity also requires both clients to resolve the same OPL/Codex cohort and
emit path/version/cohort readback. The App-root launcher now injects that identity
for Native Candidate launches; active AionUI parity and direct Native bundle
launches remain current deviations. Side-by-side installation and sequential launch selection
therefore do not imply safe simultaneous writes to one workspace or thread.

Shell alternatives are intentionally separated from the default release adapter while still remaining selectable for explicit technical verification builds. `contracts/app-shell-candidates.json` declares `opl-native-workbench` as the foreground alternative, with its adapter under `contracts/shell-adapters/opl-native-workbench.json`. The default `contracts/app-shell-adapter.json` continues to define the stable AionUI release shell. Hermes Desktop / `hermes-codex` is retained as the prior foreground alternative reference with its explicit adapter under `contracts/shell-adapters/hermes-codex.json`; its source/package/smoke evidence remains technical verification evidence until a later App-owned adoption decision changes the active-shell contract. `agui-codex` is now an archived AG-UI/CopilotKit technical proof: it remains replayable through its explicit adapter only when AGUI is requested, but it is not a routine candidate lane and should not receive default polish or feature work. The OPL Native Workbench route is the new shell-agnostic route for direct App state/action consumption, shared desktop/WebUI renderer shape, and K-Dense-style delivery experience without importing external runtime authority. The Hermes route remains upstream-first OPL customization reference material: later Hermes replay should record the upstream ref, compare official Hermes Desktop features, reapply the smallest OPL delta, and only then decide what to hide, rename, replace, or elevate through App-owned gates. Hermes must not inherit AionUI/AGUI stable payload, page-state, Full runtime, or WebUI assumptions until a Hermes-native feature comparison records what should be preserved, replaced, or hidden.

Hermes 的 first-run 是一个例外的最低可用性要求：可以复用 Hermes Desktop 的
onboarding/progress UI module，但行为 owner 必须是 OPL App/OPL CLI，不能默认
下载或执行 Hermes Agent installer。候选包启动路径必须分成四条线：每次 launch
只做轻量检查 marker、One Person Lab CLI、Codex CLI、可用 Codex 模型访问和 Codex
adapter startup；只有 marker 缺失、marker 过旧或核心组件缺失时才进入一次性本机
初始化 checklist；完全没有可用模型访问时进入“OPL Gateway”向导，通过
`opl system configure-codex --api-key-stdin --json` 写入 OPL Gateway 访问密钥。已有
Codex/OpenAI 登录或其它可用 provider 时可跳过首启 Gateway 配置，Settings 保留
OPL Gateway 配置入口用于后续切换；`opl system initialize --json`、
`opl system startup-maintenance --json`、`opl packages update --json`、
MAS/MAG/RCA 状态和 contract diagnostics 在 OPL Codex adapter ready、主界面可见后
后台异步执行，不能阻塞热启动进入主界面。如果 `setup.status` 已显示 Codex 模型访问
配置存在，则直接进入 OPL Codex adapter，不等待 `setup.runtime_check`，也不把
runtime 超时作为普通用户首启主错误。Hermes candidate 的 macOS 图标也属于最低可用性边界：
Dock 中必须使用 OPL/AionUI 官方图标族，并保留安全边距，当前 contract 要求 alpha
bounds 不超过 900px，目标资源为 `840x840+92+92`。

A candidate enters App product truth only through App-owned contract updates and validation gates; implementation roadmaps and candidate package evidence remain technical verification until an explicit active-shell adoption decision changes `contracts/app-shell-adapter.json`. A candidate becomes the default release shell only when `contracts/app-shell-adapter.json` is updated deliberately and the runtime bridge remains satisfied, App product profile syncs into its configured target, App page-state and first-run matrices pass, shared desktop/WebUI evidence passes when claimed, App-root active-shell validation passes, GUI package compile succeeds through the App wrapper, and the external checkout history policy is preserved.

WebUI is a delivery surface for the same chat-first App UI, not a second product
authority. A candidate that claims WebUI support must use the same App-owned
product semantics as its desktop shell, preserve the App-owned
`window.oplCandidate` API shape or an explicitly equivalent browser bridge, and
route browser actions/events through a local transport bridge to Codex app-server
and `opl app state/action`. Renderer technology is candidate-specific: AGUI's
React/CopilotKit shared renderer belongs only to explicit AGUI archived-proof
replay, while Hermes WebUI support must be claimed and validated through the
Hermes candidate route before it can count as foreground-alternative evidence.
Electron may use native preload/IPC and native directory picking; browser WebUI
may use HTTP actions and SSE event streams. Neither path may introduce a
separate product profile, runtime truth source, provider selector, memory body
store, artifact authority, release channel, or full workbench first screen;
ordinary WebUI home uses the same default-collapsed chat canvas as desktop.

External agent UI projects can also be recorded as design references without
becoming shell candidates or first-screen product templates. OpenBMB PilotDeck is
currently in that class: its workspace/project rail, chat-first main pane,
grouped files, memory, routing, and always-on context are useful
information-organization references for OPL. OPL maps that reference into a
Codex App-style chat-first surface whose workspace/session rail and right-side
contextual tabs are available only as optional expanded context. Its AGPL-3.0 source, gateway, agent
runtime, memory store, router, always-on store, provider selection, and
WorkSpace state model do not enter App authority. Any future use beyond
reference requires a separate license decision and a normal
`shells/<candidate>` external checkout plus adapter contract, App-owned
state/action bridge, page-state/first-run gates, `.app` package verification,
and release isolation.
