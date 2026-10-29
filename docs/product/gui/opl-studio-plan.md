# OPL Studio Product And Repository Boundary

Owner: `one-person-lab-app`
Purpose: `opl_studio_product_role_repository_boundary_and_adoption`
State: `active_studio_shell_release_and_migration_evidence_owner_routed`
Machine boundary: 本文解释 OPL Studio 在 App 产品中的角色。产品和 adoption 真相归 App
contracts；Application Host、renderer 与 carrier source 归 `opl-studio`；runtime/Package truth
归 Framework。当前 active release adapter 是 `opl-studio`。

## Decision

`opl-studio` 是 One Person Lab App 当前的第一方实现仓库。它不是简单 GUI module、空 Shell
或 OPL Framework plugin，而是基于 DeepSeek Harness `v0.2.1-rc.2` 的独立 DSH/Cordis
Application Host，原生管理 Codex App Server，并为 Electron Desktop、standalone headless WebUI
和 Docker WebUI 提供同一 renderer、Host core 和 App bridge。

One Person Lab App 是唯一面向用户的产品；普通界面继续显示 `One Person Lab`。
`Studio` 描述当前 DSH/Cordis 应用架构与源码仓库，不另立正式产品。Stable 与 Nightly 是
发布渠道，Standard 与 Full 是安装包形态，Desktop 与 WebUI 是使用载体。Full 在同一 Stable
Release 中提供预置 runtime 与 Package 的首次安装包；Nightly 不代表 Stable 资格。

macOS Stable 从 26.9.25 起采用 Studio，保留原 App bundle identity 和更新入口。
Studio Preview 保留独立身份，终结桥通过经过签名验证的目标包交接到正式 App。
迁移身份、允许导入的数据、验收路线与删除条件只维护在
[分发与安装参考](../../delivery/distribution-and-install-ssot.md) 和 App release contract。
原始切换的公开发布、Preview 交接、旧版连续升级与各平台验收记录保留在
[9 月切换证据](../../history/studio-cutover-2026-09.md)，不自动证明后续版本。
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

Docker WebUI 的当前构建来源同样是 Studio，独立维护 GHCR 版本和 Stable/Latest 指针。
平台、持久化和运行验收规则归 [分发与安装参考](../../delivery/distribution-and-install-ssot.md)。
移动的 tag/digest 必须从该渠道公开回读，不能从原始切换记录推断。

### Workspace WebUI 路径与启动配置

产品传输语义归 `contracts/app-runtime-bridge.json#webui_http_transport`。
同一 WebUI 支持根入口 `/` 和 Serve 发布的 `/w/workspace_<hex>/`。
Serve 覆盖客户端的 `X-Forwarded-Prefix`，剥离外部 prefix 后代理到 Studio 原有的根路由；
Studio 仅在 cloud 或显式 `OPL_WEBUI_TRUST_PROXY=1` 时消费该可信头。
未提供可信 prefix 时 base 为 `/`，非法或多值可信 prefix 拒绝请求。
base 来自请求头，不从浏览器 pathname 猜测。

Studio 通过官方 `renderIndexInjections` 注入一个规范化且以 `/` 结尾的 `<base>`，
位于相对静态资源之前，保留原 boot injections。静态资源、fetch、SSE、下载、登录、
退出及跳转都解析到同一 base；session Cookie 的签发和清除使用相同 base Path，
保持 host-only、HttpOnly、SameSite 和 cloud Secure 属性。浏览器不得跳回根 `/api`。
Cloud 持有路由、TLS 和租户准入，Studio 持有页面及传输实现；不在代理中重写 HTML/JS。

启动配置归 `contracts/app-runtime-bridge.json#webui_deployment`。通用 Docker 镜像仍默认
`local/none`。正式 Cloud runtime 的 publisher `applicationRevisionTemplate.entrypoint` 使用
标准 `/usr/bin/env` 包住原 `/usr/local/bin/opl-webui-entrypoint`，在其启动前明确设置
`cloud/password`、用户名与密码/session 文件位置，且与 application revision 声明的
credential target、username 一致。Serve 只按声明挂文件，不负责补齐 OPL 非 secret env；
fragment 并入现有模板，复用 `admin-password` / `session-secret`，保持
`applicationAccess.usernameCredentialName=admin-password` 与原 `gateway` credential。
挂载文件自身不选择模式。Gateway Key 是独立 Framework 凭据，不能代替 WebUI 密码或
session secret。保留镜像 OCI CMD，由通用 executor 追加，避免覆盖 package 安装命令。
准确 recipe、独立发布及资格边界见
[Docker 发布参考](../../delivery/release/README.md#docker-webui)。

这些字段定义验收要求。App contract 检查与本地 source 测试不证明已发布镜像或真实
Workspace 已验收；必须绑定新 Studio/App cohort、OCI digest 与 Cloud 的实际入口回读。

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

正式 App 与 Preview 的身份和迁移准入由 App 持有，Studio 实现桥和迁移入口。
Codex 原生线程、Framework runtime/Package/credentials、Workspace source 与领域产物
继续留在原 owner；Shell 只导入合同允许的偏好、原生线程关联元数据与持久草稿。
完整顺序、碰撞处理、只读来源和回滚规则见分发参考，不在此复制第二套迁移政策。

`contracts/app-shell-adapter.json`、release contract 根字段 `active_shell` 和
当前 wrapper/workflow 决定生产实现，现为 Studio。旧 transition phase、AionUI visual
字段与原始基线只能解释迁移来源，不能覆盖 active adapter 或把公开 Studio Stable
写成尚未采用。反过来，active adapter 和已公开版本也不证明每条历史路线或后续版本
已经验收；精确 publication/installation/qualification 仍读取 owner 的产物与 receipts。

`opl-aion-shell` 已归档，全部生产构建入口已迁出；历史源码、tags、Release 与固定迁移
夹具继续保留，不继续 upstream intake。旧 AionUI 连续升级和 Preview 固定目标的验收
范围见保留记录；当前 Windows 真实旧版升级认证仍不得由资产存在或旧 macOS 证据代替。

## Canonical References

- [`app-product-profile.json`](../../../contracts/app-product-profile.json) 的 `delivery_topology`
- [`app-gui-product-contract.json`](../../../contracts/app-gui-product-contract.json) 的 `ui_composition`
- [`app-shell-candidates.json`](../../../contracts/app-shell-candidates.json) 的 candidate 与 carrier evidence contract
- [`shell-adapters/opl-studio.json`](../../../contracts/shell-adapters/opl-studio.json) 的 Application Host adapter
- [`app-release-channel.json`](../../../contracts/app-release-channel.json) 的 shell transition policy
- [`gui-shell-candidates.md`](gui-shell-candidates.md) 的 active/candidate selection
