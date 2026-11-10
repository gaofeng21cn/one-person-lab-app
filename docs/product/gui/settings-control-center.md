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
readiness, or update behavior from upstream AionUI defaults.

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

`/apps` is the App-owned application management surface for the common OPL
base. It is reached from the primary navigation as **应用管理** and answers
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
The four sections are addressable with `?section=applications`,
`?section=updates`, `?section=resources`, and `?section=sources`. Desktop branded
links admit these exact section routes and the legacy Updates route through the App-owned allowlist;
unknown query parameters, sections and fragments remain invalid. Applications
uses the dynamic software and component projections, Updates uses the managed-update and App
updater projections, and Shared Resources consumes
`app_state.application_management` for authorized resource relationships.
Framework owns these projections; App owns their navigation, presentation and
interaction contract. The `section_sources` map makes each section's producer
explicit and does not establish an App-owned data registry.
Software Sources consumes `app_state.agent_packages.sources` for source metadata,
access state, and available connection or check actions. The four sections share
the same owner-projected action and fresh-readback
rules; the application-management projection keeps provenance references to
the Package, update, connection and knowledge owners. Installation,
operational readiness, and currentness remain separate axes, and a mutation is
successful only after fresh owner readback.

The existing Settings routes remain compatibility routes and deep links:
`/settings/agents` and `/settings/capabilities` reach the applications view,
`/settings/environment?section=updates` reaches updates, and
`/settings/resources` reaches shared resources. They must use the same
projection and action owner rather than maintain a parallel list or state
store. Shared resources may include an Obsidian or other personal knowledge
source, connection handles, authorization, revision/freshness and readiness
summaries. The source body, credential secret and owner write semantics stay
with Framework, Connect, Obsidian or the relevant domain owner.

Shared Resources groups **Knowledge & memory**, **Accounts & connections**,
**Models**, and **Base capabilities** with the same row vocabulary: availability,
last check, authorization, consumers and a contextual owner action. Software
source access has one link to the Software Sources section, not a second form.
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

A Homebrew source exposes native App and CLI distribution options through
`app_state.agent_packages.sources.entries[].native_items`. Homebrew owns its
recipes, installation receipts and lifecycle actions. Framework also reports
verified installations owned by other installers. No Homebrew receipt means
“not managed by Homebrew”; it does not establish that the software is absent.
The selected installation's owner supplies its update and uninstall actions.

`app_state.agent_packages.sources.installed_products` provides verified owner
installations independently of a software source. The UI merges these products
with source carrier options by owner-projected `product_id`. The current
Framework installation adapter can therefore report Framework and its update
owner even when Homebrew is absent, its tap is missing, or source inspection
fails. This field does not claim automatic discovery for every product or
installer; other installations require their own adapter evidence.

### Software, components and the common base

The default software catalog contains independent Packages, agents, MCP Apps,
and other applications or CLI products with a supported lifecycle. It covers
software beyond the OPL core. Its three groups are **Applications**, **Agents**
and **Capability packages**, classified by the owner's `software_type` projection.
Unclassified software stays in the software scope without a guessed type.
Standard and nonstandard agents share the Agents group; a workflow capability
can use a workflow subtype. The three technical Package roles remain
`standard_agent`, `workflow_profile` and `capability_package`. A technical
capability role can carry an independent App, so these roles do not by themselves
determine the user's product category, release maturity or installation mode.

Framework's `catalog_scope` separates this catalog from **System components**.
Native Host extensions without an explicit OPL Package manifest, and entries
whose classification has not been established, remain inspectable in that
separate scope. They do not inflate the software count. A concept repository is
not an installable product; an internal application-host implementation such as
Studio is maintained with its owning App. The UI follows owner classifications
instead of maintaining repository-name exclusions.

The OPL core subset has five responsibility layers:

| Layer | What the user manages | Lifecycle owner |
| --- | --- | --- |
| OPL base | Framework runtime and shared management services | Framework and its selected installer |
| OPL App | The desktop or selected headless application | App updater or the selected native carrier |
| OPL standard agents | Independently versioned domain agents | Package owner and configured carrier |
| Capability packages | Independently managed tools, connectors and workflow profiles | Package owner and configured carrier |
| Dependencies | Runtime engines, Host extensions and internal libraries | Their parent product or native dependency manager |

These layers explain the OPL core's responsibilities; they do not partition or
limit the larger software catalog, create five new Package roles, or add five
peer updaters. A dependency with its own independent Package identity can
also be an ordinary capability package. A library included in its parent
product stays a component. Knowledge sources, Obsidian vaults and account
connections remain Shared Resources, with their existing content and
credential owners.

### Sources, installations and development

Software Sources admits public Package distributions, authorized private
distributions, and declared native application or CLI carriers. Each must
provide verifiable identity, version, installation content and owner actions.
A repository checkout is a development input when explicitly bound by its
owner; its presence alone does not add software to the catalog. Source version,
installed version, active runtime source and update availability remain separate
facts. A selected catalog version is not necessarily the latest remote version.

The directory separates formal name, purpose, stable ID, local version and
selected source version. It preserves unknown values. `development_only`
describes distribution admission, not preview maturity. The source/release
distribution field does not grade quality; a maturity label requires an
explicit product-owner declaration. A technical prototype uses the same
installation and management contracts, while its domain readiness remains
visible through the domain owner.

One software identity may have several installations. Package `installed` and
`installed_version` describe its configured plugin carrier; owner-projected
`local_installations` can report other installed or development instances.
The detail view identifies their mode, version, owner and safe location
reference. A missing plugin carrier is not a machine-wide absence claim.
Standard, Full and Nightly installation options for the same App are grouped
under the owner-projected product identity, while their individual channel and
installation receipts remain distinct.

Installation paths follow their existing owners: native App directories,
package-manager roots, OPL managed locators and explicitly selected development
workspaces. User data and Obsidian content retain their existing locations.
The shared interface provides consistent discovery and ownership; it does not
silently move these files into one physical root. A source checkout or the
label `git_checkout` alone does not establish development mode: the Framework
may use Git internally for managed installation. Developer mode follows the
effective source policy or explicit editable-install evidence, and automatic
updates must not overwrite that source.

The current adapter's observed instances and actions determine which operations
are available. Unobserved alternate installations remain unknown, and an
external installation without a projected lifecycle action stays read-only
with its owner identified. These product rules do not claim that every
historical installer already has an automatic migration or management adapter.

### DSH-derived successor application

The App successor reuses the pinned DSH Settings shell, layout, theme tokens and selected controls as
source. It does not imitate those pixels in a second OPL Settings implementation, and it does not import
DSH connection, credential, model-provider, session or plugin-runtime authority. `One Person Lab` is the only
user-visible product name; `OPL Studio` remains an internal implementation codename.

DSH General, Models, Plugins and Agent Presets provide the presentation baseline. OPL maps those concepts to
its existing owner model and adds only current product needs: Gateway account/access, working directory and
storage, Agents and Capabilities, App/Base/Packages updates, service diagnostics and About/notices. The active
AionUI route count is an adapter compatibility surface, not a successor feature-count target.

Successor Settings completion is action-based:

- a local preference is complete only after persistence and immediate renderer readback;
- an App/Framework/Package action is complete only after owner execution and fresh state readback;
- a dynamic Package setting appears through `settings.section` and disappears with its registration scope;
- a status without an available action remains read-only and names its owner route; it never becomes an inert
  toggle, optimistic success or shell-owned fallback.

An API key write and the live Codex refresh have separate results. Once the
Framework confirms the write, a deferred or failed refresh cannot turn that
receipt into a save failure. A failed state refresh reports that the key was
written and model access still needs a recheck. If the bridge returns no write
receipt, the write remains unconfirmed; the UI does not claim that it was absent.

Studio implementation and adoption are tracked through its current adapter and
[product boundary](opl-studio-plan.md); this page does not maintain a second candidate work plan.

## Startup Performance Boundary

The first interactive Settings window renders from a persisted narrow snapshot
or a stable loading shell. It never waits for the complete
`opl app state --profile fast --json` payload or for page drilldowns. The full
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
user-managed
connections come from
`app_state.settings_control_center.connection_registry`.

AionUI custom assistants remain outside the OPL product catalog. Hiding their
entry does not authorize deletion of AionUI-owned data.

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
| 账户与模型 | 账户与访问；模型 | `gateway`; `access` |
| 连接与部署 | 资源与连接 | `resources` |
| 工作区 | 工作目录；数据与存储 | `workspace#current-workspace`; `storage` |
| 扩展与应用 | 全部扩展；智能体；指令与上下文 | `capabilities`; `agents`; `workspace#personalization` |
| 运行与维护 | 服务状态；更新与修复；日志与诊断 | `environment#services`; `environment#updates`; `environment#diagnostics` |
| 偏好 | 偏好 | `appearance` |

“关于”是七组之外唯一的侧栏底部辅助入口，与主组保持独立间距，不作为第八个普通设置类别。
DSH 固定版本的原生 rail 只提供平铺注册行；About 仍使用该原生行及 store，仅由 OPL 的
局部布局适配定位到底部。Advanced 退役并重定向到维护诊断。桌面端进入当前一级组后在
内容标题区显示唯一的二级 tab list；移动端先显示纵向分类列表，再进入带可见返回控件的二级列表，
禁止把十个 carrier route 平铺成横向 tab strip。

工作区只组织工作目录、权限、项目/任务产物位置和数据存储。用户级 `AGENTS.md` 与新对话附加说明
归“扩展与应用 > 指令与上下文”；App 日志目录、服务证据和技术诊断归“运行与维护 > 日志与诊断”。
资源、外部连接与部署入口只归“连接与部署”，不再借用“账户与模型”的语义。现有 route、anchor
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
| What global instructions and new-conversation context apply? | Agents & Capabilities > Instructions & Context | The existing Workspace personalization route remains a carrier transport only. | Presenting either editor as a Workspace or Preferences child. |
| Where are App logs and diagnostics, and what needs maintenance? | Runtime & Maintenance > Logs & Diagnostics | Storage may link to the resolved log path read-only. | Presenting logs under Workspace or duplicating the log-directory setting in Storage. |
| Which extensions and apps are installed, and where are their status and updates? | Extensions & Apps | Agents is a filtered view of the same Package catalog; Home may show an enabled shortcut. | A second Package manager, fixed package list, or package status sections scattered across Service Status and Resources. |
| Which Skills and Plugins are available? | Extensions & Apps > Capability details | Agent dependency readiness may link here. | A hardcoded Flow list or a second lifecycle authority. |
| Which external resources, connections, and deployment entry points are available? | Connections & Deployment > Resources & Connections | Other pages may link to a resource. | Built-in OPL Gateway connection or Gateway count; selected local workspace controls. |
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

Resources & Connections renders Framework Connect's
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

“扩展与应用”是全部动态 Package 的统一安装、管理、升级与状态入口，默认显示所有来源，
包括私有和本地包。每项显示名称、版本、来源、安装状态与 Framework 提供的操作。
页内“全部扩展”和“智能体”分别是同一目录的全部项目与智能体筛选视图；页面和主导航保持“扩展与应用”。

安装与 OPL App 使用是两个独立选择。“在 OPL App 中启用”默认开启；用户关闭后，
Framework 保留目录与安装状态，但移除该包在 OPL Desktop/WebUI 的页面、导航和其他界面入口。
已打开的包页面返回工作台，隐藏内容不继续自动读取。该选择持久保存，不改变 Codex 的
插件启用、Skill、MCP App 调用或原生安装，也不因升级或重新发现而自动恢复。

包提供的设置和状态统一放在该包的展开详情中，只有包已在 App 中启用且详情展开时读取。
“服务状态”只保留 Codex、任务处理和定时等基础运行条件；“资源与连接”保留其自身配置。
所有安装、更新、修复和 App 开关都经现有 Framework 投影与 App action 执行，不维护额外注册表。

列表直接提供“在 OPL App 中启用”开关；安装状态、已安装版本与来源保持可见，关闭后仍能在目录中找到并重新启用。
普通可用包不在列表主动作位置重复显示“更新”；更新和修复保留在展开详情，没有新版本证据时不暗示存在待更新项。
目录数量只在筛选结果摘要中出现一次。页头说明只解释本页用途；开关说明只解释影响范围，不重复安装说明或内部机制。

设置页统一使用一条阅读列、同一组标题层级、对齐的设置行、控件与状态样式。每项主动作贴近对象，
成功或失败反馈紧邻操作区域；技术字段和完整回执放入显式展开详情。

## Visual Contract

Settings keeps the OPL information architecture while using the current DSH visual
source and App visual-system rules: a single reading lane, unframed sections,
flat internal rows, monochrome utility icons, and color reserved for typed
status or brand actions. It does not turn complex OPL controls into a page-wide
list wall or nested cards.

- the compact footer always shows the connected Gateway display name, otherwise
  Settings; it opens Account & Access or Overview;
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
- one persistent **Background tasks** summary derived from explicit Temporal
  service, OPL task worker, and scheduled-run readiness;
- an impact-ordered exception queue;
- one next useful action.

When all required background components are ready, Overview shows one quiet
available row. An unready, unknown, or stale chain contributes one root-cause
item to the attention queue and links to Service Status. Downstream components
show that they are waiting for their named prerequisite instead of adding
duplicate generic-attention items. Service, worker, schedule, and supervisor
details never expand on Overview.

It does not show the full Gateway account card, total historical usage or cost,
managed Key detail, login or connection-management controls, workspace path, a
copy of every Settings page, or a second technical summary. Necessary direct
Codex and Gateway technical rows appear once; raw paths, receipts, payloads, and
owner-page diagnostics stay on their owner pages.

### Account & Access

Account & Access is the single owner for:

- account login and the manual API-key path;
- full public account identity and localized connection state;
- balance, compact token usage, actual cost, managed Key name/status, and local
  freshness time;
- refresh, connection completion or repair when required, and disconnect.

The account card appears only for an account connection. Manual-Key-only and
disconnected states do not render account balance or usage. Passwords use the
typed `loginGatewayAccount` IPC bridge and
`opl connect gateway login --credentials-stdin --json`; they never enter a
generic action payload, App state, logs, errors, receipts, diagnostics, or
renderer persistence.

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

### Agents

Agents is a compact installed/discoverable list for Agent and workflow Packages.
It renders Framework entries projected as `standard_agent` or
`workflow_profile`; it does not parse registry entries, manifests, checkouts,
locks, payloads, receipts, physical paths, LKG, or rollback state to create rows.
Standard Agents and Agent workflows are separate catalog sections. Skills,
Plugins, connection applications, managed companions, and capability Packages
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
Resources & Connections.

- There is no App-owned packaged-skill, tool, plugin, or MCP allowlist.
- Required/optional edges check identity presence and callability only.
- User hide/show preference changes presentation, not installed truth.
- Explicit product cuts such as disabled Team remain narrow policy, not a
  capability authority.
- Selecting a capability links to its owning Package; it does not create a
  duplicate install/update action.
- MCP, image generation, and voice configuration remain in their owner group;
  Preferences does not duplicate them.

AionUI custom assistants remain outside the OPL Package surface; the legacy
`assistants` route redirects without deleting upstream data.

### Connections & Deployment > Resources & Connections

Resources shows current local browser access and WebUI plus user-managed external
connections when projected. Hosted OPL Workspace/cloud is X0-03; SSH/HPC, Fabric,
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
   availability summary. The Temporal area is titled **Durable tasks
   (Temporal)** and presents **Temporal service**, **OPL task worker**, and
   **Scheduled runs** as the causal chain service -> worker -> Temporal
   Schedule, not as three peer services. It states the user impact once,
   emphasizes one safe action for the first actionable root cause, and renders
   downstream failures as waiting states. Address, namespace, task queue,
   supervisor, component timestamps, and secondary checks stay in technical
   details.
   Overview consumes these same component fields but renders only one persistent
   **Background tasks** summary. It never duplicates Temporal topology.
2. **Updates & Repair** (`environment#updates`) answers what is outdated or
   damaged and what the safest next action is. It owns the update channel,
   Base/App currentness, Desktop App update state, Check, Apply, progressive
   confirmation, progress, and fresh readback. Packages appear only as one
   aggregate summary with a link to Agents; per-Package actions stay on that
   Package row. OPL-managed Base and capability updates use the Framework's
   default silent background policy. The page reports that policy once and
   hides a manual Apply action while the component is in its normal managed
   path; an explicit action appears only for an owner-reported repair or other
   attention state. Native repair/rollback opens the owning platform's advanced
   route and never becomes an App state machine. Healthy components collapse
   into a compact summary; at most one recommended action is emphasized.
3. **Logs & Diagnostics** (`environment#diagnostics`) answers where App logs are
   stored and which technical evidence can be inspected or copied. On Desktop,
   it reuses `application.setLogDirectory` to open or change the App log root,
   then verifies `application.systemInfo.logDir`. Standalone WebUI shows its
   `application.systemInfo.logDir` projection read-only; Docker WebUI shows
   `/data/logs` only after deployment identity is confirmed. Neither executes
   the Desktop action or rewires the host `/data` bind. Raw component paths,
   shadowed installs and native diagnostic detail stay collapsed by
   default and contain no mutation controls.

The active dependency summary includes Codex CLI, the OPL-managed Temporal
JavaScript Runtime, and the optional system Temporal CLI with version,
source/owner, currentness, and applicable update guidance. OPL-managed roots may
update through their owner. Reliably identified external installs require an
explicitly confirmed delegated update; unknown or unsupported owners receive
detection and guidance only. OPL never silently overwrites Homebrew, npm, PATH,
or system installs. The managed Temporal runtime moves with OPL Base; the system
Temporal CLI remains external unless its owner explicitly manages it.

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

Preferences owns application behavior, notifications, performance and waiting,
display, fonts, and themes. Theme remains an anchor rather than an independent
page. User instructions and new-conversation additions reuse the Workspace carrier
route but appear only under Instructions & Context in the visible hierarchy.

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
`settings-search-input`. Results use `{page_label} > {entry_label}`, navigate to
the owner carrier route, and focus the declared anchor. Duplicate Settings
search inputs are forbidden.

Settings preserves OPL IA inside the current App visual baseline:

- one unframed section answers one user question and contains flat rows; bounded groups are reserved for repeated entities and confirmation;
- no nested cards, page-wide list wall, or floating dashboard sections;
- two to four first-viewport groups where the page density supports them;
- a single desktop reading lane and mobile stack;
- pinned DSH monochrome icons and primitive geometry, compact type, and 0 letter spacing;
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

Default reads use `opl app state --profile fast --json`. Explicit detail reads
use `opl app state --profile full --json`. Mutations use
`opl app action execute --action <action_id> [--payload <json>] [--dry-run]
--json`.

Mutation-capable surfaces are single-flight. Competing actions and pending
confirmations remain disabled while a read, precheck, mutation, doctor, or
recovery operation is active. Results stay bound to the operation that produced
them.

## AionUI Adapter Boundary

OPL Settings is an App-owned overlay, not an AionUI fork-body redesign.

- App contracts own routes, placement, labels, surface classification, and
  acceptance; Framework catalogs own Framework values and actions.
- Shell integration stays concentrated in Settings host, adapter slot,
  registry, generated profile, locale, and OPL overlay files.
- New upstream Settings or extension entries remain hidden until App intake
  classifies them as accepted, adapted, redirected, or rejected.
- Hiding an entry never deletes extension-owned data.
- Generated profile and locale checks prove they project App truth; they do not
  become a second authority.

## Verification Boundary

Cross-page details are not duplicated here. The shared
`contracts/app-gui-product-contract.json#ui_experience_contract` owns truthful startup
stages, the single-action First Run completion, composer-first Home, and the context
action sheet. The latter keeps every action scroll-reachable at `400x600` using
`100dvh`, safe-area, and virtual-keyboard constraints.

Contract and focused tests prove only their App-owned slices. Shell acceptance
also requires:

- seven primary groups, all ten carrier routes reachable through their declared
  second-level destinations, About as the only secondary page, and every redirect;
- Gateway single ownership and Resources filtering;
- owner-localized Agent descriptions, invariant brand names and Developer Mode effective-state
  readback;
- truthful dynamic capability projection including its empty state, third-party naming, and
  AionUI-native ownership routing;
- visible managed Codex/Temporal currentness and external-install guidance;
- persisted Storage snapshot, freshness, background event, manual refresh, and
  unknown-not-zero behavior;
- one startup update check, one shared desktop updater state across About,
  Maintenance, and footer, WebUI managed fallback, and no consumer mount check;
- complete App updater states, independent runtime/App-update attention,
  current-only Repair availability, and `real_path`-first dependency identity;
- all required DOM, anchors, search behavior, responsive layout, and fresh
  desktop/mobile screenshots without overlap.

These checks do not prove package installation, runtime currentness, release
promotion, or owner acceptance. Those remain separate release-owner gates.

## Settings usability refinement

Search results use the visible primary group and destination, including Instructions under Agents &
Capabilities, while keeping existing carrier routes and anchors. Arrow keys select a result, Enter
opens it, and Escape clears the query. The destination reveals any containing disclosure and focuses
and briefly highlights the setting.

Agents lists only standard Agents and workflows. Supporting Packages remain manageable under
Capabilities. Capabilities is organized by user purpose (desktop operation, skills/plugins,
connections, image and voice); installation source remains metadata and never changes lifecycle
ownership. Managed desktop operation shows one state-appropriate projected next action; other
projected actions remain available under More.

Preferences puts appearance, language and live font preview first, then application behavior and
notifications. Performance is a named configuration disclosure, collapsed until opened or reached
from search; it is not diagnostics. Automatic model reasoning is a readable policy summary with an
explicit manual-model entry. Local controls show saving/saved/error feedback; text editors distinguish
unsaved changes from persisted values.

Overview shows a background exception once and names destination actions. Account balance and today's
usage are primary; cumulative statistics are disclosed on request. Page titles retain a distinct
readable hierarchy. Maintenance retains confirmation, progress and owner readback.

### 启动读取与恢复

设置页区分正在读取、读取失败与成功后的空配置。Framework 超时或退出失败不能显示为未登录或零个智能体，也不能覆盖已成功读取的状态；已有状态保留并标注待刷新。依赖运行状态的页面在标题同行提供轻量刷新入口，首次尚未读到配置时显示加载或重试提示。本机偏好仍可独立设置。


## Settings needs, capability organization, and DSH presentation

The following is the Studio settings design, grounded in user tasks. Preserve stable destination IDs,
search links, existing persistence and action handlers. DSH provides the modal, navigation, typography,
spacing and theme primitives; OPL adds product-specific settings without introducing a second credential,
model, package or execution state store.

| User need | Destination | Display and interaction | DSH baseline / OPL addition |
| --- | --- | --- | --- |
| Can I start working? | Overview | Readiness and actionable exceptions with links to the relevant setting | OPL runtime summary |
| How do I access models? | Account / Models | Account or key, usage and access status; model and reasoning choices | DSH Models presentation; OPL Gateway and Codex policy |
| What can I connect? | Resources | Connections, access and their available actions | DSH connection patterns; OPL resources |
| Where is my work saved? | Workspace / Storage | Working directory; measured storage and explicit cleanup with confirmation | OPL workspace and storage lifecycle |
| What can help me work? | Agents / Capabilities / Instructions | Agents and workflows; installed skills, plugins and apps; editable instructions and context | DSH Plugins and Presets presentation; OPL package lifecycle |
| How do I keep it working? | Services / Updates / Diagnostics | Current service state, updates/repair, then optional technical diagnostics | OPL runtime maintenance |
| How should the app feel? | Preferences | Appearance, language, font size, notifications and confirmation preferences | DSH General controls |
| Which app am I using? | About | Version and support links | DSH version/support pattern |

Each page has one group heading (or its destination when the group is singular) and one short task description. For a multi-destination group,
the group title is the H1 and the selected tab names the tabpanel. A single
destination uses one destination H1. State refresh is a quiet trailing icon beside the heading, with a localized
accessible name. Preferences has no global refresh or Framework loading/error barrier.
Refreshing state is not logging in, updating packages, refreshing account usage, or measuring storage:
those retain their explicit, scoped actions. Failed reads retain prior state and offer inline retry.

Capability counts cover actual directory entries. Capability type filters (All, Packages, Skills, Plugins,
Connected apps) compose with text search; empty results offer a single Clear filters action. Upstream adoption notes are collapsed reference
information after the real catalog, not configurable features or additions to the installed count.
Use DSH theme tokens, 14px/22px body text, 16px/24px medium titles, subtle separators and hover/selected
fills; avoid outlined tab pills, duplicate card systems and full-width standalone refresh rows.


### User-facing settings refinement (2026-09-26)

Instructions prioritizes the editable AGENTS and new-conversation instructions. Memory remains a
separately owned surface reached from the Instructions context link; it is not an ordinary Settings
navigation destination. Scheduled tasks remain a workbench surface reached from contextual links, while
Settings only reports the background-task condition and links to Service Status when needed. Diagnostics
owns technical source details. Overview lists concrete exceptions with their impact and destination,
followed by a compact normal-state summary. Explicit service/worker readiness overrides aggregate status.

Agent callability and a selectable launch route are different facts. A missing route remains visible
and never becomes an unexplained repair recommendation. Capability counts refer to source records,
not a sum of independent functions. Product modules appear first; Skills, Plugins and Connected apps
remain searchable and reachable. An installed connection plugin does not imply an authenticated channel.

Use one contextual refresh per page, with named account usage and inventory actions where needed.
Retain successful readbacks after refresh failure, explain stale data, and do not permit cleanup from
failed inventory. Unknown storage totals remain unknown in post-cleanup estimates.

Expose the effective agent permission preference shared with the composer. Retain the legacy
confirmBeforeExecute value for compatibility but do not display an unimplemented safety toggle.
Model and reasoning controls explain their scope and automatic/manual relationship. Local builds
show their identity and disabled updater policy; official release update actions require native support.
Support links are separate rows. Destructive actions remain behind their real preview and confirmation.

### 配置能力与验收

“尚未配置”只用于已经实现、且提供真实配置路径的能力。未知状态、当前平台不支持和待开发必须分别说明。验收包含入口、保存、重新读取或重启，以及实际操作；模拟外部服务的测试不能证明真实账户认证完成。

网页端通过 Studio 独立安装器或 OCI 生命周期管理器部署，设置提供部署指南及只读诊断。Framework 初始化、密钥写入和启动维护都不是 Docker 部署，不能包装成“一键安装网页端”。诊断没有发现告警也不能证明 WebUI 已运行；Docker 可达、地址已配置与 HTTP 可访问是不同事实。WebUI 存储统计依赖部署环境的数据目录，桌面端不能承诺自动看到另一部署的用量。

未安装或主动停用的可选智能体不应因为没有首页入口出现在故障列表。已可调用但没有首页入口时，说明需要智能体更新提供入口，而不是要求用户反复修复安装。

启动自检缺少 readiness 或检查计数时显示“结果不完整”，不把缺失值补成 false 或 0/0。读取失败、未知结果、已证实阻断分别呈现，并提供“重新检查”。真实阻断和用户需处理的维护项同时进入概览问题列表，显示具体检查项、原因和对应设置入口；概览不能一边声称无问题一边要求处理。

计划任务参考官方 DSH RC2 `ui-schedule/TaskManagerPage` 与 `TaskDetail`：紧凑的可搜索任务列表、状态与时间元信息、按需展开任务详情和执行历史。复用官方 Button、Input、StateDot，使用 DSH 字体、颜色、分隔线与间距。任务配置和执行继续走 Framework/Temporal，保留 OPL 所需创建表单与执行确认；长路径、完整提示词和技术执行信息不占据列表主体。

扫码连接按每次完成的状态读取安排下一次刷新，不能只因 channel ID 与刷新周期未变化而停止。连接失败须将已有 reason code 翻译为可操作的原因与重试指引；未连接、连接中、待扫码、已连接和失败使用不同状态。获取二维码不是登录完成，扫码确认和消息实际交付需分别验证。

## 设置与工作台的模块边界

计划任务属于主工作台，支持创建、编辑、暂停、运行和历史；设置不注册计划任务普通目的地，只保留后台运行条件及跳转。记忆由 Framework 工作台服务维护，从“指令与上下文”提供上下文入口，不进入扩展导航。模型与执行统一承载模型、权限、审阅和时间上下文。界面偏好承载语言、主题、字号、快捷键和语音输入。能力目录先按用户用途展示，再按技术类型筛选，并跳转到唯一配置入口。安装、启用、连接和可调用分别表达，源码接入不代表本机就绪。

Studio 设置按领域组织，共享 DSH 外壳和控件；生产 Host 位于 `src/host`，脚本只负责启动、构建和验证。Framework 工作台服务仍是一个插件，记忆和存储分别维护。OPL Link Desktop Connector 完整交付前不进入默认安装与内置曝光，既有数据保留。

本轮实现位置与验证边界见 [设置模块化验收](evidence/settings-modularization-acceptance-2026-09-27.md)。
