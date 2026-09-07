# Codex Configuration Ownership

Owner: `one-person-lab-app`
Purpose: `codex_user_configuration_and_skill_scope_reference`
State: `active_reference`
Machine boundary: `contracts/app-shell-adapter.json#codex_executable_contract`
and Framework configuration actions own executable behavior.

## Configuration

The App preserves explicit `CODEX_HOME` and otherwise uses Codex's normal
`~/.codex` resolution. Startup reads existing configuration and must not create
an isolated App home, switch the user's provider or rewrite model preferences.
Usable existing access is reused without requesting another credential.

Explicit model-access configuration uses the Framework owner action with an
atomic merge, stale-write protection, backup and restore. Unowned provider-table
keys and the user's selected non-OPL provider remain intact. Credentials stay in
the owner's configuration/secret route; App projects status and actions.

Model selection is defined only in the
[Auto model policy](gui/codex-auto-model-policy.md). Package installation,
executor route readiness and App presentation remain distinct from configuration
success; see [capability governance](../capability-governance.md).

## Skill Scope

User-global capabilities belong to Codex's native user/plugin discovery or the
configured carrier. Domain-project Skills are explicitly projected by their
domain owner. App renders those owner projections and never materializes a
global helper into an arbitrary project or resumed conversation.

AionUI's internal builtin cache is not a third public scope. Scheduled Tasks
owns scheduling; `cron` is not a Skill payload. Existing user instructions remain
user-owned, and App does not write `AGENTS.md` or `TASTE.md`.

OPL Flow declares its own capabilities and dependencies. App's Official Profile
selects the Package for first install or explicit restoration; user removal is
persistent. App keeps no mirrored companion list and Full only adds selected
offline bytes. Platform companion installation and TCC rules are defined in the
[Computer Use reference](gui/computer-use.md).

Configuration tests prove merge and preservation behavior. Actual enabled Skill,
Plugin or MCP visibility requires fresh executor/carrier readback; a config
write or packaged archive alone cannot prove it.
