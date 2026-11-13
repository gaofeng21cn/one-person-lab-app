# Stable 26.11.11 release efficiency review

## Outcome

The complete v26.11.11 request reached the final follow-up readback on 2026-11-11. The first
formal Stable dispatch started at 22:03:48 China Standard Time and the final Full/Homebrew
follow-up ended at 03:37:25 on 2026-11-12, a wall-clock span of **5 hours 33 minutes 37
seconds**. This exceeds the SOP's default 90-minute target by 4 hours 3 minutes 37 seconds.

The last successful Full append run (43076104187) took **1 hour 20 minutes 56 seconds**, which
is within the 90-minute execution target. Standard reached public readback in about **41 minutes
38 seconds**. The end-to-end miss came from failed or cancelled attempts and recovery gaps, not
from the final successful Full run alone.

The timing report was generated with `npm run release:actions-timing` over the Standard run,
Full attempts, platform follow-ups, Docker publication, and final follow-up. It measured:

| Measure | Duration |
| --- | ---: |
| First dispatch to final follow-up | 5h33m37s |
| Accumulated workflow wall time | 5h03m56s |
| Sum of adjacent run-creation gaps | 2h36m24s |
| Failed or cancelled run tax | 3h14m07s across 5 runs |
| Last successful Full append | 1h20m56s |

## Critical path observed

The final successful Full run spent 41m22s in the Full build job, 22m55s in ARM signing and
notarization, 9m02s in clean-VM first launch, 4m23s in hosted Full qualification, and 2m18s
publishing the Full asset. The slowest individual steps were Full package assembly (33m36s),
Apple finalization and notarization (15m46s), and clean-VM smoke (7m01s). These are real release
gates and remain contract-bound.

The avoidable tax was earlier in the chain:

- The first Full append reached package build and clean-VM before the App/Framework cohort
  exposed the `opl-channel-weixin` local component in the offline seed. Framework correctly
  failed closed, but the missing seed contract was discovered too late.
- The Linux platform follower spent about 26 minutes in dependency installation before the
  Ubuntu mirror/DNS failure became terminal. The mirror source and archive-zone fixes were then
  landed in `c66b84601` and `b9d80775e` and the platform was recovered successfully.
- Recovery required separate runs after failures. The 2h36m figure sums adjacent
  creation-time gaps and includes overlapping work; it is not idle runner time
  and cannot be subtracted from the overall span as a promised saving.

## Changes landed

Fresh Full append admission now reads the exact frozen App source and requires the dynamic local
component seed bridge before any Full packaging. It checks that the builder calls
`selectedLocalComponentSeedInputs` with `packageProfile.package_ids`, and that the seed helper
validates owner scope, carrier commit, and payload commit. A stale cohort fails in the short
Ubuntu admission job instead of consuming the macOS Full build and VM gates.

The existing release path already preserves the other high-value protections: source checks and
artifact construction run concurrently, hosted Full qualification and clean-VM qualification run
concurrently, prepared VM inputs precede cache fallback, and exact Full bytes are reusable after a
failed attempt. The closeout timing command now has a documented multi-run invocation so future
reviews report the end-to-end span and the successful single-run duration together.

The signed, notarized, ordinary-account clean-VM, exact public-byte, Homebrew, and Docker
readbacks remain mandatory. The 90-minute target is an execution objective, not permission to
skip those gates.

## Single-run improvements after this review

Full DMG remains ULMO at the existing compression level, with payload size taking
priority. The 1,345-second package segment includes staging, signing and checks
around DMG creation; it is not a measurement of compression alone.

The implemented changes repair the mismatched Standard/Full Electron cache path
lists, share exact verified renderer output, and reuse the notarizer's exact
DMG trust receipt in Studio distribution qualification. ZIP App trust and the
real updater replacement still execute. Temporary loopback updater successor
ZIPs use store compression and skip their own notarization while retaining
Developer ID signing; public DMG/ZIP settings are unchanged. Full final trust
and cohort writing share one read-only mount and retain native-runtime checks.

Full assembly emits separate runtime materialization, offline seed, payload
sync, Shell build, built-App payload sync, precompression gate, DMG package,
optional runtime archive and manifest/checksum groups. Timing JSON is refreshed
at every transition and on failure; it reports the exact failed stage and
completed durations. Cache and timing summaries also run after build failure.

Local renderer replay measured 21.5 seconds cold and 0.19 seconds on a verified
hit; a changed output was rejected and rebuilt successfully. These local
measurements do not predict hosted runner durations.

The observed 392.8-second Full Shell build includes packaging and signing, so
renderer reuse cannot be credited with all of it. With similar Apple response
times and cache hits, use **38-41 minutes for Standard and 77-81 minutes for the
Full append** as conservative planning ranges, about **115-122 minutes sequentially**. These
are estimates awaiting the next authorized release, not measured new workflow
durations. Preserving ULMO and the required gates leaves substantial fixed work;
there is no evidence for a large further reduction from dependency caching alone.
