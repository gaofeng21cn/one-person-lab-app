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

First-party inputs come from the clean `main` HEAD in each development
directory: App, active Shell, Framework, MAS, MAG, RCA, OMA, OBF, MAS Scholar
Skills, and OPL Flow. The command fails closed if one of those directories is
dirty, detached, or checked out on another branch.

Temporal CLI, OfficeCLI, and MinerU OpenAPI come from their latest official
stable GitHub Release. The command downloads the macOS arm64 asset into the
manual build cache and verifies the SHA-256 digest published by GitHub. Temporal
is additionally checked against its official `checksums.txt`. Local installed
copies are never used as build authority.

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
qualification. Promoting an exact Preview digest to Stable requires the same
qualification as a direct Stable and does not move Latest. A qualified Stable
takes or reclaims Latest by default; a separately protected single-use pointer
operation may instead select any exact published Stable or Preview while
preserving its quality. The selection must resolve a retained
`carrier_owned_durable_publication_record` that binds the carrier namespace,
exact version/tag, immutable artifact/image digest, quality classification,
qualification disclosure, and public readback. An Actions artifact is
prepublication transport or diagnostic evidence only and cannot make a version
selectable after it expires. A Preview selection discloses non-Stable and
skipped or failed gates; a Stable selection proves stable qualification and has
no non-Stable disclosure. A cohort can be invalidated only by a frozen byte,
tree, or digest mismatch; an artifact build or integrity failure; or an
explicit security revocation bound to a frozen ref or digest.

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

## Protected Preview Handoff

The Manual Full builder remains non-mutating. A separate successor may publish
its exact output as a temporary GitHub prerelease only through
`.github/workflows/release-manual-full-preview.yml` after the Manual Full owner
returns a `MANUAL_USABLE_DELIVERED` callback. No placeholder Release, tag, or
asset may be created before that callback.

The settings owner first provisions one dedicated absolute handoff root as the
repository Actions variable `OPL_MANUAL_PREVIEW_INGRESS_ROOT` and records an
independent settings receipt. Each invocation uses a fresh 32-character
lowercase hexadecimal nonce and places the handoff at exactly
`$OPL_MANUAL_PREVIEW_INGRESS_ROOT/<nonce>`. The workflow accepts no operator
path. All entries must be non-empty regular files, with no symlink or extra
file.

For `operation=publish`, the directory contains exactly these eight public
assets:

- `One-Person-Lab-Full-<version>-mac-arm64.dmg`
- `full-package-manifest.json`
- `manual-full-host-qa-receipt.json`
- `manual-full-m1-delivery-receipt.json`
- `manual-full-preview-manifest.json`
- `manual-latest-build-receipt.json`
- `manual-latest-source-lock.json`
- `opl-release-manifest.json`

`manual-full-preview-manifest.json` uses
`opl_manual_full_preview_manifest.v1`, sets `operation` to `publish`, and binds
the other seven files as a sorted array of exact `name`, `size_bytes`, and
lowercase `sha256` values. It also binds `display_version`,
`source_lock_sha256`, the deterministic preview tag, and the exact warning text
from the release contract. The workflow input binds the manifest file's own
SHA-256.

`manual-full-host-qa-receipt.json` uses
`opl_manual_full_host_qa_receipt.v1`, with `status=passed`,
`qualification=minimum_host_qa`, the display version, source-lock digest, and
the exact DMG identity. `manual-full-m1-delivery-receipt.json` uses
`opl_manual_full_m1_delivery_receipt.v1`, with
`status=MANUAL_USABLE_DELIVERED`, and binds the exact source lock, DMG, build
receipt, Host QA receipt, Full package manifest, and public release manifest.

The resulting tag is
`manual-full-preview-<YY.M.D>-m1-<source-lock-sha256-first12>`. It is
published as a Manual Dev Preview with `make_latest=false`; this publisher does
not make it updater-visible. A separate protected single-use pointer operation
may temporarily select the exact published tag and digest through
expected-current CAS plus public readback. That operation keeps the artifact
Preview, discloses non-Stable and skipped gates, and changes neither updater
metadata nor Homebrew. The published Release notes state that minimum Host QA
has passed, M2 clean-VM/full qualification is pending, and Stable, automatic
update, Latest, updater metadata, Homebrew, and the Standard checkpoint are
unchanged by publication.

## Preview Cleanup Handoff

Cleanup uses a new nonce and a new `manual-full-preview-manifest.json` with
`operation=cleanup`. The handoff directory contains exactly that manifest plus:

- `manual-full-m2-qualification-receipt.json`
- `stable-append-full-readback-receipt.json`

The M2 receipt uses `opl_manual_full_m2_qualification_receipt.v1`, records
`status=standard_qualified`, binds the same preview tag and source-lock digest,
binds the exact Framework Bundle digest, Full DMG, and
`opl-release-manifest.json`, and records passed clean-VM/full qualification plus
completed builder cleanup.
The Stable receipt uses
`opl_manual_preview_stable_append_full_readback.v1`, records `status=verified`,
and binds the same Framework Bundle digest, formal Stable tag, same source lock,
published-Latest Standard readback, published `append_full` readback, updater
metadata readback, and the exact sorted Stable asset identities: all six
Standard assets, the Full DMG, and `opl-release-manifest.json`.

The protected executor independently verifies that the formal Stable Release is
published, non-prerelease, Latest, and has the bound Full and updater assets.
Only then may it delete the preview Release and preview tag. It performs double
absence readback and repeats the formal Stable readback after cleanup. A failed
or unknown cleanup never changes the formal Stable Release.
