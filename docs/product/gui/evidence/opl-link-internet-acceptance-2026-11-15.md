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

当前未完成公网部署与原生公网验收。首个正式部署 run `43695647291` 在私有源码读取准入失败，未执行服务部署 mutation。随后独立 source-access run `43696489740` 证明旧配置凭据与运行器原生 gh/registry 路径均不能读取私有源码/镜像。

Framework 复用已有发布 GitHub App 请求固定三仓 `contents/actions/packages: read` 的短期凭据；run `43697266238` 在 mint 阶段收到 GitHub HTTP 422：`The permissions requested are not granted to this installation`。这证明请求权限集合未获授予，尚不能从响应确定具体缺少哪一项。没有成功签发或导出 token，也没有复制个人 OAuth 或扩大既有 App 权限。

此前 GitHub 权限页要求本人 Passkey 验证，用户当时暂时无法完成；现已完成身份验证，恢复结果见下节。公网部署仍保留为未完成。另一项公网隔离资格前提是独立的普通测试账号；此前两组 Secret 实为历史重复，已修正为独立 `OPL_LINK_ISOLATION_TEST_*` 引用。Gateway 当前关闭公众注册，未为测试打开全局注册或使用管理员账号作业务验收。

受保护 storage run `43694402150` 已实际准备专用静态 Local PV/PVC 并回读 Bound/Retain/节点 affinity，未购买服务器或云盘。Local Store 绑定既有工作节点，节点灾难恢复仍归部署 owner。

原生 iOS 公网测试目标已构建并实际启动 Simulator 测试 runner；缺少私有 QR 时按预期跳过，该结果仅证明 runner 可用。公网 QR 未生成、没有公网手机通过的结论。本地联调、public health 与 Node 公网测试均不代替原生资格。

本轮不包含 Apple TestFlight/App Store 分发。已安装桌面 App 尚未由本次源码更新自动替换；真实手机、运营商切网与大陆弱网体验分别验收。

## 授权恢复与稳定性准备

用户已完成 GitHub Passkey 验证。权限页实证显示原 OPL Package Publisher 安装在全部仓库，Packages 为 No access；
未保存扩大其范围的草稿。随后遵循 GitHub 单包 Actions access 路线，源码凭据仅请求固定三仓 Contents/Actions read。
实际 source-only workflow `43705995770` 成功，没有为现有 App 增加权限，也没有新建个人令牌。

Instance 源码 `3e4be2ba0e6a79e664031e677691c1a5e75929b5`、tree `9a6d207d2e1810591b51c551da8b6275f527f636`
已通过 CI `43706732398`。源读取、GHCR 工作流读取与持久 TCR 拉取凭据分别归口；固定摘要镜像到 TCR 的复制
及目标完整 provenance 验证已实现，当前尚未执行生产复制或服务部署。

单包 `opl-link-service` 向 `opl-instance-medopl` Actions 授予 Read 的对话已准备，尚待用户确认；原发布 App 和包的
私有可见性未改变。Source-only 临时凭据的保守使用截止为 2026-11-15 19:40（北京时间），届时若未使用需重新签发，
不把它当长期拉取凭据。第二普通测试账号和公网原生验收仍未完成。

共享主机的故障域、Local PV 的节点依赖、初始 32 账号与资源/连接上限已在现行接入文档明确。现有 Store 硬限下
估计状态上界约 155 MiB，1 GiB PVC 仍不代表硬配额。没有从这些源码检查推导高可用、压力测试或真实公网已通过。
