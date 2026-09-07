# OPL App GUI 元素位置与漂移审计

Owner: `one-person-lab-app`
Purpose: `app_gui_stable_element_placement_and_drift_review`
State: `active_design_review`
Machine boundary: 本文是人读元素位置理由与漂移检查。机器可读 GUI truth、当前
carrier 状态和 release evidence 仍归 contracts、source/tests、validators 与 artifacts。

设计体系入口见 [`README.md`](README.md)。

## 审计目标

本审计不记录某一轮“缺口清单”。它固定每类元素为什么放在当前位置，以及 shell、
响应式或产品迭代时要检查哪些漂移。功能归
[`feature-inventory.md`](feature-inventory.md)，交互归
[`ideal-interaction-spec.md`](ideal-interaction-spec.md)，视觉归
[`visual-system.md`](visual-system.md)，实现差距归
[`shell-conformance-matrix.md`](shell-conformance-matrix.md)。

## 稳定位置表

| 元素 | 稳定位置 | 位置理由 | 漂移信号 |
| --- | --- | --- | --- |
| Product identity | 普通导航 chrome 使用 text-only `One Person Lab`；完整 App identity 保留在 window metadata、About 与 release assets | 用户必须知道正在使用 One Person Lab，同时避免 logo 在深浅主题间产生不协调。 | 普通导航 chrome 出现 App logo、`App` 后缀或 carrier identity。 |
| Current context | Recorded workspace 在 rail，live branch/locality 在 Environment，active capability/attachment 在 composer 附近 | 当前执行环境必须可理解，但目录不拥有 context；runtime `pwd` 不反写 rail。 | 只在 Settings/raw path 中可见、无 workspace 时静默禁用，或 composer 重复 rail/Environment 全量状态。 |
| Directory/conversation rail | 宽桌面左侧 `280-340px` 可调；窄窗口 drawer | Navigation 是连续工作所需，不应占用 conversation 主区。 | 宽桌面缺失、被移到 Home grid，或关闭 drawer 后丢 selection。 |
| Rail global skeleton | 顶部固定 New task/Runtime/Scheduled tasks/Archived。主体按 canonical session 的 Project affinity 分组，底部 account/help/Settings | 稳定全局入口与 session history 分层；能力选择与管理分别位于 Home/composer 和 Settings。 | 核心 Runtime 入口缺失、无真实能力的入口照搬、Capabilities 重回 rail，或 Settings 混入 conversation rows。 |
| Directory group semantics | Conversations rows、“使用此工作目录新建对话”与 projectless adoption target | 目录组只是单一 Project-affinity projection、新 session 快捷入口和 projectless session 的一次性归口目标；拖动必须有键盘等价动作。 | “添加上下文”、组级删除、级联删除 session、已绑定 session 任意换组、仅改 Shell 分组，或按标题/workspace/Git origin 去重。 |
| Session attachments | 当前 composer | 文件/目录只由用户为当前 session/send 显式加入。 | 从 workspace 预载、隐式注入，或附件只能从 Settings/rail 添加。 |
| Conversation management | Rail rows、search 与独立 Archived surface | Search/pin/rename/archive/reset 属于持续工作管理。 | Archive 无独立 surface，或 reset 与 delete 语义混淆。 |
| Conversation timeline | Main canvas | 用户需要按时间理解任务、输出和决策。 | 与 Runtime/Files 并列成多个主面，或被 dashboard 替代。 |
| Home question/starters | Main 空 conversation；动态问题标题 + 全部用户可见 configured starters，紧凑固定宽度、稳定排序、按实际数量居中并响应式换行 | 帮助开始任务，但不建立 landing/dashboard；用户显式启用的入口不能被静默截断，Home root、composer shell 与 footer account/Settings entry 各只有一个实例。 | 静态营销 hero、固定四/五列的 dashboard card grid、隐藏用户已启用入口、无序重排或 resize 后重复画面。 |
| Composer | Main canvas bottom，浮动或保留安全距；Home 桌面使用 `736px` 最大宽度、`98px` 最小高度和 `22px` 圆角，目录/模式/branch 控件在同一 composer 内部透明排列 | 输入是普通路径主动作，应始终接近当前 conversation。 | 变成营销卡、单行或过矮 input、外置 context cap、settings bar、多层 card 或贴边遮挡。 |
| Preview inputs | 独立 Preview 或 conversation disclosure | 只打开当前 session 显式 attachment、可见 conversation result 或用户选择的合法绝对路径。 | Workspace-scoped project ref、hidden prompt injection、静默读取或复制 artifact body。 |
| Active capability | Home 使用 starter 的安静选中态；new-session `+` palette 可选择同一动态发现、已安装且用户可见的 Agent；conversation 可在 action row 邻近显示低权重 chip | 显示已选 OPL 能力；两条 new-session 入口同步同一 active capability，既有 conversation 不重绑 Agent；安装/显示/lifecycle 归 Settings。 | Home 重复“能力：”标签、App/Shell 固定 Agent 清单、常驻可变 purpose selector、既有会话 Agent 重绑、backend selector 或 agent dashboard。 |
| Package starter readiness | Home 只显示 installed + Home-visible starter；`ready/degraded` 可选择，`package_unavailable` 显示原因和恢复动作但不强制可选 | 用户先从真实可用组合选择工作目的；已卸载 Package 留在 Settings discovery/Restore。发送边界只检查 owner-projected identity presence/callability、入口、安全目标与权限。 | 已卸载入口继续强制占位、无限 loading、无原因阻断，或 presence/callability 明确失败后仍发送。 |
| Model/reasoning control | Composer 中的 App-owned model control | 用户可见但不应抢占输入；策略由 product profile 统一。 | Shell 复制 allowlist、Home/Conversation 不一致、provider 进入普通层。 |
| Permission/access mode | Home/conversation bottom action row | 用用户语言解释自动化与文件权限，保留安全透明度。 | 隐藏关键权限，或显示 provider/backend 术语。 |
| Attach controls | Composer action row | Attachment、paste/drop 与 `/open` 只影响当前发送。 | 藏在 Settings、被 workspace readiness 禁用，或 overlay 覆盖输入/不可点击。 |
| Send/stop | Composer 主动作 | 与当前 draft/running state 同一决策点。 | 位置随状态跳动、running 时无 stop、disabled 无原因。 |
| Pending/elapsed state | 当前 assistant turn 或 composer status | 用户需要持续知道请求仍在推进。 | 只在 console/raw event 中可见，或 tool event 后状态消失。 |
| Current-task summary bar | Timeline 顶部/当前 turn 邻近，可 pin | 长任务与 OPL projection 共用 status/elapsed/progress/next action/stop。 | 与 current turn 分叉成第二状态源，或缺 stop/next action。 |
| Tool/process/diff/file event | 对应 turn 内 compact disclosure | 事件属于当前 conversation，但细节不应压过正文。 | 全部 raw log 常驻，或移到独立主 dashboard 导致上下文断裂。 |
| Permission/user-input prompt | 当前 turn 的 AionUI ACP disclosure | 保留当前 conversation 与请求上下文；拒绝、取消和协议失败可见。 | 跳到不相关全局 modal、丢失当前 draft 或伪造成功。 |
| Turn receipt / result refs | Turn summary/details | 证明本轮发生了什么，同时保持 timeline 可读。 | Raw JSON 默认展开，或 receipt 被当成 domain/release verdict。 |
| Environment trigger | Conversation 右上次级 icon action | 当前环境随时可达，但不占普通路径主权重。 | Toggle active 但 surface hidden，或默认常驻打开。 |
| Environment floating details | 右上 anchored floating surface；窄屏 drawer | Recorded workspace/locality/branch/changes/subtasks/sources 是当前 task 的快速摘要。 | 变成默认全高第三列、完整 diagnostics 或跨项目 dashboard。 |
| OPL secondary refs | Environment 次级 section、preview 或 turn disclosure | Artifacts、Evidence、Runtime、Actions 是按需投影。 | 与环境摘要同权常驻，或取得 artifact/runtime authority。 |
| Advanced work surfaces | Bottom panel/file tree/Terminal/Browser | 保留高级工作能力，但默认关闭。 | App 启动即打开，遮挡 timeline/composer。 |
| Runtime overview | 一级“运行状态”入口打开独立 Runtime page | 动态 Agent task 与 typed view 的核心入口，按当前 App contract 验收。 | 仍用 optional 分类隐藏入口、把内容混成 Home dashboard/badge，或从 UI 推断 domain truth。 |
| Safe runtime action | Runtime/Settings 各自合同允许的 action area 与 confirmation surface | Action 需要状态、影响和 receipt context。 | Composer 直接执行隐藏 mutation，或绕过 dry-run/confirmation。 |
| Settings shell | Full-window return/search/grouped rows | 全局配置需要独立、可扫描 shell，同时保持 OPL IA。 | 塞进 side panel、upstream tabs 自动加入或每个功能新增一级 route。 |
| Raw diagnostics | Details disclosure / Advanced | 技术信息用于解释异常，不是 ordinary user task。 | Paths、ids、schema、JSON 成为首屏主文案。 |
| First-run blocker / next step | First-run 主区 | 新用户只需知道能否进入 App 和下一步。 | Full maintenance、domain status 或 terminal narrative 抢占 Core gate。 |

## 位置理由

### Home 与 Conversation

Home 的用户问题是“我现在要做什么”。因此主区只保留动态问题标题、全部用户可见且
稳定排序的轻量 starter、
conversation、composer、active capability、model/access 和 current-turn feedback。
普通本地对话和显式文件输入不依赖 workspace readiness；Workspace/managed target 只在
owner-projected action 的 `required_payload_fields` 明确要求时校验，单个 Package 故障只局部影响对应入口。
跨项目 Runtime 是独立的核心 Agent 工作状态页；continue-work 留在 conversation，artifact
provenance 留在 Inspector，package maintenance 和 raw diagnostics 留在对应 Settings，完整
evidence ledger 留在 release tooling。它们都不得挤入 Home 主区或相互混装。

### Rail

Rail 的用户问题是“我在哪个工作目录/对话，下一步切到哪里”。顶部/底部全局骨架与中段
session history 分层；宽桌面 persistent 可以减少恢复成本，窄窗口 drawer 化保护 main。
Rail 不应承担运行总览、provider 配置或无对应 OPL 能力的 Sites/Chat 入口。

### Environment 与 Advanced Surfaces

Environment floating details 回答“当前 task 在什么环境里工作”；artifact preview 和
advanced surfaces 回答“需要检查什么结果或工具”。它们默认关闭，按当前 conversation
渐进披露；OPL refs 进入次级 section、preview 或 turn disclosure，均不拥有
runtime/domain/artifact truth。

### Runtime 与 Settings

Runtime 回答“跨项目工作现在处于什么状态、下一步是谁”；Settings 回答“App 如何配置、维护
和个性化”。把 progress 放进 Settings 会混淆配置与工作，把 maintenance 放进 Runtime
会混淆任务与平台。两者可以互相 deep link，但不合并 authority 或首屏。

## 漂移检查

### 结构漂移

- 宽桌面是否仍有 persistent directory/conversation rail？
- Rail 是否保持 `280-340px`、全局骨架和独立 Archived surface？
- Rail 是否保持 New task/Runtime/Scheduled tasks/Archived，而没有恢复
  Capabilities、Team 或其它未采纳入口？
- Main 是否仍是一条 timeline，而不是 dashboard 或三列 workbench？
- Environment details 是否默认关闭、anchored，且打开/关闭不丢 draft、scroll、selection？
- OPL artifact/evidence 是否作为次级内容，而不是默认全高第三列？
- Advanced work surfaces 是否默认关闭？
- 窄窗口是否把 secondary context 变成可见 drawer，而不是 hidden DOM？
- Composer、toolbar、rail rows 和 icon controls 是否保持稳定尺寸？

### Authority 漂移

- Model/reasoning 是否只读 product profile，而非 shell-local list？
- State 是否来自 App state，mutation 是否来自 App action？
- Runtime/domain/artifact/memory/receipt/release truth 是否仍由原 owner 持有？
- Settings route/label/redirect 是否来自 Control Plane，而非 upstream discovery？
- UI 是否把 docs、cache、module dirt 或 active id 包装成 ready/running/current？
- App Server overview 可用时是否排除未返回的 stale Codex ACP cache rows，同时保留非 Codex local rows；
  overview unavailable 时才 fallback cache？

### 交互漂移

- 发送后是否持续有 pending/elapsed feedback？
- Current-task summary bar 是否可 pin，并包含 status/elapsed/progress/next action/stop？
- Error/disabled/blocked 是否说明原因和 next action？
- Permission、user-input 和 confirmation 是否保留触发上下文？
- Package starter 是否来自动态 installed + Home-visible directory，并在 launch 前检查 owner-projected
  identity presence/callability；失败时是否保留原因、允许动作和 draft？
- Permission/access mode 是否使用用户语言且不暴露 backend/provider？
- Popover/drawer 关闭后是否把焦点返回触发器？
- Rail、timeline、Environment/details 与 Settings 是否都可 keyboard-only 使用？

### 视觉与文案漂移

- 是否出现 card-in-card、双层 composer、随机 radius、重 shadow 或营销 hero？
- 中文/英文普通 chrome 是否同屏单一语言？
- Carrier、protocol、route id、command、receipt id 是否进入 ordinary first screen？
- 长中文/英文是否换行或扩容，而不是缩小字体、负字距或遮挡相邻控件？
- 状态是否同时使用文字/图标，不只靠颜色？

## 审计输出格式

实际审计应逐项给出：

| Field | 内容 |
| --- | --- |
| `element` | 被检查的稳定元素。 |
| `expected_location` | 本文定义的位置。 |
| `observed_surface` | Source、packaged App 或 WebUI 的实际位置。 |
| `status` | `aligned / drift / not_evidenced`。 |
| `source_ref` | Contract、source/test、route/viewport screenshot 或 package ref。 |
| `impact` | 对用户流程、authority、响应式或可访问性的影响。 |
| `owner_route` | 应修改 product contract、shell adapter、visual CSS、bridge、validator 或 evidence 的 owner。 |

Docs-only 检查不能把 `not_evidenced` 改写成 `aligned`。当前 carrier 的默认差异只在
[`shell-conformance-matrix.md`](shell-conformance-matrix.md) 记录，元素位置理由保持
shell-neutral。
