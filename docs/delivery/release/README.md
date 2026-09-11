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

## Release acceleration

After Standard publication and public readback, the same run calls the Stable follow-up hub.
Full, Linux, Windows and Homebrew follow-up lanes do not wait for the whole
Stable workflow to finish. Docker operations use their independent workflow.
The completion event is observation-only.
Manual reconciliation still selects one exact lane and retains its existing owner and asset CAS.
A checkpoint alone cannot authorize an append before its Standard Release is public.

Large already-compressed release artifacts use uncompressed Actions transport. Full continues to
consume content-bound runtime caches; cache hits never replace artifact qualification. Model policy
rejection tests bind a stable error code instead of human-readable diagnostic wording. Framework's
`npm ci` owns its `prepare` build, so Full does not compile the same CLI a second time. Submitted
Apple recovery DMGs stay in the dedicated recovery artifact instead of duplicating them in the
normal Full package transfer.

Clean-VM input preparation runs beside the macOS build: it checks the Tart source inventory and
prefetches Codex tarballs from the frozen qualification manifest. This creates no VM and uses no
Gateway credentials. The final VM gate revalidates tarball digests against the built artifact cohort;
a missing preparation result takes the normal fetch path. Runtime stage and Apple observation logs
report real events, without inferring progress from elapsed time.

## Stable Operations

The online notes writer uses the contracted Gateway route with low reasoning
effort and a 300-second response deadline. Synchronous Chat Completions returns
the complete document at once; the deadline must cover generation, not only
connection establishment. The qualification probe uses the same endpoint,
credential and current `gpt-5.6-luna` model with low reasoning as Stable
preparation, with a shorter 75-second deadline and no legacy-model fallback. A short probe proves
connectivity; only validated full notes prove that preparation succeeded.

`npm run release:stable-dispatch` is the only operator entry for a Stable release. It resolves and
validates the checkpoint, original artifact producer, qualification run, verification harness,
cohort, source gate, operation identity and active owner before invoking the protected workflow at
most once. `.github/workflows/release-stable.yml` is the mutation sink, not an operator API; do not
fill its Stable inputs manually or rerun it from the GitHub UI.

The controller exposes these commands:

```bash
npm run release:stable-dispatch -- new-product-release --product-change-summary <summary> [--reuse-standard-run-id <failed-run>] --execute
npm run release:stable-dispatch -- publish-qualified-standard --run-id <standard-run> --execute
npm run release:stable-dispatch -- append-full --source-run-id <checkpoint-run> --execute
```

Omit `--execute` for a read-only plan. The command never accepts a version: only
`new-product-release` may ask the workflow to allocate one, and it requires an explicit nonempty
user-visible product change summary. `--reuse-standard-run-id` continues the same unpublicized Stable
version with the failed run's already signed and notarized Standard bytes, while a new workflow
operation may contain release-path fixes. `publish-qualified-standard` and `append-full` preserve the
source checkpoint tag. For Full, `append-full` follows the complete recovery chain, binds a published or active owner when one
exists, otherwise reuses the newest non-expired Full checkpoint whose App, Shell and Framework content
SHAs exactly match the requested Full cohort. A mismatch falls back to the original Standard checkpoint
and builds new Full bytes. An exact `--smoke-harness-ref <sha>` may requalify unchanged Full checkpoint
bytes without rebuilding them. One controller attempt makes at most one workflow mutation. If the
dispatch result is unknown, the controller performs read-only reconciliation and never retries it.

The three Framework-backed workflow mutation operations remain exactly:

- `standard`: build, qualify and publish the primary macOS arm64 Desktop release;
- `resume_standard`: reconcile the same admitted Standard operation without a second mutation;
- `append_full`: append Full macOS bytes to the same exact Release/tag.

The protected workflow separately exposes `entry=studio_carrier_admission`, a plan-only source admission for the candidate
Studio Electron carrier. It requires an exact `gaofeng21cn/opl-studio` commit, tree and tag, runs in
the App-owned `release-stable` environment with read-only permissions, and writes
`opl_studio_protected_release_admission.v2`. It does not map protected secret values into the job,
create a Framework release operation, submit to Apple, mutate a GitHub Release, change the active
shell, or make Studio the active release carrier.

An admitted Studio plan runs as four independently recoverable layers: a Developer ID signed and
notarized byte checkpoint, local distribution qualification, a thin protected GitHub Release
mutation, and an unlocked public readback. `prior_studio_artifact_run_id` restores the last successful
checkpoint and, when available, its qualification receipt; the current run re-materializes those
bytes as its own recovery point before continuing. A release or readback failure therefore does not
rebuild, re-sign, re-notarize, or allocate another product version. Same-tag repair may replace only
the dedicated Studio assets after the tag target and source identities are revalidated. The
publication mutex is held only by the `publish` job; build, qualification and public readback never
hold it. Apple signing credentials are read only by the build layer, the dedicated GitHub token only
by publication, and public readback uses no protected environment. None of these stages adopts
Studio as the active shell or active Framework release carrier.

`.github/workflows/release-diagnostics.yml` is a separate manual or reusable verification
entry. It may build a temporary Standard diagnostic artifact and run the first-run VM harness, but
it has only `actions: read` / `contents: read` permissions and cannot publish, promote, move Latest,
or authorize Stable. A Standard VM run requires the exact 40-character Framework SHA so the existing
VM workflow can inject a local source archive instead of resolving mutable `main` anonymously.

Linux x64 and Windows x64 are selected as `desktop_additional_platforms`. A successful Standard
publication is already terminal without either platform or Full. Its thin follower starts one
independent `fail-fast: false` lane per selected Desktop platform; each lane builds only that platform
and briefly acquires the public mutation mutex only while appending its assets and aggregate manifest
to the same Release/tag. A failed Linux lane can therefore be reconciled without rebuilding Windows,
and vice versa. Full is reconciled independently by
`.github/workflows/release-stable-post-success-followups.yml`: it consumes the successful Standard handoff,
delegates desired-state resolution to the canonical controller, and exits after binding or dispatching
one owner without waiting for Full completion. Either follower may fail or be repaired without
rerunning Standard, the other platform, or Full, and without changing the release version. The append
script performs exact release/tag identity checks and same-name digest CAS. It cannot create a
Release/tag or move Latest.

If an additive delivery is defective while the macOS primary release remains valid, the Stable
version stays unchanged. The protected `repair_additive` branch in that same follow-up workflow may
replace only `opl-install.sh`. It requires the original successful Stable source run, canonical repair
source, old asset ID/size/digest CAS, frozen macOS DMG/ZIP/blockmap and updater YAML digests, frozen
Release body and tag target, a pre-mutation Actions receipt, and a public supersession receipt. Linux,
Windows, Full and macOS primary assets are not rebuilt. A new `-rN` Stable is allowed only when the
user has explicitly requested a new product version with a nonempty user-visible capability change.
Build, signing, notarization, packaging, publication, release-note, Homebrew, Full, installer or
platform-only repair must stay on the existing mutable tag, including replacement of primary assets
through the protected exact-current-identity CAS path.

Post-publication Desktop certification consumes the completed Desktop append without waiting for
Full. Linux installs the exact public `.deb` through the exact public installer; macOS Standard checks
are read-only.
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

## Publication and recovery

Use the controller's admitted immutable candidate and the protected mutation job.
Each upload compares exact name, size and digest; same bytes are idempotent and
conflicting bytes require the contract's protected repair path. Never turn a
historical migration's delete sequence into routine release instructions.

Unknown or timed-out outcomes require owner-authoritative readback before any
further mutation. Source integration and task cleanup follow the repository's
Git instructions; this guide does not define a second worktree lifecycle.

Local development builds use [manual-latest-builds.md](manual-latest-builds.md).
Their separately protected preview publication and cleanup use the
[Manual Full handoff](manual-full-preview-handoff.md).

## Docker WebUI

`.github/workflows/release-webui-development.yml` is the only operator entry for independent Docker
WebUI operations. Select `operation=qualify|publish|promote`; `publish` creates an exact Stable or
Preview version bound to an OCI digest and durable GHCR publication record, while `promote` consumes
that record:

- `move-docker-stable-and-latest:<version>` moves `:stable` and `:latest` once;
- `move-docker-latest:<version>` moves only `:latest` once.

Both routes bind an independent source authority, exact OCI digest, runtime qualification and
anonymous readback. Desktop Stable run ids, production follower recovery and transient carrier
artifact selection are not accepted authority.

The WebUI workflows do not serialize source admission, native multi-architecture build,
qualification, canary, or public readback. `opl-webui-independent-publication-global` belongs only to
`_release-webui-carrier.yml#publish-immutable-carrier`, and
`opl-webui-stable-promotion-global` belongs only to
`release-webui-stable.yml#promote-webui-stable`. A failure before either mutation job can be retried
without waiting for or blocking an unrelated public writer.

## Completion

Completion requires canonical source readback, local and hosted gates, exact public inventory and
download hashes, Latest/flags, exact absence of temporary Releases/tags, and cleanup of task-owned
temporary files, refs, worktree, lifecycle receipt, holders and locks with `remaining=[]`.
