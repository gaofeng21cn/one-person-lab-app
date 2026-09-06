# OPL Link 产品与交付基线

Owner: `one-person-lab-app`
Purpose: `opl_link_product_and_delivery_ssot`
State: `frozen_pending_manual_restart`

## 结论

2026-09-06 起保留产品、冻结开发，等待用户明确手动重启。此前连续推进外部 TestFlight 的要求已被
替代；本轮只校正方案与源码基线，不继续登录、部署、探针或发布。执行策略归 App contract 的
`delivery_governance.execution_policy`，分阶段重启步骤归
[Link delivery plan](https://github.com/gaofeng21cn/opl-link/blob/main/docs/delivery-plan.md)。

OPL Link 是 OPL App 的独立原生 iOS 对话连接器。它让用户离开电脑后继续桌面端的 Codex
conversation/thread，不是移动版 OPL App、第二个 Codex runtime、第二个历史库，也不是 OPL
Flow、OPL Ledger 或 Linear 的任务控制面。

目标技术路线只有一条：

```text
iPhone OPL Link <-> Ably Free <-> Desktop OPL Connector
        \               /
         Cloudflare Workers Free + D1 Free
         邀请、配对、短期 JWT、设备授权与撤销
```

这条路线不要求用户电脑有公网 IP，不要求端口转发、VPN、Tailscale、Cloudflare Tunnel 或本机
常驻公网 Service，也不依赖 OPL Cloud、Cloud Candidate、TKE 或完整 Cloud 发布物。Workers 按请求
运行，D1 承担轻量控制面持久化；在免费额度内没有固定服务器费用，也没有 CloudBase 每 6 个月
续期一次的运维动作。

免费是受额度约束的验证目标，不是 20 pair 持续在线的费用保证。heartbeat、流式消息与投递都会
消耗额度，静默 APNs 也不能保证后台即时唤醒；重启时先实测预算、通知节流和撤销收敛。
托管服务并不能让离线电脑执行对话，桌面 OPL App 仍须在线。

Ably 是当前目标 provider，但尚未通过中国大陆网络探针，因此不能写成已经可用。实施前必须同时
验证 Ably realtime、Worker HTTPS/token refresh 和 Ably Push -> APNs 在移动、联通、电信与代表性
Wi-Fi 下的可达性和恢复行为。只有探针证据不达标时，才允许通过新的明确决策将一个 release cohort
切换为腾讯云 IM；不双写、不运行时自动 fallback，已有 pair 必须重新配对。

## 用户闭环

```text
安全配对 -> 查看对话列表 -> 打开对话 -> 阅读历史/流式输出
        -> 继续发送消息或停止当前 turn -> 前后台恢复后重新同步
```

首发闭环包括：

- 配对一台正在运行的桌面 OPL App；
- 查看桌面已有对话的标题、摘要、最近更新时间和当前状态；
- 在当前已加载的对话目录中按标题本地过滤，不冒充 canonical 全历史搜索；
- 打开对话，阅读历史和流式输出，继续发送文字或停止当前 turn；
- 新建对话并沿用桌面默认工作区、模型、权限和 Agent 配置；
- 处理桌面明确投影的低/中影响审批；
- 接收不含正文、路径、审批内容或密钥的通用更新提醒；
- 从任一端撤销 pair，阻止 token 续签；desktop 收到撤销信号后阻断命令并清钥，离线或信号丢失时
  按授权到期规则收敛。撤销中与已完成必须分开显示，不能承诺所有网络分区下立即 detach。

“任务”只可能是桌面对话的元数据、虚拟分组或可选的 OPL Flow/Ledger/Linear 外部引用。
OPL Link 不创建或管理 owner、deadline、dependency、stage、lifecycle 或工作流。

## Authority

| 主题 | 唯一 owner | 边界 |
| --- | --- | --- |
| 产品身份、用户结果、安全与发布门禁 | `one-person-lab-app` | 本文与 App contracts |
| iOS UI、Keychain、E2EE、transport adapter | `opl-link` | 不持有 canonical history |
| 桌面 Connector Package | `opl-link/packages/opl-link-desktop-connector` | 归类为 OPL Connect 的 `remote_companion_connector`；源码已存在，真实链路未验收 |
| Connector lifecycle/composition | OPL Framework runtime/Package/App projection scope 内唯一的 Cordis Host | 动态发现、托管并投影贡献；不进入 Studio DSH Host |
| Shell renderer 与 canonical App bridge | `opl-aion-shell` 或已准入 successor | 只渲染投影和桥接 read/action；当前 Connector 业务源码待迁出 |
| 邀请、配对、短期 JWT、设备授权与撤销 | `opl-link/service` on Workers/D1 | 不存对话正文或 pair master key |
| 实时密文与通用推送信号 | Ably | 不成为业务 truth |
| 对话历史、turn、模型与执行 | Codex App Server + 桌面 OPL runtime | 唯一 canonical authority |
| OPL Cloud | 可选 Workspace/WebUI host | 不是 Link 运行或发布前置 |

## OPL Connect 与桌面设置

OPL Link 整体不是 OPL Connect 的下属产品。只有把桌面 OPL App 接入远程对话链路的
`opl-link-desktop-connector` Package 属于 OPL Connect；OPL Link iOS App 与
`opl-link/service` 仍由 OPL Link 持有。OPL Connect 不接管它们的产品语义、远端服务、凭据、
对话历史或 provider 生命周期。

桌面 Connector 复用 OPL Framework 在 runtime/Package/App projection scope 内唯一的 Cordis Host。Shell 只渲染 Framework projection 并通过
canonical App bridge 执行动作，不长期拥有 Connector 业务逻辑，也不创建产品专用 Host。目标 Package、
Host ABI 和 bridge 已有源码与历史集成证据；既有 Shell Connector caller 切换及清理仍是缺口，
不能把历史安装证据表述为当前端到端可用。重启只绑定当时 active carrier，不强制所有 carrier 并行改造。

Connector 不创建顶级设置导航，而是用 App-owned `remote_companion_access` 标准声明式视图进入
`设置 > 资源 > 消息与连接`。微信等消息渠道继续使用独立的 `channel_access` 语义；OPL Link
不得因为不是 `channel_access` 而被 Shell 或 Host 过滤。只有 Package descriptor 当前、已安装、已启用且可调用，
Framework Host 已接入，贡献与 action refs 均有效时才显示。Connector 已就绪但尚未配对时显示
`pair.start`；Package 或 Host 未就绪时完全隐藏，不显示静态入口或占位。

普通界面只显示图标、名称、配对状态、设备、主要动作和必要详情；Package ID、carrier/trust 与诊断只在
开发者详情显示。微信消息渠道 Connector 与 OPL Link desktop Connector 是当前已明确的产品分类，
不是运行时白名单。Package 只贡献结构化数据和 action refs，不能下发任意 Swift 或 React UI；
`remote_companion_access` 的动作固定为 `pair.start`、`pair.refresh`、`pair.confirm`、`pair.cancel`、
`device.rename`、`pair.revoke`，不接受任意表单或 UI 输入。配对投影的状态固定为
`unavailable`、`unpaired`、`reserving`、`qr_ready`、`awaiting_confirmation`、`active`、`revoking`、
`attention`；邀请、短码、QR claim material 和 claim secret 只在当前交互瞬时出现，不进入缓存、日志或
App action readback，完整 QR payload 只允许在有界且未过期的 `qr_ready` 投影中出现。

TestFlight 只负责 iOS carrier 分发；用户准入和验证 cohort 由 `opl-link/service` 在 Cloudflare
Workers/D1 上的邀请与 pair admission 控制，不能用 TestFlight 名额代替。当前冻结的 validation
cohort 内容锁把 hard limit 设为 20、warning threshold 设为 15；这是该 cohort 的 admission
配置，不是 Ably/Tencent provider seat，也不是 TestFlight capacity。新 pairing 在 20 个已占用
admission 时必须由 D1 原子拒绝，达到 15 时由 service capacity readback 报 warning。

配对前必须读取并匹配 `opl-link/release-cohort.json` 的 environment、cohort、protocol、provider、
service origin、完整 `config_summary` 和 `config_digest`。任何 metadata 或 digest 不一致都在 claim
或 transport connection 前 fail closed。当前 lock 仍指向 validation 占位 origin；service 源码已存在，
部署、真实 provider reachability 和 TestFlight qualification 均未完成。

公共 activation/credential wire 只暴露 `transport_provider`、opaque `transport_credential`、
`key_epoch`、`credential_expires_at` 和 `push_recipient_id`。App、Shell、Framework 与 Codex core
不得解析 provider credential；只有选中的 `opl-link` provider adapter 可以解码它。

## 当前实现与目标的差距

已存在且可保留的当前源码：

- conversation-first SwiftUI 页面、E2EE envelope、Keychain/projection 和 deterministic 测试；
- provider-neutral credential、Ably Swift/TypeScript adapters 与桌面 Connector Package；
- Worker routes、D1 schema、原子 admission、scoped JWT 与 revoke 源码；
- Framework Host ABI、protected blob 与 Shell canonical bridge 的历史集成证据；
- 尚未清理的腾讯 IM adapters、Go + SQLite Service，以及旧 TestFlight carrier build 证据。

其中最后一项不符合当前目标架构。Tencent adapter、Go/SQLite Service 和 Shell 的 Tencent credential
wire 是 `active_gap`，不是首发方案、fallback 运行路径或发布前置；必须由 Ably adapter、
Workers/D1 control plane 和新的 provider-neutral credential wire 替换。旧源码在真实 caller
切换和纵向链路通过前保留，只用于迁移与回归，不得据此宣称目标已实现。

当前明确未完成：

- Ably + Worker endpoint 的大陆三网选择探针；
- 目标 Package 与当前桌面 carrier 的唯一真实 caller 切换、旧逻辑迁移与删除；
- Worker/D1 真实部署，以及消息预算、push 节流、撤销信号丢失和无人轮询时容量回收的验证；
- iPhone -> Ably -> desktop -> canonical action -> Ably -> iPhone 的真实密文往返；
- Ably Push/APNs 实机通知；
- clean install、跨端 pair、前后台恢复、三网和 TestFlight qualification。

## 发布流程纠正

此前的开发顺序有实质问题：公网鉴权端、稳定 endpoint、真实 provider、跨端配对和消息往返都没有
闭合，就先完成了 iOS 构建、签名与 TestFlight 上传。这个 build 对“OPL Link 是否能工作”的产品
验收没有意义，只能证明某个 iOS carrier 可以编译、签名和上传。把 carrier evidence 当能力完成，
会让团队在最关键的技术可行性尚未验证时继续投入 UI、资格和发布工作。

重启后仍按选择探针、最小真实纵向链路、功能面、release qualification 的顺序推进；
先部署 validation 才能执行网络探针，不能要求部署前提供依赖该部署的证据。
具体 Gate 与阶段终点只由 Link delivery plan 维护：先证明一对设备可行，再决定小范围自用，
外部 TestFlight 另行明确启动。阶段化不降低发布验收标准，也不要求一开始招满 20 pair。

任一源码、单元测试、签名、IPA 或 TestFlight 上传都不能越过前面的真实链路门禁。

## 方案取舍

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| Ably Free + Workers Free + D1 Free | 当前目标 | 无常驻服务器、免费验证、token/pair authority 清晰、维护面最小 |
| 腾讯云 IM | 条件备选 | 仅在大陆探针证明当前目标不达标后显式切 cohort |
| CloudBase 免费环境 | 保底，不是当前目标 | 每 6 个月手动续期会形成持续运维风险 |
| CloudKit | 不作实时主通道 | 同步延迟和系统调度不适合对话流式 transport |
| Durable Objects 自建消息层 | 不采用 | 自建重连、顺序、推送和消息语义的维护成本过高 |
| Cloudflare Tunnel + 本机 Service | 不采用 | 笔记本离线即全局服务消失，不符合产品预期 |
| OPL Cloud/TKE | 不采用 | 为 Link 部署完整 Cloud 过重，owner 和成本边界错误 |

机器边界见 [`contracts/app-remote-companion.json`](../../contracts/app-remote-companion.json) 与
[`contracts/app-remote-companion-wire.json`](../../contracts/app-remote-companion-wire.json)。
实现细节与 active gaps 由 `opl-link` 仓的 contracts 和 docs 持有。
