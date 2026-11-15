# OPL Link：OPL App 的 iOS 手机伴侣

Owner: `one-person-lab-app`
Purpose: `opl_link_product_and_delivery_ssot`
State: `active`

OPL Link 让用户离开电脑后，在 iPhone 或 iPad 上找到 OPL App 的已有对话、了解执行进展、
继续提问、回应审批与问题，以及预览和分享结果文件。桌面仍然持有同一个 Codex thread、模型、
权限、工作目录与工具。手机是原生操作和阅读界面，不运行第二个 Agent，也不建立另一份历史权威。

2026-11-15 用户重启开发，并授权按当前产品目标破坏性替换旧 Link 实现。旧代码的兼容与保留不再
构成本次要求。当前产品合同是 [`app-remote-companion.json`](../../contracts/app-remote-companion.json)，
跨端接口由 [`app-remote-companion-wire.json`](../../contracts/app-remote-companion-wire.json) 持有。

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

桌面生成一次性二维码，手机扫码或粘贴链接，确认连接后进入对话。连接前不要求用户理解插件、
消息提供商和协议。设备管理与高级网络说明位于设置。

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
            │ 已认证 HTTPS JSON + SSE
            ▼
选中的 OPL Studio Host：配对、设备授权、有限动作与事件
            │ 现有 opl-codex-native / workspace service
            ▼
同一个 Codex App Server、thread、turn、审批与工作区
```

Studio 复用当前 DSH Application Host 的 HTTP 路由和 lifecycle，不加载 `dsh-base`，不另起
Codex App Server。手机只访问 `/api/link` 下的受限接口；设备 bearer 无权调用通用 App action、
配置、Package 安装或任意 shell。通用 `remote_companion_access` Package 贡献仍可服务其他
provider，OPL Link v2 的运行不依赖该贡献或另一个 Framework Connector Package。

网络前提是手机可访问的、使用系统信任证书的 OPL HTTPS 入口，可复用现有 WebUI 部署与用户信任的
HTTPS 代理。当前架构不提供自动 NAT 穿透，也不另外建立消息中继或云端配对服务。配置和实际
访问必须指向同一台选中的 OPL Host，不能把另一个云端实例当作原桌面的对话。

降低首次设置成本的后续接入方案见[互联网接入研究](opl-link-internet-access.md)。当前优先评估
Tailscale Serve 向导；DSH Go 的账号发现、P2P 与中继提供长期体验参考。这些方案尚未接入本版，
现有网络前提继续有效。Cloudflare Quick Tunnel 不支持 SSE，不能直接作为本版的一键入口。

HTTPS 的 TLS 终点属于用户信任边界；若采用反向代理，该代理处于此边界内。本路线不宣称跨第三方
中继的应用层端到端加密。Release 客户端拒绝明文 HTTP、无效证书和跨 origin 重定向；仅 Debug
验证允许双方明确开启的 loopback HTTP，不开放普通局域网明文连接。

## 配对、设备与恢复

桌面已认证用户创建 120 秒有效的单次配对链接。成功兑换后，Studio 签发 companion scope 的设备
凭据；手机写入 Keychain，Host 只持久化 token hash 与设备元数据。设备凭据有效期为 30 天。
配对码、二维码和 bearer 不进入日志、普通偏好或消息历史。桌面可查看并撤销设备；撤销同时拒绝
后续请求并关闭该设备的事件流。手机断开连接也撤销自身授权。

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
