# OPL App Release Guide

## Authority

Product and installation semantics live in
[`../distribution-and-install-ssot.md`](../distribution-and-install-ssot.md).
Machine policy lives in `contracts/app-release-channel.json`; Framework owns the content-addressed Bundle,
checkpoint and operation receipt identity. This guide describes the App executor only.

The public App release product is Desktop. A Stable version becomes valid when its signed and
notarized macOS arm64 primary release passes publication and public readback. The same mutable GitHub
Release/tag then receives Full macOS, Linux x64, Windows x64 and installer deliveries additively.
Independent WebUI archives, qualification archives and follower Releases are retired.
Docker WebUI is a separate GHCR product line and never consumes Desktop Stable authority.
It is a manual, non-blocking additional release line. The default `qualify` operation builds and
runs `linux/amd64` and `linux/arm64` on native GitHub runners without registry mutation, including
same-volume container restart and state readback. The separately protected `publish` operation may
create one OCI index only when both platform qualifications pass. Neither operation is part of
PR/main CI or blocks the primary macOS arm64 Desktop release.

## Stable Operations

`npm run release:stable-dispatch` is the only operator entry for a Stable release. It resolves and
validates the checkpoint, original artifact producer, qualification run, verification harness,
cohort, source gate, operation identity and active owner before invoking the protected workflow at
most once. `.github/workflows/release-stable.yml` is the mutation sink, not an operator API; do not
fill its Stable inputs manually or rerun it from the GitHub UI.

The controller exposes these commands:

```bash
npm run release:stable-dispatch -- standard --execute
npm run release:stable-dispatch -- resume-standard --run-id <standard-run> --execute
npm run release:stable-dispatch -- append-full --source-run-id <checkpoint-run> --execute
npm run release:stable-dispatch -- recover-full --run-id <failed-full-qualification-run> --execute
```

Omit `--execute` for a read-only plan. The command never accepts a version: only `standard` lets the
workflow allocate one new version, while resume, append and recovery preserve the source checkpoint
tag. One controller attempt makes at most one workflow mutation. If the dispatch result is unknown,
the controller performs read-only reconciliation and never retries the mutation.

The three Framework-backed workflow mutation operations remain exactly:

- `standard`: build, qualify and publish the primary macOS arm64 Desktop release;
- `resume_standard`: reconcile the same admitted Standard operation without a second mutation;
- `append_full`: append Full macOS bytes to the same exact Release/tag.

The protected workflow separately exposes `entry=studio_carrier_admission`, a plan-only source admission for the candidate
Studio Electron carrier. It requires an exact `gaofeng21cn/opl-studio` commit, tree and tag, runs in
the App-owned `release-stable` environment with read-only permissions, and writes
`opl_studio_protected_release_admission.v1`. It does not map protected secret values into the job,
create a Framework release operation, submit to Apple, mutate a GitHub Release, change the active
shell, or make Studio the active release carrier.

An admitted Studio plan fixes this fail-closed order: exact checkout, Developer ID signed build,
Apple notarization, App/DMG staple and Gatekeeper validation, exact-tag publication to the dedicated
`opl-studio` GitHub Release, anonymous byte readback, then Studio's
`qualify:desktop:mac:release`. Any failed or unknown stage blocks every later stage. The admission
receipt is source evidence, not publication authority; protected execution still requires the exact
receipt identity, an environment reviewer, explicit user approval, and capability preflight before
the first external mutation. Apple and GitHub credentials remain only in the App protected
environment and must never be copied into Studio repository secrets.

`.github/workflows/desktop-release-diagnostics.yml` is a separate manual or reusable verification
entry. It may build a temporary Standard diagnostic artifact and run the first-run VM harness, but
it has only `actions: read` / `contents: read` permissions and cannot publish, promote, move Latest,
or authorize Stable. A Standard VM run requires the exact 40-character Framework SHA so the existing
VM workflow can inject a local source archive instead of resolving mutable `main` anonymously.

Linux x64 and Windows x64 are selected as `desktop_additional_platforms`. The successful Standard
path dispatches `.github/workflows/release-stable-post-success-followups.yml`, which builds and
appends those Desktop assets to the same Release/tag and then dispatches Full append once. The
append script performs exact release/tag identity checks and same-name digest CAS. It cannot create
a Release/tag or move Latest.

If an additive delivery is defective while the macOS primary release remains valid, the Stable
version stays unchanged. The protected `repair_additive` branch in that same follow-up workflow may
replace only `opl-install.sh`. It requires the original successful Stable source run, canonical repair
source, old asset ID/size/digest CAS, frozen macOS DMG/ZIP/blockmap and updater YAML digests, frozen
Release body and tag target, a pre-mutation Actions receipt, and a public supersession receipt. Linux,
Windows, Full and macOS primary assets are not rebuilt. A new `-rN` Stable is allowed only when the
macOS primary Stable assets themselves are invalid.

Post-publication certification consumes the completed same-tag Desktop Release Set. Linux installs
the exact public `.deb` through the exact public installer; macOS Standard/Full checks are read-only.
After an installer repair, certification additionally binds the public receipt and old/new installer
digest chain, then repeats the clean Linux install without re-running macOS primary qualification.
Certification failure records evidence but cannot roll back or rewrite the public Release.

## Local Gates

Before pushing a task ref or touching a public Release, run the locally reproducible gates:

```bash
npm run typecheck
actionlint <changed-workflows>
npm run validate:release-boundary
npm run validate:active-shell
npm run test:release-boundary
git diff --check
```

Use the first real failure as the repair point. A green local suite is only source evidence; it does
not authorize public mutation.

## Canonical Integration

Fetch `main` and wire refs immediately before integration. Replay the intended semantics onto fresh
`origin/main`, rerun affected gates, push the task ref, and read back its commit/tree/blob. Absorb by
ordinary non-force update to canonical `main`, then repeat remote commit/tree/blob/raw readback.
Public release mutation starts only after canonical source and hosted non-release gates are proven.

## Public Mutation

For an existing Stable Release migration:

1. Read the owner API and freeze the exact release id, tag, asset inventory and draft/prerelease state.
2. Download source assets to a task-owned temporary directory; record name, byte size and SHA-256.
3. Before each upload, compare the target asset name. Missing is writable, same bytes are idempotent,
   and same name with different bytes is a conflict except for the protected `opl-install.sh` repair
   path described above.
4. Append Desktop assets first; fresh-read the target inventory.
5. Delete only the exact superseded asset ids authorized for this migration.
6. Verify every public download by size and SHA-256, plus Latest and release flags.
7. Only then delete the superseded Release and tag.

Unknown or timed-out mutation outcomes permit owner-authoritative read-only reconciliation only. Do
not rerun a workflow, repeat an upload/delete, alter settings/secrets, or guess success.

## Docker WebUI

`.github/workflows/release-webui-development.yml` publishes an independent Docker Stable or Preview
immutable version plus a durable GHCR publication record. `.github/workflows/release-webui-development-promote.yml`
consumes that record:

- `move-docker-stable-and-latest:<version>` moves `:stable` and `:latest` once;
- `move-docker-latest:<version>` moves only `:latest` once.

Both routes bind an independent source authority, exact OCI digest, runtime qualification and
anonymous readback. Desktop Stable run ids, production follower recovery and transient carrier
artifact selection are not accepted authority.

## Completion

Completion requires canonical source readback, local and hosted gates, exact public inventory and
download hashes, Latest/flags, exact absence of temporary Releases/tags, and cleanup of task-owned
temporary files, refs, worktree, lifecycle receipt, holders and locks with `remaining=[]`.
