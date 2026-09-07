# One Person Lab App Project

Owner: `one-person-lab-app`
Purpose: repository scope and external ownership boundaries.
State: active.

One Person Lab App is the local-first OPL workbench product. This repository owns
the product profile, GUI contracts, first-run and update experience, selected
release Shell, desktop distribution, user guides and App-level acceptance.
Users work through conversations and dynamically discovered professional
capabilities. The ordinary executor is Codex; Package shortcuts are work-entry
choices, not a backend selector or a domain workflow authority.

| Owner | Responsibility |
| --- | --- |
| App | Product behavior, GUI ABI, official first-install profile, carrier admission and App release policy. |
| `opl-aion-shell` | Current AionUI renderer, processes, packaging adapter, implementation tests and upstream intake. |
| `opl-studio` | Independent DSH Application Host, native Codex and delivery transport composition; candidate until explicit App adoption. |
| Framework | Generic runtime, installed Package discovery, presence/status aggregation and state/action producers. |
| Package/domain owners | Business tasks, domain schemas, quality verdicts, artifacts and their authority. |
| Codex / Temporal | Canonical conversation protocol and execution facts in their respective scopes. |
| Cloud | Hosted service and data authority, exposed only through actual owner contracts. |

Shell source remains in external checkouts and is not vendored into App history.
Replacing a Shell does not transfer App, Framework or domain authority. Desktop
and browser carriers consume the same product semantics; their availability and
release evidence are independently established. Hosted Workspace and remote
companions require their own real backend and owner gates.

Use [architecture](architecture.md) for component relationships, [GUI](product/gui/README.md)
for product design, [distribution](delivery/distribution-and-install-ssot.md) for
install/release identities, and [status](status.md) for current source/evidence routing.
