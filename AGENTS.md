# One Person Lab App

本仓持有桌面 App 的产品定义、GUI contracts、页面状态、打包、更新、用户文档与发布产品 truth。

- App 侧核心机器边界是 `contracts/app-gui-product-contract.json`、`contracts/app-page-state-matrix.json`、`contracts/app-shell-adapter.json` 和 `contracts/app-release-channel.json`。
- OPL Framework 持有通用 runtime、installed discovery/status aggregation 与平台 adapter；领域 task、artifact 和交付 authority 归对应 domain owner。App 只消费其 contracts、CLI JSON 和 projections。
- `opl-aion-shell` 承载 AionUI renderer、process、package、测试和 upstream intake；App 定义产品行为与验收。不得把 Shell/upstream 默认值或 Git 历史变成 App authority。
- 用户可见行为、页面状态、模型/引导策略或 release-ready 边界变化时，先更新 App contract、docs 和 tests，再实现 Shell；上游 fork body 默认只读。
- Package、carrier 与 executor 是独立角色。App/Shell 从动态 projection 渲染，不维护固定 Package/Agent 清单、依赖图、版本解析、lock、payload、receipt 或 currentness 镜像。
- 普通读取使用 `opl app state --profile fast --json`；写入统一走 `opl app action execute ... --json`。未知外部 mutation 只做 owner-authoritative inspect/reconcile，不重发或猜测。
- GUI 工作从 `docs/product/gui/README.md` 开始；App contracts 或 wrappers 变更后运行 `bun run validate:active-shell`，本地缺 Shell 时先运行 `npm run ensure:shell`。测试通过不等于发布完成。
- 并发只拆分可独立推进且可验收的任务；不得创建只能等待其他 repo、producer、candidate 或 `main` 进入 authority 的 consumer 任务。依赖只决定最终吸收顺序：各 owner 先在任务 worktree 完成兼容桥、producer/consumer 实现、cross-test 与 fresh replay；无独立可执行切片时立即合并 ownership 或重组 scope。write-set overlap 仅在最终 canonical 集成短窗口串行，并按 fresh SSOT 解决冲突。
- failed run 或 fail-closed 只终止当前 operation，不结束 objective；除非确实缺少权限或外部输入，owner 必须修复首个真实断点并继续。source 吸收须基于 fresh `main` 语义重放和验证，远端 ref/tree/blob 回读一致后用 OPL Flow `scripts/worktree_absorption_audit.py` 或等价确定性证明确认已吸收，才清理 task-owned worktree/branch。
## Code Review Rules

- 只报告当前 diff 可复现的正确性、安全、数据完整性、release/CI 或 machine-readable contract 回归；每条必须给出精确代码或 contract 证据、触发路径和用户可见或自动化可证的影响。安全路径是修复 canonical owner 或其真实 consumer，不是复制一份平行 truth。
- 将 App contracts、动态 projection 和跨仓 owner 边界视为事实来源；只有改动实际违背这些边界时才报告 P2。不得把文档措辞、命名、格式、主观重构或没有具体回归路径的建议升级成发现。
- 不报告与当前 diff 无关的既有问题，也不把缺少测试或文档本身当作问题；只有它们直接造成可复现的行为或契约回归时才报告。若不存在高价值可复现问题，明确返回无发现。

<!-- CODEGRAPH_START -->
## CodeGraph

- 本仓库使用本地 `.codegraph/` 索引；该目录不得纳入 Git。
- 定义、调用、影响范围和代码路径等结构检索优先使用 CodeGraph；字面文本检索使用 `rg`。
- 索引缺失或过期时运行 `codegraph init .` 或 `codegraph sync .`。
<!-- CODEGRAPH_END -->
