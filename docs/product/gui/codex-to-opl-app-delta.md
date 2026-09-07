# Codex App 到 OPL App 的产品增量

Owner: `one-person-lab-app`
Purpose: `codex_to_opl_product_delta_rationale`
State: `active`
Machine boundary: 本文解释产品取舍。功能、默认值、页面状态和验收事实归 App contracts，
source/tests 与对应 owner；外部观察不拥有产品或发布 authority。

## 文档职责

本文回答 OPL 为什么借鉴 Codex 的工作流，以及在哪些地方需要自己的产品语义。
功能全集见 [功能目录](feature-inventory.md)，具体操作见
[交互细则](ideal-interaction-spec.md)，视觉规则见 [视觉系统](visual-system.md)。
不在本文维护同一份交互清单、实现完成度或候选路线。

## Literal Observation Boundary

以下是 ChatGPT macOS `26.707.41301`、bundle build `5103` 在
`2026-07-11` 宽桌面 conversation 状态的历史直接观察。保留它是为了追溯交互取舍，
不是把历史 build 当成当前产品、像素或发布依赖。未打开的菜单、Settings、空态和移动端
不在这份观察的证明范围内。

| Area | 直接观察 | OPL disposition |
| --- | --- | --- |
| App frame | 左 rail、中央单列 conversation、底部 composer、右上按需环境浮层 | 保留工作空间关系 |
| Rail | 全局入口、按 project 分组 conversations、底部 account/help | 保留结构，采用 App-owned 入口与 session identity |
| Main canvas | 窄 reading lane，宽屏留白，非 dashboard | 保持 chat-first |
| Timeline | Assistant 正文 unframed，细节渐进展开 | 保持正文优先 |
| Composer | 底部中央，add/access、model/reasoning、voice、send/stop | 在同一决策点绑定 App policy |
| Environment | 按需显示 changes、local、branch、commit/push、compare、subagents、sources | 用真实 owner refs 扩展 |

其中 subagents 指 Codex runtime 的 delegated execution，与被拒绝的 AionUI Team 不同。
OPL 使用现有 App Server/ACP adapter 显示活动、完成详情、结果与 canonical child thread；
source、pixel、install 和 release 状态分别验证，不从观察或协议字段推断完成度。

## 产品取舍

| 类别 | OPL 决策 | 原因与责任 |
| --- | --- | --- |
| 继承 | Rail、single timeline、composer、原生线程/审批/工具工作流 | 降低持续工作与恢复上下文的成本，Codex 保留 thread authority |
| 适配 | 产品 identity、Gateway 身份/模型访问、Settings IA、首启和分发 | OPL 有自己的账号、Package 与交付对象，App contracts 拥有其用户结果 |
| 增加 | 动态 Agent/Capability 入口、核心 Agent Runtime、typed views、owner refs | 专业工作需要可发现的领域入口与真实业务进度，但领域状态仍归 domain owner |
| 拒绝 | Home dashboard、卡片墙、常驻 provider/backend、第二 thread store、Team 产品面 | 避免普通工作流被运维或平行状态源占据 |

视觉 source 与交互参考分开：固定 DSH cohort 提供普通 icon/theme/primitive，Codex 观察
解释工作流与空间关系。稳定视觉 chrome 逐像素对齐的对象是 App 自有批准 baseline，
具体协议见 [像素验收](codex-app-visual-parity.md)。

## OPL 增量与唯一归属

| 增量 | 用户价值 | 唯一产品位置与 owner |
| --- | --- | --- |
| One Person Lab identity | 安装、工作、更新和求助时识别同一产品 | Ordinary chrome 显示 One Person Lab；完整身份与版本归 App/release contracts |
| Session 与工作目录分离 | Projectless 对话也能工作，显式文件输入不被目录成员关系限制 | Codex 拥有 thread；初始 cwd、Project affinity、turn cwd 与权限分别表达 |
| Gateway 与模型访问 | 使用 OPL 账号、entitlement、余额与用量，同时保留既有合法访问方式 | Account & Access 拥有凭据和用量，composer 消费 App model policy |
| 专业 Agent 与能力 | 从工作目的直接选择已安装、可调用的领域入口 | 新会话 starter、palette、显式 @ selector 共享 active Agent；既有会话调用只影响当前 turn |
| Dynamic Agent Runtime | 了解跨项目 Agent tasks、stage、执行进度和下一步 | `U1-07` / `core_dynamic_agent_runtime`；domain 拥有业务，Temporal 拥有执行，Framework 投影 |
| Typed domain views | 通用工作区可展示领域深度信息且可局部降级 | `opl_app.typed_domain_views.v3`；view schema 与 verdict 仍归 domain owner |
| Artifacts / evidence | 结果可以回到来源、审阅与动作 | Conversation/Inspector 按需展示 owner refs；App 不建立 artifact 或 annotation store |
| Package lifecycle | 安装、更新、启停、隐藏与卸载各 Package | Settings Agents/Capabilities 消费动态 projection；native carrier 执行 lifecycle |
| 非阻断首启 | 用户可以先进入工作区，逐项完成配置 | 显式 First Run 与能力级恢复；普通启动进入 Guid，不等待完整 App state |
| 多 carrier | Desktop、standalone WebUI、Docker 使用同一产品语义 | App contract 共享，平台 transport 与 release evidence 各自归 owner |
| 条件远程资源 | 使用真实可用的外部连接与资源 | Resources 仅显示真实 backend/owner projection；不创建占位状态、计费或资源调度 authority |

## 局部失败原则

所选 Agent 的故障只限制依赖它的动作；普通 Codex、其他 Agent、draft 和既有 session
继续可用。Shell 消费 owner-projected `ready / degraded / package_unavailable` 与 allowed
actions，不以 stale、deferred verification、optional receipt、update available 或并未要求的
Workspace 创建额外全局门禁。

真实 identity/callability、entrypoint、managed target、权限与账户授权仍须成立。
失败显示原因和 owner 恢复入口，不把未知状态包装成成功。Package activation 只在 Framework
真实 stage runtime 按 owner locator 执行；普通 conversation create/send 和 turn-level
capability invocation 不触发 Package lifecycle。

## 能力保留边界

B0、R1、U1 的用户结果由 App contracts 保护；当前 Runtime 属 U1 核心能力。
位置调整必须同时保留可见、键盘可达的入口。默认继承官方 AionUI/AionCore 能力，
App 清单未列出某能力不是禁用理由。配置的用户/第三方 MCP 经明确 Team/internal negative
policy 后继续保留；不为展示创建固定 Package/Skill/MCP registry。

产品行为由 owner contracts 决定，Shell source 实现它，exact evidence 验证它。
修改本文只用于更新产品取舍与理由；具体交互、视觉值、实施状态和发布结果更新其唯一 owner 文档。
