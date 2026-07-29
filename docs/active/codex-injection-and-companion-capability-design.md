# Codex Injection And Companion Capability Design

Owner: `one-person-lab-app`
Purpose: define the App-owned Codex configuration, OPL Flow installation, Full companion packaging, and user-facing exposure boundary.
State: `active`
Machine boundary: contracts remain authoritative for executable product policy; this document explains the approved design and implementation scope.

## Approved Target

The App separates four concerns that must not be collapsed into one list:

1. Full package contents: offline seed bytes for the same Official Profile used
   by Standard.
2. Installed and enabled state: fresh Package/carrier readback.
3. Codex task routing: skills available to native discovery when a task matches.
4. App presentation: purpose entries and settings shown to ordinary users.

Being packaged does not make a capability default-visible.

## Codex Configuration Ownership

- A missing Codex config receives the current OPL provider, model, reasoning effort, and submitted Gateway credential.
- An active provider that points to the direct OPL Gateway is OPL-managed regardless of its local provider alias. Auto-managed model and reasoning values follow the current App profile while unowned provider-table keys remain intact.
- A user edit that differs from the last OPL-applied model or reasoning value becomes a local override and is preserved.
- A non-OPL active provider remains active. OPL may register or refresh an inactive OPL Gateway provider entry without replacing the user's root provider, model, or reasoning values, and must choose a non-conflicting provider ID when `gflab` is already user-owned.
- Every preference/config mutation uses stale-write protection and atomic
  replacement, creates a backup, and may emit an OPL-owned audit receipt with
  the managed keys, last applied values, route, and selection mode. This is
  configuration safety, not Package installed truth.

## OPL Flow

`opl-flow` is the default workflow Package selected by the App Official
Profile. Standard and Full consume that same Profile; Full only adds offline
seed bytes. Flow is not an App, Standard, Full, Base, or unrelated-Package
readiness prerequisite. Ordinary startup and silent maintenance must preserve a
user's explicit removal; only first install or an explicit Restore Official
Profile action may select it again.

Flow owns its Package descriptor and any Skill, Tool, Plugin, or other
capability declarations. The App does not parse, count, or mirror that companion
list. Codex-specific Plugin/Skill materialization is a carrier projection, not
Flow's Package identity or App readiness truth.

Existing user instructions are preserved outside managed marker blocks. Reusable algorithms stay in their owning skill instead of being repeated in `AGENTS.md`.

## Skill Scope Model

OPL exposes exactly two Skill scopes:

- `global_user`: user-level skills owned by `$CODEX_HOME/skills` or the
  Framework's companion projection. They are available to the user's Codex
  environment and are never materialized into an arbitrary project workspace.
- `domain_project`: project or quest Skills explicitly projected by MAS, MAG,
  RCA, or another domain owner. The owner controls the `.agents/skills`
  projection and its lifecycle; the App only renders the owner projection.

AionUI's `builtin-skills/auto-inject` directory is an internal cache/source,
not a third scope. The active OPL shell runs AionCore with workspace Skill
materialization disabled, including for resumed conversations. `aionui-config`
and `skill-creator` remain hidden internal/global helpers only when an owner
explicitly materializes them; `cron` routes to Scheduled Tasks and is not a
Skill payload. A blanket `.codex/` ignore is not a fix because explicit domain
projections remain legitimate and owner-managed.

## OPL Flow Dependency Projection

- OPL App does not own a companion skill list. Flow declares composable
  capability intent; Framework checks declared required identities for presence
  and callability and projects owner actions. Full may seed available bytes, but
  it does not own a second dependency list.
- Capability membership, recommendation, conflict, replacement and retirement
  come only from the current owner descriptor or explicit App product policy.
  This document does not enumerate OfficeCLI, MinerU, UI/UX, retired Skills, or
  any other companion inventory.
- The App displays dependency state and accepts user overrides; the configured
  carrier performs install/config mutation and Framework aggregates readback.
- `cron` is not a skill payload. Scheduling belongs to the App automation surface.
- OPL does not package or maintain a duplicate `pdf` skill. Official OpenAI Primary Runtime Documents, Presentations, Spreadsheets, and PDF capabilities are preferred and are never mirrored into OPL skill directories.

## Acceptance

- App contracts distinguish packaged, installed, task-routed, and default-visible state.
- Full package assembly seeds only bytes selected for that build and does not
  become a dependency, conflict, or companion inventory authority.
- Carrier/configuration tests cover new install, OPL direct route, local override
  preservation, and non-OPL provider preservation.
- OPL Flow installation readback proves the complete Package is present and
  callable without overwriting unmanaged user instructions. A Plugin-only or
  App-maintained Skill-count readback is insufficient.
