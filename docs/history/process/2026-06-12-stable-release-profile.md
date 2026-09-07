# v26.6.12 Release Provenance

This historical record retains the release's diagnostic lesson. Current
commands and policy are owned by the [release guide](../../delivery/release/README.md).
Transient run inventories, asset hash tables and optimization queues are kept
in Git history instead of being maintained as current documentation.

Initial run: [27390375446](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/27390375446).
Later source run: [27415765472](https://github.com/gaofeng21cn/one-person-lab-app/actions/runs/27415765472).
The retained [owner receipt](../../delivery/release/records/v26.6.12-release-owner-receipt.json)
binds its own historical cohort and verdict; it is not current Latest or install evidence.

The initial Homebrew gate failed before App launch because cask trust resolution
included conflicting sibling casks. A focused trust-policy repair passed in run
`27393124605`. Later same-tag refreshes and a release-owner receipt resolved the
then-pending verdict. Cache and DMG compression changes demonstrated a measured
speed/size tradeoff; they did not relax clean-install qualification.
