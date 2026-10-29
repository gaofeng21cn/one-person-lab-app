# One Person Lab App Status

Owner: `one-person-lab-app`
Purpose: current repository state and evidence routing.
State: active; source and public-release routing, not an installed-state receipt.

## Current source boundary

The active release Shell is OPL Studio on the pinned DSH/Cordis Host, selected by
[`app-shell-adapter.json`](../contracts/app-shell-adapter.json). Studio implements
Desktop, standalone WebUI and Docker WebUI; macOS Stable has used it since
26.9.25 while preserving the OPL App identity and update repository. The former
AionUI adapter at `contracts/shell-adapters/aionui.json` describes historical
source and migration baselines. The archived `opl-aion-shell` is not a production
build source. App owns product contracts and release policy;
Framework and Package owners retain runtime and domain authority. Source
adoption alone does not qualify signed artifacts, installed upgrades, or a
public release.

| Topic | Current contract/source reading | Evidence still required |
| --- | --- | --- |
| Runtime | The GUI contract declares `core_dynamic_agent_runtime`, a required product and default release route. Agent membership is dynamic; typed domain views use `opl_app.typed_domain_views.v3`. The former optional X0-01 classification is retired. | Each carrier's source, pixels, installed behavior and release evidence remain distinct. See [conformance](product/gui/shell-conformance-matrix.md). |
| Codex carrier | Studio `opl-codex-native` owns the persistent Codex App Server connection. Desktop Standard/Full and WebUI use the same Host core and renderer; Codex owns canonical threads. AionUI is a historical upgrade source only. | Exact installed and release cohorts must be read back; historical receipts cannot qualify new bytes. |
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

The runtime bridge declares trusted-prefix WebUI transport and an explicit
cloud/password publisher entrypoint while retaining local Docker defaults. The
[Docker release reference](delivery/release/README.md#cloud-runtime-recipe) owns
that recipe and its qualification path. Real Workspace acceptance still requires
the matching Studio implementation, exact published image and Cloud readback.

The [Studio product boundary](product/gui/opl-studio-plan.md) owns the adopted
implementation and owner relationships. [Distribution](delivery/distribution-and-install-ssot.md)
owns identities, migration policy and qualification routes; retained
[cutover evidence](history/studio-cutover-2026-09.md) covers its original versions.
Current active-shell selection comes from the active adapter, not old transition
phase labels or historical AionUI visual/launcher fields.

This document does not name a live latest version or declare release readiness.
Read current owner artifacts, workflow results, public assets and installed state
for the exact claim. Dated receipts under `delivery/release-evidence/` and
`delivery/release/records/` are historical evidence bound to their original cohorts.

## Next work and verification

[Active gaps](active/app-ideal-state-gap-plan.md) routes unresolved implementation
work to one owner per topic. [Testing](testing/README.md) owns check selection and
[scripts](../scripts/README.md) owns command reference. Documentation maintenance
follows the [lifecycle policy](docs_portfolio_consolidation.md).
