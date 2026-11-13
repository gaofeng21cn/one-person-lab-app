# Full 构建提速：复用 Standard 与合并重复处理

本次只优化源码和构建流程，不派发新产品发布。Full 继续在 Standard 公开回读后启动，保持 ULMO、下载体积优先、最终 Developer ID 签名、公证、普通账号 clean-VM 和公开摘要回读。按最新产品决定，MAC 媒体库改为核心启动后安装，并由 MAC 使用前检查补齐。

对照来源为 [v26.11.11 Full build job](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/43076104187/job/130716976732)。该 job 为 41 分 22 秒，其中 Shell build 为 392.8 秒，DMG 汇总段为 1345.428 秒。真正 ULMO create 是 804.842 秒；汇总段余下约 9 分钟包含复制、扫描、签名、挂载和验签，不能把 22 分钟全部归因于压缩。

| 已落实项 | 生效条件与结果 |
| --- | --- |
| 移出大型媒体库 | Full 不再 checkout、缓存或复制 mac-media-assets。首次启动由现有 Framework required 依赖安装；MAC prepare 在制作前检查并补齐。 |
| 复用公开 Standard ZIP | Release、Bundle、App/Shell/Framework SHA、机器版本、组件与 ZIP 摘要全部匹配；不匹配或下载不可用时常规构建。最终仍重签 Full。 |
| 跳过冗余构建准备 | 命中上述复用时跳过 Shell build、Electron 原生模块重编译及 App/Shell 两份中间 runtime 复制。 |
| 合并目录清点 | 本次操作解析一次 carrier；同一次遍历计算裁剪前后与边界大小；受保护 payload 不再逐文件解析裁剪合同。 |
| 合并签名验签 | 所有 staged App 内容写完后签名并 deep/strict 验签一次；保留 DMG 内验签和后续正式 trust、VM 门禁。 |
| APFS clone | staging 优先保留权限、symlink、xattr 的独立写时复制，不支持时清理部分副本后用 ditto。 |
| ULMO 多核压缩 | 先生成 UDRW，再按可用 CPU 数执行 ULMO convert；保留格式与默认压缩设置，临时镜像在所有退出路径清理。 |
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
| 同一 Full App：直接 create ULMO | 791.201 秒，1,578,836,821 bytes。 |
| 同一 Full App：UDRW create + ULMO convert（16 tasks） | 43.199 + 135.767 = 178.965 秒，1,336,316,624 bytes；约快 4.42 倍，体积减少 15.36%。 |
| 同一未压缩镜像：ULMO convert（3 tasks） | 压缩 206.491 秒，计入前置生成共 249.689 秒；体积同为 1,336,316,624 bytes。 |
| 同一发布 App 移出 MAC 媒体库后的体积样本 | ULMO 镜像生成 58.695 秒，476,822,942 bytes；这只是体积样本，没有正式重签、公证或发布。 |

最终并行 ULMO 重新挂载后，完整 App tree digest（文件内容、mode、symlink）与输入一致，Developer ID deep/strict 验签通过，`/Applications` 链接保持。按生产构建器的实际 DMG 挂载与验签路径执行共 68.310 秒。完整 tree 哈希与验签的额外对照共 423.093 秒，未计入压缩测速。

本机运行包含并行开发验证，数字用于确定优化方向，不作为托管 runner 的严格性能比值。clone 的实际收益随文件系统与文件数量变化。测试另验证 xattr、可执行位、相对 symlink、目标独立写入，以及 clone 失败时删除部分副本再回退。

`hdiutil create -srcfolder -format ULMO` 边复制边压缩，主要占用一个 CPU；`convert` 明确支持并行 compression tasks，实测 CPU 达到约 490%。并行路径保持 ULMO 和默认压缩设置，产物体积也更小；不需要以降低压缩率换速度。镜像额外占用约 4 GB 临时磁盘，完成或失败都删除。

与 v26.9.22 的公开 Full 576,358,751 bytes 相比，v26.11.11 增至 1,659,404,560 bytes。离线 runtime 从 548,633,544 增至 2,177,398,000 bytes，其中新增 mac-media-assets 的 1,454,327,690 bytes 占 runtime 增量 89.3%。实物清点为 5,327 个文件，PNG 750,756,164 bytes，WAV 649,292,314 bytes。另有 Python 约 64 MB、KimiCU 离线包约 60 MB、Framework 约 42 MB 的增长。组件数字是解包体积，不能线性当作 DMG 压缩体积。

最新 Full 打包范围因此排除媒体库，不改变 MAC 的 required 依赖关系。核心就绪后走原 Official Profile 依赖安装；即使 MAC seed 已存在，缺少媒体依赖仍会执行 Framework 投影提供的修复动作。MAC 新增 `prepare` 原生入口并接入开始/恢复制作流程，优先复用已安装库，缺失时委托 Framework 安装并重新发现；不会把命令退出成功当作可用，也不会在失败后并行发起第二套 Git 下载。显式停用、已有自定义目录及离线诊断保持原有边界。

在 Standard 身份匹配、缓存正常和当前包规模下，普通托管 runner 的下一次 Full build job 暂按 **15–20 分钟**预算，相比原 41 分 22 秒预计节省约 **21–26 分钟**。477 MB 是同版本移出素材库的体积样本，真实候选的依赖版本和最终签名会影响体积；M4 Max 的局部测速也不能直接等同于 3 CPU 托管 runner。下一次真实发布的 stage telemetry 才能确认 job 总耗时；后续公证、clean-VM、首次启动后台依赖下载与公开追加另计。


GitHub 托管 XLarge 是可选后续提速路径，规格为 M2、5 vCPU、14 GB RAM；普通 macOS ARM64 为 M1、3 vCPU、7 GB RAM。规格不能直接换算成 job 加速比例，启用前需确认现有付费能力，并在真实获准的 runner 上测量。[官方规格](https://docs.github.com/en/actions/reference/runners/larger-runners#available-macos-larger-runners-and-labels)。
