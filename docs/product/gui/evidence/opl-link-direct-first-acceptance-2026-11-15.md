# OPL Link 直连优先验收（2026-11-15）

用户已批准落地直连优先方案。产品合同先更新为 LAN/P2P 优先、现有 WSS Relay 兜底；
复用固定 DSH Remote 协议、Noise、授权和现有 Link 业务桥。用户随后明确要求同时接入 TURN，
目标顺序为 LAN/P2P→TURN→Relay；实例实际配置后才公布 TURN 能力，凭据由后台短期签发。
STUN 默认使用公开 Cloudflare STUN，仅用于获取候选地址。当前核查可复用资源，不采购新实例或付费套餐。

先前已完成的部署和公网原生验收仅证明 Relay 路径，见[原验收记录](opl-link-internet-acceptance-2026-11-15.md)。
本轮原生实现已完成，以下结果来自实际选中的路径，未从配置或候选列表推导成功。

## 本地原生三路径

Link main `d3513c878b0111f971b9ac732d6a6b22760e132e`，tree `6789964c9dd387273c80be2aa2332825279ce3a0`。
源码 CI `43722519080` 的源码检查、Release 端点策略和未签名模拟器构建均通过。
专用 iPhone Duo、iOS 27.2 Simulator 的实际 `testManagedRelayRealHost` 覆盖以下三条路径，均为 1 passed、0 failed、0 skipped：

| 场景 | 实际路径与候选 | Noise 发送 / 接收字节 |
| --- | --- | --- |
| LAN | `lan`，host/host，succeeded | 1,902,342 / 724,911 |
| 原生 coturn | `turn`，relay/prflx，succeeded | 1,902,344 / 724,915 |
| Direct 失败后自动回退 | `relay`，directAttempted/relayFallback 为 true | 1,901,902 / 724,915 |

三条路径均完成 enroll、固定电脑公钥的 Noise claim、同一 fixture thread 与请求读回、1 MiB + 117 bytes 多片上传、
524,319 bytes 文件 Range 全文比对、SSE、新 Noise 重连及本机 ACK 后 Relay 自撤销。TURN 路径另观测到
151 个 DataChannel 接收帧、726,576 bytes，不能将 `send()` 返回当作对端收包。

测试使用成熟 WebRTC 157.0.0 与官方 coturn 4.19.0。Mac Docker 回环 TURN 几何曾导致权限与返回方向故障，
修复测试配置后改用相同版本原生 coturn验证；Host 保持官方 werift provider，未修改 RTC/Noise 协议或忽略 ICE failed。
本地用于隔离测试的 loopback peer 许可不适用于生产配置。

最终测试二进制 SHA256 为 `928ff187b01175f36da6dba1ec519dfd693e8d96314ee8c325dae3da34e1a1c6`，
源码与二进制绑定、三条路径的原生 summary/transport evidence 已持久保存。
Studio 最终主线为 `ccc16dfef4f6716272c14002bc68c75a42ab1d7d`；公网测试冻结在其可达前序 `653059ef93fe4ee7c8f0c736c8cf8fdac3cd21bd`。
后续提交只收掉未使用的诊断分支，不用追新重跑未失效的网络门禁。

## 新服务与公网默认自适应

新服务 source `fa825ac4abf3ddff458e908a008786fb7998bbef`，tree `eb704949b474fdf622ea36f95cd06cab3810cadb`；
唯一 image run `43718714827` 发布固定 digest `sha256:67a3916a29457b4083cf05a19e02e307cab1ab9320bbd6479f2b3ee1ec72e9c4`。
正式部署 `43720949508` 和公网隔离资格 `43721620695` 均成功，仍保留既有 Store/域名/账号边界。

公网默认自适应 native run `43725036282` 成功，原生 1 passed、0 failed、0 skipped。
Framework 固定 `9ddedc14eb6c861fd26379169becd871c5bf4841`、Studio 固定 `653059ef93fe4ee7c8f0c736c8cf8fdac3cd21bd`。
实际为 Direct 尝试后回退 `relay`，候选字段为 null，Noise 发送 1,901,894 bytes、接收 724,699 bytes。
完整业务、配对后撤销、Host 停止与私有状态清理均通过。Host receipt 自身的传输计数是另一个观测时点，
不与 iOS 数字强行合并；其 `nativeAcceptance` 保持 `not_claimed`，原生通过来自真实 XCTest。

本次公网结果证明自动回退工作，不证明该网络已选中公网 P2P 或 TURN。此前 run `43723297752` 因人工交接延迟使
120 秒配对码过期，客户端拒绝后取消并清理；fresh run 改为下载、解密、启动的连续执行，未复用过期邀请。

## 尚在完成的生产 TURN

当前生产 TURN 尚未配置成功。现有节点属于 TKE 原生节点 owner；沿 TKE 2022 原生节点、精确 subnet 和默认路由，
已找到同一 VPC 的现有 NAT 与一个可用公网地址，配置带宽为 5000 Mbps，既有 DNAT 为零。
只读 run `43726975018` 证明资源存在，不证明计费、实际出站端口保持或 TURN 已可用。
部署 owner 正补充有限的 UDP/TCP 3478 与 32 个 UDP relay 端口映射，不新购资源、不更改 Cloud 原有 SNAT。
只有真实公网 TURN 被选中并完成加密业务后，才记录公网 TURN 通过。

本轮仍不包含物理 iPhone、运营商切网、真实模型 turn、已安装桌面 App 更新或 Apple 公开分发。
