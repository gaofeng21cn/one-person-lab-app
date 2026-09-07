# OPL App GUI 设计体系

Owner: `one-person-lab-app`
Purpose: GUI 文档导航与职责分层。
State: `active`

App 拥有一个产品定义，AionUI 与 Studio 分别实现其允许的产品能力。当前发布 Shell 由
[`app-shell-adapter.json`](../../../contracts/app-shell-adapter.json) 决定；候选与采用条件由
[`app-shell-candidates.json`](../../../contracts/app-shell-candidates.json) 决定。实现、候选构建或
截图通过不会自动改变发布身份。完整组件关系见 [Architecture](../../architecture.md)。

## 产品定义与实现分层

| 读者问题 | 唯一入口 | 边界 |
| --- | --- | --- |
| 产品必须有什么能力，为什么需要？ | [Feature inventory](feature-inventory.md) | 能力定义与来源；不记录实现流水。 |
| 相比 Codex，OPL 增加什么？ | [Codex-to-OPL delta](codex-to-opl-app-delta.md) | 产品增量及其归属。 |
| 用户如何完成工作？ | [Ideal interaction](ideal-interaction-spec.md) | 跨 Shell 工作流和空间关系。 |
| 视觉系统如何实现？ | [Visual system](visual-system.md) | App 视觉与可访问性原则。 |
| 如何选择与验收视觉参考？ | [Visual parity](codex-app-visual-parity.md) | 外部观察、App baseline 与像素证据边界。 |
| 各元素放在哪里？ | [Element audit](element-audit.md) | 元素职责与交互检查。 |
| Shell 如何承接合同？ | [Implementation guide](shell-implementation-guide.md) | 实现与适配方法。 |
| 当前各 Shell 实现到哪里？ | [Conformance matrix](shell-conformance-matrix.md) | 唯一跨 Shell Contract/Source/Pixel/Install/Release 状态表。 |
| 本地启动与发布采用有什么区别？ | [Shell candidates](gui-shell-candidates.md) | 启动选择、候选隔离与 adoption。 |

## 专题入口

| 主题 | 产品或技术参考 | 未完成工作的归口 |
| --- | --- | --- |
| Settings | [Control Center](settings-control-center.md) | [Active gaps](../../active/app-ideal-state-gap-plan.md) |
| Runtime | [动态任务中心](runtime-overview-redesign.md) | [Package migration](../../active/opl-package-platform-composition-migration.md) |
| 首次启动 | [First-run setup](first-run-setup-workspace.md) | [Conformance](shell-conformance-matrix.md) |
| 模型选择 | [Codex Auto](codex-auto-model-policy.md) | App profile 与 Shell consumer |
| Computer Use | [Computer Use](computer-use.md) | 对应 release qualification |
| OPL Link | [OPL Link](../opl-link.md) | Link owner 的冻结/重启边界 |
| AionCore / Codex 包装 | [Codex-only carrier](../../architecture/aioncore-codex-only-carrier.md) | Shell source 与 exact artifact evidence |
| AionUI 维护 | [Fork maintenance](../../architecture/opl-aionui-fork-maintenance-strategy.md) | AionUI owner；实际偏差归 conformance |
| Studio | [Studio plan](opl-studio-plan.md) | Studio owner，采用权仍归 App |
| DeepSeek Harness 复用 | [Composition plan](deepseek-harness-composition-plan.md) | App/Shell 各自合同与源码 |

## 变更与证据

用户当前决定定义目标；contracts、generated profile、page-state matrix 与源码说明当前行为。
先更新所变主题的唯一 owner，再同步真实 consumer 与相关检查。若目标尚未实现，在 conformance
中明确偏差，不在入口、status 和多个计划中复制同一长清单。

Runtime 的当前机器分类是 `core_dynamic_agent_runtime`，不再是可选 X0-01 route。
Typed domain views 是局部可选增强；缺失 view 不阻断核心列表。框架、领域和执行状态的归属见
Runtime 专题及 `app-runtime-bridge.json`。

Contract、Source、Pixel、Install、Release 分别回答不同问题。旧像素与安装 evidence 只证明
它们记录的 cohort，不通过改 SHA、文案或时间变成当前证据。历史观察保留在
[`evidence/`](evidence/)，当前视觉基线以
[`app-gui-visual-reference-cohort.json`](../../../contracts/app-gui-visual-reference-cohort.json) 为准。
维护生命周期见 [文档治理](../../docs_portfolio_consolidation.md)。
