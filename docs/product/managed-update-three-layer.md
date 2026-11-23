# OPL App Managed Update Model

Owner: `one-person-lab-app`
Purpose: `managed_update_three_layer_product_model`
State: `active_reference`
Machine boundary: This document defines the product maintenance model. Current
contracts, native carrier actions and fresh readback determine executable state;
this reference does not prove installed currentness or release readiness.

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
Executor    = Codex CLI / another explicitly configured executor
```

The current ordinary App may remain fixed to Codex CLI. That product choice
does not make Codex Plugin Manager the OPL Package authority or require a user
facing executor selector during this migration.

The local update lanes follow the same ownership split. A current Package does
not require rebuilding the App: use the App Updates surface or the Framework
command `opl packages update --json`, which updates only installed Packages
through their native carriers and verifies fresh readback. Updating OPL Base
stages the App-owned runtime through `opl update apply --json` and may require
an App restart. Compatible DSH Host and Client plugins use the native `opl-studio`
profile package manager and activate on restart. DSH's official `clientModules`
service scans the active profile's `dsh.client` declarations and rebuilds the graph
from the resolved packages. Electron, the pinned DSH core cohort, and the small
`AppWebEntry` boot shell use the App updater or the explicit `manual:local-app`
build lane.

### DSH Plugin Updates Within The App Layer

The three product layers do not require every App change to replace the desktop
bundle. The bundled DSH profile supplies a baseline; native profile dependencies
can override individual compatible npm packages outside the signed App. DSH
owns metadata admission, profile resolution, pnpm locking and rollback. DSH's
official `client-modules` service scans the active Host profile's `dsh.client`
declarations and composes the browser graph; App/Shell only transport and mount
that graph on Electron.

#### Public plugin channel

OPL DSH Host and Client plugins (`opl-studio/plugins/<plugin-id>/`) are published independently to
both GitHub Packages under `@gaofeng21cn` and the zero-token public GitHub Release feed
(`dsh-plugins-latest` / `dsh-plugin-index.json`). The Stable installer acts as a convenient
bundled snapshot for first install; after installation, OPL App stays current by updating
compatible DSH plugins, Framework runtime, and installed Packages in place whenever Electron,
the pinned DSH cohort, and the small `AppWebEntry` boot shell have not changed. Each plugin
carries its own semver version and an `engines.dsh` field declaring its compatible DSH cohort
range.

There are two independent resolution contexts:

- **App bundle baseline**: built from `file:plugins/` deps in `opl-studio/package.json`,
  baked into the signed `app.asar`. `cordis.yml` lists plugin names only — no version
  fields. This layer is fixed without a carrier rebuild.
- **Native profile override**: `DSH_HOME/profiles/opl-studio/package.json`, managed by
  the App's bundled `pnpm` outside the signed App. When background maintenance or the user
  triggers an update, the resolver checks the zero-token public release index first (falling
  back to GitHub Packages when a token is configured), verifies `.tgz` SHA-512 integrity,
  installs the exact latest `^x.y.0`-compatible version here, and surfaces `dshPluginRestartRequired`
  until the next restart activates it via DSH's `createRuntimeResolution` without changing
  `app.asar` or desktop code signing.

A **composition compatibility test** (`release-plugin-composition-test.yml` in `opl-studio`)
verifies that the latest published Host and Client plugin combination works together against
the pinned DSH cohort and produces a **composition receipt** — a pinned list of
`plugin@version` entries that is evidence for a Stable release on the shell-unchanged path.
The receipt does not replace DSH runtime graph discovery.

Design, public feed format, registry fallback, and version strategy:
[`docs/delivery/dsh-plugin-publication.md`](../delivery/dsh-plugin-publication.md).

#### Local operator lane (development and debugging)

For local development, testing, or debugging before a plugin is published to the registry:

```bash
npm run manual:plugins -- inspect
npm run manual:plugins -- update-source --package opl-superagent
# Restart the App and verify the loaded plugin and its functional readback.
npm run manual:plugins -- remove --package @gaofeng21cn/opl-superagent

# Pull all plugins from the registry to latest compatible versions:
GITHUB_TOKEN=ghp_... npm run dsh:plugins:update
# or for a single plugin:
npm run manual:plugins -- update-registry --package opl-superagent --token ghp_...
```

`update-source` builds from local source and packs only the selected package, then
delegates installation to the official DSH plugin manager. `remove` restores the bundled
baseline. Neither action changes `app.asar`, the desktop signature, Framework Package
state, or business data. The default target is the installed macOS App and the native
`opl-studio` profile.

`opl-studio-client` is a first-party DSH Client Plugin in the public and local operator
lanes. Its product UI bytes are resolved from the active profile and loaded by the official
client module graph after restart. The carrier-owned shell retains only startup,
authentication, transport and the official DSH module bootstrap. A client package is
independently replaceable only when its `dsh.client` declaration, bundled client export,
shared platform externals, restart activation and installed readback move together.

Installed freshness is the latest verified compatible running combination from the
selected App, Base and enabled plugin/Package channels. Each cold launch resolves
that combination through its native owners and activates it before starting the
Host, Codex App Server and official DSH client module graph. If a native DSH profile
override crashes Host boot, automatic boot quarantine (`opl_dsh_profile_recovery.v1`)
falls back cleanly to the signed bundled baseline without leaving the user on a white screen.
A saved profile update reports restart required across both Software Center and a
compact top-bar restart trigger until restarted Host inventory establishes activation.
While DSH core tracks prerelease `0.2.2-rc.*` builds, plugin `engines.dsh` remains
exact-pinned to the verified cohort; once DSH reaches stable `0.2.x` GA, plugins
transition to `^0.2.x` caret ranges verified against Track 2 composition gates.

Shell-specific maintenance scheduling and activation are implemented against
the same Framework update interface. The
[Studio plan](gui/opl-studio-plan.md) owns candidate adoption requirements;
the Shell source and installed evidence determine its actual behavior.

## 1. Distribution And First Install

Standard updater, signed installer/DMG, Homebrew, Docker/WebUI, headless
installer, and Full are Base/App deployment carriers, not Package identities or
parallel lifecycle authorities.

First-party OPL Package owners publish complete official bytes independently to
per-Package GHCR repositories and advance only their own `latest-stable`.
Framework, App, Full, Homebrew and tests consume independent owner artifacts.
There is no shared publication snapshot, combination freeze, or aggregate channel.

- Standard and Full use the same **App Official Profile**.
- The Profile declares desired root Packages only for first install or explicit
  **Restore official combination**.
- Full also carries verified offline bootstrap and update candidates for those
  roots. The MAC media library is installed after the core is ready through its
  existing required dependency, and MAC prepares it again before active production.
- On an in-place Full upgrade, the new payload enters the same Framework-owned
  selection and activation path as online updates. Restart must activate the latest
  verified owner selection; usability of the old runtime is insufficient. Native
  owners resolve independently updated plugins without downgrading them to a bundled
  baseline. User configuration and installed/enabled selections remain intact.
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
| DSH Host plugin inside OPL App | Native DSH npm metadata, `opl-studio` profile and pnpm; bundled baseline plus compatible profile overrides. |
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

The App route `/apps?section=applications|updates|resources` is the unified
presentation and action-coordination surface for these independent owners. Its
Applications section consumes the same dynamic Package catalog as Settings;
Updates consumes the existing managed-update projection; Shared resources
shows authorized knowledge-source and connection references. This page is not
a fourth updater, package registry, version-lock authority, credential store,
or knowledge database. Legacy Settings routes deep-link to the same owner
projection and action surface.

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
Every cold startup is an activation boundary, including when the App version has
not changed or the periodic maintenance interval has not elapsed. Before any Host
or App Server uses runtime bytes, the native owners resolve currentness, admit the
available verified updates and activate the selected generations. The App then
re-resolves Node, wrappers, Framework and plugin inventory from the activated
generation; paths captured before activation are not sufficient evidence. Running
processes keep their loaded generation until exit. Activation failures remain
visible with their owner recovery action and cannot be reported as an up-to-date
installation.
Background maintenance runs `checkAppUpdate`, updates Framework and eligible installed
Packages across all maintenance origins (`opl` and remote/managed `external` sources alike),
and syncs compatible DSH plugins (`syncDshPlugins`) under idle leases without prompting on
origin differences. Local developer checkouts (`local_or_user_managed_source`), disabled
packages (`user_disabled_package`), and packages lacking usable sources or healthy carriers
remain excluded from silent overwrite. No background update forces a running App to restart;
when plugin updates are staged (`dshPluginRestartRequired`), or when a user explicitly clicks
restart for plugins, Billion Context, or Framework activation, `performDesktopRestart` closes
the Host cleanly and relaunches the Desktop App.

Managed maintenance retains failure, retry, and restart guidance across renderer reloads and
resumes due checks when the network returns or the window becomes visible. Any native action
outcome maps directly to accurate UI state and localized feedback (never displaying success on
error or rejected operations).

Package update success requires fresh native presence and required entrypoint
readback. A successful install command followed by unavailable or uncallable
readback remains a failure, isolated from unrelated Packages.

- Update only Packages that are currently installed, regardless of whether `catalog_origin` is `opl` or `external` (only objective carrier/source/checkout/disable constraints gate auto-apply).
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
- Resolve each Package version from its own owner target (`latest-stable` or declared channel).
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

Unverified integration and installed outcomes are tracked in
[`../active/opl-package-platform-composition-migration.md`](../active/opl-package-platform-composition-migration.md).
