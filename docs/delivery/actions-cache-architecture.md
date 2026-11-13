# Actions Cache Architecture

Owner: `one-person-lab-app`

State: active release-acceleration guidance

Machine authority: `contracts/app-actions-cache-catalog.json` and
`contracts/app-release-channel.json#release_acceleration.github_actions.cache_policy`

## Purpose And Boundary

GitHub Actions cache keeps reproducible inputs and build intermediates close to
the runner so repeated releases do not download or materialize identical bytes.
It is useful when input identity is cheaper to calculate than the work being
avoided. It is disposable acceleration state: a hit does not prove artifact
identity, currentness, release readiness, publication, or owner approval, and a
miss must fall back to the same validated build path.

The repository budget is 10 GiB with 2 GiB reserved headroom. The remaining
budget is divided among dependency downloads, first-run install seeds, compiled
shell output, and Full runtime layers. Large caches have one writer:
`refs/heads/main`. Other refs may restore exact reusable entries but do not save
new large entries.

## Full Runtime Layering

Standard and Full share the same Electron artifact paths as well as the key.
Actions also derives a cache version from the path list; identical keys with
different path lists cannot reuse each other's downloads.

The `desktop-renderer-cache` composite restores the Studio renderer through one
fixed runner-temporary directory, independent of checkout layout. Its exact key
binds working source and plugin bytes, dependency locks, App contracts, Node,
platform/architecture, and Vite environment. Studio verifies the complete output
SHA-256/size inventory before reuse; missing, changed or extra files rebuild the
renderer. Signing, packaging and qualification still run. Old frozen Shells
without this helper retain their existing build path. Saves are main-only and
require a validated output inventory; there is no prefix restore.

Full starts after Standard publication, so a cache saved by the successful
Standard build is available without speculative Full work. npm, uv, Go and the
four runtime layers remain separate caches. We do not archive `node_modules`:
the observed dependency installation cost is small, while its native binaries
and symlinks require environment-specific handling and a large transfer.

| Layer | Reused work | Content identity | Deliberate non-invalidators |
| --- | --- | --- | --- |
| `toolchain` | Codex, Node/npm, Python, uv, Temporal, OfficeCLI, MinerU, wrappers | Tool bytes and versions, Node/Python/Codex-vendor tree fingerprints, toolchain builder code, toolchain prune projection | Domain sources, Framework runtime source, skill selection |
| `domain-runtime` | Source trees selected for this Full build | Selected package dependency closure plus exact source commits and fingerprints, domain builder code, `modules/*` prune projection | Toolchain bytes, Framework `opl` runtime, standalone companion-skill changes |
| `opl-runtime` | Framework source and production Node dependency closure | Framework SHA/runtime fingerprint, package metadata, production dependency fingerprint, OPL builder code, `opl/*` prune projection | Domain checkout changes, toolchain and skill changes |
| `skills` | Skills selected for this Full build | Selected package-set identity, OPL Flow commit/policy when selected, App product profile, selected skill fingerprints, skill packager code, `skills/*` prune projection | Toolchain and Framework runtime-only changes |

Unrecognized prune roots invalidate all four layers. This conservative fallback
prevents reuse when a new runtime root has not yet been assigned to a layer.
Changing a known `modules/*`, `opl/*`, `python/*`, or `skills/*` rule invalidates
only the owning layer. A layout version bump is reserved for archive-format or
compatibility changes that require a one-time miss for every layer.

## Identity Chain

The default-on Full flow uses one inspectable chain:

1. Freeze exact App, Shell, and Framework SHAs and resolve the package profile
   selected for this build, including its dependency closure.
2. Record exact commits and content fingerprints for the selected sources.
   No global Package catalog, Release Set, or payload lock is required.
3. Calculate each layer's structured input, input digest, runtime key, and the
   canonical aggregate key input.
4. Write `opl_actions_cache_plan.v2` before expensive materialization. The plan
   binds the cohort, selected package set, cache-catalog digest, aggregate input, exact Actions keys, and each
   layer's `key_input_digest`.
5. Restore only exact Full runtime keys. Prefix fallback is forbidden for these
   assembled runtime archives.
6. Materialize misses through the normal builder, combine hit and built layers,
   and run the Full currentness probe. A missing cache is not a release failure.
7. Save validated misses only from `main`; exact hits and non-writer refs skip
   saves.
8. Write `opl_actions_cache_receipt.v2`. Receipt creation fails closed unless
   currentness passed and runtime keys, key inputs, package set, durations, and
   save dispositions match the plan.
9. Use receipt metrics (`hit_count`, `miss_count`, `hit_ratio`, total layer time,
   and save failures) for acceleration tuning. Continue artifact qualification
   and promotion from their own evidence; the receipt is not an admission gate.

## Development Rules

- Put a new input in the narrowest layer whose output bytes it can change.
- Add a prune rule under a recognized runtime root; if a new root is necessary,
  update its layer mapping and isolation tests in the same change.
- Bind copied working-tree bytes or an equivalent owner digest, not only a
  friendly ref or version string.
- Never include run ID, attempt, timestamp, random value, release version, DMG
  wrapper code, or unrelated layer inputs in a reusable runtime key.
- Do not add restore-key prefix fallback for compiled output or runtime layers.
- Update the cache catalog, release contract, boundary validators, tests, and
  this document together when schemas, keys, writer policy, or metrics change.
- Treat a v2 cold miss after migration or eviction as expected. Do not manually
  rerun or dispatch to manufacture a hit; the canonical build is the fallback.
- Investigate a low hit ratio from `key_inputs` and receipt metrics before
  raising budgets. Repeated save failures indicate capacity or writer-policy
  trouble; they do not permit weakening currentness or artifact gates.

## Verification

After changing cache behavior, run the focused cache tests, TypeScript
typecheck, `npm run validate:release-boundary`, and
`npm run validate:active-shell`. `git diff --check` remains the final whitespace
guard. Cache inventory and deletion stay read-only/plan-only unless the isolated
cleanup broker is explicitly available.
