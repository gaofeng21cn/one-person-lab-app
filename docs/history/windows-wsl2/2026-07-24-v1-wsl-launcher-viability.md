# Windows WSL2 Validation Receipt: V1 Launcher Viability

Validation run ID: `20260724-v1-wsl-launcher-viability`
State: `partial`
Lane: `validation_only_non_binding`
Date: `2026-07-24`
Archive context: [Early Windows WSL2 experiments](README.md).

## Scope

This run exercised exact Linux AionCore, Node, Codex, and Framework inputs in
the disposable `OPL-Validation-g0001` WSL2 distribution. It did not execute an
App or Shell product route, mutate contracts or product source, claim Windows
support, select a production carrier, or create a development gap.

The distribution was imported from a Canonical Ubuntu 24.04 `.wsl` package as a
V1 fixture only. It is not the `OPL-Linux` product distribution, a minimum
carrier decision, or production-carrier evidence. The Windows default
distribution remained `docker-desktop`.

## Environment

- Canonical VM:
  `/Users/gaofeng/Virtual Machines.localized/OPL Windows 11 Clean Chinese.vmwarevm/OPL Windows 11 Clean Chinese.vmx`
- Windows kernel build: `10.0.26200.8875`
- WSL package: `2.7.10.0`
- Fixture: Ubuntu `24.04`, `x86_64`
- Linux kernel: `6.18.33.2-microsoft-standard-WSL2`
- App validation branch base:
  `b8e8e71e23a8e4e5e48452730cb9c1f43b03f5b7`
- App remote `main` observed before closeout:
  `b184198b63d23687fa71e758f4a2f31f314f3c88`
- Shell remote `main` observed before closeout:
  `6fc9caf80a66c6dd8a6a91158ad460f8ca0eb416`
- Framework test input:
  `fe1fafa26f2c59922596718b305761bbc7558c9c`
- Framework remote `main` observed before closeout:
  `ee24c9a42dc08c1ebb3bdf91365056ef713bf1cb`

Remote `main` observations are currentness context, not tested artifact
identity. The run used the exact component identities below.

## Component Identities

| Component | Exact test identity |
| --- | --- |
| AionCore | `0.1.50`; archive SHA256 `381a480b69e307f5f0bfafd4494b45b99341c046b425f0c1daa55a9cea3bf88c`; binary SHA256 `6be976dc5edec98ef83342eb37d4673a02717a5314f2fe72fedd204d9b0f8632` |
| Node bridge | `v24.11.0`; archive size `58899117`; SHA256 `b3c071cdf47aab867c3b2aa287257df12ec5d7c962bf922b32fd33226c4295fd` |
| Direct Codex | `@openai/codex@0.144.6-linux-x64`; archive SHA256 `b6752eb2e8c10e6fcc96ac5c1c8ad8342cdb9a74504fb84686addf081a7d2868`; binary SHA256 `a31ae9450a26216eb1e7c53102fd42123dd675974310b0e2ca3aa4cb622a2c15` |
| Framework | ref `fe1fafa26f2c59922596718b305761bbc7558c9c`; archive SHA256 `dc941070a4173d403f5da056e16d365e2b1afd144ca62d26cc80364c6729ec00`; lock SHA256 `de38ef719945e95fbf0802f741d4c9e73cd93be9285c667fb6b1bba8375016b3`; package/API `0.3.5` / `p19.stage-runtime` |

## Results

| Probe | Result | Bounded readback |
| --- | --- | --- |
| AionCore launch and health | `passed` | Unmodified Linux binary reported its endpoint, `/health` succeeded, PID/starttime/process-group/executable identity was captured, and cleanup reported `no_survivors`. |
| Node bridge | `passed` | Official `v24.11.0` archive matched size and SHA256 on both host and guest; the run-specific AionCore data directory resolved the pre-expanded runtime. |
| AionCore managed ACP bundle | `failed_reproducibly` | Attempts `g0003`, `g0004`, and `g0005` reached `acp.prepare` but did not materialize `@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex`. Failed attempt directories were retained without overwrite. |
| Direct exact Codex App Server | `passed` | `initialize`, `initialized`, and `thread/list` succeeded. Initialize keys were `codexHome,platformFamily,platformOs,userAgent`; thread-list keys were `backwardsCursor,data,nextCursor`; the empty validation home returned zero threads without collecting thread bodies. |
| Framework source CLI | `passed` | Guest `npm ci` succeeded and `node --experimental-strip-types src/entrypoints/cli.ts app state --profile fast --json` returned object keys `app_state,version`. Only type, keys, and payload SHA256 were retained; the complete payload stayed private and was removed. |
| Windows-native executor negative | `passed` | No Windows `aioncore.exe`, `codex.exe`, or `opl.exe` process or command was present. |
| Terminate/restart cleanup | `passed` | Only `wsl --terminate OPL-Validation-g0001` was used. After restart, AionCore and Codex survivor counts were zero; `docker-desktop` remained the default distribution. |

The first direct Codex attempt exposed a fixture protocol mismatch:
`thread/list.sourceKinds` used legacy `app_server` and `sub_agent` values.
Codex `0.144.6` requires `appServer` and `subAgent`. The run preserved that
failed attempt, applied only the two fixture enum corrections, and passed the
next bounded attempt. This was a validation-fixture defect, not a product
implementation change.

## Disposition

V1 remains `partial` because the AionCore-managed ACP bundle cannot be called
viable until the exact Linux Codex platform binary is materialized by that
route. The exact direct Codex App Server and Framework source CLI probes passed,
but they do not substitute for the failed managed ACP path and do not prove V3
Shell route coverage.

The reproducible managed-resource breakpoint is validation evidence only. It is
not an App gap, release blocker, supported-platform claim, or authorization to
modify AionCore, Framework, Shell, contracts, or release workflows. V2-V5
remain unattempted and non-blocking.

## Evidence Boundary

The committed evidence contains component identities, stable status, bounded
top-level keys, and cleanup readback only. Passwords, tokens, full environment
dumps, complete Framework state, thread bodies, prompts, and raw stdout/stderr
are excluded. Raw diagnostics remain guest/staging-only and are not product or
release receipts.

## Cleanup

- Direct AionCore and Codex process groups: `no_survivors`
- After WSL terminate/restart: AionCore survivors `0`, Codex survivors `0`
- Default distribution before and after: `docker-desktop`
- Validation distribution after final readback: `Running`
- No distribution was unregistered and global `wsl --shutdown` was not used.
