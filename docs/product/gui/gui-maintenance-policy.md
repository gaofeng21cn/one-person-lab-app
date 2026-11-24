# GUI 主线升级与 DSH 视觉来源维护政策

Owner: `one-person-lab-app`
Purpose: `gui_upstream_and_visual_maintenance_policy`
State: `active`
Machine boundary: 机器约束归
`contracts/app-gui-product-contract.json#gui_maintenance_policy`、
`contracts/app-shell-adapter.json`、Studio source manifest、App validators、Shell audit/tests
和 exact-cohort visual manifests；本文解释运维流程，不创建第二套状态。

## 结论

OPL App 同时维持三条独立轨道：

1. Studio 的 DSH Application Host、renderer、plugins 与 overlay 按 exact upstream cohort
   维护；唯一操作入口是 [Studio 上游维护](https://github.com/gaofeng21cn/opl-studio/blob/main/README.md#dsh-upstream-maintenance)。
2. App 持有视觉目标、reference cohort 和像素验收；旧版 AionUI 上游追踪机制已正式退役
   （`historical_aionui_upstream_provenance_retired=true`），历史来源保留在 Git 历史中。
3. ChatGPT Codex 只保留历史工作流/空间关系参考；OPL 自有 baseline 承担像素回归。

三条轨道不能互相冒充。看到新 DSH commit 或 Codex
截图不等于自动替换产品合同；App 合同、Shell source、像素证据、package、安装与 release 继续分别
给出结论。

视觉来源与验收分轴：固定 DSH 视觉 cohort 只拥有普通 icon、theme token 和 visual primitive geometry；
Codex observation 只用于 workflow、placement 和 interaction 审查；OPL App 自有 baseline 绑定
16-scene PNG SHA、审批 receipt 和人工 verdict，用于正式像素回归。任何外部 build 都不是
下载、安装、Pixel、Release 或 Stable 前置条件。

“尽可能 1:1”解释为：对已声明 route/state、viewport、theme、locale 和 App-owned baseline
做可重复比较，并显式记录 OPL 差异。没有 exact cohort 和比较 manifest 时，不使用无范围的
“全产品 1:1”结论。

## 固定职责

- App repo 决定产品行为、OPL 保留能力、reference cohort、视觉协议和验收预算。
- Studio repo 负责 DSH upstream status/preflight/replay、OPL overlay、token 映射、组件适配
  和 focused tests；其 source manifest 持有运行中的 Host 与 renderer cohort。
- DeepSeek Harness 提供当前 Studio Host 与 renderer 的实现材料，不覆盖 OPL Settings IA、
  Runtime、模型策略、Framework runtime/Package 或领域 authority。具体复用和排除范围见
  [Application Host composition](deepseek-harness-composition-plan.md)。
- ChatGPT Codex 只提供历史 workflow、composition 与交互位置参考，不提供 active visual source、
  代码、品牌、账户或产品 authority。
- 上游 surface 是否进入 ordinary product 由 App contract 准入；OPL allowlist 不得被
  解释为禁用无关上游能力的通用授权。
- 上游没有且 B0/R1/U1 不要求的复杂功能默认不私有实现；只存在于 rejected、retired 或
  private legacy surface 的问题不进入主线修复。

## DSH Visual Source Promotion

DSH 视觉来源准入由 `contracts/app-gui-product-contract.json#gui_maintenance_policy.visual_source_promotion`
与 `interaction_baseline.visual_source` 指定；精确上游、许可、运行时 vendor、adapter reference、
延后 surface 和迁移范围由 `contracts/app-gui-visual-source-cohort.json` 定义。一次 cohort 推进必须同时具备：

1. 上游 repository、exact commit、MIT license 与 notice inventory 回读；
2. 每个 vendored file 的 upstream path、SHA-256 和 import normalization 记录；
3. runtime import 与 adapter-only reference 分类；
4. Titlebar、rail、Home、composer、Settings navigation 的功能和 protected surface 非降级复核；
5. desktop/narrow、light/dark、zh-CN/en-US 比较 manifest；
6. keyboard、tooltip、focus、accessible name 与 App/Shell validators 通过。

Codex 新 observation 不会自动改变视觉 source 或 OPL pixel baseline，只能形成历史交互 delta。
DSH cohort、Codex observation、OPL baseline、Shell source、package、安装与 release 各自独立取证。

## Retired Legacy Upstream Intake

`opl-aion-shell` 与历史 `historical_aionui_upstream_provenance` 已按 `gui_maintenance_policy`
完全退役（`historical_aionui_upstream_provenance_retired=true`），不再存在活跃 upstream intake
或旧 overlap 基线。历史记录保留在 Git 历史；当前 Studio Host 与 renderer 的 DSH 升级均通过
[Studio 上游维护](https://github.com/gaofeng21cn/opl-studio/blob/main/README.md#dsh-upstream-maintenance)推进。

## Maintenance Budgets

预算基线记录在 `gui_maintenance_policy.maintenance_budgets`。Shell audit 默认比较：

- overlap files 与 renderer overlap files 不得无审阅增长；
- Codex overlay 的 `!important` declarations 与 selector blocks 不得无授权增长；
- token bridge 与 component adapter 分开计数，新增视觉值优先落 token；
- 预算失败表示必须人工分类或重设基线，不自动触发 merge/rebase。

数值基线绑定 exact Shell ref 与 upstream tag。更新基线必须同时记录原因、影响文件、分类和
focused evidence，不能只把阈值调大让 gate 变绿。

## 视觉与产品回归

Source cohort 推进必须同时绑定 exact App contract、Shell commit、build identity、主题、
语言与 viewport 的比较证据。完整 baseline approval、mask、threshold、scene verdict 和
安装层边界只维护在 [像素验收协议](codex-app-visual-parity.md)。

Settings return、appearance 与 updater 入口属于
[Settings Control Center](settings-control-center.md)；视觉值归 [视觉系统](visual-system.md)。
维护时验证这些用户结果，不在本流程复制其字段、路由、固定数值或旧兼容要求。

## Closeout Boundary

一轮维护只有在 exact topic commits、文件清单和 focused evidence 完整后才能交给集成 owner。
Topic 不自行 push、merge、package、install 或宣称 release-ready。最终 active-shell full gate、
installed-App UI acceptance、发布和 currentness 由对应 owner 在吸收后的 exact cohort 完成。
