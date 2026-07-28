# Delivery Docs

Owner: `one-person-lab-app`
Purpose: `app_delivery_docs_entry`
State: `active_support`
Machine boundary: Human-readable delivery, release, guide-generation, and
evidence-support documentation. Delivery truth stays in produced assets,
updater metadata, release records, evidence manifests, workflows, validators,
release-boundary tests, CI logs, and App contracts.

This directory holds maintainer-facing delivery material. Public user reading
surfaces live under `docs/site/latest/`.

## Entries

| Path | Role |
| --- | --- |
| [`distribution-and-install-ssot.md`](distribution-and-install-ssot.md) | Canonical release/install terminology, current and target carrier matrix, platform defaults, and consistency rules. |
| [`install/README.md`](install/README.md) | User-first Desktop/WebUI/Headless choice, unified installer, platform matrix, verification, update, and rollback source. |
| [`release/README.md`](release/README.md) | App release, updater, Full first-install, Homebrew, and release-owner operator map. |
| [`release/records/`](release/records/) | Release owner receipt records and verdict records. |
| [`release-evidence/screenshots.md`](release-evidence/screenshots.md) | Screenshot and visual tutorial evidence routing. |
| [`validation/windows-wsl2/`](validation/windows-wsl2/) | Sanitized, non-binding receipts and fixtures for the authorized non-blocking Windows/WSL2 technical validation lane. |
| [`install/docker-webui-guide.md`](install/docker-webui-guide.md) | Compatibility entry for the Docker/WebUI guide maintenance source and public bundle. |
| [`user-guides/macos-app-install/README.md`](user-guides/macos-app-install/README.md) | macOS install guide source, generated Markdown/deck source, screenshot provenance, fixtures, and verification records. |
| [`user-guides/docker-webui-install/README.md`](user-guides/docker-webui-install/README.md) | Docker/WebUI install guide source, generated Markdown, and verification records. |
| [`whitepapers/README.md`](whitepapers/README.md) | Whitepaper bundle, visual evidence, and exact-byte publication receipt routing. |

Do not link ordinary users to this directory. Use
`docs/site/latest/macos-app-install/` and `docs/site/latest/docker-webui-install/` for
publishable guide bundles.
