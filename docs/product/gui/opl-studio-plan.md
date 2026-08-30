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

## Native Codex Boundary

`opl-codex-native` 是 Studio 内唯一 Codex runtime owner。它启动一个持久
`codex app-server --stdio`，并持有 canonical threads/turns、approvals 和 live events。Studio
renderer 不保存第二份会话真相。

DSH `ctx.tools` 通过 authenticated stateful loopback MCP 暴露给同一个 Codex child。因此只注册
tools、或只依赖 Studio 已加载 Host services 的 DSH plugins 可以直接复用。依赖 DSH Session、LLM
Provider、Agent Loop 或 Credentials 的 plugins 需要单独 adapter；Studio 不通过加载 `dsh-base`
来换取兼容性。

OPL Packages 仍由 Framework installed discovery 和 App contribution ABI 提供，不转换成 DSH
plugins，也不由 Studio 维护 Package catalog。

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

## Current Source Status

App contracts 将 Studio Application Host 标为
`source_implemented_release_admission_separate`。当前 source contract 已包含：

- pinned RC2 DSH boot/profile/overlay 和 selected GUI source cohort；
- OPL Host plugin tree 与可回收 lifecycle；
- persistent native Codex App Server；
- DSH tools-to-Codex MCP bridge；
- Framework state/action/auth/channel bridge；
- shared renderer/Host core across Electron and HTTP/SSE；
- three-carrier candidate evidence generator；
- authenticated Cloud-shaped WebUI、native `amd64`/`arm64` Preview OCI workflow、
  Cosign verification 与 `opl_studio_cloud_workspace_image_handoff.v1` admission；
- App/Framework/Studio/AionUI Client conformance gate。

本地三 carrier manifest 仍只证明 candidate build，不是 release 声明。公开 OCI Preview 使用独立
handoff：App 只接纳 `ghcr.io/gaofeng21cn/opl-studio-webui` 的 immutable index/child digests、
双原生架构、BuildKit SPDX/max provenance 和固定 GitHub OIDC workflow identity。该 admission
不改变 Desktop distribution wiring、App Stable、active shell 或 Cloud activation 状态。

## Three-Carrier Candidate Evidence

Studio `npm run package` 不再只构建 Electron `.app`，而是按 App contract 顺序验证并生成：

1. Electron Desktop `.app`；
2. standalone headless WebUI archive；
3. Docker local smoke receipt；
4. `out/opl-studio-carrier-evidence-manifest.json`。

该命令要求 Studio tracked source 已提交且在运行前后保持 clean，以便 manifest 绑定 exact
`source_commit`。它从当前 App checkout 读取 `carrier_evidence_contract`，不会在 Studio 复制另一份
carrier authority。生成物是 ignored local evidence；它不授权发布或 active-shell 切换。

独立 WebUI Preview publication 由 Studio 的
`.github/workflows/studio-webui-preview.yml` 持有，只允许 `v<Studio version>`、`sha-<Studio SHA>`
和验收后移动的 `preview` 标签，禁止 `stable/latest`。App 使用
`npm run validate:candidate:studio:cloud-handoff -- <handoff.json>` 验证交付给 OPL Cloud 的 ABI；
Cloud owner 后续激活与真实 Workspace smoke 不属于 Studio/App source admission。

## Upstream DSH Policy

Studio 必须保持可跟随上游，而不是形成私有 DSH fork：

- 一个 exact version/ref 和一组同步 package versions；
- profile、Web overlay、vendor inventory、license notices 同 cohort；
- OPL branding、bridge、Host plugins 和 product behavior 留在 vendor tree 外；
- 只允许有真实 OPL semantic/host/platform/accessibility caller 的最小 source delta；
- 每次升级重跑 Host/MCP、renderer、Desktop/WebUI、candidate、notice 和 carrier gates；
- Host service 或 authority 变化时先更新 App contract，再吸收 Studio implementation。

完整升级方法见
[`deepseek-harness-composition-plan.md`](deepseek-harness-composition-plan.md)。

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
