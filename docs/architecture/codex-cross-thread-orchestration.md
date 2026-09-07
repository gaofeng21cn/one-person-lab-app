# ADR: Codex Thread Operations Boundary

Owner: `one-person-lab-app`
Purpose: `codex_thread_operations_boundary`
State: `active_reference`
Machine boundary: `contracts/app-gui-product-contract.json#interaction_baseline.thread_coordination`.

## Decision

Codex owns thread identity, history, execution, permission and lifecycle. App
exposes ordinary user-triggered directory/actions through the single existing
App Server adapter. This includes supported list, read, start, resume, fork,
archive, restore, rename and delete operations. Conversation execution continues
through the selected Shell's canonical Codex route.

Project affinity is zero-or-one UI metadata keyed by the canonical thread ID.
An explicit projectless thread may be adopted once. The adapter reads back the
exact thread identity before committing versioned UI metadata; recorded runtime
cwd stays unchanged. The current App Server protocol does not provide a
`projectId` assignment/readback field. Existing affinity prevents reassignment.
Runtime cwd, command `pwd` and writable roots do not define membership.

## Rationale And Exclusions

A private coordination host would duplicate Codex execution authority and create
an independent replay/currentness problem. App therefore adds no second client,
model-callable thread tools, JSONL coordination store, idempotency/queue ledger,
pending-request control plane or cross-host handoff protocol. There is no
independent coordination page or Team-based task runtime.

These former targets are retired. Their source, fixtures, compatibility APIs and
tests cannot preserve a current requirement. Reconsideration needs a stable
upstream public capability and an explicit App product decision explaining the
remaining user need and owner boundary.

## Delegated Activity

Codex subagents are separate from AionUI Team. The App may render canonical
delegated activity, completion and open-thread navigation through existing
metadata and owner-supported actions. This is a thin display/interaction surface,
not permission to create a scheduler or private execution store. Exact source
and installed coverage belong only to the
[conformance matrix](../product/gui/shell-conformance-matrix.md).

Contract, Source, Pixel, Install and Release remain independent. The
[active gap plan](../active/app-ideal-state-gap-plan.md) routes unresolved work;
this ADR retains only the decision and its rationale.
