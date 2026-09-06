# DSH 视觉来源、Codex 历史交互参考与像素验收规范

Owner: `one-person-lab-app`
Purpose: `codex_app_visual_parity_execution_and_acceptance`
State: `active_visual_target_and_acceptance_protocol`
Machine boundary: 本文是人读视觉目标与验收协议。机器真相归 App GUI contracts、
validators、Shell source/tests 与 exact-cohort pixel/install/release evidence；source 或候选
截图不能替代 installed pixels 或 release readback。
Visual source: `pinned DeepSeek Harness visual source cohort`
Historical interaction reference: `ChatGPT Codex macOS workflow and spatial observation only`
Pixel baseline: `opl-app-approved-visual-baseline-v1` (App-owned, approval pending)

## 结论

2026-09-06 的用户选择以统一、成熟的视觉体系为目标：AionUI 主线继续直接复用
固定 DSH cohort 的字体、图标和 Button/Menu 几何。Codex 保留工作流参考，不再
额外定义一套仿 Codex 的视觉数值。Arco 继续承担控件行为，迁移遗漏通过既有
OPL adapter 补齐；用户显式字体偏好继续生效。

OPL App 的普通图标、theme token 与 visual primitive geometry 以固定 DeepSeek Harness
visual cohort 为 active source。One Person Lab 品牌、OPL 原生 Agent Package/Settings 能力、
条件 X0-01 Runtime route 及其必要状态继续由 App 拥有；AionUI 不引入 DSH runtime 或完整 renderer。

这里的像素验收指同一机器、同一缩放、同一窗口尺寸和同一内容状态下，对 App-owned
16-scene baseline 的稳定 chrome 做可测量比较。它不授权复制 Codex 的品牌、专有实现、
云端能力或内部数据模型；Codex 只保留工作流、空间关系和交互位置的历史参考。

DSH source identity 只来自
[`contracts/app-gui-visual-source-cohort.json`](../../../contracts/app-gui-visual-source-cohort.json)
记录的 repository、exact commit、MIT license 和逐文件 manifest。ChatGPT App 安装包、ZIP、
DMG 或历史 build 不进入 OPL Pixel、Install、Release 或 Stable 依赖；历史观察只用于工作流
和空间关系判断。

本规范与 [`visual-system.md`](visual-system.md) 都是
`contracts/app-gui-product-contract.json#interaction_baseline.visual_target` 的人读投影；发生
数值冲突时只修正文档或 Shell，不建立第二套视觉 token authority。

## 当前落实状态

### Pinned DSH visual convergence cohort

本轮不再把视觉收敛理解为零散页面各自调 CSS。Fresh source audit 证明主要 gap
来自五类用户可见 primitive 没有共同实现边界：Home 与 Conversation composer 分叉，
rail row、icon action、menu 和 Settings row 又各自维护几何与状态样式。结果是单页截图可以
接近 reference，但跨 route、theme、locale 或窄窗后持续漂移。

机器合同现固定在
[`contracts/app-gui-visual-reference-cohort.json`](../../../contracts/app-gui-visual-reference-cohort.json)：

- `16` 个 exact scenes 覆盖 Home、Conversation、Rail、Settings；
- 固定 `1440x900` desktop 与 `400x800` narrow，以及 light/dark、zh-CN/en-US；
- 每个 scene 使用同名 reference/candidate PNG，尺寸不同、缺图、未声明动态区域均 fail；
- changed-pixel ratio 上限 `0.015`，mean absolute channel delta 上限 `1.5`，单通道
  changed-pixel threshold 为 `8`；
- mask 默认空，声明面积不得超过 scene 的 `8%`，只允许 caret、OS window chrome
  dynamic 与 live timestamp 三类原因；
- pixel threshold 通过仍不等于验收。只有 exact SHA-256 绑定的人工 `accepted` review
  同时存在，才能对该 scene 写 `scene_bound_visual_parity=true`。

Shell 只通过 `OplVisualProvider` / `OplIcon` 把 DSH cohort 映射到
`composer / rail_row / icon_button / menu / settings_row` 五个共享 primitive；现有 React、
Arco behavior、handlers 和 App state/action 保持不变，不创建第二组件框架或转移 App
authority。`019fa0ef-9514-7293-ba5b-15cb8a509522` 只负责最终 same-cohort installed
evidence，不拥有 App/Shell source。

当前合同状态仍是
`reference_assets_complete=false / candidate_assets_complete=false /
visual_parity_complete=false / installed_current=false / release_ready=false`。合同、validator、
source checkpoint 或 dev screenshot 都不能提前改变这些轴。

`2026-07-15` 的 clean Shell candidate 从 canonical base
`b6bba802b83dcb472e4de894aa5c0dd4bff1b871` 重建，并选择性重放本轮用户可见差异。当前
candidate identity 必须在验证时从 active Shell checkout 读取，不能把过渡 HEAD 固化在本
文档中：

- 对话搜索从独立一级 row 移至“对话历史”标题右侧，桌面与窄窗均为 `32x32px` icon action，
  保留 tooltip、accessible name 和原搜索交互；
- 对话历史空状态使用 DSH cohort 的单色 conversation glyph 与 `13/18` 次级文案，移除
  carrier 默认的大号抽屉插画和装饰性 empty-state frame；
- rail 使用最新 reference 的中性 light/dark surface；项目组直接显示 sessions，source 与 DOM
  均不存在 project-owned“上下文 / 添加上下文”层；Light/Dark rail 均绑定
  `var(--dsw-specific-sidebar-fill)`，Shell Layout 不得用背景 utility 绕过 `--opl-sidebar-bg`；
- Home 与 conversation composer 共用中性 border、resting/focus shadow 和 `14/20` textarea；
- Home 与 conversation composer 共用单一 Codex 会话配置菜单；第一层依次以“模型”和“推理强度”
  摘要行显示当前值并进入二级选择，分隔线后提供“重置为默认设置”。摘要行不使用前置图标，
  禁止把推理档位继续平铺在第一层；旧 speed/速度入口、文案和持久化路径全部删除，不保留兼容入口；
- Settings 导航图标改为中性色，content lane 收敛为 `760px`，彩色 section 边条和多余 card
  shadow 已移除；
- Account & Access 的 connected Gateway state 使用 unframed identity/metrics/action group；
  stale 文案内联呈现，账户、指标、footer 和操作不再由多层矩形边框包围；
- Home 的 prompt、content-sized agent shortcuts 与 composer 进入一个 bottom reading lane；入口无
  chevron；shortcuts 只来自动态 directory 中已安装且 Home 可见的 Agent Packages，已卸载项不占位；
  `ready`/`degraded` 可选择，`package_unavailable` 以紧凑 typed guidance 和恢复动作表达；
- Home/new-session composer 上方使用与输入 surface 相接的独立 context bar 选择初始 cwd；该入口
  不进入左下角 `+`，未选时也保持明确可操作；
- Composer leading `+` 始终先展开与 composer 等宽、可搜索、分组、可滚动的 capability palette，
  不因动态目录为空而直接调用文件 picker；文件/文件夹、动态发现且已安装、用户可见的 Agent Package
  与 capability、adapter 明确报告且不与 permission/access 重复的模式及真实连接按组显示名称和描述；
- Local/Worktree 与 branch 只在真实 adapter 支持且属于 new-session context 时进入同一 context bar；
  既有 conversation 不形成第二条持久项目或能力标签；
- Instructions & Context 复用 Workspace carrier 的 content-container 响应式单列，Codex instructions 与新对话附加说明保持 unframed；
- clean candidate 的 full Node `1584/1584`、full DOM `814 passed / 6 skipped`、focused Node
  `24/24`、focused DOM `55/55`、typecheck、format、i18n、lint `0 error` 与 diff-check 均通过。

历史视觉 lane `984995d5c9d2ef591007ec38206bb4d4517539b0`（parent
`af58910708af814147499d2b35d28269d1350390`）只作为逐文件视觉提取来源；它的祖先包含已撤销
能力，因此不得整体吸收，也不得作为最终 release cohort 或安装证据。

这些结果只证明本轮 candidate source 结构和自动化行为门，不证明 WebUI 或安装版 pixels，
也不等于完整 1:1 或 release-ready。普通
conversation 的真实多状态、zh-CN/en-US 全矩阵、同尺寸 reference/candidate mask diff、macOS
安装包、最终 Shell main 和安装后 readback 仍须在 release cohort 上重跑。状态标记为：

- `candidate_shell_commit_source=active_shell_checkout_git_head`
- `historical_visual_extraction_commit=984995d5c9d2ef591007ec38206bb4d4517539b0`
- `candidate_webui_pixels=pending_on_clean_release_cohort`
- `installed_pixel_acceptance=pending`
- `visual_parity_complete=false`

## 本轮细化合同

用户验收暴露的差异不归类为零散 CSS 问题，而是进入同一 DSH source + App pixel 合同：

- Home starter 使用 `13/18/500`，icon、label 与选中 check 共用同一垂直中心线；选中填充、
  focus outline 和未选中内容使用相同 line box 与 block inset，选中不能把文字推到边框顶部，
  也不能改变 row 几何；
- Home 与 conversation composer 均使用 `14/20/400` textarea、`12/18/400` 底部控件、16px
  图标、32px action height、1px hairline 与 22px radius。Model/reasoning、permission 和
  workspace chrome 不得另起更大字号；resting shadow 在 focus 时仍保留；
- New-session context bar 使用 `52px` 稳定高度、`12px` 水平内缩并与 composer 重叠 `13px`；
  `+` palette 桌面宽度与 `736px` composer 外边缘对齐，受 viewport 高度约束、内部滚动、显示
  group heading 及名称/说明行，并支持键盘搜索、Arrow/Home/End/Enter 选择和 Escape 回焦；空 catalog 不得
  退化为直接文件按钮，也不得伪造 Plugin、Chrome、目标或计划模式；
- Settings 普通 section 一律是 unframed heading + flat rows + section-scoped hairline。
  `能力 > 手工添加`、`资源与连接`、`维护` 是本轮强制逐项复核页；只有 repeated entity 和
  confirmation 可以使用一层 bounded group，禁止 ordinary configuration/status/action 的边框墙；
- `账户与访问` 的断开动作属于 account identity row，放在显示名、邮箱与连接状态的 trailing
  位置；禁止作为脱离对象的页脚或页面最右侧动作；
- `数据与存储` 及所有同类 icon + text action 复用 DSH Button 的 16px icon、16px 稳定 slot、4px gap、
  `currentColor` 和透明 icon background。按钮前景色同时控制图标与文字，不能让图标底色或
  独立 opacity 把图标遮没；
- Settings navigation 复用 DSH dense Menu 的 16px icon slot、8px gap、14/22 regular、
  34px 最小高度与 10px radius；不沿用另一套加粗文字和放大的图标容器；
- 全 Settings component audit 覆盖 light/dark、desktop/narrow，以及 default、hover、focus、
  disabled、loading、error。检查 nested borders、icon contrast、baseline、换行、横向溢出和
  交互时 geometry shift；单张截图或 source DOM 不能单独结案。

### Temporal 状态与维护

Temporal 是完整 OPL durable workflow 的单一外部运行依赖；用户界面将它呈现为“持久任务运行
（Temporal）”。其中“Temporal 基础服务”是依赖底座，“OPL 任务执行器”负责执行 workflow 与
activity，“周期计划”是 Temporal Schedule cadence，不是第二套 scheduler 服务。Plain Codex
chat 可以在这条链异常时继续可用，但这不把 Temporal 降级为 optional，也不能把问题藏成原始
`attention_needed`。Overview 只显示一次根因与影响，并路由到 `Maintenance > Services`。

Service Status 必须保持 service -> worker -> schedule 因果关系：上游未就绪时，下游显示“等待
Temporal 基础服务”或“等待 OPL 任务执行器”，而不是重复“需要处理”。页面只强调第一个可执行
根因的安全操作和一个重新检查操作；地址、namespace、task queue、supervisor、组件时间戳和
次级诊断操作折叠在技术详情中。`provider_scheduler_install` 的用户文案是“启用周期计划”，
`provider_scheduler_trigger` 的用户文案是“立即执行一次”。

Maintenance 消费真实 Framework action，不自行拼 CLI 或虚构 action id：

- 检测：`provider_service_status`、`provider_scheduler_status`、`provider_worker_status`；
- 安装/配置：消费 `temporal-runtime` dependency 投影的真实 `update_action`，再使用
  `provider_service_start`；provider ready 后才允许 `provider_scheduler_install`；
- 常驻自愈：`provider_service_start` 幂等安装或触发 Framework 托管的 Temporal server
  supervisor；该 supervisor 必须使用稳定可执行文件 realpath 或 packaged runtime 路径，设置
  `RunAtLoad`、`KeepAlive` 与有限节流，并在登录维护中先于 worker、scheduler 恢复。该要求只
  适用于 Desktop macOS 本地托管服务；WebUI/container、显式外部 Temporal 与非 macOS
  foreground service 显示为 supervisor 不适用，而不是错误地显示“未安装”；
- 持久化：Desktop macOS 本地托管 server 必须使用 OPL state root 下的
  `family-runtime/temporal-server/temporal.sqlite`，launcher 通过 `--db-filename` 绑定 exact
  absolute path，config、plist 与 fresh projection 三方不一致时显示配置漂移并提供修复；
- 启动：`provider_service_start` 后执行 `provider_worker_start`；
- 重启：`provider_service_restart` 执行受管 server 的真实有界重启，随后按需执行
  `provider_worker_restart`；
- 立即运行：`provider_scheduler_trigger`，完成后仍执行同一份 fresh 三组件 readback；
- readback：每次 mutation 后重新执行 service/worker status，并读取 fresh
  `opl app state --profile fast --json#app_state.provider.temporal`。只有 server reachable、要求
  supervisor 的平台上 supervisor ready、worker ready、scheduler ready、fresh 且无 error 才能
  显示完整 workflow 可用。

Server ready 与 worker blocked 必须分别显示。若 worker mutation guard 为
`blocked_developer_checkout_shared_state`，用户文案说明“当前 OPL CLI 指向开发源码，已阻止它
接管共享的托管 Worker”，下一步只允许“切回托管运行时”或“显式启用已授权开发维护”；不得
建议环境变量 bypass。Failed、stale、guidance-only 都不能显示 success，也不能错误路由到
`settings_sync_capabilities`。

## 产品模型

- `session/thread` 是唯一对话身份；Project affinity 为 `unbound | bound` 且最多一个。
  `project/workspace/directory` 只是新对话的初始 cwd、projectless 一次性 adoption、显式 affinity rail 分组和可见 metadata。
- `project_owns_session=false`。命令或 turn 的实际 `pwd` 可以变化，但不会重写 Project affinity、
  rail 分组、thread id、transcript、turn history、title 或 task state。
- 项目下直接显示 sessions。禁止显示“上下文 / 添加上下文”层级，禁止把目录描述成
  session、附件或 artifact 的 owner。
- 目录组提供“以此目录新建任务”的快捷动作，并允许无 canonical `projectId` 的 projectless session
  通过拖动或键盘等价动作一次性归入该组；实现必须在同一现有 adapter 内依次完成 typed affinity
  assignment、exact `thread/read.projectId` 与 recorded-cwd-unchanged readback、本地 projection commit。
  已有显式 affinity 不允许任意换组，也不提供 Local/Worktree launch mode 或 managed Worktree/Handoff。
  当前 AionUI 已实现该 Source；Pixel、Install 和 Release 证据仍独立未闭合。
- 当前 Agent Package 可通过 Codex-first carrier/executor 提供用户能力；OPL 额外呈现安装、更新、启停、
  可见性和运行状态，但不得把普通对话改成 agent dashboard，也不得把 Codex plugin id 当 Package identity。
- Agents 普通列表从 Framework 动态 installed directory 读取本地化角色名、owner kind/exposure 和用户排序；
  workflow 可按 owner kind 独立成组。required/optional dependency 只读取 owner-projected identities 并检查
  presence/callability，不硬编码 Package 关系、版本或重复行。

## 允许的视觉差异

只允许以下 OPL-owned delta：

1. App 名称、图标、About、release identity 和低频品牌强调使用 One Person Lab。
2. Home starter、Agent Package 状态、Runtime、Gateway 和 OPL Settings IA 使用 App
   contracts 定义的数据与文案。
3. Codex 没有的 blocker、repair、receipt 或运行状态可以增加紧凑 disclosure，但必须复用
   Codex 的排版、surface、图标和状态层级。
4. WebUI/mobile 因平台能力产生的响应式变化可以适配，但不能形成第二套视觉主题。

下列差异不被允许：AionUI 默认蓝紫色主题、彩色 Settings 图标墙、过重卡片、不同字号、
不同 icon stroke、无 resting shadow 的 composer、搜索作为完整一级导航行、项目“上下文”
层、常驻 provider/backend selector，以及用 OPL 品牌色覆盖中性主界面。

## Reference Cohort

每轮 parity 工作先记录以下不可变信息：

- Codex App `CFBundleShortVersionString`、`CFBundleVersion` 和采集日期；
- OPL Shell commit、package identity、主题、locale、系统缩放和字体设置；
- 窗口 CSS/physical 尺寸、DPR、route、fixture 和交互状态；
- reference 与 candidate 的原图路径和 SHA-256。

外部 observation 取观察时最新可验证的官方 ChatGPT Codex macOS，并记录精确来源、
版本/build 与日期。历史 `26.707.72221` / build `5307` 和 `26.707.41301` 只保留为
provenance。正式 reference PNG 必须来自 `opl-app-approved-visual-baseline-v1`，其
approval receipt、16 个 SHA-256 和人工 verdict 必须完整；无需下载或安装外部历史制品。
Baseline 从 `capture_and_human_approval_required` 晋升为 `approved` 时，App contract 与
cohort 必须同步更新，并绑定 reference 目录中的 `baseline-approval-receipt.json` 及其
SHA-256。Receipt 固定记录 schema、owner、baseline ID、reviewer、reviewed-at、
`human_visual_review` 方法、总 verdict，以及 16 个 scene 的 ID、PNG 文件名、SHA-256 和
逐场景 `accepted` verdict。Comparator 会验证 receipt bytes 与每张 reference PNG，但不会
自动生成或替代人工批准。

## 视觉 Token

### Typography

| Surface | Font | Size / line-height | Weight |
| --- | --- | --- | --- |
| App chrome | `-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, system fallback | `13/18` | `500` active, `400` secondary |
| Conversation body | 同上 | `15/22` | `400` |
| Composer textarea | 同上 | `14/20` | `400` |
| Page title | `SF Pro Display` first, same fallback | `20/28` | `600` |
| Metadata | `SF Pro Text` first | `12/18` | `400` |
| Code/path | `SF Mono`, `ui-monospace` | `12/18` | `400` |

禁止 viewport 字号缩放、负字距和组件私有 font stack。中英文使用同一字号层级，通过宽度
和换行适配。

### Light

| Token | Target |
| --- | --- |
| Canvas / active surface | `var(--dsw-alias-bg-base)` / `var(--dsw-alias-bg-layer-1)` |
| Rail | `var(--dsw-specific-sidebar-fill)` |
| Hover | `var(--dsw-alias-interactive-bg-hover)` |
| Selected row | `var(--dsw-specific-sidebar-nav-item-active)` |
| Primary text | `var(--dsw-alias-label-primary)` |
| Secondary text | `var(--dsw-alias-label-secondary)` |
| Muted text | `var(--dsw-alias-label-secondary)` |
| Hairline border | `var(--dsw-alias-border-l2)` |
| Focus ring | `var(--dsw-alias-state-business-primary)` |
| Composer shadow | `var(--dsw-shadow-lv2)` |

### Dark

| Token | Target |
| --- | --- |
| Canvas | `var(--dsw-alias-bg-base)` |
| Active surface | `var(--dsw-alias-bg-layer-1)` |
| Rail | `var(--dsw-specific-sidebar-fill)` |
| Hover | `var(--dsw-alias-interactive-bg-hover)` |
| Selected row | `var(--dsw-specific-sidebar-nav-item-active)` |
| Primary text | `var(--dsw-alias-label-primary)` |
| Secondary text | `var(--dsw-alias-label-secondary)` |
| Muted text | `var(--dsw-alias-label-secondary)` |
| Hairline border | `var(--dsw-alias-border-l2)` |
| Focus ring | `var(--dsw-alias-state-business-primary)` |
| Composer shadow | `var(--dsw-shadow-lv2)` |

OPL accent 只用于品牌动作和必要状态，不参与普通 rail、Settings 导航或 composer chrome。

## Surface Checklist

### Rail 与对话历史

- 桌面宽度 `280-340px` 可调；默认 row 高 `30-32px`，section label 高 `24px`。
- Active AionUI 顶部固定 New task、运行状态、Scheduled tasks、Archived；Runtime 的 Native/default-release gate 仍保持可选。账户、help、
  Settings 保留在底部。
- 对话搜索位于“对话历史”标题右侧，使用 `32x32px` icon button；展开/窄窗时均有
  tooltip、accessible name、focus-visible 和 `Cmd/Ctrl+Shift+F`。
- Search 不占用一整行，不与 Archived 或条件 Runtime 入口同级呈现。
- 项目行使用 16px folder icon 和 13px label；展开后直接显示 sessions。
- 不渲染“上下文 / 添加上下文”、project-owned attachment 或 project-level delete。
- Session row 保持稳定高度；hover actions 不挤压标题，selected state 不改变几何。

### Conversation 与 Composer

- Timeline 保持单列，assistant 正文 unframed；内容宽度、Markdown、代码块和 diff 与 Codex
  reference 对齐。
- 默认 assistant Markdown 使用 `15/22`、段落上下 `10px`、列表项上下 `2px`；行内代码使用
  `12/18` 中性浅灰胶囊。不得继续使用 AionUI 的 `16/28` 松散正文或按 viewport 缩小字号。
- Tool/process 过程使用本地化的低对比度 disclosure row；展开内容仍按行与 hairline 组织，
  不出现整块灰底卡片。复制/时间仅在 hover/focus 显示，不能为每条消息永久预留 `32px` 空行。
- 首批加载 skeleton 使用无框文本线，不画 bordered assistant/user bubble。
- Composer 单层 surface，桌面最大宽度 `736-800px`，圆角 `20-22px`，1px hairline。
- Resting shadow 必须存在：light 使用 `0 1px 2px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.05)`；
  dark 使用 `0 1px 2px rgba(0,0,0,.28), 0 4px 12px rgba(0,0,0,.18)`。
- Focus 只增强 border/ring，不删除 resting shadow，不改变尺寸。
- Textarea 使用 `14/20`、正常字重、无私有字距；placeholder 与正文基线必须一致。
- Model/reasoning 与 permission/access 底部控件使用 DSH `--dsw-font-xxs-*` token，不能另建字号。
- Attachment、permission、model/reasoning 和 voice 使用稳定 action row；send/stop 使用 `28px`
  可见圆、至少 `32px` 命中区与 `16px` 图标，outline stroke 与同层 composer 控件视觉重量一致。

### Settings

- Full-window、左 rail、单一顶部返回、search、右侧内容列与历史 Codex 空间关系保持一致，
  关系；OPL IA 和 route 不变。
- 导航图标统一中性色，不用不同品牌色区分类目；16px icon，13-14px label，34px row。
- 主内容优先 section heading + grouped rows + hairline divider。只有确有边界的重复实体或
  confirmation 才使用 card。
- Settings 的 OPL-owned 图标统一来自 `@icon-park/react`，使用 16px 单色 outline；不混用
  Font Awesome、彩色图标块、filled 插画式图标或字母头像。
- 移除彩色左边条、重灰背景、卡片套卡片和营销式说明块；状态色只用于状态本身。
- Toggle、segmented control、select、stepper 和 swatch 按控件语义使用，不用文本胶囊模拟。

### Menus、Popover、Modal

- Radius `8-12px`，1px border，轻 shadow；禁止 20px 以上装饰性大圆角。
- 打开、关闭、hover、pressed 为 `80-180ms`，只动画 opacity、color、shadow 和 transform。
- Escape、focus return、keyboard traversal、screen-reader name 必须完整。

## AionUI 改造边界

优先级从低维护到高维护：

1. 语义 token 和 OPL baseline CSS；不写 page-specific hex。
2. 现有组件 props/className/CSS module；不复制组件树。
3. OPL-owned 小 adapter，例如 rail search placement 或 session grouping。
4. 只有缺少稳定 hook 时才改 AionUI fork body，并在 upstream intake matrix 记录冲突面。

禁止修改 AionCore、引入第二套状态源、复制 Codex 专有代码、依赖构建后 hash class、使用
`:nth-child` 绑定业务含义，或用整页 `!important` 覆盖掩盖结构问题。所有行为数据仍来自
App contracts、Framework projection 和既有 Shell state。

## 验收矩阵

必须覆盖：

- Home/rail、普通 conversation、Composer、Settings、search modal、menu/popover；
- light/dark、zh-CN/en-US；
- `1440x900`、`1024x768`、最小支持窗口和 mobile/WebUI viewport；
- default、hover、pressed、focus-visible、disabled、loading、error、streaming；
- reduced motion、键盘遍历、ARIA/accessibility name 和正文对比度。

Semantic token 与 focused DOM regression 只关闭 Source 轴。真实 screen-reader traversal、完整
keyboard traversal、rendered contrast 和安装版 readback 仍分别由 Pixel/Install evidence 关闭，
不得从 CSS 或单元测试外推。

同 cohort 稳定 chrome 的目标：关键几何每轴误差不超过 `1px`；对动态文本、时间、头像和
系统 chrome 做 mask 后，主要稳定区域 pixel mismatch 不超过 `1%`。像素阈值是回归信号，
人工检查仍需确认没有文本截断、重叠、错误层级或功能入口丢失。

完成声明必须同时具备：App contract/docs、Shell source、focused DOM、typecheck/lint/i18n、
同 cohort screenshots、安装版 readback。Docs、DOM、candidate screenshot 或 source gate
任一项都不能单独宣称 visual parity 或 release-ready。

## 机器治理标记

- `visual_source=pinned_deepseek_harness_visual_source_cohort`
- `historical_interaction_reference=chatgpt_codex_workflow_and_spatial_observation_only`
- `pixel_reference=opl_app_owned_approved_visual_baseline`
- `external_reference_artifact_required_for_release=false`
- `project_owns_session=false`
- `project_context_row=forbidden`
- `new_session_context_bar=required_above_composer`
- `composer_capability_palette=searchable_grouped_scrollable`
- `conversation_search_location=rail_history_header_icon_button`
- `composer_resting_shadow=required`
- `home_starter_selected_alignment=centered_no_layout_shift`
- `composer_textarea=14/20/400`
- `composer_bottom_controls=12/18/400`
- `settings_surface_audit=all_routes_light_dark_desktop_narrow`
- `settings_icon_text_action=currentColor_stable_slot`
- `gateway_disconnect=identity_row_trailing`
- `temporal_dependency=required_for_complete_opl_durable_workflow`
- `temporal_maintenance=server_worker_detect_install_configure_start_restart_run_now_readback`
- `temporal_server_supervisor=login_resident_stable_launcher_run_at_load_keep_alive_repairable`
- `aioncore_modification=forbidden`
- `visual_acceptance=source_dom_and_installed_pixels`
- `stable_geometry_tolerance_px=1`
- `stable_masked_pixel_mismatch_max_percent=1`
