# 运行状态与任务工作台的本机验收

日期：2026-11-13。Owner：`one-person-lab-app`。

本记录覆盖本机开发安装版；产品定位由
[运行状态设计](../runtime-overview-redesign.md#与-opl-apps-内-runtime-视图的边界)和
[MiniApp 管理](../miniapp-management.md)定义。

当前结果：开发版已安装，终端启动后的核心界面导航通过；正常桌面启动仍需解锁后完成
文件访问与目录连接验收。下文分别记录已通过项目和剩余断点。

## 本机安装身份

| 项目 | 回读结果 |
| --- | --- |
| 安装位置 | `/Applications/One Person Lab.app` |
| 显示版本 | `26.11.13` |
| 机器版本 | `26.11.1391` |
| 构建身份 | `local.srce36a421baa34` |
| 构建类型 | `local-development` |
| App 来源 | `06f1df5d8de8961401640dcdfef712c6f49494b2` |
| Studio 来源 | `807ad02ea8d4682f9a14783196a7abf65f005bbf` |
| source provenance SHA-256 | `e36a421baa3460fb590e6d55f883c52799bf6543ff07ced30706b9511f4c9d49` |
| source lock SHA-256 | `6d1fdb60c6631161c8fb9a65117ac733dcfd17f73f317c4b9892975415a7b834` |

完整构建完成签名与签名验证、隔离产物的 Host 启动检查和安装。安装时使用 `--no-launch`，
随后手动启动 `/Applications` 内的真实 App；CDP target 指向该安装包的
`app.asar/dist/desktop/index.html`。

安装收据位于本机缓存目录
`~/Library/Caches/One Person Lab/manual-latest-build-runtime-boundary/local-app/26.11.13-26.11.1391-workbench-accepted/manual-local-app-installation.json`。

## 安装验收中修复的问题

1. 首次启动出现 `Cannot find module 'fs-extra'` 原生错误。Studio
   `6f0ea797327c83c2ed8ee482db15a06243dd26c1` 在隔离打包产物中校验
   `electron-updater` 的完整生产依赖闭包，阻止产物借用源码目录依赖。
   打包专项测试 15/15 通过；重新安装后真实窗口启动正常。
2. 维护期间读取 MiniApp 时，请求被计入 owner 活跃操作，同时等待维护 lease；
   lease 释放又等待活跃操作归零。Studio `38ba6de698b9fbb43c0b03b0ba60f3ed0ae16524`
   让普通请求先等维护结束，再进入活跃操作；退出会拒绝仍在排队的请求。
   生命周期测试 5/5、typecheck、ownership 检查通过。安装版回读确认请求可重试，
   App 可以正常退出。错误首屏使用简洁中文、官方 DSH 重试按钮和折叠技术详情。
3. 完整桌面安装不会自动替换所有独立 Framework 安装根。首次真实打开时，
   `opl-apps` MCP server 仍解析到 App 管理的 Framework `abd673f218c9c48931ca6db642626b32317b2f70`；
   因而旧网页仍把 OPL Runtime 放入产品选择器。本轮通过正式 App 更新 action 将两个安装根更新为
   `44ad0c5d5f8f88c26e7a5d0fbea3cca55fa71427`，并回读实际 MCP 入口、
   Framework source metadata 与资源网页，不能只凭桌面构建 source lock 判定已生效。

## 本轮新增修复与交互观察

任务详情原先同时等待全局运行诊断：基本任务投影约 6.5 秒，全局诊断实测约 109.6 秒，
叠加其他读取后可能触发 MCP 120 秒超时。Framework `47d85f510` 将首屏与可用操作读取拆开：
先显示任务内容，再由“查看可用操作”按需读取；执行时仍由原 owner 重新校验对象和版本。

Framework `0e031c31c` 修复布局样式覆盖 HTML `hidden` 语义的问题，隐藏上下文任务页的产品
选择器、无目标专用入口与重复标题。默认工具启动也改为选择真实产品，保留明确的 Runtime
上下文入口。Studio 忽略旧版本保存的 Runtime 浏览位置，保留普通产品的浏览位置；
任务页复用全高 MiniApp 容器，不再沿用 580px 内嵌卡片高度。

最终安装版已实际完成“运行状态 → 真实任务 → 证据与产物 → 返回项目运行总览”。
任务标题与“已暂停”状态和总览一致；返回总览后任务 iframe 已释放。
在 1440×900 CSS px 窗口中，任务 iframe 从 y=80 延伸至 y=900，高度为 820px；
普通 MiniApp 容器为 827px。任务详情的产品选择器、重复标题和无目标专用入口均不可见，
读取 `[hidden]` 元素没有发现可见泄漏。

普通 OPL Apps 打开后落在 `GLKVM Native / GLKVM 设备状态`，14 个产品选项中没有 Runtime；
旧 Runtime 浏览位置没有被恢复。切换到 Relay 后旧 iframe 已释放；Relay 与媒体审看都
能打开为单个 iframe，点击“关闭界面”后回到零个 iframe。

三个自有页面实际使用宿主同一系统字体栈，界面正文为 14px / 22px；任务常规按钮为
36px、圆角 12px。字号、行高和控件尺度来自官方 DSH 0.2.2-rc.2；会话正文另用官方
14px / 24px 角色，不应与界面正文混为一个值。

按需操作读取在本轮较早的已安装版本中出现超时，已加载的任务内容保留且显示
“重试读取操作”。这个观察证明失败恢复；最终安装版没有执行真实任务操作。

Relay 可显示已有邮箱列表与邮件；媒体审看可显示已有制作单、当前候选和 7 个镜头，
选择镜头后当前片段范围随之改变。本轮没有保存邮件草稿、发送邮件、记录审看意见或执行
真实任务命令。媒体播放与领域审阅决定没有验收。媒体页仍显示技术性的 artifact bridge 提示，
但右侧版本摘要的长 digest 和窄按钮裁切问题已由媒体 owner 修复，详见下方回读记录。

验证：Framework MCP stdio 专项 4/4、Studio 任务入口与导航专项 8/8、两仓 typecheck、
App `validate:active-shell` 均通过。标准工具的真实安装回读确认，无参数打开选择
`glkvm-native / glkvm.status`，没有进入 `opl-runtime`。

## 目录口径

安装目录回读为 5 个标准 MiniApp 表面，其中自有 3 个：OPL Apps、Relay、媒体审看；
另两个是 `codex_apps` 的 Jira 与 Netlify。共享 OPL Apps 包含 14 个普通产品入口、
36 个产品内部视图，以及 3 个上下文 Runtime 视图，合计 39 个视图。

“界面未打开”表示没有该应用的页面会话；“界面已打开”表示标准 MCP App iframe 和宿主桥接
已建立。选择、打开、关闭是界面状态，安装、启停和后台任务状态由各自 owner 持有。

## 正常桌面启动的剩余验收

从终端启动同一安装包后，上述真实页面流程通过。通过 macOS 正常启动时，原历史会话的
`mcpServerStatus/list` 超时；多项 MCP 服务在握手阶段超时。进程采样确认，OPL Apps 的
启动脚本停在 `getcwd → open`，继承的工作区位于用户“文稿”目录。直接启动服务的握手正常。

原生桌面工具随后确认 Mac 已再次锁屏且无法自动解锁。保持原会话工作区，解锁后检查系统
文件访问提示，并复验正常桌面启动；这项尚未通过，不把终端启动验收等同于正常桌面启动。

## 证据保管

真实任务、邮件与工作区截图保留在本机
`~/Library/Caches/One Person Lab/runtime-workbench-acceptance-2026-11-13`，不纳入公开仓库。
本轮未发起 Agent turn，未发送邮件，未修改真实任务或原有会话草稿。

## 媒体审看右栏裁切修复回读

日期：2026-11-13。该修复属于 Med Auto Cast owner，App 只记录安装与桌面消费结果。

| 层级 | 证据 |
| --- | --- |
| Owner 主线 | Med Auto Cast `d94276e833befb75e1bae5cdbdd9e90377b1f08e`（PR #8，两个 `verify` CI 通过）。`review-rail` 改为可收缩的 `minmax(0, 1fr)`，子项允许收缩，版本 digest 任意位置换行；字体、颜色、控件尺寸仍复用 DSH。 |
| Owner 验证 | `npm run build`、`npm test` 4/4 通过；Impeccable detector 结果为空；1239px 静态回归中 `document.scrollWidth === document.clientWidth`，右栏无横向溢出。 |
| Installed carrier | 本机 `med-autocast 0.3.5` 已重新安装，`operational_ready=true`、`launch_allowed=true`；安装包内的 `media-review/style.css` 与 `index.html` 含上述收缩与换行规则。 |
| 桌面实窗 | 重启 `/Applications/One Person Lab.app` 后切换并打开“Med Auto Cast · 媒体审看”。AX 回读显示 1 个已登记单集、7 个镜头、当前镜头“位置与视路”；实窗截图中右侧“审看意见”标题、空态、意见输入区、记录按钮和版本 digest 均完整可见，digest 在栏内换行。 |

这次回读只证明布局、加载和导航可用；没有保存真实审看意见，也没有改变媒体质量状态或作出内容批准。
