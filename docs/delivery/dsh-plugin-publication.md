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

**Trigger**: push to `opl-studio` main branch modifying a plugin or its declared shared
source/build inputs (`plugins/`, `packages/`, transitional `src/`, and selected build files).

**CI**: `release-dsh-plugins.yml` in `opl-studio`.

Steps:
1. Detect changed plugin packages (or accept explicit `packages` / `force_all` input).
   Shared source or build-input changes select all publishable packages.
2. Build changed plugin(s) via `build:plugins` targeting only those packages.
3. Run the plugin's own unit/integration tests.
4. Publish to GitHub Packages under `@gaofeng21cn` scope, with provenance attestation.
5. Record the published version and `engines.dsh` range as workflow output.

Result: a new `@gaofeng21cn/<plugin-id>@x.y.z` is live on the registry.
The installed App picks it up on next `update-registry` run (or `dsh:plugins:update`),
which installs the new version into the native profile and surfaces "restart required".
No `app.asar`, desktop signature, Framework Package state, or business data is modified.

Client packages, including `@gaofeng21cn/opl-studio-client`, are included in Track 1.
Changing the carrier-owned boot shell, Electron, or the pinned DSH cohort still requires
the shell-changed path.

### Track 2 — Composition compatibility test

**Trigger**: on-demand, or automatically after Track 1 finishes publishing.

**CI**: `release-plugin-composition-test.yml` in `opl-studio`.

Steps:
1. Resolve the latest compatible published version of each OPL-owned DSH Host and Client plugin
   against the pinned DSH cohort (verify `engines.dsh` range covers the cohort tag).
2. Replace the source dependencies with exact registry versions, refresh their lock
   entries, and install the combination without an App bundle. Verify the installed
   packages' identities, registry origins, integrity and shipped Host/Client entrypoints.
3. Start the DSH Host; verify Cordis service startup, Framework bridge readiness,
   MCP Apps host availability, and a functional smoke ping of each plugin's core service.
   Install the packed OPL overrides into a fresh native profile, start the actual
   Superagent child CLI, read its management API, and stop it.
4. On pass: emit a **composition receipt** — a pinned list of Host and Client `plugin@version` entries
   plus the DSH cohort ref and App product commit used. The same job exports the tested
   registry tarballs, lockfile and receipt as `dsh-plugin-composition-build-input`, with the
   GitHub artifact archive digest. Store both artifacts for 90 days.

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
1. Pass the successful Studio composition run to
   `release:stable-dispatch ... --composition-run-id <run>`. The App source gate records
   the exact producer run and build-input archive digest in its operation fingerprint.
2. Download the input, verify the producer workflow, App/Studio commits, archive digest and
   receipt, then install the tested tarballs with the receipt lockfile. Do not create a
   second runtime Bundle Profile.
3. Bump the App version; build only the carrier bundle (no product Client plugin rebuild
   when the receipt already supplies its published bytes).
   not yet established by a successful public candidate.
4. The same composition is installed for macOS, Linux, Windows and the Windows Guest Host
   build. Renderer cache identity includes the registry-composition mode.
5. Sign and notarize via the existing `release-stable.yml` path. The App release controller
   admits the candidate, then signs, publishes and performs the existing clean-install
   acceptance.

Release duration is measured per candidate rather than asserted in advance. Published
Host and Client plugin compilation can be reused; signing, notarization and installed
acceptance remain required. The small boot shell remains carrier-owned.

#### Shell-changed path

When Electron or the DSH cohort changes, the carrier build remains necessary. The same
composition input can be used when its receipt declares the exact frozen App and Studio
commits. A changed DSH cohort or changed client carrier requires a new composition test.

## Registry

**Location**: GitHub Packages npm registry, `@gaofeng21cn` scope.
**URL**: `https://npm.pkg.github.com`  
**Read access**: requires a GitHub personal access token with `read:packages` scope, or a `GITHUB_TOKEN` available in CI/App context.  
**Write access**: `packages:write` permission on `gaofeng21cn/opl-studio` (provided by `GITHUB_TOKEN` in CI). Each plugin's npm `repository` field binds the package to this repository.

The package scope matches the repository's GitHub owner. The former
`@one-person-lab` scope names a separate GitHub account, so the Studio Actions token
cannot publish there. Studio uses the same `@gaofeng21cn/*` package identity in
manifests, native profile entries, `dsh.client.inject` and client factories. This
keeps discovery and activation within DSH's standard package metadata.

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
`update-registry` calls `pnpm view @gaofeng21cn/opl-superagent@^0.1.0 version` to
find the latest compatible published release. The version actually recorded in the native
profile `package.json` is the exact resolved version, not a range.

```json
// DSH_HOME/profiles/opl-studio/package.json  (after update-registry)
{
  "name": "dsh-profile-opl-studio",
  "private": true,
  "dependencies": {
    "@gaofeng21cn/opl-superagent": "0.2.3"
  }
}
```

The compatibility boundary enforced by `engines.dsh` in each plugin's `package.json`
ensures that `update-registry` never resolves a version requiring a newer DSH cohort
than what is bundled in the running App.

## Incremental Update in the App UI

The source App Updates surface renders DSH plugin freshness alongside Framework Package
freshness. Studio's `OplSoftwareUpdates.tsx` reads `readDshPluginUpdates`, invokes
`updateDshPlugins` for available updates, preserves per-plugin check/update failures,
and offers restart after a successful profile change. The CLI remains available for
operators with a checkout and registry credentials. Native profile installation and
restart activation are verified on the local candidate recorded below; the in-App
update-button workflow has not yet had a separate end-to-end interaction readback.

| State | Meaning |
| --- | --- |
| Current | All installed plugins are at the latest compatible published version. |
| Updates available | One or more compatible plugin updates are published. |
| Updating | DSH native profile is installing the update. |
| Restart needed | Update installed; App restart required to load the new version. |
| Unavailable | A package lookup or compatibility check could not complete; its failure remains visible. |

The resolver selects the latest version compatible with the running DSH cohort. The
current UI does not separately list incompatible newer releases.

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
npm run manual:plugins -- remove --package @gaofeng21cn/opl-superagent
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
npm run manual:plugins -- remove --package @gaofeng21cn/opl-superagent
```

## Authority Boundary

| Concern | Owner |
| --- | --- |
| Plugin source, build, and publication | `opl-studio` |
| Composition test, receipt and exact build input | `opl-studio` CI (`release-plugin-composition-test.yml`) |
| DSH profile dependency resolution and locking | DSH native pnpm |
| Stable release entry, shell signing, and notarization | `one-person-lab-app` `release-stable.yml` |
| App version and release identity | `one-person-lab-app` |
| Incremental update user experience | `one-person-lab-app` (Shell renders the projected state) |

## opl-studio Implementation

**Status: publication, registry composition, exact build-input replay and local profile
activation verified.** The App Stable consumer is now wired to the exact build input. Public
Stable acceptance remains separate for candidates that have not used this admission path. The local source/profile lane and source UI are
implemented. The latest publication
[run 44051623044](https://github.com/gaofeng21cn/opl-studio/actions/runs/44051623044)
succeeded at Studio `a1d5c8352c1f247183ba25609c05a5e414f1ff01`. The current ten-package
combination contains `opl-studio-client` `0.1.3`; `opl-codex-agents`, `opl-host-core`,
`opl-superagent` and `opl-team-bots` `0.1.2`; and the remaining five packages `0.1.1`.

The native add command relies on scoped registry metadata, so public dependencies keep
their normal registry rather than being routed globally to GitHub Packages. The Codex
adapter and workbench entrypoints declare their pinned official DSH peers; the native
resolver reuses the carrier cohort when a profile-installed OPL package is linked into
the Superagent child profile. The private Superagent engine remains carrier-owned and
is an optional package-manager peer. The clean child-profile gate does not install a
second DSH runtime: it reuses the carrier cohort and engine.

The latest composition
[run 44052012220](https://github.com/gaofeng21cn/opl-studio/actions/runs/44052012220)
succeeded at the same Studio commit, with App product
`47187f01da29793dbd747d456170881b3ee54d1d` and DSH `0.2.2-rc.3`. Its receipt installs
the exact ten published versions, verifies registry origins, integrity and shipped
entrypoints, and passes the Host/Client and independent Superagent child-profile boot
tests outside the checkout. The child test uses only packed registry overrides and the
carrier-provided DSH cohort and engine.

The final local carrier verification on 2026-11-17 used App source
`b5f89a5e6c96b891ee9980e0f84295be8ee7400c` and Studio source
`fc3a2f2274fda2be5ae25ef01b15e107ddfe009e`.
The final `opl-studio` profile contains all ten exact registry overrides. The native
package manager removed and reinstalled those overrides in 6,434 ms, clearing the
experimental `dsh-llm` dependency closure; ordinary DSH dependencies required by the
published plugins remain profile-managed. Restart activated the official client graph
at revision `e93c66833b62` with five entries, including MCP Apps, Team and Superagent.
The carrier was `26.11.1791` (display
`26.11.17`, `local.srcbe99a0818922`); `app.asar` SHA-256 was
`3b95aa0e4a3075f1467517cacf91b3815e0046f15cb9f51c7e3c1e1c96464fdf` both before and
after the profile update. The App UI started Superagent and read its management API
with `state=running`, `executor=codex`, `error=null`, `teamDependency=false` and HTTP
200; `setup.problem=repositoryUnset` was the expected unconfigured-repository state.
The UI then stopped it with `state=stopped`, `error=null` and no workbench URL. The
installed Codex history readback returned 63 active threads without a next cursor.

Public Stable publication and ordinary-account clean-VM acceptance remain unverified.
Registry authentication uses the profile `.npmrc` with mode `0600`. Source ownership also
remains transitional outside the extracted shared contracts and Host update service; its
current boundary is recorded in [plugin composition and source ownership](../product/gui/plugin-composition-map.md#源码所有权与依赖方向).

### CI: `release-dsh-plugins.yml` (Track 1)

Triggers on push to main modifying plugin or shared build inputs, or manual dispatch
with `packages` / `force_all` inputs. Each run binds plugin builds to a selected App
product commit. Per-plugin matrix: build via `buildDshPlugins([name])`,
run the Host/Client and independent child-profile boot tests, then enter the package
directory and run `npm publish --provenance` to GitHub Packages. An already-published
version is skipped only when its tarball digest matches the selected built package;
the same version with different bytes fails publication. The package directory is
required because a positional `npm publish plugins/<name>` is parsed as a GitHub package
spec.

### CI: `release-plugin-composition-test.yml` (Track 2)

Triggers on manual dispatch or on successful completion of `release-dsh-plugins.yml`.
Resolves latest `^x.y.0` versions, installs the exact resolved registry packages into a
clean dependency graph, runs `dsh-plugin-packages.test.mjs` and
`dsh-child-profile-packages.test.mjs` against those bytes, and emits
`composition_receipt.json` plus the exact `dsh-plugin-composition-build-input`
archive as 90-day artifacts. Applying the receipt first
clears only the selected plugins' old local lock records and installed paths; this
prevents npm from retaining a same-version `file:` link. The workflow then verifies
non-linked package directories, exact package identities, registry tarball origins,
lock integrity and shipped entrypoints before the boot test. An unpublished or
DSH-incompatible package fails the run; the receipt never falls back to a local source
baseline.

### CI: `release-dsh-plugins-stable.yml` (Track 3 candidate lane)

Candidate build via manual dispatch or reusable workflow call; requires
`composition_receipt_run_id` (a successful Track 2 run).

Steps:
1. Download `composition_receipt.json` from that run
2. `node scripts/apply-composition-receipt.mjs --receipt composition_receipt.json`  
   — patches `package.json` plugin deps from `file:plugins/` to exact registry versions
   and removes only those plugins' prior local resolutions
3. Refresh the lockfile with `npm install --package-lock-only --ignore-scripts`, then run
   `OPL_DSH_REGISTRY_PLUGINS=1 npm ci`. The root prepare hook preserves the published
   plugins; dependency lifecycle scripts still prepare Electron and native modules.
4. `verify-composition-installation.mjs` checks the same registry-origin, integrity and
   shipped-entrypoint boundary as Track 2.
5. `npm run build:desktop:receipt` — builds desktop with `--registry-plugins`; published
   Host and Client plugins are left untouched while only the boot shell and unpublished
   Superagent engine are generated.
6. `electron-builder` packages, `qualify:desktop:distribution` validates
7. Uploads candidate DMG/ZIP/blockmap/feed YAMLs + `plugin-stable-provenance.json`

The resulting artifacts have the same structure as a full carrier candidate. This lane
remains useful for inspecting a shell-unchanged candidate. The production Stable lane
uses the App-side `--composition-run-id` admission described above so the exact tested
tarballs are installed in every platform build before signing, publication and final
readback.

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

The local operator lane, public publication, registry composition, local profile
installation and restart activation are verified at the commits and candidate above.
Receipt-backed Stable production, ordinary-account clean-VM acceptance, and the in-App
update-button workflow still need their own end-to-end readback. The product Client graph
is loaded through official DSH client modules; `engines.dsh` is declared in all publishable
plugin manifests, `cordis.yml` lists Host plugin names only, and DSH resolves active
Host/Client package versions at runtime.
