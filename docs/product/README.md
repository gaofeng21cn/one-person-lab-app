# Product Docs

Owner: `one-person-lab-app`
Purpose: `app_product_docs_entry`
State: `active_support`
Machine boundary: Human-readable product, GUI, and shell-alternative design
support. Product acceptance stays in App contracts, page-state matrices,
active-shell validation, source, tests, release artifacts, workflows, and CI
logs.

This directory holds App-owned product design material. It is for maintainers
and implementers, not for end-user onboarding.

Persona/Relay integration guidance lives in
`opl-persona/docs/architecture-guidance.md` in the sibling `opl-persona`
repository. It retains those domain boundaries; App contracts own App product
behavior and adoption, and Studio owns the current implementation. App documents
describe the consumer contract and visual behavior without creating a second
domain engine.

## Entries

| Path | Role |
| --- | --- |
| [`codex-configuration.md`](codex-configuration.md) | Codex user configuration ownership and Skill scope; model policy remains in its focused GUI reference. |
| [`opl-link.md`](opl-link.md) | OPL Link 对话优先产品基线、任务/对话边界、跨仓 authority 和当前实现缺口。 |
| [`opl-link-android-plan.md`](opl-link-android-plan.md) | OPL Link Android 原生端与可选本机 Codex 节点的架构规划、技术选型、多形态适配与分阶段路线（重构收尾后启动）。 |
| [`opl-persona-integration.md`](opl-persona-integration.md) | OPL Persona Package contribution, App consumer boundary, and production mount gates. |
| [`gui/ideal-interaction-spec.md`](gui/ideal-interaction-spec.md) | Shell-independent target interaction model for the OPL App. |
| [`gui/element-audit.md`](gui/element-audit.md) | Human review of ordinary user GUI elements, placement, gaps, and interaction logic. |
| [`gui/codex-to-opl-app-delta.md`](gui/codex-to-opl-app-delta.md) | Product delta from Codex App baseline to OPL App. |
| [`gui/feature-inventory.md`](gui/feature-inventory.md) | Cross-shell GUI capability inventory, reference mapping, and validation classes. |
| [`gui/opl-studio-plan.md`](gui/opl-studio-plan.md) | `opl-studio` Native successor development, current pre-adoption boundary, minimum-complete product, and staged cutover evidence plan. |
| [`gui/deepseek-harness-composition-plan.md`](gui/deepseek-harness-composition-plan.md) | DeepSeek Harness GUI reuse boundary and OPL spatial/temporal composition migration plan. |
| [`gui/settings-control-center.md`](gui/settings-control-center.md) | App-owned Settings Control Center product system and validation boundary. |

Retired shell-candidate proof remains in Git history; current adoption policy lives in the App candidate contracts.
