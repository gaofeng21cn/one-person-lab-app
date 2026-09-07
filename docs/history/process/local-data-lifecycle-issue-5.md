# Local Data Lifecycle Issue 5 Provenance

Issue #5 exposed that updater cache cleanup alone did not address local data
growth. The resolution separated updater installers, conversation artifacts,
runtime/toolchain roots and logs so one cleanup class could not silently delete
another's data. This is historical rationale, not a current implementation or
installation acceptance report.

Current policy is in
[`app-release-channel.json`](../../../contracts/app-release-channel.json)
(`local_data_lifecycle`), with Settings / Storage behavior in the GUI and
page-state contracts. The selected Shell implements those controls.

The load-bearing distinction remains: user artifacts need inventory and an
explicit cleanup decision; archive/export and restore proof precede artifact
deletion. Runtime pruning protects active and rollback references, while log
rotation and stale installer cleanup cannot stand in for user-data retention
proof. Actual deletion is proven by the owning operation's receipt, not by a
passed unit test or this issue record.
