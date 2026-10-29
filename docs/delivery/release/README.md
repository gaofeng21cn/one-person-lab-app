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

Studio images default to the non-root `node` user. The legacy-volume qualification first invokes
the image entrypoint once as root to repair App data ownership, preserving ownership of existing
project files. It then starts and restarts the normal non-root host and verifies its actual UID.

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

Full append admission now runs a small deterministic preflight before Full packaging or VM
runner work. It verifies the exact MAS Scholar Skills commit and, when a recovery supplies a
different App or Shell harness, proves that the changed paths are eligible for same-artifact
reuse. A bad ref or an unauthorized harness fails in admission within seconds; the final VM
qualification repeats the scope proof and remains authoritative. This removes repeated 7–10
minute Full attempts that previously failed only after reaching the VM lane.

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

Standard freeze resolves Codex once and shares the exact dependency artifact with the build and optional VM preparation. Artifact cohorts bind that resolved manifest. Standalone/platform builds resolve their own native Codex input; WebUI maps OCI amd64 to Framework x64 and resolves only Codex. Framework source resolvers require their lockfile dependencies before invocation, including the independent Full build.

Studio payload environment preserves both controller-provided display and updater versions. The package version is only a fallback for local builds; it must not overwrite the display version used in public asset names.

Prequalified WebUI publication preserves the original source authority release bundle/cohort fields, falling back to its authority digest only for independent source qualification. Re-dispatching publication must not rebind qualified image labels to a different build identity.

Docker promotion distinguishes original qualification authorization from the exact publishing workflow. Stable qualification may be published through the dedicated WebUI recovery entry; run, branch, repository, attempt, executor and successful publisher job bindings remain required.

## Stable Operations

The legacy Full notes authority helper consumes an operation-resolved Codex qualification manifest via `--resolved-qualification-manifest` or `OPL_RELEASE_DEPENDENCY_MANIFEST`. It records the manifest digest and refuses missing or mismatched package/platform identities; the App carrier contract supplies policy, not a pinned version.

Stable, Nightly and OPL DSH use the [Framework shared release-note writer](https://github.com/gaofeng21cn/one-person-lab/tree/main/scripts/release-note-writer).
Change `policy.json` there to configure provider order, Gateway endpoint, timeout, Copilot
version and credit budget once. Product workflows resolve central `main` once per notes
preparation, then download code and policy at that SHA into runner temporary storage.
The receipt records the source commit and policy digest independently of the product cohort.
A source-loading failure uses product mechanical copy; a CLI installation failure leaves
Gateway and mechanical writers available. Products retain prompts, language, exact facts,
validation and mechanical copy. Credentials remain in each caller's Secrets and token;
the shared writer is a CI tool, not a product runtime dependency. Stable freezes the resulting
body before paid gates and never regenerates it during publish, promote or recovery.

Public bodies follow `public_release_notes.public_body_language`. The AI writer generates the
hidden `en-US` and `zh-CN` blocks, and its validator rejects Chinese in the visible English body.
Nightly uses the same bounded shared writer, with program-owned scope and identity. Its mechanical fallback copies component commit subjects only when
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
operation may contain release-path fixes. Standard artifact recovery also accepts `--smoke-harness-ref <exact-shell-sha>` to run a repaired
verification harness against the original signed bytes; the controller resolves it in the Shell repository before dispatch, and the controller itself participates in the operation identity; this override requires `--reuse-standard-run-id`.
Recovery verifies the original source-gate bytes against their run-bound control and reuses that passed
exact-cohort evidence, so advancing owner checkouts does not repeat unchanged source tests.
When a failed run has no signed artifact yet, `--source-gate-run-id <failed-run>` reuses only its
authenticated, exact-cohort source gate. The repaired workflow still builds and qualifies the product;
this option neither reuses a failed acceptance nor authorizes another consumer of the same operation.
Source-gate and Full build-cohort recovery use the shared digest-verified artifact downloader. `OPL_ARTIFACT_CACHE`
may point to a directory containing `<GitHub artifact SHA-256 hex>.zip`, including an exact
archive downloaded through the GitHub connector when a runner cannot follow the ZIP redirect.
The downloader reads fresh exact-run artifact metadata and verifies both archive size and digest
before extracting; the controller also verifies the source report against its run-bound control.
The Full path binds the exact failed-run cohort artifact before reading product SHAs.
Seed only the original ZIP, with its current GitHub digest and size; leave large signed
checkpoint transfer to the existing runner path. A CLI redirect failure is not a reason
to rebuild an unchanged signed package.
With an explicit repaired harness, an interrupted failed qualification may be run again even if its
old classifier called it a product failure. A recorded pre-install artifact-download failure may also reuse signed bytes after the recovery job
reconciles the original run, Bundle, notarization receipt, and both downloaded DMG hashes. Other
infrastructure failures remain blocked. Signed-byte identity and scope proof still must match;
the failed acceptance is never reused and a fresh clean-VM qualification remains mandatory.
Account-login qualification waits for actual Codex model-access readiness after confirmation, and records
at most one retry of a settled session failure through the same visible confirmation action.
For the settled `gateway_unavailable` receipt, it first re-reads the active account,
managed key and projected action. It accepts already converged fresh model access without
another write, or retries the same confirmation once when the source is unchanged.
Unknown outcomes, authentication failures and changed owners remain non-retryable;
fresh account/model-access readback and all Stable readiness gates remain mandatory.
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
SHAs exactly match the requested Full cohort. When recovering a Full checkpoint, omitted product refs
default to its build cohort, not moving main. Explicit content overrides can fall back to the original
Standard only when that checkpoint exists; an explicitly selected Full artifact rejects conflicting
content refs. An exact `--smoke-harness-ref <sha>` and, if needed, a compatible harness-only
`--verification-app-ref <sha>` may requalify unchanged Full bytes. VM input validation exercises the
scope consumer imported by that selected App receipt writer before allocating a VM runner. One controller attempt makes at most one workflow mutation. If the
dispatch result is unknown, the controller performs read-only reconciliation and never retries it.

A failed Full run can retain both `opl-release-append-full-operation-checkpoint-v2-<run>`
from before packaging and `opl-release-full-checkpoint-<run>` from after packaging.
The former may still be `standard_qualified`; explicitly selecting it can rebuild Full.
Read fresh artifacts, use the admitted stage, and prefer the controller's later matching
Full checkpoint. Same-byte requalification uses `materialize-full-build` and skips
`full-build`; an already `full_qualified` checkpoint can continue publication directly.
The [v26.10.2 retrospective](incidents/2026-10-02-stable-release-recovery.md) records the
observed selection error, transport repairs and complete public closeout.
The [v26.10.8 efficiency review](incidents/2026-10-08-release-efficiency.md) records the
release-executor typecheck, prepared-tarball preference, and verified offline preflight path.

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

### Cloud runtime recipe

The generic Docker image retains its existing `local/none` default. Select
`cloud/password` in the Runtime publisher's existing
`applicationRevisionTemplate.entrypoint`. The main service revision has an
entrypoint string array, not an environment map. Serve delivers declared secret
files; all non-secret OPL configuration belongs in this App-owned declaration.
The exact machine-readable fragment lives at
`contracts/app-runtime-bridge.json#webui_deployment.cloud.application_revision_template`:

```json
{
  "entrypoint": [
    "/usr/bin/env",
    "OPL_WEBUI_DEPLOYMENT_MODE=cloud",
    "OPL_WEBUI_AUTH_MODE=password",
    "OPL_WEBUI_USERNAME=opl",
    "OPL_WEBUI_PASSWORD_FILE=/run/secrets/opl_webui_password",
    "OPL_WEBUI_SESSION_SECRET_FILE=/run/secrets/webui_session_secret",
    "/usr/local/bin/opl-webui-entrypoint"
  ]
}
```

Merge that fragment and its matching credential declarations into the publisher's
existing application revision template; do not replace its credentials array.
Reuse credential names `admin-password` and `session-secret`, and keep
`applicationAccess.usernameCredentialName=admin-password`. Preserve the existing
`gateway` credential (`gateway_key`, `/run/secrets/opl_gateway_api_key`). Keep the
image identity, platform, data, mounts, ports, readiness and package contract intact.
The password credential uses username `opl` and target
`/run/secrets/opl_webui_password`; the session credential target is
`/run/secrets/webui_session_secret`. A publisher using other targets or
usernames must change its entrypoint assignments and declarations together.
No secret contents enter argv. The session secret requires at least 32 bytes;
missing, unreadable or empty required files must fail before listen. Gateway Key
configuration remains an independent Framework credential boundary.

The generic executor must append the exact OCI CMD to the declared entrypoint.
Do not place `node scripts/headless/run.mjs` in the application entrypoint or
replace `buildRecipe.outputImageCommand`: the image's existing CMD may include
package preparation before starting the Host. Verify this CMD preservation in the
exact Cloud executor selected for installation; the App contract is not evidence
that a deployed executor already implements it.

The carrier workflow reads the frozen App contract, retains
`cloud-application-revision-template.json` with qualified image evidence, and
executes that entrypoint plus the inspected image CMD on both native platforms.
It mounts password/session files without Docker auth env and checks anonymous
401, login, authenticated user, trusted-prefix base, scoped Cookie and CSRF logout.
Default-mode restart/state qualification still uses the same image. Publishing a
new generic image alone does not update an existing publisher contract or Workspace.

Studio's existing entrypoint and auth ABI already accept `/usr/bin/env` before
the original entrypoint; no mount discovery or new runtime configuration mechanism
is required. Prefix handling and relative browser URLs use Studio's official
`renderIndexInjections` seam; see the
[product boundary](../../product/gui/opl-studio-plan.md#workspace-webui-路径与启动配置).

### Minimal Workspace repair through independent Preview publication

1. Integrate the App contract/caller and Studio path implementation, then freeze
   `app_ref`, `shell_ref` and `framework_ref` as full lowercase 40-character Git
   commits. App selects the product contract; Shell must include the prefix and
   Cookie implementation; Framework is the exact compatible runtime source.
   Use refs reachable by Actions, never a task branch name, `main`, dirty checkout,
   Dockerfile default ref or an inferred current SHA as a source identity. The
   canonical App `main` executor must contain this workflow/validator. At admission,
   the workflow's `github.sha` must equal canonical `main`; source refs then remain
   frozen even if `main` advances.
2. With publication authorized, dispatch `release-webui-development.yml` from
   `main` once with `operation=publish`, `channel=preview`, an unused exact version
   (`YY.M.D-preview.rN`, for example `26.10.29-preview.rN` with an actual unused
   positive integer), and those three SHAs. It builds and qualifies both native
   platforms and publishes the immutable version and durable record in
   `ghcr.io/gaofeng21cn/one-person-lab-webui`. Preview publish does not invoke
   promotion or move `:stable`/`:latest`; candidate and receipt tags are run-scoped
   evidence. Do not select `promote` for a repair scoped to one Workspace.
   If only qualification is authorized, select `operation=qualify`. Reuse that
   run for publication only with the same refs/version and exact
   `qualified_artifact_run_id`; candidates built before these fixes do not qualify.
3. Read back the successful owner run, source authority, immutable OCI index and
   both child digests and publication record. The existing Instance-owned
   `webui-recovery-registry-bridge.yml` accepts this canonical repository by exact
   index digest. It admits `linux/amd64` alone or `linux/amd64` plus `linux/arm64`,
   requires `COPY_WEBUI_CARRIER`, and verifies the source and target index bytes
   and digest match. Pass the index digest to that bridge, not a child manifest
   or the separate `opl-studio-webui` Preview repository. Only the Instance owner
   runs this protected bridge; no local private-network connection is involved.
   After its readback, pin the appropriate exact platform image digest in the
   existing Runtime publisher contract, retain the declared entrypoint and matching
   credential declarations, and use the existing Build/Serve owner path to update
   the authorized Workspace. This installation/activation is a separate owner
   action, not an effect of publishing Docker. Keep global pointers unchanged.
4. Cloud acceptance must exercise the original Workspace URL: login without an
   existing cookie, static assets, fetch, SSE, download, scoped logout and restart.
   A root-only smoke or authenticated response in `local/none` is insufficient.

These steps describe a later authorized release; contract/source checks do not
authorize dispatch, registry publication or Cloud activation.

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
