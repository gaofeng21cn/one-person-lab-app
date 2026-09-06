# OPL App Managed Update Model

Owner: `one-person-lab-app`
Purpose: `managed_update_three_layer_product_model`
State: `target_planned`
Machine boundary: 本文定义目标产品分层。当前 contracts/source 仍包含
Framework resolver、lock、payload、receipt、materialization 和 rollback
兼容面；在迁移计划完成前，它们是 current implementation truth，但不是目标。
本文不证明 currentness、安装完成或 release readiness。
Execution boundary: 本文自身不授权 contracts/source/tests、carrier state 或 public
release mutation。Phase 2 已获用户批准并执行中，但其 work packages、owner surfaces、
回退和批准边界只以
[`../active/opl-package-platform-composition-migration.md`](../active/opl-package-platform-composition-migration.md)
为准；该批准不包含 Package GHCR/tag、Stable/Latest、WebUI promotion、真实用户
managed state 或其他 public mutation。

OPL App presents one consistent maintenance experience while delegating each
software object's mechanics to its existing platform. “Unified management”
means one UI and one aggregate status, not one custom package manager.

KimiCU belongs to the OPL-managed companion class. Framework is its sole
materializer and lifecycle owner: it consumes the pinned identity, installs or
repairs `/Applications/KimiCU.app`, registers the OPL-managed MCP entry, and
projects permission/health state. App and Shell do not run a separate updater
or carry a provider list. Standard uses network materialization and Full uses
the exact bundled seed, but both join the same installed generation and update
path. A user disable/uninstall is a reversible explicit override and remains in
force until explicit re-enable/reinstall. See
[`gui/computer-use.md`](gui/computer-use.md).

Package, carrier, and executor are separate concerns:

```text
OPL Package = executor-neutral identity + capabilities + dependencies
Carrier     = Codex Plugin Manager / Git / OS package manager / local platform
Executor    = Codex CLI / Claude Code / Hermes Agent / future executor
```

The current ordinary App may remain fixed to Codex CLI. That product choice
does not make Codex Plugin Manager the OPL Package authority or require a user
facing executor selector during this migration.

## 1. Distribution And First Install

Standard updater, signed installer/DMG, Homebrew, Docker/WebUI, headless
installer, and Full are Base/App deployment carriers, not Package identities or
parallel lifecycle authorities.

First-party OPL Package owners publish complete official bytes independently to
per-Package GHCR repositories and advance only their own `latest-stable`.
`one-person-lab-manifest:latest-stable` is excluded from ordinary Package
currentness and remains only a Full/offline/integration-test/QA snapshot.

- Standard and Full use the same **App Official Profile**.
- The Profile declares desired root Packages only for first install or explicit
  **Restore official combination**.
- Full differs only by carrying offline seed bytes for those roots.
- Required dependencies are expanded by identity presence, for example
  `MAS -> MAS Scholar Skills`.
- A user-uninstalled Package stays uninstalled. Startup and background update
  never treat Official Profile drift as permission to reinstall it.

Official Profile completion is independent per root. A missing MAS dependency
may leave MAS unavailable while plain Codex, Base, App, and other Packages
remain usable.

## 2. Native Lifecycle Delegation

Each object keeps its narrow owner:

| Object | Lifecycle owner |
| --- | --- |
| OPL Base | Base installer/platform route exposed through a thin Framework adapter. |
| OPL App | Desktop updater, Docker image route, or the carrier that installed App. |
| OPL Package | The owner publishes identity and complete bytes; Codex Plugin Manager, Git, an OS package manager, or Base OCI adapter carries them; Framework fills only missing generic operations and aggregates complete-Package readback. |

Framework discovers installed identities, checks required capability/package
presence and callability, reports executor-route readiness separately, and
aggregates status/actions for App. It does not select a cross-ecosystem version,
reproduce platform locks, or require OPL payload/digest/receipt/LKG state. App
and Shell never select versions, edit Skills/Plugins directly, or maintain
another Package/Skill/Tool/Plugin catalog.

Codex Plugin Manager is the first carrier adapter, not Package identity or
complete installed truth. Codex plugin ids, marketplace layout, Codex
home/path, and manifest shape remain private to that adapter. For official GHCR
bytes, Base retains a thin OCI download adapter and delegates
Plugin/config/cache activation to Codex. Runtime bytes outside the Plugin
surface remain part of the Package: the Package owner declares their
activation/health adapter, the configured carrier executes it, and Framework
aggregates the resulting fresh readback. Base does not become the runtime
lifecycle owner, and a Plugin-only result is incomplete. Switching executor
does not reinstall or rename Packages and does not discard Settings/Home
preference, business Work Items, required-capability presence, or typed views.
For a route the user has actually configured or a Package has explicitly
declared, a missing adapter makes only that route unavailable. Unconfigured
Claude Code or Hermes routes are not projected and are not readiness or
completion gates. If the carrier holding the only physical Package bytes is
removed, fresh aggregate readback must report `physical_unavailable`; cached App
metadata cannot preserve a false installed state.

Exact refs, digests, immutable bytes, and receipts remain legitimate inside one
release/build artifact that must be reproduced. They do not decide whether two
Packages may be composed or whether an installed capability is callable.

## 3. Unified User Experience

Every installed Package is checked and updated independently. Eligible native
updates run silently; one failure does not cancel unrelated updates. Settings
shows a compact aggregate and lazy per-Package detail:

| State | User meaning |
| --- | --- |
| Current | Installed and callable; no action is needed. |
| Updating | Its native platform is applying an independent background update. |
| Restart needed | The owning platform requires restart/reload. |
| Unavailable | A required identity or entrypoint is missing; only dependents are affected. |
| Attention | The native owner refused or failed safely; user action is available. |

Ordinary UI exposes Install, Update now, Enable/Disable, Show/Hide, Uninstall,
Home shortcut preference, and Restore official combination where applicable.
Repair detail, source/version diagnostics, and native rollback facilities stay
under advanced owner diagnostics rather than becoming App state machines.

## Silent Update Rules

Background maintenance obtains executable eligibility from the read-only
Framework plan. Native carriers that cannot check upstream freshness without
refreshing their managed snapshot report `currentness_not_checked`; their
eligible installed Packages may still receive an idempotent native update.
Callability alone never proves that an upstream update check succeeded.

Base background work stages verified runtime generations and leaves activation,
Temporal service/Worker changes, and seed application to the next App startup.
The App updater checks every six hours and retries failures at thirty-minute
intervals up to three times. Resume checks run only when due. No background
update forces a running App to restart. Managed maintenance retains failure,
retry, and restart guidance across renderer reloads and resumes due checks when
the network returns or the window becomes visible.

Package update success requires fresh native presence and required entrypoint
readback. A successful install command followed by unavailable or uncallable
readback remains a failure, isolated from unrelated Packages.

- Update only Packages that are currently installed.
- Never install an Official Profile root merely because it is absent.
- For a root the user explicitly selects for install, update, or repair, locally
  ensure only that root's required presence closure. Ordinary Profile/background
  sweeps never restore absent official roots or touch unrelated roots.
- Repair/reconcile requires a user-selected root or an exact projected Package
  action. Startup and background maintenance must not run a selectorless scan
  that writes every Package.
- Never overwrite a dirty checkout or user-managed source.
- Require fresh native installed/callable readback before reporting success.
- Enumerate installed Packages from carrier readback, not from the selected
  executor or Codex plugin inventory.
- Prefer per-Package owner `latest-stable`; never let an unchanged shared
  Release Set hide a newer Package.
- Verify Plugin/config/cache and complete Package runtime after restart.
- Keep failure local and continue unrelated Package maintenance.

## Authority Boundary

The App owns user-facing state, timing, preferences, and the explicit
first-install/restore intent. Each first-party Package owner owns its GHCR
repository publication and that owner-scoped repository's `latest-stable`. Codex owns
Plugin/config/cache activation; Base owns only thin OCI download/verification;
each Package declares complete-runtime activation and health, configured
carriers execute it, and Framework owns executor-neutral discovery,
complete-Package fresh readback, presence checks, aggregation, and thin
actions. Agent Packages own business task/view descriptors. Shell only renders
and invokes projected actions.

Implementation and deletion order is tracked in
[`../active/opl-package-platform-composition-migration.md`](../active/opl-package-platform-composition-migration.md).
