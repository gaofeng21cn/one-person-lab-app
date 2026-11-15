# OPL Link 互联网接入研究

核查日期：2026-11-15。结论来自当前上游源码、作者文档及官方服务文档；本项研究未登录外部服务、未启动公网隧道；当前 Link 接入实现继续使用既有 HTTPS/JSON/SSE。本轮的 Duo 与视觉改动单独验收。

**现成产品里，DSH Go / DS Harness Remote 的“登录已有账号→选在线电脑”最易用；近期 OPL 最合适的简化是 Tailscale Serve 向导。** 前者已经把主机发现、加密、选路和中继做成产品，但其默认业务协议与 OPL 不同。后者能继续使用 OPL 当前同一 Host 的 HTTPS/JSON/SSE，不需要新建 OPL 账号、服务器或历史库。用户仍需一个 Tailscale 账号，首次在电脑和手机各登录一次。

## 普通用户实际要做什么

| 路线 | 首次操作和前提 | 以后使用 | OPL 当前适配情况 |
| --- | --- | --- | --- |
| DSH Go 的 DSH Remote | 电脑安装 Remote 插件并登录；手机用同一 GitHub/Google/知乎等账号登录；选电脑并核对首次指纹。支持的服务器另可扫码，但 Go 的扫码路径还涉及 DeepSeek 登录与验证码 | 主机发现、自动重连，自动尝试 LAN/P2P→TURN→Relay；免域名、免个人公网 IP | 当前不能直接接；它返回 DSH Typert/Session V3 客户端。可借鉴完整体验、复用协议组件，业务必须仍接 OPL 的现有 Codex owner |
| dsh-pocket 快速隧道 | 电脑插件中点开启，自动准备 cloudflared；手机扫码、输访问密码。无需 Cloudflare 账号或自有域名 | 临时域名重启会变，失效后需重扫；原项目实时通道使用 WebSocket | 当前 OPL 的 SSE 不兼容 Quick Tunnel，不能照搬“一键公网”承诺 |
| Cloudflare 命名隧道 | 用户注册 Cloudflare、准备其管理的域名、创建 Tunnel/hostname，再把 token 配到电脑；手机扫码 | 固定 HTTPS 地址；手机无需额外 VPN App | 能承载现有协议，仍要设置可信代理并只开放 companion 接口。首次配置比 Tailscale 多 |
| Tailscale Serve | 电脑、手机安装 Tailscale 并登录同一 tailnet；同意开启 HTTPS；桌面配置专属 Serve 入口；手机扫 OPL 配对码 | 稳定 `*.ts.net` 地址，蜂窝网络也可用；保持 Tailscale 连接 | 对现有原生 iOS 改动最小。系统 URLSession、现有配对和 SSE 均可保留；不新增 OPL 云服务 |

Tailscale Serve 是经互联网连接的**私有网络访问**，手机必须加入 tailnet。Tailscale Funnel 才是公开互联网入口，手机可不装 Tailscale；但它另有授权、限带宽与 macOS CLI 版本要求，本轮没有验证其持续 SSE，不作为默认替代。

## 可直接复用与需要适配的边界

**当前可直接采用：连接步骤和成熟网络产品。** 把桌面上的空 URL 输入框改为“检测 Tailscale→登录/授权→开启手机访问→已就绪→扫码”；用户自有 HTTPS 地址保留为高级入口。现有 OPL Link 身份、requestId、防重放、审批和 Codex 会话均继续使用。Tailscale 的控制与网络服务由 Tailscale 提供，用户不需要自建；这不等于“没有第三方账号或云服务”。

**需要薄适配：MIT 的 `hxt9805/dsh-remote-tailscale`。** 它已有独立端口 Serve 命令、状态读取、健康探测、退避和只撤销自身映射的实现，适合借用这些网络管理部分。整个插件依赖 DSH `connection`，还会将 Host/Origin 改写为 loopback，不能原样装入 OPL。应在现有 Cordis Host 生命周期内接入，保留 OPL 的设备 Bearer、可信代理与 `/api/link` 范围，不能顺手放通完整 `/api`。`YiYan129600/dsh-mobile-access` 的逐项诊断体验也值得参考，但源码包含 Windows UAC、旧版 wildcard bind 和旧 Serve 命令，不能整包作为当前 macOS 实现。

**原生 iOS 后续候选：官方 `tailscale/libtailscale` 的 TailscaleKit（BSD-3-Clause）。** 它有 Swift 6 API、iOS/Simulator 构建和 `URLSessionConfiguration.proxyVia`，可把 tailnet 连接嵌入 OPL Link，省掉手机独立 VPN App，同时保留现有 HTTPS/SSE。仍需 Tailscale 登录和设备授权。当前源码没有打包 PrivacyInfo.xcprivacy，且上游仍有 iOS 休眠/LocalAPI 流相关未关闭问题；“有 SDK”尚不等于已验证可分发。近期可先使用官方独立客户端，后续做一个有界原型决定是否内嵌。

**DS Harness Remote 可复用网络层，整体接入属于较大适配。** MIT 的 `protocol`、`crypto`、`client-core`、`webrtc` 已覆盖 Noise IK、Control WebSocket、分帧、身份固定和路径回落。其 iOS 客户端目前来自 Expo/React Native，同目录 `apps/android` 已有 iOS 构建配置和内测，未发现可直接导入 SwiftUI 的 Swift SDK。DSH Go 的 Dart 端口有逐文件 MIT 标注；Go 整体 App 是 AGPL-3.0，不能把“部分 MIT”理解为整套界面可任意复制。

Remote 还提供 `loopback.call` 的 HTTP/WS 预览通道，但默认插件激活要求 `settings + connection + typertGateway`，OPL 当前没有这一整套普通 DSH 会话负责人。其预览 POST 上限 1 MiB、HTTP 流总上限 64 MiB，并剥离 forwarded proto，与 OPL 当前 10 MiB 附件和 HTTPS 校验也不直接相容。上游已导出 `HostPluginRuntime`，可研究用现有类组成薄 Cordis adapter，关闭其 Codex/ACP 域；其 `CodexRemoteDomain` 自己创建 App Server，不能接管 OPL。采用网络栈时仍应连接现有 OPL Companion owner，不能再造 runtime、历史或权限系统。

## SSE 与国内网络的确证

Cloudflare 官方当前 Quick Tunnels 文档（2026-09-30 更新）仍明确：**不支持 SSE**；临时域名会变、最多 200 个进行中请求、无 uptime 保证，新增邮件保护只支持交互浏览器。dsh-pocket 使用 WebSocket 实时透传，因此它的体验不证明 OPL SSE 能用。改成 WebSocket 事件通道可避开这一项限制，但仍不能解决临时地址和在线稳定性，适合作为明确的临时访问模式，不能冒充“永久配好”。

本轮没有大陆移动/电信/联通的真机跨网长测，不能宣称任何一路“国内稳定”。dsh-pocket 源码/FAQ记录了 cloudflared 注册丢失、1016/1033/530、本机代理干扰及下载镜像的具体处理；这些证明真实接入摩擦，不能外推所有用户网络。DSH Go 公开验证主要是本机隔离服务器与 Android 模拟器，最新说明仍将真实 WAN NAT、真实 TURN、蜂窝网和 OEM 真机列为另需验收。Remote 的兼容文档也把长网络运行和原生 iOS 完整流程列为待办。`.cn` 域名和“全球节点”宣传都不能代替大陆可达性实测。

## 建议顺序和成本

1. **近期交付 Tailscale Serve 接入向导**，让用户不再处理域名、证书和端口说明。复用上游 MIT 网络管理代码，保留 OPL 协议；对 iOS 主要是安装/连接引导与可达性提示。实现以桌面 Host 的网络接入向导为主，另需真实 iPhone 蜂窝、休眠和切网验收。已有 Tailscale 的用户操作最少。
2. **评估内嵌 TailscaleKit**，将手机端收敛为“在 Link 登录→选电脑/扫码”。这是保持现有业务协议前提下更自然的原生目标。先通过原型验证分发、休眠和流式连接，再决定固定依赖版本。
3. 若目标明确要求**用户完全不用网络软件、无需理解 tailnet**，采用 DSH Remote 的账号发现/加密 Relay 产品理念，并优先争取可维护的 owner 适配扩展；不要为此维护第二个会话系统。SwiftUI 需要接入加密、Relay 及设备身份；完整自动选路还包含原生 WebRTC/TURN、回落、撤销、切网和分发验证。使用其托管 Server 要依赖第三方账号/服务；自托管要自己运行 HTTPS Remote Server，P2P/TURN 还需 STUN/coturn。这些候选尚未在 OPL 内执行原型。

本轮实际验证：已 clone 固定版本并检查源码；对 Tailscale 插件运行了 **21 项隔离的假进程/本地代理测试，全通过**，没有调用真实 Tailscale。未验证第三方托管服务登录、真实公网、iOS SDK 构建或运营商网络。

## 主源与固定源码入口

- [DSH Go `1c465301`](https://github.com/ccch1mneyyy/dsh-Go/tree/1c465301caae9b9c786d4a1fbd7b3e40878a0f63)：`docs/guide/zh/03-engine-hosts.md`、`packages/dsh_remote/README.md`、`packages/dsh_remote/lib/src/account/remote_account.dart`、`packages/dsh_remote/lib/src/carrier/tunnel_carrier.dart`、`docs/testing/remote-auto-network.md`、`THIRD_PARTY_NOTICES.md`。
- [DS Harness Remote `e285ec24`](https://github.com/liguobao/ds-harness-remote/tree/e285ec2442d147324f1154f9ed501c786c78767e)：`README.zh.md`、`docs/compatibility.md`、`apps/server/README.zh.md`、`packages/plugin/src/index.ts`、`packages/plugin/src/codex/domain.ts`、`packages/plugin/src/loopback-host.ts`、`packages/protocol/src/loopback.ts`。iOS 作者说明：[内测 issue #20](https://github.com/liguobao/ds-harness-remote/issues/20)。
- [dsh-pocket `b8eca374`](https://github.com/shaobeichen/dsh-pocket/tree/b8eca37461ca8cfad10c08fd9ede2cdb03bec1bb)：`README.md`、`lib/tunnel.mjs`、`lib/proxy.mjs`；GPL-2.0，适合参考体验，直接复制需按其许可处理。
- [Tailscale 插件 `1d3319d0`](https://github.com/hxt9805/dsh-remote-tailscale/tree/1d3319d0ebc6be6af0142462530e9430f664fdaf)：MIT；`lib/tailscale.js`、`lib/proxy.js`、`lib/index.js`、`test/dsh-tailscale.test.js`、`test/optin.test.js`。
- [手机接入向导 `15812c8a`](https://github.com/YiYan129600/dsh-mobile-access/tree/15812c8ad76b675c8e10d1ef20910179a79486fe)：MIT；`lib/index.js`。
- [libtailscale `dacde750`](https://github.com/tailscale/libtailscale/tree/dacde75057ff350e146505829beff446e6823966)：BSD-3-Clause；`swift/README.md`、`swift/TailscaleKit/URLSession+Tailscale.swift`、`swift/Makefile`、`go.mod`。相关上游问题：[休眠恢复 #21353](https://github.com/tailscale/tailscale/issues/21353)、[框架分发 #20992](https://github.com/tailscale/tailscale/issues/20992)、[LocalAPI 长连接 #21220](https://github.com/tailscale/tailscale/issues/21220)。问题当前未关闭，不代表全部现象已由本轮重现。
- 官方现行服务要求：[Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)、[Cloudflare Tunnel 的 SSE 对照](https://developers.cloudflare.com/sandbox/api/tunnels/)、[Cloudflare 命名隧道](https://developers.cloudflare.com/tunnel/setup/)、[Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)、[Tailscale Funnel](https://tailscale.com/docs/features/tailscale-funnel)、[Cloudflare China Network](https://developers.cloudflare.com/china-network/)。免费 Tunnel 不等于 Cloudflare Enterprise 的 China Network 加速产品。
