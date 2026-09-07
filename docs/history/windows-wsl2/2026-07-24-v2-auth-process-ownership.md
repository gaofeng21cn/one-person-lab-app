# Windows WSL2 Validation Receipt: V2 Authentication and Process Ownership

Validation run ID: `20260724-v2-auth-process-ownership`
State: `partial`
Lane: `validation_only_non_binding`
Date: `2026-07-24`
Archive context: [Early Windows WSL2 experiments](README.md).

## Scope

This run exercised AionCore's authentication-enabled remote mode,
host-to-guest listener visibility, operation ownership, cancellation, and
bounded survivor checks in the disposable `OPL-Validation-g0001` WSL2 fixture.
It did not modify App, Shell, Framework, AionCore, contracts, installer bytes,
release workflows, or the active App gap plan.

The run is partial because the upstream first-credential/bootstrap route was
not completed after its documented boundary response, and renderer/main-process
secret isolation was not attempted.

## Environment and component identity

- Canonical VM: `/Users/gaofeng/Virtual Machines.localized/OPL Windows 11 Clean Chinese.vmwarevm/OPL Windows 11 Clean Chinese.vmx`
- Guest fixture: `OPL-Validation-g0001`, Linux `x86_64`
- Guest transport: VMware NAT; host-to-guest loopback/readiness was exercised
- AionCore executable SHA256: `6be976dc5edec98ef83342eb37d4673a02717a5314f2fe72fedd204d9b0f8632`

No password, token, complete environment dump, or raw log is stored here.

The final AionCore capability evidence was produced by run
`20260725-v2-v3-g0024` with `v2-aioncore-capability-probe.sh` SHA256
`2df144136656d051615e0cff4d47c55b130eea6bb41658ed3241b721c1d06008`.
The sanitized JSON SHA256 is
`8b4b06d208770975c6f96d855900cf924b2958e01a0019b0ac4f545e766f5b28`.

## Authentication and listener readback

| Probe | Result | Bounded readback |
| --- | --- | --- |
| AionCore remote-mode launch | `passed` | Removing `--local` started the unmodified binary in remote mode; startup reported authentication enabled. This does not prove a valid authenticated session. |
| Guest `/health` | `passed` | HTTP `200`. |
| Guest `/api/auth/status` | `passed` | HTTP `200`. |
| Guest unauthenticated `/api/auth/user` | `rejected_as_expected` | HTTP `401`. |
| Windows loopback to guest `/health` | `passed` | HTTP `200` through the tested NAT path. |
| AionCore CLI help | `observed` | Only `--local` was exposed; no independent auth/token flag was available. |
| `/api/webui/reset-password` in remote mode | `blocked_upstream_artifact` | HTTP `403`; no speculative reset or credential workaround was attempted. |
| Wrong session | `rejected_as_expected` | HTTP `401`. |

The `403` is an upstream AionCore bootstrap boundary, not evidence for an
OPL-owned workaround. Mirrored networking was not exercised because changing
it could affect Docker and global WSL state; it remains an
`unattempted_coordination_boundary`.

## Process ownership and cancellation

Fresh process evidence was produced by run `20260725-v2-v3-g0024` with fixture
`v2-process-ownership-probe.sh` SHA256
`1ff96b8ed90f5ceb5fa0dfa600efaba21c8df09cdebc0371b5fb89647992d57c`.
The sanitized JSON SHA256 is
`fc4c3426f5355448c5c10a6eff0cf1eceafc2e7581d11296462fc4eaf3184520`.
The direct-child fixture recorded an atomic operation record containing the
operation token, session/carrier binding, PID, start time, process group,
executable identity, executable SHA256, UID, and GID. The bounded result was:

```json
{
  "identity_match": true,
  "wrong_token_rejected": true,
  "wrong_session_rejected": true,
  "wrong_carrier_rejected": true,
  "wrong_starttime_rejected": true,
  "stale_pid_rejected": true,
  "graceful_term_stopped": true,
  "forced_term_ignored": true,
  "forced_kill_stopped": true,
  "targeted_cancel_left_decoy_alive": true,
  "target_stopped": true,
  "survivor_count": 0
}
```

This supports the direct-child strategy for the tested fixture. It does not
select a production supervisor or establish lifecycle behavior for App exit,
sleep/resume, mirrored networking, or a clean installed product.

## Post-WSL-terminate readback

The bounded restart evidence is recorded separately as run
`20260725-v2-v3-g0023`:

- default distribution before and after: `docker-desktop`;
- state after `wsl --terminate OPL-Validation-g0001`: `Stopped`;
- state after a targeted guest query restarted the fixture: `Running`;
- AionCore processes after restart: `0`;
- Codex processes after restart: `0`;
- native Windows executor processes/commands: `0`;
- cleanup: `no_survivors`.

The restart receipt SHA256 is
`5de65fbbfe23121e70e8880f2bf7c448eb14be19a5d8d006c378ab81d471e943`;
the executed `v2-v3-restart-survivor.ps1` fixture SHA256 is
`57b2c13d8dd4c2a69de323445182793d2b771ff33d15e6b664c61831e48acc3a`.

Only the fixture distribution was terminated. Global `wsl --shutdown` and
Docker prune were not used. The post-restart process readback proves that the
prior App-session candidates did not survive the targeted termination; it is
not a claim that a stopped distribution was queried without restarting it.

## Security and evidence boundary

- Renderer/DevTools/Sentry/feedback-bundle secret isolation: `unattempted`.
- No reusable internal AionCore credential is committed in this receipt.
- Raw stdout/stderr and private guest diagnostics remained outside version
  control and were removed by bounded closeout cleanup after sanitized evidence
  was retained.
- Existing Docker containers, images, Docker data, and `OnePersonLab` data
  were not pruned, unregistered, or rewritten.

## Disposition

V2 is `partial`: authentication-enabled remote-mode listener behavior and the
process ownership/cancellation negatives passed, while upstream credential
bootstrap and renderer secret isolation remain unresolved or unattempted. This
result is validation evidence only. It is not a Windows support claim, release
gate, App development gap, or authorization to modify upstream AionCore.
