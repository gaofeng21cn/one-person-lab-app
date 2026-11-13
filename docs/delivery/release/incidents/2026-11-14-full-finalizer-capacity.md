# Full finalizer allocation failure

The Full attempts `43458058689` and `43469644209` completed assembly but failed
before the standalone finalizer acquired a runner. Their failed check runs are
`132025467978` and `132068996074`. Both reported:

> The job was not acquired by Runner of type hosted even after multiple attempts

Both also carried GitHub's macOS ARM64 capacity-constraint notices. Each had
`runner_id=0` and no executed steps. The approximately fifteen-minute interval
was runner allocation failure, not the workflow's sixty-minute execution timeout.

The second build log identifies `macos-26-arm64`; describing it as an x64 build
was incorrect. The workflow already had an ARM runner, then released it and
requested another for notarization. This unnecessary allocation made Full
publication vulnerable after assembly had succeeded.

The repair shares one finalization composite between fresh builds and recovery.
Fresh builds retain their ARM runner through notarization and final trust checks.
Recovery selects the retained immutable handoff, preserves frozen sources and
validates archive and file digests before finalizing, without rebuilding. Apple
submission evidence blocks blind resubmission. Clean-VM qualification, publication
and Homebrew remain independent required stages; Standard assets are preserved.

The second attempt retained artifact `14064525824`,
`opl-full-finalizer-input-26.11.13-43469644209`, with archive digest
`sha256:d2d50e2958b02e7c9a86b748d133944c7572949198408aa93742ea9a57d6a0ea`.
Its existence establishes recoverable build input, not a published Full DMG.
