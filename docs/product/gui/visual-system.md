# OPL App GUI 视觉系统

Owner: `one-person-lab-app`
Purpose: `app_gui_visual_system`
State: `active_design_target`
Machine boundary: 本文定义人读视觉基准。交互流程归交互细则，具体 token、组件和响应式实现由
shell source 承接；机器可读产品状态、模型策略、page-state 和 release gate 仍归
现有 contracts、validators、tests 与 evidence。

设计体系入口见 [`README.md`](README.md)。

## 基准与例外

普通图标、theme token 和 visual primitive geometry 的 active source 是
[`contracts/app-gui-visual-source-cohort.json`](../../../contracts/app-gui-visual-source-cohort.json)
固定的 DeepSeek Harness commit。AionUI 只 vendor 该合同列出的最小闭包，并通过
`OplVisualProvider` / `OplIcon` 适配现有 theme state、handlers 与 Arco controls；DSH runtime、
session、router、provider、connection、完整 renderer 和 Client Cordis 均不进入 AionUI。

ChatGPT Codex macOS 只保留历史工作流和空间关系参考。每次 observation 可以记录官方来源、
精确版本/build 和日期，但不再拥有字体、颜色、图标、token 或 primitive 的 active visual
authority。正式像素回归仍使用 OPL App 自有、经人工批准的 16-scene baseline，执行与验收细节见
[`codex-app-visual-parity.md`](codex-app-visual-parity.md)。`26.707.72221` / build `5307`、
`26.707.41301`、`26.707.31428` 与 `26.707.31123` 只保留为历史 observation。

OPL App 在基准上保留以下产品例外：

- App icon、窗口/metadata identity 和发布资产继续使用 One Person Lab App；普通导航栏与
  移动端标题栏只显示文字 `One Person Lab`，不搭配 logo，也不要求深浅主题变体资产。
- 普通工作入口使用 owner-localized purpose language。可见性和排序读取动态 Package projection
  与用户偏好，本文不维护固定 Agent 名单或默认顺序。
- Executor、模型策略和当前默认值由 `contracts/app-product-profile.json` 决定；本文
  不复制 model/reasoning 值或模型 allowlist。
- Runtime、Home capability starters、Settings → Agents / Capabilities、first-run、receipts 和 action refs 使用
  App-owned contracts 与 OPL authority boundary。
- OPL accent、状态语义和双语 copy 由 App 拥有；不得改变 chat-first composition，也不得
  覆盖 DSH cohort 的普通视觉语法形成第二套私有风格。

DSH cohort 是受限视觉源码，不是产品 machine truth；Codex observation 是历史交互参考，
App-owned baseline 是 pixel authority。当前 carrier 的差异和证据状态见
[`shell-conformance-matrix.md`](shell-conformance-matrix.md)。

## 视觉原则

1. **Conversation first。** 主视觉锚点是单一对话时间线和底部 composer。
2. **Quiet utility。** 用层级、留白、细边界和稳定尺寸表达结构，不用装饰性 hero、
   渐变、浮动装饰物或大面积营销卡片。
3. **Secondary context on demand。** Environment、files、artifacts 与 Runtime details
   以 floating surface、preview 或 drawer 按需出现。
4. **Dense where repeated。** Rail、Settings 列表、tool events 可以紧凑；空白 Home
   和 conversation reading lane 保持呼吸感。
5. **State before decoration。** 颜色、图标和动效首先表达可操作状态，不承担纯装饰。
6. **One surface, one owner。** Composer、drawer、popover、Settings section 不使用
   card-in-card 或重复边框制造层级。

## Frame 与布局

宽桌面目标由四个稳定区域组成：

| 区域 | 目标 | 建议约束 |
| --- | --- | --- |
| 项目/对话 rail | 默认可见，承载全局入口、project 和 conversation history。 | `280-340px` 可调；列表滚动，不随动态标签改变宽度。 |
| Main canvas | 单一 conversation timeline 与 composer。 | 可用宽度不得低于 `620px`；reading lane 目标 `760-840px`。 |
| Conversation chrome | 当前 task identity、轻量状态和直接动作。 | 不承载 model/access 等 composer 配置，不做第二工具栏。 |
| Environment details | Changes、local、branch、commit/push、subagents、sources 与 OPL 次级 refs。 | 默认关闭；wide desktop 使用右上 anchored floating surface，空间不足时改 drawer。 |

布局规则：

- 宽桌面保持项目/对话 rail persistent；当 rail 加 main minimum width 无法同时成立时，
  rail 转为 drawer，不压缩 conversation 到不可读。
- Environment/details 不作为默认第三列。打开时保留 timeline scroll、composer draft
  和当前 selection；关闭后不改变业务数据。
- Conversation chrome、timeline 和 composer 使用同一水平节奏。宽屏增加外侧留白，不无限拉宽
  正文或把 composer 缩成小卡片。
- Home、Settings 与核心 Runtime 是普通全宽页面/主布局。
  不把整个 section 包成悬浮 card。
- Home 的提示、智能体快捷入口和 composer 共享靠近窗口底部的单一 reading lane；提示使用
  modest heading，不形成 hero，也不把智能体入口放大成全宽分类导航。
- Home starter 使用 content-sized 紧凑入口；容器不写死四列或五列、不显示连续 chevron，按当前
  可见入口数量居中并响应式换行。`ready/degraded` 可选择；`package_unavailable` 提供原因与恢复动作，
  不用样式掩盖真实不可调用状态。
- 新 session 的 initial cwd 由 composer 上方、与输入 surface 相接的独立 context bar 表达；未选时显示
  可操作的“选择项目目录”control，而不是“无项目”状态行。它不是装饰卡片，也不进入左下角 `+` palette。
  当前 active adapter 不显示 Local/Worktree、starting branch 或 managed lifecycle；未来新增必须先修改
  App contract 并提供真实 adapter。既有 session cwd mutation 不进入普通 composer。

## Typography

普通 chrome 的字体栈和字号来自 pinned DSH theme tokens；用户显式字体偏好继续生效。
代码、命令、路径和技术值使用同一主题定义的 monospace 栈，不另建组件私有字体策略。

推荐层级：

| Token | Size / line-height | 使用 |
| --- | --- | --- |
| `title` | `20/28`, weight `600` | 页面标题、空状态主标题。 |
| `section` | `16/24`, weight `600` | Settings section、drawer 标题。 |
| `conversation` | `15/22`, weight `400` | 用户与 assistant 正文。 |
| `body` | `var(--dsw-font-s-14)` | 普通 UI、列表摘要。 |
| `label` | `13/18`, weight `500` | 按钮、tabs、field labels。 |
| `meta` | `12/18`, weight `400` | 时间、状态、refs 摘要。 |
| `code` | `12/18`, weight `400` | 命令、路径和 receipt。 |

不得按 viewport width 缩放字号；不得使用负 letter spacing。中文与英文使用相同
字号层级，必要时通过容器换行、宽度和行高适配，不压缩字形。

## Color 与 Surface

以下表格是
`contracts/app-gui-product-contract.json#interaction_baseline.visual_target` 的人读投影，不是
独立 token source。视觉以中性灰阶为主；OPL teal 只用于品牌、typed status 和明确品牌动作，
不参与普通 rail、selected row、Settings 图标或 composer chrome。

Light target：

| Token | Value | 用途 |
| --- | --- | --- |
| `canvas` | `var(--dsw-alias-bg-base)` | Main canvas 与 conversation reading area。 |
| `surface` | `var(--dsw-alias-bg-layer-1)` | Composer、popover、drawer、Settings bounded group 和 active content。 |
| `rail` | `var(--dsw-specific-sidebar-fill)` | Navigation rail；由 DSH semantic token 提供层级。 |
| `surface-subtle` | `var(--dsw-specific-sidebar-nav-item-active)` | Selected row、tool event、secondary controls。 |
| `hover` | `var(--dsw-alias-interactive-bg-hover)` | 普通 hover。 |
| `border` | `var(--dsw-alias-border-l2)` | 1px 分隔和 outline。 |
| `text-primary` | `var(--dsw-alias-label-primary)` | 正文和主标签。 |
| `text-secondary` | `var(--dsw-alias-label-secondary)` | 元信息和说明。 |
| `text-muted` | `var(--dsw-alias-label-secondary)` | 低优先级 metadata；对白色 canvas 保持普通文字最低 `4.5:1` 对比度，由 App accessibility gate 验证。 |
| `focus` | `var(--dsw-alias-state-business-primary)` | Keyboard focus ring；由 DSH semantic token 与 App accessibility gate 验证。 |
| `success` | `var(--dsw-alias-state-success-primary)` | 成功。 |
| `warning` | `var(--dsw-alias-state-warn-primary)` | 需要注意。 |
| `danger` | `var(--dsw-alias-state-error-primary)` | 失败或破坏性动作。 |

Dark target：

| Token | Value | 用途 |
| --- | --- | --- |
| `canvas` | `var(--dsw-alias-bg-base)` | App 背景。 |
| `surface` | `var(--dsw-alias-bg-layer-1)` | Active content。 |
| `rail` | `var(--dsw-specific-sidebar-fill)` | Navigation rail。 |
| `surface-subtle` | `var(--dsw-specific-sidebar-nav-item-active)` | Selected row 和 tool event。 |
| `hover` | `var(--dsw-alias-interactive-bg-hover)` | 普通 hover。 |
| `border` | `var(--dsw-alias-border-l2)` | 1px 分隔和 outline。 |
| `text-primary` | `var(--dsw-alias-label-primary)` | 正文和主标签。 |
| `text-secondary` | `var(--dsw-alias-label-secondary)` | 元信息和说明。 |
| `text-muted` | `var(--dsw-alias-label-secondary)` | 低优先级 metadata；保持普通文字最低 `4.5:1` 对比度，由 App accessibility gate 验证。 |
| `accent` | `var(--dsw-alias-brand-primary)` | OPL 选中态和品牌动作。 |
| `focus` | `var(--dsw-alias-state-business-primary)` | Keyboard focus ring；由 DSH semantic token 与 App accessibility gate 验证。 |
| `success` | `var(--dsw-alias-state-success-primary)` | 成功。 |
| `warning` | `var(--dsw-alias-state-warn-primary)` | 需要注意。 |
| `danger` | `var(--dsw-alias-state-error-primary)` | 失败或破坏性动作。 |

状态不能只靠颜色表达；必须同时有文字、图标或可读形态。普通 surface 不使用彩色
渐变、强投影或透明模糊作为主要分层手段。

## Spacing

使用 4px 基准：`4 / 8 / 12 / 16 / 24 / 32 / 48`。

- Button icon/text gap 使用 DSH Button 的 `4px`；其它布局间距读取所属 primitive。
- Compact row vertical padding：`6-8px`。
- 普通 control height：`32-36px`。
- Settings row 或 message event 内边距：`12-16px`。
- Section 间距：`24-32px`。
- 主 reading lane 上下留白：至少 `24px`，composer 区域按窗口安全区增加。

动态内容不得改变 rail、toolbar、icon button、tab 或 composer action row 的稳定尺寸。

## Radius 与 Border

| Element | Radius | Border / shadow |
| --- | --- | --- |
| 普通 card / list group | `6-8px` | 1px border，默认无 shadow。 |
| Button / segmented control | `6-8px` 或 pill | 由语义决定，不混用随机半径。 |
| Icon button | circle | 固定正方形 hit area。 |
| Chip / status | pill | 文本短、单行；长状态改普通文本。 |
| Popover / drawer panel | `10-12px` | 1px border，轻 shadow。 |
| Composer | `20-22px` | 单层 surface、单层 outline、resting shadow；focus 不改变几何。 |

Settings 普通页面默认不用 card 包 section：使用 section heading、扁平设置行和 section 内
hairline divider。只有独立重复实体、确认或明确 bounded tool 才使用 card。禁止 nested cards、
重复白底、双重 shadow 和未裁剪的矩形 adapter container。

## Icons

- 首批迁移的 Titlebar、navigation rail、Home、composer 和 Settings navigation 统一通过
  `OplIcon` 使用 pinned DSH icon cohort；普通 utility/navigation icon 使用 `currentColor`、
  `14-16px` 稳定 slot，不使用彩色图标底板或字母头像。只有 typed warning、error、success
  和品牌动作使用语义色。未迁移 surface 可暂留 IconPark，但它不再是已迁移 surface 的视觉
  authority；vendor 外不手画平行 SVG，也不借此批量改写无关 upstream fork body。纯刷新动作只显示 refresh icon，并用
  tooltip 与 accessible name 提供文字。
- 项目/对话 rail 的空状态使用同一 DSH 单色语法：稳定 conversation glyph 配
  `13/18` muted 文案。不得回退到 Arco 默认的大号插画、彩色 empty illustration、边框卡片
  或占据 rail 主体的装饰性图形。
- 全局标题栏帮助/反馈入口使用 `OplIcon` 的 DSH 单色帮助图标，保留 tooltip、
  accessible name 和既有 GitHub issue 路由；不再使用 AionUI 的对话气泡图标。
- 已连接账户在 rail footer 使用绿色圆形 identity avatar。非中文姓名显示前两个词的首字母，
  连续中文姓名只显示第一个汉字；无姓名时回退到邮箱 local part 的前两个字符，再回退到 `OP`。
- Model/reasoning 紧凑控件直接显示模型与推理档位文字和 disclosure，不显示大脑图标。
- 常规尺寸 `16-20px`，stroke 保持 `1.5-1.75px` 的统一视觉重量。
- Undo、redo、attach、send、stop、search、settings、close、expand 等熟悉动作只用图标
  或 icon + 必要文字，不使用冗长 rounded text buttons。
- 不熟悉图标必须有 tooltip、accessible name 和 keyboard focus。
- Product icon 与 App identity 使用 OPL 品牌资产，不使用 Codex 或 carrier logo；普通导航
  chrome 是例外，按 text-only `One Person Lab` 呈现。

## Composer

Composer 是底部唯一主 command surface：

- Home 桌面参考几何固定为 composer 最大宽度 `736px`、最小高度 `98px`、圆角 `22px`；
  new-session context bar 高 `52px`、水平内缩 `12px`、与 composer 重叠 `13px`，未选时仍保留可操作的
  项目目录入口，选中后显示目录并提供清除动作。
- Textarea 与底部控件分别使用 DSH `--dsw-font-base-16` 与 `--dsw-font-xxs-12` 系列 token；
  按内容增长到合理上限后内部滚动，不用旧像素值覆盖主题。
- Composer 浮于底部或贴近底部安全距，不能与窗口边缘、bottom panel 或系统 safe area
  相撞。
- 只保留一层 visible surface。外部 bridge/adapter container 必须透明。
- Home root、composer shell 与 footer account/Settings entry 在每个 viewport 各只有一个实例；
  resize 后必须完整重绘，不能留下旧 composer frame。
- Home 与 ordinary composer 的 `+` 始终打开可搜索、分组、可滚动且受 viewport 约束的 capability
  palette；working directory 不进入该 palette。Rail 仅按当前 cwd 组织对话，不拥有对话或上下文，
  Environment 可按需展示同一运行信息。Textarea 承载任务正文；底部 action row 承载 `+` palette、
  permission/access mode、单一紧凑 model/reasoning menu、
  可选 voice 和 send/stop。
- 当前 session 的 attachment、paste/drop 与 `/open` 是唯一显式文件输入，不从 rail/workspace
  预载 context，也不做隐藏注入；attachment 使用同一层文件预览，不形成第二层卡片。
- Purpose 不作为常驻可变 selector；Home 用紧凑 starter 的选中态表达 active capability，
  不在 composer 重复“能力：”标签。进入 conversation 后可按上下文显示低权重 capability chip，
  但不得呈现为 backend/provider。
- 模型与推理状态及当前默认值读取 App product profile，不得在 shell 或文档复制
  model/reasoning 值或 allowlist。
- Backend、provider、executor 不进入普通 composer。Permission/access mode 保持可见，
  用自动化与文件权限的用户语言表达并保留安全透明度。
- Send/stop 使用稳定圆形主动作；running、stopping、blocked、failed 有明确文本或
  tooltip，不靠颜色猜测。
- Hover、focus、validation 和附件变化不能推动整个 timeline 跳动。

## Project / Conversation Rail

- 宽桌面默认可见，宽度在 `280-340px` 内可调，窄窗口改 drawer。
- Active AionUI 顶部固定 New task、运行状态、Scheduled tasks、Archived；Runtime 按当前核心能力合同验收。capability starter
  属于 Home，package/capability 管理属于 Settings。Sites/Chat 没有 OPL 对应能力时不显示。
- 中段优先按显式 Project-affinity metadata 组织 canonical sessions；无显式 affinity 的普通 recorded cwd 可生成
  只读目录组，`~/Documents/Codex/**` 与 `~/.codex/worktrees/<id>/**` managed scratch 则保持 projectless，避免按
  叶目录生成同名 Project。分组不拥有 session、context 或 artifact。尚无显式 UI affinity 的
  Projectless row 在回读 exact canonical thread identity 后，可以版本化 UI metadata 一次归入目录组；
  不能把 Shell DTO 的 project 字段当成 App Server authority，recorded cwd 保持不变；
  已绑定 row 不任意换组。Recorded cwd、命令或 turn
  的实际 `pwd` 变化不移动 canonical-thread row，也不复制 row/history 或按标题/workspace 去重。
  `.codex/worktrees/<id>/**` 的 Codex row 在标题尾部显示固定 15px 的低权重 BranchOne 标志；使用本地化
  tooltip/accessible name“隔离工作树”，不显示 worktree ID，不占用额外行高，也不覆盖右侧菜单。
- Directory group 展开后显示 conversations、“使用此工作目录新建对话”，并作为 projectless adoption 的拖动目标；
  同一动作必须有键盘可达等价入口。失败时 row 留在 projectless 组。不显示“添加上下文”或组级删除，
  更不得级联删除分组内 sessions。Canonical App Server overview 可用时排除未返回的 stale Codex ACP
  cache rows；只有 overview unavailable 时 fallback cache，非 Codex local rows 保留。
- 底部固定 account、help、Settings；常用 row actions 在 hover/focus
  出现，但 keyboard 用户可达。
- Active row 使用 tonal fill、清晰标题和轻量状态；不使用大色块或每行独立 card。
- 标题单行截断，完整值在 tooltip 或 details；状态 badge 不改变行高。
- 窄窗口转为 drawer，关闭后不丢失 selection；重新打开时保留 scroll position。
- Search 作为“对话历史”标题右侧的 icon-only action，不再占用独立文字 row；pin、rename、
  archive、reset 同样不得改变 row 稳定尺寸，Archived 使用独立 surface。
- Desktop application menu 与 conversation header 共享 Back/Forward、Previous/Next Task
  和 New Window 语义；不可用项 disabled，不能用无反馈菜单伪装成功。

## Conversation Timeline

- 主区只有一条时间线。Assistant 正文默认 unframed；用户消息可以使用轻量 bounded
  surface，但不做同权重大气泡墙。
- Assistant Markdown 默认 `15/22`，段落上下 `10px`、列表项上下 `2px`；行内 code/path
  使用 `12/18` 中性浅灰胶囊，不按 viewport 改字号。
- Tool、process、diff、file、receipt 和 permission event 使用本地化 compact disclosure row，
  不使用整块灰底 card。消息 hover/focus action 不得永久占用 `32px` 空白行；初始 skeleton
  只画无框文本线，不画 bordered message bubble。
- Approval、permission、user-input 与 MCP elicitation pending 使用同一层级的 compact bounded
  disclosure。后台 target 可放在 selected thread detail，但必须显示 thread/turn/item context；
  不使用无上下文全局 modal，也不把 pending 绘制成 error。
- 当前 turn 的 running artifact 显示 elapsed time、最近事件和可执行下一步；完成后
  收敛成摘要。
- 可 pin current-task summary bar 使用稳定单行/双行布局，固定容纳 status、elapsed、
  progress、next action、stop，不因状态文字长度推动 composer。
- Raw protocol、schema id、路径和完整 JSON 在 details/diagnostics 中显示。
- 长文本、代码和表格必须在 main width 内换行或滚动，不遮挡 composer 和后续消息。

## Popover、Drawer 与 Environment Details

- Model/reasoning、统一 `+` 菜单和 compact action sets 使用 anchored
  popover；短选项不升级为整页。
- Environment 使用右上 anchored floating surface，首层只读汇总 recorded workspace、changes、branch、
  commit/push、subagents 和 sources。
- Environment 不提供已绑定 session 的“切换 Project/工作目录”、Local/Worktree 或其它 workspace mutation；
  projectless adoption 位于 rail。运行时命令/turn 的 `pwd` 不作为 App rail metadata 反写。
- OPL Artifacts/Evidence 进入 Environment 次级 section、preview 或 conversation
  disclosure；Runtime/Actions/Memory 不升级为同权 tabs。
- Popover 关闭后焦点回到触发器；drawer 有明确标题、close control 和焦点边界。
- Environment/details 打开时是当前 conversation 的辅助层，不是独立 dashboard。
- Home 只在 composer 上方独立 context bar 提供新 session 初始 cwd；Local/Worktree、starting branch
  仅在 active adapter 有真实 new-session action 时显示，不提供 managed Worktree、handoff、cleanup、
  snapshot receipt、restore 或 cross-host 控制面。
- Drawer 内避免卡片套卡片；用 section header、divider、row 和 disclosure 表达层级。
- Bottom panel、file tree、Terminal、Browser 默认关闭；打开时尺寸稳定且不得遮挡 composer。

## Settings

Settings 保留 OPL 信息架构，但视觉采用 Codex 式窄内容列与 quiet grouped-row Control Center 基线：

- 使用 full-window shell，提供明确 return、search 和 grouped rows。
- Ordinary navigation 按当前 App-owned Settings IA 渲染；具体 route、label 和顺序从
  contracts/Control Plane 读取，不由 shell 自行扩展。
- 左侧 section navigation 稳定并使用单色 utility icon；右侧采用单列 reading lane，优先使用
  section heading、grouped rows、hairline divider 和不超过 8px 的安静 bounded list group。
  只有重复实体、confirmation 或确有独立边界的工具才使用 card，不为每个字段或操作再套一层 card。
- 侧栏在任一时刻只显示一个选中项；兼容路由完成跳转后，选中态归属实际落地页。
- bounded group 用于清晰分组；禁止 nested group、彩色 category 边条和重 shadow，也禁止
  用贯穿全页的裸横线堆叠出空旷、低密度页面，或把同一个用户问题拆成营销式卡片墙。
- Account & Access 的已连接 Gateway 账户使用单一 unframed content group：身份、指标、托管
  Key 与操作只通过留白组织；stale/error 是内联状态文字，不形成 banner、账户卡片、指标区或
  footer 的 nested frame。
- Settings 响应式断点按右侧 reading lane 的真实内容宽度判断，而不是按整个窗口宽度判断。内容列
  低于 `620px` 时，路径摘要、状态和操作切为单列；路径允许在分隔符处自然折行，不逐字断裂。
- Instructions & Context 的 Codex instructions 和新对话附加说明使用 unframed field groups 与 section hairline，
  不在 section 内再套灰底卡片或带框内容块。
- 重复实体使用一组共享列头；逐行重复“名称 / 状态 / 来源 / 操作”等字段标签会降低
  扫描效率，不作为默认布局。
- 主操作贴近其拥有的对象或 section；不把对象级动作抽离成远端页面工具栏动作。
- 首屏先给结论、影响范围和下一步；raw path、id、receipt、JSON 和诊断默认折叠。
- 二元设置用 toggle/checkbox，模式用 segmented control，数值用 input/stepper/slider，
  多选项用 menu，颜色用 swatch，命令才使用 text 或 icon + text button。
- 破坏性或状态改变动作进入 confirmation drawer，明确 `will change`、
  `will not change`、recovery/receipt 和 preview/proof。

## 状态系统

所有 interactive element 至少定义：

- default、hover、focus-visible、pressed/selected；
- disabled 并解释原因；
- loading/running、success、warning、error；
- empty、unavailable、stale 或需要 refresh 的可理解文案。

Loading 不用无限旋转器代替进度。可获得阶段或 elapsed time 时必须展示；没有可执行
动作时不渲染空按钮。Disabled control 不仅变灰，还要通过 tooltip 或 nearby copy
说明为什么不可用。

Home package starter 的状态不得只靠颜色：只渲染 installed + Home-visible 条目；
`ready/degraded` 可选择并使用 quiet fill 与 `aria-pressed`，不额外添加 selection glyph；`package_unavailable` 显示原因和
恢复动作但不强制可选；`activating` 保持稳定尺寸并显示明确进行中状态，`blocked` 保留输入、
普通 Codex fallback 与修复入口但不得继续 launch。

## 响应式

- 不按 viewport 缩放字体。
- 优先保住 main canvas minimum width；空间不足时依次把 Environment/details、project rail
  转成 overlay/drawer，而不是压扁所有列。
- 窄桌面/平板保持 timeline 与 composer；secondary context 以全高 drawer 打开。
- 极窄宽度下 composer controls 可以换行或进入 overflow menu，但 send/stop、输入、
  workspace 和当前模型状态仍可达。
- 固定格式元素使用明确 width、min/max、aspect ratio 或 grid track，避免动态内容造成
  layout shift。

## 可访问性

- 正文与背景对比至少 `4.5:1`；大字、非文本边界和 focus indicator 至少 `3:1`。
- Source gate 只锁定语义 token 和 focused DOM 行为；真实 screen-reader traversal、完整键盘遍历、
  rendered contrast 与安装版 readback 分别属于 Pixel/Install evidence，不能由 token test 代替。
- 所有功能可 keyboard-only 完成，Tab order 与视觉顺序一致。
- Focus ring 清晰，不被 overflow 裁掉；drawer/modal 使用正确 focus trap 和 Escape。
- Icon button 有 accessible name；tooltip 不作为唯一信息来源。
- 桌面 pointer target 通常不小于 `32x32px`，关键动作和触控 surface 目标不小于
  `44x44px`。
- 支持 reduced motion、系统字号和屏幕阅读器；状态变化使用适当 live region，避免
  重复朗读 streaming token。

## 双语

- 普通 UI 支持简体中文和英文，同一屏保持单一语言。
- 无显式语言偏好的首次启动在首帧前检测系统语言；显式选择优先且跨启动保留。
- OPL、Codex 可作为品牌保留；命令、路径、receipt id 和用户原文在技术区域保留原样。
- 中文 labels 优先描述工作目的，不用 MAS/MAG/RCA、route id 或 backend 名称替代。
- 为英文长词和中文扩展预留至少约 30% 文案空间；不能靠缩小字体或负字距塞入控件。
- 日期、时间、数字和 plural rules 使用 locale-aware formatter。

## Motion

- Hover/focus feedback：`80-120ms`。
- Popover、drawer、rail transition：`140-200ms`，只动画 opacity/transform 等不会
  触发布局抖动的属性。
- Streaming、progress 和 running indicator 应平稳，不使用装饰性循环动画。
- `prefers-reduced-motion` 下取消位移和弹性效果，只保留必要状态切换。
- Motion 不得延迟输入、send/stop、close、permission 或 destructive confirmation。

## 视觉 QA 边界

实现视觉变更时至少检查：

1. 宽桌面：persistent project rail、单一 timeline、composer、Environment details closed。
2. Environment/details open：右上浮层不遮挡关键内容，close/focus/scroll 正常。
3. 窄桌面/WebUI：rail 与 Environment/details 以 drawer/overlay 实际可见，不是 hidden DOM。
4. Home、conversation、Runtime、Settings、first-run 的 light/dark 与中英文；按受影响 route
   和当前 App scene contract 确定本轮视觉 QA 范围。
5. Composer 的单层 surface、稳定尺寸、model/reasoning controls、send/stop states。
6. 参考观察对照观察时最新可验证的官方 ChatGPT Codex macOS，并记录精确 receipt；稳定像素
   比较只对 OPL App 自有、经人工批准的 baseline 执行，同时明确记录 OPL branding exception。
7. Environment floating details 保持按需、anchored 和 summary-first；OPL 次级 refs 与
   advanced work surfaces 默认折叠或关闭。
8. Settings 截图在记录证据前校验 requested/resolved route 与 expected/visible page title；
   任一不匹配即停止截图，避免把 Resources、Appearance 或其他页面记到错误目标。
9. Settings 至少分别有桌面、窄屏和深色 fresh visual evidence，并检查单一侧栏选中态、
   bounded group、重复实体列头和对象附近主操作。

Source screenshot、DOM test 或 contract validation 只证明对应层。Packaged App、
WebUI parity、clean VM、release readiness 和 owner acceptance 必须由各自 evidence
surface 单独证明。
