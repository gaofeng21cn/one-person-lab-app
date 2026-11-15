# OPL Link 托管互联网连接验收（2026-11-15）

产品 authority 为 App 的 `app-remote-companion-internet.json`；本记录按证据分别描述源码、托管服务与原生网络路径。用户流程统一为 App 内开启手机访问、复用已有 OPL 账号、Link 扫码并确认电脑。

## 已验证的源码行为

- Framework 真实 `bin/opl` 子进程接受有界 stdin、轮换现有账号 session、写独占 0600 凭据文件；stdout 不含秘密。账户、TLS 与原有锁行为的 focused checks 通过。
- Studio 真实 DSH Host 使用原版 Remote lifecycle，固定虚拟端口43177仅转发手机路由；局部真实 Relay/Noise 同 thread、文件片段、ETag、SSE、重新握手与两层撤销通过。
- Swift 使用固定成熟 Noise 库，上游向量和 Node↔Swift 随机双向密文互通通过。真实本地原生 App 的 Keychain、前后台、终止重开、thread 与草稿恢复通过。
- App 互联网合同、wire、GUI/profile/page-state 同步；13 项合同检查、typecheck 与完整 active-shell 验证通过。
- Link 原生 source CI 和独立容器 image CI 通过；Framework 与 App source CI 通过。

## 托管服务

镜像来自 Link source `565fc1b1feb882c7793566abc1b1179df7847c0d`，tree `e7dbf783e9d8b016f2ff855471fa84911bbdc836`，成功 image run `43691263878`。

固定镜像：`ghcr.io/gaofeng21cn/opl-link-service@sha256:df5f4d001534ad16bf0b44d3fabd7e7f2a38653b16dfc8df291ae518c3e4294c`，linux/amd64。

镜像保持私有。Instance 验证成功 main run、原生 artifact receipt、source/tree、固定 digest 和 BuildKit OCI provenance，再由其受保护凭据自动拉取。私有镜像的来源核验不依赖仅 Enterprise 私有仓库支持的 GitHub attestation API。

既有 OPL 云端工作节点和公网负载均衡/TLS分别承担运行与入口。受保护检查证明现有容量可用，独立 Store 不借用客户 Workspace 卷，不调用资源采购或动态云盘 provisioning。

## 公网与原生资格

正式部署 run `43712654458` 已成功。原生 receipt 的状态为 `deployed`、阶段为 `public_acceptance`，
`publicHealth`、`exactImageInstalled`、`exactPublicRouteInstalled`、`registryMirrorVerified` 与
`imagePullCredentialReadback` 均为 true。部署证据归
[Instance 原生 receipt](https://github.com/gaofeng21cn/opl-instance-medopl/blob/main/receipts/2026-11-15-link-service-deploy-43712654458.json)持有。

用户已授权创建独立零余额普通测试账号，Gateway 回读其为 active/user，并发与 RPM 均为 1；
密码通过 stdin 保存至 Instance production `OPL_LINK_ISOLATION_TEST_*` Secrets，明文临时文件已删除。
该账号与既有第一普通账号不同；公众注册保持关闭，未使用管理员账号作手机业务验收。

公网资格 run `43713245266` 已通过。原生 `qualified` receipt 的 `health`、`wssRelay`、
`encryptedRoundTrip`、`accountIsolation` 与 `revocationClosesConnection` 均为 true，source 与同 run 的
已安装镜像检查严格相等。闭合结果归
[Instance qualification receipt](https://github.com/gaofeng21cn/opl-instance-medopl/blob/main/receipts/2026-11-15-link-service-qualification-43713245266.json)持有。

受保护 storage run `43694402150` 已实际准备专用静态 Local PV/PVC 并回读 Bound/Retain/节点 affinity，未购买服务器或云盘。Local Store 绑定既有工作节点，节点灾难恢复仍归部署 owner。

公网 Host run `43713746380` 与 iOS `OPLLinkCoreTests/RemoteLiveTests/testManagedRelayRealHost` 均已成功。
测试在 iOS 27.2 的专用 iPhone Duo Simulator 实际执行，1 passed、0 failed、0 skipped，用时 23.498 秒。
覆盖公网 WSS enroll、固定电脑公钥的 Noise claim、同一 fixture thread 与待处理请求、1 MiB + 117 bytes 分片
上传及检查/删除、524,319 bytes 文件 Range 全文比对、SSE、新 Noise 重连及本机 ACK 后 Relay 自撤销。

原生 Host receipt 的身份核验、Host 启动、加密配对交付、配对后移除、Host 停止、私有状态清理六项均为 true，
终止原因为 `paired_then_removed`。该 receipt 的 `nativeAcceptance` 保持 `not_claimed`，iOS 通过结论来自实际
XCTest，而非 Host 运行状态。原字节见
[Instance Host receipt](https://github.com/gaofeng21cn/opl-instance-medopl/blob/main/receipts/2026-11-15-link-native-host-43713746380.json)。

Studio fixture 提供隔离业务 owner；本次验证不包含真实模型 turn、已安装桌面 App 或物理 iPhone。此前首次 Host
启动失败的具体根因无法从丢弃的子进程日志恢复；后续补充了封闭错误类别记录，未把这一观测改动当成已证根因修复。

本轮不包含 Apple TestFlight/App Store 分发。已安装桌面 App 尚未由本次源码更新自动替换；真实手机、运营商切网与大陆弱网体验分别验收。

## 授权恢复与稳定性准备

用户已完成 GitHub Passkey 验证。权限页实证显示原 OPL Package Publisher 安装在全部仓库，Packages 为 No access；
未保存扩大其范围的草稿。随后遵循 GitHub 单包 Actions access 路线，源码凭据仅请求固定三仓 Contents/Actions read。
实际 source-only workflow `43705995770` 成功，没有为现有 App 增加权限，也没有新建个人令牌。

源读取、GHCR 工作流读取与持久 TCR 拉取凭据分别归口。固定摘要镜像已实际复制到既有 TCR，目标完整
provenance 验证通过；运行时 pullSecret 只含 TCR 身份。原部署 workflow 的 heredoc 缩进错误已修复，
源码 CI `43712648651`、后续 CI `43714438339` 均通过。成功部署、公网资格和原生 Host receipt 已进入 Instance
main `f25abb3eb67beda87b89b8fac4f97f320ab967e0`，tree `d2b537896fde4c47f081cb4d3a6eec99b8cac23a`。

用户已批准单包 `opl-link-service` 向 `opl-instance-medopl` Actions 授予 Read；权限页已实际提交并显示该仓库的
Role 为 Read。原发布 App 与包的私有可见性保持原状。Source-only workflow `43712238775` 已续签固定三仓的
Contents/Actions read 临时凭据，不把它当长期拉取凭据。
公网验收完成后已删除该临时 production Secret，并回读确认不存在；TCR 运行时凭据与获授权的专用测试账号配置保留。

共享主机的故障域、Local PV 的节点依赖、初始 32 账号与资源/连接上限已在现行接入文档明确。现有 Store 硬限下
估计状态上界约 155 MiB，1 GiB PVC 仍不代表硬配额。服务部署和公网资格已实跑；高可用、压力测试及原生公网资格分别记录。

本次部署前的真实节点快照为 CPU 110m、内存约 8.67 GiB；26 个 Pod 合计 CPU 39m、内存 682 MiB。
按 requests 计算的剩余调度容量为 CPU 4280m、内存约 8.03 GiB、69 个 Pod slots。实际用量与调度余量分别记录，
此快照不证明持续峰值下的稳定性，也没有执行压力或主机恢复测试。
