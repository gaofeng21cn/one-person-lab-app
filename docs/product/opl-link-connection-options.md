# OPL Link 连接方案与长期成本评估

Owner: `one-person-lab-app`  
核对日期：2026-11-15  
范围：技术选型建议；当前线上能力仍以[互联网接入合同](../../contracts/app-remote-companion-internet.json)和[验收记录](gui/evidence/opl-link-internet-acceptance-2026-11-15.md)为准。

## 建议

优先复用 DSH Remote 已有的 WebRTC 选路：局域网和互联网 P2P 直连优先，无法直连时使用中继兜底。
OPL 服务继续持有账号、配对、在线状态、信令和撤销；成功直连的业务密文由手机和电脑互传。
用户仍在 App 开启手机访问、Link 扫码，不选择协议、不填写网络参数，也无需注册额外账号。

这一方向最符合现有代码、原生交互和长期流量成本，应优先采用；当前尚未实现 OPL 的 P2P。
运营商 NAT 和企业防火墙会影响打洞成功率，保留中继才能覆盖这些网络。
第三方 TURN 可作为中继运营选项，其选择取决于中国大陆实测和正式计费条件；不因公开免费额度就提前绑定。

## 现有项目实际采用什么

| 项目或方案 | 已核实的通信方式 | 对 OPL 的意义 |
| --- | --- | --- |
| [DSH Go](https://github.com/ccch1mneyyy/dsh-Go/blob/c6d2f9cccd229710e607b14fd1495887e20dceb0/docs/guide/zh/03-engine-hosts.md) | DSH Remote 默认自动尝试 LAN/P2P、TURN，再回落 Relay；另有 SSH 入口 | 最贴近用户要求，直连无需额外开关或组网 App |
| [DSH Remote](https://github.com/liguobao/ds-harness-remote/blob/f214c5abb39434d0e8358956bfca8d4529981fee/docs/network.md) | 同一控制协议协调 LAN→P2P→TURN→Relay，各路径均保留 Noise | 我们已固定复用的同一版上游就具备这些能力，可继续复用 |
| [Fish Pocket](https://github.com/imsai-sh/fish-pocket#远程控制) | 远程会话接入 Agents Anywhere，手机与电脑的数据经其服务器转发，可官方托管或自建 | 更换到这一方案仍有中继流量，不能解决“尽量直传”的目标 |
| [Tailscale/tsnet](https://tailscale.com/docs/features/tsnet) | 内嵌用户态节点可建立 tailnet 连接；[libtailscale](https://github.com/tailscale/libtailscale)提供 C 库 | 可作自带网络的高级选项；账号、tailnet 隔离、Apple 集成和商业服务条件带来额外接入工作 |
| [UU 远程开放协议](https://github.com/netease-uuyc/uuremote-integration-guide/blob/181dee4540a8e4161a65e1053fbcf6ad223d24f8/README.md) | 通过 URL Scheme 拉起 UU App，绑定 Windows/macOS，发起全屏或 PiP 远控 | 可提供“查看电脑桌面”的附加入口，公开协议未提供通用 TCP/HTTP/数据通道 |

DSH Remote 的最小自托管 Server 已支持信令、STUN/TURN 配置和 Relay；完整托管网站并未全部开源。
采用其协议和 MIT 代码，不等于可以免费依赖作者的托管流量、私有网站实现或运营承诺。
见[上游 Server 范围](https://github.com/liguobao/ds-harness-remote/blob/f214c5abb39434d0e8358956bfca8d4529981fee/apps/server/README.md)。

UU 当前公开的是跨 App 交互：手机需安装 UU，电脑也需有其可被控客户端与账号设备。iOS/Android 最低 UU 版本
为 4.42.0，iOS PiP 另需 iOS 18 及设备支持。它没有公开供 Link 原生会话、审批和文件 API 复用的网络隧道；
通过远控画面操作电脑会改变 Link 的产品体验。没有把未核实的企业私有 SDK 或免费商用条件计入本次推荐。

## 第三方服务能减少多少运营负担

[Cloudflare Realtime TURN](https://developers.cloudflare.com/realtime/turn/)可直接为标准 WebRTC 提供托管中继，
由 OPL 后端获取短期凭据，用户不需要 Cloudflare 账号。它是值得实测的中继候选。
其[公开定价](https://developers.cloudflare.com/realtime/sfu/platform/pricing/)为每月前 1,000 GB 免费，
SFU 与 TURN 共享额度；超额按 0.05 美元/GB 出方向流量计费。

官方[FAQ](https://developers.cloudflare.com/realtime/turn/faq/)明确其 TURN 不使用中国大陆网络节点；
大陆用户连接境外节点。国内实际可达性、延迟、丢包及流量账单尚未测试。因此它可减少自营中继维护与带宽费用，
当前不能据此认定它是大陆用户最稳、总成本最低的兜底。

Tailscale 的客户端开源许可与托管服务套餐分别判断。其[价格页](https://tailscale.com/pricing)当前列出
Standard 8 美元/用户/月，Personal 免费套餐限非商业用途；这些价格不能直接等同于向 OPL 全部用户嵌入服务的授权。
用户自带 tailnet 可以作为高级接入；统一托管为产品默认还需确认服务条件与逐用户隔离。

自建 coturn 也能复用成熟实现，但其转发流量仍由我们支付，并增加 UDP/TCP 入口、端口范围和运行维护。
当前已有合格 WSS Relay，首个直连版本可以先以它兜底；无需为了尝试 P2P 先采购新资源或再部署一种中继。

## 成本按实际中继字节计算

令 `D` 为一个月业务总传输量，`r` 为按字节计算的中继比例，`p` 为中继实际出方向单价。
带宽成本近似为 `D × r × p`，另计信令、协议开销及适用的负载均衡费用。
目前 Relay-only 的 `r` 为 100%；若实测 90% 的字节直传，中继数据量约降到原来的 10%。这是一种情景计算，
不是已经测得的打洞成功率。连接数量占比不能替代字节占比，少数大文件连接就可能决定主要费用。

把中继交给第三方只改变由谁运营、按什么费率结算；P2P 才能让成功直连的正文和文件绕过中继数据面。
现有腾讯云实例的真实公网计费模式尚未取得账单证据，不把市场示例价格写成实例费用。

## OPL 接入差距与验证边界

当前实现不能通过改一个开关就变成 P2P，实际差距涉及三个 owner：

1. **Studio Host**：`src/host/link-internet.mjs` 显式 `forceRelay: true`，且没有注入 `rtcFactoryProvider`。
   应接入上游已有 RTC provider 和 lifecycle，继续只开放现有 Link loopback 业务路由。
2. **iOS Link**：`Sources/LinkCore/RelayTransport.swift` 只声明 `transport.relay`，连接偏好只有 `relay`。
   需要原生 WebRTC DataChannel adapter，复用现有 Noise、分片、RPC 和恢复逻辑；不自行实现 ICE/NAT 穿透。
   WebRTC 上游已有 [Apple DataChannel API](https://webrtc.googlesource.com/src/+/dc4c019c62abefc09e4903abea44bc36f3427452/sdk/objc/api/peerconnection/RTCDataChannel.h)，具体可持续更新的二进制来源、Apple 构建和许可归 Link owner 核定。
3. **Link service / Instance**：当前 wrapper 禁用 TURN，未暴露 ICE 配置入口。应复用上游授权信令与
   `/api/v1/turn/credentials` 语义，保证账号 scope、设备 bearer、连接参与者及 host-client grant 一致；
   第三方服务密钥仅留在后端，客户端只获短期凭据。额外 provider 采购或网络端口变更按部署边界处理。

固定电脑公钥、Noise 加密、业务授权、撤销和未知操作不重放必须在所有路径一致。服务器仍负责授权与协调，
成功 P2P 不代表可以永久停掉控制服务。网络切换时重建传输及 Noise 并回读原会话，不承诺未知写操作无缝迁移。

候选应在同一 LAN、家庭宽带到移动网络、跨运营商、限制 UDP 的网络及切网场景实测。
结果按真实候选路径、首连时间、文件吞吐、恢复行为、按字节直连比例和实际费用判断；
当前公网 Relay 验收不证明 P2P 或第三方 TURN 已通过，也不以配置存在代替实际选中直连。
