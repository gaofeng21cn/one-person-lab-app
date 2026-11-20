# Stable v26.11.20-r1 发布复盘

2026 年 11 月 20 日，从首次正式派发到最后一项 Linux 安装验收完成，用了 **5 小时 21 分 18 秒**。Standard 在首次派发后 **3 小时 30 分 13 秒**公开。后续 Full 与平台包有重叠，各段耗时按各自的起止事件计算。再次发布和恢复使用现行规程。[公开版本](https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/v26.11.20-r1) · [Stable 发布 SOP](../stable-release-sop.md)

## 实际耗时

| 阶段 | 北京时间 | 耗时 | 证据 |
| --- | --- | --- | --- |
| 首次 Standard 派发到公开 | 13:08:04–16:38:17 | 3 小时 30 分 13 秒 | [首次派发](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44678971646) · [发布 run](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44703223991) |
| 成功的 Standard 恢复派发到公开 | 16:31:29–16:38:17 | 6 分 48 秒 | [恢复与发布](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44703223991) |
| Full 追加到 Full 跟随流程完成 | 16:42:02–17:58:00 | 1 小时 15 分 58 秒 | [Full](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44704631673) |
| Linux x64 独立恢复 | 17:47:14–18:06:43 | 19 分 29 秒 | [Linux 恢复](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44713652903) |
| 公开 DEB 同字节安装验收 | 18:26:53–18:29:22 | 2 分 29 秒 | [Linux 安装验收](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44719307852) |

## 断点和已落地的修复

- **Standard 检查点恢复。** 首次 run 保留了 Standard 检查点，前两条 Standard run 以取消结束。随后消费原检查点的恢复在 6 分 48 秒内发布。恢复检查点中的 DMG、ZIP 等载荷已压缩，上传改用零压缩。后续统计应分别记录传输、恢复和公开时间。[首次 run](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44678971646) · [取消的恢复 run](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44698112059) · [检查点上传修复](https://github.com/gaofeng21cn/one-person-lab-app/commit/fb1ec672f94cef938fedce9efefda41482a4b888)
- **Linux 构建换执行环境。** 托管 Ubuntu runner 领取了 job，随后在 `Install Linux dependencies` 连接镜像站超时退出。该 job 完成后，即使父 run 仍在执行，也能按 job ID 取日志。备援用本机 Ubuntu 24.04 `linux/amd64` 容器，以一次性 runner 承接 Linux x64 恢复。同机以 Ubuntu 26.04 做归档解包时遇到 `Function not implemented`，因此把 runner 归档解包纳入备用环境的实测。[失败 job](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44703223991/job/136183113618) · [本机 runner 构建](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44713652903/job/136214516390)
- **Linux 安装验收跟随公开字节。** 首次认证 run 整体是 `success`，Linux 安装 job 却是 `skipped`。认证原先只认源 run 总体结论，而源 run 的 Standard 发布 job 已成功。手动 follow-up 路由里的源操作也需要从原发布准入回执读取。修复后，以成功的 Standard 发布 job、Linux 追加回执和公开摘要确定同一版本，单独验收已公开的 DEB。正式回执为 `passed`，安装版本 `26.11.2092`，架构 `amd64`。本机重放还遇到匿名 API 限流，认证 job 现在向安装器现有的 `gh` 回退提供只读身份。[跳过安装的认证](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44716414330) · [验收修复](https://github.com/gaofeng21cn/one-person-lab-app/commit/d69783a5403f9bfe4f92b4180491ed4e0fa63a66) · [真实安装](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44719307852/job/136230787085)
- **Full 复用本机缓存。** 这次 Full 构建中，第一条 `Post Setup Node.js` 归档并上传 npm 缓存，步骤用时 **7 分 13 秒**。自有 Mac 现已复用本机 npm 缓存，GitHub 托管环境继续使用远端缓存。下一次 Full 发布可按同一步骤比较耗时。[Full 构建 job](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44704631673/job/136183291751) · [缓存修复](https://github.com/gaofeng21cn/one-person-lab-app/commit/c14a0d0cde269a985457a476dbc50c61a54aa3c4)
- **消除本地时钟抖动。** Studio 验证中的流式 Codex 测试曾在 90 毫秒等待窗口里失败。测试改为在收到真实 JSON-RPC 事件后推进受控时钟，覆盖跨越原始期限后成功结束的路径。相关 38 项测试和 active-shell 验证通过。[Studio 修复](https://github.com/gaofeng21cn/opl-studio/commit/fb76dc68451ab8aa8e06141d890cc7464b1b401a) · [Studio 源码验证](https://github.com/gaofeng21cn/opl-studio/actions/runs/44719001938)

## 发布回读

Latest 指向 `v26.11.20-r1`。macOS Standard 和 Full 具备签名、公证与干净环境首启证据。Linux 与 Windows 安装包、Homebrew Standard 和 Full cask、Docker 版本与移动标签均完成公开回读。Windows 的 Authenticode 状态为 `unsigned`。[公开 Release](https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/v26.11.20-r1) · [Docker 发布](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44695849627)

## 下一轮比较基线

首次派发后 **49 分 24 秒** 已封存通过 clean-VM 验收的 Standard 检查点。前两次发布均在 `Upload reconciled operation checkpoint` 等到 restore job 约 25 分钟后取消。第一次取消到第二次派发相隔 **1 小时 29 分 08 秒**。现在，新 Standard 在 Framework 确认操作控制保持原样后直接复用本轮检查点。 [首次 restore](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44678971646/job/136115417679) · [第二次 restore](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44698112059/job/136160102123)

成功的 Full 构建 job 用了 **49 分 16 秒**，其中 Full 组装 **8 分 53 秒**，ARM 签名和公证收尾 **25 分 40 秒**，本机 npm 缓存归档上传 **7 分 13 秒**。之后 clean-VM 首启 job 独立用时 **11 分 50 秒**。下一轮分别比较这些阶段，并记录原始派发至全渠道完成的耗时。 [Full 构建](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44704631673/job/136183291751) · [Full clean-VM](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44704631673/job/136206669505)

这轮 Full 在 `Resolve reusable public Standard App` 中发现执行器上的 GUI 合同标签变化，因而重新编译了 Shell。复用路径直接使用 Standard ZIP 内已经构建的 renderer，今后按封存产物的冻结 cohort 验证其身份，执行器只比较复用所需的产品输入。 [Full 构建日志](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/44704631673/job/136183291751) · [GUI 合同提交](https://github.com/gaofeng21cn/one-person-lab-app/commit/942e18e72)
