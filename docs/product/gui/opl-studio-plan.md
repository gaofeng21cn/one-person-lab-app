# OPL Studio Product And Repository Boundary

Owner: `one-person-lab-app`
Purpose: `opl_studio_product_role_repository_boundary_and_adoption`
State: `active_product_development_release_admission_separate`
Machine boundary: 本文解释 OPL Studio 在 App 产品中的角色。产品和 adoption 真相归 App
contracts；Application Host、renderer 与 carrier source 归 `opl-studio`；runtime/Package truth
归 Framework。本文不改变当前 AionUI active release adapter。

## Decision

`opl-studio` 是 One Person Lab App 的第一方 successor 实现仓库。它不是简单 GUI module、空 Shell
或 OPL Framework plugin，而是基于 DeepSeek Harness `v0.1.1-rc.2` 的独立 DSH/Cordis
Application Host，原生管理 Codex App Server，并为 Electron Desktop、standalone headless WebUI
和 Docker WebUI 提供同一 renderer、Host core 和 App bridge。

App 仍把实现选择建模为 Shell role：

- `aionui` 是当前 Stable active release shell；
- `opl-studio` 是唯一 foreground alternative；
- source implemented 不自动等于 active-shell adopted；
- release admission 仍由 App owner 单独决定。

因此，“Studio 是完整 Application Host”和“Studio 当前仍是 candidate Shell”同时成立：前者描述
Studio 仓库内部架构，后者描述 App 当前发布组合中的角色。

## Repository Relationship

| Repository | Sole owner |
| --- | --- |
| `one-person-lab-app` | One Person Lab App 产品定义、GUI ABI、Client profile、page state、active-shell、版本组合、carrier evidence contract、迁移与 release |
| `opl-studio` | DSH profile/plugin lifecycle、`opl-codex-native`、DSH tool MCP、Framework bridge、renderer、Desktop/WebUI/OCI carrier source 与 focused validation |
| `one-person-lab` | Framework runtime、installed Package discovery/graph/currentness、App projection、state/action/authentication/channel callback contracts |
| `opl-aion-shell` | 当前 Stable AionUI renderer/process/package implementation 与 upstream intake |

App repo 不复制 Studio source，Studio 也不复制 App product truth。App wrapper 通过
`contracts/shell-adapters/opl-studio.json` 选择 Studio checkout，校验 App-owned compatibility，
并把当前 App checkout 的绝对 `OPL_APP_REPO_ROOT` 注入 Studio 命令。这样 task worktree、CI checkout
和 sibling repo 都读取同一 App contract cohort，不会误用旁边另一个 App checkout。

Studio 不是 `one-person-lab` Framework Host 的子插件。两个 Cordis Host 通过公开协议对接：

```text
Framework Host scope
  = framework_runtime_package_graph_and_app_projection

Studio Application Host scope
  = dsh_profile_plugin_lifecycle_codex_and_delivery_transport_composition

Bridge
  = opl app state/action + authentication + channel callbacks
```

scope 分离保证 Studio 可以使用 DSH plugin ecosystem，同时不会创建第二套 OPL runtime、Package
registry/currentness、App state/action、domain 或 product/release authority。

## Application Host

Studio 独立持有 DSH profile/plugin lifecycle、native Codex App Server、Framework bridge
与三 carrier transport；Framework 持有 runtime/Package authority，App 持有产品/adoption。
Host 结构、DSH plugin 兼容性和上游升级方法只维护在
[Application Host composition](deepseek-harness-composition-plan.md)。

## Product Shape

三种 carrier 必须保持同一产品行为：

- 左侧是 project/conversation/search/Settings rail；
- 中心是 DSH conversation timeline 和 persistent composer；
- 右侧只按需打开 Run status、Files and results、Agents and capabilities；
- Package lifecycle 位于 Settings；
- files 只来自用户选择，results 只来自 owner-projected artifacts；
- 用户可见 identity 是 `One Person Lab`，`OPL Studio` 只用于 repo、candidate 和 Preview artifact。

GUI contributions 只进入 App 声明的 `settings.section`、`runtime.detail` 和
`composer.palette`。Client graph 由 Framework projection 与 App slot policy 派生，不允许
browser-side Package discovery、arbitrary code plugin、第二 action bus 或第二 session store。

## Carrier Evidence

Source stage 从 `contracts/app-shell-candidates.json` 与 Studio adapter 读取，当前 source
或本地 build 不外推 adoption/release。`npm run package:candidate:studio` 由 App wrapper
将当前 App checkout 注入 Studio，在 committed/clean source 上产出 Desktop、standalone
WebUI、Docker smoke 和 exact-commit carrier manifest。详细操作只维护在
[Shell candidates](gui-shell-candidates.md)。

公开 WebUI Preview 使用独立 OCI handoff。App 接纳 immutable multi-arch digests、
provenance 与 workflow identity，并通过
`npm run validate:candidate:studio:cloud-handoff -- <handoff.json>` 验证 App/Cloud ABI。
Preview 的 `latest` 不表示 Stable 或 active-shell adoption；Cloud activation 与真实
Workspace smoke 仍归 Cloud owner。具体 image、tag 和 admission 字段以 App machine contract
及 Studio publication workflow 为准，本文不复制移动的发布清单。

## Adoption And Release

Studio Preview 保持独立 product name、bundle id、user-data root、repository 和 updater feed。它可以
用于候选验证，但不能冒充当前 `/Applications/One Person Lab.app` 或 App Stable feed。

未来 adoption 仍保留两条迁移路线：

1. 当前 AionUI App 从保留的 App identity/feed 原地升级到 Studio renderer；
2. Studio Preview 通过一个 exact signed handoff 安装同一正式 App release。

正式 App 首次启动只迁移 allowlisted shell-local preferences、canonical-thread-keyed UI metadata
和 unsent drafts。Codex threads、Gateway credentials、Framework Package/runtime/receipts、Workspace
source 和 domain artifacts 继续由原 owner 提供；AionUI/AionCore database、cookies、secrets、
Electron cache 和 updater identity 不整体复制。

Adoption 只有在以下 owner evidence 完成后才可发生：

- minimum-complete App user outcomes；
- three-carrier package/install/update/rollback evidence for the claimed scope；
- signing/notarization/public artifact/feed evidence where applicable；
- clean-host/VM and accessibility evidence for claimed platforms；
- migration and rollback qualification；
- explicit update of `contracts/app-shell-adapter.json`；
- final installed/runtime/App/Framework owner readback。

在此之前固定：

- `active_shell_adopted=false`；
- `release_ready=false`；
- AionUI remains Stable mainline；
- Studio source, local package, Preview 或 candidate manifest 都不能单独关闭 adoption gate。

## Canonical References

- [`app-product-profile.json`](../../../contracts/app-product-profile.json) 的 `delivery_topology`
- [`app-gui-product-contract.json`](../../../contracts/app-gui-product-contract.json) 的 `ui_composition`
- [`app-shell-candidates.json`](../../../contracts/app-shell-candidates.json) 的 candidate 与 carrier evidence contract
- [`shell-adapters/opl-studio.json`](../../../contracts/shell-adapters/opl-studio.json) 的 Application Host adapter
- [`app-release-channel.json`](../../../contracts/app-release-channel.json) 的 shell transition policy
- [`gui-shell-candidates.md`](gui-shell-candidates.md) 的 active/candidate selection
