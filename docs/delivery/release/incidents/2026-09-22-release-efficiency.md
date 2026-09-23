# v26.9.22 发布故障与交付效率修复

本次 Standard、Full、Linux、Windows、两个 Homebrew cask 和 Docker 均已公开完成。首次正式尝试为 `2026-09-22T08:47:13.579Z`，Standard 公开为 `12:20:59Z`，所有渠道完成为 `13:21:58Z`；端到端约 274.7 分钟。最后成功 Standard 从 `11:41:46Z` 开始，Full 从 `12:23:07Z` 开始，成功链本身仍约 100 分钟，不能声称达到 90 分钟目标。

公开证据：[v26.9.22](https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/v26.9.22)、[Standard run](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/35722892018)、[Full run](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/35726849561)。普通账号 clean-VM、签名、公证和安装后的 Framework Agent projection 均通过。Windows unsigned 符合现行 `optional_nonblocking` 合同，不列为故障。

## 实际断点与修复

| 问题 | 已落实的修复 |
| --- | --- |
| GitHub artifact 中合法嵌套的 `assets/*.dmg` 被拒，进入慢速回退 | 安全解压支持嵌套资产，保留路径约束；下载器和 controller 纳入 critical blobs。 |
| 恢复时混用 App SHA 与 Shell harness SHA | 派发前在 Shell 仓验证 `smoke_harness_ref`；已对账的传输失败可复用签名产物恢复。 |
| 宿主／VM 的 Node 信任源与 App 启动环境不一致 | 使用系统 CA，临时 VM 投影已信任公钥 CA，并透传 CA 路径；继续执行 TLS 验证。 |
| Book Forge 描述文件位于声明的插件子目录，安装器只读归档根 | Framework 在根文件不存在时按已绑定 `payload.source_root` 读取，保留身份、路径与摘要校验；最终 Standard 首装通过。 |
| 源包路径错误到签名、公证后的 VM 首装才暴露 | 既有 Framework CLI consumer 门禁增加选定根包公开源物化，使用冻结 Framework 归档及真实安装器的下载／解包校验，结束后删除临时状态。 |
| stderr JSON 中的安装错误退化成 `{`，验收仍长时间等成功 | App helper 解析 stdout/stderr 结构化错误并脱敏；Shell 记录本次进程的失败事件，harness 绑定启动 PID 和时间后立即失败，忽略旧日志。 |
| prepare 子 job 成功被误报为 Standard 构建完成 | 观测工具使用实际 Build Summary 和 Clean VM first launch 的成功证据。 |
| Full 长步骤缺乏进展证据，且重复签名检查／挂载 | 输出阶段起止、退出码、耗时；删除 strict 分支未使用的前置 Gatekeeper 评估、重复入口签名检查和已验证 DMG 的第二次挂载；保留暂存修改后的重签及最终 DMG 验证。 |

公开源预检只验证 App Profile 选定的根包，不复制依赖图或原生安装状态，也不替代依赖安装、登录及 clean-VM 验收。本次真实 7 根包物化全部通过，下载／校验合计约 33.9 秒；未知根、失败清理、隔离状态和不完整证明拒绝均有针对性验证。

## Full 压缩对照

在 M4 Max／macOS 26.5.2 同一宿主使用已公开 Full DMG 中同一 App、相同 staging 进行有界对照，源 DMG SHA-256 为 `c71988f011929f666ccad8092690788d7d390dc71869c4ecc5f4185347919a30`。

| 压缩格式 | 压缩耗时 | DMG 字节 | 挂载耗时 |
| --- | ---: | ---: | ---: |
| ULMO | 234.793 秒 | 581,092,307 | 14.320 秒 |
| UDZO，zlib 7 | 52.408 秒 | 718,479,869 | 4.987 秒 |

两份输出的 21,210 个文件、权限和软链与源 App 一致，内嵌 App 的严格 codesign 验证通过；没有删除 payload。对照 DMG 容器未重新签名、公证或发布。该样本中 UDZO 7 压缩耗时减少约 77.7%，但体积增加约 23.6%，超过现有 700 MB 警告线。按用户明确的“用时间换体积”要求，Full 默认保持 ULMO；先前将 UDZO 7 设为默认是错误决策，已纠正。UDZO 仍可显式指定，预算阈值保持不变。

这仅证明本机同内容的压缩差异，不等于下一次 CI 或端到端发布可缩短同样比例，也不构成改变用户体积优先要求的依据。签名、公证、普通账号首次登录、clean-VM、公开资产摘要和渠道指针回读继续执行；下一次正式发布应按同一计时口径记录实际耗时和体积。本轮修复不重发已公开版本。

## 源码验证与收尾

Framework 隔离预检测试、TypeScript 和准确源码归档的 7 根包真实物化通过。App/Shell 完整 `validate:active-shell` 通过，其中全量 node／DOM 测试 3,724 项通过、16 项按原规则跳过，类型检查与 lint 通过；没有新 `app.asar`，打包运行时扫描按原规则跳过。压缩相关 actionlint、发布合同与 active-shell quick 检查通过。

发布边界套件最初 1,425 项通过、7 项跳过；4 项因收尾过早删除仍被测试引用的 Shell worktree 而失败。改用已吸收的 canonical Shell 后，受影响文件的 5 项针对检查通过，未重跑其他已通过测试。工作区清理必须晚于所有仍引用该路径的验收进程结束；主线已吸收不能代替进程引用生命周期结束。
