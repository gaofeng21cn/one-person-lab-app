# OPL App Release Guide

## Studio Stable cutover

The active adapter selects `gaofeng21cn/opl-studio`; all release checkouts,
package managers, smoke harnesses, and build commands are resolved from the
frozen App adapter. Stable packages use `electron-builder.stable.yml` and retain
`cn.onepersonlab.opl`, `One Person Lab`, and the existing App release repository.
The release controller supplies the calendar display version and monotonically
increasing updater version separately.

The existing App feed delivers the replacement to AionUI-based installations.
Studio Preview requires its identity-preserving terminal bridge release before
it hands off to the Stable feed. Both source populations must be qualified with
actual packaged update installation and data continuity; clean installation or
source checks do not prove migration. macOS signed distribution validation runs
before upload and checks the ZIP, app identity, publisher, Gatekeeper acceptance,
and the real updater replacement path.

Windows retains the existing NSIS upgrade identity; existing Framework and Codex
runtime discovery must continue through the App-owned WSL execution contract.
Linux retains Debian package `one-person-lab` and publishes `latest-linux.yml`
bound to the exact DEB and updater version. Older Linux releases exposed DEBs
without that feed, so their availability alone is not evidence of a working
automatic update. Desktop add-on manifests preserve read compatibility with
historical DEB-only receipts while new Studio publication requires the feed.


For operator sequencing, monitoring, recovery decisions and closeout, start with the
[release paths and matrix](release-paths.md) and [release SOP](stable-release-sop.md). This guide is the technical reference; the
[release Skill](../../../skills/opl-app-release/SKILL.md) routes to that same SOP.

## Authority

Product and installation semantics live in
[`../distribution-and-install-ssot.md`](../distribution-and-install-ssot.md).
Machine policy lives in `contracts/app-release-channel.json`; Framework owns the content-addressed Bundle,
checkpoint and operation receipt identity. This guide describes the App executor only.

The public App release product is Desktop. A Stable version becomes valid when its signed and
notarized macOS arm64 primary release passes publication and public readback. The same mutable GitHub
Release/tag then receives Full macOS, Linux x64, Windows x64 and installer deliveries additively.
Independent WebUI archives, qualification archives and follower Releases are retired.
Docker WebUI is a separate GHCR carrier of the same Stable App/Framework cohort and date
version. Stable automatically qualifies both `linux/amd64` and `linux/arm64`, including
same-volume restart and state readback, then publishes the immutable OCI version and promotes
`:stable` and `:latest`. Its failure does not block the primary macOS publication, but a complete
matrix delivery includes Docker publication and pointer readback. The manual workflow remains
available for qualification, explicit Preview publication and same-version recovery. These
publication operations are not part of PR/main CI.

## Release acceleration

Standard checks the dedicated Gateway account during protected admission; a fresh Full append
checks it before dependency preparation and packaging. These checks use temporary private files
and the existing credential bridge. Both final clean-VM lanes still perform real account login. The transient Tart guest inherits
the runner Node process's system and default public CA certificates through process-scoped
`NODE_EXTRA_CA_CERTS` and `SSL_CERT_FILE`. The harness records the bundle digest and keeps TLS
verification enabled; it does not alter the source VM or product bytes. The caller verifies that
the guest launch environment preserves both CA paths and still removes TLS-disable overrides
before allocating a VM.

Preview VM qualification also probes the runner Node TLS path using this same temporary CA bundle
before downloading either public DMG. Missing runner trust or a failed Gateway TLS handshake now
fails at the small input stage; the installed App still performs the real Gateway login in each VM.

The Studio Preview clean-VM turn follows `successor_delivery_target.public_clean_vm_qualification.codex_turn_policy`
in `contracts/app-release-channel.json`: it proves provider connectivity, accepting either a real
completed turn or a structured `INSUFFICIENT_BALANCE` response. Generic authorization errors,
transport failures, timeouts, missing turn identities and simulated turns fail. This policy does
not require model generation from the release account. Standard first-install qualification checks
real account login, Official Profile convergence and Codex readiness without requiring a funded
model turn. Apply each lane's actual contract rather than transferring Preview turn requirements
to every release or treating account balance as a packaging defect.

Source checks and artifact construction run concurrently. The reusable build summary rejects
any required check that failed, was cancelled, skipped or is missing, even when packaging succeeded.
Full hosted package verification and clean-VM qualification run concurrently on the same built
artifact; the checkpoint becomes `full_qualified` only after both pass. Publication keeps its
existing checkpoint, signature, notarization and digest gates.

Stable Windows builds select the contract's `stable_desktop_additional` command with
`--win nsis`: only the EXE and updater sidecars are published. Do not generate and then
delete the unused ZIP. Manual builds retain their general Windows targets.

Incident snapshots use cache-bypassed GitHub reads. Five minutes without observable change
requires inspection, not cancellation: active-job REST logs can be unavailable, and the web
log viewer virtualizes its visible range. Feed captured runner/current-job logs through
`npm run release:incident-status -- --run-id <run> --job-id <job> --job-log-file <file>`.
Bind the file to that run's job, inspect the latest actual stage and prefer the newer of
step state and log timestamps. A heartbeat is not progress. Cancel or recover only after
establishing a real failure, the current owner state and the smallest recovery scope.
See the [v26.9.15 timing and recovery retrospective](incidents/2026-09-15-release-efficiency.md).

Release-note preparation tries the contracted fallback model when the preferred model fails or
returns no public text. Both paths use the same evidence and semantic validation; empty responses
never count as prepared copy.
Each model gets one transport attempt with a 180-second request limit. Safe model/attempt status
and elapsed time are logged without prompts, credentials or response bodies.

After Standard publication and public readback, the same run calls the Stable follow-up hub.
Full, Linux, Windows and Homebrew follow-up lanes do not wait for the whole
Stable workflow to finish. The Stable workflow also runs the Docker source, carrier and
promotion jobs; their publication and recovery remain independent of Desktop asset mutation.
The completion event is observation-only.
Manual reconciliation still selects one exact lane and retains its existing owner and asset CAS.
A checkpoint alone cannot authorize an append before its Standard Release is public.

The exact-artifact downloader accepts canonical relative file paths, including the bound Standard
`assets/` directory, while rejecting traversal, file/directory conflicts and symlink destinations.
It validates the cached archive size and digest before extracting any bytes. Its exact source is
bound to the Stable operation identity, so a transport repair admits a fresh recovery operation
while historical controls remain readable for signed-artifact reuse.

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

The online notes writer follows `public_release_notes.preferred_ai_route` in the release
contract: `deepseek-flash`, then `gpt-6-luna`, low reasoning, one transport attempt per model,
and a 180-second per-attempt response deadline. Synchronous Chat Completions returns the
complete document at once; the deadline must cover generation, not only connection
establishment. A short provider probe proves connectivity; only validated full notes
prove that preparation succeeded.

Public bodies follow `public_release_notes.public_body_language`. The AI writer generates the
hidden `en-US` and `zh-CN` blocks, and its validator rejects Chinese in the visible English body.
Automated Nightly notes are deterministic instead, so they copy component commit subjects only when
those subjects are written in English; the rest are left out of the body with no operator-facing
notice, stay readable in `nightly-notes-evidence.json`, and never block publication. Commit subjects
in the App, Shell, Framework, and Studio repositories are authored in English; subjects already
recorded in another language stay in history as they are. Republish a body that still violates the
boundary in place under the same tag with unchanged assets, then read it back.

`npm run advisory:commit-language` prints the same read-only scan on demand, and the weekly
`commit-message-language-advisory` workflow reports it through its run summary. Both are advisory:
they never gate a release.

`npm run release:stable-dispatch` is the only operator entry for a Stable release. It resolves and
validates the checkpoint, original artifact producer, qualification run, verification harness,
cohort, source gate, operation identity and active owner before invoking the protected workflow at
most once. `.github/workflows/release-stable.yml` is the mutation sink, not an operator API; do not
fill its Stable inputs manually or rerun it from the GitHub UI.

Stable admission and dispatch reconciliation are scoped to the Desktop publication in
`gaofeng21cn/one-person-lab-app`. Studio Standard and Full share the protected workflow entry,
but publish to `gaofeng21cn/opl-studio` and use their own publication mutex. Their active runs
must neither block Desktop admission nor be mistaken for its dispatched owner. The shared
workflow's declared run names identify these operations; unknown entries remain blocking.

The controller exposes these commands:

```bash
npm run release:stable-dispatch -- new-product-release --product-change-summary <summary> [--reuse-standard-run-id <failed-run>] --execute
npm run release:stable-dispatch -- publish-qualified-standard --run-id <standard-run> --execute
npm run release:stable-dispatch -- append-full --source-run-id <checkpoint-run> --execute
```

Omit `--execute` to prepare a plan without dispatching a workflow. Planning can still
prepare local candidate checkouts and run source gates; use `release:incident-status` for
a lightweight current-run read. The command never accepts a version: only
`new-product-release` may ask the workflow to allocate one, and it requires an explicit nonempty
user-visible product change summary. `--reuse-standard-run-id` continues the same unpublicized Stable
version with the failed run's already signed and notarized Standard bytes, while a new workflow
operation may contain release-path fixes. Standard artifact recovery also accepts `--smoke-harness-ref <exact-opl-aion-shell-sha>` to run a repaired
verification harness against the original signed bytes; the controller resolves it in the Shell repository before dispatch, and the controller itself participates in the operation identity; this override requires `--reuse-standard-run-id`.
Recovery verifies the original source-gate bytes against their run-bound control and reuses that passed
exact-cohort evidence, so advancing owner checkouts does not repeat unchanged source tests.
When a failed run has no signed artifact yet, `--source-gate-run-id <failed-run>` reuses only its
authenticated, exact-cohort source gate. The repaired workflow still builds and qualifies the product;
this option neither reuses a failed acceptance nor authorizes another consumer of the same operation.
With an explicit repaired harness, an interrupted failed qualification may be run again even if its
old classifier called it a product failure. A recorded pre-install artifact-download failure may also reuse signed bytes after the recovery job
reconciles the original run, Bundle, notarization receipt, and both downloaded DMG hashes. Other
infrastructure failures remain blocked. Signed-byte identity and scope proof still must match;
the failed acceptance is never reused and a fresh clean-VM qualification remains mandatory.
Account-login qualification waits for actual Codex model-access readiness after confirmation, and records
at most one retry of a settled session failure through the same visible confirmation action.
The Gateway account preflight enables Node's system CA trust store on the macOS runner,
preserving certificate verification when the runner's trusted network CA is absent from Node's bundled roots.
Scope proof runs from the immutable current workflow executor while comparing the exact artifact
and verification refs. Tart host mechanics are harness scope; unchanged semantic and probe digests
remain mandatory. The clean-VM workflow participates in the operation fingerprint, so repairing qualification creates
a fresh operation without rebuilding the frozen product. Historical controls remain readable for
artifact recovery; new executor admission requires the complete workflow binding set.
On first launch, failed background maintenance receives one automatic retry after core readiness.
This reuses the desktop maintenance owner and prevents an early plugin-discovery failure from
permanently skipping managed companions. Successful or still-running maintenance is not duplicated.
When a publication attempt persists an unknown GitHub outcome, continue with
`publish-qualified-standard --run-id <run> --source-artifact opl-release-standard-published-<run>`.
This preserves the unknown marker for owner-authoritative reconciliation before any new mutation.
`publish-qualified-standard` and `append-full` preserve the
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

Use the [SOP candidate preparation](stable-release-sop.md#2-准备一次准确候选) to select the
checks required by the actual change and current contract. Reuse still-valid exact-candidate
results; do not rerun a complete preflight merely because a task ref is being pushed or a
controller dispatch follows. A green local suite proves source checks, not publication.

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
that record. Stable `publish` already invokes promotion on success; do not repeat it:

- `move-docker-stable-and-latest:<version>` moves `:stable` and `:latest` once;
- `move-docker-latest:<version>` moves only `:latest` once.

Both routes bind a WebUI source authority, exact OCI digest, runtime qualification and anonymous
readback. The automatic Stable route creates that authority from its frozen cohort; a bare Desktop
run ID is insufficient. Manual recovery can reuse exact qualified artifacts through
`qualified_artifact_run_id`, with their source authority verified. Promotion consumes the durable
GHCR publication record rather than treating a transient artifact as publication authority.

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
