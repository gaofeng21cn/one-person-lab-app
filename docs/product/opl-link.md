# OPL Link：OPL App 的 iOS 手机伴侣

Owner: `one-person-lab-app`
Purpose: `opl_link_product_and_delivery_ssot`
State: `active`

OPL Link 让用户离开电脑后，在 iPhone 或 iPad 上找到 OPL App 的已有对话、了解执行进展、
继续提问、回应审批与问题，以及预览和分享结果文件。桌面仍然持有同一个 Codex thread、模型、
权限、工作目录与工具。手机是原生操作和阅读界面，不运行第二个 Agent，也不建立另一份历史权威。

2026-11-15 用户重启开发，并授权按当前产品目标破坏性替换旧 Link 实现。旧代码的兼容与保留不再
构成本次要求。当前产品合同是 [`app-remote-companion.json`](../../contracts/app-remote-companion.json)，
跨端接口由 [`app-remote-companion-wire.json`](../../contracts/app-remote-companion-wire.json) 持有，
托管互联网连接由 [`app-remote-companion-internet.json`](../../contracts/app-remote-companion-internet.json) 持有。

## 设计目标

设计参考与工程复用分别决策。学习成熟产品的交互，不让候选代码的改造难度决定体验上限。

| 参考 | 采用的设计理念 | 在 OPL Link 中的表现 |
| --- | --- | --- |
| [DSH Go](https://github.com/ccch1mneyyy/dsh-Go) | 主要视觉参考，完整工作流、清楚的运行状态与成果交付 | 中性底色与清晰正文；区分执行、等待、失败和完成；支持插话与停止；结果文件具有预览、下载和分享动作 |
| [Fish Pocket](https://github.com/imsai-sh/fish-pocket) | 原生 iOS 交互参考 | 正文优先；过程默认折叠；审批与问题使用底部面板；采用 OPL 自己的视觉规范 |
| [Agents Anywhere](https://github.com/anywhere-labs/Agents-Anywhere) | 设备、项目和会话的清楚归属 | 当前设备和项目可见；从最近对话、项目分组或待处理请求进入工作 |

上述项目是设计参考，不因此引入其本机运行时、账号、云平台、品牌或受限素材。代码复用须单独核对
确切目录及授权；本轮原生客户端和 Studio 适配使用 OPL 自有实现、Apple 平台组件与许可适合的
成熟阅读组件。正文使用 MarkdownUI 渲染 GFM 表格、列表和代码块，代码支持复制；Markdown
和文本文件使用原生阅读路径，其他受支持格式使用 Quick Look，文件通过系统分享导出。

2026-11-15 用户指定 DSH Go 为主要视觉参考。OPL Link 采用中性表面、克制的交互强调色和原生
控件；品牌、连接和运行状态均不使用绿色强调。状态使用文字、图标及必要动态效果表达。

## iPhone Duo 与可变窗口

布局根据当前窗口可用空间和系统安全区调整，覆盖 Duo 外屏、展开内屏、旋转与窗口缩放。
展开后提供适合阅读和导航的分栏；窄窗口保留完整的单列工作路径。沿用系统导航和工具栏对
纵向状态区的适配，输入、审批与文件动作保持可达。

折叠、展开与尺寸变化保留当前电脑、canonical thread、草稿、待处理请求身份和阅读上下文。
专项验收使用真正的 iPhone Duo 模拟器运行，分别回读外屏、内屏、浅深色、放大字体、键盘与
审批面板；截图尺寸和 iPad 演示不能单独证明 Duo 适配。真机体验另行记录。

## 用户闭环

桌面在“设置 → 资源 → OPL Link”开启手机访问，复用已有 OPL 账号；需要登录时在 App 原有账号页完成。
桌面显示就绪后生成一次性二维码，手机扫码或粘贴链接，核对电脑指纹后进入对话。服务地址内置，
用户无需在 App 和 Link 之外安装软件、配置域名、证书、端口或隧道，手机无需输入账号密码。

用户从已有对话开始，也可以在选中的设备上新建对话。项目分组是对 canonical workspace 的只读
导航投影；本地置顶、草稿和阅读位置属于设备偏好，不重写 thread 历史或项目身份。

打开对话后先显示 canonical 历史，再接收同一个 App Server 的实时事件。工具过程默认折叠，正在
等待的审批和问题保持可见。用户可以继续发送、在运行中补充要求或停止当前 turn。现有对话沿用
桌面已确认的设置；模型和思考深度只在真实能力可用时提供显式选择，不隐式重置权限。

审批显示动作原因、对象与范围，并给出允许和拒绝；结构化问题保留选项、自由回答及明确提交。
只转发当前真实 pending request 支持的响应，不在手机生成额外授权或扩大权限。文件修改审批
展示对应请求的路径和 diff；取得完整范围后才提供允许按钮，否则保留拒绝与回电脑处理入口。

文件卡片帮助用户直接取走成果：报告、PPT、表格、图像等可预览和通过系统分享。引用文件、
本轮修改和本轮交付需要明确区分；工作区浏览不把目录中的所有文件都称为当前成果。下载始终
绑定 canonical thread workspace，保留真实路径与符号链接边界。

## 当前架构

```text
iPhone / iPad：原生 SwiftUI OPL Link
            │ 出站 WSS；电脑公钥固定的 Noise IK 加密业务通道
            ▼
OPL 托管 Link Relay：https://link.medopl.com
            ▲ 出站 WSS
            │
选中的 OPL Studio Host：配对、设备授权、有限 HTTP/SSE 与文件桥
            │ 现有 opl-codex-native / workspace service
            ▼
同一个 Codex App Server、thread、turn、审批与工作区
```

本轮用户批准的网络目标为 LAN/P2P→TURN→Relay 自动选路，同一扫码流程适用于局域网和互联网。
成功直连时，正文和文件由电脑与手机互传；TURN 及 WSS Relay 分别承担无法直连时的中继，
托管服务继续负责授权、在线状态、信令和撤销。目前上线情况以[直连验收](gui/evidence/opl-link-direct-first-acceptance-2026-11-15.md)为准。
电脑保持在线并运行 App；
电脑休眠或离线时，手机保留草稿并显示连接状态。无需入站端口、NAT 配置或同一局域网。

传输复用 MIT DS Harness Remote 的固定上游版本、WSS、Relay、Noise IK 和 `loopback.call`。
每个已认证账号使用独立的原版 Gateway 与 Store；scope header 只负责路由，设备 token 与精确
电脑—手机 grant 负责授权。Relay 保存公开设备身份、令牌摘要和连接映射，不保存账号密码、模型 Key、
对话正文或文件明文。端到端业务加密固定至扫码选择的电脑公钥；更换身份必须显式重新配对。

Studio 复用当前 DSH Application Host 的 lifecycle 和受限 `/api/link` 路由，不加载 `dsh-base`，
不另起 Codex App Server。进程内固定虚拟目标 `http://127.0.0.1:43177` 不监听端口，只接受手机
业务路由；桌面设备管理、通用 App action、Package 与任意 shell 均不经此桥开放。

大附件分为 512 KiB 上传片段，完成摘要核验后仅向 turn 传递绑定当前设备和精确 thread/workspace 的
`uploadId`。保留每文件 10 MiB、最多五个限制。下载采用 512 KiB 分段及 ETag/If-Match，最多 256 MiB；
文件变化时丢弃不完整结果。SSE 沿用同一 Host 的事件源，以有界读取承载；重连后先回读 canonical 状态。

现有可信 HTTPS 直连接口保留为高级入口；默认设置流程不要求用户填写 URL。Release 客户端拒绝明文
HTTP、无效证书和跨 origin 重定向；Debug loopback 只用于隔离验收。方案选择、上游来源与当前部署
证据见[互联网接入](opl-link-internet-access.md)。

## 配对、设备与恢复

桌面已认证用户创建 120 秒有效的单次配对链接。成功兑换后，Studio 签发 companion scope 的设备
凭据；手机写入 Keychain，Host 只持久化 token hash 与设备元数据。设备凭据有效期为 30 天。
配对码通过固定电脑公钥的 Noise 通道发送；Relay enrollment 只建立传输身份。手机的传输身份和凭据
按服务 origin、账号 scope、电脑 ID 分开保存在 Keychain。配对码、二维码和 bearer 不进入日志、
普通偏好或消息历史。桌面先持久撤销业务凭据、关闭事件流，再撤销 Relay 授权。手机先取得本机
撤销 ACK，再自撤 Relay token 并清除当前电脑凭据；未知结果保持可见且不自动重发。

每个 mutation 使用独立 request ID，Host 拒绝相同 ID 的不同操作。连接中断、超时或结果未知时，
手机显示真实的不确定状态并回读 canonical 对话，不自动重发消息、审批或停止动作。离线保留草稿，
禁用写动作；恢复后重新读取设备状态、目录、当前 thread 和 pending requests。

系统挂起后的即时更新不属于当前连接能力。回前台必须同步；小组件、Live Activity 或通知只表达
已取得的真实状态。没有推送服务时，不承诺 App 被结束后仍能即时收到进展。

## Owner 与交付

| 主题 | Owner |
| --- | --- |
| 产品定位、体验、安全边界与跨端 wire | `one-person-lab-app` |
| iOS/iPadOS UI、Keychain、客户端恢复和 Apple carrier | `opl-link` |
| 当前桌面 Host 的配对、设备鉴权、有限路由、事件和文件桥接 | `opl-studio` |
| 账号会话兑换与私有凭据文件桥 | `one-person-lab` 现有 Gateway account owner |
| 托管 Relay、账号隔离、传输令牌和容器源码 | `opl-link/service` |
| 受保护部署、持久化、Ingress/TLS 和公网资格 | `opl-instance-medopl` |
| canonical 对话、turn、模型、权限和审批 | 当前 `opl-codex-native` 与 Codex App Server |
| 文件内容、真实工作区及路径准入 | 现有 workspace owner |
| Package 与领域任务生命周期 | 原 Framework 与领域 owner |

验收顺序是产品与接口合同、Host 与客户端行为检查、原生构建、source Host 到模拟器的同一对话闭环、
真实界面审看。Demo 只用于界面状态；source 联调不代替已安装 App 或真机网络验收。

本次源代码与文档更新进入各 owner 的远端 canonical `main`。桌面安装更新、真实 iPhone 的 HTTPS
网络与前后台恢复、Apple 签名和公开分发分别回读，不由本地测试推导。当前任务不启动外部 TestFlight
或 App Store 发布。旧 Apple build 证据不证明 v2 的发布状态。

2026-11-15 已完成原生构建、界面审看与真实 Codex 到模拟器的同一对话续聊、前台恢复和文件正文
预览。详细范围与源码组合见[源码验收记录](gui/evidence/opl-link-native-companion-acceptance-2026-11-15.md)。

随后完成 DSH Go 视觉方向与真正 Duo 模拟器的外屏、展开、半开、旋转、键盘、草稿及审批
连续性检查；浅深色与辅助功能大字体检查同时修复了正文重复缩放、主按钮对比和问题面板高度。
普通 iPhone 与独立 iPad 保留代表路径回归。详细范围见
[视觉与 Duo 验收](gui/evidence/opl-link-dsh-go-duo-acceptance-2026-11-15.md)。这项模拟器资格
不改变桌面安装、真实 iPhone 网络与 Apple 分发的验收状态。

本轮托管互联网适配已完成源码、跨语言及本地原生闭环，容器已发布、现有节点专用静态 Store 已准备。
用户已完成 GitHub 验证并批准单包只读授权，公网服务已部署并通过固定镜像、工作负载及 HTTPS 健康回读。
专用零余额普通测试账号已创建，公网双账号隔离、加密往返与撤销断连已通过。
公网原生链路也已在 Duo 模拟器通过，业务执行使用隔离测试 fixture。当前传输仍为 Relay；直连优先的长期成本优化
推荐与实际差距见[连接方案评估](opl-link-connection-options.md)，尚未切换线上传输。
当前实证、恢复输入和边界见[托管互联网验收](gui/evidence/opl-link-internet-acceptance-2026-11-15.md)。
