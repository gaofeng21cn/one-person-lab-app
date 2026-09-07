# v26.6.21 Release Evidence Supersession

Historical branch commit `1d533879b1b2df869c4b556098f82dd48b9d4058` recorded
run `27892950918`: remote assets verified, but clean-VM closeout still open.
It was not replayed into current policy because a later same-version receipt
for run `27916440933` superseded that evidence.

The retained [owner receipt](../../delivery/release/records/v26.6.21-release-owner-receipt.json)
records the later cohort. Neither that receipt nor this record proves today's
Latest, runtime or domain readiness.

The lasting lesson is that asset verification does not close installation
acceptance, and an older branch must not overwrite stronger later evidence.
Current operations are documented in the [release guide](../../delivery/release/README.md).
