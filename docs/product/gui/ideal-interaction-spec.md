# OPL App 理想 GUI 交互细则

Owner: `one-person-lab-app`
Purpose: `app_ideal_gui_interaction_spec`
State: `active_design_target`
Machine boundary: 本文是 shell-neutral 的人读交互目标。机器可读产品要求和状态仍归
现有 GUI/profile/page-state/Settings/adapter/release contracts、source、tests 与 evidence。

设计体系入口见 [`README.md`](README.md)。

## 文档职责

本文回答“用户怎样在 OPL App 中完成工作”。功能目录见
[`feature-inventory.md`](feature-inventory.md)，视觉 token 与组件规则见
[`visual-system.md`](visual-system.md)，carrier 当前差距见
[`shell-conformance-matrix.md`](shell-conformance-matrix.md)。

本文不描述 AionUI 或 OPL Studio 的组件实现。任何 shell 都应
通过 App-owned profile、page-state、state/action bridge 和 Settings Control Plane
表达同一交互；实现现状不能反向定义理想目标。

## 产品原则

1. **Chat first。** 用户打开 App 后直接开始或继续 conversation，不先阅读 dashboard。
2. **Session first, context visible。** Canonical Codex thread 是 conversation 身份单位；当前
   project/local/branch 与 conversation context 始终可理解。Project affinity 为零或一，用于新任务初始 cwd、
   projectless 一次性 adoption、recorded rail 分组和提示，不拥有 session，也不是权限域；没有 workspace
   时仍允许显式选择任意本地文件/目录。
3. **One primary timeline。** 当前任务、assistant output 和 turn-local events 在同一
   conversation flow 中发生。
4. **Secondary context on demand。** Environment floating details、preview 和 advanced
   work surfaces 分层按需打开，不默认形成第三列，也不把九个工具做成同权 tabs。
5. **Purpose, not backend。** 用户选择科研、基金、演示、写书等工作目的，不管理
   executor/provider/backend orchestration。
6. **Summary first, evidence available。** 首先显示结论、下一步和影响；refs、receipts
   与 raw detail 可按需展开。
7. **Authority aware。** UI 展示 state/action/domain/release refs，但不推断或接管
   owner truth。
8. **Thread operations stay native and thin。** 用户通过现有 directory/actions 执行 thread
   list/read/start/resume/fork/archive；App Server 拥有 thread truth，Shell 只做一个薄 adapter。
9. **Executable carrier stays replaceable。** Shell 只通过 `OPL_CODEX_BIN` 获取 exact
   Codex executable 并启动 App Server。当前 AionUI 从 Shell-owned projection 解析该路径；
   projection 组合官方 AionCore Node-only export 与 Shell 独立选择的官方 Codex package。
   AionCore 不能进入 App/Framework 的 thread、product 或 Native
   adoption authority；替换 shell 只改变 executable source，不改变 `CODEX_HOME` 或 thread truth。

没有明确 OPL delta 的主流程采用 OPL contracts 对观察时最新可验证的官方 ChatGPT Codex
macOS 所做的 composition 翻译；精确版本由每次 observation receipt 记录。
[`codex-to-opl-app-delta.md`](codex-to-opl-app-delta.md) 中的 `26.707.41301`
只是一份历史 literal observation，不是持续的外部制品依赖。Shell 不能因为已有组件更方便，
就把模型移到 header、隐藏 project rail、默认打开 inspector，或用 Settings/card layout
重新定义 Home。

## 默认桌面状态

宽桌面首次进入 ordinary Home 或 conversation 时：

- 左侧目录/对话 rail 默认可见，展示由 App Server canonical overview 投影的 threads；
  project/workspace/directory 只用于新 session 初始 cwd、projectless session 一次性 adoption 和 Project-affinity 分组，
  不拥有 session、context 或 artifact。一个 session 的 Project affinity 最多一个。
  命令或 turn 的实际 `pwd` 可变化，但不反写 affinity 或分组。
- 主区域是一条 conversation timeline；空 conversation 仍使用同一工作画布。
- Composer 浮于主区底部并保留安全距，可直接输入多行任务。
- Working-directory grouping 位于 rail；Home/new-session composer 上方保留一个独立 context bar
  选择初始 cwd；locality/branch 位于 Environment。Composer 只保留 active capability、统一 `+`
  capability palette、当前已选的紧凑上下文 chip、模型/推理和
  permission/access mode；access mode 使用自动化与文件权限的用户语言。
- 右上 Environment details 默认关闭；bottom panel、file tree、Terminal、Browser 和
  独立 artifact preview 也默认关闭。
- 不显示解释性 landing、marketing hero、activity grid、continue-work dashboard、
  backend/provider selector 或 raw protocol monitor。

当窗口不足以同时保留 rail 和可读 main canvas 时，rail 转为用户可开关的 drawer；
这属于响应式变化，不改变宽桌面的 persistent target。Environment/details surfaces 在
所有 viewport 均由用户主动打开。

## 核心用户流程

1. **进入工作上下文。** App 按 canonical thread ID 恢复最近 App Server session；新任务通过
   composer 上方独立 context bar 选择初始 cwd，也可不选目录直接开始 projectless conversation。Projectless 表示没有
   用户选择的 Project affinity，不表示底层没有 runtime cwd。未选时不显示“不使用项目”占位行；用户可稍后
   把 projectless session 一次性归入一个目录组，保留同一 thread 和 history。命令或 turn 的实际 `pwd` 可按
   任务需要变化，但不会反写 Project affinity 或 rail 分组；已绑定 session 不提供 A→B 任意重分组。
2. **开始或继续对话。** 用户从 rail 新建、搜索、pin、rename、archive、reset 或切换
   conversation，并从独立 Archived surface 管理归档。
3. **选择工作目的。** 用户优先从 Home starter 选择科研、基金、演示、写书等能力，也可在首次发送前从
   `+` palette 选择同一动态发现、已安装且对当前 surface 可见的 Agent Package；两条入口写入同一个 active capability 与 route receipt，
   Home 由 starter 选中态表达当前能力，不在 composer 重复标签。Package 安装、Home 显示与 lifecycle 管理在
   Settings → Agents 完成 package lifecycle；Settings → Capabilities 完成 Skills/Plugins/Flow 管理。普通文本中的
   Agent 名称和普通文本 `@` 引用不改变 active capability；首次发送前，用户在明确的 `@` 选择器中选择 Agent
   可以设置该新会话的 active capability。同一 prompt 可引用多个 Agent，但新会话仍只有零或一个 active
   Agent Package。跨 Agent 准入由目标主 Skill 阅读完整请求做语义判断，不由关键词、文件扩展名或失败码决定。
4. **提交任务。** 用户输入说明、附加材料、确认模型/推理状态并发送。
5. **观察执行。** Timeline 显示 pending、elapsed time、assistant output、tool/process
   summary、permission/input prompt 和当前 turn result。
6. **查看上下文与结果。** 需要时打开 Environment floating details 查看 workspace、
   locality、branch、changes、subtasks 和 sources；artifact/evidence 使用次级 section、
   preview 或 conversation disclosure，Terminal/Browser/Files 从 Environment 或任务需要打开。
7. **继续或恢复。** Turn 完成后保留 compact receipt/next action；用户可继续提问、
   切换 conversation，或进入核心 Runtime 页面查看跨项目 Agent 工作。

## Project / Conversation Rail

Rail 负责 navigation，不承担 dashboard：

- Active AionUI 顶部固定 New task、运行状态、Scheduled tasks、Archived；Runtime 是核心
  Agent 工作入口。会话级 current-task context 独立成立，不依赖全局 Runtime。Package/capability
  选择由 Home starter 承接，package 管理由 Settings → Agents 承接，Skills/Plugins/Flow
  管理由 Settings → Capabilities 承接，不在 rail 重复。
  其它全局入口仅在 OPL 有真实对应能力时保留。
- 中段优先按显式 Project-affinity marker 分组 App Server threads，并以 canonical thread ID join。App Server overview
  可用时是 Codex session directory authority；carrier 只持有 affinity、draft、preference 和可重建 cache，不拥有 history。
  缺显式 UI affinity 时，普通 recorded cwd 可生成不写回 affinity 的只读目录组；`~/Documents/Codex/**` 与
  `~/.codex/worktrees/<id>/**` managed scratch 保持 projectless，不按叶目录生成同名 Project。Git origin URL 与
  turn/command runtime `pwd` 只进入 Environment，不作为 Project identity，也不参与分组。
  这类 Codex 对话行在标题右侧保留一个低权重分支图标，tooltip 和 accessible name 使用本地化“隔离工作树”；
  图标是只读运行环境提示，不改变 Project affinity、排序、拖放或生命周期。
  Canonical overview 未返回的 stale Codex ACP cache row 不进入 ordinary projection；仅 overview
  unavailable 时 fallback cache，非 Codex local row 保留。每个 canonical thread ID 最多一行，
  不按标题或 workspace 去重。
- Projectless conversation 继续可用，但不伪造 project/context 层级，也不禁用 attachment、
  任意本地 file/directory picker、paste/drop 或 `/open`。这些访问只服从 Codex
  permission/approval/sandbox。
- Session 输入只从当前 composer 通过 attachment、file/directory picker、paste/drop 或 `/open`
  显式加入，当前 send 消费后不持久化为 workspace defaults；禁止 rail “添加上下文”、workspace-keyed
  preload 和隐式 prompt injection。Workspace/managed-target readiness 不约束普通 Codex conversation
  或 send-scoped local file inputs；Codex/model prerequisites 不变。
- 所选项目目录只建立新 session 的初始 cwd 与未来 domain workspace identity，不是 package activation
  target。Settings、新对话和 ordinary composer send 都不得显示或执行 `agent_package_activate`，也不得
  用 session cwd 或全局 workspace root 构造 activation payload。真正的 scope activation 只由 Framework
  在真实 StageRun/StageAttempt 启动前按该 stage 的 `workspace_locator` 执行。
- 支持 search、pin、rename、archive、restore、delete、reset；rename/archive/restore/delete
  直接映射 `thread/name/set`、`thread/archive`、`thread/unarchive`、`thread/delete`。Pin 只是
  Shell UI metadata；AionUI local reset 保留既有会话语义，但不得冒充 App Server history reset。
- 底部固定 account、help、Settings。
- Home root、composer shell 与 footer account/Settings entry 在每个 viewport 各渲染一次。
- Active conversation、running/blocked/completed 等状态只用轻量标记，不改变 row 布局。
- 切换 conversation 保留各自 scroll、draft 和 refs context。
- New-session context bar 的工作目录动作明确说明只设置新 session 的初始工作目录；runtime `pwd` 不反写 App metadata。
- 目录组提供“使用此工作目录新建对话”和 projectless session adoption。Adoption 支持拖动及键盘可达的等价动作，
  仅版本化 UI metadata 尚未绑定 affinity 的 thread eligible。Destination 是用户选择的唯一
  Project directory，不要求覆盖 thread 曾引用的文件或目录；这些显式输入与 writable roots 仍是独立上下文/权限。
  Carrier 通过现有 App Server adapter 回读 exact canonical thread identity，再以该 ID 为键写入
  版本化 UI affinity；recorded cwd 保持不变。App Server 不提供 Project assignment authority，
  Shell DTO 的 project 字段不构成上游回读。任一步失败都保持 projectless、显示轻提示且不阻止对话。已有显式 affinity 的 session
  不执行 assignment。目录组无 owner 语义，不提供组级删除，也不得级联
  archive/delete/reset 其下 session。
- Home 的 New task 只通过 composer 上方独立 context bar 选择初始 cwd；Local/Worktree、starting branch
  仅在 active adapter 有真实 new-session action 时显示，不提供 managed Worktree create/reuse 的假入口。
- Conversation Environment 只读显示 recorded workspace 与 live Git context，不提供已绑定 session 的目录
  重绑、Local↔Worktree lifecycle、projection transaction 或任意 rail 重分组。Projectless adoption 只走上述
  单向、用户触发的 UI affinity 动作；不能从 thread/runtime cwd 是否存在推断 projectless。
- App 不保存 `opl_workspace_handoff.v1`，不发明私有 App Server adoption RPC，也不提供 managed Worktree、cleanup、
  snapshot receipt、restore 或 cross-host handoff 控制面。Projectless adoption 只在既有 adapter 内执行一次 typed
  canonical-thread readback 与版本化 UI metadata 写入，不创建第二套 thread client、adoption service、pending 状态机或 receipt，
  不修改 recorded cwd 或 sandbox writable roots，也不授权 `bound(A) -> bound(B)`。用户或执行器为某一 turn 覆盖 cwd、
  在 shell 中改变 `pwd`，均不反写 canonical recorded cwd 或 Project affinity。
- Backend、provider、permission、router 和 raw runtime state 不作为 rail 层级。
- 外部交互参考可以改变入口位置，但不得删除 OPL-owned capability；任何迁移必须在同一
  变更提供可见、键盘可达的替代入口，并同步更新 contract、source 和 navigation tests。

### 用户触发的线程操作

- 主界面不提供独立“线程协调”页面或 rail 区块。Project 下的 conversation rows 是 App
  Server thread 的可见入口，目录分组不改变身份或授权。
- 读取采用 metadata first；list/read/start/resume/fork/archive/restore 复用一个 App Server
  adapter并保持键盘可达。普通 conversation 发送继续走 AionUI 现有 ACP。
- Shell 不维护第二 JSON-RPC client、JSONL audit/idempotency ledger、write-set advisory、model
  delivery、dynamic thread tools、pending-request control plane 或 cross-host handoff。

宽桌面 rail persistent 且在 `280-340px` 内可调；窄窗口 drawer 化。关闭 drawer 不清除
selection 或当前草稿。Back/Forward、Previous/Next Task、New Window 是 desktop
affordance，通过 application menu 与现有 conversation header 提供，并保持键盘可达；
Previous/Next 只在当前可见 ordinary conversations 中移动，不扩张 WebUI 产品 IA。
Active AionUI 的一级导航固定按 New task、运行状态、Scheduled tasks、Archived 排列；
“运行状态”在展开栏、折叠栏和窄窗口 drawer 中都可见并可键盘访问，目标为 `/runtime`。
Runtime 的显示范围与采用要求由当前 App contract 决定，Home 保持对话工作区。

## Home / New Conversation

空 Home 不是 landing page，而是未开始的 conversation：

- 使用动态问题标题，保留 rail、context 和 composer。
- 展示 Framework 动态目录中所有已安装且由用户偏好标记为 Home 可见的轻量 OPL starter，按稳定配置顺序响应式换行，
  不静默截断，也不解释产品功能或堆叠大卡片。已卸载 Package 只在 Settings discovery/Restore 中出现，
  不保留强制 starter。
- 默认不激活任何专业智能体。历史保存的 preset 不得反向成为 Home 默认值；只有用户点击
  starter 或从明确 capability 路由进入时才设置 active capability。
- Starter click-to-start 只准备 route context 与 active capability，不自动执行隐藏 workflow。
- Starter 选中态保留现有 quiet fill 与 `aria-pressed`，不追加尾部圆圈对号或其它 selection glyph。
- `ready` 或 `degraded` 的 starter 可选择；已安装、Home 可见但 owner projection 报告
  `package_unavailable` 时保留紧凑状态、原因和安装/启用/修复动作，但不强制其可选。选择后状态若变化，
  发送边界只局部阻止所选 Agent，不用 spinner、空白或伪造成功掩盖问题。
- 点击 package starter 只设置 route context 与 active capability；普通 conversation create/send 不执行
  package activation。已安装且已暴露的 `verification_deferred` 或 `scope_materialization_missing` 不构成
  预配置门槛。真实 domain stage 的 activation 由 Framework 在 stage runtime 处理，失败只阻止对应 stage。
- 无 workspace 时仍可发送文字、attachment、任意本地 file/directory picker、paste/drop 与
  `/open`；只有 Codex permission/approval/sandbox 可以阻止真实访问。
- Home 不查询或渲染跨项目 activity、needs-attention、recent refs 或 per-assistant
  running badges。
- 当前 turn 尚未开始时，不伪造 runtime status、progress 或 receipt。

## Conversation Timeline

Timeline 按时间顺序组织用户可理解的工作事实：

- User instruction 与 assistant response 是主内容。
- Thinking/tool/process/file/diff/receipt 作为 compact event 或 disclosure 出现。
- 当前 turn 运行时显示 elapsed time、最近事件、stop 和必要 recovery action。
- 长任务和 OPL current-task projection 共用可 pin summary bar，固定包含 status、elapsed、
  progress、next action、stop。
- Permission、approval、user-input 与 MCP elicitation 留在相应 turn；后台 target 的请求可在
  selected thread detail 中按 thread/turn/item context 处理，不跳到无上下文的全局 control panel。
- Error 显示 direct reason、影响范围和 App-owned next action；raw stack/protocol 在 details。
- Turn 完成后保留 result summary、artifact/receipt refs 和继续工作入口。
- 跨项目 status、长 evidence list 和 full ledger 进入 Runtime/details，不挤占 timeline。

Streaming 期间用户始终知道 App 仍在工作。即使已有 tool event，也不能移除 pending
反馈或让 timeline 看起来停止响应。

## Composer

Composer 是普通路径唯一主 command surface：

- 文本输入默认可用，支持多行、paste、keyboard shortcuts 和 IME。
- 由当前 Codex reference 翻译出的 OPL-owned target 不在 composer 内常驻重复 project/local/branch：
  new-session 初始 cwd 由 composer 上方独立 context bar 表达，branch/locality 由 Environment 表达。
- `+` 始终先打开与 composer 外边缘对齐、可搜索、分组、viewport-bounded 且内部可滚动的 capability
  palette，不因 Skill/MCP 目录为空而直接打开文件 picker；它添加文件/文件夹，并按 Home/new-session 与
  existing conversation 分别呈现 active adapter 可执行、由 Framework/native platform 动态发现且对当前
  surface 可见的已安装 Agent Package、OPL capability、Skill 和真实连接，
  以及 adapter 明确报告且不与 permission/access 重复的 mode。Agent Package 不允许在既有会话重绑；
  Agent/OPL capability 在既有会话可为当前 turn 调用，不重绑 thread，也不触发 Package activation；
  Skill 只调用已发现且 callable 的条目，连接只显示已加载状态。
  Working directory 不进入 palette，已选 capability/input 只显示为紧凑 chip。
- Home starter 只是用户配置的快捷入口；`+` 中“专业智能体”组来自动态 installed Package directory
  与当前 surface 的用户可见偏好，不维护固定专业智能体清单。已卸载 Package 留在 Settings discovery，
  不因曾属于 Official Profile 而继续占用 launcher 入口。
- Agent Package 的 required/optional capability identities 来自 owner projection，并只检查 presence
  与 callability。已由 Agent 入口承接、且 owner 标记为内部实现的 capability 不再作为同层重复入口；
  App 不按 Package 名称或 Skill id 手写去重关系。
- 不存在 workspace/project context preload；attachment、paste/drop 与 `/open` 都是用户在当前 session
  显式加入的 send-scoped 输入，不允许 hidden prompt injection 或 workspace-keyed 持久化。
- 中层是 textarea；底层 action row 放统一 `+` 菜单、permission/access mode、
  单一紧凑 model/reasoning menu、可选 voice 和 send/stop。
- Home 与 ordinary conversation 使用同一 App-owned model control。
- 模型显示与 fallback 只读取 `contracts/app-product-profile.json`，已安装 Flow recommendation
  通过 Framework 投影进入同一优先级链；本文不复制 model/reasoning 值、allowlist 或退休列表。
- Executor 固定为 Codex CLI；backend/provider 不作为普通控件。Permission/access mode
  在 Home 与 conversation 可见，以自动化和文件权限表达并保留安全透明度。
- Attachments 在发送前可预览、移除并显示访问失败。
- Attachment、paste/drop 与 `/open` 不受 workspace membership 或 workspace readiness 限制，只服从
  Codex permission/approval/sandbox。
- Running 时 send 转为 stop 或明确 queue 行为；stopping、blocked、failed 有可理解状态。
- Model/reasoning 与 permission/access 不在 conversation header 或 Settings 快捷条中重复。
- Composer draft 不因打开 Environment/preview、切换 details、window resize 或临时 error
  丢失。

视觉尺寸、radius、control placement 与状态样式见
[`visual-system.md`](visual-system.md)。

## Purpose 与 Capability 交互

- 普通标签描述用户工作：科研、基金、演示、写书等。
- Purpose 从 Home starter、new-session `+` palette 或显式 `@` Agent selector 选择；三者在首次发送前
  共享同一 active capability。既有会话的 palette 调用只影响当前 turn，不重绑 Agent。
  Purpose 不作为 composer 的常驻可变 selector，也不在 rail 建立 Capabilities 主导航。
- `+` 中的组名使用本地化“专业智能体 / Professional agents”，不向普通用户显示“智能体包”。
- Composer 只以低权重显示 active capability；更换 capability 改变 route context
  与 assistant-scoped profile，不改变 executor。
- 未选 Agent 时显示 native platform/Package projection 中已安装、callable、对 ordinary surface 可见的
  capabilities；选中 Agent 后显示该 Package owner projection 的 required/optional capability identities，
  required 可见且 locked，optional 服从 owner exposure 与用户偏好。
- Package id、owner short name、route id 和 schema refs 进入 receipt/details。
- Package 是否显示由 Framework installed directory、owner exposure 与用户 hide/show 偏好共同决定；
  Shell discovery 不得自动创建 App-owned catalog，product profile 也不得枚举 Package identities。
- Ordinary capability selector 只呈现 owner/native projection 标记为 ordinary-visible 的 capability，
  不由 App 维护的第二套 Skill 名单筛选。所有已配置的用户/第三方 MCP 默认继承并保留，只排除命中明确
  Team/internal negative filter 的 server、tool 和 metadata；普通文案不暴露 raw MCP id。
- `+` palette 不伪造 Plugin、provider、backend、team、raw MCP 或 Codex reference 中但当前 adapter
  不支持的 Chrome/目标/计划动作；无真实可用项时显示明确空态或管理入口，不把管理入口伪装成直接选择。
- Settings → Agents 负责 package 安装、Home visibility 和 lifecycle；Settings → Capabilities
  负责 Skills/Plugins/Flow 与本机能力；历史
  `/capabilities` 只能作为 compatibility redirect，不能重新挂载第二套 capability directory。

## Environment Floating Details 与 Advanced Surfaces

Environment details 采用 Codex reference 的右上 anchored floating surface，默认关闭。首层只显示
当前 conversation 直接相关的 workspace、locality、branch、changes、subtasks 和 sources；
它不是常驻 inspector，也不承载完整 Runtime dashboard。

OPL 增量按以下顺序进入：

1. 与当前 task 直接相关的 artifact/evidence refs 进入 Environment 次级 section；
2. 需要阅读的 Markdown/PDF/code/result 在独立 preview 或 conversation disclosure 打开；Preview
   只接受当前 session 显式 attachment、可见 conversation result 或用户选择的合法绝对本地路径，
   绝对路径不要求属于 workspace；
3. Terminal、Browser、Files 等 advanced surfaces 只从 Environment 或任务需要打开；
4. Review 复用 Files/Changes diff surface；target 支持 uncommitted、base branch、commit、custom，
   交付支持 inline/detached，默认 Unstaged 并提供 Staged、Commit、Branch、Last turn。PR context
   依赖 `gh`，缺失时明确 unavailable；Last turn 只显示最近可见用户消息之后 completed edit
   tool calls 的 workspace 内相对路径，并提供无编辑空态。Custom instructions 只通过
   `review/start.target.custom` 发送；公开协议未提供非 custom Review Focus input，因此不展示该输入，
   也不得以 `turn/steer`、成功 audit 或其它副作用伪装投递。Stage、commit、push 使用既有 Git
   integration；line-level inline comments等待 typed Codex file/line comment protocol，不制作本地
   annotation store或假成功；不恢复独立 equal-weight Review tab，也不复制 Git store；
5. 跨项目 Runtime、Actions、Memory 管理保持独立 route，不并列成九个 tabs。

打开任何 details/preview surface 时：

- 保留 conversation、scroll、selection 和 composer draft；
- 默认展示 summary，不自动展开 raw refs；
- 只自动消费当前 workspace/conversation 的 refs；任意绝对本地路径必须由用户显式打开；
- 拒绝 parent traversal、非法 scheme 和自动静默读取；
- 不拥有 artifact body、memory body、runtime/domain truth 或 owner receipt；
- 空间不足时变为 overlay/drawer，并提供明确 close 和 keyboard focus boundary。

Bottom panel、file tree、Terminal、Browser 等 advanced work surfaces 保留，但默认关闭；
用户显式打开后必须真实可见、可调、可关闭，不以 hidden DOM 冒充功能。

## Runtime 交互

Runtime 是 `core_dynamic_agent_runtime`：跨 conversation/project 展示动态发现的 Agent tasks。
Agent/domain owner 提供业务状态，Temporal 提供执行状态，Framework 负责投影，App 负责显示。
当前任务和 Inspector 在 conversation 内仍独立可用：

- 普通读取和 refresh 使用 `opl app state --profile fast --json`。
- Full state/operator drilldown 只在 Maintenance diagnostics 或 release tooling 使用。
- 首屏先回答：哪些任务真实在跑、哪些项目仍在推进、哪些排队、哪些需要关注。
- User-facing primary state 与 automation/provider secondary state 分开展示。
- Running 只来自权威 projection 的显式运行状态；active id、module dirt 或 DOM 不构成
  liveness proof。
- 每个 item 显示 title、status、stage、progress、next step、owner 和 last update；
  evidence、resource 与 raw diagnostic refs 按需展开。
- Safe mutation 通过 App action route，先 preview/confirmation，再 execute/receipt。
- UI 不从 progress/readback 推断 domain-ready、artifact quality、production-ready 或
  release-ready。

Typed domain views 使用 `opl_app.typed_domain_views.v3`；未知 view 或缺少 provider 只局部降级，
不让 App 接管 domain schema。Runtime 的完整显示与动作边界见
[`runtime-overview-redesign.md`](runtime-overview-redesign.md)。

## Settings 交互

Settings 是 OPL Control Center，不是 upstream 配置列表：

- 使用独立 Settings route：明确 return、search 和 grouped rows；不把 Settings 塞进
  Environment/details。
- Ordinary navigation 按 App-owned Settings IA 组织七组：Overview；Account & Models；
  Connections & Deployment；Workspace；Agents & Capabilities；Runtime & Maintenance；
  Preferences。十个 carrier routes 作为二级 transport 保持稳定；About 是底部唯一辅助页；
  Advanced、Update、Theme、Local Services 和 Personalization 只作为 owner destination 的兼容重定向。
- 每页先回答用户问题，再给 recommended action；raw ids、paths、receipts 和 JSON
  默认折叠。
- Search 只帮助导航，不创建第二 status source。
- 二元值用 toggle/checkbox，模式用 segmented control，选项用 menu，数值用合适的
  input/stepper/slider。
- 状态改变或 destructive action 进入 confirmation surface，明确 will change、
  will not change、recovery/receipt 和 preview/proof。
- Legacy/upstream route 只 redirect 到最近 App-owned page。

详细信息架构见
[`settings-control-center.md`](settings-control-center.md)。

## First-run

First-run 的目标是让用户尽快进入可工作的 App：

- Core readiness 解释 workspace、Codex CLI 和模型访问的能力前置条件；ordinary launch 不等待它，
  用户可显式进入 Guid，只有依赖未就绪能力的操作局部受限。
- 当前 blocker 用用户语言解释，并只突出一个最重要 next action。
- Initialization 显示真实 phase、elapsed time、完成/失败和恢复路径。
- Full readiness、package reconcile、runtime provider 和 background maintenance 在进入
 主界面后继续，除非 App contract 明确为 blocker。
- 已有可用 access 时优先从解析后的本机 Codex `config.toml` 复用 selected provider，不重复要求
  API Key，也不重写 provider；技术命令只在 details 中显示。
- 显式 API Key 输入只用于新增或轮换 provider 凭据。provider 配置不得触发 Package/Skill/Plugin
  lifecycle mutation。
- Package lifecycle 不依赖 provider 或 API Key。Standard、Full 和所有 App carriers 在首次安装或
  用户显式 Restore 时只请求同一个 Official Profile；Full 只额外提供离线 seed。
- 首次安装完成后，每个已安装 Package 只通过其原生 carrier 独立维护。普通启动、后台更新和 App
  升级都不得重新应用 Official Profile，也不得静默重装用户主动移除的 root Package。

## Empty、Loading 与 Failure

- Empty state 说明为什么为空、用户可以做什么；不使用功能说明广告文案。
- Loading 优先显示已知 phase、elapsed time 或正在读取的对象，避免无限 spinner。
- Stale state 标明 last checked 和 refresh action，不伪装成 fresh。
- Disabled action 显示 disabled reason。
- Partial/unavailable state 保留可用功能，并说明缺失边界；不使用 silent fallback 假装
  完整。
- Package starter 的 unavailable/blocked 状态必须来自 App/Framework readback；blocked 时只保留
  status、doctor、repair 等 contract 允许动作。普通 send 不执行或绕过 activation，真实 stage activation
  失败只阻止对应 domain stage progression。
- Failure 保留 typed reason、receipt/ref 和可恢复入口；不能把所有错误压成“重试”。

## 响应式与 WebUI

- Desktop 与 WebUI 保持同一产品语义；transport 和 native affordance 可以不同。
- 宽桌面保留 persistent rail；窄窗口把 rail 与 Environment/details 变为 drawer/overlay。
- Main timeline 与 composer 始终优先获得可读宽度。
- Native file picker 在 WebUI 可映射为受控 path/volume action，但不得扩大文件权限。
- 用户打开 secondary context 后，panel 必须真实可见、可滚动、可关闭和 keyboard 可达。
- WebUI 不创建第二 product profile、runtime truth、provider policy 或 release channel。

## 双语与可访问性

- 普通 UI 支持简体中文和英文，同屏不随机混用语言。
- 用户未设置语言时，首帧渲染前按系统语言选择简体中文或英文；已有显式偏好跨启动保留，启动逻辑不得覆盖。
- 中文 labels 描述工作目的；technical name、命令和用户原文在 details 保留原样。
- Language switch 只改变 copy/formatting，不改变 workspace、thread、route 或 runtime state。
- 所有主流程可 keyboard-only 完成；focus order 与视觉顺序一致。
- 状态不只靠颜色；icon button 有 accessible name；dialog/drawer 管理焦点和 Escape。
- Streaming 与 live status 使用适当 announcement，避免逐 token 重复朗读。

## 验收

按本次改变的用户路径执行 focused behavior 与对应页面状态检查，覆盖成功、局部失败、
键盘、窄窗和 draft 保留。核心路径是新建/恢复 conversation、显式输入与能力选择、
发送/停止/审批、结果检查、Runtime 和 Settings 恢复入口。

产品分类与所需结果见 [功能目录](feature-inventory.md)，元素位置审查见
[元素审计](element-audit.md)，视觉比较见 [像素验收协议](codex-app-visual-parity.md)。
五轴证据与 carrier 验证入口见 [Shell conformance](shell-conformance-matrix.md)。
本文不追加逐轮测试结果、已完成事项或与上文重复的长检查清单。
