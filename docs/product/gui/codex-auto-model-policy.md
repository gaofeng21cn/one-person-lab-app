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

1. 用户明确固定的模型和推理档优先，且不受 Flow 推荐影响。
2. fresh App state 表明 Flow 已安装、且 `model_projection` 结构有效并推荐了目录中实际
   存在的模型时，优先使用该推荐。
3. 推荐模型不存在时，CLI 用 `isDefault` 标记的模型是 App 当前自动模型候选。
4. 已知模型可使用 App 明确覆盖；Flow 推荐推理档只有在该模型声明支持时才使用。
5. 未知新默认模型不得因为不在已知列表中被过滤；它使用 CLI
   `supportedReasoningEfforts` 对象数组最后一项的 `reasoningEffort`。
6. Flow projection 缺失、伪造或不可用，且 CLI 目录也不可解析时，才回退到 App
   `configured_default`。
7. 用户选择固定模型后持久化模型与推理档；在 Auto 下手动修改推理档时，固定当前
   已解析模型并退出 Auto。用户恢复 Auto 后不保留模型快照，下次重新读取完整目录。
8. 已固定模型从目录消失时保留为“不可用的固定选择”，直到用户恢复 Auto 或选择
   可用模型；不得静默改回另一个模型。

当前产品默认模型为 `gpt-6-astra`，推理强度为 `max`。后续若 Codex CLI 将新模型标记为
`isDefault`，且没有可用的 Flow 推荐，即使新模型位于后续分页、尚未进入 App 静态列表，
自动模式也必须识别它，并使用 CLI 为它声明的最高推理档。

当前 AionUI 主线通过 Shell 独立携带官方 npm Codex CLI `0.153.4`，其模型目录已声明
`gpt-6-astra` 为默认模型并支持 `max`。AionCore 保持官方 `v0.2.1` 原样；CLI 与 AionCore
的组合兼容性由 OPL Shell 验证，升级 CLI 不要求修改或派生 AionCore。安装包仍须经过
完整 App 构建、安装和运行时版本回读，不能单独替换已安装 App 内的运行文件。

## 已知列表的角色

`frontier_model_preference_order` 只承担两项职责：

- CLI 没有给出默认模型时的已知 fallback 顺序；
- 固定模型菜单中已知模型的展示偏好。

它不是 allowlist。未知的 CLI 默认模型仍可进入 Auto；固定模型菜单是否展示其它目录
模型属于 Shell 展示适配，但不得影响 Auto 解析结果。

直接调用 Codex app-server 的消费者必须自行读完所有分页。通过 ACP 或其它 adapter 接收
目录的 Shell，只能把 adapter 已完整收集的目录交给 Auto resolver；不完整目录应按
catalog unavailable 处理，不能把首屏结果冒充完整目录。

## Owner 边界

| Surface | 职责 | 不得拥有 |
| --- | --- | --- |
| OPL Flow | 定义推荐模型与推理档。 | live catalog 可用性、App UI、Auto 持久化与 fallback。 |
| OPL Framework | 从已安装 Flow policy 产生严格 `model_projection` 并放入 App state。 | App Auto 算法、用户固定选择。 |
| App product profile | 定义 Auto 算法、已知覆盖、fallback 和持久化语义。 | Flow policy 文件、CLI 实时目录、provider readiness、用户凭证。 |
| Codex CLI | 通过 `model/list` 提供 `isDefault` 和 `supportedReasoningEfforts`。 | App fallback、用户选择持久化、GUI 文案。 |
| AionUI / Native / 其它 Shell | 读取 product profile 和 CLI 目录，解析并展示 Auto，保存 mode 或 fixed override。 | 私有 allowlist、私有模型排序、私有 fallback。 |
| OPL Framework 安装器 | 从 Flow 策略生成首次安装默认配置。 | 另一份默认模型/推理策略。 |

安装初始化的 `gpt-6-astra + max` 是目录不可用或首次生成配置时的初始值，不代表用户
进入自动模式后永远固定在 GPT-6 Astra。Shell 当前解析出的具体模型也只是运行时结果，不得回写
成新的 App product truth。

## 维护默认模型

人工调整 Flow 缺席时的 App fallback 模型或推理档时，只修改：

```text
contracts/app-product-profile.json#codex.auto_model_policy.configured_default
```

这个值不是 Flow 推荐 authority。不要同时修改 `codex.default_*`、
`default_session_profile`、GUI contract、page-state matrix、Shell generated profile 或
Framework install profile；这些都是 App fallback 的生成投影。Flow 推荐应在 OPL Flow
policy 修改并由 Framework installed projection 传入。App fallback 的标准维护顺序是：

```bash
# one-person-lab-app
npm run codex:model-policy:sync
npm run codex:model-policy:check
node --experimental-strip-types scripts/app-product-profile.ts
npm run test:release-boundary

# opl-aion-shell
bunx vitest run tests/unit/common-config/oplProductProfile.test.ts \
  tests/unit/guid/buildAgentConversationParams.test.ts \
  tests/unit/guid/codexModelDisplay.test.ts
bunx tsc --noEmit

# one-person-lab
npm run codex:export-default-profile -- \
  --workflow-policy /absolute/path/to/opl-flow/contracts/workflow-policy.json
npm run test:fresh-install

# opl-studio
npm run validate:candidate
```

`scripts/app-product-profile.ts` 把 App profile 同步到 active AionUI checkout；Shell 只提交
`oplProductProfile.generated.json` 及其必要 consumer/test 变化。Native 在 build/validation 时
直接读取 App profile，不维护副本。Framework 的安装默认值来自 Flow 策略，只提交生成器产出的
`contracts/opl-framework/codex-default-profile.json`；更新整个产品默认值时，应同步修改 Flow 推荐，
不能只更新 App 的兜底值。

若新推理档只是 Codex CLI 未来新增的非空字符串，消费者不得扩展本地 enum/allowlist；
运行时 Auto 会直接使用 CLI 广告的最后一个支持档位。只有要改变已知模型的产品默认、
fallback 或显示标签时，才修改 App authority 并重新生成投影。

## 验证边界

App contract 和 focused tests 能证明策略结构及消费者引用没有漂移；Shell 行为测试应
覆盖已知 5.6、未知 GPT-6、目录不可用和 fixed/Auto 重启四类场景。真实 GPT-6 是否已
进入当前 CLI 目录，必须由届时 fresh `model/list` readback 证明，不能由本文或静态测试
提前宣称。
