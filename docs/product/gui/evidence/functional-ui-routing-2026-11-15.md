# 功能入口统一验收

Owner: `one-person-lab-app`
Date: `2026-11-15`
Scope: 本次任务 worktree 的 App 合同、Framework 投影与 Studio 源码／交互；安装版与正式发布另行验收。

## 产品决策

软件中心统一安装、更新、启停和卸载。插件的仓库、安装器及软件／运行组件分类不决定
使用方式。微信等标准功能保留稳定设置入口；连接进入连接设置，服务与设备状态进入
服务状态，技术诊断按技术详情开关显示。日常业务通过同一个应用工作台，任务阶段、
产物与证据进入带任务身份的工作台。

旧 `settings.section` 业务声明保留兼容读取，列表、时间线、审核、任务板及产物不再
因此进入设置。移除并行“模块视图”导航及其独立读取路径，复用现有标准 MCP App 宿主、
共享 OPL Apps 和领域专用 MiniApp。Settings 搜索与软件详情使用同一功能路由。

## 能力覆盖

使用本轮 Framework 描述与实际 Studio 路由重放 19 个包、48 项贡献：

| 去向 | 数量 |
| --- | ---: |
| 应用工作台的业务视图 | 30 |
| 任务工作台 | 9 |
| 服务状态 | 5 |
| 远程连接设置 | 2 |
| 用户启用后的技术诊断 | 2 |
| 无去向 | 0 |

Framework 也直接发现了当前已安装描述：14 个业务产品、33 项领域业务视图，另含 3 项
Framework 任务上下文视图。该回读只证明安装描述和目录投影，不代替逐个业务账号或任务验收。
软件目录与 MCP 目录复用同一业务入口选择；排在首位的服务状态不会被选成业务首页。
所有现有业务包均有 owner contribution ABI；微信与通用远程伴侣继续使用原生连接设置链路。

## 验证

App 的 15 项能力合同测试通过。Framework 的 21 项 MCP／原生入口测试通过，其中
stdio 测试实际启动隔离服务，完成资源发现、owner 读取、确认动作及结果回读；另验证
软件目录真实 fast projection 会跳过首位服务视图。Framework 与 Studio 类型检查通过。

`bun run validate:active-shell` 完成类型、Node、renderer、App conformance 与 state-model
五阶段。首次 Node 阶段因新 worktree 尚未构建插件而失败，构建后通过；旧模块导航的
测试随已确认的新合同删除，renderer 及后续阶段从失败处继续并通过。

实际 React 挂载验证微信运行组件配置、PIN 前导零、无提供者引导、服务页挂载、业务
视图不进入设置、旧能力配置跳转、统一 MCP 宿主、精确任务身份及返回路径。

Playwright 使用真实组件的隔离交互 fixture，在 1280 px 桌面与 390 px 窄屏验证连接、
服务、能力配置到工作台的键盘入口；无横向溢出。设置仅读取 channel_access 与
service_status，业务视图读取数为 0；工作台只有一个应用切换器，已移除模块视图入口。
截图保存在 Studio `out/acceptance/functional-ui/`，fixture 位于
`tests/renderer/functional-settings.fixture.tsx`。这些是组件交互证据，不代表已安装 App 已切换版本。
