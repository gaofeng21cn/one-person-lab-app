# Manual Full Preview Handoff

This runbook owns the protected publication and cleanup handoff for a locally
built Manual Full preview. Build and local installation commands are documented
in [manual-latest-builds.md](manual-latest-builds.md); Stable operations remain in
the [release guide](README.md). A manual build receipt does not itself authorize
publication or pointer changes.

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
