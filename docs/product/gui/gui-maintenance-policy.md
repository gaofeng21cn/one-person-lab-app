# GUI 主线升级与 DSH 视觉来源维护政策

Owner: `one-person-lab-app`
Purpose: `gui_upstream_and_visual_maintenance_policy`
State: `active`
Machine boundary: 机器约束归
`contracts/app-gui-product-contract.json#gui_maintenance_policy`、
`contracts/app-shell-adapter.json#upstream_intake`、App validators、Shell audit/tests
和 exact-cohort visual manifests；本文解释运维流程，不创建第二套状态。

## 结论

OPL App 同时维持三条独立轨道：

1. AionUI 只跟随正式 stable tag，通过审计和选择性吸收持续升级；
2. DeepSeek Harness 只通过 exact commit、source manifest 和 MIT notice 手工推进受限视觉 cohort；
3. ChatGPT Codex 只保留历史工作流/空间关系参考；OPL 自有 baseline 承担像素回归。

三条轨道不能互相冒充。看到新 AionUI tag 不等于已经吸收；看到新 DSH commit 或 Codex
截图不等于自动替换产品合同；App 合同、Shell source、像素证据、package、安装与 release 继续分别
给出结论。

视觉来源与验收分轴：DSH cohort 只拥有普通 icon、theme token 和 visual primitive geometry；
Codex observation 只用于 workflow、placement 和 interaction 审查；OPL App 自有 baseline 绑定
16-scene PNG SHA、审批 receipt 和人工 verdict，用于正式像素回归。任何外部 build 都不是
下载、安装、Pixel、Release 或 Stable 前置条件。

“尽可能 1:1”解释为：对已声明 route/state、viewport、theme、locale 和 App-owned baseline
做可重复比较，并显式记录 OPL 差异。没有 exact cohort 和比较 manifest 时，不使用无范围的
“全产品 1:1”结论。

## 固定职责

- App repo 决定产品行为、OPL 保留能力、reference cohort、视觉协议和验收预算。
- Shell repo 负责 AionUI upstream audit、OPL overlay、token 映射、组件适配和 focused tests。
- AionUI upstream 提供实现材料，不覆盖 OPL Settings IA、Runtime、模型策略或 owner truth。
- DeepSeek Harness 提供固定 cohort 内的 icon、theme token 和 visual primitive geometry，不提供
  AionUI runtime、session、router、provider、connection、完整 renderer 或产品 authority。
- ChatGPT Codex 只提供历史 workflow、composition 与交互位置参考，不提供 active visual source、
  代码、品牌、账户或产品 authority。
- AionUI/AionCore 官方能力默认继承；只有 App contract 的 `adapt`、`redirect` 或 `reject`
  可以改变 ordinary surface。OPL allowlist 不得被解释为禁用无关上游能力的通用授权。
- 上游没有且 B0/R1/U1 不要求的复杂功能默认不私有实现；只存在于 rejected、retired 或
  private legacy surface 的问题不进入主线修复。

## DSH Visual Source Promotion

Active visual source policy 由
`contracts/app-gui-product-contract.json#interaction_baseline.visual_source` 指定；精确上游、许可、
运行时 vendor、adapter reference、延后 surface 和首批迁移范围只在
`contracts/app-gui-visual-source-cohort.json` 定义。一次 cohort 推进必须同时具备：

1. 上游 repository、exact commit、MIT license 与 notice inventory 回读；
2. 每个 vendored file 的 upstream path、SHA-256 和 import normalization 记录；
3. runtime import 与 adapter-only reference 分类，确认不引入 DSH runtime/Client Cordis；
4. Titlebar、rail、Home、composer、Settings navigation 的功能和 protected surface 非降级复核；
5. desktop/narrow、light/dark、zh-CN/en-US 比较 manifest；
6. keyboard、tooltip、focus、accessible name 与 App/Shell validators 通过。

Codex 新 observation 不会自动改变视觉 source 或 OPL pixel baseline，只能形成历史交互 delta。
旧 DSH cohort、Codex observation、OPL baseline、Shell source、package、安装与 release 各自独立取证。

## AionUI Stable Intake

每轮 upstream 检查只接受 GitHub 正式 release：tag 必须符合 `vMAJOR.MINOR.PATCH`，且
`draft=false`、`prerelease=false`。固定顺序为：

1. 读取 release metadata 与 tag commit；
2. 计算 merge base、双方 commits、双方 changed files、overlap 和 renderer overlap；
3. 对新增 upstream surface 分类；
4. 只在 `accept` 或 `adapt` 有明确价值时建立窄 patch；
5. 运行 focused gates，再由集成 owner 运行 authoritative active-shell/release gates；
6. 回写 reviewed、absorbed、deferred 或 rejected 的精确 ref 和证据。

分类含义：

| 分类 | 处理 |
| --- | --- |
| `accept` | 直接复用，但不得改变 App authority。 |
| `adapt` | 通过 App contract/profile/bridge/overlay 复用。 |
| `redirect` | 仅保留历史重定向入口，转到 App-owned surface。 |
| `reject` | 不进入 ordinary App 行为。 |

Stable currentness 的机器权威来自 active Shell checkout 中的
`contracts/aionui-upstream-intake.json`。App 只读消费该 receipt，校验 schema、official stable
metadata、Shell package pin、implementation ancestry，以及 AionCore source/archive、managed
manifest、ACP lock 和 Codex binary 的 exact digest/source-lock/qualification 绑定。新 stable 只进入
`review_required`，网络或 API 不确定一律 fail closed，不自动 merge 或触发 release mutation。

`app-gui-product-contract.json#gui_maintenance_policy.maintenance_budgets` 中的
`v2.1.34@0fea1eb82634f3746b9ccf68507277c347fa08a3` 继续作为历史 GUI overlap 测量与维护预算基线；
它不是 stable currentness 指针，也不随 Shell receipt advance 而重写。

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
