# One Person Lab App

本仓持有桌面 App 的产品定义、GUI contracts、页面状态、打包、更新、用户文档与发布产品 truth。

- App 侧核心机器边界是 `contracts/app-gui-product-contract.json`、`contracts/app-page-state-matrix.json`、`contracts/app-shell-adapter.json` 和 `contracts/app-release-channel.json`。
- OPL Framework 持有通用 runtime、installed discovery/status aggregation 与平台 adapter；领域 task、artifact 和交付 authority 归对应 domain owner。App 只消费其 contracts、CLI JSON 和 projections。
- `opl-aion-shell` 承载当前 AionUI renderer、process、package、测试和 upstream intake；`opl-studio` 独立实现 DSH/Cordis Application Host、原生 Codex 集成和三种 delivery carrier。App 定义两者共同的产品行为、active-shell、adoption 与验收，不得把任一实现或 upstream 默认值变成 App authority。
- AionCore 是只读上游依赖。不得为 OPL 建立或维护 AionCore fork、PR 或 patch，也不得单独替换 `/Applications/One Person Lab.app` 内嵌的 AionCore；升级只能由 App/Shell 合同选择官方 release，并通过完整 OPL App 构建、安装和运行时版本回读闭环。
- 用户可见行为、页面状态、模型/引导策略或 release-ready 边界变化时，先更新 App contract、docs 和 tests，再实现 Shell；上游 fork body 默认只读。
- Package、carrier 与 executor 是独立角色。App/Shell 从动态 projection 渲染，不维护固定 Package/Agent 清单、依赖图、版本解析、lock、payload、receipt 或 currentness 镜像。
- 普通读取使用 `opl app state --profile fast --json`；写入统一走 `opl app action execute ... --json`。未知外部 mutation 只做 owner-authoritative inspect/reconcile，不重发或猜测。
- GUI 工作从 `docs/product/gui/README.md` 开始；App contracts 或 wrappers 变更后运行 `bun run validate:active-shell`，本地缺 Shell 时先运行 `npm run ensure:shell`。测试通过不等于发布完成。
- 并发只拆分可独立推进且可验收的任务；不得创建只能等待其他 repo、producer、candidate 或 `main` 进入 authority 的 consumer 任务。依赖只决定最终吸收顺序：各 owner 先在任务 worktree 完成兼容桥、producer/consumer 实现、cross-test 与 fresh replay；无独立可执行切片时立即合并 ownership 或重组 scope。write-set overlap 仅在最终 canonical 集成短窗口串行，并按 fresh SSOT 解决冲突。
- failed run 或 fail-closed 只终止当前 operation，不结束 objective；除非确实缺少权限或外部输入，owner 必须修复首个真实断点并继续。source 吸收须基于 fresh `main` 语义重放和验证，远端 ref/tree/blob 回读一致后用 OPL Flow `scripts/worktree_absorption_audit.py` 或等价确定性证明确认已吸收，才清理 task-owned worktree/branch。
- GitHub 上自己新建的对外文本用英文书写：commit subject/body、PR 标题与正文、Issue、comment、Release 正文与 Release Notes。产品名、代码标识、路径、命令与原始引用除外。他人写的 Issue、PR 或 comment，无论对方用什么语言，回复沿用对方的语言，不把对象语言改成英文。历史中已有的非英文 commit 保持原样；生成的公开正文直接省略非英文条目，语言不影响任何流程的准入或终态。

## Release Execution Discipline

- 发布、跟进与恢复统一从 `docs/delivery/release/stable-release-sop.md` 进入；专用 Skill 源位于 `skills/opl-app-release`。Skill 只路由，不能建立第二套发布规则或扩大用户授权。普通流程优化不触发产品发布。

- 直接发布任务以 90 分钟内到达公开终态为默认执行预算。预算不是跳过签名、公证、clean-VM 或公开回读的理由；超过预算时必须指出当前精确 job/step、已证根因和不可替代的外部阻塞，不能用继续测试、审计、整理证据或搜索历史维持 `ACTIVE`。
- 根因或最深断点一旦明确，先修改真实 owner 持有的实现、配置或 workflow caller。修复后只运行能证明该断点关闭的 focused check，以及 release contract 明确要求的一次 aggregate/source gate；测试、计划、authority、nonce、digest 和 receipt 都不能替代实际 dispatch、publication 或 clean-install acceptance。
- 同一 exact candidate 的已通过门禁不得重复运行，除非候选字节、依赖 cohort、相关 contract、执行环境或失败证据发生了能使旧结果失效的变化。不得因为时间流逝、上下文切换、需要“更放心”或准备 commit/push/dispatch 而重跑同类门禁。
- 发布 authority 绑定已通过门禁的 immutable exact candidate，不绑定持续移动的 `main`。候选冻结后，其他普通提交、文档更新或 `main` 前进不得使当前发布追新、重建或重跑门禁；只要冻结提交仍可达、authority/critical blobs 未漂移且真实发布前提仍成立，就继续发布原候选。只有用户明确要求改发更新候选，或新事实证明冻结候选不合法、不可构建、不可安装或必然验收失败时，才废弃它并生成新 operation。
- 必需的 pre-dispatch gates 全部通过、canonical main 与 cohort 回读一致、发布 authority 可用后，下一生产性动作必须在同一执行轮次触发唯一一次正式 dispatch。此时停止新增测试、格式化、历史检索、Skill/流程阅读、额外 evidence schema、重复 readback 或旁路审计；只有发现会使发布不合法或必然失败的新事实时才能暂停 dispatch。
- 发布 run 失败时只读取失败 run 的精确首个失败 step 和必要日志，选择 `direct_fix`、最小 `delivery_bridge` 或真实 `stop`。修复后废弃旧 operation，按合同生成一个 fresh operation 并继续；不得扩大为全仓巡检、无关重构或重复验证已经通过且未失效的阶段。
- 监控只跟踪当前唯一 owner run，不以高频轮询、重复状态摘要或等待回调冒充进展。Standard 成功后立即进入其合同规定的 Full 路径；最终完成必须回读 Latest/tag、Standard/Full 资产与 digest、签名/公证、普通账号 clean-install 登录和 Framework-owned Agent projection。
- 每次发布监控都先运行一次 `npm run --silent release:incident-status -- --run-id <id>` 或等价新鲜只读检查，并报告精确 job/step、step 开始时间、最后可证变化时间、已完成的真实阶段/产物和唯一生产性 `next_action`。非 Apple 公证等外部服务 step 连续 5 分钟没有可证变化时，立即读取该 step 的必要日志或 runner/产物证据，修复已证断点。日志不可得、GitHub 页面虚拟化或旧 API 快照只说明观测缺口，不能据此取消、重建或宣称进程卡死；局部日志可用 `--job-id <id> --job-log-file <path>` 绑定当前 run 分析。取消前确认新鲜状态、首个真实故障和最小恢复范围；已公开 Standard 的附加渠道失败应单渠道恢复，不能把整个 run 的取消状态当成 Standard 发布失败。
- Tart/VM 只有在日志或运行产物出现 `stage=clone_vm`、`stage=start_vm`、`stage=wait_for_ip`、`vm_name` 或 `guest_ip` 等真实 runtime marker 后才可报告对应状态；marker 出现前必须明确“VM 尚未证实创建”，不得从 job 名称、静止 GUI 或等待时长推断。已签名、公证且 candidate 字节未变化时，若存在经 Framework 验证的 `full_built` 或更后 checkpoint，优先消费 checkpoint 继续 qualification/publication，不得默认重建。
- 测试凭据只使用用户授权的最低权限专用账号和既有瞬态凭据桥，不使用管理员账号，不把密码写入 GitHub Secrets、仓库、日志、receipt 或聊天。缺少可执行测试凭据时明确转为 `NEEDS_ACTION`，不得用管理员账号或伪造登录结果绕过。

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
