# DSH 插件与 OPL 设置归属

Owner: `one-person-lab-app`
State: `active`
Scope: DeepSeek Harness `dsh-v0.2.3-alpha.2@4b399c39a6d1479cd84ca591b4d7c88e24d38a96`（`0.2.3-alpha.2` package cohort）与 OPL Studio 适配。GUI 源码与 npm cohort 均绑定同一官方 release tag。

这份文档说明插件的源码和安装位置、开发归口、DSH 官方插件在 OPL 中的状态，以及设置归属。统一分类和仓库决策以 [插件组合与仓库边界](plugin-composition-map.md) 及 [插件组合分类合同](../../../contracts/app-plugin-composition-taxonomy.json) 为准；插件 UI/设置的四统一理想标准、三级接入规范与通用表单/槽位演进详见新 SSOT [插件 UI、设置接入与全插件理想态标准](plugin-ui-and-settings-standard.md)。当前源码组成用 `scripts/plugin-composition-inventory.mjs` 动态读取。默认策略是吸收 DSH 的有价值能力；已有 OPL owner 时复用 DSH 的 UI、协议和交互，再接入现有 owner。只有明确与 OPL 设计冲突、会制造第二份 authority 或无法满足安全/数据边界的部分才排除。

## 工程原则与升级边界

选择 DSH 的工程目标是复用其插件化应用框架，让 OPL 的上层能力可以通过标准扩展点
开发、组合和管理，并随 DSH 升级持续维护。**DSH 原生插件化与持续升级能力，是 OPL App 的工程约束。**此原则覆盖已实现能力，也覆盖正在开发的
Mini App、统一连接授权、设置与后续领域功能。产品定制应集中在 OPL 插件、配置和
必要的 owner 适配中；DSH 的通用机制继续由上游维护。

| 边界 | 优先复用 | OPL 保留的语义 |
| --- | --- | --- |
| 应用插件 | DSH npm metadata/exports、profile、Cordis 服务依赖与生命周期、原生 inventory | 组合哪些插件、暴露哪些产品能力，以及所需 Codex/Framework 服务适配 |
| 客户端与设置 | DSH Client Modules、slots、Settings 与主题/语言扩展点 | App 导航、显示偏好和 owner 状态/动作映射 |
| 工具与 Mini App | MCP、官方 MCP Apps SDK 和 DSH 已提供的对应能力 | 将工具/UI 接入现有线程、授权、任务与领域操作 |
| 独立软件 Package | 原生载体安装与 Framework 发现、投影 | 软件 owner 持有 Package 身份、业务数据、动作与质量判断 |

App 的 contribution schema、Framework state/action 和 Connect 授权合同描述 OPL
业务与信任边界；它们不定义另一套 DSH 插件 ABI。业务声明由适配器映射到原生扩展点，
不要求普通 DSH 插件实现 OPL 领域合同。OPL Package 也不因进入 App 就改成 DSH 插件。
服务归属不同，应在现有服务上适配输入和结果，不复制插件加载、生命周期、设置存储、
会话或凭据管理。Mini App 内部复用组件不形成新的宿主协议。

新增定制先检查固定 DSH cohort 的公开扩展点和官方实现。可直接复用的直接复用；
产品语义有差异的通过标准插件提供薄适配；公开扩展点确实缺失时才保留有界兼容层。
在现有实现文档中说明具体缺口、涉及的上游接口、真实调用者、验证方式与删除条件，
不为此新增平行 registry、版本兼容矩阵或审批流程。上游补齐等价能力后，在同一改动中
迁移调用者并删除被替代实现。判断依据是接口、生命周期和实际行为，不是包名相似。

DSH 官方源码及其构建链是升级兼容基准。Studio renderer 采用官方 `apps/web` 的 Vite 6.4.3 与 React 插件 4.7.0；不为本地 Bun 打包器限制改写官方 CSS 或时间规则源码。Bun 目前只承担既有测试、脚本和 OPL 自有 Host 插件打包，不能成为阻挡官方 UI 升级的前提。renderer 仍保留载体入口/文件名、tsconfig aliases、单 bundle 输出和已声明的依赖解析适配；上游配置变化时在既有入口核对并删去已不需要的差异。

当前 Host 使用官方 boot/profile 与 Cordis 插件机制；客户端在同一 Cordis context
中使用官方 `SlotRegistry` 管理 slots、store、factory、声明依赖和卸载，每个客户端
实例独立。社区设置搜索通过真实 Cordis 依赖注入和生命周期装载；其搜索目录及语言
只映射 App projection。设置导航与 `SettingsRoot` 共用官方 `createSettingsShellStore`
和 actions，已删除手工 renderer host、模块级 singleton、假 session scope、手工
`apply()` context 与构建期 settings navigation overlay。vendor 保留固定上游 provenance，
仅允许 source manifest 绑定并经 replay 验证的兼容及 owner UI 扩展补丁。
Codex 仍持有线程和审批；官方 renderer 所需的 session scope 由当前 canonical
线程投影提供，切换时销毁旧视图 fiber。新增 scoped hooks 继续接 canonical owner。

升级使用 Studio 的 [既有维护入口](https://github.com/gaofeng21cn/opl-studio/blob/main/README.md#dsh-upstream-maintenance)：
`dsh:status` 读取绑定，`dsh:preflight -- --source <checkout>` 从干净官方源码核对目标
及实际 package cohort。选定目标并更新 source manifest、精确 npm cohort 和 lockfile 后，
`dsh:replay -- --source <checkout>` 重放 vendor 并执行兼容检查；`dsh:verify` 只执行
检查。命令核对实际安装版本、官方插件 metadata admission、Desktop/Web profile schema、
真实 Host inventory/生命周期、客户端、MCP 与 candidate gates。当前内置插件的
`engines.dsh` 与已验证的固定 cohort 一致。

每次升级都重新核对可删除的适配，并验证相关 carrier。源码兼容验证不承诺任意 DSH
版本或插件自动兼容；发布与安装验收继续走 App 原有流程。

## 0. 源码、安装位置与开发归口

OPL App 复用 DSH/Cordis 的应用骨架和 GUI，通过 Studio 的标准 DSH 插件接入持久
Codex App Server 与 Framework；内置包随 App 提供基线，兼容 Host 包也可以通过原生
DSH profile 独立更新，见[分层更新模型](../managed-update-three-layer.md#dsh-plugin-updates-within-the-app-layer)。
Host 插件、客户端插件和独立软件 Package 各有交付入口。软件中心按产品用途显示，已安装和已启用状态由实际载体提供。

### 源码放在哪里

下表以各源码仓库根目录为基准。Studio 路径采用下一批次的分组布局，实际加载组合见 App Shell 合同。

| 类别 | 源码位置 | 装载依据与更新归属 |
| --- | --- | --- |
| Studio 内置 Host 与客户端插件 | `opl-studio/plugins/{core,extensions,channels}/<plugin-id>/`。共享协议与工具归 `packages/host-contracts/`、`packages/host-kit/`，Workbench、slots 和客户端组合归 `opl-studio-client` | `src/host/dsh/cordis.yml` 与 `web.patch.yml` 提供基线，官方 Host 发现启用插件的 `dsh.client`。兼容包通过原生 profile 独立更新，Electron、DSH cohort 和 boot shell 通过 App 更新 |
| DSH 官方和社区 UI | Studio 的 npm 依赖、`vendor/deepseek-harness/` | 固定 DSH cohort、npm lock 与第三方原包溯源；随 App/Shell 更新 |
| Framework 内置服务与 Package 核心 | `one-person-lab/packages/{core,ledger,workspace,pack,runway,connect,daemon}/` 与 `contracts/opl-package.v2.schema.json` | Framework v2 公开 RPC/CLI 入口与 package descriptor；随 Framework runtime 更新 |
| 微信远程 | 新版位于 `opl-studio/plugins/channels/opl-channel-weixin/`，旧版采用 App 内同名 Package | 新版随 Studio profile 装载。尚未采用新版的 App 继续使用原有载体 |
| 独立软件 Package | 对应产品仓库的 `opl-package.json`（未迁 v2 的 `v1-final` 包暂保留 `plugins/<slug>/`） | 各 owner 的 manifest 与原生载体，官方条目由 `opl-catalog` 提供，Framework 聚合发现、状态和操作 |

App 的 [Shell contract](../../../contracts/app-shell-adapter.json) 把 Studio 定义为外部
仓库 checkout，默认位于 `shells/opl-studio`。开发机可有相邻的 `opl-studio` 工作目录，
那不是 App `packages/` 下缺失的插件，也不自动代表当前安装包使用的源码。

### 安装后放在哪里

| 安装层 | macOS 默认或典型物理位置 | 如何判断当前状态 |
| --- | --- | --- |
| App 内置 Host/客户端 | `/Applications/One Person Lab.app/Contents/Resources/app.asar` 内的 `node_modules/` 与 `dist/desktop/` | 读取具体安装包及其加载配置；源码存在不代表当前运行版本 |
| Framework runtime | 默认 `~/.opl/one-person-lab/`；自定义安装以实际 launcher 解析为准 | Framework 安装身份及公开 state/action readback |
| Codex carrier 的可安装插件 | 默认 `$CODEX_HOME/plugins/cache/<marketplace>/<plugin>/<version>/`，未覆盖时 `CODEX_HOME=~/.codex` | 原生 carrier 的有效安装记录及 Framework 投影；缓存中有目录不代表启用或可调用 |
| DSH profile | `$DSH_HOME/profiles/opl-studio/` | Studio Host 的 profile resolution；profile 配置不是插件源码总仓库 |

`app.asar`、`node_modules`、插件缓存和 Full 的离线种子都是交付或安装产物，不是开发
编辑位置；不手改这些副本来修复源码。账户、业务数据和插件代码也不能混为同一目录。

### DSH 插件统一规范

通用能力优先采用 DSH 官方实现。新增或修改自有插件、升级 DSH 时都要检查官方
对应能力；已经覆盖需求的，及时迁移调用者并删除被替代代码。存在 OPL 特有的
线程、权限或 Framework 边界时只保留必要适配，不把整个自研插件视为不可替换。
保留项写明具体能力差距与可替换条件；语义等价性由开发者结合源码和运行结果判断，
不按包名相似度自动替换，也不为通用能力再造并行实现。

OPL 自有 DSH Host/Client 插件源码按运行底座、效率扩展与连接通道归入 Studio 的 `plugins/{core,extensions,channels}/<plugin-id>/`，统一采用 DSH 原生
npm 包形态：`package.json` 声明名称、版本、描述、许可证、`engines.dsh` 和公开入口；
Host 入口导出 Cordis `apply`/服务依赖，客户端入口使用 `exports[./client]` 与
`dsh.client`。DSH profile 一律按包名加载，不再混用相对插件文件路径。

Host/Client 插件由 `build:plugins` 把实现及本地依赖打进各包生成的 `lib/`。安装产物与官方、社区 DSH 插件统一通过 `node_modules/<package-name>/` 解析。App、WebUI、Docker 使用同一组包和 profile。源码依赖方向和验收命令见 [插件组合与仓库边界](plugin-composition-map.md#源码所有权与依赖方向)。

官方/社区插件保留原始 npm 包与来源；需要适配的插件同样在 `plugins/` 建立标准
DSH 包。文档预览随固定 DSH cohort 携带官方源码和客户端载荷，当前文件面板只复用
`MarkdownText` primitive，其他已支持格式由 OPL workspace/thread 适配器呈现。接入官方
完整 runtime 后应删除被替代的呈现代码。普通 GUI 源码复用不冒充已装载的 DSH 插件。

内置微信通道由 Studio 的 DSH Host 插件持有连接、绑定与轮询生命周期，通过 `opl-codex-native` 回调驱动现有 Codex 线程。客户端复用远程连接页的 `settings.section` 与 `channel_access` 视图。采用前验证 Desktop、WebUI 和 Docker 上的设置挂载、状态回读、扫码、PIN、消息收发、服务重启与解绑，并验证已有线程绑定继续指向原线程、同一账号仅一个活动轮询实例。重启后按既有规则重新登录。采用后清退 App 旧微信 Package 和 Framework 旧路由。

微信绑定协议对齐腾讯 `@tencent-weixin/openclaw-weixin@3.0.0-beta-0`
（官方 `beta`，稳定版 `latest` 仍为 `2.4.10`）。设置的“资料与连接 → 远程访问与网页端”提供
本人和他人两种连接动作：本人直接扫码，他人先由操作者扫描实名授权二维码，再由
实际使用者扫描绑定二维码。服务端要求 PIN 时显示输入表单；输入错误后重新提示，
被限制后停止本次绑定并说明原因。实名二维码、绑定二维码、PIN 与凭证仅用于当前
绑定会话，不进入持久设置、日志或操作回执；取消、超时、重试和 Host 卸载清理旧挑战。
PIN 提交必须绑定当前挑战，旧页面不能把验证码提交到新登录。扫码跨地域重定向
仅接受微信官方 iLink 域名。此处是协议与界面合同；安装版本和真实微信收发另行验收。

新增 DSH 插件在对应分组创建标准包、声明依赖并加入 profile。通过 DSH 原生清单检查安装状态、生命周期与实际打包加载。独立软件 Package 由 Framework 投影管理。

## 1. 插件边界

OPL Studio 当前由 `cordis.yml` 与 Web 层 `web.patch.yml` 加载 DSH 服务和 OPL 插件：

| 类别 | 插件/服务 | 状态 | 责任 |
| --- | --- | --- | --- |
| DSH 基础 | `dsh-system-prompt`、`dsh-tools`、`dsh-host-webserver`、`dsh-host-plugin-inventory` | 启用 | 提供系统提示、原生工具注册、HTTP host 和插件目录。系统提示关闭 DSH identity/runtime context 注入。 |
| GUI | DSH Client Modules 与选定 UI 包 | 启用 | 提供 AppFrame、侧栏、会话、输入栏、SettingsRoot、文件树、模型/Agent preset 等界面原语。 |
| OPL Host | `opl-dsh-tool-mcp` | 启用 | 将 DSH `ctx.tools` 通过认证 loopback MCP 暴露给持久 Codex App Server。 |
| OPL Runtime | `opl-codex-native` | 启用 | 唯一持有持久 App Server、canonical threads/turns、审批和实时事件。 |
| OPL Framework | `opl-framework-bridge` | 启用 | 只消费 Framework 的 app state/action、认证和 channel callbacks。 |
| OPL Host | `opl-host-core`、`opl-web-routes` | 启用 | 共用 host core、HTTP/SSE 路由和载体适配。 |
| MCP App UI | `opl-mcp-apps` ＋官方 `@modelcontextprotocol/ext-apps` AppBridge | 启用 | 在 DSH 能力工作台内渲染标准 UI 资源，复用 Codex 的线程、连接、权限和审批；共享 OPL Apps 与领域独立 MCP App 使用同一宿主。 |
| OPL Client | `opl-studio-client`、slot/contribution adapters | 启用 | 将 App/Framework 投影渲染到 DSH slots；不建立第二份 registry 或状态库。 |

主 profile 不加载 `dsh-base`。普通对话仍归 Codex；按需启动的协作工作台完整加载官方 base/web 应用，复用官方会话内的 Team 开关、成员树、任务板及 Agent Preset/Creator 交互，由 OPL LLM adapter 复用同一个持久 Codex App Server。Superagent 独立 profile 加载官方 base/web bundle，复用 App 的 Codex 模型与登录，单独配置仓库账号、来源及授权策略；工作台由顶层页面完成官方认证。完整对象边界见 [Team、Bot 与 Superagent](team-bot-and-superagent.md)。

在「软件中心 → 其他来源 → DSH 插件」从上游 npm 安装、检查更新和卸载 Billion Context。
安装后默认关闭。在软件详情或「设置 → 模型与执行 → 高级模型选项」修改同一个 DSH
profile 的启用状态，重启 Studio Host 后生效。Studio 复用插件的 Codex 启动器，
由 Codex 继续持有会话和审批，由本机代理保存可恢复的压缩内容。代理启动失败时，
Studio 回到原生 Codex，并在设置中显示状态。 [Billion Context](https://github.com/ranxianglei/billion-context)

## 2. 官方插件：优先吸收，冲突才排除

下表区分当前源码/profile 的装载状态和后续复用目标；“已接入”不代表现有安装包已更新或完成运行验收。

| 官方能力 | OPL 状态 | 原因/替代 |
| --- | --- | --- |
| MCP Apps UI host | **已接入官方 MCP ext-apps SDK 与 OPL DSH 插件** | 当前 DSH master cohort 有 MCP client/tools/resources，尚无标准 MCP Apps UI 宿主；`opl-mcp-apps` 只增加临时 view binding 与 sandbox renderer。每次 DSH 升级重新核对，不另建 session/凭据 owner。 |
| DSH host plugin inventory | **Host inventory 已加载；官方 PluginManagerPage 源码已接入应用管理** | 原生 inventory 管理 DSH 宿主插件元数据，不授予其 OPL Package authority。页面布局、卡片、详情、状态表现和导航复用 DSH 官方组件；OPL adapter 读取 Framework Package projection 并转发其 owner actions。 |
| Session、Agent loop、LLM、Authorization/Credentials、Account | 按功能域装配 | 普通 Codex 对话保持现有 owner；Team 的逻辑 Session、成员、任务归官方 DSH，真实执行线程仍归 Codex；Superagent 独立配置与运行，保持原型 Source/Policy/Ticket/Assignment 语义。 |
| `dsh-schedule`、`ui-schedule` | **本次迁移官方 TaskManagerPage/TaskDetail 组件；官方 Schedule Host 未加载** | 任务页复用固定 cohort 的官方组件，以 OPL owner adapter 提供 Framework/Temporal catalog、确认动作与运行历史，并补入 Codex permissions、timeout 和 thread/turn 结果。DSH Host 的 durable Session 投递、store 和 Agent executor 不进入 OPL profile；官方 inbox delivery receipt 与 OPL turn 完成仍分开表达。 |
| DSH jobs | **官方能力存在，OPL 当前未装载** | 官方 jobs UI 观察 DSH Agent/Session 产生的后台 job；不能替代 OPL Temporal workflow 与 Codex turn history。可复用状态/列表交互，数据继续来自 Framework projection。 |
| Time context | **OPL 自有薄适配已接入；DSH 同名能力未装载** | OPL 在发起 Codex turn 时按产品偏好附加当前时间与时区，不读取日历；注入开关和实际作用范围归 App/Codex adapter。采用 DSH 的设置 primitive 和说明方式即可，不应启用竞争的 DSH Agent 后端。 |
| Auto Review | **OPL Codex 设置已接入；DSH experimental Auto Review 未装载** | OPL 把选择映射到 Codex App Server 的 `approvalsReviewer`，审批与 turn 结果仍归 Codex。官方对应物是 `dsh-experimental-auto-review`；`ui-settings-agent-loop` 只设置单步并行工具调用上限。DSH 实验插件在 DSH Agent 的工具调用前审查，不能替代 Codex reviewer；可继续复用设置控件和状态表达。 |
| Shortcuts | **OPL 自有 App-local 快捷键页已接入；官方 `ui-shortcuts` 未装载** | 当前页面用 DSH Button/Input/ShortcutKeys 等原语，但命令、按键绑定与存储仍由 OPL 持有。官方包提供更完整的目录、录制、冲突检查和本地偏好流程；在逐项映射 OPL 命令、平台行为、调用回调和偏好存储后，应改用官方包并删除重复设置组件。 |
| Plugin Manager / plugin settings | **官方 `PluginManagerPage` 与样式已复用；DSH pluginManager Host 未加载** | 应用管理保持 OPL 产品名称与四个产品分区；应用目录直接使用固定 DSH cohort 的页面、导航 store、状态点、卡片、详情和官方原生控件。Framework projection/action adapter 保留 Package 安装、启停、currentness、权限确认和 fresh readback。禁止加载官方 `apply()`/`PluginManagerController`、profile 或 pnpm lifecycle，也不把 DSH Agent/Session inventory 当成 OPL Package registry。源码接入不等于本机已安装，安装版窗口验收单独记录。 |
| Inspector | **OPL typed projection 详情面已接入；DSH experimental Inspector 未装载** | 继续复用 DSH sidebar tabs、折叠和状态原语；详情内容来自 OPL task/artifact owner。官方 Inspector 若仍绑定 DSH Agent/runtime 数据，只能复用其界面模式，不能用它建立第二份 thread/runtime store。 |
| Voice input / speech-to-text | **OPL 浏览器语音适配已接入；DSH experimental voice bundle 未装载** | OPL 当前调用浏览器 `SpeechRecognition` 并把转写写入当前线程草稿。DSH 可选 bundle 提供本地 SenseVoice provider、准备/缓存流程和麦克风 UI；不能把其本地 provider 当作 OPL carrier 已就绪。可复用官方入口与未就绪体验；只有 OPL capability/connection owner 能提供安装、权限、语言和 readiness readback 后，才切换真实调用者并删除浏览器适配。 |
| Web search/fetch、filesystem、sandbox | 只保留兼容边界 | DSH plugin 可注册 `ctx.tools` 时可被 MCP 暴露；权限、sandbox 和审批仍由 Codex/App Server owner。含 Session/Agent 依赖时按 Team 专域装配；含 provider/credential 依赖时进入独立 profile。 |
| UI theme、locale、model selection、workspace、files、attachments、subagent UI | 复用 UI 源码/原语 | UI 由 DSH 提供，状态与动作由 OPL App/Framework/Codex projection 提供。 |
| experimental browser/computer use、agent team | **按能力包逐项吸收** | 只要能绑定 OPL 权限、审批、任务和 readback，就进入动态能力目录；必须明确实验状态、所需权限和安装动作。 |

Cordis boot/profile、插件 metadata/inventory、Client Modules、SlotRegistry 与 Settings store/actions 已直接使用上游机制。Studio 的 OPL DSH 包继续承担 owner adapter、载体组合和产品投影。重复的呈现与交互由官方 UI/slot 和 owner adapter 完整接管后，验证各载体的实际调用再移除。

本 cohort 中官方包存在不表示 OPL profile 已加载。`@deepseek-ai/dsh-schedule` 仍仅用于开发/类型边界，官方 Host 未进入 OPL profile；`ui-schedule` 的 TaskManagerPage/TaskDetail 源码组件由 OPL 页面组合，并非启用完整官方 Schedule 插件。`ui-plugin-manager` 也只复用官方 renderer page 源码、CSS 与 UI primitives，没有注册官方 Client plugin 或加载 Plugin Manager Host；官方 `apply()`/Controller、profile/pnpm lifecycle 均不参与 OPL Package 管理。`ui-shortcuts`、Auto Review 和 voice bundle 仍未接入。官方 Web profile 会加载 `dsh-schedule` 与 `ui-schedule`，standard/ptc preset 会加载 `tool-schedule`；这些默认组合不能推导为 OPL 已启用。

## 3. OPL 自有插件和功能

下表中的 Studio 适配连接不同 owner，当前 DSH 官方包尚未覆盖这些职责，
不等于七份重复的业务实现。本次任务页迁移到官方 TaskManagerPage/TaskDetail 组件，
应用目录迁移到官方 PluginManagerPage；快捷键和文件预览中可由官方 renderer 完整承接的局部 view 继续作为删除候选。
服务适配只保留真实跨 owner 的部分。

| OPL 插件/适配 | 保留的 owner 边界 | 可复用/可迁移部分；删除条件 |
| --- | --- | --- |
| `opl-codex-native` | 唯一持有 Codex App Server transport、canonical threads/turns、审批和事件 | 复用 DSH conversation/composer/settings UI。只有同等官方 App Server adapter 能保持 Codex owner、并完成所有 thread/action/readback 切换后，才可删除适配；DSH Agent session 不是替代物。 |
| `opl-framework-bridge` | 消费 Framework app state/action/auth/channel callbacks，并将 Codex executor 注入 Framework Workbench services | 复用 DSH slots/settings/navigation。只有 Framework 与 DSH 有稳定的共享 Host ABI 且真实调用者迁走后，才可删除桥；Framework 状态和动作继续由原 owner 持有。 |
| `opl-dsh-tool-mcp` | 将 DSH `ctx.tools` 受控地暴露给 Codex，含认证、取消与工具目录变更 | 复用 DSH 原生工具注册。只有 DSH 提供 Codex App Server 可直接消费、具备同等 auth/cancel/list-changed 的官方 transport adapter 并切换 caller 后，才可删除。 |
| `opl-mcp-apps` | MCP Apps 的临时 view binding、MCP UI resource 读取和生命周期；连接、审批、线程仍由 Codex | 复用官方 `@modelcontextprotocol/ext-apps` SDK 与 DSH workbench slot。DSH 若提供兼容 MCP Apps host 且仍使用 Codex transport，可替换 renderer/bridge 并删除 OPL host。 |
| `opl-host-core` | Desktop/WebUI/Docker 共用的 OPL application host composition，组合 Codex、Framework 与 MCP Apps | 复用 Cordis、DSH webserver 与 AppFrame。只有三种载体都有同等官方 composition/lifecycle，且各自调用切换后，才可删除；普通 HTTP host 无法替代 OPL application services。 |
| `opl-web-routes` | OPL authenticated HTTP/SSE routes 和 renderer static delivery | 复用 DSH webserver 生命周期。只有标准 DSH route extension 能覆盖全部 OPL 认证、SSE、static asset 行为并完成 WebUI/Docker 回归后，才能删路由适配。 |
| `opl-studio-client` | OPL Client Plugin：产品导航与 typed projection 到 DSH slots 的适配 | 已通过 `dsh.client` 进入官方 Client Module graph；继续把 Framework/Codex 数据接入 OPL panels。只有 OPL 产品 surfaces 已迁到可保持 owner 的官方扩展点并移除真实 imports/callers 后，才可删除剩余适配。 |
| `opl-workbench-services`（Framework plugin） | Framework/Temporal 计划与运行历史、Memory 纠错建议、受控存储清理 | 任务页复用官方 TaskManagerPage/TaskDetail，OPL adapter 保留 Temporal task owner、Codex executor、确认与 readback。服务由同等 owner API 接管且 Memory/Storage 调用者迁走后，才可删除。 |
| DSH `ui-sidebar-documentpreview` 官方来源 | 官方载荷随 cohort 提供，但当前文件面板没有启用其 `apply()`；OPL 适配器处理 Markdown、图片、媒体、PDF 与文本 | 文件路径和字节读取继续由 canonical workspace bridge 校验。删除 OPL renderer 的条件是官方 Remote/Resource/Sidebar runtime 已通过同一 owner 读取授权文件，并在 App 面板完成格式与生命周期验收。 |
| `@objectivex666/dsh-settings-search` 1.14.0（GPL-3.0 社区包） | 当前 OPL 实际加载的全局设置搜索、结果定位与键盘交互 | Studio 直接依赖该社区实现，并把搜索结果映射为 App 设置 projection；authenticated log route 也调用该包。所审 DSH 官方 Settings cohort 未发现等价的全局设置搜索插件。删除条件：官方提供等价可组合的搜索 owner/slot，并能迁移结果定位、当前语言与日志读写的真实调用者。 |

计划任务由 Framework 的现有 Temporal Schedule 和 workflow history 持有，Studio 通过 `opl-workbench-services` 读取任务与历史、预览并确认管理操作，使用当前 canonical Codex App Server 执行。DSH `dsh-schedule` 是另一套 Host-wide durable schedule：它可投递到已有、新建一次或每次新建的 DSH Session，并保留 delivery history；其成功回执表示目标 Session 持久化收件箱已接收消息，不代表模型 turn 完成。官方 `schedule/resolve-agent` hook 返回 DSH Agent，并非通用 executor 注入点。OPL 页面保留只读/工作区权限、超时和 Codex thread/turn 结果。整体删除 `opl-workbench-services` 不成立，因为其还持有 Memory 纠错建议与受控存储清理。

本次任务页迁移复用官方 `TaskManagerPage`/`TaskDetail` 组件及其列表、筛选、编辑与详情结构；OPL owner adapter 负责 catalog 和操作的映射，并通过有界组件扩展补入权限、超时及 Temporal run history。官方 Schedule Host 不加载，DSH Session target 不成为执行 owner。显示 Temporal 执行历史时保留 Codex status 与结果入口，不把它改名为 DSH inbox delivery receipt。该适配与 React 19 兼容改动一并进入 source manifest 和升级 replay。

`/scheduled` 指向侧栏计划任务页；任务可设单次、每天、每周或固定间隔，写入明确时区、权限和用户指定的正整数分钟超时，不设固定两小时上限。修改单次任务的标题或提示词可以保留原执行时间，新建或改变执行时刻才要求未来时间。Temporal 持有补跑与重叠策略，已获准的持久运行不因等待 App worker 超过五分钟而再次跳过；App worker 运行时执行任务。源码实现与实际发布、安装验收分别记录，不以合同或源码状态替代安装后的服务回读。

## 用户功能与工程模块的边界

OPL App 是由 DSH 插件、Framework 服务和领域能力组合的完整产品。仓库、安装器、
Package 分类与插件拆分只决定开发和交付，不决定用户入口。软件中心统一管理安装、
更新、启停和卸载；持久配置按功能进入设置，服务与诊断进入运行维护，日常业务进入
同一个应用工作台，任务阶段、产物和证据进入带任务身份的工作台。

微信属于 App 标准功能，插件化服务开发和运维。功能设置入口保持稳定，提供者未就绪时
保留设置引导。可选能力通过当前安装与启用投影加载，复用 DSH slots、Settings 和标准
MCP Apps。设置贡献中的列表、时间线、审核、任务板及产物是业务视图；旧
`settings.section` 标记保留兼容含义，不再使这些视图自动进入设置。

新增能力先选择功能归属，再选择现有扩展点。App 设置、共享业务视图与专用 MiniApp
沿用各自统一宿主，不增加第二个模块视图导航、包注册表、凭据库或业务状态副本。

## 4. 设置整合规则

设置中心只有一个目录和一个状态/动作边界。每个设置项必须声明稳定 `id`、用户可理解的名称、所属页面和 anchor、truth owner、写入 action、持久化目标以及验证/readback 路径。

### 4.1 三种 owner

| owner | 适合放什么 | 例子 |
| --- | --- | --- |
| Framework | OPL runtime、Package、workspace、服务和更新 | 工作目录、Agent/能力包、服务状态、更新与修复、存储盘点 |
| App/Shell local | 当前 App 行为和展示偏好 | 语言、主题、字号、通知、确认策略、模型/推理偏好、窗口行为 |
| Credential/connection | 账户、Gateway、外部通道和权限 | Gateway 登录、API Key、微信/远程通道、设备权限 |

设置页只渲染 owner projection 并派发 owner action。状态卡、一次性动作和诊断信息不能伪装成配置项；历史 receipt 不能替代当前 readback；secret body 不进入 App state、合同或通用 action JSON。

### 4.2 与 DSH 原生 Settings 的关系

DSH `SettingsRoot`、theme、locale、model/Agent UI 和 slots 是渲染基础；可见层级由 App 的 `settings_navigation.settings_ia` 决定。新上游设置先进入 intake，分类为 `accepted`、`adapted`、`redirected` 或 `rejected`，之后才允许进入 registry/slot。隐藏入口不删除插件数据。

当前稳定的用户层级为：概览；账户与模型；资料与连接；工作区；能力与指令；运行与维护；偏好；底部关于。旧 carrier route 只作为兼容 transport，不反向决定用户看到的分类。

### 4.3 最低维护成本的新增设置流程

1. 先判断是否真的是持久配置；若是一次性动作或状态，只加入 owner action/status projection。
2. 找到唯一 owner；不能由 SettingsPanel 保存一份镜像值。
3. 在 Framework/App contract 的 catalog 增加一条声明，带稳定 id、页面、anchor、语义说明、action/readback 和 secret policy。
4. 复用 DSH Settings primitive/slot；只写薄适配器，不复制 DSH plugin 的 session、model、credential 或 registry。
5. 为搜索、deep link、权限/确认、错误状态和 readback 增加一条窄 contract test；设置写入只以 owner 回读成功为准。
6. 上游升级时只重新执行 intake 和薄适配器检查；不改用户层级、不复制上游设置清单。

这样用户能设置所有已被 OPL 承诺的能力，并能在每一项旁边看到“它影响什么、由谁保存、何时生效、失败后去哪里处理”。官方插件新增功能默认进入候选能力目录；完成 owner 和 action/readback 合同后进入可执行设置。尚未完成适配的能力仍显示来源、缺失条件和安装/配置下一步，避免“有功能但用户看不见”。后续新增插件配置必须优先遵循 [三级 UI 与设置接入规范](plugin-ui-and-settings-standard.md#2-插件-ui-与设置三级接入规范)，禁止继续在宿主设置页（如 `ModelsSettingsPage`）编写特定插件的硬编码分支。

## 5. 后续复用与迁移条件

| 当前状态 | 能力 | 需要补的 OPL 设置/适配 | 迁移或完成标志 |
| --- | --- | --- | --- |
| 已有 OPL owner | Auto Review、Time context | 审阅策略、时间上下文开关/间隔/作用域 | Codex owner 能返回启用状态、拒绝结果和当前策略；DSH Agent backend 不加载。 |
| 本次迁移官方页面 | Plugin Manager | Framework Package snapshot、权限动作与 fresh readback adapter | 官方页面提供卡片、导航、详情、状态和原生控件；保留“应用管理”产品名及 OPL 四分区，不加载 DSH Plugin Manager Host 或 profile/pnpm lifecycle。源码、候选渲染与安装版验收分别记录。 |
| 目标为 UI 迁移 | Shortcuts、Inspector | 快捷键、详情栏布局/标签 | 先映射 App action/readback，再换官方 UI；真实调用者切换后删除重复 view。 |
| 本次迁移官方组件 | Schedule | TaskManagerPage/TaskDetail 与 OPL catalog/action/history adapter | 官方组件承担任务页结构；权限、超时、确认和 Codex/Temporal 结果由 owner adapter 提供。官方 Schedule Host 未加载；构建/运行验收独立回读。 |
| 候选复用交互 | Jobs | 后台 job 的列表、状态与运行观察 | 仅复用交互，不把 DSH Session jobs 当作 Temporal execution history。 |
| 待 capability owner | Voice input | 语音入口、设备权限、provider/语言和失败引导 | capability package 提供安装/授权/readiness projection 后，切换真实 carrier 并删除浏览器适配。 |
| 候选能力 | Browser/computer use、Agent team | 能力启用、权限、审批和运行观察 | 每项都有独立 owner、取消路径和真实载体验收后再加载。 |

迁移沿同一条路径实现：DSH 官方 UI/协议 → OPL adapter → owner action → fresh state/readback → Settings 搜索和 deep link。这样吸收能力不会增加平行设置数据库，也不会把“插件已安装”误报成“功能已可运行”。

### MCP App 宿主与任务工作台

`opl-studio/plugins/opl-mcp-apps/` 是标准 DSH Host＋Client 插件：Host 注入
`oplCodexNative`，Client 提供通用 MCP App 组件，销毁时释放连接绑定。它随 App、
WebUI、Docker 一起交付。业务 UI 位于 Framework 的 `src/mcp-app/`，可同时被
Codex 和 OPL App 使用；MAS 等领域包仅提供合同声明的数据与动作。

运行总览保留简短阶段摘要，任务详情和科研地图进入共享 MCP 工作台。共享组件
按声明的视图类型呈现阶段、节点关系、证据与待决事项，不在 Studio 维护科研
renderer 或领域 schema 副本。执行状态和科研判断分别显示，缺失能力仅影响对应详情。
