# v26.6.20 Release Provenance

This historical record retains the release's diagnostic lesson. Current
commands and policy are owned by the [release guide](../../delivery/release/README.md).
Transient run inventories, asset hash tables and optimization queues are kept
in Git history instead of being maintained as current documentation.

Initial run: [27865855747](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/27865855747).
Later source run: [27866803313](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/27866803313).
The retained [owner receipt](../../delivery/release/records/v26.6.20-release-owner-receipt.json)
binds its own historical cohort and verdict; it is not current Latest or install evidence.

Publication and Homebrew tap update succeeded, but promote run `27867580320`
failed its post-public Homebrew clean-VM gate. Standalone run `27868475783`
then failed with a partial cask download before installation. Published assets
were not proof of successful clean installation; a transport failure was not
proof of an App runtime defect.
