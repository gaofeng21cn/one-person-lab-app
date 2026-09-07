# App documentation lifecycle

Owner: `one-person-lab-app`
Purpose: document responsibilities, change lifecycle and retirement.
State: active.

Each maintained document answers one reader question. Contracts and source define
machine behavior; documentation explains intent, operation or evidence scope.
A directory index routes readers and does not repeat its children's requirements.

## Responsibilities

| Surface | Sole responsibility |
| --- | --- |
| Root README pair | Public product introduction and installation entry points, with the same meaning in both languages. |
| [Docs index](README.md) | Navigation. |
| [Project](project.md) | Repository scope and external ownership boundaries. |
| [Architecture](architecture.md) | Components, interfaces and their responsibility relationships. |
| [Invariants](invariants.md) | Cross-cutting constraints; detailed product policy stays in its topic owner. |
| [Decisions](decisions.md) | Reasons for durable choices and conditions for reconsideration; no implementation checklist. |
| [Status](status.md) | Concise current source reading and evidence routing; no execution history or repeated feature matrix. |
| [Active gaps](active/app-ideal-state-gap-plan.md) | Unresolved work and its owning plan, without copying completed work or evidence tables. |
| `active/` | Bounded unfinished implementation plans with exit criteria. |
| `architecture/` | Focused technical references and explicitly non-binding explorations. |
| `product/` | User outcomes and product policy; [GUI index](product/gui/README.md) separates functionality, interaction, visuals and conformance. |
| `delivery/` | Operator procedures, generation inputs and exact-cohort evidence. |
| `testing/` | Check selection and what each check proves. |
| `guides/`, `whitepapers/` | Canonical public-document sources. |
| `publishing/` | Reusable rendering templates and build configuration. |
| `site/` | Site assembly; `site/latest/` is ignored generated output. |
| `history/` | Frozen evidence with a concrete future diagnostic or decision use. Git retains retired procedures. |

## Change lifecycle

Before changing a claim, inspect its contract, source and real caller. For installed,
public or remote claims, obtain fresh owner readback or explicitly retain the
original cohort/date. A target is not implemented merely because its document or
contract exists. Do not copy exact versions, current SHA values, field catalogs,
model lists or command lists into multiple topic pages.

When implementation changes, update the owning reference and any navigation or
claim that becomes false in the same change. An active plan keeps only remaining
work. Fold durable behavior into its reference, route qualification to the actual
evidence owner, then delete the completed plan. Do not append a new dated tranche,
Agent prompt or duplicate completion matrix to preserve a work transcript.

Retirement is semantic: identify the replacement and current callers, transfer
unique constraints or rationale, update incoming references, and delete obsolete
instructions and examples together. Do not retain aliases or runnable compatibility
pages for retired modules, APIs or tests. A still-executed legacy implementation
is an explicit deletion gap in the owning plan, never an endorsed alternative and
never falsely reported as removed.

Keep a historical record only when it binds immutable artifact evidence, explains
a material incident, or prevents a plausible reintroduction mistake. Mark that
record historical and keep it out of ordinary setup and operating navigation.
Do not rewrite frozen receipts to make them current. Dated check counts, local
paths, task branches and closed checklists normally belong in Git or run artifacts.

## Verification

Review prose semantically. Mechanical checks may verify links, paths, JSON/schema,
generated provenance, executable examples and security constraints; they must not
infer correctness or completion from exact prose, headings, keywords or document
length. A stale prose assertion in a test must be retired or changed to a real
contract/behavior check, not preserved as a documentation requirement.

Edit generated documents through their source/configuration and regenerate only
when those inputs changed. Run affected checks and `git diff --check`; inspect
inbound references before a move or deletion. Report actual coverage and unresolved
claims without recording another permanent coverage ledger in this directory.
