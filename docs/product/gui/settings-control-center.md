# Settings Control Center

Owner: `one-person-lab-app`
Purpose: `settings_control_center_product_authority`
State: `active`
Machine boundary: 本文解释 Settings 的产品职责与信息架构。机器真相归
`contracts/app-settings-control-plane.json`、App GUI/page-state contracts、validators、
Shell source/tests 与 installed evidence；本文不拥有 Framework runtime 或 domain truth。
Package/Capability 页面只消费动态 owner projection；退役的 resolver、lock、payload、
materialization 或 rollback 镜像不构成文档要求。
Machine contract: `contracts/app-settings-control-plane.json`
GUI product contract: `contracts/app-gui-product-contract.json#settings_navigation`
Page-state contract: `contracts/app-page-state-matrix.json#pages`

## Product Boundary

Settings is the App-owned OPL Control Center. The active shell is an
implementation carrier. It must not infer navigation, page ownership, search,
readiness, or update behavior from upstream or legacy shell defaults.

The root design rule is **one user question, one owner page**:

- Overview summarizes overall usability and links to the owner page. It does
  not become a second account, model, workspace, or diagnostics page.
- A non-owner page may show a compact status needed for its own decision and a
  link to the owner. It may not repeat the owner's details or controls.
- Configuration, status, one-time actions, and diagnostics remain distinct.
  Moving a control into a technical-details disclosure does not change its
  surface type.
- Fast state is for immediate rendering. Expensive checks run at startup, in
  the background, or after an explicit user action; navigating to a page does
  not silently start them.
- Unified Package management means one compact App experience over native
  platform lifecycle. Settings must not reproduce Package, Skill, Tool, Plugin,
  MCP, Agent, or typed-view authority.

These contracts own seven user-visible primary groups over ten stable carrier
routes, About as the bottom auxiliary page, compatibility redirects, Settings
search, page experience and DOM requirements, and the Codex quiet visual grammar.
They do not own runtime truth, provider implementation, domain truth, release
readiness, installed App currentness, or owner acceptance.

## Application Management Surface

`/apps` is the App-owned management surface for the OPL software ecosystem and
connected external sources. It is reached from the primary navigation as **软件中心** and answers
four related questions in one place: which applications are installed and
usable, which installed objects need an update or repair, which shared knowledge
or connection resources are available to the current local environment, and
which public or authorized software sources supply the catalog.
The page is a coordinator and projection surface; it does not
become a second Package registry, updater, credential store, or knowledge base.

The machine contract is
[`contracts/app-gui-product-contract.json#pages.app_management`](../../../contracts/app-gui-product-contract.json)
and its page-state entry is
[`contracts/app-page-state-matrix.json#pages[id=app_management]`](../../../contracts/app-page-state-matrix.json).
Software and Updates are primary sections. Software Sources is a management entry.
The routes remain addressable with `?section=applications`, `?section=updates`,
`?section=sources`, and the compatibility redirect `?section=resources`. Desktop branded
links admit these exact section routes and the legacy Updates route through the App-owned allowlist;
unknown query parameters, sections and fragments remain invalid. Applications
uses the dynamic software and component projections, Updates uses the managed-update and App
updater projections, and the legacy Shared Resources route redirects to Settings, which consumes
`app_state.application_management` for authorized resource relationships.
Framework owns these projections; App owns their navigation, presentation and
interaction contract. The `section_sources` map makes each section's producer
explicit and does not establish an App-owned data registry.
Software Sources consumes `app_state.agent_packages.sources` for source metadata,
access state, and available connection or check actions. Software Center and resource Settings share
the same owner-projected action and fresh-readback
rules; the application-management projection keeps provenance references to
the Package, update, connection and knowledge owners. Installation,
operational readiness, and currentness remain separate axes, and a mutation is
successful only after fresh owner readback.

The existing Settings routes remain compatibility routes and deep links:
`/settings/agents` and `/settings/capabilities` reach the applications view,
`/settings/environment?section=updates` reaches updates, and
`/settings/resources` opens the sole libraries and business connections settings surface. They must use the same
projection and action owner rather than maintain a parallel list or state
store. Shared resources may include an Obsidian or other personal knowledge
source, connection handles, authorization, revision/freshness and readiness
summaries. The source body, credential secret and owner write semantics stay
with Framework, Connect, Obsidian or the relevant domain owner.

Settings is the sole resource configuration surface, labeled **资料与连接 / Libraries & connections**. It manages
existing knowledge libraries, business accounts and explicit application access.
Show readable owner-saved names, workspace context, authorized applications and
available/review-due record counts. Existing libraries can be renamed through the
same revision-checked owner action; missing names use contextual labels rather
than internal IDs. Group consumers by package identity while preserving each
domain's existing read and maintenance grants. Keep checks, disconnect actions
and history in disclosures; put machine identifiers and revisions in technical
details. OPL Link and messaging configuration belong to remote settings, models
and model access belong to their settings pages, and dependencies use existing
component/update management. Software source access has one contextual link to
Software Sources. Keep the existing `resources` route. `/apps?section=resources` is a compatibility redirect to Settings. Software Center summarizes missing access and links with the selected software/resource focus; it never renders resource forms. Owners or plugins declare approved settings contributions, Framework validates and projects them, App chooses their placement, and Studio renders them in its shared settings container. Plugins cannot add top-level navigation.
Knowledge configuration consumes
`settings_control_center.app_settings_read_model.resource_sources` and the
Framework [knowledge-source management contract](https://github.com/gaofeng21cn/one-person-lab/blob/main/contracts/opl-framework/knowledge-source-management-contract.json).
It offers source selection and the owner's connect, check, configure and
disconnect actions. A source root may be entered in the explicit configuration
flow, but public projections never echo filesystem paths or knowledge bodies.
The Profile or Workspace owner retains the registry, binding and grants.

A first load is a loading state, not zero installed applications or disconnected
accounts. A failed refresh retains the last successful projection with a stale
notice and retry. Unread counts and readiness stay unknown. The page uses the
same confirmation, single-flight dispatch, feedback and receipt controls for
Package and resource actions, followed by fresh readback of the same object.
An unknown mutation result is inspected through its owner and is not replayed.

Public and authorized private sources use the same catalog and lifecycle
controls. Authorization filters private metadata before rendering or counting;
revocation hides uninstalled private entries and preserves only the minimum
local installation record and permitted local actions. Uninstall, disable and
remote update remain distinct operations. A missing optional application is an
available choice; an installed failure or missing required resource is an item
needing attention.

Public and authorized private sources use the same Framework catalog and lifecycle
controls (`agent_packages`, `public-registry:opl`, and authorized `github-packages:<owner>`
sources). Legacy Homebrew Tap `native_items`, `source_setup`, and multi-installation
switching are retired. Public `public-registry:opl` refreshes catalog metadata through
owner-projected `source_refresh`; authorized private sources continue owner-gated
check, configure, and disconnect actions without exposing credential values.

### Software catalog

The canonical catalog, filter, icon provenance, and cross-platform lifecycle standard
is defined in [软件管理](software-management.md). Within `/apps` and its Settings
compatibility routes (`/settings/agents`, `/settings/capabilities`, `/settings/environment?section=updates`):

- default scope separates OPL-maintained software, external/third-party plugins & skills,
  and runtime dependencies (including optional bundled Codex extensions such as PDF);
- maintenance origin is projected by Framework rather than publisher strings or carrier paths;
- development access counts as installed without implying preview maturity;
- public Package, authorized private, and Studio external capability channels share one OPL
  catalog and owner-action model without displacing native package roots, Obsidian vaults, or credentials.

### DSH-derived Studio Settings

Studio reuses the pinned DSH Settings shell, layout, theme tokens, and selected controls as
source without importing DSH connection, credential, model-provider, session, or
plugin-runtime authority. `One Person Lab` is the sole user-visible product name;
`OPL Studio` remains an internal implementation codename.

DSH General, Models, Plugins, and Agent Presets supply presentation primitives, mapped to
OPL owner routes without matching legacy shell route counts:

- a local preference completes only after persistence and immediate renderer readback;
- an App/Framework/Package action completes only after owner execution and fresh readback;
- a dynamic Package setting renders via `settings.section` and disappears with its scope;
- a status without an action stays read-only and links its owner route (never inert toggles or optimistic success).

An API key write and live Codex refresh report independent results: once Framework confirms
a write, a deferred or failed refresh reports that the key was saved and model access still
needs recheck rather than turning the write receipt into a failure. Studio adoption details
stay in [Studio product boundary](opl-studio-plan.md).

### 大包下载与后台安装

Package 安装、更新和修复通过 Framework 后台入口执行。确认前显示发布方版本、下载量、已有缓存、安装位置与可用磁盘空间（旧制品缺解压大小时标明待下载后核实）；只有下载阶段展示真实字节进度与剩余时间，其余阶段只展示阶段名称。取消仅在安全阶段生效并保留已下载缓存；Framework digest cache 仅复用传输字节，成功仍以原生 carrier 回读为准，且不与 DSH 官方 npm 插件共享安装 registry。

## Startup Performance Boundary

The first interactive Settings window renders from a persisted narrow snapshot
or a stable loading shell. It never waits for the complete
`opld` `app.state.get` (`profile: "fast"`, v1 CLI: `opl app state --profile fast --json`) payload or for page drilldowns. The full
fast projection refreshes once in the background and is shared across routes;
opening another Settings page does not restart the global read.

The contract budgets both cold and warm first-window readiness at 1,500 ms and
the startup projection at 262,144 bytes. Agents, Capabilities, Storage, and
About drilldowns load only when their owner page needs them. These are source
and test budgets, not installed-App evidence: after owner absorption and
packaging, release acceptance still requires real launch-to-first-window and
Settings-readiness timing against the exact installed cohort.

## Configuration Catalog

Settings projects one catalog from three owner classes; it does not create a
second state database.

| Owner class | Truth and persistence owner | Examples | App responsibility |
| --- | --- | --- | --- |
| `framework` | OPL Framework | workspace root, update channel, developer supervisor, Home visibility | Place the item and call the Framework action. Never copy its current value or redefine action metadata. |
| `app_local` | Desktop App or shell adapter | model and reasoning preference, App log directory, window behavior, notifications, fonts, scale, theme | Reuse the existing App store or bridge and provide local readback. |
| `credential_connection` | Gateway, credential, remote-access, or OPL Connect owner | Gateway account, manual API Key, external connections | Display redacted readiness or handles and delegate writes. Secret bodies never enter contracts, App state, logs, or generic action JSON. |

Every item has one stable id, page, anchor, truth owner, write route,
persistence target, and verification route. Framework values come from
`app_state.settings_control_center.configuration_catalog.items` and typed
host-owned metadata comes from
`app_state.settings_control_center.configuration_catalog.host_owned_configuration_surfaces`;
user-managed connections come from
`app_state.settings_control_center.connection_registry`. External custom assistant
catalogs remain outside the OPL product catalog; hiding legacy assistant routes
does not delete existing data.

### Startup Loading And Recovery

Settings distinguishes loading, refresh failure, and empty confirmed configuration.
Framework timeouts or exit failures must never render as signed-out or zero agents,
or overwrite the last successful readback (keep cached state with a stale marker and
inline retry). Each runtime-backed page exposes one quiet trailing refresh button
beside its heading; Preferences requires no global Framework loading/error gate.
Refreshing page state is scoped to display readback and never logs in, updates
packages, refreshes billing usage, or rescans storage.

## Canonical Information Architecture

`settings_navigation.settings_ia` owns the visible hierarchy. Product groups express
user intent; carrier route ids remain stable adapter identities.

Each top-level group answers one user question and shows its title once. When
the active group has multiple second-level destinations, show the group title
as the single H1 and a compact destination tab list below it. The selected tab
names the tabpanel; do not repeat it as a second H1. A group with one
destination opens it directly with that destination as its single H1 and no
one-item tab strip. Native rail labels remain navigation context, not content
headings. On mobile, show a vertical category list followed by the selected
group's destination list and a visible return control; do not use a horizontal
tab strip.

| Primary group | Second-level destinations | Carrier route / anchor |
| --- | --- | --- |
| 概览 | 概览 | `general` |
| 账户与模型 | 账户与访问；模型与执行 | `gateway`; `access` |
| 资料与连接 | 资料与连接 | `resources` |
| 工作区 | 工作目录；数据与存储 | `workspace#current-workspace`; `storage` |
| 能力与指令 | 能力配置；指令与上下文 | `capabilities`; `workspace#personalization` |
| 运行与维护 | 服务状态；更新与修复；日志与诊断 | `environment#services`; `environment#updates`; `environment#diagnostics` |
| 偏好 | 偏好 | `appearance` |

“关于”是七组之外唯一的侧栏底部辅助入口，与主组保持独立间距，不作为第八个普通设置类别。
DSH 固定版本的原生 rail 只提供平铺注册行；About 仍使用该原生行及 store，仅由 OPL 的
局部布局适配定位到底部。Advanced 退役并重定向到维护诊断。桌面端进入当前一级组后在
内容标题区按「主标题与刷新 → 二级 tab list → 当前 tab 说明」顺序渲染；移动端先显示纵向分类列表，再进入带可见返回控件的二级列表，
禁止把十个 carrier route 平铺成横向 tab strip。

工作区只组织工作目录、权限、项目/任务产物位置和数据存储。用户级 `AGENTS.md` 与新对话附加说明
归“能力与指令 > 指令与上下文”；App 日志目录、服务证据和技术诊断归“运行与维护 > 日志与诊断”。
资源、外部连接与部署入口只归“资料与连接”，不再借用“账户与模型”的语义。现有 route、anchor
和 typed host action 继续作为兼容 transport，但不得反向定义可见归属。

## Redirects

Compatibility routes resolve before rendering and focus the owner anchor:

| Source | Owner target | Anchor |
| --- | --- | --- |
| `/settings/update` | `/settings/environment` | `updates` |
| `/settings/theme` | `/settings/appearance` | `themes` |
| `/settings/local-services` | `/settings/environment` | `services` |
| `/settings/personalization` | `/settings/workspace` | `personalization` |

The hash-router adapter transports the anchor as `section=<anchor>` and then
focuses the programmatically focusable section. It must not append a second URL
fragment.

Legacy `/settings/advanced` and `system` resolve to
`/settings/environment?section=diagnostics`. They never mount or select an
Advanced sidebar item. About is never redirected through Advanced.

## Surface Model

Every page declares all four inventories, including empty arrays:

1. **Configuration** is a persisted preference. A one-time command is never a
   configuration item.
2. **Status** is read-only evidence inside its owner group. Pure readiness,
   path, count, or permission state is not a standalone card.
3. **Action** is an explicit command such as open, check, update, repair,
   cleanup, archive, or restore. It remains adjacent to its object and keeps
   confirmation, progress, and receipt boundaries.
4. **Diagnostic** contains raw paths, refs, ids, receipts, payloads, or logs.
   It is read-only and opens through an explicit modal or drawer.

The four surfaces may not be mixed to make the layout look simpler. In
particular, repair is not a setting, an update check is not status persistence,
and a path shown in diagnostics is not a second path configuration.

## Ownership Map

| Question | Owner | Allowed summaries elsewhere | Forbidden duplication |
| --- | --- | --- | --- |
| Who is connected to OPL Gateway and what account, usage, Key, or credential state applies? | Account & Access | Overview: signed-in identity, connection and availability, plus compact today token, cost, and balance summary. Models: access-source summary and owner link. | Full account card, total historical usage or cost, login, Key lifecycle, refresh, or disconnect outside Gateway. |
| Which model source, default model, and reasoning preference apply? | Models | Overview: overall model-access readiness. Models may show Codex availability without its version. | Gateway account and credential controls, Codex version, or update actions on Models. |
| Which workspace is active and writable, and where are project artifacts stored? | Workspace > Working Directory | Overview may count an actionable exception. | User instructions, App logs, Framework/raw paths, or four separate normal-state cards. |
| What global instructions and new-conversation context apply? | Capabilities & Instructions > Instructions & Context | The existing Workspace personalization route remains a carrier transport only. | Presenting either editor as a Workspace or Preferences child. |
| Where are App logs and diagnostics, and what needs maintenance? | Runtime & Maintenance > Logs & Diagnostics | Storage may link to the resolved log path read-only. | Presenting logs under Workspace or duplicating the log-directory setting in Storage. |
| Which extensions and apps are installed, and where are their status and updates? | Software Center | Overview and Capabilities link directly to Software Center; Home may show an enabled shortcut. | A second Package manager, fixed package list, or package status sections scattered across Service Status and Resources. |
| Which Skills and Plugins are available? | Capabilities & Instructions > Capability settings | Agent dependency readiness may link here; technical upstream integration rows disclose only when Technical details is enabled. | A hardcoded Flow list or a second lifecycle authority. |
| Which external resources, connections, and deployment entry points are available? | Libraries & Connections | Other pages may link to a resource. | Built-in OPL Gateway connection or Gateway count; selected local workspace controls. |
| Are Codex and background services available? | Runtime & Maintenance > Service Status | Overview shows one compact Background tasks summary. | Update controls, log configuration, raw paths, or receipts. |
| Which managed dependencies need updates or repair? | Runtime & Maintenance > Updates & Repair | Overview, Models, and Service Status may show only a compact Codex readiness state. | Repeating Codex versions, update channels, update policy, or update actions on other pages. |
| How much local and Docker data is used, where are deployment locations, and what can be cleaned safely? | Data & Storage | Updates & Repair may link to cleanup attention; the Logs & Diagnostics-owned log path may be referenced read-only. | Log-directory configuration, mount rewiring, or generic Docker prune. |
| How should the App behave and look? | Preferences | Theme legacy routes redirect here. | Workspace paths, user instructions, or new-conversation additions. |

### Knowledge and executor memory

The [Framework knowledge policy](https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/policies/knowledge-source-and-memory-policy.md)
and [knowledge sources contract](https://github.com/gaofeng21cn/one-person-lab/blob/main/docs/specs/knowledge-sources.md)
own source identity, scope, access, accepted revisions and task snapshots.
Settings preserves the following ownership distinctions:

| Data | Truth owner | App surface responsibility |
| --- | --- | --- |
| Editable business knowledge | Product, user/team, topic or project owner; each knowledge object has one editable source, including an existing personal library or business workspace | Consume declared owner projections through the capability workspace. Source review and writeback go to that owner through the Framework path. |
| Current domain state | The domain owner, with its observation date and revision | Display its current projection. A UI cache or saved summary does not become a new authoritative fact. |
| Runtime evidence | Framework/runtime and the relevant domain owner | Show references and diagnostics for the version actually consumed. Evidence retention does not create an editable knowledge source. |
| Codex executor memory | Codex memory in the active `CODEX_HOME/memories` | The existing memory service reads canonical Markdown and manages correction notes for that owner. Those notes do not update business knowledge or authorize an action. |

The existing task-memory route remains refs-only. A declared Package contribution
can expose knowledge review when its owner provides that capability; this policy
does not claim a new built-in knowledge editor. Selecting a working directory
neither grants access to a personal library nor creates a personal knowledge root.
App and Studio do not maintain Vault copies or a second source registry.

### Connect authorization

Libraries & Connections renders Framework Connect's
`settings_control_center.app_settings_read_model.connections.authorization`
projection. It shows a redacted connection status and account label, pending
requests with their exact consumer identity and requested capabilities, grants
per consumer, and at most 20 recent invocation summaries. Connection handles,
endpoints, invocation arguments, results, errors, and credential material never
enter this UI state.

Approval is a trusted App-user operation through the dedicated
`approveConnectionAccess({ requestId })` bridge. It is not exposed in the
generic App action catalog, Agent tools, or MCP App bridge. Denial and revoking
one consumer grant use owner actions; revocation leaves the connection and
other consumer grants intact. The page can import an existing Relay mailbox by
its owner-projected `mailbox_ref`; this is the Relay identity and is distinct
from `connection_id`. Relay continues to own mailbox semantics and mail
actions. An import does not grant mailbox access to a consumer.

## Extensions and App visibility

“软件中心”是全部动态 Package 的统一安装、管理、升级与状态入口，默认显示所有来源，
包括私有和本地包；设置“能力与指令 > 能力配置”承载技能、MCP、桌面操控（Computer Use）与伴随配置，并提供直达软件中心的紧凑入口。
每项已装软件包显示名称、版本、来源、安装状态与 Framework 提供的操作。

安装与 OPL App 使用是两个独立选择。“在 OPL App 中启用”默认开启；用户关闭后，
Framework 保留目录与安装状态，但移除该包在 OPL Desktop/WebUI 的页面、导航和其他界面入口。
已打开的包页面返回工作台，隐藏内容不继续自动读取。该选择持久保存，不改变 Codex 的
插件启用、Skill、MCP App 调用或原生安装，也不因升级或重新发现而自动恢复。

包提供的设置和状态统一放在该包的展开详情中，只有包已在 App 中启用且详情展开时读取。
“服务状态”只保留 Codex、后台任务引擎（Runway）和已接入运行环境等基础运行条件；“资料与连接”通过页面分段分别承载资料库/外部服务与远程访问/独立 WebUI。
所有安装、更新、修复和 App 开关都经现有 Framework 投影与 App action 执行，不维护额外注册表。

列表直接提供“在 OPL App 中启用”开关；安装状态、已安装版本与来源保持可见，关闭后仍能在目录中找到并重新启用。
普通可用包不在列表主动作位置重复显示“更新”；更新和修复保留在展开详情，没有新版本证据时不暗示存在待更新项。
目录数量只在筛选结果摘要中出现一次。页头说明只解释本页用途；开关说明只解释影响范围，不重复安装说明或内部机制。

设置页统一使用一条阅读列、同一组标题层级、对齐的设置行、DSH 官方控件原语（Switch / SegmentedControl / Button / Modal）与状态样式。每项主动作贴近对象，
成功或失败反馈紧邻操作区域；技术字段、上游接入进度与完整回执只在显式展开或开启技术详情时展示。

## Visual Contract

Settings keeps the OPL information architecture while using the current DSH visual
source and App visual-system rules: a single reading lane, unframed sections,
flat internal rows, monochrome utility icons, `0.5px` hairlines, DSH standard radii/type tokens, and color reserved for typed
status or brand actions (with DSH primary blue focus ring). It does not turn complex OPL controls into a page-wide
list wall or nested cards.

- the compact footer always shows the connected Gateway display name, otherwise
  Settings; when connected in wide sidebar it preserves a single accessible text label while showing a subtle trailing Settings icon cue; it opens Account & Access or Overview;
- only a confirmed newer App version adds a subtle trailing update action on
  that same account row; on desktop this reads the same main-process updater
  store as About and Maintenance, while WebUI falls back to the managed
  `opl_app` projection only because no desktop updater exists there; the footer
  has no theme, return, or help shortcut;
- Preferences exposes System, Light, and Dark only; the CSS theme gallery and
  custom editor are hidden, while legacy theme data is preserved but inactive;
- the governed OPL visual baseline remains active in all three appearance modes;
- primitive geometry comes from the pinned DSH cohort and App visual-system contract;
- raw diagnostics stay out of ordinary pages and open only through an explicit
  Diagnostics action.
- Settings 侧栏第一行在搜索框上方提供“返回应用 / Back to app”；展开态显示图标与文字，
  折叠态保留 tooltip 和 accessible name，窄窗口复用标题栏返回并使用同一个非 Settings
  destination resolver。桌面标题栏不得再渲染第二个重复返回按钮。

The App product profile and active Shell generated profile must project the
complete visual-system object. A stale generated profile must not restore the
retired theme gallery, footer toggle, or old account destination.

## Page Contracts

### Overview

Overview answers whether the App is usable, what needs attention, and what the
next useful action is. Its normal first viewport contains:

- one overall usability summary led by Codex CLI and model-access readiness;
- signed-in Gateway identity, connection and availability, plus compact today
  token, cost, and balance summary;
- one persistent **Background tasks** summary derived from explicit Framework
  **Runway** (`app_state.services.runway`) and **Schedule runner** (`schedule_runner`) readiness;
- an impact-ordered exception queue;
- one next useful action.

When all required background components are ready, Overview shows one quiet
available row; explicit service/worker readiness overrides aggregate status. An
unready, unknown, or stale chain contributes one root-cause item to the attention
queue (deduplicating matching `family_runtime_provider` and fast-projection
background-task errors into one entry) and links to Service Status. Incomplete
startup self-check data renders as incomplete results rather than synthetic false or
`0/0`. Downstream components show waiting state instead of generic duplicates.
Service, worker, schedule, and supervisor details never expand on Overview.

It does not show the full Gateway account card, total historical usage or cost,
managed Key detail, login or connection-management controls, workspace path, a
copy of every Settings page, or a second technical summary. Necessary direct
Codex and Gateway technical rows appear once; raw paths, receipts, payloads, and
owner-page diagnostics stay on their owner pages.

### Account & Access

Account & Access is the single owner for:

- account login and the manual API-key path;
- full public account identity and localized connection state;
- balance and today's usage as primary metrics (cumulative totals disclosed on request),
  managed Key name/status, and local freshness time;
- refresh, connection completion or repair when required, and disconnect.

The account card appears only for an account connection. Manual-Key-only and
disconnected states do not render account balance or usage. Desktop and WebUI submit the email and password to the trusted Host. The Host
calls the Framework `connect.gateway.login` RPC. CLI callers can use
`opl connect gateway login --credentials-stdin --json`. The renderer receives
only the login result, refresh instruction, and any public error code.

The renderer may keep only the declared public projection as a derived
last-known-good cache. It shows that cache immediately, executes
`gateway_account_refresh` once when the page opens, and consumes
`app_action_execution.result.gateway_account` without waiting for the complete
fast App-state aggregation. Manual refresh uses the same owner action. Refresh
failure preserves the cache with a stale marker.

### Models

Models owns model-access readiness, the real
`app_state.core.codex.model_access_source`, selected and default model,
and reasoning preference for new conversations. It may show whether the active
Codex CLI is ready, but the version and update policy belong only to Runtime &
Maintenance > Updates & Repair.

Custom-model access belongs to Models, immediately after Default model, in a
collapsed **Advanced model options** disclosure. **Enable custom models** is off
for new and migrated users, uses the existing App-local Settings store, and is
searchable in both languages; a search result opens the disclosure and focuses
the switch. It is independent of Technical details and only expands explicit
fixed-model choices. Auto keeps the App default (`gpt-6.2-astra + max` currently)
and App-admitted compatibility fallbacks; it never adopts a custom catalog row.
The page presents a readable Auto-reasoning policy summary alongside manual model
selection and exposes the effective agent permission preference shared with the
composer (keeping legacy `confirmBeforeExecute` compatibility data hidden rather
than rendering an unimplemented toggle).
The switch explains that other models may change standard-Agent behavior. A
custom fixed selection shows the same notice near the composer. Disabling access
preserves that selection as unavailable and blocks subsequent sends until the
user restores Auto, chooses an admitted model, or explicitly re-enables access.
The composer model menu retains its model, reasoning, and reset rows.

When credentials need attention it exposes one route to Account & Access. It
does not show the Gateway account card, balance, usage, login form, manual Key
form, managed Key lifecycle, raw provider paths, Codex CLI version, or update
controls.

### Workspace

Working Directory shows the active logical workspace identity, resolved path,
and writability once in one normal-state summary. Permission or trust detail
appears only when attention is required. Filesystem health and writability
override executor permission mode when deciding usability.

On Desktop, the Framework-projected workspace action may change the logical
root and must return a fresh readback. Standalone WebUI shows the actual
owner-projected logical root read-only and never executes `workspace_root_set`.
Only after the carrier confirms Docker deployment identity does
`OPL_WORKSPACE_ROOT=/projects` make Settings show `/projects` read-only. Neither
WebUI form changes the host projects bind mount. Changing the standalone root or
Docker host source directory is a host/deployment action outside the browser,
not an in-App workspace setting.

The Workspace carrier route may continue to host the user-level
`$CODEX_HOME/AGENTS.md` editor and OPL App new-conversation context for
compatibility, but visible navigation owns them under Instructions & Context.
It no longer owns or renders the App log-directory control.

### Agents (Projected into Software Center `/apps`)

In the active Studio hierarchy, Package lifecycle and discovery are presented on the primary **Software Center (`/apps`)** surface, with legacy `/settings/agents` acting only as a compatibility deep link. Within that projection, Agents is a compact installed/discoverable list for Agent and workflow Packages.
It renders Framework entries projected as `standard_agent` or
`workflow_profile`; it does not parse registry entries, manifests, checkouts,
locks, payloads, receipts, physical paths, LKG, or rollback state to create rows.
Standard Agents and Agent workflows are separate catalog sections; supporting
Packages stay under Capabilities. Uninstalled or intentionally disabled optional Agents
must not enter the attention queue for lacking a Home shortcut; a callable Agent without
a Home entry explains that an Agent update provides the entry instead of prompting repair.
Skills, Plugins, connection applications, managed companions, and capability Packages
remain visible under Capabilities rather than being mixed into this list.

The App Official Profile owns the desired first-install roots. Its current root
identities are read from the machine profile rather than copied into this page.
Required roots must have fresh discoverable, installed, enabled, callable and
launchable outcomes after first install. This installation intent is not a
Settings or Framework registry. App owns the Official Profile intent; Framework
still owns dynamic `standard_agent` membership, directory rows, status and
actions. A future Framework-projected Agent can therefore appear without an App
change, while a missing required root remains a truthful installation gap.

Settings presents those five axes separately. A desired root absent from the
Framework directory is `Not discoverable`; its installed, enabled, callable and
launchable axes remain unavailable or unknown rather than inheriting a green
aggregate. The Official Profile summary may name that missing desired root, but
it must not synthesize a manageable Package row or an install action. Directory
rows and all mutations continue to come only from Framework projections. An
Agent is selectable only through its projected Codex shortcut and is launchable
only when Framework reports the launchable axis true.

Directory statistics, each Package row, and the new-task Agent selector consume
the same normalized Framework projection keyed by `package_id`. Statistics count
discoverable standard Agents and report the other axes separately; rows show the
five axes without a Shell aggregate override; the new-task selector requires all
five axes plus the owner-projected Codex shortcut. None may maintain an
independent cache, fallback registry, or inferred green state.

Every OPL-owned row carries a compact `OPL` brand mark immediately after its
name. Ownership comes only from the projected publisher and first-party source
explanation, so future compliant OPL Packages inherit the same treatment without
an App list. Within each Agent section, OPL-managed entries render before
third-party entries. Availability remains a row state rather than a catalog
group, and third-party Packages never receive the OPL mark.

OPL standard Agent names are invariant English brand names in every UI locale.
Descriptions remain owner-localized and follow the active UI language with the
owner default as fallback. Ordinary managed OPL Agent, workflow, and capability
Packages follow their independent owner `latest-stable` channels with automatic
updates. A trusted Developer Mode checkout remains authoritative and explicitly
disables Package-channel auto-update so local development bytes are not
overwritten.

The default row has stable dimensions and only shows:

- name, Package kind, publisher, and concise purpose;
- `Installed / Updating / Current / Unavailable / Attention`;
- enabled and Home-shortcut visibility where applicable;
- at most one primary action plus an overflow menu.

Ordinary actions are Install, Update now, Enable/Disable, Show/Hide, Uninstall,
and Home shortcut preference. A Package manager's own advanced repair, source,
version, or rollback detail opens through its owner route; Settings does not
reimplement it. Every mutation requires fresh installed/callable readback before
success. One Package failure stays on that row.

For an entry already discovered in this directory, Install is the owner-projected
`agent_package_install` action with that row's `package_id`. **Add Agent** is a
separate manual third-party entry: it appears only when the current App action
accepts `manifest_url` and an explicit trust tier, supports dry-run, and requires
confirmation. It does not replace or reinterpret a directory-row action.

Dependency hierarchy comes from generic required identity edges. MAS may link
to MAS Scholar Skills because MAS declares the capability requirement, while
the capability's canonical catalog row stays under Capabilities; the App never
encodes that relationship. Missing required identity makes only the dependent
root unavailable and offers one owner-projected install action. No version,
ABI, lock, payload, digest, receipt, or family cohort participates in row
status.

The App Official Profile is visible only as first-install context and an
explicit **Restore official combination** command. It does not continuously
enforce desired state. After the user uninstalls an official Package, ordinary
startup, background update, and App update keep it absent.

Home shortcut controls are inline on installed `kind=agent` rows and are derived
from the Package shortcut descriptor plus user preference. Removing or
disabling an Agent removes or disables its shortcut; a new compliant Agent
requires no App source change.

Search covers name, id, purpose, kind, publisher, and capability. Ordinary
filters are Installed, Updates, Attention, and kind. Source/version/trust and
developer checkout information stays under one collapsed Advanced disclosure.
Dirty or user-managed checkouts are never silently updated.

### Capabilities

Capabilities is the user-visible directory for capability Packages, Skills,
Tools, Plugins, MCP, connection applications, managed companions, Agent task
producers, and typed views. These identities come from installed
Package/native-platform and owner projections. Package remains the install unit;
the page links to the owning Package instead of creating a second lifecycle
registry. Credential connections and deployment resources remain under
Libraries & Connections.

- There is no App-owned packaged-skill, tool, plugin, or MCP allowlist.
- Required/optional edges check identity presence and callability only.
- User hide/show preference changes presentation, not installed truth.
- Explicit product cuts such as disabled Team remain narrow policy, not a
  capability authority.
- Selecting a capability links to its owning Package; it does not create a
  duplicate install/update action.
- Capabilities organize by user purpose (desktop operation, skills/plugins,
  connections, image and voice) with type filters (`All`, `Packages`, `Skills`,
  `Plugins`, `Connected apps`) composing with search and a single `Clear filters`
  empty-state action; counts cover actual source records and keep upstream adoption
  notes collapsed below the catalog.
- Managed desktop operation surfaces one state-appropriate next action (remaining
  projected actions live under More).
- MCP, image generation, and voice configuration remain in their owner group;
  Preferences does not duplicate them.

Legacy assistant routes redirect without deleting user data, and external custom
assistant catalogs remain outside the OPL Package surface.

### Libraries & Connections

Libraries & Connections (`resources` carrier route) hosts knowledge vaults, business
accounts, per-software grants, remote messaging channels (including the standard
Weixin capability via `channel_access`), OPL Link, and standalone/Docker WebUI setup
guidance and read-only diagnostics. The section remains visible when no provider is
ready; ready `channel_access` and `remote_companion_access` projections render from
Framework Host regardless of catalog filters, while Software Center retains install,
update, and removal and links here for configuration. QR-code login polls on each
completed status read, translates reason codes into actionable states, and distinguishes
QR generation from scan confirmation and message delivery. WebUI deployment runs via
Studio's installer or OCI lifecycle manager—Framework initialization, key writes, and
startup maintenance are never framed as WebUI deployment, and unreachable/configured
vs HTTP-reachable stay distinct. Hosted OPL Workspace/cloud is X0-03; SSH/HPC, Fabric,
and Console-managed refs are X0-04. Those conditional rows appear only when a real
backend and owner projection exist, and ordinary Settings must not maintain
placeholder status, scheduling, billing, credential, or execution truth. The
built-in OPL Gateway connection and its count are always filtered out because
Gateway owns them.

Read-only Open navigates to the exact `browser_url`; Diagnose executes the
projected diagnose action and displays its result. Mutations require a
successful precheck, explicit confirmation, execution, and visible result or
receipt. Dry-run success proves only precheck success.

### Runtime & Maintenance

Runtime & Maintenance is one primary group with three independent second-level
destinations. The shared `environment` carrier route uses the destination anchor
to render exactly one ordinary purpose at a time; it must not concatenate the
three destinations into one long “Services & Maintenance” page.

1. **Service Status** (`environment#services`) answers whether Codex and the
   required background services are available now. It starts with one
   availability summary. The background-task area renders Framework **Runway**
   health (localized as **后台任务引擎** / **Background task engine** in the Service Status
   page) and **Schedule runner** readiness (`app_state.services.runway` and
   `status_summary.runway`, with human-readable check intervals) instead of deprecated Temporal provider controls.
   It states the user impact once without claiming generic `opld` service recovery
   or rollback actions.
   Overview consumes these same summary fields and renders only one persistent
   **Background tasks** summary.
   Scheduled tasks and Runway human gate decisions (`runway_human_gate_resolve`)
   belong in the main workbench (compact searchable list, status/time metadata,
   on-demand detail/history, Framework Runway execution); Settings only
   reports Runway and schedule-runner readiness and links to Service Status or the workbench.
   Memory remains a workbench service reached contextually from Instructions & Context
   rather than a top-level Settings tab.
2. **Updates & Repair** (`environment#updates`) answers what is outdated or
   damaged and what the safest next action is. In active Studio, the tab displays
   current App version & update readiness summary alongside a direct jump to
   Software Center (`updates`), which owns update channels, read-only `opl_base` current-version projection (`managed_update.components`),
   Desktop App update state, Check, Apply, progressive confirmation, progress, and
   fresh readback. Packages appear only as one aggregate summary with a link to Software Center (`/apps`);
   per-Package actions stay on that Package row. `opl_base` stays read-only on Updates;
   Desktop App and managed Package updates follow their own owner policies and
   progressive confirmation flows. Healthy components collapse into a compact summary;
   at most one recommended action is emphasized.
3. **Logs & Diagnostics** (`environment#diagnostics`) answers where App logs are
   stored and which technical evidence can be inspected or copied. On Desktop,
   it reuses `application.setLogDirectory` to open or change the App log root,
   then verifies `application.systemInfo.logDir`. Standalone WebUI shows its
   `application.systemInfo.logDir` projection read-only; Docker WebUI shows
   `/data/logs` only after deployment identity is confirmed. Neither executes
   the Desktop action or rewires the host `/data` bind. Raw component paths,
   shadowed installs and native diagnostic detail stay collapsed by
   default and contain no mutation controls.

The active dependency summary includes Codex CLI, the Framework Runway and Schedule
runner health projections, and declared managed/external components with version,
source/owner, currentness, and applicable guidance alongside the read-only `opl_base`
projection. OPL-managed roots may update through their owner. Reliably identified
external installs require an explicitly confirmed delegated update; unknown or
unsupported owners receive detection and guidance only. OPL never silently
overwrites Homebrew, npm, PATH, or system installs.

Desktop App currentness comes from the same main-process updater store consumed
by About and the Settings footer. WebUI alone falls back to the Framework-managed
`opl_app` component. `not_checked`, `checking`, `not-available`, `available`,
`downloading`, `downloaded`, `error`, and `cancelled` stay distinct. Service
attention and App-update attention are calculated independently. A historical
receipt may appear only in Logs & Diagnostics and never enables a current Repair
action; without a live repair signal, the primary operation remains Check.

Dependency identity and de-duplication use normalized optional `real_path` first
and fall back to `binary_path`; shadowed paths remain diagnostic detail. Retired
Advanced routes to Logs & Diagnostics. No destination opens a second large
management modal or overlaps it with diagnostics.

### Data & Storage

Storage renders the last persisted inventory snapshot immediately. If no
snapshot exists it shows a loading placeholder, never synthetic `0 B`. Each
snapshot exposes `observed_at`, `scan_duration_ms`, and `stale`.

`Not inventoried` and `Statistics are not available for this deployment` are
neutral information states, not attention. They remain unavailable rather than
zero and do not raise the Settings attention count. Refresh appears only when
the owner projects an executable inventory action with mutable fresh readback;
success requires the returned inventory identity or `observed_at` to reflect the
completed action. A static reread, missing action, or unchanged unavailable state
must not show success.

A delayed startup scan, TTL refresh, and manual force refresh run in the
background. Completion publishes
`local-data-lifecycle.inventory-updated`; the page updates without requiring
re-entry. Large roots do not use recursive long-lived filesystem watches.

Storage may show the resolved Logs & Diagnostics-owned log path only as a
read-only reference. Cleanup uses preview then confirmation; zero-byte
categories show nothing to clean and no action. Archive requires a receipt
before delete, and restore never overwrites an existing conversation without an
explicit collision decision.

For Docker WebUI, and only after Docker deployment identity is confirmed,
Storage adds one read-only deployment-location summary:

- the required host **projects** directory binds to `/projects`; it contains
  project and task artifacts. `OPL_PROJECTS_DIR=/projects` and
  `OPL_WORKSPACE_ROOT=/projects` make this the deployment-managed logical
  workspace root. Working Directory shows `/projects` read-only and cannot
  change the host source path;
- the required host **data** directory binds to `/data`; it contains App data,
  Framework state, Codex Home and session records, and logs including
  `/data/logs`. Settings cannot change or split this bind;
- `/recovery`, selected by `OPL_WEBUI_RECOVERY_DIR=/recovery`, is the container
  recovery/archive staging surface. Host persistence is optional and
  deployment-managed; it is explicitly not a third required host bind.

Changing either host source directory belongs to `compose.yaml` or the
installer. Settings exposes no mount editor, environment mutation, generic
Docker prune, or volume-rewire control.

### Preferences

Preferences owns appearance, language, live font preview, notifications, and
application behavior first, followed by a collapsed searchable **Performance**
disclosure (configuration, not diagnostics). Local controls display saving/saved/error
feedback and distinguish unsaved editor text from persisted values. Theme remains
an anchor rather than an independent page. User instructions (`$CODEX_HOME/AGENTS.md`)
and new-conversation context reuse the Workspace carrier route under Instructions &
Context, keeping a contextual link to Memory.

### About

About shows the App version, cached updater status, and one Check for updates
action; it does not expose an in-App update-channel selector. Public Nightly is
an external Automated Standard Preview through GitHub and its dedicated Homebrew
Cask. Its scheduled publisher defaults to `make_latest=false`, but a separate
protected single-use expected-current CAS plus exact public readback may
temporarily select any exact published Dev or Nightly Preview as Latest. That
operation preserves Preview quality, discloses non-Stable and skipped gates, and
the next qualified Stable reclaims Latest by default.
Canary is validation-only and never appears as a user update channel. The App performs one update check after startup
and publishes it to a shared main-process updater state store. Mounting or
navigating to About only reads that state and never starts a check. The manual
button refreshes the same shared state. During a download, About shows a progress
bar, percentage, transferred/total size and current speed from that store. Before
the first byte event it shows preparation; an unknown total stays unknown. A
manual click during an existing download observes that transfer without starting
another check or download. Completion stays quiet and installs on normal restart.

Maintenance and the compact Settings footer subscribe to that same store rather
than reading a second desktop App-update truth. WebUI uses the managed `opl_app`
projection only as its no-desktop-updater fallback. Mounting any of these
consumer surfaces never starts another automatic check.

Shell version, Framework revision, build ids, and raw update refs stay in
technical details. Repair, rollback, package maintenance, and storage cleanup
remain on their owner pages.

## Search, Visual, And DOM Contract

Settings exposes exactly one bilingual item-level search input,
`settings-search-input`. Results use `{page_label} > {entry_label}` (including
Instructions under Capabilities & Instructions), support Arrow/Enter/Escape keyboard
navigation, navigate to the owner carrier route, expand any containing disclosure,
and focus and briefly highlight the target anchor. Duplicate Settings search inputs
are forbidden.

Settings preserves OPL IA inside the current App visual baseline:

- one unframed section answers one user question and contains flat rows; bounded groups are reserved for repeated entities and confirmation;
- no nested cards, page-wide list wall, or floating dashboard sections;
- two to four first-viewport groups where the page density supports them;
- a single desktop reading lane and mobile stack;
- pinned DSH monochrome icons and primitive geometry, DSH theme tokens (`14px/22px`
  body, `16px/24px` medium headings), subtle separators, `0` letter spacing, and no
  outlined tab pills or standalone full-width refresh bars;
- normal, warning, error, and action use muted, orange, red, and brand
  semantics;
- one selected sidebar item and at most one page primary action;
- the compact footer opens Account & Access when an account is connected, or
  Overview/Settings otherwise, without duplicate Settings, theme, return, or
  help shortcuts;
- technical details open explicitly and never hide interactive persistent
  controls.

Every product page renders `settings-page-<product_page_id>` and
`settings-<product_page_id>-primary`. Conditional exception, primary-action,
and technical-details test ids follow the machine contract. Every declared
anchor is a stable, focusable section id.

## State And Action Boundary

Default reads use `opld` `app.state.get` (`profile: "fast"`, with `opl app state --profile fast --json`
as the CLI equivalent). Explicit detail reads use `profile: "full"`. Mutations use
`opld` `app.action.execute` (or `opl app action execute --action <action_id> [--payload <json>]
[--dry-run] --json`).

Mutation-capable surfaces are single-flight. Competing actions and pending
confirmations remain disabled while a read, precheck, mutation, doctor, or
recovery operation is active. Results stay bound to the operation that produced
them.

## Verification Boundary

Cross-page details are not duplicated here. The shared
`contracts/app-gui-product-contract.json#ui_experience_contract` owns truthful startup
stages, the single-action First Run completion, composer-first Home, and the context
action sheet. The latter keeps every action scroll-reachable at `400x600` using
`100dvh`, safe-area, and virtual-keyboard constraints. “Not yet configured” is valid
only for implemented features with a real configuration flow, kept distinct from
unknown, unsupported-platform, or unimplemented states; verification must cover entry,
save, re-read/restart, and real action execution without substituting mocks for
external account checks.

Contract and focused tests prove only their App-owned slices. Shell acceptance
also requires:

- seven primary groups, all ten carrier routes reachable through their declared
  second-level destinations, About as the only secondary page, and every redirect;
- Gateway single ownership and Resources filtering;
- owner-localized Agent descriptions, invariant brand names and Developer Mode effective-state
  readback;
- truthful dynamic capability projection including its empty state, third-party naming, and
  native/local capability ownership routing;
- visible Codex/Runway readiness, managed component currentness, and external-install guidance;
- persisted Storage snapshot, freshness, background event, manual refresh, and
  unknown-not-zero behavior (never authorizing cleanup from failed inventory or guessing
  unknown storage deltas);
- one startup update check, one shared desktop updater state across About,
  Maintenance, and footer, WebUI managed fallback, local build update-disabled clarity,
  and no consumer mount check;
- complete App updater states, independent runtime/App-update attention,
  current-only Repair availability, and `real_path`-first dependency identity;
- all required DOM, anchors, search behavior, responsive layout, and fresh
  desktop/mobile screenshots without overlap.

These checks do not prove package installation, runtime currentness, release
promotion, or owner acceptance. Those remain separate release-owner gates.
