# App Architecture Decisions

Owner: `one-person-lab-app`
Purpose: durable rationale and reconsideration boundaries.
State: active decision reference.

Implementation status is reported in [Status](status.md) and the
[conformance matrix](product/gui/shell-conformance-matrix.md). Product details
remain in their topic references; this record does not repeat command, field,
version or completed-work inventories.

## Product And Composition

| Decision | Why and boundary | Current owner |
| --- | --- | --- |
| One App product with replaceable Shells | Product behavior must survive renderer replacement. AionUI is active; Studio is a separate successor until explicit adoption. Source or Preview success cannot select the release carrier. | [Architecture](architecture.md), App adapter/candidate contracts. |
| Two scoped Hosts | Framework owns runtime/Package/App projection; Studio owns DSH profile/plugin, native Codex and transport composition. Public bridges preserve distinct ownership without duplicating registries or runtimes. | `app-product-profile.json#delivery_topology` and Studio adapter. |
| Pinned DSH reuse | Reusing a reviewed upstream Host/GUI cohort avoids a private replacement implementation. OPL behavior remains in external plugins/adapters; DSH Session/LLM/Agent/Credentials authority is not imported. | [DSH composition](product/gui/deepseek-harness-composition-plan.md). |
| Codex-first ordinary execution | One ordinary executor reduces product and maintenance complexity. Visible model/reasoning and permission/access controls remain App-owned; hidden upstream multi-backend and Team controls do not define OPL capability. | GUI contract and [feature inventory](product/gui/feature-inventory.md). |
| AionCore remains unmodified | Shell combines AionCore's Node-only export with independently selected official Codex bytes. This avoids upstream patches while allowing Codex upgrades. Final bundles exclude Claude; Framework headless and Studio retain independent carriers. | [Runtime carrier](architecture/aioncore-codex-only-carrier.md). |
| Open Package composition | Package identity, publication, carrier and executor readiness are separate. Native carriers own lifecycle, Framework aggregates fresh state, and App renders. Presence edges avoid a central version/ABI solver or lock/receipt authority. | [Capability governance](capability-governance.md). |
| One-shot Official Profile | Defaults help first installation without continuously enforcing a fixed ecosystem. Standard/Full share roots, user removal persists, and required dependencies stay Package-local. | [Managed updates](product/managed-update-three-layer.md), App Official Profile. |
| Successor-first legacy deletion | Preserve user outcomes by proving the successor path, switching real callers, then deleting the old manager. Legacy schemas and tests do not justify retaining an obsolete public interface. | [Package migration](active/opl-package-platform-composition-migration.md). |

## Interaction And Data

| Decision | Why and boundary | Current owner |
| --- | --- | --- |
| Separate function, interaction, visuals and conformance | Upstream defaults or current screenshots cannot redefine the desired product. External alignment may relocate a feature only with an equally visible, keyboard-accessible replacement. | [GUI index](product/gui/README.md). |
| Chat-first with progressive detail | Work begins in the conversation; context, files, diagnostics and evidence appear when needed. Current-task progress belongs in the timeline, not duplicate dashboards. | [Interaction](product/gui/ideal-interaction-spec.md), [element audit](product/gui/element-audit.md). |
| Session identity stays with Codex | Project affinity supports organization and initial cwd but is not an authorization boundary or a second thread owner. One-time projectless adoption preserves recorded cwd; bound sessions are not arbitrarily regrouped. | [Thread operations](architecture/codex-cross-thread-orchestration.md). |
| Subagent display without private orchestration | Real Codex delegation can be shown independently of disabled AionUI Team. No second client, scheduler, model delivery layer, coordination ledger or cross-host protocol is justified by display parity. | Thread operations and GUI contract. |
| Runtime is a core dynamic task view | Agent Packages own business state; Temporal owns execution; Framework joins; Shell renders generic fields. Typed views remain locally optional and domain-owned, with unknown views degrading locally. | [Runtime](product/gui/runtime-overview-redesign.md), `opl_app.typed_domain_views.v3`. |
| App Auto and Flow recommendations have different owners | App owns selection, complete-catalog handling and persistence; Flow supplies installed recommendations. Explicit user choices and unknown supported models remain intact. | [Auto model policy](product/gui/codex-auto-model-policy.md). |
| Core-ready conversation with nonblocking shell startup | Ordinary authenticated `/guid` launch does not wait for complete App state. Capability-specific preparation and ACP warmup protect the first prompt; optional preparation stays background and failures local. | [First run](product/gui/first-run-setup-workspace.md). |
| User configuration remains user-owned | Preserve explicit `CODEX_HOME` or normal system resolution. Startup reads existing configuration; selected credential/config changes use Framework atomic merge, stale-write protection and backup. No implicit isolated Codex home or project Skill injection. | [Configuration reference](product/codex-configuration.md), Settings contract. |
| Three software objects and separate data | Base, App and Packages each keep their own updater; data/artifacts are not another software object. Inventory, confirmation and recovery protect cleanup. Shell must not scan or delete Package roots or run generic Docker prune. | [Managed updates](product/managed-update-three-layer.md), [Settings](product/gui/settings-control-center.md). |
| Computer Use is a managed default | Standard online and Full offline must converge on the same provider and permissions. TCC remains a user-controlled OS decision; failure affects only the capability. Structured browser automation and visual desktop control keep distinct roles. | [Computer Use](product/gui/computer-use.md). |

## Integration And Delivery

| Decision | Why and boundary | Current owner |
| --- | --- | --- |
| Package views are declarative | A Package contributes schema-admitted views and opaque actions, not React/Swift code or a second Settings tree. Framework discovers and validates; App presents review and confirmation. | Contribution schema, [Persona integration](product/opl-persona-integration.md). |
| OPL Link is an independent iOS connector | It continues desktop conversations without another runtime/history store. Only its desktop Connector is an OPL Connect Package. Development remains frozen until manual restart; transport targets and network evidence stay explicit. | [OPL Link](product/opl-link.md). |
| Hosted resources are conditional projections | Workspace/Fabric/Console require actual owner backends. Missing hosted services do not block local work; App never assumes scheduling, billing, credentials or storage authority. | Runtime bridge and Settings contracts. |
| External learning is bounded | PilotDeck/OpenChamber/Codex observations can inform organization; licensing, runtime ownership and App contracts still govern reuse. Historical observations are not current pixel authority. | [Feature inventory](product/gui/feature-inventory.md), [visual parity](product/gui/codex-app-visual-parity.md). |
| Freeze once, recover exact bytes | Later main movement must not invalidate a valid frozen candidate. Checkpoints recover failed phases; unknown publication results require readback, not repeated mutation. Prepared release notes stay off the publish critical path. | [Release guide](delivery/release/README.md), [Bundle](delivery/release/immutable-release-bundle.md). |
| One Desktop Stable Release Set | macOS arm64 is primary; Full/Linux/Windows append to its tag under asset CAS. Additional delivery failure does not allocate another product version. Docker GHCR publication has independent authority. | [Distribution](delivery/distribution-and-install-ssot.md). |
| Full is offline density, not an updater channel | Standard metadata excludes Full. Size optimization cannot remove required offline runtime or weaken native trust; pruning comes from one machine policy. | Release contract and Full builder/qualification. |
| Cache is disposable acceleration | Content-bound layers and bounded writers reduce repeated work. Cache hits, runner membership or build success do not prove install or publication. Fleet owns capability; GitHub owns runner scheduling. | [Actions cache](delivery/actions-cache-architecture.md) and release runner policy. |
| Evidence remains owner- and cohort-bound | Contract, source, pixels, install, publication and domain verdict answer different questions. Homebrew, artifact presence or UI rendering cannot promote another owner's readiness. | [Testing](testing/README.md), release artifacts and owner readback. |

Reconsider a decision only when a current requirement, supported upstream
capability or observed failure changes its rationale. Update the owning contract
and real consumers before removing a load-bearing constraint. Retired details
and dated execution records remain in Git, not a parallel active decision table.
