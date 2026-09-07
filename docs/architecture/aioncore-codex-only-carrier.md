# AionUI Codex Runtime Carrier

Owner: `one-person-lab-app` for composition policy; `opl-aion-shell` for implementation.
Purpose: runtime byte sources, packaged composition and identity boundary.
State: current source reference; installed evidence is cohort-specific.

## Composition

AionCore is an unmodified official dependency. The active Shell obtains Node
from its schema-v2 producer export and selects official `@openai/codex` bytes
independently through the Shell-owned intake contract. AionCore no longer owns
the selected Codex version. Its Node export is temporary build input, not the
distributed managed-resources manifest.

The policy owner is
[`app-shell-adapter.json`](../../contracts/app-shell-adapter.json), under
`codex_executable_contract.carrier.target_packaging_policy`. Exact Codex package,
version, digest and verified AionCore compatibility live in the Shell's
`contracts/aionui-upstream-intake.json#managed_runtime.codex_cli`. This page does
not maintain a second version list.

| Layer | Owner | Result |
| --- | --- | --- |
| AionCore and Node | Official AionCore release | Unmodified runtime plus Node-only staging export. |
| Codex CLI | Official npm package, selected by Shell intake | Verified platform bytes and source identity. |
| Packaged composition | Shell | `opl_aioncore_managed_resources_projection.v1` combining Node and Codex with producer and Codex-source provenance. |
| Distributed App | App release owner | Standard and Full share one slim `bundled-aioncore`; Full differs in offline seeds elsewhere. |

The final App must contain AionCore, Node and exactly one Codex CLI. Claude
directories, executables/symlinks, Anthropic packages/archives, distribution cache
entries and raw producer manifests must be absent. Build staging is not installed
state. The composition neither patches AionCore nor changes user-owned tools.

Framework's headless Codex carrier stays outside App bundles. Studio uses its own
App-admitted carrier and has no AionCore dependency. Neither creates a second
Package registry or Codex thread authority.

## Runtime Identity

The Shell derives `opl_codex_runtime_identity.v1` from the packaged projection.
It binds path, realpath, version, binary digest, `CODEX_HOME`, platform, cohort and
manifest provenance. Direct App Server validates that identity before spawn;
AionCore receives the same `OPL_CODEX_BIN`, `CODEX_HOME`, identity and Codex-first
PATH. A bound identity must not silently fall back to global or other managed
Codex bytes when validation fails.

Missing installation, missing executable, unavailable runtime, required
activation and identity drift retain their typed error boundary. Exact artifact
identity is evidence, not a requirement that Framework headless and GUI share
one physical installation or that all compatible artifacts have the same digest.

AionCore does not expose a native identity readback. The ACP claim is limited to
OPL-controlled process input plus a successful real handshake, never an invented
AionCore self-report. Codex Core/App Server owns canonical threads and history.

## Verification And Historical Evidence

Source validators check composition, provenance and final-tree absence. Packaged
qualification must inspect the actual artifact and prove ordinary ACP and direct
App Server behavior using the same declared identity. Updates require complete App
build, install and runtime readback; individual installed binaries are not hot-swapped.

[`issue-122-codex-runtime-identity-v26.8.1-r5.json`](../delivery/release-evidence/issue-122-codex-runtime-identity-v26.8.1-r5.json)
retains historical Full clean-install followed by Standard-update evidence for
its exact artifacts. It is not proof for today's independently selected Codex
bytes or new release cohort. The owning validator is
`npm run validate:codex-runtime-identity-evidence`; current qualification and
publication follow the [release guide](../delivery/release/README.md).
