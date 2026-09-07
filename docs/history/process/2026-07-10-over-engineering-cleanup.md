# 2026-07-10 Cleanup Provenance

The cleanup landed in App commits `71bf61e`, `8613888`, `32d6fea`, `76fcb14`,
`ea4f555` and `5aab2f1`. It removed orphan release fixture graphs, obsolete
release-note setup, dead validator symbols, duplicate screenshot/verification
surfaces and unused npm exports; filesystem copying/walking moved to Node
primitives, and whitepaper rendering moved to its Framework owner.

This record preserves that scope only. Historical pass totals, source refs,
completed task tables and the old no-safe-split queue have been retired. They
are not current test requirements, a backlog, or a reason to retain a module.

The lasting constraint is behavioral: consolidation must preserve each real
caller's error, output, environment and write semantics. Source-text tests that
only mirror implementation or prose are not substitutes for those checks.
Current release and carrier behavior belongs to contracts, implementations and
the [release guide](../../delivery/release/README.md).
