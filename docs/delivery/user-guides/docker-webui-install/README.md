# Docker/WebUI Install Guide Delivery

Owner: `one-person-lab-app`
Purpose: `docker_webui_install_guide_delivery_artifacts`
State: `active`
Machine boundary: Generated artifacts, Quarto manifest, and verification records. Human-readable guide prose is maintained under `docs/guides/docker-webui-install/`.

This directory is not the clean end-user reading surface and is not the prose
editing area. Link users to
[the public guide](https://gaofeng21cn.github.io/one-person-lab-app/latest/docker-webui-install/docker-webui-install.html)
instead.

Canonical source files:

- [`../../../guides/docker-webui-install/guide.qmd`](../../../guides/docker-webui-install/guide.qmd):
  long-form HTML/PDF body source.
- [`../../../guides/docker-webui-install/screenshots.manifest.json`](../../../guides/docker-webui-install/screenshots.manifest.json):
  screenshot provenance, locale, dimensions, expected UI text, and SHA256.
- [`../../../guides/docker-webui-install/screenshots/`](../../../guides/docker-webui-install/screenshots/):
  Chinese WebUI screenshot assets referenced by QMD.

Delivery and generated files:

- [`source/docker-webui-install.guide.json`](source/docker-webui-install.guide.json):
  machine manifest for output paths, install commands, publishing template,
  screenshot manifest reference and artifact verification inputs.
- `generated/docker-webui-install.md`: generated Markdown snapshot, recreated
  by `npm run docs:docker-webui-guide` and ignored by Git.
- `verification/docker-webui-install-verification.json`: generated HTML/PDF
  verification record.
- [`fixtures/`](fixtures/): bounded reusable Windows VM validation helpers.
  Validation receipts and sanitized screenshots live under
  [`../../validation/windows-docker-webui/`](../../validation/windows-docker-webui/).

Generated reading artifacts:

- [Docker/WebUI install HTML guide](../../../site/latest/docker-webui-install/docker-webui-install.html)
- [Docker/WebUI install detailed PDF](../../../site/latest/docker-webui-install/docker-webui-install-detailed-guide.pdf)

Update flow:

1. Edit `docs/guides/docker-webui-install/guide.qmd` for user-facing guide body,
   FAQ, and boundary text.
2. Edit `source/docker-webui-install.guide.json` only when install commands,
   output paths, publishing template or screenshot manifest references change.
3. Replace screenshots under `docs/guides/docker-webui-install/screenshots/`,
   then update `screenshots.manifest.json` with provenance, locale, dimensions,
   expected UI text, and SHA256.
4. Run `npm run docs:docker-webui-guide`.
5. Review `verification/docker-webui-install-verification.json` before
   publishing.

This guide intentionally does not claim Docker/WebUI release readiness. App
release contracts, GHCR publish evidence, shell Dockerfile/web-cli behavior, and
live container smoke remain the machine truth.

Long-form HTML/PDF rendering uses Quarto Book with the shared
[`../../../publishing/templates/opl-guide`](../../../publishing/templates/opl-guide/)
template. Do not hand-maintain generated HTML, generated Markdown, or PDF output
as a second content source.
