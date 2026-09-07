# OPL 能力治理

Owner: `one-person-lab-app`
Purpose: `capability_composition_boundary`
State: `target_planned_with_current_compatibility`
Machine boundary: 本文定义 App 消费能力图的目标边界。当前 contracts/source
仍含 Flow 来源/版本提示、Framework resolver/lock/receipt/payload 等兼容字段；
这些字段必须按
[`active/opl-package-platform-composition-migration.md`](active/opl-package-platform-composition-migration.md)
执行 successor cutover 和旧消费者删除，不是长期 authority，也不证明安装、currentness 或 release readiness。

## 结论

能力只用稳定身份组合：

```text
Package declares provides/requires identities
  -> configured carrier installs missing identities
  -> Framework checks presence + callability
  -> App renders one aggregate projection and projected actions
```

普通组合不做跨 Package 版本、ABI、digest、payload、lock、receipt 或原子闭包求解。
Breaking change 通过新的 capability identity 或 Package-owner adapter 表达。某次
build、Full/offline seed、集成测试或 QA 可以精确记录其实际输入，但快照不能反向成为
普通 readiness 或 currentness authority。

## 权威分工

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| Package owner，包括 OPL Flow | Package/capability identity、provided/required intent、入口、runtime health、领域语义；一方 owner 独立推进自身 GHCR `latest-stable` | 其他 Package 状态、App UI、共享版本矩阵、用户秘密 |
| Carrier/runtime adapter | 安装、更新、启停、删除及完整 runtime 激活；fresh native readback | Package identity、全局 currentness、跨包求解、领域真相 |
| OPL Base | 一方 GHCR bytes 的薄 OCI 下载和校验，并交给声明的 carrier/runtime adapter | 完整 Package lifecycle、runtime health 定义、installed truth |
| OPL Framework | Executor-neutral discovery、complete-Package fresh readback、presence/callability、route readiness、聚合状态/actions | 第二套 Package bytes、resolver/lock/payload/LKG/receipt/rollback manager、固定 Skill/Plugin/Agent 清单 |
| OPL App / Shell | GUI、用户偏好、Official Profile 的首次安装/显式恢复意图、聚合状态和 projected action | 解析 Flow、Package/Skill/Plugin/CLI/MCP 依赖清单、选择版本或复制 lifecycle truth |

能力身份固定为 `(kind, id)`。例如 `codex_skill:officecli` 与
`cli:officecli` 是两个能力，不能因文本 id 相同而折叠。`required` 表示必须存在且
可调用；缺失只阻断依赖它的 Package。`recommended` 或 `optional` 不阻断 Package、
App、Standard 或 Full readiness。

## OPL Flow

OPL Flow 是普通 `OPL Package(kind=workflow)`，提供默认组合意图和用户 profile；
它不是 App、Standard 或 Full readiness 前置，也不拥有 App session prompt。App 与
Shell 不读取 Flow manifest 或 companion Skill 清单。Flow 未安装时 App fallback
仍可用；安装后其 recommendation 可以参与展示或显式用户选择。

Flow descriptor 中历史 `source`、`version_requirement`、`install_source` 和
`offline_bundle` 是迁移兼容输入，不是 capability identity 或目标接口。新消费者
不得依赖这些字段；现有消费者清零后删除。

## Standard、Full 与 Publication

Standard 与 Full 读取同一个 App Official Profile。Full 只携带该次构建实际选择的
offline seed；缺失的可选 Package 不阻断发布或安装。用户移除 Profile root 后，
普通启动、silent update 和 App update 不得重装；只有显式 Restore 才重新应用。

每个一方 Package owner 独立发布完整 bytes 到自身 GHCR 并推进自身
`latest-stable`。`one-person-lab-manifest:latest-stable` 只保留 Full、offline、
integration-test 和 QA 快照用途，不参与普通 Package currentness。

Full/release artifact 可以绑定它实际包含的 commit、ref、digest 和完整性证明。
这些 exact facts 只证明该 artifact 的 bytes，不要求未选 Package、Flow、App 或 Base
进入同一 cohort，也不创建日常 installed lock。

## MCP 与凭据

MCP、Skill、Tool、Plugin、Agent producer 和 typed view 使用同一能力身份规则。
声明不等于已安装；carrier fresh readback 决定 presence/callability。用户或第三方
能力即使不在 Flow 或 Official Profile 中也必须保留，不得被默认组合删除或覆盖。

API Key、OAuth token、账户状态和其他秘密始终由用户或 provider 持有，不进入
Package descriptor、Flow policy 或 Full seed。模型访问配置与 Package composition
解耦；缺少 provider 不阻断 Package 安装，但可让相应 executor route unavailable。

## 模型策略

App 模型选择优先级固定为：

```text
由 App profile 的 codex.auto_model_policy 解析 Auto 或用户固定选择
```

具体优先级、分页目录、固定选择和 fallback 只由
[Codex Auto](product/gui/codex-auto-model-policy.md) 及其 App profile 持有。
App 展示 live catalog；受控配置 mutation 走现有 owner action，不另建 Package receipt
或 reconciliation 状态机。

## 验收

- 新 Package/能力只声明 identity、provides/requires、entrypoint 和必要展示信息。
- MAS 对 MAS Scholar Skills 的已证实 required edge 只检查
  presence/callability；失败只阻断 MAS。MAG 或其他 Package 只有在其 owner
  contract 明确声明后才获得相同 edge。
- 中性 Git/local carrier 可在无 Codex 私有字段时完成真实 install/discovery/callable readback。
- Framework 投影不要求 version/ABI/lock/payload/digest/receipt。
- Standard/Full 使用同一 Official Profile；Full 只校验实际携带的 bytes。
- App/Shell 不存在 Flow 或 Package/Skill/Tool/Plugin/MCP 第二清单。
- 一方 Package 独立推进 GHCR `latest-stable` 时，不要求 Base/App/其他 Package/Release Set 同步。
