# v26.9.15 发布耗时复盘与流程优化

本次从 2026-09-15 13:11:51 首次 Desktop dispatch 到 18:03:31 Full/Homebrew Full 完成，共 **4 小时 51 分 40 秒**。主要增加在最终成功候选之前的失败、取消和恢复，不是每一次签名公证或 clean-VM 都明显变慢。以下时间均为北京时间，来源是对应 GitHub run/job 的终态与时间戳日志。

## 时间与证据

| 区间 | 实际耗时 | 证据与含义 |
| --- | --- | --- |
| 首次 Desktop dispatch → 最终 Standard dispatch | 3 小时 7 分 59 秒 | [34931762369](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/34931762369) → [34946355406](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/34946355406)，包含多次修复、测试、取消和重新派发，不能全部算作机器构建时间。 |
| 最终 Standard dispatch → 公开 Release | 46 分 30 秒 | 16:19:50 → 17:06:20；macOS 构建 job 15 分 43 秒，clean-VM job 7 分 39 秒。 |
| Full dispatch → Full/Homebrew Full 终态 | 55 分 46 秒 | [34950790949](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/34950790949)，17:07:45 → 18:03:31。构建 26 分 9 秒、ARM 最终化 11 分 28 秒、独立包校验 2 分 22 秒、clean-VM job 8 分 49 秒；其余为准入、传输、检查点与发布。 |
| Apple Full 已取得提交编号 → Accepted | 4 分 41 秒 | 同一 Full run，17:38:56 → 17:43:37；不是全程拖延的主要原因。 |
| Windows 恢复构建 job | 21 分 56 秒 | [34953127224](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/34953127224)，Node/Vite 1 分 2 秒；ZIP 构建日志 17:43:42.990，下一条 NSIS 构建日志 17:54:41.804，间隔 10 分 59 秒。ZIP 最后被清理，没有公开发布。 |

成功候选的完整路径从 16:19:50 到 18:03:31 为 **1 小时 43 分 41 秒**。对照没有前置恢复链的 [9 月 7 日 Standard](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/34077857743) 至 [Full](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/34080821531) 为 1 小时 47 分 44 秒，[9 月 8 日 Standard](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/34183867419) 至 [Full](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/34186698363) 为 1 小时 50 分 54 秒。本次最终单轮没有比这两个样本更慢，优先收益是避免重复操作。不同候选、缓存与执行环境不能作为严格性能基准。

## 已证断点及本次发布期间完成的修复

- **Desktop/Studio 准入隔离遗漏。** [34942128599](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/34942128599) 的 `Seal one same-run Stable admission manifest` 把 Studio Full run `34941467098` 判为另一项 Desktop 发布。修复 `e4ee198b1` 和 `e00f65696` 已覆盖运行互斥与最后准入。不同产品继续独立执行，同一公开目标仍保留唯一 writer。
- **Gateway 预检的 Node 信任源不一致。** [34935531457](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/34935531457) 在普通测试账号预检报 `SELF_SIGNED_CERT_IN_CHAIN`；`d4d2cbd10` 使用系统 CA，保留 TLS 验证。后续 Standard 和 Full 普通账号登录已真实通过。
- **首次维护失败后未自动恢复。** 本次产品修复 `0dcd68fe7` 定义一次 core-ready 后重试；最终 Standard 的 clean-VM 实际覆盖首次失败后恢复。需要改变产品字节的修复必须使用新候选；仅验收 harness 修复使用既有准确字节恢复路径。
- **发布说明返回空文本或等待过长。** [34942649465](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/34942649465) 的 `Prepare and validate online AI notes` 收到无可用文本的响应。`5e37a4a68`、`32fe35459` 已加入同证据模型回退、180 秒单次请求上限及安全进度日志。
- **测试误把清单路径当 workflow 调用。** [34944936385](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/34944936385) 的发布边界测试因全文正则命中指纹清单中的文件路径失败。`80ef9c1c7` 保留结构化调用检查、去除误判；最终源码门禁已通过。不要恢复这条全文断言。

取消中的衍生 upload failure 不自动视为最初根因；先读取最早真实失败 step。对没有进程证据的取消 run，不补写推测根因。

## 跟进方式造成的额外成本

原 Windows job 被跟进者根据不完整可见日志误判停滞，随后取消整个 Standard run 再单渠道恢复。这是证据不足的操作判断；Bun shim 不是已经证实的根因。`41d5fe891` 将 Windows Vite 独立为 Node 步骤，恢复 run 证明该路径成功，但不能反向证明旧路径必然卡死。

GitHub REST 快照曾落后于真实步骤和取消结果；浏览器日志虚拟化只返回当前滚动范围。原 incident 工具对活动 job 没有 REST 日志，只能用 step 起点计算“无变化”，不能据此确定进程是否停滞。Windows 后来正常完成长时间压缩，证明五分钟无输出不等于失败。

## 本次复盘新增的实现

1. **减少未交付产物。** App 平台合同为 `stable_desktop_additional` 选择 `--win nsis`，复用现有矩阵 resolver；EXE、blockmap 和 `latest.yml` 的验证与发布保持执行。手工 Windows 构建继续使用原有目标。日志间隔可能包含共享或并行压缩工作，因此不把 10 分 59 秒全部承诺为未来节省值。
2. **刷新观测源。** `release:incident-status` 对 run/jobs/artifacts 使用每次调用唯一的读取参数及 `Cache-Control: no-cache`。这绕开旧缓存，不保证 GitHub 所有数据源原子同步。
3. **接入已有运行证据。** `--job-id <id> --job-log-file <path>` 接收捕获的当前 job 日志，拒绝其他 run 的 job；步状态与日志取较新的时间。日志文件必须由操作者确认来源和完整性，文件内容不构成取消或发布授权。
4. **纠正干预规则。** 五分钟观测缺口触发定点取证；有真实故障后立即修复。不得仅因日志不可得、页面静止或旧快照取消。已公开 Standard 不因附加任务取消变成发布失败；失败附加渠道只恢复自身。

## 后续每次发布的执行方式

- 在本地完成当次写集相关检查；通过的准确候选与源码门禁复用，不因普通主线前进重复准备和验证。准入完成就正式派发，不以旁路审计拖延。
- 将 Standard 公开时间、Full 完成时间、各附加渠道完成时间分别记录，不能用整个混合 workflow 的状态代替产品状态。
- 发布跟进只读取当前 owner 与发生变化的步骤；没有变化时不重复输出“仍在等待”。遇到观测缺口，取当前 step、日志尾部、runner/产物进展，再决定是否干预；普通存活心跳不算进展。
- 保留原候选已签名、公证字节；后段恢复优先使用 `full_built`/`full_qualified` 检查点。不得为缩短耗时跳过签名、公证、普通账号登录和必需 clean-VM。
- 下一次正式 Windows 构建验证不再出现 ZIP 目标，仍生成 EXE、blockmap、更新清单并通过发布读回；比较实际 Windows job 和总关键路径耗时，再量化收益。本次流程验证不能冒充下一次完整 Windows 构建的提速测量。

## 本次修改验证

观测工具、平台矩阵及发布边界共 80 项针对性检查通过，TypeScript 检查和 `bun run validate:active-shell` 完整验证通过。真实 incident CLI 已回读 Full run 的 `completed/success`；当前安装的 electron-builder 26.15.3 已确认将新 Windows 参数解析为唯一 `nsis` 目标。未生成新候选或重发已公开的 v26.9.15；完整验证中的打包运行时扫描因没有新 `app.asar` 而跳过，下一次 Windows 构建的耗时与安装产物仍需正式运行证明。
