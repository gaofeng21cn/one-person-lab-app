# OPL App GUI 功能目录

Owner: `one-person-lab-app`
Purpose: `product_level_gui_feature_inventory`
State: `active`
Machine boundary: 本文是人读功能目录。机器可读 GUI truth 仍归
`contracts/app-gui-product-contract.json`、
`contracts/app-product-profile.json`、
`contracts/app-page-state-matrix.json`、Settings/adapter/release contracts、source、
tests 与 evidence。

设计体系入口见 [`README.md`](README.md)。

## 文档职责

本文只回答“OPL App GUI 必须提供哪些用户能力”，不定义视觉 token、不记录某个 shell
的实现历史，也不维护完成度。交互顺序见
[`ideal-interaction-spec.md`](ideal-interaction-spec.md)，视觉见
[`visual-system.md`](visual-system.md)，carrier 承接见
[`shell-conformance-matrix.md`](shell-conformance-matrix.md)。

功能项是产品目录，不是独立 machine schema。功能的字段、默认值、状态来源和验收条件
必须回到现有 contracts；本文不复制模型 allowlist、route registry 或 page-state 列表。

## 产品优先级

功能不能按页面数量平均分配设计和实现资源：

| Priority | Product layer | 包含 | 完成定义 |
| --- | --- | --- | --- |
| `P0 Codex Core` | 日常主工作流 | App frame、project/conversation rail、New task、conversation timeline、composer、streaming、history、model/reasoning、access/permission。 | 用户不离开 chat canvas 即可开始、继续和完成普通任务。 |
| `P1 OPL Professional` | OPL 专业增量 | Dynamic Package/capability selection、用户触发的线程操作、Agent task Runtime、Temporal execution、typed views、approval、evidence/artifact preview 与 safe action。 | 增量嵌入 P0 稳定位置；不引入第二套 Package manager、thread store、task truth 或领域 schema。 |
| `P2 Administration` | 配置和运维 | Settings、first-run、安装、独立静默更新、诊断。 | 可发现、可恢复，但不反向决定 P0/P1 的布局和视觉。 |

任何工作若只改善 `P2`，不能据此声称 GUI 主体验已对齐 Codex。设计评审和视觉证据
默认先覆盖 `P0`，再覆盖 `P1`，最后覆盖 `P2`。

## 功能来源分类

`B0 / R1 / U1 / X0` 回答“功能从哪里来、OPL 是否必须自维护”；`P0 / P1 / P2`
回答“先做什么”。两条轴不得互相替代。AionUI active 与 OPL Studio candidate 是同一
`B0 + R1 + U1` 产品定义的两种 carrier，不是两层产品：AionUI 能复用就复用并保持薄适配，
Native 将来需要独立实现同一用户结果。视觉 1:1 是独立的 pixel 目标，不改变功能来源分类。

### B0 Codex 必要 Baseline

| ID | 必要基线 | 为什么必要 | 当前产品边界 |
| --- | --- | --- | --- |
| `B0-01` | App shell、窗口、rail、响应式导航、键盘历史 | 没有稳定的桌面骨架就不是可持续使用的 Codex 工作台。 | AionUI 优先复用；Native 自行实现。视觉参考不复制 Codex 品牌或 authority。 |
| `B0-02` | Home/New task、session/thread 目录与历史管理 | 新建、恢复、搜索、pin、rename、archive/restore 是日常入口。 | Session 是身份单位；Project affinity 为零或一。新 session 可 projectless；未归口 session 可一次性进入一个目录组，已绑定 session 不任意换组。 |
| `B0-03` | Conversation timeline、streaming、stop/retry、tool/process 与错误 | 这是 AI 工作闭环，不应被 OPL 管理面取代。 | 复用 Codex/AionUI conversation adapter；conversation 创建、initial send 或会话内 send 失败时恢复 prompt 与附件，并与发送后新增输入合并而不覆盖。 |
| `B0-04` | Composer、文本、附件、paste/drop、显式 file/directory input | 用户必须能直接把本地上下文交给 Agent。 | 输入只进入当前 send，不做隐式 workspace preload。 |
| `B0-05` | Model/reasoning 与 Auto/fixed 偏好 | 用户需要在发送点控制质量、速度和成本。 | 交互属于 B0；模型 entitlement、余额和默认目录 owner 归 `R1-02`。 |
| `B0-06` | Access/permission、sandbox、approval、补充输入 | 本地 Agent 必须让权限与不可逆动作透明。 | 安全边界 fail closed；单个 OPL package 故障不得改变普通 Codex 权限流。 |
| `B0-07` | Files、Changes、artifact preview 与常用 renderer | 用户需要查看代码、文件和交付物，而不是只读聊天文本。 | Preview/renderer 属 B0；完整 OPL evidence 平台归 `X0-02`。 |
| `B0-08` | Git、branch、diff、review、commit/push、PR context | 编码任务需要可审查、可交付的版本控制闭环。 | 协议缺口显示 unavailable，不建立本地伪成功 store。 |
| `B0-09` | Terminal、Browser、Environment details | Agent 工作经常需要按需查看运行与环境。 | 作为次级工具按需打开，不做默认第三栏或 OPL dashboard。 |
| `B0-10` | Workspace 初始 cwd、Project adoption 与本地 Worktree 工作模式 | 本地任务需要明确主要目录、隔离目录和执行上下文。 | Composer 只设置新 session 初始 cwd；projectless session 允许一次性 adoption。已绑定 session 不任意重绑，当前 AionUI 不自造 managed handoff；Worktree 未来复用稳定 upstream 或由 Native 实现。 |
| `B0-11` | Codex Subagents / 并行子任务 | 复杂任务需要并行探索、验证与汇总。 | Portable core 是 read-only Active/Done lists、completed detail/result、open subagent thread，以及既有 App Server/ACP owner-supported controls。AionUI Team 继续关闭；不新增第二 App Server client、Team store、scheduler、执行 authority 或 bespoke direct-control buttons。 |
| `B0-12` | Scheduled tasks/Cron、后台继续与通知 | 长任务和周期任务需要离开前台后继续。 | 属 Codex 必要基线；carrier-neutral Contract 已对齐为单一 scheduler/store、ordinary discoverability、固定 Codex 与 legacy preservation。AionUI Source 仍需在现有 Cron engine 上挂载 Sider 并收敛 create/edit composition，不新建第二 scheduler。 |
| `B0-13` | Memory、personalization、instructions | 稳定偏好和项目指令决定长期易用性。 | 复用 owner-correct profile/refs，不新建独立 memory 平台。 |
| `B0-14` | 通用 Settings 容器、search/back/redirect、a11y、theme、i18n | 所有配置与长期使用能力需要一致容器。 | 容器行为属于 B0；OPL 栏目、owner route 与数据语义归 `R1-05`。 |

B0 保护的是 Codex 必要用户结果，不是把上游所有同名入口自动纳入 OPL。Skill/Tool/Plugin/MCP
的执行、权限与 elicitation 底座可复用 B0，但面向用户的管理 IA 归 `R1-04`。这些 capability
从已安装 Package/native platform 动态发现；App 不维护 allowlist。只允许显式 Team/internal
negative policy 和用户可见性偏好影响展示。Local Git、Terminal、Browser 与显式选择的
本地 checkout 属 B0；SSH/HPC 可作为 Resources refs 接入，但托管远程 Workspace、资源调度和
跨主机 handoff 仍归 `X0-04/X0-05`。`B0-10` 也不授权 Shell 自建 managed Worktree/Handoff。

B0 不进入 OPL 自维护的 R1/U1 12 项实现矩阵。AionUI 已有的基线不为追求理论完整度重写；Native
候选最终必须自行补齐。当前 carrier 实现程度见
[`shell-conformance-matrix.md`](shell-conformance-matrix.md)，未 fresh 核对的能力一律
`source_not_assessed`。

`B0-11` 必须与 AionUI Team 分轴读取：关闭 Team 只移除 upstream shell-local Team
产品面，不表示 Codex subagent 缺失。当前状态按 contract、Codex runtime/execution、App Server
adapter、ordinary activity UI、pixel、install 和 release 分账，见
[`shell-conformance-matrix.md#b0-11-codex-subagent-证据`](shell-conformance-matrix.md#b0-11-codex-subagent-证据)。
当前 AionUI source 已按真实 `codex-acp` delegated-turn metadata shape 补齐只读
Active/Done、详情/结果和 canonical task 打开；它复用现有 adapter，不建立新的执行或编排层。
Pixel、Install 和 Release 仍须在 exact source/package 上独立验证。

### List 1：等价功能替换类（R1）

| ID | 功能 | Codex 对应 | OPL 定义 | 为什么必要 | 优先级 | 最小验收边界 |
| --- | --- | --- | --- | --- | --- | --- |
| `R1-01` | Gateway 身份 | OpenAI/ChatGPT 身份登录。 | 以 OPL Gateway 身份替换产品账号入口，同时兼容既有 Codex/API Key。 | OPL 必须能管理自己的智能体账号，又不能破坏用户已有 Codex 路径。 | `P1` | 登录、刷新、退出、脱敏身份和 secret boundary 由 Gateway owner 提供；失败不清除可用的兼容凭据。 |
| `R1-02` | 模型 entitlement 与用量 | OpenAI 模型访问资格和账户用量。 | 由 Gateway 投影模型访问、余额、Token、成本、managed key 与 freshness。 | 账号管理若看不到可用模型和消耗，就无法做真实选择。 | `P1` | 访问来源、余额、今日/累计 Token、实际成本、managed key 与 freshness 有 owner projection；UI 不推算。 |
| `R1-03` | OPL 首启 | Codex 登录和首次项目初始化。 | 首屏可用 Codex 核心，同时从一个 Official Profile 自动安装必要 roots；Standard 在线、Full 用相同 Profile 的 offline seed。 | OPL 多了能力 Package，但首启不能成为长时间阻断页。 | `P2` | roots/required presence 自动完成且按 root 局部失败；用户卸载后不自动恢复；显式 Restore 可恢复。 |
| `R1-04` | Agents/Capabilities IA | Codex Plugins/Skills 管理入口。 | Agents 管 Package 安装单元；Capabilities 动态展示 Skill/Tool/Plugin/MCP/producer/view identity。 | 用户要按“智能体”和“能力”理解 OPL，而不是理解底层打包机制。 | `P1` | Native lifecycle + one generic projection；App 无 package/capability allowlist 或第二份 truth。 |
| `R1-05` | OPL Control Center | Codex Settings。 | 在同一 Settings 容器中按 App、Gateway、Framework、Packages 的唯一 owner routes 组织设置。 | 多个 authority 必须有统一可发现入口。 | `P2` | 每个设置项路由到唯一 owner state/action；Shell 不复制 runtime truth 或自造 mutation。 |
| `R1-06` | OPL 产品分发与支持 | Codex bundle、update、deep link、feedback/support。 | 使用 OPL bundle id、更新通道、`opl://`、反馈与 support 入口。 | 用户安装、唤起、更新和求助时必须看到同一个 OPL 产品身份。 | `P2` | 冷/热启动、更新、反馈/support 与 readback 闭环；源码、安装和 release 证据分开。 |

### List 2：OPL 独有功能类（U1）

| ID | 功能 | Codex 对应 | OPL 定义 | 为什么必要 | 优先级 | 最小验收边界 |
| --- | --- | --- | --- | --- | --- | --- |
| `U1-01` | Agent Package 目录与 lifecycle | 无直接对应；Codex 仅有通用 Plugins/Skills。 | 统一查看、安装、独立静默更新、启停、隐藏和卸载 OPL Agent Packages。 | OPL App 的核心定位是方便调用和管理自己的智能体账号/包。 | `P1` | 平台原生 manager拥有 bytes；Framework仅 discovery/presence/status/action adapter；App无 resolver/lock/payload/receipt state。 |
| `U1-02` | Purpose/Starter 与 active context | 无直接对应；最接近 Codex New task/prompt 入口。 | 从用户目标直接选择专业 Agent，并以低权重 active context 表达当前能力。 | 用户不应先配置技术组件才能调用专业 Agent。 | `P1` | Starter 可选择、active context 可见、管理入口可达，并绑定真实 package identity。 |
| `U1-03` | 弹性 Agent 对话与业务 runtime | 无直接对应。 | Agent Package拥有业务 task lifecycle；Temporal拥有 execution；普通对话和其他 Agent不被单包故障阻断。 | 既要显示真实推进，也不能把平台执行或 Package readiness冒充领域状态。 | `P1` | Agent/Temporal分别投影，Framework join unknown，Shell不推断；failure局部化。 |
| `U1-04` | App / OPL Base / Packages 三对象 lifecycle | 无直接对应；Codex 只有自身 App 更新。 | 三对象分别由 App carrier、Base route 和各 Package native platform维护，App统一呈现。 | 统一 UI 不能变成统一自研 updater。 | `P2` | 三对象均可见，各走 owner route；Package逐包更新和fresh readback，不强求共用 mutation API或rollback state。 |
| `U1-05` | Docker/WebUI 同产品语义 | 无直接对应。 | Desktop 与 Docker/WebUI 共享核心 route、状态、action、错误和 authority 语义。 | WebUI 是 OPL 的部署与远程使用入口，不能成为另一个产品。 | `P2` | 核心语义一致；transport 和 Desktop-only 安全能力可明确不同。 |
| `U1-06` | OPL 数据与安全清理 | 无直接对应。 | 对 Agent packages、runtime、本地缓存和 WebUI volume 提供 owner inventory 与受管清理。 | 长期使用会持续增长数据，普通用户需要可预览、可确认、可恢复的清理。 | `P2` | 独立 inventory、owner dry-run、managed path/hash guard、确认、receipt；不得泛化删除 workspace 或 domain artifact。 |
| `U1-07` | Dynamic Agent Runtime 与 typed views | 无直接对应。 | 动态显示所有 installed Agent task producers；通过 `view_kind` 展示 MAS 科研路线等 Agent-owned views。 | 标准 Agent 有共同状态体验，同时第三方 Agent 和领域扩展不应修改 App。 | `P1` | 新 Agent无 App source变更；MAS schema留在 MAS；unknown view局部降级；Runtime为目标 core。 |

R1 与 U1 的当前实现程度按 carrier 分开维护在
[`shell-conformance-matrix.md#r1--u1-必要功能实现矩阵`](shell-conformance-matrix.md#r1--u1-必要功能实现矩阵)。
`implemented / partial / missing` 只描述 source；pixel、install 和 release 是独立证据轴。

### X0 条件保留 / 当前非目标

| ID | 条件能力 | 当前处理 |
| --- | --- | --- |
| `X0-01` | 旧全局跨项目 Runtime cockpit 分类 | **Superseded target:** 当前 WorkItem route/validator 仅作迁移 compatibility；目标能力已进入 `U1-07`。新 Runtime未完成前不得删除旧 producer，完成后删除 optional gate和fixed Agent scope。 |
| `X0-02` | 完整 Evidence/Provenance/receipt/route-ref 平台 | 只保留 owner-required refs、confirmation 与 receipt；完整 cockpit 条件推进。 |
| `X0-03` | Hosted Workspace / cloud-continuous execution | `optional_owner_projected_resource_refs`：App contract 与 AionUI Resources & Connections 已实现 owner projection 条件启用、独立分组和空投影无占位；不再维护 hosted promise copy。 |
| `X0-04` | Fabric/HPC/远程资源控制面 | `optional_owner_projected_resource_refs`：真实 owner/backend projection 存在时才提供 refs/owner route；空投影不挂载 group/anchor。完整调度仍归 domain/runtime 产品。 |
| `X0-05` | 跨主机 handoff、carrier 自建 managed remote Worktree 或第二协调面 | 当前明确不自造；只有稳定 upstream 能力与真实需求同时成立才重评。 |
| `X0-06` | Raw runtime/operator diagnostics 与完整 repair cockpit | 仅留 Settings > Maintenance diagnostics 和 release tooling；Advanced 只重定向，ordinary UI 不展示 raw protocol。 |

本文的“现有功能不降级”只保护已经进入 OPL App contracts、ordinary routes 或正式用户路径的
能力，并以 AionUI/AionCore 官方基础能力默认继承为起点。Team 是明确 reject；fixed Codex
executor 可隐藏 provider/backend marketplace。Skill/Tool/Plugin/MCP 默认从 owner动态发现；
App 不以 allowlist 删除 capability，只应用窄 Team/internal negative policy。其它上游
能力若无 App contract 授权，不得仅因 OPL ordinary UI 未单列入口而被禁用。

## 产品框架

| 功能 | 用户结果 | Authority / machine owner |
| --- | --- | --- |
| Session-first workspace-aware App frame | Session/thread 是主单位；Project affinity 为 `unbound | bound` 且最多一个。project/workspace/directory 提供新 session 初始 cwd、projectless 一次性 adoption 和 affinity rail 分组，不拥有 session、context 或 artifact，也不构成授权域。命令或 turn 的实际 `pwd`、显式输入与 writable roots 不反写或扩展该 affinity；Git origin 不作为 Project identity。 | GUI contract、product profile、Codex permission/approval/sandbox。 |
| Directory/conversation navigation | 宽桌面 rail 默认展开，窄窗口变 drawer；App Server overview 可用时是 Codex session directory authority，未返回的 stale Codex ACP cache rows 不进入 ordinary rail，overview unavailable 才 fallback cache，非 Codex local rows 保留。每个 canonical thread ID 最多一行，不按标题/workspace 去重；目录组不提供组级删除或 session 级联删除。 | GUI contract、page-state matrix、runtime bridge。 |
| Chat-first main canvas | 打开 App 后可以直接开始或继续工作，不先经过 dashboard/landing；Home root、composer shell、footer account/Settings entry 各只有一个实例。 | GUI contract、page-state matrix。 |
| Ordinary startup | 认证后直接进入 `/guid`，Guid composer 不等待 fast App state 或可见 `StartupGate`；局部状态在后台刷新，失败不造成全局空白或 first-run 重定向。`<=1500 ms` 是 exact installed build 的 OS launch request 到 composer visible/enabled/focusable 目标，不是已测事实或 SLA。 | GUI contract、first-run matrix、installed launch evidence。 |
| Workspace-optional conversation | 不建立 workspace 也能使用 attachment、任意本地文件/目录选择、paste/drop 与 `/open`；workspace readiness 不 gate 这些输入，真实访问只受 Codex permission/approval/sandbox 约束。 | GUI contract、conversation state/bridge。 |
| Secondary context surfaces | 右上 Environment floating details 汇总当前 workspace/git/subagents/sources；artifact/evidence preview 与 advanced tools 按需展开。 | GUI contract、runtime bridge、domain/runtime refs。 |
| Product identity | 所有可见产品面使用 One Person Lab App 品牌，而不是 carrier/upstream 品牌。 | GUI contract、release assets、shell branding validation。 |
| Global issue feedback | 标题栏右侧可随时打开预填页面与版本信息的 OPL App GitHub Issue；用户在外部浏览器确认并提交。 | GUI contract、product profile、active shell adapter。 |
| Startup-failure issue feedback | 本机服务启动失败时，通过不依赖后端的 Electron 主进程通道打开预填版本、平台、架构和失败分类的 OPL App GitHub Issue；不自动提交，也不自动附加日志、路径、凭据或用户内容。 | GUI contract、product profile、active shell process/preload adapter。 |

## Home 与 Conversation

| 功能 | 用户结果 | Authority / machine owner |
| --- | --- | --- |
| New conversation | 在所选目录初始化 cwd，或不选 Project 直接开始 projectless Codex session；底层仍有 runtime cwd，projectless 仅表示无用户选择的 Project affinity。 | GUI contract、conversation page state、Codex bridge。 |
| Resume conversation | 按 canonical thread ID 找回 recent conversation，保留 transcript/turn history/title/task state、Project-affinity 分组和 recorded runtime cwd 展示。 | Conversation state/bridge；shell 只持有 affinity/UI metadata 与实现所需 session refs。 |
| Conversation management | Search、pin、rename、archive、reset conversation，并在独立 Archived surface 管理归档。 | GUI contract、conversation state/bridge。 |
| User-triggered thread operations | 从现有 conversation directory/actions 读取、创建、恢复、fork、归档或恢复归档线程；普通对话继续走 AionUI ACP，不增加独立 coordination 页面或模型工具。 | 一个 Codex App Server adapter；Shell 只持有 UI metadata 与可重建 cache。 |
| Session Project affinity / working directory | Home/new-session composer 上方独立 context bar 只设置新任务初始 cwd，working directory 不进入 `+` palette。projectless session 可由用户从 rail 一次性归入一个目录；归属以 exact canonical thread ID 为键写入版本化 Studio UI metadata，不伪造 App Server `projectId`，也不要求当前协议不存在的 `thread/read.projectId` 回读。失败保持 projectless 且对话可继续；已有显式 affinity 的 session 不提供 A→B 改绑、无真实 adapter 的 Local/Worktree 切换或 managed Worktree。Recorded cwd、turn cwd、shell `pwd`、显式文件/目录输入与 writable roots 均独立。 | Codex Core/App Server 持有 canonical thread ID 与 recorded cwd；Studio 持有可重建的版本化 affinity/UI metadata。Project 是单一目录 affinity、后续默认 cwd hint、展示与分组 metadata，不是 thread identity 或授权域。 |
| Text instruction | 向固定 Codex executor 发送多行任务说明。 | Product profile、ordinary conversation contract。 |
| Streaming assistant output | 持续看到 assistant response，不需要查看 raw protocol。 | Codex/App bridge 与 conversation page state。 |
| Pending/running feedback | 看到当前 turn 正在处理、elapsed time、stop 和失败状态。 | Page-state matrix、bridge events。 |
| Tool/process event summary | 在当前 turn 中理解 command、tool、diff、file、permission 和 receipt 发生了什么。 | Codex/App bridge；raw details 保持 diagnostics。 |
| File/folder attachment | 无论是否选择 project，发送前都可加入任意用户显式选择的本地文件/目录，并可预览或移除。 | File platform adapter 与 Codex permission/approval/sandbox。 |
| Explicit session inputs | 仅通过当前 composer 的 attachment、file/directory picker、paste/drop 或 `/open` 显式加入当前 send；不从 workspace 预载、不按目录持久化、不隐式注入。 | App GUI contract、Codex permission/approval/sandbox。 |
| Current execution context | Working directory 在 rail；新会话 cwd 从 composer 上方独立 context bar 选择，branch/locality 在 Environment。文件、文件夹、动态发现的 Agent Package/capability、adapter-reported nonduplicate mode 与真实可用连接从 composer `+` palette 选择并以紧凑 chip 展示。缺 workspace 或 workspace readiness 未完成都不禁用普通本地对话与显式文件输入。 | GUI contract、workspace/App state refs。 |
| Model/reasoning control | Home 与普通 conversation 共用一个紧凑 App-owned menu；用户选择优先，其后依次消费已安装 Flow recommendation、Codex live default 和 App fallback。 | `contracts/app-product-profile.json`；文档不复制 allowlist。 |
| Permission/access mode | 在 Home 与 conversation composer 以自动化和文件权限的用户语言显示，保留安全透明度但不暴露 provider/backend。 | GUI contract、workspace/access policy。 |
| Purpose selection | Home 优先显示用户启用的 Agent Package shortcuts；new-session `+` palette 在首次发送前提供完整 installed Agent 目录，不受 Home shortcut visibility/order 过滤。两者同步同一 active Package；Home 只是快捷方式。Official defaults 来自 Agent descriptors/Profile，不是 App fixed list。 | Dynamic Agent Package descriptors、user shortcut preference、GUI contract。 |
| Agent-scoped capabilities | 只显示当前 Package声明且实际 present/callable 的 required/optional capabilities。 | Package/native discovery；App无 packaged-skill profile或 allowlist。 |
| Package conversation availability | Installed/enabled/callable Agent 可选择；missing required identity 或 entrypoint 只局部阻止所选 Agent。Version、ABI、lock、payload、receipt、digest 不成为发送门。 | Framework minimum Package status projection。 |
| User-input and permission prompt | 当前 conversation 需要 command/file/permission approval、补充信息或 MCP elicitation 时，沿用 AionUI ACP 的现有可见流程；拒绝、取消或协议错误保持真实失败。 | AionUI ACP 与 Codex permission/request flow。 |
| Turn receipt | 用户可查看本轮 route、action、result 和恢复 refs，不默认暴露 raw JSON。 | App/domain/runtime receipt refs；GUI 不拥有 receipt authority。 |

## OPL Purpose 与 Agent Packages

| 功能 | 用户结果 | Authority / machine owner |
| --- | --- | --- |
| Official Agent shortcuts | 从普通入口开始科研、基金、演示/视觉、书稿或元智能体工作。 | Official Profile只选择初始 roots；每个 Agent Package owns shortcut descriptor 和 domain behavior。 |
| Additional Package shortcuts | 用户可按安装状态和个人选择显示任何 compliant `kind=agent` Package。 | Installed Agent descriptors + user preference。 |
| Package directory | 查看 discoverable/installed Package、enabled/callable/update/attention 和推荐动作。 | Native platform state + Framework generic aggregation。 |
| Package lifecycle actions | 安装、独立更新、启用/禁用、显示/隐藏或卸载，并 fresh readback。高级 repair/rollback打开 native owner。 | Native platform manager；Framework薄 action adapter；App/Shell只渲染。 |
| 弹性 Agent 对话与 runtime | Shell消费 minimum Package/task projection；missing capability只阻止对应 Agent。真实 task business lifecycle归 Agent，execution归Temporal。 | Agent + Temporal + Framework join；App不构造 activation/package payload。 |

Purpose shortcut 只改变 route context 和 capability selection，不定义 domain workflow、
artifact schema、quality verdict 或 readiness。普通用户标签描述工作目的；Package id 和
technical refs 只进入 Advanced detail。

## Current Compatibility: X0-01 Runtime 支撑面

以下表格只描述 AionUI 当前已保留 route 的 compatibility 行为。目标能力已进入 `U1-07`。
Framework producer 在迁移期继续受保护，完整旧 route 检查仍由
`npm run validate:runtime-route` 显式执行。Validator pass 不关闭 dynamic Agent Runtime 的
Contract/Source/Pixel/Install/Release。

| 功能 | 用户结果 | Authority / machine owner |
| --- | --- | --- |
| Runtime overview | 看到任务/项目主状态、阶段、进度、下一步和责任方。 | `opl app state --profile fast --json` 的 App projection。 |
| Scope switching | 在全局、workspace 或选中任务范围查看状态。 | App runtime view model。 |
| Active/queued/attention separation | 区分真实 running、仍在推进的 project line、排队和需要关注。 | Framework-owned projection；UI 保留原始 status。 |
| Pinnable current-task summary | 长任务与 OPL current-task projection 共用 status、elapsed、progress、next action、stop summary bar，并允许 pin。 | Current task slice / bridge refs。 |
| Current-turn run artifact | 在 conversation 内查看本轮最近事件和恢复动作。 | Current task slice / bridge refs。 |
| Task/project drilldown | 按需查看 evidence、blocker、owner、resource 和 next-action refs。 | Runtime bridge / domain-owned refs。 |
| Agent-owned typed view | Agent Package 可按 item 提供 typed view，例如 MAS 科研路线；App只按 `view_kind` 选通用 renderer。未知/invalid view 局部 unavailable，task list和其他 views保持可用。 | Agent owns schema/data；Framework validate/proxy；App owns generic renderer，不按 Agent id分支。 |
| Safe action | 对允许的运行或维护动作先 preview，再 confirm/execute。 | `opl app action execute ... --json`。 |
| Files and artifact refs | 从 conversation、Environment details 或 preview 打开输入、输出和交付引用。 | Workspace/domain artifact refs；App 不拥有 artifact body。 |
| Artifact preview adapter | 用户显式打开时，当前 session attachment、可见 conversation result 或合法任意绝对本地路径进入现有 Preview。Traversal、非法 scheme、隐式 workspace ref、自动静默读取及 unsafe/unsupported ref fail closed。 | App GUI contract定义 ref policy；外部 owner 继续拥有 artifact body。 |
| Review pane | 复用 Files/Changes diff surface；target 支持 uncommitted/base branch/commit/custom，交付支持 inline/detached，默认 Unstaged 并有 Staged/Commit/Branch/Last turn；Last turn 读取最近用户回合之后已完成的 workspace edits。Custom instructions 只通过 `review/start.target.custom` 发送；公开 App Server 尚无非 custom `Review Focus` input，因此该输入不展示并在调用边界返回 `protocol_unavailable`，不得回退到 `turn/steer`、创建 Review、写成功 audit 或产生其它副作用。PR context 依赖 `gh`，缺失时明确 unavailable。行级评论只有在 Codex App Server 提供 typed file/line request与失败语义后才可提交。 | 既有 message store、Codex `review/start` 与 Git integration；Shell 不复制 Git store，也不建立本地 annotation store。 |
| Provenance and receipts | 查看来源、owner handoff、action result 和 lineage refs。 | Domain/runtime/release owner refs。 |

Home 不承担跨项目 Runtime、continue-work、needs-attention、activity grid 或 evidence
dashboard。当前任务需要的状态进入 timeline 或按需 context surface；跨项目总览进入独立
核心 Runtime route。

## Settings / OPL Control Center

Settings 功能按用户问题组织，具体 ordinary/secondary route、label 和 registry 由
GUI contract 与 Settings Control Plane 拥有。

| 一级组 > 二级目的地 | 用户结果 | Authority / machine owner |
| --- | --- | --- |
| 概览 > 概览 | 判断 App 当前是否可用、后台任务是否正常，以及最重要的下一步。Temporal 明细不在这里展开。 | Settings Control Plane、fast App state。 |
| 账户与模型 > 账户与访问 | 登录 OPL Gateway 或配置手工 API Key；账户连接时查看脱敏身份、余额、Token/实际成本、专用 Key 状态和数据新鲜度。 | Framework Gateway account projection/secret bridge；密码不进入 App state 或 generic action。 |
| 账户与模型 > 模型 | 查看模型访问来源、默认模型、推理偏好与 Codex CLI 版本，不复制 Gateway 账户和凭据控制。 | Framework model access projection、App model/reasoning preference。 |
| 连接与部署 > 资源与连接 | 查看真实存在的本机访问、WebUI 和外部连接 refs；内置 OPL Gateway 不在这里重复。Hosted Workspace、Fabric/HPC、Console 仅在稳定 owner/backend 存在时出现。 | Framework/Connect refs；X0-03/X0-04 owner routes 条件启用，App 不拥有资源 truth。 |
| 工作区 > 工作目录 | Desktop 查看、切换、验证 Framework logical workspace root；standalone WebUI 只读显示实际 owner 投影；Docker WebUI 将只读 deployment root `/projects` 作为持久目录 catalog，并允许新 Conversation 创建或选择其下的顶层工作目录。任何 WebUI 都不执行 `workspace_root_set` 或修改宿主 bind；AionCore 继续拥有 Folder/Project 绑定。 | App Docker WebUI workspace contract、Framework workspace state/action、carrier policy。 |
| 工作区 > 数据与存储 | 查看空间、数据分类、preview、安全 cleanup，以及 Docker `/projects`、`/data` 与可选 `/recovery` 的只读部署位置。 | App-owned storage lifecycle、Framework/host projections。 |
| 智能体与能力 > 智能体 | 管理可运行 Agent Packages、presence依赖、独立静默更新、Home shortcuts 与 lifecycle。 | Native platform lifecycle + Framework discovery/status/action adapter；Official Profile只用于first install/restore。 |
| 智能体与能力 > 能力 | 动态查看 Package暴露的 Skill/Tool/Plugin/MCP/producer/view capability；不维护App allowlist。 | Package/native discovery + user presentation preference。 |
| 智能体与能力 > 指令与上下文 | 编辑用户 `AGENTS.md` 和新对话附加说明；复用 Workspace carrier，但不属于工作区导航。 | App personalization contract、typed host actions。 |
| 运行与维护 > 服务状态 | 查看 Codex、Temporal server/worker/scheduler 的可用性及对应检查、启动或重启动作。 | Runtime/provider state and action projection。 |
| 运行与维护 > 更新与修复 | 查看 Base/App currentness 和 Package聚合状态；Package具体动作链接到 Agents/native owner。 | App/Base updater + per-Package native status aggregation。 |
| 运行与维护 > 日志与诊断 | Desktop 打开或更改 App 日志目录；standalone WebUI 只读显示 systemInfo 日志投影，Docker WebUI 只读显示 `/data/logs`；raw paths、receipts 和诊断信息默认折叠。 | App typed log action、Maintenance diagnostic projection。 |
| 偏好 > 偏好 | 配置语言、主题、通知、启动、密度、字体和 motion。 | App settings/profile；不承载 runtime diagnostics。 |
| 关于（底部辅助入口） | 查看版本、channel、链接和共享 update summary。 | About secondary route、release/settings contracts。 |

Legacy/upstream routes 只作为 compatibility redirects，不构成功能目录中的新 ordinary
页面。Settings 详细设计见
[`settings-control-center.md`](settings-control-center.md)。

## First-run 与安装

| 功能 | 用户结果 | Authority / machine owner |
| --- | --- | --- |
| Ordinary launch | 认证后的普通路径立即进入可交互 Guid；readiness 与 managed-agent discovery 后台刷新，不以 `StartupGate` 阻塞首窗。 | Startup product contract、first-run matrix；installed evidence 单独证明 `<=1500 ms` 目标。 |
| Core readiness check | 知道 workspace、Codex CLI 和模型访问是否足以进入 App。 | First-run contracts/page-state。 |
| Guided blocker resolution | 看到当前 blocker、下一步和可执行配置/修复动作。 | App state/action；技术命令按需展开。 |
| Initialization progress | 看到阶段、elapsed time、完成/失败和恢复路径。 | OPL initialization event/readback。 |
| Official Profile install | Standard/Full自动安装同一组官方 roots并补齐required presence；单包失败局部化。 | App Official Profile + native platform actions + Framework fresh installed/callable readback。 |
| Background maintenance | 进入 App 后独立更新已安装 Packages；用户已卸载root不被重装。 | Native package owners + Framework aggregate。 |
| Release/update separation | 区分普通 updater、Full offline seed和Package native update。 | App release/install contracts；artifact exact bytes不成为composition gate。 |

## Delivery Surface

| 功能 | 用户结果 | Authority / machine owner |
| --- | --- | --- |
| macOS desktop | 使用 native window、directory picker、notifications 和 packaged App。 | Active/candidate adapter、release packaging。 |
| WebUI | 在受控 workspace/volume 中使用同一产品语义。 | App product profile、bridge contract、Web delivery adapter。 |
| Shared semantics | Desktop/WebUI 使用相同功能、状态、action 和 authority boundary。 | App contracts；transport 可以不同。 |
| Responsive context | 窄窗口仍能打开 rail drawer、Environment/details drawer 和 Settings navigation。 | Ideal interaction/visual system、shell visual evidence。 |
| Desktop affordances | Back/Forward、Previous/Next Task、New Window 在 desktop 可达，不改变 WebUI 产品语义。 | GUI contract、desktop shell adapter。 |
| Advanced work surfaces | Bottom panel、file tree、Terminal、Browser 保留给需要的工作流，但启动默认关闭。 | GUI contract、shell adapter/source evidence。 |

## 双语、可访问性与状态

- 普通 UI 支持简体中文和英文，同屏保持单一语言。
- 所有主要流程可 keyboard-only 完成，并提供 visible focus、accessible names、
  contrast 和 reduced-motion support。
- Interactive controls 定义 default、hover、focus、selected、disabled、loading、
  success、warning、error 和 empty/unavailable states。
- Disabled、failed、blocked 和 stale 必须给出可理解原因和下一步，不能只显示 raw id。
- Shell 可以使用不同组件库，但必须保持相同用户结果和 authority boundary。

## 功能层 Non-goals

- 不定义 AionUI 或 OPL Studio 的组件/目录结构。
- 不记录 candidate/release 完成度、截图 proof、commit 或 run id。
- 不复制模型 allowlist、Settings route registry、action catalog 或 page-state payload。
- 不把 runtime、domain、artifact、memory、owner receipt 或 release truth 移入 App GUI。
- 不把同一 agent tree 的 `spawn_agent/send_input/wait_agent` 扩展成跨顶层线程消息总线，也不在 Shell 建第二套 thread store、权限模型或 Codex JSONL parser。
- 不把普通 Home 变成 dashboard、multi-agent launcher、provider marketplace 或
  protocol monitor。
