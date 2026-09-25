# OPL Studio Product And Repository Boundary

Owner: `one-person-lab-app`
Purpose: `opl_studio_product_role_repository_boundary_and_adoption`
State: `active_studio_shell_macOS_stable_published_migration_qualification_in_progress`
Machine boundary: 本文解释 OPL Studio 在 App 产品中的角色。产品和 adoption 真相归 App
contracts；Application Host、renderer 与 carrier source 归 `opl-studio`；runtime/Package truth
归 Framework。当前 active release adapter 是 `opl-studio`。

## Decision

`opl-studio` 是 One Person Lab App 当前的第一方实现仓库。它不是简单 GUI module、空 Shell
或 OPL Framework plugin，而是基于 DeepSeek Harness `v0.1.6-alpha.1` 的独立 DSH/Cordis
Application Host，原生管理 Codex App Server，并为 Electron Desktop、standalone headless WebUI
和 Docker WebUI 提供同一 renderer、Host core 和 App bridge。

One Person Lab App 是唯一面向用户的产品；普通界面继续显示 `One Person Lab`。
`Studio` 描述当前 DSH/Cordis 应用架构与源码仓库，不另立正式产品。Stable 与 Nightly 是
发布渠道，Standard 与 Full 是安装包形态，Desktop 与 WebUI 是使用载体。Full 在同一 Stable
Release 中提供预置 runtime 与 Package 的首次安装包；Nightly 不代表 Stable 资格。

macOS Stable 从 26.9.25 起采用 Studio，保留原 App bundle identity 和更新入口。
Studio Preview 保留独立身份，终结桥通过经过签名验证的目标包交接到正式 App；该桥的公开
发布与两条旧版升级路径仍需实际验收，不能由新装成功推定。Windows 附加发布尚未完成。
Nightly 与发布说明也必须读取 App 的 active-shell 合同，不得固定选择历史 Aion 仓库。

## Repository Relationship

| Repository | Sole owner |
| --- | --- |
| `one-person-lab-app` | One Person Lab App 产品定义、GUI ABI、Client profile、page state、active-shell、版本组合、carrier evidence contract、迁移与 release |
| `opl-studio` | DSH profile/plugin lifecycle、`opl-codex-native`、DSH tool MCP、Framework bridge、renderer、Desktop/WebUI/OCI carrier source 与 focused validation |
| `one-person-lab` | Framework runtime、installed Package discovery/graph/currentness、App projection、state/action/authentication/channel callback contracts |
| `opl-aion-shell` | 历史 AionUI 实现与旧版升级基线；生产调用方全部切换并验收后才可归档 |

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

本次切换保留两条迁移路线：

1. 既有 AionUI App 从保留的 App identity/feed 原地升级到 Studio renderer；
2. Studio Preview 通过一个 exact signed handoff 安装同一正式 App release。

正式 App 首次启动只迁移 allowlisted shell-local preferences、canonical-thread-keyed UI metadata
和 unsent drafts。Codex threads、Gateway credentials、Framework Package/runtime/receipts、Workspace
source 和 domain artifacts 继续由原 owner 提供；AionUI/AionCore database、cookies、secrets、
Electron cache 和 updater identity 不整体复制。

Studio 首次启动还提供有界的旧会话导入：只读 SQLite 或旧 JSON，保留私有来源快照；已有
Codex ID 直接关联，旧后端专有会话通过公开接口关联新的 Codex thread。旧问答作为明确的
来源历史显示，并在继续对话时作为上下文传入，新 turn 始终归 Codex App Server。不会恢复
旧后端运行进程或复制其凭据。持久化的置顶、排序和可取得的语言/主题偏好合并到 Studio，
已有 Studio 选择优先。当前 AionUI 草稿仅在内存中，旧进程退出后不能从磁盘恢复。

macOS 自动发现既有数据位置；Docker 必须挂载旧数据卷，可用 `OPL_AIONUI_DATA_DIR` 指定
只读挂载目录。来源保留、绑定持久化、失败可重试以及删除后不重新导入属于同一迁移行为。
这些首次启动能力可先进入独立 Preview，不替代正式 App identity 切换的签名与迁移验收。

发布状态以 App 合同与准确公开产物为准：`active_shell_adopted=true` 已进入主线，
macOS Standard 已通过公开前签名、公证、Gateway 登录、Official Profile 首装和运行就绪验收。
旧 AionUI 与 Studio Preview 的真实升级、数据延续和后续更新源是独立的待收尾验收，
不改写为已经完成。Full、Nightly 及其他平台分别保留自身公开回读，不能由 Standard 代替。

Desktop Stable 和 Nightly 已使用 Studio。独立 Docker WebUI 当前仍按
`app-release-channel.json#webui_ghcr_image.shell_source` 固定到 Aion Shell；
`_release-webui-carrier.yml` 仍从该仓库构建生产镜像。共享 Studio renderer 的实现能力
不代表这个独立镜像已完成迁移。

因此当前保留 `opl-aion-shell`，不宣布所有发布载体均已切换。归档前应完成两条旧版迁移
验收，明确 Docker WebUI 的后续实现，并处理仍使用旧 Shell 的源码预检及平台诊断入口。
只读历史 checkout 和迁移 fixture 可以在归档后继续使用，无需删除。归档不删除旧用户
数据、旧安装包或旧 Release。

## Canonical References

- [`app-product-profile.json`](../../../contracts/app-product-profile.json) 的 `delivery_topology`
- [`app-gui-product-contract.json`](../../../contracts/app-gui-product-contract.json) 的 `ui_composition`
- [`app-shell-candidates.json`](../../../contracts/app-shell-candidates.json) 的 candidate 与 carrier evidence contract
- [`shell-adapters/opl-studio.json`](../../../contracts/shell-adapters/opl-studio.json) 的 Application Host adapter
- [`app-release-channel.json`](../../../contracts/app-release-channel.json) 的 shell transition policy
- [`gui-shell-candidates.md`](gui-shell-candidates.md) 的 active/candidate selection
