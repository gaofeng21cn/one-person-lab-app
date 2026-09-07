# One Person Lab App Architecture

Owner: `one-person-lab-app`
Purpose: components, interfaces and ownership relationships.
State: current architecture reference; implementation and delivery evidence remain separate.

## Product And Hosts

The App is the product layer of `OPL Base + OPL App + OPL Packages + OPL Cloud`.
Base provides Framework runtime and Package composition; Packages provide
capabilities; Cloud owns hosted services. A brand or capability domain is not a
fixed source directory, Package, plugin or release artifact.

```text
Package capabilities and declarative App contributions
  -> Framework Host: runtime, Package graph, App state/action projection
    -> App product profile, Client/GUI ABI and release policy
      -> AionUI: current Stable Shell
      -> Studio: independent DSH Application Host and candidate Shell
```

App owns product semantics, first-run behavior, GUI contracts, accessibility,
carrier qualification, release policy and user documentation. Framework owns
generic discovery, presence checks, runtime aggregation and action producers.
Agent Packages own business task lifecycle, domain schemas, artifacts and quality
verdicts. Temporal owns execution facts; Codex App Server owns thread identity,
history, permissions and execution protocol.

Framework Host is unique in
`framework_runtime_package_graph_and_app_projection`. Studio's DSH Host owns
`dsh_profile_plugin_lifecycle_codex_and_delivery_transport_composition` only.
The Hosts exchange public state/action, authentication and channel callback
contracts; they do not share registries, session stores or internal service graphs.
Neither Shell becomes another Framework runtime, Package manager or release owner.

## Shell Selection And Client Composition

[`app-shell-adapter.json`](../contracts/app-shell-adapter.json) selects the active
release Shell. [`app-shell-candidates.json`](../contracts/app-shell-candidates.json)
owns candidate selection and adoption gates. Per-launch GUI selection is independent
of release adoption. AionUI and Studio keep separate bundles, dependencies, UI data,
preferences and caches; sequential launch does not prove simultaneous write safety.

App wrappers validate `client_renderer_compatibility` before launching a selected
adapter. Both clients consume the same Host graph, App allowlist, contribution ABI,
typed slots, state/action RPCs, events and state semantics. They may implement those
semantics with different renderers and build systems. This is explicit admission,
not unvalidated hot switching. [Shell candidates](product/gui/gui-shell-candidates.md)
owns launch and adoption details.

The Framework Host projects a closed declarative graph. The App-owned
[`opl-app-contributions.schema.json`](../contracts/opl-app-contributions.schema.json)
admits localized navigation, views, commands and badges independently of Package
role. Local references must resolve inside the contribution block. Arbitrary
React, JavaScript, HTML, executable paths, URLs and handlers are not contributions.
Invalid blocks fail locally without hiding other Packages.

Reads go through `opl app contribution read`. Shell validates the broker's
identity, schema and success envelope; the current descriptor chooses the standard
view renderer. Writes go only through `opl app action execute --action
package_contribution_execute`, with the corresponding broker envelope in the action
result. A missing projected action disables only its command, preserving valid reads.
App/Shell do not call a Package execute broker as an independent mutation route.

## Package Composition

| Concept | Owner and responsibility |
| --- | --- |
| Package | Owner-defined executor-neutral identity, kind, entrypoints, capabilities and required/optional presence edges. |
| Publication | Package owner publishes complete immutable bytes and controls its own channel; no shared family snapshot defines ordinary currentness. |
| Carrier | Native platform or Package-declared adapter owns physical install/update/remove and fresh readback. |
| Base OCI adapter | Downloads and verifies owner bytes, then hands off to the declared carrier; does not become a complete Package manager. |
| Framework | Discovers carriers and installed descriptors, checks presence/callability, joins complete-Package state and per-executor readiness, and projects actions. |
| Official Profile | App-owned first-install or explicit-restore root intent, shared by Standard and Full. |
| App/Shell | Render the projection and user visibility/order preferences; never resolve versions or synthesize installed state. |

The ordinary App uses Codex first without making Package identity Codex-specific.
Codex Plugin Manager is one carrier; plugin ids, marketplace layout, config and
cache paths stay inside that adapter. A missing executor route degrades only that
route. If removal of a carrier removes the only physical Package bytes, fresh
readback must report physical unavailability rather than preserve a false install.

Dependencies express identity presence and callability, not version/ABI ranges,
digests, locks or family closure. Capability identities include kind, so a Skill
and CLI with the same text id remain distinct. Breaking capabilities receive a
new identity or an owner adapter. Exact bytes and frozen manifests remain valid
for reproducible builds, not ordinary Package readiness prerequisites.

The Official Profile is not a fixed ecosystem inventory. User-removed roots stay
removed across ordinary startup and maintenance. Full adds offline seeds for the
same roots. Required edges such as MAS to MAS Scholar Skills remain owner-declared;
their failure affects dependents locally. Neither App nor Shell parses Flow's
capability list or creates Package/Agent/Skill/Tool/Plugin/MCP allowlists.

[Capability governance](capability-governance.md) owns this composition policy's
App-facing details. [Package migration](active/opl-package-platform-composition-migration.md)
owns the remaining successor cutover and deletion work. Existing legacy consumers
are deletion gaps, not recommended alternative interfaces.

## State, Actions And Tasks

Ordinary reads use `opl app state --profile fast --json`; writes use
`opl app action execute ... --json`. Full state and operator drilldown are explicit
Maintenance/release diagnostics. Unknown mutation outcomes require fresh owner
inspection rather than replay. The bridge and owner matrix live in
[`app-runtime-bridge.json`](../contracts/app-runtime-bridge.json).

Runtime is a required core dynamic Agent task surface in current contracts.
Framework discovers task producers from installed Agent descriptors and joins
business, execution, visibility and observed telemetry without guessing. Shell
renders Agent -> Project scope and canonical work items; unavailable producers,
Temporal bindings or views degrade locally. Missing Token values stay unknown.
Typed views use `opl_app.typed_domain_views.v3`: domain owners supply schema and
rendering extensions admitted into a trusted Shell build; selection uses `view_kind`,
not Agent-id branches or App-owned scientific schemas. Runtime detail remains
item-scoped; it does not become an operator console or artifact authority.

[Runtime design](product/gui/runtime-overview-redesign.md) owns presentation and
visibility semantics. [Settings](product/gui/settings-control-center.md) owns
maintenance, package/capability management and storage destinations. Task Inspector
owns artifact/provenance presentation. All remain consumers of their actual owners.

Codex thread operations reuse one existing App Server adapter. GUI persistence
is limited to drafts, preferences and rebuildable cache. Recorded cwd is runtime
context; explicit project affinity is a separate presentation relation. No second
coordination host, model-tool API, scheduler or task ledger is permitted. Codex
subagent metadata is independent of the rejected AionUI Team surface. Rationale
and reconsideration conditions live in
[thread operations](architecture/codex-cross-thread-orchestration.md).

## Installation And Delivery

Users maintain three software objects: Base, App and Packages. Each keeps its own
lifecycle. User data/artifacts are a separate storage boundary. App updating does
not mutate Base, Packages, system tools or developer checkouts; a running-version
switch triggers a fresh Framework projection. Standard/Full are payload densities,
not separate update authorities. [Managed updates](product/managed-update-three-layer.md)
owns that user experience.

AionUI uses unmodified AionCore, a Node-only producer export and independently
selected official Codex bytes. [Runtime carrier](architecture/aioncore-codex-only-carrier.md)
owns composition and process identity. Studio has no AionCore dependency. All
installed upgrades require full App build/install/readback; no embedded binary
hot replacement is supported.

The successor shares a DSH-derived renderer and Node host across Electron,
standalone WebUI and container carriers. Each carrier must independently prove its
claimed behavior. Current supported distribution, installer selection and update
identity live in [distribution](delivery/distribution-and-install-ssot.md); operator
sequencing lives in the [release guide](delivery/release/README.md). Desktop Stable
and independent Docker GHCR publication do not share mutation authority.

Hosted Workspace, Fabric and Console appear only with real owner projections.
They do not turn missing hosted backends into ordinary App blockers. App does not
own cloud scheduling, storage, credentials, billing, environment bodies or domain
policy. [OPL Link](product/opl-link.md) owns the remote-companion product boundary;
[Persona integration](product/opl-persona-integration.md) owns its Package view consumer.

## Evidence

Contracts define admitted behavior, source/tests establish implementation,
pixels establish observed scenes, installed readback establishes actual carrier
behavior, and release evidence establishes publication. None substitutes for
another. Fresh external currentness must be read from its owner. [Conformance](product/gui/shell-conformance-matrix.md)
is the one feature-status summary; [testing](testing/README.md) routes verification.
