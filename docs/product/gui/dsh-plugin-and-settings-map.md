# DSH 插件与 OPL 设置归属

Owner: `one-person-lab-app`
State: `active`
Scope: DeepSeek Harness `dsh-v0.1.7-rc.2` (`477b4f420553e8a52c2fbccc464d7561b239c443`) 与 OPL Studio 适配。

这份文档只回答三个问题：DSH 官方插件在 OPL 中的状态、OPL 自有插件提供的能力，以及这些能力在设置中心的归属。默认策略是吸收 DSH 的有价值能力；已有 OPL owner 时复用 DSH 的 UI、协议和交互，再接入现有 owner。只有明确与 OPL 设计冲突、会制造第二份 authority 或无法满足安全/数据边界的部分才排除。

## 1. 插件边界

OPL Studio 当前只加载 `cordis.yml` 中声明的 DSH 服务和 OPL 插件：

| 类别 | 插件/服务 | 状态 | 责任 |
| --- | --- | --- | --- |
| DSH 基础 | `dsh-system-prompt`、`dsh-tools`、`dsh-host-webserver`、`dsh-host-plugin-inventory` | 启用 | 提供系统提示、原生工具注册、HTTP host 和插件目录。系统提示关闭 DSH identity/runtime context 注入。 |
| GUI | DSH Client Modules 与选定 UI 包 | 启用 | 提供 AppFrame、侧栏、会话、输入栏、SettingsRoot、文件树、模型/Agent preset 等界面原语。 |
| OPL Host | `opl-dsh-tool-mcp` | 启用 | 将 DSH `ctx.tools` 通过认证 loopback MCP 暴露给持久 Codex App Server。 |
| OPL Runtime | `opl-codex-native` | 启用 | 唯一持有持久 App Server、canonical threads/turns、审批和实时事件。 |
| OPL Framework | `opl-framework-bridge` | 启用 | 只消费 Framework 的 app state/action、认证和 channel callbacks。 |
| OPL Host | `opl-host-core`、`opl-web-routes` | 启用 | 共用 host core、HTTP/SSE 路由和载体适配。 |
| OPL Client | `opl-studio-client`、slot/contribution adapters | 启用 | 将 App/Framework 投影渲染到 DSH slots；不建立第二份 registry 或状态库。 |

`dsh-base` 没有加载。因而 DSH 的 `dsh-session`、LLM provider routing、`dsh-agent-loop` 和 credentials 不参与 OPL authority；同名 npm 包作为类型或 GUI cohort 依赖存在时，也不能据此推断它们已取得运行时所有权。

## 2. 官方插件：优先吸收，冲突才排除

RC2 官方包目录中与 OPL 产品最相关的插件分为四类：

| 官方能力 | OPL 状态 | 原因/替代 |
| --- | --- | --- |
| Plugin Manager / plugin settings | **吸收 UI 与设置流程，适配 owner action** | 安装、启用、版本、currentness 和 release 仍由 Framework/App Package owner 管理；DSH 管理页作为能力包管理界面，Settings > 智能体与能力显示动态 projection，动作走 App action。 |
| Session、Agent loop、LLM、Authorization/Credentials、Account | 屏蔽 | 持久会话和凭据分别归 `opl-codex-native`、Codex App Server 与 Gateway/Framework。不能把 DSH Settings 当第二套账户或 session store。 |
| `dsh-schedule`、`ui-schedule`、jobs | **吸收 UI、重复规则和运行历史交互** | 官方执行端依赖 DSH root Agent/session 的部分由 OPL Framework/Temporal adapter 承接；入口仍归 Settings > 运行与维护 > 服务状态，用户获得完整的创建、编辑、暂停、恢复、历史和立即运行能力。 |
| Time context | **吸收为可选设置** | 默认关闭；间隔、作用域和隐私说明进入 Settings > 智能体与能力 > 指令与上下文，实际注入接到 Codex/Framework owner，并提供 readback。 |
| Auto Review | **吸收交互和状态模型** | 设置、启用/停用、拒绝后的“继续/停止”交互进入 Settings > 智能体与能力 > 能力；审批事实和执行结果仍由 Codex/App Server owner 回读。 |
| Shortcuts | **吸收完整快捷键设置** | 采用 DSH 的搜索、当前绑定、编辑、恢复默认和冲突提示；持久化归 App/Shell local，页面归 Settings > 偏好。 |
| Inspector | **吸收为 OPL 详情栏能力** | 复用官方 Inspector 的 tabs、折叠和后台任务观察模式，内容接 OPL typed projection；不另建第二个 thread/runtime store。 |
| Voice input / speech-to-text | **优先吸收为 capability package** | 复用官方入口、未就绪引导和权限状态；provider、设备权限和数据处理经 App action/connection owner 投影，缺少 carrier 时明确显示“可安装/需授权”。 |
| Web search/fetch、filesystem、sandbox | 只保留兼容边界 | DSH plugin 可注册 `ctx.tools` 时可被 MCP 暴露；权限、sandbox 和审批仍由 Codex/App Server owner。含 DSH session/agent/credential 依赖的插件不能原样装载。 |
| UI theme、locale、model selection、workspace、files、attachments、subagent UI | 复用 UI 源码/原语 | UI 由 DSH 提供，状态与动作由 OPL App/Framework/Codex projection 提供。 |
| experimental browser/computer use、agent team | **按能力包逐项吸收** | 只要能绑定 OPL 权限、审批、任务和 readback，就进入动态能力目录；必须明确实验状态、所需权限和安装动作。 |

RC2 release notes 明确新增/调整了插件管理页 Auto Review、快捷键、时间上下文、计划任务、Inspector、语音引导和后台任务行为；这些都是“候选能力”，不是 OPL 已承诺的可用功能。

## 3. OPL 自有插件和功能

| OPL 插件/适配 | 提供功能 | 设置/入口 |
| --- | --- | --- |
| `opl-codex-native` | 持久 Codex App Server、线程/turn、审批、事件和 MCP tool consumer | 账户与访问、模型；权限选择在 composer/Agents & Capabilities，持久状态不复制到 DSH Settings。 |
| `opl-framework-bridge` | Framework state/action、Package/Agent projection、Gateway、资源通道、服务状态 | 所有 owner 设置页；具体动作统一 `opl app action execute`。 |
| `opl-dsh-tool-mcp` | DSH `ctx.tools` 到 Codex 的认证桥、取消和动态 `tools/list_changed` | 无用户设置；技术诊断只读显示。 |
| `opl-host-core` / `opl-web-routes` | Desktop、standalone WebUI、Docker 的共用 host 与路由 | 运行与维护；载体绑定属于部署/安装合同，不在普通 Settings 改写。 |
| `opl-studio-client` 与 contribution slots | 项目/任务进度、文件与结果、智能体与能力详情、Settings 投影 | 右侧 inspector 和 Settings > 智能体与能力/连接与部署。 |
| `opl-workbench-services`（Framework plugin） | 计划任务、执行历史、Memory 纠错建议、存储盘点与清理 | Settings > 运行与维护 > 服务状态；工作区 > 数据与存储；智能体与能力 > 指令与上下文。 |
| `dsh-file-viewer` 适配 | Markdown、CSV、图片、PDF 等浏览器预览 | 文件与结果；文件路径和字节读取继续由 canonical workspace bridge 校验。 |
| `dsh-settings-search` 1.2.0 | 本地设置搜索、结果定位、方向键/Enter/Escape 交互 | Settings 全局唯一搜索框；搜索不创建第二份设置模型。 |

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

当前稳定的用户层级为：概览；账户与模型；连接与部署；工作区；智能体与能力；运行与维护；偏好；底部关于。旧 carrier route 只作为兼容 transport，不反向决定用户看到的分类。

### 4.3 最低维护成本的新增设置流程

1. 先判断是否真的是持久配置；若是一次性动作或状态，只加入 owner action/status projection。
2. 找到唯一 owner；不能由 SettingsPanel 保存一份镜像值。
3. 在 Framework/App contract 的 catalog 增加一条声明，带稳定 id、页面、anchor、语义说明、action/readback 和 secret policy。
4. 复用 DSH Settings primitive/slot；只写薄适配器，不复制 DSH plugin 的 session、model、credential 或 registry。
5. 为搜索、deep link、权限/确认、错误状态和 readback 增加一条窄 contract test；设置写入只以 owner 回读成功为准。
6. 上游升级时只重新执行 intake 和薄适配器检查；不改用户层级、不复制上游设置清单。

这样用户能设置所有已被 OPL 承诺的能力，并能在每一项旁边看到“它影响什么、由谁保存、何时生效、失败后去哪里处理”。官方插件新增功能默认进入候选能力目录；完成 owner 和 action/readback 合同后进入可执行设置。尚未完成适配的能力仍显示来源、缺失条件和安装/配置下一步，避免“有功能但用户看不见”。

## 5. RC2 能力吸收优先级

| 批次 | 能力 | 需要补的 OPL 设置 | 完成标志 |
| --- | --- | --- | --- |
| A | Plugin Manager、Shortcuts、Inspector | 能力包管理、快捷键、详情栏布局/标签 | UI 复用 DSH；动作经过 App action；状态可回读。 |
| A | Auto Review、Time context | 审阅策略、时间上下文开关/间隔/作用域 | Codex owner 能返回启用状态、拒绝结果和当前策略。 |
| B | Schedule/Jobs | 任务表单、重复规则、运行历史、后台运行 | Framework/Temporal adapter 支持完整 CRUD、暂停/恢复和历史。 |
| B | Voice input | 语音入口、设备权限、provider/语言和失败引导 | capability package 提供安装/授权/readiness projection。 |
| C | Browser/computer use、Agent team | 能力启用、权限、审批和运行观察 | 每项都有独立 owner、取消路径和真实载体验收。 |

每个批次都沿同一条垂直路径实现：DSH 官方 UI/协议 → OPL adapter → owner action → fresh state/readback → Settings 搜索和 deep link。这样吸收能力不会增加平行设置数据库，也不会把“插件已安装”误报成“功能已可运行”。
