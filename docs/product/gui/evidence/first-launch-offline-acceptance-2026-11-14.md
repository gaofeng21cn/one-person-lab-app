# Standard / Full 首次安装与离线启动

核对日期：2026-11-14。产品合同见 [首启工作区](../first-run-setup-workspace.md)。

## 当前公开 Full

GitHub `v26.11.13` 当前 Full 资产为
`One-Person-Lab-Full-26.11.13-mac-arm64.dmg`，634,548,064 字节，SHA-256：
`04c794f5a3ac40a7a038c459970cf2efd8776f8f1f86d1ae3832e623c41c4bd2`。
本次重新读取 GitHub 资产元数据，并计算本地同一 DMG 摘要，二者一致。

该包包含发布操作开始时解析的 Codex 0.169.0 离线种子。正式 qualification
run `43552266553` 的干净 VM 记录为 passed：拒绝 IPv4/IPv6 公网路由，保留 SSH、
loopback 与 Electron sandbox，不注入外部 Codex，不配置 Gateway；实际 App
完成本机 Codex 安装和真实 App Server `thread/list`。阶段从
`2026-11-14T03:38:53.840Z` 到 `2026-11-14T03:39:14.036Z`，约 20.2 秒。
这是该 VM 的一次启动实测，不是所有机器的固定耗时。

正式发布回读 run `43553153334` 将该摘要发布到原 tag；Standard 资产未重发。
本机 `/Applications` 中同名 26.11.13 仍可能是此前不带种子的旧字节，不能用显示版本
替代下载资产摘要判断。

## 本轮源码优化

- Full 首次本机 Codex 安装独立于自动更新开关；旧 pending update 激活失败后仍尝试
  Framework 持有的已校验离线种子安装。
- 启动所选 Codex 必须是可执行的普通文件。安装失败返回实际失败，不能跳过后声称就绪。
- runtime 复制启用文件系统克隆；复制、权限或隔离属性处理出错时清理本次暂存目录，保留
  已有目标，允许正常重试。
- bootstrap 错误保留实际来源与阶段；Full 失败提示检查磁盘空间和安装包完整性，明确
  此步骤无需联网。原位置重试失败不会被外层吞掉。
- 后续 Full 干净 VM 门禁增加：关闭自动更新的离线首次启动，以及开启自动更新后的离线
  重启。两次均要求 App 已渲染并完成真实 App Server `thread/list`，之后才恢复网络进行
  Gateway 验收。

Standard 继续使用 Framework 现有安装器及已验证缓存、已安装身份回读，不引入 App
自己的下载器或依赖清单；首次补齐本机依赖需要网络。两版使用同一 Official Profile 和
required dependency closure，完整 MAC 大素材继续由软件中心按需安装。

## 新边缘路径的实际验证

使用上面相同 DMG 的真实 Codex 归档、包内 Framework 和当前 Studio 首装适配器，
在两个独立空用户目录下重放。进程受 macOS sandbox 的 `deny network*` 约束，外网
探测返回 `EPERM`；无 Gateway 凭据，没有模型生成请求。

| 场景 | 结果 | 本次耗时 |
| --- | --- | --- |
| 关闭自动更新，安装并激活 Codex，再启动实际 App Server | initialize 与 thread/list 通过 | 7.3 秒 |
| 先注入旧 pending update 激活失败，再执行真实离线安装与激活 | initialize 与 thread/list 通过 | 6.9 秒 |

这里的时间只覆盖 Codex 初始化链路，不包含 Full runtime 复制和完整 GUI 启动。
结构化记录位于 Studio `out/acceptance/first-install/offline-codex-replay.json`。
另有复制空间不足后清理与重试测试、首装与 harness focused tests、类型检查、
active-shell 全部必需组通过。

本轮新增边缘路径修复与首启 UI 仍是本地源码；尚未合入主线或替换公开产物。当前公开
Full 的离线保证来自上述同摘要正式干净 VM 验收，新门禁的下一轮正式产物结果需另行记录。
