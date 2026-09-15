---
name: opl-app-release
description: "执行、跟进或恢复 One Person Lab App 的 Stable 与附加发布，包括发布状态检查。普通开发、仅构建、CI 巡检或 SOP 编辑使用相应开发能力。"
---

# OPL App 发布

定位当前任务的 `one-person-lab-app` 仓库，核实 Git remote 与 `contracts/app-release-channel.json`。当前目录不是该仓库时，先从本 Skill 的真实安装路径定位仓库或使用已配置的 App 项目；不能把其他 OPL 产品当作 App。

读取仓库内 [发布 SOP](../../docs/delivery/release/stable-release-sop.md)，按当前阶段只加载相关技术参考。安装入口可能是软链接；解析其真实路径后读取引用，避免相对路径落到 `~/.codex/docs`。SOP 负责操作规则；合同和正式 CLI／workflow 负责实现与身份，Framework 持有 Bundle、checkpoint 和运行时投影。

从当前请求和已有授权区分只读检查、新发布、跟进与恢复。只查状态不触发 mutation；已授权的发布继续推进至请求范围的公开终态，不重复询问。已有 owner 或 checkpoint 从其当前位置继续，不从头构建。所有附加发布逐项回读，Studio 和独立 Package 只在明确范围内操作。

需要修复实现或交付源码时使用 `$software-development` 的对应模式；跨 worktree 吸收时使用 `$manage-codex-tasks`。所需通用 Skill 不可用时沿仓库同等规则执行，不创建平行流程或为普通选择停下。实际生产动作沿用既有授权和生产变更边界。

入口选择、派发条件、未知结果对账、异常恢复、计时和完成标准均遵循 SOP。不要复制发布参数、固定 Package 清单、旧版本、历史 run ID 或另造发布控制器。最终报告真实已完成渠道、当前缺口和公开证据；计划、测试通过或排队均不代表发布完成。
