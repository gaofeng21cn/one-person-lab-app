# OPL App 发布 SOP

本文件是 OPL App 发布的统一操作规程，覆盖 Stable、Nightly、明确指定的 Preview、附加发布、同版本恢复和最终验收。先从 [发布路径与矩阵](release-paths.md) 选择真实入口。用户当前请求决定范围与授权；[发布合同](../../../contracts/app-release-channel.json)与真实 owner 决定可执行事实；[发布技术参考](README.md)解释 CLI、workflow 和恢复参数。遇到不一致，先核对合同与真实调用链并修正过时规程，不按旧文档盲目执行。

[发布 Skill](../../../skills/opl-app-release/SKILL.md)只负责加载本规程和选择入口。App CLI 与 GitHub Actions 继续执行发布；Framework 继续持有 Bundle、checkpoint、operation 和 runtime projection。这里不建立第二个版本表、发布控制器或状态账本。

## 1. 确定范围和当前阶段

从用户请求、现有对话和当前 owner 记录确定：发布产品、渠道、用户可见变更、是否有正在执行的 run、是否要求本机安装。缺失信息确实影响发布对象或权限时才询问，已经明确的授权不重复索取。

| 请求 | 执行范围 |
| --- | --- |
| “看看状态／为什么慢” | 只读检查和解释；不能因此修代码、取消或重新派发。 |
| “跟进发布，确保成功” | 沿用已有发布范围和授权，跟进当前唯一 owner；失败时修复并恢复。 |
| “发布最新版稳定版及所有附加发布” | 根据当前合同列出 Desktop Standard、Full、平台安装包、Homebrew、Docker 等适用交付；逐项回读终态。不同渠道保持各自 authority 和版本策略。 |
| “只发布／修复某一渠道” | 仅推进该渠道及必要依赖，不自动升级为全家族发布。 |
| “优化流程／整理 SOP 或 Skill” | 修改并验证流程文件，不因此发布一个产品版本。 |

渠道集合从合同和已接纳发布请求读取，不把历史版本或固定 Agent/Package 名单复制到 Skill。当前正式 Shell 已选择基于 DSH/Cordis 的 Studio，Stable 继续沿用既有 OPL App 标识与更新仓库。历史 Studio Preview 通过独立身份的终结桥迁入 Stable；普通后续发布使用正式 App 入口，只在明确维护交接时进入 Preview 桥路径。领域 Package 与 Docker WebUI 保持各自 authority，Desktop 成功不代表它们已发布。

用户授权完整 App 发布时，完成本次所选交付所必需的公开关联组件正式发布及窄 canonical 修复一并推进，不逐包重复确认；每个组件仍使用自身 owner 的正式入口并回读终态。既有私有源码边界继续有效，App 发布请求也不隐含本机安装授权。未选择的可选 Package 不纳入宿主发布前提。

已有 run 时先进入第 4 节；已有合格产物时进入第 5 节。不要默认从头开始构建。一次任务仅需在现有执行记录或简短进度中保留范围、owner run、候选和未完成渠道，不新增持久状态协议。

## 2. 准备一次准确候选

1. 核对 App、实际 Shell、Framework 的真实源版本、工作区改动和远端主线。需要交付源码时使用 `$software-development`；worktree 吸收沿用 `$manage-codex-tasks` 和仓库现有生命周期。保留其他任务的改动。
2. 采用正式 controller 解析版本与候选，不手填新的 Stable 版本。用户可见变更摘要来自实际改动，不能为重跑发布编造产品变化。
3. 执行当前写集所需检查和合同要求的源码门禁。`validate:release-boundary` 会先运行 `typecheck:release`，覆盖 App release executor 的入口脚本；普通 App `typecheck` 只证明产品源码类型正确，不能替代这条检查。记录已有结果的准确候选、依赖与环境；仅在相关事实变化使旧结果失效时重跑。controller 已负责的检查不在旁路重复执行。
4. 确认正式发布前提：授权、唯一 writer、可用的签名／公证环境、专用普通测试账号及其既有瞬态凭据桥。使用现有预检，不能把密码写到命令参数、仓库、GitHub Secrets、日志或回执，也不能换用管理员账号绕过失败。该账号无模型额度；VM 只做登录、就绪读回和不调用 LLM 的确定性检查，不自动执行 Codex AI self-check 或生成式模型探测。

云环境源码门禁保留既有代理与 CA 信任配置；GitHub CLI 的认证变量只传给只读 owner 核验，不传给依赖脚本或 Shell 测试，也不写入门禁回执。

source gate 在 Framework CLI、Shell consumer、typecheck 和测试前，先检查本机准备情况：用冻结 carrier 的 `node_host_runtime` adapter 校验 PATH 中实际执行脚本的 Node，再用离线 `npm ls --depth=0 --include=dev` 检查已安装的 Shell 直接依赖。失败沿用 `pre_admission` blocker，先修本机环境再继续；App 不复制 Node 安全版本表，也不把直接依赖检查当作完整 lockfile 验证。依赖陈旧时按冻结 lockfile 执行 `npm ci`；Node 不合格时选择已接纳的运行时并核对 Node、npm／npx 的实际来源，不自动改全局 Node。只有 Node 二进制的工具目录不能作为完整 Full 打包工具链。

In a managed executor, establish GitHub capability with a sanitized read of the actual
repository or owner run. `gh auth status` can reject a proxy credential placeholder even
when the configured API path works; that output alone does not prove credentials are
unusable. A connected GitHub app also does not prove that it exposes Actions dispatch.
Use the available authorized CLI and connector paths, preserve proxy/CA configuration,
and ask for external credentials only after the required capability is actually blocked.
A successful read does not establish write permission: the official controller's single
mutation and owner reconciliation establish whether dispatch occurred.

Standard 的 Framework CLI consumer 只验证宿主所需命令与合同，不以默认 Profile 可选根包的公开源可用性阻断通用宿主。Package 的正式发布仍由各自 owner 验证；Full 按本次 Profile 动态选择 roots，必须校验完整离线载荷的准确字节、摘要及实际安装 presence。精确版本和 content digest 仅标识所选载荷，不形成 Package 组合版本矩阵，也不增加 resolver、registry 或平行 currentness。

影响 Shell 身份、迁移或更新协议时，覆盖受影响的 Studio Stable 与 Preview 路径、数据延续和后续更新源；历史版本仅使用可追溯的原发布资产，不恢复已退役 Shell 的构建或启动路径。普通后续发布不重复全部历史切换验收。macOS 校验签名、公证和实际替换；Windows 保留 NSIS 身份并复用既有 WSL runtime；Linux 保留 Debian 包名并发布绑定准确 DEB 的 updater metadata。新装成功不能代替升级证明。

Stable 的 Standard 首次安装、Core、Framework、Gateway 登录和 Codex 真实就绪读回，必须在该准确候选公开前通过。默认 Official Profile 在后台安装，其 pending、failed、missing 状态如实保留为诊断，不阻断 Standard 宿主发布；不得把宿主通过写成全部 Package 已安装。Full 额外承诺 offline seed，所选 roots 的完整交付和准确安装仍为其发布前提。AionUI Stable 到 Studio Stable、Studio Preview 到 Stable 的迁移路径在 Stable 公开后使用同一公开字节执行独立验收；迁移验收失败不得回写为首版发布成功，也不得阻止首版 Stable 先出现，修复后可在同一 tag 的可变资产替换流程中交付。

在 macOS 临时工作区执行冻结源码 CLI 时，controller 先解析临时目录的真实路径，再构造脚本 argv，避免 `/var` 别名导致主模块判断跳过执行。

候选冻结后，普通文档修改或其他主线提交不要求当前发布追新。保持原候选，只在其不可构建、不可安装、不合法或必然验收失败，或用户明确改发新候选时重新选择。App／Shell／Framework 的兼容与身份检查仍由原 owner 执行。

## 3. 使用所选渠道的正式入口派发

本节 controller 命令属于 Desktop Stable；Nightly、Docker、Manual Preview 与本地构建使用
[路径表](release-paths.md#正式入口和附加发布) 的各自入口，不套用 Stable 版本分配或 authority。

以下命令在已核实的 App 仓库执行；尖括号是说明用占位符，必须替换为真实值。`--execute` 只用于用户已授权的动作。

```bash
npm run release:stable-dispatch -- new-product-release \
  --product-change-summary '<已确认的用户可见变更>' --execute
```

只有这个新产品入口可以申请分配 Stable 版本。`.github/workflows/release-stable.yml` 是受保护执行端，不能在 GitHub UI 手工拼入参、点部分 rerun 或另写一个 `gh workflow run` 绕过 controller。

省略 `--execute` 可查看派发计划，但生成计划仍可能读取远端、准备本地候选并执行源码门禁；它不是廉价状态查询，也不是每次正式执行前必须再跑一遍的步骤。必需门禁和 authority 已成立后，下一生产性动作就是一次正式 dispatch，不再插入格式化、历史检索或重复检查。

保留 controller 返回的 owner run、候选和恢复信息。返回 `owner_identified` 或已发布状态时绑定现有结果；派发结果未知时只读对账，不能再点一次“试试看”。

### 派发结果未知且没有 owner run ID

先从该次 controller 输出或执行记录找回真实 `operation_started_at` 和当时派发使用的 workflow executor SHA；该 SHA 不一定等于冻结产品 SHA，不能用当前 `main` 替代。使用现有只读入口：

```bash
npm run release:dispatch-guard -- reconcile --workflow release-stable.yml \
  --expected-app-sha <原派发的-workflow-executor-SHA> \
  --operation-started-at <原派发开始时间-ISO8601>
```

`identified` 后核对返回 run 的 operation／authority 或源 checkpoint 是否对应本次请求，再绑定跟进。零匹配、多匹配或读取失败继续保持 `outcome_unknown`，均不授权重新派发；缺少原始字段时先恢复调度证据，不填当前时间或猜测 SHA。这个入口不替代已有 run 的 publication unknown checkpoint 对账。

GitHub owner-run 分页查询要求新鲜响应。若同次读取的 `total_count` 在分页间变化，
丢弃整次结果，在既有最多三次只读尝试预算内重新查询；不得混合前后分页或据不完整结果
证明没有活跃发布者。预算耗尽仍停止派发，已发生的 dispatch 不因此重试。

## 4. 跟进真实执行

每次检查当前 owner 使用一次新鲜快照：

```bash
npm run --silent release:incident-status -- --run-id <owner-run-id>
```

读取精确 job／step、step 开始时间、最后可证变化、已完成产物和下一生产性动作。运行中 job 的业务 step 已失败时，立即定位该 step；后续上传诊断、回收 VM 或 cleanup 不表示业务验收成功。已明确容错的 step 和最终成功的 job 不自动升级为阻断失败。向用户只报告有意义的变化。请求持续跟进时沿用现有 owner；需要跨执行轮次的定时跟进则使用宿主原生自动化并复用已有任务，不另造轮询 daemon，也不擅自恢复用户已暂停的自动化。

五分钟没有可证变化时，对该 step 定点取证：读取必要日志、runner 进程或产物变化。Apple 等外部服务按其请求编号查真实状态。日志不可得、REST 旧快照、浏览器虚拟化日志或静止界面均不证明进程卡死。有已知真实断点就修复；缺少证据就明确观测缺口，不能据此取消或重建。

已有当前 job 的可信日志文件时，可以绑定分析：

```bash
npm run --silent release:incident-status -- --run-id <owner-run-id> \
  --job-id <该-run-的-job-id> --job-log-file <已核实来源的日志路径>
```

日志 API 在 job 运行中返回 404 时，优先读取同一 job 的 runner 日志或现有 smoke wrapper stderr；先核对 run、job 和 VM 名，再按上面的参数绑定分析。保留 `[opl-studio-clean-vm]` 的原始 JSON，解析器同时识别 `phase`／`at` 和带 Actions 时间前缀的形式。无实际 runtime marker 时仍不能声明 VM 已创建。

Nightly 已发布字节的 sampled VM 恢复沿用 `release-nightly-followups.yml` 的 `run_sampled_vm` 和原 `source_run_id`。宿主资格预备依赖需要源码修复时，可通过 `framework_executor_ref` 单独固定已合入主线的精确 Framework 执行器提交；下游现有 admission 在占用 VM 前核实其身份。该输入不替换原 App、Shell、Framework 产品 cohort 或公开资产。只修 Shell smoke harness 时继续使用 `smoke_harness_ref`，不要为预备依赖失败重建产品。

Standard 首装的 Framework 源码必须与 DMG 内 bootstrap manifest 的产品 cohort 相同；包内启动器还会核对安装后的精确身份。公开依赖 metadata 的 GitHub repository redirect 应由 `smoke_harness_ref` 选择的资格器处理，不能通过替换 Framework source SHA 修复旧包。

先核对当前机器是否就是执行 runner；若是，直接读取该 job 的 wrapper 日志和产物变化。否则使用已授权的 runner 入口或 GitHub 当前 step 日志。`child_running: true` 只证明子进程存活；压缩进展、签名产物、公证请求编号、VM marker 才分别证明对应阶段。确认日志来源后复用 incident CLI 的 `--job-id`／`--job-log-file`，不另造状态控制器。

Full deep／strict 签名验证保留必要诊断，避免逐个嵌套对象的 verbose 输出耗尽子进程捕获缓冲。Linux 系统依赖通过 HTTPS 镜像获取 Ubuntu 签名归档，保留 apt 签名验证并使用有界重试与超时；失败只恢复该平台。

Full 构建对签名、复制、压缩与磁盘映像挂载操作输出阶段起止、退出码和耗时；失败定位以实际阶段为准。缺失、无效或倒序的阶段时间戳在 telemetry 中记为 `null`，人读摘要显示 `n/a`，不推算成零或负时长。首次自动安装的结构化终态失败须绑定本次启动 PID、时间；旧日志不构成本次失败证据。Standard 保留 Package 失败与缺包诊断并继续判断宿主就绪，宿主回读失败或 Core 不可用仍失败。Full 所选 roots 未齐且安装已终态失败时立即结束等待，不延长超时掩盖断点。Stable 首装读取普通 `fast` 投影，安装包是 Full 不表示要执行 Framework `full` 诊断；初次 exit 1 仅在当前 PID 的相关安装仍为 `running` 时有界重读。

只有 `stage=clone_vm`、`stage=start_vm`、`stage=wait_for_ip`、`vm_name`、`guest_ip` 等 runtime marker 能证明对应 VM 阶段。在此之前报告“VM 尚未证实创建”。心跳不是产物进展。

默认以首次正式派发后 90 分钟内公开终态为执行目标；失败重试不重置整批计时。超过目标时指出精确阶段、已证原因和实际下一步，保留签名、公证、clean-VM 等必要门禁，不用重复测试或无变化轮询填满时间。

## 5. 修复首个断点并最小恢复

先读取最早真实失败 step 和必要日志；取消造成的后续上传失败不自动是根因。选择直接修复真实 owner、最小兼容恢复，或指出不可替代的外部阻塞。修复后执行受影响验证；保留仍然有效的候选检查。新的恢复 operation 继续原发布目标，不以原 run 失败结束任务。

Apple 凭据预检失败时读取已脱敏的失败原因及诊断回执；通用失败文本不能证明凭据失效。独立 `apple_credentials` 诊断只验证现有签名与公证能力，不执行公开发布。

An Apple HTTP 403 that explicitly reports a missing or expired required team agreement
needs the team's agreement acceptance. Preserve the sanitized reason and the preceding
certificate/signature results; do not infer an invalid certificate or password. Continue
independent authorized channels while that external prerequisite is blocked. After the
user confirms acceptance, rerun the small Apple diagnostic, then recover the frozen
candidate through the official controller. Reuse authenticated source-gate evidence when
no signed artifact was produced; do not rerun failed workflow jobs.

| 当前事实 | 下一步 |
| --- | --- |
| 活跃 owner 仍在产生有效进展 | 跟进该 owner；不创建第二个 writer。 |
| dispatch 或公开 mutation 的结果未知 | 只读核对 run、Release、checkpoint 的 owner 状态。结果明确之前不重发。 |
| 无签名产物，只有已认证源码门禁 | 检查 `new-product-release --source-gate-run-id <failed-run>` 是否适用于准确候选；它只复用源码门禁，不复用失败验收。 |
| Standard 已签名、公证，安装验收未通过 | 修复产品缺陷时用正确的新字节；仅 harness 缺陷且字节可复用时，通过 `--reuse-standard-run-id` 和必要的准确 `--smoke-harness-ref` 恢复，重新进行真实安装验收。 |
| Standard 已合格，发布或 Latest 阶段失败 | 使用 `publish-qualified-standard`，保持原 tag 和合格字节。 |
| Full 已有经 Framework 验证的 `full_built`／`full_qualified` | 由 `append-full` 选择当前匹配的检查点和 owner，继续验收或发布；不默认重建、重签、公证。 |
| Standard 已公开，某个附加渠道失败 | 只恢复该渠道；不能取消整个发布再重建 Standard 或其他已完成渠道。 |
| 缺少可用凭据、授权、runner 或外部服务能力 | 明确缺少什么、解除条件和可独立继续的渠道；不能伪造成功或替换高权限账号。 |

Standard 发布恢复：

首装已通过但 Standard 检查点导出失败时，controller 可选择原 run 的 sealed bound artifact，
从同一 run 的 Bundle、签名身份、已通过的 VM 回执和已消费的发布授权恢复检查点。
恢复校验原 run 已终止、尚未进入 publication，并由 Framework 登记原字节；不重建或重跑首装。
Docker 已独立完成时，给 `publish-qualified-standard` 传入 `--completed-webui-run-id <成功 run>`；
只读校验其回执、双架构和版本／Stable／Latest 公开摘要，不再次构建或 promote。
该参数也适用于 `new-product-release --reuse-standard-run-id` 的同字节验收恢复；
保留冻结产品 cohort，workflow executor 的 `head_sha` 不要求等于产品 App SHA。

```bash
npm run release:stable-dispatch -- publish-qualified-standard \
  --run-id <含合格-checkpoint-的-run-id> --execute
```

存在持久化的未知 GitHub outcome 时，读取 controller 和 [技术参考的恢复说明](README.md#stable-operations)，使用其准确 `--source-artifact` 继续 owner 对账；不能丢弃 unknown marker 后重新上传。

Full 恢复或追加：

```bash
npm run release:stable-dispatch -- append-full \
  --source-run-id <原-Standard-或-Full-checkpoint-run-id> --execute
```

Before Full recovery, read the failed run's fresh artifact inventory and current owner.
The same run can retain an early append-operation checkpoint at `standard_qualified`
and a later Full checkpoint at `full_built` or `full_qualified`. An artifact name that
contains `append-full` does not prove it contains a built Full package. Prefer the
controller's matching-checkpoint selection; use `--source-artifact` only when an exact
checkpoint is required and its admitted stage has been established. A failed VM can
still be followed by a successful checkpoint job, so inspect that later evidence before
dispatch. When fresh qualification is needed, `materialize-full-build` must consume
existing Full bytes; a `full_qualified` checkpoint can continue publication directly.
`full-build` must be skipped for same-byte recovery. If a confirmed wrong checkpoint
starts build preparation, reconcile the active owner, cancel only that unnecessary
add-on operation, wait for terminal cancellation, and recover from the later checkpoint.
Preserve the already public Standard and every completed independent channel.

If the failed run has an `opl-full-finalizer-input-<version>-<run-id>` artifact but
no completed Full cohort, `append-full` can resume that exact unsubmitted handoff.
The controller preserves its original content refs and traces its source ancestry
back to the original Standard checkpoint for fresh operation authority. The old
unsubmitted handoff is a separate input, never an expired `full_built` operation.
The protected workflow verifies
the fresh archive digest and every retained file, skips assembly, then performs
notarization, trust checks, clean-VM qualification and same-tag publication.
An existing Apple submission recovery artifact requires submission reconciliation
before this path can run. The handoff is not a `full_built` or qualified checkpoint.

Fresh Full assembly and finalization share the same ARM job through
`.github/actions/finalize-full`. The standalone finalizer job is recovery-only;
normal builds must not release their ARM runner and request a second one. A job
with no runner and no steps must be diagnosed from its check-run annotations:
GitHub capacity failures are not execution timeouts, and increasing
`timeout-minutes` does not repair them.

### 保持产物身份，分别选择执行器与验证器

恢复 Full checkpoint 时，省略产品 ref 会从其 build cohort 读取原 App／Shell／Framework SHA，不追随当前 main。只覆盖某一个产品 ref 也会改变候选：自动恢复仅在原 Standard checkpoint 可用时退回新建 Full；指定了准确 Full artifact，或原 run 不含 Standard 时，会明确拒绝冲突，要求选择原 Standard 来源。只修验收脚本时不要改产品 ref。

| 角色 | 来源与用途 |
| --- | --- |
| 冻结产品 cohort | checkpoint 中的 App／Shell／Framework；决定签名产物身份。 |
| workflow executor | 当前正式派发入口；可以包含流程修复，不改产品字节。 |
| Framework executor | 正式 checkpoint／operation 执行端，与产物内 Framework 源码角色独立。 |
| App verifier | 默认原 App SHA；必要时用准确的纯验收修复提交指定 `--verification-app-ref`。 |
| Shell smoke harness | 默认原 Shell SHA；必要时用准确的验收修复提交指定 `--smoke-harness-ref`。 |

若恢复需要修复验证器，在原 Full 来源上增加所需参数：

```bash
npm run release:stable-dispatch -- append-full \
  --source-run-id <原-Full-checkpoint-run-id> \
  --smoke-harness-ref <准确的-Shell-验收修复-SHA> \
  --verification-app-ref <准确的-App-验收修复-SHA> --execute
```

前置 scope proof 通过还不足以证明旧 App 回执写入器能消费它。正式 CLI 在派发前取选定不可变 App ref 的同一 scope consumer，实际验证该 proof；不兼容时直接提示修正 `--verification-app-ref`，避免先传输 checkpoint。VM 输入阶段保留同一校验，保护直接 workflow 调用。验收脚本与其配套测试使用有限、逐文件映射，产品、runtime 和未列出的测试路径仍拒绝复用；不得用目录白名单或降低期待摘要绕过。不要直接选含产品、打包或不相关合同改动的 main。该检查不会跳过实际登录、就绪、签名、公证或精确产物回执。

### 只读传输错误与可选预备包

artifact 下载遇到 EOF／连接中断时，保留失败 host、路径和错误类型；错误输出应移除签名 URL query、URL 凭据和 Authorization 值。只读下载可在确认本次尚无 mutation 后有界重试；dispatch、上传、push 等结果未知时先回读目标身份，不把网络错误当成未执行。SSH push 失败且远端 ref 确认未变时，可沿用现有 GitHub 凭据助手切换 HTTPS；不把 token 拼入 remote URL。

When `gh run download` cannot follow an artifact redirect, recover small source-control
or Full-cohort ZIPs through the existing connector and canonical artifact cache. Set
`OPL_ARTIFACT_CACHE` to a directory containing the exact archive as
`<GitHub artifact SHA-256 hex>.zip`. The shared downloader must fetch fresh exact-run
metadata and verify archive size and digest before safe extraction; Standard recovery
also verifies the source report against its run-bound control. This repairs transport,
not acceptance or identity. Keep large signed checkpoints in the normal runner transport;
do not reconstruct ZIPs, create a parallel downloader, or rebuild product bytes because
the operator's download path failed. Never retain signed redirect URLs or credentials
in durable evidence.

Standard 在 freeze 中解析一次 Codex 依赖并上传准确清单；构建、构建 cohort 与可选 VM 预备包消费同一清单。WebUI 只解析其 Codex 输入，并将 OCI amd64 映射为 Framework x64；源码解析器先安装其冻结 Framework 依赖。Full 独立解析前也安装对应依赖。

Full workflow 的每次 Node 24 设置都查询最新稳定补丁；缓存键计算、打包和 finalizer 继续由 carrier 的 Node admission 校验实际版本，避免复用 runner 中低于安全下限的旧 Node 缓存。

Studio 的共享 payload 环境必须保留控制器传入的显示版本与机器 updater 版本；不得从已改为机器版本的 package.json 覆盖显示版本。更新资产名继续用显示版本，feed 与 App 内版本继续用机器版本。

Full 的预备输入来自该 Full 产物的冻结 build cohort；恢复时按原 producer run 下载小型 cohort，不能消费当前依赖清单或误用 Standard 的恢复 harness。Full clean-VM job 直接恢复按摘要命名的 runner cache，并由现有 prefetch 路径按冻结 cohort 补齐缺失 tarballs；不再经过独立 self-hosted 预备 job 上传同一批输入，避免把重复传输置于 VM 资格的关键路径。runner cache 只保留两份需要的 Codex tarballs，使用独立缓存命名空间，避免重复传输 npm cache 中的副本。

Standard 的预备安装包是可选加速。只有实际上传成功后才向 VM consumer 提供 artifact 名；主上传与一次重试都失败时输出为空，由现有按摘要校验的本地准备路径继续。VM 先恢复这批 prepared tarballs，复用现有 exact-artifact downloader 的并行传输与归档摘要缓存，并限制可选恢复步骤最多十分钟；只有下载没有成功时才恢复 runner cache。归档大小与摘要先由下载器校验，两条路径仍由 frozen cohort 的 tarball SHA-256 校验决定是否可用，成功下载不代表内容已验收。已验证的两份 tarball 会直接消费 frozen identity，跳过 registry metadata 与 `npm view` 查询；任一份缺失或摘要不符时回到原在线查询和下载路径。不能用一个拼接出来的名字表示资产存在，也不因此重建签名产物。

Linux／Windows／Homebrew 的独立恢复使用 [现有 follow-up workflow](../../../.github/workflows/release-stable-post-success-followups.yml) 的 `reconcile_desktop_platform`、`reconcile_homebrew_standard`、`reconcile_homebrew_full` 等对应 operation。执行前确认源 run、目标渠道及该渠道 owner；参数以当前 workflow 为准，不将内部 `standard` 输入搬到这个入口。`repair_additive` 只适用于其合同规定的安装器资产 CAS，不能当作任意资产替换工具。

已公开的可变 Stable Release 若需修复产品字节，先通过现有 `build-manual.yml` 的
`replacement_tag` 构建 macOS arm64 签名候选，绑定准确 Shell／Framework SHA。
该入口读取原 tag 和公开更新元数据：显示版本和资产名保留，内部 updater patch 递增，
使已安装同一显示版本的用户也能收到修复。它只生成候选，不创建或公开 Release。
新字节仍须签名、公证及公开前首装验收；迁移缺陷须由对应升级路径验证。
需要同时替换 Full 时传 `replacement_include_full=true`，沿用同一候选版本与准确 refs，
由现有 Full builder 和 clean-VM qualifier 生成并验收；公开步骤仍使用同一资产 CAS 工具。
恢复已有签名候选时传 `replacement_candidate_run_id` 和原 App/Shell/Framework SHA；无验证脚本
变更时 `verification_app_ref` 使用原 App SHA，不能因 main 前进把其他合同或文档改动混入
同字节验证。检查 Tart 运行名额，保留其他任务的 VM。

候选通过后，在原 tag 下替换资产，使用通用
`bun scripts/replace-same-tag-release-assets.ts --plan <json> --stage` 暂存候选；计划逐项给出
`current` 的资产 ID、名称、大小、摘要及同名本地新文件，并绑定 Release ID、tag、tag target。
签名、公证及该候选要求的安装验收通过后，对同一计划运行 `--promote`，逐项按旧资产身份 CAS
删除、把暂存资产改为正式名称并回读。需要修正已有正文校验元数据时，计划还须给出原正文
SHA-256 和新正文文件；正文在资产提升后才按 CAS 更新。不为修复分配新 tag 或新增 Release Notes。
中断或结果未知时先读回原 Release 的旧资产、暂存资产和正式名称，按当前状态续接，不能盲目重传。

本机大文件上传受网络限制时，可使用 `replace-same-tag-assets.yml` 在 GitHub runner 下载已验收的
原构建资产。请求绑定每个文件的摘要和通过的 clean-VM 回执，仍调用同一 CAS 工具暂存与提升；
它只改变文件传输位置，不重建候选，也不替代签名、公证或安装验收。

Studio Preview 已签名、公证且字节不变时，使用受保护 Studio lane 的
`prior_studio_artifact_run_id` 续接原检查点。仅验收脚本修复可同时指定准确 Studio commit
作为 `smoke_harness_ref`；它只改变 qualification checkout，不改变签名源 SHA、tree、tag 或
checkpoint digest。该参数只允许用于已有检查点的恢复，迁移回执记录实际验证脚本提交。

## 6. 推进附加发布，保持产品独立

Nightly 发布说明在 GitHub Actions 中依次使用 Copilot CLI `--model auto`、Gateway `deepseek-flash`、Gateway `gpt-6-luna` 和机械说明。Copilot 使用 Actions 的 `GITHUB_TOKEN` 与 `copilot-requests: write`，受仓库所有者 Copilot 额度限制；Gateway 使用已有 `OPL_RELEASE_NOTES_CODEX_API_KEY`。安装失败、额度不足、超时或无效输出都会降级，三层模型写作均失败时仍发布机械说明。AI 只整理冻结 App/Shell/Framework 的公开 diff 与提交证据，英文正文中的渠道、风险、升级及提交身份由程序填入。独立的 `nightly-release-notes-check.yml` 只验证写作链，不构建或发布产品。Stable 使用相同四层顺序，在昂贵构建前生成并冻结正文；三层模型均失败时允许带明确 mechanical 来源的说明，保留英文公开正文、中英文更新弹窗、准确安装操作与变更证据。Framework 同时接受 prepared_ai 与 prepared_mechanical，正文与证据摘要仍绑定同一冻结 Bundle。

Nightly 抽样 VM 使用原发布 cohort、公开 DMG 摘要和带 `-nightly.N` 的机器版本，
通过 `--channel nightly` 验证 Standard 安装、Gateway 登录与 Official Profile。
其回执为 `opl_studio_nightly_clean_vm.v1`，不声明 Stable 签名、公证或 Gatekeeper 资格；
Stable 的这些门禁保持必需。只修验证器时用 `run_sampled_vm` 和准确的 `smoke_harness_ref` 复用原包。

Standard 公开回读成功后，现有 follow-up hub 即启动适用的 Full、平台包和 Homebrew 路径。检查自动路径的 owner 再决定是否手动恢复，不等待包含其他渠道的整个 workflow 结束，也不双重派发。

Full 的发布仍以已公开 Standard 为前提；构建后的静态包检查与 clean-VM 可并行，只有两者通过才能成为 `full_qualified`。已合格检查点直接继续发布。源码检查与隔离构建可并行，整体成功仍须所有必需检查通过。

Full append 在只读 checkpoint 恢复后验证 Full 专用的精确 ref 和恢复 harness scope，再进入构建或 VM runner。恢复已有 Full 时，Scholar Skills SHA 来自该 checkpoint 的 Full manifest，或指定 prior run 的 Full diagnostics manifest，并须与 manifest 的 component SHA 一致；不能回退到当前 main。新建 Full 时只解析一次 main，并把同一 SHA 传给构建 checkout。此阶段失败说明输入或复用边界不成立，应直接修正 admission 输入；不要让同一候选进入下一轮 Full 构建。

Full 可复用目标 Standard 已公开且 sealed 的 ARM64 updater ZIP。复用前按原 attestation 校验 Release ID、tag、target commit、Bundle digest、组件清单摘要、App/Shell/Framework SHA、机器版本及冻结源码与 executor 的产品输入；任一不匹配或资产不可用时继续常规 Shell 构建。解包后校验 App identity 和 Developer ID，随后注入 Full runtime；不能用移动的 Latest 或其他候选替代。复用时跳过 Shell 重建、Electron 原生重编译和两份仅供重建使用的中间 runtime 复制。最终 staged App 完成裁剪与 manifest 写入后只签名并深度验签一次，DMG 内验签、Full 公证、clean-VM 和公开回读继续执行。

Full staging 优先使用保留权限、symlink 与扩展属性的 APFS clone，文件系统不支持时回到 `ditto`。裁剪与边界统计共用本次操作的一份目录清点，不跨 operation 缓存合同。构建 job 默认 `macos-latest`；仓库变量 `OPL_FULL_BUILD_RUNNER=macos-15-xlarge` 可选择 GitHub 托管 ARM64 XLarge，其他值使用默认机器。该可选路径需要已有付费 runner 能力，本次优化不启用付费资源，也不把 clean-VM runner 改作构建机。

Full 不打包 `mac-media-assets` 的素材库；构建不 checkout、不 fingerprint、不复制这批媒体，也不把它计入离线 cache closure。MAC 的 required 依赖关系保持由其 owner 声明，首次启动在核心就绪后通过既有 Official Profile 安装，MAC 开始/恢复制作时再执行原生 `prepare` 检查和补齐。在线安装失败保持 Package 局部诊断；不扩大为 App 导航阻断，也不能伪报素材库已就绪。

Full DMG 按用户明确要求优先缩小下载体积，允许压缩花更长时间；默认 ULMO。ULMO 先创建 UDRW 镜像，再用 `hdiutil convert -format ULMO -tasks <available CPUs>` 压缩，利用所有可用 CPU；保持系统默认 ULMO 压缩设置。与未压缩 App 规模相应的中间镜像位于 staging 输入目录之外，成功或失败均清理；DMG 验签、公证和 clean-VM 消费最终 ULMO。压缩测速只能用于观测，不能自行改成更快但更大的默认格式。确需变更此取舍时，先取得新的直接用户指令，再同步发布合同、workflow 与构建器。

Docker 复用主发布的合格镜像时，Bundle 与 cohort 绑定来自原 source authority 的 release 字段；新的渠道派发不能改写镜像内的原构建身份。独立源码资格没有这些字段时才使用其 source-authority digest。

从主发布资格恢复的 Docker promotion 保留原资格授权，同时核对实际发布者是主发布或专用 WebUI 入口的准确 main workflow_dispatch；签名候选、公开镜像及指针绑定不变。

Docker 使用 [独立 WebUI 入口](../../../.github/workflows/release-webui-development.yml) 和 [Docker 操作参考](README.md#docker-webui)。只检查而未授权发布时使用 `qualify`；已授权“所有附加发布”时继续该独立渠道的 qualify／publish／promote 和公开 digest 回读，不停在 qualify 成功。执行前读取当前入口：`publish` 当前会接续其受保护 promotion，不能再无条件重复 promote。

Studio 及领域 Package 若在用户明确范围内，按各自 owner 的合同执行；它们与 Desktop 的构建、签名、准入和互斥边界独立。只对真正相同的公开目标保持唯一 writer。

## 7. 以用户要求的真实终态关闭

不能把“Standard 产品已有效发布”和“本次全部交付已完成”混为一谈。后者必须覆盖请求中的每个渠道；未要求本机安装时，也不擅自升级 `/Applications` 的安装实例。

| 交付面 | 必要证据 |
| --- | --- |
| Desktop Standard | 准确 tag／target、Latest 与 Release 标志、合同要求资产及公开下载 digest、签名／公证、合格的普通账号 clean-install 登录及 Framework-owned Agent projection。 |
| Full | 同 tag 的完整资产与 digest、准确候选的签名／公证及 clean-VM 验收、现有 Full 安装语义和 projection。 |
| 平台包、安装器、Homebrew | 合同要求的资产、更新侧文件、安装器与对应 cask 的版本／来源／digest；各自要求的验收或公开回读。 |
| Docker 或其他独立产品 | 自身版本和 authority、原生平台 qualification、准确公开 digest、该渠道要求的 tag／pointer 回读。 |
| 源码和临时工作区 | 请求要求的主线已回读；自有 worktree／分支吸收与清理完成，保留未交付的其他任务改动。 |

在现有完成记录中保留：首次正式尝试时间、Standard 公开时间、每个要求渠道的完成时间、最后一次成功单轮、失败／恢复区间，以及能回查的 run／产物链接。无必需未完成项才报告全部完成；存在阻塞时报告已完成面、缺口与解除条件，不把未知状态填成成功。

耗时比较保持相同口径。参考 [2026-10-08 复盘](incidents/2026-10-08-release-efficiency.md)、[2026-09-22 复盘](incidents/2026-09-22-release-efficiency.md)及 [2026-09-15 复盘](incidents/2026-09-15-release-efficiency.md)中的失败模式与证据，不把旧 run ID、版本、摘要或估算节省时间当作下一次发布参数或保证。

## 维护和安装

Full 从冻结 Framework owner projection 选择本次 roots 中的 `local_component`，按其 payload
声明的精确 source commit、文件路径、模式和 SHA-256 物化到现有 runtime modules。
seed 身份进入 domain-runtime cache key，既有 packaged-module marker 保留来源；App 不维护
固定组件清单或独立版本表。Framework 仅在匹配父产品 seed 存在时提供收敛动作，原生 carrier
仍验证 payload 和 content lock；没有 seed 时不转为在线下载。

实现或合同改变时，同一改动更新本 SOP 与受影响的技术参考，复用现有回归验证。Skill 保持薄层，链接本文件和发布路径索引；通用开发与 worktree 流程分别复用现有 Skill，不复制其正文。App 专属操作留在 App 仓库；只有新增通用工作流行为时才向 OPL Flow owner 投影。

Skill 的版本化源是 `skills/opl-app-release`。本机 `~/.codex/skills/opl-app-release` 指向主线工作区中的这个目录；新机器可在核实仓库后建立相同链接。已有同名安装先检查并保留其改动，再切换链接。发布、新 run 跟进和故障恢复统一使用 `opl-app-release`，不保留单独的故障 Skill。

同 tag 的独立平台修复保留 aggregate manifest 的原 Standard `source` / `cohort` 绑定，
在 `platform_build_provenance.<platform>` 记录实际构建的 App、Shell、Framework SHA、
机器版本和已完成的构建 run。已有平台资产不可在追加时覆盖；不同字节的替换继续使用
同 tag 资产 CAS。签名、包完整性和平台运行验收按该平台合同执行，不能把原 Standard
通过当作修复包通过。

同 tag 替换后的 Standard Homebrew 更新由 App 的 `scripts/update-homebrew-tap.ts`
生成，传入公开回读的 `--component-manifest <file>`，使机器版本、DMG URL 和摘要绑定该已验收
替换包，而不是重新从显示版本推导旧机器版本。继续使用当前 Cask 摘要 CAS，验证公开 Release
资产与 manifest 后写入下游；不得仅改 Cask 版本或校验和。

Full Homebrew 同样从公开 Standard component manifest 读取机器版本；其独立 Full DMG 和
`opl-release-manifest.json` 的摘要与大小仍由 Full follower 逐项验证，再使用当前 Cask 摘要 CAS。
同 tag 替换时，Full follower 保留原发布 handoff 的历史来源，从公开 Full manifest 的
`same_tag_replacement` 核对上一份 manifest 和新验收回执，再采用当前 Full 文件身份。

同 tag Full 构建成功而后续 VM 前置检查失败时，`build-manual.yml` 的
`replacement_full_candidate_run_id` 消费原 Full run 的 DMG、cohort 和 diagnostics，
核对成功构建 job、准确源码组合、签名公证摘要及大小，再仅恢复 clean-VM。
保留已通过 Standard 的 `replacement_candidate_run_id` 以继承其机器版本，并同时设置
`replacement_full_only` 和 `replacement_include_full`。Full 的资格验证来源于原包清单，
不重新解析依赖或重建签名包。Standard 和 Full 默认使用冻结 App SHA 的验收器；
只有确需纯验收修复时才显式指定 `verification_app_ref` 并通过原有 scope proof。

## 8. 发布后改进

只固化有证据的真实断点和恢复路径：先修 caller，再用对应失败样例或边界用例验证；通用操作写入本 SOP，入口提示写入发布 Skill，具体版本、run、时间和未知原因放入事故复盘；最近见 [26.11.11 复盘](incidents/2026-11-11-release-efficiency.md)、[26.10.26 复盘](incidents/2026-10-26-release-efficiency.md)和 [26.10.9 复盘](incidents/2026-10-09-release-efficiency.md)，此前记录保留各自历史证据。不为经验沉淀重复发布或运行已通过的产品门禁。

一次未保留 owner 原因的 Gateway 失败，只能记录最深已证断点；后续同字节成功不能倒推出当次根因。持续失败时读取已脱敏的 machine reason code 和 owner 只读投影，再决定修哪一层。进度只在阶段变化、出现真实失败或需要用户动作时汇报；没有变化的轮询不产生新验收证据。

The Gateway harness may reconcile the known settled owner receipt
`ok=true`, `status=error`, `dryRun=false`, `exitCode=4`,
`errorCode=gateway_unavailable`. It re-reads the active account, managed key and same
projected confirmation action. Fresh model access already owned by `opl_gateway` needs
no second mutation; an unchanged source permits at most one bounded retry of that
confirmation. Unknown outcomes, authentication failures or a changed model-access owner
must not be repeated. Preserve the first receipt and recovery projection, and still
require fresh Gateway model access, real Codex protocol readiness and Runtime refresh.
Record actual Official Profile background status for Standard; require selected-root
convergence for Full. A later successful run does not establish the original
service's underlying cause or prove the retry branch was exercised. See the
[v26.10.2 retrospective](incidents/2026-10-02-stable-release-recovery.md) for observed
failures, the mistaken checkpoint selection, and final public evidence.
