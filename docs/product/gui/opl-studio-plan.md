# OPL Studio Product And Repository Boundary

Owner: `one-person-lab-app`
Purpose: `opl_studio_product_role_repository_boundary_and_adoption`
State: `active_studio_shell_macOS_stable_published_migration_qualification_in_progress`
Machine boundary: 本文解释 OPL Studio 在 App 产品中的角色。产品和 adoption 真相归 App
contracts；Application Host、renderer 与 carrier source 归 `opl-studio`；runtime/Package truth
归 Framework。当前 active release adapter 是 `opl-studio`。

## Decision

`opl-studio` 是 One Person Lab App 当前的第一方实现仓库。它不是简单 GUI module、空 Shell
或 OPL Framework plugin，而是基于 DeepSeek Harness `v0.1.7-rc.2` 的独立 DSH/Cordis
Application Host，原生管理 Codex App Server，并为 Electron Desktop、standalone headless WebUI
和 Docker WebUI 提供同一 renderer、Host core 和 App bridge。

One Person Lab App 是唯一面向用户的产品；普通界面继续显示 `One Person Lab`。
`Studio` 描述当前 DSH/Cordis 应用架构与源码仓库，不另立正式产品。Stable 与 Nightly 是
发布渠道，Standard 与 Full 是安装包形态，Desktop 与 WebUI 是使用载体。Full 在同一 Stable
Release 中提供预置 runtime 与 Package 的首次安装包；Nightly 不代表 Stable 资格。

macOS Stable 从 26.9.25 起采用 Studio，保留原 App bundle identity 和更新入口。
Studio Preview 保留独立身份，终结桥通过经过签名验证的目标包交接到正式 App；该桥的公开
发布已完成：Preview 0.1.17、0.1.18 均通过原生更新到 0.1.19 再交接 Stable 的隔离 VM 验收。
AionUI 26.9.23、26.8.8 基线均已通过公开原生更新链进入 `26.9.2594`，并在真实 Codex
0.157 下验证普通和归档中文历史、置顶、附件、原数据库及重复更新检查。Windows x64 安装器、blockmap、
更新元数据和实际构建来源已追加至同一 Stable Release；未签名状态明确，真实 Windows 升级认证
仍独立记录，不阻塞附加包发布。
Nightly 与发布说明也必须读取 App 的 active-shell 合同，不得固定选择历史 Aion 仓库。

## Repository Relationship

| Repository | Sole owner |
| --- | --- |
| `one-person-lab-app` | One Person Lab App 产品定义、GUI ABI、Client profile、page state、active-shell、版本组合、carrier evidence contract、迁移与 release |
| `opl-studio` | DSH profile/plugin lifecycle、`opl-codex-native`、DSH tool MCP、Framework bridge、renderer、Desktop/WebUI/OCI carrier source 与 focused validation |
| `one-person-lab` | Framework runtime、installed Package discovery/graph/currentness、App projection、state/action/authentication/channel callback contracts |
| `opl-aion-shell` | 历史 AionUI 实现与旧版升级基线；生产构建已全部迁出；归档保留 tags、releases 和固定测试夹具的只读可达性 |

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

Docker Stable 的 `26.9.25-r1`、`stable`、`latest` 已在运行 `36109952035` 完成切换，
公开双架构索引为 `sha256:319ffc9cc3d5078a6363bc673b85176cda1a489d29e390338bfd1b96ac2b124b`。
原生 amd64 / arm64 验收覆盖启动、登录、Framework/Codex readiness、上传与持久化；
兼容旧容器仅设置密码的配置，并持久保存自动生成的会话密钥。

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

Studio 与 Codex App 复用同一 `CODEX_HOME` 和 Codex App Server 原生线程。切换界面不复制
对话、不创建迁移线程，也不拼接另一套历史。旧 OPL 数据只读提供原生线程 ID、置顶、排序
及可取得的语言/主题偏好；必须由 App Server 确认线程身份。自动发现限定 OPL 与 Preview
的既有目录，不扫描独立 AionUI/AionUi 或其他应用的历史。没有原生关联的记录保留在来源中。
先前迁移索引和来源快照保留作为恢复证据；无效或范围外绑定退出自动迁移，不删除任何
Codex 原生线程。历史创建但已存在于 Codex 的线程继续由 Codex 拥有，不擅自清除。

Docker 同样复用挂载的 Codex 数据；显式旧目录只用于读取上述元数据。新任务、消息、归档
与删除均使用 Codex 公共操作。Shell 私有草稿不等于 Codex 会话；旧进程内存草稿无法从磁盘恢复。

发布状态以 App 合同与准确公开产物为准：`active_shell_adopted=true` 已进入主线，
macOS Standard 已通过公开前签名、公证、Gateway 登录、Official Profile 首装和运行就绪验收。
Preview 的两条基线交接验收已完成；旧 AionUI 的更新安装与历史延续已在公开 `26.9.2594`
回读通过。Full 已在运行 `36114062851` 发布，并通过准确签名包的首装与 Temporal
生命周期验收。Nightly 及其他平台分别保留自身公开回读，不能由 Standard 代替。

Desktop Stable 和 Nightly 已使用 Studio。Docker WebUI 的源码选择、构建和运行验收也统一到
Studio；沿用 GHCR 版本标签、Stable/Latest 指针、原生 amd64/arm64 验收以及 `/data`、
`/projects` 持久化约定。镜像嵌入 Framework 和 Codex，首次安装使用 App Official Profile，
已有数据卷保留原 Package 选择并只读导入历史。`26.9.25-r1`、`stable`、`latest` 已回读为
同一 Studio 双架构 digest；原生验收覆盖登录、上传、Framework/Codex 就绪和数据卷重启持久化。

`opl-aion-shell` 已归档，全部生产构建入口已迁出；历史源码、tags、Release 与固定迁移
夹具继续保留。当前 macOS Standard 修复包沿用 `v26.9.25-r1`，机器版本 `26.9.2594`，
构建来源运行 `36118012448`，原字节首装验收运行 `36120104132`。Full 保留已合格的
`26.9.2592` 首装包，后续通过 Standard 更新器更新；Preview 0.1.19 保留固定签名的
`26.9.2593` 交接包，再由 Stable 更新器接续。

真实旧版验收链为 `26.9.2391 → 26.9.2593 → 26.9.2594` 与
`26.8.890 → 26.9.2592 → 26.9.2593 → 26.9.2594`；不得将连续升级证据改写为
每个旧版本都已测试一步直达。Windows 的真实旧版升级仍未认证。

## Canonical References

- [`app-product-profile.json`](../../../contracts/app-product-profile.json) 的 `delivery_topology`
- [`app-gui-product-contract.json`](../../../contracts/app-gui-product-contract.json) 的 `ui_composition`
- [`app-shell-candidates.json`](../../../contracts/app-shell-candidates.json) 的 candidate 与 carrier evidence contract
- [`shell-adapters/opl-studio.json`](../../../contracts/shell-adapters/opl-studio.json) 的 Application Host adapter
- [`app-release-channel.json`](../../../contracts/app-release-channel.json) 的 shell transition policy
- [`gui-shell-candidates.md`](gui-shell-candidates.md) 的 active/candidate selection
