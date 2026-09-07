# One Person Lab App Status

Owner: `one-person-lab-app`
Purpose: current repository state and evidence routing.
State: active; reviewed against local contracts and source, not live deployment.

## Current source boundary

The active release Shell is AionUI, selected by
[`app-shell-adapter.json`](../contracts/app-shell-adapter.json). OPL Studio remains
an independent successor candidate; its source or Preview delivery does not adopt
it as the active Shell. The App owns product contracts and release policy;
Framework and Package owners retain runtime and domain authority.

| Topic | Current contract/source reading | Evidence still required |
| --- | --- | --- |
| Runtime | The GUI contract declares `core_dynamic_agent_runtime`, a required product and default release route. Agent membership is dynamic; typed domain views use `opl_app.typed_domain_views.v3`. The former optional X0-01 classification is retired. | Each carrier's source, pixels, installed behavior and release evidence remain distinct. See [conformance](product/gui/shell-conformance-matrix.md). |
| Codex carrier | AionCore remains unmodified. Shell selects official `@openai/codex` independently; AionCore exports Node only. Standard/Full use the same Codex-only projection. | Exact installed and release cohorts must be read back; historical receipts cannot qualify new bytes. See [carrier architecture](architecture/aioncore-codex-only-carrier.md). |
| First run | Authenticated ordinary launch enters `/guid` without waiting for full App state. Core readiness gates the first conversation, while other preparation stays background or capability-local. | The 1,500 ms launch target needs installed measurement. See [first-run design](product/gui/first-run-setup-workspace.md). |
| Package composition | Current App contracts consume Framework directory, presence and projected actions; explicit Framework lifecycle actions use configured native carriers. Remaining real user-path qualification belongs to the [Package integration plan](active/opl-package-platform-composition-migration.md). | Source/contract progress alone cannot prove installed carrier outcomes or independent Package publication. |
| Computer Use | Product policy and source paths are documented by the [Computer Use owner](product/gui/computer-use.md). | Standard online and Full offline qualification must bind the candidate being released; old source-linked host observations are not current installed proof. |
| OPL Link | The product is retained with development frozen. [OPL Link](product/opl-link.md) owns App-side scope and the restart boundary. | Network, pairing, APNs and TestFlight evidence remain unverified; no background restart is implied. |

Model selection is defined only by the [Auto model policy](product/gui/codex-auto-model-policy.md)
and generated App profile. GUI implementation evidence belongs only in the
[shell conformance matrix](product/gui/shell-conformance-matrix.md); this status
page does not maintain another feature or five-axis ledger.

## Release state

Current release rules are in the [release operator guide](delivery/release/README.md)
and [distribution reference](delivery/distribution-and-install-ssot.md), backed by
[`app-release-channel.json`](../contracts/app-release-channel.json) and workflows.
Desktop Stable has one primary macOS arm64 release and additive same-tag deliveries.
Docker WebUI has an independent GHCR line. A published version, Latest pointer,
asset digest, installed App and Package currentness are different facts.

This document does not name a live latest version or declare release readiness.
Read current owner artifacts, workflow results, public assets and installed state
for the exact claim. Dated receipts under `delivery/release-evidence/` and
`delivery/release/records/` are historical evidence bound to their original cohorts.

## Next work and verification

[Active gaps](active/app-ideal-state-gap-plan.md) routes unresolved implementation
work to one owner per topic. [Testing](testing/README.md) owns check selection and
[scripts](../scripts/README.md) owns command reference. Documentation maintenance
follows the [lifecycle policy](docs_portfolio_consolidation.md).
