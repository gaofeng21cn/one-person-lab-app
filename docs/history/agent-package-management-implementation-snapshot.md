# Retired Package Manager Design

This record explains why the former Framework Package Manager must not be
reintroduced. It is historical provenance, not an implementation plan or a
compatibility contract. The original implementation tables and transient
completion claims remain available in Git history.

The former design made Framework the resolver and owner of Package locks,
payload materialization, lifecycle receipts, rollback/LKG and a fixed starter
closure. App projected those records into a package directory. That duplicated
platform lifecycle and installed-state authority.

The replacement assigns installation and activation to the native carrier,
Package identity and capabilities to installed descriptors, and aggregation to
Framework. App consumes the resulting directory and actions. Domain task,
artifact and quality authority stays with the professional Agent.

Do not restore a Package lock, a central transaction journal or a fixed Agent
registry to make a stale UI projection appear ready. A carrier failure requires
fresh owner readback and a repair of that carrier or its proven thin adapter.
Package identity, physical carrier and executor remain distinct.

Current ownership is documented in [architecture](../architecture.md) and
[managed updates](../product/managed-update-three-layer.md). The related
[Durable design review](process/2026-07-23-opl-package-durable-design-review.md)
records the rejected recovery alternatives and conditions for reconsideration.
