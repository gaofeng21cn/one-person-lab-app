# OPL App 插件组合与仓库边界

Owner: `one-person-lab-app`
State: `active`
Contract: [`app-plugin-composition-taxonomy.json`](../../../contracts/app-plugin-composition-taxonomy.json)

软件中心按产品用途组织智能体、应用、效率扩展和连接通道。底座和依赖在「运行组件」维护。插件的来源、载体与安装方式在详情中展示，DSH、Framework 及其他原生管理器各自提供生命周期状态和动作。

## 软件源与 App 组合

官方软件源 `opl-catalog` 持有可独立刷新的目录、公开展示元数据和发布索引。条目按 `agents`、`applications`、`extensions`、`channels`、`dependencies` 存放。Framework 实现软件源协议、动态发现、状态投影和 Package 生命周期，产品实现和制品由各软件 owner 持有。需授权的软件可在公共目录展示，制品获取、安装与更新由发布源验权。[OPL 软件目录](https://github.com/gaofeng21cn/opl-catalog)

`opl-studio` 承载 App 的 DSH Application Host。下一采用批次将标准 DSH npm/Cordis 插件归为 `plugins/core/`、`plugins/extensions/`、`plugins/channels/`，由 `cordis.yml` 和 `web.patch.yml` 按包名组合。微信远程在该批次迁为 Studio 内置连接通道。采用前的版本继续由 App 的微信包和 Framework 通道路由提供服务。实际采用批次以 App Shell 合同为准。[App Shell 合同](../../../contracts/app-shell-adapter.json)

用组合盘点命令读取指定 Studio checkout 和 App 固定的官方软件源快照。

```bash
node scripts/plugin-composition-inventory.mjs --studio-root ../opl-studio
```

命令支持新版分组和旧版平铺目录。离线盘点可传入同一固定快照的 `--catalog-index PATH`，按字节校验。输出记录声明的组合，安装、启用和调用状态以运行时回读为准。

## 源码所有权与依赖方向

Studio 按 DSH/npm 包维护客户端与 Host 实现。源码职责和依赖方向由合同的
`source_ownership_policy` 定义。

| 位置 | 源码职责 | 公开边界 |
| --- | --- | --- |
| `desktop/`、`src/main.tsx`、`src/bridge/webTransport.ts`、`src/host/` | Electron、preload、AppWebEntry、传输适配与 DSH profile 组合 | Cordis 服务、插件和共享包的公开入口 |
| `plugins/{core,extensions,channels}/<plugin-id>/` | 新布局下的 DSH Host/Client 实现。`opl-studio-client` 持有 Workbench、客户端组合、slots 与 `oplStudioShell` 共享快照服务。`opl-runtime-status` 持有运行状态工作面，`opl-materials-space` 持有交付物浏览工作面 | npm `exports`、Cordis 服务和 `dsh.client` |
| `packages/host-contracts/` | Bridge 类型、事件、MCP Apps 协议与跨包错误 ABI | 类型及协议子路径 |
| `packages/host-kit/` | 原生 profile 更新、Host 协议、传输辅助、`workspace-fs` 受限工作区访问与 channel binding | 被插件和载体实际复用的公开入口 |
| `packages/dsh-adapters/` | DSH 视觉源码清单、`ui-kit`（含 `oplStudioShell` 消费 hook）及通用的 `workspace-preview`（`WorkspaceFilePreview`） | `./visual-source`、`./ui-kit`、`./workspace-preview` |
| `vendor/` | 固定版本的 DSH、Superagent 与 DSH Remote 上游源码 | 由对应适配包或插件消费 |

载体消费插件公开入口或 Cordis 服务，插件消费共享包、官方 DSH 和对应的 vendored 源码。
Host Core 通过 Cordis 获取 Codex、Framework 和 MCP Apps 服务。更新 CLI 和 Host 服务
共享 `host-kit` 的原生 profile 更新逻辑，构建与打包命令由 `scripts/` 持有。

插件运行时产物由各包的 `files` 字段从生成的 `lib/` 选取。Studio 的
`npm run test:dsh-plugins` 检查源码依赖方向，并在仓库外启动实际打包的插件。
兼容的插件可独立更新，共享输入变化时重新构建受影响的包。

## 用户入口规则

| 用户任务 | 统一入口 | 实现来源可以是什么 |
| --- | --- | --- |
| 安装、更新、启停、卸载 | 软件中心 | Studio 原生插件、独立软件源 Package、原生应用 |
| 连接、权限、持久配置、服务就绪 | 设置 | DSH Client、Framework projection |
| 智能体、项目运行总览与阶段进度 | 运行状态（`opl-runtime-status`） | Framework `work_item_projection_v2`、Tier 2 DSH 插件、`opl-mcp-apps` 详情抽屉 |
| 已注册智能体项目交付材料预览 | 资料空间（`opl-materials-space`） | `@gaofeng21cn/opl-materials-space` Host 服务与 Client、Framework 项目目录索引、`workspace-preview` |
| 收件箱、审阅、制作、发布、设备操作 | 应用工作台或专用 MCP App | Framework Package contribution、MCP App、Studio client |
| 当前任务的阶段、产物、证据 | 任务详情 | Framework runtime view、Package contribution、MCP App |
| 底层 provider、carrier、诊断 | 运行与维护 | Framework projection、Studio host adapter |

Package、插件和 repo 不创建新的顶层设置树。功能界面按用户任务进入既有 Settings、Workspace、Task Detail 和 MCP App host；插件界面集成规范与共享 UI Kit 演进见 [插件 UI、设置接入与全插件理想态标准](plugin-ui-and-settings-standard.md)。

## 仓库决策

保留在 `opl-studio` 的 Host/Client 插件继续复用 DSH profile 和跨插件兼容测试；源码同仓与 App 内置基线不要求每次一起发布或重建。兼容包通过 GitHub Packages 上的公开 `@gaofeng21cn` 插件渠道独立发布，原生 profile 查询 `^x.y.0` 兼容版本并安装准确解析版本。DSH Host 扫描当前已启用 Loader entries 的 `dsh.client` 声明，自动生成客户端模块图；`opl-studio-client` 也属于这组可独立更新的客户端插件。Electron、DSH core/cohort 和极小的 AppWebEntry boot shell 仍走 carrier 更新。

运行时不新增 Bundle Profile 或第二份客户端注册表。原生 profile 选择启用关系；官方 graph 负责发现客户端入口和依赖，AppWebEntry 负责装载与挂载。composition receipt 仅记录发布测试通过的一组准确版本，不参与本机 UI 发现。完整设计见 [DSH 插件发布与增量更新模型](../../delivery/dsh-plugin-publication.md)；分层更新模型见 [分层更新](../managed-update-three-layer.md#dsh-plugin-updates-within-the-app-layer)。只有出现独立领域 owner、独立 carrier 或跨产品复用等实际边界时，才把能力提升为 App-owned 或 domain-owned Package。

App 内置功能由 Studio 原生插件交付。独立软件沿用各产品的发布仓库和原生载体。软件中心统一用户入口、状态投影、动作派发和回读。
