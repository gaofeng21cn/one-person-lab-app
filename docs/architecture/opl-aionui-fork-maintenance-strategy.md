# AionUI Fork Maintenance Strategy

Owner: `one-person-lab-app`
Purpose: `aionui_fork_maintenance_architecture`
State: `accepted`
Machine boundary: App contracts define product behavior and release admission; the
active Shell owns source, upstream intake receipts and focused validation.

## Decision

Maintain the OPL AionUI implementation through existing App contracts and thin Shell
adapters. App owns product behavior, Settings information architecture, model policy,
GUI contributions and release acceptance. Shell owns renderer, process/preload,
platform integration, packaging implementation, styling and focused tests.
Framework, Codex and domain owners retain runtime, thread and artifact authority.

The default is to inherit official AionUI/AionCore capabilities. An explicit App
contract may adapt or reject a surface such as Team; absence from an App list alone
does not authorize suppressing another upstream capability. New private work must
serve a concrete protected product outcome.

AionCore is an unmodified official upstream dependency. OPL does not maintain an
AionCore fork or patch, and never hot-swaps its binary in a running App bundle.
The Shell composes the official Node-only export with its independently selected
official Codex package. See [Codex carrier](aioncore-codex-only-carrier.md).

## Customization Boundary

Use the first existing layer that expresses the required behavior:

| Layer | Responsibility | Evidence |
| --- | --- | --- |
| Profile/data | App-generated labels, defaults, visibility and Settings registry | Contract and generated-profile agreement |
| Bridge/adapter | App state/action, Codex transport and platform integration | Typed behavior and owner readback |
| Composition/token | Existing slots, wrappers, layout, CSS variables and i18n | Focused interaction and visual evidence |
| Minimal fork-body patch | An upstream component gap that the previous layers cannot express | Exact upstream file, reason, focused regression and intake conflict owner |

Do not create a parallel integration framework, Settings plugin ecosystem, product
model, thread store or Package manager. Existing SettingsHost and adapter slots are
the integration boundary. A component's name or location does not make it product
authority; ordinary routes and behavior still come from App contracts.

Session identity belongs to canonical Codex threads. Project affinity, initial cwd,
turn cwd, explicit attachments and writable roots remain separate. The Shell uses
one App Server adapter and does not introduce a private coordination or workspace
lifecycle to implement navigation. Full interaction rules are maintained in
[the interaction specification](../product/gui/ideal-interaction-spec.md).

Package identity and capabilities belong to Package owners; installed state and
lifecycle belong to configured native carriers. Framework aggregates their public
projection and App renders it. Retired locks, receipts, materialization or fallback
parsers are not accepted architecture and must not be reintroduced by documentation.

## Intake And Verification

The repeatable stable-tag review, classification, overlap budgets and source-cohort
promotion procedure lives only in
[GUI maintenance policy](../product/gui/gui-maintenance-policy.md).
The active Shell `contracts/aionui-upstream-intake.json` owns the moving release
receipt; App validators check it against the active adapter and resolved checkout.
This strategy does not copy release SHAs, remediation ancestors, test counts or
historical incident timelines.

Broad capability intake uses the classifications declared by the adapter contract.
Settings-specific changes additionally pass the App-owned registry/slot classification.
Required capabilities, minimum versions, evidence paths and executable commands come
from the machine contract and validators, not a second checklist in this document.

Validation must exercise the behavior affected by upstream changes. Startup work
includes the actual ready-entry and relaunch path; provider/IPC changes include the
real caller and typed failure. Structural checks alone cannot establish behavior.
Ordinary launch enters Guid without waiting for complete App state; a failed
background read does not recreate a first-run navigation gate.

Use the narrow affected checks and the required App active-shell gate. Visual
changes additionally follow [pixel acceptance](../product/gui/codex-app-visual-parity.md).
Source tests, screenshots, package smoke, installed acceptance and public release
each prove only their own layer.

## Maintenance

Update this decision when ownership or allowed adaptation layers change. Put a new
incident's diagnosis and exact evidence in its issue or immutable receipt. Once a
fix is reflected in source and contracts, retain its general rule here only when
that rule changes the architecture; do not append a release-by-release checklist.
