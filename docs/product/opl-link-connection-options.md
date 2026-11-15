# OPL Link 连接方案与长期成本评估

Owner: `one-person-lab-app`  
核对日期：2026-11-15  
范围：用户已批准的技术路线与复用依据；当前线上能力仍以[互联网接入合同](../../contracts/app-remote-companion-internet.json)和[直连验收记录](gui/evidence/opl-link-direct-first-acceptance-2026-11-15.md)为准。

## 建议

优先复用 DSH Remote 已有的 WebRTC 选路：局域网和互联网 P2P 直连优先，无法直连时使用中继兜底。
OPL 服务继续持有账号、配对、在线状态、信令和撤销；成功直连的业务密文由手机和电脑互传。
用户仍在 App 开启手机访问、Link 扫码，不选择协议、不填写网络参数，也无需注册额外账号。

用户已批准这一方向，并要求把 TURN 一起接入，完整顺序为 LAN/P2P→TURN→Relay。源码和本地三路径已实现并验收，公网默认回退已通过，生产 TURN 仍在部署验收。
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
当前已有合格 WSS Relay，作为最后兜底保留。TURN 优先利用现有合法资源，并沿用上游短期凭据接口；
额外实例或付费套餐采购不属于本轮授权。

## 成本按实际中继字节计算

令 `D` 为一个月业务总传输量，`r` 为按字节计算的中继比例，`p` 为中继实际出方向单价。
带宽成本近似为 `D × r × p`，另计信令、协议开销及适用的负载均衡费用。
原 Relay-only 的 `r` 为 100%；自适应方案的比例以实际选中路径和传输字节计算。若实测 90% 的字节直传，中继数据量约降到原来的 10%。这是一种情景计算，
不是已经测得的打洞成功率。连接数量占比不能替代字节占比，少数大文件连接就可能决定主要费用。

把中继交给第三方只改变由谁运营、按什么费率结算；P2P 才能让成功直连的正文和文件绕过中继数据面。
现有腾讯云实例的真实公网计费模式尚未取得账单证据，不把市场示例价格写成实例费用。

## OPL 已完成的适配与验证边界

本轮沿已有 owner 补齐完整链路：

1. **Studio Host**：复用上游 `loadNodeRtcFactory` 和生命周期，打包纯 TypeScript werift provider，
   按 LAN/P2P、TURN、Relay 自动选路，继续只开放现有 Link loopback 业务路由。
2. **iOS Link**：接入 WebRTC 157.0.0 原生 DataChannel adapter，复用现有 Noise、官方分片、RPC 和恢复逻辑。
   使用成熟 ICE 实现，仅建立数据通道，无音视频权限。
3. **Link service / Instance**：暴露上游 ICE 配置和短期 TURN 凭据入口，复用上游授权信令与
   `/api/v1/turn/credentials?connection_id=...` 语义，保证账号 scope、设备 bearer、连接参与者及 host-client grant 一致；
   共享密钥仅留在后端，客户端只获短期凭据。Instance 正复用现有 NAT/EIP 进行有限等端口映射和 coturn 部署；不新增付费资源，不改 Cloud 原有 SNAT 出口。

固定电脑公钥、Noise 加密、业务授权、撤销和未知操作不重放必须在所有路径一致。服务器仍负责授权与协调，
成功 P2P 不代表可以永久停掉控制服务。网络切换时重建传输及 Noise 并回读原会话，不承诺未知写操作无缝迁移。

候选应在同一 LAN、家庭宽带到移动网络、跨运营商、限制 UDP 的网络及切网场景实测。
结果按真实候选路径、首连时间、文件吞吐、恢复行为、按字节直连比例和实际费用判断；
本地原生已证明 LAN、TURN 和 Direct 失败后 Relay 三条业务路径。公网默认自适应已通过，实际选中 Relay；
公网 P2P 和生产 TURN 仍须各自记录真实选中的候选及业务结果，不以配置存在代替验收。
