# Runtime 动态 Agent 任务中心

Owner: `one-person-lab-app`
Purpose: `dynamic_agent_task_and_typed_view_runtime`
State: `active_product_reference`
Product classification: `core_dynamic_agent_runtime`
Machine boundary: 本文定义 Runtime 产品行为。当前机器合同归
`contracts/app-gui-product-contract.json#pages.runtime_status.runtime_cockpit_product_contract`、
`contracts/app-runtime-bridge.json#work_item_projection`、
`contracts/app-page-state-matrix.json#pages[id=runtime]`、validators、source 与 tests，
当前合同要求核心 Runtime 路由及动态 Agent scope；实现与安装证据须分别核对。本文不拥有
Framework runtime、Temporal execution truth、domain truth、artifact authority 或 release evidence。

## 结论

Runtime 是核心 App 能力：统一查看所有已安装 Agent Package 暴露的业务任务，
同时展示 Temporal 提供的真实执行状态，并允许 Agent 通过 typed view 提供领域视图。
它不是 observability dashboard 或平台运维控制台。

```text
Agent Package -> business task inventory/lifecycle
Temporal      -> queued/running/attempt/heartbeat/retry/terminal
Framework     -> validate + join + generic projection
App/Shell     -> information hierarchy + generic renderer + view_kind renderer
```

OPL 标准智能体只是 `kind=agent` 的 Package。Runtime scope 动态来自 installed Agent
task providers，不维护五个、一组或任何固定 Agent ID。新 Agent 不修改 App 即可出现。
一个 Agent producer、required capability 或 Temporal binding 失败，只降级该 Agent。

Codex/App 更新、Temporal/provider/platform repair、托管依赖与 raw diagnostics 归 Maintenance；
Agent Package lifecycle 归 Agents；Skills/Plugins/Flow 和本机能力归 Capabilities；artifact
provenance 归任务/会话 Inspector；同 cohort 完整证据归 release tooling。
这些内容一律不进入 Runtime。

Runtime 不直接拼接 Package、项目、Temporal 或领域文件。Framework 先生产稳定的
通用 task projection；App 定义用户语言、字段位置和验收；Shell 只渲染。

项目名严格取 canonical `workspace_path` 的 basename；Framework 投出语言无关的 action
semantic fields，Shell 按当前 App locale 渲染；手工归档是独立 visibility 轴，并进入独立
归档库。以上均是 App 产品 truth，不由 binding label、runtime history、Shell 本地状态或
Framework raw 文案覆盖。

当前 `WorkItemProjection v2` 是受支持的通用任务投影，Agent membership 从 installed
directory 动态生成。`validate:runtime-route` 是专项验证入口，不表示产品路由可选。
旧 X0-01 分类和固定 Agent scope 已退出当前机器合同。

## 问题背景

旧页面把五类事实放进同一条 runtime task：

1. 智能体及 package 是否可用。
2. 项目是否存在、目录和显示名是什么。
3. 项目内有哪些论文或工作项。
4. 当前是否有执行、stage、attempt 和 heartbeat。
5. Token 是否被真实观测。

这些事实的生命周期不同。用 active binding 或最近 attempt 代替项目与工作项库存，会造成
项目串名、历史论文消失、旧失败覆盖已交付状态、智能体被伪装成论文任务和 Token missing
显示为零。V2 的目标是消除这种结构性耦合，而不是为每个症状增加展示兜底。

## 用户默认判断

默认页必须在一次扫视中回答五个问题：

1. 当前范围是全部智能体，还是某个智能体下的某个项目？
2. 每个项目真实有哪些论文或工作项？
3. 每项工作是在自动推进、等待我、系统处理中、已交付暂停、暂停、停止，还是状态待同步？
4. 当前 stage、下一 stage 或行动是什么，归谁处理？
5. 最近是否真的运行过，已用多久，当前 Stage 与任务累计 Token 是否有可靠记录？

raw ID、workflow、receipt、provider、日志和 refs 不参与默认判断。唯一例外是当前 Attempt ID：
它只在用户点击 Stage 后的弹层和所选任务详情中出现，不污染默认任务行。

## 页面状态与失败投影

`ui_experience_contract.runtime_failure` 与 page-state matrix 共同约束 Runtime。页面任一时刻只能
处于 `loading / ready / empty / error / unavailable` 之一；加载、空态、错误和不可用态不得叠加，
尤其禁止并列显示“刷新失败”和“状态不可用”。

错误首屏只回答发生了什么和下一步是什么：

- 使用当前 locale 的用户语言摘要，不显示 transport、contract payload 或原始异常；已知合同不匹配
  可摘要为“能力目录暂时不可用”。
- 始终提供“重试”和“打开维护”两个明确动作；后者进入 Maintenance owner surface，不在 Runtime
  复制诊断或修复控件。
- “技术详情”默认收起；展开后只显示脱敏原始错误与诊断 refs，并提供复制诊断信息动作。
- 绝对路径、Node warning 和原始 JSON 默认不可见；在 375 px 与 400 px 下，用户文案和无断点
  技术 token 均须在容器内换行，不得横向裁切。

这是用户态错误隔离，不改变 producer 合同。Shell 仍须修复真实 contract/transport 阻断，不得
用友好文案把权威 projection 不兼容解释为已恢复。

## 产品数据模型

### Task Ownership

下表说明 task 各语义维度的 owner，并非另一套 wire schema；当前字段 shape 见下节 WorkItemProjection v2：

| 对象 | Owner 与职责 |
| --- | --- |
| `identity` | Agent owns Package/task/project identity and user label. |
| `business` | Agent owns business lifecycle, progress summary, next action, and user-facing reason. |
| `execution` | Temporal owns queued/running/attempt/heartbeat/retry/terminal facts; Framework joins by opaque ref. |
| `visibility` | Framework exposes user archive/restore state without changing business or execution state. |
| `telemetry` | Owner-observed elapsed/token/cost facts; missing remains unknown, never zero. |
| `views[]` | Agent-owned `{view_id, view_kind, title, availability, read_action}` descriptors. |
| `freshness` | Framework observation time and fresh/stale/unknown. |

业务状态与执行状态不得互相推导：Temporal `running` 不等于科研工作“自动推进”，
Temporal `terminal` 也不等于论文“已交付”；Agent business status 不得伪造 Temporal
heartbeat。Framework 只 join、validate 和公开 unknown。

### Typed Views

Agent 可以提供一个或多个 typed view。App 的扩展点只有通用 descriptor 与可选的
`view_kind` rich renderer：

- MAS 可以提供 `research-roadmap`，但 MAS 拥有 schema、科研语义、医学文案与演进。
- App/Framework 不复制 MAS node/edge/stage/evidence schema，也不按 `mas` 分支。
- 每个合法 descriptor 至少可由 generic metadata/fallback renderer 发现和打开；
  新 Package、task 或 view descriptor 不要求修改 App source。
- 已知 rich `view_kind` 可通过独立 App/Shell extension 注册专用 renderer；这是可选
  表现增强，不改变 Package 安装、task发现或 Runtime readiness。
- 未注册、invalid、stale 或 read error 只让该 view 使用 generic unavailable；
  task row、selected-item core detail、其他 views 和其他 Agents 保持可用。

### Current WorkItemProjection v2

以下对象解释当前通用投影；精确字段和可选性由 runtime bridge contract 持有。
不得在通用投影中添加 Package 特例或 App-owned 领域 schema。

每个 canonical work item 顶层必须有全局 canonical `item_id`，并投出以下九个一级对象：

| 对象 | 职责 |
| --- | --- |
| `identity` | 智能体、项目和工作项的 ID、全称、显示名与 workspace path。项目身份只来自 canonical registry/inventory；并发 generation 只属于 visibility。 |
| `lifecycle` | 业务生命周期，以及 Framework 投出的用户主状态和原因。 |
| `visibility` | 独立的 `visible / archived` 可见性、来源、更新时间、control ref 和作为并发 token 的 generation。 |
| `execution` | 是否运行、当前/下一 stage、开始时间和 heartbeat；没有执行历史也必须保留对象和任务行。 |
| `attention` | `none/user/system`、摘要、owner；`system` 还必须有完整 responsibility envelope。 |
| `telemetry` | elapsed、当前 stage Token、任务累计 Token，以及 observed/partial/missing/stale。 |
| `conditions` | 带 reason、message、owner、transition time 和 observed generation 的当前条件。 |
| `freshness` | 投影读取时间、最近进展和 fresh/stale/unknown。 |
| `action` | 下一行动、owner 和说明的只读语义；Runtime 不执行该 action，归档/恢复使用独立 visibility mutation。 |

顶层 `item_id` 由 Framework 以 `project_id + encoded work_item_id` 形成，是列表 row key 和
详情选择 key。`identity.work_item_id` 只在项目内唯一，不同 MAS workspace 可以重复使用同一
local ID。因此 Shell 不得用 `identity.work_item_id` 单独去重、选择详情或匹配 mutation
readback。

`attempt`、runtime ID、workflow ID 和 evidence refs 不再是默认行必需字段。当前 Attempt 可在
Stage 弹层或详情中按需显示；历史 Attempt 和其他 raw ID 只属于 Maintenance diagnostics。任何 Attempt
都不能决定 work item 是否存在、属于哪个项目或用户主状态。

### Dynamic Agent Availability

当前 scope 从 installed Package descriptors 中动态发现
`kind=agent && task_provider=true`；Package availability 在 Settings > Agents 显示，
Runtime 只显示可读取或局部 unavailable 的 producer/task 状态。

MAS Scholar Skills 是 MAS 的 required capability Package，不是第二个 Agent。该关系只由
MAS descriptor 的 presence edge 表达，App 不认识两者的特殊关系。

## Scope 与 Saved Views

Target scope 保持两个级联层，但选项动态生成：

1. **Agent**：全部已发现 task providers 或某个 Agent descriptor 显示名。
2. **Project**：该智能体 canonical Project Registry 中的真实项目；首项为全部项目。

论文或 work item 不进入 scope。它们只作为主列表行出现。workspace path 是 Project 名称和
当前 `project_id` 的 canonical 输入，但不再作为与 project 并列的用户范围层。

Runtime Project 的用户显示名必须严格等于 canonical `workspace_path` basename，例如
`DM-CVD-Mortality-Risk`、`NF-PitNET`、`Obesity`。binding label、口头名称和 runtime history
都不能覆盖它。当前 Framework 的 `project_id` 来自 canonical workspace path hash，所以目录
改名会同时改变 `project_display_name` 和 `project_id`；App 不声称 identity 在改名后保持稳定。

状态筛选使用单一 Select：全部、自动推进中、等待你决定、系统处理中、已交付或暂停、已停止、
状态待同步。筛选禁止出现 MAS、其他智能体、项目或论文入口，避免与 scope 形成第二套导航。
visibility 也不进入状态筛选；归档库是独立入口，不是一个“已归档”状态筛选。

## 用户主状态

Framework 根据 lifecycle、execution、attention、conditions 和 freshness 投出唯一主状态；
Shell 不得从原始字段重新推断。`WorkItemBusinessState` 仍可包含 domain/legacy `archived`；这不
等于手工归档，也不能据此把业务状态集合收窄或把 visibility 反推为 lifecycle。

| machine value | 用户文案 | 含义 |
| --- | --- | --- |
| `automatically_advancing` | 自动推进中 | 当前有可信运行证据，系统正在推进。 |
| `awaiting_user_decision` | 等待你决定 | 下一步需要用户提供决定或信息。 |
| `system_attention` | 系统处理中 | 当前系统问题阻塞继续推进，并有完整责任与修复说明。 |
| `delivered_auto_paused` | 已交付自动暂停 | 已交付约定里程碑，自动流程正常停住。 |
| `paused` | 已暂停 | 已停止自动推进，等待后续条件或方向。 |
| `stopped` | 已停止 | 已明确结束、放弃或归档前停止。 |
| `sync_pending` | 状态待同步 | 当前状态不能被可靠确认，不能用旧执行历史猜测。 |

### 系统处理中

`system_attention` 只有在以下条件全部满足时才允许：

- 问题绑定当前 work item generation。
- 问题当前仍阻塞继续执行。
- `responsible_component`、`issue`、`repair_action`、`impact`、`expected_outcome` 完整。
- 默认文案能够说明谁在处理、处理什么以及对交付的影响。

责任信息不完整时，保留 lifecycle 推出的主状态，并把技术诊断后置；不得显示笼统的
“需要系统处理”。历史失败 condition 只进入时间线，不能覆盖更新的已交付、暂停或停止状态。

## Action 与本地化

Framework action 的语言无关字段为 `title_key`、`summary_key`、单一 `message_args`、`owner`
和 `owner_kind`。`owner_kind` 只允许 `user / system / agent / other`；title 与 summary 共用同一个
参数对象，不声明分离参数、copy-locale metadata 或额外 semantic key namespace。

Shell 使用当前 App locale 解析 title、summary、Next Step 与 owner；Framework 仍负责状态和
action 语义，Shell 不得借本地化重新推断状态。raw `title / summary` 仅为兼容 fallback，不能
覆盖 semantic key 的当前 locale 结果。英文界面不得出现 Framework 硬编码中文 action、Next
Step 或 owner 文案，中文界面同理。

Stage 名称继续由 Agent package 持有。Framework 在 `stage_map[].display_names` 中传输各 locale
名称，Shell 按当前 App locale 选择；`stage_map[].display_name` 只作旧 projection 的兼容回退。
App 不维护 MAS 或其他智能体的 Stage 名称对照表，也不根据 Stage id 猜测翻译。

## 默认页面

### 顶部

- 标题与一句职责说明。
- Agent、Project 两级 scope。
- 最近读取时间和刷新动作。
- 一个状态筛选菜单和归档库入口；不使用统计卡片墙，不重复 scope 中的智能体或项目。

### 工作项列表

宽屏固定四列：

1. **项目 / 论文**：项目与工作项标题；智能体全称作为次级标签。
2. **状态**：唯一用户主状态和短原因。
3. **当前进展 / 下一步**：当前 stage、下一 stage 或 action、owner。
4. **时间 / Token**：elapsed、当前 stage Token、任务累计 Token。

一篇论文或一个 work item 只显示一行，row key 为顶层 `item_id`。去重由 Framework
canonical projection 完成，Shell 不按标题、stage、binding 或最近时间启发式合并。

当前 Stage 是独立可点击控件。点击后打开轻量 Popover，显示完整 Stage 顺序、当前/下一 Stage
和当前 Attempt；此点击不得同时打开任务详情 Drawer。默认任务行不显示 Attempt ID，点击任务名称
才打开完整详情。

当前业务 stage 只读取 canonical `current_stage` 投影。`execution.stage_id` 属于运行尝试诊断，
不得在业务 stage 为空时回退展示；例如已交付暂停的论文不能把
`runtime_token_telemetry_verification` 显示成当前论文阶段。历史运行仍可贡献经过观测的任务累计
Token，但不能改写业务阶段或 lifecycle 状态。

当 `lifecycle.primary_state=delivered_auto_paused` 或
`lifecycle.package_status=milestone_delivered` 时，Stage Map 已进入 terminal boundary：详情只显示
真实发生过的 `completed` 历程，也可以为空。`pending / next / current / failed / stopped` 等状态
不得再作为未交付里程碑包展示；后续动作统一由 ActionEnvelope 表达。

在 375、768、1024 和 1440 px 验收视口中，页面不得横向溢出或文字重叠。窄屏按语义重排
为堆叠行，不把四列硬塞入固定最小宽度表格。

用户可见普通文本按 normal word boundary 换行，不得在存在空格断点时随意拆词。只有路径、
ID、hash 等无断点技术长串可在必要时断开，且四个验收视口仍不得横向溢出。

响应式证据使用确定性的九论文静态 fixture：1440 px 为四列，1024/768 px 为两列，375 px
为单列。每个视口必须同时断言 scope 级联、一论文一行、语义列重排和无页面横向溢出，
并输出截图；四个视口还必须分别打开 Stage Popover，证明其不溢出、Stage 顺序完整并能显示当前
Attempt。详情 drawer 另存截图，证明只呈现 Work Item、Stage/Attempt、运行/heartbeat、Token 和
只读下一步信息。静态 fixture 证据属于 Shell consumer 验收，不等于 live runtime 证据。

Fast profile 即使携带诊断计数或空的 `diagnostics.items`，Runtime 也不得据此生成 operator summary、
safe actions 或平台维护区。Shell 必须保留 `project_catalog` 和 `items`，不得因为诊断详情未内嵌
而隐藏项目或工作项。平台诊断由 Settings 显式读取和呈现。

### Visibility 与归档库

默认 Runtime 主列表只显示 `visibility.state=visible`。独立的 `Archived tasks / 归档库` 入口
显示 archived 项，并继续沿用 Agent -> Project scope；visibility 不混入主列表 status filters。
归档项保留原 lifecycle status、stage、usage 与 Framework evidence，恢复后回到默认主列表；
Runtime 不因此展示 evidence refs。

手工归档只改变 visibility，不改变业务生命周期、不停止任务，也不删除 evidence。归档确认
必须明确提示“工作可能继续运行；停止任务需前往该任务的所属控制面”。Runtime 不提供 stop 或
其他 safe-action 控件；执行中的工作也不能因归档而被描述为 stopped、paused 或 delivered。

Framework visibility 对象精确包含 `state`、`source`、`updated_at`、`control_ref`、`generation`；
`generation` 就是并发 token，没有独立 `token` 字段。Shell 禁止以 localStorage 或 optimistic
state 作为 visibility truth。

归档与恢复统一执行 Framework action `work_item_visibility_set`：

1. payload 必须包含 `agent_id`、`project_id`、`work_item_id`、`visibility_state`。
2. `reason`、`expected_generation` 可选；projection 有 `visibility.generation` 时 Shell 必须将其
   作为 `expected_generation` 发送。
3. mutation 成功后立即读取 `opl app state --profile fast --json`。
4. readback 必须按 `agent_id + project_id + work_item_id` 完整 tuple 定位，并核对顶层 `item_id`、
   新 visibility 及原 lifecycle、execution、telemetry；不得只按 local `work_item_id` 匹配。
5. `work_item_control_generation_conflict` 表示 stale generation。Shell 必须先刷新权威 projection，
   再提示用户重试，禁止自动覆盖较新的控制状态。

page-state matrix 必须覆盖主列表空态、归档库空态、归档中、恢复中、归档失败、恢复失败、
stale generation conflict，以及 `en-US / zh-CN` 切换。pending 或失败状态都保留最近一次
Framework readback，不能提前把本地 optimistic 结果提交为真相。

### Token

默认显示当前 stage 与任务累计两项。每项 Token 是判别联合：

- `observed`：包含 input、output、total、source 和 observed time；只有此状态可显示数字。
- `missing`：显示“尚无用量记录”；技术原因只进入 Maintenance diagnostics。
- `stale`：显示记录已过期，不把旧数字冒充当前。

整体 telemetry 可以是 `observed / partial / missing / stale`。Missing 不能显示为 `0`；只有明确
观测到零才显示零。当前没有 Token 上限，因此不显示预算、百分比或进度条。

## 工作项详情

点击由顶层 `item_id` 标识的工作项后，首屏按工作流判断顺序展示：

1. Stage Map。
2. 当前和下一 stage。
3. 运行时长与最近 heartbeat。
4. 当前 stage 与任务累计 Token。
5. 当前行动和 owner 的只读说明。

当前 Attempt 属于 Stage/运行事实，可显示在详情首屏。Runtime 详情不包含 Artifacts、Timeline、
Evidence、provider diagnostics、operator drilldown、safe-action catalog、raw workflow IDs、历史
Attempt 或 logs。artifact provenance 通过任务/会话 Inspector 查看；技术诊断通过 Settings
Maintenance diagnostics 查看。

## Surface 所有权

| Surface | 拥有 | Runtime 中的处理 |
| --- | --- | --- |
| Runtime | Agent business task status、Temporal execution status、elapsed、owner progress/next action、typed views、archive/restore | 直接显示 owner projection |
| Settings Maintenance | provider/platform repair、Temporal/worker readiness、Codex/App update、托管依赖、raw diagnostics 与维护 | 全面禁止 |
| Settings Agents | Agent Package lifecycle、开发来源与 Home visibility | 全面禁止 |
| Settings Capabilities | Skills、Plugins、OPL Flow、MCP、图像与语音能力 | 全面禁止 |
| Task/Conversation Inspector | artifact provenance、preview、lineage、manifest/hash/receipt refs | 全面禁止 |
| Release tooling | 同 cohort Runtime screenshot、full-state/operator capture、action receipt、VM/installed smoke、remote verification 与 manifest | 全面禁止 |

## 模块边界

| 模块 | 负责 | 不负责 |
| --- | --- | --- |
| Agent Package | Project/task inventory、业务 lifecycle、progress/next action、领域 action refs、typed view schema/data。 | App copy/layout、Temporal execution truth、其他 Agent 状态。 |
| Temporal | Workflow/activity queued/running/attempt/heartbeat/retry/terminal execution。 | 业务 progress、领域 stage、Package 安装状态。 |
| OPL Framework | 动态发现 Agent producers，join business/Temporal/visibility/usage，校验通用 task/view envelope。 | 固定 Agent 清单、领域 view schema、App 信息层级。 |
| One Person Lab App | 产品语言、通用 task/view envelope、generic fallback、可选 `view_kind` rich renderer registry、page-state 和证据分账。 | runtime/domain truth、MAS schema、Token 估算、owner receipt。 |
| Shell | 按当前 locale 渲染 projection、级联筛选、语义重排、打开 task/typed view，并对允许动作执行 refresh/readback。 | 猜项目、状态、stage、owner、Token，以 localStorage 保存 truth，实现第二套去重，或按 Agent id 分支。 |

## 验证与历史证据

专项检查入口是 `npm run test:runtime-route`。合同、Framework producer、Shell consumer、
像素、安装和发布分别证明各自边界；当前状态只汇总到
[shell conformance matrix](shell-conformance-matrix.md)。验证应覆盖上文定义的动态发现、
业务/执行隔离、身份、归档并发、局部 view 降级、本地化与响应式行为，不复制第二份验收清单。

[2026-07-15 安装收据](../../delivery/release-evidence/runtime-local-installed-acceptance-2026-07-15.json)
只证明其历史 cohort 的本机路径，不能证明当前动态 scope、typed views、跨机器或公开发布。
