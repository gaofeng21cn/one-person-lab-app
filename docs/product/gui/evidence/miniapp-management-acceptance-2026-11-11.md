# MiniApp 管理与界面验收 · 2026-11-11

本次完成 App 产品合同、Studio 管理与切换、Framework 共享 UI 和 Relay 邮件 UI 的源码交付。
产品规则见 [MiniApp 管理与工作台](../miniapp-management.md)。本记录保存当次观察，不作为固定应用注册表。

## 数量与统计口径

本机配置的 live MCP catalog 按 `server + resourceUri` 去重，共 4 个 MiniApp。
这是未指定 thread 的发现结果；具体会话仍以自己的连接范围为准。

| MiniApp | UI 资源 | 当次就绪状态 | UI owner |
| --- | --- | --- | --- |
| OPL Apps | `ui://opl/apps.html` | 可启动 | OPL Framework |
| Relay 邮箱工作台 | `ui://opl-relay/mail-workbench.html` | 可启动 | OPL Relay |
| Jira | `ui://widget/jira-widget.html` | 需要站点及 Issue 输入 | Atlassian |
| Netlify Deploys | `ui://netlify/deployments-v13.html` | 需要输入 | Netlify |

OPL Apps 的 installed catalog 含 38 个内部视图：3 个 Framework runtime 视图，
以及 14 个 Package 提供的 35 个视图。这些视图复用同一个 UI 资源，不是 38 个 MiniApp。
第三方 UI 保留其原 owner 实现，统一使用 Studio 的管理入口、启动状态和宿主布局。

已安装 Package 数、原生 slot contribution 数、内部业务视图数、MCP server 进程数和
已启动 UI session 数均不是 MiniApp 目录数量。本次没有读取用户安装版的活动 UI 会话数。
合成宿主验证了未启动为 0、启动后为 1、关闭后为 0，并验证切换不同时保留两个 binding。

## 界面与交互

- Studio：单一 MiniApp 目录与单个内容区；独立管理入口；显式启动/关闭；宽屏列表与窄屏选择器；启动失败保留目录和输入；Composer 移除交互 App 分组。
- Framework：共享渲染器的紧凑导航、视图搜索、窄屏分组选择器、长文本换行、键盘焦点、44px 触摸目标与主题切换；优化覆盖共享此渲染器的所有内部视图。
- Relay：只显示已接入操作，去掉未实现的写邮件/筛选/批量等入口和固定成功文案；收件箱、草稿、发送记录、历史邮件、已连接邮箱保持可访问；窄屏保留文字导航与保存动作。

Impeccable 精修后检查了真实浏览器的桌面、390px 窄屏及深色主题。共享 UI 使用合成业务数据，
Relay 使用真实 stdio 服务与合成邮箱账本；未发送真实邮件。共享渲染器覆盖
`task_board`、`list_detail`、`activity_log`、`approval_diff`、`timeline`、`artifact_view`、`service_status`。
这是共享组件覆盖，不代表逐项接受所有领域输出的业务质量。

机械检测：Framework 无发现；Studio 的两个侧边框提示位于既有模块视图样式；Relay 的
字号提示来自尚未注入样式的 HTML 模板，实际样式与渲染已具备正文和标题层级。以渲染检查为准。

## 可重复验证

| 验证面 | 命令或路径 | 结果 |
| --- | --- | --- |
| App 合同与真实 Shell | `bun run validate:active-shell`，独立 worktree 指定 `OPL_APP_SHELL_ROOT` 与 `OPL_APP_REPO_ROOT` | 通过全部合同命令 |
| Composer 产品合同 | `node --experimental-strip-types --test tests/release/app-release-boundary-cases/codex-visual-parity-policy.test.ts` | 通过 |
| Studio 宿主 | `npm run test:mcp-apps` 与 `node scripts/smoke-mcp-apps.mjs` | 通过 |
| 共享 UI | `node scripts/smoke-mcp-apps.mjs --framework-root <framework>` | 通过 7 类视图、窄屏与深色主题 |
| Relay UI | `node scripts/smoke-mcp-apps.mjs --relay-root <relay>` | 通过精确草稿打开、保存回读、重开和旧 revision 拒绝 |
| Framework owner 接线 | `node --experimental-strip-types --test tests/src/opl-mcp-app-stdio.test.ts`；handoff 与 execute-race suites | 通过 |
| Relay 资源与协议 | `npm run build && npm test`（`workbench`） | 9 项通过，构建更新 Package content lock |

宿主交互还覆盖：发现/选中不自动启动、管理入口、必填参数、迟到启动结果释放、切换前关闭旧
binding、仅会话结果可打开的 App、目录重试、空目录、无会话、撤权、未知写入结果不自动重试。

源码与浏览器验收已完成；本次不包含 Stable/Nightly 发布或 `/Applications/One Person Lab.app`
安装更新。安装版的界面及活动会话须在相应构建安装后另行回读。
