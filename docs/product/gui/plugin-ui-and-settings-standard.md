# 插件 UI、设置接入与全插件理想态标准（SSOT）

Owner: `one-person-lab-app`
State: `active`
Contracts: [`opl-app-contributions.schema.json`](../../../contracts/opl-app-contributions.schema.json), [`app-plugin-composition-taxonomy.json`](../../../contracts/app-plugin-composition-taxonomy.json), [`app-gui-product-contract.json`](../../../contracts/app-gui-product-contract.json)

本文件定义 OPL App 理想形态的唯一设计宪法、插件 UI 与设置接入三级规范、软件中心统一心智模型，以及分阶段演进与验收标准。已有边界与分层见 [DSH 插件与 OPL 设置归属](dsh-plugin-and-settings-map.md)、[OPL App 插件组合与仓库边界](plugin-composition-map.md)、[软件中心](software-management.md) 与 [分层更新模型](../managed-update-three-layer.md)。

---

## 1. 理想状态与「四统一」设计宪法

OPL App 的理想形态是：**一个极薄、极稳、极少需要重装的宿主底座（Electron / Web 壳 + 固定 DSH Runtime + Core Services）＋ 一组来源平权、可按需组合、界面规范一致、持续自动更新的能力与软件插件生态。**

所有架构改造、插件开发与 UX 评审遵循四项统一原则（不建立平行插件 ABI、第二套加载器或第二套安装数据库）：

1. **能力与来源统一**
   - OPL 自有、社区 DSH 插件、Codex 插件、原生应用/CLI 与独立能力包在发现、安装、启停、更新检查、后台自动更新与异常聚合上适用一致规则。
   - 来源（`OPL` / 第三方）与安装方式（OCI / npm / 离线载荷；独立桌面客户端与外部 CLI 另经 Homebrew 分发）仅作为信任标识、安全上下文与详情溯源字段，不构成功能限制或第二套交互流程，也不为单个第三方包在 App/Host 跨文件编写特例逻辑。
2. **UI 与设置接入统一**
   - 插件不自建顶层设置分类；所有能力设置按用户任务归属落入既有设置页（概览 / 账户与模型 / 资料与连接 / 工作区 / 能力与指令 / 运行与维护 / 偏好）。
   - 插件界面严格遵循「三级标准接入层（Tier 1 → Tier 2 → Tier 3）」，复用统一设计原语、明暗主题 CSS tokens、可访问性交互后校验、全局设置搜索、深链与运行时错误隔离边界（`ErrorBoundary`）。
3. **软件中心心智统一**
   - 默认「全部软件」按产品用途提供智能体、应用、效率扩展和连接通道四类筛选。运行底座与依赖在「运行组件」维护。DSH、Codex、OCI 等载体在软件详情展示（Homebrew 分发独立桌面应用与命令行）。
   - 软件目录与更新页覆盖全部来源，所有安装/更新/卸载动作尽量收敛到同一预检确认、实时进度、「安装记录」台账与失败重试链路；前置明示软件声明的权限范围与运行方式。
4. **自动更新与演进统一**
   - 安装包只负责首次便捷安装；日常兼容插件、Framework runtime 与软件包均可在后台免令牌自动更新。
   - 更新页提供统一单列表、单入口「检查全部更新」与「更新全部」（覆盖 OPL Base、桌面客户端、全部 DSH 官方与外部扩展及批量软件包队列）；主界面顶栏按生效方式提供不遮挡内容的轻量「更新就绪 · 重启生效」或纯前端「界面更新就绪 · 刷新生效」入口；启动期若更新后扩展异常，自动熔断隔离并回退到随壳内置基线；纯前端客户端插件演进为细粒度独立包并支持无感轻刷新。

---

## 2. 插件 UI 与设置三级接入规范

任何需要向 OPL App 贡献用户界面或设置项的能力，必须按**从低耦合到高定制**的顺序选择唯一合规层级：

| 层级 | 适用场景 | 核心契约 / 扩展点 | 运行时承载与安全边界 | 典型例子 |
| --- | --- | --- | --- | --- |
| **Tier 1 · 声明式 Schema（首选）** | 通道接入、服务状态、开关/参数配置页 | [`opl-app-contributions.schema.json`](../../../contracts/opl-app-contributions.schema.json) (`app_contributions`, slot `settings.section` / `runtime.detail` / `composer.palette`) | Studio 以固定白名单原语渲染；读写经本机 `opld` 公开 RPC（`app.contribution.read` / `app.action.execute`，不依赖已删除 v1 CLI） | `channel_access`、`service_status`、`settings_form` |
| **Tier 2 · 类型化 DSH Client Slot + 共享 UI Kit** | 需丰富本地交互的一级工作面、原生设置组卡片 | DSH `dsh.client` + 强类型 `OplSlotRegistry` + 公开包 `@gaofeng21cn/opl-plugin-ui-kit`（仓内经 `@gaofeng21cn/opl-dsh-adapters/ui-kit` 透传兼容） | 独立 CJS client bundle 由 DSH `client-modules` 装载；外层包裹 `PluginErrorBoundary`；禁止相对路径直连 `vendor/` 或私有宿主机包 | `opl-runtime-status`（运行状态）、`opl-materials-space`（资料空间）、`opl-team-bots`、`opl-superagent`、第三方 DSH 客户端设置卡片 |
| **Tier 3 · 沙箱 MCP App** | 领域独立工作台、审阅看板、多步骤生产力应用 | MCP Apps SDK `AppBridge` ＋ `@gaofeng21cn/opl-mcp-apps` | 独立沙箱 iframe；透传主题/字号/语言 token；复用当前 Codex 线程、权限与审批 | 科研助手工作台、领域专用 MiniApp |

### 2.1 Tier 1 声明式设置表单规范（`settings_form`）

- **视图类型**：在 `opl-app-contributions.v1` 中增加标准配置视图 `view_type: "settings_form"`，返回结果 Schema `opl-app-settings-form.v1`。
- **目标设置分区（禁止自建顶层页）**：声明 `settings_destination`，仅允许落入既有功能页 `models`、`resources`、`workspace`、`capabilities`、`services`、`preferences`。
- **标准字段原语**：支持 `boolean`（开关）、`enum`（2–5 项单选分段或 ≥6 项下拉选择）、`string`（单行/多行文本）、`number`（带边界数值）、`directory`（原生文件夹选择器）与 `secret_ref`（凭据句柄/安全密文录入，严禁明文回流 App state）。
- **生效时机与回读**：每个字段必须声明 `effect_timing`（`"immediate"` | `"next_task"` | `"restart_required"`），界面清晰标注何时生效；提交后强制重新读取真实 owner 状态（readback），禁止 UI 乐观伪造成功。
- **表单交互与可访问性**：遵循 `blur`/提交后校验（`:user-invalid` + `aria-invalid` + 单个 `role="status"` / `aria-live` 提示区域 + 提交出错自动聚焦首错项），不在用户输入过程中提前报错。
- **自动联动**：注册后的 `settings_form` 视图自动进入全局设置搜索（`settingsSearchTargets`）、支持深链 `/settings?section=<dest>&packageId=<id>`，并在软件中心对应软件行自动露出「配置」直达按钮。

### 2.2 Tier 2 共享 UI Kit 与设置子槽位规范

- **公开边界**：共用界面原语（`SettingRow`、`SettingsGroup`、`StatusPill`、`EmptyState`、`PluginErrorBoundary`、受选 DSH 基础组件）与槽位/状态 hooks（`registerOplSettingsGroup`、`readOplSettingsGroupMeta`、`useOplLocale`、`useOplSettingsNavigation`、`OPL_STUDIO_SHELL_SERVICE`、`useOplStudioShellSnapshot`）由公开发布的 `@gaofeng21cn/opl-plugin-ui-kit`（GitHub Packages，带 provenance）统一提供（仓内 `@gaofeng21cn/opl-dsh-adapters/ui-kit` 仅作薄透传以兼容内部一等插件）；声明式表单渲染器（`DeclarativeSettingsForm`）与通用本地工作区预览组件（`WorkspaceFilePreview`）归壳侧与 `@gaofeng21cn/opl-dsh-adapters/workspace-preview` 提供；受限目录与只读工作区文件访问原语由 `@gaofeng21cn/opl-host-kit/workspace-fs` 提供。
- **App 级一等扩展插件（Tier 2）**：
  - `@gaofeng21cn/opl-runtime-status`（侧栏 `id: "runtime"`, `order: 20`）：消费 `oplStudioShell` Cordis 服务与 Framework `work_item_projection_v2` 投影，提供自动刷新、运行焦点条（Active Runs Spotlight）、可视化阶段进度条与 Popover、本地任务详情抽屉、按代次并发校验的归档/恢复确认，以及向资料空间的一键跳转。
  - `@gaofeng21cn/opl-materials-space`（侧栏 `id: "materials"`, `order: 25`）：由 Host 服务（基于已注册智能体项目目录发现、自动跳过 `runtime/`、`control/`、`controller/` 等内部状态目录）与 Client UI 组成，提供跨智能体多项目目录的「交付物」与「全部文件」双模式浏览与富文本/表格/沙箱 HTML/PDF/媒体预览。
  - **可选工作总控插件（`@gaofeng21cn/opl-flow-workbench`）**：遵循 Framework v2 架构边界（Studio 侧 DSH/Cordis 承载交互界面与插件组合，Framework `opld` 仅通过公开 RPC `app.state.get`、`app.contribution.read`、`app.action.execute` 提供状态投影与动作执行；Package 启停与同步使用 `opl pack ensure` / `opl pack sync`，禁止依赖已删除的 Framework v1 CLI）。遵循 Tier 2 规范（标准 `sidebar.panellist` `id: "opl-flow"` 默认放入 `default_unpinned_panel_ids` 收纳于「更多」、仅在 `opl-flow` Package 安装启用后条件露出；看板读取支持受信任本机模式 `include_local_navigation: true` 与 `host_carrier` 并严格按只读 `jump_mode` 切换或启动宿主原生会话；`send` 契约包含 `executor` 与 `session_ref`，`service` 契约纳入标准贡献动作；**禁止在插件页内自建第二套聊天框或线程存储**），完整规划见 [OPL Flow 控制塔规划](https://github.com/gaofeng21cn/opl-flow/blob/main/docs/opl-flow-workbench-plugin-plan.md)。
- **零源码直连约束**：所有 `plugins/*` 包严禁使用 `../../../../vendor/deepseek-harness/...` 相对路径导入内部源码，严禁绕过 `SlotRegistry` 隐式读写全局变量。
- **侧栏左下角账户展示规范**：连接 OPL Gateway 账号后，左下角设置/账户触发入口优先展示账号 `display_name`（如用户姓名），`email` 仅作无姓名时的回退与悬停提示补充；未登录或不可用时回退标准入口文案，不在设置弹窗内外制造第二个重复设置入口。
- **受控设置子槽位**：开放 `settings.group.models`、`settings.group.resources`、`settings.group.workspace`、`settings.group.capabilities`、`settings.group.services`、`settings.group.preferences`。插件注册卡片必须提供稳定 `id`、`packageId`、`titleI18n` 与 `searchKeywords`（与全局设置搜索统一索引）。
- Studio 内置微信通道（`opl-channel-weixin`）使用 `settings.group.resources`，沿用远程连接入口。绑定、状态和动作由微信 Host 服务提供，线程和 turn 由现有 Codex App Server 持有。[微信设置与切换条件](dsh-plugin-and-settings-map.md#dsh-插件统一规范)
- **错误边界隔离**：每个通过槽位挂载的独立面板与设置卡片必须包裹 `PluginErrorBoundary`。单个插件渲染异常时，向用户呈现可读降级卡片（「该扩展界面加载异常，已隔离不影响核心对话 · 重新加载 / 前往软件中心」），绝不白屏拖垮主工作台。

### 2.3 Tier 3 MCP App 视觉与授权回环规范

- 宿主向沙箱 MCP App 自动注入当前活动主题模式、设计 tokens 与语言偏好，切换主题或字号时实时同步。
- 当 MCP App 返回标准「缺少资料库或连接授权」响应时，工作台提供一键跳转到「设置 → 资料与连接」并聚焦对应 `packageId` 的连续路径，完成授权后可返回继续原工作面。

### 2.4 插件 UI 合规检查清单

所有插件在接入或发布 CI 前应满足以下客观门禁：
1. **无私建导航**：未在设置左侧新增独立顶层分类；
2. **中英文与主题一致**：双语文本完整，不使用写死颜色导致暗色模式下对比度失效；
3. **搜索与深链可达**：声明式 `settings_form` 与 Tier 2 设置卡片可被全局设置搜索命中，并支持从软件中心「配置」一键直达；
4. **状态不仅靠颜色区分**（WCAG 1.4.1）：选中页签、告警与成功反馈始终配合文字、图标或形状边界（如下划线）；
5. **故障与忙态诚实反馈**：错误、拒绝与未完成均如实提示，禁止 `error` 渲染成成功态；单插件崩溃受限于 `PluginErrorBoundary`。

---

## 3. 软件中心与通用插件生命周期模型

1. **统一目录与任务投影**。App 消费 Framework 动态软件源投影和 Studio 原生插件清单，以同一软件中心视图呈现。Framework 从独立官方目录 `opl-catalog` 和配置的软件源发现条目。Studio 从 DSH profile 提供内置插件。Framework、DSH 和 Codex 各自提供可信的安装状态与动作（Homebrew 仅用于 macOS Standard 桌面应用与独立 CLI 分发，已不再纳入软件中心原生目录管理）。[插件组合与仓库边界](plugin-composition-map.md)
2. **通用与开放社区 DSH 插件生命周期服务**：以 `opl-host-core` / 通用 DSH 插件管理器结合 DSH 原生 `dsh-plugin-manager` 与公开/配置源清单，支持官方内置与开放 npm 社区 DSH 插件（`opl-external-dsh-plugins.json`，严格包名校验、全程 `--ignore-scripts` 禁用安装脚本、启动期自动对账 `reconcileUserExternalPluginsOnBoot`）的兼容检查、安装、启用/停用、版本更新与卸载；对运行中的插件支持「暂存目标版本/卸载标记 + 一次重启完成切换」，避免用户先停用重启再操作重启的两段式割裂。
3. **可选能力与核心底座清晰分层**：`opl-team-bots`、`opl-superagent`、`opl-runtime-status`、`opl-materials-space` 等可独立开关的一级产品插件声明中文名称与用途说明，进入统一目录供按需启停；`opl-host-core`、`opl-codex-native` 等核心必需底座仅作为「运行环境 · 自动维护」透明呈现，不混淆日常软件选择。
4. **按用途分类并展示权限**。软件中心按目录声明的 `software_type` 分类，DSH 原生插件提供同样的产品语义。软件详情展示载体。公共目录可显示需授权的软件，安装、下载与更新依据实际发布源的权限。各动作按确认规则明示包名、来源、目标版本、权限范围及生效方式。[软件中心](software-management.md)

---

## 4. 五阶段演进路线与实证状态

| 阶段 | 核心交付 | 状态（SSOT 实时同步） |
| --- | --- | --- |
| **M0 · SSOT 文档体系** | 确立理想态四统一宪法、三级插件 UI/设置规范与分阶段路线文档 | 已并入三仓 `main`（`one-person-lab`、`opl-studio`、`one-person-lab-app`）并与三仓契约/验证对齐 |
| **M1 · 自动更新闭环与熔断** | 启动异常自动隔离回退（`opl_dsh_profile_recovery.v1`）、更新页单列表统一「一键更新全部」（含 OPL Base、桌面、DSH 官方与外部扩展及批量软件包队列）、主界面顶栏轻量「更新就绪 · 重启生效」与「界面更新就绪 · 刷新生效」入口、后台定时自动检查与同步（`syncAllDshPluginUpdates`） | 已并入 `main` 并完成 GitHub Packages 与 `dsh-plugins-latest` 公开 feed 线上发布（`Publish DSH Host Plugins` Run `45359521454` `success`）；clean-VM 端到端实测随标准产品发布流执行 |
| **M2 · 三级 UI/设置统一** | `settings_form` Schema + Framework/Studio 真 CLI 端到端试点（`contribution-cli.mjs` 实进程读写/校验/持久化/搜索索引）、公开发布的 `@gaofeng21cn/opl-plugin-ui-kit@0.1.0` SDK、受控设置子槽位（`settings.group.<dest>`）、`PluginErrorBoundary`、Billion Context 与一等插件迁移、MCP App 字体缩放/主题变量与授权闭环 | 已并入三仓 `main`，通过三仓契约校验、Framework CLI Broker 端到端单测与 Studio React/happy-dom 自动化测试，`@gaofeng21cn/opl-plugin-ui-kit@0.1.0` 已上线 GitHub Packages |
| **M3 · 通用插件生命与软件中心统一** | 通用 DSH 插件生命周期目录服务（`dsh-plugin-catalog`）、开放社区 npm DSH 插件安装/更新/卸载/启动对账与 `externalPluginAdapters` 去特例化、安装/切换历史活动流（`opl-dsh-plugin-activity.v1`）、运行期单次重启切换暂存、零术语「第三方软件与插件」筛选与操作前权限确认弹窗 | 已并入 `main` 并通过宿主机单测与软件中心集成回归 |
| **M4 · 前端真插件化** | 清零插件客户端相对 `vendor/` 与根 `package.json` 路径直连、拆出 `SettingsSurface`/`SoftwareCenterSurface`、支持 `reloadRenderer` / 诚实 `reloadMode` 分流（纯前端 `@gaofeng21cn/opl-studio-client` 与 `@gaofeng21cn/opl-runtime-status` 在 profile 覆盖就绪且 `clientModules.rebuilt()` 成功刷新时走 `renderer_reload`「刷新界面立即生效」并联动顶栏轻刷新胶囊；首次覆盖或宿主/运行期插件仍诚实走 `restart_required`） | 已并入 `main` 并通过 AST 边界测试、打包外部启动测试、类型检查与 `reloadMode` 单测 |
| **M5 · 生态门禁与目录演化** | 三级 Plugin DevKit 参考模板（`templates/plugin-devkit/`，含可直接运行的 Tier 1 `contribution-cli.mjs` 与直接消费公开 `@gaofeng21cn/opl-plugin-ui-kit` 的 Tier 2 模板）、自动化插件合规门禁（`plugin-conformance-gate.test.tsx`）与公开 SDK 打包断言、全部 12 个 DSH 插件与 UI Kit SDK 线上发布 | 三仓代码、模板、门禁测试、12 个插件（`dsh-plugins-latest`）及 `@gaofeng21cn/opl-plugin-ui-kit@0.1.0` 均已合入 `main` 并完成线上 CI 发布回读（Run `45359521454`） |
