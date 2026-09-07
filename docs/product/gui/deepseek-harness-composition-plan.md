# DeepSeek Harness Application Host Composition

Owner: `one-person-lab-app`
Purpose: `dsh_application_host_and_plugin_composition_boundary`
State: `active_architecture_truth`
Machine boundary: 本文解释 App 已批准的 Studio Application Host 架构。机器真相归
`contracts/app-product-profile.json`、`contracts/app-gui-product-contract.json`、
`contracts/app-shell-candidates.json`、`contracts/shell-adapters/opl-studio.json`、Studio source/tests
和真实 carrier evidence。本文不授权 active-shell 切换、发布、安装或 production-ready 声明。

## 结论

OPL Studio 以 DeepSeek Harness `v0.1.1-rc.2`、commit
`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` 为基座，复用的是完整 DSH/Cordis
Application Host 骨架和选定 GUI 源码，不是只复用 GUI 模块。

Studio 因此同时承担三类实现责任：

1. DSH profile、plugin tree、WebServer、Tool registry 和 Host lifecycle；
2. 由 `opl-codex-native` 原生持有的持久 Codex App Server、线程、审批和实时事件；
3. Electron Desktop、standalone headless WebUI 和 Docker WebUI 共用的 renderer、Host core
   与 App bridge。

这个决定不把 DSH 的产品 runtime authority 一并引入 OPL。Studio 不加载 `dsh-base`，也不采用
DSH Session、LLM Provider routing、Agent Loop 或 Credentials authority。App 产品、Framework
runtime/Package、Codex thread、domain truth 和 release authority 仍由各自 owner 持有。

## 两个 Host，不是两套 OPL

Framework 与 Studio 都是 Cordis Host，但 scope 不同：

| Host | 唯一 authority scope | 明确不拥有 |
| --- | --- | --- |
| OPL Framework Host | `framework_runtime_package_graph_and_app_projection` | Studio profile、Codex child lifecycle、Desktop/Web transport、App product/release truth |
| OPL Studio Application Host | `dsh_profile_plugin_lifecycle_codex_and_delivery_transport_composition` | Framework runtime、Package registry/currentness、App state/action truth、domain/product/release authority |

`framework_host_unique_within_scope=true` 只表示 Framework 在自己的 runtime/Package/projection
scope 内是唯一 Host，不表示 OPL 产品只能存在一个 Cordis process。Studio Host 可以并存，因为它
不创建第二套 OPL runtime、Package registry、Package currentness、App action 或产品 authority。

两个 Host 通过公开边界连接：

```text
OPL Framework Host
  -> opl app state/action
  -> authentication projection
  -> channel callbacks
  -> opl-framework-bridge
  -> OPL Studio Application Host
```

它们不共享内部 registry、service graph、session store 或 currentness writer。

## Studio Host 组成

Studio 启动独立 `opl-studio` DSH profile：

```text
DeepSeek Harness boot/profile/patch loader
  -> opl-dsh-tool-mcp
       -> opl-codex-native
            -> opl-framework-bridge
                 -> opl-host-core
                      -> opl-web-routes
```

当前只加载这些 DSH 服务：

- system prompt，但不注入 DSH harness identity 或 runtime context；
- native `ctx.tools` registry；
- Host WebServer 与 plugin inventory；
- Web-only frontend static 和 client modules。

启动顺序是 DSH Host tree 与 Tool MCP、Codex App Server、Framework bridge；关闭顺序反向释放
Framework callback、Codex child 和 Cordis tree。`opl-codex-native` 是 Studio 内唯一 Codex
runtime owner，持有：

- persistent App Server process；
- canonical threads and turns；
- approvals；
- live turn events。

Studio 不维护第二 thread store。Renderer 只保存偏好、draft 和可重建 UI metadata。

## DSH 插件兼容边界

DSH 插件不是因为安装在同一生态就自动兼容，兼容性取决于它依赖的 Host 服务：

| 插件类型 | Studio 兼容性 | 路径 |
| --- | --- | --- |
| 只向 `ctx.tools` 注册工具 | 直接兼容 | `ctx.tools` -> authenticated stateful loopback MCP -> persistent Codex App Server |
| 只依赖 Studio 已加载的 WebServer、inventory、frontend/client services | 可作为 Studio Host plugin 接入 | 由 Studio profile 明确 allowlist 和 lifecycle |
| 依赖 DSH Session、LLM Provider、Agent Loop 或 Credentials | 不直接兼容 | 需要单独的 OPL adapter 与 authority 决策；不得通过加载 `dsh-base` 绕过 |
| OPL Package / domain capability | 不转换成 DSH plugin | 继续由 Framework installed discovery、App schema 和 Host projection 提供 |

`opl-dsh-tool-mcp` 在 Host loopback 上提供带随机 bearer token 的 stateful MCP endpoint。Token
只进入 Codex child environment，Studio 不修改用户全局 Codex 配置；DSH tool inventory 变化通过
MCP `tools/list_changed` 通知 Codex。

因此，“可以使用 DSH 插件”的准确含义是：符合已加载 Host service 边界的插件可以复用；并不表示
DSH 自带的 session/provider/agent runtime 可以接管 Studio 主线程。

## Client Cordis 与 Application Host

Studio renderer 内还有一个 Host-derived Client Cordis，用于挂载 App GUI contributions。它不是
第三个 authority Host，也不是 server-side Studio Application Host。

Client graph 只能由以下输入派生：

```text
Framework app_state.ui_contributions projection
  + App product profile / slot policy
  -> Client Cordis
  -> settings.section / runtime.detail / composer.palette
```

Package descriptor 先经过 App-owned schema，再由 Framework Host 投影。Client 只渲染 typed
views，并把 `action_ref` 交给 canonical App action bridge；它不能发现、安装或更新 Package，不能
维护 registry/currentness，也不能获得 release-operation、task、Package、product 或 domain truth。

AionUI 与 Studio 共享的是这套 App Client Contribution ABI、state/action/event semantics 和
slot policy，不是 DSH Application Host 实现。AionUI 仍只消费独立固定的 bounded DSH visual cohort。

## 三种 Carrier

同一 Studio Host core 和 DSH-derived React renderer 服务三种 carrier：

| Carrier | Transport adapter | 当前合同状态 |
| --- | --- | --- |
| Electron Desktop | isolated preload + IPC | source/package/updater adapter implemented；distribution/update/release wiring separate |
| Standalone headless WebUI | Node HTTP/SSE | source/service/update adapter implemented；distribution/release wiring separate |
| Docker WebUI | Node HTTP/SSE in OCI | local OCI smoke/update adapter source implemented；multi-arch/signature/public release separate |

Carrier 可以有不同 OS integration、installer 和 updater，但不得分叉产品 renderer、Host business
logic、bridge ABI 或 authority。`npm run package` 在 clean committed Studio source 上按 App
`carrier_evidence_contract` 运行三种 carrier qualification，并生成 candidate-only manifest；该
manifest 不代表签名、公证、公开 feed、active-shell adoption 或 release admission。

## 上游升级能力

Studio 把 DSH 作为可跟随的 pinned upstream，而不是一次性复制。升级必须作为一个 cohort 完成：

1. 选择一个 exact upstream version 和 commit；禁止 floating branch、`latest` 或自动 promotion。
2. 同步 DSH package cohort、Host profile/overlay 与选定 GUI source inventory。
3. 重新生成 vendor manifest，区分 byte-identical source 与有真实 OPL caller 的最小外部 delta。
4. 重放 OPL profile patches、Host plugins、Codex MCP bridge 和 Framework bridge。
5. 运行 Host/MCP、renderer、Desktop/WebUI、candidate contract、license/notice 和 carrier gates。
6. 若 Host service、authority 或 App ABI 发生变化，先更新 App machine contract，再吸收 Studio source。

一次升级如果必须大面积改写 vendor source，或必须加载被排除的 DSH authority services，说明当前
adapter boundary 已失效，应重新做架构决策，而不是在 Studio 内维持长期私有 fork。

## 产品与准入

Repository relationship、candidate role 和 adoption 只维护在
[Studio product boundary](opl-studio-plan.md)，本地选择和命令见
[Shell candidates](gui-shell-candidates.md)。本架构允许 Studio 独立 Application Host，
但不据此改变 AionUI active-shell 或声明任何 carrier 已发布。

## Canonical References

- [`app-product-profile.json`](../../../contracts/app-product-profile.json) 的 `delivery_topology`
- [`app-gui-product-contract.json`](../../../contracts/app-gui-product-contract.json) 的 `ui_composition`
- [`app-shell-candidates.json`](../../../contracts/app-shell-candidates.json) 的 `opl-studio` candidate
- [`shell-adapters/opl-studio.json`](../../../contracts/shell-adapters/opl-studio.json) 的 `application_host`
- [`opl-studio-plan.md`](opl-studio-plan.md) 的产品角色、adoption 与仓库关系
- [`gui-shell-candidates.md`](gui-shell-candidates.md) 的 active/candidate Shell 选择
