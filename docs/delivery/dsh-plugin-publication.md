# DSH Plugin Publication and Incremental Update Model

Owner: `one-person-lab-app`
Purpose: `incremental_dsh_plugin_publication_and_composition_model`
State: `active`

Defines how OPL's DSH Host plugins are published independently, how the installed App
picks them up without a full carrier rebuild, and how a stable release consumes
pre-published and pre-tested plugin versions instead of rebuilding from source every time.

Applies to **Layer 2** (DSH Host plugins in `opl-studio/plugins/`) only.

- **Layer 1** (Electron + DSH cohort + static `opl-studio-client` renderer): still requires
  a full carrier build when it changes — this constraint is intentional and not addressed here.
- **Layer 3** (Framework capability packages): already uses independent per-owner GHCR
  publication; this model does not change that.

## Delivery Tracks

### Track 1 — Per-plugin publish

**Trigger**: push to `opl-studio` main branch modifying `plugins/<plugin-id>/`.

**CI**: `release-dsh-plugins.yml` in `opl-studio`.

Steps:
1. Detect which plugin packages changed (or accept explicit `package_id` input).
2. Build changed plugin(s) via `build:plugins` targeting only those packages.
3. Run the plugin's own unit/integration tests.
4. Publish to GitHub Packages under `@one-person-lab` scope, with provenance attestation.
5. Record the published version and `engines.dsh` range as workflow output.

Result: a new `@one-person-lab/<plugin-id>@x.y.z` is live on the registry.
The installed App picks it up on next `update-registry` run (or `dsh:plugins:update`),
which installs the new version into the native profile and surfaces "restart required".
No `app.asar`, desktop signature, Framework Package state, or business data is modified.

**Excluded from Track 1**: `@one-person-lab/opl-studio-client` (static renderer).
Changes to the client require a full carrier build via the existing shell-changed path.

### Track 2 — Composition compatibility test

**Trigger**: on-demand, or automatically after Track 1 finishes publishing.

**CI**: `release-plugin-composition-test.yml` in `opl-studio`.

Steps:
1. Resolve the latest compatible published version of each OPL-owned DSH Host plugin
   against the pinned DSH cohort (verify `engines.dsh` range covers the cohort tag).
2. Install the resolved combination into a clean DSH profile (no App bundle involved).
3. Start the DSH Host; verify Cordis service startup, Framework bridge readiness,
   MCP Apps host availability, and a functional smoke ping of each plugin's core service.
4. On pass: emit a **composition receipt** — a pinned list of `plugin@version` entries
   plus the DSH cohort ref used. Store as a workflow artifact and in the `opl-studio`
   release registry.

The composition receipt is the input for a Stable release on the shell-unchanged path.
It is not a lockfile; it records one verified compatible combination, not all valid ones.

### Track 3 — Stable release

#### Shell-unchanged path (most releases)

**Precondition**: Electron, DSH cohort, and `opl-studio-client` are identical to the
previous Stable release bytes. A passing composition receipt from Track 2 exists.

Steps:
1. Update the bundled baseline profile to the composition receipt's pinned versions.
2. Bump the App version; build only the profile-updated bundle (no Electron/renderer rebuild).
3. Sign and notarize via the existing `release-stable.yml` path.
4. The resulting App behaves identically to a fully rebuilt release; the signed bytes differ
   only in the bundled profile, not in the binary shell.

Wall-clock cost: primarily Apple signing and notarization (~10 min). Plugin compilation
already happened in Track 1 during development; it is not repeated here.

#### Shell-changed path

When Electron, DSH cohort, or `opl-studio-client` changes, the full carrier build runs
as before — but plugins are consumed from the registry at their composition-receipt-pinned
versions rather than rebuilt from source. The plugin compilation step (~5–10 min across
all plugins) is eliminated even on the shell-changed path.

## Registry

**Location**: GitHub Packages npm registry, `@one-person-lab` scope.  
**URL**: `https://npm.pkg.github.com`  
**Read access**: requires a GitHub personal access token with `read:packages` scope, or a `GITHUB_TOKEN` available in CI/App context.  
**Write access**: `packages:write` scope on the `opl-studio` repository (provided automatically via `GITHUB_TOKEN` in CI).

The registry is a distribution channel for pre-built plugin packages. It is not a Plugin
identity authority (that belongs to the DSH npm metadata and Studio profile), a
compatibility matrix, or a lockfile replacement. The DSH profile resolution and pnpm
remain the sole runtime arbiters of what is actually installed.

### Registry authentication

**In CI**: `GITHUB_TOKEN` is passed via `options.env` to `runPluginCommand`, which
merges it on top of `scrubbedParentEnv()` (which otherwise strips all `*TOKEN*` names).

**On developer machines**: pass via `--token` flag or set `GITHUB_TOKEN` in the shell.
The `update-registry` operation writes the token to `.npmrc` in the profile directory
(mode 0600) under `//npm.pkg.github.com/:_authToken=<token>`. Subsequent installs by
DSH's native pnpm reuse the `.npmrc` without needing the env var again.

**On end-user machines**: at first use, the user runs `update-registry --token <tok>` once
to configure the profile `.npmrc`. After that, `dsh:plugins:update` works without
re-supplying the token (it persists in the profile `.npmrc`). This is a one-time setup
analogous to `npm login`.

If no token is provided and no `.npmrc` token exists, `pnpm view` and `pnpm add` will
fail to authenticate; the operation reports per-package failures and exits non-zero.

## Version Strategy

Each DSH Host plugin has an independent semver version, decoupled from the App version.

- `major.minor.patch` — standard semver.
- `engines.dsh` in `package.json` declares the compatible DSH cohort range.
- `engines.opl-studio` optionally declares a minimum `opl-studio` baseline version.

The App version describes the shell combination. The composition receipt describes the
plugin combination. A single App shell version may correspond to many plugin combination
updates throughout its lifecycle.

A plugin bump that extends or narrows `engines.dsh` compatibility must use a new **minor**
version at minimum so that existing installs on older DSH cohorts are not silently broken.
A bump that changes public Cordis service contracts uses a new **major** version.

## Profile Resolution Model

Understanding the two independent resolution contexts is essential:

**App bundle baseline** (inside `app.asar`):
- Built from `file:plugins/<id>` deps in `opl-studio/package.json` via `npm ci`
- Results in a fixed set of plugin bytes baked into the signed bundle
- Never changes without a carrier rebuild and re-sign
- `cordis.yml` lists only plugin **names** (`id`/`name` pairs) — no version fields

**Native profile override** (`DSH_HOME/profiles/opl-studio/`):
- Managed by DSH's native pnpm outside the signed App
- Lives at `~/.dsh/profiles/opl-studio/package.json` (or the configured `DSH_HOME`)
- When a package appears here, DSH's `createRuntimeResolution` picks it over the bundle version
- `update-registry` installs **exact resolved versions** here (pnpm locks them)
- Removing an override restores the bundle baseline on next restart

The semver caret range (`^x.y.0`) is used **only during the resolution query** — when
`update-registry` calls `pnpm view @one-person-lab/opl-superagent@^0.1.0 version` to
find the latest compatible published release. The version actually recorded in the native
profile `package.json` is the exact resolved version, not a range.

```json
// DSH_HOME/profiles/opl-studio/package.json  (after update-registry)
{
  "name": "dsh-profile-opl-studio",
  "private": true,
  "dependencies": {
    "@one-person-lab/opl-superagent": "0.2.3"
  }
}
```

The compatibility boundary enforced by `engines.dsh` in each plugin's `package.json`
ensures that `update-registry` never resolves a version requiring a newer DSH cohort
than what is bundled in the running App.

## Incremental Update in the App UI

The App's Updates surface shows plugin layer freshness alongside Framework Package freshness.

| State | Meaning |
| --- | --- |
| Current | All installed plugins are at the latest compatible published version. |
| Updates available | One or more compatible plugin updates are published. |
| Updating | DSH native profile is installing the update. |
| Restart needed | Update installed; App restart required to load the new version. |
| Incompatible update | A newer version exists but requires a newer DSH cohort (shell update needed). |

"Update now" for the plugin layer delegates entirely to the DSH native profile package
manager. The App state machine does not manage per-plugin update lifecycle.

The projection source for plugin layer freshness: DSH native profile installed version
vs. latest compatible published version on the registry. This can be read from the DSH
profile resolution output without requiring a separate App-side catalog or mirror.

## Compatibility Gate

Before a plugin version is included in a composition receipt:

1. Its `engines.dsh` range covers the current pinned DSH cohort.
2. It passes the composition test (Track 2) alongside the current combination.
3. It does not introduce a new peer dependency outside the pinned DSH cohort.

A plugin that fails these checks is published with a pre-release suffix (`-rc.N`) and
its `^x.y.0` range will not resolve to it. Pre-release versions are available for local
testing via `update-registry --package <name>@<exact-version>`.

## Rollback

DSH's native profile mechanism: removing the profile override restores the bundled
baseline version on next App start. No App-level rollback state machine needed.

```bash
npm run manual:plugins -- remove --package @one-person-lab/opl-superagent
# Restart the App; the bundled baseline version loads.
```

For a composition-level rollback (e.g., a defective Track 2 release), restore the
previous composition receipt's pinned versions in the native profile. The bundled
baseline is always the floor.

## Daily update workflow

```bash
# Check current profile overrides
npm run manual:plugins -- inspect

# Pull all published plugins to their latest compatible version
# (token persists in profile .npmrc after first run)
GITHUB_TOKEN=<token> npm run dsh:plugins:update

# Or update a single plugin
npm run manual:plugins -- update-registry --package opl-superagent --token <token>

# Restart the App to load the new versions.
# To revert a specific plugin to the bundled baseline:
npm run manual:plugins -- remove --package @one-person-lab/opl-superagent
```

## Authority Boundary

| Concern | Owner |
| --- | --- |
| Plugin source, build, and publication | `opl-studio` |
| Composition test and composition receipt | `opl-studio` CI (`release-plugin-composition-test.yml`) |
| DSH profile dependency resolution and locking | DSH native pnpm |
| Stable release entry, shell signing, and notarization | `one-person-lab-app` `release-stable.yml` |
| App version and release identity | `one-person-lab-app` |
| Incremental update user experience | `one-person-lab-app` (Shell renders the projected state) |

## opl-studio Implementation

**Status: implemented** (`opl-studio` commit `458486d`).

### CI: `release-dsh-plugins.yml` (Track 1)

Triggers on push to main modifying any publishable plugin directory, or manual dispatch
with `packages` / `force_all` inputs. Per-plugin matrix: build via `buildDshPlugins([name])`
then `npm publish --provenance` to GitHub Packages. Already-published versions are skipped.

### CI: `release-plugin-composition-test.yml` (Track 2)

Triggers on manual dispatch or on successful completion of `release-dsh-plugins.yml`.
Resolves latest `^x.y.0` versions, runs `dsh-profile-plugins.test.mjs` and
`dsh-plugin-packages.test.mjs`, emits `composition_receipt.json` as a 90-day artifact.

### Local: `dsh-profile-plugins.mjs update-registry` (developer + user update)

```bash
# Update all published plugins to their latest compatible version:
GITHUB_TOKEN=ghp_... npm run dsh:plugins:update

# Or via the manual:plugins alias:
npm run manual:plugins -- update-registry --all --token ghp_...

# Update a single plugin:
npm run manual:plugins -- update-registry --package opl-superagent --token ghp_...
```

Token is written to the profile `.npmrc` (mode 0600) on first use. Subsequent runs
reuse the stored token automatically.

All structural implementation is complete. `engines.dsh` is already declared in all 11
plugin `package.json` files; `cordis.yml` lists plugin names only (no version fields —
versions are resolved at runtime by DSH from the native profile and bundle).
