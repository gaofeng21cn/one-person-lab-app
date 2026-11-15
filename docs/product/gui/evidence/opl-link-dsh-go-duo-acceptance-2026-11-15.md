# OPL Link：DSH Go 视觉与 Duo 验收

日期：2026-11-15。产品 Owner：`one-person-lab-app`；原生客户端 Owner：`opl-link`。

本轮沿用已完成的[原生手机伴侣链路](opl-link-native-companion-acceptance-2026-11-15.md)，
落实用户指定的 DSH Go 视觉方向及 iPhone Duo 适配。互联网部分完成
[源码与接入体验研究](../../opl-link-internet-access.md)，当前推荐 Tailscale Serve 向导；
本轮没有接入第三方登录或启动公网隧道。

本轮原生运行验收基于 [`ab8927b2`](https://github.com/gaofeng21cn/opl-link/commit/ab8927b21eb2958fbbea71769df6b8423a48d317)，
后续 [`4334f4aa`](https://github.com/gaofeng21cn/opl-link/commit/4334f4aaf71039a76feec4457fde2bfb8184363a)
补充旧版 Xcode SDK 的编译分支；现代 SDK 的 Duo 导航路径保持相同。
Studio 沿用 [`728c2a33`](https://github.com/gaofeng21cn/opl-studio/commit/728c2a3334615e523a656d9feba2cccd71cc385e)，
本轮没有修改其产品源码。

## 设计与实现

采用雾蓝灰浅色表面、石板深色表面和克制的蓝色操作；连接与运行状态由中性符号、文字和进度
表达，待处理请求使用琥珀提示。移除旧绿色 LinkLogo，换用本仓原创几何 link 图标。
DSH Go 提供视觉参考，本轮没有复制其素材或 App 源码。

导航按窗口实际可用宽度和 Dynamic Type 调整，沿用同一 AppModel、thread 和草稿。
系统管理导航标题、副标题、safe area 与键盘；宽窗口限制正文宽度，辅助功能大字体使用
纵向审批动作。窗口宽度决定分栏偏好，实际呈现继续由同一 NavigationSplitView 适配。
MarkdownUI 负责正文 Dynamic Type，避免外层再次缩放。

## Duo 验证环境

使用 Apple 官方 iOS 27.2 专用 build `24B91016s`，runtime 标识
`com.apple.CoreSimulator.SimRuntime.iOS-27-2-iPhone19-4`。官方 profile 的
`restrictedToDeviceTypes` 为 `iPhone19,4`，安装后为 `Verified / Ready`，实际创建设备类型
`com.apple.CoreSimulator.SimDeviceType.iPhone-Duo` 并启动客户端。

普通 iOS 27.2 build `24B114` 明确排除该型号，不能用于 Duo 资格验证。本轮未修改设备类型、
最低系统版本或 runtime 能力定义。设备开合采用 Apple Device Hub 的系统控制。

实际运行已确认：外屏采用系统纵向栏，内屏展开后为目录与会话两栏；Closed、Partially Open、
Open 往返保留选中的对话、阅读区域，以及 XCUITest 实际输入的同一草稿。软键盘在内外屏出现
时，输入栏随系统安全区上移。Device Hub 原生旋转后，正文、文件区、草稿和软键盘继续可用。
审批面板在内屏、外屏往返后保持同一 `mkdir -p results/references` 示例请求，允许和拒绝均可达；
验收没有执行演示批准。

多显示器设备不使用 `app.frame.width > app.frame.height` 作为唯一旋转证明。自动检查保留
方向切换请求后的草稿及控件断言；实际方向另以 Device Hub 原生 Rotate 操作和显示器截图确认。
单独改变 AX 显示值不计作草稿保存证据。

深色辅助功能大字体下，结构化问题可以真实输入、切换上一题/下一题并保留答案，提交动作可达。
本轮发现默认半高面板容不下外屏的大字体自由输入框，已改为辅助功能大字体使用系统 large detent，
定向回验通过。主要动作使用适配浅深色的文字颜色，避免深色时浅蓝按钮上的白字对比不足。

普通 iPhone 的目录、正文、键盘与审批路径，以及独立 iPad 的代表路径通过；iPad 横屏另以稳定
运行截图审看。测试附件中一次过早截图产生的黑区不纳入有效图片或方向资格证据。
列表预览改回系统 secondary 层级以跟随原生选中态；最终构建及非活动选中态实图已回读，
宿主锁屏后没有再次观察活动蓝底，保留这一局部视觉观察范围。

最终截图使用演示数据，保存在本机验收目录
`/Users/gaofeng/.codex/visualizations/2026/11/15/01a1dc8c-b3d9-78c3-a561-0e083a7f7ae2/opl-link-final/`。
官方 runtime 的小型来源证据另存于同一任务的 `opl-link-duo-design/runtime-evidence/`。

## App 与 Shell 检查

Companion 产品与 wire 的 12 项 focused tests 通过。Active Shell 的 typecheck、renderer、
contract conformance 和 state model 分项通过；Node suite 在受控并发下 510 项全过。
首次默认高并发执行中，两项已有时限测试受本机下载/解包负载影响失败；对应文件的 15 项
检查串行通过，再完成上述 Node suite。未修改这两项测试或无关 Shell 实现。

## 运行与分发范围

本轮改动集中于 iOS 呈现和窗口适配；Codex、配对、凭据、网络协议及 mutation 行为沿用
上一轮已经验证的实现。界面中的演示内容用于观察布局和交互；真实 Codex 续聊与文件闭环
的证据仍以原链路验收记录为准。

桌面安装更新、真实 iPhone 的 HTTPS/蜂窝网络、休眠恢复及 Apple 公开分发尚未验收。
`installed_desktop_updated`、`real_iphone_qualified`、`public_beta_or_app_store_published`
和 `release_ready` 继续为 `false`。
