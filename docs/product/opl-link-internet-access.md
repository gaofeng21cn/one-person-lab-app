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
Duo 公钥确认、键盘与草稿连续性检查通过。源码读取授权已恢复：既有发布 App 签发固定 Framework、Studio、Link 三仓的 `contents/actions: read` 短期凭据，
实际 workflow `43705995770` 通过。镜像读取改用 GitHub 官方的单包 Actions access：仅向 Instance 部署仓库
授予 `opl-link-service` 包的 Read，当前尚待用户确认，没有扩大原发布 App 的全仓权限。

Instance 已实现从 GHCR 固定摘要复制到现有私有 TCR，并在目标复验完整来源；运行时只使用 TCR 凭据，
避免依赖一小时有效的工作流令牌和节点镜像缓存。该路径已完成源码检查，仍待授权后的真实部署回读。
专用静态 Store 已在已有工作节点准备完成，未购买新服务器或云盘。公网 Relay 尚未部署，iOS 公网测试尚未运行。
另一项隔离验收前提是独立的普通测试账号，仍未创建。详见[本轮验收记录](gui/evidence/opl-link-internet-acceptance-2026-11-15.md)。
已安装桌面 App、真实手机与 Apple 分发分别保留独立状态。

## 安全、稳定性与登录边界

互联网中继入口为 `link.medopl.com`。`gateway.medopl.com` 在桌面初次启用时确认已有 OPL 普通用户身份；
手机扫码授权，不输入账号密码。当前中继准入只检查 active/user 身份，不要求模型余额或指定模型渠道。
`cloud.medopl.com` 是云平台界面，与中继承担不同职责。

服务与 Cloud 共用现有工作节点，因此进程、存储和网络权限隔离不能消除主机故障的共同影响。当前部署为单副本，
Local PV 绑定节点，不宣称高可用。主机或中继离线会中断手机通道；已有桌面会话及文件仍由用户电脑持有。

初始部署配置将账号容量收紧为 32，保留 0.5 核 CPU、1 GiB 内存及 128 总连接上限。原版 Store 每账号
已有 256 设备和 16,384 token records 的边界；按完整序列化上界估算，32 账号状态约 155 MiB，原子写入额外
约 5 MiB。1 GiB PVC 是容量声明，不是文件系统硬配额。具体数值与执行准入由
[Instance 部署合同](https://github.com/gaofeng21cn/opl-instance-medopl/blob/main/deploy/contracts/link-service.json)持有。

上线流程会重新检查容量，记录可获得的真实 CPU/内存用量，验证服务健康、双账号隔离、撤销、重连和原生公网链路。
指标不可用会保留未知状态。当前没有证据证明专用磁盘告警或高可用恢复已经安装，不将源码配置当作运行验收。

## 固定来源与许可

- [DS Harness Remote](https://github.com/liguobao/ds-harness-remote/tree/f214c5abb39434d0e8358956bfca8d4529981fee)：MIT；Studio Host bundle、协议、Relay Gateway/Store 保留原字节、来源与摘要。
- [swift-noise](https://github.com/swift-libp2p/swift-noise/tree/0adfd28786322784860fb3c8f228591c6e8fd92f)：MIT；使用 `Noise_IK_25519_ChaChaPoly_SHA256`，依赖锁定 revision。
- [DSH Go](https://github.com/ccch1mneyyy/dsh-Go)：视觉与移动工作流参考，不引入其账号、历史库或本机 runtime。
