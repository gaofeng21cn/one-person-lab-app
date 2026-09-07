# Manual Latest App And Full DMG

These two operator lanes provide current development builds without entering the
formal Stable release control plane:

- `npm run manual:local-app` builds a Full App, safely replaces
  `/Applications/One Person Lab.app`, and relaunches it.
- `npm run manual:full-dmg` builds a distributable Full DMG.

Both commands use the same `opl_manual_latest_build_source_lock.v1` resolver.
When the repositories and upstream releases have not changed, the generated
`manual-latest-source-lock.json` is byte-identical for both lanes.

## Source Policy

First-party inputs come from each required clean canonical checkout. With an
`origin` remote, the resolver verifies fresh remote `main`, the fetched
`origin/main` and local `main` HEAD agree; without one it requires local `main`.
The source lock records the selected App, active Shell, Framework and package
owners. Dirty, detached or noncanonical inputs stop before building.

Temporal CLI and OfficeCLI come from their latest official stable GitHub
Release. MinerU OpenAPI uses the highest stable
`cli/mineru-open-api/v*` Git tag and the matching versioned official CDN binary,
because the project does not publish GitHub Release objects for that CLI. The
source lock records the exact MinerU tag commit, versioned URL, downloaded
SHA-256, and binary-reported version. Temporal is additionally checked against
its official `checksums.txt`. Local installed copies are never used as build
authority.

The Framework package catalog is projected only in a temporary checkout when a
first-party owner `main` is newer than Framework `main`. The canonical Framework
checkout is not changed, and the Full builder still runs its normal source
closure checks against the projected catalog.

### Freeze Currentness Cutoff

Manual Full and every Stable track read remote/current authority once at freeze
admission. That cutoff freezes the exact checkout commit and tree, source and
manifest bytes, task-local catalog/package projection, payload digests, and
prepared notes required by the track. The projection and all package identities
must be bound into `manual-latest-source-lock.json` or the immutable Release
Bundle digest.

After the cutoff, the owner stops fetching and does not chase a newer `main`,
tag, canonical catalog, or host installed/effective state. Later authority
advancement neither invalidates the cohort nor permits or requires a rebuild;
post-freeze checks compare only the frozen checkout/tree/bytes and their bound
digests. Canonical live catalog equality and host installed/effective currentness
are not prebuild conditions.

Installed/effective and clean-machine readback remain post-build artifact
qualification. These local builds do not select or move a public channel. For
protected publication and pointer operations, use the [release guide](README.md).

## Commands

Inspect and freeze the current inputs without building:

```bash
npm run manual:full-dmg -- --print-plan --out-dir /tmp/opl-manual-latest-plan
```

Build, install, and launch the local Full App:

```bash
npm run manual:local-app
```

Build the distributable Full DMG:

```bash
npm run manual:full-dmg
```

By default, versions are allocated from the current Asia/Shanghai date. For
example, `26.7.21` is the display/UI version and `26.7.2100` is the monotonic
Electron/updater version used by `app.getVersion()` and both CFBundle version
fields. A later formal `26.7.21-r1` build uses `26.7.2101`, so the manual App can
update forward through the normal updater.

Useful options:

- `--version <YY.M.D>` and `--updater-version <YY.M.D00>` override the bound
  version pair; the release contract validates the pair.
- `--no-launch` installs the local App without opening it.
- `--install-path <path.app>` changes the local App destination.
- `--out-dir <path>` changes the managed evidence or DMG directory.
- `--reuse-gui-vite-output` is an explicit optimization and should be used only
  when the cached Shell renderer was compiled for the same display version.

Normal builds use a sibling staging directory and replace the managed output
directory only after the App or DMG passes verification. A failed rebuild leaves
the previous successful output directory intact. Immediately before installing
the App or promoting the DMG, the command rechecks the frozen checkout trees and
bound bytes against the source snapshot. Frozen-byte drift fails closed; a later
remote-tracking `main` or tag advancement does not.

## Evidence And Boundary

Each successful lane writes:

- `manual-latest-source-lock.json`, binding exact repository SHAs, projected
  Framework catalog identity, upstream tags, digests, binaries, and versions.
- `manual-latest-build-receipt.json`, binding the lane, both version identities,
  source-lock SHA-256, and final output.

The local lane also writes `manual-local-app-installation.json`. It verifies the
staged App before stopping the installed App, uses a same-volume atomic rename,
retains a rollback copy until the new App starts, and restores the old App on a
failed replacement or launch. A previously installed Full App may contain
runtime-created Python bytecode below `__pycache__`, so its signature result is
recorded rather than used to reject replacement. Candidate, staged, installed,
and launched App bytes still pass strict deep signature verification. A failed
replacement writes a typed receipt below
`<cache-root>/failures/local-app/`, including the source lock, rollback outcome,
and whether a previously running App was restored and relaunched.

The Full lane runs the existing Full package gates and independently verifies
the final DMG before writing its success receipt. Its receipt records DMG size
and SHA-256 plus both Full manifests.

These lanes do not create a Release Bundle, Framework checkpoint, Git tag,
GitHub Release, Latest mutation, updater metadata, or Homebrew mutation. Their
receipts are not formal Stable admission or updater qualification evidence.

For protected preview publication and later cleanup, use the
[Manual Full preview handoff](manual-full-preview-handoff.md).
