# v26.10.2 Stable release recovery

[v26.10.2](https://github.com/gaofeng21cn/one-person-lab-app/releases/tag/v26.10.2)
completed with macOS arm64 Standard and Full, Linux x64, Windows x64, both Homebrew
Casks, and Docker WebUI for linux/amd64 and linux/arm64. The Release is public Stable
and Latest. Windows is explicitly unsigned under the channel contract; optional
old-version signed upgrade certification was not performed or claimed.

This retrospective records observed failures and actual recovery. Reusable operator
rules live in the [SOP](../stable-release-sop.md); implementation details live in the
[release guide](../README.md). Historical run IDs, versions and digests below are
evidence, not parameters for the next release. This documentation change does not
dispatch another product release or repeat passed product gates.

## Frozen product and execution identities

| Role | Exact source |
| --- | --- |
| Product App | `19c52d3f8160362d55be174787f41b9a1c896fa9` |
| Product Studio | `7e98a8bd6b689963dad45d464742401eb3e51873` |
| Product Framework | `b2d7046808e1835f81c7647481f520818b73b49d` |
| Resumed Standard workflow executor | `f8120130fc08cdcd8c04f831a53d6f6d92f58625` |
| Final Full workflow executor | `01e372bdb2156f696afb4ca58537c2bfce2049f6` |
| Full verification App | Original product App SHA |
| Full smoke harness | `07fe996f89415d318ed89ab8a4192ff86b73efa2` |

All product refs stayed frozen through delivery fixes. Full's harness scope proof
classified only `scripts/desktop/preview-smoke.mjs` and its focused test as
`harness_mechanics_only`; semantic and probe digests remained equal. The later App
main contained transport and documentation changes, so it was not selected wholesale
as the verification App.

## Timeline

All times are Asia/Shanghai, UTC+08:00, on 2026-10-02. Dispatch initiation, GitHub
run creation, publication and observation are distinct events.

| Event | Time | Evidence / outcome |
| --- | --- | --- |
| Initial official Standard run created | 12:07:39 | [36963176350](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/36963176350) |
| Protected Apple preflight failed | 12:09:10 | Before version allocation, build or publication |
| Apple diagnostic identified agreement requirement | 12:20:06 | [36964062285](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/36964062285), explicit HTTP 403 reason |
| Independent Docker publication/promotion completed | 12:31:51 | [36964358026](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/36964358026), success |
| Apple diagnostic passed after agreement acceptance | 12:38:11 | [36965373832](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/36965373832) |
| Resumed Standard run created | 12:44:08 | [36965842428](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/36965842428), one mutation, no retry |
| Standard real clean-VM smoke passed | 13:12:38 | Signed/stapled install, Gateway, Official Profile, Codex protocol and Runtime refresh |
| Standard became public | 13:16:45 | Release `401557844`, subsequently Latest |
| Automatic Full append run created | 13:18:09 | [36968320669](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/36968320669) |
| Standard/add-on owner completed | 13:41:23 | Standard, Linux, Windows, Docker and Standard Cask succeeded |
| Full first-launch smoke step failed | 13:52:54 | Gateway model-access action returned `gateway_unavailable` |
| Original Full checkpoint job succeeded | 13:54:33 | Later `opl-release-full-checkpoint-36968320669` retained built Full bytes |
| Recovery selected an earlier checkpoint | 14:12:38 | [36972464004](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/36972464004), controller dispatch initiation; later cancelled |
| Corrected Full recovery run created | 14:17:38 | [36972856151](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/36972856151), one mutation, no retry |
| Full clean-VM smoke passed | 14:27:00 | Real Gateway model access, Official Profile, Codex protocol and Runtime refresh |
| Full temporal lifecycle passed | 14:27:39 | Required Full lifecycle proof |
| Full public append job completed | 14:31:28 | Original signed Full DMG appended to the same Standard Release |
| Full Cask public readback completed | 14:32:14 | Version, URL and exact Full DMG hash matched |
| Final Full owner completed | 14:32:15 | Success; all requested channels complete |

Initial run creation to Standard publication took **1 hour 9 minutes 6 seconds**.
Initial run creation to final Full owner completion took **2 hours 24 minutes
36 seconds**, exceeding the 90-minute target. The final successful Full run alone
took **14 minutes 37 seconds**; that does not replace total elapsed time. The full
window includes Apple agreement diagnosis and acceptance, required build/notarization,
Gateway failure, implementation fixes, CI, and the mistaken checkpoint recovery.
These observations are not timing guarantees for future releases.

## Failures, repairs and evidence limits

### GitHub access and artifact transport

The executor's `gh auth status` rejected a configured proxy placeholder, while actual
GitHub API reads and official workflow dispatch worked. The connected GitHub app
did not itself expose the required Actions dispatch interface. The working solution
used the authorized CLI for controller operations and the connector for artifact
ZIP download, without exposing credentials or constructing a second release path.

`gh run download` could not follow the signed artifact redirect and returned HTTP
403 in this executor. Source-gate recovery and Full-cohort recovery needed small,
original immutable ZIPs. The connector recovered those exact archives; the shared
downloader checked fresh exact-run GitHub metadata, archive size and SHA-256 before
safe extraction. Standard's controller also checked the source report against its
run-bound control. Large signed checkpoints stayed in the existing runner transport.

| Repair | Validation and integration |
| --- | --- |
| [App PR 313](https://github.com/gaofeng21cn/one-person-lab-app/pull/313): preserve authorized read-only source-gate credentials and proxy/CA settings | 30 focused tests, TypeScript, hosted source and boundary validation passed; dependency/Shell execution does not receive GitHub credentials |
| [App PR 315](https://github.com/gaofeng21cn/one-person-lab-app/pull/315): recover original source evidence through the existing verified cache | 31 focused tests, TypeScript and hosted checks passed; exact original ZIP replay passed |
| [App PR 316](https://github.com/gaofeng21cn/one-person-lab-app/pull/316): share that downloader with Full build-cohort recovery | 32 focused tests, TypeScript and hosted checks passed; original failed-owner cohort ZIP replay passed |

### Apple agreement prerequisite

The diagnostic returned HTTP 403 with the explicit message that a required team
agreement was missing or expired. Developer ID import and preceding signature checks
had succeeded. The evidence supported an Apple agreement blocker, not an invalid
certificate or password. [App PR 314](https://github.com/gaofeng21cn/one-person-lab-app/pull/314)
retained sanitized failure receipts; 16 focused tests, TypeScript and hosted checks
passed.

While that prerequisite was blocked, the authorized independent Docker channel was
completed. After the user confirmed agreement acceptance, the small Apple diagnostic
passed. A fresh official Standard operation reused the original authenticated source
gate and frozen product refs; it did not rerun failed jobs or unchanged source gates.

### Full Gateway qualification

Original Full installation, signature, stapled notarization, Gatekeeper, runtime/UI
and Framework readiness passed. Login succeeded with an active account and managed
key. The confirmed model-access action then returned a settled owner receipt:
`ok=true`, `status=error`, `dryRun=false`, `exitCode=4`,
`errorCode=gateway_unavailable`. The readback was stale and model access remained
`missing`; Codex readiness and Runtime refresh were unproven. Publication correctly
stopped. The underlying service or network cause was not established.

[Studio PR 32](https://github.com/gaofeng21cn/opl-studio/pull/32) added a bounded
recovery to the qualification harness. It reads the authoritative account and same
projected action before at most one retry of this known settled error. Already
converged fresh model access needs no second write. Unknown outcomes, authentication
failures and a changed source are never repeated. Both receipts and the recovery
projection are retained; real fresh model access and every Stable readiness gate
remain required. Its 24 focused tests and hosted source validation passed.

The final VM's model-access action succeeded on its first execution; its confirmation
has no recovery object. Thus the release proves successful same-byte requalification,
while focused tests prove the bounded recovery cases. It does **not** prove that a
retry fixed the original service error or identify its underlying cause.

### Wrong Full checkpoint selection

The first recovery explicitly selected
`opl-release-append-full-operation-checkpoint-v2-36968320669`. That was the earlier
Standard checkpoint, so the workflow entered Full build preparation. The same failed
run already had a later, successfully produced Full checkpoint:
`opl-release-full-checkpoint-36968320669`. The operator should have read the fresh
inventory and preferred the controller's later matching checkpoint before dispatch.

Fresh state confirmed the unnecessary operation was in cache preparation. Only that
add-on operation was cancelled, and terminal cancellation was confirmed before a
fresh official recovery consumed the later Full checkpoint. The corrected run's
`materialize-full-build` succeeded and `full-build` was skipped; existing signed and
notarized bytes were preserved. Standard and completed independent channels were
retained. This was an operator selection error, not evidence that the package needed
a rebuild.

### Monitoring and public closeout

Active-job logs were sometimes unavailable or returned an older prefix. That was an
observation gap, not proof of a stalled process. Actual clone/start/IP markers later
proved VM execution; a job name or elapsed time did not. The final Full VM smoke had
no blockers and used real `model/list` and `thread/list`, with no generation request.
Its Runtime refresh and Full temporal lifecycle proof passed.

The independent Docker run first published digest
`sha256:b82c66204bd55be4e03d57f72395c0ee5c97bfa4f9d3a76a419ac0c4b4f01945`.
The resumed Desktop workflow's automatic follower then published its qualified
carrier, bound to Desktop Bundle
`sha256:83199e6b7d81d2d13406fc7f2e22ce9ae8dffaaf5e4683ef5a8fb06532c32a1d`.
The **final public** version, `stable` and `latest` digest is in the inventory below;
the initial digest is historical evidence. No extra manual publish or promotion was
performed after the automatic follower. Both native platform receipts passed health,
CLI checks and same-volume persistence; anonymous public OCI readback passed.

## Final public inventory

| Carrier | Size / SHA-256 |
| --- | --- |
| Standard macOS arm64 DMG | 216,718,143 bytes; `b85e930176a9166e7e0acbdf0297c2f59ac6a2855ee87f823501abc80813ea72` |
| Full macOS arm64 DMG | 476,171,100 bytes; `3cbf9b37dd77d3b0b3308272ade10353b18c8d572bec49bc12aafe154f9c7988` |
| Linux x64 DEB | 169,520,092 bytes; `5aaa27fa8c910858d083bd3d90cbbb2670985b51d427070ae2ece52907c11884` |
| Windows x64 EXE, unsigned | 516,963,680 bytes; `4d0f2f45bc3fe3d4763a48301c6dd7907c560462637ef271d8b148e1cf4cc8fd` |
| Docker WebUI `26.10.2`, `stable`, `latest` | `sha256:e50242fded41d706ace6e73a0716fe5b0fe40086ec296bfbd8d16d9d4d7937a6`; linux/amd64 and linux/arm64 |

Both public Casks pair updater version `26.10.291` with display version `26.10.2`
and their respective exact DMG hashes. Standard feeds, updater sidecars, platform
manifest and installer hashes were verified. Anonymous Full DMG and final public
manifest downloads passed size and digest checks. The Full DMG hash matched the
original Apple Accepted/stapled receipt, build cohort, recovery qualification receipt
and public Full Cask. All 17 previously published protected Standard/add-on assets
retained their size and digest; the Full manifest was the contract-defined replacement.
Latest stayed `v26.10.2`, target App `19c52d3f8160362d55be174787f41b9a1c896fa9`,
with `draft=false` and `prerelease=false`. No local `/Applications` installation was
changed.

Durable workflow evidence includes:

- Original authenticated source evidence: `opl-stable-operation-control-36963176350`.
- Original signed Full checkpoint: `opl-release-full-checkpoint-36968320669`;
  archive SHA-256 `8208add6b528a04092464c8d32c99999a8b23cc3b35fc9b963645e5aaa831568`.
- Full qualification: `opl-first-run-vm-full-36972856151`, containing
  `artifact-qualification-receipt.json`; archive SHA-256
  `026d06c7459963d35a72cf4316104d6050708b76cbf6c944c767a31c0633a984`.
  Its `qualification.run_id` is `36972856151` and `source_artifact_run_id` remains
  `36968320669`, proving the original built bytes were requalified.
- Final checkpoint: `opl-release-full-checkpoint-36972856151`, stage
  `full_qualified`; both Standard and Full owner runs completed successfully.

Workflow artifact retention is finite. Public assets, committed source and this
sanitized retrospective retain the delivery facts without committing binary archives,
raw logs, transient credentials, signed URLs or workstation-specific helper scripts.
