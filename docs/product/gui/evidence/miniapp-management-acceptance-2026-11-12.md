# MiniApp 管理与界面验收 · 2026-11-12

本记录保存本次 fresh readback，不作为宿主维护的固定 MiniApp 注册表。产品规则与计数口径以
[MiniApp 管理与工作台](../miniapp-management.md) 和
[`contracts/app-gui-product-contract.json`](../../../../contracts/app-gui-product-contract.json) 为准。

## 本机更新后的当前数量

本次按 `server + resourceUri` 读取已启用的 stdio MCP server，得到 3 个 OPL 自有 MiniApp
surface：

| MiniApp | `resourceUri` | 当前安装 carrier | 状态 |
| --- | --- | --- | --- |
| OPL Apps 共享工作台 | `ui://opl/apps.html` | OPL Framework stdio `0.3.14` | enabled，可调用 |
| Relay 邮箱工作台 | `ui://opl-relay/mail-workbench.html` | Relay `0.7.3` | enabled，可调用 |
| Med Auto Cast 媒体审看 | `ui://med-autocast/media-review.html` | Med Auto Cast `0.3.3` | enabled，可调用 |

OPL Apps 共享工作台当前目录返回 39 个内部 view，来自 15 个 Package 身份：3 个 Framework
runtime view，加上 14 个 Package 提供的 36 个 view。它们共享同一个 `ui://opl/apps.html`
surface，不是 39 个 MiniApp。

Jira、Netlify 属于第三方 Codex connector 的能力面，不属于 OPL 自有 MiniApp，也不纳入
OPL Apps family 视觉改造或 OPL MiniApp 数量。它们是否显示由对应 connector 的授权与当前
连接范围决定。

## 源码与安装版边界

本机 CLI 与 App managed Framework 均已读回 `0.3.14`；原生 Codex carrier 已更新至
Relay `0.7.3`、Med Auto Cast `0.3.3`。本次从 `codex mcp list` 返回的实际入口新建 stdio
连接，读取三个 `ui://` resource；Relay 和 Med Auto Cast 缓存中的 HTML 与各自 canonical
源码生成产物逐字节一致，OPL Apps 握手版本为 `0.3.14`，目录返回 15 个产品入口、39 个 view。

Relay 与 Med Auto Cast 的本轮视觉调整沿用现有 Package 版本，因此不能只凭版本号验收；
必须读回已安装 carrier 的内容与新 MCP resource。两个桥接 server 的 `serverInfo.version`
为 `0.1.1`，它是桥接实现版本，不是 Package 版本。

安装新版后，下一次 fresh catalog/session 会从 owner 的新 descriptor 重新读取；已打开的
iframe/AppBridge session 保持旧 binding，关闭并重新打开后才使用新版本。

## 管理、未启动与已启动

- `/apps` 是 Package 管理面：安装、更新、启用、停用、状态和诊断；进入管理页不会启动 MiniApp。
- 未启动 MiniApp 只有当前 thread live catalog 中的 descriptor：名称、说明、resource URI、只读
  launcher 和 readiness。用户选中它只查看介绍。
- 启动时宿主调用只读 launcher，读取资源并建立一个临时 iframe/AppBridge binding；同一 MiniApp
  在一个 workbench 中最多有一个 active session。
- 关闭、切换或 thread/connection 重置会释放 binding，但不会卸载 Package 或停止 owner 任务。
- 本次 CLI/catalog readback 没有提供用户安装版当前 iframe/AppBridge 活动会话数；因此记录为
  “session count 未读取”，不把 MCP server 进程数冒充已启动 UI 数。合同验收仍要求未启动为 0、
  启动后为 1、关闭后回到 0。

## Family 视觉验收

共享 OPL Apps、Relay 和 Med Auto Cast 的生成 HTML 均带有
`data-opl-family="opl-apps"`、OPL Apps 品牌区、领域名称、共享灰阶/蓝色 token、可见焦点环
和状态语义。Impeccable detector 对三个真实生成入口均返回 `[]`；Relay 源模板的静态字号提示
来自尚未注入 CSS 的构建占位符，生成产物检查已通过。

## 可重复验证

| 验证面 | 结果 |
| --- | --- |
| `npm run validate:active-shell` | 通过 |
| `npm run typecheck` | 通过 |
| `npm run validate:gui-design-system` | `consistent` |
| `npm run validate:app-root-boundary` | 通过 |
| `npm run test:mcp-apps`（`opl-studio`） | 15 Node + 5 Bun 用例通过 |
| OPL Apps / Relay / MAC 生成 HTML Impeccable detector | 均为 `[]` |


## 桌面安装回读

已通过 `manual:local-app` 完整构建并替换 `/Applications/One Person Lab.app`，随后自动重启。
本机显示版本为 `26.11.12`，机器版本为 `26.11.1291`，本地构建身份为
`local.src68cc788c0f3e`。安装回执返回 `status=completed`、`launched=true`；安装前后签名
验证通过。它是本地开发构建，未创建新的 Stable/Nightly 发布。

安装回执位于本机缓存的
`manual-latest-build/local-app/26.11.12-26.11.1291/manual-local-app-installation.json`，
同目录的 source lock 与 build receipt 绑定本次完整构建。App 内嵌 Framework manifest
绑定 `196229c6985638bd0ed4a29e617f1f967500ff70`。

安装后通过 `opl app state --profile fast --json` 再次读取实际目录：Relay `0.7.3` 与
Med Auto Cast `0.3.3` 均返回 `readiness.status=ready`、`operational_ready=true`、
`launch_allowed=true`。这些是 Framework 的安装与可用性回读，不等于已经打开 UI。

桌面工具在重启后返回“Mac 已锁定，无法自动解锁”，因此安装版的打开、切换、关闭实际点击
验收仍待本机解锁。此前浏览器与 stdio 验收已通过，但不替代本项图形界面验收；当前
安装版活动 UI session 数仍未读取。

## 本轮认知与视觉调整

共享 OPL Apps 改为“选择应用 → 查看该应用的功能”，只显示当前应用的功能列表；搜索仍可
跨应用查找，选择结果时同步切换应用。提供专用 UI 的产品在共享页明确标为“共享概览”，
不把共享内容误标为专用界面。

宿主使用“打开界面／关闭界面”和“界面未打开／界面已打开”，明确说明关闭或切换仅收起
界面、后台任务继续运行；安装、更新和启停去应用管理。

三个自有 MiniApp 使用中性灰画布、统一蓝色强调色和 OPL Apps 品牌区。窄屏保留品牌和
领域名，深色主题遵循宿主显式选择。浏览器实测覆盖产品过滤、跨产品搜索、390px 无横向溢出、
媒体审看空态、Relay 窄屏和深色主题。

本机完整构建额外修复了打包器捕获输出的 1 MB 默认上限：较大的实际应用目录可以完整读取；
启动失败保留底层错误码。相关 Full runtime 测试 20 项通过。

## 后续优先改进

下一轮按用户的理解成本排序，不以新增独立 App 数量为目标：

1. **从共享概览直达专用界面**。Relay 和媒体审看已有独立 UI，共享页应提供直接入口并携带
   当前对象，减少返回 MiniApp 列表再找一次的操作。入口仍消费 owner descriptor，不新增注册表。
2. **用任务说明替代产品知识**。应用名旁用一句话说明“能帮我做什么”，首屏提供准确的下一步；
   空态区分“还没有内容”“未连接”“加载失败”，让用户无需先理解 Package、MCP 或 view。
3. **保留最近使用的对象与返回路径**。重新打开时优先回到上次看的任务、邮件或单集；恢复对象
   由领域 owner 提供，只读恢复界面，不重放发送、发布或其他写操作。

## 更新链路修复

本次本机更新还暴露了内部 Package 迁移在 discovery 阶段显式注入通用 runner 的问题：
它重新调用包括远端市场的 `codex plugin list`，造成本地更新被远端列表超时阻断。Framework
现已让默认发现、安装后回读与移除后回读统一复用原生 `plugin/list` 的 local marketplace
路径，实际安装与移除仍由原生 carrier 执行。修复进入 Framework `984cc1aba`，8 项本地
发现／迁移回归测试、类型检查和构建通过。

本机另有一份历史 Git 安装被 Full runtime 覆盖了源码，但旧 Git HEAD 与安装身份仍保留，
导致后续更新返回 `framework_managed_git_installation_changed`。本次逐项核对 220 个差异：
217 项与已安装 Full seed 完全一致，2 个未打包 workflow 与冻结 canonical 源码一致，
剩余一项为 Framework 自己的 source receipt。随后将旧 Git 元数据与身份回执移入相邻的
`one-person-lab.legacy-git-20261112` 回退目录，让该 App-owned runtime 继续走正常的 owner 更新。

本机两处实际 Framework 安装（App 启动目录与 App managed 目录）已读回 source receipt
`984cc1aba0b4eb56144d6fce201098309d409b58`，修复文件与 canonical 源码完全一致；
CLI 的安装入口为 App 启动目录的符号链接。MinerU 通过相同 owner 更新入口使用已验证的
官方 Full seed 升至 `0.6.1`，回读为 `opl_managed/current`，旧二进制保留回退副本。
