# OPL App 发布 SOP

本文件是 OPL App 发布的统一操作规程，覆盖新发布、跟进、同版本恢复和最终验收。用户当前请求决定范围与授权；[发布合同](../../../contracts/app-release-channel.json)与真实 owner 决定可执行事实；[发布技术参考](README.md)解释 CLI、workflow 和恢复参数。遇到不一致，先核对合同与真实调用链并修正过时规程，不按旧文档盲目执行。

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

渠道集合从合同和已接纳发布请求读取，不把历史版本或固定 Agent/Package 名单复制到 Skill。当前正式 Shell 已选择基于 DSH/Cordis 的 Studio，Stable 继续沿用既有 OPL App 标识与更新仓库。独立 Studio Preview 的终结桥版本使用自己的发布身份，把既有 Preview 用户迁入 Stable；它属于本次用户明确授权的升级迁移，不能因旧的独立候选定位而遗漏。领域 Package 与 Docker WebUI 保持各自 authority，Desktop 成功不代表它们已发布。

已有 run 时先进入第 4 节；已有合格产物时进入第 5 节。不要默认从头开始构建。一次任务仅需在现有执行记录或简短进度中保留范围、owner run、候选和未完成渠道，不新增持久状态协议。

## 2. 准备一次准确候选

1. 核对 App、实际 Shell、Framework 的真实源版本、工作区改动和远端主线。需要交付源码时使用 `$software-development`；worktree 吸收沿用 `$manage-codex-tasks` 和仓库现有生命周期。保留其他任务的改动。
2. 采用正式 controller 解析版本与候选，不手填新的 Stable 版本。用户可见变更摘要来自实际改动，不能为重跑发布编造产品变化。
3. 执行当前写集所需检查和合同要求的源码门禁。记录已有结果的准确候选、依赖与环境；仅在相关事实变化使旧结果失效时重跑。controller 已负责的检查不在旁路重复执行。
4. 确认正式发布前提：授权、唯一 writer、可用的签名／公证环境、专用普通测试账号及其既有瞬态凭据桥。使用现有预检，不能把密码写到命令参数、仓库、GitHub Secrets、日志或回执，也不能换用管理员账号绕过失败。该账号无模型额度；VM 只做登录、就绪读回和不调用 LLM 的确定性检查，不自动执行 Codex AI self-check 或生成式模型探测。

现有 Framework CLI consumer 门禁也读取 App 产品 Profile 选择的根包，在准确 Framework 源码归档的临时状态目录中执行真实公开源下载、解包和摘要校验。它只验证选定根包的源 payload，不修改本机安装，不替代依赖安装或 clean-VM 登录；源包损坏或路径不兼容应在打包前失败。

本次 Shell 切换需分别验收旧 AionUI Stable 和既有 Studio Preview 的真实升级、数据延续与后续更新源。macOS 校验签名、公证和实际替换；Windows 保留 NSIS 身份并复用既有 WSL runtime；Linux 保留 Debian 包名并发布绑定准确 DEB 的 updater metadata。新装成功不能代替升级证明。

Stable 的 Standard 首次安装、Gateway 登录、Official Profile 首次收敛和运行就绪读回，必须在该准确候选公开前通过，属于发布阻断门禁。AionUI Stable 到 Studio Stable、Studio Preview 到 Stable 的迁移路径在 Stable 公开后使用同一公开字节执行独立验收；迁移验收失败不得回写为首版发布成功，也不得阻止首版 Stable 先出现，修复后可在同一 tag 的可变资产替换流程中交付。

候选冻结后，普通文档修改或其他主线提交不要求当前发布追新。保持原候选，只在其不可构建、不可安装、不合法或必然验收失败，或用户明确改发新候选时重新选择。App／Shell／Framework 的兼容与身份检查仍由原 owner 执行。

## 3. 使用正式入口派发

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

## 4. 跟进真实执行

每次检查当前 owner 使用一次新鲜快照：

```bash
npm run --silent release:incident-status -- --run-id <owner-run-id>
```

读取精确 job／step、step 开始时间、最后可证变化、已完成产物和下一生产性动作。向用户只报告有意义的变化。请求持续跟进时沿用现有 owner；需要跨执行轮次的定时跟进则使用宿主原生自动化并复用已有任务，不另造轮询 daemon，也不擅自恢复用户已暂停的自动化。

五分钟没有可证变化时，对该 step 定点取证：读取必要日志、runner 进程或产物变化。Apple 等外部服务按其请求编号查真实状态。日志不可得、REST 旧快照、浏览器虚拟化日志或静止界面均不证明进程卡死。有已知真实断点就修复；缺少证据就明确观测缺口，不能据此取消或重建。

已有当前 job 的可信日志文件时，可以绑定分析：

```bash
npm run --silent release:incident-status -- --run-id <owner-run-id> \
  --job-id <该-run-的-job-id> --job-log-file <已核实来源的日志路径>
```

Full 构建对签名、复制、压缩与磁盘映像挂载操作输出阶段起止、退出码和耗时；失败定位以实际阶段为准。首次自动安装的结构化终态失败与本次启动 PID、时间绑定后，harness 立即报告错误，不再等待安装成功超时；旧日志不构成本次失败证据。

只有 `stage=clone_vm`、`stage=start_vm`、`stage=wait_for_ip`、`vm_name`、`guest_ip` 等 runtime marker 能证明对应 VM 阶段。在此之前报告“VM 尚未证实创建”。心跳不是产物进展。

默认以首次正式派发后 90 分钟内公开终态为执行目标；失败重试不重置整批计时。超过目标时指出精确阶段、已证原因和实际下一步，保留签名、公证、clean-VM 等必要门禁，不用重复测试或无变化轮询填满时间。

## 5. 修复首个断点并最小恢复

先读取最早真实失败 step 和必要日志；取消造成的后续上传失败不自动是根因。选择直接修复真实 owner、最小兼容恢复，或指出不可替代的外部阻塞。修复后执行受影响验证；保留仍然有效的候选检查。新的恢复 operation 继续原发布目标，不以原 run 失败结束任务。

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

Linux／Windows／Homebrew 的独立恢复使用 [现有 follow-up workflow](../../../.github/workflows/release-stable-post-success-followups.yml) 的 `reconcile_desktop_platform`、`reconcile_homebrew_standard`、`reconcile_homebrew_full` 等对应 operation。执行前确认源 run、目标渠道及该渠道 owner；参数以当前 workflow 为准，不将内部 `standard` 输入搬到这个入口。`repair_additive` 只适用于其合同规定的安装器资产 CAS，不能当作任意资产替换工具。

已公开的可变 Stable Release 若需修复产品字节，先通过现有 `build-manual.yml` 的
`replacement_tag` 构建 macOS arm64 签名候选，绑定准确 Shell／Framework SHA。
该入口读取原 tag 和公开更新元数据：显示版本和资产名保留，内部 updater patch 递增，
使已安装同一显示版本的用户也能收到修复。它只生成候选，不创建或公开 Release。
新字节仍须签名、公证及公开前首装验收；迁移缺陷须由对应升级路径验证。

候选通过后，在原 tag 下替换资产，使用通用
`bun scripts/replace-same-tag-release-assets.ts --plan <json> --stage` 暂存候选；计划逐项给出
`current` 的资产 ID、名称、大小、摘要及同名本地新文件，并绑定 Release ID、tag、tag target。
签名、公证及该候选要求的安装验收通过后，对同一计划运行 `--promote`，逐项按旧资产身份 CAS
删除、把暂存资产改为正式名称并回读。需要修正已有正文校验元数据时，计划还须给出原正文
SHA-256 和新正文文件；正文在资产提升后才按 CAS 更新。不为修复分配新 tag 或新增 Release Notes。
中断或结果未知时先读回原 Release 的旧资产、暂存资产和正式名称，按当前状态续接，不能盲目重传。

Studio Preview 已签名、公证且字节不变时，使用受保护 Studio lane 的
`prior_studio_artifact_run_id` 续接原检查点。仅验收脚本修复可同时指定准确 Studio commit
作为 `smoke_harness_ref`；它只改变 qualification checkout，不改变签名源 SHA、tree、tag 或
checkpoint digest。该参数只允许用于已有检查点的恢复，迁移回执记录实际验证脚本提交。

## 6. 推进附加发布，保持产品独立

Standard 公开回读成功后，现有 follow-up hub 即启动适用的 Full、平台包和 Homebrew 路径。检查自动路径的 owner 再决定是否手动恢复，不等待包含其他渠道的整个 workflow 结束，也不双重派发。

Full 的发布仍以已公开 Standard 为前提；构建后的静态包检查与 clean-VM 可并行，只有两者通过才能成为 `full_qualified`。已合格检查点直接继续发布。源码检查与隔离构建可并行，整体成功仍须所有必需检查通过。

Full DMG 按用户明确要求优先缩小下载体积，允许压缩花更长时间；默认 ULMO。压缩测速只能用于观测，不能自行改成更快但更大的默认格式。确需变更此取舍时，先取得新的直接用户指令，再同步发布合同、workflow 与构建器。

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

耗时比较保持相同口径。参考 [2026-09-22 复盘](incidents/2026-09-22-release-efficiency.md)及 [2026-09-15 复盘](incidents/2026-09-15-release-efficiency.md)中的失败模式与证据，不把旧 run ID、版本、摘要或估算节省时间当作下一次发布参数或保证。

## 维护和安装

实现或合同改变时，同一改动更新本 SOP 与受影响的技术参考，复用现有回归验证。Skill 保持薄层，只链接本文件；通用开发与 worktree 流程分别复用现有 Skill，不复制其正文。App 专属操作留在 App 仓库；只有新增通用工作流行为时才向 OPL Flow owner 投影。

Skill 的版本化源是 `skills/opl-app-release`。本机 `~/.codex/skills/opl-app-release` 指向主线工作区中的这个目录；新机器可在核实仓库后建立相同链接。已有同名安装先检查并保留其改动，再切换链接。发布、新 run 跟进和故障恢复统一使用 `opl-app-release`，不保留单独的故障 Skill。
