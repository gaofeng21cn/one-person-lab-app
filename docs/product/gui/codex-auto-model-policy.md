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
2. 模型菜单以用户本机 Codex 实际目录为准，保留自定义和非 OpenAI 模型；App 不添加
   供应商过滤，也不改写本机 `model_catalog_json`、凭据和测试配置。
3. Auto 优先接受目录中的后续新默认模型；已知默认落后于 App `configured_default` 且
   App 默认可用时，采用 App 默认，当前为 `gpt-6-astra + max`。旧 Flow 推荐不能降级它。
4. 完整目录明确不含 App 默认时，参考有效 Flow 推荐、CLI 默认及已知兼容模型。
   未知新默认模型继续使用 CLI 广告的最高推理档，不需要 App 新建自定义模型。
5. ACP 只有模型名称而没有能力元数据时，使用 App 默认；缺元数据不代表 CLI 太旧。
   不再硬编码 GPT-5.6 的旧兼容值。
6. 固定选择从目录消失时，保留为不可用选择，直到用户恢复 Auto 或另选模型。
   自动模式只保存 Auto，不保存旧解析快照。

当前 AionUI 主线通过 Shell 独立携带官方 npm Codex CLI `0.153.4`，其模型目录已声明
`gpt-6-astra` 为默认模型并支持 `max`。AionCore 保持官方 `v0.2.1` 原样；CLI 与 AionCore
的组合兼容性由 OPL Shell 验证，升级 CLI 不要求修改或派生 AionCore。安装包仍须经过
完整 App 构建、安装和运行时版本回读，不能单独替换已安装 App 内的运行文件。

## 已知列表的角色

`frontier_model_preference_order` 是已知模型的回退及显示顺序，不是允许列表。
本机 Codex 自定义模型继续按实际目录展示，未知的新默认模型仍可进入 Auto。
直接读取 `model/list` 的 adapter 必须收集全部分页；ACP 缺少能力元数据时使用上述
App 默认，不把仅有名称的目录或失败请求当成旧 CLI 的证据。

## Owner 边界

| Surface | 职责 | 不得拥有 |
| --- | --- | --- |
| OPL Flow | 定义推荐模型与推理档。 | live catalog 可用性、App UI、Auto 持久化与 fallback。 |
| OPL Framework | 从已安装 Flow policy 产生严格 `model_projection` 并放入 App state。 | App Auto 算法、用户固定选择。 |
| App product profile | 定义 Auto 算法、已知覆盖、fallback 和持久化语义。 | Flow policy 文件、CLI 实时目录、provider readiness、用户凭证。 |
| Codex CLI | 通过 `model/list` 提供 `isDefault` 和 `supportedReasoningEfforts`。 | App fallback、用户选择持久化、GUI 文案。 |
| AionUI / Native / 其它 Shell | 读取 product profile 和 CLI 目录，解析并展示 Auto，保存 mode 或 fixed override。 | 私有 allowlist、私有模型排序、私有 fallback。 |
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
`contracts/opl-framework/codex-default-profile.json`；App 默认优先于 Flow 推荐；Flow 自身的工作负载策略保持其 owner 管理。

若新推理档只是 Codex CLI 未来新增的非空字符串，消费者不得扩展本地 enum/allowlist；
运行时 Auto 会直接使用 CLI 广告的最后一个支持档位。只有要改变已知模型的产品默认、
fallback 或显示标签时，才修改 App authority 并重新生成投影。

## 验证边界

App contract 和 focused tests 能证明策略结构及消费者引用没有漂移；Shell 行为测试应
覆盖 Astra 默认、旧 Flow 推荐、本机自定义模型保留、目录不可用和 fixed/Auto 重启场景。真实 GPT-6 是否已
进入当前 CLI 目录，必须由届时 fresh `model/list` readback 证明，不能由本文或静态测试
提前宣称。
