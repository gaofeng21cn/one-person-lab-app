# OPL App GUI 设计体系

Owner: `one-person-lab-app`
Purpose: `app_gui_human_readable_design_system_index`
State: `active`
Machine boundary: 本目录是人读产品设计与实现指引。GUI machine truth 仍归
`contracts/app-gui-product-contract.json`、
`contracts/app-gui-visual-source-cohort.json`、
`contracts/app-product-profile.json`、
`contracts/app-page-state-matrix.json`、
`contracts/app-remote-companion.json`、adapter contracts、validators、shell source/tests
和 release/user-path evidence；本文不创建第二套 authority。

## 结论

### 一个 App 产品、两个可替换 Shell

OPL App 不是两个 GUI 产品，而是一个产品 authority 配两个可替换实现：

```text
OPL Base
  `-- OPL Framework Host：在 runtime、Package graph 与 App projection scope 内唯一
OPL Packages
  `-- 提交 runtime capabilities 与 App-schema-admitted declarative GUI descriptors
                |
                v
OPL Framework Host 校验并投影 allowlisted state/action/RPC/events + GUI graph
                |
                v
one-person-lab-app
  App 产品 SSOT、Client profile、GUI ABI、发布 authority
                |
                +-- opl-aion-shell   当前 Stable Shell，AionUI 薄适配
                `-- opl-studio       独立 DSH Application Host，同时是下一代候选 Shell carrier

OPL Cloud 通过同一 App/Framework ABI 提供在线产品 projection，
但保留独立服务与数据 authority。
```

历史品牌名在这里按跨 Framework、App、Cloud 与 domain owner 的动态 capability domains
读取，不构成固定数量的品牌、Package、源码目录、Cordis plugin 或 release artifact 清单。App 只持有唯一
product/profile/GUI ABI/active-shell/release authority，不接管各 capability domain 的业务真相。

`active_shell = aionui` 只由 [`contracts/app-shell-adapter.json`](../../../contracts/app-shell-adapter.json)
决定；Studio 的候选身份由 [`contracts/app-shell-candidates.json`](../../../contracts/app-shell-candidates.json)
管理。Studio 完成源码、功能或候选验证，不会自动改变 active shell、发布渠道或 release
readiness。

两种 Shell 必须统一产品状态语义、typed RPC reads/events、canonical App actions、
`opl app state/action` 与 runtime bridge、Client Cordis 组合协议、GUI contribution ABI、
设计/可访问性语义，以及 contract/功能/GUI/安装/安全/更新/release 证据类别。它们不需要统一 React 组件树、CSS、Electron/Node carrier、
AionCore/Codex 适配、上游同步策略、缓存或 Git 分支。

一次 App 发布冻结一组可回读的组合输入：

```text
App product version
  + Framework compatibility
  + selected Shell identity/version
  + GUI ABI version
  + Client composition snapshot
  + contribution versions
```

GUI 的技术形态是 Host/Client 双运行面，而不是 Framework Node 直接渲染 React：

```text
读取 App-owned boot/profile
  -> 创建 Client Cordis
    -> 装载 Host projection 中的 GUI contributions
      -> 投影到 typed slots/routes/actions
```

AionUI 可以通过薄 bridge 实现这条协议；Studio 在自己的 DSH Application Host 内原生采用
Client Cordis。两个 Shell 都只能执行 Framework Host projection 与 App allowlist/profile
派生的 client graph。Studio 的 server-side Host 只负责 DSH profile/plugin lifecycle、原生
Codex child 和 delivery transport，不得成为第二套 Framework runtime/Package Host；任一 Shell
都不能自行发现或安装 OPL Package，维护 Package registry/currentness，获得 release-operation，
或拥有 task、Package、product、domain、release truth。

“可替换”由 [`contracts/app-product-profile.json#client_renderer_compatibility`](../../../contracts/app-product-profile.json)
和各 adapter 的 `client_renderer_admission` 共同证明。所有 App wrapper 在启动 Shell 命令前校验
同一 Host graph source、App allowlist、typed slots/actions、标准 view types、state/action RPC、
Client event、transport-binding projection/event、state semantics 与动态品牌能力投影；选择失败时
不启动目标进程。该机制是显式 adapter 选择后的重新
准入，不承诺未验证热切换，也不把 Studio candidate 提升为 active/release-ready。

Host projection 是 App schema 约束的 closed allowlisted graph：Package 只提交 schema
允许的 declarative view/command/badge 与 product-profile typed slots，再由 Framework Host
投影。GUI action 只能携带 `action_ref`，并经 canonical App action bridge 执行；组件代码、
HTML、路径、URL、handler 或任意插件对象不得进入 Client graph。AionUI 与 Studio 必须实现
同一规则，而不是各自维护 allowlist。Framework Host producer 与
`app_state.ui_contributions` projection 已 canonical；每个 Shell 的 Client runtime
conformance 仍必须由其真实 source/tests 单独证明，App contract 本身不能代替该证据。

OPL App GUI 使用三层设计体系：

1. **功能层**回答“产品必须具备什么能力”。
2. **理想交互与视觉层**回答“用户应怎样完成工作、界面应怎样呈现”。
3. **具体 shell 实现层**回答“AionUI 或候选 shell 当前怎样承接，以及差距在哪里”。

三层必须分开维护。功能或理想目标不能从某个 shell 的现状反推；shell 实现文档也
不能把局部代码、截图或 focused test 提升成 App product truth。

默认 Computer Use 的产品策略、Standard/Full parity、TCC 状态、浏览器 provider
路线和落地总账统一维护在 [`computer-use.md`](computer-use.md)。AionUI 只渲染
Framework 的 managed companion projection，不自行安装 provider 或复制 MCP 清单。

当前 AionUI 主线的执行顺序、非降级边界、current-main disposition 与收口条件由
[`../../active/aionui-mainline-gui-convergence-plan.md`](../../active/aionui-mainline-gui-convergence-plan.md)
维护。该 active plan 只组织实施，不拥有三层产品定义，也不能把计划状态提升为 source、
pixel 或 release 完成。

Package、Capability、Home 与 Runtime 的新目标由
[`../../active/opl-package-platform-composition-migration.md`](../../active/opl-package-platform-composition-migration.md)
统一定义：Package 是安装单元；Skill/Tool/Plugin/MCP/Agent producer/typed view
动态发现并只做 presence/callability 检查；一个 Official Profile 服务 Standard 与
Full；Runtime 是目标核心动态 Agent 任务面。当前采用 Codex-first 实现以降低成本，
但 Package identity、偏好、Work Item、Temporal refs 与 typed views 保持 OPL-owned、
carrier/executor-neutral。Framework canonical source/package contract 与 caller readback
可以证明 workspace topology 已落地；它不证明 Package 已独立发布。只有 Package owner
对 immutable version、digest、channel 与公开 artifact 的真实 release readback，才允许把
对应状态写成 independent publication complete。App/Shell 不从目录、manifest、测试或
候选 ref 推断发布完成或 currentness。

GUI 运行采用双轴模型：AionUI 继续是 `active release shell`，`opl-studio` 则是
App-owned successor 的 internal repo/candidate id，并可作为本机 `local GUI launch target`。
启动或开发 Studio 不等于 release adoption，也不修改当前 release/updater authority。
共享逻辑基座、独立 GUI 状态、统一 launcher 目标和
当前 Runtime/session 偏差统一见
[`gui-shell-candidates.md`](gui-shell-candidates.md)，不在本入口复制命令或状态矩阵。
Codex executable 也遵循该 shell-adapter 边界：当前 AionUI 仍从 bundled AionCore
完整 managed-resources manifest 解析 Codex；目标由 Shell 将该完整导出当作 staging，
生成只含 Node + Codex 的 OPL projection，Standard/Full 最终包物理排除 Claude。App bundle
不再携带 Framework managed Codex payload；Framework headless carrier 继续留在 App bundle
之外。未来 successor adoption 通过同一 `OPL_CODEX_BIN` 和 Codex App Server 接口选择自己的
或 exact external binary，不继承 AionCore 依赖。迁移状态与门禁见
[`../../architecture/aioncore-codex-only-carrier.md`](../../architecture/aioncore-codex-only-carrier.md)。

DeepSeek Harness 的 GUI 与“一切皆插件”理念已作为外部学习落点记录在
[`deepseek-harness-composition-plan.md`](deepseek-harness-composition-plan.md)。`opl-studio` 仍是唯一
允许复用完整 DSH slot/renderer host 的 foreground route；AionUI 只通过 `OplVisualProvider` 与
`OplIcon` 消费固定 cohort 中的 icon、theme token 和 visual primitive geometry，不引入 DSH
runtime、session、router、provider、connection、完整 renderer 或 Client Cordis。App contract、
Framework projection/action ABI、Codex thread authority、现有 AionUI handlers/Arco control semantics
和 Package owner 边界不变。两种 Shell 都消费同一个 App Client Contribution ABI、App product
profile 和 slot policy；禁止独立 Host truth、第二 Package registry/currentness/action authority
或第二 plugin manager。

Successor 的交付拓扑由 `app-product-profile.json#delivery_topology` 单点定义：一套 DSH-derived
React renderer 和 shared Node host core，Electron 薄壳承载 macOS/Windows/Linux，HTTP/SSE
adapter 承载 standalone headless WebUI 与 Docker WebUI。三类 carrier 使用同一 bridge ABI；
headless/Docker 不运行 Electron。旧 `--headless` 仍保持 Base-only，Windows 的 Node/Codex
进程位置也不在产品合同中预设为 native 或 WSL。目标拓扑不改变 AionUI 当前发布主线，也不
构成任一 successor carrier 的平台准入或 release evidence。

产品方向固定为：**保留 ChatGPT Codex 的历史主工作流与空间关系参考，以 pinned DeepSeek
Harness visual cohort 承担普通视觉实现，再增加 OPL 专业能力**。Rail、单列 conversation、
底部 composer 和按需环境详情构成基础壳；
OPL capabilities、progress、evidence refs、artifacts 与 safe actions 必须
嵌入这些稳定位置，不得把 Home 改造成 dashboard、launcher 或 card wall。

该原则描述用户工作流，不把 Codex 观察提升为视觉源码或 pixel authority。OPL Studio 的完整
视觉与排版基底直接来自 pinned DeepSeek Harness GUI source；AionUI 在自身 upstream 薄适配内
只复用同一固定 cohort 的最小视觉闭包。两者都实现同一 App-owned 用户结果和 OPL contribution
ABI，正式像素回归继续只认 App-owned 16-scene baseline。

Studio 的完整性由 `app-product-profile.json#delivery_topology.minimum_complete_product`
定义：保留对话/线程、运行状态与 Agent 贡献的假设和路线图、按需文件与结果、动态 Agent/
Capability 管理、App/Base/Packages 分权更新、服务维护和必要设置闭环。AionUI 只是需求证据，
不是 feature inventory authority；AionCore、多 backend、自定义 Assistant 和 Team 不因上游存在
而进入 Studio。功能来源使用独立的 `B0 / R1 / U1 / X0` 轴：B0 是 Codex 必要 baseline，R1 是等价
替换，U1 是 OPL 定位必须增加，X0 是条件保留/当前非目标；`P0/P1/P2` 继续只表示优先级。
AionUI 与 successor 是同一 `B0 + R1 + U1` 产品定义的两种 carrier。两张必要功能 List 和
“为什么必要”见 [`feature-inventory.md#功能来源分类`](feature-inventory.md#功能来源分类)，
双 carrier 当前实现证据见
[`shell-conformance-matrix.md#r1--u1-必要功能实现矩阵`](shell-conformance-matrix.md#r1--u1-必要功能实现矩阵)。

手机远程访问采用原生 iOS 产品 **OPL Link**，App Store 与主屏名称相同，应用内母品牌为
**One Person Lab**；`remote_companion` 只作为内部 surface ID。目标 transport 是 Ably Free，
控制面是 Cloudflare Workers Free + D1 Free；实施前必须先验证 Ably、Worker endpoint 和 APNs 的
大陆三网可达性。只有探针失败后才允许显式切一个腾讯 IM cohort，不双写、不自动 fallback。
`opl-link/service` 通过 Worker/D1 拥有邀请、pair admission、短期 scoped JWT、设备授权、revoke
和 push registration；用户不需要公网 IP、端口转发、VPN、Tailscale、Cloudflare Tunnel 或本机
常驻公网 Service。OPL Cloud 只是可选 Workspace/WebUI host，不是 OPL Link 的运行或发布依赖。
iOS 不运行 OPL/Codex runtime、不保存第二份对话历史，也不拥有模型、权限、Package 或 cloud
workspace authority。

桌面 WebUI 仍是完整工作台 carrier，但不是 iOS 产品或自动 fallback；旧 LAN QR 登录、
`http://host:port` / `ws://host:port` 不能被提升为公网远程路径。桌面 Shell 持有配对设置与 canonical
App action consumer，iOS 只允许合同列出的对话读取、文本发送、停止、低/中影响审批和撤销。
桌面 Settings 通过 App-owned `remote_companion_access` 标准 view 投影配对和设备状态；Weixin/AionCore
继续使用独立的 `channel_access` view。具体产品 scope、E2EE、owner 与实现缺口见 [`../opl-link.md`](../opl-link.md)。当前 Tencent
adapters、Go/SQLite Service 与 TestFlight build 是 legacy source/carrier evidence，不证明 Ably、
Workers/D1、真实 pair、APNs、三网或 release qualification 完成。

频道到 canonical Codex conversation 的目标绑定来自 `app_state.transport_bindings`，按 exact App Server host
和 thread id join，且始终保持 `projectless`，不会由 cwd 建立 Project affinity。Framework
`app_state.transport_bindings` projection 与 AionUI/Studio 的源码消费链已经完成；AionUI 的 workspace
inference 与 SQLite writeback caller 在当前 canonical source readback 中已不存在，Studio 从未复制该
fallback。两端都不允许从 workspace/title
推断或写入新 binding；AionUI 只对已有的 exact `canonical_thread_id` 保留只读兼容，并在 Framework
binding 冲突时以当前 Framework projection 为准。Projection unavailable 时保留 transport row 可见，
不伪造 binding，也不阻断其他当前主线功能。这项 source currentness 不改变 AionUI 的 active-mainline
身份，也不构成 AionUI retirement、carrier cutover 或 release adoption 批准。

视觉执行与验收以 [`codex-app-visual-parity.md`](codex-app-visual-parity.md) 为准：除 OPL
品牌与 OPL-owned 产品能力外，字体、颜色、图标、密度、阴影、圆角、布局和交互状态参考
观察时最新可验证的官方 ChatGPT Codex macOS。精确版本只写入该次观察 receipt，不成为
下载、安装、Pixel、Release 或 Stable 的外部依赖。正式像素回归独立绑定 OPL App 自有、
经人工批准的 16-scene baseline。

历史 `26.707.41301` 与 `26.707.72221` / build `5307` 仅保留为 provenance，不再是 active
machine baseline。
App machine authority 已升为 baseline schema v2；最低已验证 AionUI GUI conformance ancestor 是
`a0ce713b65801fd9ca7f46ad168c977c75a187de`，当前 Shell HEAD 必须从 active checkout Git
readback 获取，不复制成动态默认值。历史 exact-cohort evidence 由 marker
`0ebc1fdd278e8a79602458e15e28cf814dfd917d`、
[`evidence/aionui-41301/manifest.json`](evidence/aionui-41301/manifest.json) 与
[`evidence/aionui-41301-parity-20260714/manifest.json`](evidence/aionui-41301-parity-20260714/manifest.json)
绑定，不能通过替换 SHA 升级为当前 pixels，也不在当前入口复制 Shell topic SHA、package
或场景 closeout。它只证明相应
历史 cohort 的指定画面非空且布局检查通过，不证明当前 1:1 parity、source、pixels、安装或
release-ready。`26.707.31428` 与 `26.707.31123` 只作为 superseded observations 保留。

当前 GUI 与 Package compatibility 行为以 App contracts、active adapter、Shell source/tests 和
fresh readback 为准，不从旧 App/Shell SHA 或一次性交付流水推断。Home/new-session `+` palette
是同一 active capability 的备用选择入口，既有 conversation 仍禁止 Agent Package 重绑；
Settings -> Agents 管理 package lifecycle，Settings -> Capabilities 管理 Skills/Plugins/Flow，
App updater 与 Framework-owned managed lifecycle 分离。当前 Session-first Shell source cohort
不绑定临时 topic SHA；它由 `useConversationListSync.ts`、`GroupedHistory/index.tsx`、`GuidPage.tsx`、只读
`ConversationEnvironmentPopover.tsx` 及对应 DOM/source tests 定义，并要求 `WorkspaceHandoffControl.tsx`、
`ProjectContextSection.tsx` 与 `projectContext.ts` 缺席。Home/new-session composer 上方独立 context bar 承载初始 cwd；
Composer 的 `+` 始终打开可搜索、分组、可滚动 palette，承载文件、目录及 active adapter
真实发现的 installed Agent Package、Skill、Tool、Plugin、MCP、mode 与连接；App 不维护
capability allowlist，已选项只显示紧凑 chip。
Environment 只读显示 recorded workspace 与 live Git context；Shell 不自建 managed Worktree/Handoff，
也不允许已绑定 session 在 Project 之间任意重分组。Recorded cwd 是运行上下文，不等于用户显式 Project affinity；
`~/Documents/Codex/**` 与 `~/.codex/worktrees/<id>/**` managed scratch 保留真实 recorded cwd，但在侧栏投影为
projectless，不按叶子目录拆成 Project。显式 `projectId` 仍优先于 managed-scratch 路径分类。
命中 `~/.codex/worktrees/<id>/**` 的 Codex 对话行在标题右侧显示一个只读分支标志，并提供本地化
tooltip/无障碍名称“隔离工作树”；该标志不参与分组、affinity 或任何写入动作，显式 `projectId` 仍只决定 Project 归属。
侧栏目录分组优先采用显式 `projectId`；没有 `projectId` 时，canonical App Server thread 的非 managed-scratch
recorded cwd 自动生成只读目录组和“使用此工作目录新建对话”入口，不写回 `projectId`，也不修改注册目录集合。
空 cwd 与 managed scratch 仍保持未分组。turn 或 command `pwd` 不参与分组，也不反写 affinity。
当前 Shell 通过既有单一 App Server adapter 的 typed affinity IPC 分配一次显式 `projectId`，并以 assignment 与
`thread/read.projectId` exact readback、recorded cwd 不变作为提交门；成功后才提交 rebuildable local projection。
App Server 继续持有 canonical thread ID、history 和 recorded cwd authority；OPL 不增加第二 client 或私有 adoption service。
它不从 turn/command `pwd` 推断绑定、要求 Project 覆盖显式输入、修改 writable roots，或创建 pending/receipt/Handoff 层。
工作目录 picker 缺失或不可用时，projectless new task、输入、显式
send-scoped local inputs 与普通 Codex conversation 仍保持可用；只有 owner-projected action 的
`required_payload_fields` 明确要求 Workspace 或 managed target 时，才对该 Agent launch 做局部校验。
Activation 默认按 `ready / degraded / package_unavailable` 三态自修复、JIT、降级或 fallback；receipt、
binding、closure 不构成普遍硬门槛。Exact commit/currentness 只由 App owner
在 Shell main 吸收后回读。Review 保留 `Last turn`，custom instructions 只经
`review/start.target.custom`；公开协议缺少非 custom Review Focus input 时，正常路径在启动 Review 前
返回 `protocol_unavailable`，不得回退 `turn/steer`、伪造成功或产生副作用。当前仍无匹配
package/pixel/install 证据。

## 三层与文件归属

| 层级 | 核心问题 | 人读文件 | 不应包含 |
| --- | --- | --- | --- |
| 功能层 | OPL App 能做什么，用户可以完成哪些工作？ | [`feature-inventory.md`](feature-inventory.md) | Shell 实现历史、视觉 token、完成流水、截图结论。 |
| 理想交互与视觉层 | 功能如何组织成低摩擦工作流，视觉基准和元素位置是什么？ | [`ideal-interaction-spec.md`](ideal-interaction-spec.md)、[`visual-system.md`](visual-system.md)、[`codex-app-visual-parity.md`](codex-app-visual-parity.md)、[`codex-to-opl-app-delta.md`](codex-to-opl-app-delta.md)、[`element-audit.md`](element-audit.md) | carrier-specific 组件路径、fork 复制步骤、当前实现已完成声明。 |
| 具体 shell 实现层 | shell 如何消费 App truth，当前对齐、偏差和验证入口是什么？ | [`shell-implementation-guide.md`](shell-implementation-guide.md)、[`shell-conformance-matrix.md`](shell-conformance-matrix.md) | 新的产品规则、模型 allowlist、runtime/domain truth、release-ready 推断。 |

专题设计继续由现有 owner 文档承接：Settings 见
[`settings-control-center.md`](settings-control-center.md)，Runtime 见
[`runtime-overview-redesign.md`](runtime-overview-redesign.md)，GUI client 角色、启动选择与
adoption 边界见 [`gui-shell-candidates.md`](gui-shell-candidates.md)，候选 shell 的 staged
计划见对应 candidate plan；Codex Auto 模型策略见
[`codex-auto-model-policy.md`](codex-auto-model-policy.md)。专题文档不得反向覆盖三层
体系或 machine contracts。

## Authority 与优先级

发生冲突时按以下顺序处理：

1. **Machine truth：** contracts、generated profile、page-state matrix、adapter
   contract、validator 和实际 source/tests 决定机器接受什么。
2. **App-owned 产品目标：** 本目录的功能、理想交互和视觉文档解释产品为什么这样
   设计，并可明确记录尚未进入 machine truth 的目标差距。
3. **Shell read model：** conformance matrix 只汇总当前 carrier 对 machine truth
   与理想目标的承接情况，不拥有任何一方。
4. **外部参考：** ChatGPT Codex、AionUI upstream、K-Dense、Open Science、Stitch
   等只提供交互或实现材料，不能覆盖 OPL App authority。

若 machine contract 与理想目标暂时不同，不把其中一边伪装成已经一致。先在
[`shell-conformance-matrix.md`](shell-conformance-matrix.md) 标成明确偏差，再由拥有
contract 的 lane 决定是否修改 machine truth、实现或目标。

Runtime 是目标核心动态 Agent 任务面：Agent owns business task lifecycle，Temporal owns
execution，Framework join，App/Shell 按通用字段和 `view_kind` 渲染。当前 X0-01 route、
WorkItemProjection v2 和显式 `validate:runtime-route` 只作 compatibility bridge；新 contracts/
source/installed evidence 完成前保留，完成后删除 optional gate、固定 Agent scope 和领域
schema mirror。旧 route validation 不关闭目标 Contract/Source/Pixel/Install/Release。

Conformance 必须按 `contract_status`、`source_status`、`pixel_status`、`install_status`、
`release_status` 独立读取；`pixel_verified` 只证明存在当前像素证据，不等于视觉对齐、
安装验收或 release-ready。

证据分层固定为：`docs` 解释意图，`contract` 决定 machine acceptance，`source/tests`
证明 implementation，`pixel` 证明指定 cohort 的可见结果，`install` 证明最终安装字节与
用户路径回读，`release` 证明 owner promotion。当前 Contract、Source、Pixel、Install、Release
必须逐轴记录；公开发布、远端 currentness 与 owner promotion 仍必须由 release authority 独立证明。

## 当前目标与实现边界

当前 Codex-based ideal target 是：

- 宽桌面默认显示目录/对话 rail，保持工作目录分组和 conversation history 可见；
  窄窗口改为 drawer，不能为增加工具而压缩主阅读列。
- Active AionUI Rail 顶部固定 New task、运行状态、Scheduled tasks、Archived；Runtime 的 Native phase-1/default-release gate 仍保持可选。主体按 canonical thread ID 关联的显式
  Project affinity 分组 App Server threads；没有显式 affinity 时，以非 managed-scratch recorded cwd 自动补出目录组。底部承载 account/help/Settings；App Server canonical overview 可用时是 Codex
  session directory authority，carrier 只保存 affinity、draft、preference 和可重建 cache。Git origin 与 runtime cwd 不作为
  Project identity。Rename/archive/restore/delete 分别映射 `thread/name/set`、
  `thread/archive`、`thread/unarchive`、`thread/delete`；pin 是 Shell UI metadata，本地 reset 不冒充
  App Server history reset。Default rail 只显示明确分类的 canonical 未归档普通用户任务；Running now 只接受同一
  Codex Desktop runtime 的 task status，缺失时明确不可用。Archived 是独立 canonical archived directory，All/Search
  仅为显式历史入口。未知 Codex cache row 在 canonical unavailable 时不进入 Default 或 Archived，已知 row 保留最后
  一次 canonical archive state；非 Codex local row 继续保留。验收比较同一时点、同一 authority 的 exact thread ID set
  与 archived bit，不比较固定数量。每个 canonical thread ID 最多一行，不能按标题或 workspace 去重。
- Session/thread 是主单位，project/workspace/directory 不拥有 session、context 或 artifact。新 session 以所选目录
  初始化 cwd 或以 projectless 状态开始；`~/Documents/Codex/**` managed scratch 即使保留真实 recorded cwd 也保持
  projectless 展示，不按其叶子目录建 Project。未注册的普通目录无需先在 OPL App 添加：canonical thread 的 recorded cwd
  可直接生成目录组，但只承担展示和新对话 cwd 快捷入口，不改变 projectless identity。显式 `projectId` projection 仍可将
  projectless session 一次性绑定到一个 canonical directory group，保留 thread identity 与 history。已绑定 session 的 Project affinity 不提供 A→B 任意重分组，命令或 turn 的实际
  `pwd` 不反写 affinity。目录组提供
  “使用此工作目录新建对话”的快捷动作，不提供组级删除，更不能级联删除 session。
- Home/New task 与普通 conversation 共用同一 chat canvas 和 composer，不是
  landing/dashboard；有无 workspace 都使用同一 session 模型。未选 workspace 时仍保留
  attachment、任意本地文件/目录选择、paste/drop 与 `/open`；Project/workspace 只提供初始 cwd、
  projectless 一次性 adoption、分组和展示，真实访问只由 Codex permission/approval/sandbox 决定。Workspace readiness 只约束
  project/OPL workspace controls，不得禁用普通本地对话或这些显式文件输入；
  Codex/model prerequisites 不变。Home root、composer shell 与 footer account/Settings entry 在每个 viewport 各只有一个实例。
- Conversation 顶部只保留当前 task identity 与直接动作。Model/reasoning、
  permission/access、统一 `+` 菜单和 send/stop 均留在 composer；不在 header 重复配置。
- Purpose 从 Home/New task 的动态 Agent shortcut 选择；Official Profile 只提供首次安装默认值。
  选中后只显示轻量 active capability，不用独立 Capabilities 主导航页重复同一组说明。
  Package 安装、首页显示与维护继续归 Settings。
- Agent Package 必须投影真实 installed/enabled/callable 状态；发送时按
  `ready / degraded / package_unavailable` 处理。只有 missing required identity、入口、安全目标
  或权限失败才局部阻止所选 Package。Version、ABI、lock、payload、receipt、binding、digest 和
  family closure 不得成为启动前提，App/Shell 不拥有 Package currentness。
- 当前 task progress、tool events 与 approval 进入 timeline；后台 target 的 interactive
  requests 在 selected thread detail 保留 thread/turn/item context；跨项目总览进入核心 Runtime。
  Current task 只有 timeline 单一实例；普通任务 inline/unpinned，只有用户 pin
  或真实 `long_running` 信号才 sticky，并保留 status/elapsed/progress/next/stop。
- Runtime scope 从 installed `kind=agent && task_provider` descriptors 动态生成，保持
  Agent -> Project 两层；work item 只作为行。Agent 提供业务 status/progress/next action，
  Temporal 提供 queued/running/attempt/heartbeat/retry/terminal，Framework 不互相推导。
- Runtime 的领域详情是 item-scoped typed view。Agent descriptor 提供
  `{view_id, view_kind, title, availability, read_action}`；Shell 只按 `view_kind` 选择 renderer，
  禁止按 Agent id 分支、提交任意路径或把 read model 提升为领域裁决。
- MAS 科研路线由 MAS 拥有 schema、医学语义和文案。App 不复制 node/edge/stage/evidence 字段。
  未知/invalid view 只局部 unavailable，不影响 task row、其他 views 或其他 Agents。
- Runtime Token 只显示 owner-observed 值；missing 不能渲染成 `0`。Package availability 在
  Settings > Agents，Runtime 不复制模块健康。raw ids、logs、refs 与 provider 诊断只进入诊断区。
- Environment 使用右上按需浮层，只读渲染真实
  recorded workspace/locality/branch/changes/subtasks/sources；artifact、
  evidence、receipt refs 属于次级信息，不默认形成全高第三列。它不提供已绑定 session cwd
  重绑或 rail 重分组；新任务初始 cwd 只从 composer 上方独立 context bar 选择，projectless adoption 留在 rail。
- Files/Changes 是按需 workspace surface，Preview 独立；Terminal/Browser 只从 Environment
  或任务需要打开。旧八类 inspector taxonomy 与会话级 Runtime duplicate 不再是产品面。
- Files/Changes 开关在每个 viewport 状态只能有一个可见 owner：关闭时由 conversation header
  负责打开，展开时由 panel header 负责收回；全局 titlebar 与浮动 handle 不得重复同源开关。
- Transcript export 只导出完整分页后的、脱敏的 user/assistant text；Markdown 默认、
  strict JSON 可选，目录与文件名显式选择，不授权 workspace bundle。
- Thread identity/history 归 Codex Core/App Server。Shell 只保留一个用户触发的 App Server
  adapter，复用现有 directory/actions 执行 `thread/list`、`thread/read`、`thread/start`、
  `thread/resume`、`thread/fork`、archive/restore 和 rename/delete；普通 conversation
  继续走 AionUI 现有 ACP。没有独立“线程协调”页面、模型 dynamic tool、第二 JSON-RPC client、
  audit/idempotency ledger、pending-request 控制面或 cross-host handoff。
- Preview 通过现有 ref-only adapter 打开当前 session 的显式 attachment、可见 conversation result，或用户
  显式选择的合法绝对本地路径；绝对路径不要求属于当前 workspace，也不存在 workspace-scoped project-context ref。
  traversal、非法 scheme、自动静默读取及 unsupported ref 保持可见并 fail closed，App/shell 不复制
  artifact body，也不猜测内容。
- New session 只通过 composer 上方独立 context bar 或目录组快捷动作设置初始 cwd；canonical recorded cwd 可自动生成
  未注册目录组，projectless session 仍可从 rail 通过拖动或键盘可达的等价动作一次性写入显式 affinity。失败时保持 projectless 和对话可用。Shell 不创建 managed Worktree、
  不保存 `workspace_handoff` metadata，也不提供已绑定 session 的任意目录重绑或 Local↔Worktree handoff。
- Workspace/cwd 缺失按 fail-open 处理：保留 projectless new task、composer、显式本地输入和普通 Codex
  conversation；单个 Agent Package 的 Workspace/managed-target 前提或 readiness 故障不得升级为全局聊天门禁。
- Review 复用现有 Files/Changes diff surface，按需增加 PR context、inline comments、stage、commit、
  push；target 至少包含 uncommitted/base branch/commit/custom，交付支持 inline/detached，默认
  Unstaged 并提供 Staged/Commit/Branch/Last turn。PR context 依赖 `gh`，缺失时明确 unavailable；
  `Last turn` 只读既有 message store 中最近可见用户消息之后已完成的 workspace edit；当前
  App Server `review/start` 没有 file/line comment request，因此 line-level inline comments 保持
  protocol-blocked，不建立本地 annotation store或假成功。不恢复旧 equal-weight Review tab，也不复制 Git store。
- Settings 已进入 maintenance；保持现有 OPL IA/object 和 model policy，不得决定 Home、
  rail、conversation 或 composer 结构，也不拥有 installer/runtime truth。
- 模型显示和 fallback 只读取 `contracts/app-product-profile.json`；推荐策略由已安装 OPL Flow
  投影提供。优先级为用户显式选择、目录支持的 App 默认、Flow recommendation、Codex live default、App fallback，
  本文档族不复制当前 model/reasoning 值或具体模型 allowlist。

Active AionUI 通过上面的动态 state-source marker 读取默认状态；
`opl-studio` candidate contract 则把 rail 记为 default visible。当前是否
收敛由 validator readback 动态计算，不在本文复制 profile 值。右上 Environment/details
的理想目标为默认关闭。Product target、active source 和 pixel evidence 必须
分轴记录；条件 Runtime 还必须把 Product contract、Framework producer、Shell consumer、Live evidence
四条完成度独立记账。合同或文档落地不表示 Framework、AionUI source、像素或 live user path
已经完成。具体状态、允许偏差和验证入口只在
[`shell-conformance-matrix.md`](shell-conformance-matrix.md) 维护。

## 变更流程

1. **先判层。** 新能力进入功能层；工作流、位置和视觉规则进入理想层；carrier
   适配与状态进入实现层。
2. **判定是否改变 machine behavior。** 若改变普通用户可见状态、page-state
   acceptance、模型策略、Settings IA、first-run gate 或 release gate，必须由对应
   contract/validator lane 先更新 machine truth，不能只改人读文档。
   Runtime 从 X0-01 compatibility route 迁移为动态核心能力属于 machine behavior 变更；
   必须同步更新 product/page-state/design-system/release validators、Framework producer、
   Shell consumer 和 installed evidence。文档目标不等于机器迁移完成。
3. **更新人读目标。** 功能、交互、视觉和元素位置只在各自 owner 文件定义一次，
   其它文件使用链接，不复制长列表。
4. **实现 thin adapter。** Shell 通过 generated profile、state/action bridge、
   Settings Control Plane、single existing App Server thread-directory/user-action adapter、route redirect、局部 renderer composition、i18n/CSS 和
   focused tests 承接，不创建 shell-local 产品规则。
5. **更新 conformance read model。** 记录来源、当前状态、允许偏差、验证入口和
   evidence boundary；不把 docs-only 或 contract-only 状态写成已实现。
6. **按风险验证。** 文档改动做链接、术语、漂移和格式检查；行为改动再运行
   contract、DOM、package、screenshot、VM 或 release gate。

## Evidence 边界

本目录可以证明：

- 产品层次、术语、目标交互和视觉规则已经明确；
- shell 应遵循的适配方法和检查入口已经明确；
- 已知目标/实现差异被显式记录。

本目录不能单独证明：

- active shell 已经实现或通过全部要求；
- candidate 已被采用、可发布或已通过 clean-VM/user-path 验收；
- runtime、domain、artifact、owner receipt 或 release currentness；
- 某次截图、focused test 或 contract validation 代表完整视觉一致性。

这些结论必须由对应 source/tests、runtime readback、candidate evidence、packaged
artifact、owner acceptance 或 release authority 提供 fresh evidence。

当前 9 场景 exact-cohort evidence 见
[`evidence/aionui-41301-parity-20260714/README.md`](evidence/aionui-41301-parity-20260714/README.md)；
历史 8 场景证据继续保留在 [`evidence/aionui-41301/README.md`](evidence/aionui-41301/README.md)。

## 推荐阅读顺序

1. [`codex-to-opl-app-delta.md`](codex-to-opl-app-delta.md)
2. [`feature-inventory.md`](feature-inventory.md)
3. [`ideal-interaction-spec.md`](ideal-interaction-spec.md)
4. [`visual-system.md`](visual-system.md)
5. [`element-audit.md`](element-audit.md)
6. [`gui-shell-candidates.md`](gui-shell-candidates.md)
7. [`shell-implementation-guide.md`](shell-implementation-guide.md)
8. [`shell-conformance-matrix.md`](shell-conformance-matrix.md)
9. [`../../active/aionui-mainline-gui-convergence-plan.md`](../../active/aionui-mainline-gui-convergence-plan.md)
