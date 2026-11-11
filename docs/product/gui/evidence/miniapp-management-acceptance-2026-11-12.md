# MiniApp 管理与界面验收 · 2026-11-12

本记录保存本次 fresh readback，不作为宿主维护的固定 MiniApp 注册表。产品规则与计数口径以
[MiniApp 管理与工作台](../miniapp-management.md) 和
[`contracts/app-gui-product-contract.json`](../../../contracts/app-gui-product-contract.json) 为准。

## 当前数量

本次按 `server + resourceUri` 读取已启用的 stdio MCP server，得到 3 个 OPL 自有 MiniApp
surface：

| MiniApp | `resourceUri` | 当前安装 carrier | 状态 |
| --- | --- | --- | --- |
| OPL Apps 共享工作台 | `ui://opl/apps.html` | OPL Framework stdio `0.3.12` | enabled，可调用 |
| Relay 邮箱工作台 | `ui://opl-relay/mail-workbench.html` | Relay `0.7.0` | enabled，可调用 |
| Med Auto Cast 媒体审看 | `ui://med-autocast/media-review.html` | Med Auto Cast `0.3.2` | enabled，可调用 |

OPL Apps 共享工作台当前目录返回 38 个内部 view，来自 15 个 Package 身份：3 个 Framework
runtime view，加上 14 个 Package 提供的 35 个 view。它们共享同一个 `ui://opl/apps.html`
surface，不是 38 个 MiniApp。

Jira、Netlify 属于第三方 Codex connector 的能力面，不属于 OPL 自有 MiniApp，也不纳入
OPL Apps family 视觉改造或 OPL MiniApp 数量。它们是否显示由对应 connector 的授权与当前
连接范围决定。

## 源码与安装版边界

本次源码已经准备好以下版本：Relay `0.7.3`、Med Auto Cast `0.3.3`、Framework `0.3.14`。
fresh `codex mcp list` 与 stdio 握手仍读到 Relay `0.7.0`、Med Auto Cast `0.3.2` 和 OPL Apps
runtime `0.3.12`。因此新 family 视觉与最新 descriptor 已完成源码交付，但尚未由本机安装版
消费。安装新版后，下一次 fresh catalog/session 会从 owner 的新 descriptor 重新读取；已打开
的 iframe/AppBridge session 保持旧 binding，关闭并重新打开后才使用新版本。

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

