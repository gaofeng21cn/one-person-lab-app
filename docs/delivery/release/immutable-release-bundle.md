# Immutable Release Bundle

## Scope

The Framework Release Bundle freezes source and product inputs for one App Desktop release. It is
not a release controller, public mutation receipt, or currentness claim. Framework owns Bundle
identity, storage, checkpoints and operation receipts; App owns Desktop product policy, carrier
qualification and the GitHub executor.

The Bundle binds the exact App, Shell and Framework commits, release version, prepared notes,
Desktop platform selection, Standard inputs and any Full package closure. After freeze, newer remote
source does not invalidate the Bundle. Only bound-byte drift, qualification failure or explicit
security revocation invalidates it.

## Desktop Release Set

One Stable Bundle produces one public GitHub Release/tag:

1. macOS arm64 Desktop Standard is the primary release and Latest gate.
2. macOS arm64 Desktop Full may be appended to the same Release/tag.
3. Linux x64 Desktop may be appended to the same Release/tag.
4. Windows x64 Desktop may be appended to the same Release/tag.

Full, Linux, Windows and the universal installer are additional members of the same Desktop Release
Set. They do not derive another version, tag or Release. The macOS primary publication defines
whether the Stable version exists; additive delivery failures do not invalidate that version.
Each append is exact-name digest CAS and may not alter macOS Standard bytes, updater identity, notes,
release body or Latest.

The public manifests are owner-specific:

- `opl-app-component-manifest.json` binds the primary Desktop carrier and frozen installer;
- `opl-release-manifest.json` binds the same-tag Full DMG;
- `opl-desktop-platforms-manifest.json` binds same-tag Linux/Windows Desktop assets;
- `opl-release-attestation.json` binds publication and macOS trust evidence.

No independent Native WebUI tarball, WebUI qualification archive or WebUI installer is a Bundle or
Desktop Release asset. Docker WebUI has its own independent source authority, publication record,
qualification and GHCR namespace.

## Workflow Boundary

`.github/workflows/release-stable.yml` exposes `standard`, `resume_standard` and `append_full` only.
Lower-level workflows are reusable implementation details. The Standard operation receives its
version/cohort from protected admission, publishes the primary Desktop carrier, and activates Latest
only after exact qualification and public readback.

`.github/workflows/release-stable-post-success-followups.yml` consumes the exact successful Standard
checkpoint, appends selected Linux/Windows assets to that same mutable Release/tag, and dispatches the
one Full append. Its protected manual `repair_additive` branch may replace only `opl-install.sh` in
the same Release/tag after old asset ID/size/digest CAS and frozen primary-asset/body/tag checks. It
does not create a Framework Bundle operation, allocate a version, rebuild platform assets or move
Latest. `.github/workflows/release-post-publication-certification.yml` is a read-only consumer of the
completed same-tag Release Set and additive repair receipt.

Nightly and Windows Preview/RC are separate Preview policies and never become alternate Stable
Releases. Docker WebUI is also outside this Bundle control plane.

## Mutation Rules

Only protected publish jobs receive write permissions. For every asset name:

- absent: one upload is allowed;
- present with the same digest and size: accept as idempotent;
- present with different bytes: fail closed;
- present `opl-install.sh` with different bytes: only the protected additive repair branch may delete
  the exact old asset ID and upload the replacement, with pre-mutation and public receipts;
- timeout or unknown result: read-only reconcile, no repeated mutation.

Canonical source must be absorbed and remotely read back before public mutation. A Bundle,
checkpoint, candidate, task branch, test pass or workflow success is not a release terminal.

## Terminal Proof

A Stable macOS primary release is complete when owner-authoritative readback proves its signed,
notarized public assets and Latest identity. Additive deliveries converge independently in the same
Release Set. Overall release maintenance is closed only when owner-authoritative readback proves:

- canonical `main` commit/tree/blob and hosted gates;
- exact public asset names, sizes and SHA-256 values;
- `draft=false`, `prerelease=false` and expected Latest identity;
- public downloads match the recorded bytes;
- superseded temporary Releases/tags are exactly absent;
- task-owned temporary state, refs, worktree and lifecycle receipt are cleaned with `remaining=[]`.
