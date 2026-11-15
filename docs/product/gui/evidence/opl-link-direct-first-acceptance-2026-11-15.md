# OPL Link 直连优先验收（2026-11-15）

用户已批准落地直连优先方案。产品合同先更新为 LAN/P2P 优先、现有 WSS Relay 兜底；
复用固定 DSH Remote 协议、Noise、授权和现有 Link 业务桥。用户随后明确要求同时接入 TURN，
目标顺序为 LAN/P2P→TURN→Relay；实例实际配置后才公布 TURN 能力，凭据由后台短期签发。
STUN 默认使用公开 Cloudflare STUN，仅用于获取候选地址。本轮复用现有资源，没有采购新实例或付费套餐。

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

本地三路径及早期公网测试二进制 SHA256 为 `928ff187b01175f36da6dba1ec519dfd693e8d96314ee8c325dae3da34e1a1c6`，
源码与二进制绑定、三条路径的原生 summary/transport evidence 已持久保存。
该阶段 Studio 主线为 `ccc16dfef4f6716272c14002bc68c75a42ab1d7d`；公网测试冻结在其可达前序 `653059ef93fe4ee7c8f0c736c8cf8fdac3cd21bd`。
后续提交只收掉未使用的诊断分支，不用追新重跑未失效的网络门禁。

App 的完整 active-shell 检查也已完成：Studio typecheck、Node suite（519 passed、0 failed、1 skipped）、
全部 renderer suites、App contract conformance 和 state model 均通过。检查前补齐任务内 Shell checkout 的依赖及插件构建；
首次检查暴露的缺失类型和未构建插件属于该隔离 checkout 的准备问题，补齐后从失败阶段继续，未重复已通过的 typecheck。

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

## 生产 TURN 与公网业务资格

生产配置 `43730587059` 已成功，原生 receipt 的 12 项核对全通过。复用精确 TKE 原生节点默认路由上的
现有 NAT 与公网地址，新增 UDP/TCP 3478 与 32 个 UDP relay 端口的等端口映射；没有新购资源，Cloud 原有
SNAT 与 Ingress 保持原配置。TURN 初始总上限为 10 Mbps、单 allocation 为 5 Mbps，总 allocation 16、单用户 4，
短期凭据为 300 秒。具体运行参数由 Instance 持有，配置带宽不构成真实计费或吞吐证明。

coturn 保持非 root、只读文件系统、CapEff 0 与 NoNewPrivs 1；使用同一官方镜像内的 init copy 去除不需要的
binary file capability。使用单一公网 external-ip 与显式 IPv4 relay-ip，避免 public/private 写法隐式放行节点私网。
私网、回环、metadata 等 peer 拒绝策略保持启用；未采用已被 4.19 忽略的旧选项作为安全控制。

首个公网 forced-TURN run `43730775718` 中，Host 位于同一云内网，coturn 实际记录拒绝 node-private peer；
客户端 ICE 失败后自动回退 Relay，完整业务通过，但 TURN 断言失败。随后通过 `43732882055` 的真实 Framework
普通用户设备授权，把绑定本机 Noise 公钥的 Host device credential 密封交付给外网测试 Host，账号密码、Gateway
令牌与 TURN HMAC 均未导出。外网 Host 实际选中 TURN 并完成 Noise、claim 和 bootstrap，纯 werift 路径在大附件
发送阶段失败，因此这部分结果不计完整 TURN 业务通过。

原生 provider 对照另发现已有 Host 重启后的身份库未初始化：`loadExisting` 只验证返回身份，不加载 store cache/peers。
Studio main `be442af2a3bbf6300cab335395b3db178675f816` 已在验证固定身份后调用官方 `loadOrCreate`，复核身份后再启动；
真实重启、已有 peer pin、新 peer 与换钥拒绝的回归通过。该提交同时补齐固定 DSH 上游 manifest 本已指定的
`@roamhq/wrtc 0.10.0` optional 依赖、平台 lock 与完整许可，vendor 原字节不变。

后续公网原生资格固定该 Host 修复提交。独立原生 DataChannel 探针通过 production coturn 完成
1 MiB + 117 bytes 全文与 SHA 校验，但 UDP Relay 实测需 58.880 秒、RTT 为 0.597 秒；该探针没有运行 App 业务，
不能代替 Native 业务验收。原 512 KiB 上传片段经 HTTP 桥两次 base64 后约 932 KiB，已超过这条慢链路上 30 秒
RPC 的传输预算。合同改为 managed 128 KiB、接口最大 512 KiB，单次编码请求上限 256 KiB。

Link main 修复提交 `d4b9a450ad57e0faff39ddb985c96e64b24aab23` 同时关闭 JSON 的可选斜杠转义。
两组 1 MiB + 117 bytes（含最坏 base64 内容）在真实 DSHF/Noise/RTCH 往返中均为 9 片，offset、全文与 SHA 一致；
1024 bytes Authorization 测试头下，每次追加最多 235,066 bytes。新 Native 二进制 SHA256 为
`4cdb012012760b83755242bdd3220b3fa8d0596cc3f1c348ed5d155cc1cc5e52`；后续完整业务验收使用该修复，
不扩大 RPC/RTC 超时或放宽 peer ACL。配置成功、局部加密字节、原始通道吞吐及完整业务资格分别记录。

## 最终公网 TURN 验收（2026-11-16）

`external-host-managed-upload-be442af-d4b9` 于 2026-11-15 18:24:32 UTC（北京时间次日 02:24）真实通过，
XCTest 为 1 passed、0 failed、0 skipped，退出码 0。实际测试用时 168.887 秒，完整 xcresult 已生成。
固定 Framework `9ddedc14eb6c861fd26379169becd871c5bf4841`、Host `be442af2a3bbf6300cab335395b3db178675f816`、
iOS `d4b9a450ad57e0faff39ddb985c96e64b24aab23`，使用上列 `4cdb…5e52` 新二进制。
后续 Link 文档提交 `f2ad1ffbf01451f68705da00afa3132b50b22e33` 不改变已验收产品字节。
Native source checks `43745913334` 绑定 `d4b9a45` 并通过；最终 App active-shell 检查使用 Host `be442af`
与官方原生依赖 0.10.0，全部通过。Instance main `8ef42dacb230bd7516dd4c222b7e34cb2702d857`
已保存本次 invocation、transport 与 xcresult summary 原始字节；registration `43732882055` 中的 Studio `653059e`
仅为签发授权时的输入，实际业务 Host 绑定以上列原生 invocation 为准。

实际选择 TURN，local `relay`、remote `prflx`、candidate pair `succeeded`；Noise 发送 **1,890,810 bytes**、
接收 **732,333 bytes**，`relayFallback=false`。本次资格明确强制 TURN，不将其当作默认自动选路或公网 P2P 的证明。
实际完成 enrollment、固定电脑公钥的 Noise claim/bootstrap、1 MiB + 117 bytes 多片上传及 inspect/delete、
524,319 bytes 下载全文与摘要校验、SSE、fresh Noise 重新连接、disconnect 与双层撤销。

外网 Host 沿标准 `DELETE /api/v1/devices/self` 撤销后，原 bearer 的 `/api/v1/me` 返回 401；
Host 进程停止、私有实时工作区和二维码删除已读回。普通测试账号和正式运行资源保留。
原始 summary、8 字段 transport、invocation 与绑定的 Host metadata 已保存，metadata 字节摘要与 invocation 一致。
临时源码读取凭据已失效、临时 production Secret 已删除；8 份临时密文 artifact 删除后均回读 404。
本机临时 TURN 与本次新增的 4 项 Brew 依赖已移除。正式 coturn、Link 服务、运行 Secrets、私有镜像读取授权
及普通测试账号配置继续保留。

本轮仍不包含物理 iPhone、运营商切网、真实模型 turn、已安装桌面 App 更新或 Apple 公开分发。
