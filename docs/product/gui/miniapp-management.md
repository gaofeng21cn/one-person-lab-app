# MiniApp 管理与工作台

Owner: `one-person-lab-app`
Purpose: 定义标准 MCP App 在 OPL App 中的身份、管理入口、切换入口和运行边界。
State: `active_product_reference`
Visual baseline: [`contracts/opl-apps-miniapp-visual-contract.json`](../../../contracts/opl-apps-miniapp-visual-contract.json)

## 结论

OPL 的标准 MCP App 工作台按“一个 MiniApp 对应一个 UI surface”组织。用户在当前
Codex 会话中看到的是 MiniApp 列表和当前 App 内容；`server`、`tool`、resource URI
和参数 schema 属于宿主实现细节，不作为默认的信息架构。

MiniApp 有三个彼此分开的平面：

| 平面 | 用户入口 | 负责内容 |
| --- | --- | --- |
| 管理 | 软件中心（`/apps`） | Package 的安装、启停、版本、来源、权限和就绪状态；不维护第二份 MiniApp 注册表 |
| 导航 | 会话工作台的应用切换器；任务详情的直接入口 | 在当前 thread scope 内选择一个已声明的 MiniApp，并保留回到产生它的会话或 Runtime 任务的路径 |
| 运行 | 当前 MiniApp surface | 由 MCP App 自己组织页面和业务流程；宿主只提供 AppBridge、主题、语言、尺寸、连接和批准边界 |

因此，软件中心回答“这个能力是否安装并可用”，应用切换回答“当前要看哪个 UI”，
MiniApp 内容回答“这个 UI 如何完成工作”。三者不共享本地状态副本。

## 身份与分组

MiniApp 的稳定身份优先使用工具或资源声明的 `ui.appId`/`ui.id`；标准声明没有提供
稳定 ID 时，宿主使用 `mcp:<server>:<resourceUri>` 作为兼容回退身份。相同 server
下指向同一 `resourceUri` 的多个工具属于同一个 MiniApp：只保留一个切换项，工具集合
作为该 App 的内部能力集合。

每个 MiniApp 目录项至少包含：

- `mini_app_id`：切换、任务回溯和日志关联使用的稳定身份；
- `title`、`description`：用户可见名称与说明；
- `resource_uri`：宿主读取的 UI 资源；
- `launch_tool`：默认打开该 UI 的只读工具；
- `tools`：该资源所属的 App-visible 工具集合；
- `readiness`：当前会话可打开、需要输入，或只能从会话结果打开。

手动打开只调用 `launch_tool`，而且必须满足只读声明。已完成的 Agent 调用可以用
原始 `server + tool + call_id` 回放其精确结果；这条回溯路径不会重新执行写操作。

同一资源有多个只读工具时，默认入口优先选择面向模型、无需对象必填参数的工具；
选择不依赖目录顺序或翻译后的工具名称，避免把内部读取功能显示为应用首页。

## 入口规则

### 产品入口与 MiniApp surface

OPL Apps 的“产品入口”是 Package 级导航投影，MiniApp 是 MCP `server + resourceUri` 级运行 surface；两者故意不是同一计数口径。一个产品可以有多个共享声明式 view，也可以同时声明一个独立标准 MCP App。共享界面先选择应用，再显示该应用的功能；搜索时可以跨应用查找。选择应用进入其第一个已声明 view，不会启动独立 surface。有专用界面的产品在共享页标为“共享概览”，并提供“打开专用界面”。点击后通过标准 `ui/open-link` 请求 owner 声明的 `dedicated_resource_uri`，宿主在当前 live catalog 中找到唯一目标，只调用其只读 launcher；目标不存在或不唯一时保留当前页面并显示恢复提示。

Framework 从已安装 Package 的 `presentation.miniapp` 和 `app_contributions` 动态生成 `catalog.products`。`shared_view` 表示产品 view 复用 `ui://opl/apps.html`；`dedicated_app` 表示产品拥有自己的标准 MCP App resource；`professional_app` 表示需要高频创作、设备、地图或监测布局的专业应用。缺少 metadata 时安全回退为 `shared_view/product_entry`，使用第一个已声明 view 导航，不按 Package ID 写宿主硬编码。

`entry_kind=runtime_view` 是 Framework 的上下文视图，不进入 `catalog.products`，也不计为
一个独立产品或一个新的 MiniApp surface。首页 `/runtime` 先列出全局 work items，用户选中
任务后直接打开 `opl.runtime.item`；此时 OPL Apps 只显示“任务工作台”上下文和任务内部视图，
隐藏产品选择器，避免出现“应用工作台 → MiniApp 工作台 → OPL Runtime → 当前任务”的套娃。
没有明确任务 focus 时，OPL Apps 默认选择第一个 `product_entry`；这让 OPL Runtime 继续可被
兼容工具读取，同时不再抢占普通产品入口。

因此当前统计必须分开报告：OPL 自有 MiniApp surface、OPL Apps 内部 view、第三方 connector surface，以及当前已启动的 UI session。产品入口数量只能说明导航分组，不能替代前三项中的任何一项。

### 软件中心

软件中心继续复用现有 `/apps` 和 Framework 的 Package projection。MiniApp 不成为新的
安装单元，也不在 Studio 中维护固定清单、锁文件、版本解析或启停状态。一个 Package
可以提供多个 MiniApp；Package 被禁用、卸载或失去宿主能力后，当前会话重新发现并投影
相应的目录变化或连接错误；App 不凭空补出第二份 MiniApp 清单。

### 应用切换

会话工作台提供一个应用切换器，切换对象是 `mini_app_id`。选择另一项时先释放旧的临时
AppBridge binding，再显示所选应用介绍；用户点击“打开界面”后才打开新的 App。旧 App 的业务状态仍由其 owner 保管。切换器显示应用名称，工具栏显示当前界面的打开状态；未打开时在内容区说明用途、就绪条件与必要参数。所有尺寸均使用紧凑的应用选择器；打开后不保留常驻应用目录侧栏。
只保留一条宿主工具栏，包含应用切换、打开或关闭、返回和更多操作；不显示 MCP server、tool 或原始 resource URI。

任务详情携带精确的 `item_id`、`view_id` 和 thread，直接打开对应 MiniApp/view，
不再先进入一个通用的 MCP tool 下拉选择器。关闭后返回 Runtime 任务详情；刷新或切换
会话不会重放已完成的 mutation。

Composer 只负责 Agent、Skill、文件、目录和当前会话上下文。交互式 MiniApp 不再作为
“应用与连接”选择项出现；连接状态由宿主和软件中心（`/apps`）提供，交互 UI 由应用
切换器提供。

### 运行面

一个 MiniApp 对应一个 sandboxed iframe 和一个临时 AppBridge session。MiniApp 可以在
自己的资源中组织多个页面或业务模块，但这些页面属于同一 App surface；宿主不把它们
拆成多个 `server:tool` 顶层标签。AppBridge 的工具调用、资源读取、主题/语言/尺寸、
上下文和消息通道继续沿用 `docs/mcp-apps/SPEC.md` 的安全与生命周期规则。

## 内容区与宿主层级

打开 MiniApp 后，主内容区由一条宿主工具栏和填满剩余空间的 App 组成。不能叠放“应用工作台 → MiniApp 工作台 → 当前应用”三层标题，也不能同时常驻宿主应用目录和共享页产品导航两列侧栏。目录刷新、软件管理、模块视图和关闭行为说明放入更多菜单；未打开、缺参数和错误状态才显示必要说明。

桌面宿主工具栏不超过 80px；常规桌面验收中 iframe 至少占主区域宽度的 98%、高度的 84%。应用内部可以保留邮件、任务或镜头列表等业务导航，但产品与功能选择不另占宽侧栏。窄屏允许紧凑工具栏换行，保持操作命中区和完整内容宽度。

## 连续使用与首屏

共享概览的专用入口来自 Package `presentation.miniapp.dedicated_resource_uri`，不是宿主固定清单。URI fragment 是编码后的 JSON 导航参数，宿主只接受目标 launcher schema 中声明的字段；选中对象的字段由领域页面提供。跨界面打开成功后保留“返回上一界面”，返回时重新读取 owner 当前状态。

三个自有 UI 通过标准 `ui/update-model-context` 的 `structuredContent.navigation` 提供可用于再次打开的参数。宿主只在本机保存按 thread、server、resource 隔离的有限导航偏好，不缓存正文、编辑内容、权限、执行回执或业务状态。用户再次点击“打开界面”时恢复这些参数；显式任务入口优先，旧对象不可用时可“从首页打开”。后台写操作不参与恢复。

媒体审看从 Framework 的已登记当前制作工作区进入；页面显示工作区，单集、镜头和最近位置一并保留 `workspace_path`。显式导航每次经过 contribution broker 核对，未连接时提示登记工作区。

首屏说明当前应用能完成的任务和下一步。未选择对话时可直接返回对话；无连接、无内容与读取失败分别显示原因和对应入口。历史对话尚未加载时只恢复该原生 thread 的连接，不启动 Agent turn、不修改其权限；另一宿主仍持有写入权时提示切换或等待该对话结束。

## 用户可见术语

界面统一使用“打开界面／关闭界面”和“界面未打开／界面已打开”，避免把 UI 会话理解成智能体或后台任务进程。工作台说明“关闭或切换仅收起界面，后台任务继续运行”；安装、更新和启停归“软件中心”。“启动”仍用于本文的技术生命周期描述。

共享 OPL Apps 以“选择应用 → 查看功能”组织导航，产品与功能选择器放在紧凑顶部栏，搜索按需展开，不再占用一列常驻导航。页面名称表达用户任务，server、resource、view 等标识仅在诊断中使用。

## 未启动、已启动与管理的区别

| 对象或状态 | 实际存在什么 | 用户动作及结果 |
| --- | --- | --- |
| 软件中心 | Framework/原生 carrier 投影的安装、启用、版本、权限和连接状态 | 安装、启停或维护 Package；进入管理页不会启动 MiniApp |
| 未启动 | 当前会话发现的名称、说明、只读入口和参数要求 | 选中只查看介绍；点击“打开界面”才调用只读入口并读取 UI 资源 |
| 启动中 | 正在读取启动结果和 UI 资源 | 防止重复启动；可以切换，迟到的结果会被释放 |
| 已启动 | 当前 thread 的临时 host binding、AppBridge 和一个 iframe | 在应用内交互；页面本身初始化失败时显示恢复提示 |
| 关闭或切换后 | UI 会话已释放，目录项仍可再次启动 | 不卸载 Package、不停掉 MCP 连接，也不取消 owner 的后台任务 |

一个工作台同时显示零个或一个 MiniApp。再次启动读取 owner 的最新状态；业务任务是否
运行、Package 是否启用与 UI 是否启动分别由各自 owner 决定。计数以当前会话 live
catalog 中去重的 `server + resourceUri` 为准，内部 view 数和 UI 会话数另外列出；不把
MCP server 进程、工具数量、Package 数量或安装就绪状态当成 MiniApp 启动数。

在 OPL Apps 内，选择应用或切换其功能 只是 `ui://opl/apps.html` 里的导航，不会创建新的 iframe 或新的 MiniApp session。Relay 邮件工作台和 Med Auto Cast 媒体审看属于各自独立的 `server + resourceUri` surface；它们只有在各自的只读 launcher 被调用、资源读取并完成 AppBridge 初始化后才算“已启动”。

OPL Apps 的 `ui://opl/apps.html` 是一个共享 MiniApp，包含 runtime 和已安装 Package
提供的逻辑视图；Relay 的独立邮件 UI 与 Med Auto Cast 媒体审看 UI 各是一个独立 surface。
具体数量随安装及当前会话的连接范围变化，不在宿主维护固定应用清单。

视觉直接复用 App 选定的最新 DSH theme、typography 和 primitives，不维护 OPL 私有配色、字号、
行高、圆角或控件密度。所有自有 MiniApp 保留 `data-opl-family="opl-apps"` 和可识别的 OPL
品牌／领域名称，品牌不增加重复的宿主标题。邮件列表、编辑器、时间线等业务布局由领域决定。

App 持有唯一视觉 source cohort 与生成入口；三个自有 MiniApp 嵌入同一份从官方 CSS 生成的
`dsh-theme.css`。只将官方 CSS Module 的选择器适配到已有 HTML 控件，不修改其样式值，
因此独立打开时也采用相同 DSH 风格。Studio 通过标准 MCP Apps `hostContext.styles.variables`
传入当前生效字体和主题变量；主题或字体变化同步到 iframe，不新增通信协议。

详细来源、升级规则和本轮验证见[2026-11-13 UI 与字体对照](evidence/dsh-ui-typography-comparison-2026-11-13.md)。

## 参考模型

- [Codex App Server](https://learn.chatgpt.com/docs/app-server#api-overview)：
  `app/installed`/`app/list` 投影 connector 的可用、启用和可调用状态；
  `mcpServerStatus/list` 发现工具与资源，并可用 `threadId` 复用当前会话的连接。
  这支持管理与会话运行分层。官方文档将部分 plugin 管理 API 标为开发中，不能据此
  推断 Codex 已提供某一种 MiniApp 切换 UI；OPL 的单 surface 切换是本产品合同。

- [MiniMax Code Mini App](https://www.minimax.io/blog/minimax-code-mini-app-1792650729)：
  MiniApp 作为插件级应用拥有自己的页面和 Node runtime，Host 负责进程、端口、凭据、
  权限与发布；页面从会话侧栏打开，也可以弹出独立窗口。
- [MiniMax Code plugin manager](https://github.com/MiniMax-AI/minimax-code/blob/main/packages/tui/src/tui/features/plugin/manager.ts)：
  管理对象是插件身份，统一提供 All、Installed、Official、Local、启停、安装和删除；
  不是把每个 MCP tool 当成独立产品。
- [MiniMax MiniApp package contract](https://github.com/MiniMax-AI/MiniMax-Code-MiniApps/blob/main/docs/package-contract.md)：
  一个插件可同时携带一个页面、Node runtime、Skills 和 MCP servers；运行时按需启动。
- [DSH MCP subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/mcp.md)：
  DSH 按 MCP server 管理连接、资源、工具与权限，资源按当前 Agent scope 按需发现。
- [DSH MCP Apps discussion](https://github.com/deepseek-ai/deepseek-harness/discussions/2424)：
  Session Header 提供当前会话的 App 入口，允许在多个 App 之间切换；App 仍属于当前
  任务上下文，并支持 inline/fullscreen 两种呈现。

OPL 采用这些模型的共同点：Package/插件负责安装和生命周期，Host 负责连接与权限，
会话侧负责打开和切换，App 自己负责 UI。OPL 不复制 MiniMax 的插件格式，也不把 DSH
的 Agent/session inventory 变成 App 的第二份注册表。

## 当前实现收敛

当前实现已经完成这次收敛：

1. `McpAppHost` 在 live MCP catalog 中按 `server + resourceUri` 分组，并投影一个 App 目录项。
2. `McpAppWorkspace` 顶部只保留紧凑切换栏，当前 MiniApp 占满剩余内容区；加载、
   空态、错误重试和软件中心入口都在同一工作台内完成。
3. Task detail 直接打开准确的 MiniApp/view，保留原有 item/view/thread 绑定。
4. Composer 已删除交互 App 分组，继续保留 Agent、Skill、文件和目录选择。
5. `package_contribution` 的声明式模块视图保持原有 owner 和 broker 边界；它不是标准
   MCP App，也不再与 MiniApp 目录混为一谈。

## 验收边界

合同、Studio 源码、浏览器交互、安装版和发布分别验收。最小行为检查包括：

- 同一 server/resource 的多个工具只产生一个 MiniApp 条目；切换使用稳定 `mini_app_id`；
- 手动打开不会调用非只读工具，已完成调用回放不重复 mutation；
- 切换、关闭、thread 变化和连接重置都会释放旧 binding；
- Runtime 任务详情能直接打开精确 item/view，并能返回 Runtime；
- Composer 中没有交互 App 选择项；软件中心仍可从工作台进入；
- 目录读取失败、资源失效和权限撤销只影响对应 App，其他会话和应用保持可用。

本次目录数量、视觉优化和源码验收记录见
[2026-11-13 连续操作与本机验收](evidence/miniapp-management-acceptance-2026-11-13.md)；
[2026-11-12 安装记录](evidence/miniapp-management-acceptance-2026-11-12.md) 和
[2026-11-11 记录](evidence/miniapp-management-acceptance-2026-11-11.md) 保留为历史观察。

