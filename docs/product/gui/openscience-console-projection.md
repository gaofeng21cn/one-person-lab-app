# OpenScience Console Projection

Owner: `one-person-lab-app`
Purpose: `optional_console_projection_boundaries`
State: `active_optional_surface`
Currentness boundary: 本文只解释可选 Console projection 的责任边界。Console、Hosted
Workspace、Fabric 或 HPC 只有在真实 backend 与 owner route 存在时才可显示，不构成 ordinary
App requirement、默认 release gate 或 Native phase-1 parity，也不得维护 placeholder state。
Machine boundary: Human-readable product note. Machine-readable acceptance lives
in `contracts/app-runtime-bridge.json#openscience_console_projection` and
`contracts/app-page-state-matrix.json` Runtime page state.

## Product Shape

OpenScience-inspired material enters OPL Console only as a watch-only
drilldown/projection. The App may render four cards when the Framework projects
refs for a task:

| Card | Console expression | Boundary |
| --- | --- | --- |
| Artifact graph | Graph refs for artifact nodes, edges, and lineage. | No artifact body and no storage truth. |
| Claim warning | Warning refs tied to claim/source/severity context. | No publication verdict, quality verdict, or source readiness claim. |
| Project-local ledger pointer | Pointer to the local project ledger or provenance record. | Pointer only; no ledger write, owner receipt, or storage authority. |
| Native viewer preview | Preview/open refs for the active shell viewer. | Preview only; no artifact mutation and no release/source readiness signal. |

OpenScience mode names are adapted only as navigation labels: Science workspace,
Medical evidence, Goal tracking, and Knowledge distillation. The Medical evidence
label does not authorize medical advice, medical evidence verdicts, or domain
mode overrides; those remain with the owning domain agent.

## Authority Boundary

The projection is `refs_only` and `watch_only`. It is not:

- release readiness;
- source readiness;
- publication verdict;
- owner receipt;
- storage truth;
- compute policy.

Runtime/source producers remain the source of refs. Console owns only the user
projection shape, disclosure placement, and forbidden-claim boundary.

## Related Core App Projections

The following core App projections are independent of optional Console availability,
and are not a new dashboard or second artifact system. The current product uses a Codex-first
shell and executor, while professional agents remain executor-neutral OPL
Packages (`kind=agent`). Codex plugins and packaged skills are carrier
projections or Package capabilities, not Agent identity or installed truth.

| Item | App surface | Boundary |
| --- | --- | --- |
| Structured result panel | Conversation current-task slice and right inspector use `structured_result_panel_projection`. | Existing task surfaces only; no new dashboard, no domain verdict. |
| Artifact/provenance | Artifacts tab may show a provenance card/drawer from `artifact_provenance_bundle_projection`. | Refs only; no artifact body, no quality/readiness verdict. |
| Ref-level comment/follow-up | Review and Actions tabs may show `ref_level_follow_up_refs` for review, request-change, and follow-up prompt/action refs. | No App annotation store and no owner receipt write. |
| Workflow/skill candidate | Settings / Capabilities may show `workflow_skill_candidate_refs` and `candidate_report_refs`. | Report-first suggestion refs only; review / needs changes / continue in conversation, no auto-enable and no skill body write. |

## Acceptance Surface

- Runtime bridge contract: `contracts/app-runtime-bridge.json#openscience_console_projection`.
- Accepted item contracts:
  `contracts/app-runtime-bridge.json#structured_result_panel_projection`,
  `#artifact_provenance_bundle_projection`,
  `#ref_level_follow_up_projection`, and
  `#workflow_skill_candidate_projection`.
- Runtime page projection: `contracts/app-page-state-matrix.json`, Runtime page
  `runtime_view_model.openscience_console_projection`.
- Focused validator: `scripts/validate-active-shell/shared-contract-validators.ts`
  enforces required cards, ref fields, watch-only flags, candidate boundaries,
  and forbidden claims.
