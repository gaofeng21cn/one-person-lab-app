# OPL App GUI Shell 实现指南

Owner: `one-person-lab-app`
Purpose: `app_gui_shell_implementation_guidance`
State: `active`
Machine boundary: 本文是 shell adapter 的人读实现指南。产品行为、page-state、模型
策略、Settings registry、state/action surface 和 release gate 仍由现有 contracts、
validators、source/tests 与 evidence 拥有。

设计体系入口见 [`README.md`](README.md)。

## 定位

本指南提炼 active AionUI 路线中可复用的方法，不是 AionUI 代码复制指南。未来 shell
应实现同一套 App-owned contracts，而不是继承 AionUI 的目录、组件名、状态模型或
fork-local 产品逻辑。

正确目标是：

- App repo 定义产品、profile、page-state 和验收边界；
- shell 负责 renderer、platform integration、bridge、i18n/CSS 和 focused tests；
- Framework/domain/release owners 继续拥有各自 truth；
- carrier 可以替换，产品语义和 action/state contract 不随 carrier 分叉；
- 多个 GUI 是同一逻辑控制面的独立 client，不共享 renderer dependency tree 或 GUI 私有
  database；本机 launch selection 与正式 release-shell adoption 是两条独立路径。

“不降级”只保护已进入 OPL App contracts、ordinary routes 或正式用户路径的能力。
AionUI Team 和 provider/backend marketplace 按明确 product policy 处理；用户/第三方
Skills/MCP 从 owner/native discovery 继承，仅受用户可见性偏好与明确 Team/internal negative
policy 约束。缺少 App 清单项本身不是删除能力的授权。

## Contract-first 顺序

实现任何用户可见变化前，按以下顺序定位 owner：

1. 功能要求：[`feature-inventory.md`](feature-inventory.md) 与
   `contracts/app-gui-product-contract.json`。
2. 默认值和 generated config：`contracts/app-product-profile.json`。
3. 页面状态与显示边界：`contracts/app-page-state-matrix.json`。
4. 原生 iOS 伴侣端、传输与配对边界：`contracts/app-remote-companion.json`。
5. Settings registry/route/action：`contracts/app-settings-control-plane.json`。
6. Release-shell adoption 与 local launch selection：active/candidate adapter contract、
   `contracts/app-shell-candidates.json#interactive_launcher_policy`。
7. 理想交互与视觉：[`ideal-interaction-spec.md`](ideal-interaction-spec.md)、
   [`visual-system.md`](visual-system.md)。
8. 当前差距与验证入口：
   [`shell-conformance-matrix.md`](shell-conformance-matrix.md)。

若现有 shell 行为与目标不同，先分类差异，不在 renderer 中偷偷建立新默认。当前
Codex-based ideal target 是宽桌面 persistent project/conversation rail；active
AionUI 读取动态 state source，OPL Studio candidate contract 记录 ideal target。两者是否
收敛由 validator readback 动态计算，不在人读实现指引复制当前 profile 值；应由产品
contract/实现收敛 lane 处理。

## Thin Adapter 结构

一个合格 shell delta 通常只需要以下边界：

| Adapter surface | 职责 | 禁止事项 |
| --- | --- | --- |
| Product profile consumer | 读取 generated App profile，提供品牌、默认模型、purpose、locale 和 feature flags。 | 硬编码模型 allowlist、provider policy 或 shell-local default。 |
| State bridge | 把 App state readback 规范化为 renderer 可消费 envelope。 | 从本地组件状态推断 runtime/domain readiness。 |
| Action bridge | 执行 App-owned action，并返回 dry-run/result/receipt。 | 直接调用 domain CLI、绕过 confirmation 或自建 mutation kernel。 |
| Package launch adapter | 把 owner projection 归一为 `ready / degraded / package_unavailable`，消费 exact projected action 与 `required_payload_fields`，校验 presence/callability、入口和所需 safe target。普通 create/send 或 turn invocation 不执行 Package activation；真实 stage activation 由 Framework 执行。 | 增加跨 Package 版本 gate、从 installed flag 推断可用、从 manifest 推断 action payload、把 optional receipt/binding/closure 当硬门槛，或在 `package_unavailable` 后仍创建/发送所选 Agent conversation。 |
| Thread directory adapter | Rail 投影 canonical thread directory/actions；Project affinity 来自 canonical-thread-keyed versioned UI metadata。普通 recorded cwd 只提供未绑定时的只读目录分组，managed scratch 保持 projectless。所有线程读取与动作复用同一 App Server adapter。 | Shell DB 拥有 history、从 cwd 推断 affinity、把本地 DTO 当成上游 Project authority、让 managed scratch 叶目录成为 Project、第二 client 或私有 coordination layer。 |
| Projectless local-input adapter | 让 attachment、file/directory picker、paste/drop、`/open` 在无 workspace 时继续进入 Codex 原生权限路径。 | 因缺 project 禁用输入、把 workspace membership 当授权、复制第二套 path permission model。 |
| Artifact ref adapter | 当前 session 显式 attachment、可见 conversation result 或用户选择的合法绝对本地路径解析为现有 Preview target，保持只读和 fail-closed。 | 复制 artifact body、新建 renderer/store、隐式 workspace ref、路径穿越、非法 scheme、自动静默读取或猜测未知格式。 |
| Capability palette adapter | Composer `+` 始终先打开与 composer 等宽、可搜索、分组、可滚动且 viewport-bounded 的 palette；条目显示稳定 icon slot、名称和可用说明。按 Home/new-session 与 existing conversation 分别消费真实 file/folder picker、动态 installed Package/capability projection、当前 surface 用户可见偏好、真实连接及 adapter-reported nonduplicate mode；Agent 不在既有会话重绑。 | 空 catalog 时直接打开文件选择器；220px attachment 小菜单冒充 palette；复制第二套 App Package/Skill 目录；把 permission/access 重复成 mode；伪造 Plugin/Chrome/目标/计划/provider/backend/team/raw MCP。 |
| Session Project-affinity adapter | Context bar 只设置新任务 initial cwd；rail 对未绑定 UI affinity 的 session 提供一次性归口。先回读 exact canonical thread identity，再按该 ID 写入版本化 UI metadata；recorded cwd 不变，失败保持 projectless。Environment 只读显示执行环境。 | 伪造 App Server Project 字段或 assignment RPC、任意 bound-to-bound 重绑、修改 writable roots、从 turn cwd 推断 affinity、第二 client/adoption service、私有 pending/receipt/rollback 或 managed Worktree/Handoff。 |
| Review adapter | 在现有 Files/Changes diff surface补 uncommitted/base branch/commit/custom、inline/detached、PR context、stage/commit/push；`gh` 缺失明确 unavailable。协议缺失时显示 truthful unavailable。 | 恢复 equal-weight Review tab、复制 diff/Git store、创建本地 annotation store、伪造行级成功。 |
| Route adapter | 把 legacy/upstream route 映射到 App-owned page。 | 让 compatibility route 重新成为 ordinary navigation。 |
| Settings slot | 从 Control Plane registry 渲染 ordinary/secondary pages。 | 复制一套 shell-owned Settings IA。 |
| Presentation adapter | 复用 shell primitives 实现 App layout、tokens、i18n 和 accessibility。 | 复制外部源码或把视觉 token变成产品 truth。 |
| Platform adapter | Electron desktop 与 HTTP/SSE Web carrier 的 file picker、window、notification、secure storage。 | 把平台能力提升成 runtime/domain authority，或在 carrier 中复制 host-core business logic。 |

只有在现有 primitive 无法表达 App contract 时才新增 shell-local component。新增组件
应围绕一个明确 slot 或 page-state，而不是创建未来可能使用的 framework。

## Host 与 Carrier 接入

Host scope、DSH plugin composition 和三种 delivery transport 的架构定义见
[Application Host composition](deepseek-harness-composition-plan.md)，App 产品/adoption
边界见 [Studio 产品边界](opl-studio-plan.md)。实现以
`contracts/app-product-profile.json#delivery_topology` 与当前 adapter 为准：
carrier 只改变平台接入，不复制产品 IA、Host business logic 或 session store。

原生 iOS OPL Link 是 bounded remote projection；协议、provider、pairing、授权与撤销
只维护在 [OPL Link](../opl-link.md) 和 `contracts/app-remote-companion.json`。
Shell 用唯一 remote transport 映射 owner-projected conversation reads/events/actions，
不创建第二线程状态或以 LAN WebUI 代替缺失 transport。

## 多 GUI 运行边界

[`gui-shell-candidates.md`](gui-shell-candidates.md) 是本机 GUI 选择的操作 owner。Shell
实现只需满足下面的 client contract：

- App-root launcher 按 `shell id + mode` 选择本次启动目标，默认目标来自 active adapter；
  launcher 不得改写 active adapter、release role 或 updater channel。
- 每个 shell 保持独立 bundle id、checkout、lockfile、依赖树和 GUI user-data root；不要
  为复用而共享 `node_modules`、SQLite、localStorage 或 renderer store。
- 两个 shell 都必须通过 App command-resolution policy 取得 OPL/Codex executable。
  Launcher、直接打开 bundle 与 installed process 分别回读身份，不从单个路径外推 same-runtime parity。
- Runtime readback 至少绑定 OPL/Codex path、version 和 cohort ref。Shell-local cache 不得
  覆盖 resolver readback，也不得把缺失 readback 改写成 ready。
- Codex Core/App Server 拥有 thread history 和 opaque thread id。两个 shell 最终都从
  `thread/list/read/resume` 投影 conversation directory；本地存储仅用于 UI preferences、
  draft 和可重建 cache，不得直接读取另一个 GUI 的 private store。
- 双 shell parity 必须用 exact cohort 证明跨 workspace、并发写与 steer 保持 Codex
  flexibility，并把 overlap/loop 作为 advisory；queue 只有双方真实实现后才进入 parity gate。
  Side-by-side install 或 sequential switching
  不能替代该行为证据。

本机 launch selection、runtime identity 与 conversation continuity 分别验收。
当前状态从 [Shell conformance](shell-conformance-matrix.md) 的 owner 入口读取，局部实现不提升为双 Shell parity。

## AionUI 最小定制阶梯

AionUI 主线定制必须从维护成本最低的层开始，前一层能完成就不得进入后一层：

| Level | 优先手段 | 适用内容 | Closeout 要求 |
| --- | --- | --- | --- |
| `L1 profile/data` | Generated profile、registry、已有配置 | 品牌、labels、默认值、可见入口、capability exposure。 | 不修改 upstream component tree。 |
| `L2 bridge/adapter` | 既有 IPC/API adapter、App state/action bridge | Codex/OPL data、actions、receipts、platform capability。 | 单一 truth、typed failure、focused bridge coverage。 |
| `L3 composition/token` | Existing layout primitive、slot、wrapper、CSS variable、i18n | Rail section、composer strip、timeline event、Environment secondary content、视觉 token。 | 不复制状态模型，不整页重写，不用广域 CSS selector 接管 upstream DOM。 |
| `L4 fork-body patch` | 对 upstream component 的最小直接修改 | 只有稳定边界无法表达且属于 P0/P1 的交互。 | 记录 upstream file、必要性、冲突热点、focused regression 和下一次 intake 处理。 |

以下情况不是进入 `L4` 的理由：现有组件样式不完全一致、测试更容易写、短期绕过
profile hydration、或 Settings 页面已有类似布局。视觉对齐优先复用 composition/token，
不能通过重写大组件把 AionUI 变成第二套私有 shell。

每次主线 GUI 工作都应输出 delta inventory：修改的 upstream fork-body 文件、OPL-owned
overlay/adapter 文件、tests/evidence 文件分别计数。文件数不是机械 gate，但 fork-body
范围持续扩大时必须先重新检查是否能退回 `L1-L3`。

## Profile-driven

Generated product profile 是 shell 的默认值入口：

- Home/conversation 的模型、推理、purpose 和 presentation override 从 profile 读取；Package/capability
  identity、installed/callable 状态和 owner exposure 从 Framework/native platform projection 读取。
- 当前默认值、具体模型列表、顺序、退休策略和持久化规则只引用
  `contracts/app-product-profile.json`，不在 shell 或人读实现文档复制。
- Branding、locale、ordinary UX override、optional modes 和 Team 等窄显式 product cuts 使用同一
  profile；profile 不枚举 Package/Skill identities，也不覆盖 owner-projected required/optional edges。
- Profile 缺失、schema 不兼容或字段无效时 fail closed，显示可理解 blocker；不要
  回退到 upstream provider/model defaults 后假装一致。
- Shell-local cache 只能作为加载优化，必须保留 profile version/source，不能成为
  独立配置 authority。

## State / Action Bridge

普通读取：

```text
opl app state --profile fast --json
```

显式刷新通常仍使用 fast profile。Runtime 只消费合同允许的 Work Item、Stage、Attempt、
Token 和 visibility 投影；Stage Popover 不得触发 Full state 或 Operator drilldown。
Full state 和 Operator full drilldown 只允许 Maintenance diagnostics 与 release tooling 请求，
不得作为 Runtime 的 detail fallback。各页面只渲染自身 allowlist；不得从
`active_run_id`、module dirt、DOM presence 或缓存推断 running、ready、synced、
domain-ready 或 release-ready。

页面所有权固定如下：

| Surface | Owns | Must not absorb |
| --- | --- | --- |
| Runtime | Agent/Project scope、Work Item status、running/elapsed、Stage/Attempt、Token、archive/restore | provider/platform repair、updates、module health、raw diagnostics、artifact provenance、release controls |
| Settings Maintenance | provider/platform repair、Temporal/worker readiness、托管依赖、软件更新、raw diagnostics、State Index、operator drilldown、logs、command refs、safe-action catalog | Work Item lifecycle 或论文进度 |
| Settings Agents | Agent Package 目录、安装/更新/修复、开发来源、Home visibility | Stage activation、Skills/Plugins/Flow、Gateway 或资源连接 |
| Settings Capabilities | Skills、Plugins、OPL Flow、MCP、图像与语音能力 | Agent Package lifecycle、Gateway 或资源连接 |
| Inspector | task/conversation artifact provenance、preview、lineage refs | artifact authority 或 Runtime status |
| Release tooling | 同 cohort 的完整 evidence bundle | 普通用户 Runtime UI |

Mutation 统一使用：

```text
opl app action execute --action <id> [--payload <json>] [--dry-run] --json
```

实现要求：

- 先从 App state/action catalog 取得可用 action 和 disabled reason。
- Runtime 只调用当前 Runtime contract 声明的动作；typed views 按 contribution/action ABI
  派发，不能从字段名推导可写权限。其他页面的动作仍由各自合同授权。
- 高风险或状态改变动作先 dry-run/preview，再 confirmation，再 execute。
- UI 明确显示 what changes、what does not change、receipt/recovery ref 和 refresh 行为。
- Result receipt 是动作事实，不代表 runtime、domain、artifact 或 release readiness。
- 网络、CLI、schema 和 permission failure 保留 typed reason，不转换成模糊 `unknown`。
- Package contribution 数据读取可调用 Framework-owned `opl app contribution read`，但必须验证
  `opl_app_contribution` 包络、`opl_app_package_contribution.v1` surface、当前
  Package/ref/operation identity、`opl-package-app-contribution-response.v1`、`ok=true` 和
  App-owned standard renderer payload；renderer 只由当前 descriptor `view_type` 选择。
- Package contribution 写入不得由 Shell 直接调用 `opl app contribution execute`。Shell 仅能调用
  `opl app action execute --action package_contribution_execute --payload <json> --json`；Framework
  可在 canonical action boundary 内部委派 execute broker 并重新校验 descriptor、carrier readiness、
  ref 与 confirmation。若 fast App state/action catalog 没有 exact action，页面保留 read-only view，
  command 隐藏或 disabled，并显示 projected disabled reason。
- Package launch 复用 owner-projected launch adapter / JIT prepare，并按
  `ready / degraded / package_unavailable` 三态消费。普通 launch 只检查 package identity、
  presence/callability、entrypoint、safe managed target 和 permission/authorization；这些真实性或
  安全边界失败时局部 fail closed。破坏兼容的变化发布新的 capability identity 或 owner adapter，
  不在 Shell 增加跨包版本 gate。deferred verification、
  optional receipt/binding/closure 走 degraded/fail-open。Shell 不拥有 package currentness 或
  materialization，receipt 存在时只做 readback，不把 receipt 缺失升级为 ordinary send 的第二硬门。

Thread directory 是一条窄 host boundary：Codex Core/App Server 拥有 opaque thread ID、history、
status 和 lifecycle；Shell 用一个 adapter执行 list/read/start/resume/fork/archive/restore并投影现有
directory/actions。Project/workspace 只作默认 cwd、分组和元数据。普通 conversation 继续复用
AionUI ACP；不得增加第二 JSON-RPC client、coordination audit/idempotency、dynamic/model-delivery、
pending-request 或 cross-host控制面。

## Settings Control Plane

Settings 是 App-owned OPL Control Center。Shell 应通过 Control Plane registry 和
adapter slot 承接，而不是遍历 upstream settings pages 后临时隐藏。

实现边界：

- `SettingsHost` 负责页面 frame、search、navigation、deep-link 和 shared protocols。
- `SettingsShellAdapterSlot` 把 App registry entry 映射到当前 shell component。
- Ordinary routes、secondary routes、legacy redirects 和 extension anchor remap 由
  contract hydration 提供。
- 概览先显示结论、影响范围和下一步；raw path、id、receipt、JSON 与 diagnostics
  默认折叠。
- Toggle、menu、segmented control、input、confirmation drawer 和 post-action notice
  使用统一 interaction protocol，不为每页另造 action semantics。
- Upstream 新增 Settings 页面必须先经过下面的 intake classification，不能自动进入
  ordinary navigation。
- Capability 选择优先从 Home starter 进入，Home/new-session `+` palette 作为同一状态的备用入口；package 安装、Home visibility 和 lifecycle 进入
  Settings → Agents 管理 package lifecycle，Settings → Capabilities 管理
  Skills/Plugins/Flow 和本机能力；历史入口只允许 compatibility redirect。

## Settings Upstream Intake 分类

Broad AionUI intake 先使用 adapter contract 的 `absorbed / rejected / deferred`。只有
Settings route、registry、slot 与 compatibility 变化再使用以下四类判定：

| Class | 何时使用 | 实现动作 |
| --- | --- | --- |
| `accepted` | 行为、copy、authority 和视觉均符合 App contract。 | 原样复用或只做品牌/i18n token 映射。 |
| `adapt` | Primitive 有价值，但信息架构、默认值、copy 或 bridge owner 不同。 | 保留 primitive，改为 profile/state/action driven 的薄适配。 |
| `redirect` | 旧 route/deep link 仍需兼容，但不应出现在普通产品层。 | 在 route adapter 中映射到最近 App-owned page，不渲染旧 ordinary tab。 |
| `reject` | 会引入第二 truth、暴露 forbidden surface、复制不兼容源码或破坏 chat-first。 | 不吸收；必要时在 validator 中加入 forbidden probe。 |

分类记录应说明 App source ref、用户影响、authority owner 和验证入口。不要用
`accepted` 代表“upstream 已有所以直接拿来”，也不要用 `adapt` 合法化深 fork rewrite。

## 视觉实现边界

- 布局、密度、composer、timeline、project rail 和 Environment floating details 的外部
  设计参考使用观察时最新可验证的官方 ChatGPT Codex macOS，并记录精确 observation receipt；
  `26.707.41301`、`26.707.31428` 与 `26.707.31123` 仅保留为历史 observations。正式像素
  回归只绑定 OPL App 自有、经人工批准的 baseline；OPL branding 与 product contracts
  始终是 authority。
- AionUI 是 active implementation carrier 和 OPL Studio candidate 的 regression floor，
  不是理想视觉 authority。
- 优先通过 tokens、CSS、existing layout primitives、composition 和 i18n 对齐。
- 不复制 ChatGPT/Codex、AionUI upstream 或外部 demo 源码来建立产品层。
- DOM presence 不能证明视觉可用。Rail、drawer、Environment/details 和 canvas 必须在
  目标 viewport 中有可见像素、正确尺寸、可操作 controls 和无重叠布局。
- Visual change 不得以恢复旧 UI 的方式满足 stale validator；先判断 contract/gate
  是否已经落后于产品目标。

## Visual QA 与证据层级

| Level | 能证明什么 | 不能证明什么 |
| --- | --- | --- |
| Contract/profile validation | 字段、引用、route 和 adapter shape 一致。 | 页面真实渲染、交互和视觉对齐。 |
| Focused unit/DOM test | 指定 state、action、route 和可见行为存在。 | 像素布局、packaged behavior、完整用户路径。 |
| Source browser screenshot | 当前 source renderer 在指定 viewport 可见。 | Packaged App、clean VM、release currentness。 |
| Packaged screenshot/smoke | 某一 package cohort 可启动并渲染目标路径。 | Stable promotion、owner acceptance、domain readiness。 |
| Same-cohort user-path/VM evidence | 指定构建在目标环境完成验收路径。 | 未经 release authority 的发布或 currentness claim。 |

视觉 QA 先覆盖 P0/P1：宽桌面、窄桌面、rail、Home、conversation、composer、
Environment open、light/dark、简体中文/英文和 composer running/error。Settings 属于
P2 独立矩阵，不能替代主工作流证据。截图必须绑定 route、viewport、source/package ref、
command 和可见状态 anchor。

## 实现步骤

1. 读 App contracts、三层文档和当前 adapter；先确认精确 Codex observation、OPL delta
   与 current deviation。
2. 按 `P0 Codex Core -> P1 OPL Professional -> P2 Administration` 排序，不用 Settings
   完成度替代主体验。
3. 先用 `absorbed / rejected / deferred` 分类 broad AionUI intake；Settings 变化再追加
   `accepted / adapt / redirect / reject`，然后从 `L1-L4` 定制阶梯选择第一个可行层级。
4. 只实现 profile consumer、bridge、slot、route、presentation 所需最小 delta。
5. 为用户可见行为增加 focused existing-test coverage；视觉变化增加截图/pixel evidence。
6. 运行 adapter 对应 validation，不用 candidate evidence 替代 active-shell evidence。
7. 更新 conformance matrix 的 source refs 和状态；未取得的 evidence 保持
   `not evidenced` 或 current deviation。

## 反模式

- 在 shell 中复制模型 allowlist、Settings IA、purpose list 或 page-state rules。
- 让 upstream route、Team、多 backend/provider controls 或 raw permission-mode terminology 回到 ordinary UI；App-owned user-language permission/access control 必须保留在 composer。
- 为保留 AionUI 未采纳功能而扩大 ordinary IA，或把 Settings capability management 重新挂回 rail。
- 从 module health、Git dirt、active id、缓存或 DOM 推断 runtime/domain readiness。
- 直接执行 domain CLI、写 artifact body、memory body、owner receipt 或 release truth。
- 为兼容一个 carrier 新建 App-wide wrapper/factory 或第二 bridge protocol。
- 用共享 `node_modules`、直接访问另一个 GUI 的 private store 或 PATH-only executable
  resolution 冒充多 GUI 一致性。
- 把本机启动 candidate、side-by-side bundle 或 session resume smoke 当成 active-shell
  adoption、同 Runtime cohort 或并发写安全。
- 在 Shell 中建立第二套 thread store、global agent registry、跨线程 permission policy，或把
  `send_input` 扩大为任意历史 thread 的消息总线。
- 把 Home 做成 dashboard、launcher、activity grid 或三列 scientific workbench。
- 宽桌面隐藏 project rail，却把该实现现状写成理想目标。
- 默认打开右侧 inspector，或在窄屏只切换按钮状态而不显示 panel。
- Card inside card、双层 composer surface、随机 radius、混合语言和技术 id first。
- 用 docs、contract-only、focused test 或 source screenshot 宣称 packaged/release-ready。

## 最小验收

实现验收证明三个边界：App contract/profile 被当前 consumer 正确读取；state/action/thread
仍由唯一 owner 提供；用户路径在成功、失败与恢复状态下可实际执行。新建 source adapter
只在现有 primitive 无法表达当前合同且有真实 caller 时成立。

运行本次受影响的 focused checks 和 adapter 要求的 App gate；视觉改动追加对应 scene
evidence，安装或发布任务另取 exact package/runtime readback。按
[Shell conformance](shell-conformance-matrix.md) 逐轴报告，缺失证据保持未验证。
具体用户行为只维护在 [交互细则](ideal-interaction-spec.md)，不在实现指南复制一份验收清单。
