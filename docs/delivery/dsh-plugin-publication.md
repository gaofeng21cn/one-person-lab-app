# DSH Plugin Publication and Incremental Update Model

Owner: `one-person-lab-app`
Purpose: `incremental_dsh_plugin_publication_and_composition_model`
State: `active`

Defines the target and verified status for independently published DSH Host plugins,
native profile updates, and shell-unchanged Stable composition. A plugin is only
current after its published bytes pass composition testing and the installed profile
readback confirms activation.

Applies to **Layer 2** (DSH Host and Client plugins in `opl-studio/plugins/`).

- **Layer 1** (Electron + DSH cohort + the small `AppWebEntry` boot shell): Electron,
  the DSH cohort and the boot shell still require a carrier build. Product Client
  packages are loaded through DSH's official `dsh.client` graph in WebUI and the
  Electron file renderer; the desktop bridge transports only the Host-owned graph and
  bundle bytes.
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

Client packages, including `@one-person-lab/opl-studio-client`, are included in Track 1.
Changing the carrier-owned boot shell, Electron, or the pinned DSH cohort still requires
the shell-changed path.

### Track 2 — Composition compatibility test

**Trigger**: on-demand, or automatically after Track 1 finishes publishing.

**CI**: `release-plugin-composition-test.yml` in `opl-studio`.

Steps:
1. Resolve the latest compatible published version of each OPL-owned DSH Host and Client plugin
   against the pinned DSH cohort (verify `engines.dsh` range covers the cohort tag).
2. Install the resolved combination into a clean DSH profile (no App bundle involved).
3. Start the DSH Host; verify Cordis service startup, Framework bridge readiness,
   MCP Apps host availability, and a functional smoke ping of each plugin's core service.
4. On pass: emit a **composition receipt** — a pinned list of Host and Client `plugin@version` entries
   plus the DSH cohort ref used. Store as a workflow artifact and in the `opl-studio`
   release registry.

The composition receipt is evidence for a Stable release on the shell-unchanged path. It is
not a lockfile, Bundle Profile, runtime module registry, or list of all valid combinations;
it records one verified compatible combination. DSH's active profile and official
`clientModules` graph remain the runtime authority. The App release controller must still
admit the candidate before signing or publishing it.

### Track 3 — Stable release

#### Shell-unchanged path (most releases)

**Precondition**: Electron, DSH cohort, and the `AppWebEntry` boot shell are identical to the
previous Stable release bytes. A passing composition receipt from Track 2 exists.

Steps:
1. Bind the candidate's bundled baseline and registry package inputs to the composition
   receipt's pinned versions; do not create a second runtime Bundle Profile.
2. Bump the App version; build only the carrier bundle (no product Client plugin rebuild
   when the receipt already supplies its published bytes).
3. Sign and notarize via the existing `release-stable.yml` path.
4. The App release controller admits the candidate, then signs and publishes it. The
   resulting App is expected to behave like a fully rebuilt release; this equivalence is
   not yet established by a successful public candidate.

Release duration is measured per candidate rather than asserted in advance. Published
Host and Client plugin compilation can be reused; signing, notarization and installed
acceptance remain required. The small boot shell remains carrier-owned.

#### Shell-changed path

When Electron or the DSH cohort changes, the carrier build remains necessary. Reusing
published plugin versions in the ordinary production build is a target that still needs
to be wired into the App release controller; its current path builds from source.

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

The App version describes the carrier shell combination. The composition receipt describes
one tested Host/Client plugin combination. A single App shell version may correspond to many
plugin combination updates throughout its lifecycle.

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

The target App Updates surface shows plugin freshness alongside Framework Package freshness.
The current installed UI has no Host-plugin update action or freshness projection; the
source CLI requires an operator checkout and registry credentials.

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
its `^x.y.0` range will not resolve to it. Pre-release versions require an explicit native DSH package operation for local testing;
the current `update-registry` command accepts package names and resolves stable ranges.

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

**Status: partially implemented.** The local source/profile lane is verified. The
public registry lane exists in source but its first publish run failed before producing
packages, so no public composition receipt or Stable candidate has been accepted yet.

### CI: `release-dsh-plugins.yml` (Track 1)

Triggers on push to main modifying any publishable plugin directory, or manual dispatch
with `packages` / `force_all` inputs. Per-plugin matrix: build via `buildDshPlugins([name])`,
run the package boot test, then enter the package directory and run
`npm publish --provenance` to GitHub Packages. Already-published versions are skipped.
The package directory is required because a positional `npm publish plugins/<name>` was
parsed as a GitHub package spec and caused the first run to fail.

### CI: `release-plugin-composition-test.yml` (Track 2)

Triggers on manual dispatch or on successful completion of `release-dsh-plugins.yml`.
Resolves latest `^x.y.0` versions, installs the exact resolved registry packages into a
clean dependency graph, runs `dsh-plugin-packages.test.mjs` against those bytes, and
emits `composition_receipt.json`
as a 90-day artifact. An unpublished or DSH-incompatible package fails the run; the
receipt never falls back to a local source baseline.

### CI: `release-dsh-plugins-stable.yml` (Track 3)

Manual dispatch, requires `composition_receipt_run_id` (a successful Track 2 run).

Steps:
1. Download `composition_receipt.json` from that run
2. `node scripts/apply-composition-receipt.mjs --receipt composition_receipt.json`  
   — patches `package.json` plugin deps from `file:plugins/` to exact registry versions
3. Refresh the lockfile with `npm install --package-lock-only --ignore-scripts`, then run
   `OPL_DSH_REGISTRY_PLUGINS=1 npm ci`. The root prepare hook preserves the published
   plugins; dependency lifecycle scripts still prepare Electron and native modules.
4. `npm run build:desktop:receipt` — builds desktop with `--registry-plugins`; published
   Host plugins are left untouched while only the static carrier and unpublished
   Superagent engine are generated.
5. `electron-builder` packages, `qualify:desktop:distribution` validates
6. Uploads candidate DMG/ZIP/blockmap/feed YAMLs + `plugin-stable-provenance.json`

The resulting artifacts have the same structure as a full carrier candidate. They are
not a Stable release until an App-side consumer admits the exact candidate and performs
the existing signing, publication and final readback path.

### Local: `dsh-profile-plugins.mjs update-registry` (developer + user update)

```bash
# Update all published plugins to their latest compatible version from a configured
# registry credential:
GITHUB_TOKEN=ghp_... npm run dsh:plugins:update

# Or via the manual:plugins alias:
npm run manual:plugins -- update-registry --all --token ghp_...

# Update a single plugin:
npm run manual:plugins -- update-registry --package opl-superagent --token ghp_...
```

Token is written to the profile `.npmrc` (mode 0600) on first use. Subsequent runs
reuse the stored token automatically.

The local operator and source composition lanes are implemented. Public publication,
receipt-backed Stable production, and App-managed end-user update readback still require
a real release run. The product Client graph is loaded through official DSH client
modules; `engines.dsh` is declared in all publishable plugin manifests, `cordis.yml`
lists Host plugin names only, and DSH resolves active Host/Client package versions at runtime.
