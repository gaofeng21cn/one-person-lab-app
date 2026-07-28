# 并行交付与开发清洁 SSOT

Instruction revision: `user-2026-07-27-parallel-work-serialized-integration-v2`

Owner: `one-person-lab-app` delivery coordination

Machine-readable operational snapshot:
[`active-objective-ledger.json`](active-objective-ledger.json)

本文只拥有跨目标的执行编排、并发吸收规则和开发清洁终态。产品语义、发布权限、
远端状态和 installed truth 仍由对应合同、owner、受保护操作和 fresh readback 拥有。
Active ledger 中的 thread、ETA、current evidence和next action会快速漂移，只是协调路由；
它们不是产品合同、mutation authority、run admission或完成证明，执行前必须fresh验证。

## 最新用户 SSOT

最新直接用户指令决定 objective、action、target、constraints 和 terminal outcome。
旧合同、旧 ledger、历史 callback、候选分支或 AI 推断与最新用户目标冲突时，必须先把
它们标为 `stale`、`derived` 或 `unknown`，再修订实现流程；不得用旧流程拒绝、降级或
改写用户目标。真实权限、安全、数据完整性和不可伪造性边界仍然 fail closed。

本轮冻结的协调原则是：

```text
parallel_work_serialized_integration
```

- 可独立实现、验证和 checkpoint 的任务应并行推进。
- 文件级或字段级小范围 overlap 不阻止在独立 worktree 并行开发；它只影响最终吸收
  顺序和冲突解决 owner。
- 每个 repo 的 canonical `main` mutation、wire readback 和 owner-native close 串行。
- 合并冲突按 fresh `main`、最新用户 SSOT 和机器合同做 semantic replay，不按“谁先改”
  或旧 patch 文本机械获胜。
- 依赖只约束消费和终态证明，不制造跨仓总锁。producer 与 consumer 可以并行实现
  兼容桥、fixture 和测试，最终按 fresh producer contract 重放 consumer。
- 并行规模按 fresh execution graph 动态决定，不设全局 `ACTIVE` 数量上限；只有写集、
  宿主容量、受保护权限、安全边界或外部配额不足时才收缩并发。`ACTIVE` 对话数量、
  execution owner 数量和同时进入 canonical `main` 的 Integrator 数量不是同一个指标。

## Objective 与 owner 规则

每个未完成 objective 必须在
[`active-objective-ledger.json`](active-objective-ledger.json) 中有且只有一个 controller。
没有真实外部 blocker 时，`execution_owner_threads` 必须至少包含一个可立即执行 next action
的 execution owner。只有所需外部权限或输入确实不可获得时，`ACTIVE` objective 才可以暂时
没有可运行的 execution owner：controller 必须记录缺失的精确权限或输入、外部 authority、
fresh evidence 和恢复条件；不得虚构 mutation、checkpoint、owner 或可执行 next action。
controller 仍负责在恢复条件满足后重新准入唯一 execution owner；它不能用 `blocked` 或
`waiting` 把 objective 伪装成终态。一个 controller 可以管理多个互不冲突的 execution lane；
多个 owner 不得同时声称同一 canonical mutation 权限。Ledger 可以canonical保存为某时点的
审计快照，但不得把其中的owner heartbeat、ETA或 current evidence当作长期产品SSOT；snapshot
过时后由controller重生成，而不是由consumer猜测延长有效期。

任务状态只使用：

- `ACTIVE`：仍有缺口；存在可运行 execution owner 时必须继续推进、修复首个真实断点或完成
  终态 readback。仅在已记录的外部权限或输入 blocker 存在时，允许 controller 暂无可运行
  execution owner，直至恢复条件满足。
- `SAFE_TO_ARCHIVE`：用户终态、canonical/wire/installed/public proof 和 owner-native
  cleanup 均已完成，且该 objective 的 `terminal_gaps=[]`。

`blocked`、`waiting`、failed run、候选 checkpoint、测试通过和 source canonical 都不是
objective 终态。外部权限或不可获得输入是唯一可暂停执行的 blocker；普通冲突、失败
或 main 漂移由 owner 自行重放和修复。

## 并行组与吸收优先级

保持所有具备实际执行动作的 lane；没有可执行切片的只读 watcher 不应伪装成 `ACTIVE`，
而应转为 `SAFE_TO_ARCHIVE` 或被重新分配到独立缺口。当前并行组如下：

1. **Public pointers**：WebUI GHCR `stable/latest` 与 Desktop Stable/Latest 独立推进；
   两者不互相等待。
2. **Source and release repair**：Stable 首断点、安装统一和 GUI artifact consumer 并行；
   GUI 只消费 fresh immutable published+installed cohort。
3. **Hygiene and convergence**：活跃分支 semantic convergence、历史 exact-merged detached
   lane proof-backed cleanup、跨仓 stale receipt reconcile 并行。
4. **Package retirement**：Framework producer、App/Shell consumer、carrier-native lifecycle
   和 consumer-zero inventory 并行；每个 legacy family 的最终删除单独串行。

同一 repo 最终吸收优先级为：

```text
production first-breakpoint repair
-> public pointer blocker repair
-> active product contracts and consumers
-> historical branch convergence
-> documentation-only coordination snapshots
```

优先级只调度 canonical integration 窗口，不要求较低优先级停止开发、测试或 remote
checkpoint。若较高优先级在较低优先级开发期间进入 `main`，较低优先级 owner fresh-main
semantic replay 后继续。

## Local-first / push-last

手工开发必须先完成所有本地或本地等价验证，再使用远端 Actions 补充 hosted OS、受保护
secret、public mutation 或 owner-authoritative readback。标准顺序是：

```text
fresh base and exact write set
-> local focused tests
-> local affected aggregate / typecheck / lint / diff
-> clean checkpoint commit
-> ordinary task-ref push
-> fresh-main semantic replay
-> serialized main absorption and wire parity
-> owner-native close
```

不得把 GitHub Actions 当第一轮调试器；也不得因为本地测试通过就声称公共或 installed
终态完成。

## 开发清洁终态

`worktree` 只是隔离施工面，不是任务终态，也不是成果 SSOT。每个 Git 写任务都必须由
owner 将已验证成果吸收到 canonical `main`，完成 local/tracking/wire/API/tree/blob
fresh readback，再清理自有 worktree、local/remote branch、临时产物、process 和
lifecycle receipt；只有这一整套闭环完成后，对应任务才可标记 `SAFE_TO_ARCHIVE`。
根目录存在其他 owner 的 dirty write set 时，Integrator 不得覆盖、reset 或代替其吸收，
而应在独立集成窗口按 fresh main 逐项重放。

清洁目标不是活跃开发期间强求 non-root worktree 数量为零，而是：

```text
stale=0
ownerless=0
duplicate_writer=0
unexpected_dirty=0
git_locks=0
```

每个 non-root worktree 必须满足以下之一：

1. `ACTIVE`：有唯一 owner、objective、exact/bounded write set、next action、clean 或已说明
   的 contained dirty state，以及可恢复 remote checkpoint；
2. `SAFE_TO_ARCHIVE`：已证明 absorbed/canonical parity、holders=0、locks=0，并由原 owner
   执行 repo-native worktree/ref/receipt/temp cleanup。

`exact_merged`、clean、没有 remote ref 或标题含 `preview/manual` 都不自动授权删除。
ownerless lane 必须先 recovery disposition；历史 detached lane 必须先做 holder、patch/tree
equivalence 和用户数据归属证明。任何删除都必须使用 exact allowlist，不对 workspace 根、
通配路径或未解析 symlink 做递归清理。

每个 owner 完成后必须回读：worktree path/registration、local/remote task ref、lifecycle
entry、task receipt/temp、holders/process、Git locks、canonical local/tracking/wire/API parity。

## 时间估算的使用方式

Ledger 中 ETA 是基于当前最深可证断点的滚动规划值，不是等待理由或硬合同。owner 每完成
一个 checkpoint 就缩短或重估剩余步骤；可以并行的步骤不得相加为墙钟时间。发布、安装、
GUI 和 Package retirement 分账，任何一个已具备执行条件的终态不得等待无关 objective。
