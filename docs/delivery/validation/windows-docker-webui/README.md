# Windows Docker/WebUI Validation Evidence

Owner: `one-person-lab-app`
Purpose: `windows_docker_webui_install_and_update_validation_evidence`
State: `r3_source_fix_pending_successor_public_validation`
Machine boundary: Sanitized receipts and screenshots only. App install and
release contracts, workflow artifacts, GHCR manifests, installer bytes, and
live runtime readback remain authoritative.

This directory records the Windows x64 Docker Desktop validation requested for
the public beginner guide. It does not store passwords, Gateway credentials,
API keys, complete runtime state, or raw logs.

## Receipts

- [`screenshots.manifest.json`](screenshots.manifest.json) binds the four
  sanitized `r1` UI captures to exact bytes and expected visible behavior.
  (Earlier `r1`/`r2`/`r3` dated validation notes belong to Git history.)

## Fixtures

Reusable Windows validation scripts live under
[`../../user-guides/docker-webui-install/fixtures/`](../../user-guides/docker-webui-install/fixtures/).
One-off probes stay outside version control.

When the successor WebUI digest containing the Shell first-login repair is
published, update the receipt and screenshot manifest with exact public digest,
workflow run, Windows update readback, and post-fix authenticated-login UI
evidence. A candidate, source fix, or immutable Bundle alone must not be
converted into a public pass.
