# OPL Link 原生手机伴侣源码验收

日期：2026-11-15

产品 Owner：`one-person-lab-app`

OPL Link 已按原生 iOS 手机伴侣重新实现。手机连接选中的 Studio Host，读取并继续同一个
Codex 对话，处理该对话的待审批请求，浏览、预览和分享工作区文件。

## 产品和实现

App 的 [产品合同](../../../../contracts/app-remote-companion.json) 与
[wire 合同](../../../../contracts/app-remote-companion-wire.json) 持有产品及跨端边界；
[产品文档](../../opl-link.md) 说明设计参考、体验、网络前提和交付范围。

| Owner | 本轮成果 |
| --- | --- |
| `one-person-lab-app` | 更新产品、页面状态、移动端 topology、安全与 wire；替换旧方案的专属校验与断言 |
| `opl-studio` | 同一 DSH Host 内的配对、设备凭据、限定动作、SSE 和文件桥；原生设置入口及接入指南 |
| `opl-link` | SwiftUI iPhone/iPad 客户端、Keychain、设备与项目导航、对话与请求、文件阅读；原生源码 CI |

旧 Link 的 Ably/Tencent transport、Worker/D1、Go Service、独立 Connector Package 与旧
cohort 配置已从当前实现移除。设计学习 Fish Pocket、DSH Go 和 Agents Anywhere；正文阅读复用
MarkdownUI，文件预览与分享复用 Apple 系统组件。

本次验证的源码组合：

| Owner | 源码提交 |
| --- | --- |
| Studio / DSH rc.3 | [`728c2a3334615e523a656d9feba2cccd71cc385e`](https://github.com/gaofeng21cn/opl-studio/commit/728c2a3334615e523a656d9feba2cccd71cc385e) |
| iOS / iPadOS | [`fb0aa6a4e98598f283f8e653c2d33f0492ec9623`](https://github.com/gaofeng21cn/opl-link/commit/fb0aa6a4e98598f283f8e653c2d33f0492ec9623) |

## 已执行验证

| 层次 | 验证与结果 |
| --- | --- |
| App 合同 | 28 项相关产品、wire、generic Package 与 Connect 测试通过；补充 wire 明确附件和请求限额后，12 项 companion focused tests 通过 |
| App / Shell | 完整 `bun run validate:active-shell` 通过，包含 Studio typecheck、Node suites、UI consumer 与候选一致性检查；App 与 release typecheck、GUI design-system 检查通过 |
| Studio HTTP | 在最新 DSH rc.3 上，真实 HTTP Host 与隔离 synthetic Codex 子进程验证配对、同 thread 动作、SSE、附件、审批、下载、撤销、权限隔离和 shutdown；42 项相关检查全部通过 |
| Studio 设置 | 实际设置组件、production WebUI bridge 与真实 HTTP Host 完成 QR 生成、claim、设备显示、撤销后 401；430px 窄屏无横向溢出 |
| iOS core | Swift 状态、配对、安全、请求范围、草稿和 SSE 字节帧测试通过；Release 模式验证从持久化解码的 loopback HTTP 地址仍被拒绝 |
| 原生界面 | iPhone 与 iPad 竖屏 UI tests、截图回读通过；正文表格、列表、代码复制、折叠过程、审批底部面板及文件卡片已审看 |
| 真实跨端 | 真实 Codex 产生 `OPL_LINK_SOURCE_OK` 后，手机在同一 thread 续发并得到 `OPL_LINK_IOS_OK`，Host 回读确认；最终 rc.3 Host 上再次完成 fresh 配对、既有回复回读、Home/active 后重新同步、78 字节文件下载及 Markdown 正文断言，未重复发送 turn |

Synthetic Codex 测试覆盖审批、附件和失败分支；真实 Codex 联调使用任务专属工作区及对话。
Demo 截图只验证界面表达，不能作为实际文件交付或执行成功证据。

真实配对使用正常本地 ad-hoc 签名的 Simulator App 以访问 Keychain；无签名的 CI 构建只验证
编译。联调修复了 SSE 空行帧解析、前台恢复、取消回调、旧审批 scope 与发送期间草稿保留问题；
Markdown 文件正文使用原生阅读组件，其他受支持格式保留 Quick Look 路径。

## 网络与分发边界

本次交付到各仓远端 canonical `main`，不触发桌面产品安装或 Apple 分发。普通手机连接需要
系统信任证书的 HTTPS 地址，并且该地址实际到达选中的 Studio Host。用户信任的 TLS 代理处于
连接信任边界内；当前方案没有自动 NAT 穿透或独立云 relay。

真实 iPhone 到指定 HTTPS 入口、国内移动网络、休眠后的恢复、相机扫码、Apple 签名及公开
分发均保留为独立验收。模拟器使用双方显式启用的 Debug loopback HTTP。

运行状态继续保持 `installed_desktop_updated=false`、`real_iphone_qualified=false`、
`public_beta_or_app_store_published=false`、`release_ready=false`。

后续托管互联网适配已复用 DS Harness Remote WSS/Noise；本文记录前一源码资格范围，当前接入以[互联网合同](../../../../contracts/app-remote-companion-internet.json)与[现行文档](../../opl-link-internet-access.md)为准。
