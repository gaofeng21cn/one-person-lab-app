# OPL Package 集成验收计划

Owner: `one-person-lab-app`；Framework 与 Shell 分别负责 producer 和 consumer。
Purpose: `package_consumer_integration_and_unverified_outcomes`
State: `active_acceptance_plan`
Machine boundary: 当前合同、真实调用链和 fresh carrier readback 决定实现状态；
本文只保留 App 集成与真实用户结果的未闭环验收。

## 当前基线

Framework 的显式 Package install/update/uninstall/repair/enable/disable 已经通过
`public-command-specs-parts/packages.ts`、`registry-lifecycle-actions.ts` 路由到
配置的原生 carrier；不再把旧 lock、payload 或 LKG 当作备用生命周期实现。
不能继续把这条 successor 路由写成待建设方案。

不带 Package identity 的聚合 maintenance 必须沿实际分支检查最终 carrier 调用，
不能仅因 `managed-update` 名称判定其过时。Home preference transaction 保存用户
选择，属于必要偏好持久化；它不是应随旧 Package manager 删除的安装 authority。

App 当前合同已采用动态 Package directory、role-neutral contributions、core Agent
Runtime 和 typed-view envelope。具体 Shell source 状态归
[conformance matrix](../product/gui/shell-conformance-matrix.md)；缺少 fresh 安装或
像素证据不能倒推 source 未实现，也不能在本计划再维护一套阶段完成表。

## 尚需闭环的用户结果

下面按独立结果组织验收。没有绑定当前 cohort 的证据时保持未证明；已由 owner
验证的结果直接引用并移出本计划，不重开已删除的框架或接口。

| 结果 | Owner 与验收 |
| --- | --- |
| 首装与卸载偏好 | App/Shell 验证 Standard 与 Full 消费同一个 Official Profile；Full 仅增加离线 bytes。用户移除 Package 后重启、普通维护和 App 更新均不回装，只有显式 Restore 恢复。 |
| 动态安装与依赖 | Framework/carrier 验证 unknown Package 安装、发现、callability 和 required-presence 补齐；无需固定 Package/Agent 分支或 version/ABI composition gate。一个失败仅影响自身及真实 dependents。 |
| Home 与 Settings consumer | Shell 验证动态入口、显隐、排序和维护动作均来自 current projection，动作后 fresh refresh；不解析 native carrier 的 lock、receipt、私有路径或物理数据库。 |
| 通用 Runtime 与领域视图 | Agent 提供业务任务，Temporal 提供执行，Framework join，Shell 按 envelope/`view_kind` 渲染。新 Agent/view 不要求 App ID 分支；unknown/invalid producer 只局部降级，MAS 医学 schema 保持领域 owner。 |
| 独立维护与 carrier 缺失 | Framework/carrier 验证更新单包不更新 Base/App/其他 Package；普通 invocation 不推进 currentness。最后一个物理 carrier 消失时 fresh readback 报 `physical_unavailable`，不能由 UI metadata 维持 installed 假象。 |
| Executor-neutral identity | 使用最小真实 Git/local carrier proof 验证同一 descriptor、依赖、偏好和业务状态不依赖 Codex 私有 ID/path/marketplace。缺失某 executor adapter 只影响该 route，不建设第二正式 executor。 |

跨仓 source 已通过的结果仍需分别绑定真实 consumer 与所声称的 installed/user-path
证据。本计划不预设这些检查已经失败，也不把缺证据改写成永久兼容面。

## 退役与完成

若 fresh 调用检查发现旧 manager reader/writer、固定清单、fallback 或 App-owned
domain schema，先定位当前 caller 并切到已有 owner 接口，再在同一改动中删除旧
实现、合同、fixture、测试与入链。不要保留双读、alias 或自动回退。

删除依据是实际调用者归零、受影响构建和上述用户结果的前后验证。Release Bundle
exact-byte evidence、Temporal durability、领域回执、偏好与配置原子写入保持各自
真实职责，不能凭 `receipt`、`transaction` 等词汇批量删除。

Package owner publication、App Stable/latest 和 Docker WebUI promotion 是各自
独立的发布动作，其 public evidence 不由本计划或本地测试代替。当前操作见
[release guide](../delivery/release/README.md)。旧 Durable proposal 的拒绝理由见
[历史评审](../history/process/2026-07-23-opl-package-durable-design-review.md)。

当本表的 App 集成与所需实际验收均闭环，将持久约束折回 architecture/产品参考，
删除本计划。不要追加历史阶段、授权记录、任务交接指令或工程日估算。
