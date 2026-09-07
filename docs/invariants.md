# One Person Lab App Invariants

Owner: `one-person-lab-app`
Purpose: `cross_cutting_authority_and_safety_invariants`
State: `active_truth`
Machine boundary: Contracts, source and fresh owner evidence determine behavior.

This reference contains constraints that cross component boundaries. Page rules,
field catalogs, operating procedures and completion status belong to their
specialized owners in the [documentation index](README.md).

## Authority

- App owns product behavior, first-install policy, GUI contracts and App release
  qualification. Shells implement those contracts. GUI definitions flow from
  product definition through the visual system to implementation/conformance.
- Framework owns OPL runtime, Package discovery/aggregation and App state/action
  projection. Domain owners retain scientific semantics, quality verdicts,
  artifacts and business lifecycle. App cannot infer those verdicts from UI,
  provider completion or a successful transport.
- AionCore is an unmodified official dependency. The Shell composes its Node-only
  export with the independently selected official Codex CLI; App does not create
  a private AionCore fork or replace a running App's embedded core in place.
- Native carriers own actual Package lifecycle. Package identity, physical
  carrier, executor route and owner publication/currentness stay independent.
  App must not create a resolver, lock, payload, LKG or parallel installed registry.
- The Official Profile owns first-install roots and explicit restoration only.
  Installed descriptors dynamically supply capabilities; no fixed Agent/Package
  list limits discovery or silently reinstalls a user-removed Package.

## Sessions And Interaction

- Codex App Server owns canonical thread IDs, history, execution, permission and
  lifecycle. One adapter serves user-triggered thread operations. App adds no
  model-callable orchestration tools, coordination ledger or second client.
- Project affinity is zero-or-one versioned UI metadata keyed by canonical thread
  ID. One-time adoption requires exact thread identity readback and leaves the
  recorded runtime cwd unchanged. The current protocol has no `projectId` field
  to read back. Explicit affinity blocks reassignment; cwd and writable roots
  neither create nor expand affinity. Failure leaves the thread usable.
- Ordinary Codex remains available without a selected project or an Agent's
  readiness. Required context comes only from the selected owner action's typed
  payload requirements. An unavailable optional route degrades locally.
- Authenticated startup enters `/guid` while App state refresh runs in the
  background. Core readiness gates the first conversation; it is not a blocking
  pre-`/guid` state fetch. Installed timing claims require measured evidence.
- Runtime is a required core dynamic Agent route. Agents own Work Items; Temporal
  owns execution; Framework joins projections; Shell renders them without
  Agent-ID branches. Typed views dispatch by `view_kind`, with domain schemas
  owned by their producers. Diagnostics and software repair belong to Settings.

## Mutation And Data

- GUI reads and mutations use Framework's public state/action interfaces. App
  does not inspect private domain stores or turn diagnostics into runtime truth.
- Install/update copy distinguishes OPL Base, OPL App and OPL Packages. User Data
  and Artifacts remain a separate storage/cleanup boundary. A Standard App
  update must not update Packages, system tools or developer source checkouts.
- Full supplies offline seed bytes for first install; it is not a parallel
  update authority. Full assets never enter Standard updater metadata.
- Explicit user preferences and removals persist. App does not overwrite user
  `AGENTS.md`, `TASTE.md`, global Codex or system/Homebrew tools. Configuration
  ownership and write admission follow the [capability reference](capability-governance.md).
- Local GUI selection does not adopt a release shell. Separate shells keep
  separate identities, UI data and caches and do not share private stores.
  Same-runtime claims require exact resolver readback.
- Secret material, arbitrary local paths and unreviewed screenshots do not enter
  public documentation. Temporary visual artifacts stay outside Git unless an
  explicit evidence manifest owns their promotion.

## Evidence

Contract, Source, Pixel, Install and Release are independent evidence axes.
The [conformance matrix](product/gui/shell-conformance-matrix.md) owns per-feature
status. An external GUI observation is a design reference; the approved
App-owned baseline owns formal pixel regression. Neither proves installation.

Current source, local tests and a launchable candidate cannot prove installed
currentness, public availability, Stable/latest promotion, domain acceptance or
family production readiness. Each claim requires fresh evidence from its owner
for the exact cohort. Missing evidence remains an explicit gap.

Retired requirements, fixtures and compatibility aliases must not become new
work. Preserve unique rationale in history or Git; remove executable consumers
after verifying their active callers. Human prose is reviewed semantically;
machines validate contracts, links, schemas, assets and deterministic safety.
