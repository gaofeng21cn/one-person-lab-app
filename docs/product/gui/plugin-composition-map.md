# OPL App 插件组合与仓库边界

Owner: `one-person-lab-app`
State: `active`
Contract: [`app-plugin-composition-taxonomy.json`](../../../contracts/app-plugin-composition-taxonomy.json)

OPL App 是由 DSH Host、DSH Client、Framework Package、MCP App 和上游生态组件组合成的完整产品。用户看到的是一个产品入口体系；开发者看到的是多个可独立维护的模块。两套视角必须分开。

## 当前事实

`opl-studio` 主要承载 OPL App 的 DSH Application Host。`plugins/` 下是标准 DSH npm/Cordis 包，profile 通过 `cordis.yml` 和 `web.patch.yml` 装载。这里的包负责 Codex App Server、Framework bridge、MCP Apps host、HTTP/SSE、协作、Superagent 和客户端 slots。

`one-person-lab-app/packages/` 当前承载 App 自有能力包，微信通道是当前代表。它使用 Framework Package descriptor、Codex Plugin Manager carrier 和通用 channel host；它不是 DSH Cordis Host 插件。微信源码与 App 产品 truth 同仓，便于 App-owned capability 的交付和验收。

Framework 的 Package descriptor 由 `one-person-lab` 聚合。许多专业能力来自独立 owner repo，例如 Relay、Med Auto Cast、MAS、MAG、RCA、Persona 和 Photo Steward。它们可以有 Codex plugin carrier，也可以声明 App UI，但仍然是 Framework Package，不会因为使用同一安装载体而变成 DSH Host plugin。

动态组成读取入口：

```bash
node scripts/plugin-composition-inventory.mjs \
  --studio-root ../opl-studio \
  --framework-root ../one-person-lab
```

该命令只读取当前 Studio plugin manifests、Studio profile、App-owned Package descriptors 和 Framework Package descriptors；目录存在、carrier metadata 或历史 payload 不代表已安装、已启用或可调用。

## 源码所有权与依赖方向

运行时插件化已经成立，源码物理归属仍处于收敛阶段。`plugins/<plugin-id>/` 是 DSH/npm
交付边界，但当前 Studio 仍有插件入口引用根目录的 `src/host`、`src/bridge`、
`src/composition`，也有根目录 Workbench 进入插件内部源码的过渡调用。这些调用解释了
当前构建为何能产出独立包，却不构成长期源码 API。

目标区域和当前状态以合同的 `source_ownership_policy` 为准：

| 区域 | 长期职责 | 当前状态 |
| --- | --- | --- |
| `apps/` | Electron、preload、受限资源桥、AppWebEntry 启动壳和 profile 组合 | 仍分布在 `desktop/`、`src/main.tsx`、`src/host/dsh/`，尚未整体搬迁 |
| `plugins/` | 可独立发布的 DSH Host/Client 包及其源码与生成 `lib/` | 包边界已成立，部分源码仍依赖过渡性根目录模块 |
| `packages/` | 纯合同、Host 基础能力和 DSH 适配器 | 尚无完整的 `host-contracts`、`host-kit`、`dsh-adapters` 区域，不预先创建空壳包 |
| `vendor/` | 固定版本的 DSH/Superagent 上游源码 | 已有部分 `src/vendor` 与 `vendor`，后续按真实调用者收敛 |

依赖方向固定为 `apps -> plugins/packages`、`plugins -> packages/官方 DSH`、
`packages -> 基础库/官方 DSH`；插件不能依赖 `../../../src`、其他插件的 `src` 或运行时
脚本，根 Workbench 不能进入插件内部源码。跨边界必须通过 package `exports`、纯类型/ABI
合同或显式适配器。`lib/` 是构建生成物，不是手写源码，也不成为新的运行时发现机制。

这是迁移目标和开发约束，不代表目录已经搬迁完成。每次迁移先提取真实共享调用者，再切换
公开 exports，最后删除旧内部 caller；没有当前共享职责时，不创建通用 `host-kit`，也
不把多个插件重新聚合成一个大插件。

## 用户入口规则

| 用户任务 | 统一入口 | 实现来源可以是什么 |
| --- | --- | --- |
| 安装、更新、启停、卸载 | 软件中心 | Studio Host、App Package、领域 Package、原生应用 |
| 连接、权限、持久配置、服务就绪 | 设置 | DSH Client、Framework projection、App-owned Package |
| 收件箱、审阅、制作、发布、设备操作 | 应用工作台或专用 MCP App | Framework Package contribution、MCP App、Studio client |
| 当前任务的阶段、产物、证据 | 任务详情 | Framework runtime view、Package contribution、MCP App |
| 底层 provider、carrier、诊断 | 运行与维护 | Framework projection、Studio host adapter |

Package、插件和 repo 不创建新的顶层设置树。功能界面按用户任务进入既有 Settings、Workspace、Task Detail 和 MCP App host。

## 仓库决策

保留在 `opl-studio` 的 Host/Client 插件继续复用 DSH profile 和跨插件兼容测试；源码同仓与 App 内置基线不要求每次一起发布或重建。兼容包通过 GitHub Packages 上的公开 `@gaofeng21cn` 插件渠道独立发布，原生 profile 查询 `^x.y.0` 兼容版本并安装准确解析版本。DSH Host 扫描当前已启用 Loader entries 的 `dsh.client` 声明，自动生成客户端模块图；`opl-studio-client` 也属于这组可独立更新的客户端插件。Electron、DSH core/cohort 和极小的 AppWebEntry boot shell 仍走 carrier 更新。

运行时不新增 Bundle Profile 或第二份客户端注册表。原生 profile 选择启用关系；官方 graph 负责发现客户端入口和依赖，AppWebEntry 负责装载与挂载。composition receipt 仅记录发布测试通过的一组准确版本，不参与本机 UI 发现。完整设计见 [DSH 插件发布与增量更新模型](../../delivery/dsh-plugin-publication.md)；分层更新模型见 [分层更新](../managed-update-three-layer.md#dsh-plugin-updates-within-the-app-layer)。只有出现独立领域 owner、独立 carrier 或跨产品复用等实际边界时，才把能力提升为 App-owned 或 domain-owned Package。

不因为目录叫 `plugins`、能力通过 Codex Plugin Manager 安装，或能力提供了用户界面，就强行拆仓、合仓或改成另一种插件 ABI。统一的是用户入口、状态投影、动作桥和回读；开发者可以保留适合维护的仓库与模块边界。
