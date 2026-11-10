# DSH 升级与 OPL UI 复用审计

Owner: `one-person-lab-app`
State: `source implementation and isolated UI acceptance complete; installed App acceptance tracked separately`
DSH source: `master@fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`
Package cohort: `0.2.2-rc.1`

## 结论

OPL Studio 源码 cohort 已绑定 DSH `master@fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`。上游版本字符串仍是 `0.2.2-rc.1`；该 master commit 与同名 release tag 的目标 commit 不同。本次升级包含官方 UI slot、菜单、侧栏滚动交接、设置与会话交互。

DSH 官方确实提供定时任务能力：

- Host：`@deepseek-ai/dsh-schedule`；模型工具：`@deepseek-ai/dsh-tool-schedule`；客户端页面：`@deepseek-ai/dsh-client-ui-schedule`。
- 后台进程观察另有 `@deepseek-ai/dsh-jobs`、`@deepseek-ai/dsh-tool-jobs` 和 `@deepseek-ai/dsh-client-ui-jobs`。它们负责 DSH 自己的 Session/Agent 中的 job，不等同于持久化的 OPL 任务。
- 官方 Web profile 的 `cordis.patch.yml` 会加载 schedule 服务和 `ui-schedule`，standard/ptc preset 会加载 `tool-schedule`。这证明“定时任务”是官方能力，不是 OPL 私有发明。

OPL 私有的 `opl-workbench-services` 不能整体删除。Framework/Temporal 已持有计划、执行历史和 mutation owner；Studio 的 Framework bridge 已注入 Codex executor，能创建/读取/中断 canonical thread/turn，并应用受限权限、超时及启动延迟规则。DSH schedule 则依赖 DSH Agent/Session，receipt 只确认消息进入持久 inbox，不表示模型执行完成。当前 OPL `/scheduled` 已使用官方 `TaskManagerPage`/`TaskDetail`，通过 owner adapter 接入 OPL 数据和确认动作；官方 Session 目录、Session delivery history 与 OPL Codex 执行历史不能混作同一业务记录。

## 构建工具为何分叉

Bun 是 OPL 早期选择的 JavaScript 运行时、测试与打包工具，不是 DSH 官方标准。此次冲突来自本地 Bun CSS parser 对官方 `@container scroll-state`、`@position-try` 的支持，以及官方时间库所用 `rrule` 入口解析；不是 DSH UI 必须为 OPL 改写。renderer 已改用 DSH `apps/web` 的 Vite 6.4.3 / React 插件 4.7.0，旧 Bun renderer entry 已删除，官方 CSS 与 recurrence 源码保持不变。`node:module` 浏览器 stub 沿用官方模式；`mainFields: ["main", "module"]` 是当前依赖入口解析的本地适配。测试与 OPL 自有 Host 插件仍可使用 Bun，是否保留以实际职责与兼容性判断，不让它影响官方 UI。

## 私有实现与官方能力的对应关系

| OPL 现有能力 | DSH 官方对应物 | 当前决定 | 原因 |
| --- | --- | --- | --- |
| `opl-workbench-services` 计划任务页 | `dsh-schedule` + `dsh-tool-schedule` + `ui-schedule` | 已接入官方 TaskManager/TaskDetail UI；由 OPL owner adapter 投影数据和回传已确认动作 | DSH schedule 的原生 Host/Session executor 不接管 OPL Temporal/Codex owner |
| `opl-workbench-services` 运行历史 | OPL Framework/Temporal history + `ui-jobs` | 官方计划页呈现 OPL task/result projection；保留 Codex turn status、summary、权限和超时字段 | DSH delivery history 是 inbox delivery receipt，与 OPL 执行完成语义不同 |
| `@objectivex666/dsh-settings-search` 适配 | 当前没有发现 DSH 官方等价全局搜索 | 保留当前社区实现；另行评估官方可组合搜索 API 出现后的迁移 | `ui-shortcuts` 只搜索快捷键，不能替代设置全局搜索；社区包是独立 GPL-3.0 依赖 |
| OPL Auto Review | DSH `experimental/auto-review` | 保留 Codex App Server 的 `approvalsReviewer` owner；只借用可迁移的控件表达 | DSH Auto Review 审查 DSH Agent 工具调用，和 Codex reviewer 并非同一 executor |
| OPL time context | DSH `dsh-time-context` | 可复用设置和说明；注入继续走 Codex/Framework owner | 注入范围、隐私和默认关闭策略是 OPL 产品合同 |
| OPL 快捷键页面 | 官方 `ui-shortcuts` | 当前仍是 OPL 页面；逐项映射命令与 App-local 偏好后可迁移到官方编辑器 | 官方页面未加载，DSH 按键目录不能自动替代 OPL commands/callbacks |
| OPL 插件/能力目录 | 官方 `ui-plugin-manager` 页面源码、CSS 与 primitives；Framework Package projection/actions | Framework 继续拥有 Package lifecycle；DSH 官方页面拥有目录的卡片、详情、状态点、切换导航、筛选/页签和确认表现 | 已接入固定 cohort 的 `PluginManagerPage`；只构造其 renderer-facing props 与 owner adapter，不加载官方 `apply()`/Controller、profile 或 pnpm lifecycle。DSH host inventory 仍是另一种数据，Package currentness 不是 DSH plugin inventory |
| OPL 语音输入 | DSH experimental voice/SenseVoice packages | OPL 当前保留浏览器 `SpeechRecognition`；待 provider、权限、readiness owner 可回读后迁移 | 官方 voice bundle 未加载，也不能把 DSH 本地 provider 状态冒充 OPL carrier readiness |

## UI 分叉审计

| 表面 | 之前的 OPL 差异 | 是否必须差异 | 处理 |
| --- | --- | --- | --- |
| 左侧栏背景、字体、圆角、选中态、按钮密度 | 旧实现自绘导航并覆盖 DSH 外观；当前 Studio 源码已改用官方 `AppFrame`/`SidebarRoot` 与 DSH semantic theme tokens | 否 | 当前浏览器验收截图显示 DSH 侧栏几何、颜色和选中态。OPL 保留业务行和 owner adapter；具体配色由 DSH 主题定义 |
| `More` 折叠菜单 | 旧实现没有官方 More slot；当前源码已注册 `sidebar.panellist.actions` 并启用官方 `SidebarRoot` 更多菜单 | 否 | 菜单外壳/定位来自 DSH，OPL 提供 Framework 管理行与 pin action。浏览器验收通过菜单打开、取消固定和重新固定 |
| 侧栏导航滚动与工作区列表 | OPL 把列表单独滚动，和 DSH viewport 行为不同 | 否 | 接入新版 `sidebar.workspaces` hook 和 scroll handoff，沿用官方折叠、窄屏 drawer 与 hover/focus 状态 |
| 应用管理、运行状态、计划任务、能力工作台 | DSH 已有通用插件、任务等页面；OPL 的 owner/schema/action 不同 | 产品名、页面 IA 和领域 projection 必须遵从 OPL 合同；可对应的布局、控件、卡片、详情导航和状态表达直接复用 DSH | 应用管理的应用目录已接入官方 `PluginManagerPage` 表现；OPL adapter 保持 Framework Package actions/readback。计划任务 UI 复用官方 TaskManager/TaskDetail 并保持 Temporal/Codex owner |
| One Person Lab 品牌文本 | DSH 默认 DeepSeek 品牌 | 是 | 通过官方 brand slots 替换为文本，不复制品牌图形或另建 logo 系统 |
| Codex 线程、审批、权限、Framework 状态 | DSH 有自己的 Session/Agent/credential authority | 是 | 保留 `opl-codex-native`、Framework bridge 和 App contracts；只使用 DSH UI/slot，不加载 `dsh-base` authority |
| 计划任务执行器 | DSH schedule 依赖 DSH Agent/Session | 是 | 只复用 UI 和交互；保留 Framework/Temporal executor，直到有等价 adapter |
| 设置 IA、路由、产品页名称 | OPL App contract 定义了当前产品目录和 owner | 产品分组和语义遵从 App contract；视觉、布局和通用搜索控件可以复用 DSH | 当前 `SettingsRoot`/theme/slots 已复用；设置全局搜索由社区包提供，非 DSH 官方能力 |

应用管理合同仍使用“应用管理”产品名称及 applications、updates、resources、sources 四分区。其 applications 目录直接复用上游 `PluginManagerPage.tsx` 的卡片、官方 artwork/StateDot、detail navigation、组件列表和原生 action/confirmation UI。Framework projection 是唯一 Package snapshot，owner-projected actions 是唯一生命周期入口；DSH Plugin Manager 的 `apply()`、Controller、profile 和 pnpm 管理均不加载。该源码采用固定 ref `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`。源码与 contracts 的接入状态不代表普通安装 App 已更新；本地安装和窗口交互另行验收。

附件截图反映了旧 OPL 自绘 rail 的分叉：旧侧栏导航组件、局部颜色/间距规则与缺失的 More slot 已在本次源码改动中移除或替换。当前浏览器验收已确认 DSH sidebar/theme/More、窄屏 drawer、浅色/深色主题和官方任务页；原生 Electron 验收也已通过：隔离实例的 CDP 检查与 Quartz 实际窗口截图确认了 macOS 侧栏材质、More 和 system/light/dark 主题；未安装或触碰 Stable。必须保留的是 One Person Lab 品牌、App 当前产品导航/信息架构，以及 Codex/Framework 的数据和动作 authority；布局、控件与颜色应继续复用 DSH。

## 验证边界

截至当前审计：DSH vendor provenance（701 files / 22 roots）、Studio typecheck、Vite 6.4.3 WebUI/Desktop build、rendered UI acceptance（1440x900、400x800、浅色/深色与窄屏 drawer）、desktop contract（6/6）、UI contribution tests（80/80，含 schedule adapter 20 项）、App active-shell 全部门禁（失败修复后按受影响组续跑）、App schedule/dual-GUI contracts（19/19）、GUI candidate/design-system 验证已通过。浏览器验收确认主面板、侧栏图标、More、固定/取消固定、设置、Codex 会话交互、官方任务页创建/编辑/暂停恢复/执行历史/冲突保护与窄屏无横向溢出。计划任务真实链路使用任务专用 Temporal、真实 Framework owner 和 fake Codex App Server；原生 Electron 的 CDP 与真实窗口截图验收已通过（system/light/dark、More、macOS 材质），不构成安装或发布证据。当前仍是源码 candidate，不是发布或安装验收。

本地证据位于 Studio 的 `out/acceptance/rendered-ui-acceptance.json`、`out/acceptance/dsh-schedule-ui.json` 和 `out/acceptance/native-electron-ui/acceptance.json`。实际窗口截图位于同目录的 `native-electron-ui/*-window.png`；这些产物使用隔离状态，不代表已安装版本。
