# Codex 自动模型策略

Owner: `one-person-lab-app`
Purpose: `codex_auto_model_product_policy`
State: `active`
Machine boundary: 本文解释 App-owned Codex Auto 产品策略。Auto 算法、UI、持久化与
fallback 的机器真相在 `contracts/app-product-profile.json#codex.auto_model_policy`；已安装
OPL Flow 的推荐值只从 Framework
`app_state.agent_packages.status_index.packages.opl-flow.model_projection` 消费。App、Shell、
安装器和候选 GUI 都不得直接读取 Flow policy 文件或复制选择逻辑。Codex CLI 模型目录是
运行时输入，不是 App 或 Flow 的可用性证明。

## 结论

One Person Lab App 默认保存的是 `Auto` 模式，不是某次解析得到的具体模型。每次需要
解析 Auto 时，消费者 fresh 读取 Framework App state 与 Codex CLI `model/list`，用
`cursor` 继续翻页，直到响应 `nextCursor=null` 后才把 `data` 视为完整目录：

1. 用户明确固定的模型和推理档优先，升级不覆盖用户选择。
2. 普通模型菜单使用 App-admitted 模型。自定义和第三方 live-catalog 模型只在用户从
   “账户与模型 → 模型”页的高级折叠区明确开启后进入固定模型选择；App 不添加供应商过滤，
   也不改写本机 `model_catalog_json`、凭据和测试配置。
3. Auto 不受高级开关影响，继续按 App policy 解析当前默认模型与推理档；当前默认是
   `gpt-6-astra + max`。高级用户必须显式固定一个自定义模型，才离开 Auto。
4. 完整目录明确不含 App 默认时，仅在 App 已知模型中兼容回退；没有可用的已知模型时
   Auto 显示不可用，不自动转到自定义或第三方模型。高级开关不改变这个边界。
5. 自定义模型固定选择必须显示可能改变 OPL 标准智能体行为的提示。关闭高级开关后，
   已保存的自定义选择保留为不可用并阻止发送，直到用户恢复 Auto、选择 admitted 模型
   或重新开启高级选项。
6. ACP 只有模型名称而没有能力元数据时，使用 App 默认；缺元数据不代表 CLI 太旧。
   不再硬编码 GPT-5.6 的旧兼容值。
7. 固定选择从目录消失时，保留为不可用选择，直到用户恢复 Auto 或另选模型。
   自动模式只保存 Auto，不保存旧解析快照。

当前 Studio 通过 App-admitted resolver 使用外部或 Framework-managed Codex CLI；精确
版本来自当前 qualification inputs 与实际运行回读，不在此维护第二版本表。App 将目录中可用的
`gpt-6-astra` 解析为 Auto 默认并使用 `max`；有访问权限时，`gpt-6-sol` 随实时目录进入固定模型菜单。
目录不可用时按 App fallback 处理。Studio 不依赖 AionCore；历史 AionUI 组合只用于
保留的升级基线。安装包仍须经过
完整 App 构建、安装和运行时版本回读，不能单独替换已安装 App 内的运行文件。

## 已知列表的角色

Desktop 首页及管理目录刷新通过既有 canonical Codex app-server adapter 读取完整
`model/list`，不以 AionCore 持久化的历史握手记录判断当前可用模型。这个只读操作不创建
会话，不改写后台 registry；CLI 读取失败时按 App 的目录不可用策略回退，不重新采用旧握手。
用户固定的模型与推理档独立保存，目录刷新和 App 升级不覆盖它们。

App 内置身份取自选定官方 Codex CLI 的 `debug models --bundled`，在临时、空的
`CODEX_HOME` 与工作目录中执行，只纳入 `visibility=list`。本机普通 `debug models`、
`model/list` 以及 `model_catalog_json` 可能包含自定义模型，均不能作为内置身份来源。
`opl-codex-models` 也隔离 `CODEX_HOME` 来区分官方目录与合并目录；App 的内置列表
固定使用 `--bundled`，不消费该工具生成的本机合并文件。

`frontier_model_preference_order` 和 `visible_models` 是这份内置目录的 App 投影；
App 配置的默认模型排在首位，其余沿用内置目录顺序。模型名称可保留 App 友好标签，
新模型标签从 CLI 的 `display_name` 生成。运行时再与当前账户的完整可见目录交集，
确定实际可选项；出现在内置目录中不代表当前账户已有访问权限。
不在内置投影中的 live-catalog 固定模型属于高级能力，只有在“模型”页的
高级折叠区开启“启用自定义模型”后才进入选择器。这个开关位于默认模型与 Codex CLI
状态之间，不增加模型菜单的根行，也不改变 Auto。
直接读取 `model/list` 的 adapter 必须收集全部分页；ACP 缺少能力元数据时使用上述
App 默认，不把仅有名称的目录或失败请求当成旧 CLI 的证据。

## 开发时刷新内置列表

开发模型相关能力、升级 Codex CLI 或验收相关 PR 时，先确认使用的官方 CLI，运行：

```bash
npm run codex:model-policy:check -- --bundled
# 内置列表变化时同步；如需指定运行时，追加 --codex /absolute/path/to/codex
npm run codex:model-policy:sync -- --bundled
npm run codex:model-policy:check -- --bundled
```

同步会增补新官方可见模型，移除已撤下或隐藏的模型，并维护显示与回退顺序。
它保留 `configured_default`、推理档和高级开关；若当前默认模型已不在内置可见目录中，
同步停止并要求明确评估默认策略。读取失败或目录无效时保留原合同，不用本机目录补齐。
内置成员不再在校验代码中维护第二份硬编码列表。普通不带 `--bundled` 的合同检查保持
离线、确定性，不要求 CI 主机安装 Codex。CLI 目录更新本身不代表改变 Auto 推荐模型。

## Owner 边界

| Surface | 职责 | 不得拥有 |
| --- | --- | --- |
| OPL Flow | 定义推荐模型与推理档。 | live catalog 可用性、App UI、Auto 持久化与 fallback。 |
| OPL Framework | 从已安装 Flow policy 产生严格 `model_projection` 并放入 App state。 | App Auto 算法、用户固定选择。 |
| App product profile | 定义 Auto 算法、已知覆盖、fallback、持久化语义和自定义模型高级开关。 | Flow policy 文件、CLI 实时目录、provider readiness、用户凭证。 |
| Codex CLI | 通过 `model/list` 提供 `isDefault` 和 `supportedReasoningEfforts`。 | App fallback、用户选择持久化、GUI 文案。 |
| Studio / 其它 admitted Shell | 读取 product profile 和 CLI 目录，解析并展示 Auto，保存 mode、fixed override 和高级开关。 | 私有 allowlist、私有模型排序、私有 fallback。 |
| OPL Framework 安装器 | 从 Flow 策略生成首次安装默认配置。 | 另一份默认模型/推理策略。 |

App 新会话和恢复 Auto 使用同一 App 默认；完整目录确认不支持时才兼容回退。Framework 安装器仍按 Flow 策略生成 CLI 初始配置。Shell 当前解析出的具体模型只是运行时结果，不得回写成新的 App product truth。

## 维护默认模型

人工调整 Flow 缺席时的 App fallback 模型或推理档时，只修改：

```text
contracts/app-product-profile.json#codex.auto_model_policy.configured_default
```

这个值是 App 默认，不修改 Flow 自身的推荐策略。不要同时修改 `codex.default_*`、
`default_session_profile`、GUI contract、page-state matrix、Shell generated profile 或
Framework install profile；这些都是 App fallback 的生成投影。Flow 推荐应在 OPL Flow
policy 修改并由 Framework installed projection 传入。App fallback 的标准维护顺序是：

```bash
# one-person-lab-app
npm run codex:model-policy:sync
npm run codex:model-policy:check
node --experimental-strip-types scripts/app-product-profile.ts
npm run test:release-boundary

# one-person-lab
npm run codex:export-default-profile -- \
  --workflow-policy /absolute/path/to/opl-flow/contracts/workflow-policy.json
npm run test:fresh-install

# opl-studio
npm run validate:candidate
```

`scripts/app-product-profile.ts` 处理当前 adapter 对应的 App profile projection；Studio 在
build/validation 时直接读取指定 App checkout 的 profile，不维护独立产品副本。
历史 AionUI 的 generated profile 不再是当前维护入口。Framework 的安装默认值来自 Flow 策略，只提交生成器产出的
`contracts/opl-framework/codex-default-profile.json`；App 默认优先于 Flow 推荐；Flow 自身的工作负载策略保持其 owner 管理。

若新推理档只是 Codex CLI 未来新增的非空字符串，消费者不得扩展本地 enum/allowlist；
运行时 Auto 会直接使用 CLI 广告的最后一个支持档位。只有要改变已知模型的产品默认、
fallback 或显示标签时，才修改 App authority 并重新生成投影。

## 验证边界

App contract 和 focused tests 能证明策略结构及消费者引用没有漂移；Shell 行为测试应
覆盖 Astra 默认、旧 Flow 推荐、本机自定义模型保留、目录不可用和 fixed/Auto 重启场景。真实 GPT-6 是否已
进入当前 CLI 目录，必须由届时 fresh `model/list` readback 证明，不能由本文或静态测试
提前宣称。
