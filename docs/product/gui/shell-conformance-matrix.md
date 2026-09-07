# OPL App GUI Shell Conformance

Owner: `one-person-lab-app`
Purpose: `app_gui_shell_conformance_evidence_routing`
State: `active`
Machine boundary: 本文只规定实现证据如何读取和报告。当前状态归 App contracts、
active/candidate source、repo-native validators 和 exact-cohort evidence。

## 职责

功能定义在 [功能目录](feature-inventory.md)，交互与实现分别在
[交互细则](ideal-interaction-spec.md) 和 [实现指南](shell-implementation-guide.md)。
本文不复制逐功能完成度、候选测试计数或旧 Native demo 缺口。需要评估某项能力时，
从下表定位唯一 owner，再对本次明确的 scope 生成一次完整的证据结论。

## 五轴证据

| Axis | 合法状态 | 判断依据 |
| --- | --- | --- |
| Contract | `aligned_contract / current_contract_deviation / candidate_target / not_claimed` | 当前 App contract 与被评估 carrier 的承诺 |
| Source | `source_implemented / source_partial / source_missing / source_not_assessed` | 当前源码、真实调用者及对应验证 |
| Pixel | `pixel_verified / pixel_unverified / pixel_blocked / not_applicable` | 绑定当前 source/package 的场景证据 |
| Install | `install_verified / install_unverified / install_blocked` | Exact package 安装后的用户路径与运行回读 |
| Release | `release_verified / release_unverified / release_blocked` | Release owner 批准、公开制品和运行回读 |

评估顺序为 Contract、Source、Pixel、Install、Release。各轴独立；截图非空可以与 source
不完整同时成立。单一分数和百分比不能表达这五轴。未检查某 carrier 的 source 就报告
`source_not_assessed`，不能继承另一 carrier 的结果或旧审计状态。

Renderer compatibility/admission 是启动前的另一项检查，验证 Host-derived graph、
typed slots/actions、RPC/events 与 state semantics。通过它只允许选择和启动 adapter，
不表示 active-shell adoption、无验证热切换或 release admission。

## R1 / U1 必要功能实现矩阵

本节维护证据映射；功能数量与语义只由功能目录和 machine contract 决定，不维护固定
“12 项”清单。每次审计按请求范围填写上述五轴，并为 AionUI 与 Studio 分别保留 source
和后续 evidence；App-owned contract 可以共享，carrier 结论不能共享。

| Scope | App owner | 实现与验证 owner |
| --- | --- | --- |
| Rail、Home、conversation、composer、模型与权限 | GUI product contract、product profile、page-state matrix | Active Shell renderer/ACP/App Server adapter；`validate:active-shell` |
| Gateway、first-run、Official Profile | Settings control plane、first-run test matrix | Framework state/action、Shell first-run 和 Settings consumers |
| Agent/Capability 目录及 lifecycle | Dynamic Package projection、App contribution ABI | Framework/native carriers；Shell 只显示与调用 projected actions |
| Dynamic Agent Runtime、typed views | Runtime bridge、Runtime page state、`core_dynamic_agent_runtime` | Framework producer、domain task owner、Shell Runtime consumer |
| 三对象维护、数据存储 | Settings control plane、data lifecycle contracts | App updater、Framework/Base、Package/native owner 的各自 readback |
| Studio candidate 与三 carrier | Candidate/adapter、delivery topology、release contracts | Studio Host、native Codex、renderer、package 和 candidate gates |
| Optional resources / channel / companion | App runtime bridge、remote companion contract | 对应 backend/provider 的真实 projection 与双 Shell consumer |

Runtime 已是 `U1-07` 核心能力，typed domain views 通过
`opl_app.typed_domain_views.v3` 进入通用显示边界。不能用旧 optional Runtime 分类缩小
当前 contract 的验收范围，也不能用 contract 已更新推断 source 或 release 已完成。

## B0-11 Codex Subagent 证据

Codex delegated execution 与 AionUI Team 是不同产品面。检查现有 adapter 对
`_meta.codex.collaboration` / `_meta.codex.subagent`、canonical child thread、
Active/Done、详情/结果与打开线程的处理。未知 metadata 应回退到真实 generic tool row；
打开失败保持当前 conversation 并给出重试。执行与线程 authority 仍归 Codex。

检查 source 时包含 `normalizeToolCall.ts` 与 `MessageToolGroupSummary.tsx` 的实际路径和
focused tests；不从 App Server schema 存在推导 UI 完成，不为此新建第二 client、Team store、
scheduler、execution authority 或额外 direct-control 层。Pixel、Install、Release 单独取证。

## 验证入口

| Entry | 证明边界 |
| --- | --- |
| `npm run validate:gui-design-system` | App-owned definition stack、contract projection 与 adapter 一致性 |
| `bun run validate:active-shell -- --quick` | Active adapter、contracts 和 source probes 的结构检查 |
| `bun run validate:active-shell` | Active adapter 所声明的完整验证链 |
| `npm run validate:shell-candidates` | Active/foreground 角色与选择规则 |
| `npm run validate:candidate:studio` / `npm run test:candidate:studio` | 显式 Studio candidate 的当前 contract/source 检查 |
| `npm run package:candidate:studio` | Studio candidate 三 carrier 构建和 manifest；不改变 active shell |
| [像素验收协议](codex-app-visual-parity.md) | Exact scene、baseline、pixel diff 和人工判断 |

具体命令以当前 `package.json` 与 adapter 为准。不得从旧 smoke 命令或旧候选文件路径推断
当前实现缺失；也不因某一测试存在便假定当前执行通过。

## 历史证据与更新

[eight-scene manifest](evidence/aionui-41301/manifest.json) 与
[nine-scene manifest](evidence/aionui-41301-parity-20260714/manifest.json) 是历史 package-bound
像素记录，只证明各自 route/layout。它们不是 current source、安装、完整 parity 或发布证据。
保持原始 manifest/PNG 字节，不在当前矩阵中把它们记成 `pixel_verified`。

新的功能审计或发布结果写入该 operation 的报告与 exact-cohort manifest，绑定 source、
contract、环境、验证命令和结果；本文只在证据 owner、入口或判断规则变化时更新。
产品目标改变先改 owner contract，source 改变重新判断受影响 source，图片或 package 改变
重新取得相应证据，不能用文档状态提升另一轴。
