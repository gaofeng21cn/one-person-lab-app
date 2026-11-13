# MiniApp 连续操作与本机验收（2026-11-13）

本轮落实 [2026-11-12 记录](miniapp-management-acceptance-2026-11-12.md) 中的三个优先项：
共享概览直达专用界面、用途与下一步提示、最近位置与返回路径。产品规则以
[MiniApp 管理 SSOT](../miniapp-management.md) 和 `app-gui-product-contract.json` 为准。

后续 Runtime 入口收敛、最新安装身份与真实窗口验收见
[运行状态与任务工作台的本机验收](runtime-workbench-installed-acceptance-2026-11-13.md)。

## 已落地行为

- 共享概览根据已安装 Package 的 `presentation.miniapp.dedicated_resource_uri` 显示
  “打开专用界面”，携带当前对象引用，通过标准 `ui/open-link` 打开 Relay 或媒体审看。
- 宿主只接受当前对话目录中唯一的只读 launcher，按其 inputSchema 过滤导航参数；
  保留返回上一界面的入口，返回时重新读取领域 owner。
- 三个自有界面统一 OPL Apps 品牌、灰阶画布和蓝色强调色。入口说明用途，首屏将无内容、
  未连接和读取失败分别呈现为可执行的下一步。
- 最近位置按对话、server 和 resource 隔离，只保存对象引用与导航参数，不保存邮件正文、
  编辑缓冲区或授权。重开重新调用只读 owner 入口；发送、发布和其他写操作不会重放。
- 对尚未加载的历史对话，宿主恢复原对话连接后再读一次目录，不创建新 turn，也不扩大连接
  范围。另一个宿主持有对话时，显示连接占用提示和“选择对话”入口。

## 源码与验证

| Owner | 本轮进入 main 的提交 | 变更 |
| --- | --- | --- |
| App | `70f38cfa800f4208d45c44ccb3cf4ab092c9f7df` | 产品合同、导航连续性与使用边界 |
| Studio | `24f5573835cf5591416b0381147ba3608a6f2ee6` | 目录恢复、专用跳转、返回、最近位置；默认 launcher 稳定选择与切换参数隔离 |
| Framework | `933266f1af85227eb5c64876bd94b2c032ecb919` | descriptor、共享页、工作区引用、installed metadata；同版本源码更新重新构建网页 |
| Relay | `eed6cc605484865a4a219ff68ae3818adfc72179` | 邮件对象恢复、入口用途与空态 |
| Med Auto Cast | `b2df7c803e624ee949ffdb091a29444a82b996a4` | 审看焦点恢复、空态、Python stdin 参数；复用 Framework 当前制作工作区与贡献入口 |

Studio 类型检查、MCP host 的 18 项 Node 和 6 项 Bun 测试通过；Framework 的 presentation、
handoff、stdio 测试及构建通过；Relay 9 项测试通过；Med Auto Cast 的 209 项 Python 测试中，204 项通过、5 项跳过，contract/carrier 检查通过。App `validate:active-shell` 的必需 gate 完成；
缺少 worktree 插件产物的 gate 在构建插件后通过对应 focused 重跑。

浏览器验收覆盖共享页专用跳转、返回、最近位置恢复、最终 binding 释放，以及 390px 窄屏
和深色主题。Relay 在合成邮箱中验证准确草稿、保存后 owner 回读、重开与旧 revision 拒绝。
这些测试没有发送真实邮件或提交真实审看意见。另有 4 项 MAC server 测试覆盖真实 stdin 转发、当前工作区发现、显式工作区保持和 contribution broker 读写路由；209 项 Python 验证与契约检查再次通过。

## 前一版安装记录（布局已被本轮反馈替代）

完整本地构建已安装到 `/Applications/One Person Lab.app` 并重新启动。显示版本 `26.11.13`，
机器版本 `26.11.1391`，本地构建身份 `local.srce964eec331f3`；安装回执为 `completed`、
`launched=true`，整包签名验证通过。它是本地开发构建，本轮没有公开 Stable/Nightly 发布。

冻结构建来源：App `2f9eea29bcc589bec30f7f36a98d17babcb0cdc2`、Studio
`5757336568ea51843284acfaf8afa572189a4d6d`、Framework `355aaec8d8033fe20ce44eef145e68bb9f4eb1af`。
这些提交包含上表的 MiniApp 改动。本机 App 运行根和独立 managed Framework 根均已更新至
`355aaec8d8033fe20ce44eef145e68bb9f4eb1af`，实际生成网页包含专用导航与工作区引用；
Relay 0.7.3、MAC 0.3.3 的 native carrier 已更新，MAC 安装后的 bundle 与 main 字节一致。

安装与 source-lock 回执位于 `~/Library/Caches/One Person Lab/manual-latest-build/local-app/26.11.13-26.11.1391-continuity-final/`。

用户在安装后指出“应用工作台 → MiniApp 工作台 → OPL Apps”形成嵌套，
主内容空间不足。该版不作为布局验收通过的证据。

## 主内容区修复

宿主改为一条应用切换栏，移除重复标题和常驻目录；软件中心、刷新、模块视图与使用说明进入更多菜单。共享页改为顶部产品与功能选择，查找按需展开。

完整 Studio 工作台页面的浏览器验收已通过：1280 × 850 的主区域内，iframe 为 1280 × 777，
即宽度 100%、高度 91.4%，宿主仅占 73px。7 种共享视图、搜索、专用跳转与返回、
关闭重开、390px 窄屏与深色模式通过。

布局修复已进入远端主线：Studio `114d372f88a7a2c9fdc5c19df9588a56d1496959`，
Framework `4bea1e03e8db61d4778d3efe0cbf3ed3e034a2fb`，App `be5201c16dd325a557ad19ad4bb5929448848e63`。
宿主生命周期、Relay 合成草稿浏览器验收、Framework 构建和 App active-shell 必需门禁通过。
其中缺少本地插件构建产物的检查已在生成产物后通过；软件中心原有选择测试改用新的选择器，
原先的选择保持语义继续通过。

完整本地构建已安装并启动：显示版本 `26.11.13`、机器版本 `26.11.1391`，
构建身份 `local.src5eb2484099c4`。整包签名验证通过，安装回执 `completed`、`launched=true`，
回执位于 `~/Library/Caches/One Person Lab/manual-latest-build/local-app/26.11.13-26.11.1391-canvas-final/`。
Framework 的 App runtime 根和独立 managed 根均已更新至上述 `4bea1e03`。

本机真实窗口已通过 OPL Apps、Relay、Med Auto Cast 的打开和切换，以及共享页关闭重开；
OPL Apps 内容占满剩余工作区，Relay 加载邮箱快照，媒体审看加载“科普视频”工作区、212 个
登记单集和镜头时间线。原会话草稿保留，未发送邮件、Agent turn 或提交真实审看意见。

安装后的首次打开曾出现 `This tool has no available MCP App`。通过原生 Codex `0.167.1`
的同一 transport 检查全目录、server 过滤目录、临时及原历史对话，均能列出并打开共享页。
完整退出并重开 OPL App 后，原历史对话的三个自有界面实际验收通过。尚无稳定复现的目录
过滤代码缺陷证据，因此不将这次恢复表述为已定位并修复底层连接根因。

## 本次回读与后续体验重点

已安装 Framework 的 fresh stdio catalog 返回 **15 个产品入口、39 个共享视图**。
MAC 通过已安装 carrier 和 Framework 已登记工作区返回 **212 个单集**；该数字是制作目录
当前登记数，不表示 212 个 MiniApp、当前候选均可播放或已通过内容审核。

后续改进优先解决实际入口和阅读负担：

1. 工作台首次进入优先展示 OPL 概览，自有应用与第三方 connector 分组；目前目录可能先选中 Jira，
   用户容易把第三方工具参数当成 OPL 的首页。分组应消费来源投影，避免硬编码应用名单。
2. 媒体审看按“系列 → 单集 → 镜头”逐层展示，列表先返回轻量目录，选定单集再读取候选与时码。
   当前 212 集完整读取会扩大首次加载成本；工作区、系列和单集的选择应持续可见。
3. 把媒体区域中的版本散列、owner 等诊断信息收进详情；主界面用“当前版本、已有审看记录、下一步”
   说明状态，保持专业判断和机器检查的真实边界。

## 直接复用最新版 DSH

用户后续明确要求直接复用 DSH 成熟视觉，旧的 OPL 私有配色、字号和控件尺度不再保留。
本轮采用官方 `0.2.2-rc.2`、精确来源 `e8f7b93a344964de3dca1ace9e72b6e4d6de87cb`。
Studio 直接使用官方主题与 primitives；OPL Apps、Relay、媒体审看使用同源生成的官方 CSS，
仅适配原 HTML 选择器，品牌身份与领域操作布局继续保留。

| 源码归口 | 已回读的远端主线提交 |
| --- | --- |
| App 视觉合同与生成入口 | `d0a1d5a69ebbb5e8b43189337c5c5218f7f4a268` |
| Studio | `bddb86189eb764bf028c722e65aea60d24d20082` |
| Framework 共享页 | `17cb4327e961474bdf779b1f0f3c9f742e8593a1` |
| Relay | `28073a528f33af79b4183da17ae60cf739f1f25d` |
| Med Auto Cast | `5fe79c8602464238a74f8647796b0199bae4c6a3` |

App active-shell 与 GUI design-system 检查通过。完整外壳浏览器验收覆盖桌面、400px 窄屏、
主题切换、软件中心、设置焦点、会话编辑、撤销重做、排队与 steer；合成文件粘贴只暂存一次，
前台设置窗口阻止向背后 composer 粘贴。全程无未处理的浏览器错误。

三个 MiniApp 的官方 CSS 字节检查通过。共享页真实 iframe 验收检查 36px 标准按钮、32px
输入框、12px 控件圆角、14px 界面文字，并与宿主官方控件比对；字体变更与主题更新通过标准
MCP Apps context 实时传入。此前 1280 × 777 的剩余空间布局继续通过。
Relay 的合成草稿保存、owner 回读、旧 revision 拒绝、重开、窄屏和深色模式通过。
媒体审看的 Node、Python 与 contract/carrier 检查通过；最终样式修正后已重新生成安装网页。
最终本机安装使用的 source lock 精确绑定 App `441e5b6f3`、Studio `bddb8618`、
Framework `17cb4327e`、Relay `28073a528` 和 Med Auto Cast `5fe79c860`；表格中的提交为
当前各仓库远端 `main` 回读值。

首次整包 `local.src21b68049fe06` 安装后，真实窗口发现 Host 启动失败：新版 DSH 的
`dsh-llm` 引入 `dsh-error` peer，但 Electron 未将其打包。Studio 已将该包加入精确生产依赖
和 cohort；打包后的启动检查也改为复制产物到源码目录外运行，避免借用源码上层的
`node_modules`。覆盖“源码有依赖、产物缺依赖”和完整产物的回归测试通过，DSH 升级与
candidate 检查通过。首次安装记录不作为运行验收通过的证据。

## 修复后本机安装回执

修复后的完整本地构建已安装到 `/Applications/One Person Lab.app`：显示版本
`26.11.13`、机器版本 `26.11.1391`、构建身份 `local.src9b52a9274574`，
安装回执为 `completed`、`launched=true`，整包签名验证通过。安装包中的
`@deepseek-ai/dsh-error@0.2.2-rc.2` 已存在并可由独立 Node 直接加载；隔离源码目录的
Packaged Host startup check 已通过。该构建仍是本地开发构建，没有发布 Stable/Nightly。

截至本记录写入时，macOS 随后进入锁屏，桌面窗口验收等待解锁后继续；进程启动、签名和
安装回执不替代 OPL Apps、Relay、媒体审看三个窗口的实际打开与切换验收。
