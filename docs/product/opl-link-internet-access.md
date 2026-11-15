# OPL Link 托管互联网接入

Owner: `one-person-lab-app`
更新日期：2026-11-15
机器合同：[app-remote-companion-internet.json](../../contracts/app-remote-companion-internet.json)

用户只在 OPL App 开启手机访问，再用 Link 扫码并核对电脑指纹。App 复用已有 OPL 账号，手机无需输入密码。
固定服务为 `https://link.medopl.com`；电脑与手机均建立出站 WSS。局域网、不同 Wi-Fi 和互联网采用同一流程，
不要求用户配置 Tailscale、VPN、Cloudflare、域名、证书、端口或路由器。

## 方案与复用

| 层次 | 当前选择 | 采用原因 |
| --- | --- | --- |
| 手机视觉与工作流 | DSH Go 参考，OPL 原生 SwiftUI | 中性雾蓝灰/石板灰、清楚状态、原生阅读与操作；不用绿色品牌风格 |
| 网络传输 | MIT DS Harness Remote 固定版本 | 复用成熟的 WSS、Relay、Noise IK、分片、连接恢复与公开 Host API |
| iOS 加密 | MIT swift-noise 固定版本 | 复用成熟 Noise 实现；与上游向量及真实 Node 密文逐字节互通 |
| 业务与授权 | 现有 Studio Link HTTP/SSE 和 Codex owner | 继续同一个 canonical thread、审批和工作区 |
| 托管与部署 | 独立 Link 容器，Instance 受保护工作流 | 复用现有 OPL 域名/TLS/集群，独立于 Cloud 业务与其发布 cohort |

此前推荐的 Tailscale Serve 向导已由本次“只在 App 与 Link 内配置”的用户目标取代。它以及 Cloudflare
命名隧道可作用户自选高级接入参考，不是默认方案或交付依赖。Cloudflare Quick Tunnel 的 SSE 限制也不再
阻挡当前 WSS + Noise 路线。

## 接入与隔离

App 现有账号 owner 通过私有 stdin 请求和独占 0600 凭据文件注册电脑；密码、Gateway bearer 与模型 Key
不进入 Renderer 或手机。Relay 通过 Gateway `auth/me` 验证身份，每个账号使用独立的原版 Gateway/Store。
`X-OPL-Account` 只用于路由，不能替代设备 bearer；设备目录、presence 和 peer 访问受同账号、相反角色及
精确 host-client grant 限制。

桌面创建 120 秒邀请与本机单次配对码。二维码唯一绑定服务、账号、电脑 ID、公钥、enrollment token、
claim code 和过期时间。手机确认电脑身份后，先 enroll 传输，再在固定公钥的 Noise IK 通道内 claim。
Relay enrollment 不授予对话权限；Relay 无法读取业务正文。每台电脑拥有独立的手机传输身份和 Keychain
凭据，更换电脑或撤销不会误伤其他电脑。

Studio 只组合官方 Remote lifecycle。固定虚拟 loopback 端口 43177 不监听 socket，只接 `/api/link` 手机
路由，不提供通用代理、终端、桌面管理或第二个 runtime。附件和下载各按 512 KiB 传输；事件有心跳和有界
读取。网络恢复先回读同一 canonical 状态，不自动重发发送、审批或停止，也不建立离线写队列。

## 实施与验收状态

源码实现已完成本地 Relay↔真实 DSH Host↔Swift 原生客户端的完整链路：扫码、Noise claim、同 thread、
多片附件、ETag 下载、SSE、重连及双层撤销。原生 App 的 Keychain、前后台和终止重开恢复已实跑；
Duo 公钥确认、键盘与草稿连续性检查通过。公网部署当前被 GitHub 私有源码/镜像读取授权阻挡：既有运行器凭据不可读，发布 App 对所请求只读权限集合返回 422。
GitHub 权限页需要本人 Passkey 重新验证，用户当前暂不能验证。专用静态 Store 已在已有工作节点准备完成，
未购买新服务器或云盘；Relay 服务尚未部署，iOS 公网测试尚未运行。恢复需核对最小只读权限并准备独立普通
隔离测试账号，再继续受保护 deploy/qualify 和 iOS 实测。详见[本轮验收记录](gui/evidence/opl-link-internet-acceptance-2026-11-15.md)。
已安装桌面 App、真实手机与 Apple 分发分别保留独立状态。

## 固定来源与许可

- [DS Harness Remote](https://github.com/liguobao/ds-harness-remote/tree/f214c5abb39434d0e8358956bfca8d4529981fee)：MIT；Studio Host bundle、协议、Relay Gateway/Store 保留原字节、来源与摘要。
- [swift-noise](https://github.com/swift-libp2p/swift-noise/tree/0adfd28786322784860fb3c8f228591c6e8fd92f)：MIT；使用 `Noise_IK_25519_ChaChaPoly_SHA256`，依赖锁定 revision。
- [DSH Go](https://github.com/ccch1mneyyy/dsh-Go)：视觉与移动工作流参考，不引入其账号、历史库或本机 runtime。
