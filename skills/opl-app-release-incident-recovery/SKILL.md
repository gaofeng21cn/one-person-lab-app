---
name: opl-app-release-incident-recovery
description: Use only to recover an already-started or failed One Person Lab App Stable, Standard, or Full release run with an identifiable owner run and job breakpoint. Do not use for release planning, release workflow optimization, versioning, ordinary builds or CI, broad repository audits, or routine development.
---

# OPL App Release Incident Recovery

Keep the release objective moving through the existing App, Shell, Framework,
GitHub Actions, and release-contract authorities. This Skill diagnoses and
resumes that path; it does not create a second release controller or grant
mutation authority.

## Operate The Current Run

1. Reconcile the exact operation and current unique owner run. If one exists,
   do not dispatch or rerun another run.
2. In `one-person-lab-app`, run one read-only snapshot:

   ```bash
   npm run --silent release:incident-status -- --run-id <id>
   ```

   Report the exact job and step, step start, last observable change, completed
   real stages and artifacts, VM markers, and `next_action`. A job named Clean
   VM first launch does not prove a VM exists.
3. For a non-Apple-external step with no status or available-log change for
   five minutes, read only that job or step's necessary log immediately. Do not
   wait for the workflow timeout.
4. On failure, repair the first concrete breakpoint in its real owner. Run only
   the focused check that proves that repair and the aggregate gate required by
   the release contract.
5. If the exact candidate has a Framework-verified `full_built` or later
   checkpoint and its bytes remain valid, consume that checkpoint for
   qualification or publication. Do not rebuild signed and notarized assets by
   default.
6. After a failed operation is repaired, abandon that operation and use exactly
   one fresh contract-authorized operation and dispatch. Never use a partial
   GitHub rerun as a release recovery shortcut.

## VM Truth

Treat `stage=clone_vm`, `stage=start_vm`, `stage=wait_for_ip`, `vm_name`, and
`guest_ip` from runtime logs or artifacts as the minimum evidence for the
corresponding VM state. Before the first marker, state `VM 尚未证实创建`. A
static desktop image, job title, elapsed time, or open application window is
not runtime evidence.

## Terminal Readback

Standard success must continue immediately into the contract-defined Full
path. Completion requires the current Latest/tag, Standard and Full DMGs with
digests, signing and notarization, dedicated non-admin clean-install login, and
Framework-owned OPL Agent projection. Preserve the distinction between build,
checkpoint, publication, installed runtime, and public readback.

## Boundaries

- Use only the user's authorized least-privilege test account through the
  existing transient credential bridge. Never use an admin account, persist
  credentials in GitHub Secrets, or print a password.
- Do not add repository-wide inspection, historical search, formatting,
  repeated passing tests, new evidence schemas, or unrelated hardening to a
  release recovery.
- Stop only for a real permission, credential, runner, or external-service
  blocker, and name the exact owner and release condition.
- Dispatch, publication, notarization, Latest mutation, and installation still
  require the user's current authorization and the repository's existing
  release authority.
