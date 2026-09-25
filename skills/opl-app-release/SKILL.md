---
name: opl-app-release
description: "执行、跟进、恢复或梳理 One Person Lab App 的 Stable、Nightly、明确指定的 Preview 与附加发布，包括发布状态及流程优化。普通开发、仅构建和一般 CI 巡检使用开发能力。"
---

# OPL App 发布

定位当前任务的 `one-person-lab-app` 仓库，核实 Git remote 与 `contracts/app-release-channel.json`。当前目录不是该仓库时，先从本 Skill 的真实安装路径定位仓库或使用已配置的 App 项目；不能把其他 OPL 产品当作 App。

先按 [发布路径与矩阵](../../docs/delivery/release/release-paths.md) 找到真实入口、平台、附加成员和终态，再读取仓库内 [发布 SOP](../../docs/delivery/release/stable-release-sop.md)，按当前阶段只加载相关技术参考。安装入口可能是软链接；解析其真实路径后读取引用，避免相对路径落到 `~/.codex/docs`。SOP 负责操作规则；合同和正式 CLI／workflow 负责实现与身份，Framework 持有 Bundle、checkpoint 和运行时投影。

从当前请求和已有授权区分只读检查、新发布、跟进与恢复。只查状态不触发 mutation；已授权的发布继续推进至请求范围的公开终态，不重复询问。已有 owner 或 checkpoint 从其当前位置继续，不从头构建。要求完整矩阵时逐项完成适用的 Full、平台包、Homebrew 和 Docker 回读；附加项失败独立恢复。仅优化流程时修改并验证源码和文档，不因此派发产品发布。领域 Package 发布仍需其自身范围。

Studio 已是当前正式实现；历史 Studio Preview 的 terminal handoff 仅是维护入口，不把普通 App 发布误路由为新的独立 Preview。已合格字节优先复用，同 tag 修复递增机器版本并处理对应 feed、manifest、Homebrew 和仍被使用的旧证明或固定交接资产；具体约束只维护在 SOP。

需要修复实现或交付源码时使用 `$software-development` 的对应模式；跨 worktree 吸收时使用 `$manage-codex-tasks`。所需通用 Skill 不可用时沿仓库同等规则执行，不创建平行流程或为普通选择停下。实际生产动作沿用既有授权和生产变更边界。

入口选择、派发条件、未知结果对账、异常恢复、计时和完成标准均遵循 SOP。不要复制发布参数、固定 Package 清单、旧版本、历史 run ID 或另造发布控制器。最终报告真实已完成渠道、当前缺口和公开证据；计划、测试通过或排队均不代表发布完成。
