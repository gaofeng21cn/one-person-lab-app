# Windows WSL2 Validation Receipt: V3 Independent Route Coverage

Validation run ID: `20260724-v3-independent-route-coverage`
State: `partial`
Lane: `validation_only_non_binding`
Date: `2026-07-24`
Archive context: [Early Windows WSL2 experiments](README.md).

## Scope

This run probed the independent direct Codex App Server and OPL Framework CLI
routes available inside `OPL-Validation-g0001`, and reconciled the AionCore ACP
route against the V1 managed-resource result. No login, update, repair,
installer, release, or product-source mutation was executed.

V3 is `partial`: direct Codex and read-only Framework probes passed, but the
managed AionCore ACP route is blocked by the upstream artifact result and a
single owner binding across all routes was therefore not established.

The direct Codex test identity was `@openai/codex@0.144.6-linux-x64`. The
Framework test input was ref
`fe1fafa26f2c59922596718b305761bbc7558c9c`, package/API
`0.3.5` / `p19.stage-runtime`. These are test identities only, not release
selection or installed-machine truth.

## Route readback

| Route | Result | Bounded readback |
| --- | --- | --- |
| Direct Codex App Server `initialize` | `passed` | The exact Linux binary initialized successfully. |
| Direct Codex App Server `thread/list` | `passed` | The route returned the expected top-level response shape; no thread bodies were collected. |
| Direct Codex executable identity | `observed` | `/opt/opl-validation/codex/vendor/x86_64-unknown-linux-musl/bin/codex`; SHA256 `a31ae9450a26216eb1e7c53102fd42123dd675974310b0e2ca3aa4cb622a2c15`. |
| Direct Codex `CODEX_HOME` | `observed` | `/opt/opl-validation/codex-home`. |
| Framework `app state --profile fast --json` | `passed` | Read-only result returned top-level keys `app_state` and `version`. The complete payload stayed private. |
| Framework `app action execute --help` | `passed` | Exit `0`; help only, no action execution. |
| Framework `connect gateway login --help` | `passed` | Exit `0`; help only, no login mutation. |
| Framework `system update --help` | `passed` | Exit `0`; help only, no update mutation. |
| Framework `system repair --help` | `passed` | Exit `0`; help only, no repair mutation. |
| AionCore managed ACP | `blocked_upstream_artifact` | V1 reproducibly reached `acp.prepare` without materializing the Linux Codex binary. |

Fresh route evidence was produced by run `20260725-v2-v3-g0024` with fixture
`v3-route-probe.sh` SHA256
`cceaae38f61f58c4cae13c785edc1a490f06fbd1108a7e58a2dd5a63b3996ddd`.
The sanitized JSON SHA256 is
`c9d05906b911e3ae0d7bb02d4f0643be98935d716977ad76be0777780b67d442`.
The direct candidate cleanup field is
`direct_candidate_cleanup_not_independently_recorded`; no independent
direct-route cleanup proof was recorded. This is documented as missing evidence
rather than converted into a pass.

## Binding and security boundary

- Single Codex owner binding across ACP, direct App Server, and Framework:
  `blocked`.
- Renderer/DevTools/Sentry secret isolation: `unattempted`.
- Non-root product identity: `unattempted`; probes ran as root in the fixture.
- Mirrored networking: `unattempted_coordination_boundary` because it could
  affect Docker and global WSL state.
- Scheduled/durable Framework ownership: not selected or claimed by this run.

The probes establish transport coverage only. They do not grant App or Shell
Framework lifecycle authority, choose a carrier, or prove Windows support.

## Evidence boundary and disposition

Only route names, stable response keys, executable identity, digest, and
bounded status are retained. Passwords, tokens, full state payloads, thread or
prompt bodies, and raw stdout/stderr are excluded. Existing Docker/WebUI state
and the default `docker-desktop` distribution were left intact.

V3 remains `partial` and `validation_only_non_binding`. It does not enter
`docs/active/app-ideal-state-gap-plan.md`, does not block unrelated
development, and does not constitute a Windows support or release-readiness
claim.
