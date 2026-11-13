# Full 构建提速：复用 Standard 与合并重复处理

本次只优化源码和构建流程，不派发新产品发布。Full 继续在 Standard 公开回读后启动，保持 ULMO、下载体积优先、最终 Developer ID 签名、公证、普通账号 clean-VM 和公开摘要回读。

对照来源为 [v26.11.11 Full build job](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/43076104187/job/130716976732)。该 job 为 41 分 22 秒，其中 Shell build 为 392.8 秒，DMG 汇总段为 1345.428 秒。真正 ULMO create 是 804.842 秒；汇总段余下约 9 分钟包含复制、扫描、签名、挂载和验签，不能把 22 分钟全部归因于压缩。

| 已落实项 | 生效条件与结果 |
| --- | --- |
| 复用公开 Standard ZIP | Release、Bundle、App/Shell/Framework SHA、机器版本、组件与 ZIP 摘要全部匹配；不匹配或下载不可用时常规构建。最终仍重签 Full。 |
| 跳过冗余构建准备 | 命中上述复用时跳过 Shell build、Electron 原生模块重编译及 App/Shell 两份中间 runtime 复制。 |
| 合并目录清点 | 本次操作解析一次 carrier；同一次遍历计算裁剪前后与边界大小；受保护 payload 不再逐文件解析裁剪合同。 |
| 合并签名验签 | 所有 staged App 内容写完后签名并 deep/strict 验签一次；保留 DMG 内验签和后续正式 trust、VM 门禁。 |
| APFS clone | staging 优先保留权限、symlink、xattr 的独立写时复制，不支持时清理部分副本后用 ditto。 |
| 更快托管机器选项 | `OPL_FULL_BUILD_RUNNER=macos-15-xlarge` 可选择 GitHub 托管 ARM64 XLarge；未启用付费资源，默认仍是 macos-latest。clean-VM runner 不参与构建。 |

本机对照使用 M4 Max（16 CPU），从已公开的准确 Standard ZIP 和 Full DMG 读取内容。Standard ZIP SHA-256 为 `a3e033bce9c30703c5f73313bc7e8af396274a0238d4e589f69e020a1c669cb0`；Full DMG 为 `4ab8fc50fa01225191f6905537fdf4ecd7b58fe2a31b7d4caa9c7349dea760e7`。

| 实测路径 | 耗时与检查 |
| --- | --- |
| Standard 验证、解包、Developer ID 验签 | 8.166 秒；不含网络下载。 |
| 同一 Full App：旧裁剪与边界统计 | 131.402 秒。 |
| 同一 Full App：新合并清点 | 0.644 秒；裁剪与边界报告一致。 |
| 同一 Full App：APFS clone | 16.208 秒；文件内容、mode 和 symlink tree digest 一致。 |
| 同一 Full App：ditto 本地复制 | 22.381 秒；相同 tree digest。 |
| Standard 注入准确 Full runtime | 37.355 秒；runtime 内容及权限一致，Standard app.asar 与 Frameworks 未改变。 |

本机运行包含并行开发验证，数字用于确定优化方向，不作为托管 runner 的严格性能比值。clone 的实际收益随文件系统与文件数量变化。测试另验证 xattr、可执行位、相对 symlink、目标独立写入，以及 clone 失败时删除部分副本再回退。

以原 job 为基线，普通托管 runner 且 Standard 身份匹配时，下一次 Full build job 合理预算为 **25–30 分钟**，预计节省约 **11–16 分钟**。主要减少约 6 分钟 Shell 重建、约 3 分钟重复扫描，以及中间复制和重复签名验签；仍保留约 13 分钟 ULMO 压缩及后续检查。缓存命中、网络、签名时间戳和运行器负载仍会影响结果。这个范围是估算，下一次真实发布的 stage telemetry 才能确认端到端收益；不包含后续 Full 公证、clean-VM、公开追加所需时间，也不把 M4 Max 本机成绩当成普通托管成绩。

GitHub 托管 XLarge 是可选后续提速路径，规格为 M2、5 vCPU、14 GB RAM；普通 macOS ARM64 为 M1、3 vCPU、7 GB RAM。规格不能直接换算成 job 加速比例，启用前需确认现有付费能力，并在真实获准的 runner 上测量。[官方规格](https://docs.github.com/en/actions/reference/runners/larger-runners#available-macos-larger-runners-and-labels)。
